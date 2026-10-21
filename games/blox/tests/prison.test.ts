import { describe, expect, it } from 'vitest';
import { jailBreak } from '../src/sim/prison';
import { walkRoute } from './robot';

describe('jail break', () => {
  const lv = jailBreak();

  it('a robot can escape', () => {
    const r = walkRoute(lv);
    expect(r, `reached waypoint ${r.furthest} of ${lv.route!.length - 1}`).toMatchObject({ finished: true });
    expect(r.oops).toBeLessThanOrEqual(2);
  });

  it('you really need the keys and the trampoline (no way round)', () => {
    expect(walkRoute({ ...lv, keys: [] }, 60).finished).toBe(false);
    expect(walkRoute({ ...lv, keys: [lv.keys![0]] }, 60).finished).toBe(false);
    expect(walkRoute({ ...lv, blocks: lv.blocks.filter((b) => b.kind !== 'bounce') }, 60).finished).toBe(false);
  });
});
