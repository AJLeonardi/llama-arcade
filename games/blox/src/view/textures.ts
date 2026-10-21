// Every texture is drawn in code on a small canvas. Blocks use world-sized UVs: one texture tile per unit.
import * as THREE from 'three';

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, THREE.Texture>();
const once = (key: string, make: () => THREE.Texture) => {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
};

/** The plain block look: white with a soft darker edge, tinted by the block's colour. */
export const tileTex = () =>
  once('tile', () =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      const grad = g.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.06)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(0,0,0,0.13)';
      g.lineWidth = 4;
      g.strokeRect(2, 2, s - 4, s - 4);
    }),
  );

/** Speed pads: yellow with chevrons pointing along +v. */
export const speedTex = () =>
  once('speed', () =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#ff8a00';
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(s * 0.2, s * 0.35);
      g.lineTo(s * 0.5, s * 0.65);
      g.lineTo(s * 0.8, s * 0.35);
      g.stroke();
    }),
  );

/** Conveyors: dark stripes that scroll along their push direction. */
export const beltTex = () =>
  once('belt', () =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#c8ced6';
      g.beginPath();
      g.moveTo(s * 0.15, s * 0.25);
      g.lineTo(s * 0.5, s * 0.75);
      g.lineTo(s * 0.85, s * 0.25);
      g.lineTo(s * 0.65, s * 0.25);
      g.lineTo(s * 0.5, s * 0.45);
      g.lineTo(s * 0.35, s * 0.25);
      g.fill();
    }),
  );

/** Trampolines: rings. */
export const bounceTex = () =>
  once('bounce', () =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(120,0,60,0.35)';
      g.lineWidth = 5;
      for (const r of [8, 18, 28]) {
        g.beginPath();
        g.arc(s / 2, s / 2, r, 0, Math.PI * 2);
        g.stroke();
      }
    }),
  );

/** Finish pads: black and white checks. */
export const checkerTex = () =>
  once('checker', () =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#222222';
      g.fillRect(0, 0, s / 2, s / 2);
      g.fillRect(s / 2, s / 2, s / 2, s / 2);
    }),
  );

/** Lava: bright blobs (scrolled slowly to look runny). */
export const lavaTex = () =>
  once('lava', () =>
    canvasTexture(128, (g, s) => {
      g.fillStyle = '#ff5a1f';
      g.fillRect(0, 0, s, s);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 26; i++) {
        const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 16;
        g.fillStyle = i % 3 ? '#ffb020' : '#ffe14d';
        for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
          g.beginPath();
          g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }),
  );

/** Vent roofs: a metal grate with holes (drawn with alphaTest, so you can see through). */
export const grateTex = () =>
  once('grate', () =>
    canvasTexture(64, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, 10);
      g.fillRect(0, 0, 10, s);
      g.fillRect(0, s / 2 - 3, s, 6);
      g.fillRect(s / 2 - 3, 0, 6, s);
    }),
  );

/** Locked doors: panels with a big keyhole (tinted by the key's colour). */
export const doorTex = () =>
  once('door', () =>
    canvasTexture(64, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 4;
      g.strokeRect(6, 6, s - 12, s - 12);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.arc(s / 2, s * 0.42, 7, 0, Math.PI * 2);
      g.fill();
      g.fillRect(s / 2 - 4, s * 0.42, 8, 16);
    }),
  );

/** Portals: a swirl. */
export function portalTex() {
  return canvasTexture(
    128,
    (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0.35)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 5;
      for (let a = 0; a < 4; a++) {
        g.beginPath();
        for (let t = 0; t < 1; t += 0.02) {
          const ang = a * (Math.PI / 2) + t * 5;
          const r = t * s * 0.5;
          const x = s / 2 + Math.cos(ang) * r, y = s / 2 + Math.sin(ang) * r;
          if (t === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    },
    false,
  );
}

/** Rainbow stripes, for rainbow fur and capes. */
export const rainbowTex = () =>
  once('rainbow', () => {
    const t = canvasTexture(
      64,
      (g, s) => {
        const cols = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'];
        cols.forEach((c, i) => {
          g.fillStyle = c;
          g.fillRect(0, (i * s) / cols.length, s, s / cols.length + 1);
        });
      },
      false,
    );
    return t;
  });

/** A text label on a rounded card (portal names, shop sign). Returns the texture and its aspect ratio. */
export function labelTex(text: string, bg: string, fg = '#ffffff') {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = 'bold 64px "Avenir Next Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 60;
  c.width = w;
  c.height = 100;
  g.font = font;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, w - 8, 92, 30);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.stroke();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: w / 100 };
}
