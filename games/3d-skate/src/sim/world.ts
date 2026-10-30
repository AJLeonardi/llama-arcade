// The city as plain data: what's solid where, the rails, and the decorations. No three.js here, so the
// skater physics and the tests run in Node. The view (`view/city.ts`) draws exactly this data.
//
// Axes: +x is the skater's left when riding down the street, +z is down the street, +y is up.
// The tall building is at z < 0; its roof is the start. The street runs from z = 0 for 10 miles.

export const CITY_LEN = 16093; // 10 miles in metres
export const MILE = 1609.3;
export const HALF_W = 30; // the street (with sidewalks) is x in [-HALF_W, HALF_W]
export const ROOF_Y = 120;
export const STEP_UP = 0.35; // anything higher than this in front of the wheels is a wall
export const CHUNK = 100;
export const FIRST_PARK_CHUNK = 3; // the mega ramp has the street to itself before this
export const SIDEWALK = 0.15;

/** How a surface is painted. */
export type Look = 'concrete' | 'blue' | 'wood' | 'red' | 'roof' | 'wall';

export interface Profile {
  s: number[];
  h: number[];
  len: number;
}

export interface BoxPiece {
  kind: 'box';
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  look: Look;
}

/** A shape that only changes along one axis (ramps, quarter pipes, stairs), solid down to the ground. */
export interface RampPiece {
  kind: 'ramp';
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  axis: 'x' | 'z';
  /** World x or z where the profile's s = 0. */
  s0: number;
  /** +1: s grows with x/z; -1: s grows the other way. */
  dir: 1 | -1;
  prof: Profile;
  look: Look;
  /** Draw a steel pipe along the top edge (the coping of a quarter pipe). */
  coping?: boolean;
  /** Draw stair treads (for the view) */
  stairs?: boolean;
}

export type Piece = BoxPiece | RampPiece;

export interface Rail {
  a: [number, number, number];
  b: [number, number, number];
  /** Edge of a ledge or box: grindable but not drawn as a pipe. */
  edge?: boolean;
}

export interface Decor {
  kind: 'lamp' | 'tree' | 'bench' | 'mile' | 'banner';
  x: number;
  z: number;
  rot?: number;
  text?: string;
}

export interface Building {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  style: number;
  /** No low wall round the roof (the start building has its own, open where the ramp starts). */
  noParapet?: boolean;
}

export interface Chunk {
  i: number;
  pieces: Piece[];
  rails: Rail[];
  decor: Decor[];
  buildings: Building[];
}

// ---------------------------------------------------------------- profiles

export class ProfileBuilder {
  s: number[];
  h: number[];
  constructor(h0 = 0) {
    this.s = [0];
    this.h = [h0];
  }
  get end() {
    return this.s[this.s.length - 1];
  }
  get top() {
    return this.h[this.h.length - 1];
  }
  private push(s: number, h: number) {
    this.s.push(s);
    this.h.push(h);
  }
  /** A straight piece `ds` long that rises `dh` (a step when ds = 0). */
  line(ds: number, dh: number) {
    this.push(this.end + ds, this.top + dh);
    return this;
  }
  flat(ds: number) {
    return this.line(ds, 0);
  }
  /** A straight slope at `angle` (radians, + rises) that changes height by `dh`. */
  slope(angle: number, dh: number) {
    return this.line(dh / Math.tan(angle), dh);
  }
  /** A circular curve of radius R turning the slope from angle a0 to a1 (radians, + rises). */
  arc(R: number, a0: number, a1: number, step = 0.2) {
    const k = Math.sign(a1 - a0);
    const s0 = this.end, h0 = this.top;
    const n = Math.max(2, Math.ceil((R * Math.abs(a1 - a0)) / step));
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      this.push(s0 + (R / k) * (Math.sin(a) - Math.sin(a0)), h0 + (R / k) * (Math.cos(a0) - Math.cos(a)));
    }
    return this;
  }
  /** Stairs: n steps, each `rise` high (negative goes down) and `run` deep. */
  steps(n: number, rise: number, run: number) {
    for (let i = 0; i < n; i++) {
      if (rise > 0) this.line(0, rise).flat(run);
      else this.flat(run).line(0, rise);
    }
    return this;
  }
  build(): Profile {
    return { s: this.s, h: this.h, len: this.end };
  }
}

/** Height and slope (dh/ds) of a profile at s. */
export function profileAt(p: Profile, s: number): [number, number] {
  const { s: S, h: H } = p;
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (S[mid] <= s) lo = mid;
    else hi = mid;
  }
  // On a vertical step (two points at the same s) take the higher one, so the wall is found.
  while (lo + 1 < S.length - 1 && S[lo + 1] === S[lo] && S[lo] === s) lo++;
  const ds = S[hi] - S[lo];
  if (ds <= 1e-9) return [Math.max(H[lo], H[hi]), 0];
  const t = Math.min(1, Math.max(0, (s - S[lo]) / ds));
  const slope = (H[hi] - H[lo]) / ds;
  return [H[lo] + (H[hi] - H[lo]) * t, slope];
}

/** Height and gradient (dh/dx, dh/dz) of a piece at (x, z), or null if (x, z) is outside it. */
export function pieceAt(p: Piece, x: number, z: number): [number, number, number] | null {
  if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return null;
  if (p.kind === 'box') return [p.top, 0, 0];
  const c = p.axis === 'x' ? x : z;
  const s = (c - p.s0) * p.dir;
  if (s < 0 || s > p.prof.len) return null;
  const [h, slope] = profileAt(p.prof, s);
  const g = slope * p.dir;
  return p.axis === 'x' ? [h, g, 0] : [h, 0, g];
}

// ---------------------------------------------------------------- the start: the tall building and the mega ramp

export const RAMP_W = 12;
/** The mega ramp's profile, starting at the roof edge (z = 0). */
export const MEGA = (() => {
  const b = new ProfileBuilder(ROOF_Y);
  const drop = (50 * Math.PI) / 180;
  const R1 = 15, R2 = 40, R3 = 22;
  b.arc(R1, 0, -drop, 0.25);
  const bottomCurveRise = R2 * (1 - Math.cos(drop));
  b.slope(-drop, -(b.top - bottomCurveRise));
  b.arc(R2, -drop, 0, 0.25);
  b.flat(25);
  const kickStart = b.end;
  const lip = (70 * Math.PI) / 180;
  b.arc(R3, 0, lip, 0.2);
  const lipS = b.end;
  b.flat(14);
  b.slope(-(22 * Math.PI) / 180, -b.top);
  const prof = b.build();
  return { prof, kickStart, lipS, lipH: prof.h[prof.s.indexOf(lipS)] };
})();

/** Where you start: on the roof, a little back from the ramp, facing down the street. */
export const SPAWN = { x: 0, y: ROOF_Y, z: -14, heading: 0 };

function startPieces(): Chunk {
  const pieces: Piece[] = [];
  const rails: Rail[] = [];
  const hw = RAMP_W / 2;
  // The roof and the two lower neighbours.
  pieces.push({ kind: 'box', x0: -15, x1: 15, z0: -40, z1: 0, top: ROOF_Y, look: 'roof' });
  // Parapet around the roof, open where the ramp starts.
  const par = 1.1;
  pieces.push({ kind: 'box', x0: -15, x1: -14.6, z0: -40, z1: 0, top: ROOF_Y + par, look: 'wall' });
  pieces.push({ kind: 'box', x0: 14.6, x1: 15, z0: -40, z1: 0, top: ROOF_Y + par, look: 'wall' });
  pieces.push({ kind: 'box', x0: -15, x1: 15, z0: -40, z1: -39.6, top: ROOF_Y + par, look: 'wall' });
  pieces.push({ kind: 'box', x0: -15, x1: -hw - 0.3, z0: -0.4, z1: 0, top: ROOF_Y + par, look: 'wall' });
  pieces.push({ kind: 'box', x0: hw + 0.3, x1: 15, z0: -0.4, z1: 0, top: ROOF_Y + par, look: 'wall' });
  // The mega ramp, with guard walls along both sides so you can't ride off the edge.
  const L = MEGA.prof.len;
  pieces.push({ kind: 'ramp', x0: -hw, x1: hw, z0: 0, z1: L, axis: 'z', s0: 0, dir: 1, prof: MEGA.prof, look: 'blue', coping: false });
  const guardEnd = MEGA.kickStart; // the kicker and landing are open at the sides
  const guard = new ProfileBuilder(MEGA.prof.h[0] + 1);
  for (let i = 1; i < MEGA.prof.s.length && MEGA.prof.s[i] <= guardEnd; i++) {
    guard.line(MEGA.prof.s[i] - guard.end, MEGA.prof.h[i] + 1 - guard.top);
  }
  const gp = guard.build();
  pieces.push({ kind: 'ramp', x0: -hw - 0.3, x1: -hw, z0: 0, z1: gp.len, axis: 'z', s0: 0, dir: 1, prof: gp, look: 'wall' });
  pieces.push({ kind: 'ramp', x0: hw, x1: hw + 0.3, z0: 0, z1: gp.len, axis: 'z', s0: 0, dir: 1, prof: gp, look: 'wall' });
  // A rail down the landing, for anyone brave enough.
  const landTop = MEGA.lipS + 14;
  rails.push({ a: [hw - 1, MEGA.lipH + 0.4, MEGA.lipS + 2], b: [hw - 1, MEGA.lipH + 0.4, landTop] });
  return { i: -1, pieces, rails, decor: [{ kind: 'banner', x: 0, z: 2, text: 'SKATE CITY' }], buildings: [] };
}

// ---------------------------------------------------------------- the city, a chunk at a time

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

type Out = { pieces: Piece[]; rails: Rail[] };
const deg = (d: number) => (d * Math.PI) / 180;

/** A ramp along z, from z0 going down the street (dir 1) or back up it (dir -1). */
function rampZ(o: Out, cx: number, w: number, z0: number, dir: 1 | -1, prof: Profile, look: Look = 'concrete', extra: Partial<RampPiece> = {}) {
  const za = dir === 1 ? z0 : z0 - prof.len, zb = dir === 1 ? z0 + prof.len : z0;
  const p: RampPiece = { kind: 'ramp', x0: cx - w / 2, x1: cx + w / 2, z0: za, z1: zb, axis: 'z', s0: z0, dir, prof, look, ...extra };
  o.pieces.push(p);
  return p;
}

/** Building blocks for the park. Each fits in a 40 m long slot. Returns how long it really is. */
const FEATURES: ((o: Out, cx: number, z: number, r: () => number, side: number) => void)[] = [
  // A flat rail.
  (o, cx, z) => {
    const h = 0.45;
    o.rails.push({ a: [cx, h, z + 5], b: [cx, h, z + 17] });
  },
  // A ledge you can grind on either edge.
  (o, cx, z, r) => {
    const top = 0.45, w = 1.2, len = 12 + Math.floor(r() * 3) * 2;
    o.pieces.push({ kind: 'box', x0: cx - w / 2, x1: cx + w / 2, z0: z + 4, z1: z + 4 + len, top, look: 'concrete' });
    o.rails.push({ a: [cx - w / 2, top, z + 4], b: [cx - w / 2, top, z + 4 + len], edge: true });
    o.rails.push({ a: [cx + w / 2, top, z + 4], b: [cx + w / 2, top, z + 4 + len], edge: true });
  },
  // A table-top jump: a kicker, a flat top (land on it if you're slow) and a slope down.
  (o, cx, z, r) => {
    const a = deg(28 + r() * 10);
    const p = new ProfileBuilder().arc(9, 0, a).build();
    const top = p.h[p.h.length - 1];
    const jump = new ProfileBuilder().arc(9, 0, a).flat(4 + r() * 3).slope(-deg(20), -top).build();
    rampZ(o, cx, 4.5, z + 3, 1, jump, r() < 0.5 ? 'wood' : 'concrete');
  },
  // A fun box: up, across (with a rail on top), and down.
  (o, cx, z) => {
    const h = 1.1;
    const p = new ProfileBuilder().slope(deg(18), h).flat(6).slope(-deg(18), -h).build();
    const box = rampZ(o, cx, 5, z + 4, 1, p, 'concrete');
    const up = h / Math.tan(deg(18));
    o.rails.push({ a: [cx + 1.6, h + 0.35, box.z0 + up + 0.3], b: [cx + 1.6, h + 0.35, box.z0 + up + 5.7] });
  },
  // A quarter pipe facing the middle of the street.
  (o, cx, z, r, side) => {
    const R = 3.2, prof = new ProfileBuilder().arc(R, 0, deg(80), 0.1).build();
    const L = prof.len, top = prof.h[prof.h.length - 1];
    const len = 14 + r() * 6;
    const outer = side * (HALF_W - 5); // its back sits near the sidewalk
    const dir = side > 0 ? 1 : -1; // rises toward the outside
    const s0 = outer - dir * (L + 2);
    o.pieces.push({ kind: 'ramp', x0: Math.min(s0, s0 + dir * L), x1: Math.max(s0, s0 + dir * L), z0: z + 4, z1: z + 4 + len, axis: 'x', s0, dir: dir as 1 | -1, prof, look: 'wood', coping: true });
    const d0 = s0 + dir * L;
    o.pieces.push({ kind: 'box', x0: Math.min(d0, d0 + dir * 2), x1: Math.max(d0, d0 + dir * 2), z0: z + 4, z1: z + 4 + len, top, look: 'concrete' });
    void cx;
  },
  // A plaza: a bank up, a flat top, stairs down with a handrail.
  (o, cx, z) => {
    const H = 1.6, n = 6, rise = H / n, run = 0.45;
    const p = new ProfileBuilder().slope(deg(15), H).flat(7).steps(n, -rise, run).flat(0.5).build();
    const plaza = rampZ(o, cx, 7, z + 2, 1, p, 'concrete', { stairs: true });
    const stairTop = plaza.z0 + H / Math.tan(deg(15)) + 7;
    const rx = cx + 2.6;
    o.rails.push({ a: [rx, H + 0.85, stairTop - 0.6], b: [rx, 0.85 - rise * 0.5, stairTop + n * run + 0.4] });
  },
  // A mini ramp: two quarter pipes facing each other across the slot.
  (o, cx, z, r) => {
    const R = 2.6, prof = new ProfileBuilder().flat(0.01).arc(R, 0, deg(80), 0.1).build();
    const L = prof.len, top = prof.h[prof.h.length - 1];
    const gap = 5, len = 10 + r() * 4;
    for (const dir of [1, -1] as const) {
      const s0 = cx + dir * (gap / 2);
      o.pieces.push({ kind: 'ramp', x0: Math.min(s0, s0 + dir * L), x1: Math.max(s0, s0 + dir * L), z0: z + 4, z1: z + 4 + len, axis: 'x', s0, dir, prof, look: 'wood', coping: true });
      const d0 = s0 + dir * L;
      o.pieces.push({ kind: 'box', x0: Math.min(d0, d0 + dir * 1.5), x1: Math.max(d0, d0 + dir * 1.5), z0: z + 4, z1: z + 4 + len, top, look: 'concrete' });
    }
  },
  // A long, low rail that steps down.
  (o, cx, z) => {
    o.rails.push({ a: [cx, 0.7, z + 3], b: [cx, 0.7, z + 11] });
    o.rails.push({ a: [cx, 0.7, z + 11], b: [cx, 0.3, z + 19] });
  },
];

/** The middle of the street gets a big table-top jump every 400 m. */
function bigJump(o: Out, z: number) {
  const k = new ProfileBuilder().arc(14, 0, deg(38)).build();
  const top = k.h[k.h.length - 1];
  const p = new ProfileBuilder().arc(14, 0, deg(38)).flat(9).slope(-deg(16), -top).build();
  rampZ(o, 0, 9, z, 1, p, 'blue');
}

const STYLES = 5;

function buildingsAlong(r: () => number, z0: number, z1: number, side: number, out: Building[]) {
  let z = z0;
  while (z < z1 - 1) {
    const w = Math.min(z1 - z, 14 + r() * 30);
    const tall = r();
    const h = 14 + tall * tall * 110;
    const depth = 22 + r() * 20;
    const xa = side * HALF_W, xb = side * (HALF_W + depth);
    out.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: z, z1: z + w, h, style: Math.floor(r() * STYLES) });
    z += w;
  }
}

const cache = new Map<number, Chunk>();
let start: Chunk | null = null;

/** The chunk holding street position z (z from i*CHUNK to (i+1)*CHUNK). Chunk -1 is the start area. */
export function chunk(i: number): Chunk {
  if (i < 0) return (start ??= startPieces());
  let c = cache.get(i);
  if (c) return c;
  const r = rng(i * 7919 + 17);
  const o: Out = { pieces: [], rails: [] };
  const decor: Decor[] = [];
  const buildings: Building[] = [];
  const z0 = i * CHUNK;
  // Sidewalks.
  o.pieces.push({ kind: 'box', x0: -HALF_W, x1: -HALF_W + 4, z0, z1: z0 + CHUNK, top: SIDEWALK, look: 'concrete' });
  o.pieces.push({ kind: 'box', x0: HALF_W - 4, x1: HALF_W, z0, z1: z0 + CHUNK, top: SIDEWALK, look: 'concrete' });
  if (i >= FIRST_PARK_CHUNK && z0 + CHUNK < CITY_LEN - 60) {
    for (const side of [-1, 1]) {
      for (const slot of [0, 1, 2]) {
        if (r() < 0.1) continue; // an empty spot now and then
        const f = Math.floor(r() * FEATURES.length);
        const cx = side * (13 + r() * 4);
        FEATURES[f](o, cx, z0 + slot * 33 + 1, r, side);
      }
    }
    if (i % 4 === 1) bigJump(o, z0 + 20);
  }
  for (let z = z0 + 5; z < z0 + CHUNK; z += 25) {
    decor.push({ kind: 'lamp', x: -HALF_W + 4.6, z, rot: Math.PI / 2 }, { kind: 'lamp', x: HALF_W - 4.6, z: z + 12.5, rot: -Math.PI / 2 });
  }
  for (let z = z0 + 10; z < z0 + CHUNK; z += 20) {
    decor.push({ kind: 'tree', x: -HALF_W + 2, z }, { kind: 'tree', x: HALF_W - 2, z: z + 10 });
  }
  if (r() < 0.6) decor.push({ kind: 'bench', x: -HALF_W + 3.2, z: z0 + 30 + r() * 40, rot: Math.PI / 2 });
  // Mile markers: a sign on the sidewalk each time a whole mile is crossed in this chunk.
  const mile = Math.floor((z0 + CHUNK) / MILE);
  if (mile >= 1 && mile * MILE >= z0 && mile * MILE < z0 + CHUNK) {
    decor.push({ kind: 'mile', x: 0, z: mile * MILE, text: mile === 10 ? '10 MILES!' : `MILE ${mile}` });
  }
  buildingsAlong(r, z0, z0 + CHUNK, -1, buildings);
  buildingsAlong(r, z0, z0 + CHUNK, 1, buildings);
  c = { i, pieces: o.pieces, rails: o.rails, decor, buildings };
  cache.set(i, c);
  return c;
}

export const chunkIndex = (z: number) => (z < 0 ? -1 : Math.floor(z / CHUNK));
const START_REACH = MEGA.prof.len + 2; // the start area's pieces reach this far down the street

/** Every chunk whose pieces might cover street position z. */
function chunksAt(z: number): Chunk[] {
  const i = chunkIndex(z);
  if (i < 0) return [chunk(-1)];
  return z < START_REACH ? [chunk(-1), chunk(i)] : [chunk(i)];
}

export interface Surface {
  /** Height of the ground you're on (or would land on). */
  h: number;
  hx: number;
  hz: number;
  /** There's something taller than a step at this spot: you'd hit its side. */
  wall: boolean;
}

/** Outside the playable area (the building fronts, the ends of the city). */
export function outside(x: number, z: number) {
  if (z > CITY_LEN || z < -40) return true;
  if (Math.abs(x) > HALF_W) return true;
  return false;
}

/** The ground at (x, z) for something whose bottom is at height `feet`. */
export function surfaceAt(x: number, z: number, feet: number): Surface {
  const out: Surface = { h: 0, hx: 0, hz: 0, wall: false };
  if (outside(x, z)) {
    out.wall = true;
    out.h = -1e9;
    return out;
  }
  if (z < 0) {
    // Beside the tall building: the lower neighbours' roofs.
    if (Math.abs(x) > 15) {
      out.h = 50;
      if (feet + STEP_UP < 50) out.wall = true;
    }
  }
  for (const c of chunksAt(z)) {
    for (const p of c.pieces) {
      const g = pieceAt(p, x, z);
      if (!g) continue;
      if (g[0] <= feet + STEP_UP) {
        if (g[0] > out.h) {
          out.h = g[0];
          out.hx = g[1];
          out.hz = g[2];
        }
      } else out.wall = true;
    }
  }
  return out;
}

/** Rails that might be near street position z. */
export function railsAt(z: number): Rail[] {
  const cs = chunksAt(z);
  if (cs.length === 1) return cs[0].rails;
  return cs.flatMap((c) => c.rails);
}
