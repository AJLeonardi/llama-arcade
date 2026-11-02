// One game: innings, outs, the count, who's on base and the score. Team 0 bats in the top of each inning,
// team 1 in the bottom. To keep games short for kids there's a 5-run limit per half inning.
import type { BallInPlay } from './hit';

export interface RunnerMove {
  /** 0 = the batter, 1-3 = the runner on that base. */
  from: number;
  /** 1-3 = stays on that base, 4 = scores, 0 = out. */
  to: number;
}

export interface PlayOutcome {
  text: string;
  /** 'big' for home runs and wins: confetti and cheering. */
  mood: 'good' | 'bad' | 'big' | 'plain';
  moves: RunnerMove[];
  runs: number;
  outs: number;
  /** The batter is done (out, hit, walk), next batter up. */
  next: boolean;
  /** The half inning ended. */
  sideRetired: boolean;
}

export const MAX_RUNS_PER_HALF = 5;

export class Game {
  inning = 1;
  top = true;
  outs = 0;
  balls = 0;
  strikes = 0;
  bases: [boolean, boolean, boolean] = [false, false, false];
  score: [number, number] = [0, 0];
  /** Runs scored in each half inning, for the scoreboard: [team][inning-1]. */
  line: [number[], number[]] = [[], []];
  hits: [number, number] = [0, 0];
  batter: [number, number] = [0, 0];
  over = false;
  halfRuns = 0;

  constructor(readonly innings = 3, readonly lineup = 9) {}

  get batting(): 0 | 1 {
    return this.top ? 0 : 1;
  }
  get fielding(): 0 | 1 {
    return this.top ? 1 : 0;
  }

  /** A pitch the batter didn't hit into play: 'ball', 'strike' (called or swinging), or 'foul'. */
  pitch(kind: 'ball' | 'strike' | 'foul', swinging = false): PlayOutcome {
    if (kind === 'ball') {
      this.balls++;
      if (this.balls >= 4) return this.walk();
      return this.plain('Ball', 'plain');
    }
    if (kind === 'foul') {
      if (this.strikes < 2) this.strikes++;
      return this.plain('Foul ball', 'plain');
    }
    this.strikes++;
    if (this.strikes >= 3) {
      return this.finish({ text: swinging ? 'Strike three! Struck out swinging' : 'Strike three! Called out', moves: [{ from: 0, to: 0 }], hit: false, outs: 1 });
    }
    return this.plain(swinging ? 'Swing and a miss! Strike' : 'Strike', 'plain');
  }

  private plain(text: string, mood: PlayOutcome['mood']): PlayOutcome {
    return { text, mood, moves: [], runs: 0, outs: 0, next: false, sideRetired: false };
  }

  private walk(): PlayOutcome {
    const moves: RunnerMove[] = [{ from: 0, to: 1 }];
    // Only forced runners move up.
    if (this.bases[0]) {
      moves.push({ from: 1, to: 2 });
      if (this.bases[1]) {
        moves.push({ from: 2, to: 3 });
        if (this.bases[2]) moves.push({ from: 3, to: 4 });
      }
    }
    for (let b = 2; b <= 3; b++) if (this.bases[b - 1] && !moves.some((m) => m.from === b)) moves.push({ from: b, to: b });
    return this.finish({ text: 'Ball four! Take your base', moves, hit: false, outs: 0 });
  }

  /** A ball hit into play (or a foul). */
  inPlay(b: BallInPlay): PlayOutcome {
    if (b.result === 'foul') return this.pitch('foul');
    const on = [1, 2, 3].filter((i) => this.bases[i - 1]);
    const moves: RunnerMove[] = [];
    let outs = 0;
    let text = '';
    if (b.result === 'out') {
      outs = 1;
      moves.push({ from: 0, to: 0 });
      const how = { fly: 'Fly out', line: 'Line drive... caught!', pop: 'Pop out', ground: 'Ground out' }[b.outHow ?? 'fly'];
      text = `${how} to ${b.fielding?.pos ?? ''}`;
      if (b.outHow === 'ground' && this.bases[0] && b.quick && this.outs < 2) {
        // Double play: out at second, then first.
        outs = 2;
        text = 'Double play!';
        moves.push({ from: 1, to: 0 });
        for (const i of on) if (i > 1) moves.push({ from: i, to: this.outs + 2 >= 3 ? i : Math.min(4, i + 1) });
      } else if (b.outHow === 'ground') {
        // Runners move up a base on a ground out (forced ones must).
        for (const i of on) moves.push({ from: i, to: this.outs + 1 >= 3 ? i : Math.min(4, i + 1) });
      } else {
        // Caught in the air: a runner on third tags up and scores on a deep fly.
        const deep = b.fielding ? Math.hypot(b.fielding.at[0], b.fielding.at[1]) > 55 : false;
        for (const i of on) moves.push({ from: i, to: i === 3 && deep && b.outHow === 'fly' && this.outs < 2 ? 4 : i });
        if (moves.some((m) => m.from === 3 && m.to === 4)) text = 'Sacrifice fly! The runner tags up and scores';
      }
    } else {
      const n = b.result === 'hr' ? 4 : b.result;
      moves.push({ from: 0, to: n });
      // Runners go as far as the batter, and a runner on second scores on a single.
      for (const i of on) moves.push({ from: i, to: Math.min(4, i + n + (n === 1 && i === 2 ? 1 : 0)) });
      text = b.result === 'hr' ? 'HOME RUN!!' : ['', 'Single!', 'Double!', 'Triple!', 'Inside-the-park home run!!'][n];
    }
    return this.finish({ text, moves, hit: b.result !== 'out', outs });
  }

  private finish(o: { text: string; moves: RunnerMove[]; hit: boolean; outs: number }): PlayOutcome {
    const bases: [boolean, boolean, boolean] = [false, false, false];
    let runs = 0;
    // Runners who don't appear in the moves stay where they are.
    for (let i = 1; i <= 3; i++) if (this.bases[i - 1] && !o.moves.some((m) => m.from === i)) o.moves.push({ from: i, to: i });
    const outsBefore = this.outs;
    this.outs = Math.min(3, this.outs + o.outs);
    for (const m of o.moves) {
      if (m.to === 4) {
        // Runs on a play that makes the third out (at first) don't count, except on a force at another base;
        // we keep it simple: no runs once there are three outs.
        if (this.outs < 3 || outsBefore + o.outs < 3) runs++;
      } else if (m.to >= 1) bases[m.to - 1] = true;
    }
    if (this.outs >= 3) runs = 0;
    runs = Math.min(runs, MAX_RUNS_PER_HALF - this.halfRuns);
    const team = this.batting;
    this.score[team] += runs;
    this.halfRuns += runs;
    this.line[team][this.inning - 1] = (this.line[team][this.inning - 1] ?? 0) + runs;
    if (o.hit) this.hits[team]++;
    this.bases = bases;
    this.balls = 0;
    this.strikes = 0;
    this.batter[team] = (this.batter[team] + 1) % this.lineup;
    let mood: PlayOutcome['mood'] = o.hit || runs > 0 ? 'good' : o.outs ? 'bad' : 'good';
    if (o.text.includes('HOME RUN')) mood = 'big';
    let text = o.text;
    if (runs > 0 && !o.text.includes('HOME RUN')) text += runs === 1 ? ' A run scores!' : ` ${runs} runs score!`;
    let sideRetired = false;
    if (this.outs >= 3 || this.halfRuns >= MAX_RUNS_PER_HALF) {
      if (this.outs < 3) text += ' That\'s 5 runs: switch sides!';
      sideRetired = true;
      this.endHalf();
    } else if (!this.top && this.inning >= this.innings && this.score[1] > this.score[0]) {
      this.over = true; // walk-off!
      text += ' Walk-off win!';
      mood = 'big';
    }
    return { text, mood, moves: o.moves, runs, outs: o.outs, next: true, sideRetired };
  }

  private endHalf() {
    this.outs = 0;
    this.balls = 0;
    this.strikes = 0;
    this.bases = [false, false, false];
    this.halfRuns = 0;
    const line = this.line[this.batting];
    line[this.inning - 1] = line[this.inning - 1] ?? 0;
    if (this.top) {
      // Home team ahead after the top of the last inning: no need to bat.
      if (this.inning >= this.innings && this.score[1] > this.score[0]) this.over = true;
      else this.top = false;
    } else {
      if (this.inning >= this.innings && this.score[0] !== this.score[1]) this.over = true;
      else {
        this.top = true;
        this.inning++;
      }
    }
  }

  /** The winner (0 or 1) once the game is over. */
  get winner(): 0 | 1 | null {
    if (!this.over) return null;
    return this.score[0] > this.score[1] ? 0 : 1;
  }
}
