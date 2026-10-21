// Coaster Park: roller coasters (and a Ferris wheel) that you ride, not drive. The tracks are smooth curves
// through hand-placed points; a ride is just "how far along the track are we, and how fast".
// Pure maths, no three.js: tested in tests/coaster.test.ts.
import type { Block, Level, V3 } from './types';

// ---------------------------------------------------------------- tiny vector helpers

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Rotate v about the unit axis k by angle a (Rodrigues). */
function rotate(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

// ---------------------------------------------------------------- the rides

export interface CoasterDef {
  id: string;
  name: string;
  emoji: string;
  /** Train colour and track colour. */
  color: string;
  rail: string;
  kind: 'coaster' | 'wheel';
  /** Coasters: the track's points, in world space, as a closed loop. Point 1 is where the train waits. */
  points: V3[];
  /** Points between which the chain lift pulls the train up (point indexes). */
  lift: [number, number];
  /** Wheels: centre and radius; the wheel turns in the x-y plane. */
  centre?: V3;
  radius?: number;
}

/** A point on the track: where, which way is forward, and which way is up for the riders. */
export interface TrackPoint {
  p: V3;
  t: V3;
  up: V3;
}

const G = 9.8;
const LIFT_SPEED = 8; // chain lift (m/s)
const MIN_SPEED = 5; // never stalls (it's a game)
const LAUNCH = 6; // leaving the station
const SAMPLE = 0.25; // metres between samples

/** Uniform Catmull-Rom through p1..p2 (p0, p3 are the neighbours). */
function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t, t3 = t2 * t;
  const out: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] = 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  }
  return out;
}

/** A coaster track: evenly spaced samples along the curve, each with its own frame. */
export class Track {
  readonly pts: V3[] = [];
  readonly fwd: V3[] = [];
  readonly up: V3[] = [];
  /** Is the chain lift pulling at this sample? */
  readonly lifting: boolean[] = [];
  readonly length: number;
  /** Distance along the track of the waiting spot in the station. */
  readonly start: number;

  constructor(readonly def: CoasterDef) {
    const P = def.points, n = P.length;
    // 1. A dense polyline through the points, remembering which segment each bit came from.
    const dense: V3[] = [], seg: number[] = [];
    for (let i = 0; i < n; i++) {
      const steps = Math.max(8, Math.ceil(len(sub(P[(i + 1) % n], P[i])) / 0.1));
      for (let k = 0; k < steps; k++) {
        dense.push(catmull(P[(i - 1 + n) % n], P[i], P[(i + 1) % n], P[(i + 2) % n], k / steps));
        seg.push(i);
      }
    }
    // 2. Resample evenly by distance.
    const inLift = (k: number) => k >= def.lift[0] && k < def.lift[1];
    let total = 0, next = 0, startAt = -1;
    for (let i = 0; i < dense.length; i++) {
      const a = dense[i], b = dense[(i + 1) % dense.length];
      const d = len(sub(b, a));
      while (next < total + d) {
        this.pts.push(lerp(a, b, (next - total) / d));
        this.lifting.push(inLift(seg[i]));
        if (seg[i] === 1 && startAt < 0) startAt = next; // point 1: the station's waiting spot
        next += SAMPLE;
      }
      total += d;
    }
    const m = this.pts.length;
    this.length = m * SAMPLE;
    this.start = startAt;
    // 3. Forward directions, and "up" carried smoothly along (so loops turn you upside down properly).
    for (let i = 0; i < m; i++) this.fwd.push(norm(sub(this.pts[(i + 1) % m], this.pts[(i - 1 + m) % m])));
    let up: V3 = norm(sub([0, 1, 0], mul(this.fwd[0], this.fwd[0][1])));
    for (let i = 0; i < m; i++) {
      if (i > 0) {
        const a = this.fwd[i - 1], b = this.fwd[i];
        const axis = cross(a, b);
        const s = len(axis);
        if (s > 1e-6) up = rotate(up, mul(axis, 1 / s), Math.atan2(s, dot(a, b)));
      }
      up = norm(sub(up, mul(this.fwd[i], dot(up, this.fwd[i]))));
      this.up.push(up);
    }
    // Going all the way round can leave "up" twisted a bit at the end: spread the fix along the track.
    const end = this.up[m - 1], first = this.up[0], f0 = this.fwd[0];
    const twist = Math.atan2(dot(cross(end, first), f0), dot(end, first));
    for (let i = 0; i < m; i++) this.up[i] = norm(rotate(this.up[i], this.fwd[i], (twist * i) / m));
  }

  /** The track at distance s (wraps round). */
  at(s: number): TrackPoint {
    const m = this.pts.length;
    const x = ((s / SAMPLE) % m + m) % m;
    const i = Math.floor(x), j = (i + 1) % m, f = x - i;
    return { p: lerp(this.pts[i], this.pts[j], f), t: norm(lerp(this.fwd[i], this.fwd[j], f)), up: norm(lerp(this.up[i], this.up[j], f)) };
  }

  lift(s: number) {
    const m = this.pts.length;
    return this.lifting[Math.floor(((s / SAMPLE) % m + m) % m)];
  }
}

/** One go on a coaster: from the station, once round, and back into the station. */
export class Ride {
  /** Distance travelled since leaving the station. */
  d = 0;
  v = 0;
  done = false;
  maxV = 0;
  constructor(readonly track: Track) {}

  /** Where the front of the train is now (distance along the track). */
  get s() {
    return this.track.start + this.d;
  }

  step(dt: number) {
    if (this.done) return;
    const T = this.track;
    const left = T.length - this.d;
    const slope = T.at(this.s).t[1];
    if (this.d < 6) this.v = Math.max(this.v, Math.min(LAUNCH, this.v + dt * 6));
    else if (T.lift(this.s)) this.v = Math.max(LIFT_SPEED, this.v - G * slope * dt);
    else {
      this.v -= G * 1.3 * slope * dt; // downhill speeds you up, uphill slows you down (a bit more than real, for fun)
      this.v -= (0.02 + 0.0007 * this.v * this.v) * dt * 10; // air and wheels
      this.v = Math.max(MIN_SPEED, this.v);
    }
    // Brakes into the station.
    if (left < 30) this.v = Math.min(this.v, Math.max(1.5, left * 0.6));
    this.maxV = Math.max(this.maxV, this.v);
    this.d += this.v * dt;
    if (this.d >= T.length) {
      this.d = T.length;
      this.done = true;
    }
  }
}

/** The Ferris wheel: once round, slowly. Returns the gondola's angle (0 = at the bottom). */
export const WHEEL_TIME = 40;

// ---------------------------------------------------------------- the park

type Turn = 0 | 1 | 2 | 3;
/** Points written facing +z from a station at the origin, turned and moved into place. */
function place(pts: V3[], ox: number, oz: number, turn: Turn, y0 = 0): V3[] {
  return pts.map(([x, y, z]) => {
    const [a, b] = [[x, z], [-z, x], [-x, -z], [z, -x]][turn];
    return [ox + a, y + y0, oz + b];
  });
}

const ST = 0.8; // track height in the stations

/** A vertical loop: enters at `at` going +x, comes out `shift` further along z. */
function loop(at: V3, r: number, shift: number): V3[] {
  const out: V3[] = [];
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    out.push([at[0] + Math.sin(a) * r, at[1] + r - Math.cos(a) * r, at[2] + (shift * k) / 8]);
  }
  return out;
}

/** A helix around a vertical axis, going down from y0 to y1 in `turns` turns. Starts heading +x. */
function helix(cx: number, cz: number, r: number, y0: number, y1: number, turns: number): V3[] {
  const out: V3[] = [];
  const n = Math.round(turns * 8);
  for (let k = 0; k <= n; k++) {
    const a = (k / 8) * Math.PI * 2;
    out.push([cx + Math.sin(a) * r, y0 + ((y1 - y0) * k) / n, cz - Math.cos(a) * r]);
  }
  return out;
}

export const COASTERS: CoasterDef[] = [
  {
    id: 'worm', name: 'Wiggly Worm', emoji: '🐛', color: '#69db7c', rail: '#2b8a3e', kind: 'coaster', lift: [2, 4],
    points: place([
      [-10, ST, 0], [0, ST, 0], [8, ST, 0], [14, 2.5, 0], [19, 5, 1], [24, 4.5, 4], [27, 2, 9], [26, 3.5, 14],
      [20, 1.6, 17], [12, 3.5, 18], [4, 1.5, 18], [-4, 2.5, 17], [-11, 2, 13], [-17, 1.4, 6.5],
    ], 72, 2, 3),
  },
  {
    id: 'loopy', name: 'Loopy Llama', emoji: '🔁', color: '#ff6b6b', rail: '#c92a2a', kind: 'coaster', lift: [2, 6],
    points: place([
      [-10, ST, 0], [0, ST, 0], [8, ST, 0], [15, 4, 0], [22, 10, 0], [29, 17, 0], [35, 21, 0], [40, 21.5, 0],
      [45, 15, 0], [50, 5, 0], [56, 1.5, 0],
      ...loop([64, 1.5, 0], 7.5, 4).slice(1, -1),
      [64, 1.5, 4], [74, 2, 5], [84, 4, 9], [89, 7, 16], [85, 9, 23], [76, 6, 27],
      [66, 11, 28], [57, 3, 28], [48, 9, 28], [39, 3, 28], [28, 6, 27], [16, 2.5, 26], [4, 4, 23], [-6, 2.5, 19], [-14, 2, 13], [-17, 1.4, 6],
    ], -40, 20, 0),
  },
  {
    id: 'tornado', name: 'Twisty Tornado', emoji: '🌪️', color: '#9775fa', rail: '#5f3dc4', kind: 'coaster', lift: [2, 5],
    points: place([
      [-10, ST, 0], [0, ST, 0], [8, ST, 0], [15, 5, 0], [22, 11, 0], [29, 17, 0], [34, 18, 1.5],
      ...helix(38, 13, 9, 18, 3, 2).slice(1),
      [48, 2.5, 4], [56, 5, 12], [54, 4, 22], [44, 7, 30], [30, 3, 31], [16, 5, 29], [3, 2.5, 25], [-8, 3, 19], [-15, 2, 12], [-17, 1.4, 5.5],
    ], -70, -24, 1),
  },
  {
    id: 'screamer', name: 'Sky Screamer', emoji: '🚀', color: '#ffd43b', rail: '#e67700', kind: 'coaster', lift: [2, 7],
    points: place([
      [-10, ST, 0], [0, ST, 0], [8, ST, 0], [14, 5, 0], [21, 14, 0], [28, 24, 0], [34, 33, 0], [39, 38.5, 0], [43, 39, 0],
      [48, 31, 0], [53, 17, 0], [58, 5, 0], [66, 2, 0], [76, 18, 0], [84, 21, 0], [92, 13, 0], [100, 3.5, 0],
      [110, 3, 7], [114, 6, 19], [108, 9, 29], [96, 8, 33], [84, 17, 34], [74, 20, 34], [64, 10, 34], [54, 3, 34],
      [40, 8, 34], [26, 3.5, 32], [12, 4, 28], [-2, 4, 22], [-12, 2.5, 15], [-17, 1.4, 6.5],
    ], 50, -20, 2),
  },
  {
    id: 'wheel', name: 'Big Wheel', emoji: '🎡', color: '#4dabf7', rail: '#ffffff', kind: 'wheel', lift: [0, 0], points: [],
    centre: [-30, 16, 2], radius: 14,
  },
];

/** The stations: where you stand to get on (the track's waiting spot, or the bottom of the wheel). */
export function stationOf(c: CoasterDef): { at: V3; along: V3 } {
  if (c.kind === 'wheel') return { at: [c.centre![0], 0, c.centre![2] + 3], along: [1, 0, 0] };
  const t = new Track(c);
  const p = t.at(t.start);
  return { at: [p.p[0], 0, p.p[2]], along: p.t };
}

export function coasterPark(): Level {
  const blocks: Block[] = [];
  const coins: V3[] = [];
  const box = (x: number, y0: number, z: number, w: number, h: number, d: number, color: string, more: Partial<Block> = {}) =>
    blocks.push({ x, y: y0 + h / 2, z, w, h, d, kind: 'solid', color, ...more });
  box(0, -1, 0, 260, 1, 260, '#8ce99a');
  // The plaza in the middle, and a portal home.
  box(0, -0.98, 0, 24, 1, 24, '#ffe8cc');
  box(-2.4, 0, 9, 1, 5.5, 1, '#f1f3f5');
  box(2.4, 0, 9, 1, 5.5, 1, '#f1f3f5');
  box(0, 5.5, 9, 5.8, 1, 1, '#3bb273');
  blocks.push({ x: 0, y: 2.75, z: 9, w: 3.8, h: 5.5, d: 0.6, kind: 'portal', color: '#3bb273', level: 'hub' });
  const signs: Level['signs'] = [];
  for (const c of COASTERS) {
    const { at, along } = stationOf(c);
    // A platform beside the track, with a gate and a sign. Standing on it shows the Ride button.
    // The platform goes on the outside of the track (the ride itself is on the inside).
    const sideways = Math.abs(along[0]) > Math.abs(along[2]);
    const [w, d] = sideways ? [9, 3] : [3, 9];
    const off = c.kind === 'wheel' ? [0, 0] : [along[2] * 2.6, -along[0] * 2.6];
    const sx = at[0] + off[0], sz = at[2] + off[1];
    box(sx, 0, sz, w, 0.45, d, c.color);
    blocks.push({ x: sx, y: 1.2, z: sz, w: w + 1, h: 2.4, d: d + 1, kind: 'zone', color: '#000', tag: `ride:${c.id}` });
    signs.push({ at: [sx, 5, sz], text: `${c.emoji} ${c.name}`, color: c.rail === '#ffffff' ? c.color : c.rail });
    // A path from the plaza.
    const steps = Math.ceil(Math.hypot(sx, sz) / 3);
    for (let k = 2; k < steps - 1; k++) {
      const f = k / steps;
      box(sx * f, -0.97, sz * f, 2.6, 1, 2.6, '#ffe8cc', { deco: true });
    }
    coins.push([sx * 0.5, 1.2, sz * 0.5]);
  }
  // Some fun on the plaza: balloons and benches (for looks), and trees around the park.
  for (const [x, z, col] of [[-6, -5, '#ff6b6b'], [6, -5, '#4dabf7'], [-6, 5, '#ffd43b'], [6, 5, '#b197fc']] as const) {
    box(x, 0, z, 2.5, 0.5, 0.8, '#8a5a2b');
    box(x, 3, z, 0.05, 2, 0.05, '#ffffff', { deco: true });
    box(x, 5, z, 0.8, 1, 0.8, col, { deco: true });
  }
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Trees, but not where a track or a ride goes.
  const tracks = COASTERS.filter((c) => c.kind === 'coaster').map((c) => new Track(c).pts);
  const wheel = COASTERS.find((c) => c.kind === 'wheel')!;
  const clear = (x: number, z: number) =>
    Math.hypot(x, z) > 20 &&
    Math.abs(x - wheel.centre![0]) > wheel.radius! + 5 &&
    tracks.every((pts) => pts.every((p) => Math.hypot(p[0] - x, p[2] - z) > 6));
  for (let i = 0; i < 60; i++) {
    const x = (rnd() - 0.5) * 230, z = (rnd() - 0.5) * 230;
    if (!clear(x, z)) continue;
    box(x, 0, z, 0.8, 2.4, 0.8, '#8a5a2b', { deco: true });
    box(x, 2.4, z, 2.8, 2.4, 2.8, '#2f9e44', { deco: true });
  }
  return {
    id: 'coaster',
    name: 'Coaster Park',
    emoji: '🎢',
    spawn: [0, 0, -3],
    spawnYaw: Math.PI,
    blocks,
    coins,
    reward: 0,
    fallY: -10,
    sky: ['#4fb3ff', '#ffe3f6'],
    signs,
  };
}
