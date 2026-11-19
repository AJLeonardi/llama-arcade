import { describe, expect, it } from 'vitest';
import { RIDES, biggerCost, dropHeight, hireCost } from '../src/sim/catalog';
import { Park, START_MONEY } from '../src/sim/park';

function seq(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function run(p: Park, secs: number, you: { x: number; z: number } | null = null) {
  const ev = [];
  for (let t = 0; t < secs; t += 0.1) ev.push(...p.step(0.1, you));
  return ev;
}

describe('catalog', () => {
  it('has dozens of rides, cheapest first, and one you can buy with $5', () => {
    expect(RIDES.length).toBeGreaterThanOrEqual(24);
    for (let i = 1; i < RIDES.length; i++) expect(RIDES[i].cost).toBeGreaterThanOrEqual(RIDES[i - 1].cost);
    expect(RIDES[0].cost).toBeLessThanOrEqual(START_MONEY);
    expect(new Set(RIDES.map((r) => r.id)).size).toBe(RIDES.length);
    for (const r of RIDES) expect(r.ticket).toBeGreaterThanOrEqual(1);
  });

  it('the tower gets bigger forever, and each step costs more', () => {
    for (let l = 0; l < 200; l++) {
      expect(dropHeight(l + 1)).toBeGreaterThan(dropHeight(l));
      expect(biggerCost(l + 1)).toBeGreaterThan(biggerCost(l));
    }
    expect(hireCost('worker', 1)).toBeGreaterThan(hireCost('worker', 0));
  });
});

describe('park', () => {
  it('starts with $5 and can build the tiny slide but nothing pricier', () => {
    const p = new Park(seq());
    expect(p.money).toBe(5);
    expect(p.build('lemonade', 0, 0)).toBeNull();
    expect(p.build('tiny-slide', 0, 0)).not.toBeNull();
    expect(p.money).toBe(0);
  });

  it("won't build on top of another ride, outside the fence or on the gate", () => {
    const p = new Park(seq());
    p.money = 1e9;
    p.build('ferris', 0, 0);
    expect(p.blocked('ferris', 5, 0)).toBeTruthy();
    expect(p.blocked('ferris', 40, 0)).toBeNull();
    expect(p.blocked('ferris', 149, 0)).toBeTruthy();
    expect(p.blocked('tiny-slide', 0, 140)).toBeTruthy();
  });

  it('guests come, ride, and pay; you collect when you walk up', () => {
    const p = new Park(seq());
    const slide = p.build('tiny-slide', 0, 0)!;
    run(p, 120);
    expect(p.guests.length).toBeGreaterThan(0);
    expect(slide.cash).toBeGreaterThan(0);
    const cash = slide.cash;
    const ev = run(p, 0.1, { x: 0, z: 5 });
    expect(ev.some((e) => e.t === 'collect' && e.by === 'you')).toBe(true);
    expect(p.money).toBeGreaterThanOrEqual(cash);
  });

  it('workers bring the cash to you', () => {
    const p = new Park(seq());
    p.money = 1000;
    p.build('baby-carousel', 0, 0);
    expect(p.hire('worker')).toBe(true);
    const before = p.money;
    const ev = run(p, 200);
    expect(ev.some((e) => e.t === 'collect' && e.by === 'worker')).toBe(true);
    expect(p.money).toBeGreaterThan(before);
  });

  it('rides break, and a mechanic fixes them', () => {
    const p = new Park(seq(3));
    p.money = 1000;
    const r = p.build('teacups', 30, 0)!;
    r.broken = true;
    p.hire('mechanic');
    const ev = run(p, 60);
    expect(ev.some((e) => e.t === 'fixed' && e.ride === r.id)).toBe(true);
    expect(r.broken).toBe(false);
  });

  it('you can fix a ride yourself by standing next to it', () => {
    const p = new Park(seq());
    p.money = 100;
    const r = p.build('teacups', 0, 0)!;
    r.broken = true;
    p.youFixing = r.id;
    run(p, 7, { x: 0, z: 8 });
    expect(r.broken).toBe(false);
  });

  it('makes the tower bigger', () => {
    const p = new Park(seq());
    p.money = 1e6;
    const t = p.build('drop', 0, 0)!;
    const c = t.cycle;
    expect(p.bigger(t.id)).toBe(true);
    expect(p.bigger(t.id)).toBe(true);
    expect(t.level).toBe(2);
    expect(t.cycle).toBeGreaterThan(c);
    const f = p.build('ferris', 40, 0)!;
    expect(p.bigger(f.id)).toBe(false);
  });

  it('saves and loads', () => {
    const p = new Park(seq());
    p.money = 1e6;
    const t = p.build('drop', 0, 0)!;
    p.bigger(t.id);
    p.build('ferris', 40, 0);
    p.hire('worker');
    p.hire('mechanic');
    const q = Park.load(JSON.parse(JSON.stringify(p.save())));
    expect(q.money).toBe(p.money);
    expect(q.rides.map((r) => [r.type, r.level])).toEqual([['drop', 1], ['ferris', 0]]);
    expect(q.count('worker')).toBe(1);
    expect(q.count('mechanic')).toBe(1);
    expect(Park.load({ rides: [{ type: 'nope', x: 0, z: 0, rot: 0, level: 0 }] } as never).rides.length).toBe(0);
  });

  it('selling gives half back and sends the line elsewhere', () => {
    const p = new Park(seq());
    p.money = 100;
    const r = p.build('teacups', 0, 0)!;
    expect(p.sell(r.id)).toBe(true);
    expect(p.money).toBe(70);
    expect(p.rides.length).toBe(0);
  });
});
