// The hub island and the obbies. Each obby runs forward along +z from its start pad to the finish.
// tests/levels.test.ts checks every jump on each main path is possible.
import { coasterPark } from './coaster';
import { Course } from './course';
import { jailBreak } from './prison';
import { burgerPlace } from './burger';
import { rocketLab } from './rocket';
import { FISH_LEVELS } from './fishLevels';
import type { Block, Level, V3 } from './types';

const PI = Math.PI;

// ---------------------------------------------------------------- obby 1: Rainbow Run (easy)

function rainbowRun(): Level {
  const c = new Course(['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa']);
  c.add({ w: 8, d: 8, color: '#8ce99a' });
  c.add({ gap: 1.5, coin: true });
  c.add({ gap: 1.5, side: 2 });
  c.add({ gap: 1.5, side: -2, coin: true });
  c.add({ gap: 1.5, side: -2 });
  // Up some steps.
  c.add({ gap: 2, rise: 0.8, coin: true });
  c.add({ gap: 2, rise: 0.8 });
  c.add({ gap: 2, rise: 0.8, coin: true });
  c.add({ gap: 2, w: 5, d: 4, kind: 'checkpoint', side: 2 });
  // A walkway with lava stripes to hop over.
  const walk = c.add({ gap: 1.5, w: 4, d: 25, color: '#ffd43b' });
  const z0 = walk.z - walk.d / 2;
  for (const dz of [7.5, 14.5, 21.5]) {
    c.block({ x: walk.x, y: c.top + 0.2, z: z0 + dz, w: 4, h: 0.4, d: 1, kind: 'lava' });
    c.coin(walk.x, c.top + 2.4, z0 + dz);
  }
  // Boing! up to a high platform.
  c.add({ gap: 2, kind: 'bounce' });
  c.add({ gap: 3.5, rise: 5, w: 5, d: 4, coin: true });
  c.add({ gap: 2.5, side: 2.5, coin: true });
  c.add({ gap: 2.5, side: -2.5 });
  // Speed pad, then a long jump.
  c.add({ gap: 1.5, w: 3, d: 6, kind: 'speed' });
  c.add({ gap: 5, w: 5, d: 4, coin: true });
  c.add({ gap: 2, w: 8, d: 8, kind: 'finish' });
  const [x, y, z] = c.end;
  c.coin(x, y + 1.3, z - 4);
  return {
    id: 'rainbow',
    name: 'Rainbow Run',
    emoji: '🌈',
    spawn: [0, 0, 2],
    spawnYaw: 0,
    blocks: c.blocks,
    coins: c.coins,
    reward: 15,
    fallY: -20,
    sky: ['#5ab8f0', '#cdeeff'],
    path: c.path,
  };
}

// ---------------------------------------------------------------- obby 2: Candy Climb (medium)

function candyClimb(): Level {
  const c = new Course(['#ff8cc6', '#ffffff', '#9be7ff', '#ffe066', '#b2f2bb']);
  c.add({ w: 8, d: 8, color: '#ffc9e3' });
  // Stairs up.
  for (let i = 0; i < 4; i++) c.add({ gap: 1.5, rise: 1, w: 3, d: 2, coin: i % 2 === 1 });
  // A platform that slides forward and back across a big gap.
  c.add({ gap: 2, move: { dx: 0, dy: 0, dz: 6, period: 5 } });
  c.add({ gap: 8, w: 5, d: 4, kind: 'checkpoint', coin: true });
  // Wobbly purple blocks: they vanish soon after you land, so keep going!
  for (let i = 0; i < 4; i++) c.add({ gap: 1.5, w: 2.5, d: 2.5, kind: 'vanish', side: i % 2 ? 1.5 : -1.5, coin: i === 2 });
  c.add({ gap: 1.5, w: 4, d: 3 });
  // A conveyor pushing you sideways: walk straight against it.
  const belt = c.add({ gap: 1.5, w: 4, d: 12, kind: 'conveyor', push: [2.5, 0] });
  c.coin(belt.x, c.top + 1.3, belt.z);
  c.add({ gap: 1.5, w: 4, d: 3 });
  // A lift going up and down, to a high ledge.
  c.add({ gap: 2, move: { dx: 0, dy: 5, dz: 0, period: 6 } });
  c.add({ gap: 2, rise: 5, w: 5, d: 4, kind: 'checkpoint', coin: true });
  // Side-to-side sliders.
  c.add({ gap: 2, move: { dx: 4, dy: 0, dz: 0, period: 4 } });
  c.add({ gap: 2, move: { dx: 4, dy: 0, dz: 0, period: 4, phase: 0.5 } });
  c.add({ gap: 2, coin: true });
  c.add({ gap: 2, kind: 'bounce' });
  c.add({ gap: 3.5, rise: 5, w: 4, d: 4, coin: true });
  c.add({ gap: 2, w: 8, d: 8, kind: 'finish' });
  return {
    id: 'candy',
    name: 'Candy Climb',
    emoji: '🍭',
    spawn: [0, 0, 2],
    spawnYaw: 0,
    blocks: c.blocks,
    coins: c.coins,
    reward: 25,
    fallY: -20,
    sky: ['#ff9ad5', '#ffe3f1'],
    path: c.path,
  };
}

// ---------------------------------------------------------------- obby 3: Sky Castle (hard)

function skyCastle(): Level {
  const c = new Course(['#adb5bd', '#ced4da', '#868e96', '#e9ecef']);
  c.add({ w: 8, d: 8, color: '#dee2e6' });
  // Small stepping stones.
  for (let i = 0; i < 5; i++) c.add({ gap: 3, w: 2, d: 2, side: [1.5, -1.5, -1.5, 1.5, 0][i], coin: i === 2 });
  c.add({ gap: 2.5, w: 5, d: 4, kind: 'checkpoint' });
  // A walkway with lava blocks sliding across it: wait for a space and run through.
  const walk = c.add({ gap: 2, w: 6, d: 25, color: '#ced4da' });
  const z0 = walk.z - walk.d / 2;
  [7, 14, 21].forEach((dz, i) => {
    c.block({
      x: walk.x - 2.5, y: c.top + 0.75, z: z0 + dz, w: 1, h: 1.5, d: 1.2, kind: 'lava',
      move: { dx: 5, dy: 0, dz: 0, period: 3 + i * 0.5, phase: i * 0.3 },
    });
  });
  c.coin(walk.x, c.top + 1.3, z0 + 17.5);
  // Speed pad and a really long jump.
  c.add({ gap: 2, w: 3, d: 7, kind: 'speed' });
  c.add({ gap: 7, w: 4, d: 4, kind: 'checkpoint', coin: true });
  // Vanishing stones.
  for (let i = 0; i < 4; i++) c.add({ gap: 2.5, w: 2, d: 2, kind: 'vanish', side: i % 2 ? 2 : -2 });
  c.add({ gap: 2.5, w: 4, d: 3, coin: true });
  // A lift up to the castle wall.
  c.add({ gap: 2, w: 2.5, d: 2.5, move: { dx: 0, dy: 6, dz: 0, period: 6 } });
  c.add({ gap: 2.5, rise: 6, w: 6, d: 4, kind: 'checkpoint' });
  // A conveyor running backwards: run hard!
  c.add({ gap: 1.5, w: 3, d: 12, kind: 'conveyor', push: [0, -3.5] });
  c.add({ gap: 2, kind: 'bounce' });
  c.add({ gap: 3.5, rise: 5, w: 3, d: 3, coin: true });
  c.add({ gap: 3, w: 2, d: 2, side: 2 });
  c.add({ gap: 3, w: 2, d: 2, side: -2, coin: true });
  c.add({ gap: 2.5, w: 8, d: 8, kind: 'finish' });
  // Castle towers around the finish (to look at).
  const [x, y, z] = c.end;
  for (const [tx, tz] of [[-5, -9], [5, -9], [-5, 1], [5, 1]]) {
    c.block({ x: x + tx, y: y + 2, z: z + tz, w: 2, h: 4 + 1, d: 2, kind: 'solid', color: '#adb5bd' });
    c.block({ x: x + tx, y: y + 5, z: z + tz, w: 2.6, h: 1, d: 2.6, kind: 'solid', color: '#7950f2' });
  }
  return {
    id: 'castle',
    name: 'Sky Castle',
    emoji: '🏰',
    spawn: [0, 0, 2],
    spawnYaw: 0,
    blocks: c.blocks,
    coins: c.coins,
    reward: 40,
    fallY: -20,
    sky: ['#6d5ce8', '#f3c6ff'],
    path: c.path,
  };
}

// ---------------------------------------------------------------- the hub island

const OBBIES = [rainbowRun(), candyClimb(), skyCastle()];
/** Worlds with their own kind of game, through the doorways on the west side of the island. */
const WORLDS = [jailBreak(), rocketLab(), coasterPark(), burgerPlace()];

/** Portal colours, one per obby or world. */
const PORTAL_COLOR: Record<string, string> = {
  rainbow: '#4dabf7', candy: '#ff6fbf', castle: '#9775fa',
  prison: '#748ffc', rocket: '#ff922b', coaster: '#20c997', burger: '#f59f00', fish: '#15aabf',
};

function hub(): Level {
  const blocks: Block[] = [];
  const coins: V3[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, more: Partial<Block> = {}) =>
    blocks.push({ x, y, z, w, h, d, kind: 'solid', color, ...more });

  // The island: grass on top of dirt.
  box(0, -1, 0, 48, 2, 48, '#6cc04a');
  box(0, -4, 0, 44, 4, 44, '#9c6b3f');
  // A path from the middle to the portals and the shop.
  box(0, 0.05, -6, 4, 0.1, 16, '#e8d9b5', { deco: true });
  box(0, 0.05, -14, 28, 0.1, 3, '#e8d9b5', { deco: true });
  box(8, 0.05, 4, 12, 0.1, 3, '#e8d9b5', { deco: true });

  // Three portals in a row along the north side.
  OBBIES.forEach((lv, i) => {
    const x = (i - 1) * 12, z = -17;
    const col = '#f1f3f5';
    box(x - 2.4, 2.75, z, 1, 5.5, 1, col);
    box(x + 2.4, 2.75, z, 1, 5.5, 1, col);
    box(x, 6, z, 5.8, 1, 1, PORTAL_COLOR[lv.id]);
    box(x, 0.15, z + 1.5, 5.8, 0.3, 2, PORTAL_COLOR[lv.id]);
    blocks.push({ x, y: 2.75, z, w: 3.8, h: 5.5, d: 0.6, kind: 'portal', color: PORTAL_COLOR[lv.id], level: lv.id });
  });

  // Four more along the west side, facing east.
  WORLDS.forEach((lv, i) => {
    const x = -21, z = -9 + i * 8;
    box(x, 2.75, z - 2.4, 1, 5.5, 1, '#f1f3f5');
    box(x, 2.75, z + 2.4, 1, 5.5, 1, '#f1f3f5');
    box(x, 6, z, 1, 1, 5.8, PORTAL_COLOR[lv.id]);
    box(x + 1.5, 0.15, z, 2, 0.3, 5.8, PORTAL_COLOR[lv.id]);
    blocks.push({ x, y: 2.75, z, w: 0.6, h: 5.5, d: 3.8, kind: 'portal', color: PORTAL_COLOR[lv.id], level: lv.id });
  });
  // Fish Tank to the Ocean, on the east side, facing west.
  {
    const x = 21, z = -4, c = PORTAL_COLOR.fish;
    box(x, 2.75, z - 2.4, 1, 5.5, 1, '#f1f3f5');
    box(x, 2.75, z + 2.4, 1, 5.5, 1, '#f1f3f5');
    box(x, 6, z, 1, 1, 5.8, c);
    box(x - 1.5, 0.15, z, 2, 0.3, 5.8, c);
    blocks.push({ x, y: 2.75, z, w: 0.6, h: 5.5, d: 3.8, kind: 'portal', color: c, level: 'fish' });
    box(12.5, 0.05, -4, 15, 0.1, 3, '#e8d9b5', { deco: true });
  }
  box(-11, 0.05, 1, 18, 0.1, 3, '#e8d9b5', { deco: true });
  box(-18.5, 0.05, 3, 3, 0.1, 30, '#e8d9b5', { deco: true });

  // The dress-up shop: a counter under a striped awning. Walk in to shop.
  const sx = 15, sz = 4;
  box(sx + 2.5, 1.5, sz, 1, 3, 6, '#fff0f6');
  box(sx - 2.5, 1.5, sz - 2.5, 0.6, 3, 0.6, '#fff0f6');
  box(sx - 2.5, 1.5, sz + 2.5, 0.6, 3, 0.6, '#fff0f6');
  for (let k = 0; k < 6; k++) box(sx, 3.3, sz - 2.5 + k, 6, 0.4, 1, k % 2 ? '#ffffff' : '#e23d8f');
  box(sx + 1.6, 0.6, sz, 1, 1.2, 4, '#ffc83d');
  blocks.push({ x: sx - 0.5, y: 1.5, z: sz, w: 3, h: 3, d: 4, kind: 'shop', color: '#e23d8f' });

  // Trees (climbable!).
  for (const [tx, tz] of [[-12, 20], [-6, 19], [18, 18], [-8, -8], [19, -10], [-8, 14]]) {
    box(tx, 1.5, tz, 1, 3, 1, '#8a5a2b');
    box(tx, 3.8, tz, 3.4, 2.2, 3.4, '#2f9e44');
    box(tx, 5.4, tz, 2, 1, 2, '#40c057');
  }
  // A little jump tower with a trampoline next to it.
  box(-11, 1, 9, 4, 2, 4, '#ffd43b');
  box(-11, 2.5, 9, 3, 1, 3, '#ff922b');
  box(-11, 3.5, 9, 2, 1, 2, '#ff6b6b');
  blocks.push({ x: 8, y: 0.15, z: 13, w: 3, h: 0.3, d: 3, kind: 'bounce', color: '#ff4fa3' });
  box(8, 5.5, 19, 3, 1, 3, '#4dabf7');
  coins.push([8, 7.3, 19]);
  // Flowers.
  const flowers = ['#ff6b6b', '#ffd43b', '#f783ac', '#ffffff', '#b197fc'];
  for (let k = 0; k < 24; k++) {
    const fx = Math.sin(k * 12.9898) * 20, fz = 6 + Math.cos(k * 78.233) * 14;
    if (Math.abs(fx) < 3 || (fx > 8 && fz < 10) || fx < -16) continue;
    box(fx, 0.15, fz, 0.35, 0.3, 0.35, flowers[k % flowers.length], { deco: true });
  }
  // Coins to find.
  coins.push([0, 1.2, 8], [12, 1.2, 14], [-15, 1.2, -8], [-11, 5.5, 9], [18, 7.3, 18]);

  return {
    id: 'hub',
    name: 'Llama Island',
    emoji: '🏝️',
    spawn: [0, 0, 6],
    spawnYaw: PI,
    blocks,
    coins,
    reward: 0,
    fallY: -15,
    sky: ['#5ab8f0', '#d8f3ff'],
  };
}

export const LEVELS: Record<string, Level> = Object.fromEntries(
  [hub(), ...OBBIES, ...WORLDS, ...FISH_LEVELS.map((f) => f.level)].map((l) => [l.id, l]),
);
export const OBBY_IDS = OBBIES.map((l) => l.id);
export const WORLD_IDS = WORLDS.map((l) => l.id);
