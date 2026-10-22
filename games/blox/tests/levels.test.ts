// Every obby must be finishable: a robot player runs each one with the real physics.
import { describe, expect, it } from 'vitest';
import { FAST, HALF_W, JUMP, GRAVITY, Sim, WALK, type SimEvent } from '../src/sim/physics';
import { LEVELS, OBBY_IDS, WORLD_IDS } from '../src/sim/levels';
import { FISH_IDS } from '../src/sim/fishLevels';
import type { Block, Level, V3 } from '../src/sim/types';

const top = (b: Block, c: V3) => c[1] + b.h / 2;

/** Is the point (x, z) over block b (centred at c), at least `inset` in from the edges? */
const over = (b: Block, c: V3, x: number, z: number, inset = 0) =>
  Math.abs(x - c[0]) < b.w / 2 - inset && Math.abs(z - c[2]) < b.d / 2 - inset;

/** Edge-to-edge distance between two blocks, seen from above. */
function edgeGap(a: Block, ca: V3, b: Block, cb: V3) {
  const gx = Math.max(0, Math.abs(ca[0] - cb[0]) - (a.w + b.w) / 2);
  const gz = Math.max(0, Math.abs(ca[2] - cb[2]) - (a.d + b.d) / 2);
  return Math.hypot(gx, gz);
}

/** How far a running jump carries you before you drop below `rise`, plus your width either end. */
function reach(rise: number, speed: number) {
  const disc = JUMP * JUMP - 2 * GRAVITY * rise;
  if (disc < 0) return -1;
  return speed * ((JUMP + Math.sqrt(disc)) / GRAVITY) + 2 * HALF_W;
}

/** A robot that heads for the next platform on the path, waits for moving ones, and jumps at edges and over lava. */
function playthrough(level: Level, maxSeconds = 240) {
  const sim = new Sim(level);
  const path = level.path!;
  const idx = path.map((b) => level.blocks.indexOf(b));
  let k = 1;
  let oops = 0;
  let furthest = 0;
  for (let step = 0; step < maxSeconds * 60; step++) {
    // Which path platform are we on? (After a respawn, carry on from there.)
    if (sim.onGround) {
      const on = idx.indexOf(sim.ground);
      if (on >= 0) {
        k = on + 1;
        furthest = Math.max(furthest, on);
      }
    }
    if (k >= path.length) k = path.length - 1;
    const tb = path[k], tc = sim.at[idx[k]];
    let dx = tc[0] - sim.pos[0], dz = tc[2] - sim.pos[2];
    const d = Math.hypot(dx, dz) || 1;
    let mx = dx / d, mz = dz / d;
    let jump = false;

    if (sim.onGround && sim.ground >= 0 && sim.ground !== idx[k]) {
      const g = level.blocks[sim.ground], gc = sim.at[sim.ground];
      if (g.kind !== 'bounce') {
        const speed = sim.fastTime > 0.5 ? FAST : WALK;
        const ok = edgeGap(g, gc, tb, tc) <= reach(top(tb, tc) - top(g, gc), speed) * 0.9;
        if (!ok) {
          // Wait near the side of our platform closest to the target.
          const wx = Math.max(gc[0] - g.w / 2 + 0.8, Math.min(gc[0] + g.w / 2 - 0.8, tc[0]));
          const wz = Math.max(gc[2] - g.d / 2 + 0.8, Math.min(gc[2] + g.d / 2 - 0.8, tc[2]));
          dx = wx - sim.pos[0];
          dz = wz - sim.pos[2];
          const wd = Math.hypot(dx, dz);
          mx = wd > 0.2 ? dx / wd : 0;
          mz = wd > 0.2 ? dz / wd : 0;
        } else if (!over(g, gc, sim.pos[0] + mx * 0.5, sim.pos[2] + mz * 0.5)) {
          jump = true; // at the edge
        }
      }
      // Lava just ahead (where it is now, or anywhere it slides to): jump it.
      level.blocks.forEach((b, i) => {
        if (b.kind !== 'lava') return;
        const c = sim.at[i];
        const ahead = (c[2] - sim.pos[2]) * Math.sign(mz || 1);
        const span = b.move ? b.w / 2 + Math.abs(b.move.dx) + 1 : b.w / 2 + 1;
        const cx = b.move ? b.x + b.move.dx / 2 : c[0];
        if (ahead > 0 && ahead < b.d / 2 + 1.3 && Math.abs(cx - sim.pos[0]) < span) jump = true;
      });
    }

    const ev: SimEvent[] = sim.step({ moveX: mx, moveZ: mz, jump });
    if (ev.some((e) => e.type === 'bounce') && path[k].kind === 'bounce') k++; // bouncing never counts as standing
    if (ev.some((e) => e.type === 'oops')) oops++;
    if (ev.some((e) => e.type === 'finish')) return { finished: true, seconds: step / 60, oops, furthest };
  }
  return { finished: false, seconds: maxSeconds, oops, furthest };
}

describe('levels', () => {
  it('has a hub, three obbies, four worlds and the seven fish levels', () => {
    expect(Object.keys(LEVELS).sort()).toEqual(['burger', 'candy', 'castle', 'coaster', ...FISH_IDS.slice().sort(), 'hub', 'prison', 'rainbow', 'rocket'].sort());
    expect(FISH_IDS).toEqual(['fish', 'fish2', 'fish3', 'fish4', 'fish5', 'fish6', 'fish7']);
    expect(OBBY_IDS).toEqual(['rainbow', 'candy', 'castle']);
    expect(WORLD_IDS).toEqual(['prison', 'rocket', 'coaster', 'burger']);
  });

  it('every level starts you standing on something, with nothing going wrong', () => {
    for (const lv of Object.values(LEVELS)) {
      const sim = new Sim(lv);
      const ev: SimEvent[] = [];
      for (let i = 0; i < 120; i++) ev.push(...sim.step({ moveX: 0, moveZ: 0, jump: false }));
      expect(sim.onGround, lv.id).toBe(true);
      expect(ev.filter((e) => e.type !== 'land'), lv.id).toEqual([]);
    }
  });

  it('the hub has a portal to every obby and world, and the shop; every world has a way home', () => {
    const hub = LEVELS.hub;
    for (const id of [...OBBY_IDS, ...WORLD_IDS, 'fish']) expect(hub.blocks.some((b) => b.kind === 'portal' && b.level === id)).toBe(true);
    for (const id of WORLD_IDS.filter((w) => w !== 'prison')) {
      expect(LEVELS[id].blocks.some((b) => b.kind === 'portal' && b.level === 'hub'), id).toBe(true);
    }
    expect(hub.blocks.some((b) => b.kind === 'shop')).toBe(true);
  });

  it('every obby ends in a finish pad', () => {
    for (const id of OBBY_IDS) expect(LEVELS[id].path!.at(-1)!.kind).toBe('finish');
  });

  for (const id of OBBY_IDS) {
    it(`a robot can finish ${id}`, () => {
      const r = playthrough(LEVELS[id]);
      expect(r, `got to platform ${r.furthest} of ${LEVELS[id].path!.length - 1} (${r.oops} oops)`).toMatchObject({ finished: true });
      // Only a few slips allowed: the robot isn't clever, but it shouldn't need luck.
      expect(r.oops).toBeLessThanOrEqual(2);
    });
  }
});
