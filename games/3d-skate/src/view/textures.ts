// Surfaces for a real-looking city, drawn in code (plus the asphalt photo in public/games/3d-skate/textures/).
// Most come with a normal map made from the same noise, and the building glass has a roughness/metalness map
// so the windows reflect the sky.
import * as THREE from 'three';
import { rng } from '../sim/world';

const made = new Map<string, unknown>();
/** Makes something once and shares it. */
function keep<T>(key: string, make: () => T): T {
  if (!made.has(key)) made.set(key, make());
  return made.get(key) as T;
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, color: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Tileable value noise, a few octaves, values 0..1. */
function fbm(size: number, seed: number, octaves = 5, base = 4) {
  const r = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = base << o;
    const grid = new Float32Array(n * n).map(() => r());
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * n, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * n, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const a = grid[(y0 % n) * n + (x0 % n)], b = grid[(y0 % n) * n + ((x0 + 1) % n)];
        const c = grid[((y0 + 1) % n) * n + (x0 % n)], d = grid[((y0 + 1) % n) * n + ((x0 + 1) % n)];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** A normal map from a height field (tileable). */
function normalMap(h: Float32Array, size: number, strength: number) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (xx: number, yy: number) => h[((yy + size) % size) * size + ((xx + size) % size)];
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / l) * 127 + 128;
      img.data[i + 1] = (dy / l) * 127 + 128;
      img.data[i + 2] = (1 / l) * 127 + 128;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

export interface Surface {
  map: THREE.Texture;
  normal: THREE.Texture;
}

/** Poured concrete with slab joints: one tile is 4 m. `joints` = joint lines per tile. */
export const concrete = (joints = 2) =>
  keep(`concrete${joints}`, () => {
    const S = 512;
    const n = fbm(S, 11, 6, 4), fine = fbm(S, 12, 3, 64);
    const h = new Float32Array(S * S);
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const r = rng(5);
    for (let i = 0; i < S * S; i++) {
      const x = i % S, y = (i / S) | 0;
      const step = S / joints;
      const jd = Math.min(x % step, step - (x % step), y % step, step - (y % step));
      const joint = jd < 1.5 ? 1 : 0;
      const v = 0.55 + (n[i] - 0.5) * 0.35 + (fine[i] - 0.5) * 0.18 + (r() - 0.5) * 0.06 - joint * 0.22;
      h[i] = fine[i] * 0.6 + r() * 0.15 - joint * 1.2;
      const k = Math.max(0, Math.min(1, v)) * 255;
      img.data[i * 4] = k * 0.98;
      img.data[i * 4 + 1] = k * 0.97;
      img.data[i * 4 + 2] = k * 0.93;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, true), normal: normalMap(h, S, 2.5) };
  });

/** Smooth painted ramp surface (skatelite): faint streaks, white = tinted by the material colour. */
export const rampSurface = () =>
  keep('ramp', () => {
    const S = 256;
    const n = fbm(S, 21, 5, 8);
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const y = (i / S) | 0;
      const seam = y % 128 < 2 ? 0.8 : 1; // panel seams every 2 m
      const k = (0.85 + (n[i] - 0.5) * 0.25) * seam * 255;
      h[i] = n[i] * 0.3 + (seam < 1 ? -0.8 : 0);
      img.data.set([k, k, k, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, true), normal: normalMap(h, S, 1.5) };
  });

/** Wood planks for the street ramps (vertical grain, one tile = 2 m). */
export const plywood = () =>
  keep('wood', () => {
    const S = 256;
    const n = fbm(S, 31, 4, 4);
    const r = rng(9);
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const h = new Float32Array(S * S);
    const tint = Array.from({ length: 8 }, () => 0.85 + r() * 0.25);
    for (let i = 0; i < S * S; i++) {
      const x = i % S, y = (i / S) | 0;
      const plank = Math.floor(x / 32);
      const grain = Math.sin((y / S) * 40 + n[i] * 18 + plank * 3) * 0.5 + 0.5;
      const edge = x % 32 < 1 ? 0.55 : 1;
      const k = (0.62 + grain * 0.12 + (n[i] - 0.5) * 0.2) * tint[plank] * edge;
      img.data.set([k * 205, k * 160, k * 110, 255], i * 4);
      h[i] = grain * 0.2 + (edge < 1 ? -1 : 0);
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, true), normal: normalMap(h, S, 2) };
  });

/** Gravel roofs. */
export const roofTex = () =>
  keep('roof', () => {
    const S = 256;
    const n = fbm(S, 41, 6, 8);
    const r = rng(4);
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const k = (0.5 + (n[i] - 0.5) * 0.3 + (r() - 0.5) * 0.08) * 255;
      img.data.set([k, k * 0.98, k * 0.95, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    return tex(c, true);
  });

// ---------------------------------------------------------------- building fronts

export const FACADE_W = 12; // one texture tile is 4 bays…
export const FACADE_H = 14; // …by 4 floors

interface FacadeStyle {
  wall: string;
  glass: [number, number, number]; // base colour of a pane
  /** Window rectangle within a 128 px cell: x, y, w, h. */
  win: [number, number, number, number];
  glassRough: number;
  wallRough: number;
  wallMetal: number;
  grain: number; // how much noise in the wall
  brick?: boolean;
}

export const FACADES: FacadeStyle[] = [
  // Blue glass tower.
  { wall: '#3d4650', glass: [70, 110, 150], win: [4, 4, 120, 116], glassRough: 0.06, wallRough: 0.4, wallMetal: 0.8, grain: 0.05 },
  // Dark glass with thin mullions.
  { wall: '#22262b', glass: [40, 48, 58], win: [3, 10, 122, 108], glassRough: 0.05, wallRough: 0.35, wallMetal: 0.7, grain: 0.04 },
  // Pale concrete office.
  { wall: '#b9b4aa', glass: [55, 70, 85], win: [22, 30, 84, 66], glassRough: 0.1, wallRough: 0.9, wallMetal: 0, grain: 0.25 },
  // Red brick.
  { wall: '#8a4433', glass: [45, 55, 65], win: [32, 26, 64, 76], glassRough: 0.12, wallRough: 0.95, wallMetal: 0, grain: 0.3, brick: true },
  // Sandstone.
  { wall: '#c7ad86', glass: [50, 62, 72], win: [30, 18, 68, 92], glassRough: 0.1, wallRough: 0.9, wallMetal: 0, grain: 0.25 },
];

/** Colour + roughness(G)/metalness(B) maps for one facade style. */
export const facade = (style: number) =>
  keep(`facade${style}`, () => {
    const st = FACADES[style];
    const S = 512, cell = 128;
    const [c, g] = canvas(S);
    const [m, gm] = canvas(S);
    const n = fbm(S, 50 + style, 5, 8);
    const r = rng(60 + style);
    // Wall.
    g.fillStyle = st.wall;
    g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) {
      const x = i % S, y = (i / S) | 0;
      let k = 1 + (n[i] - 0.5) * st.grain * 2 + (r() - 0.5) * st.grain * 0.4;
      if (st.brick) {
        const row = Math.floor(y / 6), off = row % 2 ? 7 : 0;
        if (y % 6 === 0 || (x + off) % 14 === 0) k *= 0.72;
        else k *= 0.9 + ((Math.sin(row * 12.9 + Math.floor((x + off) / 14) * 78.2) * 43758) % 1) * 0.15;
      }
      img.data[i * 4] *= k;
      img.data[i * 4 + 1] *= k;
      img.data[i * 4 + 2] *= k;
    }
    g.putImageData(img, 0, 0);
    gm.fillStyle = `rgb(0, ${st.wallRough * 255}, ${st.wallMetal * 255})`;
    gm.fillRect(0, 0, S, S);
    const [wx, wy, ww, wh] = st.win;
    for (let cy = 0; cy < S / cell; cy++) {
      for (let cx = 0; cx < S / cell; cx++) {
        const x = cx * cell + wx, y = cy * cell + wy;
        const [gr, gg, gb] = st.glass;
        const v = 0.75 + r() * 0.5;
        const lit = r() < 0.12;
        const grad = g.createLinearGradient(x, y, x + ww * 0.4, y + wh);
        grad.addColorStop(0, `rgb(${gr * v * 1.3}, ${gg * v * 1.3}, ${gb * v * 1.3})`);
        grad.addColorStop(1, `rgb(${gr * v * 0.7}, ${gg * v * 0.7}, ${gb * v * 0.7})`);
        g.fillStyle = grad;
        g.fillRect(x, y, ww, wh);
        if (lit) {
          g.fillStyle = 'rgba(255, 236, 200, 0.35)';
          g.fillRect(x + 4, y + 4, ww - 8, wh - 8);
        }
        // Frames and a mullion.
        g.strokeStyle = 'rgba(20, 22, 25, 0.8)';
        g.lineWidth = 3;
        g.strokeRect(x + 1.5, y + 1.5, ww - 3, wh - 3);
        g.beginPath();
        g.moveTo(x + ww / 2, y);
        g.lineTo(x + ww / 2, y + wh);
        g.stroke();
        gm.fillStyle = `rgb(0, ${(st.glassRough + r() * 0.05) * 255}, ${lit ? 40 : 230})`;
        gm.fillRect(x + 3, y + 3, ww - 6, wh - 6);
      }
    }
    // A little grime running down under the windows.
    g.globalAlpha = 0.08;
    g.fillStyle = '#000';
    for (let cx = 0; cx < S / cell; cx++) for (let cy = 0; cy < S / cell; cy++) g.fillRect(cx * cell + wx + 4, cy * cell + wy + wh, ww - 8, 24);
    g.globalAlpha = 1;
    return { map: tex(c, true), rm: tex(m, false) };
  });

// ---------------------------------------------------------------- skateboards

/** Grip tape: black sandpaper. */
export const gripTape = () =>
  keep('grip', () => {
    const S = 256;
    const r = rng(77);
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const k = 18 + r() * 26;
      img.data.set([k, k, k, 255], i * 4);
      h[i] = r();
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, true), normal: normalMap(h, S, 1.2) };
  });

export interface BoardDesign {
  name: string;
  /** What the stats mean to a kid. */
  blurb: string;
  push: number;
  pop: number;
  wheels: string;
  trucks: string;
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void;
}

const stripes = (cols: string[]) => (g: CanvasRenderingContext2D, w: number, h: number) => {
  cols.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, (i * h) / cols.length, w, h / cols.length + 1);
  });
};

/** The deck graphics are drawn long-ways: x across the board, y from tail (0) to nose (h). */
export const BOARDS: BoardDesign[] = [
  {
    name: 'Street',
    blurb: 'All-round board',
    push: 11,
    pop: 5.2,
    wheels: '#f2efe6',
    trucks: '#c9ccd1',
    draw: (g, w, h) => {
      g.fillStyle = '#e8e2d4';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d6332f';
      g.fillRect(0, h * 0.42, w, h * 0.16);
      g.fillStyle = '#111';
      g.font = `900 ${w * 0.55}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(-Math.PI / 2);
      g.fillText('SKATE', 0, w * 0.2);
      g.restore();
    },
  },
  {
    name: 'Flame',
    blurb: 'Fastest pushing',
    push: 13,
    pop: 4.8,
    wheels: '#ffb21a',
    trucks: '#2b2b2e',
    draw: (g, w, h) => {
      g.fillStyle = '#121212';
      g.fillRect(0, 0, w, h);
      const r = rng(3);
      for (let i = 0; i < 14; i++) {
        const x = r() * w, len = h * (0.25 + r() * 0.35);
        const grad = g.createLinearGradient(0, h, 0, h - len);
        grad.addColorStop(0, '#ffe14d');
        grad.addColorStop(0.5, '#ff6a00');
        grad.addColorStop(1, 'rgba(200,0,0,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x - w * 0.2, h);
        g.quadraticCurveTo(x + w * 0.25, h - len * 0.5, x, h - len);
        g.quadraticCurveTo(x - w * 0.1, h - len * 0.4, x + w * 0.2, h);
        g.fill();
      }
    },
  },
  {
    name: 'Galaxy',
    blurb: 'Highest jumps',
    push: 10.5,
    pop: 6,
    wheels: '#9b7bff',
    trucks: '#c9ccd1',
    draw: (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#1b0b3a');
      grad.addColorStop(0.5, '#3a1e7a');
      grad.addColorStop(1, '#0b1d4a');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      const r = rng(8);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
      g.fillStyle = '#f5c542';
      g.beginPath();
      g.arc(w * 0.5, h * 0.6, w * 0.22, 0, Math.PI * 2);
      g.fill();
    },
  },
  {
    name: 'Ocean',
    blurb: 'Smooth and steady',
    push: 11.5,
    pop: 5.4,
    wheels: '#58d0ff',
    trucks: '#c9ccd1',
    draw: stripes(['#0b3d91', '#1565c0', '#1e88e5', '#42a5f5', '#90caf9', '#e3f2fd', '#90caf9', '#42a5f5']),
  },
  {
    name: 'Llama',
    blurb: 'Llama power!',
    push: 12,
    pop: 5.6,
    wheels: '#ff7ab6',
    trucks: '#f5d142',
    draw: (g, w, h) => {
      g.fillStyle = '#ffd6e8';
      g.fillRect(0, 0, w, h);
      g.font = `${w * 0.7}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = 0; i < 4; i++) g.fillText('🦙', w / 2, h * (0.15 + i * 0.23));
    },
  },
  {
    name: 'Natural',
    blurb: 'Plain wood, pro style',
    push: 12,
    pop: 5.4,
    wheels: '#ffffff',
    trucks: '#9aa0a8',
    draw: (g, w, h) => {
      g.fillStyle = '#d9b98a';
      g.fillRect(0, 0, w, h);
      const r = rng(2);
      g.strokeStyle = 'rgba(120, 80, 40, 0.25)';
      for (let i = 0; i < 40; i++) {
        g.beginPath();
        const x = r() * w;
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.6, x + 3, h);
        g.stroke();
      }
    },
  },
];

/** The deck's bottom graphic. */
export const deckGraphic = (i: number) =>
  keep(`deck${i}`, () => {
    const c = deckCanvas(i);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });

export function deckCanvas(i: number) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  BOARDS[i].draw(c.getContext('2d')!, c.width, c.height);
  return c;
}

/** Big painted text (signs, banners). */
export function textTexture(text: string, bg: string, fg: string, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `900 ${h * 0.62}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + h * 0.04, w * 0.92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The asphalt photo and its normal map. */
export const asphalt = () =>
  keep('asphalt', () => {
    const load = (file: string, color: boolean) => {
      const t = new THREE.TextureLoader().load(`./textures/${file}`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    return { map: load('asphalt_color.webp', true), normal: load('asphalt_normal.webp', false) };
  });

/** Tree bark: dark vertical ridges (u round the trunk, v up it; one tile = 1.5 m). */
export const bark = () =>
  keep('bark', () => {
    const S = 256;
    const n = fbm(S, 81, 5, 4);
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const x = i % S, y = (i / S) | 0;
      // Ridges: noise stretched up the trunk.
      const ridge = Math.abs(Math.sin((x / S) * Math.PI * 14 + n[((y >> 3) * S + x) % (S * S)] * 9));
      const k = 0.35 + ridge * 0.3 + (n[i] - 0.5) * 0.25;
      h[i] = ridge;
      img.data.set([k * 120, k * 100, k * 82, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, true), normal: normalMap(h, S, 3) };
  });

/** Cloth normal maps for the skater: denim twill (diagonal) or cotton knit (fine grid). White colour maps. */
export const fabric = (kind: 'denim' | 'cotton') =>
  keep(`fabric-${kind}`, () => {
    const S = 128;
    const r = rng(kind === 'denim' ? 91 : 92);
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const x = i % S, y = (i / S) | 0;
      const weave = kind === 'denim' ? Math.sin(((x + y) / S) * Math.PI * 64) : Math.sin((x / S) * Math.PI * 48) * Math.sin((y / S) * Math.PI * 48);
      h[i] = weave * 0.5 + r() * 0.3;
      const k = (kind === 'denim' ? 0.82 + weave * 0.08 + (r() - 0.5) * 0.12 : 0.94 + (r() - 0.5) * 0.06) * 255;
      img.data.set([k, k, k, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, true), normal: normalMap(h, S, 1.4) };
  });
