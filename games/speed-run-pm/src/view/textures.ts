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
 * The tops of raised keyboard keys: one letter per `keySize` square, 4×4 per texture, on white. Turned round
 * about (0, 0), not the middle, so the squares line up with the key grid (world multiples of `keySize`).
 */
export const keyTopsTex = (colors: string[], keySize: number) =>
  once(`keytops-${colors.join()}-${keySize}`, () => {
    const t = canvasTexture(512, (g, s) => {
      const k = s / 4;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      g.font = `900 ${k * 0.62}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const letters = 'QWERTYUIOPASDFGHJKLZXCVBNM';
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const i = r * 4 + c;
          // A soft shine at the top-left and shade at the bottom-right of each key.
          const grad = g.createLinearGradient(c * k, r * k, c * k + k, r * k + k);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(1, '#ece8fb');
          g.fillStyle = grad;
          g.fillRect(c * k, r * k, k, k);
          g.fillStyle = colors[i % colors.length];
          g.fillText(letters[(i * 5) % 26], c * k + k / 2, r * k + k / 2 + 4);
        }
      }
    });
    t.repeat.set(1 / (4 * keySize), 1 / (4 * keySize));
    t.center.set(0, 0);
    t.rotation = Math.PI;
    return t;
  });

/** A rolling boulder: grey stone with darker and lighter spots and a stripe, so you can see it roll. */
export const boulderTex = () =>
  once('boulder', () =>
    canvasTexture(128, (g, s) => {
      g.fillStyle = '#8d8478';
      g.fillRect(0, 0, s, s);
      let seed = 11;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
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

/** Crate wood: planks with dark gaps (blocks have one texture tile per world unit). */
export const crateTex = () =>
  once('crate', () =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      g.fillStyle = 'rgba(80,40,10,0.45)';
      g.fillRect(0, 0, s, 4);
      g.fillRect(0, s / 2 - 2, s, 4);
      g.fillStyle = 'rgba(80,40,10,0.15)';
      for (let i = 0; i < 6; i++) g.fillRect(0, 8 + i * 9, s, 1);
    }),
  );

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
