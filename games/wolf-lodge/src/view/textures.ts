// Surfaces drawn in code: logs, river stone, plank floors, carpet, pool tile, deck tile, fabric, water.
// Most come with a normal map from the same height field, so the light picks out the grain and the grout.
// UVs are in metres (see build.ts), so `size` below is how many metres one copy of the texture covers.
import * as THREE from 'three';

const made = new Map<string, unknown>();
function keep<T>(key: string, make: () => T): T {
  if (!made.has(key)) made.set(key, make());
  return made.get(key) as T;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, color: boolean, metres: number) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.repeat.set(1 / metres, 1 / metres);
  return t;
}

/** Tileable value noise, values 0..1. `sx`/`sy` stretch it (wood grain). */
function fbm(size: number, seed: number, octaves = 5, base = 4, sx = 1, sy = 1) {
  const r = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const nx = Math.max(1, Math.round((base << o) * sx)), ny = Math.max(1, Math.round((base << o) * sy));
    const grid = new Float32Array(nx * ny).map(() => r());
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * ny, y0 = Math.floor(gy), fy = gy - y0, ty = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * nx, x0 = Math.floor(gx), fx = gx - x0, tx = fx * fx * (3 - 2 * fx);
        const a = grid[(y0 % ny) * nx + (x0 % nx)], b = grid[(y0 % ny) * nx + ((x0 + 1) % nx)];
        const c = grid[((y0 + 1) % ny) * nx + (x0 % nx)], d = grid[((y0 + 1) % ny) * nx + ((x0 + 1) % nx)];
        out[y * size + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function normalFrom(h: Float32Array, size: number, strength: number, metres: number) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      img.data[i] = (-dx / l) * 127 + 128;
      img.data[i + 1] = (dy / l) * 127 + 128;
      img.data[i + 2] = (1 / l) * 127 + 128;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false, metres);
}

/** Paint a colour image from a function of (x, y) → [r, g, b] (0..255). */
function paint(size: number, f: (x: number, y: number) => [number, number, number], metres: number) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, gg, b] = f(x, y), i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, true, metres);
}

const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface Surface {
  map: THREE.Texture;
  normal?: THREE.Texture;
  rough?: number;
}

/** Stacked round logs (the lodge's walls): one log is 0.32 m; texture covers 2.56 m. */
export const logs = () =>
  keep('logs', (): Surface => {
    const S = 512, M = 2.56, N = 8;
    const grain = fbm(S, 11, 5, 2, 8, 0.5), knots = fbm(S, 12, 3, 6);
    const h = new Float32Array(S * S);
    const map = paint(S, (x, y) => {
      const v = ((y / S) * N) % 1; // 0..1 across one log
      const round = Math.sin(v * Math.PI); // 0 at the chinking, 1 at the middle
      const i = y * S + x, g = grain[i], k = knots[i];
      h[i] = Math.pow(round, 0.5) * 0.8 + g * 0.2;
      const logN = Math.floor((y / S) * N);
      const tone = 0.85 + ((logN * 37) % 7) * 0.03;
      let c = mix([92, 56, 30], [168, 112, 62], clamp01(g * 1.3 - 0.1 + k * 0.2));
      c = c.map((q) => q * tone * (0.55 + round * 0.5)) as [number, number, number];
      if (round < 0.18) c = mix([196, 184, 160], c, round / 0.18); // pale chinking between the logs
      return c;
    }, M);
    return { map, normal: normalFrom(h, S, 5, M), rough: 0.8 };
  });

/** Warm plank floor (lobby, rooms): 0.18 m boards, staggered ends. Covers 2.88 m. */
export const planks = (dark = false) =>
  keep(`planks${dark}`, (): Surface => {
    const S = 512, M = 2.88, N = 16;
    const grain = fbm(S, dark ? 21 : 22, 5, 2, 0.4, 8);
    const h = new Float32Array(S * S);
    const r = rng(5);
    const shades = Array.from({ length: N * 4 }, () => 0.8 + r() * 0.35);
    const ends = Array.from({ length: N }, () => r());
    const base: [number, number, number] = dark ? [70, 42, 24] : [150, 98, 56];
    const hi: [number, number, number] = dark ? [120, 78, 44] : [206, 150, 92];
    const map = paint(S, (x, y) => {
      const col = Math.floor((x / S) * N), u = ((x / S) * N) % 1;
      const along = (y / S + ends[col]) % 1;
      const seg = Math.floor(along * 2);
      const i = y * S + x, g = grain[i];
      const joint = u < 0.04 || along % 0.5 < 0.006;
      h[i] = joint ? 0 : 0.6 + g * 0.4;
      let c = mix(base, hi, clamp01(g * 1.4 - 0.2));
      c = c.map((q) => q * shades[col * 4 + seg]) as [number, number, number];
      return joint ? (c.map((q) => q * 0.45) as [number, number, number]) : c;
    }, M);
    return { map, normal: normalFrom(h, S, 3, M), rough: 0.45 };
  });

/** Big rounded river stones in mortar (the fireplace, the dragon's rock). Covers 2 m. */
export const stone = () =>
  keep('stone', (): Surface => {
    const S = 512, M = 2;
    const r = rng(31);
    const pts = Array.from({ length: 70 }, () => [r() * S, r() * S, 0.75 + r() * 0.35, r()] as const);
    const n = fbm(S, 32, 4, 8);
    const h = new Float32Array(S * S);
    const map = paint(S, (x, y) => {
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let k = 0; k < pts.length; k++) {
        let dx = Math.abs(x - pts[k][0]), dy = Math.abs(y - pts[k][1]);
        dx = Math.min(dx, S - dx);
        dy = Math.min(dy, S - dy);
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          best = k;
        } else if (d < d2) d2 = d;
      }
      const edge = clamp01((d2 - d1) / 14);
      const i = y * S + x;
      h[i] = Math.sqrt(edge) * 0.9 + n[i] * 0.1;
      const p = pts[best];
      const base: [number, number, number] = p[3] < 0.33 ? [128, 118, 104] : p[3] < 0.66 ? [150, 134, 112] : [104, 98, 92];
      const c = base.map((q) => q * p[2] * (0.8 + n[i] * 0.4)) as [number, number, number];
      return edge < 0.25 ? mix([70, 64, 58], c, edge / 0.25) : c;
    }, M);
    return { map, normal: normalFrom(h, S, 6, M), rough: 0.85 };
  });

/** Smooth painted plaster (the guest wing). Covers 3 m. */
export const plaster = (tint: [number, number, number] = [226, 212, 186]) =>
  keep(`plaster${tint}`, (): Surface => {
    const S = 256, M = 3, n = fbm(S, 41, 5, 4);
    const map = paint(S, (x, y) => tint.map((q) => q * (0.94 + n[y * S + x] * 0.1)) as [number, number, number], M);
    return { map, normal: normalFrom(n, S, 1.2, M), rough: 0.9 };
  });

/** Patterned lodge carpet: deep red with pine-cone diamonds. Covers 2 m. */
export const carpet = (a: [number, number, number] = [118, 32, 30], b: [number, number, number] = [44, 70, 48]) =>
  keep(`carpet${a}${b}`, (): Surface => {
    const S = 256, M = 2, n = fbm(S, 51, 3, 32);
    const map = paint(S, (x, y) => {
      const u = (x / S) * 4, v = (y / S) * 4;
      const fu = u % 1 - 0.5, fv = v % 1 - 0.5;
      const dia = Math.abs(fu) + Math.abs(fv);
      let c: [number, number, number] = a;
      if (dia < 0.22) c = b;
      else if (dia > 0.42 && dia < 0.47) c = [196, 160, 92];
      return c.map((q) => q * (0.82 + n[y * S + x] * 0.3)) as [number, number, number];
    }, M);
    return { map, normal: normalFrom(n, S, 2, M), rough: 1 };
  });

/** Square tiles with grout. `size` is one tile (m); covers 8 tiles. */
export const tiles = (key: string, size: number, colours: [number, number, number][], grout: [number, number, number]) =>
  keep(`tiles${key}`, (): Surface => {
    const S = 256, N = 8, M = size * N, n = fbm(S, 61, 3, 16);
    const r = rng(key.length * 7 + 3);
    const pick = Array.from({ length: N * N }, () => colours[Math.floor(r() * colours.length)]);
    const shade = Array.from({ length: N * N }, () => 0.92 + r() * 0.12);
    const h = new Float32Array(S * S);
    const map = paint(S, (x, y) => {
      const tx = Math.floor((x / S) * N), ty = Math.floor((y / S) * N);
      const u = ((x / S) * N) % 1, v = ((y / S) * N) % 1;
      const g = u < 0.06 || v < 0.06;
      const i = y * S + x;
      h[i] = g ? 0 : 1;
      if (g) return grout;
      return pick[ty * N + tx].map((q) => q * shade[ty * N + tx] * (0.96 + n[i] * 0.08)) as [number, number, number];
    }, M);
    return { map, normal: normalFrom(h, S, 1.5, M), rough: 0.35 };
  });
export const poolTile = () => tiles('pool', 0.15, [[64, 160, 200], [76, 172, 210], [56, 146, 190]], [210, 230, 236]);
export const deckTile = () => tiles('deck', 0.5, [[202, 186, 160], [196, 178, 150], [210, 196, 172]], [150, 136, 116]);
export const bathTile = () => tiles('bath', 0.3, [[236, 236, 232], [228, 228, 224]], [180, 180, 176]);

/** Woven fabric (bedspreads, sofas). Covers 0.5 m. */
export const fabric = (key: string, col: [number, number, number], pattern: 'plain' | 'plaid' = 'plain') =>
  keep(`fabric${key}`, (): Surface => {
    const S = 128, M = pattern === 'plaid' ? 1 : 0.5, n = fbm(S, 71, 2, 32);
    const h = new Float32Array(S * S);
    const map = paint(S, (x, y) => {
      const weave = ((x % 4 < 2) !== (y % 4 < 2) ? 1 : 0.85) * (0.9 + n[y * S + x] * 0.2);
      h[y * S + x] = weave;
      let c = col;
      if (pattern === 'plaid') {
        const u = (x / S) * 4 % 1, v = (y / S) * 4 % 1;
        if (u < 0.2 || v < 0.2) c = mix(col, [30, 30, 28], 0.45);
        if (u < 0.2 && v < 0.2) c = mix(col, [20, 20, 18], 0.7);
        if (Math.abs(u - 0.6) < 0.03 || Math.abs(v - 0.6) < 0.03) c = mix(c, [230, 210, 150], 0.6);
      }
      return c.map((q) => q * weave) as [number, number, number];
    }, M);
    return { map, normal: normalFrom(h, S, 1, M), rough: 0.95 };
  });

/** Tongue-and-groove pine ceiling boards. Covers 2 m. */
export const ceilingBoards = () =>
  keep('ceil', (): Surface => {
    const S = 256, M = 2, N = 14, grain = fbm(S, 81, 4, 2, 0.5, 6);
    const h = new Float32Array(S * S);
    const map = paint(S, (x, y) => {
      const u = ((x / S) * N) % 1, i = y * S + x;
      h[i] = u < 0.05 ? 0 : 1;
      const c = mix([150, 104, 60], [196, 146, 92], grain[i]);
      return u < 0.05 ? (c.map((q) => q * 0.5) as [number, number, number]) : c;
    }, M);
    return { map, normal: normalFrom(h, S, 2, M), rough: 0.7 };
  });

/** Grass, from far away. Covers 6 m. */
export const grass = () =>
  keep('grass', (): Surface => {
    const S = 256, M = 6, n = fbm(S, 91, 6, 4), m = fbm(S, 92, 3, 64);
    const map = paint(S, (x, y) => {
      const i = y * S + x;
      return mix([58, 84, 34], [104, 128, 52], clamp01(n[i] * 1.2 - 0.1 + (m[i] - 0.5) * 0.4));
    }, M);
    return { map, normal: normalFrom(m, S, 2, M), rough: 1 };
  });

/** Car park asphalt. Covers 4 m. */
export const asphalt = () =>
  keep('asphalt', (): Surface => {
    const S = 256, M = 4, n = fbm(S, 95, 4, 8), m = fbm(S, 96, 2, 128);
    const map = paint(S, (x, y) => {
      const i = y * S + x, v = 52 + n[i] * 22 + (m[i] - 0.5) * 30;
      return [v, v, v * 1.02];
    }, M);
    return { map, normal: normalFrom(m, S, 1.5, M), rough: 0.9 };
  });

/** Ripples for water: a soft tileable height field. Covers 3 m (scrolled to make the water move). */
export const waterNormal = () =>
  keep('water', () => {
    const S = 256, n = fbm(S, 101, 4, 4);
    return normalFrom(n, S, 3, 3);
  });

/** Foamy streaks of water running down a slide (scrolled along it). */
export const slideWater = () =>
  keep('slideWater', () => {
    const [c, g] = canvas(128);
    g.fillStyle = 'rgba(200,235,255,0.55)';
    g.fillRect(0, 0, 128, 128);
    const r = rng(7);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`;
      g.fillRect(r() * 128, r() * 128, 1 + r() * 3, 6 + r() * 30);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

/** Text on a sign (the lodge sign, the ride names). */
export function signTexture(lines: string[], opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string } = {}) {
  const w = opts.w ?? 1024, h = opts.h ?? 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg ?? '#3b2414';
  g.fillRect(0, 0, w, h);
  g.fillStyle = opts.fg ?? '#f4e2b8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    // As big as fits: the first line biggest, shrunk to the board's width.
    let size = Math.floor((h / (lines.length + 0.6)) * (i === 0 ? 1 : 0.7));
    const font = (px: number) => opts.font ?? `bold ${px}px Georgia, 'Times New Roman', serif`;
    g.font = font(size);
    const wide = g.measureText(l).width;
    if (wide > w * 0.9) g.font = font((size = Math.floor((size * w * 0.9) / wide)));
    g.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
