import { describe, expect, it } from 'vitest';
import { addPart, checkDesign, fly, hint, MAX_PARTS, undoPart, type Design, type PartId } from '../src/sim/rocket';

/** 'engL+f+b tankL capsule': parts bottom to top, +f = fins, +b = side boosters. */
const D = (s: string): Design =>
  s.split(' ').map((w) => {
    const [p, ...mods] = w.split('+');
    return { part: p as PartId, fins: mods.includes('f'), boost: mods.includes('b') };
  });

describe('building', () => {
  it('stacks parts, puts fins and boosters on the side of the top part, and undoes', () => {
    const d: Design = [];
    expect(addPart(d, 'fins')).toBe(false); // nothing to stick them on
    addPart(d, 'engS');
    expect(addPart(d, 'fins')).toBe(true);
    expect(addPart(d, 'fins')).toBe(false); // already has fins
    addPart(d, 'tankS');
    expect(d).toEqual([{ part: 'engS', fins: true }, { part: 'tankS' }]);
    undoPart(d);
    undoPart(d);
    expect(d).toEqual([{ part: 'engS', fins: false }]);
    for (let i = 0; i < 30; i++) addPart(d, 'tankS');
    expect(d.length).toBe(MAX_PARTS);
  });

  it('explains what stops a launch', () => {
    expect(checkDesign([])).toMatch(/engine/);
    expect(checkDesign(D('tankS engS capsule'))).toMatch(/bottom/);
    expect(checkDesign(D('engS tankS'))).toMatch(/capsule/);
    expect(checkDesign(D('engS capsule tankS'))).toMatch(/top/);
    expect(checkDesign(D('engS tankS capsule nose'))).toBeNull();
  });
});

describe('flying (it should be very hard)', () => {
  const go = (s: string) => fly(D(s));

  it('too heavy: stays on the pad', () => {
    const f = go('engS+f tankL tankL tankL capsule nose');
    expect(f).toMatchObject({ place: 'pad', problem: 'heavy' });
    expect(hint(D('engS tankL'), f)).toMatch(/heavy/i);
  });

  it('no fins: wobbles and flips over low down', () => {
    for (const s of ['engS tankS capsule', 'engL tankL tankL tankL capsule nose']) {
      const f = go(s);
      expect(f.problem, s).toBe('flip');
      expect(f.apex, s).toBeLessThan(10_000);
    }
  });

  it('fins up top instead of at the bottom: still flips', () => {
    expect(go('engL tankL tankL tankL+f capsule nose').problem).toBe('flip');
  });

  it('a small rocket with fins gets above the clouds but not to space', () => {
    expect(go('engS+f tankS capsule nose').place).toBe('clouds');
  });

  it('a good one-stage rocket reaches space, but not the Moon', () => {
    expect(go('engS+f tankL capsule nose').place).toBe('space');
    expect(go('engL+f tankL tankL tankL tankL capsule nose').place).toBe('space');
    expect(go('engL+f+b tankL tankL tankL capsule nose').place).toBe('space');
  });

  it('two stages are better, but still not enough for the Moon', () => {
    const f = go('engL+f tankL tankL split engS tankL tankS capsule nose');
    expect(f.place).toBe('space');
    expect(f.drops.length).toBe(1);
  });

  it('the Moon needs three stages and boosters', () => {
    const f = go('engL+f+b tankL+b tankL split engL tankL tankL split engS tankL capsule nose');
    expect(f.place).toBe('moon');
    expect(f.problem).toBeNull();
    expect(hint(D('engL'), f)).toMatch(/Moon/);
  });

  it('the stars need a giant, well-balanced rocket', () => {
    expect(go('engL+f+b tankL+b+f tankL+b tankL+b split engL+b tankL+b tankL+b split engS+b tankL tankS capsule nose').place).toBe('stars');
    // The same rocket with fins only on the engine is too tall to stay straight.
    expect(go('engL+f+b tankL+b tankL+b tankL+b split engL+b tankL+b tankL+b split engS+b tankL tankS capsule nose').problem).toBe('flip');
  });

  it('a stage without an engine at its bottom never fires', () => {
    const good = go('engL+f tankL tankL split engS tankL capsule nose');
    const bad = go('engL+f tankL tankL split tankL engS capsule nose');
    expect(bad.apex).toBeLessThan(good.apex);
  });
});
