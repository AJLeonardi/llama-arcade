// The lodge as data: every solid thing is an axis-aligned Box (walls, furniture, the ropes course), pools are
// dips in the floor, and Spots are the places where the action button does something. No three.js here, so the
// tests can walk around in Node. Axes: +y up, +z points out of the front doors towards the car park.
//
//   outside (z > 40)          car park, pine trees, the lodge sign
//   LOBBY   x -20..20, z 10..40     front desk, fireplace, the big tree
//   HALL    x 20..66,  z 22..28     guest rooms on the north side (Basic, Nice, Luxury)
//   ADV     x -66..-20, z 10..40    Wand Quest shop, the dragon, the ropes course
//   PARK    x -46..46, z -86..10    the indoor water park, through the gate in the lobby's south wall

export type V3 = [number, number, number];
export type Mat =
  | 'log' | 'plaster' | 'stone' | 'wood' | 'desk' | 'glass' | 'ceiling' | 'roof' | 'panel' | 'steel'
  | 'plank' | 'beam' | 'bed' | 'sheet' | 'sofa' | 'tile' | 'concrete' | 'counter' | 'door' | 'none';

export interface Box {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  mat: Mat;
  /** A ropes-course platform: the harness brings you back to the last one you stood on. */
  plat?: boolean;
  /** Beds: you bounce when you land on them. */
  bounce?: boolean;
  /** Part of a door: solid only while that door is shut. */
  door?: number;
  /** With `door`: the leaf swung open into the room, so solid only while that door is open. */
  leaf?: boolean;
  /** For the view: the way a bed or sofa faces (yaw: 0 = +z, π/2 = +x). */
  face?: number;
  /** An invisible box the camera can't go through either (the stair towers). */
  camera?: boolean;
}

export interface Region { x0: number; x1: number; z0: number; z1: number; h: number }
export const LOBBY: Region = { x0: -20, x1: 20, z0: 10, z1: 40, h: 12 };
export const HALL: Region = { x0: 20, x1: 66, z0: 22, z1: 28, h: 3.2 };
export const ADV: Region = { x0: -66, x1: -20, z0: 10, z1: 40, h: 14 };
export const PARK: Region = { x0: -46, x1: 46, z0: -86, z1: 10, h: 22 };

export type Tier = 1 | 2 | 3;
export interface RoomInfo { tier: Tier; name: string; x0: number; x1: number; z0: number; z1: number; doorX: number }
export const ROOMS: RoomInfo[] = [
  { tier: 1, name: 'Basic Room', x0: 20, x1: 30, z0: 28, z1: 37, doorX: 25.5 },
  { tier: 2, name: 'Nice Room: Wolf Den Suite', x0: 30, x1: 41, z0: 28, z1: 39, doorX: 35.5 },
  { tier: 3, name: 'Luxury Suite', x0: 41, x1: 66, z0: 28, z1: 42, doorX: 53 },
];
export const ROOM_H = 3.0;
export const WALL_T = 0.4;

export const boxes: Box[] = [];
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Mat, extra: Partial<Box> = {}) {
  const b: Box = {
    x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
    x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), mat, ...extra,
  };
  boxes.push(b);
  return b;
}

/** A hole in a wall: from..to along the wall, y0..y1 high. Windows (y0 > 0) get a pane of glass. */
type Gap = [from: number, to: number, y0: number, y1: number];

/** A wall along x at a fixed z (or along z at a fixed x, with `alongZ`). */
function wall(fixed: number, from: number, to: number, h: number, mat: Mat, gaps: Gap[] = [], alongZ = false, y0 = 0) {
  const t = WALL_T / 2;
  const put = (a: number, b: number, ya: number, yb: number, m: Mat) => {
    if (b - a < 0.01 || yb - ya < 0.01) return;
    if (alongZ) box(fixed - t, ya, a, fixed + t, yb, b, m);
    else box(a, ya, fixed - t, b, yb, fixed + t, m);
  };
  const sorted = [...gaps].sort((p, q) => p[0] - q[0]);
  let at = from;
  for (const [ga, gb, gy0, gy1] of sorted) {
    put(at, ga, y0, h, mat);
    put(ga, gb, y0, gy0, mat);
    put(ga, gb, gy1, h, mat);
    if (gy0 > y0) put(ga, gb, gy0, gy1, 'glass');
    at = gb;
  }
  put(at, to, y0, h, mat);
}

// ---------------------------------------------------------------- doors

export interface Door {
  id: number;
  /** Which room's wristband opens it: 1-3, or 0 for the water park gate (any booked room). -1 never opens. */
  tier: Tier | 0 | -1;
  x: number; z: number;
  width: number;
  alongZ: boolean;
  h: number;
}
export const doors: Door[] = [];
function door(tier: Door['tier'], x: number, z: number, width: number, h: number, alongZ = false) {
  const d: Door = { id: doors.length, tier, x, z, width, alongZ, h };
  doors.push(d);
  const t = 0.06, w = width / 2;
  if (alongZ) box(x - t, 0, z - w, x + t, h, z + w, 'none', { door: d.id });
  else box(x - w, 0, z - t, x + w, h, z + t, 'none', { door: d.id });
  // Room doors swing into the room (+z), hinged at the -x side (the view's door leaf), and you can't walk
  // through the open leaf either.
  if (tier > 0 && !alongZ) box(x - w - 0.02, 0, z + t, x - w + 0.06, h, z + width, 'none', { door: d.id, leaf: true });
  return d;
}

// ---------------------------------------------------------------- pools (dips in the floor)

export interface Pool { x0: number; x1: number; z0: number; z1: number; depth: number; name: string }
/** Water surface height: a little below the deck. */
export const WATER_Y = -0.15;
export const pools: Pool[] = [];

// ---------------------------------------------------------------- action spots

export type SpotKind = 'desk' | 'ride' | 'river' | 'wand' | 'rune' | 'dragon' | 'zip' | 'sleep' | 'clerk';
export interface Spot { id: string; kind: SpotKind; x: number; y: number; z: number; r: number; label: string; ride?: string; rune?: number }
export const spots: Spot[] = [];
const spot = (s: Spot) => spots.push(s);

// ---------------------------------------------------------------- building it

// The lobby: log walls, big windows at the front, viewing windows into the water park at the back.
wall(LOBBY.z1, LOBBY.x0, LOBBY.x1, LOBBY.h, 'log', [[-3, 3, 0, 4.2], [-17, -6, 1, 8], [6, 17, 1, 8]]);
wall(LOBBY.x0, LOBBY.z0, LOBBY.z1, LOBBY.h, 'log', [[22, 28, 0, 4.5], [31, 38, 1.2, 7]], true);
wall(LOBBY.x1, LOBBY.z0, LOBBY.z1, LOBBY.h, 'log', [[22.5, 27.5, 0, 3.2], [12, 19.5, 1.2, 7]], true);
box(LOBBY.x0, LOBBY.h, LOBBY.z0, LOBBY.x1, LOBBY.h + 0.4, LOBBY.z1, 'ceiling');
// The south wall is shared with the water park, so it is as tall as the park.
wall(PARK.z1, PARK.x0, PARK.x1, PARK.h, 'log', [[-3, 3, 0, 4], [-14, -5, 1, 8], [5, 14, 1, 8], [-42, -24, 15, 20], [24, 42, 3, 19]]);
door(0, 0, PARK.z1, 6, 4);

// The front desk along the west wall (the clerk stands behind it) and the stone fireplace on the east wall.
export const DESK = { x0: -16.6, x1: -15.6, z0: 13.5, z1: 20.5, clerkX: -18 };
box(DESK.x0, 0, DESK.z0, DESK.x1, 1.1, DESK.z1, 'counter');
box(DESK.x0 - 0.1, 1.1, DESK.z0 - 0.1, DESK.x1 + 0.2, 1.16, DESK.z1 + 0.1, 'desk');
box(-19.8, 0, 13, -19.3, 4, 21, 'wood'); // the wall of keys behind the desk
spot({ id: 'desk', kind: 'desk', x: -14, y: 0, z: 17, r: 2.6, label: '🛎️ Book a room' });
box(18.4, 0, 31, 19.8, 12, 37, 'stone');
box(17.2, 0, 32, 18.4, 0.5, 36, 'stone'); // the hearth
// The big tree in the middle of the lobby (trunk only; the branches are decoration).
box(-1.2, 0, 27.8, 1.2, 9, 30.2, 'none');
// Sofas by the fire.
box(12, 0, 31.5, 13, 0.45, 36.5, 'sofa', { face: Math.PI / 2 });
box(13.5, 0, 29, 17, 0.45, 30, 'sofa', { face: 0 });

// The hall to the guest rooms.
wall(HALL.z0, HALL.x0, HALL.x1, HALL.h, 'plaster');
const doorGaps: Gap[] = ROOMS.map((r) => [r.doorX - 0.6, r.doorX + 0.6, 0, 2.3]);
wall(HALL.z1, HALL.x0, HALL.x1, HALL.h, 'plaster', doorGaps);
wall(HALL.x1, HALL.z0, 42, HALL.h, 'plaster', [], true);
box(HALL.x0, HALL.h, HALL.z0, HALL.x1, HALL.h + 0.3, 42, 'ceiling');
for (const r of ROOMS) door(r.tier, r.doorX, HALL.z1, 1.2, 2.3);
// Doors on the south side of the hall belong to other guests.
for (const x of [26, 36, 46, 56]) door(-1, x, HALL.z0 + 0.21, 1.1, 2.3);

// The rooms. Walls between them, a window at the back of each.
wall(30, HALL.z1, 39, HALL.h, 'plaster', [], true);
wall(41, HALL.z1, 42, HALL.h, 'plaster', [], true);
wall(37, 20, 30, HALL.h, 'plaster', [[23, 27, 0.9, 2.5]]);
wall(39, 30, 41, HALL.h, 'plaster', [[33, 38, 0.9, 2.5]]);
wall(42, 41, 66, HALL.h, 'plaster', [[44, 52, 0.4, 2.7], [55, 63, 0.4, 2.7]]);
box(20, 0, 37, 30, HALL.h, 39, 'none'); // the space behind the Basic room is solid

// Basic Room: one bed, a TV, a small desk.
const PI = Math.PI;
box(23.5, 0, 33.6, 25.5, 0.6, 36.6, 'bed', { bounce: true, face: PI });
box(22.6, 0, 35.8, 23.3, 0.6, 36.6, 'wood');
box(28.6, 0, 33, 29.6, 0.75, 35.5, 'wood');
spot({ id: 'sleep1', kind: 'sleep', x: 24.5, y: 0, z: 33, r: 1.6, label: '😴 Sleep' });

// Nice Room (Wolf Den Suite): a queen bed, a sofa, and the den: a log-and-rock cave with bunk beds.
box(31.6, 0, 35.4, 33.8, 0.62, 38.6, 'bed', { bounce: true, face: PI });
box(36.8, 0, 28.6, 40.6, 0.45, 29.5, 'sofa', { face: 0 });
box(37.2, 0, 33.2, 38.4, 2.6, 33.6, 'stone'); // the den's front wall, with a doorway
box(39.6, 0, 33.2, 40.8, 2.6, 33.6, 'stone');
box(38.4, 2.0, 33.2, 39.6, 2.6, 33.6, 'stone');
box(37.2, 0, 33.6, 37.6, 2.6, 38.8, 'stone');
box(37.6, 0, 36.6, 40.6, 0.5, 38.6, 'bed', { bounce: true, face: PI }); // bottom bunk
box(37.6, 1.5, 36.6, 40.6, 1.75, 38.6, 'bed', { bounce: true, face: PI }); // top bunk
box(37.6, 0, 33.6, 38.4, 2.2, 34.4, 'none'); // ladder post (blocks the corner)
spot({ id: 'sleep2', kind: 'sleep', x: 32.7, y: 0, z: 34.6, r: 1.6, label: '😴 Sleep' });

// Luxury Suite: king bed, fireplace, a hot tub, big sofa, and a KidCabin with bunk beds.
box(56, 0, 37.2, 59, 0.66, 41.4, 'bed', { bounce: true, face: PI });
box(64.8, 0, 32, 65.8, 3, 36, 'stone'); // fireplace on the east wall
box(46, 0, 34, 50.5, 0.48, 35, 'sofa', { face: PI });
box(45, 0, 30.5, 46, 0.48, 34, 'sofa', { face: PI / 2 });
box(42.2, 0, 37.5, 44.2, 2.8, 37.9, 'log'); // KidCabin front wall, with a doorway
box(45.4, 0, 37.5, 47.9, 2.8, 37.9, 'log');
box(44.2, 2.1, 37.5, 45.4, 2.8, 37.9, 'log');
box(47.5, 0, 37.9, 47.9, 2.8, 41.8, 'log');
box(42.2, 0, 37.9, 42.6, 2.8, 41.8, 'log');
box(42.6, 0, 40, 45, 0.5, 41.8, 'bed', { bounce: true, face: PI });
box(42.6, 1.5, 40, 45, 1.75, 41.8, 'bed', { bounce: true, face: PI });
box(45.4, 0, 40.4, 47.4, 0.5, 41.8, 'bed', { bounce: true, face: PI });
spot({ id: 'sleep3', kind: 'sleep', x: 57.5, y: 0, z: 36.4, r: 1.8, label: '😴 Sleep' });
pools.push({ x0: 60, x1: 63, z0: 29, z1: 31.6, depth: 0.7, name: 'hot tub' });

// ---------------------------------------------------------------- the adventure wing

wall(ADV.z1, ADV.x0, ADV.x1, ADV.h, 'log', [[-60, -46, 2, 10], [-40, -26, 2, 10]]);
wall(ADV.x0, ADV.z0, ADV.z1, ADV.h, 'log', [[16, 34, 3, 11]], true);
wall(ADV.z0, ADV.x0, PARK.x0, ADV.h, 'log');
box(ADV.x0, ADV.h, ADV.z0, ADV.x1, ADV.h + 0.4, ADV.z1, 'ceiling');
// The wall the lobby shares with the wing is the lobby's west wall (above).

// The Wand Quest shop.
box(-30, 0, 36.6, -24, 1.1, 37.4, 'counter');
box(-31, 0, 39.2, -23, 3.2, 39.8, 'wood');
spot({ id: 'wand', kind: 'wand', x: -27, y: 0, z: 35, r: 2.4, label: '🪄 Get a magic wand' });
// The dragon on its rock.
box(-64, 0, 25, -57, 1.6, 33, 'stone');
spot({ id: 'dragon', kind: 'dragon', x: -55, y: 0, z: 29, r: 3.2, label: '🐉 Wake the dragon' });

// The ropes course (Howling Heights): platforms on poles, joined by a plank bridge, a balance beam,
// stepping logs, a climbing net up to the high level, a high beam, and a zip line down.
export const ROPES_Y = 4;
export const ROPES_HIGH = 8;
const plat = (cx: number, cz: number, y: number) => {
  box(cx - 0.2, 0, cz - 0.2, cx + 0.2, y - 0.2, cz + 0.2, 'none'); // its pole
  return box(cx - 1.5, y - 0.2, cz - 1.5, cx + 1.5, y, cz + 1.5, 'plank', { plat: true });
};
{
  // Stairs up to the first platform.
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const x = -30.15 - i * 0.35; // the top step tucks under the platform's edge
    box(x - 0.35, 0, 13.6, x, (i + 1) * (ROPES_Y / steps), 15.4, 'plank');
  }
  plat(-38.5, 14.5, ROPES_Y);
  // 1: the wobbly plank bridge (north).
  for (let z = 16.15; z < 24.4; z += 0.6) box(-39, ROPES_Y - 0.1, z, -38, ROPES_Y, z + 0.45, 'plank');
  plat(-38.5, 26, ROPES_Y);
  // 2: the balance beam (west).
  box(-50, ROPES_Y - 0.15, 25.86, -40, ROPES_Y, 26.14, 'beam');
  plat(-51.5, 26, ROPES_Y);
  // 3: stepping logs (north), a little hop apart.
  for (let i = 0; i < 6; i++) {
    const z = 28.1 + i * 1.0;
    box(-51.85, ROPES_Y - 0.2, z, -51.15, ROPES_Y, z + 0.7, 'beam');
  }
  plat(-51.5, 36, ROPES_Y);
  // 4: the climbing net (east), up to the high level.
  for (let i = 0; i < 10; i++) {
    const x = -50 + i * 0.6;
    box(x, ROPES_Y + i * 0.4 - 0.1, 35.2, x + 0.6, ROPES_Y + (i + 1) * 0.4, 36.8, 'none');
  }
  plat(-42.5, 36, ROPES_HIGH);
  // 5: the high beam (south) with ropes to hold.
  box(-42.66, ROPES_HIGH - 0.15, 21.5, -42.34, ROPES_HIGH, 34.5, 'beam');
  plat(-42.5, 20, ROPES_HIGH);
  spot({ id: 'zip', kind: 'zip', x: -42.5, y: ROPES_HIGH, z: 19.6, r: 1.6, label: '🧗 Zip line!', ride: 'zip' });
}

// Runes for the Wand Quest, hidden around the lodge. Wave the wand at each one.
export const RUNES: { x: number; y: number; z: number; where: string }[] = [
  { x: -12, y: 2.2, z: 39.6, where: 'the lobby' },
  { x: 18.2, y: 3.4, z: 34, where: 'the fireplace' },
  { x: 0, y: 1.6, z: 31, where: 'the big tree' },
  { x: 65.6, y: 1.6, z: 25, where: 'the end of the hall' },
  { x: -40, y: 1.6, z: 10.4, where: 'the adventure wing' },
  { x: -51.5, y: ROPES_Y + 1.2, z: 37.2, where: 'the ropes course' },
  { x: -42.5, y: ROPES_HIGH + 1.2, z: 37.2, where: 'the top of the ropes course' },
  { x: 14, y: 1.2, z: 46, where: 'outside by the sign' },
];
RUNES.forEach((r, i) =>
  spot({ id: `rune${i}`, kind: 'rune', x: r.x, y: r.y > ROPES_Y ? (r.y > ROPES_HIGH ? ROPES_HIGH : ROPES_Y) : 0, z: r.z, r: 2.6, label: '✨ Wave the wand', rune: i }),
);

// ---------------------------------------------------------------- the water park

wall(PARK.z0, PARK.x0, PARK.x1, PARK.h, 'log', [[-40, -6, 9, 19], [6, 40, 9, 19]]);
wall(PARK.x0, PARK.z0, ADV.z0, PARK.h, 'log', [[-80, -50, 8, 19], [-40, -5, 8, 19]], true);
wall(PARK.x1, PARK.z0, PARK.z1, PARK.h, 'log', [[-80, -50, 3, 19], [-40, -5, 3, 19]], true);
box(PARK.x0, PARK.h, PARK.z0, PARK.x1, PARK.h + 0.3, PARK.z1, 'none'); // the glass roof (drawn by the view)

// ---------------------------------------------------------------- outside

// The rooms wing and the adventure wing seen from outside are their walls; this closes the gaps.
wall(42, 20, 41, HALL.h, 'plaster');

export const START: { x: number; z: number; yaw: number } = { x: 0, z: 54, yaw: Math.PI };

// ---------------------------------------------------------------- queries

/** Is (x, z) inside a box's footprint (grown by r)? */
const inside = (b: Box, x: number, z: number, r = 0) => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r;

/** Extra dips in the floor that aren't rectangles (the lazy river): set by the rides module. */
export const dips: { depthAt: (x: number, z: number) => number }[] = [];

/** The floor's own height at (x, z): 0, or the bottom of a pool. */
export function floorAt(x: number, z: number) {
  let f = 0;
  for (const p of pools) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) f = Math.min(f, -p.depth);
  for (const d of dips) f = Math.min(f, -d.depthAt(x, z));
  return f;
}

/** Shut doors are solid (and an open door's leaf). */
export const doorOpen: boolean[] = doors.map(() => false);
const solid = (b: Box) => b.door === undefined || (b.leaf ? doorOpen[b.door] : !doorOpen[b.door]);

export interface Ground { h: number; box: Box | null }
/** The highest floor under (x, z) no more than `step` above the feet. */
export function groundAt(x: number, z: number, feet: number, step: number): Ground {
  let h = floorAt(x, z), hit: Box | null = null;
  for (const b of boxes) {
    if (b.y1 > h && b.y1 <= feet + step && inside(b, x, z) && solid(b)) {
      h = b.y1;
      hit = b;
    }
  }
  return { h, box: hit };
}

/** Push a circle (radius r, from feet to feet + height) out of every wall it overlaps. Returns the push. */
export function pushOut(x: number, z: number, r: number, feet: number, height: number, step: number) {
  let px = 0, pz = 0;
  for (const b of boxes) {
    if (b.y1 <= feet + step || b.y0 >= feet + height || !solid(b) || !inside(b, x + px, z + pz, r)) continue;
    const cx = Math.max(b.x0, Math.min(b.x1, x + px)), cz = Math.max(b.z0, Math.min(b.z1, z + pz));
    let dx = x + px - cx, dz = z + pz - cz;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      if (d < r) {
        px += (dx / d) * (r - d);
        pz += (dz / d) * (r - d);
      }
    } else {
      // The centre is inside the box: leave by the nearest side.
      const opts = [[b.x0 - r - (x + px), 0], [b.x1 + r - (x + px), 0], [0, b.z0 - r - (z + pz)], [0, b.z1 + r - (z + pz)]];
      opts.sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(q[0]) - Math.abs(q[1]));
      dx = opts[0][0];
      dz = opts[0][1];
      px += dx;
      pz += dz;
    }
  }
  return { px, pz };
}

/** The lowest ceiling above a point (for jumping and for the camera). */
export function ceilingAt(x: number, z: number, above: number) {
  let c = Infinity;
  for (const b of boxes) if (b.y0 >= above && b.y0 < c && inside(b, x, z) && solid(b)) c = b.y0;
  return c;
}

/** How far a ray from `o` along unit `d` goes before it hits a box (up to `max`). For the camera. */
export function rayDist(o: V3, d: V3, max: number) {
  let best = max;
  for (const b of boxes) {
    if (b.mat === 'none' && b.door === undefined && !b.camera) continue;
    if (!solid(b)) continue;
    let t0 = 0, t1 = best;
    const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < lo[k] || o[k] > hi[k]) ok = false;
        continue;
      }
      let a = (lo[k] - o[k]) / d[k], c = (hi[k] - o[k]) / d[k];
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) ok = false;
    }
    if (ok && t0 < best && t0 > 0) best = t0;
  }
  return best;
}

/** Which named area a point is in (for the HUD and for swimsuits). */
export function areaAt(x: number, z: number): 'outside' | 'lobby' | 'hall' | 'room' | 'adventure' | 'park' {
  const inR = (r: { x0: number; x1: number; z0: number; z1: number }) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  if (inR(PARK)) return 'park';
  if (inR(LOBBY)) return 'lobby';
  if (inR(HALL)) return 'hall';
  if (ROOMS.some(inR)) return 'room';
  if (inR(ADV)) return 'adventure';
  return 'outside';
}
