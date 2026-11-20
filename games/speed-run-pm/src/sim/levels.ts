// The levels: every one is a long, wide straight road along +z, and they never run out. Each starts in a gym with
// the small free treadmills, then long keyboard stretches with obstacles (crates, rolling boulders, sliding goo)
// and one thing between each: goo to jump, a gym with the
// big treadmills right before the speed wall (you need enough speed to smash it), a jump pad, and the finish
// line. Rails on both sides. Centred on x = 0.
import { nice, short } from './numbers';
import type { Block, Kind, Level, V3 } from './types';

/** A seeded random number maker (0..1), so a level is laid out the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PURPLE = '#9775fa';
export const CYAN = '#22b8cf';
export const YELLOW = '#ffd43b';
/** Sign letters take turns purple, cyan, purple, cyan... */
export const LETTERS = [PURPLE, CYAN];
export const GOO = '#9be15d';
const RAIL = '#5f3dc4';

/**
 * The free treadmills, and how much faster each makes you. The first four are in the gym at the start of each
 * level, the last four right in front of the speed wall. In each gym: left side (+x), then right, middle out.
 */
export const GAINS = [1, 2, 3, 5, 10, 20, 50, 100];
const MILL_COLORS = ['#495057', '#1971c2', '#2f9e44', '#e8590c', '#c2255c', '#7048e8', '#f08c00', '#e03131'];

/** The speed you need to smash level `num`'s wall: 10, 30, 100, 330, 1000... and on and on. */
export function wallNeed(num: number) {
  return nice(10 * 3.2 ** (num - 1));
}

/** How long a gym is (z). */
const GYM = 29;

/** The road is this wide (x from -ROAD to ROAD). */
export const ROAD = 9;

class Build {
  blocks: Block[] = [];
  keys: string[] | undefined;
  level: Level;
  constructor(num: number, spawn: V3, sky: string) {
    this.level = { num, spawn, spawnYaw: 0, blocks: this.blocks, signs: [], boulders: [], finishZ: 0, fallY: -12, sky };
  }
  /** A box by its corners (x0..x1, y0..y1, z0..z1), in either order (a size is never negative). */
  span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, kind: Kind, color: string, more: Partial<Block> = {}) {
    const b: Block = {
      x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2,
      w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), d: Math.abs(z1 - z0),
      kind, color, ...more,
    };
    this.blocks.push(b);
    return this.blocks.length - 1;
  }
  /** A keyboard floor whose top is at y = 0. */
  floor(x0: number, x1: number, z0: number, z1: number, color = '#ffffff') {
    return this.span(x0, x1, -1, 0, z0, z1, 'solid', color, this.keys ? { keyboard: this.keys } : {});
  }
  sign(x: number, y: number, z: number, text: string, size = 1.6, more: { yaw?: number; block?: number; colors?: string[] } = {}) {
    this.level.signs.push({ at: [x, y, z], text, colors: more.colors ?? LETTERS, size, yaw: more.yaw ?? Math.PI, block: more.block });
  }
}

/**
 * Level `num`, with z = 0 at its start. Levels join up into one endless road: z = 0 is where the last level's
 * finish line was, and its finish floor still covers z -5..5 (you run straight on from it). `first` adds a
 * floor of its own there, for when the game starts on this level.
 */
export function makeLevel(num: number, first = true): Level {
  const B = new Build(num, [0, 0, 0], '#2a1f5c');
  B.keys = [num % 2 ? PURPLE : CYAN];
  const d = Math.min(num - 1, 6); // how hard: 0..6

  // Start.
  // When you run on from the last level, its road behind you is still drawn, so ours there is hidden: it's the
  // floor, rails and a back wall you can touch, going far enough back that you can't run off it.
  const hidden = !first;
  const back = first ? -10 : -80;
  B.span(-ROAD, ROAD, -1, 0, back, 5, 'solid', '#ffffff', { keyboard: B.keys, hidden });
  for (const side of [-1, 1]) B.span(side * ROAD, side * (ROAD + 0.6), 0, 1, back, 5, 'solid', RAIL, { hidden });
  B.span(-ROAD - 0.6, ROAD + 0.6, 0, first ? 1 : 8, back - 0.6, back, 'solid', RAIL, { hidden });
  B.sign(0, 4, 8, `LEVEL ${num}`, 1.4);

  /** A stretch of road from z0 to z1, with low rails on both sides so you can't fall off. */
  const road = (z0: number, z1: number) => {
    B.floor(-ROAD, ROAD, z0, z1);
    for (const side of [-1, 1]) B.span(side * ROAD, side * (ROAD + 0.6), 0, 1, z0, z1, 'solid', RAIL);
  };
  /**
   * A little gym from z0 to z0 + GYM, wider than the road, with free treadmills (half each side, faster ones
   * further out) and walls all round, open only where the road goes in and out.
   */
  const gym = (z0: number, gains: number[]) => {
    const out = ROAD + 3; // the first treadmill, clear of the road through the middle
    const z1 = z0 + GYM, half = out + (gains.length / 2) * 4.2;
    B.floor(-half, half, z0, z1);
    gains.forEach((gain, i) => {
      const side = i < gains.length / 2 ? 1 : -1;
      const x = side * (out + (i % (gains.length / 2)) * 4.2);
      const c = MILL_COLORS[GAINS.indexOf(gain)];
      B.span(x - 1.6, x + 1.6, 0, 0.4, z0 + 7, z0 + 21, 'treadmill', c, { push: [0, -5], gain });
      B.span(x - 1.6, x + 1.6, 0, 1.4, z0 + 21, z0 + 22, 'solid', '#5c5f6e'); // the front, with the screen
      B.span(x - 1.6, x + 1.6, 1.4, 1.6, z0 + 21.2, z0 + 22.2, 'solid', '#9ad1ff', { deco: true });
      for (const s of [-1, 1]) B.span(x + s * 1.6 - 0.1, x + s * 1.6 + 0.1, 0.4, 1.5, z0 + 17, z0 + 21, 'solid', '#c9ccd6', { deco: true });
      B.sign(x, 3, z0 + 22.3, `X${gain}`, 1.1, { colors: [c] });
    });
    // Walls round it. The front and back ones are taller than a jump.
    for (const side of [-1, 1]) {
      B.span(side * half, side * (half + 0.6), 0, 1, z0, z1, 'solid', RAIL);
      B.span(side * (ROAD + 0.6), side * (half + 0.6), 0, 3, z1 - 0.6, z1, 'solid', RAIL);
      B.span(side * ROAD, side * (half + 0.6), 0, 3, z0, z0 + 0.6, 'solid', RAIL);
    }
    return z1;
  };

  // The start gym: the small treadmills.
  let z = gym(5, GAINS.slice(0, 4));
  B.sign(0, 7, z, 'FREE TREADMILLS', 1.3, { colors: [YELLOW] });

  // Obstacles, placed at random but the same every time for a level. Each stretch keeps 15 clear at both ends.
  const rand = rng(num * 7919 + 13);
  const lane = (margin: number) => -ROAD + margin + rand() * (2 * (ROAD - margin));
  /** Crates in rows: jump over them or run round. They just stop you. */
  const crates = (z0: number, z1: number, rows: number) => {
    for (let r = 0; r < rows; r++) {
      const cz = z0 + ((r + 1) * (z1 - z0)) / (rows + 1);
      const xs: number[] = [];
      for (let k = 0; k < 2 + (rand() < 0.5 ? 1 : 0); k++) {
        const x = lane(1.2);
        if (xs.every((o) => Math.abs(o - x) > 3)) xs.push(x);
      }
      for (const x of xs) B.span(x - 0.9, x + 0.9, 0, 1.1, cz - 0.9, cz + 0.9, 'solid', '#b7793f', { crate: true });
    }
  };
  /** Boulders rolling down the road at you, each in its own lane. Dodge them! */
  const boulders = (z0: number, z1: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const speed = 9 + d * 1.5, wait = 1 + rand() * 2;
      const roll = (z1 - z0) / speed;
      B.level.boulders.push({ x: -ROAD + 1.6 + ((k + rand() * 0.6) * (2 * ROAD - 3.2)) / n, z0: z1, z1: z0, r: 1.4, speed, wait, phase: rand() * (roll + wait) });
    }
  };
  /** Goo blocks sliding side to side across the road. Wait for a gap, or jump them. */
  const sliders = (z0: number, z1: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const sz = z0 + ((k + 1) * (z1 - z0)) / (n + 1);
      B.span(-1, 1, 0, 1, sz - 1, sz + 1, 'goo', GOO, { slide: { dx: 2 * ROAD - 3, period: 3 + rand() * 2, phase: rand() } });
    }
  };
  const few = 2 + Math.min(d, 4); // how many of each thing: 2 on level 1, up to 6
  const things = [
    (a: number, b: number) => crates(a, b, few),
    (a: number, b: number) => boulders(a, b, few),
    (a: number, b: number) => sliders(a, b, few),
    (a: number, b: number) => (crates(a, (a + b) / 2, Math.ceil(few / 2)), boulders((a + b) / 2, b, Math.ceil(few / 2))),
  ];
  let next = 0;

  // The road: long keyboard stretches (more keys, more speed, more time), each with obstacles in the middle and
  // one thing to do between them.
  const stretch = 60 + 10 * d;
  const run = (len = stretch) => {
    road(z, z + len);
    things[next++ % things.length](z + 15, z + len - 15);
    z += len;
  };
  // 1. Goo to jump over: one on level 1, two after that. Low, with lots of road before it.
  const goos = num === 1 ? 1 : 2;
  for (let i = 0; i < goos; i++) {
    run();
    road(z, z + 6);
    B.span(-ROAD, ROAD, 0, 0.3, z + 2.4, z + 3.6, 'goo', GOO);
    z += 6;
  }
  run();

  // 2. The speed wall, with the big treadmills right in front of it: too slow? They're right here.
  B.sign(0, 7, z + 2, 'BIG TREADMILLS', 1.3, { colors: [YELLOW] });
  z = gym(z, GAINS.slice(4));
  const need = wallNeed(num);
  road(z, z + 8);
  const wall = B.span(-ROAD - 1, ROAD + 1, 0, 8, z + 4, z + 5, 'wall', num % 2 ? '#5f3dc4' : '#0c8599', { need });
  B.sign(0, 5, z + 3.9, 'SPEED', 1.4, { block: wall, colors: ['#ffffff'] });
  B.sign(0, 3, z + 3.9, short(need), 1.8, { block: wall, colors: [YELLOW] });
  z += 8;
  run();

  // 3. A jump pad, just for fun: it bounces you up high, and there's road all the way under you.
  road(z, z + 4);
  B.span(-2, 2, 0, 0.15, z + 1, z + 3, 'pad', YELLOW);
  z += 4;
  run();

  // 5. The finish line, and a big cup to run through.
  road(z, z + 10);
  B.span(-ROAD, ROAD, 0, 0.02, z + 4, z + 6, 'solid', '#ffffff', { finish: true, deco: true });
  B.level.finishZ = z + 5;
  const cx = 0, cz = z + 8;
  B.span(cx - 1, cx + 1, 0, 0.4, cz - 1, cz + 1, 'solid', YELLOW, { deco: true });
  B.span(cx - 0.3, cx + 0.3, 0.4, 1.4, cz - 0.3, cz + 0.3, 'solid', YELLOW, { deco: true });
  B.span(cx - 1.2, cx + 1.2, 1.4, 3.2, cz - 1.2, cz + 1.2, 'solid', YELLOW, { deco: true });
  B.span(cx - 1.9, cx - 1.2, 2, 2.8, cz - 0.2, cz + 0.2, 'solid', YELLOW, { deco: true });
  B.span(cx + 1.2, cx + 1.9, 2, 2.8, cz - 0.2, cz + 0.2, 'solid', YELLOW, { deco: true });
  B.sign(0, 6, z + 4, 'FINISH', 1.6, { colors: [YELLOW, '#ffffff'] });
  return B.level;
}
