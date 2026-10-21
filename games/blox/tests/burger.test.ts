import { describe, expect, it } from 'vitest';
import { BURN_TIME, COOK_TIME, FRY_TIME, HANDS, PER_ITEM, Restaurant, STAR_EVERY, TIP, burgerPlace } from '../src/sim/burger';

const run = (r: Restaurant, seconds: number) => {
  const ev = [];
  for (let i = 0; i < seconds * 10; i++) ev.push(...r.step(0.1));
  return ev;
};
const ids = (r: Restaurant, at: Parameters<Restaurant['actions']>[0]) => r.actions(at).map((a) => a.id);

describe('llama burgers', () => {
  it('cooking a cheeseburger: grill, wait, take, board', () => {
    const r = new Restaurant(() => 0.99, false);
    expect(ids(r, 'grill')).toEqual(['grill-add']);
    r.act('grill-add');
    expect(ids(r, 'grill')).not.toContain('grill-take'); // still raw
    run(r, COOK_TIME + 0.2);
    r.act('grill-take');
    expect(r.hands).toEqual(['patty']);
    expect(ids(r, 'board')).toEqual(['make-burger', 'make-cheese']);
    r.act('make-cheese');
    expect(r.hands).toEqual(['cheese']);
  });

  it('patties left too long burn', () => {
    const r = new Restaurant(() => 0.99, false);
    r.act('grill-add');
    run(r, BURN_TIME + 1);
    r.act('grill-take');
    expect(r.hands).toEqual(['burnt']);
    r.act('bin');
    expect(r.hands).toEqual([]);
  });

  it('fries take a while; drinks and ice cream are instant', () => {
    const r = new Restaurant(() => 0.99, false);
    r.act('fry');
    expect(ids(r, 'fryer')).toEqual([]);
    run(r, FRY_TIME + 0.2);
    r.act('fry-take');
    r.act('drink');
    r.act('icecream');
    expect(r.hands).toEqual(['fries', 'drink', 'icecream']);
  });

  it('you can only carry so much', () => {
    const r = new Restaurant(() => 0.99, false);
    for (let i = 0; i < HANDS; i++) r.act('drink');
    expect(r.act('drink')).toEqual([{ type: 'full' }]);
    expect(ids(r, 'drinks')).toEqual(['full']);
  });

  it('serving: wrong things are refused, right things are paid for (with a tip if quick)', () => {
    const r = new Restaurant(() => 0.99, false);
    const c = r.add('counter', ['fries', 'drink']);
    run(r, 5);
    expect(r.front('counter')).toBe(c);
    r.act('icecream');
    expect(r.act('serve-counter')).toEqual([{ type: 'wrong' }]);
    r.act('bin');
    r.act('drink');
    expect(r.act('serve-counter')[0].type).toBe('gave');
    r.act('fry');
    run(r, FRY_TIME + 0.2);
    r.act('fry-take');
    const ev = r.act('serve-counter');
    expect(ev[0]).toMatchObject({ type: 'paid', coins: 2 * PER_ITEM + TIP, tip: true });
    expect(r.served).toBe(1);
  });

  it('the drive-through works the same way', () => {
    const r = new Restaurant(() => 0.99, false);
    r.add('window', ['drink']);
    run(r, 5);
    r.act('drink');
    expect(r.actions('window').map((a) => a.id)).toEqual(['serve-window']);
    expect(r.act('serve-window')[0].type).toBe('paid');
  });

  it('customers who wait too long go home (no coins, nothing else happens)', () => {
    const r = new Restaurant(() => 0.99, false);
    const c = r.add('counter', ['burger']);
    const ev = run(r, c.max + 10);
    expect(ev.some((e) => e.type === 'gone')).toBe(true);
    expect(r.customers.includes(c)).toBe(false);
  });

  it('new customers keep coming, but not too many at once', () => {
    const r = new Restaurant();
    let most = 0;
    for (let i = 0; i < 3000; i++) {
      r.step(0.1);
      most = Math.max(most, r.customers.filter((c) => c.state !== 'leaving').length);
    }
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThanOrEqual(4);
  });

  it(`a star every ${STAR_EVERY} orders`, () => {
    const r = new Restaurant(() => 0.99, false);
    const stars = [];
    for (let i = 0; i < STAR_EVERY; i++) {
      r.add('counter', ['drink']);
      run(r, 5);
      r.act('drink');
      stars.push(...r.act('serve-counter').filter((e) => e.type === 'star'));
      run(r, 5);
    }
    expect(stars).toEqual([{ type: 'star', served: STAR_EVERY }]);
  });

  it('the building has every station', () => {
    const tags = burgerPlace().blocks.filter((b) => b.kind === 'zone').map((b) => b.tag);
    for (const t of ['grill', 'fryer', 'drinks', 'icecream', 'board', 'bin', 'counter', 'window']) expect(tags).toContain(t);
  });
});
