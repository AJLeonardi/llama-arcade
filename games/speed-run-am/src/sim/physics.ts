// The runner in a world of boxes, plus the things that break you into pieces: the chaser, the boulder,
// closing walls, rising poop and goo. Pure maths, no three.js: tested in tests/physics.test.ts.
// The running and jumping started as a copy of Llama-blox's physics (games/blox/src/sim/physics.ts).
import type { Block, Chaser, Level, V3 } from './types';

export const STEP = 1 / 60; // fixed physics step (s)
export const HALF_W = 0.45; // player box half-width (x and z)
export const HEIGHT = 1.8; // player box height; pos is the middle of the feet
export const WALK = 7; // run speed with no boost (units/s)
export const GRAVITY = 32;
export const JUMP = 12; // jump take-off speed: ~2.25 high, ~5 far at WALK
export const CAPE_JUMP = 13; // with the cape: a bit higher...
export const CAPE_AIR = 1.35; // ...and this much faster through the air
export const CAPE_FALL = 0.6; // ...and gravity is this much weaker on the way down (gliding)
export const STEP_UP = 0.55; // ledges this low are walked up without jumping
export const MAX_BOOST = 1; // boost 1 = twice as fast
const TREADMILL_BOOST = 0.12; // boost gained per second of running on a treadmill
const TREADMILL_MATCH = 0.92; // a treadmill's belt runs at least this much of your own speed, so it's hard to reach the front
const KEY_BOOST = 0.025; // boost gained per new keyboard key
const FLOOR_KEY_BOOST = 0.004; // boost gained per new key of a keyboard floor...
const FLOOR_KEY_MAX = 0.6; // ...up to this much
/** Size of one key of a keyboard floor (units). */
export const FLOOR_KEY = 2;
const LETTERS = 'QWERTYUIOPASDFGHJKLZXCVBNM';
const BOOST_FADE = 0.008; // boost lost per second
const COYOTE = 0.12; // can still jump this long after running off an edge (s)
const JUMP_BUFFER = 0.15; // a jump pressed this long before landing still happens (s)
const CATCH = 1.1; // the chaser catches you this close
export const FAILS_TO_GYM = 5; // lose this many times in a row and you're sent back to the workout room

/** The furthest jump between two edges at the same height, at walking speed with no cape. */
export const MAX_GAP = WALK * ((2 * JUMP) / GRAVITY);

export type Ouch = 'caught' | 'boulder' | 'squish' | 'goo' | 'poop' | 'fall';

export type SimEvent =
  | { type: 'jump' }
  | { type: 'land' }
  | { type: 'oops'; why: Ouch }
  | { type: 'trap' }
  | { type: 'checkpoint' }
  | { type: 'finish' }
  | { type: 'door'; level: number }
  | { type: 'locked'; level: number }
  | { type: 'cape' }
  | { type: 'key'; letter: string; floor?: boolean }
  | { type: 'treadmill' }
  | { type: 'chase' }
  | { type: 'poop' };

export interface Input {
  /** Wanted run direction in world x/z, length 0..1. */
  moveX: number;
  moveZ: number;
  /** True on the step the jump button went down. */
  jump: boolean;
}

/** Where a moving block is at time t: eases from its start out to start + (dx,dy,dz) and back. */
export function blockOffset(b: Block, t: number): V3 {
  if (!b.move) return [0, 0, 0];
  const { dx, dy, dz, period, phase = 0 } = b.move;
  const s = (1 - Math.cos(((t / period + phase) % 1) * Math.PI * 2)) / 2;
  return [dx * s, dy * s, dz * s];
}

/** Where a boulder is at time t (its centre z), or null while it's waiting to roll again. */
export function boulderZ(b: { z0: number; z1: number; speed: number; wait: number }, t: number): number | null {
  const roll = (b.z0 - b.z1) / b.speed;
  const s = t % (roll + b.wait);
  return s < roll ? b.z0 - s * b.speed : null;
}

const TRIGGERS = new Set(['door', 'cape', 'zone']);

export class Sim {
  readonly level: Level;
  t = 0;
  pos: V3;
  vel: V3 = [0, 0, 0];
  yaw: number;
  onGround = false;
  /** Index of the block we're standing on, or -1. */
  ground = -1;
  checkpoint: V3;
  checkpointYaw: number;
  /** 0..MAX_BOOST: how much faster than walking you run (treadmills and keys). */
  boost = 0;
  /** Wearing the cape: jumps go further. */
  cape = false;
  /** Levels you can go into (doors to higher levels are locked). */
  unlocked = 1;
  /** Broken into pieces, waiting for `respawn()`. */
  broken = false;
  finished = false;
  /** Times you've lost since your last checkpoint. */
  fails = 0;
  /** Chasers: where they are and whether they've started. */
  readonly chasers: { pos: V3; on: boolean; side: number; detour: number }[];
  /** Poop: the top of it, and when it started rising (-1 = not yet). */
  readonly poops: { y: number; since: number }[];
  /** Current centre of each block (moving blocks move). */
  readonly at: V3[];
  private coyote = 0;
  private jumpBuffer = 0;
  private inside = new Set<number>();
  private touchedCheckpoint = -1;
  private lastKey = -1;
  private lastFloorKey = '';
  private onTreadmill = 0;
  private lockedDoor = -1;

  constructor(level: Level) {
    this.level = level;
    this.pos = [...level.spawn];
    this.checkpoint = [...level.spawn];
    this.yaw = this.checkpointYaw = level.spawnYaw;
    this.at = level.blocks.map((b) => [b.x, b.y, b.z]);
    this.chasers = level.chasers.map((c) => ({ pos: [...c.home] as V3, on: false, side: 1, detour: 0 }));
    this.poops = level.poops.map((p) => ({ y: p.y0, since: -1 }));
    this.inside = new Set(this.triggersHere());
  }

  /** Back to the last checkpoint after breaking into pieces. The chasers and poop start over too. */
  respawn() {
    this.pos = [...this.checkpoint];
    this.yaw = this.checkpointYaw;
    this.vel = [0, 0, 0];
    this.onGround = false;
    this.ground = -1;
    this.broken = false;
    this.chasers.forEach((c, i) => {
      c.pos = [...this.level.chasers[i].home];
      c.on = false;
      c.detour = 0;
    });
    this.poops.forEach((p, i) => {
      p.y = this.level.poops[i].y0;
      p.since = -1;
    });
    this.inside = new Set(this.triggersHere());
  }

  /** All the way back to the start of the level (the maze's wrong way). */
  backToStart() {
    this.checkpoint = [...this.level.spawn];
    this.checkpointYaw = this.level.spawnYaw;
    this.touchedCheckpoint = -1;
    this.respawn();
  }

  private breakUp(why: Ouch, ev: SimEvent[]) {
    this.broken = true;
    this.fails++;
    this.vel = [0, 0, 0];
    ev.push({ type: 'oops', why });
  }

  /** How fast you run right now. */
  get speed() {
    return WALK * (1 + this.boost);
  }

  step(input: Input, dt = STEP): SimEvent[] {
    const ev: SimEvent[] = [];
    const L = this.level;
    this.t += dt;

    // 1. Move the moving blocks, carrying the player along if standing on one.
    for (let i = 0; i < L.blocks.length; i++) {
      const b = L.blocks[i];
      if (!b.move) continue;
      const o = blockOffset(b, this.t);
      const nx = b.x + o[0], ny = b.y + o[1], nz = b.z + o[2];
      if (!this.broken && i === this.ground && this.onGround) {
        this.pos[0] += nx - this.at[i][0];
        this.pos[1] += ny - this.at[i][1];
        this.pos[2] += nz - this.at[i][2];
      }
      this.at[i] = [nx, ny, nz];
    }
    this.stepPoop(dt);
    if (this.broken || this.finished) return ev;

    // Closing walls squish you.
    if (L.blocks.some((b, i) => b.kind === 'crush' && this.overlaps(i, -0.05))) {
      this.breakUp('squish', ev);
      return ev;
    }
    this.pushOut();

    // 2. Running: ease towards the wanted speed (quick on the ground, slower in the air). The cape helps in the air.
    this.boost = Math.max(0, this.boost - BOOST_FADE * dt);
    const len = Math.hypot(input.moveX, input.moveZ);
    const mx = len > 1 ? input.moveX / len : input.moveX;
    const mz = len > 1 ? input.moveZ / len : input.moveZ;
    const speed = this.speed * (this.cape && !this.onGround ? CAPE_AIR : 1);
    const k = Math.min(1, (this.onGround ? 16 : 7) * dt);
    this.vel[0] += (mx * speed - this.vel[0]) * k;
    this.vel[2] += (mz * speed - this.vel[2]) * k;
    if (len > 0.1) {
      const want = Math.atan2(mx, mz);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, 14 * dt);
    }

    // 3. Jumping, with a little forgiveness either side of the edge.
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.jump ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel[1] = this.cape ? CAPE_JUMP : JUMP;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.onGround = false;
      this.ground = -1;
      ev.push({ type: 'jump' });
    }
    const g = this.cape && this.vel[1] < 0 ? GRAVITY * CAPE_FALL : GRAVITY;
    this.vel[1] = Math.max(-40, this.vel[1] - g * dt);

    // 4. Treadmills carry you backwards; running on one makes you faster and faster.
    let carryX = 0, carryZ = 0;
    if (this.onGround && this.ground >= 0 && L.blocks[this.ground].kind === 'treadmill') {
      const [px, pz] = L.blocks[this.ground].push ?? [0, 0];
      const k = this.beltSpeed(L.blocks[this.ground]) / (Math.hypot(px, pz) || 1);
      carryX = px * k;
      carryZ = pz * k;
      if (len > 0.5) {
        this.boost = Math.min(MAX_BOOST, this.boost + TREADMILL_BOOST * dt);
        this.onTreadmill += dt;
        if (this.onTreadmill > 1.5) {
          this.onTreadmill = 0;
          ev.push({ type: 'treadmill' });
        }
      }
    }

    // 5. Move one axis at a time, stopping at blocks.
    const wasGround = this.onGround;
    this.onGround = false;
    this.moveY(this.vel[1] * dt);
    this.moveXZ(0, (this.vel[0] + carryX) * dt, wasGround);
    this.moveXZ(2, (this.vel[2] + carryZ) * dt, wasGround);
    if (this.onGround && !wasGround) ev.push({ type: 'land' });

    // 6. What we're standing on.
    if (this.onGround && this.ground >= 0) {
      const gi = this.ground;
      const b = L.blocks[gi];
      if (b.keyboard) {
        const kx = Math.floor(this.pos[0] / FLOOR_KEY), kz = Math.floor(this.pos[2] / FLOOR_KEY);
        const cell = `${kx},${kz}`;
        if (cell !== this.lastFloorKey) {
          this.lastFloorKey = cell;
          if (this.boost < FLOOR_KEY_MAX) this.boost = Math.min(FLOOR_KEY_MAX, this.boost + FLOOR_KEY_BOOST);
          ev.push({ type: 'key', letter: LETTERS[(((kx * 7 + kz * 13) % 26) + 26) % 26], floor: true });
        }
      }
      if (b.kind === 'key' && this.lastKey !== gi) {
        this.lastKey = gi;
        this.boost = Math.min(MAX_BOOST, this.boost + KEY_BOOST);
        ev.push({ type: 'key', letter: b.letter ?? '' });
      } else if (b.kind === 'checkpoint' && this.touchedCheckpoint !== gi) {
        this.touchedCheckpoint = gi;
        this.checkpoint = [this.at[gi][0], this.at[gi][1] + b.h / 2, this.at[gi][2]];
        this.checkpointYaw = this.yaw;
        this.fails = 0;
        ev.push({ type: 'checkpoint' });
      } else if (b.kind === 'trap') {
        this.backToStart();
        ev.push({ type: 'trap' });
        return ev;
      } else if (b.kind === 'finish' && !this.finished) {
        this.finished = true;
        ev.push({ type: 'finish' });
      }
    }

    // 7. Hazards.
    if (this.pos[1] < L.fallY) this.breakUp('fall', ev);
    else if (this.touching((b) => b.kind === 'goo', 0.06)) this.breakUp('goo', ev);
    else if (this.stepChasers(dt)) this.breakUp('caught', ev);
    else if (this.hitBoulder()) this.breakUp('boulder', ev);
    else if (this.inPoop()) this.breakUp('poop', ev);
    if (this.broken) return ev;

    // Locked doors: say so once when you bump into one.
    let bumped = -1;
    L.blocks.forEach((b, i) => {
      if (b.kind === 'door' && (b.level ?? 0) > this.unlocked && this.overlaps(i, 0.08)) bumped = i;
    });
    if (bumped >= 0 && bumped !== this.lockedDoor) ev.push({ type: 'locked', level: L.blocks[bumped].level ?? 0 });
    this.lockedDoor = bumped;

    // 8. Walk-through triggers, once on the way in.
    const here = this.triggersHere();
    for (const i of here) {
      if (this.inside.has(i)) continue;
      const b = L.blocks[i];
      if (b.kind === 'door' && b.level) ev.push({ type: 'door', level: b.level });
      if (b.kind === 'cape' && !this.cape) {
        this.cape = true;
        ev.push({ type: 'cape' });
      }
      if (b.kind === 'zone') {
        L.chasers.forEach((c, k) => {
          if (c.tag === b.tag && !this.chasers[k].on) {
            this.chasers[k].on = true;
            ev.push({ type: 'chase' });
          }
        });
        L.poops.forEach((p, k) => {
          if (p.tag === b.tag && this.poops[k].since < 0) {
            this.poops[k].since = this.t;
            ev.push({ type: 'poop' });
          }
        });
      }
    }
    this.inside = new Set(here);
    return ev;
  }

  /** How fast a treadmill's belt runs: its own `push`, or nearly as fast as you run, whichever is faster. */
  beltSpeed(b: Block) {
    return Math.max(Math.hypot(...(b.push ?? [0, 0])), TREADMILL_MATCH * this.speed);
  }

  // ---- hazards ----

  /** Moves the chasers towards you; true if one caught you. */
  private stepChasers(dt: number) {
    let caught = false;
    this.level.chasers.forEach((c, k) => {
      const s = this.chasers[k];
      if (!s.on) return;
      const dx = this.pos[0] - s.pos[0], dz = this.pos[2] - s.pos[2];
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        const step = c.speed * dt;
        const from: V3 = [...s.pos];
        this.chaserMove(s.pos, c, dx / d, dz / d, step);
        // Stuck on a pillar? Go round it, sideways, keeping to the same side for a while.
        if (Math.hypot(s.pos[0] - from[0], s.pos[2] - from[2]) < step * 0.3 || s.detour > 0) {
          if (s.detour <= 0) s.detour = 0.8;
          s.detour -= dt;
          s.pos = [...from];
          this.chaserMove(s.pos, c, (-dz / d) * s.side, (dx / d) * s.side, step);
          if (Math.hypot(s.pos[0] - from[0], s.pos[2] - from[2]) < step * 0.3) {
            s.side = -s.side; // that way's blocked too: try the other way next time
            s.detour = 0;
          }
        }
      }
      if (Math.hypot(this.pos[0] - s.pos[0], this.pos[2] - s.pos[2]) < CATCH && Math.abs(this.pos[1] - s.pos[1]) < 1.6) caught = true;
    });
    return caught;
  }

  /** One step for a chaser, one axis at a time so it slides along walls, staying in its room. */
  private chaserMove(p: V3, c: Chaser, vx: number, vz: number, step: number) {
    for (const [axis, v] of [[0, vx], [2, vz]] as const) {
      const was = p[axis];
      p[axis] += v * step;
      const [x0, z0, x1, z1] = c.room;
      p[0] = Math.max(x0 + 0.6, Math.min(x1 - 0.6, p[0]));
      p[2] = Math.max(z0 + 0.6, Math.min(z1 - 0.6, p[2]));
      if (this.chaserBlocked(p)) p[axis] = was;
    }
  }

  private chaserBlocked(p: V3) {
    const B = this.level.blocks;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (b.kind !== 'solid' || b.deco) continue;
      const c = this.at[i];
      if (Math.abs(p[0] - c[0]) < b.w / 2 + 0.6 && Math.abs(p[2] - c[2]) < b.d / 2 + 0.6 && p[1] + 0.3 < c[1] + b.h / 2 && p[1] + 2.5 > c[1] - b.h / 2)
        return true;
    }
    return false;
  }

  private hitBoulder() {
    for (const b of this.level.boulders) {
      const z = boulderZ(b, this.t);
      if (z === null) continue;
      const cy = b.y + b.r;
      // Closest point of the player's box to the ball's centre.
      const nx = Math.max(this.pos[0] - HALF_W, Math.min(this.pos[0] + HALF_W, b.x));
      const ny = Math.max(this.pos[1], Math.min(this.pos[1] + HEIGHT, cy));
      const nz = Math.max(this.pos[2] - HALF_W, Math.min(this.pos[2] + HALF_W, z));
      if (Math.hypot(nx - b.x, ny - cy, nz - z) < b.r * 0.95) return true;
    }
    return false;
  }

  private stepPoop(dt: number) {
    this.level.poops.forEach((p, k) => {
      const s = this.poops[k];
      if (s.since >= 0 && this.t - s.since > p.delay) s.y = Math.min(p.y1, s.y + p.speed * dt);
    });
  }

  private inPoop() {
    return this.level.poops.some((p, k) => {
      const [x0, z0, x1, z1] = p.area;
      return this.pos[0] > x0 && this.pos[0] < x1 && this.pos[2] > z0 && this.pos[2] < z1 && this.pos[1] + 0.4 < this.poops[k].y;
    });
  }

  // ---- collision helpers ----

  /** Does the player's box (grown by `grow`) overlap block i? */
  private overlaps(i: number, grow = 0, pos: V3 = this.pos) {
    const b = this.level.blocks[i];
    const c = this.at[i];
    return (
      Math.abs(pos[0] - c[0]) < HALF_W + b.w / 2 + grow &&
      Math.abs(pos[2] - c[2]) < HALF_W + b.d / 2 + grow &&
      pos[1] - grow < c[1] + b.h / 2 &&
      pos[1] + HEIGHT + grow > c[1] - b.h / 2
    );
  }

  /** Does block i block the camera's view? */
  blocksView(i: number) {
    const b = this.level.blocks[i];
    return this.solidAt(i) && b.kind !== 'crush' && b.h > 1.2;
  }

  private solidAt(i: number) {
    const b = this.level.blocks[i];
    if (b.deco) return false;
    if (b.kind === 'door') return (b.level ?? 0) > this.unlocked;
    return !TRIGGERS.has(b.kind);
  }

  private touching(test: (b: Block) => boolean, grow: number) {
    return this.level.blocks.some((b, i) => test(b) && this.solidAt(i) && this.overlaps(i, grow));
  }

  private triggersHere() {
    const out: number[] = [];
    this.level.blocks.forEach((b, i) => {
      if (TRIGGERS.has(b.kind) && !this.solidAt(i) && this.overlaps(i)) out.push(i);
    });
    return out;
  }

  private moveY(dy: number) {
    this.pos[1] += dy;
    const B = this.level.blocks;
    for (let i = 0; i < B.length; i++) {
      if (!this.solidAt(i) || !this.overlaps(i)) continue;
      const c = this.at[i], b = B[i];
      if (dy <= 0) {
        this.pos[1] = c[1] + b.h / 2;
        this.vel[1] = Math.max(0, this.vel[1]);
        this.onGround = true;
        this.ground = i;
      } else {
        this.pos[1] = c[1] - b.h / 2 - HEIGHT;
        this.vel[1] = Math.min(0, this.vel[1]);
      }
    }
  }

  private moveXZ(axis: 0 | 2, d: number, canStep: boolean) {
    if (d === 0) return;
    this.pos[axis] += d;
    const B = this.level.blocks;
    for (let i = 0; i < B.length; i++) {
      if (!this.solidAt(i) || !this.overlaps(i)) continue;
      const c = this.at[i], b = B[i];
      const top = c[1] + b.h / 2;
      // A low ledge: step up onto it instead of stopping (unless something is in the way up there).
      if (canStep && top - this.pos[1] <= STEP_UP && b.kind !== 'goo' && b.kind !== 'crush') {
        const up: V3 = [this.pos[0], top + 0.001, this.pos[2]];
        if (!B.some((_, j) => j !== i && this.solidAt(j) && this.overlaps(j, 0, up))) {
          this.pos[1] = up[1];
          this.onGround = true;
          this.ground = i;
          continue;
        }
      }
      const half = (axis === 0 ? b.w : b.d) / 2 + HALF_W;
      this.pos[axis] = d > 0 ? c[axis] - half - 1e-4 : c[axis] + half + 1e-4;
      this.vel[axis] = 0;
    }
  }

  /** After blocks move, nudge the player out of any block that moved into them (the shortest way out). */
  private pushOut() {
    const B = this.level.blocks;
    for (let i = 0; i < B.length; i++) {
      if (!B[i].move || !this.solidAt(i) || !this.overlaps(i)) continue;
      const c = this.at[i], b = B[i];
      const opts: [number, number][] = [
        [1, c[1] + b.h / 2 - this.pos[1]],
        [0, c[0] + b.w / 2 + HALF_W - this.pos[0]],
        [0, c[0] - b.w / 2 - HALF_W - this.pos[0]],
        [2, c[2] + b.d / 2 + HALF_W - this.pos[2]],
        [2, c[2] - b.d / 2 - HALF_W - this.pos[2]],
      ];
      opts.sort((a, b2) => Math.abs(a[1]) - Math.abs(b2[1]));
      const [axis, d] = opts[0];
      this.pos[axis] += d + Math.sign(d) * 1e-4;
      if (axis === 1) {
        this.onGround = true;
        this.ground = i;
        this.vel[1] = Math.max(0, this.vel[1]);
      }
    }
  }
}
