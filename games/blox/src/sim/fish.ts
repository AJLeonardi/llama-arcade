// Fish Tank to the Ocean: you're a fish in a bowl that rolls. Big falls (or goo, or hot pipes) crack the
// bowl and send you back to the last checkpoint. You can flop out of the bowl on purpose: a fish jumps
// higher and fits through small gaps, but only has 50 seconds of air until it lands in something full of
// water (a bottle, a bucket, a spare bowl), which becomes its new ride.
// Pure maths, no three.js: tested in tests/fish.test.ts. The levels are in fishLevels.ts.
import { blockOffset, STEP } from './physics';
import type { Block, Level, V3 } from './types';

export const GRAVITY = 30;
export const AIR = 50; // seconds of air out of the water
export const FLOP_R = 0.3; // the fish on its own, as a ball
export const FLOP_SPEED = 4;
export const FLOP_JUMP = 13; // ~2.8 high
const HOP = 5; // the little flops a fish does all the time on the ground
export const BOUNCE_V = 20; // trampolines (bubble stones): ~6.7 high
const COYOTE = 0.12;
const JUMP_BUFFER = 0.15;
const FAST_TIME = 2.5;
const GROUND_NY = 0.55; // a contact this flat counts as standing on it
export const WALL_BOUNCE = 0.6; // how much speed you keep bouncing off a wall

export type Vessel = 'bowl' | 'bottle' | 'bucket';

export interface VesselDef {
  name: string;
  emoji: string;
  /** Radius of the ball it rolls as. */
  r: number;
  /** Top rolling speed, and how hard you can push. */
  speed: number;
  accel: number;
  jump: number;
  /** Landing faster than this cracks it (fall height ≈ crack² / 60). */
  crack: number;
}

export const VESSELS: Record<Vessel, VesselDef> = {
  bowl: { name: 'fish bowl', emoji: '🫧', r: 0.7, speed: 9, accel: 16, jump: 10, crack: 18 },
  bottle: { name: 'water bottle', emoji: '🍼', r: 0.5, speed: 13, accel: 12, jump: 10, crack: 18 },
  bucket: { name: 'bucket', emoji: '🪣', r: 0.8, speed: 7.5, accel: 18, jump: 9, crack: 24 },
};

export interface FishDef {
  id: string;
  name: string;
  emoji: string;
  body: string;
  stripe: string;
  fin: string;
}

export const FISHES: FishDef[] = [
  { id: 'clown', name: 'Clownfish', emoji: '🐠', body: '#ff7b1c', stripe: '#ffffff', fin: '#212529' },
  { id: 'gold', name: 'Goldfish', emoji: '🐟', body: '#ffb000', stripe: '#ffd43b', fin: '#ff8c00' },
  { id: 'bass', name: 'Bass', emoji: '🎣', body: '#6b8e23', stripe: '#2b3a12', fin: '#f1f3c5' },
  { id: 'tang', name: 'Blue Tang', emoji: '💙', body: '#1c6dd0', stripe: '#0b1f4a', fin: '#ffd43b' },
  { id: 'puffer', name: 'Pufferfish', emoji: '🐡', body: '#f2d16b', stripe: '#8a6d2b', fin: '#fff3bf' },
  { id: 'shark', name: 'Baby Shark', emoji: '🦈', body: '#8ca3b8', stripe: '#ffffff', fin: '#5c7085' },
];

/** A slope. Its top goes from height y0 at the low-x (or low-z) end to y1 at the other end. */
export interface Ramp {
  x: number;
  z: number;
  w: number;
  d: number;
  along: 'x' | 'z';
  y0: number;
  y1: number;
  color: string;
}

/** Something full of water a flopping fish can jump into. `at` is where it stands. */
export interface Water {
  at: V3;
  vessel: Vessel;
}

export interface RouteStep {
  /** Where the bottom of the ball should get to. */
  to: V3;
  /** Jump when you get here. */
  jump?: boolean;
  /** Flop out of the bowl here. */
  flop?: boolean;
  /** How fast to go towards it (default 5). */
  v?: number;
  /** Level 1: where the robot carries on after being bought (or after running out of time). */
  house?: boolean;
}

export interface FishLevel {
  /** The blocks, coins, signs and sky. `level.spawn` is just where the (hidden) walker waits. */
  level: Level;
  /** Where the bowl starts (its bottom). */
  start: V3;
  ramps: Ramp[];
  waters: Water[];
  /** Level 1: roll into the shopping bag (zone 'buy') and you're taken home, where the clock starts. */
  house?: { start: V3; time: number };
  /** Said at the start, and when you finish. */
  tip: string;
  done: string;
  /** For the robot test. */
  route: RouteStep[];
}

export interface Input {
  moveX: number;
  moveZ: number;
  jump: boolean;
}

export type FishEvent =
  | { type: 'jump' }
  | { type: 'hop' }
  | { type: 'bonk'; speed: number } // bounced off a wall
  | { type: 'land'; hard: boolean }
  | { type: 'bounce' }
  | { type: 'speed' }
  | { type: 'coin'; index: number }
  | { type: 'checkpoint' }
  | { type: 'crack' } // the bowl broke: back to the checkpoint
  | { type: 'oops' } // the fish fell somewhere bad: back to the checkpoint
  | { type: 'noair' } // out of air: back to the checkpoint
  | { type: 'flop' }
  | { type: 'splash'; vessel: Vessel }
  | { type: 'bought' }
  | { type: 'late' }
  | { type: 'exit' };

const TRIGGERS = new Set(['portal', 'shop', 'crawl', 'spot', 'zone']);
const isSolid = (b: Block) => !b.deco && !TRIGGERS.has(b.kind);
/** Zones that crack your bowl: goo in the sewer, hot pipes, and the street far below the rooftops. */
export const HAZARD_TAGS = new Set(['goo', 'hot', 'drop']);

/** Height of a ramp's top at (x, z), or null if (x, z) isn't over it (within `grow`). */
export function rampTop(r: Ramp, x: number, z: number, grow = 0) {
  const [a, across, len, wid, c0, cAcross] = r.along === 'z' ? [z, x, r.d, r.w, r.z, r.x] : [x, z, r.w, r.d, r.x, r.z];
  if (Math.abs(across - cAcross) > wid / 2 + grow) return null;
  const u = (a - (c0 - len / 2)) / len;
  if (u < 0 || u > 1) return null;
  return r.y0 + (r.y1 - r.y0) * u;
}

export class FishSim {
  readonly f: FishLevel;
  t = 0;
  /** Centre of the ball. */
  pos: V3;
  vel: V3 = [0, 0, 0];
  /** What you're rolling in, or null while flopping. */
  vessel: Vessel | null = 'bowl';
  air = AIR;
  /** Which way the fish faces. */
  yaw = 0;
  onGround = false;
  /** Block index we're on (-1 none, -2 a ramp). */
  ground = -1;
  checkpoint: { at: V3; vessel: Vessel };
  fastTime = 0;
  finished = false;
  /** Level 1: still in the pet store? Then the clock in the house. */
  inStore: boolean;
  timeLeft: number | null = null;
  /** Bowls you flopped out of (just for looks); water objects you've used. */
  left: { at: V3; vessel: Vessel }[] = [];
  readonly waterUsed: boolean[];
  readonly coinTaken: boolean[];
  readonly at: V3[];
  /** Times the bowl cracked (for fun facts on the finish card). */
  cracks = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private hopT = 0;
  /** The hardest wall hit this step. */
  private bonk = 0;
  private touchedCheckpoint = -1;
  private inZone = new Set<string>();

  constructor(f: FishLevel) {
    this.f = f;
    this.at = f.level.blocks.map((b) => [b.x, b.y, b.z]);
    this.coinTaken = f.level.coins.map(() => false);
    this.waterUsed = f.waters.map(() => false);
    this.inStore = !!f.house;
    this.checkpoint = { at: [...f.start], vessel: 'bowl' };
    this.pos = [f.start[0], f.start[1] + this.r, f.start[2]];
    this.yaw = f.level.spawnYaw;
  }

  get r() {
    return this.vessel ? VESSELS[this.vessel].r : FLOP_R;
  }

  /** Bottom of the ball. */
  get feet(): V3 {
    return [this.pos[0], this.pos[1] - this.r, this.pos[2]];
  }

  /** Back to the last checkpoint, in the bowl (or whatever you had there), with full air. */
  respawn() {
    this.vessel = this.checkpoint.vessel;
    const c = this.checkpoint.at;
    this.pos = [c[0], c[1] + this.r + 0.02, c[2]];
    this.vel = [0, 0, 0];
    this.air = AIR;
    this.fastTime = 0;
    this.onGround = false;
    this.ground = -1;
    this.left = [];
    this.waterUsed.fill(false);
  }

  /** Jump out of the bowl (a skill move: you only have 50 s of air). */
  flopOut(): FishEvent[] {
    if (!this.vessel || this.finished) return [];
    const r = this.r;
    this.left.push({ at: this.feet, vessel: this.vessel });
    this.vessel = null;
    this.pos[1] += FLOP_R - r + 0.4;
    this.vel[1] = 7;
    this.air = AIR;
    this.onGround = false;
    return [{ type: 'flop' }];
  }

  /** One physics step. `t` is the level clock (the moving blocks are wherever they are at time t). */
  step(input: Input, dt = STEP, t = this.t + dt): FishEvent[] {
    const ev: FishEvent[] = [];
    const L = this.f.level;
    this.t = t;

    // Moving blocks, carrying you if you're on one.
    for (let i = 0; i < L.blocks.length; i++) {
      const b = L.blocks[i];
      if (!b.move) continue;
      const o = blockOffset(b, t);
      const n: V3 = [b.x + o[0], b.y + o[1], b.z + o[2]];
      if (this.onGround && this.ground === i) for (let k = 0; k < 3; k++) this.pos[k] += n[k] - this.at[i][k];
      this.at[i] = n;
    }

    // Pushing: a ball rolls on (you can't stop dead); a fish flops along slowly.
    const len = Math.hypot(input.moveX, input.moveZ);
    const mx = len > 1 ? input.moveX / len : input.moveX;
    const mz = len > 1 ? input.moveZ / len : input.moveZ;
    const v = this.vessel ? VESSELS[this.vessel] : null;
    this.fastTime = Math.max(0, this.fastTime - dt);
    if (v) {
      const cap = this.fastTime > 0 ? v.speed * 1.6 : v.speed;
      const accel = v.accel * (this.onGround ? 1 : 0.45) * (this.fastTime > 0 ? 1.6 : 1);
      const before = Math.hypot(this.vel[0], this.vel[2]);
      this.vel[0] += mx * accel * dt;
      this.vel[2] += mz * accel * dt;
      // In the air you can steer, but not speed up past your top speed.
      const after = Math.hypot(this.vel[0], this.vel[2]);
      if (!this.onGround && after > Math.max(before, cap)) {
        this.vel[0] *= Math.max(before, cap) / after;
        this.vel[2] *= Math.max(before, cap) / after;
      }
      // Rolling drag: sets the top speed while pushing, and slows you down when you let go.
      const drag = this.onGround ? (len > 0.1 ? (v.accel / v.speed) * Math.min(1, len + 0.3) : 2) : 0.15;
      const k = Math.exp(-drag * dt);
      this.vel[0] *= k;
      this.vel[2] *= k;
      const s = Math.hypot(this.vel[0], this.vel[2]);
      if (s > cap * 1.4) {
        this.vel[0] *= (cap * 1.4) / s;
        this.vel[2] *= (cap * 1.4) / s;
      }
    } else {
      const k = Math.min(1, (this.onGround ? 10 : 4) * dt);
      this.vel[0] += (mx * FLOP_SPEED - this.vel[0]) * k;
      this.vel[2] += (mz * FLOP_SPEED - this.vel[2]) * k;
      this.hopT -= dt;
      if (this.onGround && len > 0.1 && this.hopT <= 0) {
        this.vel[1] = HOP;
        this.hopT = 0.35;
        this.onGround = false;
        ev.push({ type: 'hop' });
      }
    }
    if (Math.hypot(this.vel[0], this.vel[2]) > 0.6) {
      const want = Math.atan2(this.vel[0], this.vel[2]);
      const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
      this.yaw += d * Math.min(1, 10 * dt);
    }

    // Jumping (a bit of forgiveness either side of an edge).
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.jump ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel[1] = v ? v.jump : FLOP_JUMP;
      this.jumpBuffer = this.coyote = 0;
      this.onGround = false;
      this.ground = -1;
      ev.push({ type: 'jump' });
    }
    this.vel[1] = Math.max(-40, this.vel[1] - GRAVITY * dt);

    // Water currents (conveyors) carry you along.
    let cx = 0, cz = 0;
    if (this.onGround && this.ground >= 0) [cx, cz] = L.blocks[this.ground].push ?? [0, 0];

    // Move in small steps so a fast ball can't go through a thin block.
    const wasGround = this.onGround;
    this.onGround = false;
    this.ground = -1;
    let impact = 0;
    let hazard = false;
    this.bonk = 0;
    const dist = Math.hypot(this.vel[0] + cx, this.vel[1], this.vel[2] + cz) * dt;
    const n = Math.max(1, Math.ceil(dist / (this.r * 0.5)));
    for (let s = 0; s < n; s++) {
      this.pos[0] += ((this.vel[0] + cx) * dt) / n;
      this.pos[1] += (this.vel[1] * dt) / n;
      this.pos[2] += ((this.vel[2] + cz) * dt) / n;
      impact = Math.max(impact, this.collide());
    }
    if (this.bonk > 3) ev.push({ type: 'bonk', speed: this.bonk });

    // Landing: too hard cracks the bowl (trampolines are soft).
    const gb = this.ground >= 0 ? L.blocks[this.ground] : null;
    if (this.onGround && !wasGround) {
      const hard = !!v && impact > v.crack && gb?.kind !== 'bounce';
      ev.push({ type: 'land', hard });
      if (hard) hazard = true;
    }
    if (gb && this.onGround) {
      const g = this.ground;
      if (gb.kind === 'bounce') {
        this.vel[1] = BOUNCE_V;
        this.onGround = false;
        ev.push({ type: 'bounce' });
      } else if (gb.kind === 'speed') {
        if (this.fastTime < FAST_TIME - 0.3) ev.push({ type: 'speed' });
        this.fastTime = FAST_TIME;
      } else if (gb.kind === 'checkpoint' && this.touchedCheckpoint !== g) {
        this.touchedCheckpoint = g;
        this.checkpoint = { at: [this.at[g][0], this.at[g][1] + gb.h / 2, this.at[g][2]], vessel: this.vessel ?? 'bowl' };
        ev.push({ type: 'checkpoint' });
      }
    }

    // Zones: goo and hot pipes crack you; the bag takes you home; the way out finishes the level.
    const here = new Set<string>();
    L.blocks.forEach((b, i) => {
      if (b.kind !== 'zone' || !b.tag) return;
      // Hazards only count if you're really in them; the way out and the bag are easy to hit.
      const c = this.at[i], g = this.r * (HAZARD_TAGS.has(b.tag) ? 0.2 : 0.6);
      if (Math.abs(this.pos[0] - c[0]) < b.w / 2 + g && Math.abs(this.pos[2] - c[2]) < b.d / 2 + g &&
        Math.abs(this.pos[1] - c[1]) < b.h / 2 + g) here.add(b.tag);
    });
    for (const tag of here) if (HAZARD_TAGS.has(tag)) hazard = true;

    if (this.pos[1] < L.fallY || hazard) {
      ev.push({ type: this.vessel ? 'crack' : 'oops' });
      if (this.vessel) this.cracks++;
      this.respawn();
      return ev;
    }
    if (here.has('exit') && !this.inZone.has('exit') && !this.finished) {
      this.finished = true;
      this.timeLeft = null;
      ev.push({ type: 'exit' });
    }
    if (here.has('buy') && this.inStore && this.f.house) {
      this.inStore = false;
      this.toHouse();
      ev.push({ type: 'bought' });
    }
    this.inZone = here;

    // Level 1's clock.
    if (this.timeLeft !== null && !this.finished) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.toHouse();
        ev.push({ type: 'late' });
      }
    }

    // Out of the water: breathe, or get into something full of water.
    if (!this.vessel) {
      this.air -= dt;
      if (this.air <= 0) {
        ev.push({ type: 'noair' });
        this.respawn();
        return ev;
      }
      this.f.waters.forEach((w, i) => {
        if (this.waterUsed[i] || this.vessel) return;
        const wr = VESSELS[w.vessel].r;
        if (Math.hypot(this.pos[0] - w.at[0], this.pos[1] - (w.at[1] + wr), this.pos[2] - w.at[2]) < wr + 0.6) {
          this.waterUsed[i] = true;
          this.vessel = w.vessel;
          this.pos = [w.at[0], w.at[1] + wr + 0.02, w.at[2]];
          this.vel = [0, 0, 0];
          this.air = AIR;
          ev.push({ type: 'splash', vessel: w.vessel });
        }
      });
    }

    // Coins.
    L.coins.forEach((c, i) => {
      if (!this.coinTaken[i] && Math.hypot(c[0] - this.pos[0], c[1] - this.pos[1], c[2] - this.pos[2]) < 1 + this.r * 0.5) {
        this.coinTaken[i] = true;
        ev.push({ type: 'coin', index: i });
      }
    });
    return ev;
  }

  /** Level 1: start (again) in the house, with the clock reset. */
  private toHouse() {
    const h = this.f.house!;
    this.checkpoint = { at: [...h.start], vessel: 'bowl' };
    this.touchedCheckpoint = -1;
    this.respawn();
    this.yaw = 0;
    this.timeLeft = h.time;
  }

  /** Push the ball out of every block and ramp it's in. Returns the hardest landing. */
  private collide() {
    const B = this.f.level.blocks;
    const r = this.r;
    let impact = 0;
    const p = this.pos;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (!isSolid(b)) continue;
        const c = this.at[i];
        const hx = b.w / 2, hy = b.h / 2, hz = b.d / 2;
        // Quick reject.
        if (Math.abs(p[0] - c[0]) > hx + r || Math.abs(p[1] - c[1]) > hy + r || Math.abs(p[2] - c[2]) > hz + r) continue;
        const qx = Math.max(c[0] - hx, Math.min(c[0] + hx, p[0]));
        const qy = Math.max(c[1] - hy, Math.min(c[1] + hy, p[1]));
        const qz = Math.max(c[2] - hz, Math.min(c[2] + hz, p[2]));
        let dx = p[0] - qx, dy = p[1] - qy, dz = p[2] - qz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2), depth: number;
        if (d < 1e-6) {
          // The centre got inside: out over the top.
          dx = 0; dy = 1; dz = 0; d = 1;
          depth = c[1] + hy - p[1] + r;
        } else depth = r - d;
        const nx = dx / d, ny = dy / d, nz = dz / d;
        impact = Math.max(impact, this.contact(nx, ny, nz, depth, i));
      }
      for (const rp of this.f.ramps) {
        const top = rampTop(rp, p[0], p[2]);
        if (top === null) continue;
        const slope = (rp.y1 - rp.y0) / (rp.along === 'z' ? rp.d : rp.w);
        const k = 1 / Math.sqrt(1 + slope * slope);
        const s = (p[1] - top) * k; // distance from the slope, along its normal
        if (s >= r || s < -r) continue;
        const nx = rp.along === 'x' ? -slope * k : 0, nz = rp.along === 'z' ? -slope * k : 0;
        impact = Math.max(impact, this.contact(nx, k, nz, r - s, -2));
      }
    }
    return impact;
  }

  /** Resolve one contact: push out along the normal, stop moving into it. Returns the landing speed. */
  private contact(nx: number, ny: number, nz: number, depth: number, index: number) {
    const p = this.pos, v = this.vel;
    p[0] += nx * depth;
    p[1] += ny * depth;
    p[2] += nz * depth;
    const vn = v[0] * nx + v[1] * ny + v[2] * nz;
    let impact = 0;
    if (vn < 0) {
      // Walls are bouncy (a glass bowl going boing!); floors only a little, so you don't bounce about.
      const wall = ny <= GROUND_NY;
      const bounce = wall ? (-vn > 1.5 ? WALL_BOUNCE : 0) : -vn > 6 ? 0.15 : 0;
      if (wall) this.bonk = Math.max(this.bonk, -vn);
      v[0] -= nx * vn * (1 + bounce);
      v[1] -= ny * vn * (1 + bounce);
      v[2] -= nz * vn * (1 + bounce);
      if (ny > GROUND_NY) impact = -vn;
    }
    if (ny > GROUND_NY) {
      this.onGround = true;
      if (this.ground === -1 || index >= 0) this.ground = index;
    }
    return impact;
  }
}
