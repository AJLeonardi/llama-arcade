// The water park's rides, laid out with PathBuilder. Designed by the kids:
// - Twister Tube: in a tube, side to side to side, a big drop, then up and down in a giant funnel.
// - Wolf Drop: stand in a capsule at the top of its tower, countdown, the floor drops: you plummet (airtime!),
//   then fast side to side to the end. You can lean for speed, within limits.
// - Flush Bowl: side to side, then round and round a giant toilet bowl, get flushed, a drop, and straight down.
// - Big Dipper: a big drop into a funnel, up and down, up and down, flushed out into a tube to the end.
// - Lazy River: float round in a tube.
// - The zip line at the end of the ropes course (in the adventure wing).
import { PathBuilder, pathSeg, surfaceFrom, wallSlope, DS, type RideDef, type SurfSeg } from './ride';
import { boxes, dips, pools, ROPES_HIGH, spots, type V3 } from './world';
import { spiralStairs, stairBoxes, switchbackStairs, type Piece } from './stairs';

/** A slide tower: a stair tower with a deck on top. */
export interface Tower { x: number; z: number; w: number; top: number; name: string }
export const TOWER: Tower = { x: -22, z: -40, w: 7, top: 18, name: 'Big Tower' };
export const DROP_TOWER: Tower = { x: 4, z: -46, w: 4, top: 18, name: 'Wolf Drop' };

/** Where each slide ends: its splash pool. */
export const SPLASH: { x0: number; x1: number; z0: number; z1: number; name: string }[] = [];

const RED = '#d8322f', YELLOW = '#f2b51c', BLUE = '#2a7fd4', GREEN = '#3ba55c', ORANGE = '#f07b22', PURPLE = '#7d4bc6';

function splash(x0: number, z0: number, x1: number, z1: number, name: string) {
  const p = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), depth: 1, name };
  pools.push(p);
  SPLASH.push(p);
}

/** A run-out at the bottom of a slide: level off, then into the splash pool. */
function runOut(b: PathBuilder, len: number, slope = 10) {
  b.downTo(1.2, slope);
  b.bend = 5;
  b.line(len, 2);
  return b;
}

// ---------------------------------------------------------------- Twister Tube

const funnelSpec = (R: number, depth: number, passes: number, color: string): Omit<SurfSeg, 'type' | 'cx' | 'cy' | 'cz'> => {
  const r0 = 1.7;
  // Height at the rim = depth: a(R - r0)² + b(R - r0) = depth.
  const b = 0.25;
  const a = (depth - b * (R - r0)) / (R - r0) ** 2;
  return { shape: 'funnel', r0, hole: 1.1, R, a, b, passes, color };
};

/** Down the hole in the middle of a funnel or bowl, then level out heading `yaw`. */
function outOf(s: SurfSeg, yawDeg: number, fall = 2) {
  const out = new PathBuilder(s.cx, s.cy - 0.2, s.cz, yawDeg, 82);
  out.bend = 3;
  out.line(fall, 82);
  out.bend = 4;
  return out;
}

const T = TOWER, TOP = TOWER.top + 1.0; // slide centre lines start a metre up, so their floors are level with the deck

function twister(): RideDef {
  // Out of the south side of the tower, then side to side to side.
  const b = new PathBuilder(T.x, TOP, T.z - T.w / 2, 180, 4);
  b.line(1.5, 5);
  b.through([-26, TOP - 1, -46.5], [-18.5, TOP - 2, -48.5], [-27, TOP - 3, -50.5], [-19, TOP - 4, -52.5], [-29, TOP - 5, -53.5], [-33, TOP - 5.6, -56], [-33, TOP - 5.9, -58]);
  const fs = funnelSpec(10, 10, 4, YELLOW);
  const rE = 5;
  // The big drop, at the slope of the funnel's wall where it goes in.
  b.bend = 4;
  b.line(5, wallSlope(fs, rE));
  const tube = pathSeg(b, 'tube', 0.85, RED);
  const funnel = surfaceFrom(b, fs, rE, 'across');
  const out = outOf(funnel, 90);
  runOut(out, 3);
  const end = out.pts[out.pts.length - 1];
  return {
    id: 'twister', name: 'Twister Tube', emoji: '🌪️', seat: 'tube', minV: 1.5, maxV: 11,
    segs: [tube, funnel, pathSeg(out, 'tube', 0.85, RED)],
    exit: exitBeside(end, out.yaw),
    blurb: 'Side to side to side in a tube, a big drop, then up and down in the giant funnel!',
  };
}

// ---------------------------------------------------------------- Big Dipper

function dipper(): RideDef {
  const b = new PathBuilder(T.x, TOP, T.z + T.w / 2, 0, 3);
  b.line(2, 4);
  b.through([-19.5, TOP - 0.6, -32.5], [-15, TOP - 1.2, -32]);
  const fs = funnelSpec(11, 11, 5, BLUE);
  const rE = 6;
  // The BIG drop, open to the sky.
  b.bend = 7;
  b.line(11, wallSlope(fs, rE));
  const drop = pathSeg(b, 'open', 1.1, BLUE);
  const funnel = surfaceFrom(b, fs, rE, 'across');
  // Flushed out into a tube.
  const out = outOf(funnel, 0);
  runOut(out, 3);
  const end = out.pts[out.pts.length - 1];
  return {
    id: 'dipper', name: 'Big Dipper', emoji: '🌊', seat: 'tube', minV: 1.5, maxV: 13,
    segs: [drop, funnel, pathSeg(out, 'tube', 0.9, GREEN)],
    exit: exitBeside(end, out.yaw),
    blurb: 'A giant drop into the funnel: up and down, up and down, then flushed out through the tube!',
  };
}

// ---------------------------------------------------------------- Flush Bowl

function bowl(): RideDef {
  const b = new PathBuilder(T.x - T.w / 2, TOP, T.z - 1, 270, 4);
  b.line(1.5, 6);
  b.through([-30, TOP - 0.8, -40], [-31.5, TOP - 1.6, -36], [-26.5, TOP - 2.6, -33], [-32, TOP - 3.6, -30], [-27, TOP - 4.6, -27], [-30.4, TOP - 6.8, -24], [-30.4, TOP - 7.6, -21]);
  const spec: Omit<SurfSeg, 'type' | 'cx' | 'cy' | 'cz'> = { shape: 'bowl', r0: 0.9, hole: 0.95, R: 6.5, a: 0.07, b: 0.08, passes: 0, color: PURPLE };
  const rE = 5.6;
  const tube = pathSeg(b, 'tube', 0.8, ORANGE);
  const bw = surfaceFrom(b, spec, rE, 'right');
  // Flushed: a drop straight down, then straight down the slide to the end.
  const out = outOf(bw, 0, 3);
  runOut(out, 4, 25);
  const end = out.pts[out.pts.length - 1];
  return {
    id: 'bowl', name: 'Flush Bowl', emoji: '🚽', seat: 'body', minV: 1.5, maxV: 10,
    segs: [tube, bw, pathSeg(out, 'open', 0.7, PURPLE)],
    exit: exitBeside(end, out.yaw),
    blurb: 'Side to side, round and round the giant toilet bowl, then FLUSH! A drop and straight down.',
  };
}

// ---------------------------------------------------------------- Wolf Drop (the drop capsule)

function wolfDrop(): RideDef {
  const D = DROP_TOWER;
  const b = new PathBuilder(D.x, D.top + 0.9, D.z, 180, 89); // your middle, standing on the trapdoor
  b.bend = 2;
  b.line(5, 89); // the floor drops: straight down
  b.bend = 9;
  b.line(8, 28);
  // Then very fast side to side.
  const y = b.y, fall = (f: number) => y - (y - 1.6) * f;
  b.through([D.x - 3, fall(0.4), D.z - 15], [D.x + 3, fall(0.65), D.z - 20], [D.x - 3, fall(0.86), D.z - 25], [D.x, fall(1), D.z - 29]);
  runOut(b, 2);
  const end = b.pts[b.pts.length - 1];
  return {
    id: 'drop', name: 'Wolf Drop', emoji: '🐺', seat: 'body', minV: 0, maxV: 16, countdown: 4,
    segs: [pathSeg(b, 'capsule', 0.75, GREEN)],
    exit: exitBeside(end, b.yaw),
    blurb: 'Stand in the capsule. 3, 2, 1... the floor drops! Plummet down, then zoom side to side.',
  };
}

// ---------------------------------------------------------------- Lazy River

/** The river's centre line: a wobbly loop on the east side of the park. */
export const RIVER_W = 4.6;
export const RIVER_DEPTH = 0.9;
function riverLine(): V3[] {
  const pts: V3[] = [];
  const cx = 28, cz = -42, rx = 11.5, rz = 30;
  const n = 600;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.12 * Math.sin(a * 3) + 0.05 * Math.sin(a * 5 + 1);
    pts.push([cx + Math.cos(a) * rx * wob, -0.05, cz + Math.sin(a) * rz * (1 + 0.04 * Math.cos(a * 4))]);
  }
  pts.push(pts[0]);
  // Re-space to DS.
  const out: V3[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1], p = pts[i];
    acc = Math.hypot(p[0] - a[0], p[2] - a[2]);
    if (acc >= DS) out.push(p);
  }
  return out;
}
export const RIVER = riverLine();

function nearRiver(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length; i += 2) {
    const p = RIVER[i];
    const d = (p[0] - x) ** 2 + (p[2] - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
dips.push({
  depthAt: (x, z) => {
    if (x < 12 || x > 44 || z < -76 || z > -8) return 0;
    return nearRiver(x, z) < RIVER_W / 2 ? RIVER_DEPTH : 0;
  },
});

/** Away from the island in the middle. */
function riverOut(p: V3): [number, number] {
  const dx = p[0] - 28, dz = p[2] + 42, l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

/** The river's two docks: where you get in. */
export const RIVER_DOCKS = [0, Math.floor(RIVER.length / 2)];

function river(at: number): RideDef {
  const pts = [...RIVER.slice(at), ...RIVER.slice(1, at + 1)];
  const p = RIVER[at];
  const [ox, oz] = riverOut(p);
  return {
    id: `river${at ? 2 : 1}`, name: 'Lazy River', emoji: '🛟', seat: 'tube', minV: 0, maxV: 2, loop: true,
    segs: [{ type: 'path', pts, style: 'river', radius: RIVER_W / 2, color: '#3aa6c9' }],
    exit: { x: p[0] + ox * 3.4, y: 0, z: p[2] + oz * 3.4, yaw: Math.atan2(ox, oz) },
    blurb: 'Float round and round. Paddle to go faster, steer to the sides.',
  };
}

// ---------------------------------------------------------------- the zip line

function zip(): RideDef {
  const b = new PathBuilder(-42.5, ROPES_HIGH + 2.2, 18.6, 270, 0);
  b.bend = 4;
  b.line(18, 22).line(3, 3);
  const end = b.pts[b.pts.length - 1];
  return {
    id: 'zip', name: 'Zip Line', emoji: '🧗', seat: 'zip', minV: 1, maxV: 9,
    segs: [pathSeg(b, 'zip', 0.05, '#444')],
    exit: { x: end[0], y: 0, z: end[2], yaw: -Math.PI / 2 },
    blurb: 'Whoosh down the zip line!',
  };
}

/** Stand up at the side of the splash pool. */
function exitBeside(end: V3, yaw: number) {
  const p = SPLASH[SPLASH.length - 1];
  if (!p) return { x: end[0], y: 0, z: end[2], yaw }; // (while withPool is still finding the end)
  // Walk out at the far end of the pool.
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const x = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? p.x1 + 0.8 : p.x0 - 0.8) : end[0];
  const z = Math.abs(fx) > Math.abs(fz) ? end[2] : fz > 0 ? p.z1 + 0.8 : p.z0 - 0.8;
  return { x, y: 0, z, yaw };
}

/** Builds a ride, then the splash pool at the end of its last path. */
function withPool(make: () => RideDef, poolLen = 6, poolW = 4.5) {
  // Build once to find the end, add the pool, then build again so the exit knows its pool.
  const before = SPLASH.length;
  const probe = make();
  if (SPLASH.length !== before) throw new Error('a ride made a pool twice');
  const last = probe.segs[probe.segs.length - 1];
  if (last.type === 'path') {
    const e = last.pts[last.pts.length - 1], a = last.pts[last.pts.length - 9];
    const dx = e[0] - a[0], dz = e[2] - a[2], l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l, w = poolW / 2;
    const ends = [e[0] - fx * 1, e[2] - fz * 1, e[0] + fx * poolLen, e[2] + fz * poolLen];
    if (Math.abs(fx) > Math.abs(fz)) splash(ends[0], e[2] - w, ends[2], e[2] + w, probe.name);
    else splash(e[0] - w, ends[1], e[0] + w, ends[3], probe.name);
  }
  return make();
}

export const RIDES: Record<string, RideDef> = {};
for (const r of [withPool(twister), withPool(dipper), withPool(bowl), withPool(wolfDrop), river(RIVER_DOCKS[0]), river(RIVER_DOCKS[1]), zip()])
  RIDES[r.id] = r;

// Where you start each ride: the bottom of the towers, the river docks.
spots.push({ id: 'tower', kind: 'ride', x: TOWER.x + TOWER.w / 2 + 1.4, y: 0, z: TOWER.z + 2, r: 2.6, label: '🪜 Climb the Big Tower' });
spots.push({ id: 'drop', kind: 'ride', x: DROP_TOWER.x + DROP_TOWER.w / 2 + 1.4, y: 0, z: DROP_TOWER.z, r: 2.4, label: '🐺 Ride the Wolf Drop', ride: 'drop' });
RIVER_DOCKS.forEach((at, i) => {
  const p = RIVER[at];
  const [ox, oz] = riverOut(p);
  spots.push({ id: `river${i + 1}`, kind: 'river', x: p[0] + ox * 3.2, y: 0, z: p[2] + oz * 3.2, r: 2.2, label: '🛟 Float the Lazy River', ride: `river${i + 1}` });
});
export const TOWER_RIDES = ['twister', 'dipper', 'bowl'];

// The towers' stairs: walk up them (or use the button at the bottom for a quick climb). Railings all round.
export const TOWER_STAIRS: Piece[][] = [spiralStairs(TOWER, 6), switchbackStairs(DROP_TOWER, 16)];
for (const p of TOWER_STAIRS) boxes.push(...stairBoxes(p));
// At the top: pick a slide, or step into the drop capsule.
spots.push({ id: 'towerTop', kind: 'ride', x: TOWER.x - 1, y: TOWER.top, z: TOWER.z, r: 2.4, label: '🛝 Pick a slide' });
spots.push({ id: 'dropTop', kind: 'ride', x: DROP_TOWER.x, y: DROP_TOWER.top, z: DROP_TOWER.z, r: 1.6, label: '🐺 Step into the capsule', ride: 'drop' });
