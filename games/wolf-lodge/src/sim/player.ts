// Walking around the lodge, stepped at 120 Hz. Moves like a person rather than a game character: it speeds
// up and slows down over a few steps, turns to face where it's going before it gets going, walks or runs
// depending on how far the stick is pushed, slows down in water, and steps up stairs and kerbs.
import { ADV, ceilingAt, groundAt, pushOut, WATER_Y, type Box } from './world';

export const STEP = 1 / 120;
export const GRAVITY = 9.81;
export const RADIUS = 0.24;
export const HEIGHT = 1.4;
export const STEP_UP = 0.42;
/** Climbing out of a pool, the edge counts as a (big) step. */
const STEP_UP_WATER = 1.15;
export const WALK = 1.45;
export const RUN = 3.7;
const ACCEL = 5.5;
const DECEL = 8;
const TURN = 9;
const JUMP = 3.7;

export interface Input {
  /** Stick: x right, y forward, -1..1, relative to the camera. */
  x: number;
  y: number;
  camYaw: number;
  jump: boolean;
  /** Keyboard shift: walk instead of run. */
  walk?: boolean;
}

export type PlayerEvent = 'jump' | 'land' | 'splash' | 'bounce' | 'harness' | 'step';

export class Player {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  /** Facing: the direction (sin yaw, cos yaw) in x/z. */
  yaw = 0;
  onGround = true;
  /** Water depth at the feet (0 when dry). */
  wet = 0;
  /** Walk cycle: goes up by 2π each full stride (two steps). */
  phase = 0;
  /** How much the body leans into a turn (radians, for the model). */
  lean = 0;
  /** Seconds left hanging in the ropes-course harness. */
  harness = 0;
  events: PlayerEvent[] = [];
  private lastPlat: Box | null = null;
  private onCourse = false;
  private jumpWas = false;

  place(x: number, y: number, z: number, yaw: number) {
    Object.assign(this, { x, y, z, yaw, vx: 0, vy: 0, vz: 0, onGround: true, harness: 0 });
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  step(inp: Input) {
    if (this.harness > 0) {
      // Hanging in the harness: swing a little, then get pulled back up to the platform.
      this.harness -= STEP;
      if (this.harness <= 0 && this.lastPlat) {
        const p = this.lastPlat;
        this.place((p.x0 + p.x1) / 2, p.y1, (p.z0 + p.z1) / 2, this.yaw);
      }
      return;
    }

    // Where the stick wants to go, in the world.
    const fx = Math.sin(inp.camYaw), fz = Math.cos(inp.camYaw);
    let mx = inp.y * fx - inp.x * fz;
    let mz = inp.y * fz + inp.x * fx;
    let mag = Math.hypot(mx, mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
      mag = 1;
    }
    // A gentle push walks; a full push runs.
    let want = mag < 0.08 ? 0 : mag < 0.7 ? (mag / 0.7) * WALK : WALK + ((mag - 0.7) / 0.3) * (RUN - WALK);
    if (inp.walk) want = Math.min(want, WALK);
    if (this.wet > 0.25) want *= Math.max(0.35, 1 - this.wet * 0.7);
    if (!this.onGround) want = Math.max(want, this.speed); // keep going in the air

    // Turn to face the way you're going (people turn first, then go).
    let align = 1;
    if (want > 0) {
      const target = Math.atan2(mx, mz);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const turn = Math.sign(d) * Math.min(Math.abs(d), TURN * STEP * (this.onGround ? 1 : 0.3));
      this.yaw += turn;
      this.lean += ((turn / STEP) * Math.min(1, this.speed / RUN) * 0.06 - this.lean) * 0.1;
      align = Math.max(0.15, Math.cos(d));
    } else this.lean *= 0.9;

    // Speed up or slow down along the facing direction.
    const sp = this.speed;
    const tgt = want * align;
    const control = this.onGround ? 1 : 0.15;
    const ns = sp < tgt ? Math.min(tgt, sp + ACCEL * STEP * control) : Math.max(tgt, sp - DECEL * STEP * control);
    if (this.onGround) {
      this.vx = Math.sin(this.yaw) * ns;
      this.vz = Math.cos(this.yaw) * ns;
    } else if (sp > 1e-4) {
      this.vx *= ns / sp;
      this.vz *= ns / sp;
    }

    // Jumping (on a bed, much higher).
    const jumpPressed = inp.jump && !this.jumpWas;
    this.jumpWas = inp.jump;
    const here = groundAt(this.x, this.z, this.y + 0.01, 0.02);
    if (jumpPressed && this.onGround && this.wet < 0.6) {
      this.vy = here.box?.bounce ? JUMP * 1.6 : JUMP;
      this.onGround = false;
      this.events.push(here.box?.bounce ? 'bounce' : 'jump');
    }

    // Move, then stay out of the walls.
    const stepUp = this.wet > 0.2 ? STEP_UP_WATER : STEP_UP;
    this.x += this.vx * STEP;
    this.z += this.vz * STEP;
    const push = pushOut(this.x, this.z, RADIUS, this.y, HEIGHT, stepUp);
    this.x += push.px;
    this.z += push.pz;
    if (push.px || push.pz) {
      // Lose the speed going into the wall.
      const pl = Math.hypot(push.px, push.pz), nx = push.px / pl, nz = push.pz / pl;
      const into = this.vx * nx + this.vz * nz;
      if (into < 0) {
        this.vx -= into * nx;
        this.vz -= into * nz;
      }
    }

    // Up and down: gravity, landing, stepping up and down stairs.
    const g = groundAt(this.x, this.z, this.y, stepUp);
    const ceil = ceilingAt(this.x, this.z, this.y + 0.5);
    if (this.onGround) {
      if (g.h > this.y - 0.32) this.y = g.h; // steps up and gentle steps down
      else this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= GRAVITY * STEP;
      if (this.wet > 0.3) this.vy *= 0.97; // water slows a fall
      this.y += this.vy * STEP;
      if (this.y + HEIGHT > ceil && this.vy > 0) {
        this.y = ceil - HEIGHT;
        this.vy = 0;
      }
      if (this.y <= g.h) {
        const hit = this.vy;
        this.y = g.h;
        if (g.box?.bounce && hit < -2) {
          this.vy = Math.min(7, -hit * 0.8);
          this.events.push('bounce');
        } else {
          this.vy = 0;
          this.onGround = true;
          if (hit < -2) this.events.push(this.y < WATER_Y ? 'splash' : 'land');
        }
      }
    }
    const wetBefore = this.wet;
    this.wet = Math.max(0, WATER_Y - this.y);
    if (wetBefore === 0 && this.wet > 0.3) this.events.push('splash');

    // The ropes course: remember the last platform; a fall is caught by the harness.
    if (this.onGround && g.box) {
      if (g.box.plat) this.lastPlat = g.box;
      if (g.box.y1 > 3) this.onCourse = true;
    }
    if (this.onGround && this.y < 0.5) this.onCourse = false;
    if (this.onCourse && !this.onGround && this.lastPlat && this.y < this.lastPlat.y1 - 1.3 && this.inAdv()) {
      this.harness = 1.4;
      this.vx = this.vz = this.vy = 0;
      this.events.push('harness');
    }

    // The walk cycle: one stride is longer the faster you go.
    const s = this.speed;
    if (this.onGround && s > 0.05) {
      const stride = 0.75 + s * 0.42; // metres per two steps
      const before = this.phase;
      this.phase += ((s * STEP) / stride) * Math.PI * 2;
      if (Math.floor(before / Math.PI) !== Math.floor(this.phase / Math.PI)) this.events.push('step');
    } else if (s <= 0.05) {
      // Settle the feet together.
      const target = Math.round(this.phase / Math.PI) * Math.PI;
      this.phase += (target - this.phase) * 0.08;
    }
  }

  private inAdv() {
    return this.x > ADV.x0 && this.x < ADV.x1 && this.z > ADV.z0 && this.z < ADV.z1;
  }
}
