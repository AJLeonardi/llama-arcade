import { describe, expect, test } from 'vitest';
import { Player, STEP, type Input } from '../src/sim/player';
import { BRIDGES, bridgeY, GEYSER, RIVER } from '../src/sim/slides';
import { floorAt, spots, WATER_Y } from '../src/sim/world';

const run = (p: Player, inp: Partial<Input>, secs: number) => {
  for (let i = 0; i < secs / STEP; i++) p.step({ x: 0, y: 0, camYaw: p.yaw, jump: false, ...inp });
};

describe('the lazy river', () => {
  test('there are two bridges, and you float under them', () => {
    expect(BRIDGES.length).toBe(2);
    for (const b of BRIDGES) {
      // The deck is over all of the water, high enough for someone sitting in a tube; the ramps are on dry floor.
      for (let x = b.x0; x <= b.x1; x += 0.1) {
        if (floorAt(x, b.z) < 0) {
          expect(x).toBeGreaterThan(b.d0);
          expect(x).toBeLessThan(b.d1);
          expect(bridgeY(b, x) - 0.15 - WATER_Y).toBeGreaterThan(1.4);
        }
      }
    }
  });

  test('you can walk over a bridge to the island and back', () => {
    for (const b of BRIDGES) {
      const p = new Player();
      // Start at the outside end, walk across.
      const out = b.x0 < GEYSER.x - 8 ? b.x0 - 0.6 : b.x1 + 0.6;
      const yaw = out < b.x0 ? Math.PI / 2 : -Math.PI / 2;
      p.place(out, 0, b.z, yaw);
      let top = 0;
      for (let i = 0; i < 15 / STEP; i++) {
        p.step({ x: 0, y: 0.6, camYaw: yaw, jump: false });
        top = Math.max(top, p.y);
      }
      expect(top).toBeCloseTo(b.h, 1);
      expect(p.y).toBeCloseTo(0); // down on the island, dry
      expect(Math.abs(p.x - GEYSER.x)).toBeLessThan(Math.abs(out - GEYSER.x) - 10);
    }
  });

  test('Old Spitter has a button on the island', () => {
    const s = spots.find((x) => x.kind === 'geyser')!;
    expect(s).toBeTruthy();
    expect(floorAt(s.x, s.z)).toBeCloseTo(0);
  });
});

describe('splashing', () => {
  test('jumping into the water splashes, harder the higher you jump from', () => {
    const p = new Player();
    const [x, , z] = RIVER[RIVER.length >> 2];
    p.place(x, 0.2, z, 0);
    run(p, {}, 1);
    expect(p.events.filter((e) => e === 'splash').length).toBe(1);
    const small = p.splashSpeed;
    p.events.length = 0;
    p.place(x, 2.5, z, 0);
    run(p, {}, 1.5);
    expect(p.events.filter((e) => e === 'splash').length).toBe(1);
    expect(p.splashSpeed).toBeGreaterThan(small + 3);
  });

  test('walking about on the dry floor never splashes', () => {
    const p = new Player();
    p.place(0, 0, 4, Math.PI);
    run(p, { y: 1 }, 3);
    expect(p.events).not.toContain('splash');
  });
});
