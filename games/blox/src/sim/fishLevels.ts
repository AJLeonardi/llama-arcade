// The seven levels of Fish Tank to the Ocean, from the pet store to the Pacific. Each one runs forward
// along +z. Every level has a `route` that the robot in tests/fish.test.ts rolls along with the real physics.
// Rules of thumb (bowl): a jump goes ~1.6 up and ~4.5 across at speed 7; falls of more than ~5 crack it.
import type { FishLevel, Ramp, RouteStep, Vessel, Water } from './fish';
import type { Block, Level, V3 } from './types';

const PARK = 200;

class Build {
  blocks: Block[] = [];
  coins: V3[] = [];
  ramps: Ramp[] = [];
  waters: Water[] = [];
  signs: NonNullable<Level['signs']> = [];
  route: RouteStep[] = [];

  /** A box by its extents. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, more: Partial<Block> = {}) {
    const b: Block = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, w: x1 - x0, h: y1 - y0, d: z1 - z0, kind: 'solid', color, ...more };
    this.blocks.push(b);
    return b;
  }

  /** A floor from x0..x1, z0..z1 with its top at `top`. */
  floor(x0: number, x1: number, z0: number, z1: number, top: number, color: string, more: Partial<Block> = {}, h = 1) {
    return this.box(x0, x1, top - h, top, z0, z1, color, more);
  }

  deco(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, more: Partial<Block> = {}) {
    return this.box(x0, x1, y0, y1, z0, z1, color, { deco: true, ...more });
  }

  /** A slope from x0..x1, z0..z1: its top is y0 at the low end of `along` and y1 at the other. */
  ramp(x0: number, x1: number, z0: number, z1: number, along: 'x' | 'z', y0: number, y1: number, color: string) {
    this.ramps.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, along, y0, y1, color });
  }

  zone(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tag: string) {
    this.blocks.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, w: x1 - x0, h: y1 - y0, d: z1 - z0, kind: 'zone', color: '#000000', tag });
  }

  /** A pipe or gutter running along z: a floor with low walls each side. */
  channel(x0: number, x1: number, z0: number, z1: number, top: number, color: string, wall = 1.3, more: Partial<Block> = {}) {
    this.floor(x0, x1, z0, z1, top, color, more);
    this.box(x0 - 0.5, x0, top - 1, top + wall, z0, z1, color);
    this.box(x1, x1 + 0.5, top - 1, top + wall, z0, z1, color);
  }

  coin(x: number, top: number, z: number) {
    this.coins.push([x, top + 0.9, z]);
  }

  water(x: number, top: number, z: number, vessel: Vessel) {
    this.waters.push({ at: [x, top, z], vessel });
  }

  sign(x: number, y: number, z: number, text: string, color: string, size = 0.9) {
    this.signs.push({ at: [x, y, z], text, color, size });
  }

  go(x: number, y: number, z: number, more: Omit<RouteStep, 'to'> = {}) {
    this.route.push({ to: [x, y, z], ...more });
  }

  level(id: string, name: string, emoji: string, start: V3, reward: number, sky: [string, string], fallY: number, extra: Partial<FishLevel> & { tip: string; done: string }): FishLevel {
    // The walker (hidden in these levels) waits on a block up in the sky, out of the way.
    this.box(-1, 1, PARK - 1, PARK, -1, 1, sky[0]);
    return {
      level: { id, name, emoji, spawn: [0, PARK, 0], spawnYaw: 0, blocks: this.blocks, coins: this.coins, reward, fallY, sky, signs: this.signs },
      start,
      ramps: this.ramps,
      waters: this.waters,
      route: this.route,
      ...extra,
    };
  }
}

// ---------------------------------------------------------------- 1: Pet Store → home → out through the filter

function petStore(): FishLevel {
  const b = new Build();
  // The pet store. You start on the shelf with the other bowls.
  b.floor(-8, 8, -5, 33, 0, '#dee2e6');
  b.box(-9, -8, 0, 3, -5, 33, '#74c0fc');
  b.box(8, 9, 0, 3, -5, 33, '#74c0fc');
  b.box(-9, 9, 0, 3, -6, -5, '#74c0fc');
  b.box(-9, 9, 0, 3, 33, 34, '#74c0fc');
  b.box(-2, 2, 0, 2.5, -4.5, 2, '#a9744f');
  b.ramp(-1.5, 1.5, 2, 8, 'z', 2.5, 0, '#c8956d');
  // Tanks of other fish along the walls (to look at), and shelves to roll round.
  for (const z of [6, 16]) {
    b.box(-8, -6.5, 0, 2.6, z - 4, z + 4, '#4dabf7');
    b.box(6.5, 8, 0, 2.6, z - 4, z + 4, '#63e6be');
  }
  b.box(-8, 1, 0, 1.6, 13, 14.5, '#f08c00');
  b.box(-1, 8, 0, 1.6, 19, 20.5, '#f08c00');
  // The counter, and the buyer's bag.
  b.box(-8, -1, 0, 2.2, 26, 28.5, '#868e96');
  b.deco(2.8, 5.2, 0, 1.3, 26.3, 26.5, '#c8956d');
  b.deco(2.8, 5.2, 0, 1.3, 28.5, 28.7, '#c8956d');
  b.deco(2.8, 3, 0, 1.3, 26.3, 28.7, '#c8956d');
  b.deco(5, 5.2, 0, 1.3, 26.3, 28.7, '#c8956d');
  b.zone(3, 5, 0, 1.5, 26.5, 28.5, 'buy');
  b.sign(0, 5, 32.5, '🐠 Llama Pets', '#1c7ed6', 1.1);
  b.sign(4, 3.2, 27.5, '🛍️ Roll into the bag!', '#e8590c');
  for (const [x, z] of [[0, 10], [4.5, 13.7], [-4.5, 19.7], [0, 23.5]]) b.coin(x, 0, z);
  b.go(0, 2.5, -2.5);
  b.go(0, 2.5, 1.5, { v: 3 });
  b.go(0, 0, 9, { v: 4 });
  b.go(4.5, 0, 12);
  b.go(4.5, 0, 15.5);
  b.go(-4.5, 0, 18);
  b.go(-4.5, 0, 22);
  b.go(4, 0, 27.5, { v: 4 });

  // Home: the living room. Get to the filter on the big aquarium before time runs out!
  const X = 60;
  b.floor(X - 15, X + 15, -5, 56, 0, '#c08a5a');
  b.box(X - 16, X - 15, 0, 4, -5, 56, '#fff3bf');
  b.box(X + 15, X + 16, 0, 4, -5, 56, '#fff3bf');
  b.box(X - 16, X + 16, 0, 4, -6, -5, '#fff3bf');
  b.box(X - 16, X + 16, 0, 4, 56, 57, '#fff3bf');
  b.deco(X - 8, X + 8, 0, 0.03, 0, 10, '#7048e8');
  // Toy blocks, and a toy train going back and forth: don't get bumped!
  b.box(X - 6.6, X - 5.4, 0, 1.2, 3.4, 4.6, '#fa5252');
  b.box(X + 5.4, X + 6.6, 0, 1.2, 4.4, 5.6, '#228be6');
  b.box(X + 1.4, X + 2.6, 0, 1.2, 7.4, 8.6, '#fab005');
  b.box(X - 14.5, X - 11.5, 0, 1.4, 11.5, 13, '#e03131', { move: { dx: 26, dy: 0, dz: 0, period: 7 } });
  // Coffee table with a water bottle on it (only a fish can jump that high).
  b.box(X + 2, X + 7, 0, 1.8, 14, 17, '#a1887f');
  b.water(X + 4.5, 1.8, 15.5, 'bottle');
  b.water(X - 12, 0, 4, 'bowl'); // the dog's water bowl
  // Up the pillow onto the sofa, along it, up the armrest, over to the side table, up the ruler, onto the bookshelf.
  b.ramp(X - 9.5, X - 6.5, 15, 20, 'z', 0, 1.5, '#ffd8a8');
  b.box(X - 11, X + 7, 0, 1.5, 20, 25.5, '#e03131', { kind: 'checkpoint' });
  b.box(X - 11, X + 7, 0, 3.5, 25.5, 27, '#c92a2a');
  b.box(X - 12.5, X - 11, 0, 2.3, 20, 27, '#c92a2a');
  b.box(X + 7, X + 9, 0, 2.6, 20, 27, '#c92a2a');
  b.box(X + 6.5, X + 9.5, 0, 2.6, 28.5, 32.5, '#8d6e63');
  b.ramp(X + 7, X + 9, 32.5, 37.5, 'z', 2.6, 4.2, '#ffe066');
  b.box(X + 5.5, X + 10.5, 0, 4.2, 37.5, 41.5, '#795548', { kind: 'checkpoint' });
  // The aquarium on its cabinet, and the filter. The bubble stone bounces you up to the filter's intake.
  b.box(X - 8, X + 8, 0, 3, 42, 51, '#5d4037');
  b.box(X - 3, X + 6, 3, 7, 45, 50, '#4dabf7');
  b.deco(X - 3, X + 6, 7, 7.15, 45, 50, '#343a40');
  b.box(X + 1, X + 5, 3, 3.1, 42.4, 44.6, '#5d4037', { kind: 'checkpoint' });
  b.box(X - 6.8, X - 4.8, 3, 3.2, 42.4, 44.4, '#ff4fa3', { kind: 'bounce' });
  b.box(X - 7.5, X - 4, 3, 8, 46, 51, '#adb5bd');
  b.deco(X - 6.6, X - 4.9, 8, 8.04, 48.1, 49.8, '#212529');
  b.zone(X - 6.5, X - 5, 8, 9.5, 48.2, 49.7, 'exit');
  b.sign(X - 5.8, 11, 49, '🌀 The filter: your way out!', '#1098ad');
  b.sign(X - 5.8, 5, 43.6, '🫧 Bubbles!', '#ff4fa3', 0.7);
  for (const [x, y, z] of [[-9, 0, 7], [-9, 0, 12], [-4, 1.5, 22.5], [2, 1.5, 22.5], [8, 2.6, 25], [8, 3.4, 35], [3, 3.1, 43.5], [-5.75, 8, 47.6]]) b.coin(X + x, y, z);

  b.go(X, 0, -1, { house: true });
  b.go(X - 8, 0, 6);
  b.go(X - 8, 0, 14, { v: 6 });
  b.go(X - 8, 1.5, 21.5);
  b.go(X + 5, 1.5, 22.5);
  b.go(X + 6.2, 1.5, 22.8, { jump: true, v: 3 });
  b.go(X + 8, 2.6, 23.4, { v: 3 });
  b.go(X + 8, 2.6, 26.2, { jump: true, v: 6 });
  b.go(X + 8, 2.6, 31, { v: 4 });
  b.go(X + 8, 4.2, 38.5, { v: 4 });
  b.go(X + 6.5, 4.2, 41, { v: 3 });
  b.go(X + 4, 3.1, 43.5, { v: 3 });
  b.go(X - 5.8, 3.2, 43.6, { v: 4 });
  b.go(X - 5.75, 8, 49);
  return b.level('fish', 'Fish Tank to the Ocean', '🐠', [0, 2.5, -2.5], 10, ['#ffe8cc', '#fff4e6'], -10, {
    house: { start: [X, 0, -1], time: 180 },
    tip: '🛍️ Roll into the bag to get bought!',
    done: 'You squeezed into the filter! Next: down the pipes…',
  });
}

// ---------------------------------------------------------------- 2: Down the pipes

function pipes(): FishLevel {
  const b = new Build();
  const P = '#b08968'; // copper
  b.box(-2, 2, -1, 1.3, -4, -3.5, P);
  b.channel(-1.5, 1.5, -3.5, 3, 0, P);
  b.channel(-1.5, 1.5, 3, 18, 0, '#8ecae6', 1.3, { kind: 'conveyor', push: [0, 3] });
  b.channel(-1.5, 1.5, 18, 20, 0, P);
  b.sign(0, 3, 1, '💧 Whoosh! Ride the water', '#1971c2');
  // Down a long slope and through the U-bend.
  b.ramp(-1.5, 1.5, 20, 30, 'z', 0, -4, P);
  b.box(-2, -1.5, -5, 1.3, 20, 30, P);
  b.box(1.5, 2, -5, 1.3, 20, 30, P);
  b.channel(-1.5, 1.5, 30, 34, -4, P);
  b.ramp(-1.5, 1.5, 34, 39, 'z', -4, -7, P);
  b.channel(-1.5, 1.5, 39, 42, -7, P);
  b.ramp(-1.5, 1.5, 42, 47, 'z', -7, -5, P);
  b.box(-2, -1.5, -8, -2.7, 34, 47, P);
  b.box(1.5, 2, -8, -2.7, 34, 47, P);
  b.channel(-1.5, 1.5, 47, 52, -5, P, 1.3, { kind: 'checkpoint' });
  // A broken bit of pipe: jump the gap.
  b.sign(0, -1.5, 53.5, '⚠️ Broken pipe! JUMP', '#e8590c', 0.8);
  b.channel(-1.5, 1.5, 55, 62, -5, P);
  // A leaky bucket on a ledge (fish only!).
  b.box(2, 5, -5, -3.2, 55.5, 60, '#868e96');
  b.water(3.5, -3.2, 58, 'bucket');
  // Pistons sliding in and out of the walls.
  b.channel(-1.5, 1.5, 62, 80, -5, P);
  [66, 71, 76].forEach((z, i) => {
    const s = i % 2 ? -1 : 1;
    const x0 = s > 0 ? 1.5 : -3.5;
    b.box(x0, x0 + 2, -5, -3.6, z, z + 1.4, '#495057', { move: { dx: -1.5 * s, dy: 0, dz: 0, period: 3, phase: i * 0.33 } });
  });
  b.channel(-1.5, 1.5, 80, 84, -5, P, 1.3, { kind: 'checkpoint' });
  b.channel(-1.5, 1.5, 84, 103, -5, P);
  // Hot water pipes: don't touch the glowing stripes.
  for (const z of [86, 93, 100]) b.zone(-1.5, 1.5, -5, -4.6, z - 0.5, z + 0.5, 'hot');
  b.sign(0, -2, 82, '🔥 Hot pipes! Jump them', '#e03131', 0.8);
  // The end of the pipe: drop into the drain.
  b.deco(-2.5, 2.5, -9.2, -9, 103, 109, '#212529');
  b.zone(-2.5, 2.5, -12, -6, 103, 109, 'exit');
  b.sign(0, -2, 105, '🕳️ Drop down the drain!', '#495057');
  for (const z of [6, 10, 14, 25, 40, 53.5, 64, 74, 89.5, 96.5]) b.coin(0, z === 53.5 ? -4.5 : z < 20 ? 0 : z < 30 ? -2 : z < 47 ? -7 : -5, z);

  b.go(0, 0, -2);
  b.go(0, 0, 19, { v: 6 });
  b.go(0, -4, 31, { v: 6 });
  b.go(0, -5, 49, { v: 7 });
  b.go(0, -5, 51.3, { jump: true, v: 8 });
  b.go(0, -5, 57, { v: 5 });
  b.go(0, -5, 82, { v: 6 });
  for (const z of [86, 93, 100]) {
    b.go(0, -5, z - 2.2, { jump: true, v: 6 });
    b.go(0, -5, z + 2.5, { v: 6 });
  }
  b.go(0, -6, 106, { v: 5 });
  return b.level('fish2', 'Down the Pipes', '🔧', [0, 0, -2], 12, ['#2b2118', '#5c4a3a'], -16, {
    tip: '💧 Ride the pipes down to the drain!',
    done: 'Splash! Down the drain… into the sewer. Pee-yew!',
  });
}

// ---------------------------------------------------------------- 3: The stinky sewer

function sewer(): FishLevel {
  const b = new Build();
  const S = '#6c757d', W = '#495057';
  const river = (z0: number, z1: number) => {
    b.floor(-2, 2, z0, z1, -1.5, '#343a40');
    b.zone(-2, 2, -1.5, -0.4, z0, z1, 'goo');
  };
  b.box(-7, 7, 0, 3, -5, -4, W);
  b.box(-7, -6, 0, 3, -4, 70, W);
  b.box(6, 7, 0, 3, -4, 70, W);
  // The goo river down the middle, with walkways either side.
  river(-4, 44);
  b.floor(-6, -2, -4, 44, 0, S);
  b.floor(2, 6, 18, 44, 0, S);
  b.box(2, 6, -1.5, 0.6, -4, 18, W);
  b.sign(-4, 3, 0, '🤢 Don’t touch the goo!', '#2f9e44');
  // Hop across the river on floating junk.
  b.box(-1.2, 1.2, -1.5, 0, 19, 21, '#a87b4f');
  b.coin(0, 0, 20);
  // Rats running up and down the walkway.
  [26, 34].forEach((z, i) => b.box(3, 4, 0, 0.7, z, z + 1.4, '#adb5bd', { move: { dx: 0, dy: 0, dz: 6, period: 4 + i, phase: i * 0.5 } }));
  b.floor(2, 6, 44, 47, 0, S, { kind: 'checkpoint' });
  // A goo waterfall across the tunnel: roll over the narrow pipe.
  b.floor(-6, 6, 47, 52, -1.5, '#343a40');
  b.zone(-6, 6, -1.5, -0.4, 47, 52, 'goo');
  b.box(3.2, 4.8, -0.6, 0, 47, 52, '#adb5bd');
  b.sign(4, 3, 49.5, '🧪 Careful…', '#2f9e44', 0.8);
  b.floor(-6, 6, 52, 70, 0, S);
  b.floor(-6, -2, 44, 47, 0, S);
  river(44, 47);
  // A bottle on a high pipe (fish only).
  b.box(-6, -4, 0, 2.5, 54, 57, W);
  b.water(-5, 2.5, 55.5, 'bottle');
  // Up the slope, then a burst pipe blows you up to the manhole.
  b.ramp(-2, 2, 56, 63, 'z', 0, 3, S);
  b.floor(-4, 4, 63, 68, 3, S, { kind: 'checkpoint' });
  b.box(-1, 1, 3, 3.2, 64.5, 66.5, '#ff4fa3', { kind: 'bounce' });
  b.floor(-4, 4, 68.3, 75, 7, '#868e96');
  b.box(-7, 7, 0, 10, 75, 76, W);
  b.deco(-1, 1, 7, 7.04, 72, 74, '#212529');
  b.zone(-1, 1, 7, 8.6, 72, 74, 'exit');
  b.sign(0, 10, 73, '🕳️ Manhole: up to the street!', '#1c7ed6');
  for (const [x, z] of [[-4, 5], [-4, 12], [5, 26], [5, 33], [5, 40], [4, 45.5], [4, 49.5], [0, 54], [0, 66]]) b.coin(x, z === 49.5 ? 0 : z === 66 ? 3.2 : 0, z);

  b.go(-4, 0, -2);
  b.go(-4, 0, 18, { v: 6 });
  b.go(-3.2, 0, 20, { v: 3 });
  b.go(-2.4, 0, 20, { jump: true, v: 4 });
  b.go(0.6, 0, 20, { jump: true, v: 4 });
  b.go(5.2, 0, 21, { v: 4 });
  b.go(5.2, 0, 44, { v: 5 });
  b.go(4, 0, 46, { v: 3 });
  b.go(4, 0, 53, { v: 3 });
  b.go(0, 0, 55, { v: 4 });
  b.go(0, 3, 63.5, { v: 4 });
  b.go(0, 3.2, 65.5, { v: 4 });
  b.go(0, 7, 72, { v: 5 });
  return b.level('fish3', 'Stinky Sewer', '🤢', [-4, 0, -2], 14, ['#1b2a1f', '#3d5a40'], -10, {
    tip: '🤢 Stay out of the green goo!',
    done: 'Up through the manhole… San Francisco! Now over the rooftops.',
  });
}

// ---------------------------------------------------------------- 4: Rooftops

function rooftops(): FishLevel {
  const b = new Build();
  b.floor(-30, 40, -20, 70, 0, '#868e96'); // the street, way down there
  b.zone(-30, 40, 0, 1.5, -20, 70, 'drop');
  const house = (x0: number, x1: number, z0: number, z1: number, top: number, color: string, more: Partial<Block> = {}) => {
    b.box(x0, x1, 0, top, z0, z1, color, more);
    b.deco(x0 - 0.2, x1 + 0.2, top - 0.3, top, z0 - 0.2, z1 + 0.2, '#ffffff');
  };
  // House 1, then along the gutter to house 2 with its pointy roof.
  house(-4, 4, -4, 6, 8, '#f783ac');
  b.box(-0.8, 0.8, 7.2, 8, 6, 12.5, '#ffffff');
  house(-3, 3, 12.5, 22, 8, '#74c0fc');
  b.ramp(-3, 3, 12.5, 17, 'z', 8, 10, '#5c7cfa');
  b.ramp(-3, 3, 17, 22, 'z', 10, 8, '#5c7cfa');
  b.box(1.8, 2.8, 8, 11, 16.5, 17.5, '#c92a2a');
  // Jump to house 3, then roll along the roof edge to house 4.
  house(-4, 4, 24.5, 32, 8, '#ffd43b', { kind: 'checkpoint' });
  b.box(4, 14, 7.2, 8, 27.5, 29, '#ffffff');
  house(14, 22, 24, 34, 9.2, '#b2f2bb');
  b.water(21, 9.2, 25, 'bucket'); // a rain barrel
  // The bouncy awning up to house 5.
  b.box(16.5, 19.5, 9.2, 9.4, 32.2, 34, '#ff4fa3', { kind: 'bounce' });
  house(14, 22, 35.2, 48, 12, '#d0bfff', { kind: 'checkpoint' });
  b.box(20, 21, 12, 14, 39, 40, '#c92a2a');
  // The power pole at the end: up to the wires!
  b.deco(17.7, 18.3, 0, 15, 48.5, 49.1, '#8a5a2b');
  b.zone(16.5, 19.5, 12, 13.6, 45.5, 47.5, 'exit');
  b.sign(18, 15.5, 46.5, '⚡ To the power lines!', '#f59f00');
  b.sign(0, 11, -1, '🏠 Roll over the rooftops', '#e64980');
  // A seagull walking up and down house 4.
  b.box(17, 18, 9.2, 10, 25.5, 26.3, '#f8f9fa', { move: { dx: 0, dy: 0, dz: 3, period: 5 } });
  for (const [x, y, z] of [[0, 8, 9], [0, 10, 17], [0, 8, 27], [6, 8, 28.25], [10, 8, 28.25], [18, 9.2, 28], [18, 12, 40], [15, 12, 46]]) b.coin(x, y, z);

  b.go(0, 8, -2);
  b.go(0, 8, 11, { v: 4 });
  b.go(0, 10, 17, { v: 5 });
  b.go(0, 8, 21.5, { jump: true, v: 6 });
  b.go(0, 8, 28.25, { v: 4 });
  b.go(12.6, 8, 28.25, { jump: true, v: 4 });
  b.go(16, 9.2, 28.25, { v: 3 });
  b.go(18, 9.2, 33.1, { v: 3 });
  b.go(18, 12, 41, { v: 4 });
  b.go(18, 12, 46.5, { v: 4 });
  return b.level('fish4', 'Rooftop Roll', '🏠', [0, 8, -2], 16, ['#74c0fc', '#e7f5ff'], -10, {
    tip: '🏠 Roll over the rooftops!',
    done: 'You made it to the power pole. Now along the wires… eek!',
  });
}

// ---------------------------------------------------------------- 5: Power lines

function powerLines(): FishLevel {
  const b = new Build();
  b.floor(-30, 30, -20, 120, 0, '#868e96');
  b.zone(-30, 30, 0, 1.5, -20, 100, 'drop');
  const TOP = 10;
  const pole = (z: number, w = 3) => {
    b.box(-w / 2, w / 2, TOP - 0.6, TOP, z - 1.5, z + 1.5, '#8a5a2b', { kind: 'checkpoint' });
    b.deco(-0.3, 0.3, 0, TOP - 0.6, z - 0.3, z + 0.3, '#8a5a2b');
  };
  const wire = (x: number, z0: number, z1: number, w = 1.4) => b.box(x - w / 2, x + w / 2, TOP - 0.3, TOP, z0, z1, '#343a40');
  // Span 1: a nice straight wire.
  pole(0);
  b.sign(0, 13, 0, '⚡ Roll along the wires!', '#f59f00');
  wire(0, 1.5, 14.5);
  // Span 2: it sags down and back up.
  pole(16);
  b.ramp(-0.7, 0.7, 17.5, 24, 'z', TOP, TOP - 1.2, '#343a40');
  b.ramp(-0.7, 0.7, 24, 30.5, 'z', TOP - 1.2, TOP, '#343a40');
  // Span 3: pigeons sitting on the wire. Jump over them!
  pole(32);
  b.water(1, TOP, 32, 'bottle');
  wire(0, 33.5, 46.5);
  for (const z of [38, 43]) b.box(-0.35, 0.35, TOP, TOP + 0.5, z - 0.3, z + 0.3, '#868e96');
  // Span 4: two wires: hop from one to the other.
  pole(48, 6);
  // Span 4: the wire goes round a corner and back.
  wire(-1.5, 49.5, 56.4);
  b.box(-2.2, 2.2, TOP - 0.3, TOP, 55, 56.4, '#343a40');
  wire(1.5, 55, 62.5);
  // Span 5: sparks! Jump them.
  pole(64, 6);
  wire(0, 65.5, 78.5);
  for (const z of [70, 76.5]) b.zone(-0.7, 0.7, TOP, TOP + 0.6, z - 0.25, z + 0.25, 'hot');
  // Down the long wire to the street.
  pole(80);
  b.ramp(-0.8, 0.8, 81.5, 101.5, 'z', TOP, 0.2, '#343a40');
  b.floor(-4, 4, 101.5, 112, 0.2, '#495057');
  b.zone(-3, 3, 0, 2, 108, 111, 'exit');
  b.sign(0, 4, 109.5, '🚋 To the hills!', '#1c7ed6');
  for (const z of [6, 11, 21, 27, 38, 43, 53, 59, 70, 76, 90]) b.coin(z === 53 ? -1.5 : z === 59 ? 1.5 : 0, z === 21 || z === 27 ? TOP - 0.8 : z === 90 ? 5 : z === 38 || z === 43 || z === 70 || z === 76 ? TOP + 1.2 : TOP, z);

  b.go(0, TOP, -1);
  b.go(0, TOP, 14, { v: 3 });
  b.go(0, TOP, 30, { v: 3 });
  b.go(0, TOP, 35, { v: 3 });
  for (const z of [38, 43]) {
    b.go(0, TOP, z - 1.9, { jump: true, v: 4 });
    b.go(0, TOP, z + 1.6, { v: 2.5 });
  }
  b.go(0, TOP, 47, { v: 3 });
  b.go(-1.5, TOP, 49, { v: 2 });
  b.go(-1.5, TOP, 55.7, { v: 3 });
  b.go(1.5, TOP, 55.7, { v: 2.5 });
  b.go(1.5, TOP, 63.5, { v: 3 });
  b.go(0, TOP, 65, { v: 3 });
  for (const z of [70, 76.5]) {
    b.go(0, TOP, z - 1.5, { jump: true, v: 5 });
    b.go(0, TOP, z + 1.8, { v: 3 });
  }
  b.go(0, TOP, 80, { v: 3 });
  b.go(0, 0.2, 109, { v: 4 });
  return b.level('fish5', 'Power Line Panic', '⚡', [0, TOP, -1], 18, ['#ffa94d', '#ffe8cc'], -10, {
    tip: '⚡ Steady on the wires…',
    done: 'Down the wire to the street. Now down the hills!',
  });
}

// ---------------------------------------------------------------- 6: The hilly streets

function hills(): FishLevel {
  const b = new Build();
  const ROAD = '#495057', WALK = '#ced4da';
  b.floor(-40, 40, -20, 120, -20, '#2f9e44', {}, 2); // the park at the bottom of the hill, far below
  b.floor(-6, 6, -4, 4, 20, WALK);
  b.box(-6, 6, 0, 20, -4, 4, '#adb5bd', { deco: true });
  b.sign(0, 23.5, 0, '🏔️ Roll down the hills!', '#e64980');
  // A steep street down to a crossing, where a cable car goes by.
  b.ramp(-4, 4, 4, 24, 'z', 20, 14, ROAD);
  b.floor(-16, 16, 24, 34, 14, ROAD);
  b.box(-14, -10, 14, 16.4, 27, 31, '#e03131', { move: { dx: 24, dy: 0, dz: 0, period: 8 } });
  b.deco(-16, 16, 14, 14.03, 28.6, 29.4, '#adb5bd');
  // Lombard Street: the crooked one. Down and round, down and round.
  const lane = (z0: number, hiEast: boolean, yTop: number) => b.ramp(-8, 8, z0, z0 + 3, 'x', hiEast ? yTop - 2 : yTop, hiEast ? yTop : yTop - 2, ROAD);
  lane(34, true, 14);
  b.floor(-11, -8, 34, 40.5, 12, ROAD);
  lane(37.5, false, 12);
  b.floor(8, 11, 37.5, 44, 10, ROAD);
  lane(41, true, 10);
  b.floor(-11, -8, 41, 47.5, 8, ROAD);
  lane(44.5, false, 8);
  b.floor(8, 11, 44.5, 51, 6, ROAD, { kind: 'checkpoint' });
  for (const z of [37.25, 40.75, 44.25]) b.box(-8, 8, 0, z === 37.25 ? 12.3 : z === 40.75 ? 10.3 : 8.3, z - 0.25, z + 0.25, '#2b8a3e');
  b.deco(-11, 11, 0, 5.9, 34, 51, '#8ce99a');
  b.sign(0, 17, 35, '🌺 Lombard Street', '#d6336c');
  // Down to the wharf: past the parked cars, over the speed bump and jump the gap to the pier.
  b.floor(4, 12, 51, 72, 6, ROAD);
  b.deco(4, 12, 0, 5, 51, 72, '#adb5bd');
  b.box(4.2, 6.2, 6, 7.4, 55, 59, '#1c7ed6');
  b.box(9.8, 11.8, 6, 7.4, 60, 64, '#fab005');
  b.water(5, 6, 61, 'bucket'); // a mop bucket by the café
  b.box(6.5, 9.5, 6, 6.2, 66, 69, '#ffd43b', { kind: 'speed' });
  b.floor(2, 14, 77, 98, 5, '#a87b4f');
  b.deco(2, 14, -20, 4, 77, 98, '#7f5539');
  for (const [x, z] of [[2.6, 84], [13.4, 90]]) b.box(x - 0.6, x + 0.6, 5, 5.8, z - 1, z + 1, '#7f5539'); // sea lions
  b.zone(4, 12, 5, 7, 94, 97, 'exit');
  b.sign(8, 9, 95.5, '🌉 To the Golden Gate!', '#e8590c');
  for (const [x, y, z] of [[0, 18, 10], [0, 16, 18], [0, 14, 26], [-4, 13, 35.5], [4, 11, 39], [-4, 9, 42.5], [4, 7, 46], [8, 6, 62], [8, 6, 74], [8, 5, 88]]) b.coin(x, y, z);

  b.go(0, 20, -2);
  b.go(0, 14, 25, { v: 4 });
  b.go(9, 14, 25.5, { v: 4 });
  b.go(9, 14, 33, { v: 5 });
  b.go(6.5, 14, 35.5, { v: 3 });
  b.go(-9.5, 12, 35.5, { v: 4 });
  b.go(-9.5, 12, 39, { v: 2.5 });
  b.go(9.5, 10, 39, { v: 4 });
  b.go(9.5, 10, 42.5, { v: 2.5 });
  b.go(-9.5, 8, 42.5, { v: 4 });
  b.go(-9.5, 8, 46, { v: 2.5 });
  b.go(9.5, 6, 46, { v: 4 });
  b.go(9.5, 6, 52, { v: 3 });
  b.go(8, 6, 54, { v: 3 });
  b.go(8, 6, 65, { v: 4 });
  b.go(8, 6, 71.6, { jump: true, v: 12 });
  b.go(8, 5, 95, { v: 5 });
  return b.level('fish6', 'Hilly Streets', '🚋', [0, 20, -2], 20, ['#4dabf7', '#e7f5ff'], -15, {
    tip: '🚋 Watch out for the cable car!',
    done: 'The pier! You can see the Golden Gate Bridge…',
  });
}

// ---------------------------------------------------------------- 7: Over the Golden Gate to the ocean

function goldenGate(): FishLevel {
  const b = new Build();
  const ORANGE = '#e8590c', WALK = '#ced4da';
  // The road with cars zooming along it (just to look at), and the sidewalk with a railing.
  b.floor(-6, 6, -6, 92, 0, '#495057');
  b.box(6, 9, -1, 0, -6, 74, WALK);
  b.box(6, 9, -1, 0, 76.5, 92, WALK);
  b.box(9, 9.4, 0, 1.2, -6, 92, ORANGE);
  b.box(5.7, 6, 0, 0.6, -6, 92, '#adb5bd');
  [[-3.5, 0], [-1, 0.3], [1.5, 0.6], [4, 0.85]].forEach(([x, ph], i) =>
    b.deco(x - 1, x + 1, 0, 1.4, 0, 4, ['#fa5252', '#fab005', '#4dabf7', '#ffffff'][i], { move: { dx: 0, dy: 0, dz: i < 2 ? 80 : -80, period: 7 + i, phase: ph } }));
  b.sign(7.5, 4, -2, '🌉 The Golden Gate Bridge!', ORANGE, 1.1);
  b.sign(7.5, 3, 4, '😱 Too high to jump! Get to the beach', '#1c7ed6', 0.7);
  // The tower, and the big orange cable up to the top of it.
  for (const x of [-7, 10.5]) b.box(x - 1, x + 1, -40, 30, 34, 37, ORANGE);
  b.box(-8, 11.5, 26, 28, 34, 37, ORANGE);
  b.box(-8, 11.5, 16, 17, 34, 37, ORANGE);
  b.ramp(6.7, 8.3, 4, 32, 'z', 0, 8, ORANGE);
  b.floor(5, 12, 32, 38, 8, ORANGE, { kind: 'checkpoint' });
  b.water(5.8, 8, 33, 'bottle');
  b.ramp(6.7, 8.3, 38, 66, 'z', 8, 0, ORANGE);
  b.box(6, 9, 0, 0.2, 66, 70, WALK, { kind: 'checkpoint' });
  // Cones and a broken bit of sidewalk.
  b.box(6.4, 7.2, 0, 0.9, 70.5, 71.3, '#ff922b');
  b.sign(7.5, 3, 75.5, '🚧 Jump!', '#f59f00', 0.8);
  // Off the end of the bridge, down the hill to the beach, and into the ocean!
  b.ramp(6, 9, 92, 108, 'z', 0, -10, '#c2a878');
  b.floor(0, 20, 108, 122, -10, '#ffe8a3');
  b.zone(-20, 40, -14, -9.4, 122, 160, 'exit');
  b.sign(8, -6, 121, '🌊 THE OCEAN!', '#1971c2', 1.2);
  for (const [x, y, z] of [[7.5, 0, 2], [7.5, 2, 12], [7.5, 4, 20], [7.5, 6, 28], [8.5, 8, 35], [7.5, 6, 46], [7.5, 3, 56], [7.5, 0, 80], [7.5, -3, 98], [10, -10, 115]]) b.coin(x, y, z);

  b.go(7.5, 0, -2);
  b.go(7.5, 0, 3.5, { v: 3 });
  b.go(7.5, 8, 33, { v: 4 });
  b.go(7.5, 8, 37.5, { v: 3 });
  b.go(7.5, 0, 67, { v: 3 });
  b.go(8.2, 0, 69.8, { v: 3 });
  b.go(8.2, 0, 73.2, { jump: true, v: 7 });
  b.go(7.5, 0, 80, { v: 5 });
  b.go(7.5, -10, 112, { v: 4 });
  b.go(8, -10, 125, { v: 4 });
  return b.level('fish7', 'Golden Gate to the Ocean', '🌉', [7.5, 0, -2], 30, ['#a5d8ff', '#f1f3f5'], -11.5, {
    tip: '🌊 Over the bridge to the ocean!',
    done: '🌊 You made it to the OCEAN! You’re free!',
  });
}

export const FISH_LEVELS: FishLevel[] = [petStore(), pipes(), sewer(), rooftops(), powerLines(), hills(), goldenGate()];
export const FISH_IDS = FISH_LEVELS.map((f) => f.level.id);
export const FISH_BY_ID: Record<string, FishLevel> = Object.fromEntries(FISH_LEVELS.map((f) => [f.level.id, f]));
