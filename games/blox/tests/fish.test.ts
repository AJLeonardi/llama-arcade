// Fish Tank to the Ocean: the rolling bowl's physics, and a robot that rolls every level along its route.
import { describe, expect, it } from 'vitest';
import { AIR, FishSim, VESSELS, type FishEvent, type FishLevel } from '../src/sim/fish';
import { FISH_LEVELS } from '../src/sim/fishLevels';
import type { Block } from '../src/sim/types';

const floor: Block = { x: 0, y: -0.5, z: 0, w: 100, h: 1, d: 100, kind: 'solid', color: '#fff' };
const test = (blocks: Block[], more: Partial<FishLevel> = {}): FishLevel => ({
  level: { id: 't', name: 't', emoji: '', spawn: [0, 0, 0], spawnYaw: 0, blocks, coins: [], reward: 0, fallY: -20, sky: ['#000', '#000'] },
  start: [0, 0, 0], ramps: [], waters: [], tip: '', done: '', route: [], ...more,
});
const still = { moveX: 0, moveZ: 0, jump: false };
function run(s: FishSim, seconds: number, input = still) {
  const ev: FishEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) ev.push(...s.step(input));
  return ev;
}

/** Rolls a level's route: steers towards each waypoint at its speed, jumps and flops where it says. */
function roll(f: FishLevel, maxSeconds = 300) {
  const s = new FishSim(f);
  const R = f.route;
  let k = 1;
  let cracks = 0, furthest = 0;
  const log: string[] = [];
  /** How fast to be going when reaching waypoint i. */
  const arrive = (i: number) => {
    const w = R[i], next = R[i + 1], prev = R[i - 1];
    if (w.jump) return w.v ?? 5;
    if (!next || !prev) return 1;
    const ax = w.to[0] - prev.to[0], az = w.to[2] - prev.to[2], bx = next.to[0] - w.to[0], bz = next.to[2] - w.to[2];
    const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1);
    return cos > 0.9 ? Math.min(w.v ?? 5, next.v ?? 5) : 1.5;
  };
  for (let step = 0; step < maxSeconds * 60; step++) {
    const w = R[k];
    const feet = s.feet;
    const dx = w.to[0] - feet[0], dz = w.to[2] - feet[2];
    const d = Math.hypot(dx, dz);
    // Brake for a turn at the waypoint (not for one that's straight on, or a take-off point).
    const want = Math.min(w.v ?? 5, Math.sqrt(arrive(k) ** 2 + 2 * 5 * d));
    const vx = d > 0.01 ? (dx / d) * want : 0, vz = d > 0.01 ? (dz / d) * want : 0;
    let mx = (vx - s.vel[0]) / 2, mz = (vz - s.vel[2]) / 2;
    const m = Math.hypot(mx, mz);
    if (m > 1) [mx, mz] = [mx / m, mz / m];
    // In the air, only steer sideways (don't brake).
    if (!s.onGround && mx * s.vel[0] + mz * s.vel[2] < 0) {
      const sp = Math.hypot(s.vel[0], s.vel[2]) || 1, along = (mx * s.vel[0] + mz * s.vel[2]) / sp;
      mx -= (along * s.vel[0]) / sp;
      mz -= (along * s.vel[2]) / sp;
    }
    if (process.env.FISH_DEBUG === f.level.id && step % 6 === 0) console.log(k, feet.map((v) => v.toFixed(2)).join(','), s.vel.map((v) => v.toFixed(1)).join(','), s.onGround);
    const ev = s.step({ moveX: mx, moveZ: mz, jump: false });
    const bad = ev.find((e) => e.type === 'crack' || e.type === 'oops' || e.type === 'noair' || e.type === 'late');
    if (bad) {
      cracks++;
      log.push(`${bad.type} going to ${k} at ${feet.map((v) => v.toFixed(1))}`);
      if (bad.type === 'late') k = R.findIndex((r) => r.house) + 1;
      else {
        // Back to the checkpoint: carry on from the waypoint nearest to it.
        let best = k, bd = Infinity;
        R.forEach((r, i) => {
          const dd = Math.hypot(r.to[0] - s.feet[0], r.to[1] - s.feet[1], r.to[2] - s.feet[2]);
          if (i <= k && dd < bd) [best, bd] = [i, dd];
        });
        k = Math.max(1, best + 1);
      }
      continue;
    }
    if (ev.some((e) => e.type === 'bought')) {
      k = R.findIndex((r) => r.house) + 1;
      continue;
    }
    if (ev.some((e) => e.type === 'exit')) return { finished: true, seconds: step / 60, cracks, furthest, log };
    const close = Math.hypot(dx, dz) < (w.jump ? 0.35 : 0.8) && Math.abs(feet[1] - w.to[1]) < 1.2;
    if (close || (ev.some((e) => e.type === 'bounce') && d < 1.5)) {
      if (w.jump) s.step({ moveX: mx, moveZ: mz, jump: true });
      if (w.flop) s.flopOut();
      k = Math.min(R.length - 1, k + 1);
      furthest = Math.max(furthest, k);
    }
  }
  return { finished: false, seconds: maxSeconds, cracks, furthest, at: s.feet.map((v) => +v.toFixed(2)), log };
}

describe('fish bowl physics', () => {
  it('sits still on the floor, rolls when pushed and slows down when let go', () => {
    const s = new FishSim(test([floor]));
    run(s, 1);
    expect(s.onGround).toBe(true);
    expect(s.pos[1]).toBeCloseTo(VESSELS.bowl.r, 2);
    run(s, 3, { moveX: 0, moveZ: 1, jump: false });
    expect(s.vel[2]).toBeGreaterThan(VESSELS.bowl.speed * 0.9);
    run(s, 2);
    expect(Math.abs(s.vel[2])).toBeLessThan(0.5);
  });

  it('rolls up a ramp, and down one on its own', () => {
    const ramp = { x: 0, z: 8, w: 3, d: 8, along: 'z' as const, y0: 0, y1: 3, color: '#fff' };
    const top: Block = { ...floor, x: 0, y: 1.5, z: 16, w: 4, h: 3, d: 8 };
    const s = new FishSim(test([floor, top], { ramps: [ramp] }));
    run(s, 4, { moveX: 0, moveZ: 1, jump: false });
    expect(s.pos[1]).toBeGreaterThan(3.5);
    const down = new FishSim(test([floor], { ramps: [ramp], start: [0, 2.6, 11.6] }));
    run(down, 3);
    expect(down.pos[2]).toBeLessThan(4);
  });

  it('a big fall cracks the bowl (back to the checkpoint), a small one doesn’t, and a bucket is tougher', () => {
    expect(run(new FishSim(test([floor], { start: [0, 4, 0] })), 2).map((e) => e.type)).not.toContain('crack');
    expect(run(new FishSim(test([floor], { start: [0, 7, 0] })), 2).map((e) => e.type)).toContain('crack');
    const b = new FishSim(test([floor], { start: [0, 7, 0] }));
    b.vessel = b.checkpoint.vessel = 'bucket';
    expect(run(b, 2).map((e) => e.type)).not.toContain('crack');
  });

  it('flopping out: 50 seconds of air, a higher jump, and any water saves you', () => {
    const shelf: Block = { ...floor, x: 6, y: 1.25, z: 0, w: 4, h: 2.5, d: 4 };
    const s = new FishSim(test([floor, shelf], { waters: [{ at: [6, 2.5, 0], vessel: 'bottle' }] }));
    run(s, 0.5);
    s.flopOut();
    expect(s.vessel).toBe(null);
    run(s, 1);
    const ev = run(s, 3, { moveX: 1, moveZ: 0, jump: true });
    expect(ev.some((e) => e.type === 'splash' && e.vessel === 'bottle')).toBe(true);
    expect(s.vessel).toBe('bottle');

    const t = new FishSim(test([floor]));
    run(t, 0.5);
    t.flopOut();
    const ev2 = run(t, AIR + 1);
    expect(ev2.map((e) => e.type)).toContain('noair');
    expect(t.vessel).toBe('bowl');
  });

  it('bounces off walls', () => {
    const wall: Block = { ...floor, x: 3, y: 1.5, z: 0, w: 1, h: 3, d: 10 };
    const s = new FishSim(test([floor, wall]));
    run(s, 0.2);
    s.pos[0] = 1.5;
    s.vel = [8, 0, 0];
    const ev = run(s, 0.15);
    expect(ev.some((e) => e.type === 'bonk')).toBe(true);
    expect(s.vel[0]).toBeLessThan(-2);
  });

  it('the bowl can’t jump as high as a fish', () => {
    const wall: Block = { ...floor, x: 3, y: 1.1, z: 0, w: 2, h: 2.2, d: 4 };
    const s = new FishSim(test([floor, wall]));
    run(s, 2, { moveX: 1, moveZ: 0, jump: true });
    expect(s.pos[0]).toBeLessThan(2);
  });
});

describe('fish levels', () => {
  it('seven levels, starting on something, with nothing going wrong while you sit still', () => {
    expect(FISH_LEVELS.length).toBe(7);
    for (const f of FISH_LEVELS) {
      const s = new FishSim(f);
      const ev = run(s, 3).filter((e) => e.type !== 'land' && e.type !== 'checkpoint');
      expect(s.onGround, f.level.id).toBe(true);
      expect(ev, f.level.id).toEqual([]);
    }
  });

  it('level 1: being too late sends you back to the start of the house', () => {
    const f = FISH_LEVELS[0];
    const s = new FishSim(f);
    s.pos = [f.route[7].to[0], 0.8, f.route[7].to[2]];
    expect(run(s, 1).map((e) => e.type)).toContain('bought');
    expect(s.timeLeft).toBeGreaterThan(170);
    const ev = run(s, f.house!.time + 1);
    expect(ev.map((e) => e.type)).toContain('late');
    expect(s.feet[0]).toBeCloseTo(f.house!.start[0], 0);
  });

  for (const f of FISH_LEVELS) {
    it(`a robot can roll ${f.level.id} (${f.level.name})`, () => {
      const r = roll(f);
      expect(r, `got to waypoint ${r.furthest} of ${f.route.length - 1}\n${r.log.join('\n')}`).toMatchObject({ finished: true });
      expect(r.cracks, r.log.join('\n')).toBeLessThanOrEqual(2);
      if (f.house) expect(r.seconds).toBeLessThan(f.house.time * 0.7);
    });
  }
});
