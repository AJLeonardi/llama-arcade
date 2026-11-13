// One soccer match, 5 llamas a side, as plain numbers (no three.js or DOM) so the tests can run it.
// Ground is x (sideways) and z (along the field); y is up. Team 0 (USA) attacks +z, team 1 attacks -z.
// The ball either sits at someone's feet (`owner`), follows a drawn line (`path`), or flies/rolls free.
import { rng, type Player } from './teams';

export const FIELD = { halfW: 18, halfL: 28, goalHalfW: 3.6, goalH: 2.6, goalDepth: 2 };
export const BALL_R = 0.2;
export const MATCH_SECONDS = 150;
const SUB = 1 / 120;

export type Vec = [number, number];
export type MatchEvent = 'kick' | 'goal-us' | 'goal-them' | 'save' | 'tackle' | 'whistle' | 'end' | 'bounce';

export interface Body {
  team: 0 | 1;
  slot: number; // 0 keeper, 1 left back, 2 right back, 3 midfield, 4 striker
  name: string;
  fur: string;
  human: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Facing angle: 0 = +z, π/2 = +x. */
  face: number;
  maxSpeed: number;
  kick: number;
  save: number;
  /** Can't touch the ball until this runs out (just lost it, or just kicked it). */
  cool: number;
  tackleCD: number;
  /** The last kick this llama tried to block (one try per kick). */
  tried: number;
  holdT: number;
  think: number;
  /** For drawing: time left in the kick swing, keeper dive (-1 left, 1 right) and its timer. */
  kickT: number;
  dive: number;
  diveT: number;
  /** Where this keeper is heading along the goal line. */
  aim: number;
}

export interface Path {
  pts: Vec[];
  cum: number[];
  len: number;
  s: number;
  speed: number;
  h: number;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: Body | null;
  path: Path | null;
  kicker: Body | null;
  kickId: number;
}

// Home places, as (x, forward) for a team attacking +z. Team 1 is the mirror image.
// The camera looks along +z, so +x is on the left of the screen: the left back stands at +x.
const HOME: Vec[] = [
  [0, -FIELD.halfL + 1],
  [7, -15],
  [-7, -15],
  [0, -6],
  [0, 3],
];

export const dirOf = (team: 0 | 1) => (team === 0 ? 1 : -1);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function makePath(pts: Vec[], speed: number, h: number): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1], s: 0, speed, h };
}

/** Point and unit direction at distance `s` along a path. */
export function pathAt(p: Path, s: number): { x: number; z: number; dx: number; dz: number } {
  s = clamp(s, 0, p.len);
  let i = 1;
  while (i < p.pts.length - 1 && p.cum[i] < s) i++;
  const a = p.pts[i - 1], b = p.pts[i];
  const seg = p.cum[i] - p.cum[i - 1] || 1;
  const t = (s - p.cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
}

/** Drop points that are too close together, so the ball moves smoothly along a finger-drawn line. */
export function tidyLine(pts: Vec[], gap = 0.5): Vec[] {
  const out: Vec[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= gap) out.push(p);
  }
  if (pts.length > 1 && out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

export interface Opponent {
  /** 0 = last in the table, 1 = the best team. */
  strength: number;
  furs?: string[];
}

export class Match {
  bodies: Body[] = [];
  ball: Ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null, path: null, kicker: null, kickId: 0 };
  score: [number, number] = [0, 0];
  time = 0;
  phase: 'ready' | 'play' | 'goal' | 'over' = 'ready';
  phaseT = 0;
  events: MatchEvent[] = [];
  human: Body;
  /** Who scored the last goal (the last llama to kick it). */
  scorer: Body | null = null;
  /** Let the computer play Mr. Random too (tests, demo). */
  autopilot = false;
  readonly strength: number;
  private rand: () => number;

  constructor(home: Player[], opp: Opponent, seed = 1, readonly length = MATCH_SECONDS) {
    this.rand = rng(seed);
    this.strength = opp.strength;
    const st = opp.strength;
    home.forEach((p, slot) => {
      this.bodies.push(this.body(0, slot, p.name, p.fur, !!p.star, 5 + 0.45 * p.speed + (p.star ? 1.6 : 0), p.kick, p.save));
    });
    const furs = opp.furs ?? ['#d9b382', '#8a5a3b', '#f2efe6', '#5b4636', '#c9a26b'];
    for (let slot = 0; slot < 5; slot++) {
      const r = this.rand();
      const skill = 1 + st * 3.2 + r * 0.8;
      this.bodies.push(this.body(1, slot, '', furs[slot % furs.length], false, 5 + 0.45 * skill, skill, slot === 0 ? 1 + st * 3.6 : 1));
    }
    this.human = this.bodies.find((b) => b.human) ?? this.bodies[4];
    this.kickoff(0);
  }

  private body(team: 0 | 1, slot: number, name: string, fur: string, human: boolean, maxSpeed: number, kick: number, save: number): Body {
    return { team, slot, name, fur, human, x: 0, z: 0, vx: 0, vz: 0, face: 0, maxSpeed, kick, save, cool: 0, tackleCD: 0, tried: -1, holdT: 0, think: 0, kickT: 0, dive: 0, diveT: 0, aim: 0 };
  }

  team(t: 0 | 1) {
    return this.bodies.filter((b) => b.team === t);
  }

  keeper(t: 0 | 1) {
    return this.bodies.find((b) => b.team === t && b.slot === 0)!;
  }

  homeOf(b: Body): Vec {
    const d = dirOf(b.team);
    return [HOME[b.slot][0] * d, HOME[b.slot][1] * d];
  }

  /** Everyone back to their places; `team` gets the ball in the middle. */
  kickoff(team: 0 | 1) {
    for (const b of this.bodies) {
      const [x, z] = this.homeOf(b);
      b.x = x;
      b.z = z;
      b.vx = b.vz = 0;
      b.face = b.team === 0 ? 0 : Math.PI;
      b.cool = b.tackleCD = b.holdT = b.kickT = b.diveT = b.dive = 0;
      b.aim = 0;
    }
    const d = dirOf(team);
    let taker = this.bodies.find((b) => b.team === team && b.slot === 4)!;
    if (team === 0 && this.human.slot !== 0) taker = this.human;
    if (taker.slot !== 4) {
      const st = this.bodies.find((b) => b.team === team && b.slot === 4)!;
      [st.x, st.z] = [-3 * d, -3 * d];
    }
    taker.x = 0;
    taker.z = -1 * d;
    // The other team waits in its own half, outside the centre circle.
    for (const b of this.bodies) {
      if (b.team === team) continue;
      const bd = dirOf(b.team);
      if (b.z * bd > -6) b.z = -6 * bd;
    }
    const ball = this.ball;
    Object.assign(ball, { x: 0, y: BALL_R, z: -0.25 * d, vx: 0, vy: 0, vz: 0, path: null, kicker: null });
    ball.owner = taker;
    taker.holdT = 0;
    this.phase = 'ready';
    this.phaseT = 0;
  }

  /** Advance the match. `mx`/`mz` is where you want Mr. Random to run (world x/z, length up to 1). */
  step(dt: number, mx = 0, mz = 0) {
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(SUB, left);
      this.sub(h, mx, mz);
      left -= h;
    }
  }

  private sub(dt: number, mx: number, mz: number) {
    if (this.phase === 'over') return;
    this.phaseT += dt;
    for (const b of this.bodies) {
      b.cool = Math.max(0, b.cool - dt);
      b.tackleCD = Math.max(0, b.tackleCD - dt);
      b.kickT = Math.max(0, b.kickT - dt);
      b.diveT = Math.max(0, b.diveT - dt);
      if (b.diveT === 0) b.dive = 0;
    }
    if (this.phase === 'ready') {
      if (this.phaseT > 1.2) {
        this.phase = 'play';
        this.phaseT = 0;
        this.events.push('whistle');
      }
      this.moveBall(dt);
      return;
    }
    if (this.phase === 'goal') {
      for (const b of this.bodies) this.moveBody(b, 0, 0, dt);
      this.moveBall(dt);
      if (this.phaseT > 2.6) {
        if (this.time >= this.length) this.finish();
        else this.kickoff(this.lastGoalTeam === 0 ? 1 : 0);
      }
      return;
    }
    this.time += dt;
    if (this.time >= this.length) {
      this.finish();
      return;
    }

    for (const b of this.bodies) {
      b.think -= dt;
      let [tx, tz] = [0, 0];
      if (b.human && !this.autopilot) {
        const len = Math.hypot(mx, mz);
        const k = len > 1 ? 1 / len : 1;
        const sp = b.maxSpeed * (this.ball.owner === b ? 0.92 : 1);
        this.moveBody(b, mx * k * sp, mz * k * sp, dt);
        continue;
      }
      if (b.slot === 0) [tx, tz] = this.keeperTarget(b, dt);
      else [tx, tz] = this.fieldTarget(b);
      const dx = tx - b.x, dz = tz - b.z;
      const dist = Math.hypot(dx, dz);
      const keeper = b.slot === 0 && !this.keeperRushing(b);
      let sp = keeper ? Math.min(2.4 + 0.55 * b.save, dist * 8) : Math.min(b.maxSpeed, dist * 2.2);
      if (this.ball.owner === b) sp *= 0.85;
      this.moveBody(b, dist > 0.05 ? (dx / dist) * sp : 0, dist > 0.05 ? (dz / dist) * sp : 0, dt);
      if (this.ball.owner === b) this.carrierThink(b);
    }
    this.separate();
    this.moveBall(dt);
    this.touches();
    this.saves();
  }

  private lastGoalTeam: 0 | 1 = 0;
  private kickAt = -10;

  private finish() {
    this.phase = 'over';
    this.events.push('end');
  }

  private moveBody(b: Body, wantVx: number, wantVz: number, dt: number) {
    const k = Math.min(1, dt * 9);
    b.vx += (wantVx - b.vx) * k;
    b.vz += (wantVz - b.vz) * k;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.x = clamp(b.x, -FIELD.halfW + 0.6, FIELD.halfW - 0.6);
    b.z = clamp(b.z, -FIELD.halfL + 0.4, FIELD.halfL - 0.4);
    if (Math.hypot(b.vx, b.vz) > 0.6) {
      const want = Math.atan2(b.vx, b.vz);
      let d = want - b.face;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      b.face += d * Math.min(1, dt * 12);
    }
  }

  private separate() {
    const B = this.bodies;
    for (let i = 0; i < B.length; i++)
      for (let j = i + 1; j < B.length; j++) {
        const a = B[i], b = B[j];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d < 1.0 && d > 1e-4) {
          const push = (1.0 - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
  }

  // ---- the computer players ----

  private keeperRushing(k: Body) {
    const ball = this.ball, goalZ = -dirOf(k.team) * FIELD.halfL;
    return !ball.owner && !ball.path && Math.hypot(ball.vx, ball.vz) < 7 && Math.abs(ball.z - goalZ) < 8 && Math.abs(ball.x) < 9;
  }

  private comingAt(k: Body) {
    const ball = this.ball, d = dirOf(k.team);
    const v = this.ballVel();
    return !ball.owner && -v[1] * d > 4 && Math.abs(ball.z + d * FIELD.halfL) < 24;
  }

  /** Ball velocity on the ground, also while it follows a line (the line's direction right now). */
  ballVel(): Vec {
    const p = this.ball.path;
    if (p) {
      const a = pathAt(p, p.s);
      return [a.dx * p.speed, a.dz * p.speed];
    }
    return [this.ball.vx, this.ball.vz];
  }

  private keeperTarget(k: Body, dt: number): Vec {
    const ball = this.ball, d = dirOf(k.team);
    const goalZ = -d * FIELD.halfL;
    const lineZ = goalZ + d * 0.9;
    if (ball.owner === k) return [k.x, k.z];
    if (this.keeperRushing(k)) return [ball.x, ball.z];
    let want = clamp(ball.x * 0.3, -FIELD.goalHalfW + 1, FIELD.goalHalfW - 1);
    let react = 4;
    if (this.comingAt(k)) {
      // He needs a moment to see the kick (the best keepers see it sooner).
      const skill = Math.min(1, k.save / 4.6);
      if (this.time - this.kickAt < 0.4 - 0.25 * skill) return [k.x, lineZ];
      // Guess where it crosses the line from the way it's going right now: a curvy line fools him.
      const [vx, vz] = this.ballVel();
      want = ball.x + vx * ((lineZ - ball.z) / vz);
      want = clamp(want, -FIELD.goalHalfW - 0.3, FIELD.goalHalfW + 0.3);
      react = 3 + 3 * Math.min(1, k.save / 4.6);
    }
    k.aim += (want - k.aim) * Math.min(1, dt * react);
    return [k.aim, lineZ];
  }

  private fieldTarget(b: Body): Vec {
    const ball = this.ball, d = dirOf(b.team);
    const owner = ball.owner;
    const ours = owner ? owner.team === b.team : ball.path ? ball.kicker?.team === b.team : null;
    if (owner === b) {
      // Dribble at the goal, weaving a bit.
      return [Math.sin(this.time * 0.8 + b.slot) * 5, d * FIELD.halfL];
    }
    if (ours !== true && this.chaser(b.team) === b) {
      const [vx, vz] = this.ballVel();
      return [ball.x + vx * 0.25, ball.z + vz * 0.25];
    }
    const [hx, hf] = HOME[b.slot];
    const ballF = ball.z * d;
    const f = clamp(hf + ballF * 0.55 + (ours ? 6 : -1), -FIELD.halfL + 3, FIELD.halfL - 5);
    const x = hx * d + ball.x * 0.3;
    return [x, f * d];
  }

  /** The computer llama on team `t` that runs for the ball (Mr. Random's team leaves it to him when he's closer). */
  private chaser(t: 0 | 1) {
    const ball = this.ball;
    let best: Body | null = null, bd = Infinity;
    for (const b of this.bodies) {
      if (b.team !== t || b.slot === 0) continue;
      const dist = Math.hypot(b.x - ball.x, b.z - ball.z);
      if (b.human && !this.autopilot) {
        if (dist < bd) return null;
        continue;
      }
      if (dist < bd) {
        bd = dist;
        best = b;
      }
    }
    if (t === 0 && !this.autopilot && Math.hypot(this.human.x - ball.x, this.human.z - ball.z) < bd) return null;
    return best;
  }

  private carrierThink(b: Body) {
    if (this.phase !== 'play' || b.think > 0) return;
    b.think = 0.2;
    const d = dirOf(b.team);
    const goalZ = d * FIELD.halfL;
    const g = Math.hypot(b.x, goalZ - b.z);
    if (b.slot === 0) {
      if (b.holdT > 1) this.passFrom(b);
      return;
    }
    if (g < 10 + b.kick * 0.9 && b.holdT > 0.3) {
      this.aiShoot(b);
      return;
    }
    if (b.team === 0 && !this.autopilot && b.holdT > 0.5 && this.human.slot !== 0) {
      this.passTo(b, this.human);
      return;
    }
    const pressed = this.bodies.some((o) => o.team !== b.team && Math.hypot(o.x - b.x, o.z - b.z) < 2.2);
    if ((pressed && b.holdT > 0.4 && this.rand() < 0.35) || b.holdT > 4) this.passFrom(b);
  }

  private passFrom(b: Body) {
    const mates = this.bodies.filter((o) => o.team === b.team && o !== b && o.slot !== 0);
    if (b.team === 0 && !this.autopilot && this.human.slot !== 0 && b !== this.human) return this.passTo(b, this.human);
    const d = dirOf(b.team);
    const open = (o: Body) => !this.bodies.some((e) => e.team !== b.team && Math.hypot(e.x - o.x, e.z - o.z) < 3);
    const ahead = mates.filter((o) => o.z * d > b.z * d - 4 && open(o));
    const pick = (ahead.length ? ahead : mates)[Math.floor(this.rand() * (ahead.length || mates.length))];
    if (pick) this.passTo(b, pick);
  }

  private passTo(b: Body, to: Body) {
    const lead: Vec = [to.x + to.vx * 0.35, to.z + to.vz * 0.35];
    const dist = Math.hypot(lead[0] - this.ball.x, lead[1] - this.ball.z);
    this.kickAlong(b, [lead], clamp(9 + dist * 0.45, 10, 18), 0.15);
  }

  private aiShoot(b: Body) {
    const d = dirOf(b.team);
    const k = this.keeper(b.team === 0 ? 1 : 0);
    const side = k.x > 0.3 ? -1 : k.x < -0.3 ? 1 : this.rand() < 0.5 ? -1 : 1;
    const miss = (this.rand() - 0.5) * 2 * (5.6 - Math.min(5, b.kick)) * 0.55;
    const x = side * (FIELD.goalHalfW - 0.8) + miss;
    this.kickAlong(b, [[x, d * (FIELD.halfL + 1.5)]], 14 + b.kick * 1.5, 0.2 + this.rand() * 0.8);
  }

  /** Kick the ball along a line of points (it starts where the ball is). */
  kickAlong(b: Body, pts: Vec[], speed: number, h: number) {
    const ball = this.ball;
    const all: Vec[] = [[ball.x, ball.z], ...pts.map(([x, z]) => [clamp(x, -FIELD.halfW, FIELD.halfW), clamp(z, -FIELD.halfL - FIELD.goalDepth, FIELD.halfL + FIELD.goalDepth)] as Vec)];
    const path = makePath(all, speed, h);
    if (path.len < 0.5) return;
    ball.owner = null;
    ball.path = path;
    ball.kicker = b;
    ball.kickId++;
    ball.vy = 0;
    this.kickAt = this.time;
    b.cool = 0.4;
    b.kickT = 0.3;
    b.holdT = 0;
    this.events.push('kick');
  }

  // ---- you ----

  /** Can Mr. Random kick right now? (He has it, or it's loose at his feet.) */
  canShoot() {
    const h = this.human, ball = this.ball;
    if (this.phase !== 'play') return false;
    return ball.owner === h || (!ball.owner && !ball.path && h.cool === 0 && Math.hypot(ball.x - h.x, ball.z - h.z) < 1.8 && ball.y < 1);
  }

  /** Shoot (or pass) along the line you drew, in world x/z. */
  shoot(line: Vec[]) {
    if (!this.canShoot()) return false;
    const pts = tidyLine(line, 0.4);
    const len = makePath([[this.ball.x, this.ball.z], ...pts], 1, 0).len;
    if (len < 1.5) return false;
    const h = this.human;
    this.kickAlong(h, pts, 16 + h.kick * 1.7, clamp(len * 0.035, 0.15, 1.1));
    return true;
  }

  /** Keyboard shot: straight at the corner the keeper isn't covering. */
  quickShot() {
    if (!this.canShoot()) return false;
    const k = this.keeper(1);
    const side = k.x > 0 ? -1 : 1;
    this.kickAlong(this.human, [[side * (FIELD.goalHalfW - 0.7), FIELD.halfL + 1.5]], 16 + this.human.kick * 1.7, 0.5);
    return true;
  }

  // ---- the ball ----

  private moveBall(dt: number) {
    const ball = this.ball;
    if (ball.owner) {
      const o = ball.owner;
      o.holdT += dt;
      ball.x = o.x + Math.sin(o.face) * 0.75;
      ball.z = o.z + Math.cos(o.face) * 0.75;
      ball.y = BALL_R;
      ball.vx = o.vx;
      ball.vz = o.vz;
      ball.vy = 0;
      this.goalCheck();
      return;
    }
    if (ball.path) {
      const p = ball.path;
      p.s += p.speed * dt;
      const a = pathAt(p, p.s);
      ball.vx = a.dx * p.speed;
      ball.vz = a.dz * p.speed;
      ball.x = a.x;
      ball.z = a.z;
      ball.y = BALL_R + p.h * Math.sin(Math.PI * Math.min(1, p.s / p.len));
      if (p.s >= p.len) {
        ball.path = null;
        ball.vx *= 0.8;
        ball.vz *= 0.8;
      }
    } else {
      ball.vy -= 9.8 * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.z += ball.vz * dt;
      if (ball.y <= BALL_R) {
        ball.y = BALL_R;
        ball.vy = ball.vy < -2 ? -ball.vy * 0.45 : 0;
        const f = Math.exp(-0.9 * dt);
        ball.vx *= f;
        ball.vz *= f;
      }
    }
    this.walls();
    this.goalCheck();
  }

  private goalCheck() {
    const ball = this.ball;
    if (this.phase === 'play' && Math.abs(ball.z) > FIELD.halfL + BALL_R && Math.abs(ball.x) < FIELD.goalHalfW && ball.y < FIELD.goalH) {
      const team: 0 | 1 = ball.z > 0 ? 0 : 1;
      if (ball.owner && ball.owner.team !== team) return; // never carry it into your own goal
      this.score[team]++;
      this.lastGoalTeam = team;
      this.scorer = ball.owner ?? ball.kicker;
      if (ball.owner) {
        // Dribbled it in: let go so it rolls into the net.
        ball.owner = null;
        ball.kicker = this.scorer;
      }
      this.phase = 'goal';
      this.phaseT = 0;
      this.events.push(team === 0 ? 'goal-us' : 'goal-them');
    }
  }

  private walls() {
    const ball = this.ball;
    const bounce = (vx: number, vz: number) => {
      ball.path = null;
      ball.vx = vx;
      ball.vz = vz;
      if (Math.hypot(vx, vz) > 3) this.events.push('bounce');
    };
    const inMouth = Math.abs(ball.x) < FIELD.goalHalfW - BALL_R && ball.y < FIELD.goalH;
    const inNet = Math.abs(ball.z) > FIELD.halfL;
    if (inNet) {
      // Inside the goal: the net stops it.
      const back = FIELD.halfL + FIELD.goalDepth - BALL_R;
      if (Math.abs(ball.z) > back) {
        ball.z = Math.sign(ball.z) * back;
        bounce(ball.vx * 0.3, -ball.vz * 0.15);
      }
      const side = FIELD.goalHalfW - BALL_R;
      if (Math.abs(ball.x) > side) {
        ball.x = Math.sign(ball.x) * side;
        bounce(-ball.vx * 0.2, ball.vz * 0.3);
      }
      if (ball.y > FIELD.goalH - BALL_R) {
        ball.y = FIELD.goalH - BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.3;
      }
    } else {
      const wx = FIELD.halfW - BALL_R;
      if (Math.abs(ball.x) > wx) {
        ball.x = Math.sign(ball.x) * wx;
        const [vx, vz] = this.ballVel();
        bounce(-vx * 0.6, vz * 0.7);
      }
      const wz = FIELD.halfL - BALL_R;
      if (Math.abs(ball.z) > wz && !inMouth) {
        ball.z = Math.sign(ball.z) * wz;
        const [vx, vz] = this.ballVel();
        bounce(vx * 0.7, -vz * 0.6);
      }
    }
  }

  /** Picking the ball up, blocking kicks, and tackling. */
  private touches() {
    const ball = this.ball;
    if (this.phase !== 'play') return;
    if (ball.owner) {
      const o = ball.owner;
      if (o.slot === 0 && Math.abs(o.z) > FIELD.halfL - 8) return; // keepers holding it are safe
      for (const b of this.bodies) {
        if (b.team === o.team || b.cool > 0 || b.tackleCD > 0) continue;
        const reach = b.human && !this.autopilot ? 1.15 : 0.9;
        if (Math.hypot(b.x - ball.x, b.z - ball.z) > reach) continue;
        b.tackleCD = 0.7;
        const chance = b.human && !this.autopilot ? 1 : o.human && !this.autopilot ? 0.2 + 0.35 * this.strength : 0.4;
        if (this.rand() < chance) {
          ball.owner = b;
          b.holdT = 0;
          o.cool = 0.8;
          this.events.push('tackle');
        }
        return;
      }
      return;
    }
    if (ball.y > 1.3) return;
    const fast = !!ball.path || Math.hypot(ball.vx, ball.vz) > 10;
    let best: Body | null = null, bd = Infinity;
    for (const b of this.bodies) {
      if (b.cool > 0) continue;
      const reach = b.human && !this.autopilot ? 1.0 : 0.8;
      const d = Math.hypot(b.x - ball.x, b.z - ball.z);
      if (d > reach || d > bd) continue;
      if (fast) {
        if (b.slot === 0) continue; // keepers save in saves()
        if (ball.kicker && ball.kicker.team === b.team) {
          // A teammate takes a pass once it has gone a little way.
          if (ball.path && ball.path.s < 3) continue;
        } else {
          if (b.tried === ball.kickId) continue;
          b.tried = ball.kickId;
          if (this.rand() > (b.human ? 0.7 : 0.3)) continue;
        }
      }
      best = b;
      bd = d;
    }
    if (best) {
      if (fast && ball.kicker && ball.kicker.team !== best.team) this.events.push('tackle');
      ball.owner = best;
      ball.path = null;
      best.holdT = 0;
      best.think = 0.15;
    }
  }

  private saves() {
    const ball = this.ball;
    if (ball.owner || this.phase !== 'play') return;
    for (const t of [0, 1] as const) {
      const k = this.keeper(t);
      if (k.tried === ball.kickId && (ball.path || Math.hypot(ball.vx, ball.vz) > 6)) continue;
      const near = Math.abs(ball.z - k.z) < 0.7 && Math.abs(ball.x - k.x) < 2.5;
      if (!near || ball.y > FIELD.goalH + 0.2) continue;
      const fast = !!ball.path || Math.hypot(ball.vx, ball.vz) > 6;
      if (!fast) continue; // slow balls are just picked up (keeperRushing + touches)
      k.tried = ball.kickId;
      const reach = 0.45 + 0.17 * k.save;
      const off = ball.x - k.x;
      k.dive = Math.abs(off) > 0.4 ? Math.sign(off) : 0;
      k.diveT = 0.7;
      if (Math.abs(off) < reach) {
        ball.owner = k;
        ball.path = null;
        k.holdT = 0;
        k.think = 0.3;
        this.events.push('save');
      }
    }
    // A slow ball near a keeper is just his.
    for (const t of [0, 1] as const) {
      const k = this.keeper(t);
      if (k.cool > 0 || ball.path || Math.hypot(ball.vx, ball.vz) > 6) continue;
      if (Math.hypot(k.x - ball.x, k.z - ball.z) < 0.9 && ball.y < 1.5) {
        ball.owner = k;
        k.holdT = 0;
      }
    }
  }

  /** Read and clear the sound/announcer events. */
  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** The match clock in football minutes (0-90). */
  minute() {
    return Math.min(90, Math.floor((this.time / this.length) * 90));
  }
}
