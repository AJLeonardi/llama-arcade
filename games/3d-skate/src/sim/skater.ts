// The skater: rolling on whatever is underneath, flying, grinding rails, tricks and falls. Plain numbers only
// (no three.js), so it runs in the Node tests.
//
// On the ground the board rolls along its heading: `speed` is how fast, and gravity pulls along the slope.
// When the ground drops away faster than gravity can pull the board down (a ramp's lip, a ledge, a stair),
// the skater flies; landing projects the velocity back onto the new ground.
import { HALF_W, railsAt, SPAWN, surfaceAt, type Rail } from './world';

export const G = 9.8;
export const STEP = 1 / 120;
const AIR_EPS = 0.5 * G * STEP * STEP + 0.002;
const TURN = 2.4; // rad/s at walking speed
const AIR_SPIN = 5.5; // rad/s
const BACKFLIP_TIME = 0.75; // seconds for one backflip
const KICKFLIP_TIME = 0.42;
const BAIL_TIME = 1.8;
/** Landing harder than this (m/s into the ground) is a fall. */
export const HARD_LANDING = 32;
/** Above this airtime a trick counts and a landing can go wrong. */
const REAL_AIR = 0.22;
/** How far in front of the skater's middle the board's nose (and their body) reaches. Walls stop that. */
const REACH = 0.45;

export interface BoardStats {
  /** Top pushing speed (m/s). */
  push: number;
  /** Ollie pop (m/s upward). */
  pop: number;
}

export interface Input {
  steer: number; // -1 left .. 1 right
  throttle: number; // 1 push .. -1 brake
  ollie: boolean;
  kickflip: boolean;
  backflip: boolean;
}

export type SkateEvent =
  | { type: 'ollie' }
  | { type: 'land'; hard: number; tricks: string[]; points: number; air: number }
  | { type: 'bail'; why: string }
  | { type: 'grind-start' }
  | { type: 'grind-end'; points: number }
  | { type: 'bump' };

export type Mode = 'ground' | 'air' | 'grind' | 'bail';

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Skater {
  x = SPAWN.x;
  y = SPAWN.y;
  z = SPAWN.z;
  heading = SPAWN.heading;
  speed = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  mode: Mode = 'ground';
  /** Surface normal under the board (ground/grind). */
  nx = 0;
  ny = 1;
  nz = 0;
  /** Backflip rotation (radians, grows during a flip). */
  pitch = 0;
  flipping = false;
  /** Kickflip progress 0..1 while flipping, else 0. Several flips add up in `kickflips`. */
  kick = 0;
  kickflips = 0;
  backflips = 0;
  /** How far we've turned in the air (radians). */
  spun = 0;
  air = 0;
  bailT = 0;
  /** Grinding: the rail, how far along it, and speed along it (signed). */
  rail: Rail | null = null;
  railS = 0;
  railV = 0;
  grindT = 0;
  /** Seconds since the last ollie (for the crouch-and-pop animation). */
  sincePop = 9;
  /** Seconds since landing (for the knees-bend animation). */
  sinceLand = 9;
  pushing = false;
  score = 0;
  best = 0;
  stats: BoardStats;
  events: SkateEvent[] = [];
  private lastSafe = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, heading: SPAWN.heading };
  private safeT = 0;

  constructor(stats: BoardStats) {
    this.stats = stats;
  }

  /** Back to the top of the tall building. */
  respawn() {
    Object.assign(this, { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, heading: SPAWN.heading, speed: 0, vx: 0, vy: 0, vz: 0 });
    this.mode = 'ground';
    this.nx = this.nz = 0;
    this.ny = 1;
    this.resetTricks();
    this.rail = null;
    this.bailT = 0;
    this.lastSafe = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, heading: SPAWN.heading };
  }

  private resetTricks() {
    this.pitch = 0;
    this.flipping = false;
    this.kick = 0;
    this.kickflips = 0;
    this.backflips = 0;
    this.spun = 0;
    this.air = 0;
  }

  /** The board's forward direction on the current ground. */
  private dirOnGround(): [number, number, number] {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const d = fx * this.nx + fz * this.nz;
    let dx = fx - this.nx * d, dy = -this.ny * d, dz = fz - this.nz * d;
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  }

  private setNormal(hx: number, hz: number) {
    const l = Math.hypot(hx, 1, hz);
    this.nx = -hx / l;
    this.ny = 1 / l;
    this.nz = -hz / l;
  }

  step(inp: Input) {
    this.sincePop += STEP;
    this.sinceLand += STEP;
    switch (this.mode) {
      case 'ground':
        return this.stepGround(inp);
      case 'air':
        return this.stepAir(inp);
      case 'grind':
        return this.stepGrind(inp);
      case 'bail':
        return this.stepBail();
    }
  }

  private stepGround(inp: Input) {
    let [dx, dy, dz] = this.dirOnGround();
    // Steering: tighter when slow.
    const turn = (TURN / (1 + Math.abs(this.speed) / 14)) * inp.steer;
    this.heading -= turn * STEP;
    // Forces along the board.
    let a = -G * dy;
    const flat = this.ny > 0.96;
    this.pushing = false;
    if (inp.throttle > 0.1 && flat && this.speed < this.stats.push) {
      a += 3.2 * inp.throttle;
      this.pushing = true;
    }
    const sp = Math.abs(this.speed);
    let drag = 0.1 + 0.0065 * Math.max(0, sp - 7) ** 2;
    if (inp.throttle < -0.1) drag += 5 * -inp.throttle;
    if (sp > 1e-3) a -= Math.sign(this.speed) * drag;
    const before = this.speed;
    this.speed += a * STEP;
    // Friction and brakes stop you; they don't push you backwards.
    if (before !== 0 && Math.sign(before) !== Math.sign(this.speed) && Math.abs(G * dy) < drag) this.speed = 0;
    // Rolling backwards down a ramp: turn the skater around (like a quick revert).
    if (this.speed < -0.05) {
      this.heading += Math.PI;
      this.speed = -this.speed;
      [dx, dy, dz] = this.dirOnGround();
    }
    if (inp.ollie || inp.kickflip || inp.backflip) {
      this.pop(dx, dy, dz, inp);
      return;
    }
    this.moveOnGround(dx, dy, dz);
    // Remember a safe spot to get back up after a fall.
    this.safeT += STEP;
    if (this.safeT > 0.5 && this.ny > 0.995 && this.mode === 'ground') {
      this.safeT = 0;
      this.lastSafe = { x: this.x, y: this.y, z: this.z, heading: this.heading };
    }
  }

  private moveOnGround(dx: number, dy: number, dz: number) {
    const nx = this.x + dx * this.speed * STEP;
    const nz = this.z + dz * this.speed * STEP;
    const ny = this.y + dy * this.speed * STEP;
    // Rails are solid: riding into one bounces you off it (ollie onto it to grind).
    const rail = railCrossed(this.x, this.z, nx + dx * REACH * 0.6, nz + dz * REACH * 0.6, this.y);
    if (rail) return this.hitRail(rail);
    // Look for walls where the nose of the board will be, not just under the skater's middle, so the
    // board and body stop at the side of a ramp instead of going into it.
    const r = Math.sign(this.speed || 1) * REACH;
    const px = nx + dx * r, pz = nz + dz * r, py = ny + dy * r;
    if (surfaceAt(px, pz, py).wall) return this.hitWall(px, pz, py, this.x + dx * r, this.z + dz * r);
    const s = surfaceAt(nx, nz, ny);
    if (s.wall) return this.hitWall(nx, nz, ny, this.x, this.z);
    if (ny > s.h + AIR_EPS) {
      // The ground fell away: fly.
      this.mode = 'air';
      this.vx = dx * this.speed;
      this.vy = dy * this.speed;
      this.vz = dz * this.speed;
      this.x = nx;
      this.y = ny;
      this.z = nz;
      this.air = 0;
      this.spun = 0;
      return;
    }
    this.x = nx;
    this.z = nz;
    this.y = s.h;
    this.setNormal(s.hx, s.hz);
  }

  /**
   * Ran into something taller than a step at (nx, nz) coming from (fromX, fromZ): glance off it, or fall
   * if it was head-on and fast.
   */
  private hitWall(nx: number, nz: number, ny: number, fromX: number, fromZ: number) {
    const blockX = surfaceAt(nx, fromZ, ny).wall;
    const blockZ = surfaceAt(fromX, nz, ny).wall;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let headOn: number;
    if (blockX && !blockZ) {
      headOn = Math.abs(fx);
      this.heading = Math.atan2(-fx, fz);
    } else if (blockZ && !blockX) {
      headOn = Math.abs(fz);
      this.heading = Math.atan2(fx, -fz);
    } else {
      headOn = 1;
      this.heading += Math.PI;
    }
    const boundary = Math.abs(nx) > HALF_W - 0.01; // the building fronts are gentle
    if (!boundary && headOn > 0.75 && this.speed > 7) return this.bail('Bonk!');
    this.speed *= boundary ? 0.7 : 0.4;
    this.events.push({ type: 'bump' });
  }

  /** Rode into a rail: glance off along it, or fall over it if it was head-on and fast. */
  private hitRail(r: Rail) {
    const ux = r.b[0] - r.a[0], uz = r.b[2] - r.a[2], l = Math.hypot(ux, uz);
    const [ax, az] = [ux / l, uz / l];
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const along = fx * ax + fz * az;
    // Mirror the heading across the rail (a fall then slides back away from it, not through it).
    this.heading = Math.atan2(2 * along * ax - fx, 2 * along * az - fz);
    if (Math.sqrt(Math.max(0, 1 - along * along)) > 0.75 && this.speed > 7) return this.bail('Hit the rail!');
    this.speed *= 0.4;
    this.events.push({ type: 'bump' });
  }

  private pop(dx: number, dy: number, dz: number, inp: Input) {
    const pop = this.stats.pop;
    this.mode = 'air';
    this.vx = dx * this.speed + this.nx * pop;
    this.vy = dy * this.speed + this.ny * pop;
    this.vz = dz * this.speed + this.nz * pop;
    this.y += 0.02;
    this.air = 0;
    this.spun = 0;
    this.sincePop = 0;
    this.events.push({ type: 'ollie' });
    this.startTricks(inp);
  }

  private startTricks(inp: Input) {
    if (inp.kickflip && this.kick === 0) this.kick = 1e-4;
    if (inp.backflip && !this.flipping) this.flipping = true;
  }

  private stepAir(inp: Input) {
    this.air += STEP;
    if (inp.kickflip || inp.backflip) this.startTricks(inp);
    // Spin with the stick.
    const spin = AIR_SPIN * inp.steer * STEP;
    this.heading -= spin;
    this.spun += spin;
    if (this.flipping) {
      this.pitch += (2 * Math.PI * STEP) / BACKFLIP_TIME;
      if (this.pitch >= 2 * Math.PI) {
        this.pitch -= 2 * Math.PI;
        this.backflips++;
        this.flipping = false; // another press starts another one
      }
    }
    if (this.kick > 0) {
      this.kick += STEP / KICKFLIP_TIME;
      if (this.kick >= 1) {
        this.kick = 0;
        this.kickflips++;
      }
    }
    this.vy -= G * STEP;
    const v = Math.hypot(this.vx, this.vy, this.vz);
    const drag = 1 - (0.0012 * v * STEP);
    this.vx *= drag;
    this.vy *= drag;
    this.vz *= drag;
    const nx = this.x + this.vx * STEP, ny = this.y + this.vy * STEP, nz = this.z + this.vz * STEP;
    if (this.tryGrind(nx, ny, nz)) return;
    const hs = Math.hypot(this.vx, this.vz) || 1;
    const rail = railCrossed(this.x, this.z, nx + (this.vx / hs) * 0.25, nz + (this.vz / hs) * 0.25, ny);
    if (rail) {
      // Clipped a rail without landing on it: bounce back off it.
      const ux = rail.b[0] - rail.a[0], uz = rail.b[2] - rail.a[2], l = Math.hypot(ux, uz);
      const along = (this.vx * ux + this.vz * uz) / l;
      this.vx = 0.3 * ((2 * along * ux) / l - this.vx);
      this.vz = 0.3 * ((2 * along * uz) / l - this.vz);
      this.y = ny;
      this.events.push({ type: 'bump' });
      return;
    }
    // A tall wall just ahead (the side of a ramp, a building) stops the board's nose, not its middle.
    const ahead = surfaceAt(nx + (this.vx / hs) * 0.35, nz + (this.vz / hs) * 0.35, ny + 0.6).wall;
    const s = surfaceAt(nx, nz, ny);
    if (s.wall || ahead) {
      // Bounce off the side of something.
      const k = ahead && !s.wall ? 0.35 / hs : 0;
      const blockX = surfaceAt(nx + this.vx * k, this.z, ny + (k ? 0.6 : 0)).wall;
      const blockZ = surfaceAt(this.x, nz + this.vz * k, ny + (k ? 0.6 : 0)).wall;
      if (blockX || !blockZ) this.vx *= -0.2;
      if (blockZ || !blockX) this.vz *= -0.2;
      this.y = ny;
      this.events.push({ type: 'bump' });
      return;
    }
    this.x = nx;
    this.z = nz;
    if (ny <= s.h) {
      this.y = s.h;
      this.setNormal(s.hx, s.hz);
      this.land();
    } else this.y = ny;
  }

  private land() {
    const n: [number, number, number] = [this.nx, this.ny, this.nz];
    const into = -(this.vx * n[0] + this.vy * n[1] + this.vz * n[2]);
    // Velocity along the ground.
    const tx = this.vx + into * n[0], ty = this.vy + into * n[1], tz = this.vz + into * n[2];
    const real = this.air > REAL_AIR;
    const hs = Math.hypot(tx, tz);
    const travel = Math.atan2(tx, tz);
    if (into > HARD_LANDING) return this.bail('Too high!');
    if (real) {
      if (this.flipping && this.pitch > 0.7 && this.pitch < 2 * Math.PI - 0.7) return this.bail('Not all the way round!');
      if (this.kick > 0.3 && this.kick < 0.85) return this.bail('Board flipped!');
      if (hs > 1.5) {
        const off = Math.abs(wrapAngle(this.heading - travel));
        if (off > 1.15 && off < Math.PI - 1.15) return this.bail('Sideways!');
      }
    }
    // Finish anything nearly done.
    if (this.flipping && this.pitch >= 2 * Math.PI - 0.7) this.backflips++;
    if (this.kick >= 0.85) this.kickflips++;
    const tricks: string[] = [];
    let points = 0;
    if (real) {
      const turns = Math.round(Math.abs(this.spun) / Math.PI);
      if (this.kickflips) {
        tricks.push(this.kickflips > 1 ? `${this.kickflips}× Kickflip` : 'Kickflip');
        points += 100 * this.kickflips;
      }
      if (this.backflips) {
        tricks.push(this.backflips > 1 ? `${this.backflips}× Backflip` : 'Backflip');
        points += 300 * this.backflips;
      }
      if (turns > 0) {
        tricks.push(`${turns * 180}`);
        points += 150 * turns;
      }
      if (!tricks.length && this.sincePop < this.air + 0.05) {
        tricks.push('Ollie');
        points += 25;
      }
      points += Math.round(this.air * 20) * 5;
      if (tricks.length > 1) points = Math.round(points * 1.5);
    }
    // Ride on in the direction of travel (landing backwards just turns you around).
    if (hs > 0.5) this.heading = travel;
    this.mode = 'ground';
    const [dx, dy, dz] = this.dirOnGround();
    this.speed = Math.max(0, tx * dx + ty * dy + tz * dz);
    this.sinceLand = 0;
    this.score += points;
    this.events.push({ type: 'land', hard: into, tricks, points, air: this.air });
    this.resetTricks();
  }

  /** Lands on a rail if we're coming down onto one, moving roughly along it. */
  private tryGrind(nx: number, ny: number, nz: number) {
    if (this.vy > 1) return false;
    for (const r of railsAt(nz)) {
      const [ax, ay, az] = r.a, [bx, by, bz] = r.b;
      const ex = bx - ax, ey = by - ay, ez = bz - az;
      const len = Math.hypot(ex, ey, ez);
      const hl2 = ex * ex + ez * ez;
      let t = ((nx - ax) * ex + (nz - az) * ez) / hl2;
      if (t < 0 || t > 1) continue;
      const px = ax + ex * t, pz = az + ez * t, py = ay + ey * t;
      if (Math.hypot(nx - px, nz - pz) > 0.4) continue;
      if (ny > py + 0.25 || ny < py - 0.25 || this.y < py - 0.1) continue;
      const ux = ex / len, uy = ey / len, uz = ez / len;
      const along = this.vx * ux + this.vy * uy + this.vz * uz;
      const hv = Math.hypot(this.vx, this.vz);
      if (Math.abs(this.vx * ux + this.vz * uz) < 0.55 * hv || hv < 1) continue;
      // Tricks have to be finished (or nearly) to lock on.
      const real = this.air > REAL_AIR;
      if (real && ((this.flipping && this.pitch > 0.7 && this.pitch < 2 * Math.PI - 0.7) || (this.kick > 0.3 && this.kick < 0.85))) {
        this.bail('Missed the rail!');
        return true;
      }
      // Score the tricks that got us here, then lock on.
      this.nx = this.nz = 0;
      this.ny = 1;
      this.vy = Math.min(this.vy, 0);
      this.land();
      if (this.mode !== 'ground') return true;
      this.mode = 'grind';
      this.rail = r;
      this.railS = t * len;
      this.railV = along;
      this.grindT = 0;
      this.x = px;
      this.y = py;
      this.z = pz;
      this.events.push({ type: 'grind-start' });
      return true;
    }
    return false;
  }

  private stepGrind(inp: Input) {
    const r = this.rail!;
    const [ax, ay, az] = r.a, [bx, by, bz] = r.b;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const ux = (bx - ax) / len, uy = (by - ay) / len, uz = (bz - az) / len;
    this.grindT += STEP;
    let a = -G * uy;
    if (Math.abs(this.railV) > 0.01) a -= Math.sign(this.railV) * 0.5;
    this.railV += a * STEP;
    this.railS += this.railV * STEP;
    this.heading = Math.atan2(ux * Math.sign(this.railV || 1), uz * Math.sign(this.railV || 1));
    this.x = ax + ux * this.railS;
    this.y = ay + uy * this.railS;
    this.z = az + uz * this.railS;
    this.nx = this.nz = 0;
    this.ny = 1;
    const off = this.railS < 0 || this.railS > len;
    const jump = inp.ollie || inp.kickflip || inp.backflip;
    if (off || jump || Math.abs(this.railV) < 0.3) {
      const points = Math.round(this.grindT * 10) * 10;
      this.score += points;
      this.events.push({ type: 'grind-end', points });
      this.mode = 'air';
      this.rail = null;
      this.vx = ux * this.railV;
      this.vy = uy * this.railV + (jump ? this.stats.pop * 0.9 : 0.3);
      this.vz = uz * this.railV;
      this.air = 0;
      this.spun = 0;
      if (jump) {
        this.sincePop = 0;
        this.events.push({ type: 'ollie' });
        this.startTricks(inp);
      }
    }
  }

  private bail(why: string) {
    // Slide on the way we were going (after hitting something, that's already turned away from it).
    const [vx, vy, vz] = this.velocity();
    this.vx = vx * 0.5;
    this.vy = Math.min(0, vy);
    this.vz = vz * 0.5;
    this.mode = 'bail';
    this.bailT = 0;
    this.rail = null;
    this.events.push({ type: 'bail', why });
    this.resetTricks();
  }

  private stepBail() {
    this.bailT += STEP;
    // Slide to a stop along the ground.
    const s = surfaceAt(this.x, this.z, this.y + 0.5);
    if (this.y > s.h + 0.01 && !s.wall) {
      this.vy -= G * STEP;
      this.y = Math.max(s.h, this.y + this.vy * STEP);
    } else this.vy = 0;
    const k = Math.max(0, 1 - 3 * STEP);
    this.vx *= k;
    this.vz *= k;
    const nx = this.x + this.vx * STEP, nz = this.z + this.vz * STEP;
    const s2 = surfaceAt(nx, nz, this.y);
    if (!s2.wall) {
      this.x = nx;
      this.z = nz;
    } else this.vx = this.vz = 0;
    if (this.bailT > BAIL_TIME) this.getUp();
  }

  /** After a fall: stand up where we are if it's flat, or back at the last flat spot. */
  private getUp() {
    const s = surfaceAt(this.x, this.z, this.y + 0.3);
    const steep = Math.hypot(s.hx, s.hz) > 0.15;
    if (steep || s.wall || Math.abs(s.h - this.y) > 0.5) {
      Object.assign(this, this.lastSafe);
    } else this.y = s.h;
    const g = surfaceAt(this.x, this.z, this.y + 0.3);
    this.y = g.h;
    this.setNormal(g.hx, g.hz);
    this.mode = 'ground';
    this.speed = 0;
    this.vx = this.vy = this.vz = 0;
    this.sinceLand = 0;
  }

  /** Velocity in the world, whatever the mode. */
  velocity(): [number, number, number] {
    if (this.mode === 'ground') {
      const [dx, dy, dz] = this.dirOnGround();
      return [dx * this.speed, dy * this.speed, dz * this.speed];
    }
    if (this.mode === 'grind' && this.rail) {
      const [ax, ay, az] = this.rail.a, [bx, by, bz] = this.rail.b;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      return [((bx - ax) / len) * this.railV, ((by - ay) / len) * this.railV, ((bz - az) / len) * this.railV];
    }
    return [this.vx, this.vy, this.vz];
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

/**
 * A rail the path from (x0, z0) to (x1, z1) crosses at a height that would hit the board or legs
 * (above a little bump, below the waist) for a skater whose feet are at `feet`; null if none.
 */
export function railCrossed(x0: number, z0: number, x1: number, z1: number, feet: number): Rail | null {
  for (const r of railsAt(z1)) {
    if (r.edge) continue; // a ledge's edge: the ledge itself is the wall
    const [ax, ay, az] = r.a, [bx, by, bz] = r.b;
    const ex = bx - ax, ez = bz - az, px = x1 - x0, pz = z1 - z0;
    const den = px * ez - pz * ex;
    if (Math.abs(den) < 1e-9) continue; // parallel
    const t = ((ax - x0) * ez - (az - z0) * ex) / den; // along the path
    const u = ((ax - x0) * pz - (az - z0) * px) / den; // along the rail
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const y = ay + (by - ay) * u;
    if (y > feet + 0.12 && y < feet + 1.7) return r;
  }
  return null;
}
