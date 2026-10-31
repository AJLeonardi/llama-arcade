import { describe, expect, test } from 'vitest';
import { Player, RUN, STEP, WALK, type Input } from '../src/sim/player';
import { ROPES_Y, START } from '../src/sim/world';
import { DROP_TOWER, SPLASH, TOWER, TOWER_STAIRS } from '../src/sim/slides'; // also adds the splash pools, the lazy river and the towers to the world
import { doorOpen, doors } from '../src/sim/world';

const run = (p: Player, inp: Partial<Input>, secs: number) => {
  for (let i = 0; i < secs / STEP; i++) p.step({ x: 0, y: 0, camYaw: p.yaw, jump: false, ...inp });
};

/** Walk to each point in turn (steering like a kid with the joystick). */
const walkTo = (p: Player, pts: [number, number][]) => {
  for (const [x, z] of pts) {
    for (let i = 0; i < 8 / STEP && Math.hypot(x - p.x, z - p.z) > 0.25; i++) {
      p.step({ x: 0, y: Math.min(1, Math.hypot(x - p.x, z - p.z) + 0.3), camYaw: Math.atan2(x - p.x, z - p.z), jump: false });
    }
  }
};
const centre = (r: { x0: number; x1: number; z0: number; z1: number }): [number, number] => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

describe('walking', () => {
  test('a little push walks, a big push runs, and it takes a moment to get going', () => {
    const p = new Player();
    p.place(0, 0, 60, Math.PI);
    run(p, { y: 0.5, camYaw: Math.PI }, 0.1);
    expect(p.speed).toBeLessThan(WALK);
    run(p, { y: 0.5, camYaw: Math.PI }, 2);
    expect(p.speed).toBeGreaterThan(WALK * 0.6);
    expect(p.speed).toBeLessThan(WALK + 0.01);
    run(p, { y: 1, camYaw: Math.PI }, 2);
    expect(p.speed).toBeCloseTo(RUN, 1);
  });

  test('turns to face the way it goes before going fast', () => {
    const p = new Player();
    p.place(0, 0, 60, 0);
    run(p, { y: 1, camYaw: Math.PI }, 0.05);
    expect(p.speed).toBeLessThan(0.3);
    run(p, { y: 1, camYaw: Math.PI }, 1);
    expect(Math.cos(p.yaw - Math.PI)).toBeGreaterThan(0.99);
  });

  test("walls stop you: the lodge's front wall, beside the doors", () => {
    const p = new Player();
    p.place(10, 0, 44, Math.PI);
    run(p, { y: 1, camYaw: Math.PI }, 3);
    expect(p.z).toBeGreaterThan(40.2);
    // ...but the front doors let you in.
    p.place(START.x, 0, START.z, START.yaw);
    run(p, { y: 1, camYaw: Math.PI }, 6);
    expect(p.z).toBeLessThan(36);
  });

  test('climbs the stairs up to the ropes course', () => {
    const p = new Player();
    p.place(-29, 0, 14.5, -Math.PI / 2);
    run(p, { y: 0.6, camYaw: -Math.PI / 2 }, 7.5);
    expect(p.y).toBeCloseTo(ROPES_Y, 1);
  });

  test('the harness catches you if you fall off the ropes course, and puts you back', () => {
    const p = new Player();
    p.place(-38.5, ROPES_Y, 14.5, Math.PI / 2);
    run(p, {}, 0.2);
    // Walk off the side of the platform.
    run(p, { y: 1, camYaw: -Math.PI / 2 }, 2);
    expect(p.events).toContain('harness');
    run(p, {}, 2);
    expect(p.y).toBeCloseTo(ROPES_Y, 1);
  });

  test('you can walk into a pool and climb back out', () => {
    const p = new Player();
    const pool = SPLASH.find((q) => q.name === 'Big Dipper')!;
    p.place((pool.x0 + pool.x1) / 2, 0, pool.z1 + 1, Math.PI);
    run(p, { y: 0.6, camYaw: Math.PI }, 3);
    expect(p.wet).toBeGreaterThan(0.3);
    run(p, { y: 0.6, camYaw: 0 }, 8);
    expect(p.wet).toBe(0);
  });

  test('beds are bouncy', () => {
    const p = new Player();
    p.place(57.5, 0.66, 39, 0);
    run(p, {}, 0.1);
    run(p, { jump: true }, 0.02);
    run(p, {}, 0.2);
    expect(p.y).toBeGreaterThan(1.4);
  });

  test('you can walk up both slide towers to the deck', () => {
    for (const [i, t] of [TOWER, DROP_TOWER].entries()) {
      const pieces = TOWER_STAIRS[i].filter((q) => q.kind !== 'rail');
      const p = new Player();
      const [sx, sz] = centre(pieces[0] as never);
      p.place(sx, 0, sz, 0);
      walkTo(p, pieces.slice(1, -1).map((q) => centre(q as never)));
      walkTo(p, [[t.x, t.z]]);
      expect(p.y, t.name).toBeCloseTo(t.top, 1);
    }
  });

  test("the railings stop you falling off the stairs or the deck, even if you jump", () => {
    const p = new Player();
    // Halfway up the Big Tower's first flight (along the south side), run and jump outwards (south).
    p.place(TOWER.x, 1.5, TOWER.z - TOWER.w / 2 + 0.55, Math.PI);
    run(p, {}, 0.5);
    const y = p.y;
    for (let i = 0; i < 2 / STEP; i++) p.step({ x: 0, y: 1, camYaw: Math.PI, jump: i % 60 === 0 });
    expect(p.z).toBeGreaterThan(TOWER.z - TOWER.w / 2);
    expect(p.y).toBeGreaterThan(y - 0.5);
    // On the deck, run at the edge.
    p.place(TOWER.x, TOWER.top, TOWER.z, 0);
    for (let i = 0; i < 3 / STEP; i++) p.step({ x: 0, y: 1, camYaw: -Math.PI / 2, jump: i % 60 === 0 });
    expect(p.y).toBeCloseTo(TOWER.top, 1);
  });
});

describe('doors', () => {
  test("an open door's leaf is solid: you can't walk through it", () => {
    const d = doors.find((q) => q.tier === 3)!;
    doorOpen[d.id] = true;
    const p = new Player();
    // Inside the room, beside the open leaf (hinged on the -x side, swung in), walking -x into it.
    p.place(d.x - d.width / 2 + 0.5, 0, d.z + 0.6, -Math.PI / 2);
    run(p, { y: 1, camYaw: -Math.PI / 2 }, 1.5);
    expect(p.x).toBeGreaterThan(d.x - d.width / 2);
    doorOpen[d.id] = false;
  });
});
