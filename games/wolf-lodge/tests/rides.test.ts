import { describe, expect, test } from 'vitest';
import { Rider, STEP, type RideDef } from '../src/sim/ride';
import { RIDES, TOWER_STAIRS } from '../src/sim/slides';
import { stairBoxes } from '../src/sim/stairs';
import { floorAt, groundAt, PARK, pushOut } from '../src/sim/world';

function ride(def: RideDef, push = 0, maxSecs = 90) {
  const r = new Rider(def);
  let t = 0, top = 0, low = Infinity;
  const events = new Set<string>();
  while (!r.done && t < maxSecs) {
    r.step(push);
    for (const e of r.events) events.add(e);
    r.events.length = 0;
    t += STEP;
    top = Math.max(top, r.speed);
    if (!r.wait) low = Math.min(low, r.frame.pos[1]);
  }
  return { r, t, top, low, events };
}

const slides = Object.values(RIDES).filter((d) => !d.loop);

describe('the slides', () => {
  for (const def of slides) {
    test(`${def.name} gets you to the bottom`, () => {
      const { r, t, top, low } = ride(def);
      expect(r.done).toBe(true);
      expect(t).toBeGreaterThan(def.id === 'zip' ? 2 : 6);
      expect(t).toBeLessThan(45);
      expect(top).toBeLessThan(def.maxV + 2);
      expect(low).toBeGreaterThan(-0.5);
    });
  }

  test('leaning forward is faster, dragging your hands is slower, within the limit', () => {
    for (const id of ['twister', 'drop', 'bowl', 'dipper']) {
      const slow = ride(RIDES[id], -1), normal = ride(RIDES[id], 0), fast = ride(RIDES[id], 1);
      expect(slow.top).toBeLessThanOrEqual(normal.top + 0.01);
      expect(fast.top).toBeGreaterThanOrEqual(normal.top - 0.01);
      expect(fast.top).toBeLessThan(RIDES[id].maxV + 2);
    }
  });

  test('the funnels swing you up and down before letting you out, and the bowl goes round and round', () => {
    for (const id of ['twister', 'dipper']) {
      const { events } = ride(RIDES[id]);
      expect(events.has('flush')).toBe(true);
    }
    const r = new Rider(RIDES.bowl);
    while (r.seg < 1) r.step(0);
    let turned = 0, last = Math.atan2(r.pz, r.px);
    while (r.seg === 1) {
      r.step(0);
      const a = Math.atan2(r.pz, r.px);
      turned += Math.abs(Math.atan2(Math.sin(a - last), Math.cos(a - last)));
      last = a;
    }
    expect(turned / (2 * Math.PI)).toBeGreaterThan(2); // at least two laps round the bowl
  });

  test('the Wolf Drop counts down, drops, and gives airtime', () => {
    const { events } = ride(RIDES.drop);
    expect(events.has('count')).toBe(true);
    expect(events.has('drop')).toBe(true);
    expect(events.has('airtime')).toBe(true);
  });

  test('every slide stays inside the water park, and they do not run through each other', () => {
    const pts: { id: string; p: number[] }[] = [];
    for (const def of slides) {
      if (def.id === 'zip') continue;
      for (const s of def.segs) {
        if (s.type !== 'path') continue;
        for (const p of s.pts) {
          expect(p[0]).toBeGreaterThan(PARK.x0 + 0.5);
          expect(p[0]).toBeLessThan(PARK.x1 - 0.5);
          expect(p[2]).toBeGreaterThan(PARK.z0 + 0.5);
          expect(p[2]).toBeLessThan(PARK.z1 - 0.5);
          pts.push({ id: def.id, p });
        }
      }
    }
    // Different slides at least 2 m apart (centre lines), except where they leave the same tower deck.
    for (let i = 0; i < pts.length; i += 3) {
      for (let j = i + 1; j < pts.length; j += 3) {
        const a = pts[i], b = pts[j];
        if (a.id === b.id || a.p[1] > 17.5 || b.p[1] > 17.5) continue;
        const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
        expect(d, `${a.id} and ${b.id} at ${a.p.map((v) => v.toFixed(1))}`).toBeGreaterThan(2);
      }
    }
  });

  test("no slide runs through the towers' stairs or railings", () => {
    const solid = TOWER_STAIRS.flatMap(stairBoxes);
    for (const r of Object.values(RIDES)) {
      if (r.id === 'zip' || r.loop) continue;
      for (const sg of r.segs) {
        if (sg.type !== 'path') continue;
        const s0 = r.segs[0].type === 'path' ? r.segs[0].pts[0] : [0, -99, 0];
        for (const [x, y, z] of sg.pts) {
          if (Math.hypot(x - s0[0], y - s0[1], z - s0[2]) < 1.6) continue; // where you get on, at the deck's edge
          const hit = solid.find((b) => x > b.x0 - 0.4 && x < b.x1 + 0.4 && z > b.z0 - 0.4 && z < b.z1 + 0.4 && y > b.y0 - 0.5 && y < b.y1 + 0.3);
          expect(hit, `${r.id} at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`).toBeUndefined();
        }
      }
    }
  });

  test('you climb out somewhere you can stand', () => {
    for (const def of Object.values(RIDES)) {
      const { x, z } = def.exit;
      expect(floorAt(x, z), def.id).toBeCloseTo(0);
      expect(groundAt(x, z, 0, 0.4).h, def.id).toBeLessThan(0.5);
      const p = pushOut(x, z, 0.24, 0, 1.4, 0.42);
      expect(Math.hypot(p.px, p.pz), def.id).toBeLessThan(0.3);
    }
  });

  test('the lazy river keeps going round until you get out', () => {
    const r = new Rider(RIDES.river1);
    for (let i = 0; i < 120 * 200; i++) r.step(0);
    expect(r.done).toBe(false);
    expect(r.speed).toBeGreaterThan(0.5);
    expect(r.speed).toBeLessThan(2);
  });
});
