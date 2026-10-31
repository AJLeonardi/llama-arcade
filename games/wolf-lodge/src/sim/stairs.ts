// The slide towers' stairs, as plain data: flights of steps and landings (axis-aligned rectangles), each
// with the sides that have a railing. The game turns them into solid boxes you walk up (with railings too
// high to jump over); the view draws the same pieces with stringers, handrails and balusters.
import type { Box } from './world';

/** A side of a rectangle: x0 = its -x edge, x1 = +x, z0 = -z, z1 = +z. */
export type Side = 'x0' | 'x1' | 'z0' | 'z1';
export interface Rect { x0: number; x1: number; z0: number; z1: number }
/** A flight of steps over `rect`, going up `rise` from `y0`, in direction `dir`. */
export interface Flight extends Rect { kind: 'flight'; y0: number; rise: number; dir: 'x+' | 'x-' | 'z+' | 'z-'; rails: Side[] }
/** A flat landing (or deck) at height `y`. */
export interface Landing extends Rect { kind: 'landing'; y: number; rails: Side[] }
/** A railing on its own (round the stair hole in a deck). */
export interface Rail { kind: 'rail'; x0: number; z0: number; x1: number; z1: number; y: number }
export type Piece = Flight | Landing | Rail;

/** Railings are this high above the step: higher than you can jump. */
export const RAIL_H = 1.2;
const RAIL_T = 0.08;
const STEP_RISE = 0.19;

/** The steps of a flight: each one's rectangle and the height of its top. */
export function treads(f: Flight): (Rect & { y: number })[] {
  const n = Math.max(1, Math.ceil(f.rise / STEP_RISE - 1e-6));
  const out: (Rect & { y: number })[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n, y = f.y0 + (f.rise * (i + 1)) / n;
    const lx = (t: number) => (f.dir === 'x+' ? f.x0 + t * (f.x1 - f.x0) : f.x1 - t * (f.x1 - f.x0));
    const lz = (t: number) => (f.dir === 'z+' ? f.z0 + t * (f.z1 - f.z0) : f.z1 - t * (f.z1 - f.z0));
    if (f.dir[0] === 'x') out.push({ x0: Math.min(lx(a), lx(b)), x1: Math.max(lx(a), lx(b)), z0: f.z0, z1: f.z1, y });
    else out.push({ x0: f.x0, x1: f.x1, z0: Math.min(lz(a), lz(b)), z1: Math.max(lz(a), lz(b)), y });
  }
  return out;
}

/** A thin rail box along side `s` of `r`, just inside it, from `y` up RAIL_H. */
function railBox(r: Rect, s: Side, y: number): Box {
  const t = RAIL_T;
  if (s === 'x0') return { x0: r.x0, x1: r.x0 + t, z0: r.z0, z1: r.z1, y0: y, y1: y + RAIL_H, mat: 'none' };
  if (s === 'x1') return { x0: r.x1 - t, x1: r.x1, z0: r.z0, z1: r.z1, y0: y, y1: y + RAIL_H, mat: 'none' };
  if (s === 'z0') return { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z0 + t, y0: y, y1: y + RAIL_H, mat: 'none' };
  return { x0: r.x0, x1: r.x1, z0: r.z1 - t, z1: r.z1, y0: y, y1: y + RAIL_H, mat: 'none' };
}

/** The solid boxes for the pieces: steps (30 cm thick), landings, and the railings. */
export function stairBoxes(pieces: Piece[]): Box[] {
  const out: Box[] = [];
  for (const p of pieces) {
    if (p.kind === 'flight') {
      for (const t of treads(p)) {
        out.push({ ...t, y0: Math.max(0, t.y - 0.3), y1: t.y, mat: 'none' });
        for (const s of p.rails) out.push(railBox(t, s, t.y));
      }
    } else if (p.kind === 'landing') {
      if (p.y > 0) out.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, y0: p.y - 0.15, y1: p.y, mat: 'none' });
      for (const s of p.rails) out.push(railBox(p, s, p.y));
    } else {
      const h = RAIL_T / 2;
      out.push({ x0: Math.min(p.x0, p.x1) - h, x1: Math.max(p.x0, p.x1) + h, z0: Math.min(p.z0, p.z1) - h, z1: Math.max(p.z0, p.z1) + h, y0: p.y, y1: p.y + RAIL_H, mat: 'none' });
    }
  }
  return out;
}

interface TowerSpot { x: number; z: number; w: number; top: number }

/**
 * Square stairs going up round the inside edge of a tower, a flight along each side and a landing in each
 * corner, ending on the deck. You start in the south-west corner, go east along the south side, then north
 * up the east side, and so on; the last flight comes up the east side through a hole in the deck.
 */
export function spiralStairs(t: TowerSpot, flights: number): Piece[] {
  const h = t.w / 2, lw = 1.1, rise = t.top / flights;
  const X0 = t.x - h, X1 = t.x + h, Z0 = t.z - h, Z1 = t.z + h;
  const corner = { sw: [X0, Z0], se: [X1 - lw, Z0], ne: [X1 - lw, Z1 - lw], nw: [X0, Z1 - lw] } as const;
  const sides = [
    { from: 'sw', to: 'se', r: { x0: X0 + lw, x1: X1 - lw, z0: Z0, z1: Z0 + lw }, dir: 'x+', out: 'z0', inn: 'z1' },
    { from: 'se', to: 'ne', r: { x0: X1 - lw, x1: X1, z0: Z0 + lw, z1: Z1 - lw }, dir: 'z+', out: 'x1', inn: 'x0' },
    { from: 'ne', to: 'nw', r: { x0: X0 + lw, x1: X1 - lw, z0: Z1 - lw, z1: Z1 }, dir: 'x-', out: 'z1', inn: 'z0' },
    { from: 'nw', to: 'sw', r: { x0: X0, x1: X0 + lw, z0: Z0 + lw, z1: Z1 - lw }, dir: 'z-', out: 'x0', inn: 'x1' },
  ] as const;
  // The corners' outside edges.
  const outer: Record<string, Side[]> = { sw: ['x0', 'z0'], se: ['x1', 'z0'], ne: ['x1', 'z1'], nw: ['x0', 'z1'] };
  const cornerRect = (c: keyof typeof corner): Rect => ({ x0: corner[c][0], x1: corner[c][0] + lw, z0: corner[c][1], z1: corner[c][1] + lw });
  const out: Piece[] = [];
  // So the last flight is the east side, start where that works out.
  const first = (((1 - (flights - 1)) % 4) + 4) % 4;
  // The bottom corner, open on its outside so you can walk in.
  out.push({ kind: 'landing', ...cornerRect(sides[first].from), y: 0, rails: [] });
  for (let i = 0; i < flights; i++) {
    const s = sides[(first + i) % 4];
    out.push({ kind: 'flight', ...s.r, y0: i * rise, rise, dir: s.dir, rails: [s.out, s.inn] });
    if (i < flights - 1) out.push({ kind: 'landing', ...cornerRect(s.to), y: (i + 1) * rise, rails: outer[s.to] });
  }
  // The deck: everything but the east strip (the stair hole), plus the two east corners.
  const top = t.top;
  out.push({ kind: 'landing', x0: X0, x1: X1 - lw, z0: Z0, z1: Z1, y: top, rails: ['x0', 'z0', 'z1'] });
  out.push({ kind: 'landing', ...cornerRect('ne'), y: top, rails: ['x1', 'z1'] });
  out.push({ kind: 'landing', ...cornerRect('se'), y: top, rails: ['x1', 'z0', 'z1'] });
  // Round the hole, on the deck side.
  out.push({ kind: 'rail', x0: X1 - lw - 0.05, z0: Z0 + lw, x1: X1 - lw - 0.05, z1: Z1 - lw, y: top });
  return out;
}

/**
 * Switchback stairs on the north face of a tower (outside it): two lanes side by side, flights going east
 * in the inner lane and west in the outer one, with landings across both lanes at each end. You start at
 * the west end and come out at the west end of the deck.
 */
export function switchbackStairs(t: TowerSpot, flights: number): Piece[] {
  const h = t.w / 2, rise = t.top / flights, lane = 1.0, end = 1.0, len = 2.4;
  const zA = t.z + h, zB = zA + lane, zC = zB + lane;
  const xW = t.x - len / 2 - end, xa = t.x - len / 2, xb = t.x + len / 2, xE = xb + end;
  const out: Piece[] = [];
  out.push({ kind: 'landing', x0: xW, x1: xa, z0: zA, z1: zC, y: 0, rails: ['z0', 'z1'] });
  for (let i = 0; i < flights; i++) {
    const inner = i % 2 === 0, y = (i + 1) * rise;
    out.push(inner
      ? { kind: 'flight', x0: xa, x1: xb, z0: zA, z1: zB, y0: i * rise, rise, dir: 'x+', rails: ['z0', 'z1'] }
      : { kind: 'flight', x0: xa, x1: xb, z0: zB, z1: zC, y0: i * rise, rise, dir: 'x-', rails: ['z0', 'z1'] });
    const last = i === flights - 1;
    if (inner) out.push({ kind: 'landing', x0: xb, x1: xE, z0: zA, z1: zC, y, rails: ['x1', 'z0', 'z1'] });
    // The top landing opens onto the deck (its tower side).
    else out.push({ kind: 'landing', x0: xW, x1: xa, z0: zA, z1: zC, y, rails: last ? ['x0', 'z1'] : ['x0', 'z0', 'z1'] });
  }
  // The deck, open where the top landing meets it.
  out.push({ kind: 'landing', x0: t.x - h, x1: t.x + h, z0: t.z - h, z1: zA, y: t.top, rails: ['x0', 'x1', 'z0'] });
  out.push({ kind: 'rail', x0: xa, z0: zA - 0.05, x1: t.x + h, z1: zA - 0.05, y: t.top });
  // No flight leaves the top landing up the inner lane, so rail it off (it's a drop to the flight below).
  out.push({ kind: 'rail', x0: xa + 0.05, z0: zA, x1: xa + 0.05, z1: zB, y: t.top });
  return out;
}

// ---------------------------------------------------------------- steering round the corners

/** A route up a set of stairs: the centre line through the flights and landings, bottom to top. */
interface Route { pts: [number, number, number][]; cum: number[] }
const routes: Route[] = [];

/** Remember a set of stairs so `stairGuide` can steer people up and down it. */
export function registerStairs(pieces: Piece[]) {
  const ends = (f: Flight) => {
    const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
    const lo: [number, number] = f.dir === 'x+' ? [f.x0, cz] : f.dir === 'x-' ? [f.x1, cz] : f.dir === 'z+' ? [cx, f.z0] : [cx, f.z1];
    const hi: [number, number] = f.dir === 'x+' ? [f.x1, cz] : f.dir === 'x-' ? [f.x0, cz] : f.dir === 'z+' ? [cx, f.z1] : [cx, f.z0];
    const d: [number, number] = f.dir === 'x+' ? [1, 0] : f.dir === 'x-' ? [-1, 0] : f.dir === 'z+' ? [0, 1] : [0, -1];
    return { lo, hi, d };
  };
  const pts: [number, number, number][] = [];
  let prev: Flight | null = null, landing: Landing | null = null;
  for (const p of pieces) {
    if (p.kind === 'landing') landing = prev ? p : null;
    if (p.kind !== 'flight') continue;
    const e = ends(p);
    if (prev && landing) {
      // Across the landing between two flights: carry on into its middle along the lane you came up, then
      // go to the lane of the next flight (a corner, or a U-turn that keeps clear of the rail between).
      const a = ends(prev), y = landing.y;
      const depth = (s: [number, number]) => (s[0] ? landing!.x1 - landing!.x0 : landing!.z1 - landing!.z0) / 2;
      pts.push([a.hi[0] + a.d[0] * depth(a.d), y, a.hi[1] + a.d[1] * depth(a.d)]);
      pts.push([e.lo[0] - e.d[0] * depth(e.d), y, e.lo[1] - e.d[1] * depth(e.d)]);
    }
    pts.push([e.lo[0], p.y0, e.lo[1]], [e.hi[0], p.y0 + p.rise, e.hi[1]]);
    prev = p;
    landing = null;
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
  routes.push({ pts, cum });
}

/** How far ahead along the stairs to aim (m): far enough to go round a corner smoothly. */
const LOOK = 0.9;

/**
 * On the stairs and heading roughly up or down them (unit direction `dx`, `dz`)? Then the way to go: towards
 * a point a little further along the stairs' centre line, which takes you round the corners and keeps you in
 * the middle. `prefer` is the way you were going (1 up, -1 down): round a corner the camera still points at the
 * railing, so a push that's neither up nor down keeps going that way; `force` keeps going that way whatever
 * (the stick is pushed forward: "keep going", even after a U-turn the camera hasn't caught up with). Null when you're not on the stairs,
 * walking off the top or bottom end, or (not already going) straight across.
 */
export function stairGuide(x: number, y: number, z: number, dx: number, dz: number, prefer: 1 | -1 | 0 = 0, force = false): { dir: [number, number]; way: 1 | -1 } | null {
  let best: { r: Route; s: number; d: number; tx: number; tz: number } | null = null;
  for (const r of routes) {
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      const ex = b[0] - a[0], ez = b[2] - a[2], len = Math.hypot(ex, ez);
      if (len < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[2]) * ez) / (len * len)));
      const d = Math.hypot(a[0] + ex * t - x, a[2] + ez * t - z);
      if (d > 0.75 || Math.abs(a[1] + (b[1] - a[1]) * t - y) > 0.6) continue;
      if (!best || d < best.d) best = { r, s: r.cum[i - 1] + len * t, d, tx: ex / len, tz: ez / len };
    }
  }
  if (!best) return null;
  const { r } = best;
  const end = r.cum[r.cum.length - 1];
  /** The unit direction from here to the point `s` along the route (or null right on top of it). */
  const toward = (s: number): [number, number] | null => {
    let i = 1;
    while (i < r.cum.length - 1 && r.cum[i] < s) i++;
    const a = r.pts[i - 1], b = r.pts[i], f = (s - r.cum[i - 1]) / Math.max(1e-6, r.cum[i] - r.cum[i - 1]);
    const gx = a[0] + (b[0] - a[0]) * f - x, gz = a[2] + (b[2] - a[2]) * f - z, gl = Math.hypot(gx, gz);
    return gl < 1e-6 ? null : [gx / gl, gz / gl];
  };
  // Up or down, whichever is nearer the way the stick points (round a corner the camera hasn't caught up yet).
  const up = best.s + LOOK <= end ? toward(best.s + LOOK) : null;
  const down = best.s - LOOK >= 0 ? toward(best.s - LOOK) : null;
  const du = up ? up[0] * dx + up[1] * dz : -2, dd = down ? down[0] * dx + down[1] * dz : -2;
  // Near the top or bottom end, heading off it: straight on, off the stairs (then it's free walking).
  const along = best.tx * dx + best.tz * dz;
  const keep = force && prefer ? prefer : 0;
  if (best.s + LOOK > end && (keep > 0 || (!keep && along > 0.35))) return { dir: [best.tx, best.tz], way: 1 };
  if (best.s - LOOK < 0 && (keep < 0 || (!keep && along < -0.35))) return { dir: [-best.tx, -best.tz], way: -1 };
  let way: 1 | -1 = du >= dd ? 1 : -1;
  if (prefer && (force || Math.max(du, dd) < 0.4)) way = prefer;
  else if (Math.max(du, dd) < 0.1) return null;
  const dir = way > 0 ? up : down;
  return dir ? { dir, way } : null;
}
