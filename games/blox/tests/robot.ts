// A robot that walks a level's `route` (used by the tests of levels that aren't straight obbies).
import { blockOffset, HALF_W, Sim, WALK, type SimEvent } from '../src/sim/physics';
import type { Block, Level, V3 } from '../src/sim/types';

const top = (b: Block, c: V3) => c[1] + b.h / 2;
const over = (b: Block, c: V3, x: number, z: number) => Math.abs(x - c[0]) < b.w / 2 && Math.abs(z - c[2]) < b.d / 2;

/**
 * A robot that walks a level's `route` waypoint by waypoint: it jumps when the next waypoint is higher or
 * the ground ends, and at `wait` waypoints it stays put until no searchlight will cross its way.
 */
export function walkRoute(level: Level, maxSeconds = 300) {
  const sim = new Sim(level);
  const route = level.route!;
  let k = 1;
  let oops = 0;
  let furthest = 0;
  const spots = level.blocks.map((b, i) => [b, i] as const).filter(([b]) => b.kind === 'spot');
  /** Will a searchlight touch the straight walk from here to `to` if we leave now? */
  const clear = (to: V3) => {
    const dist = Math.hypot(to[0] - sim.pos[0], to[2] - sim.pos[2]);
    const T = dist / WALK + 0.6;
    for (let t = 0; t <= T; t += 0.05) {
      const f = Math.min(1, t / (T - 0.4));
      const px = sim.pos[0] + (to[0] - sim.pos[0]) * f, pz = sim.pos[2] + (to[2] - sim.pos[2]) * f;
      for (const [b] of spots) {
        const o = blockOffset(b, sim.t + t);
        if (Math.abs(b.x + o[0] - px) < b.w / 2 + HALF_W + 0.5 && Math.abs(b.z + o[2] - pz) < b.d / 2 + HALF_W + 0.3) return false;
      }
    }
    return true;
  };
  let waitedFrom = -1;
  for (let step = 0; step < maxSeconds * 60; step++) {
    const here = route[k - 1], to = route[k].to;
    const dx = to[0] - sim.pos[0], dz = to[2] - sim.pos[2];
    const d = Math.hypot(dx, dz);
    let mx = d > 0.05 ? dx / d : 0, mz = d > 0.05 ? dz / d : 0;
    let jump = false;
    if (here.wait && waitedFrom !== k) {
      if (clear(to)) waitedFrom = k;
      else mx = mz = 0;
    }
    if (sim.onGround && (mx || mz)) {
      if (to[1] - sim.pos[1] > 0.6 && d < 3.2) jump = true;
      // The ground ends just ahead, and the next waypoint isn't down there: jump.
      if (!jump && to[1] >= sim.pos[1] - 0.6) {
        const g = level.blocks[sim.ground], c = sim.at[sim.ground];
        if (g && !over(g, c, sim.pos[0] + mx * 0.6, sim.pos[2] + mz * 0.6)) {
          const fx = sim.pos[0] + mx * 0.6, fz = sim.pos[2] + mz * 0.6;
          const top0 = c[1] + g.h / 2;
          const more = level.blocks.some((b, i) => b !== g && b.kind !== 'lava' && !['crawl', 'zone', 'spot', 'portal', 'shop'].includes(b.kind) && !b.deco && over(b, sim.at[i], fx, fz) && Math.abs(top(b, sim.at[i]) - top0) < 0.6);
          if (!more) jump = true;
        }
      }
    }
    // Slow down near the waypoint so we don't overshoot small platforms.
    if (d < 0.6) {
      mx *= d / 0.6;
      mz *= d / 0.6;
    }
    const ev: SimEvent[] = sim.step({ moveX: mx, moveZ: mz, jump });
    if (ev.some((e) => e.type === 'oops' || e.type === 'spotted')) {
      oops++;
      // Back to the last checkpoint: find the waypoint nearest to it and carry on from there.
      let best = 1, bd = Infinity;
      route.forEach((r, i) => {
        const dd = Math.hypot(r.to[0] - sim.pos[0], r.to[1] - sim.pos[1], r.to[2] - sim.pos[2]);
        if (i <= k && dd < bd) [best, bd] = [i, dd];
      });
      k = Math.max(1, best + 1);
      waitedFrom = -1;
    }
    if (ev.some((e) => e.type === 'finish')) return { finished: true, seconds: step / 60, oops, furthest };
    const reached = d < 0.35 && (Math.abs(sim.pos[1] - to[1]) < 0.3 || to[1] < sim.pos[1]) && (sim.onGround || ev.some((e) => e.type === 'bounce'));
    if (reached || (ev.some((e) => e.type === 'bounce') && d < 1.2)) {
      k = Math.min(route.length - 1, k + 1);
      furthest = Math.max(furthest, k);
    }
  }
  return { finished: false, seconds: maxSeconds, oops, furthest, at: sim.pos.map((v) => +v.toFixed(2)) };
}

