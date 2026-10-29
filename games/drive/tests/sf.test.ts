import { describe, expect, it } from 'vitest';
import { FIXED_DT, Physics, initPhysics } from '../src/physics/Physics';
import { HEALTHY, VehicleSim } from '../src/vehicles/VehicleSim';
import { SPECS } from '../src/vehicles/VehicleSpec';
import { CHUNK, TERRAIN_CELL } from '../src/world/bounds';
import { heightAt, isDeepWater, surfaceAt, waterLevelAt } from '../src/world/layout';
import { HIGHWAYS, SF, highwayCoords, nearestCurve } from '../src/world/outer';
import { BAY, BAY_LEVEL, DECK, SF_LEVEL, SKY, TUNNEL_A, bayDepth, inTunnel, islandEdge, sfCoords, sfPoint, tunnelStart } from '../src/world/sf';
import { heightfieldCollider } from '../src/world/terrain';
import { skyColliders } from '../src/world/sfBuild';

const named = (n: string) => HIGHWAYS.find((h) => h.name === n)!;

describe('San Francisco', () => {
  it('is an island in a bay between RT 8, RT 4 and RT 3', () => {
    const [x, z] = sfPoint(0, 0);
    // South of RT 4, west of RT 3, east of RT 8.
    expect(z).toBeGreaterThan(named('RT 4').pts[0][1]);
    expect(x).toBeLessThan(highwayCoords(named('RT 3'), x, z).s >= 0 ? named('RT 3').pts[0][0] : Infinity);
    const rt8 = highwayCoords(named('RT 8'), x, z), p8 = named('RT 8').pts[Math.round(rt8.s / 25)];
    expect(x).toBeGreaterThan(p8[0]);
    // Water all round the island, and no highway in it.
    for (let k = 0; k < 36; k++) {
      const ang = (k / 36) * Math.PI * 2;
      let wet = false;
      for (let r = 300; r < 700 && !wet; r += 10) if (bayDepth(x + Math.cos(ang) * r, z + Math.sin(ang) * r) > 2) wet = true;
      expect(wet, `water at ${k * 10}°`).toBe(true);
    }
    for (let a = -560; a <= 560; a += 20)
      for (let b = -540; b <= 540; b += 20) {
        const [px, pz] = sfPoint(a, b);
        if (bayDepth(px, pz) === 0) continue;
        for (const h of HIGHWAYS) expect(Math.abs(highwayCoords(h, px, pz).d), `${h.name} in the bay at ${a},${b}`).toBeGreaterThan(40);
        expect(isDeepWater(px, pz) || bayDepth(px, pz) < 1.3).toBe(true);
      }
  });

  it('one bridge crosses it all, over the water on both sides and high over the city, from RT 8 to RT 3', () => {
    const br = SKY[0];
    const ends = [br.pts[0], br.pts[br.pts.length - 1]];
    const links = SF.roads.filter((r) => r.from >= 0);
    expect(new Set(links.map((r) => HIGHWAYS[r.from].name))).toEqual(new Set(['RT 8', 'RT 3']));
    expect(SF.exits.length).toBe(4); // each road in joins its highway both ways
    for (const r of links) expect(ends.some((e) => Math.hypot(e[0] - r.pts[r.pts.length - 1][0], e[1] - r.pts[r.pts.length - 1][1]) < 1)).toBe(true);
    let overWater = [0, 0], overIsland = 0;
    br.pts.forEach(([x, z], i) => {
      const e = islandEdge(x, z);
      if (bayDepth(x, z) > 2) {
        overWater[sfCoords(x, z).a < 0 ? 0 : 1]++;
        expect(br.ys[i] - BAY_LEVEL).toBeGreaterThan(20);
      }
      if (e < 0) {
        overIsland++;
        expect(br.ys[i] - SF_LEVEL, 'over the city').toBeGreaterThan(38);
      }
    });
    expect(overWater[0]).toBeGreaterThan(20);
    expect(overWater[1]).toBeGreaterThan(20);
    expect(overIsland).toBeGreaterThan(100);
    // Gentle enough for a highway.
    for (let i = 1; i < br.pts.length; i++) {
      const run = Math.hypot(br.pts[i][0] - br.pts[i - 1][0], br.pts[i][1] - br.pts[i - 1][1]);
      expect(Math.abs(br.ys[i] - br.ys[i - 1]) / run).toBeLessThan(0.08);
    }
  });

  it('has seven exits down into the city, each starting at the bridge and ending on a street (or in the Crunch Labs yard)', () => {
    const exits = SKY.slice(1);
    expect(exits.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const r of exits) {
      expect(r.ys[0]).toBeCloseTo(DECK, 1);
      const [x, z] = r.pts[r.pts.length - 1];
      expect(r.ys[r.ys.length - 1]).toBeCloseTo(SF_LEVEL, 1);
      expect(nearestCurve(x, z).edge, `exit ${r.n} ends on a street`).toBeLessThan(0);
      // Driveable: no wall-steep bits.
      for (let i = 1; i < r.pts.length; i++) {
        const run = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
        expect(Math.abs(r.ys[i] - r.ys[i - 1]) / run, `exit ${r.n} at ${i}`).toBeLessThan(0.36);
      }
    }
    // 1 and 2 go round and round (more than twice); 7 ends across the bay.
    const turning = (r: (typeof SKY)[number]) => {
      let t = 0;
      for (let i = 2; i < r.pts.length; i++) {
        const h0 = Math.atan2(r.pts[i - 1][0] - r.pts[i - 2][0], r.pts[i - 1][1] - r.pts[i - 2][1]);
        const h1 = Math.atan2(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
        t += Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
      }
      return Math.abs(t) / (2 * Math.PI);
    };
    expect(turning(exits[0])).toBeGreaterThan(2);
    expect(turning(exits[1])).toBeGreaterThan(2);
    expect(islandEdge(...exits[6].pts[exits[6].pts.length - 1])).toBeGreaterThan(BAY.w);
  });

  it('roads in the sky never run into each other, or into a street below', () => {
    const streets = SF.roads.filter((r) => r.from < 0);
    for (const r of SKY) {
      for (let i = 0; i < r.pts.length; i += 2) {
        const [x, z] = r.pts[i], y = r.ys[i];
        // Another stretch of sky road crossing over or under: plenty of headroom.
        for (const o of SKY)
          for (let j = 0; j < o.pts.length; j += 2) {
            if (o === r && Math.abs(i - j) < 30) continue;
            const joined = (o.kind === 'bridge' && r.kind === 'exit' && i < 30) || (r.kind === 'bridge' && o.kind === 'exit' && j < 30);
            if (joined) continue;
            if (Math.hypot(o.pts[j][0] - x, o.pts[j][1] - z) < r.ws[i] + o.ws[j] + 1) expect(Math.abs(o.ys[j] - y), `${r.name} ${i} / ${o.name} ${j}`).toBeGreaterThan(6);
          }
        // A street underneath: high enough over it (or right down on it, at an exit's foot).
        const [ex, ez] = r.pts[r.pts.length - 1];
        if (r.kind === 'exit' && y > SF_LEVEL + 0.5 && y < SF_LEVEL + 5.5 && Math.hypot(x - ex, z - ez) > 30)
          for (const s of streets) expect(s.pts.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < s.hw + r.ws[i]), `${r.name} low over a street at ${i}`).toBe(false);
      }
    }
  });

  it('the tunnel runs under the island and the bay, dry inside, the bay overhead', () => {
    const r = SKY[7];
    let underBay = 0;
    r.pts.forEach(([x, z], i) => {
      const y = r.ys[i] + 0.5;
      if (sfCoords(x, z).b < tunnelStart() + 40) return;
      expect(Math.abs(sfCoords(x, z).a - TUNNEL_A)).toBeLessThan(1);
      if (bayDepth(x, z) > 2) {
        underBay++;
        expect(inTunnel(x, z, y)).toBe(true);
        expect(isDeepWater(x, z, y)).toBe(false);
        expect(waterLevelAt(x, z, y)).toBeNull();
        expect(surfaceAt(x, z, y)).toBe('asphalt');
        // The ground (dug out) is just under the road, the bay floor well over the car.
        expect(heightAt(x, z)).toBeLessThan(r.ys[i]);
        expect(heightAt(x + 25, z) - r.ys[i]).toBeGreaterThan(7);
      }
    });
    expect(underBay).toBeGreaterThan(30);
  });

  it('the decks are asphalt, wherever they are', () => {
    for (const r of SKY) for (let i = 0; i < r.pts.length; i += 7) expect(surfaceAt(r.pts[i][0], r.pts[i][1], r.ys[i] + 0.3), `${r.name} ${i}`).toBe('asphalt');
  });
});

/** Physics for the ground round San Francisco, and its roads in the sky. */
async function sfPhysics() {
  await initPhysics();
  const physics = new Physics();
  const [cx, cz] = sfPoint(0, 150);
  const N = CHUNK / TERRAIN_CELL, R = 1000;
  for (let ix = Math.floor((cx - R) / CHUNK); ix <= Math.floor((cx + R) / CHUNK); ix++)
    for (let iz = Math.floor((cz - R) / CHUNK); iz <= Math.floor((cz + R) / CHUNK); iz++) {
      const x0 = ix * CHUNK, z0 = iz * CHUNK;
      const h = new Float32Array((N + 1) * (N + 1));
      for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) h[a * (N + 1) + b] = heightAt(x0 + b * TERRAIN_CELL, z0 + a * TERRAIN_CELL);
      heightfieldCollider(physics, N + 1, N + 1, h, x0 + CHUNK / 2, z0 + CHUNK / 2);
    }
  skyColliders(physics);
  return physics;
}

/** Drive along points (with their road heights), steering for the next one; how it went. */
function drive(physics: Physics, pts: readonly (readonly [number, number])[], ys: number[], speed: number) {
  const [a, b] = [pts[0], pts[1]];
  const car = new VehicleSim(physics, SPECS.bronco, a[0], ys[0] + 1, a[1], Math.atan2(b[0] - a[0], b[1] - a[1]));
  const q = { surfaceAt, inStickZone: () => false, boostAt: () => false };
  let target = 1, lowest = Infinity, steps = 0, worst = 0;
  for (; steps < 60 * 200 && target < pts.length; steps++) {
    const p = car.body.translation();
    while (target < pts.length && Math.hypot(pts[target][0] - p.x, pts[target][1] - p.z) < 12) target++;
    const t = pts[Math.min(target, pts.length - 1)];
    const f = car.forward();
    const tx = t[0] - p.x, tz = t[1] - p.z, tl = Math.hypot(tx, tz) || 1;
    const steer = Math.max(-1, Math.min(1, ((f.x * tz - f.z * tx) / tl) * 3));
    car.update(FIXED_DT, { steer, throttle: car.speed < speed ? 1 : 0, reverse: car.speed > speed + 4 ? 0.4 : 0 }, HEALTHY, q);
    physics.step();
    // How far below the road the car has got (falling through or off).
    const k = Math.max(0, target - 1);
    worst = Math.max(worst, ys[k] - p.y);
    lowest = Math.min(lowest, p.y);
  }
  const p = car.body.translation();
  physics.removeBody(car.body);
  return { reached: target === pts.length, worst, end: p };
}

describe('driving San Francisco', () => {
  it('the bridge can be driven end to end, both ways, staying on the deck', async () => {
    const physics = await sfPhysics();
    const br = SKY[0];
    for (const back of [false, true]) {
      const pts = back ? [...br.pts].reverse() : br.pts, ys = back ? [...br.ys].reverse() : br.ys;
      const run = drive(physics, pts, ys, 30);
      expect(run.reached, `backwards=${back}`).toBe(true);
      expect(run.worst, `backwards=${back}`).toBeLessThan(3);
    }
  }, 120000);

  it('every exit can be driven from the bridge down to its street', async () => {
    const physics = await sfPhysics();
    for (const r of SKY.slice(1)) {
      const run = drive(physics, r.pts, r.ys, r.n === 7 ? 20 : 14);
      expect(run.reached, `exit ${r.n} (stopped at ${[run.end.x, run.end.y, run.end.z].map(Math.round)})`).toBe(true);
      expect(run.worst, `exit ${r.n}`).toBeLessThan(3);
    }
  }, 240000);

  it('the tunnel can be driven back from Crunch Labs up to the bridge', async () => {
    const physics = await sfPhysics();
    const r = SKY[7];
    const run = drive(physics, [...r.pts].reverse(), [...r.ys].reverse(), 16);
    expect(run.reached, `stopped at ${[run.end.x, run.end.y, run.end.z].map(Math.round)}`).toBe(true);
  }, 120000);
});
