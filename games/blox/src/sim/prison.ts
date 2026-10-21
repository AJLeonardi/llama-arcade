// Jail Break: escape from the Silly Jail (you were locked up for eating all the cookies).
// Find the red key in your cell, crawl through the air vents, cross the laundry, sneak past the
// searchlights in the yard and bounce over the wall. Getting caught just sends you back to a checkpoint.
// tests/levels.test.ts walks a robot along `route` to check it can be done.
import type { Block, Level, V3 } from './types';

const WALL = '#c9c3b6';
const FLOOR = '#9aa0a6';
const BARS = '#5c636a';
const H = 4; // inside walls (too high to jump)
const VENT_TOP = 1.3; // vent ceiling: you crawl under it

/**
 * The air vents, seen from above: row 0 is next to the corridor (south), row 5 next to the laundry.
 * `.` tunnel, `c` tunnel with a coin, `#` wall. You go in at row 0 column 1 and out at row 5 column 12.
 */
const VENTS = [
  '#...#c...#..c#',
  '###.####.#.###',
  '#c....#......#',
  '#####.#.####.#',
  '#c......#c...#',
  '############.#',
];
const VENT_X0 = -14, VENT_Z0 = 10.5, CELL = 2;
/** The way through the vents, as [row, column] cells. */
const VENT_PATH: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [2, 4], [2, 5], [3, 5], [4, 5], [4, 6], [4, 7], [3, 7], [2, 7],
  [2, 8], [2, 9], [2, 10], [2, 11], [2, 12], [3, 12], [4, 12], [5, 12],
];
const cellAt = (r: number, c: number): [number, number] => [VENT_X0 + c * CELL + CELL / 2, VENT_Z0 + r * CELL + CELL / 2];

export function jailBreak(): Level {
  const blocks: Block[] = [];
  const coins: V3[] = [];
  const route: { to: V3; wait?: boolean }[] = [];
  /** A box from its x/z centre and size, standing on y0. */
  const box = (x: number, z: number, w: number, d: number, y0: number, h: number, color: string, more: Partial<Block> = {}) => {
    const b: Block = { x, y: y0 + h / 2, z, w, h, d, kind: 'solid', color, ...more };
    blocks.push(b);
    return b;
  };
  /** A wall between two x (or z) values, `h` high. */
  const wallX = (x0: number, x1: number, z: number, h = H, color = WALL) => box((x0 + x1) / 2, z, x1 - x0, 0.5, 0, h, color);
  const wallZ = (z0: number, z1: number, x: number, h = H, color = WALL) => box(x, (z0 + z1) / 2, 0.5, z1 - z0, 0, h, color);
  const go = (x: number, y: number, z: number, wait = false) => route.push(wait ? { to: [x, y, z], wait } : { to: [x, y, z] });

  // The ground under everything.
  box(0, 40, 80, 100, -1, 1, '#7bc24f');
  box(0, 18, 30, 40, -0.99, 1, FLOOR); // the jail's concrete floor (a hair above the grass)

  // ---------------------------------------------------------------- the cells (z 0..6)
  wallX(-14.75, 14.75, -0.25);
  for (const x of [-14.5, -8.75, -3.25, 3.25, 8.75, 14.5]) wallZ(0, 6, x);
  // Bars along the front: thin posts too close together to squeeze through.
  for (let x = -14.25; x < 14.3; x += 0.5) {
    if (Math.abs(x) < 1.05 || Math.abs(Math.abs(x) - 3.25) < 0.3 || Math.abs(Math.abs(x) - 8.75) < 0.3) continue;
    box(x, 6, 0.15, 0.15, 0, H, BARS);
  }
  box(0, 6, 29.5, 0.5, H - 0.4, 0.4, WALL); // a beam over the bars
  // Your cell door: red, and locked.
  box(0, 6, 2.1, 0.3, 0, H - 0.4, '#e03131', { kind: 'door', key: 'red' });
  // In your cell: a bed, a high shelf with the red key on it, and a toilet.
  box(-2, 3.5, 1.6, 3, 0, 0.7, '#4dabf7');
  box(-2, 4.6, 1.6, 0.8, 0.7, 0.25, '#ffffff'); // pillow
  box(-2.4, 0.6, 1, 1.2, 2.1, 0.25, '#8a5a2b'); // shelf
  box(2.3, 1, 0.8, 0.9, 0, 0.6, '#f8f9fa');
  box(2.3, 0.45, 0.8, 0.3, 0.6, 0.9, '#f8f9fa');
  // The other cells have beds too (nobody's home).
  for (const x of [-11.6, -6, 6, 11.6]) box(x, 2, 2.4, 1.4, 0, 0.7, '#ffa94d');

  go(0, 0, 2);
  go(-2, 0.7, 3.6);
  go(-2.4, 2.35, 0.8);
  go(0, 0, 4);
  go(0, 0, 8);

  // ---------------------------------------------------------------- the corridor (z 6..10)
  // Its back wall has a hole at the bottom into the vents (x -12..-10).
  wallZ(6, 10.5, -14.75);
  wallZ(6, 10.5, 14.75);
  wallX(-14.75, -12, 10.25);
  wallX(-10, 14.75, 10.25);
  box(-11, 10.25, 2, 0.5, VENT_TOP, H - VENT_TOP, WALL);
  box(-11, 10.25, 2.4, 0.12, 0.6, 0.12, BARS, { deco: true }); // the vent cover, pushed open
  coins.push([12.5, 1.2, 8]);
  go(-11, 0, 8);

  // ---------------------------------------------------------------- the air vents (z 10.5..22.5)
  VENTS.forEach((row, r) => {
    // Walls, merged into runs along each row.
    let c = 0;
    while (c < row.length) {
      if (row[c] !== '#') {
        c++;
        continue;
      }
      let e = c;
      while (e + 1 < row.length && row[e + 1] === '#') e++;
      const [x0] = cellAt(r, c), [x1] = cellAt(r, e);
      const [, z] = cellAt(r, c);
      box((x0 + x1) / 2, z, (e - c + 1) * CELL, CELL, 0, VENT_TOP + 0.3, '#868e96'); // low, so you can see in
      c = e + 1;
    }
    // Tunnels: a see-through grate on top and a crawl zone inside.
    [...row].forEach((ch, c2) => {
      if (ch === '#') return;
      const [x, z] = cellAt(r, c2);
      box(x, z, CELL, CELL, VENT_TOP, 0.1, '#adb5bd', { see: true });
      // The tunnels at the ends poke out of the walls a little, so you duck before you reach the hole.
      const out = (r === 0 && c2 === 1) || (r === 5 && c2 === 12) ? 1.6 : 0;
      const zc = r === 0 ? z - out / 2 : z + out / 2;
      box(x, zc, CELL, CELL + out, 0, VENT_TOP - 0.01, '#000000', { kind: 'crawl' });
      if (ch === 'c') coins.push([x, 0.6, z]);
    });
  });
  for (const [r, c] of VENT_PATH) {
    const [x, z] = cellAt(r, c);
    go(x, 0, z);
  }

  // ---------------------------------------------------------------- the laundry (z 23..37)
  // Its front wall has the vent hole (x 10..12); its back wall the blue door (x -12..-10).
  wallX(-14.75, 10, 22.75);
  wallX(12, 14.75, 22.75);
  box(11, 22.75, 2, 0.5, VENT_TOP, H - VENT_TOP, WALL);
  wallZ(22.5, 37.5, -14.75);
  wallZ(22.5, 37.5, 14.75);
  wallX(-14.75, -12.05, 37.25);
  wallX(-9.95, 14.75, 37.25);
  box(-11, 37.25, 2.1, 0.5, H - 0.4, 0.4, WALL);
  box(-11, 37.25, 2.1, 0.3, 0, H - 0.4, '#1c7ed6', { kind: 'door', key: 'blue' });
  box(11, 25.5, 5, 2.6, 0, 0.1, '#3d8bff', { kind: 'checkpoint' });
  go(11, 0.1, 25.5);
  // The floor's flooded with lava: hop across on the washing machines.
  box(0, 30.5, 29, 7, 0, 0.1, '#ff4a1c', { kind: 'lava' });
  const machines: [number, number, number][] = [
    [9, 29, 1.4], [5, 31, 1.4], [1, 30.5, 2.4], [-3, 32, 1.4], [-7, 31, 3.2], [-11, 33, 1.4],
  ];
  machines.forEach(([x, z, h], i) => {
    box(x, z, 1.8, 1.8, 0, h, i % 2 ? '#e9ecef' : '#f8f9fa');
    box(x, z + 0.91, 0.9, 0.02, h / 2 - 0.45, 0.9, '#74c0fc', { deco: true }); // the round window (square, it's blocky)
    go(x, h, z);
    if (i === 1 || i === 3) coins.push([x, h + 1.3, z]);
  });
  box(-7, 31, 1, 1, 3.2, 0.3, '#ffd43b', { deco: true }); // a laundry basket with the key in it
  go(-11, 0, 35.5);
  // Washing lines for looks.
  box(0, 35.8, 26, 0.05, 3.2, 0.05, '#ffffff', { deco: true });
  [-9, -4, 2, 7].forEach((x, i) => box(x, 35.8, 1.2, 0.08, 2.2, 1, ['#ff8787', '#ffd43b', '#74c0fc', '#b2f2bb'][i], { deco: true }));
  go(-11, 0, 38.6);

  // ---------------------------------------------------------------- the yard (z 37.5..70)
  const YW = 20, OUT = 7.5; // outer wall: too high to jump, you'll need the trampoline
  wallX(-YW, -14.75, 37.25, OUT, '#adb5bd');
  wallX(14.75, YW, 37.25, OUT, '#adb5bd');
  wallZ(37.5, 70, -YW, OUT, '#adb5bd');
  wallZ(37.5, 70, YW, OUT, '#adb5bd');
  // The back wall is thick, with a walkway on top: that's your way out.
  box(0, 71.5, YW * 2, 3, 0, 7, '#adb5bd');
  // Searchlight towers in the corners (just for looks).
  for (const [x, z] of [[-YW + 1.5, 39], [YW - 1.5, 39], [-YW + 1.5, 68.5], [YW - 1.5, 68.5]]) {
    box(x, z, 2, 2, 0, 9, '#868e96');
    box(x, z, 3, 3, 9, 0.6, '#495057');
    box(x, z, 1, 1, 9.6, 0.8, '#ffe066', { deco: true });
  }
  box(-11, 40.5, 4, 3, 0, 0.1, '#3d8bff', { kind: 'checkpoint' });
  go(-11, 0.1, 40.5, true);
  // Three lanes of searchlights sweeping side to side. Wait for a gap, then run!
  const lights: [number, number, number, number][] = [
    // z, period, phase, start x
    [46, 6, 0, -17.5],
    [53, 5, 0.3, -17.5],
    [60, 5.5, 0.6, -17.5],
    [60, 5.5, 0.1, -17.5],
  ];
  for (const [z, period, phase, x] of lights) {
    blocks.push({ x, y: 2.5, z, w: 3, h: 5, d: 3, kind: 'spot', color: '#fff3bf', move: { dx: 35, dy: 0, dz: 0, period, phase } });
  }
  // Crates to hide behind between the lanes.
  for (const [x, z] of [[-16, 49.5], [-6, 49.5], [-14, 56.5], [-8, 56.5], [-4, 63.5], [3, 49.5], [8, 56.5], [14, 63.5]]) {
    box(x, z, 1.8, 1.8, 0, 1.8, '#c08b5c');
  }
  coins.push([-11, 1.2, 49.5], [-11, 1.2, 56.5], [3, 3, 49.5]);
  go(-11, 0, 49.5, true);
  go(-11, 0, 56.5, true);
  box(-11, 64, 4, 3, 0, 0.1, '#3d8bff', { kind: 'checkpoint' });
  go(-11, 0.1, 64, true);
  // A crate with a mattress on top: boing, up onto the wall!
  box(-11, 66.5, 2, 2, 0, 1.5, '#c08b5c');
  box(-11, 66.5, 2, 2, 1.5, 0.4, '#ff4fa3', { kind: 'bounce' });
  go(-11, 1.9, 66.5);
  go(-11, 7, 71.2);
  coins.push([-11, 8.3, 71.5], [-3, 8.3, 71.5]);

  // ---------------------------------------------------------------- outside: freedom!
  box(-11, 75.5, 4, 3, 0, 2, '#ffd43b'); // a haystack to land on
  go(-11, 2, 75.5);
  box(-11, 82, 8, 8, 0, 0.3, '#ffffff', { kind: 'finish' });
  go(-11, 0.3, 82);
  // A hot-air balloon waiting for you.
  const bx = -2, bz = 84;
  box(bx, bz, 2, 2, 0, 1.2, '#8a5a2b', { deco: true });
  for (const [i, c] of ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'].entries()) {
    const w = [3, 4.2, 4.6, 4.2, 3][i];
    box(bx, bz, w, w, 3 + i * 0.9, 0.9, c, { deco: true });
  }

  return {
    id: 'prison',
    name: 'Jail Break',
    emoji: '🔑',
    spawn: [0, 0, 2],
    spawnYaw: 0,
    blocks,
    coins,
    reward: 40,
    fallY: -10,
    sky: ['#4a6fa5', '#c5d6ee'],
    keys: [
      { at: [-2.4, 3.3, 0.6], id: 'red', color: '#e03131' },
      { at: [-7, 4.4, 31], id: 'blue', color: '#1c7ed6' },
    ],
    signs: [
      { at: [0, 5.2, 6], text: '🍪 Silly Jail', color: '#495057' },
      { at: [-11, 3, 9.6], text: '🕳️ Air vent', color: '#495057', size: 0.7 },
      { at: [11, 5.5, 26], text: '🧺 Laundry', color: '#1c7ed6' },
      { at: [-11, 8.5, 41], text: '🔦 Don’t get spotted!', color: '#f08c00' },
    ],
    route,
  };
}
