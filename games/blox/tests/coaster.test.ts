import { describe, expect, it } from 'vitest';
import { COASTERS, coasterPark, Ride, Track } from '../src/sim/coaster';

const tracks = COASTERS.filter((c) => c.kind === 'coaster').map((c) => new Track(c));

describe('coasters', () => {
  for (const t of tracks) {
    it(`${t.def.id}: a ride goes all the way round and stops in the station`, () => {
      const r = new Ride(t);
      let time = 0, minV = Infinity, lowest = Infinity;
      while (!r.done && time < 200) {
        r.step(1 / 60);
        time += 1 / 60;
        if (r.d > 8 && r.d < t.length - 30) minV = Math.min(minV, r.v);
        lowest = Math.min(lowest, t.at(r.s).p[1]);
      }
      expect(r.done).toBe(true);
      expect(time).toBeGreaterThan(15);
      expect(time).toBeLessThan(120);
      expect(minV).toBeGreaterThanOrEqual(4.9);
      expect(r.maxV).toBeLessThan(36);
      expect(lowest).toBeGreaterThan(0.4);
      console.log(t.def.id, 'length', t.length.toFixed(0), 'time', time.toFixed(1), 'max', r.maxV.toFixed(1));
    });

    it(`${t.def.id}: the track is smooth (no sharp kinks) and the riders are never twisted suddenly`, () => {
      for (let i = 0; i < t.pts.length; i++) {
        const j = (i + 1) % t.pts.length;
        const df = t.fwd[i][0] * t.fwd[j][0] + t.fwd[i][1] * t.fwd[j][1] + t.fwd[i][2] * t.fwd[j][2];
        const du = t.up[i][0] * t.up[j][0] + t.up[i][1] * t.up[j][1] + t.up[i][2] * t.up[j][2];
        expect(df, `kink at ${i}`).toBeGreaterThan(0.99);
        expect(du, `twist at ${i}`).toBeGreaterThan(0.99);
      }
      // In the station the riders sit upright.
      expect(t.at(t.start).up[1]).toBeGreaterThan(0.99);
    });
  }

  it('the tracks keep well apart from each other and from the plaza', () => {
    for (let a = 0; a < tracks.length; a++) {
      for (const p of tracks[a].pts) expect(Math.hypot(p[0], p[2]), tracks[a].def.id).toBeGreaterThan(16);
      for (let b = a + 1; b < tracks.length; b++) {
        let min = Infinity;
        for (let i = 0; i < tracks[a].pts.length; i += 4) for (let j = 0; j < tracks[b].pts.length; j += 4) {
          const p = tracks[a].pts[i], q = tracks[b].pts[j];
          min = Math.min(min, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
        }
        expect(min, `${tracks[a].def.id} vs ${tracks[b].def.id}`).toBeGreaterThan(5);
      }
    }
  });

  it('no trees on the tracks', () => {
    const trunks = coasterPark().blocks.filter((b) => b.deco && b.color === '#8a5a2b');
    for (const t of tracks) for (const p of t.pts) for (const b of trunks) expect(Math.hypot(p[0] - b.x, p[2] - b.z)).toBeGreaterThan(5);
  });

  it('every ride has a station zone in the park', () => {
    const park = coasterPark();
    for (const c of COASTERS) expect(park.blocks.some((b) => b.kind === 'zone' && b.tag === `ride:${c.id}`)).toBe(true);
  });
});
