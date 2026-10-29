// San Francisco: an island city in a bay, in the desert between RT 8, RT 4 and RT 3
// (pure data, no three.js / Rapier). outer.ts makes it a town (its streets, and the roads
// in from RT 8 and RT 3); this file has its shape and its roads in the sky.
//
// A bridge like Boston's Zakim bridge runs right across, from RT 8 in the west to RT 3
// in the east: over the water, high over the city (a level deck 40 m up), and over the
// water again. Seven exits come off it down into the city, each its own ride: round and
// round a tower (1), round and up and down (2), side to side (3), straight off sideways
// (4), up down up down (5), a slalom (6), and a tunnel under the bay to Crunch Labs (7).
//
// City coordinates: `a` east, `b` south of the middle of the island (SF_AT).
import { clamp, lerp, smoothstep, type Vec2 } from '../util/math';

/** The middle of the island (world x, z). */
export const SF_AT: Vec2 = [-1420, 2750];
/** Ground level of the island, the bay's water, and how deep the bay is. */
export const SF_LEVEL = -9;
export const BAY_LEVEL = -11.5;
export const BAY_DEPTH = 7;
/** The island: half-size along a and b, and how round its corners are. */
export const ISLAND = { a: 340, b: 330, r: 100 };
/** How wide the water is round the island, and how far the land takes to blend back beyond it. */
export const BAY = { w: 170, blend: 200 };
/** Height of the bridge deck over the city (taller than any building under it). */
export const DECK = SF_LEVEL + 40;
export const BRIDGE_HW = 13;
export const EXIT_HW = 6;
/**
 * Where the bridge comes down to the land at each end (city a), meeting the roads in.
 * (The west end curves round to meet RT 8 square on; `buildSky` says where its foot is.)
 */
export const BRIDGE_FEET = { w: -620, e: 660 };
/** The bridge is level for this far either side of the middle. */
const LEVEL_A = 300;
/** The two towers stand in the water this far either side of the middle. */
export const TOWER_A = 425;
/** Crunch Labs: the yard at the end of the tunnel, on the far (south) shore of the bay. */
export const CRUNCH = { a0: 40, a1: 260, b0: 640, b1: 770, blend: 80 };
/** The tunnel runs south along this `a`. */
export const TUNNEL_A = 150;
/** The ring street round the island (inset from the shore). */
export const RING_ST = { a: 318, b: 308, r: 78, hw: 6 };
/** The cross streets (b), north and south of Market Street. */
export const CROSS_B = 180;

export const sfPoint = (a: number, b: number): Vec2 => [SF_AT[0] + a, SF_AT[1] + b];
export const sfCoords = (x: number, z: number) => ({ a: x - SF_AT[0], b: z - SF_AT[1] });

/** Distance outside the island's shore (negative inside). */
export function islandEdge(x: number, z: number) {
  const qa = Math.abs(x - SF_AT[0]) - (ISLAND.a - ISLAND.r), qb = Math.abs(z - SF_AT[1]) - (ISLAND.b - ISLAND.r);
  return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - ISLAND.r;
}

/** The bay's bed `e` m out from the shore: down from the island, a level floor, up to the far bank. */
function bayBed(e: number) {
  const floor = BAY_LEVEL - BAY_DEPTH;
  if (e < BAY.w / 2) return lerp(SF_LEVEL, floor, smoothstep(0, 30, e));
  return lerp(floor, BAY_LEVEL + 1.5, smoothstep(BAY.w - 30, BAY.w, e));
}

/** How deep the bay's water is at a spot (0 on dry land). */
export function bayDepth(x: number, z: number) {
  const e = islandEdge(x, z);
  if (e <= 0 || e >= BAY.w) return 0;
  return Math.max(0, BAY_LEVEL - bayBed(e));
}

const inYard = (a: number, b: number, m = 0) => a > CRUNCH.a0 - m && a < CRUNCH.a1 + m && b > CRUNCH.b0 - m && b < CRUNCH.b1 + m;
const outsideYard = (a: number, b: number) => Math.hypot(Math.max(0, CRUNCH.a0 - a, a - CRUNCH.a1), Math.max(0, CRUNCH.b0 - b, b - CRUNCH.b1));

/** Is a spot on San Francisco's ground (the island or the Crunch Labs yard)? */
export function onSFGround(x: number, z: number, m = 0) {
  const { a, b } = sfCoords(x, z);
  return islandEdge(x, z) < m || inYard(a, b, m);
}

/**
 * Shape the land for San Francisco (before the roads pull it to themselves): the level
 * island, the bay round it, the land blending back beyond, and the level Crunch Labs yard.
 */
export function shapeSF(x: number, z: number, h: number) {
  const { a, b } = sfCoords(x, z);
  if (Math.abs(a) > 1000 || b < -1000 || b > 1100) return h;
  const e = islandEdge(x, z);
  if (e <= 0) h = SF_LEVEL;
  else if (e < BAY.w) h = bayBed(e);
  else if (e < BAY.w + BAY.blend) h = lerp(BAY_LEVEL + 1.5, h, smoothstep(BAY.w, BAY.w + BAY.blend, e));
  // The yard (and the land between it and the bay, over the tunnel).
  const out = Math.min(outsideYard(a, b), Math.hypot(Math.max(0, Math.abs(a - TUNNEL_A) - 40), Math.max(0, 470 - b, b - CRUNCH.b0)));
  if (out < CRUNCH.blend && e > BAY.w - 2) h = lerp(SF_LEVEL, h, smoothstep(0, CRUNCH.blend, out));
  return h;
}

/** The ground over the tunnel before it's dug (island, bay bed or the yard's level). */
export function groundOver(x: number, z: number) {
  const e = islandEdge(x, z);
  return e <= 0 || e >= BAY.w ? SF_LEVEL : bayBed(e);
}

// ---------------------------------------------------------------- roads in the sky

/** A road up in the air (the bridge, the exits): its centre line, and the road height and half-width at each point. */
export interface SkyRoad {
  name: string;
  kind: 'bridge' | 'exit';
  /** Exits: their number (1 to 7). */
  n: number;
  pts: Vec2[];
  ys: number[];
  ws: number[];
  /** Up off the ground here (the route finder only joins roads at the same height). */
  air: boolean[];
  /** Point ranges [i0, i1] with no barrier, on the left (+1, towards (−uz, ux)) and the right (−1). */
  gaps: { side: number; i0: number; i1: number }[];
  /** A helix's middle and radius (a tower stands in it). */
  helix?: { x: number; z: number; r: number };
  x0: number; z0: number; x1: number; z1: number;
}

/** Point spacing along the exits (m). */
const STEP = 3;

/** Draws a path in city coordinates: straight runs, arcs and wiggles, starting at a spot heading (ua, ub). */
class Turtle {
  readonly pts: Vec2[];
  constructor(private a: number, private b: number, private ua: number, private ub: number) {
    this.pts = [[a, b]];
  }
  private push(a: number, b: number) {
    this.pts.push([a, b]);
    this.a = a;
    this.b = b;
  }
  line(len: number) {
    const n = Math.max(1, Math.ceil(len / STEP)), a0 = this.a, b0 = this.b;
    for (let k = 1; k <= n; k++) this.push(a0 + (this.ua * len * k) / n, b0 + (this.ub * len * k) / n);
    return this;
  }
  /** Turn by `turn` radians (positive turns from +a towards +b) on a circle of radius r. */
  arc(r: number, turn: number) {
    const s = Math.sign(turn), n = Math.max(2, Math.ceil((Math.abs(turn) * r) / STEP));
    const ca = this.a - this.ub * s * r, cb = this.b + this.ua * s * r;
    const va = this.a - ca, vb = this.b - cb, ua = this.ua, ub = this.ub;
    for (let k = 1; k <= n; k++) {
      const p = (turn * k) / n, c = Math.cos(p), sn = Math.sin(p);
      this.push(ca + va * c - vb * sn, cb + va * sn + vb * c);
    }
    const c = Math.cos(turn), sn = Math.sin(turn);
    this.ua = ua * c - ub * sn;
    this.ub = ua * sn + ub * c;
    return this;
  }
  /** Move `len` along while sliding `side` m sideways (towards the way a positive turn goes). */
  shift(len: number, side: number) {
    const n = Math.max(2, Math.ceil(len / STEP)), a0 = this.a, b0 = this.b;
    const la = -this.ub, lb = this.ua;
    for (let k = 1; k <= n; k++) {
      const t = k / n, o = side * smoothstep(0, 1, t);
      this.push(a0 + this.ua * len * t + la * o, b0 + this.ub * len * t + lb * o);
    }
    return this;
  }
  /** Snake along `len`, swinging `amp` m either side every `wave` m (eased in and out). */
  wiggle(len: number, amp: number, wave: number) {
    const n = Math.max(2, Math.ceil(len / 2)), a0 = this.a, b0 = this.b;
    const la = -this.ub, lb = this.ua;
    for (let k = 1; k <= n; k++) {
      const s = (len * k) / n, o = amp * Math.sin((2 * Math.PI * s) / wave) * smoothstep(0, 25, s) * smoothstep(0, 25, len - s);
      this.push(a0 + this.ua * s + la * o, b0 + this.ub * s + lb * o);
    }
    return this;
  }
  /** A smooth curve through points (Catmull-Rom), leaving the way we're heading. */
  through(ctrl: Vec2[]) {
    const P: Vec2[] = [[this.a - this.ua * 30, this.b - this.ub * 30], [this.a, this.b], ...ctrl];
    const last = P[P.length - 1], prev = P[P.length - 2];
    P.push([last[0] * 2 - prev[0], last[1] * 2 - prev[1]]);
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
      for (let k = 1; k <= n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (q0: number, q1: number, q2: number, q3: number) =>
          0.5 * (2 * q1 + (-q0 + q2) * t + (2 * q0 - 5 * q1 + 4 * q2 - q3) * t2 + (-q0 + 3 * q1 - 3 * q2 + q3) * t3);
        this.push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
      }
    }
    const dl = Math.hypot(last[0] - prev[0], last[1] - prev[1]) || 1;
    this.ua = (last[0] - prev[0]) / dl;
    this.ub = (last[1] - prev[1]) / dl;
    return this;
  }
}

/** Cumulative distance along points. */
function arcLengths(pts: readonly Vec2[]) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return s;
}

/** Average heights over ±`w` m (rounds off kinks), keeping the first `keep` m and the ends as they are. */
function smoothHeights(ys: number[], s: number[], w: number, keep: number) {
  const out = ys.slice();
  for (let i = 0; i < ys.length; i++) {
    if (s[i] <= keep || i === ys.length - 1) continue;
    let sum = 0, c = 0;
    for (let j = i; j >= 0 && s[i] - s[j] <= w; j--) (sum += ys[j]), c++;
    for (let j = i + 1; j < ys.length && s[j] - s[i] <= w; j++) (sum += ys[j]), c++;
    out[i] = sum / c;
  }
  return out;
}

function bboxOf(pts: readonly Vec2[]) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
  return { x0, z0, x1, z1 };
}

/** Bridge deck height at city `a` (yW, yE: the roads in at the feet). */
export function bridgeHeight(a: number, yW: number, yE: number) {
  if (a < 0) return lerp(yW, DECK, smoothstep(BRIDGE_FEET.w, -LEVEL_A, a));
  return lerp(yE, DECK, 1 - smoothstep(LEVEL_A, BRIDGE_FEET.e, a));
}

/** Length of each exit's run alongside the bridge before it peels off (level, at deck height). */
const DIVERGE = 70;
/** Exits start in the bridge's outer lane and end just clear of its edge. */
const EXIT_B0 = BRIDGE_HW - EXIT_HW, EXIT_B1 = BRIDGE_HW + EXIT_HW;

interface ExitPlan {
  n: number;
  name: string;
  /** Start (city a), and which side of the bridge (+1 south, −1 north); south exits head east, north ones west. */
  a: number;
  side: number;
  path: (t: Turtle) => void;
  /** Extra height along the way (u: 0..1 over the descent, s: metres from the start). */
  bumps?: (u: number, s: number, pts: Vec2[]) => number;
  /** Where the descent reaches the ground, as metres from the end (the rest is level). */
  flatEnd: number;
  /** Ends this far below the island (the tunnel), else at the island's level. */
  below?: number;
  helix?: [number, number, number];
}

const TURN = Math.PI / 2;
/** Helix radii. */
const H1 = 38, H2 = 40;

/** The tunnel's profile along b: down from the island (%), under the bay, up into the yard (from b = flat1). */
export const TUNNEL = { down: 15, floor: BAY_LEVEL - BAY_DEPTH - 9.5, flat1: 510, up: 0.13 };
/** Where (city b) the tunnel exit reaches the ground on its way down. */
let tunnelB0 = 250;

const EXITS: ExitPlan[] = [
  {
    // Round and round: a helix two and a quarter times round a tower.
    n: 1, name: 'Round & Round', a: -300, side: 1, flatEnd: 0,
    path: (t) => t.arc(H1, 4.5 * Math.PI),
    helix: [-230, EXIT_B1 + H1, H1],
  },
  {
    // Round and up and down: a helix with hills on it.
    n: 2, name: 'Loopy Hills', a: 300, side: -1, flatEnd: 0,
    path: (t) => t.arc(H2, 4.5 * Math.PI),
    bumps: (u) => 2.2 * Math.sin(2 * Math.PI * 8 * u) * smoothstep(0, 0.06, u) * smoothstep(0, 0.1, 1 - u),
    helix: [230, -EXIT_B1 - H2, H2],
  },
  {
    // Side to side: a snake.
    n: 3, name: 'Wiggle Way', a: -150, side: 1, flatEnd: 12,
    path: (t) => t.arc(40, TURN).wiggle(212, 10, 53).line(4),
  },
  {
    // Just sideways: off the side and straight down.
    n: 4, name: 'Sideways', a: 160, side: -1, flatEnd: 12,
    path: (t) => t.arc(40, TURN).line(203),
  },
  {
    // Up down up down.
    n: 5, name: 'Roller Coaster', a: 20, side: -1, flatEnd: 12,
    path: (t) => t.arc(40, TURN).line(203),
    bumps: (u) => 2.5 * Math.sin(2 * Math.PI * 3 * u) * smoothstep(0, 0.08, u) * smoothstep(0, 0.08, 1 - u),
  },
  {
    // Slalom: up to one side, turn, up to the other side, turn…
    n: 6, name: 'Slalom', a: -110, side: -1, flatEnd: 10,
    path: (t) => t.arc(40, TURN).through([[-222, -80], [-272, -112], [-168, -160], [-272, -208], [-210, -250], [-210, -265]]),
    bumps: (_u, s, pts) => {
      // Up at each turn (the points furthest out to either side).
      let y = 0;
      for (const apex of SLALOM_APEXES) {
        const k = nearestIndex(pts, apex);
        y += 3.5 * Math.exp(-(((s - k.s) / 16) ** 2));
      }
      return y;
    },
  },
  {
    // The tunnel to Crunch Labs: off the side, down to the ground and under it, under the
    // bay, and up into the Crunch Labs yard on the far shore.
    n: 7, name: 'Crunch Labs', a: 40, side: 1, flatEnd: 0, below: 0,
    path: (t) => t.arc(40, TURN).line(CRUNCH.b0 + 28 - (EXIT_B1 + 40)),
  },
];
const SLALOM_APEXES: Vec2[] = [[-272, -112], [-168, -160], [-272, -208]];

/** The point of a city-coordinate path nearest a spot, and how far along it is. */
function nearestIndex(pts: Vec2[], p: Vec2) {
  const s = arcLengths(pts);
  let best = 0, bd = Infinity;
  pts.forEach(([a, b], i) => {
    const d = Math.hypot(a - p[0], b - p[1]);
    if (d < bd) (bd = d), (best = i);
  });
  return { i: best, s: s[best] };
}

/** Road height along the tunnel exit once it's at the ground (by b, south of the bridge). */
function tunnelHeight(b: number, b0: number) {
  const { down, floor, flat1, up } = TUNNEL;
  // Down at `down` % from the ground at b0, along the floor, and up to the yard.
  const d = SF_LEVEL - ((b - b0) * down) / 100;
  const u = floor + (b - flat1) * up;
  return Math.min(SF_LEVEL, Math.max(d, u, floor));
}

function makeExit(e: ExitPlan): SkyRoad {
  const dir = e.side; // south exits head east (+a), north ones west (−a)
  const t = new Turtle(e.a, e.side * EXIT_B0, dir, 0);
  t.shift(DIVERGE, EXIT_B1 - EXIT_B0);
  e.path(t);
  const cp = t.pts;
  const s = arcLengths(cp), S = s[s.length - 1];
  let ys: number[];
  if (e.n === 7) {
    // Down from the deck at 16% to the ground, then the tunnel's own profile.
    const bGround = cp.find((_, i) => s[i] > DIVERGE && DECK - (s[i] - DIVERGE) * 0.16 <= SF_LEVEL)?.[1] ?? 250;
    tunnelB0 = bGround;
    ys = cp.map(([, b], i) => (s[i] <= DIVERGE ? DECK : Math.max(DECK - (s[i] - DIVERGE) * 0.16, tunnelHeight(b, bGround))));
  } else {
    const s1 = S - e.flatEnd;
    ys = cp.map((_p, i) => {
      if (s[i] <= DIVERGE) return DECK;
      const u = clamp((s[i] - DIVERGE) / (s1 - DIVERGE), 0, 1);
      return SF_LEVEL + 40 * (1 - u) + (e.bumps ? e.bumps(u, s[i], cp) : 0);
    });
  }
  ys = smoothHeights(ys, s, 10, DIVERGE - 8);
  ys[ys.length - 1] = SF_LEVEL;
  const pts = cp.map(([a, b]) => sfPoint(a, b));
  const iDiv = s.findIndex((v) => v >= DIVERGE);
  const r: SkyRoad = {
    name: `Exit ${e.n}`, kind: 'exit', n: e.n, pts, ys, ws: pts.map(() => EXIT_HW),
    air: ys.map((y, i) => y > SF_LEVEL + 3 || (e.n === 7 && y < SF_LEVEL - 3 && i > iDiv)),
    // No barrier between the exit and the bridge while it runs alongside.
    gaps: [{ side: -1, i0: 0, i1: iDiv }],
    ...bboxOf(pts),
  };
  if (e.helix) {
    const [x, z] = sfPoint(e.helix[0], e.helix[1]);
    r.helix = { x, z, r: e.helix[2] };
  }
  return r;
}
/** The bridge's west foot (city coordinates) and the way it heads from there (towards the island). */
export interface Foot { a: number; b: number; ua: number; ub: number }

/** The bridge's west end curves from its foot round to run due east; this is the curve's radius. */
export const footRadius = (f: Foot) => f.b / (1 - f.ua);

function makeBridge(yW: number, yE: number, foot: Foot): SkyRoad {
  // From the west foot, round to due east, then straight across to the east foot.
  const t = new Turtle(foot.a, foot.b, foot.ua, foot.ub);
  const turn = -Math.atan2(foot.ub, foot.ua);
  if (turn > 0.01) t.arc(footRadius(foot), turn);
  const cp = t.line(BRIDGE_FEET.e - t.pts[t.pts.length - 1][0]).pts;
  const s = arcLengths(cp), S = s[s.length - 1];
  const pts = cp.map(([a, b]) => sfPoint(a, b));
  const ys = cp.map(([a]) => bridgeHeight(a, yW, yE));
  // Narrower where it meets the roads in.
  const ws = s.map((v) => lerp(7, BRIDGE_HW, smoothstep(0, 70, Math.min(v, S - v))));
  const at = (a: number) => {
    let best = 0;
    cp.forEach(([pa], i) => {
      if (Math.abs(pa - a) < Math.abs(cp[best][0] - a)) best = i;
    });
    return best;
  };
  const gaps: SkyRoad['gaps'] = [];
  for (const e of EXITS) {
    // (Heading east the bridge's left, (−uz, ux), is south.)
    const a1 = e.a + e.side * DIVERGE;
    gaps.push({ side: e.side, i0: at(Math.min(e.a, a1)) - 1, i1: at(Math.max(e.a, a1)) + 1 });
  }
  return { name: 'Bridge', kind: 'bridge', n: 0, pts, ys, ws, gaps, air: s.map((v) => Math.min(v, S - v) > 50), ...bboxOf(pts) };
}

/** Where the bridge's centre line is (city b) at city `a` (it's south of the middle line only on its west curve). */
export function bridgeB(a: number) {
  const r = SKY[0];
  if (!r || a >= -LEVEL_A) return 0;
  const p = r.pts;
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p[m][0] - SF_AT[0] < a) lo = m;
    else hi = m;
  }
  const a0 = p[lo][0] - SF_AT[0], a1 = p[hi][0] - SF_AT[0];
  return lerp(p[lo][1], p[hi][1], clamp((a - a0) / (a1 - a0 || 1), 0, 1)) - SF_AT[1];
}

/** Every road in the sky: the bridge first, then the exits in order (filled in by `buildSky`). */
export const SKY: SkyRoad[] = [];
export const EXIT_NAMES = EXITS.map((e) => e.name);

/** Lay out the bridge and its exits, once the west foot and the heights of the roads in at the feet are known. */
export function buildSky(yW: number, yE: number, foot: Foot) {
  BRIDGE_FEET.w = foot.a;
  SKY.length = 0;
  SKY.push(makeBridge(yW, yE, foot), ...EXITS.map(makeExit));
  skyBuckets.clear();
  SKY.forEach((r, ri) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [a, b] = [r.pts[i], r.pts[i + 1]];
      const pad = r.ws[i] + 4;
      for (let ix = Math.floor((Math.min(a[0], b[0]) - pad) / SB); ix <= Math.floor((Math.max(a[0], b[0]) + pad) / SB); ix++)
        for (let iz = Math.floor((Math.min(a[1], b[1]) - pad) / SB); iz <= Math.floor((Math.max(a[1], b[1]) + pad) / SB); iz++) {
          const k = ix * 100003 + iz;
          let l = skyBuckets.get(k);
          if (!l) skyBuckets.set(k, (l = []));
          l.push(ri * 65536 + i);
        }
    }
  });
}

const SB = 32;
const skyBuckets = new Map<number, number[]>();

/** Calls `f` for every stretch of sky road whose deck is over a spot: its road height there and how far in from its edge. */
export function forSkyAt(x: number, z: number, f: (r: SkyRoad, y: number, inside: number, i: number) => void) {
  for (const e of skyBuckets.get(Math.floor(x / SB) * 100003 + Math.floor(z / SB)) ?? []) {
    const r = SKY[e >> 16], i = e & 0xffff;
    const [a, b] = [r.pts[i], r.pts[i + 1]];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const inside = lerp(r.ws[i], r.ws[i + 1], t) - Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (inside >= -0.5) f(r, lerp(r.ys[i], r.ys[i + 1], t), inside, i);
  }
}

/** Is there a sky road's deck at this spot, at about this height? */
export function skyRoadAt(x: number, z: number, y: number) {
  let on = false;
  forSkyAt(x, z, (_r, ry) => {
    if (y > ry - 1.5 && y < ry + 2) on = true;
  });
  return on;
}

/** The tunnel exit (7). */
export const tunnelRoad = () => SKY[SKY.length - 1];
/** Where (city b) the tunnel exit reaches the ground on its way down. */
export const tunnelStart = () => tunnelB0;

/** Is a spot inside the tunnel (under the ground or the bay)? */
export function inTunnel(x: number, z: number, y: number) {
  const { a, b } = sfCoords(x, z);
  if (Math.abs(a - TUNNEL_A) > 9 || b < 150 || b > CRUNCH.b0 + 20) return false;
  return y < groundOver(x, z) - 1;
}

/** Dig the land out round the tunnel, and clear it from under the bridge's approaches (after the roads have shaped it). */
export function carveSF(x: number, z: number, h: number) {
  const { a, b } = sfCoords(x, z);
  if (Math.abs(a) > 1000 || b < -200 || b > 1000) return h;
  // The tunnel: a trench dug down to just under the road (the roof goes over it).
  const da = Math.abs(a - TUNNEL_A);
  if (da < 14 && b > 120 && b < CRUNCH.b0 + 30 && SKY.length) {
    const y = tunnelHeight(b, tunnelB0);
    if (y < h) h = lerp(Math.min(h, y - 1), h, smoothstep(12.5, 14, da));
  }
  // Under the bridge, near its feet: the land meets the deck; further in it's kept well below it.
  const db = b - (a < -LEVEL_A ? bridgeB(a) : 0);
  if (Math.abs(db) < BRIDGE_HW + 30 && SKY.length && a > BRIDGE_FEET.w - 10 && a < BRIDGE_FEET.e + 10) {
    const br = SKY[0];
    const deck = bridgeHeight(a, br.ys[0], br.ys[br.ys.length - 1]);
    const foot = Math.min(a - BRIDGE_FEET.w, BRIDGE_FEET.e - a);
    const target = deck - 0.3 - 9 * smoothstep(20, 80, foot);
    const w = 1 - smoothstep(BRIDGE_HW + 3, BRIDGE_HW + 30, Math.abs(db));
    if (foot < 60 || h > target) h = lerp(h, target, w * (foot < 60 ? 1 - smoothstep(40, 60, foot) : 1));
  }
  return h;
}
