import { describe, expect, test } from 'vitest';
import { PARKS, fenceDist } from '../src/sim/field';
import { fly, play, relayFor, swingResult, type Contact } from '../src/sim/hit';
import { makePitch, pitchPos, zoneFor } from '../src/sim/pitch';
import { Game } from '../src/sim/game';
import { aiPitch, aiSwing } from '../src/sim/ai';
import { afterGame, CAREER, NEW_CAREER, rng } from '../src/sim/teams';

const deg = (d: number) => (d * Math.PI) / 180;
const hs = PARKS.hs;

describe('pitches', () => {
  test('a pitch ends where its aim plus break says', () => {
    for (const type of ['fast', 'curve', 'slider', 'change'] as const) {
      const p = makePitch(hs, type, 30, [0, 0.8]);
      const end = pitchPos(p, p.T);
      expect(end[2]).toBeCloseTo(0, 5);
      expect(end[0]).toBeCloseTo(p.end[0], 5);
      expect(end[1]).toBeCloseTo(p.end[1], 5);
      expect(p.T).toBeGreaterThan(0.45);
    }
  });
});

describe('hitting', () => {
  test('a perfect swing is hit hard, a big miss misses', () => {
    const oval = { x: 0, y: 0.8, rx: 0.24, ry: 0.2 };
    const c = swingResult(oval, [0, 0.8], 0, 1, 42)!;
    expect(c.quality).toBeCloseTo(1);
    expect(c.ev).toBeCloseTo(42);
    expect(swingResult(oval, [0.4, 0.8], 0, 1, 42)).toBeNull();
    expect(swingResult(oval, [0, 0.8], 0.2, 1, 42)).toBeNull();
  });
  test('oval above the ball = ground ball, below = fly ball; early = pulled to left', () => {
    const above = swingResult({ x: 0, y: 0.95, rx: 0.24, ry: 0.2 }, [0, 0.8], 0, 1, 40)!;
    const below = swingResult({ x: 0, y: 0.65, rx: 0.24, ry: 0.2 }, [0, 0.8], 0, 1, 40)!;
    expect(above.la).toBeLessThan(0);
    expect(below.la).toBeGreaterThan(deg(30));
    expect(swingResult({ x: 0, y: 0.8, rx: 0.24, ry: 0.2 }, [0, 0.8], -0.08, 1, 40)!.spray).toBeLessThan(0);
  });
  test('a crushed ball at 28 degrees clears the fence; a soft one does not', () => {
    const big: Contact = { ev: 44, la: deg(28), spray: 0, quality: 1 };
    expect(fly(hs, big).kind).toBe('hr');
    const soft: Contact = { ev: 25, la: deg(28), spray: 0, quality: 0.3 };
    const f = fly(hs, soft);
    expect(f.kind).toBe('fair');
    expect(Math.hypot(...f.land)).toBeLessThan(fenceDist(hs, 0));
  });
  test('a lazy fly to centre is caught; a hard grounder through the hole is a hit', () => {
    const lazy = play(hs, { ev: 30, la: deg(35), spray: 0, quality: 0.6 });
    expect(lazy.result).toBe('out');
    expect(lazy.fielding!.caught).toBe(true);
    const hard = play(hs, { ev: 40, la: deg(-4), spray: deg(-26), quality: 0.9 });
    expect(hard.result).not.toBe('out');
  });
  test('a soft grounder to short is an out at first', () => {
    const b = play(hs, { ev: 22, la: deg(-8), spray: deg(-14), quality: 0.4 });
    expect(b.result).toBe('out');
    expect(b.outHow).toBe('ground');
  });
  test('a line drive in the left-centre gap is extra bases', () => {
    const b = play(hs, { ev: 41, la: deg(16), spray: deg(-15), quality: 0.9 });
    expect([2, 3, 4]).toContain(b.result);
  });
  test('the backyard is small enough for kids to hit it over', () => {
    expect(fly(PARKS.backyard, { ev: 25, la: deg(28), spray: 0, quality: 1 }).kind).toBe('hr');
  });
});

describe('the computer', () => {
  test('computer batters get on base sometimes but not always', () => {
    const r = rng(42);
    const zone = zoneFor(hs);
    let pa = 0, onBase = 0, k = 0;
    for (let i = 0; i < 400; i++) {
      const g = new Game(99);
      pa++;
      for (let n = 0; n < 20; n++) {
        const ap = aiPitch(r, zone, 0.65, g.balls, g.strikes);
        const p = makePitch(hs, ap.type, 30, ap.aim);
        const s = aiSwing(r, p, zone, 0.5, g.strikes, { rx: 0.24, ry: 0.2 }, 1, 40);
        let o;
        if (!s.swung) o = g.pitch(Math.abs(p.end[0]) < 0.25 && p.end[1] > 0.46 && p.end[1] < 1.16 ? 'strike' : 'ball');
        else if (!s.contact) o = g.pitch('strike', true);
        else o = g.inPlay(play(hs, s.contact));
        if (o.next) {
          if (o.outs === 0) onBase++;
          if (o.text.startsWith('Strike three')) k++;
          break;
        }
      }
    }
    const obp = onBase / pa;
    expect(obp).toBeGreaterThan(0.2);
    expect(obp).toBeLessThan(0.55);
    expect(k / pa).toBeLessThan(0.4);
  });
});

describe('the game', () => {
  test('three outs switch sides, three innings end it', () => {
    const g = new Game(3);
    for (let i = 0; i < 9; i++) g.pitch('strike');
    expect(g.top).toBe(false);
    expect(g.outs).toBe(0);
    for (let half = 0; half < 5; half++) for (let i = 0; i < 9; i++) g.pitch('strike');
    expect(g.over).toBe(false); // tied 0-0: extra innings
    expect(g.inning).toBe(4);
  });
  test('a walk with the bases loaded forces in a run', () => {
    const g = new Game(3);
    g.bases = [true, true, true];
    for (let i = 0; i < 4; i++) g.pitch('ball');
    expect(g.score[0]).toBe(1);
    expect(g.bases).toEqual([true, true, true]);
  });
  test('5 runs and the side switches', () => {
    const g = new Game(3);
    const hr = { flight: { path: [], kind: 'hr', land: [0, 0], hang: 0 }, fielding: null, result: 'hr', quick: false } as const;
    for (let i = 0; i < 5; i++) g.inPlay(hr as never);
    expect(g.score[0]).toBe(5);
    expect(g.top).toBe(false);
  });
});

describe('the career', () => {
  test('win enough and you move up to the Finals, then you are champion', () => {
    let s = NEW_CAREER;
    for (let i = 0; i < 20 && !s.champion; i++) s = afterGame(s, true).save;
    expect(s.champion).toBe(true);
    expect(s.stage).toBe(CAREER.length - 1);
  });
  test('lose a playoff game and you play it again', () => {
    const s = { ...NEW_CAREER, stage: 1, game: 1, wins: 1 };
    expect(afterGame(s, false).save).toEqual(s);
  });
  test('lose too many in a season and the season starts again', () => {
    let s = afterGame(NEW_CAREER, false).save;
    s = afterGame(s, false).save;
    expect(s.game).toBe(0);
    expect(s.stage).toBe(0);
  });
});

describe('throws', () => {
  test('a throw to first always has someone covering the bag', () => {
    for (let a = -40; a <= 40; a += 2) {
      for (const ev of [18, 24, 30]) {
        const b = play(hs, { ev, la: deg(-10), spray: deg(a), quality: 0.5 });
        const r = relayFor(hs, b);
        if (!r) continue;
        expect(r.receiver).not.toBe(b.fielding!.pos);
        if (r.base === 1 && b.fielding!.pos === '1B' && r.receiver !== null) expect(r.receiver).toBe('P');
      }
    }
  });
  test('the first baseman fielding it far from the bag throws to the pitcher covering', () => {
    const b = play(hs, { ev: 22, la: deg(-8), spray: deg(25), quality: 0.4 });
    expect(b.fielding!.pos).toBe('1B');
    expect(relayFor(hs, b)!.receiver).toBe('P');
  });
});
