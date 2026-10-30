import { describe, expect, test } from 'vitest';
import { Skater, type Input, type SkateEvent } from '../src/sim/skater';
import { chunk, CHUNK, MEGA, MILE, surfaceAt, type Rail } from '../src/sim/world';

const NONE: Input = { steer: 0, throttle: 0, ollie: false, kickflip: false, backflip: false };
const STATS = { push: 11, pop: 5.2 };

/** Runs until `stop` says so (or a time limit), collecting events. */
function run(s: Skater, secs: number, input: (s: Skater, t: number) => Partial<Input> = () => ({}), stop?: (e: SkateEvent) => boolean) {
  const events: SkateEvent[] = [];
  for (let t = 0; t < secs; t += 1 / 120) {
    s.step({ ...NONE, ...input(s, t) });
    for (const e of s.takeEvents()) {
      events.push(e);
      if (stop?.(e)) return events;
    }
  }
  return events;
}

const landOrBail = (e: SkateEvent) => e.type === 'land' || e.type === 'bail';

describe('the mega ramp', () => {
  test('pushing off the roof flies off the kicker and lands on the landing ramp', () => {
    const s = new Skater(STATS);
    let pushed = false;
    const ev = run(s, 40, (s) => ({ throttle: s.z < 0 ? 1 : 0 }), (e) => {
      if (e.type === 'land' && e.air > 2) pushed = true;
      return pushed || e.type === 'bail';
    });
    const land = ev.find((e) => e.type === 'land' && e.air > 2);
    expect(ev.some((e) => e.type === 'bail')).toBe(false);
    expect(land).toBeDefined();
    expect(s.z).toBeGreaterThan(MEGA.lipS + 14); // past the table, on the slope down
    expect(s.z).toBeLessThan(MEGA.prof.len);
    if (land?.type === 'land') expect(land.air).toBeGreaterThan(3.5); // lots of time for tricks
  });

  test('a backflip and a kickflip off the kicker land', () => {
    const s = new Skater(STATS);
    let flips = 0;
    const ev = run(
      s,
      40,
      (s) => {
        if (s.mode !== 'air' || s.z < MEGA.lipS) return { throttle: s.z < 0 ? 1 : 0 };
        if (flips === 0 && s.air > 0.2) return (flips++, { backflip: true });
        if (flips === 1 && s.air > 1.5) return (flips++, { kickflip: true });
        return {};
      },
      (e) => (e.type === 'land' && e.air > 2) || e.type === 'bail',
    );
    const last = ev[ev.length - 1];
    expect(last.type).toBe('land');
    if (last.type === 'land') expect(last.tricks).toEqual(['Kickflip', 'Backflip']);
  });

  test('you cannot ride off the side of the ramp on the way down', () => {
    const s = new Skater(STATS);
    const ev = run(s, 12, (s) => ({ throttle: s.z < 0 ? 1 : 0, steer: s.z > 20 ? 1 : 0 }), (e) => e.type === 'bail');
    expect(ev.some((e) => e.type === 'bump')).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(6.2);
  });
});

describe('tricks on flat ground', () => {
  const flat = () => {
    const s = new Skater(STATS);
    s.x = 0;
    s.z = 260;
    s.y = surfaceAt(0, 260, 1).h;
    s.speed = 6;
    return s;
  };

  test('an ollie goes up over a metre and lands', () => {
    const s = flat();
    let top = 0;
    const ev = run(s, 3, (s, t) => ((top = Math.max(top, s.y)), { ollie: t < 0.01 }), landOrBail);
    expect(top).toBeGreaterThan(1.2);
    const l = ev.find((e) => e.type === 'land');
    expect(l?.type === 'land' && l.tricks).toEqual(['Ollie']);
  });

  test('a kickflip from flat ground lands', () => {
    const s = flat();
    const ev = run(s, 3, (_, t) => ({ kickflip: t < 0.01 }), landOrBail);
    const l = ev.find((e) => e.type === 'land');
    expect(l?.type === 'land' && l.tricks).toEqual(['Kickflip']);
  });

  test('two backflips are too many for a little ollie', () => {
    const s = flat();
    const ev = run(s, 3, (s, t) => ({ backflip: t < 0.01 || (s.mode === 'air' && Math.abs(t - 0.8) < 0.005) }), landOrBail);
    expect(ev.some((e) => e.type === 'bail')).toBe(true);
    expect(s.mode).toBe('bail');
    run(s, 3); // gets back up
    expect(s.mode).toBe('ground');
  });

  test('spinning 180 in the air lands and scores', () => {
    const s = flat();
    const ev = run(s, 3, (s, t) => ({ ollie: t < 0.01, steer: s.mode === 'air' && Math.abs(s.spun) < Math.PI - 0.05 ? 1 : 0 }), landOrBail);
    const l = ev.find((e) => e.type === 'land');
    expect(l?.type === 'land' && l.tricks).toEqual(['180']);
  });
});

describe('rails', () => {
  /** The first flat street rail (the "flat rail" feature) in the city. */
  function findRail(): Rail {
    for (let i = 3; i < 200; i++) {
      const r = chunk(i).rails.find((r) => !r.edge && r.a[1] === 0.45 && r.b[1] === 0.45);
      if (r) return r;
    }
    throw new Error('no flat rail');
  }

  test('ollie onto a rail, grind it, ride off the end', () => {
    const r = findRail();
    const s = new Skater(STATS);
    s.x = r.a[0];
    s.z = r.a[2] - 2;
    s.y = surfaceAt(s.x, s.z, 1).h;
    s.speed = 6;
    const ev = run(s, 5, (_, t) => ({ ollie: t < 0.01 }));
    const types = ev.map((e) => e.type);
    expect(types).toContain('grind-start');
    expect(types).toContain('grind-end');
    expect(types).not.toContain('bail');
    const end = ev.find((e) => e.type === 'grind-end');
    expect(end?.type === 'grind-end' && end.points).toBeGreaterThan(0);
  });
});

describe('bumping into things', () => {
  /** The first piece or rail in the city that `find` picks. */
  function first<T>(find: (i: number) => T | undefined): T {
    for (let i = 3; i < 200; i++) {
      const f = find(i);
      if (f) return f;
    }
    throw new Error('not found');
  }

  test('riding into a rail from the side bounces off it (no riding through)', () => {
    const r = first((i) => chunk(i).rails.find((r) => !r.edge && r.a[0] === r.b[0] && r.a[1] === 0.45 && r.b[1] === 0.45));
    for (const speed of [3, 6, 9]) {
      const s = new Skater(STATS);
      s.x = r.a[0] - 3;
      s.z = (r.a[2] + r.b[2]) / 2;
      s.y = surfaceAt(s.x, s.z, 1).h;
      s.heading = Math.PI / 2; // facing +x, straight at the rail
      s.speed = speed;
      let furthest = -1e9;
      run(s, 3, (s) => ((furthest = Math.max(furthest, s.x)), {}));
      expect(furthest).toBeLessThan(r.a[0]);
    }
  });

  test('riding into the side of a ledge or ramp stops the board before it goes in', () => {
    const ledge = first((i) => chunk(i).pieces.find((p) => p.kind === 'box' && p.top === 0.45));
    for (const speed of [3, 6, 10]) {
      const s = new Skater(STATS);
      s.x = ledge.x0 - 4;
      s.z = (ledge.z0 + ledge.z1) / 2;
      s.y = 0;
      s.heading = Math.PI / 2;
      s.speed = speed;
      let furthest = -1e9;
      run(s, 3, (s) => ((furthest = Math.max(furthest, s.x)), {}));
      expect(furthest).toBeLessThan(ledge.x0 - 0.3); // the nose stops at the wall, not the middle
    }
    const qp = first((i) => chunk(i).pieces.find((p) => p.kind === 'ramp' && p.coping && p.axis === 'x' && p.dir === 1));
    // Ride along the street into the end of a quarter pipe, beside its tall top.
    const s = new Skater(STATS);
    s.x = qp.x1 - 0.3;
    s.z = qp.z0 - 4;
    s.y = 0;
    s.speed = 6;
    let deepest = -1e9;
    run(s, 3, (s) => ((deepest = Math.max(deepest, s.z)), {}));
    expect(deepest).toBeLessThan(qp.z0 - 0.3);
  });
});

describe('the city', () => {
  test('is 10 miles long, with something to skate in every chunk', () => {
    expect(Math.round((MILE * 10) / 100)).toBe(161);
    for (let i = 3; i < 150; i++) expect(chunk(i).pieces.length + chunk(i).rails.length).toBeGreaterThan(2);
  });

  test('a robot pushing down the middle for 2 miles never falls (big jumps included)', () => {
    const s = new Skater(STATS);
    s.z = 260;
    s.y = 0;
    const ev = run(s, 400, (s) => ({ throttle: 1, steer: Math.max(-1, Math.min(1, s.x * 0.5 + Math.sin(s.heading) * 2)) }), (e) => e.type === 'bail' || s.z > 260 + 2 * MILE);
    expect(ev.filter((e) => e.type === 'bail')).toEqual([]);
    expect(s.z).toBeGreaterThan(260 + 2 * MILE - CHUNK);
    expect(ev.filter((e) => e.type === 'land' && e.air > 0.6).length).toBeGreaterThan(3); // flew off the big jumps
  });

  test('the street ends in a wall: you bump it, you do not fall out of the world', () => {
    const s = new Skater(STATS);
    s.z = 16093 - 30;
    s.y = surfaceAt(0, s.z, 1).h;
    s.speed = 5;
    run(s, 10, () => ({ throttle: 0.3 }));
    expect(s.z).toBeLessThan(16093.01);
  });
});
