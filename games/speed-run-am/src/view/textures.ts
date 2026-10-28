// This game's own textures (the plain ones come from shared/textures.ts).
import * as THREE from 'three';
import { canvasTexture, once } from '../../../../shared/textures';

const FONT = '"Avenir Next Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';

/** The top of a keyboard key: a letter on a white key (turned round, so it reads right when you look north). */
export const keyTex = (letter: string) =>
  once(`key-${letter}`, () => {
    const t = canvasTexture(
      128,
      (g, s) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, s, s);
        g.strokeStyle = '#ced4da';
        g.lineWidth = 8;
        g.strokeRect(4, 4, s - 8, s - 8);
        g.fillStyle = '#343a40';
        g.font = `900 84px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(letter, s / 2, s / 2 + 6);
      },
      false,
    );
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI;
    return t;
  });

/**
 * A giant-keyboard floor: 4×4 keys per texture, letters taking turns in `colors`. `keySize` is one key in world
 * units (blocks have one texture unit per world unit). Turned round so the letters read right looking north.
 */
export const keyboardTex = (colors: string[], keySize: number) =>
  once(`keyboard-${colors.join()}-${keySize}`, () => {
    const t = canvasTexture(512, (g, s) => {
      const k = s / 4;
      g.fillStyle = '#9aa0aa';
      g.fillRect(0, 0, s, s);
      g.font = `900 ${k * 0.6}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const letters = 'QWERTYUIOPASDFGHJKLZXCVBNM';
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const i = r * 4 + c;
          g.fillStyle = '#e9ecef';
          g.beginPath();
          g.roundRect(c * k + 5, r * k + 5, k - 10, k - 10, 14);
          g.fill();
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.roundRect(c * k + 12, r * k + 10, k - 24, k - 26, 10);
          g.fill();
          g.fillStyle = colors[i % colors.length];
          g.fillText(letters[(i * 5) % 26], c * k + k / 2, r * k + k / 2 - 2);
        }
      }
    });
    t.repeat.set(1 / (4 * keySize), 1 / (4 * keySize));
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI;
    return t;
  });

/** Big letters for signs, each letter taking its turn in `colors` (pink, brown, pink, brown...). */
export function lettersTex(text: string, colors: string[]) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `900 120px ${FONT}`;
  g.font = font;
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width + 6);
  const w = Math.ceil(widths.reduce((a, b) => a + b, 0)) + 30;
  c.width = w;
  c.height = 150;
  g.font = font;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  let x = 15, k = 0;
  chars.forEach((ch, i) => {
    g.lineWidth = 14;
    g.strokeStyle = '#ffffff';
    g.strokeText(ch, x, 80);
    g.fillStyle = ch === ' ' ? 'transparent' : colors[k % colors.length];
    g.fillText(ch, x, 80);
    if (ch !== ' ') k++;
    x += widths[i];
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: w / 150 };
}

/** The boulder: grey stone with darker spots and a stripe, so you can see it roll. */
export const boulderTex = () =>
  once('boulder', () =>
    canvasTexture(128, (g, s) => {
      g.fillStyle = '#8d8478';
      g.fillRect(0, 0, s, s);
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = i % 2 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.arc(rnd() * s, rnd() * s, 3 + rnd() * 10, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, s * 0.45, s, s * 0.1);
    }),
  );

/** The top of the poop: brown swirls and bubbles (scrolled slowly). */
export const poopTex = () =>
  once('poop', () =>
    canvasTexture(128, (g, s) => {
      g.fillStyle = '#7a4a24';
      g.fillRect(0, 0, s, s);
      let seed = 29;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 24; i++) {
        const x = rnd() * s, y = rnd() * s, r = 4 + rnd() * 14;
        for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
          g.strokeStyle = i % 2 ? '#5c3517' : '#9a6334';
          g.lineWidth = 4;
          g.beginPath();
          g.arc(x + ox, y + oy, r, 0, Math.PI * 1.5);
          g.stroke();
        }
      }
    }),
  );

/** Magic logs: bark lines with sparkles. */
export const logTex = () =>
  once('log', () =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(60,30,10,0.35)';
      g.lineWidth = 3;
      for (let y = 6; y < s; y += 12) {
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + 4, s * 0.6, y - 4, s, y);
        g.stroke();
      }
      g.fillStyle = '#fff3a8';
      for (const [x, y] of [[12, 20], [44, 8], [30, 46], [54, 52]]) {
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
