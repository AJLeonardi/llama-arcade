import { describe, expect, it } from 'vitest';
import { fixSave, itemById, ITEMS, newSave, owns, pick } from '../src/sim/shop';

describe('shop', () => {
  it('item ids are unique and every slot has a free choice', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const slot of ['color', 'pants', 'skin', 'hat', 'glasses', 'cape']) {
      expect(ITEMS.some((i) => i.slot === slot && i.price === 0), slot).toBe(true);
    }
  });

  it('the starting outfit is all free items', () => {
    const s = newSave();
    for (const id of Object.values(s.outfit).filter((v) => v !== 'llama')) expect(owns(s, itemById(id)!)).toBe(true);
  });

  it('buying takes coins once, then the item is yours', () => {
    const s = newSave();
    s.coins = 25;
    const cap = itemById('h-cap')!;
    expect(pick(s, cap)).toBe('bought');
    expect(s.coins).toBe(15);
    expect(s.outfit.hat).toBe('h-cap');
    pick(s, itemById('h-none')!);
    expect(pick(s, cap)).toBe('worn');
    expect(s.coins).toBe(15);
  });

  it("can't buy what you can't afford", () => {
    const s = newSave();
    s.coins = 5;
    expect(pick(s, itemById('h-crown')!)).toBe('too-pricey');
    expect(s.coins).toBe(5);
    expect(s.outfit.hat).toBe('h-none');
  });

  it('fixes broken or old saves', () => {
    expect(fixSave(undefined)).toEqual(newSave());
    const s = fixSave({ coins: -3, outfit: { hat: 'c-pink', body: 'dragon' } } as never);
    expect(s.coins).toBe(0);
    expect(s.outfit.hat).toBe('h-none');
    expect(s.outfit.body).toBe('llama');
  });
});
