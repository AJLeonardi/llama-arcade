// Textures drawn in code on small canvases, for the 3D games (Llama-blox, Speed Run AM). Blocks use world-sized
// UVs: one texture tile per unit. Each texture is made once and shared.
import * as THREE from 'three';

export function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = true) {
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
export const once = (key: string, make: () => THREE.Texture) => {
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

/** Sewer goo: bubbly green blobs (scrolled slowly). Also used for hot pipes, tinted. */
export const gooTex = () =>
  once('goo', () =>
    canvasTexture(128, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      let seed = 53;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 30; i++) {
        const x = rnd() * s, y = rnd() * s, r = 3 + rnd() * 12;
        for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
          g.fillStyle = i % 3 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.9)';
          g.beginPath();
          g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
          g.fill();
          if (i % 3 === 0) {
            g.fillStyle = 'rgba(255,255,255,1)';
            g.beginPath();
            g.arc(x + ox - r * 0.3, y + oy - r * 0.3, r * 0.25, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }),
  );

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
