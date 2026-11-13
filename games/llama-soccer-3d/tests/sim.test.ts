import { describe, expect, test } from 'vitest';
import { FIELD, Match, makePath, pathAt, type Vec } from '../src/sim/match';
import { afterMatch, buy, fixSave, lineupPlayers, newSave, nextOpponent, priceOf, rankOf, release, swap, US } from '../src/sim/teams';

const home = () => lineupPlayers(newSave());

/** A match with play started and Mr. Random holding the ball at (x, z), everyone else far away except the keeper. */
function setup(x: number, z: number, strength: number, seed = 1) {
  const m = new Match(home(), { strength }, seed);
  for (let i = 0; i < 80; i++) m.step(1 / 60); // past the kickoff wait
  for (const b of m.bodies) {
    if (b.slot === 0) continue;
    b.x = b.team === 0 ? -15 : 15;
    b.z = -20 + b.slot * 2;
  }
  const h = m.human;
  h.x = x;
  h.z = z - 0.75;
  h.face = 0;
  m.ball.owner = h;
  m.step(1 / 60);
  return m;
}

/** Run until a goal, a save, or 3 seconds. */
function outcome(m: Match) {
  for (let i = 0; i < 180; i++) {
    m.step(1 / 60);
    const ev = m.takeEvents();
    if (ev.includes('goal-us')) return 'goal';
    if (ev.includes('save')) return 'save';
  }
  return 'nothing';
}

describe('lines', () => {
  test('a path goes through its points', () => {
    const p = makePath([[0, 0], [0, 3], [4, 3]], 10, 0);
    expect(p.len).toBeCloseTo(7);
    const a = pathAt(p, 5);
    expect(a.x).toBeCloseTo(2);
    expect(a.z).toBeCloseTo(3);
    expect(a.dx).toBeCloseTo(1);
  });
});

describe('shooting', () => {
  test('a line into the corner beats the easy keepers', () => {
    let goals = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const m = setup(4, 14, 0, seed);
      expect(m.shoot([[3, 18], [FIELD.goalHalfW - 0.7, FIELD.halfL + 1]])).toBe(true);
      if (outcome(m) === 'goal') goals++;
    }
    expect(goals).toBeGreaterThanOrEqual(8);
  });

  test('a shot right at the keeper is saved', () => {
    const m = setup(0, 14, 0.5);
    m.keeper(1).x = 0;
    m.keeper(1).aim = 0;
    m.shoot([[0, FIELD.halfL + 1]]);
    expect(outcome(m)).toBe('save');
  });

  test('a curvy line fools the best keeper more than a straight one', () => {
    let straight = 0, curvy = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const a = setup(0, 12, 1, seed);
      a.shoot([[3.0, FIELD.halfL + 1]]);
      if (outcome(a) === 'goal') straight++;
      // Start toward the far left, then bend into the right corner at the end.
      const b = setup(0, 12, 1, seed);
      const line: Vec[] = [];
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        line.push([-3.5 * Math.sin(Math.PI * t) + 3.0 * t * t, 12 + (FIELD.halfL + 1 - 12) * t]);
      }
      b.shoot(line);
      if (outcome(b) === 'goal') curvy++;
    }
    expect(curvy).toBeGreaterThan(straight);
  });

  test('you can only shoot with the ball', () => {
    const m = setup(0, 0, 0);
    m.ball.owner = m.bodies.find((b) => b.team === 1 && b.slot === 3)!;
    m.ball.x = 10;
    expect(m.shoot([[0, 20]])).toBe(false);
  });

  test('dribbling into the goal scores', () => {
    const m = setup(0, FIELD.halfL - 3, 0);
    const k = m.keeper(1);
    k.x = 8;
    k.save = 0;
    let scored = false;
    for (let i = 0; i < 120 && !scored; i++) {
      m.step(1 / 60, 0, 1);
      k.x = 8;
      scored = m.takeEvents().includes('goal-us');
    }
    expect(scored).toBe(true);
  });
});

describe('whole matches', () => {
  test('the computer plays a full match against itself without breaking', () => {
    for (const strength of [0, 0.5, 1]) {
      const m = new Match(home(), { strength }, 7);
      m.autopilot = true;
      let steps = 0;
      while (m.phase !== 'over' && steps < 60 * 400) {
        m.step(1 / 60);
        steps++;
        for (const b of m.bodies) expect(Number.isFinite(b.x + b.z)).toBe(true);
        expect(Number.isFinite(m.ball.x + m.ball.y + m.ball.z)).toBe(true);
      }
      expect(m.phase).toBe('over');
      const total = m.score[0] + m.score[1];
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThan(25);
    }
  });

  test('if you stand still, a strong team scores on you', () => {
    const m = new Match(home(), { strength: 1 }, 3);
    while (m.phase !== 'over') m.step(1 / 30);
    expect(m.score[1]).toBeGreaterThan(m.score[0]);
  });
});

describe('the World Cup table and your team', () => {
  test('USA starts last and plays the team just above', () => {
    const s = newSave();
    expect(rankOf(s)).toBe(16);
    expect(nextOpponent(s)).toBe('can');
  });

  test('winning moves you up one place per goal you won by, up to 3; losing never moves you down', () => {
    const s = newSave();
    let r = afterMatch(s, 2, 1);
    expect(r.newRank).toBe(15);
    r = afterMatch(s, 5, 0);
    expect(r.newRank).toBe(12);
    r = afterMatch(s, 0, 4);
    expect(r.newRank).toBe(12);
    expect(s.coins).toBeGreaterThan(50);
    expect(s.table.length).toBe(16);
    expect(new Set(s.table).size).toBe(16);
  });

  test('at #1 you play #2 in the Final and become champions', () => {
    const s = newSave();
    s.table = [US, ...s.table.filter((c) => c !== US)];
    expect(nextOpponent(s)).toBe('bra');
    const r = afterMatch(s, 1, 0);
    expect(r.champion).toBe(true);
    expect(rankOf(s)).toBe(1);
    expect(afterMatch(s, 1, 0).champion).toBe(false);
  });

  test('swapping positions, the bench, and Mr. Random never benched', () => {
    const s = newSave();
    swap(s, 0, 4); // keeper ↔ striker
    expect(s.lineup[0]).toBe('mr-random');
    expect(s.lineup[4]).toBe('gloves');
    swap(s, 1, 'tiny'); // bench player in at left back
    expect(s.lineup[1]).toBe('tiny');
    swap(s, 'noodle', 0); // can't bench Mr. Random
    expect(s.lineup[0]).toBe('mr-random');
  });

  test('buying and letting go of players', () => {
    const s = newSave();
    s.coins = 1000;
    const p = s.shop[0];
    expect(buy(s, 0)).toBe(true);
    expect(s.coins).toBe(1000 - priceOf(p));
    expect(s.squad).toContain(p);
    expect(release(s, 'mr-random')).toBe(false);
    expect(release(s, 'gloves')).toBe(false); // in the lineup
    expect(release(s, p.id)).toBe(true);
    s.coins = 0;
    expect(buy(s, 0)).toBe(false);
  });

  test('a broken save becomes a fresh one', () => {
    expect(rankOf(fixSave(undefined))).toBe(16);
    expect(fixSave({ table: ['x'] } as never).table.length).toBe(16);
  });
});
