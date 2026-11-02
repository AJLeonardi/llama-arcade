import { describe, expect, test } from 'vitest';
import { blocked, CAR_SPOTS, MANSION, onRoad, PLACES, solids, spotAt, venueAt, venues } from '../src/sim/world';
import { Walker } from '../src/sim/walker';
import { Car, CAR_TYPES, REWARD_CARS } from '../src/sim/car';
import { daylight, isNight, sleep, tick, HOUR_SECS } from '../src/sim/clock';
import { BAG_MAX, doWork, fromSave, newLife, ownedCars, take } from '../src/sim/life';

const STEP = 1 / 60;

describe('the town', () => {
  test('every place on the map has room to stand and a road for your car', () => {
    for (const p of PLACES) {
      expect(blocked(p.x, p.z, 0.4), `${p.name} on foot`).toBe(false);
      for (let t = 0; t < CAR_TYPES.length; t++) {
        const c = new Car(t, p.cx, p.cz, p.ch);
        expect(c.circles().some((k) => blocked(k.x, k.z, k.r, true)), `${p.name} with the ${CAR_TYPES[t].name}`).toBe(false);
      }
      expect(onRoad(p.cx, p.cz) || venueAt(p.cx, p.cz) === undefined, p.name).toBe(true);
    }
  });

  test('the parking spots at the mansion are clear for every car', () => {
    CAR_SPOTS.slice(0, REWARD_CARS.length + 1).forEach((s, i) => {
      const c = new Car(i, s.x, s.z, s.heading);
      expect(c.circles().some((k) => blocked(k.x, k.z, k.r, true)), CAR_TYPES[i].name).toBe(false);
    });
  });

  test('you can stand on every spot where you do something', () => {
    for (const v of venues) {
      for (const s of v.spots) {
        expect(blocked(s.x, s.z, 0.35), `${v.name}: ${s.label}`).toBe(false);
        expect(spotAt(s.x, s.z)?.act, `${v.name}: ${s.label}`).toBe(s.act);
      }
    }
  });

  test('you can walk in through every door', () => {
    for (const v of venues) {
      const d = v.doors[0];
      const ns = d.side === 'n' || d.side === 's';
      const out = d.side === 'n' || d.side === 'w' ? -1 : 1;
      const wall = d.side === 'n' ? v.z0 : d.side === 's' ? v.z1 : d.side === 'w' ? v.x0 : v.x1;
      const start = ns ? { x: d.at, z: wall + out * 3 } : { x: wall + out * 3, z: d.at };
      // Facing in (heading toward the wall), walk forward for 3 seconds with the camera behind.
      const heading = ns ? (out < 0 ? 0 : Math.PI) : out < 0 ? Math.PI / 2 : -Math.PI / 2;
      const w = new Walker(start.x, start.z, heading);
      for (let t = 0; t < 3; t += STEP) w.step(0, 1, heading, false, STEP);
      expect(venueAt(w.x, w.z)?.id, v.name).toBe(v.id);
    }
  });

  test('a car does not fit through a door', () => {
    const c = new Car(0, 0, 515, Math.PI);
    c.heading = 0; // facing the mansion's front door, south
    for (let t = 0; t < 4; t += STEP) c.step({ steer: 0, throttle: 1 }, STEP);
    expect(c.z).toBeLessThan(MANSION.z0);
  });

  test('nothing solid sits on a road', () => {
    // Parked cars, lamps and trees stay off the driving lanes.
    const ROADS_TO_CHECK: [number, number][] = [[0, 300], [0, -150], [120, 60], [-240, 400], [100, -650], [0, -500]];
    for (const [x, z] of ROADS_TO_CHECK) {
      expect(onRoad(x, z)).toBe(true);
      expect(blocked(x, z, 1.2, true), `${x}, ${z}`).toBe(false);
    }
    expect(solids.length).toBeGreaterThan(100);
  });
});

describe('driving', () => {
  test('the family car speeds up down the country road and steers', () => {
    const c = new Car(0, 0, -20, Math.PI); // facing north
    for (let t = 0; t < 4; t += STEP) c.step({ steer: 0, throttle: 1 }, STEP);
    expect(c.speed).toBeGreaterThan(12);
    expect(c.z).toBeLessThan(-40);
    const h = c.heading;
    for (let t = 0; t < 0.5; t += STEP) c.step({ steer: 1, throttle: 0 }, STEP);
    expect(c.heading).toBeLessThan(h); // right turns the heading down
  });

  test('braking stops the car and then it backs up', () => {
    const c = new Car(0, 0, -20, Math.PI);
    for (let t = 0; t < 2; t += STEP) c.step({ steer: 0, throttle: 1 }, STEP);
    for (let t = 0; t < 3; t += STEP) c.step({ steer: 0, throttle: -1 }, STEP);
    expect(c.speed).toBeLessThan(0);
  });

  test('the supercar is the fastest', () => {
    const top = (i: number) => {
      const c = new Car(i, 0, -20, Math.PI);
      for (let t = 0; t < 8; t += STEP) {
        c.step({ steer: 0, throttle: 1 }, STEP);
        c.z = -20; // stay on the road
      }
      return c.speed;
    };
    expect(top(5)).toBeGreaterThan(top(0) + 10);
  });
});

describe('the clock', () => {
  test('night and day', () => {
    expect(isNight(22)).toBe(true);
    expect(isNight(3)).toBe(true);
    expect(isNight(12)).toBe(false);
    expect(daylight(12)).toBeGreaterThan(0.95);
    expect(daylight(0)).toBe(0);
  });

  test('a day goes round', () => {
    const c = { day: 1, hour: 23 };
    tick(c, HOUR_SECS * 2);
    expect(c.day).toBe(2);
    expect(c.hour).toBeCloseTo(1);
  });

  test('sleeping wakes you at 7 the next morning', () => {
    const late = { day: 3, hour: 22 };
    sleep(late);
    expect(late).toEqual({ day: 4, hour: 7 });
    const early = { day: 3, hour: 2 };
    sleep(early);
    expect(early).toEqual({ day: 3, hour: 7 });
  });
});

describe('your life', () => {
  test('work gives you every car once, then trophies', () => {
    const l = newLife();
    expect(ownedCars(l)).toEqual([0]);
    for (const want of REWARD_CARS) expect(doWork(l).car).toBe(want);
    expect(ownedCars(l)).toEqual([0, ...REWARD_CARS]);
    expect(doWork(l).trophy).toBe(true);
    expect(l.trophies).toBe(1);
  });

  test('the bag fills up', () => {
    const l = newLife();
    for (let i = 0; i < BAG_MAX; i++) expect(take(l, '🍎')).toBe(true);
    expect(take(l, '🍎')).toBe(false);
  });

  test('a broken save turns back into a life', () => {
    const l = fromSave({ day: -3, hour: 99, earned: 50, bag: ['🍎', 5 as unknown as string] } as never);
    expect(l.day).toBe(1);
    expect(l.hour).toBeLessThan(24);
    expect(l.earned).toBe(REWARD_CARS.length);
    expect(l.bag).toEqual(['🍎']);
    expect(fromSave(null).hour).toBe(8);
  });
});
