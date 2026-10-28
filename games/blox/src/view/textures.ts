// Every texture is drawn in code on a small canvas. Blocks use world-sized UVs: one texture tile per unit.
import type { Surface } from '../sim/types';
import { canvasTexture, once } from '../../../../shared/textures';

export { beltTex, checkerTex, gooTex, labelTex, tileTex } from '../../../../shared/textures';

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

// ---------------------------------------------------------------- surfaces (Block.surface)
// White-ish like the tile, so the block's own colour tints them. One texture repeat per unit.

/** Speckles that wrap round the edges, so the texture tiles without seams. */
function speckle(g: CanvasRenderingContext2D, s: number, n: number, size: [number, number], dark: number, light: number, seed: number) {
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, r = size[0] + rnd() * (size[1] - size[0]);
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${dark * rnd()})` : `rgba(255,255,255,${light * rnd()})`;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) g.fillRect(x + ox, y + oy, r, r);
  }
}

const SURFACES: Record<Surface, (g: CanvasRenderingContext2D, s: number) => void> = {
  // Two planks per unit, with grain and a dark seam between them.
  wood(g, s) {
    g.fillStyle = '#f2ece4';
    g.fillRect(0, 0, s, s);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let p = 0; p < 2; p++) {
      g.fillStyle = `rgba(90,50,10,${0.04 + rnd() * 0.06})`;
      g.fillRect(p * s / 2, 0, s / 2, s);
      for (let i = 0; i < 9; i++) {
        g.strokeStyle = `rgba(90,50,10,${0.06 + rnd() * 0.1})`;
        g.lineWidth = 1 + rnd() * 1.5;
        const x = p * s / 2 + 4 + rnd() * (s / 2 - 8);
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + rnd() * 6 - 3, s / 3, x + rnd() * 6 - 3, (2 * s) / 3, x, s);
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(60,30,0,0.35)';
    g.fillRect(0, 0, 2, s);
    g.fillRect(s / 2 - 1, 0, 2, s);
    g.fillRect(s / 2, s * 0.62, s / 2, 2);
  },
  carpet(g, s) {
    g.fillStyle = '#f4f4f4';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 2600, [1, 2], 0.22, 0.4, 5);
  },
  // Four rows of bricks per unit.
  brick(g, s) {
    g.fillStyle = '#c9c9c9';
    g.fillRect(0, 0, s, s);
    let seed = 9;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rh = s / 4;
    for (let r = 0; r < 4; r++) {
      const off = r % 2 ? s / 4 : 0;
      for (let c = -1; c < 2; c++) {
        const x = c * (s / 2) + off;
        const v = 225 + Math.floor(rnd() * 30);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x + 2, r * rh + 2, s / 2 - 4, rh - 4);
      }
    }
    speckle(g, s, 500, [1, 2], 0.15, 0.2, 13);
  },
  // Big concrete slabs: soft mottling and a seam.
  stone(g, s) {
    g.fillStyle = '#ececec';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 60, [8, 22], 0.04, 0.08, 17);
    speckle(g, s, 900, [1, 2], 0.14, 0.2, 19);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(0, 0, s, 2);
    g.fillRect(0, 0, 2, s);
  },
  road(g, s) {
    g.fillStyle = '#e6e6e6';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 3000, [1, 2.5], 0.3, 0.35, 23);
  },
  // Brushed steel with rivets.
  metal(g, s) {
    g.fillStyle = '#eef0f2';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) {
      g.fillStyle = `rgba(0,0,0,${(Math.sin(y * 1.7) * 0.5 + 0.5) * 0.05})`;
      g.fillRect(0, y, s, 1);
    }
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(0, 0, s, 2);
    g.fillRect(0, 0, 2, s);
    for (const [x, y] of [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]]) {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(x + 1, y + 1, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  },
  // Copper pipe: smooth, with fine brushed lines along it (the shine comes from the material).
  pipe(g, s) {
    g.fillStyle = '#f4f4f4';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 3) {
      g.fillStyle = `rgba(0,0,0,${(Math.sin(y * 0.9) * 0.5 + 0.5) * 0.05})`;
      g.fillRect(0, y, s, 1.5);
    }
    speckle(g, s, 120, [1, 3], 0.08, 0.2, 29);
  },
  grass(g, s) {
    g.fillStyle = '#e8f0e0';
    g.fillRect(0, 0, s, s);
    let seed = 31;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) {
      const x = rnd() * s, y = rnd() * s;
      g.strokeStyle = rnd() < 0.5 ? `rgba(0,60,0,${0.1 + rnd() * 0.15})` : `rgba(255,255,255,${0.2 + rnd() * 0.3})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rnd() * 3 - 1.5, y - 3 - rnd() * 4);
      g.stroke();
    }
  },
  sand(g, s) {
    g.fillStyle = '#fffaf0';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 2200, [1, 1.6], 0.2, 0.5, 37);
  },
  // Painted: almost flat, just a soft shade so big faces aren't dead flat.
  smooth(g, s) {
    const grad = g.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f3f3f3');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  },
  // Aquarium water: wobbly caustic light lines and a few bubbles.
  tank(g, s) {
    g.fillStyle = '#dfe8ee';
    g.fillRect(0, 0, s, s);
    let seed = 41;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const y = rnd() * s;
      g.beginPath();
      for (let x = 0; x <= s; x += 4) g.lineTo(x, y + Math.sin((x / s) * Math.PI * 2 * 2 + i) * 6);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(rnd() * s, rnd() * s, 2 + rnd() * 4, 0, Math.PI * 2);
      g.stroke();
    }
  },
  // Rows of shingles.
  roof(g, s) {
    g.fillStyle = '#d6d6d6';
    g.fillRect(0, 0, s, s);
    const rh = s / 4;
    for (let r = 0; r < 4; r++) {
      for (let c = -1; c < 5; c++) {
        const x = c * (s / 4) + (r % 2 ? s / 8 : 0);
        g.fillStyle = `rgba(255,255,255,${0.75 + ((c * 7 + r * 3) % 5) * 0.05})`;
        g.beginPath();
        g.roundRect(x + 1, r * rh + 1, s / 4 - 2, rh - 1, [0, 0, 6, 6]);
        g.fill();
      }
    }
  },
};

export const surfaceTex = (surface: Surface) => once(`surface-${surface}`, () => canvasTexture(128, SURFACES[surface]));

/** Sea water: light ripples (scrolled). */
export const waveTex = () =>
  once('wave', () =>
    canvasTexture(256, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      let seed = 61;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      g.lineWidth = 2;
      for (let i = 0; i < 160; i++) {
        const x = rnd() * s, y = rnd() * s, w = 6 + rnd() * 22;
        g.strokeStyle = i % 4 ? 'rgba(0,30,80,0.16)' : 'rgba(255,255,255,1)';
        for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
          g.beginPath();
          g.moveTo(x + ox - w / 2, y + oy);
          g.quadraticCurveTo(x + ox, y + oy - 3, x + ox + w / 2, y + oy);
          g.stroke();
        }
      }
    }),
  );

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
