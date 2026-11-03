// You, on foot: walk or run where the stick points (relative to the camera), jump, swim in the pool.
import { groundUnder, inPool, pushOut } from './world';

export const WALK_SPEED = 2.2;
export const RUN_SPEED = 6;
export const RADIUS = 0.35;
const GRAVITY = 20;
const JUMP_V = 6.2;

export class Walker {
  x: number;
  z: number;
  /** Feet height above the ground (jumping, or standing on a bed or table). */
  y = 0;
  /** The height of what you're standing on (0 is the ground). */
  ground = 0;
  vy = 0;
  heading: number;
  /** How fast we're actually moving (m/s), for the walk animation. */
  speed = 0;
  swimming = false;

  constructor(x: number, z: number, heading: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
  }

  placeAt(x: number, z: number, heading: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.y = this.vy = this.speed = this.ground = 0;
  }

  /**
   * `mx`, `my`: the stick (x right, y forward) turned into world directions by the camera: `camYaw` is the way
   * the camera looks (a heading). A push past 0.75 runs.
   */
  step(mx: number, my: number, camYaw: number, jump: boolean, dt: number) {
    const mag = Math.min(1, Math.hypot(mx, my));
    this.swimming = inPool(this.x, this.z);
    let want = 0;
    if (mag > 0.12) {
      // Forward is the camera's heading; right is 90° clockwise from it (heading minus PI/2).
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
      const dx = fx * my + rx * mx, dz = fz * my + rz * mx;
      const target = Math.atan2(dx, dz);
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 12);
      want = mag > 0.75 ? RUN_SPEED : WALK_SPEED + ((RUN_SPEED - WALK_SPEED) * (mag - 0.12)) / 0.63 * 0.5;
      if (this.swimming) want *= 0.45;
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 10);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    // Jumping (not while swimming). You land on top of things (a bed, a table), and walking off the edge
    // drops you down, so you never end up inside furniture (which used to push you out through a wall).
    this.ground = groundUnder(this.x, this.z, this.y);
    if (jump && this.y === this.ground && !this.swimming) this.vy = JUMP_V;
    if (this.y > this.ground || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y = Math.max(this.ground, this.y + this.vy * dt);
      if (this.y === this.ground) this.vy = 0;
    }
    pushOut(this, RADIUS, false, this.y);
  }
}
