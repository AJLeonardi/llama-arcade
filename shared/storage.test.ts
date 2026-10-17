import { describe, expect, it, beforeEach } from 'vitest';
import { gameStorage } from './storage';

// A tiny in-memory localStorage for Node.
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

describe('gameStorage', () => {
  it('keeps each game in its own slot', () => {
    const a = gameStorage('a'), b = gameStorage('b');
    a.save('save', { level: 3 });
    b.save('save', { level: 9 });
    expect(a.load('save')).toEqual({ level: 3 });
    expect(b.load('save')).toEqual({ level: 9 });
    b.remove('save');
    expect(b.load('save')).toBeUndefined();
    expect(a.load('save')).toEqual({ level: 3 });
  });

  it('survives broken data', () => {
    mem.set('llama-arcade/a/save', '{not json');
    expect(gameStorage('a').load('save')).toBeUndefined();
  });
});
