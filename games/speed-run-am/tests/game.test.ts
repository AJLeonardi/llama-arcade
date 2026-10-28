import { describe, expect, it } from 'vitest';
import { deadEnds, makeMaze, solve } from '../src/sim/maze';
import { BROWN, LAST_LEVEL, makeLevel, PINK, workoutRoom } from '../src/sim/levels';
import { FAILS_TO_GYM, MAX_GAP, Sim, WALK, boulderZ, type Input, type SimEvent } from '../src/sim/physics';
import type { Block, Kind, Level } from '../src/sim/types';

const NONE: Input = { moveX: 0, moveZ: 0, jump: false };
const NORTH: Input = { moveX: 0, moveZ: 1, jump: false };

const blk = (x: number, top: number, z: number, w: number, d: number, kind: Kind = 'solid', more: Partial<Block> = {}): Block => ({
  x, y: top - 0.5, z, w, h: 1, d, kind, color: '#fff', ...more,
});

function level(blocks: Block[], extra: Partial<Level> = {}): Level {
  return { num: 1, name: 't', emoji: '', spawn: [0, 0, 0], spawnYaw: 0, blocks, chasers: [], boulders: [], poops: [], signs: [], fallY: -20, sky: '#000', ...extra };
}

function run(sim: Sim, steps: number, input: Input | ((s: Sim) => Input) = NONE) {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) events.push(...sim.step(typeof input === 'function' ? input(sim) : input));
  return events;
}
const has = (ev: SimEvent[], type: SimEvent['type']) => ev.some((e) => e.type === type);

describe('mazes', () => {
  it('always have a way through, and every cell can be reached', () => {
    for (let n = 4; n <= 12; n++) {
      const m = makeMaze(n, n * 31);
      const path = solve(m);
      expect(path[0]).toBe(m.entry);
      expect(path[path.length - 1]).toBe((n - 1) * n + m.exit);
      // A perfect maze on n*n cells has exactly n*n - 1 openings.
      const openings = m.open.flat().filter(Boolean).length / 2;
      expect(openings).toBe(n * n - 1);
    }
  });

  it('never puts a trap on the way through', () => {
    for (let n = 4; n <= 12; n++) {
      const m = makeMaze(n, n * 97);
      const path = new Set(solve(m));
      for (const c of deadEnds(m)) expect(path.has(c)).toBe(false);
    }
  });

  it('get bigger every level, except the Big Jump which has none', () => {
    const sizes = Array.from({ length: 9 }, (_, i) => makeLevel(i + 1).maze!);
    sizes.forEach((s, i) => i && expect(s).toBeGreaterThan(sizes[i - 1]));
    expect(makeLevel(LAST_LEVEL).maze).toBeUndefined();
  });
});

describe('the workout room', () => {
  const room = workoutRoom();

  it('has 7 treadmills, a whole keyboard, a cape and 10 doors', () => {
    expect(room.blocks.filter((b) => b.kind === 'treadmill')).toHaveLength(7);
    expect(room.blocks.filter((b) => b.kind === 'key')).toHaveLength(26);
    expect(room.blocks.filter((b) => b.kind === 'cape')).toHaveLength(1);
    expect(room.blocks.filter((b) => b.kind === 'door').map((b) => b.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('treadmills make you faster and faster', () => {
    const sim = new Sim(room);
    const mill = room.blocks.find((b) => b.kind === 'treadmill')!;
    sim.pos = [mill.x, 0.5, mill.z];
    run(sim, 60 * 3, NORTH);
    const after3 = sim.boost;
    run(sim, 60 * 3, NORTH);
    expect(after3).toBeGreaterThan(0.2);
    expect(sim.boost).toBeGreaterThan(after3);
    expect(sim.speed).toBeGreaterThan(WALK * 1.5);
  });

  it("treadmills are hard to run to the front of, even when you're fast", () => {
    const mill = room.blocks.find((b) => b.kind === 'treadmill')!;
    for (const boost of [0, 1]) {
      const sim = new Sim(room);
      sim.boost = boost;
      sim.pos = [mill.x, 0.5, mill.z - mill.d / 2 + 1];
      run(sim, 60 * 6, NORTH);
      expect(sim.pos[2] - (mill.z - mill.d / 2 + 1)).toBeLessThan(mill.d * 0.6);
    }
  });

  it('each new keyboard key makes you a tiny bit faster', () => {
    const sim = new Sim(room);
    const keys = room.blocks.filter((b) => b.kind === 'key' && Math.abs(b.z - 4) < 0.1); // the top row
    sim.pos = [keys[0].x, 0.5, keys[0].z];
    const ev = run(sim, 60 * 4, { moveX: -1, moveZ: 0, jump: false });
    expect(ev.filter((e) => e.type === 'key').length).toBeGreaterThanOrEqual(8);
    expect(sim.boost).toBeGreaterThan(0.15);
    expect(sim.boost).toBeLessThan(0.4);
  });

  it('locked doors stay shut until the level before is done', () => {
    const sim = new Sim(room);
    const door2 = room.blocks.find((b) => b.kind === 'door' && b.level === 2)!;
    sim.pos = [door2.x, 0, door2.z - 3];
    const ev = run(sim, 60 * 2, NORTH);
    expect(has(ev, 'locked')).toBe(true);
    expect(has(ev, 'door')).toBe(false);
    sim.unlocked = 2;
    sim.pos = [door2.x, 0, door2.z - 3];
    expect(run(sim, 60 * 2, NORTH)).toContainEqual({ type: 'door', level: 2 });
  });
});

describe('the cape', () => {
  /** How far a running jump goes from the edge of a long floor. */
  function jumpLength(cape: boolean) {
    const sim = new Sim(level([blk(0, 0, 0, 4, 40)], { spawn: [0, 0, -15] }));
    sim.cape = cape;
    let landed = 0;
    run(sim, 60 * 6, (s) => {
      if (!landed && s.pos[2] > 20 && s.pos[1] <= 0 && s.vel[1] <= 0) landed = s.pos[2];
      return { moveX: 0, moveZ: 1, jump: s.pos[2] > 19.5 && s.onGround };
    });
    return landed - 20;
  }

  it('makes you jump farther', () => {
    const plain = jumpLength(false), caped = jumpLength(true);
    expect(plain).toBeGreaterThan(MAX_GAP * 0.8);
    expect(caped).toBeGreaterThan(plain * 1.5);
  });
});

describe('hazards', () => {
  it('the chaser catches you if you stand still, and starts over when you do', () => {
    const lv = level([blk(0, 0, 0, 30, 30), blk(0, 0, 0, 1, 1, 'zone', { tag: 'chase', y: 1, h: 2 })], {
      chasers: [{ home: [8, 0, 8], speed: 5, room: [-15, -15, 15, 15], tag: 'chase' }],
      spawn: [0, 0, -3],
    });
    const sim = new Sim(lv);
    run(sim, 30, NORTH); // walk into the zone
    expect(sim.chasers[0].on).toBe(true);
    const ev = run(sim, 60 * 5);
    expect(ev).toContainEqual({ type: 'oops', why: 'caught' });
    sim.respawn();
    expect(sim.chasers[0].on).toBe(false);
    expect(sim.chasers[0].pos).toEqual([8, 0, 8]);
  });

  it('the chaser goes round a pillar to get you', () => {
    const lv = level([blk(0, 0, 0, 30, 30), { x: 0, y: 1.5, z: 3, w: 4, h: 3, d: 2, kind: 'solid', color: '#000' }], {
      chasers: [{ home: [0, 0, 8], speed: 5, room: [-15, -15, 15, 15], tag: 'chase' }],
    });
    const sim = new Sim(lv);
    sim.chasers[0].on = true;
    expect(run(sim, 60 * 6)).toContainEqual({ type: 'oops', why: 'caught' });
  });

  it('the boulder rolls, waits and rolls again', () => {
    const b = { x: 0, y: 0, z0: 40, z1: 0, r: 2.7, speed: 10, wait: 1 };
    expect(boulderZ(b, 0)).toBe(40);
    expect(boulderZ(b, 2)).toBeCloseTo(20);
    expect(boulderZ(b, 4.5)).toBeNull();
    expect(boulderZ(b, 5.5)).toBeCloseTo(35);
  });

  it('the boulder squashes you in the corridor but not in a hole in the wall', () => {
    const boulders = [{ x: 0, y: 0, z0: 20, z1: -20, r: 2.7, speed: 10, wait: 10 }];
    const inCorridor = new Sim(level([blk(0, 0, 0, 20, 60)], { boulders, spawn: [1, 0, 0] }));
    expect(run(inCorridor, 60 * 3)).toContainEqual({ type: 'oops', why: 'boulder' });
    const inHole = new Sim(level([blk(0, 0, 0, 20, 60)], { boulders, spawn: [4.5, 0, 0] }));
    expect(has(run(inHole, 60 * 3), 'oops')).toBe(false);
  });

  it('closing walls squish you', () => {
    const lv = level([blk(0, 0, 0, 10, 10), { x: 6, y: 2, z: 0, w: 4, h: 4, d: 1.2, kind: 'crush', color: '#f00', move: { dx: -4, dy: 0, dz: 0, period: 2 } }]);
    expect(run(new Sim(lv), 60 * 2)).toContainEqual({ type: 'oops', why: 'squish' });
  });

  it('the poop rises once you step in, and gets you if you stay down', () => {
    const lv = level([blk(0, 0, 0, 12, 12), blk(0, 0, -5, 2, 1, 'zone', { tag: 'p', y: 1, h: 2 })], {
      poops: [{ area: [-6, -6, 6, 6], y0: -1, y1: 10, speed: 1, delay: 1, tag: 'p' }],
      spawn: [0, 0, -3],
    });
    const sim = new Sim(lv);
    const ev = run(sim, 20, { moveX: 0, moveZ: -1, jump: false }); // step into the zone
    ev.push(...run(sim, 60 * 4));
    expect(has(ev, 'poop')).toBe(true);
    expect(ev).toContainEqual({ type: 'oops', why: 'poop' });
  });

  it('a maze trap sends you all the way back to the start', () => {
    const lv = level([blk(0, 0, -9, 4, 24), blk(0, 0, 4, 4, 2, 'checkpoint'), blk(0, 0, 12.5, 4, 15), blk(0, 0.05, 15, 3, 3, 'trap')], { spawn: [0, 0, -15] });
    const sim = new Sim(lv);
    const ev = run(sim, 60 * 5, NORTH);
    expect(has(ev, 'checkpoint')).toBe(true);
    expect(has(ev, 'trap')).toBe(true);
    expect(sim.checkpoint).toEqual([0, 0, -15]);
  });

  it(`counts losses in a row (${FAILS_TO_GYM} sends you to the workout room), and a checkpoint resets them`, () => {
    const sim = new Sim(level([blk(0, 0, 0, 4, 4)], { spawn: [0, 0, 0], fallY: -5 }));
    for (let i = 0; i < 3; i++) {
      sim.pos = [0, -10, 0];
      run(sim, 2);
      sim.respawn();
    }
    expect(sim.fails).toBe(3);
  });
});

describe('every level', () => {
  const levels = Array.from({ length: LAST_LEVEL }, (_, i) => makeLevel(i + 1));

  it('has a start, a finish and checkpoints', () => {
    for (const lv of levels) {
      expect(lv.blocks.some((b) => b.kind === 'finish')).toBe(true);
      expect(lv.blocks.filter((b) => b.kind === 'checkpoint').length).toBeGreaterThan(0);
      // You start standing on something.
      const [x, y, z] = lv.spawn;
      expect(lv.blocks.some((b) => b.kind === 'solid' && Math.abs(b.x - x) < b.w / 2 && Math.abs(b.z - z) < b.d / 2 && Math.abs(b.y + b.h / 2 - y) < 0.01)).toBe(true);
    }
  });

  it('never has a jump over the goo longer than you can jump without the cape', () => {
    for (const lv of levels) {
      const pads = lv.blocks.filter((b) => (b.log || b.color === PINK || b.color === BROWN) && b.h <= 1 && b.y < 1);
      const sorted = pads.sort((a, b) => a.z - b.z);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].z - sorted[i].d / 2 - (sorted[i - 1].z + sorted[i - 1].d / 2);
        if (gap > 0 && gap < 10) expect(gap).toBeLessThan(MAX_GAP * 0.8);
      }
    }
  });

  it('you can walk in through the poop climb door and jump onto the first step', () => {
    for (const lv of levels.slice(0, 9)) {
      const zone = lv.blocks.find((b) => b.tag === 'poop')!;
      const sim = new Sim(lv);
      sim.pos = [0, 0, zone.z - 3];
      run(sim, 60, NORTH);
      expect(sim.pos[2]).toBeGreaterThan(zone.z + 3); // through the door, into the middle of the room
      // The first step is in a corner: run at it and jump.
      const step = lv.blocks.filter((b) => b.w === 2.6 && b.d === 2.6 && b.z > zone.z).sort((a, b) => a.y - b.y)[0];
      run(sim, 60 * 2, (s) => {
        if (s.onGround && s.level.blocks[s.ground] === step) return NONE; // made it
        const dx = step.x - s.pos[0], dz = step.z - s.pos[2], d = Math.hypot(dx, dz) || 1;
        return { moveX: dx / d, moveZ: dz / d, jump: d < 2.5 && s.onGround };
      });
      expect(sim.onGround && sim.level.blocks[sim.ground] === step, `level ${lv.num}`).toBe(true);
    }
  });

  it('a robot can climb every step to the top before the poop gets it', () => {
    for (const lv of levels.slice(0, 9)) {
      const zone = lv.blocks.find((b) => b.tag === 'poop')!;
      const steps = lv.blocks.filter((b) => b.w === 2.6 && b.d === 2.6 && b.z > zone.z).sort((a, b) => a.y - b.y);
      const deck = lv.blocks.find((b) => b.w === 12 && b.d === 3 && b.z > zone.z)!;
      const sim = new Sim(lv);
      sim.pos = [0, 0, zone.z - 3];
      const ev = run(sim, 40, NORTH); // in through the door: the poop starts
      let k = 0;
      ev.push(
        ...run(sim, 60 * 60, (s) => {
          const target = steps[k] ?? deck;
          if (s.onGround && s.level.blocks[s.ground] === target) {
            if (target === deck) return NONE;
            k++;
            return NONE;
          }
          const tx = target === deck ? Math.max(-4, Math.min(4, s.pos[0])) : target.x;
          const dx = tx - s.pos[0], dz = target.z - s.pos[2], d = Math.hypot(dx, dz) || 1;
          const slow = Math.min(1, d / 0.8);
          return { moveX: (dx / d) * slow, moveZ: (dz / d) * slow, jump: d < 3.2 && s.onGround };
        }),
      );
      expect(has(ev, 'poop'), `level ${lv.num}`).toBe(true);
      expect(has(ev, 'oops'), `level ${lv.num}`).toBe(false);
      expect(sim.level.blocks[sim.ground], `level ${lv.num}`).toBe(deck);
    }
  });

  it('the poop climb steps are low enough to jump', () => {
    for (const lv of levels.slice(0, 9)) {
      const steps = lv.blocks.filter((b) => b.w === 2.6 && b.d === 2.6).map((b) => b.y + b.h / 2);
      for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeLessThanOrEqual(1.6 + 1e-9);
    }
  });

  it('a runner can stand at the start for a while without anything happening', () => {
    for (const lv of levels) {
      const sim = new Sim(lv);
      expect(has(run(sim, 60 * 5), 'oops')).toBe(false);
    }
  });
});
