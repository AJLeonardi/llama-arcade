// Surfaces for a real-looking town, drawn in code (plus the asphalt photo in public/games/llama-life/textures/).
// Copied from 3D Skate and added to: grass, house walls, shingles, floors, water.
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
    const [e, ge] = canvas(S);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, S, S);
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
        // At night some offices still have the lights on.
        if (r() < 0.45) {
          ge.fillStyle = r() < 0.7 ? '#ffd9a0' : '#cfe4ff';
          ge.fillRect(x + 4, y + 4, ww - 8, wh - 8);
        }
      }
    }
    // A little grime running down under the windows.
    g.globalAlpha = 0.08;
    g.fillStyle = '#000';
    for (let cx = 0; cx < S / cell; cx++) for (let cy = 0; cy < S / cell; cy++) g.fillRect(cx * cell + wx + 4, cy * cell + wy + wh, ww - 8, 24);
    g.globalAlpha = 1;
    return { map: tex(c, true), rm: tex(m, false), lit: tex(e, true) };
  });

// ---------------------------------------------------------------- signs, roads, trees, cloth

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

// ---------------------------------------------------------------- Llama Life's own

/** Lawn grass: blades of green noise. One tile = 4 m. */
export const grass = () =>
  keep('grass', () => {
    const S = 512;
    const n = fbm(S, 101, 6, 4), fine = fbm(S, 102, 2, 128);
    const r = rng(103);
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const v = 0.75 + (n[i] - 0.5) * 0.5 + (fine[i] - 0.5) * 0.35 + (r() - 0.5) * 0.25;
      h[i] = fine[i] + r() * 0.5;
      const dry = Math.max(0, n[i] - 0.62) * 2;
      img.data.set([(70 + dry * 80) * v, (118 + dry * 30) * v, (48 + dry * 10) * v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, true), normal: normalMap(h, S, 2) };
  });

/** A painted field (the school's): grass with mown stripes. */
export const field = () =>
  keep('field', () => {
    const base = grass();
    const S = 512;
    const [c, g] = canvas(S);
    g.drawImage(base.map.image as HTMLCanvasElement, 0, 0);
    g.fillStyle = 'rgba(255, 255, 210, 0.07)';
    g.fillRect(0, 0, S / 2, S);
    return { map: tex(c, true), normal: base.normal };
  });

/**
 * House walls: white lap siding (tinted by the vertex colour) with windows. One tile is 4 m wide by
 * 3 m tall (one floor, one window in the middle). `lit` has the windows glowing for the night.
 */
export const houseWall = () =>
  keep('houseWall', () => {
    const W = 256, H = 192;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    const e = document.createElement('canvas');
    e.width = W;
    e.height = H;
    const ge = e.getContext('2d')!;
    // Siding boards, a shadow line under each.
    g.fillStyle = '#f2f2f0';
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 12) {
      g.fillStyle = 'rgba(0, 0, 0, 0.13)';
      g.fillRect(0, y + 10, W, 2);
      g.fillStyle = 'rgba(255, 255, 255, 0.5)';
      g.fillRect(0, y, W, 1);
    }
    // Window: white trim, dark glass with a sky reflection, a cross bar, shutters.
    const wx = 88, wy = 50, ww = 80, wh = 86;
    g.fillStyle = '#5b6470';
    g.fillRect(wx - 26, wy - 2, 18, wh + 4);
    g.fillRect(wx + ww + 8, wy - 2, 18, wh + 4);
    g.fillStyle = '#ffffff';
    g.fillRect(wx - 6, wy - 6, ww + 12, wh + 14);
    const grad = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
    grad.addColorStop(0, '#9fb7cc');
    grad.addColorStop(0.5, '#3d4d5e');
    grad.addColorStop(1, '#27313c');
    g.fillStyle = grad;
    g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#ffffff';
    g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    g.fillRect(wx, wy + wh / 2 - 2, ww, 4);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, W, H);
    ge.fillStyle = '#ffcf8a';
    ge.fillRect(wx, wy, ww, wh);
    ge.fillStyle = '#000';
    ge.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    ge.fillRect(wx, wy + wh / 2 - 2, ww, 4);
    return { map: tex(c, true), lit: tex(e, true) };
  });

/** Roof shingles (tinted by the vertex colour). One tile = 2 m. */
export const shingles = () =>
  keep('shingles', () => {
    const S = 256;
    const r = rng(111);
    const [c, g] = canvas(S);
    const h = new Float32Array(S * S);
    g.fillStyle = '#d0d0d0';
    g.fillRect(0, 0, S, S);
    const rowH = 16, tabW = 32;
    for (let row = 0; row < S / rowH; row++) {
      const off = row % 2 ? tabW / 2 : 0;
      for (let x = -tabW; x < S + tabW; x += tabW) {
        const k = 0.75 + r() * 0.35;
        g.fillStyle = `rgb(${210 * k}, ${210 * k}, ${210 * k})`;
        g.fillRect(x + off + 1, row * rowH, tabW - 2, rowH - 2);
      }
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      g.fillRect(0, row * rowH + rowH - 2, S, 2);
    }
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) h[i] = img.data[i * 4] / 255;
    return { map: tex(c, true), normal: normalMap(h, S, 3) };
  });

/** Shop and school floors: big tiles with grout. One tile = 2 m (4 tiles). */
export const tileFloor = () =>
  keep('tile', () => {
    const S = 256;
    const n = fbm(S, 121, 4, 8);
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const x = i % S, y = (i / S) | 0;
      const grout = x % 128 < 2 || y % 128 < 2;
      const k = grout ? 0.7 : 0.93 + (n[i] - 0.5) * 0.08;
      h[i] = grout ? 0 : 1;
      img.data.set([k * 245, k * 243, k * 238, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, true), normal: normalMap(h, S, 1) };
  });

/** Pool water: a ripply normal map (scrolled over time). */
export const water = () =>
  keep('water', () => {
    const S = 256;
    const n = fbm(S, 131, 4, 4);
    return normalMap(n, S, 6);
  });
