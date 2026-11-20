import { describe, expect, it } from 'vitest';
import { GAINS, makeLevel, wallNeed } from '../src/sim/levels';
import { nice, short } from '../src/sim/numbers';
import { MAX_GAP, Sim, TOP_RUN, WALK, runSpeed, type Input, type SimEvent } from '../src/sim/physics';
import type { Block, Kind, Level } from '../src/sim/types';

const NONE: Input = { moveX: 0, moveZ: 0, jump: false };
const NORTH: Input = { moveX: 0, moveZ: 1, jump: false };

const blk = (x: number, top: number, z: number, w: number, d: number, kind: Kind = 'solid', more: Partial<Block> = {}): Block => ({
  x, y: top - 0.5, z, w, h: 1, d, kind, color: '#fff', ...more,
});

function level(blocks: Block[], extra: Partial<Level> = {}): Level {
  return { num: 1, spawn: [0, 0, 0], spawnYaw: 0, blocks, signs: [], finishZ: 1e9, fallY: -20, sky: '#000', ...extra };
}

function run(sim: Sim, steps: number, input: Input | ((s: Sim) => Input) = NONE) {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) events.push(...sim.step(typeof input === 'function' ? input(sim) : input));
  return events;
}
const has = (ev: SimEvent[], type: SimEvent['type']) => ev.some((e) => e.type === type);

/** Where a jump taken right now would land: true if it lands safely past `past`. */
function jumpLands(sim: Sim, past: number) {
  const ghost = new Sim(sim.level);
  ghost.pos = [...sim.pos];
  ghost.vel = [...sim.vel];
  ghost.speed = sim.speed;
  ghost.onGround = sim.onGround;
  ghost.ground = sim.ground;
  sim.smashed.forEach((i) => ghost.smashed.add(i));
  ghost.step({ moveX: 0, moveZ: 1, jump: true });
  for (let i = 0; i < 240; i++) {
    const ev = ghost.step({ moveX: -ghost.pos[0] * 0.3, moveZ: 1, jump: false });
    if (ghost.broken) return false;
    if (ghost.finished) return true;
    if (ev.some((e) => e.type === 'land')) {
      if (ghost.pos[2] <= past) return false;
      // ...with room to jump again before the next goo.
      for (let k = 0; k < 4; k++) ghost.step({ moveX: 0, moveZ: 1, jump: false });
      return !ghost.broken;
    }
  }
  return false;
}

/** A robot that runs north down the middle and jumps over goo and gaps, picking a jump that lands safely. */
function robot(sim: Sim): Input {
  const L = sim.level;
  const v = Math.hypot(sim.vel[0], sim.vel[2]);
  const [x, , z] = sim.pos;
  const north = { moveX: -x * 0.3, moveZ: 1 };
  if (!sim.onGround) return { ...north, jump: false };
  // The next danger: goo, or the end of the floor.
  const floorAt = (zz: number) => L.blocks.some((b) => !b.deco && b.kind !== 'goo' && Math.abs(b.x - x) < b.w / 2 && Math.abs(b.z - zz) < b.d / 2 && b.y + b.h / 2 > -0.1 && b.y + b.h / 2 < 0.7);
  const goo = L.blocks.filter((b) => b.kind === 'goo' && b.z - b.d / 2 > z).map((b) => b.z - b.d / 2);
  let edge = Infinity;
  for (let d = 0; d < 80; d += 0.25) if (!floorAt(z + d)) { edge = z + d; break; }
  const danger = Math.min(edge, ...goo);
  const must = danger - z < 1 + v * 0.06;
  const near = danger - z < 1 + v * 0.8;
  return { ...north, jump: must || (near && jumpLands(sim, danger)) };
}

describe('numbers', () => {
  it('makes big speeds short', () => {
    expect(short(7)).toBe('7');
    expect(short(1234)).toBe('1.2K');
    expect(short(5_600_000)).toBe('5.6M');
    expect(short(250_000_000_000)).toBe('250B');
    expect(short(Infinity)).toBe('∞');
    expect(short(3e50)).toBe('3.0e50');
  });

  it('rounds wall speeds to 2 digits', () => {
    expect(nice(3276)).toBe(3300);
    expect(nice(42)).toBe(42);
  });
});

describe('speed has no top', () => {
  it('a treadmill keeps making you faster, faster and faster', () => {
    // The treadmill, with the console in front of it like in the gym.
    const sim = new Sim(level([blk(0, 0, 0, 4, 40, 'treadmill', { push: [0, -5], gain: 1 }), blk(0, 1.5, 20.5, 4, 1, 'solid', { h: 1.5 })]));
    run(sim, 60 * 10, NORTH);
    expect(sim.speed).toBeGreaterThan(10); // level 1's wall, after 10 s on the ×1 treadmill
    run(sim, 60 * 60, NORTH);
    const s = sim.speed;
    run(sim, 60 * 30, NORTH);
    expect(sim.speed).toBeGreaterThan(s * 2); // past 33 it keeps growing faster
    expect(sim.pos[1]).toBeCloseTo(0); // still on it
  });

  it('the big treadmills are right in front of the speed wall', () => {
    for (const n of [1, 5]) {
      const L = makeLevel(n);
      const wall = L.blocks.find((b) => b.kind === 'wall')!;
      const big = L.blocks.filter((b) => b.kind === 'treadmill' && (b.gain ?? 0) >= 10);
      expect(big).toHaveLength(4);
      for (const b of big) expect(wall.z - b.z).toBeLessThan(30);
    }
  });

  it('bigger treadmills are faster, and they are all free', () => {
    const at = (gain: number) => {
      const sim = new Sim(level([blk(0, 0, 0, 4, 40, 'treadmill', { push: [0, -5], gain })]));
      run(sim, 300, NORTH);
      return sim.speed;
    };
    expect(at(100)).toBeGreaterThan(at(10));
    expect(at(10)).toBeGreaterThan(at(1));
    const L = makeLevel(1);
    expect(L.blocks.filter((b) => b.kind === 'treadmill').map((b) => b.gain)).toEqual(GAINS);
  });

  it('can reach infinity and still works', () => {
    const sim = new Sim(level([blk(0, 0, 0, 10, 4000)]));
    sim.speed = Infinity;
    run(sim, 60, NORTH);
    expect(Number.isFinite(sim.pos[2])).toBe(true);
    expect(sim.pos[2]).toBeGreaterThan(TOP_RUN * 0.5);
    expect(short(sim.speed)).toBe('∞');
  });

  it('runs faster as the speed goes up, but never too fast to steer sideways', () => {
    expect(runSpeed(1)).toBe(WALK);
    expect(runSpeed(100)).toBeGreaterThan(runSpeed(10));
    const sim = new Sim(level([blk(0, 0, 0, 400, 400)]));
    sim.speed = 1e9;
    run(sim, 60, { moveX: 1, moveZ: 0, jump: false });
    expect(Math.abs(sim.vel[0])).toBeLessThanOrEqual(14.01);
  });

  it('each new keyboard key adds 1', () => {
    const sim = new Sim(level([blk(0, 0, 0, 10, 200, 'solid', { keyboard: ['#fff'] })]));
    run(sim, 60, NORTH);
    expect(sim.speed).toBeGreaterThan(3);
    expect(sim.speed).toBe(Math.floor(sim.speed));
  });
});

describe('speed walls', () => {
  const wallLevel = () => level([blk(0, 0, 10, 10, 60), blk(0, 4, 10, 10, 1, 'wall', { h: 8, need: 50 }), blk(0, 0, 30, 10, 10)]);

  it('stop you if you are too slow, and say so', () => {
    const sim = new Sim(wallLevel());
    sim.pos = [0, 0, 0];
    const ev = run(sim, 120, NORTH);
    expect(has(ev, 'tooSlow')).toBe(true);
    expect(sim.pos[2]).toBeLessThan(10);
    expect(ev.filter((e) => e.type === 'tooSlow')).toHaveLength(1); // once per bump
  });

  it('smash when you are fast enough', () => {
    const sim = new Sim(wallLevel());
    sim.speed = 50;
    const ev = run(sim, 120, NORTH);
    expect(has(ev, 'smash')).toBe(true);
    expect(sim.pos[2]).toBeGreaterThan(11);
  });

  it('need more speed every level, for ever', () => {
    for (let n = 1; n < 40; n++) expect(wallNeed(n + 1)).toBeGreaterThan(wallNeed(n));
    expect(wallNeed(1)).toBe(10);
  });
});

describe('going really fast', () => {
  it('goo gets you when you are slow, but you skim over it when you are really fast', () => {
    const slow = new Sim(level([blk(0, 0, 0, 10, 4000), blk(0, 0.4, 30, 10, 1.2, 'goo')]));
    slow.speed = 30;
    expect(has(run(slow, 300, NORTH), 'oops')).toBe(true);
    const fast = new Sim(level([blk(0, 0, 0, 10, 4000), blk(0, 0.4, 30, 10, 1.2, 'goo')]));
    fast.speed = 1e12;
    const ev = run(fast, 120, NORTH);
    expect(has(ev, 'oops')).toBe(false);
    expect(has(ev, 'skim')).toBe(true);
    expect(fast.pos[2]).toBeGreaterThan(100);
  });

  it('never skips through a wall', () => {
    const sim2 = new Sim(level([blk(0, 0, 0, 10, 4000), blk(0, 4, 100, 10, 1, 'wall', { h: 8, need: 1e15 })]));
    sim2.speed = 1e12;
    run(sim2, 120, NORTH);
    expect(sim2.pos[2]).toBeLessThan(100);
  });

  it('a jump at speed 1 goes ~5', () => {
    expect(MAX_GAP).toBeGreaterThan(4);
  });
});

describe('levels', () => {
  it('are one straight road, starting at the gym, with the finish ahead', () => {
    for (let n = 1; n <= 12; n++) {
      const L = makeLevel(n);
      expect(L.spawn[2]).toBeLessThan(L.finishZ);
      expect(L.blocks.filter((b) => b.kind === 'wall')).toHaveLength(1);
      expect(L.blocks.filter((b) => b.kind === 'treadmill')).toHaveLength(8);
    }
  });

  it('a robot with just enough speed runs from the start to the finish line', () => {
    for (const n of [1, 2, 3, 5, 8]) {
      const sim = new Sim(makeLevel(n));
      sim.speed = wallNeed(n);
      const ev = run(sim, 60 * 40, robot);
      const oops = ev.find((e) => e.type === 'oops');
      expect(oops ? `${oops.type} at z ${sim.pos[2].toFixed(1)} speed ${sim.speed}` : 'ok', `level ${n}`).toBe('ok');
      expect(has(ev, 'smash'), `level ${n}`).toBe(true);
      expect(has(ev, 'finish'), `level ${n}`).toBe(true);
    }
  });

  it('a robot with no speed is stopped by the wall (from level 4 on, the keys alone are not enough)', () => {
    const sim = new Sim(makeLevel(4));
    const ev = run(sim, 60 * 40, robot);
    expect(has(ev, 'tooSlow')).toBe(true);
    expect(has(ev, 'finish')).toBe(false);
  });

  it('have rails on both sides and no holes, so you can only fall off by jumping over the rail', () => {
    for (const n of [1, 4]) {
      const sim = new Sim(makeLevel(n));
      sim.speed = 1e9; // smash the wall, skim the goo
      // Leaning on the rail all the way down the road (and down the middle of the gyms, which are walled in).
      const onRoad = (s: Sim) => (s.level.blocks[s.ground]?.w ?? 99) <= 10.01;
      const ev = run(sim, 60 * 10, (s) => ({ moveX: onRoad(s) ? 0.3 : -s.pos[0] * 0.3, moveZ: 1, jump: false }));
      expect(has(ev, 'oops'), `level ${n}`).toBe(false);
      expect(has(ev, 'finish'), `level ${n}`).toBe(true);
    }
  });

  it('get longer as you go', () => {
    expect(makeLevel(5).finishZ).toBeGreaterThan(makeLevel(1).finishZ + 100);
  });

  it('join up: you run straight on from one finish line into the next level, without falling', () => {
    const one = new Sim(makeLevel(1));
    one.speed = 50;
    run(one, 60 * 40, robot);
    expect(one.finished).toBe(true);
    // What main.ts does: the next level starts at z = 0 where the finish line was.
    const two = new Sim(makeLevel(2, false));
    two.speed = one.speed;
    two.pos = [one.pos[0], one.pos[1], one.pos[2] - one.level.finishZ];
    two.vel = [...one.vel];
    const ev = run(two, 60, NORTH);
    expect(has(ev, 'oops')).toBe(false);
    expect(two.pos[1]).toBeCloseTo(0);
    expect(two.pos[2]).toBeGreaterThan(5);
  });

  it('running backwards off the start of a joined-up level: there is floor and a wall, and you never come back in mid-air', () => {
    const sim = new Sim(makeLevel(8, false));
    sim.speed = 12531;
    const ev = run(sim, 60 * 6, { moveX: 0.2, moveZ: -1, jump: false });
    expect(has(ev, 'oops')).toBe(false);
    expect(sim.pos[1]).toBeCloseTo(0);
    expect(sim.pos[2]).toBeGreaterThan(-81);
    // Wherever the comeback spot is, it's on the floor.
    sim.respawn();
    run(sim, 60, NONE);
    expect(sim.pos[1]).toBeCloseTo(0);
  });

  it('is never too fast to steer: 9 more units/s for every ×10 of speed', () => {
    expect(runSpeed(10)).toBeCloseTo(16);
    expect(runSpeed(12531)).toBeLessThan(50);
    expect(runSpeed(Infinity)).toBe(TOP_RUN);
  });

  it('after a splat you come back just behind it, with your speed, not at the start', () => {
    const sim = new Sim(level([blk(0, 0, 0, 10, 200), blk(0, 0.3, 80, 10, 1.2, 'goo')]));
    sim.speed = 9;
    const ev = run(sim, 60 * 20, NORTH);
    expect(has(ev, 'oops')).toBe(true);
    sim.respawn();
    expect(sim.pos[2]).toBeGreaterThan(70);
    expect(sim.pos[2]).toBeLessThan(80);
    expect(sim.speed).toBeGreaterThanOrEqual(9);
  });
});
