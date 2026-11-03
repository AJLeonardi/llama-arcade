// The whole town as plain data (no three.js), so the tests can walk and drive round it in Node.
// Axes: +x is east, +z is south, +y up. North (-z) is up on the map.
// The suburb (where the mansion is) is a grid of streets from z = 0 to 480; the mansion is just south of
// it. A country road runs north up x = 0 to the city, a grid of wide streets and towers from z = -300 to -800.

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

/** Something solid, axis-aligned. `low` things (pool edges, doorways) stop cars but you can walk through them. */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  low?: boolean;
}

export interface Road {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Which way it runs: 'ns' along z, 'ew' along x. */
  dir: 'ns' | 'ew';
  kind: 'street' | 'avenue' | 'drive';
}

export type Side = 'n' | 's' | 'e' | 'w';
export interface Door {
  side: Side;
  /** Middle of the door along the wall (x for n/s walls, z for e/w walls). */
  at: number;
  w: number;
}
/** A wall inside a building, from (x0, z0) to (x1, z1) (one of them the same), with door gaps. */
export interface InnerWall {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  doors: { at: number; w: number }[];
}

export type FurnKind =
  | 'counter' | 'shelf' | 'freezer' | 'bed' | 'sofa' | 'table' | 'desk' | 'chair' | 'fridge' | 'tv' | 'board'
  | 'bookcase' | 'rug' | 'plant' | 'wardrobe' | 'fireplace' | 'reception' | 'elevator' | 'checkout' | 'stove';
export interface Furn {
  kind: FurnKind;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y1: number;
  color: string;
  /** Which way it faces (for TVs, boards, chairs, sofas). */
  face?: Side;
  solid?: boolean;
}

export type Act = 'sleep' | 'take' | 'class' | 'work' | 'read' | 'dress' | 'tv' | 'snack';
export interface Spot {
  x: number;
  z: number;
  r: number;
  act: Act;
  /** For 'take' and 'snack': what you get. */
  item?: string;
  label: string;
}

export interface Venue {
  id: string;
  name: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Ceiling height inside. */
  h: number;
  doors: Door[];
  inner: InnerWall[];
  wall: string;
  inside: string;
  floor: 'wood' | 'tile' | 'carpet';
  /** Glass walls (shop fronts, the office lobby). */
  glass?: boolean;
  /** More building above the room you can go in: its height and the facade style. */
  upper?: { h: number; style: number; color?: string; roof?: 'flat' | 'pitched' };
  sign?: { text: string; bg: string; fg: string; side: Side };
  furniture: Furn[];
  spots: Spot[];
}

export interface House {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Wall height (one or two floors). */
  h: number;
  /** Which side the front door is on. */
  face: Side;
  color: string;
  roof: string;
}

export interface Tower {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  style: number;
}

export interface Tree {
  x: number;
  z: number;
  kind: number;
  s: number;
}

export interface Parked {
  x: number;
  z: number;
  heading: number;
  type: number;
  color: string;
}

export interface Place {
  id: string;
  name: string;
  icon: string;
  /** Where you stand when you arrive on foot (outside the door), and which way you face. */
  x: number;
  z: number;
  heading: number;
  /** Where your car goes when you arrive driving. */
  cx: number;
  cz: number;
  ch: number;
}

export interface Npc {
  x: number;
  z: number;
  heading: number;
  look: number;
  venue: string;
}

export interface Paved {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kind: 'sidewalk' | 'plaza' | 'parking' | 'drive' | 'pool' | 'field' | 'court';
}

/** Heading is the angle of the way you face: forward is (sin h, cos h). 0 faces south (+z), PI faces north. */
export const NORTH = Math.PI, SOUTH = 0, EAST = Math.PI / 2, WEST = -Math.PI / 2;

// ---------------------------------------------------------------- the street grid

export const SUB_X = [-240, -120, 0, 120, 240];
export const SUB_Z = [0, 120, 240, 360, 480];
export const SUB_HALF = 5; // suburb streets are 10 m wide
export const CITY_X = [-200, -100, 0, 100, 200];
export const CITY_Z = [-800, -700, -600, -500, -400, -300];
export const CITY_HALF = 7; // city streets are 14 m wide
export const WALK = 3; // sidewalk width
export const BOUNDS = { x0: -330, x1: 330, z0: -880, z1: 660 };

export const roads: Road[] = [];
for (const x of SUB_X) roads.push({ x0: x - SUB_HALF, x1: x + SUB_HALF, z0: SUB_Z[0] - SUB_HALF, z1: SUB_Z[4] + SUB_HALF, dir: 'ns', kind: 'street' });
for (const z of SUB_Z) roads.push({ x0: SUB_X[0] - SUB_HALF, x1: SUB_X[4] + SUB_HALF, z0: z - SUB_HALF, z1: z + SUB_HALF, dir: 'ew', kind: 'street' });
for (const x of CITY_X) roads.push({ x0: x - CITY_HALF, x1: x + CITY_HALF, z0: CITY_Z[0] - CITY_HALF, z1: CITY_Z[5] + CITY_HALF, dir: 'ns', kind: 'avenue' });
for (const z of CITY_Z) roads.push({ x0: CITY_X[0] - CITY_HALF, x1: CITY_X[4] + CITY_HALF, z0: z - CITY_HALF, z1: z + CITY_HALF, dir: 'ew', kind: 'avenue' });
// The country road joining the two.
roads.push({ x0: -SUB_HALF, x1: SUB_HALF, z0: CITY_Z[5] + CITY_HALF, z1: SUB_Z[0] - SUB_HALF, dir: 'ns', kind: 'street' });
// The mansion's driveway, off the bottom street.
roads.push({ x0: -3.5, x1: 3.5, z0: SUB_Z[4] + SUB_HALF, z1: 500, dir: 'ns', kind: 'drive' });

export const paved: Paved[] = [];
export const houses: House[] = [];
export const towers: Tower[] = [];
export const venues: Venue[] = [];
export const trees: Tree[] = [];
export const parked: Parked[] = [];
export const lamps: { x: number; z: number; tall: boolean }[] = [];
export const npcs: Npc[] = [];
/** Extra solid things that are drawn as themselves: hedges, fences, walls, goal posts, fountains. */
export const props: (Box & { kind: 'hedge' | 'fence' | 'stone' | 'goal' | 'hoop' | 'fountain' | 'bench' | 'sign' | 'slide' | 'mailbox'; color?: string })[] = [];

const R = rng(2026);

// Sidewalks along every street (not the country road or the driveway).
for (const r of roads) {
  if (r.kind === 'drive' || (r.x0 === -SUB_HALF && r.z1 === SUB_Z[0] - SUB_HALF)) continue;
  if (r.dir === 'ns') {
    paved.push({ x0: r.x0 - WALK, x1: r.x0, z0: r.z0 - WALK, z1: r.z1 + WALK, kind: 'sidewalk' });
    paved.push({ x0: r.x1, x1: r.x1 + WALK, z0: r.z0 - WALK, z1: r.z1 + WALK, kind: 'sidewalk' });
  } else {
    paved.push({ x0: r.x0 - WALK, x1: r.x1 + WALK, z0: r.z0 - WALK, z1: r.z0, kind: 'sidewalk' });
    paved.push({ x0: r.x0 - WALK, x1: r.x1 + WALK, z0: r.z1, z1: r.z1 + WALK, kind: 'sidewalk' });
  }
}

// ---------------------------------------------------------------- building helpers

const HOUSE_COLORS = ['#e9e2d0', '#c9d6df', '#f0d9a8', '#b8c9a3', '#e0b9a8', '#d5d0e6', '#f4f1ea', '#a9c0d6'];
const ROOF_COLORS = ['#4a4744', '#6b3a2e', '#3b4552', '#5a4a3a', '#2f2f33'];
const CAR_COLORS = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2e86c1', '#1e8449', '#d4ac0d', '#111111'];

/** A suburban house on a lot, door facing the street, a driveway to it, maybe a car and a tree. */
function house(cx: number, frontZ: number, face: 'n' | 's') {
  const w = 12 + R() * 4, d = 10 + R() * 2;
  const z0 = face === 'n' ? frontZ : frontZ - d;
  const h = R() < 0.55 ? 6 : 3.4;
  houses.push({ x0: cx - w / 2, x1: cx + w / 2, z0, z1: z0 + d, h, face, color: HOUSE_COLORS[Math.floor(R() * HOUSE_COLORS.length)], roof: ROOF_COLORS[Math.floor(R() * ROOF_COLORS.length)] });
  // The driveway beside the house, out to the sidewalk.
  const dx = cx + w / 2 + 2;
  const dz0 = face === 'n' ? frontZ - 14 : frontZ - d, dz1 = face === 'n' ? frontZ + d : frontZ + 14;
  const walkEdge = face === 'n' ? frontZ - 13.5 : frontZ + 13.5;
  paved.push({ x0: dx - 1.6, x1: dx + 1.6, z0: Math.min(dz0, walkEdge), z1: Math.max(dz1, walkEdge), kind: 'drive' });
  if (R() < 0.4) {
    const type = R() < 0.5 ? 0 : R() < 0.5 ? 1 : 2;
    parked.push({ x: dx, z: face === 'n' ? frontZ - 3 : frontZ + 3, heading: face === 'n' ? NORTH : SOUTH, type, color: CAR_COLORS[Math.floor(R() * CAR_COLORS.length)] });
  }
  // A mailbox by the sidewalk and a tree on the lawn.
  const mz = face === 'n' ? frontZ - 12.5 : frontZ + 12.5;
  props.push({ kind: 'mailbox', x0: dx - 2.6, x1: dx - 2.3, z0: mz - 0.15, z1: mz + 0.15, y0: 0, y1: 1.2 });
  if (R() < 0.8) trees.push({ x: cx - w / 2 + 2 + R() * (w - 4), z: face === 'n' ? frontZ - 6 - R() * 3 : frontZ + 6 + R() * 3, kind: Math.floor(R() * 4), s: 0.8 + R() * 0.4 });
}

/** A block of houses: four along the top (facing north) and four along the bottom (facing south). */
function houseBlock(bx: number, bz: number, skip: (lot: number, face: 'n' | 's') => boolean = () => false) {
  const x0 = SUB_X[bx] + SUB_HALF + WALK, x1 = SUB_X[bx + 1] - SUB_HALF - WALK;
  const z0 = SUB_Z[bz] + SUB_HALF + WALK, z1 = SUB_Z[bz + 1] - SUB_HALF - WALK;
  const lot = (x1 - x0) / 4;
  for (let i = 0; i < 4; i++) {
    const cx = x0 + lot * (i + 0.42);
    if (!skip(i, 'n')) house(cx, z0 + 13, 'n');
    if (!skip(i, 's')) house(cx, z1 - 13, 's');
  }
  // Back-yard fences down the middle of the block.
  const mid = (z0 + z1) / 2;
  props.push({ kind: 'fence', x0: x0 + 1, x1: x1 - 1, z0: mid - 0.05, z1: mid + 0.05, y0: 0, y1: 1.4, color: '#8a6f4e' });
}

/** The walls of a room with door gaps, as solid boxes. */
export function wallBoxes(v: Venue, t = 0.3): Box[] {
  const out: Box[] = [];
  const run = (a0: number, a1: number, gaps: { at: number; w: number }[], make: (a: number, b: number) => Box) => {
    const cuts = gaps.map((g) => [g.at - g.w / 2, g.at + g.w / 2]).sort((p, q) => p[0] - q[0]);
    let a = a0;
    for (const [c0, c1] of cuts) {
      if (c0 > a) out.push(make(a, c0));
      a = Math.max(a, c1);
    }
    if (a < a1) out.push(make(a, a1));
  };
  const doorsOn = (s: Side) => v.doors.filter((d) => d.side === s);
  run(v.x0, v.x1, doorsOn('n'), (a, b) => ({ x0: a, x1: b, z0: v.z0, z1: v.z0 + t, y0: 0, y1: v.h }));
  run(v.x0, v.x1, doorsOn('s'), (a, b) => ({ x0: a, x1: b, z0: v.z1 - t, z1: v.z1, y0: 0, y1: v.h }));
  run(v.z0, v.z1, doorsOn('w'), (a, b) => ({ x0: v.x0, x1: v.x0 + t, z0: a, z1: b, y0: 0, y1: v.h }));
  run(v.z0, v.z1, doorsOn('e'), (a, b) => ({ x0: v.x1 - t, x1: v.x1, z0: a, z1: b, y0: 0, y1: v.h }));
  for (const w of v.inner) {
    const half = 0.1;
    if (w.x0 === w.x1) run(Math.min(w.z0, w.z1), Math.max(w.z0, w.z1), w.doors, (a, b) => ({ x0: w.x0 - half, x1: w.x0 + half, z0: a, z1: b, y0: 0, y1: v.h }));
    else run(Math.min(w.x0, w.x1), Math.max(w.x0, w.x1), w.doors, (a, b) => ({ x0: a, x1: b, z0: w.z0 - half, z1: w.z0 + half, y0: 0, y1: v.h }));
  }
  return out;
}

const f = (kind: FurnKind, x0: number, x1: number, z0: number, z1: number, y1: number, color: string, face?: Side, solid = true): Furn => ({ kind, x0, x1, z0, z1, y1, color, face, solid });

// ---------------------------------------------------------------- the mansion (your house)

export const MANSION: Venue = {
  id: 'home',
  name: 'Your Mansion',
  x0: -28, x1: 28, z0: 522, z1: 556, h: 4.6,
  doors: [{ side: 'n', at: 0, w: 2.2 }, { side: 's', at: 0, w: 2.2 }],
  inner: [
    { x0: -10, z0: 522, x1: -10, z1: 556, doors: [{ at: 539, w: 2.2 }] },
    { x0: 10, z0: 522, x1: 10, z1: 556, doors: [{ at: 539, w: 2.2 }] },
  ],
  wall: '#efe6d2',
  inside: '#f3ede2',
  floor: 'wood',
  upper: { h: 4.4, style: -1, color: '#efe6d2', roof: 'pitched' },
  furniture: [
    // Living room in the middle.
    f('rug', -6, 6, 530, 546, 0.02, '#8c3b3b', undefined, false),
    f('sofa', 0.5, 2.5, 527.5, 534.5, 0.9, '#4a5d7a', 'e'),
    f('tv', 9.2, 9.6, 528, 534, 2.1, '#111111', 'w'),
    f('table', 4, 6, 529.5, 532.5, 0.45, '#6b4a2f'),
    f('fireplace', -9.6, -8.8, 535, 543, 2.2, '#9a8f84', 'e'),
    f('plant', 7.6, 8.8, 523.2, 524.4, 1.6, '#3d7a3a'),
    f('plant', -8.8, -7.6, 554, 555.2, 1.6, '#3d7a3a'),
    // Kitchen in the west wing.
    f('counter', -27.6, -24.6, 523, 538, 0.95, '#d8d4cc'),
    f('stove', -27.6, -24.6, 528, 530, 0.97, '#3a3a3a'),
    f('fridge', -27.6, -25.6, 539.5, 542.5, 2.1, '#e8e8e8', 'e'),
    f('table', -21, -14, 544, 550, 0.78, '#7a5534'),
    f('chair', -20.5, -19.5, 542.6, 543.6, 0.95, '#7a5534', 's'),
    f('chair', -15.5, -14.5, 542.6, 543.6, 0.95, '#7a5534', 's'),
    f('chair', -20.5, -19.5, 550.4, 551.4, 0.95, '#7a5534', 'n'),
    f('chair', -15.5, -14.5, 550.4, 551.4, 0.95, '#7a5534', 'n'),
    // Your bedroom in the east wing.
    f('rug', 13, 25, 533, 549, 0.02, '#5b6f8f', undefined, false),
    f('bed', 24.6, 27.6, 537.4, 540.6, 0.62, '#f2f2f2', 'w'),
    f('table', 26.8, 27.6, 535.9, 536.9, 0.7, '#6b4a2f'),
    f('table', 26.8, 27.6, 541.1, 542.1, 0.7, '#6b4a2f'),
    f('wardrobe', 11, 17, 522.4, 524.2, 2.4, '#8a6a4a', 's'),
    f('plant', 26.6, 27.6, 554.4, 555.4, 1.6, '#3d7a3a'),
  ],
  spots: [
    { x: 23.6, z: 539, r: 2.4, act: 'sleep', label: 'Sleep' },
    { x: 14, z: 525.8, r: 2.2, act: 'dress', label: 'Change clothes' },
    { x: 3.2, z: 531, r: 2.2, act: 'tv', label: 'Watch TV' },
    { x: -23.8, z: 541, r: 2, act: 'snack', item: '🧃', label: 'Get a juice' },
    { x: -23.8, z: 527, r: 2.2, act: 'snack', item: '🥞', label: 'Make pancakes' },
  ],
};
venues.push(MANSION);
// The front court where your cars park, the pool out the back, a hedge round the whole garden.
export const COURT = { x0: -34, x1: 34, z0: 500, z1: 519 };
paved.push({ ...COURT, kind: 'drive' });
paved.push({ x0: -16, x1: 16, z0: 558, z1: 584, kind: 'plaza' });
export const POOL = { x0: -11, x1: 11, z0: 562, z1: 578 };
paved.push({ ...POOL, kind: 'pool' });
props.push({ kind: 'stone', x0: POOL.x0 - 0.4, x1: POOL.x1 + 0.4, z0: POOL.z0 - 0.4, z1: POOL.z0, y0: 0, y1: 0.25, color: '#e6e1d6' });
props.push({ kind: 'stone', x0: POOL.x0 - 0.4, x1: POOL.x1 + 0.4, z0: POOL.z1, z1: POOL.z1 + 0.4, y0: 0, y1: 0.25, color: '#e6e1d6' });
props.push({ kind: 'stone', x0: POOL.x0 - 0.4, x1: POOL.x0, z0: POOL.z0, z1: POOL.z1, y0: 0, y1: 0.25, color: '#e6e1d6' });
props.push({ kind: 'stone', x0: POOL.x1, x1: POOL.x1 + 0.4, z0: POOL.z0, z1: POOL.z1, y0: 0, y1: 0.25, color: '#e6e1d6' });
{
  const H = { x0: -60, x1: 60, z0: 492, z1: 624 };
  const hedge = (x0: number, x1: number, z0: number, z1: number) => props.push({ kind: 'hedge', x0, x1, z0, z1, y0: 0, y1: 1.8, color: '#2f5a2a' });
  hedge(H.x0, -5, H.z0, H.z0 + 1.2);
  hedge(5, H.x1, H.z0, H.z0 + 1.2);
  hedge(H.x0, H.x1, H.z1 - 1.2, H.z1);
  hedge(H.x0, H.x0 + 1.2, H.z0, H.z1);
  hedge(H.x1 - 1.2, H.x1, H.z0, H.z1);
  // Gate pillars by the driveway.
  for (const x of [-5.6, 5.6]) props.push({ kind: 'stone', x0: x - 0.6, x1: x + 0.6, z0: H.z0 - 0.1, z1: H.z0 + 1.3, y0: 0, y1: 2.6, color: '#d9d2c3' });
  for (let i = 0; i < 18; i++) trees.push({ x: (i % 2 ? 1 : -1) * (35 + R() * 20), z: 500 + R() * 118, kind: Math.floor(R() * 4), s: 0.9 + R() * 0.4 });
}
/** Where your cars park in front of the mansion, facing the gate. */
export const CAR_SPOTS = [-6, 6, -12, 12, -18, 18, -24, 24, -30, 30].map((x) => ({ x, z: 511, heading: NORTH }));

// ---------------------------------------------------------------- the coffee shop

export const COFFEE: Venue = {
  id: 'coffee',
  name: 'Llama Latte',
  x0: 14, x1: 32, z0: 372, z1: 386, h: 4,
  doors: [{ side: 'n', at: 23, w: 2.2 }],
  inner: [],
  wall: '#6b4a35',
  inside: '#e9dcc9',
  floor: 'wood',
  glass: true,
  upper: { h: 3.6, style: 3 },
  sign: { text: '☕ Llama Latte', bg: '#2e5b45', fg: '#fff7e6', side: 'n' },
  furniture: [
    f('counter', 16, 30, 381, 382.6, 1.05, '#7a5534'),
    f('table', 15.5, 17, 374.5, 376, 0.75, '#3b3b3b'),
    f('table', 28.5, 30, 374.5, 376, 0.75, '#3b3b3b'),
    f('table', 15.5, 17, 377.8, 379.3, 0.75, '#3b3b3b'),
    f('table', 28.5, 30, 377.8, 379.3, 0.75, '#3b3b3b'),
    f('chair', 17.4, 18.2, 374.8, 375.7, 0.9, '#a0522d', 'w'),
    f('chair', 27.8, 28.6, 374.8, 375.7, 0.9, '#a0522d', 'e'),
    f('plant', 30.6, 31.6, 372.5, 373.5, 1.4, '#3d7a3a'),
    f('board', 18, 28, 385.4, 385.6, 3.3, '#1d1d1d', 'n', false),
  ],
  spots: [
    { x: 18.5, z: 379.8, r: 1.6, act: 'take', item: '☕', label: 'Get a coffee' },
    { x: 21.5, z: 379.8, r: 1.6, act: 'take', item: '🍫', label: 'Get a hot chocolate' },
    { x: 24.5, z: 379.8, r: 1.6, act: 'take', item: '🧁', label: 'Get a muffin' },
    { x: 27.5, z: 379.8, r: 1.6, act: 'take', item: '🍩', label: 'Get a donut' },
  ],
};
venues.push(COFFEE);
npcs.push({ x: 20, z: 384, heading: NORTH, look: 1, venue: 'coffee' });
paved.push({ x0: 8, x1: 40, z0: 368, z1: 372, kind: 'plaza' });

// ---------------------------------------------------------------- the supermarket

const SHELF_ITEMS: [string, string][] = [
  ['🍎', 'apples'], ['🍌', 'bananas'], ['🍞', 'bread'], ['🥛', 'milk'], ['🍪', 'cookies'], ['🥣', 'cereal'],
  ['🥕', 'carrots'], ['🧀', 'cheese'], ['🍝', 'pasta'], ['🍉', 'a watermelon'],
];
export const MARKET: Venue = {
  id: 'market',
  name: 'FreshMart',
  x0: -104, x1: -56, z0: 292, z1: 328, h: 5.5,
  doors: [{ side: 'n', at: -80, w: 2.2 }],
  inner: [],
  wall: '#d9d4c7',
  inside: '#f4f4f0',
  floor: 'tile',
  glass: true,
  sign: { text: 'FreshMart', bg: '#c0392b', fg: '#ffffff', side: 'n' },
  furniture: [
    f('checkout', -98, -94, 296, 297.4, 1, '#3a3a3a'),
    f('checkout', -90, -86, 296, 297.4, 1, '#3a3a3a'),
    f('checkout', -74, -70, 296, 297.4, 1, '#3a3a3a'),
    f('checkout', -66, -62, 296, 297.4, 1, '#3a3a3a'),
    f('freezer', -102, -58, 325, 327.5, 2, '#dfe8ef'),
  ],
  spots: [
    { x: -88, z: 323.5, r: 2.2, act: 'take', item: '🍦', label: 'Take ice cream' },
    { x: -72, z: 323.5, r: 2.2, act: 'take', item: '🍕', label: 'Take a frozen pizza' },
  ],
};
for (let i = 0; i < 5; i++) {
  const x = -98 + i * 9;
  MARKET.furniture.push(f('shelf', x - 0.7, x + 0.7, 302, 318, 2, '#e8e2d6'));
  const [a, b] = [SHELF_ITEMS[i * 2], SHELF_ITEMS[i * 2 + 1]];
  // Along both sides of the shelf, all the way down the aisle.
  for (const z of [304, 310, 316]) {
    MARKET.spots.push({ x: x - 1.8, z, r: 3, act: 'take', item: a[0], label: `Take ${a[1]}` });
    MARKET.spots.push({ x: x + 1.8, z, r: 3, act: 'take', item: b[0], label: `Take ${b[1]}` });
  }
}
venues.push(MARKET);
npcs.push({ x: -96, z: 298.4, heading: NORTH, look: 2, venue: 'market' });
paved.push({ x0: -112, x1: -10, z0: 248, z1: 290, kind: 'parking' });
paved.push({ x0: -108, x1: -52, z0: 288, z1: 292, kind: 'plaza' });
for (let i = 0; i < 6; i++) parked.push({ x: -100 + i * 13, z: 262 + (i % 2) * 14, heading: i % 2 ? SOUTH : NORTH, type: i % 3, color: CAR_COLORS[(i * 3) % CAR_COLORS.length] });

// ---------------------------------------------------------------- the school

export const SCHOOL: Venue = {
  id: 'school',
  name: 'Sunny Hill School',
  x0: 140, x1: 204, z0: 130, z1: 154, h: 4.2,
  doors: [{ side: 'n', at: 172, w: 2.4 }],
  inner: [
    { x0: 162, z0: 130, x1: 162, z1: 154, doors: [{ at: 136, w: 2.2 }] },
    { x0: 182, z0: 130, x1: 182, z1: 154, doors: [{ at: 136, w: 2.2 }] },
  ],
  wall: '#b5523b',
  inside: '#f0ead8',
  floor: 'tile',
  upper: { h: 4, style: 3 },
  sign: { text: 'Sunny Hill School', bg: '#1f4e79', fg: '#ffd84a', side: 'n' },
  furniture: [
    // Classroom (west).
    f('board', 143, 159, 153.4, 153.7, 2.6, '#26402e', 'n', false),
    f('desk', 148, 154, 149, 150.4, 0.8, '#8a6a4a'),
    f('plant', 140.5, 141.5, 130.6, 131.6, 1.4, '#3d7a3a'),
    // Library (east).
    f('bookcase', 184, 202, 153, 153.7, 2.4, '#7a5534', 'n'),
    f('bookcase', 203.2, 203.7, 140, 152, 2.4, '#7a5534', 'w'),
    f('table', 188, 196, 141, 145, 0.75, '#c9a46e'),
    f('rug', 186, 198, 139, 147, 0.02, '#3b6ea5', undefined, false),
  ],
  spots: [
    { x: 151, z: 147, r: 2.6, act: 'class', label: 'Go to class' },
    { x: 192, z: 150.5, r: 3, act: 'read', label: 'Read a book' },
  ],
};
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 4; col++) {
    const x = 144.5 + col * 4, z = 134 + row * 4;
    SCHOOL.furniture.push(f('desk', x - 0.7, x + 0.7, z - 0.45, z + 0.45, 0.72, '#c9a46e'));
    SCHOOL.furniture.push(f('chair', x - 0.3, x + 0.3, z - 1.05, z - 0.55, 0.85, '#2e86c1', 's'));
  }
}
venues.push(SCHOOL);
npcs.push({ x: 151, z: 151.5, heading: NORTH, look: 3, venue: 'school' });
// The playground and field behind it.
paved.push({ x0: 136, x1: 208, z0: 126, z1: 130, kind: 'plaza' });
paved.push({ x0: 140, x1: 226, z0: 162, z1: 226, kind: 'field' });
paved.push({ x0: 210, x1: 230, z0: 128, z1: 156, kind: 'court' });
for (const z of [164, 224]) props.push({ kind: 'goal', x0: 179, x1: 187, z0: z - 0.6, z1: z + 0.6, y0: 0, y1: 2.4 });
props.push({ kind: 'hoop', x0: 219.6, x1: 220.4, z0: 129, z1: 130, y0: 0, y1: 3.4 });
props.push({ kind: 'slide', x0: 214, x1: 216, z0: 140, z1: 146, y0: 0, y1: 2.2, color: '#e74c3c' });

// ---------------------------------------------------------------- work, in the city

export const WORK: Venue = {
  id: 'work',
  name: 'Llama Corp',
  x0: 30, x1: 70, z0: -456, z1: -414, h: 5.5,
  doors: [{ side: 's', at: 50, w: 2.4 }],
  inner: [],
  wall: '#3d4650',
  inside: '#e8e8e6',
  floor: 'tile',
  glass: true,
  upper: { h: 150, style: 0 },
  sign: { text: 'LLAMA CORP', bg: '#14202c', fg: '#7fd4ff', side: 's' },
  furniture: [
    f('reception', 44, 56, -424, -422, 1.1, '#e9e5dc'),
    f('elevator', 42, 46, -455.7, -455.5, 3, '#9aa3ab', 's', false),
    f('elevator', 54, 58, -455.7, -455.5, 3, '#9aa3ab', 's', false),
    f('plant', 31, 32, -415.2, -414.2, 1.6, '#3d7a3a'),
    f('plant', 68, 69, -415.2, -414.2, 1.6, '#3d7a3a'),
  ],
  spots: [],
};
for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 2; j++) {
    const x = 34 + i * 9, z = -448 + j * 12;
    WORK.furniture.push(f('desk', x, x + 3, z, z + 1.4, 0.75, '#f0f0f0'));
    WORK.furniture.push(f('chair', x + 1, x + 2, z + 1.6, z + 2.4, 1, '#222222', 'n'));
  }
}
WORK.spots.push({ x: 35.5, z: -444.5, r: 2.4, act: 'work', label: 'Do some work' });
venues.push(WORK);
npcs.push({ x: 50, z: -425, heading: SOUTH, look: 4, venue: 'work' });
npcs.push({ x: 53.5, z: -432.6, heading: NORTH, look: 5, venue: 'work' });

// ---------------------------------------------------------------- the suburb's houses

for (let bx = 0; bx < 4; bx++) {
  for (let bz = 0; bz < 4; bz++) {
    if (bx === 1 && bz === 2) continue; // the supermarket
    if (bx === 3 && bz === 1) continue; // the school
    if (bx === 2 && bz === 3) {
      houseBlock(bx, bz, (lot, face) => face === 'n' && lot === 0); // the coffee shop's lot
      continue;
    }
    houseBlock(bx, bz);
  }
}
// The supermarket block's back half: a little park.
for (let i = 0; i < 14; i++) trees.push({ x: -112 + R() * 104, z: 334 + R() * 18, kind: Math.floor(R() * 4), s: 0.9 + R() * 0.3 });
props.push({ kind: 'bench', x0: -60, x1: -58, z0: 340, z1: 340.6, y0: 0, y1: 0.5 });

// Street trees and lamps along the suburb's streets.
for (const x of SUB_X) {
  for (let z = SUB_Z[0] + 20; z < SUB_Z[4]; z += 30) {
    if (SUB_Z.some((cz) => Math.abs(cz - z) < 12)) continue;
    lamps.push({ x: x - SUB_HALF - 0.6, z, tall: false });
    trees.push({ x: x + SUB_HALF + 1.5, z: z + 15, kind: (z / 30) & 3, s: 0.8 });
  }
}
for (const z of SUB_Z) {
  for (let x = SUB_X[0] + 20; x < SUB_X[4]; x += 30) {
    if (SUB_X.some((cx) => Math.abs(cx - x) < 12)) continue;
    lamps.push({ x, z: z - SUB_HALF - 0.6, tall: false });
  }
}

// ---------------------------------------------------------------- the country road and the city

// Trees along the country road and a forest all round the outside.
for (let z = -280; z < -10; z += 14) {
  for (const s of [-1, 1]) if (R() < 0.75) trees.push({ x: s * (11 + R() * 30), z: z + R() * 6, kind: Math.floor(R() * 4), s: 0.9 + R() * 0.5 });
}
for (let z = -270; z < -10; z += 40) lamps.push({ x: SUB_HALF + 0.6, z, tall: false });
for (let i = 0; i < 260; i++) {
  const x = BOUNDS.x0 + R() * (BOUNDS.x1 - BOUNDS.x0), z = -860 + R() * 1500;
  const inSuburb = x > -255 && x < 255 && z > -15 && z < 495;
  const inCity = x > -215 && x < 215 && z > -815 && z < -285;
  const nearRoad = Math.abs(x) < 50 && z > -300 && z < 0;
  const inGarden = x > -65 && x < 65 && z > 488 && z < 630;
  if (!inSuburb && !inCity && !nearRoad && !inGarden) trees.push({ x, z, kind: Math.floor(R() * 4), s: 0.9 + R() * 0.6 });
}
props.push({ kind: 'sign', x0: 8, x1: 14, z0: -262, z1: -261.6, y0: 0, y1: 3.4 });

export const CITY_PARK = { x0: -93, x1: -7, z0: -593, z1: -507 };
for (let bx = 0; bx < 4; bx++) {
  for (let bz = 0; bz < 5; bz++) {
    const x0 = CITY_X[bx] + CITY_HALF + WALK, x1 = CITY_X[bx + 1] - CITY_HALF - WALK;
    const z0 = CITY_Z[bz] + CITY_HALF + WALK, z1 = CITY_Z[bz + 1] - CITY_HALF - WALK;
    if (bx === 1 && bz === 2) {
      // The city park: grass, trees, a fountain in the middle.
      for (let i = 0; i < 22; i++) {
        const a = R() * Math.PI * 2, d = 14 + R() * 26;
        trees.push({ x: -50 + Math.cos(a) * d, z: -550 + Math.sin(a) * d, kind: Math.floor(R() * 4), s: 1 + R() * 0.3 });
      }
      paved.push({ x0: -60, x1: -40, z0: -560, z1: -540, kind: 'plaza' });
      props.push({ kind: 'fountain', x0: -54, x1: -46, z0: -554, z1: -546, y0: 0, y1: 0.7 });
      for (const [x, z] of [[-58, -550], [-42, -550]]) props.push({ kind: 'bench', x0: x - 0.3, x1: x + 0.3, z0: z - 1, z1: z + 1, y0: 0, y1: 0.5 });
      continue;
    }
    paved.push({ x0, x1, z0, z1, kind: 'plaza' });
    if (bx === 2 && bz === 3) {
      // Llama Corp's block: the tower and a plaza in front.
      continue;
    }
    // Two to four towers per block.
    const split = R() < 0.5;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const lots: [number, number, number, number][] = split
      ? [[x0, mx, z0, z1], [mx, x1, z0, z1]]
      : [[x0, mx, z0, mz], [mx, x1, z0, mz], [x0, mx, mz, z1], [mx, x1, mz, z1]];
    for (const [a0, a1, b0, b1] of lots) {
      const pad = 3 + R() * 3;
      const centre = Math.hypot((a0 + a1) / 2, (b0 + b1) / 2 + 550) < 200;
      towers.push({ x0: a0 + pad, x1: a1 - pad, z0: b0 + pad, z1: b1 - pad, h: Math.round((centre ? 60 : 25) + R() * (centre ? 120 : 60)), style: Math.floor(R() * 5) });
    }
  }
}
for (const x of CITY_X) for (let z = CITY_Z[0] + 25; z < CITY_Z[5]; z += 25) if (!CITY_Z.some((cz) => Math.abs(cz - z) < 12)) lamps.push({ x: x - CITY_HALF - 0.6, z, tall: true });
for (const z of CITY_Z) for (let x = CITY_X[0] + 25; x < CITY_X[4]; x += 25) if (!CITY_X.some((cx) => Math.abs(cx - x) < 12)) lamps.push({ x, z: z - CITY_HALF - 0.6, tall: true });
// Cars parked along the city streets.
for (let i = 0; i < 16; i++) {
  const x = CITY_X[1 + (i % 3)] + CITY_HALF - 1.4;
  parked.push({ x, z: -760 + i * 29 + (i % 2) * 6, heading: SOUTH, type: i % 3, color: CAR_COLORS[(i * 5) % CAR_COLORS.length] });
}

// ---------------------------------------------------------------- places on the map

export const PLACES: Place[] = [
  { id: 'home', name: 'Home', icon: '🏡', x: 0, z: 519, heading: SOUTH, cx: 0, cz: 506, ch: NORTH },
  { id: 'coffee', name: 'Llama Latte', icon: '☕', x: 23, z: 369, heading: SOUTH, cx: 23, cz: 362.5, ch: EAST },
  { id: 'market', name: 'FreshMart', icon: '🛒', x: -80, z: 289, heading: SOUTH, cx: -80, cz: 270, ch: EAST },
  { id: 'school', name: 'School', icon: '🏫', x: 172, z: 127, heading: SOUTH, cx: 172, cz: 122.5, ch: EAST },
  { id: 'work', name: 'Work', icon: '💼', x: 50, z: -411, heading: NORTH, cx: 50, cz: -402, ch: EAST },
  { id: 'park', name: 'City Park', icon: '🌳', x: -50, z: -513, heading: NORTH, cx: -50, cz: -500, ch: EAST },
];

// No lamp posts right in front of a door.
for (let i = lamps.length - 1; i >= 0; i--) if (PLACES.some((p) => Math.hypot(p.x - lamps[i].x, p.z - lamps[i].z) < 9)) lamps.splice(i, 1);

// ---------------------------------------------------------------- collision

/** Everything solid: building walls, house and tower blocks, furniture, props, parked cars, tree trunks. */
export const solids: Box[] = [];
for (const v of venues) {
  solids.push(...wallBoxes(v));
  // Doorways: you walk in, cars don't.
  for (const d of v.doors) {
    const a0 = d.at - d.w / 2, a1 = d.at + d.w / 2;
    if (d.side === 'n') solids.push({ x0: a0, x1: a1, z0: v.z0, z1: v.z0 + 0.3, y0: 0, y1: 2.5, low: true });
    if (d.side === 's') solids.push({ x0: a0, x1: a1, z0: v.z1 - 0.3, z1: v.z1, y0: 0, y1: 2.5, low: true });
    if (d.side === 'w') solids.push({ x0: v.x0, x1: v.x0 + 0.3, z0: a0, z1: a1, y0: 0, y1: 2.5, low: true });
    if (d.side === 'e') solids.push({ x0: v.x1 - 0.3, x1: v.x1, z0: a0, z1: a1, y0: 0, y1: 2.5, low: true });
  }
  for (const fu of v.furniture) if (fu.solid) solids.push({ x0: fu.x0, x1: fu.x1, z0: fu.z0, z1: fu.z1, y0: 0, y1: fu.y1 });
}
for (const h of houses) solids.push({ x0: h.x0, x1: h.x1, z0: h.z0, z1: h.z1, y0: 0, y1: h.h });
for (const t of towers) solids.push({ x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, y0: 0, y1: t.h });
for (const p of props) solids.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, y0: p.y0, y1: p.y1, low: p.y1 < 0.45 || undefined });
for (const t of trees) solids.push({ x0: t.x - 0.3, x1: t.x + 0.3, z0: t.z - 0.3, z1: t.z + 0.3, y0: 0, y1: 4 });
for (const p of parked) {
  const along = Math.abs(Math.sin(p.heading)) > 0.5;
  const hl = 2.3, hw = 0.95;
  solids.push(along ? { x0: p.x - hl, x1: p.x + hl, z0: p.z - hw, z1: p.z + hw, y0: 0, y1: 1.5 } : { x0: p.x - hw, x1: p.x + hw, z0: p.z - hl, z1: p.z + hl, y0: 0, y1: 1.5 });
}
for (const l of lamps) solids.push({ x0: l.x - 0.15, x1: l.x + 0.15, z0: l.z - 0.15, z1: l.z + 0.15, y0: 0, y1: 5 });

// A grid so we only check the solids nearby.
const CELL = 16;
const grid = new Map<number, Box[]>();
const key = (i: number, j: number) => i * 10007 + j;
for (const b of solids) {
  for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i++) {
    for (let j = Math.floor(b.z0 / CELL); j <= Math.floor(b.z1 / CELL); j++) {
      const k = key(i, j);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(b);
    }
  }
}

/** Solids that might touch a circle at (x, z) of radius r. */
export function solidsNear(x: number, z: number, r: number): Box[] {
  const out = new Set<Box>();
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
    for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) for (const b of grid.get(key(i, j)) ?? []) out.add(b);
  }
  return [...out];
}

/**
 * Pushes a circle out of anything solid (and back inside the world's edge). `low` things only stop cars.
 * `head` is how high the circle reaches (things lifted above it, like the tower over a lobby, don't count).
 * Returns how far it was pushed, or 0.
 */
/**
 * How high the thing under you is (0 for the ground): the top of a bed, table or car you've jumped onto.
 * Only things whose top is below your feet (plus a little) count, so a wall you walk into isn't a floor.
 */
export function groundUnder(x: number, z: number, feet: number, r = 0.2): number {
  let top = 0;
  for (const b of solidsNear(x, z, r)) {
    if (b.low || b.y1 > feet + 0.05 || b.y1 <= top) continue;
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) top = b.y1;
  }
  return top;
}

export function pushOut(p: { x: number; z: number }, r: number, car: boolean, feet = 0): number {
  let moved = 0;
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (const b of solidsNear(p.x, p.z, r)) {
      if (b.low && !car) continue;
      if (b.y0 > feet + 1.6 || b.y1 <= feet + 0.05) continue;
      const cx = Math.max(b.x0, Math.min(b.x1, p.x)), cz = Math.max(b.z0, Math.min(b.z1, p.z));
      let dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-6) {
        // The middle is inside the box: out the nearest side.
        const pen = [p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z];
        const m = pen.indexOf(Math.min(...pen));
        if (m === 0) p.x = b.x0 - r;
        else if (m === 1) p.x = b.x1 + r;
        else if (m === 2) p.z = b.z0 - r;
        else p.z = b.z1 + r;
        moved += pen[m] + r;
      } else {
        dx /= d;
        dz /= d;
        p.x = cx + dx * r;
        p.z = cz + dz * r;
        moved += r - d;
      }
      any = true;
    }
    if (!any) break;
  }
  const bx = Math.max(BOUNDS.x0 + r, Math.min(BOUNDS.x1 - r, p.x)), bz = Math.max(BOUNDS.z0 + r, Math.min(BOUNDS.z1 - r, p.z));
  moved += Math.abs(bx - p.x) + Math.abs(bz - p.z);
  p.x = bx;
  p.z = bz;
  return moved;
}

/** Is anything solid in the way of a circle at (x, z)? */
export function blocked(x: number, z: number, r: number, car = false) {
  const p = { x, z };
  return pushOut(p, r, car) > 1e-3;
}

/** The building you're inside, if any. */
export function venueAt(x: number, z: number): Venue | undefined {
  return venues.find((v) => x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1);
}

export function inPool(x: number, z: number) {
  return x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1;
}

/** The nearest thing you can do here, if any. */
export function spotAt(x: number, z: number): Spot | undefined {
  const v = venueAt(x, z);
  if (!v) return undefined;
  let best: Spot | undefined, bd = Infinity;
  for (const s of v.spots) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < s.r && d < bd) {
      best = s;
      bd = d;
    }
  }
  return best;
}

/** Is (x, z) on a road (for the map, and for where a car can be put down)? */
export function onRoad(x: number, z: number) {
  return roads.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
}
