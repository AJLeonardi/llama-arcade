import { describe, expect, it } from 'vitest';
import { BOUNCE, GRAVITY, JUMP, MAX_GAP, Sim, STEP, WALK, type Input, type SimEvent } from '../src/sim/physics';
import type { Block, Kind, Level } from '../src/sim/types';

const NONE: Input = { moveX: 0, moveZ: 0, jump: false };

const blk = (x: number, top: number, z: number, w: number, d: number, kind: Kind = 'solid', more: Partial<Block> = {}): Block => ({
  x, y: top - (more.h ?? 1) / 2, z, w, h: 1, d, kind, color: '#fff', ...more,
});

function level(blocks: Block[], extra: Partial<Level> = {}): Level {
  return { id: 't', name: 't', emoji: '', spawn: [0, 0, 0], spawnYaw: 0, blocks, coins: [], reward: 0, fallY: -20, sky: ['#000', '#000'], ...extra };
}

function run(sim: Sim, steps: number, input: Input | ((s: Sim) => Input) = NONE) {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) events.push(...sim.step(typeof input === 'function' ? input(sim) : input));
  return events;
}

describe('standing, walking and walls', () => {
  it('lands on a block and stays on it', () => {
    const sim = new Sim(level([blk(0, 0, 0, 10, 10)], { spawn: [0, 2, 0] }));
    run(sim, 90);
    expect(sim.onGround).toBe(true);
    expect(sim.pos[1]).toBeCloseTo(0, 5);
  });

  it('runs at walking speed', () => {
    const sim = new Sim(level([blk(0, 0, 0, 100, 100)]));
    run(sim, 60, { moveX: 0, moveZ: 1, jump: false });
    expect(sim.vel[2]).toBeCloseTo(WALK, 1);
  });

  it('stops at a wall', () => {
    const sim = new Sim(level([blk(0, 0, 0, 20, 20), blk(0, 3, 4, 20, 1, 'solid', { h: 3 })]));
    run(sim, 120, { moveX: 0, moveZ: 1, jump: false });
    expect(sim.pos[2]).toBeLessThan(3.5 - 0.44);
    expect(sim.pos[1]).toBeCloseTo(0, 5);
  });

  it('walks up a low step without jumping', () => {
    const sim = new Sim(level([blk(0, 0, 0, 20, 20), blk(0, 0.4, 7, 20, 6)]));
    run(sim, 90, { moveX: 0, moveZ: 1, jump: false });
    expect(sim.pos[1]).toBeCloseTo(0.4, 2);
  });
});

describe('jumping', () => {
  it('jumps about JUMP²/2g high', () => {
    const sim = new Sim(level([blk(0, 0, 0, 10, 10)]));
    run(sim, 10);
    let top = 0;
    run(sim, 1, { ...NONE, jump: true });
    for (let i = 0; i < 90; i++) {
      sim.step(NONE);
      top = Math.max(top, sim.pos[1]);
    }
    expect(top).toBeCloseTo((JUMP * JUMP) / (2 * GRAVITY), 0);
    expect(sim.onGround).toBe(true);
  });

  it('can jump a gap 90% of MAX_GAP wide', () => {
    const gap = MAX_GAP * 0.9;
    const sim = new Sim(level([blk(0, 0, 0, 4, 10), blk(0, 0, 5 + gap + 15, 4, 30)], { spawn: [0, 0, -3] }));
    // Run, and jump when the feet's middle reaches the edge.
    run(sim, 200, (s) => ({ moveX: 0, moveZ: 1, jump: s.onGround && s.pos[2] > 5 && s.pos[2] < 5.4 }));
    expect(sim.onGround).toBe(true);
    expect(sim.pos[2]).toBeGreaterThan(5 + gap);
  });

  it('a jump pressed just before landing still happens', () => {
    const sim = new Sim(level([blk(0, 0, 0, 10, 10)], { spawn: [0, 0.3, 0] }));
    const ev = run(sim, 1, { ...NONE, jump: true });
    expect(ev).toEqual([]);
    expect(run(sim, 20).some((e) => e.type === 'jump')).toBe(true);
  });
});

describe('special blocks', () => {
  it('trampolines throw you high', () => {
    const sim = new Sim(level([blk(0, 0, 0, 10, 10, 'bounce')], { spawn: [0, 1, 0] }));
    const ev = run(sim, 30);
    expect(ev.some((e) => e.type === 'bounce')).toBe(true);
    expect(sim.pos[1]).toBeGreaterThan(4);
    expect((BOUNCE * BOUNCE) / (2 * GRAVITY)).toBeGreaterThan(6);
  });

  it('lava sends you back to the last checkpoint', () => {
    const sim = new Sim(level([blk(0, 0, 0, 4, 4, 'checkpoint'), blk(0, 0, 4, 4, 4), blk(0, 0.5, 6, 4, 1, 'lava')]));
    const ev = run(sim, 30);
    expect(ev.filter((e) => e.type === 'checkpoint')).toHaveLength(1);
    const ev2 = run(sim, 120, { moveX: 0, moveZ: 1, jump: false });
    expect(ev2.some((e) => e.type === 'oops')).toBe(true);
    expect(sim.pos[2]).toBeLessThan(5);
  });

  it('falling off the world sends you back too', () => {
    const sim = new Sim(level([blk(0, 0, 0, 4, 4)]));
    const ev = run(sim, 240, { moveX: 1, moveZ: 0, jump: false });
    expect(ev.some((e) => e.type === 'oops')).toBe(true);
  });

  it('speed pads make you run faster for a while', () => {
    const sim = new Sim(level([blk(0, 0, 0, 4, 4, 'speed'), blk(0, 0, 50, 4, 96)]));
    const ev = run(sim, 60, { moveX: 0, moveZ: 1, jump: false });
    expect(ev.filter((e) => e.type === 'speed')).toHaveLength(1);
    expect(sim.vel[2]).toBeGreaterThan(WALK + 3);
    run(sim, 240, { moveX: 0, moveZ: 1, jump: false });
    expect(sim.vel[2]).toBeCloseTo(WALK, 0);
  });

  it('moving platforms carry you', () => {
    const sim = new Sim(level([blk(0, 0, 0, 4, 4, 'solid', { move: { dx: 6, dy: 0, dz: 0, period: 4 } })]));
    run(sim, 120); // half a period: the platform is at the far end
    expect(sim.onGround).toBe(true);
    expect(sim.pos[0]).toBeCloseTo(6, 0);
  });

  it('lifts carry you up', () => {
    const sim = new Sim(level([blk(0, 0, 0, 4, 4, 'solid', { move: { dx: 0, dy: 5, dz: 0, period: 4 } })]));
    run(sim, 120);
    expect(sim.pos[1]).toBeCloseTo(5, 0);
  });

  it('vanish blocks disappear under you', () => {
    const sim = new Sim(level([blk(0, 0, 0, 4, 4, 'vanish')]));
    const ev = run(sim, 75);
    expect(ev.some((e) => e.type === 'oops')).toBe(false);
    expect(sim.pos[1]).toBeLessThan(-2); // falling
  });

  it('conveyors push you along', () => {
    const sim = new Sim(level([blk(0, 0, 0, 40, 4, 'conveyor', { push: [3, 0] })]));
    run(sim, 60);
    expect(sim.pos[0]).toBeCloseTo(3, 0);
  });

  it('finishing happens once', () => {
    const sim = new Sim(level([blk(0, 0, 0, 4, 4, 'finish')]));
    expect(run(sim, 60).filter((e) => e.type === 'finish')).toHaveLength(1);
  });

  it('portals fire once on the way in, not while standing in one at the start', () => {
    const portal = (z: number): Block => ({ x: 0, y: 1.5, z, w: 3, h: 3, d: 0.6, kind: 'portal', color: '#fff', level: 'rainbow' });
    const sim = new Sim(level([blk(0, 0, 0, 10, 30), portal(0), portal(6)]));
    const ev = run(sim, 120, { moveX: 0, moveZ: 1, jump: false });
    expect(ev.filter((e) => e.type === 'portal')).toEqual([{ type: 'portal', level: 'rainbow' }]);
  });

  it('coins are collected once', () => {
    const sim = new Sim(level([blk(0, 0, 0, 10, 10)], { coins: [[0, 1, 2]] }));
    const ev = run(sim, 120, (s) => ({ moveX: 0, moveZ: s.pos[2] < 2 ? 1 : -1, jump: false }));
    expect(ev.filter((e) => e.type === 'coin')).toEqual([{ type: 'coin', index: 0 }]);
    expect(STEP).toBeCloseTo(1 / 60);
  });
});
