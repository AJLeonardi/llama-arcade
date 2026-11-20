// The runner on a straight road of boxes. Speed has no top: treadmills and keyboard keys keep making it bigger,
// all the way to infinity. Pure maths, no three.js: tested in tests/game.test.ts.
// The running and jumping started as a copy of Speed Run AM's physics (games/speed-run-am/src/sim/physics.ts).
import type { Block, Boulder, Level, V3 } from './types';

export const STEP = 1 / 60; // fixed physics step (s)
export const HALF_W = 0.45; // player box half-width (x and z)
export const HEIGHT = 1.8; // player box height; pos is the middle of the feet
export const WALK = 7; // run speed at speed 1 (units/s)
export const GRAVITY = 32;
export const JUMP = 12; // jump take-off speed: ~2.25 high, ~5 far at WALK
export const PAD_JUMP = 22; // a jump pad's take-off speed: ~7.5 high
export const STEP_UP = 0.55; // ledges this low are walked up without jumping
/** The fastest you really move (units/s). The speed number goes on for ever; past here it just looks bigger. */
export const TOP_RUN = 100;
/** Sideways is never faster than this, so you can still steer down the road at a huge speed. */
export const SIDEWAYS = 14;
const TREADMILL_MATCH = 0.92; // a treadmill's belt runs at least this much of your own speed, so it's hard to reach the front
const TREADMILL_GROW = 0.03; // past speed 33, a ×1 treadmill adds this much of your speed every second
/** Running at least this fast (units/s), you skim right over goo, like running on water. */
export const GOO_SKIM = 25;
const MAX_MOVE = 0.4; // fast moves are cut into pieces this long, so you can't skip through a wall
/** After coming back, boulders and sliding goo can't get you for this long (s). */
export const SAFE_TIME = 1.5;
const BACK_UP = 3; // after a splat you come back this far behind where you last stood on plain floor
const ROAD_SAFE = 3.5; // ...and at most this far from the middle of the road
const COYOTE = 0.2; // can still jump this long after running off an edge (s)
const JUMP_BUFFER = 0.3; // a jump pressed this long before landing still happens (s)
/** Size of one key of a keyboard floor (units). */
export const FLOOR_KEY = 2;
const LETTERS = 'QWERTYUIOPASDFGHJKLZXCVBNM';

/** The furthest jump between two edges at the same height, at speed 1. */
export const MAX_GAP = WALK * ((2 * JUMP) / GRAVITY);

/**
 * How fast you really run (units/s) at a speed number: 9 more for every ×10. Speed 1 → 7, 10 → 16, 100 → 25,
 * 1K → 34, 10K → 43, 1M → 61, 1B → 88, then TOP_RUN. Big numbers feel faster but stay easy to steer.
 */
export function runSpeed(speed: number) {
  return Math.min(TOP_RUN, WALK + 9 * Math.log10(Math.max(1, speed)));
}

/** How much a treadmill with `gain` adds to your speed in one second. */
export function treadmillRate(gain: number, speed: number) {
  return gain * Math.max(1, speed * TREADMILL_GROW);
}

export type Ouch = 'goo' | 'fall' | 'boulder';

/** Where a boulder is at time t (its centre z), or null between rolls. */
export function boulderZ(b: Boulder, t: number): number | null {
  const roll = (b.z0 - b.z1) / b.speed;
  const s = (((t + b.phase) % (roll + b.wait)) + roll + b.wait) % (roll + b.wait);
  return s < roll ? b.z0 - s * b.speed : null;
}

/** Where a sliding block's middle is (x) at time t. */
export function slideX(b: Block, t: number) {
  if (!b.slide) return b.x;
  return b.x + (b.slide.dx / 2) * Math.sin(Math.PI * 2 * (t / b.slide.period + b.slide.phase));
}

export type SimEvent =
  | { type: 'jump' }
  | { type: 'land' }
  | { type: 'pad' }
  | { type: 'oops'; why: Ouch }
  | { type: 'finish' }
  | { type: 'smash'; block: number }
  | { type: 'tooSlow'; need: number }
  | { type: 'key'; letter: string }
  | { type: 'skim' }
  | { type: 'treadmill'; gain: number };

export interface Input {
  /** Wanted run direction in world x/z, length 0..1. */
  moveX: number;
  moveZ: number;
  /** True on the step the jump button went down. */
  jump: boolean;
}

export class Sim {
  readonly level: Level;
  t = 0;
  pos: V3;
  vel: V3 = [0, 0, 0];
  yaw: number;
  onGround = false;
  /** Index of the block we're standing on, or -1. */
  ground = -1;
  /** Where you come back after a splat: just behind the last bit of plain floor you stood on. */
  checkpoint: V3;
  /** Your speed number: starts at 1 and has no top. Can become Infinity. */
  speed = 1;
  /** Speed walls you've smashed (block indexes). */
  readonly smashed = new Set<number>();
  /** Seconds left of being safe from boulders and sliding goo, just after coming back. */
  safe = 0;
  /** Broken into pieces, waiting for `respawn()`. */
  broken = false;
  finished = false;
  private coyote = 0;
  private jumpBuffer = 0;
  private lastFloorKey = '';
  private onTreadmill = 0;
  private slowWall = -1;
  private skimmed = false;

  constructor(level: Level) {
    this.level = level;
    this.pos = [...level.spawn];
    this.checkpoint = [...level.spawn];
    this.yaw = level.spawnYaw;
  }

  /** Back where you were, just before the splat, after breaking into pieces. Your speed stays. */
  respawn() {
    this.pos = [...this.checkpoint];
    this.yaw = 0;
    this.vel = [0, 0, 0];
    this.onGround = false;
    this.ground = -1;
    this.broken = false;
    this.safe = SAFE_TIME;
  }

  private breakUp(why: Ouch, ev: SimEvent[]) {
    this.broken = true;
    this.vel = [0, 0, 0];
    ev.push({ type: 'oops', why });
  }

  /** So fast that goo can't get you. */
  get skimming() {
    return this.run >= GOO_SKIM;
  }

  /** How fast you run right now (units/s). */
  get run() {
    return runSpeed(this.speed);
  }

  step(input: Input, dt = STEP): SimEvent[] {
    const ev: SimEvent[] = [];
    const L = this.level;
    this.t += dt;
    if (this.broken || this.finished) return ev;
    this.safe = Math.max(0, this.safe - dt);

    // 1. Running: ease towards the wanted speed (quick on the ground, slower in the air). Sideways is capped.
    const len = Math.hypot(input.moveX, input.moveZ);
    const mx = len > 1 ? input.moveX / len : input.moveX;
    const mz = len > 1 ? input.moveZ / len : input.moveZ;
    const run = this.run;
    const k = Math.min(1, (this.onGround ? 16 : 7) * dt);
    const wantX = Math.max(-SIDEWAYS, Math.min(SIDEWAYS, mx * run));
    this.vel[0] += (wantX - this.vel[0]) * k;
    this.vel[2] += (mz * run - this.vel[2]) * k;
    if (len > 0.1) {
      const want = Math.atan2(mx, mz);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, 14 * dt);
    }

    // 2. Jumping, with a little forgiveness either side of the edge. Jump pads throw you up on their own.
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.jump ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);
    const onPad = this.onGround && this.ground >= 0 && L.blocks[this.ground].kind === 'pad';
    if (onPad || (this.jumpBuffer > 0 && this.coyote > 0)) {
      this.vel[1] = onPad ? PAD_JUMP : JUMP;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.onGround = false;
      this.ground = -1;
      ev.push({ type: onPad ? 'pad' : 'jump' });
    }
    this.vel[1] = Math.max(-40, this.vel[1] - GRAVITY * dt);

    // 3. Treadmills carry you backwards; running on one makes your speed go up and up.
    let carryX = 0, carryZ = 0;
    if (this.onGround && this.ground >= 0 && L.blocks[this.ground].kind === 'treadmill') {
      const b = L.blocks[this.ground];
      const [px, pz] = b.push ?? [0, 0];
      const s = this.beltSpeed(b) / (Math.hypot(px, pz) || 1);
      carryX = px * s;
      carryZ = pz * s;
      if (len > 0.5) {
        this.speed += treadmillRate(b.gain ?? 1, this.speed) * dt;
        this.onTreadmill += dt;
        if (this.onTreadmill > 1.5) {
          this.onTreadmill = 0;
          ev.push({ type: 'treadmill', gain: b.gain ?? 1 });
        }
      }
    }

    // 4. Move, in small pieces when going fast, one axis at a time, stopping at blocks.
    const wasGround = this.onGround;
    const dx = (this.vel[0] + carryX) * dt, dy = this.vel[1] * dt, dz = (this.vel[2] + carryZ) * dt;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / MAX_MOVE));
    let keyLetter = '';
    for (let s = 0; s < n; s++) {
      this.onGround = false;
      this.moveY(dy / n);
      this.moveXZ(0, dx / n, wasGround || this.onGround, ev);
      this.moveXZ(2, dz / n, wasGround || this.onGround, ev);
      // Every new key of a keyboard floor adds 1 to your speed.
      if (this.onGround && this.ground >= 0 && L.blocks[this.ground].keyboard) {
        const kx = Math.floor(this.pos[0] / FLOOR_KEY), kz = Math.floor(this.pos[2] / FLOOR_KEY);
        const cell = `${kx},${kz}`;
        if (cell !== this.lastFloorKey) {
          this.lastFloorKey = cell;
          this.speed += 1;
          keyLetter = LETTERS[(((kx * 7 + kz * 13) % 26) + 26) % 26];
        }
      }
      if (this.touchingGoo()) {
        if (!this.skimming) {
          this.breakUp('goo', ev);
          return ev;
        }
        if (!this.skimmed) ev.push({ type: 'skim' });
        this.skimmed = true;
      }
      if (this.pos[2] >= L.finishZ) {
        this.finished = true;
        ev.push({ type: 'finish' });
        return ev;
      }
    }
    if (keyLetter) ev.push({ type: 'key', letter: keyLetter }); // one click a step is plenty
    if (this.onGround && !wasGround) ev.push({ type: 'land' });

    // 5. Standing on plain floor: remember it, a little way back, as where to come back after a splat.
    if (this.onGround && this.ground >= 0 && L.blocks[this.ground].kind === 'solid') {
      // A little way back, but only if there's floor there too (otherwise right here).
      const x = Math.max(-ROAD_SAFE, Math.min(ROAD_SAFE, this.pos[0]));
      const z = this.floorAt(x, this.pos[2] - BACK_UP) ? this.pos[2] - BACK_UP : this.pos[2];
      this.checkpoint = [this.floorAt(x, z) ? x : this.pos[0], this.pos[1], z];
    }

    // Bumped a speed wall you were too slow for? Say so again next time you bump it.
    if (this.slowWall >= 0 && !this.overlaps(this.slowWall, 0.3)) this.slowWall = -1;

    // 6. Falling off the road, or a boulder.
    if (this.pos[1] < L.fallY) this.breakUp('fall', ev);
    else if (!this.safe && this.hitBoulder()) this.breakUp('boulder', ev);
    return ev;
  }

  /** How fast a treadmill's belt runs: its own `push`, or nearly as fast as you run, whichever is faster. */
  beltSpeed(b: Block) {
    return Math.max(Math.hypot(...(b.push ?? [0, 0])), TREADMILL_MATCH * this.run);
  }

  // ---- collision helpers ----

  /** Does the player's box (grown by `grow`) overlap block i? */
  private overlaps(i: number, grow = 0, pos: V3 = this.pos) {
    const b = this.level.blocks[i];
    return (
      Math.abs(pos[0] - (b.slide ? slideX(b, this.t) : b.x)) < HALF_W + b.w / 2 + grow &&
      Math.abs(pos[2] - b.z) < HALF_W + b.d / 2 + grow &&
      pos[1] - grow < b.y + b.h / 2 &&
      pos[1] + HEIGHT + grow > b.y - b.h / 2
    );
  }

  /** Does block i stop you (and the camera)? Sliding goo doesn't: it only splats you (or you skim through). */
  solidAt(i: number) {
    const b = this.level.blocks[i];
    return !b.deco && !b.slide && !this.smashed.has(i);
  }

  /** Is a rolling boulder touching you? */
  private hitBoulder() {
    for (const b of this.level.boulders) {
      const z = boulderZ(b, this.t);
      if (z === null) continue;
      const cy = b.r;
      // The closest point of your box to the ball's middle.
      const nx = Math.max(this.pos[0] - HALF_W, Math.min(this.pos[0] + HALF_W, b.x));
      const ny = Math.max(this.pos[1], Math.min(this.pos[1] + HEIGHT, cy));
      const nz = Math.max(this.pos[2] - HALF_W, Math.min(this.pos[2] + HALF_W, z));
      if (Math.hypot(nx - b.x, ny - cy, nz - z) < b.r * 0.9) return true;
    }
    return false;
  }

  /** Is there plain floor under (x, z), with its top at your feet? */
  private floorAt(x: number, z: number) {
    return this.level.blocks.some(
      (b, i) =>
        b.kind === 'solid' && this.solidAt(i) && Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2 && Math.abs(b.y + b.h / 2 - this.pos[1]) < 0.01,
    );
  }

  private touchingGoo() {
    return this.level.blocks.some((b, i) => b.kind === 'goo' && !(b.slide && this.safe) && this.overlaps(i, 0.06));
  }

  private moveY(dy: number) {
    this.pos[1] += dy;
    const B = this.level.blocks;
    for (let i = 0; i < B.length; i++) {
      if (!this.solidAt(i) || !this.overlaps(i)) continue;
      const b = B[i];
      if (dy <= 0) {
        this.pos[1] = b.y + b.h / 2;
        this.vel[1] = Math.max(0, this.vel[1]);
        this.onGround = true;
        this.ground = i;
      } else {
        this.pos[1] = b.y - b.h / 2 - HEIGHT;
        this.vel[1] = Math.min(0, this.vel[1]);
      }
    }
  }

  private moveXZ(axis: 0 | 2, d: number, canStep: boolean, ev: SimEvent[]) {
    if (d === 0) return;
    this.pos[axis] += d;
    const B = this.level.blocks;
    for (let i = 0; i < B.length; i++) {
      if (!this.solidAt(i) || !this.overlaps(i)) continue;
      const b = B[i];
      // A speed wall: fast enough? SMASH! Too slow? It stops you (and says so once).
      if (b.kind === 'wall') {
        if (this.speed >= (b.need ?? 0)) {
          this.smashed.add(i);
          ev.push({ type: 'smash', block: i });
          continue;
        }
        if (this.slowWall !== i) ev.push({ type: 'tooSlow', need: b.need ?? 0 });
        this.slowWall = i;
      }
      const top = b.y + b.h / 2;
      // A low ledge: step up onto it instead of stopping (unless something is in the way up there).
      if (canStep && top - this.pos[1] <= STEP_UP && (b.kind !== 'goo' || this.skimming) && b.kind !== 'wall') {
        const up: V3 = [this.pos[0], top + 0.001, this.pos[2]];
        if (!B.some((_, j) => j !== i && this.solidAt(j) && this.overlaps(j, 0, up))) {
          this.pos[1] = up[1];
          this.onGround = true;
          this.ground = i;
          continue;
        }
      }
      const half = (axis === 0 ? b.w : b.d) / 2 + HALF_W;
      this.pos[axis] = d > 0 ? (axis === 0 ? b.x : b.z) - half - 1e-4 : (axis === 0 ? b.x : b.z) + half + 1e-4;
      this.vel[axis] = 0;
    }
  }
}
