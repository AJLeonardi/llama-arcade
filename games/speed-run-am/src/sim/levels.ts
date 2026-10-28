// The workout room (where every level starts) and the 10 levels. Levels 1-9 are made by `makeLevel(num)`:
// the same rooms in a row, harder each time, with a bigger maze. Level 10 is the Big Jump.
// Everything is laid out along +z, centred on x = 0.
import { deadEnds, makeMaze, rng } from './maze';
import type { Block, Kind, Level, V3 } from './types';

export const PINK = '#f06aa8';
export const BROWN = '#8b5a3c';
/** Letters always take turns pink, brown, pink, brown... */
export const LETTERS = [PINK, BROWN];
/** The maze's walls take turns in these. */
export const MAZE_COLORS = ['#e03131', '#fab005', '#9c36b5', '#f06aa8'];
export const GOO = '#9be15d';
export const POOP = '#7a4a24';

export const LEVEL_INFO: { name: string; emoji: string }[] = [
  { name: 'Workout Room', emoji: '🏋️' },
  { name: 'Baby', emoji: '🍼' },
  { name: 'Youth', emoji: '🧒' },
  { name: 'Adult', emoji: '🧑' },
  { name: 'Elderly', emoji: '👵' },
  { name: 'Ghost', emoji: '👻' },
  { name: 'Robot', emoji: '🤖' },
  { name: 'Space', emoji: '🚀' },
  { name: 'Lava', emoji: '🌋' },
  { name: 'Mega Maze', emoji: '🌀' },
  { name: 'The Big Jump', emoji: '🪵' },
];
export const LAST_LEVEL = 10;

/** Collects blocks and the moving things for one level. */
class Build {
  blocks: Block[] = [];
  /** Floors are giant keyboards, with letters in these colours. */
  keys: string[] | undefined;
  level: Level;
  constructor(num: number, spawn: V3, sky: string) {
    const info = LEVEL_INFO[num];
    this.level = { num, name: info.name, emoji: info.emoji, spawn, spawnYaw: 0, blocks: this.blocks, chasers: [], boulders: [], poops: [], signs: [], fallY: -12, sky };
  }
  /** A box by its centre and size. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, kind: Kind, color: string, more: Partial<Block> = {}) {
    const b: Block = { x, y, z, w, h, d, kind, color, ...more };
    this.blocks.push(b);
    return b;
  }
  /** A box by its corners (x0..x1, y0..y1, z0..z1). */
  span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, kind: Kind, color: string, more: Partial<Block> = {}) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, kind, color, more);
  }
  /** A floor whose top is at `top`. */
  floor(x0: number, x1: number, z0: number, z1: number, top: number, color: string, kind: Kind = 'solid') {
    return this.span(x0, x1, top - 1, top, z0, z1, kind, color, kind === 'solid' && this.keys ? { keyboard: this.keys } : {});
  }
  sign(x: number, y: number, z: number, text: string, size = 1.6, yaw = Math.PI) {
    this.level.signs.push({ at: [x, y, z], text, colors: LETTERS, size, yaw });
  }
}

// ---------------------------------------------------------------- the workout room

// Looking north (+z) at the doors, +x is on your left, so door 1 is at +x and they read 1, 2, 3... left to right.
export const DOOR_X = (i: number) => 31.5 - 7 * i;
const HUB_N = 37; // the north wall, with the 10 doors

export function workoutRoom(): Level {
  const B = new Build(0, [0, 0, -14], '#f6dbe8');
  const wallC = '#fbeef4';
  B.floor(-39, 39, -27, 38, 0, '#e9d3bf');
  // Walls all round; the north one has the doors.
  B.span(-40, -39, 0, 9, -28, 38, 'solid', wallC);
  B.span(39, 40, 0, 9, -28, 38, 'solid', wallC);
  B.span(-40, 40, 0, 9, -28, -27, 'solid', wallC);
  let x = 39;
  for (let i = 0; i < 10; i++) {
    const dx = DOOR_X(i);
    B.span(dx + 1.8, x, 0, 9, HUB_N, HUB_N + 1, 'solid', wallC);
    B.span(dx - 1.8, dx + 1.8, 4.5, 9, HUB_N, HUB_N + 1, 'solid', wallC);
    B.span(dx - 1.8, dx + 1.8, 0, 4.5, HUB_N, HUB_N + 1, 'door', i % 2 ? BROWN : PINK, { level: i + 1 });
    // Door frame.
    const c = i % 2 ? BROWN : PINK;
    B.span(dx - 2.3, dx - 1.8, 0, 5, HUB_N - 0.4, HUB_N, 'solid', c);
    B.span(dx + 1.8, dx + 2.3, 0, 5, HUB_N - 0.4, HUB_N, 'solid', c);
    B.span(dx - 2.3, dx + 2.3, 4.5, 5, HUB_N - 0.4, HUB_N, 'solid', c, { deco: true });
    B.sign(dx, 6.4, HUB_N - 0.5, String(i + 1), 2.2);
    B.level.signs.push({ at: [dx, 7.8, HUB_N - 0.5], text: LEVEL_INFO[i + 1].emoji, colors: ['#ffffff'], size: 1.2, yaw: Math.PI });
    x = dx - 1.8;
  }
  B.span(-39, x, 0, 9, HUB_N, HUB_N + 1, 'solid', wallC);

  // 7 big treadmills: they push you back, and running on them makes you faster and faster.
  for (let i = 0; i < 7; i++) {
    const tx = 34 - i * 4.4;
    B.span(tx - 1.6, tx + 1.6, 0, 0.4, -6, 6, 'treadmill', '#3d3d48', { push: [0, -5] });
    B.span(tx - 1.6, tx + 1.6, 0, 1.4, 6, 7, 'solid', '#5c5f6e'); // the front, where the screen is
    B.span(tx - 1.6, tx + 1.6, 1.4, 1.6, 6.2, 7.2, 'solid', '#9ad1ff', { deco: true }); // screen
    for (const s of [-1, 1]) B.span(tx + s * 1.6 - 0.1, tx + s * 1.6 + 0.1, 0.4, 1.5, 3, 6, 'solid', '#c9ccd6', { deco: true });
  }
  B.sign(20, 6, -26.4, 'TREADMILLS', 1.5, 0);

  // The giant keyboard: every new key you step on makes you a tiny bit faster.
  ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].forEach((row, r) => {
    [...row].forEach((letter, k) => {
      const kx = -(9 + r * 1.3 + k * 2.7), kz = 4 - r * 2.7;
      B.box(kx, 0.175, kz, 2.4, 0.35, 2.4, 'key', '#fafafa', { letter });
    });
  });
  B.sign(-22, 6, -26.4, 'KEYBOARD', 1.5, 0);
  B.sign(0, 6.5, -26.4, 'WORKOUT ROOM', 1.6, 0);

  // The cape, on a stand in the middle.
  B.span(-1, 1, 0, 1, -3, -1, 'solid', '#ffd43b');
  B.span(-0.8, 0.8, 1, 3, -2.8, -1.2, 'cape', '#e03131');

  // Things to look at: dumbbell racks and benches.
  for (let i = 0; i < 4; i++) {
    const rx = 10 + i * 7;
    B.span(rx - 2.5, rx + 2.5, 0, 0.9, 25, 27, 'solid', '#495057');
    for (let k = 0; k < 4; k++) B.span(rx - 2 + k * 1.3, rx - 1.6 + k * 1.3, 0.9, 1.4, 25.3, 26.7, 'solid', '#212529', { deco: true });
    B.span(rx - 3.5, rx - 0.5, 0, 0.7, 16, 17.2, 'solid', i % 2 ? BROWN : PINK);
  }
  return B.level;
}

// ---------------------------------------------------------------- levels 1-9

export function makeLevel(num: number): Level {
  if (num === LAST_LEVEL) return bigJump();
  if (num === 0) return workoutRoom();
  const d = num - 1; // difficulty 0..8
  const pinkLevel = num % 2 === 1;
  const floorC = pinkLevel ? '#f9d3e3' : '#dcc0a6';
  const wallC = pinkLevel ? '#fde8f1' : '#efe0d0';
  const B = new Build(num, [0, 0, 3], pinkLevel ? '#ffe3f0' : '#f0e0cf');
  // The floor is always a gigantic keyboard: pink letters on level 1, brown on 2, pink on 3...
  B.keys = [pinkLevel ? PINK : BROWN];
  const rand = rng(num * 7919);
  const cp = (z0: number, z1: number, x = 2, top = 0) => B.floor(-x, x, z0, z1, top, '#69db7c', 'checkpoint');

  // Start.
  B.floor(-5, 5, 0, 10, 0, floorC);
  cp(10, 14);
  let z = 14;

  // 1. The chase room: someone chases you to the far door.
  const L = 24 + 2 * d;
  const z0 = z, z1 = z + L;
  B.floor(-11, 11, z0, z1, 0, floorC);
  B.span(-12, -11, -1, 3, z0, z1, 'solid', wallC);
  B.span(11, 12, -1, 3, z0, z1, 'solid', wallC);
  B.span(-12, 12, 3, 6.5, z0 - 1, z0, 'solid', wallC); // the south wall is taller, for the sign
  B.sign(0, 4.75, z0 - 1.05, `LEVEL ${num} ${LEVEL_INFO[num].name.toUpperCase()}`, 1.1);
  B.span(-12, -2, -1, 3, z0 - 1, z0, 'solid', wallC);
  B.span(2, 12, -1, 3, z0 - 1, z0, 'solid', wallC);
  B.span(-12, -2, -1, 3, z1, z1 + 1, 'solid', wallC);
  B.span(2, 12, -1, 3, z1, z1 + 1, 'solid', wallC);
  for (let i = 0; i < 4 + d; i++) {
    const px = -8 + rand() * 16, pz = z0 + 7 + rand() * (L - 14); // not in front of the doors
    B.span(px - 1, px + 1, 0, 3, pz - 1, pz + 1, 'solid', pinkLevel ? BROWN : PINK);
  }
  B.span(-2, 2, 0, 3, z0, z0 + 1.5, 'zone', '', { tag: 'chase' });
  const chasers = 1 + (d >= 4 ? 1 : 0) + (d >= 7 ? 1 : 0);
  for (let i = 0; i < chasers; i++) {
    const side = i % 2 ? -1 : 1;
    B.level.chasers.push({ home: [side * 8, 0, z0 + L * (0.45 + 0.2 * i)], speed: 4.3 + 0.3 * d, room: [-11, z0, 11, z1], tag: 'chase' });
  }
  cp(z1, z1 + 4);
  z = z1 + 4;

  // 2. The boulder: it rolls down the corridor at you. Hide in the holes in the walls!
  const Lb = 40 + 4 * d;
  const b0 = z, b1 = z + Lb;
  B.floor(-3, 3, b0, b1, 0, floorC);
  const gaps: [number, number][] = [];
  const every = 9 + d * 0.5;
  let side = 1;
  for (let az = b0 + 7; az < b1 - 4; az += every, side = -side) {
    gaps.push([az, side]);
    B.span(side > 0 ? 3 : -6.5, side > 0 ? 6.5 : -3, -1, 0, az - 1.5, az + 1.5, 'solid', floorC, { keyboard: B.keys });
    B.span(side > 0 ? 6.5 : -7.5, side > 0 ? 7.5 : -6.5, -1, 6, az - 2.5, az + 2.5, 'solid', wallC);
    B.span(side > 0 ? 3 : -7.5, side > 0 ? 7.5 : -3, -1, 6, az - 2.5, az - 1.5, 'solid', wallC);
    B.span(side > 0 ? 3 : -7.5, side > 0 ? 7.5 : -3, -1, 6, az + 1.5, az + 2.5, 'solid', wallC);
  }
  for (const s of [-1, 1]) {
    let from = b0;
    for (const [az, gs] of gaps) {
      if (gs !== s) continue;
      B.span(s > 0 ? 3 : -4, s > 0 ? 4 : -3, -1, 6, from, az - 1.5, 'solid', wallC);
      from = az + 1.5;
    }
    B.span(s > 0 ? 3 : -4, s > 0 ? 4 : -3, -1, 6, from, b1, 'solid', wallC);
  }
  B.level.boulders.push({ x: 0, y: 0, z0: b1 - 2.7, z1: b0 + 2.7, r: 2.7, speed: 8 + 0.8 * d, wait: 1.5 });
  cp(b1, b1 + 4, 3);
  z = b1 + 4;

  // 3. Jumps over green goo.
  const jumps = 5 + d;
  const gap = Math.min(4, 2.4 + 0.2 * d);
  const size = Math.max(2.2, 3 - 0.1 * d);
  const j0 = z;
  for (let i = 0; i < jumps; i++) {
    z += gap;
    const top = d >= 2 && i % 2 ? 0.6 : 0;
    const px = (rand() - 0.5) * 2;
    const moving = d >= 3 && i % 3 === 1;
    B.box(moving ? px - 1.5 : px, top - 0.5, z + size / 2, size, 1, size, 'solid', i % 2 ? BROWN : PINK,
      { keyboard: B.keys, ...(moving ? { move: { dx: 3, dy: 0, dz: 0, period: 4.5 - 0.2 * d, phase: rand() } } : {}) });
    z += size;
  }
  z += gap;
  B.span(-20, 20, -5, -4, j0, z, 'goo', GOO);
  cp(z, z + 4);
  z += 4;

  // 4. Closing walls: get through while they're open.
  const gates = 1 + Math.floor(d / 2);
  const g0 = z, g1 = z + gates * 6 + 2;
  B.floor(-4, 4, g0, g1, 0, floorC);
  for (const s of [-1, 1]) {
    let from = g0;
    for (let k = 0; k < gates; k++) {
      const gz = g0 + 4 + k * 6;
      B.span(s > 0 ? 4 : -5, s > 0 ? 5 : -4, -1, 4.5, from, gz - 0.6, 'solid', wallC);
      from = gz + 0.6;
    }
    B.span(s > 0 ? 4 : -5, s > 0 ? 5 : -4, -1, 4.5, from, g1, 'solid', wallC);
  }
  for (let k = 0; k < gates; k++) {
    const gz = g0 + 4 + k * 6;
    for (const s of [-1, 1]) {
      B.box(s * 6, 2.25, gz, 4, 4.5, 1.2, 'crush', '#ff6b6b', { move: { dx: -s * 4, dy: 0, dz: 0, period: Math.max(2.4, 3.6 - 0.15 * d), phase: k * 0.3 } });
    }
  }
  cp(g1, g1 + 4);
  z = g1 + 4;

  // 5. Climb before the poop gets you! It rises once you step in.
  const H = 14 + 2 * d;
  const s0 = z, cz = s0 + 6;
  B.floor(-6, 6, s0, s0 + 12, 0, floorC);
  B.span(-7, -6, -1, H + 3, s0 - 1, s0 + 13, 'solid', wallC);
  B.span(6, 7, -1, H + 3, s0 - 1, s0 + 13, 'solid', wallC);
  B.span(-6, -2, -1, H + 3, s0 - 1, s0, 'solid', wallC);
  B.span(2, 6, -1, H + 3, s0 - 1, s0, 'solid', wallC);
  B.span(-2, 2, 4.5, H + 3, s0 - 1, s0, 'solid', wallC); // a tall doorway
  B.span(-6, -2, -1, H + 3, s0 + 12, s0 + 13, 'solid', wallC);
  B.span(2, 6, -1, H + 3, s0 + 12, s0 + 13, 'solid', wallC);
  B.span(-2, 2, -1, H, s0 + 12, s0 + 13, 'solid', wallC);
  // Steps round and round the walls, starting in a corner (not in front of the doorway, where you'd bonk your
  // head trying to get on it) and ending next to the top deck.
  const ring: [number, number][] = [[4, -4], [4, 0], [4, 4], [0, 4], [-4, 4], [-4, 0], [-4, -4], [0, -4]];
  let n = 2; // the last step is ring[1], next to the deck
  while ((H - 1.2) / n > 1.6) n += 8;
  const rise = (H - 1.2) / n;
  for (let i = 0; i < n; i++) {
    const [rx, rz] = ring[i % 8];
    B.box(rx, (i + 1) * rise - 0.25, cz + rz, 2.6, 0.5, 2.6, 'solid', i % 2 ? BROWN : PINK, { keyboard: B.keys });
  }
  B.span(-6, 6, H - 0.5, H, s0 + 9, s0 + 12, 'solid', floorC, { keyboard: B.keys });
  B.span(-2, 2, 0, 4.5, s0, s0 + 1.5, 'zone', '', { tag: 'poop' });
  const poopSpeed = H / (n * 1.7 + 4 - 0.4 * d);
  B.level.poops.push({ area: [-6, s0, 6, s0 + 12], y0: -1.5, y1: H - 0.6, speed: poopSpeed, delay: 3, tag: 'poop' });
  B.sign(0, 5, s0 + 11.9, 'CLIMB!', 1.6);
  z = s0 + 13;
  B.floor(-2, 2, z, z + 3, H, '#69db7c', 'checkpoint');
  z += 3;

  // 6. The maze: dead ends are traps that send you all the way back to the start.
  const N = 4 + d, C = 4, T = 0.6, WH = 3.2;
  const m = makeMaze(N, num * 1013 + 7);
  const ox = -(m.entry + 0.5) * C; // the way in lines up with x = 0
  const m0 = z;
  B.keys = MAZE_COLORS; // in the maze the letters go red, yellow, purple, pink
  B.floor(ox, ox + N * C, m0, m0 + N * C, H, floorC);
  let wallNo = 0;
  const mwall = (x0: number, x1: number, zz0: number, zz1: number) =>
    B.span(x0, x1, H, H + WH, zz0, zz1, 'solid', MAZE_COLORS[wallNo++ % MAZE_COLORS.length]);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const o = m.open[r * N + c];
      const x0 = ox + c * C, zz = m0 + r * C;
      if (!o[0] && !(r === N - 1 && c === m.exit)) mwall(x0 - T / 2, x0 + C + T / 2, zz + C - T / 2, zz + C + T / 2);
      if (!o[1]) mwall(x0 + C - T / 2, x0 + C + T / 2, zz - T / 2, zz + C + T / 2);
      if (r === 0 && c !== m.entry) mwall(x0 - T / 2, x0 + C + T / 2, zz - T / 2, zz + T / 2);
      if (c === 0) mwall(x0 - T / 2, x0 + T / 2, zz - T / 2, zz + C + T / 2);
    }
  }
  for (const cell of deadEnds(m)) {
    const r = Math.floor(cell / N), c = cell % N;
    B.box(ox + (c + 0.5) * C, H + 0.025, m0 + (r + 0.5) * C, 3.2, 0.05, 3.2, 'trap', floorC);
  }
  B.level.maze = N;
  const ex = ox + (m.exit + 0.5) * C;
  z = m0 + N * C;
  B.span(ex - 3, ex + 3, H - 1, H, z, z + 6, 'finish', '#ffd43b');
  B.sign(ex, H + 4, z + 5.9, 'FINISH!', 1.6);
  return B.level;
}

// ---------------------------------------------------------------- level 10

/** The Big Jump: a jump so big it can't be done, except with the magic logs. */
function bigJump(): Level {
  const B = new Build(LAST_LEVEL, [0, 0, 3], '#e7d5ff');
  B.level.fallY = -30;
  B.keys = LETTERS;
  B.floor(-5, 5, 0, 10, 0, '#f9d3e3');
  B.floor(-3, 3, 10, 40, 0, '#dcc0a6');
  B.sign(0, 6, 11, 'THE BIG JUMP', 1.8);
  B.sign(0, 3.6, 11, 'IMPOSSIBLE?', 1.2);
  B.sign(0, 4, 41, 'MAGIC LOGS', 1.4);
  let z = 40;
  let top = 0;
  for (let k = 0; k < 16; k++) {
    z += 3.4;
    top -= 0.45;
    const big = k === 7;
    const d = big ? 3 : 1.6;
    B.box(0, top - 0.35, z + d / 2, big ? 5 : 3.6, 0.7, d, big ? 'checkpoint' : 'solid', big ? '#69db7c' : '#a0673d', {
      log: true,
      move: big ? undefined : { dx: k % 2 ? 2.4 : -2.4, dy: k % 3 === 0 ? 0.8 : 0, dz: 0, period: 5 - (k % 4) * 0.4, phase: k * 0.17 },
    });
    z += d;
  }
  z += 3.4;
  B.span(-6, 6, top - 1, top, z, z + 10, 'finish', '#ffd43b');
  B.sign(0, top + 4, z + 9.9, 'YOU DID IT!', 1.8);
  B.span(-60, 60, -26, -25, 30, z + 20, 'goo', GOO);
  return B.level;
}
