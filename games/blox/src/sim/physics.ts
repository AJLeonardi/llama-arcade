// The player running and jumping around a world of boxes. Pure maths, no three.js: tested in tests/physics.test.ts.
// Boxes never rotate, so every collision is box-vs-box (AABB), resolved one axis at a time.
import type { Block, Level, V3 } from './types';

export const STEP = 1 / 60; // fixed physics step (s)
export const HALF_W = 0.45; // player box half-width (x and z)
export const HEIGHT = 1.8; // player box height; pos is the middle of the feet
export const WALK = 7; // run speed (units/s)
export const FAST = 13; // run speed on a speed pad
export const FAST_TIME = 2.5; // how long a speed pad lasts (s)
export const GRAVITY = 32;
export const JUMP = 12; // jump take-off speed: ~2.25 high, ~5 far at WALK
export const BOUNCE = 21; // trampoline take-off speed: ~6.9 high
export const STEP_UP = 0.55; // ledges this low are walked up without jumping
export const CRAWL_H = 0.9; // player height while crawling through a vent
const CRAWL_SPEED = 4.5;
const COYOTE = 0.12; // can still jump this long after running off an edge (s)
const JUMP_BUFFER = 0.15; // a jump pressed this long before landing still happens (s)
const VANISH_DELAY = 0.7; // a vanish block stays this long after you touch it (s)
const VANISH_GONE = 2.5; // ...then is gone this long (s)

/** The furthest jump between two edges at the same height, at walking speed (used by the level tests). */
export const MAX_GAP = WALK * ((2 * JUMP) / GRAVITY);

export type SimEvent =
  | { type: 'jump' }
  | { type: 'land' }
  | { type: 'bounce' }
  | { type: 'speed' }
  | { type: 'coin'; index: number }
  | { type: 'checkpoint' }
  | { type: 'oops' }
  | { type: 'finish' }
  | { type: 'portal'; level: string }
  | { type: 'shop' }
  | { type: 'key'; id: string }
  | { type: 'door' }
  | { type: 'locked'; key: string }
  | { type: 'spotted' };

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

const TRIGGERS = new Set(['portal', 'shop', 'crawl', 'spot', 'zone']);
const isSolid = (b: Block) => !b.deco && !TRIGGERS.has(b.kind);

export class Sim {
  readonly level: Level;
  t = 0;
  pos: V3;
  vel: V3 = [0, 0, 0];
  /** Which way the player faces (turns towards the run direction). */
  yaw: number;
  onGround = false;
  /** Index of the block we're standing on, or -1. */
  ground = -1;
  checkpoint: V3;
  fastTime = 0;
  finished = false;
  readonly coinTaken: boolean[];
  readonly keyTaken: boolean[];
  /** Keys we're carrying, and doors (block indexes) we've opened. */
  readonly keys = new Set<string>();
  readonly opened = new Set<number>();
  /** Current height of the player's box: HEIGHT, or CRAWL_H in a vent. */
  height = HEIGHT;
  /** Tags of the zones we're standing in. */
  zones: string[] = [];
  /** Current centre of each block (moving blocks move). */
  readonly at: V3[];
  /** Vanish blocks: seconds since touched (-1 = untouched). */
  private readonly vanishT: number[];
  private coyote = 0;
  private jumpBuffer = 0;
  /** Trigger blocks we're inside, so portals/shop fire once on the way in. */
  private inside = new Set<number>();
  private touchedCheckpoint = -1;
  private lockedDoor = -1;

  constructor(level: Level) {
    this.level = level;
    this.pos = [...level.spawn];
    this.checkpoint = [...level.spawn];
    this.yaw = level.spawnYaw;
    this.coinTaken = level.coins.map(() => false);
    this.keyTaken = (level.keys ?? []).map(() => false);
    this.at = level.blocks.map((b) => [b.x, b.y, b.z]);
    this.vanishT = level.blocks.map(() => -1);
    // Don't fire the portal/shop you might be standing in at the start.
    this.inside = new Set(this.triggersHere());
  }

  /** False while a vanish block is gone. */
  present(i: number) {
    const v = this.vanishT[i];
    return v < VANISH_DELAY || v >= VANISH_DELAY + VANISH_GONE;
  }

  /** 0..1 how faded a vanish block is (for drawing). */
  fade(i: number) {
    const v = this.vanishT[i];
    if (v < 0) return 0;
    if (v < VANISH_DELAY) return v / VANISH_DELAY;
    return v < VANISH_DELAY + VANISH_GONE ? 1 : 0;
  }

  /** Back to the last checkpoint (fell off, or touched lava). */
  respawn() {
    this.pos = [...this.checkpoint];
    this.vel = [0, 0, 0];
    this.onGround = false;
    this.ground = -1;
    this.fastTime = 0;
    this.height = HEIGHT;
    this.vanishT.fill(-1);
  }

  get crawling() {
    return this.height < HEIGHT;
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
      if (i === this.ground && this.onGround) {
        this.pos[0] += nx - this.at[i][0];
        this.pos[1] += ny - this.at[i][1];
        this.pos[2] += nz - this.at[i][2];
      }
      this.at[i] = [nx, ny, nz];
    }
    this.pushOut();

    // 2. Vanish timers.
    for (let i = 0; i < this.vanishT.length; i++) {
      if (this.vanishT[i] >= 0) {
        this.vanishT[i] += dt;
        if (this.vanishT[i] >= VANISH_DELAY + VANISH_GONE + 0.5) this.vanishT[i] = -1;
      }
    }
    if (this.ground >= 0 && !this.present(this.ground)) {
      this.onGround = false;
      this.ground = -1;
    }

    // 3. Crawl in vents; stand up again once there's room.
    if (this.level.blocks.some((b, i) => b.kind === 'crawl' && this.overlaps(i))) this.height = CRAWL_H;
    else if (this.crawling) {
      const up: V3 = [...this.pos];
      if (!this.level.blocks.some((_, i) => this.solidAt(i) && this.overlaps(i, 0, up, HEIGHT))) this.height = HEIGHT;
    }

    // Running: ease towards the wanted speed (quick on the ground, a bit slower in the air).
    this.fastTime = Math.max(0, this.fastTime - dt);
    const speed = this.crawling ? CRAWL_SPEED : this.fastTime > 0 ? FAST : WALK;
    const len = Math.hypot(input.moveX, input.moveZ);
    const mx = len > 1 ? input.moveX / len : input.moveX;
    const mz = len > 1 ? input.moveZ / len : input.moveZ;
    const k = Math.min(1, (this.onGround ? 16 : 7) * dt);
    this.vel[0] += (mx * speed - this.vel[0]) * k;
    this.vel[2] += (mz * speed - this.vel[2]) * k;
    if (len > 0.1) {
      const want = Math.atan2(mx, mz);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, 14 * dt);
    }

    // 4. Jumping, with a little forgiveness either side of the edge.
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.jump ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel[1] = JUMP;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.onGround = false;
      this.ground = -1;
      ev.push({ type: 'jump' });
    }
    this.vel[1] = Math.max(-40, this.vel[1] - GRAVITY * dt);

    // 5. Conveyors carry you while you stand on them.
    let carryX = 0, carryZ = 0;
    if (this.onGround && this.ground >= 0) {
      const p = L.blocks[this.ground].push;
      if (p) [carryX, carryZ] = p;
    }

    // 6. Move one axis at a time, stopping at blocks.
    const wasGround = this.onGround;
    this.onGround = false;
    this.moveY(this.vel[1] * dt);
    this.moveXZ(0, (this.vel[0] + carryX) * dt, wasGround);
    this.moveXZ(2, (this.vel[2] + carryZ) * dt, wasGround);
    if (this.onGround && !wasGround) ev.push({ type: 'land' });

    // 7. What we're standing on.
    if (this.onGround && this.ground >= 0) {
      const g = this.ground;
      const b = L.blocks[g];
      if (b.kind === 'vanish' && this.vanishT[g] < 0) this.vanishT[g] = 0;
      if (b.kind === 'bounce') {
        this.vel[1] = BOUNCE;
        this.onGround = false;
        this.ground = -1;
        ev.push({ type: 'bounce' });
      } else if (b.kind === 'speed') {
        if (this.fastTime < FAST_TIME - 0.3) ev.push({ type: 'speed' });
        this.fastTime = FAST_TIME;
      } else if (b.kind === 'checkpoint' && this.touchedCheckpoint !== g) {
        this.touchedCheckpoint = g;
        this.checkpoint = [this.at[g][0], this.at[g][1] + b.h / 2, this.at[g][2]];
        ev.push({ type: 'checkpoint' });
      } else if (b.kind === 'finish' && !this.finished) {
        this.finished = true;
        ev.push({ type: 'finish' });
      }
    }

    // 8. Lava (any touch, from any side) and falling off the world.
    if (this.pos[1] < L.fallY || this.touching((b) => b.kind === 'lava', 0.06)) {
      this.respawn();
      ev.push({ type: 'oops' });
    }
    // Searchlights: if one finds you, back you go.
    if (L.blocks.some((b, i) => b.kind === 'spot' && this.overlaps(i))) {
      this.respawn();
      ev.push({ type: 'spotted' });
    }

    // Doors open when you bump into them with the right key.
    let bumped = -1;
    L.blocks.forEach((b, i) => {
      if (b.kind !== 'door' || !this.solidAt(i) || !this.overlaps(i, 0.08)) return;
      if (b.key && this.keys.has(b.key)) {
        this.opened.add(i);
        ev.push({ type: 'door' });
      } else {
        bumped = i;
        if (this.lockedDoor !== i) ev.push({ type: 'locked', key: b.key ?? '' });
      }
    });
    this.lockedDoor = bumped;

    // 9. Walk-through triggers.
    const here = this.triggersHere();
    this.zones = [];
    for (const i of here) if (L.blocks[i].kind === 'zone') this.zones.push(L.blocks[i].tag ?? '');
    for (const i of here) {
      if (this.inside.has(i)) continue;
      const b = L.blocks[i];
      if (b.kind === 'portal' && b.level) ev.push({ type: 'portal', level: b.level });
      if (b.kind === 'shop') ev.push({ type: 'shop' });
    }
    this.inside = new Set(here);

    // 10. Coins.
    const cy = this.pos[1] + this.height / 2;
    const near = (c: V3) => Math.hypot(c[0] - this.pos[0], c[1] - cy, c[2] - this.pos[2]) < 1.2;
    L.coins.forEach((c, i) => {
      if (!this.coinTaken[i] && near(c)) {
        this.coinTaken[i] = true;
        ev.push({ type: 'coin', index: i });
      }
    });
    L.keys?.forEach((k, i) => {
      if (!this.keyTaken[i] && near(k.at)) {
        this.keyTaken[i] = true;
        this.keys.add(k.id);
        ev.push({ type: 'key', id: k.id });
      }
    });
    return ev;
  }

  // ---- collision helpers ----

  /** Does the player's box (grown by `grow`) overlap block i? */
  private overlaps(i: number, grow = 0, pos: V3 = this.pos, height = this.height) {
    const b = this.level.blocks[i];
    const c = this.at[i];
    return (
      Math.abs(pos[0] - c[0]) < HALF_W + b.w / 2 + grow &&
      Math.abs(pos[2] - c[2]) < HALF_W + b.d / 2 + grow &&
      pos[1] - grow < c[1] + b.h / 2 &&
      pos[1] + height + grow > c[1] - b.h / 2
    );
  }

  /** Does block i block the camera's view? (Solid walls, but not see-through grates.) */
  blocksView(i: number) {
    return this.solidAt(i) && !this.level.blocks[i].see;
  }

  private solidAt(i: number) {
    return isSolid(this.level.blocks[i]) && this.present(i) && !this.opened.has(i);
  }

  private touching(test: (b: Block) => boolean, grow: number) {
    return this.level.blocks.some((b, i) => test(b) && this.solidAt(i) && this.overlaps(i, grow));
  }

  private triggersHere() {
    const out: number[] = [];
    this.level.blocks.forEach((b, i) => {
      if ((b.kind === 'portal' || b.kind === 'shop' || b.kind === 'zone') && this.overlaps(i)) out.push(i);
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
        this.pos[1] = c[1] - b.h / 2 - this.height;
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
      if (canStep && top - this.pos[1] <= STEP_UP && B[i].kind !== 'lava') {
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
        [1, c[1] + b.h / 2 - this.pos[1]], // up onto it
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
