// Riding a water slide, with real physics: on a slide you slide along its centre line, sped up by gravity and
// slowed by friction and the air, and you ride up the side of the tube in the turns (the faster you go, the
// higher). In a funnel or a toilet bowl you're a bead on a curved surface: gravity pulls you down the wall,
// you swing up the other side, friction slowly takes the swing away, and when you're slow enough you drop
// out of the hole in the middle. The rider can lean forward (faster) or drag hands (slower), within limits.
import type { V3 } from './world';

export const STEP = 1 / 120;
export const G = 9.81;
/** Path points are this far apart (metres). */
export const DS = 0.25;
const MU = 0.03; // wet fibreglass
const DRAG = 0.009; // air and water spray

export type Style = 'tube' | 'open' | 'river' | 'zip' | 'capsule';

export interface PathSeg {
  type: 'path';
  pts: V3[];
  style: Style;
  /** Tube or trough radius. */
  radius: number;
  color: string;
}

/** An axisymmetric surface: height h(r) = a(r-r0)² + b(r-r0) above its bottom for r > r0, flat inside r0. */
export interface SurfSeg {
  type: 'surface';
  shape: 'funnel' | 'bowl';
  cx: number;
  cy: number;
  cz: number;
  r0: number;
  /** The hole you drop out of. */
  hole: number;
  /** Rim radius. */
  R: number;
  a: number;
  b: number;
  /** Swings across the middle before the funnel lets you out (bowls let you out when you get to the hole). */
  passes: number;
  color: string;
}
export type Seg = PathSeg | SurfSeg;

export const surfH = (s: SurfSeg, r: number) => (r <= s.r0 ? 0 : s.a * (r - s.r0) ** 2 + s.b * (r - s.r0));
export const surfH1 = (s: SurfSeg, r: number) => (r <= s.r0 ? 0 : 2 * s.a * (r - s.r0) + s.b);
const surfH2 = (s: SurfSeg, r: number) => (r <= s.r0 ? 0 : 2 * s.a);

// ---------------------------------------------------------------- building a slide's path

/**
 * A turtle that lays a slide's centre line: lines and arcs that go downhill at a slope. Changes of slope are
 * eased over a vertical curve so there are no kinks.
 */
export class PathBuilder {
  pts: V3[] = [];
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Downhill angle (radians, positive = down). */
  pitch: number;
  /** Vertical curve radius for slope changes (metres). */
  bend = 6;

  constructor(x: number, y: number, z: number, yawDeg: number, pitchDeg = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = (yawDeg * Math.PI) / 180;
    this.pitch = (pitchDeg * Math.PI) / 180;
    this.pts.push([x, y, z]);
  }

  private go(len: number, yawPerM: number, slopeDeg: number) {
    const target = (slopeDeg * Math.PI) / 180;
    const n = Math.max(1, Math.round(len / DS));
    const ds = len / n;
    for (let i = 0; i < n; i++) {
      const d = target - this.pitch, maxD = ds / this.bend;
      this.pitch += Math.max(-maxD, Math.min(maxD, d));
      this.yaw += yawPerM * ds;
      const c = Math.cos(this.pitch);
      this.x += Math.sin(this.yaw) * c * ds;
      this.z += Math.cos(this.yaw) * c * ds;
      this.y -= Math.sin(this.pitch) * ds;
      this.pts.push([this.x, this.y, this.z]);
    }
    return this;
  }

  line(len: number, slopeDeg: number) {
    return this.go(len, 0, slopeDeg);
  }

  /** Turn through `deg` (positive turns the heading from +z towards +x) on a circle of radius `r`. */
  arc(r: number, deg: number, slopeDeg: number) {
    const rad = (Math.abs(deg) * Math.PI) / 180;
    return this.go(r * rad, Math.sign(deg) / r, slopeDeg);
  }

  /** Go down until at height `y`, at a slope. */
  downTo(y: number, slopeDeg: number) {
    let guard = 4000;
    while (this.y > y && guard-- > 0) this.go(DS, 0, slopeDeg);
    return this;
  }

  /** Carry on through these waypoints on a smooth curve (from where the path is now, in the way it's going). */
  through(...way: V3[]) {
    const here: V3 = [this.x, this.y, this.z];
    // A Catmull-Rom curve leaves `here` parallel to (first waypoint - prev): put prev so that is the way we're going.
    const w = way[0], L = 2 * Math.hypot(w[0] - here[0], w[1] - here[1], w[2] - here[2]);
    const c = Math.cos(this.pitch);
    const prev: V3 = [w[0] - Math.sin(this.yaw) * c * L, w[1] + Math.sin(this.pitch) * L, w[2] - Math.cos(this.yaw) * c * L];
    const cps = [prev, here, ...way];
    const last = way[way.length - 1], before = cps[cps.length - 2];
    cps.push([2 * last[0] - before[0], 2 * last[1] - before[1], 2 * last[2] - before[2]]);
    for (let i = 1; i < cps.length - 2; i++) {
      const p0 = cps[i - 1], p1 = cps[i], p2 = cps[i + 1], p3 = cps[i + 2];
      const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[2] - p1[2], p2[1] - p1[1]) / (DS / 2));
      for (let k = 1; k <= n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const c = (j: number) =>
          0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        this.pts.push([c(0), c(1), c(2)]);
      }
    }
    const e = this.pts[this.pts.length - 1], p = this.pts[this.pts.length - 3];
    [this.x, this.y, this.z] = e;
    this.yaw = Math.atan2(e[0] - p[0], e[2] - p[2]);
    this.pitch = Math.atan2(p[1] - e[1], Math.hypot(e[0] - p[0], e[2] - p[2]));
    return this;
  }

  get dir(): [number, number] {
    return [Math.sin(this.yaw), Math.cos(this.yaw)];
  }
}

/** Re-space a path's points exactly DS apart (arcs and slopes leave them slightly uneven). */
function respace(pts: V3[]): V3[] {
  const out: V3[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let t = DS - carry;
    while (t <= L) {
      const f = t / L;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      t += DS;
    }
    carry = L - (t - DS);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1], last[2] - tail[2]) > DS * 0.3) out.push(last);
  return out;
}

export function pathSeg(b: PathBuilder, style: Style, radius: number, color: string): PathSeg {
  return { type: 'path', pts: respace(b.pts), style, radius, color };
}

/** A funnel or bowl placed so the path that built `b` runs into it at radius `rEntry`. */
export function surfaceFrom(
  b: PathBuilder,
  spec: Omit<SurfSeg, 'type' | 'cx' | 'cy' | 'cz'>,
  rEntry: number,
  /** 'across' heads for the middle (side to side); 'left'/'right' goes round the rim (a bowl). */
  how: 'across' | 'left' | 'right',
): SurfSeg {
  const [dx, dz] = b.dir;
  // Across: the middle is straight ahead. Round: the middle is to one side.
  const [ox, oz] = how === 'across' ? [dx, dz] : how === 'left' ? [dz, -dx] : [-dz, dx];
  const s: SurfSeg = { type: 'surface', cx: b.x + ox * rEntry, cy: 0, cz: b.z + oz * rEntry, ...spec };
  s.cy = b.y - surfH(s, rEntry);
  return s;
}

/** The slope (degrees) a path must have to run smoothly onto a funnel's wall at radius r. */
export const wallSlope = (spec: Pick<SurfSeg, 'r0' | 'a' | 'b'>, r: number) =>
  (Math.atan(2 * spec.a * (r - spec.r0) + spec.b) * 180) / Math.PI;

// ---------------------------------------------------------------- a ride

export interface RideDef {
  id: string;
  name: string;
  emoji: string;
  /** What you ride on: a big tube (raft), your back, or a zip-line harness. */
  seat: 'tube' | 'body' | 'zip';
  segs: Seg[];
  minV: number;
  maxV: number;
  /** Seconds of countdown before the floor drops (the drop capsule). */
  countdown?: number;
  /** The lazy river goes round and round until you get out. */
  loop?: boolean;
  /** Where you stand up afterwards. */
  exit: { x: number; y: number; z: number; yaw: number };
  blurb: string;
}

export type RideEvent = 'count' | 'drop' | 'airtime' | 'splash' | 'swish' | 'flush' | 'done';

export interface Frame {
  pos: V3;
  fwd: V3;
  up: V3;
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export class Rider {
  seg = 0;
  /** Along a path: distance and speed. */
  s = 0;
  v = 0;
  /** On a surface: position relative to its axis and horizontal velocity. */
  px = 0;
  pz = 0;
  vx = 0;
  vz = 0;
  /** How far round the tube you've ridden up (radians, + to the left). */
  roll = 0;
  /** The lazy river: how far from the middle of the channel (metres). */
  side = 0;
  /** Vertical g (1 = normal, below 0.25 is airtime). */
  gForce = 1;
  t = 0;
  wait = 0;
  passes = 0;
  done = false;
  events: RideEvent[] = [];
  private inMiddle = false;
  private air = false;
  private segT = 0;
  readonly frame: Frame = { pos: [0, 0, 0], fwd: [0, 0, 1], up: [0, 1, 0] };

  constructor(readonly def: RideDef) {
    this.wait = def.countdown ?? 0;
    this.v = def.countdown ? 0 : def.loop ? 0.8 : 2.5; // a push off at the top
    this.update();
  }

  get speed() {
    const s = this.def.segs[this.seg];
    return s?.type === 'surface' ? this.surfaceSpeed(s) : this.v;
  }

  /** push: -1 (drag your hands, slower) .. 1 (lean forward, faster). side: -1..1 (the lazy river). */
  step(push: number, side = 0) {
    if (this.done) return;
    this.t += STEP;
    if (this.wait > 0) {
      const before = Math.ceil(this.wait);
      this.wait -= STEP;
      if (Math.ceil(this.wait) !== before && this.wait > 0) this.events.push('count');
      if (this.wait <= 0) this.events.push('drop');
      this.update();
      return;
    }
    const seg = this.def.segs[this.seg];
    if (seg.type === 'path') this.stepPath(seg, push, side);
    else this.stepSurface(seg, push);
    this.update();
  }

  private stepPath(seg: PathSeg, push: number, side: number) {
    const { pts } = seg;
    const len = (pts.length - 1) * DS;
    const i = Math.min(pts.length - 2, Math.floor(this.s / DS));
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 2)];
    const t = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const d = this.def;

    if (d.loop) {
      // The lazy river: the current carries you; paddle to go a bit faster or slower.
      const current = 0.9 + push * 0.6;
      this.v += (current - this.v) * 0.8 * STEP;
      this.side = Math.max(-1.5, Math.min(1.5, this.side + side * 0.9 * STEP));
    } else {
      let acc = -G * t[1] - MU * G * Math.sqrt(Math.max(0, 1 - t[1] * t[1])) - DRAG * this.v * this.v;
      acc += push * (push > 0 ? 1.6 : 3.5);
      if (this.v > d.maxV) acc = Math.min(acc, -3); // the limit: you can't go faster than this
      this.v = Math.max(d.minV, this.v + acc * STEP);
    }

    // Ride up the tube's side in the turns, and feel the dips and crests.
    const k = Math.min(pts.length - 1, i + 4), j = Math.max(0, i - 4);
    const yawA = Math.atan2(pts[i][0] - pts[j][0], pts[i][2] - pts[j][2]);
    const yawB = Math.atan2(pts[k][0] - pts[i][0], pts[k][2] - pts[i][2]);
    let dyaw = yawB - yawA;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const spanH = Math.max(DS, Math.hypot(pts[k][0] - pts[j][0], pts[k][2] - pts[j][2]) / 2);
    const kappa = dyaw / spanH; // + = turning left... (towards +x from +z)
    const horiz = Math.sqrt(Math.max(0.01, 1 - t[1] * t[1]));
    const lat = this.v * this.v * kappa * horiz;
    const maxRoll = seg.style === 'tube' || seg.style === 'capsule' ? 1.3 : seg.style === 'open' ? 1.0 : 0.3;
    const target = Math.max(-maxRoll, Math.min(maxRoll, Math.atan2(lat, G * horiz)));
    this.roll += (target - this.roll) * Math.min(1, 5 * STEP);

    const pitchOf = (p: V3, q: V3) => Math.atan2(p[1] - q[1], Math.hypot(q[0] - p[0], q[2] - p[2]));
    const pitchA = pitchOf(pts[j], pts[i]), pitchB = pitchOf(pts[i], pts[k]);
    const dPitch = (pitchB - pitchA) / (DS * Math.max(1, (k - j) / 2));
    this.gForce = Math.cos(pitchB) - (this.v * this.v * dPitch) / G;
    const air = this.gForce < 0.25 && this.v > 4;
    if (air && !this.air) this.events.push('airtime');
    this.air = air;
    if (Math.abs(this.roll) > 0.7 && Math.random() < STEP * 2) this.events.push('swish');

    this.s += this.v * STEP;
    if (this.s >= len) {
      if (d.loop) {
        this.s -= len;
        return;
      }
      this.next(t, this.v);
    }
  }

  private next(t: V3, v: number) {
    this.seg++;
    this.segT = 0;
    const seg = this.def.segs[this.seg];
    if (!seg) {
      this.done = true;
      this.events.push('splash', 'done');
      return;
    }
    if (seg.type === 'path') {
      this.s = 0;
      this.v = Math.max(v, this.def.minV);
      if (this.seg > 0 && this.def.segs[this.seg - 1].type === 'surface') this.events.push('flush');
    } else {
      const prev = this.def.segs[this.seg - 1] as PathSeg;
      const end = prev.pts[prev.pts.length - 1];
      this.px = end[0] - seg.cx;
      this.pz = end[2] - seg.cz;
      // Onto the wall: the horizontal part of the speed (the slope of the wall gives back the rest).
      this.vx = t[0] * v;
      this.vz = t[2] * v;
      this.passes = 0;
      this.inMiddle = false;
    }
  }

  private surfaceSpeed(s: SurfSeg) {
    const r = Math.hypot(this.px, this.pz) || 1e-6;
    const vr = (this.vx * this.px + this.vz * this.pz) / r;
    return Math.hypot(this.vx, this.vz, surfH1(s, r) * vr);
  }

  private stepSurface(s: SurfSeg, push: number) {
    this.segT += STEP;
    const r = Math.hypot(this.px, this.pz) || 1e-6;
    const ux = this.px / r, uz = this.pz / r;
    const vr = this.vx * ux + this.vz * uz;
    const h1 = surfH1(s, r), h2 = surfH2(s, r);
    // A bead on the curve: the slope pulls you in, the curve of the wall turns you round.
    const ar = (-(G + h2 * vr * vr) * h1) / (1 + h1 * h1);
    const speed = this.surfaceSpeed(s);
    const hs = Math.hypot(this.vx, this.vz) || 1e-6;
    // Pressed into the wall going round, so more friction than on a straight slide.
    let fr = MU * G * (s.shape === 'bowl' ? 2.6 : 1.4) + DRAG * speed * speed - push * (push > 0 ? 0.8 : 2);
    if (this.segT > 25) fr += 2; // nobody stays in there for ever
    // Friction slows you along the way you're going (and can only stop you, never push you backwards).
    const dv = Math.min(hs, fr * STEP * (hs / Math.max(speed, 1e-6)));
    this.vx += ar * ux * STEP - (this.vx / hs) * dv;
    this.vz += ar * uz * STEP - (this.vz / hs) * dv;
    this.px += this.vx * STEP;
    this.pz += this.vz * STEP;
    const r2 = Math.hypot(this.px, this.pz);
    // The rim: you can't go over the top.
    if (r2 > s.R - 0.3) {
      const k = (s.R - 0.3) / r2;
      this.px *= k;
      this.pz *= k;
      const vr2 = (this.vx * this.px + this.vz * this.pz) / (s.R - 0.3);
      if (vr2 > 0) {
        this.vx -= (vr2 * 1.3 * this.px) / (s.R - 0.3);
        this.vz -= (vr2 * 1.3 * this.pz) / (s.R - 0.3);
      }
    }
    // Crossing the middle; the hole catches you once you've swung enough (funnel) or slowed right down (bowl).
    const mid = r2 < s.r0;
    if (mid && !this.inMiddle) {
      this.passes++;
      if (s.shape === 'funnel') this.events.push('swish');
    }
    this.inMiddle = mid;
    const caught = r2 < s.hole && (s.shape === 'bowl' || this.passes > s.passes || this.surfaceSpeed(s) < 2.5);
    if (caught || this.segT > 40) this.next([0, -1, 0], Math.max(3, this.surfaceSpeed(s)));
  }

  /** Where the rider is and which way they face (forward along the motion, up away from the slide). */
  private update() {
    const seg = this.def.segs[this.seg];
    const f = this.frame;
    if (!seg) return;
    if (seg.type === 'path') {
      const { pts } = seg;
      const fi = Math.min(pts.length - 1.001, this.s / DS);
      const i = Math.floor(fi), u = fi - i;
      const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
      const p: V3 = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      const pa = pts[Math.max(0, i - 2)], pb = pts[Math.min(pts.length - 1, i + 3)];
      const t = norm([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]);
      // A frame round the tangent: `side` is level, `n` is "up" in the tube; then roll round the tube.
      let side = cross(t, [0, 1, 0]);
      if (Math.hypot(...side) < 0.15) side = cross(t, [0, 0, 1]);
      side = norm(side);
      const n = norm(cross(side, t));
      const c = Math.cos(this.roll), sn = Math.sin(this.roll);
      // A positive roll swings you out to +side (the outside of a turn towards +x), head towards the middle.
      const tubeUp: V3 = [n[0] * c - side[0] * sn, n[1] * c - side[1] * sn, n[2] * c - side[2] * sn];
      const hang = seg.style === 'zip' || seg.style === 'river';
      const up: V3 = hang ? [0, 1, 0] : tubeUp;
      // How far below the centre line you are: the cable above you, the river's surface, the tube's floor.
      let below = seg.style === 'zip' ? 1.25 : seg.style === 'river' ? -0.05 : seg.radius - 0.22;
      // Falling straight down the drop capsule, you're in the middle of the tube, not against its side.
      if (seg.style === 'capsule') below *= 1 - Math.max(0, Math.min(1, (Math.abs(t[1]) - 0.7) / 0.25));
      const lat = this.def.loop ? this.side : 0;
      f.pos = [p[0] - up[0] * below + side[0] * lat, p[1] - up[1] * below, p[2] - up[2] * below + side[2] * lat];
      f.fwd = t;
      f.up = up;
    } else {
      const r = Math.hypot(this.px, this.pz) || 1e-6;
      const h1 = surfH1(seg, r);
      const ux = this.px / r, uz = this.pz / r;
      f.pos = [seg.cx + this.px, seg.cy + surfH(seg, r) + 0.15, seg.cz + this.pz];
      f.up = norm([-h1 * ux, 1, -h1 * uz]);
      const vr = this.vx * ux + this.vz * uz;
      const fw: V3 = [this.vx, h1 * vr, this.vz];
      if (Math.hypot(...fw) > 0.05) f.fwd = norm(fw);
    }
  }
}
