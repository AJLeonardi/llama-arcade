// Cars: what each kind is like (size, speed, shape) and how one drives. Plain numbers, no three.js.
import { pushOut } from './world';

/** A side view of the body as [along, up] points (metres, nose at +along), plus the glass on top. */
export interface CarType {
  name: string;
  color: string;
  length: number;
  width: number;
  /** The painted body's outline seen from the side (closed; along = -length/2 .. length/2). */
  body: [number, number][];
  /** The cabin (windows and roof) outline seen from the side. */
  cabin: [number, number][];
  cabinWidth: number;
  /** Wheel positions along the car, wheel radius, tyre width. */
  wheels: number[];
  wheelR: number;
  tyreW: number;
  /** Where the driver sits: along, up, and to the left. */
  seat: [number, number, number];
  top: number; // top speed, m/s
  accel: number; // m/s²
  /** Wheelbase, for how tight it turns. */
  wheelbase: number;
  /** Extra bits: a pickup bed, a spoiler, a long limo middle. */
  extra?: 'bed' | 'spoiler' | 'monster';
}

export const CAR_TYPES: CarType[] = [
  {
    name: 'Family Car',
    color: '#2e6fb5',
    length: 4.6, width: 1.82,
    body: [[-2.3, 0.32], [2.3, 0.32], [2.32, 0.62], [2.18, 0.8], [1.0, 0.92], [-1.4, 0.95], [-2.2, 0.92], [-2.33, 0.7]],
    cabin: [[0.95, 0.9], [0.1, 1.42], [-1.0, 1.44], [-1.6, 0.94]],
    cabinWidth: 1.6,
    wheels: [-1.4, 1.4], wheelR: 0.33, tyreW: 0.22,
    seat: [-0.2, 0.42, 0.38],
    top: 30, accel: 6, wheelbase: 2.8,
  },
  {
    name: 'Big SUV',
    color: '#f2f2f0',
    length: 4.9, width: 1.95,
    body: [[-2.45, 0.42], [2.45, 0.42], [2.47, 0.78], [2.3, 1.02], [1.3, 1.1], [-2.3, 1.12], [-2.47, 0.95]],
    cabin: [[1.25, 1.08], [0.45, 1.75], [-2.25, 1.78], [-2.35, 1.1]],
    cabinWidth: 1.78,
    wheels: [-1.5, 1.5], wheelR: 0.39, tyreW: 0.26,
    seat: [-0.1, 0.62, 0.42],
    top: 31, accel: 6.5, wheelbase: 2.9,
  },
  {
    name: 'Pickup Truck',
    color: '#b8261f',
    length: 5.4, width: 2.0,
    body: [[-2.7, 0.48], [2.7, 0.48], [2.72, 0.86], [2.55, 1.1], [1.5, 1.16], [-2.7, 1.16]],
    cabin: [[1.45, 1.14], [0.75, 1.85], [-0.6, 1.88], [-0.7, 1.14]],
    cabinWidth: 1.82,
    wheels: [-1.75, 1.75], wheelR: 0.42, tyreW: 0.28,
    seat: [0.25, 0.66, 0.42],
    top: 32, accel: 7, wheelbase: 3.4,
    extra: 'bed',
  },
  {
    name: 'Sports Car',
    color: '#f2c40c',
    length: 4.5, width: 1.9,
    body: [[-2.25, 0.25], [2.25, 0.25], [2.3, 0.45], [2.1, 0.62], [0.7, 0.8], [-1.6, 0.85], [-2.25, 0.82], [-2.3, 0.55]],
    cabin: [[0.65, 0.78], [-0.3, 1.18], [-1.1, 1.18], [-1.75, 0.84]],
    cabinWidth: 1.5,
    wheels: [-1.38, 1.35], wheelR: 0.33, tyreW: 0.27,
    seat: [-0.5, 0.3, 0.38],
    top: 46, accel: 11, wheelbase: 2.7,
    extra: 'spoiler',
  },
  {
    name: 'Limo',
    color: '#111316',
    length: 7.6, width: 1.95,
    body: [[-3.8, 0.34], [3.8, 0.34], [3.82, 0.66], [3.65, 0.86], [2.5, 0.96], [-3.0, 0.98], [-3.72, 0.95], [-3.83, 0.72]],
    cabin: [[2.45, 0.94], [1.6, 1.46], [-2.6, 1.48], [-3.15, 0.97]],
    cabinWidth: 1.66,
    wheels: [-2.7, 2.6], wheelR: 0.35, tyreW: 0.24,
    seat: [1.25, 0.44, 0.4],
    top: 30, accel: 5.5, wheelbase: 5.3,
  },
  {
    name: 'Supercar',
    color: '#ff6a00',
    length: 4.6, width: 2.0,
    body: [[-2.3, 0.22], [2.3, 0.22], [2.4, 0.35], [2.0, 0.55], [0.6, 0.72], [-1.8, 0.82], [-2.3, 0.78], [-2.35, 0.45]],
    cabin: [[0.6, 0.7], [-0.35, 1.08], [-1.2, 1.1], [-2.0, 0.8]],
    cabinWidth: 1.42,
    wheels: [-1.45, 1.4], wheelR: 0.34, tyreW: 0.3,
    seat: [-0.55, 0.25, 0.38],
    top: 58, accel: 15, wheelbase: 2.75,
    extra: 'spoiler',
  },
  {
    name: 'Monster Truck',
    color: '#2aa34a',
    length: 5.2, width: 2.6,
    body: [[-2.4, 1.25], [2.4, 1.25], [2.45, 1.65], [2.25, 1.9], [1.2, 1.95], [-2.4, 1.95]],
    cabin: [[1.15, 1.93], [0.45, 2.6], [-1.2, 2.62], [-1.35, 1.93]],
    cabinWidth: 2.0,
    wheels: [-1.7, 1.7], wheelR: 0.85, tyreW: 0.6,
    seat: [-0.1, 1.4, 0.45],
    top: 34, accel: 9, wheelbase: 3.4,
    extra: 'monster',
  },
];

/** The things you earn at work, in order: a new car each time, then trophies. */
export const REWARD_CARS = [1, 2, 3, 4, 5, 6];

export interface CarInput {
  steer: number; // -1 left .. 1 right
  throttle: number; // -1 brake/reverse .. 1 gas
}

export class Car {
  x: number;
  z: number;
  heading: number;
  speed = 0;
  /** Front wheels' angle (radians, + = right). */
  steer = 0;
  /** Wheel spin, for drawing. */
  spin = 0;
  /** Set when it hit something this step: how hard (m/s). */
  bumped = 0;

  constructor(
    public type: number,
    x: number,
    z: number,
    heading: number,
  ) {
    this.x = x;
    this.z = z;
    this.heading = heading;
  }

  get spec() {
    return CAR_TYPES[this.type];
  }

  /** Two circles covering the car (front and back half), for bumping into things. */
  circles(): { x: number; z: number; r: number; along: number }[] {
    const s = this.spec, r = s.width / 2 + 0.05;
    const off = Math.max(0, s.length / 2 - r);
    const n = Math.max(2, Math.ceil((2 * off) / r) + 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      const along = -off + (2 * off * i) / (n - 1);
      out.push({ x: this.x + Math.sin(this.heading) * along, z: this.z + Math.cos(this.heading) * along, r, along });
    }
    return out;
  }

  step(inp: CarInput, dt: number) {
    const s = this.spec;
    const fwd = this.speed;
    let a = 0;
    if (inp.throttle > 0.05) a = fwd < -0.5 ? 14 : s.accel * inp.throttle * Math.max(0, 1 - fwd / s.top);
    else if (inp.throttle < -0.05) a = fwd > 0.5 ? -14 * -inp.throttle : -5 * -inp.throttle * Math.max(0, 1 + fwd / 9);
    // Rolling and air drag.
    a -= Math.sign(fwd) * (0.6 + 0.0008 * fwd * fwd);
    const before = this.speed;
    this.speed += a * dt;
    if (Math.abs(inp.throttle) < 0.05 && Math.sign(this.speed) !== Math.sign(before)) this.speed = 0;
    // Steering: less lock at speed so it doesn't spin out.
    const lock = 0.6 / (1 + Math.abs(this.speed) * 0.05);
    this.steer += (inp.steer * lock - this.steer) * Math.min(1, dt * 7);
    const yaw = (this.speed / s.wheelbase) * Math.tan(this.steer);
    this.heading -= yaw * dt;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.spin += (this.speed / s.wheelR) * dt;
    this.collide();
  }

  /** Pushes the car out of walls; a hit slows it and bounces it back a little. */
  collide() {
    this.bumped = 0;
    for (const c of this.circles()) {
      const p = { x: c.x, z: c.z };
      const moved = pushOut(p, c.r, true);
      if (moved > 0) {
        const px = p.x - c.x, pz = p.z - c.z, m = Math.hypot(px, pz) || 1;
        this.x += px;
        this.z += pz;
        // Head-on (pushed back against the way we're going) bounces; brushing along a wall just slows a bit.
        const into = (-(px * Math.sin(this.heading) + pz * Math.cos(this.heading)) / m) * Math.sign(this.speed);
        if (into > 0.5) {
          this.bumped = Math.max(this.bumped, Math.abs(this.speed));
          this.speed *= -0.2;
        } else this.speed *= 0.97;
      }
    }
  }
}
