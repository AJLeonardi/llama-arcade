// The 3D models of every ride, built from simple shapes, and how each one moves.
// A ride's motion only depends on `phase` (0..1 through a go) and whether it's running, so it always
// matches the sim. Each model is in the ride's own space: centre at 0,0, entrance toward +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RideType, dropHeight } from '../sim/catalog';
import { Track, frameAt, makeTrack, trackIndexAt } from './track';

const mats = new Map<string, THREE.MeshLambertMaterial>();
export function M(color: string | number) {
  const k = String(color);
  let m = mats.get(k);
  if (!m) mats.set(k, (m = new THREE.MeshLambertMaterial({ color })));
  return m;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n);

function mesh(g: THREE.BufferGeometry, color: string | number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(g, M(color));
  m.position.set(x, y, z);
  return m;
}

/** A beam from a to b (a box stretched between two points), as geometry. */
function beamGeo(a: THREE.Vector3, b: THREE.Vector3, w: number) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, len, w);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(m);
}

function merged(geos: THREE.BufferGeometry[], color: string | number) {
  const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
  for (const x of geos) x.dispose();
  return new THREE.Mesh(g, M(color));
}

const SPARK = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f783ac', '#ff922b', '#22b8cf'];

export interface Seat {
  pos: THREE.Vector3;
  /** Look this way (coasters); otherwise you look around freely. */
  dir?: THREE.Vector3;
  up?: THREE.Vector3;
}

export interface RideModel {
  group: THREE.Group;
  /** Height of the top (for the sign). */
  top: number;
  /** Coasters measure their own lap time. */
  lap?: number;
  update(phase: number, running: boolean, dt: number): void;
  /** Where you sit when you ride it, in the ride's own space. */
  seat(): Seat | null;
}

/** Spin speed through a go: speeds up, holds, slows down. */
function spinUp(phase: number, running: boolean) {
  if (!running) return 0;
  return Math.min(1, phase / 0.15, (1 - phase) / 0.15);
}

function platform(r: number, color: string, h = 0.4) {
  return mesh(cyl(r, r, h, 24), color, 0, h / 2, 0);
}

// ---------------------------------------------------------------- slide

function slide(t: RideType): RideModel {
  const g = new THREE.Group();
  const s = t.size;
  const H = 3 * s + 1;
  const R = 1.4 * s;
  g.add(mesh(box(1.4 * s, H, 1.4 * s), t.colors[1], 0, H / 2, 0));
  g.add(mesh(cyl(0.2, 1.4 * s, 1.4 * s, 4), t.colors[0], 0, H + 0.7 * s, 0));
  const turns = 1 + s * 0.6;
  const helix = new THREE.CatmullRomCurve3(
    Array.from({ length: 40 }, (_, i) => {
      const f = i / 39, a = f * turns * Math.PI * 2;
      return new THREE.Vector3(Math.sin(a) * (R + 0.9), H - 0.3 - f * (H - 0.6), Math.cos(a) * (R + 0.9));
    }),
  );
  g.add(new THREE.Mesh(new THREE.TubeGeometry(helix, 80, 0.55, 8), M(t.colors[0])));
  const rider = mesh(new THREE.SphereGeometry(0.35, 10, 8), '#ffffff');
  rider.userData.keep = true;
  g.add(rider);
  let seatPos = helix.getPointAt(0);
  return {
    group: g,
    top: H + 1.4 * s,
    update(phase, running) {
      rider.visible = running;
      const f = Math.min(1, Math.max(0, (phase - 0.25) / 0.65));
      seatPos = helix.getPointAt(running ? f : 0);
      rider.position.copy(seatPos).y += 0.4;
    },
    seat: () => ({ pos: seatPos.clone().add(new THREE.Vector3(0, 1.1, 0)) }),
  };
}

// ---------------------------------------------------------------- food stand

const emojiTex = new Map<string, THREE.Texture>();
function emojiSprite(e: string, size: number) {
  let tex = emojiTex.get(e);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    x.font = '100px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(e, 64, 72);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    emojiTex.set(e, tex);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  sp.scale.setScalar(size);
  return sp;
}

function stand(t: RideType): RideModel {
  const g = new THREE.Group();
  const s = t.size;
  g.add(mesh(box(3 * s, 2.2, 2.4 * s), t.colors[0], 0, 1.1, 0));
  g.add(mesh(box(3.2 * s, 0.15, 0.6), '#ffffff', 0, 1.1, 1.3 * s));
  // Striped roof.
  for (let i = 0; i < 6; i++) {
    g.add(mesh(box((3.4 * s) / 6, 0.25, 2.9 * s), i % 2 ? t.colors[1] : '#e03131', -1.7 * s + (3.4 * s / 6) * (i + 0.5), 3, 0));
  }
  for (const x of [-1.5, 1.5]) g.add(mesh(box(0.15, 0.9, 0.15), '#ffffff', x * s, 2.55, 1.3 * s));
  const sp = emojiSprite(t.emoji, 2.2);
  sp.position.set(0, 4.6, 0);
  g.add(sp);
  let bob = 0;
  return {
    group: g,
    top: 5.5,
    update(_p, _r, dt) {
      bob += dt;
      sp.position.y = 4.6 + Math.sin(bob * 2) * 0.2;
    },
    seat: () => null,
  };
}

// ---------------------------------------------------------------- carousel

function carousel(t: RideType): RideModel {
  const g = new THREE.Group();
  const s = t.size;
  const R = 4.5 * s;
  g.add(platform(R + 0.3, '#ced4da', 0.3));
  const spin = new THREE.Group();
  g.add(spin);
  spin.add(mesh(cyl(R, R, 0.3, 24), t.colors[1], 0, 0.45, 0));
  spin.add(mesh(cyl(0.5 * s, 0.5 * s, 4 * s, 12), t.colors[0], 0, 2 * s + 0.6, 0));
  spin.add(mesh(cyl(0.3, R + 0.4, 1.6 * s, 16), t.colors[0], 0, 4 * s + 1.4, 0));
  spin.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), '#ffd43b', 0, 4 * s + 2.4, 0));
  const horses: THREE.Group[] = [];
  const n = Math.round(6 * s + 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const hg = new THREE.Group();
    hg.position.set(Math.sin(a) * R * 0.75, 0, Math.cos(a) * R * 0.75);
    hg.rotation.y = a + Math.PI / 2;
    hg.add(mesh(cyl(0.06, 0.06, 4 * s, 6), '#ffd43b', 0, 2 * s + 0.6, 0));
    const horse = new THREE.Group();
    const c = SPARK[i % SPARK.length];
    horse.add(mesh(box(0.5, 0.6, 1.4), c, 0, 0, 0));
    horse.add(mesh(box(0.35, 0.8, 0.4), c, 0, 0.4, 0.7));
    horse.add(mesh(box(0.3, 0.3, 0.5), c, 0, 0.75, 0.95));
    for (const [x, z] of [[-0.18, 0.5], [0.18, 0.5], [-0.18, -0.5], [0.18, -0.5]]) horse.add(mesh(box(0.12, 0.6, 0.12), c, x, -0.5, z));
    horse.position.y = 1.6;
    hg.add(horse);
    spin.add(hg);
    horses.push(horse);
  }
  let ang = 0, bob = 0;
  return {
    group: g,
    top: 4 * s + 3,
    update(phase, running, dt) {
      const v = spinUp(phase, running);
      ang += v * dt * 0.9;
      bob += v * dt * 4;
      spin.rotation.y = ang;
      horses.forEach((h, i) => (h.position.y = 1.6 + Math.sin(bob + i * 1.3) * 0.35));
    },
    seat() {
      const p = new THREE.Vector3();
      horses[0].getWorldPosition(p);
      g.worldToLocal(p);
      return { pos: p.add(new THREE.Vector3(0, 1.1, 0)) };
    },
  };
}

// ---------------------------------------------------------------- teacups

function cups(t: RideType): RideModel {
  const g = new THREE.Group();
  const R = 5;
  g.add(platform(R + 0.4, t.colors[1], 0.3));
  const turn = new THREE.Group();
  turn.add(mesh(cyl(R, R, 0.2, 24), '#fff3bf', 0, 0.4, 0));
  g.add(turn);
  const cupGs: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const cg = new THREE.Group();
    cg.position.set(Math.sin(a) * 3.1, 0.5, Math.cos(a) * 3.1);
    const c = SPARK[(i * 2) % SPARK.length];
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.75, 1.1, 16, 1, true), M(c));
    (cup.material as THREE.Material).side = THREE.DoubleSide;
    cup.position.y = 0.55;
    cg.add(cup);
    cg.add(mesh(cyl(0.75, 0.75, 0.1, 16), c, 0, 0.05, 0));
    cg.add(mesh(new THREE.TorusGeometry(0.4, 0.1, 6, 12), c, 1.2, 0.6, 0));
    cg.add(mesh(cyl(0.12, 0.12, 0.6, 6), '#ffffff', 0, 0.3, 0));
    turn.add(cg);
    cupGs.push(cg);
  }
  turn.add(mesh(cyl(0.6, 0.8, 1.2, 12), t.colors[0], 0, 1, 0));
  let a = 0, b = 0;
  return {
    group: g,
    top: 3,
    update(phase, running, dt) {
      const v = spinUp(phase, running);
      a += v * dt * 0.7;
      b += v * dt * 3;
      turn.rotation.y = a;
      cupGs.forEach((c, i) => (c.rotation.y = b * (i % 2 ? 1 : -1.3)));
    },
    seat() {
      const p = new THREE.Vector3();
      cupGs[0].getWorldPosition(p);
      g.worldToLocal(p);
      return { pos: p.add(new THREE.Vector3(0, 1.4, 0)) };
    },
  };
}

// ---------------------------------------------------------------- the Up-and-Down Tower

/** How high the seats are at this point of a go (0 = bottom, 1 = top). */
export function dropLift(phase: number, running: boolean) {
  if (!running) return 0;
  if (phase < 0.1) return 0;
  if (phase < 0.62) {
    const f = (phase - 0.1) / 0.52;
    return f * f * (3 - 2 * f);
  }
  if (phase < 0.74) return 1;
  if (phase < 0.82) {
    const f = (phase - 0.74) / 0.08;
    return 1 - f * f;
  }
  if (phase < 0.92) return Math.sin(((phase - 0.82) / 0.1) * Math.PI) * 0.06;
  return 0;
}

function drop(t: RideType, level: number): RideModel {
  const g = new THREE.Group();
  const H = dropHeight(level);
  const w = 1.4 + Math.min(2.5, level * 0.08);
  g.add(platform(3.6, '#495057', 0.4));
  // The tower, in stripes so you can see it climb.
  const stripe = 6;
  for (let y = 0; y < H; y += stripe) {
    const h = Math.min(stripe, H - y);
    g.add(mesh(box(w, h, w), (y / stripe) % 2 ? t.colors[0] : '#f8f9fa', 0, 0.4 + y + h / 2, 0));
  }
  const cap = mesh(cyl(0.2, w, 2.4, 8), t.colors[1], 0, H + 1.6, 0);
  g.add(cap);
  const light = mesh(new THREE.SphereGeometry(0.5, 10, 8), '#ff2222', 0, H + 3.1, 0);
  light.userData.keep = true;
  g.add(light);
  const ring = new THREE.Group();
  ring.add(mesh(new THREE.TorusGeometry(w / 2 + 1.1, 0.35, 8, 24).rotateX(Math.PI / 2), t.colors[1], 0, 0, 0));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const seat = mesh(box(0.8, 0.9, 0.7), SPARK[i % SPARK.length], Math.sin(a) * (w / 2 + 1.1), -0.4, Math.cos(a) * (w / 2 + 1.1));
    seat.rotation.y = a;
    ring.add(seat);
  }
  g.add(ring);
  const bottom = 1.4, topY = H - 1;
  let blink = 0, y = bottom;
  return {
    group: g,
    top: H + 4,
    update(phase, running, dt) {
      y = bottom + (topY - bottom) * dropLift(phase, running);
      ring.position.y = y;
      blink += dt;
      light.visible = Math.sin(blink * 6) > 0;
    },
    seat: () => ({ pos: new THREE.Vector3(0, y + 0.9, w / 2 + 1.5) }),
  };
}

// ---------------------------------------------------------------- swing ride

function swings(t: RideType): RideModel {
  const g = new THREE.Group();
  const s = t.size;
  const H = 6 * s;
  g.add(platform(6 * s, '#adb5bd', 0.3));
  g.add(mesh(cyl(0.6 * s, 0.9 * s, H, 12), t.colors[0], 0, H / 2, 0));
  const top = new THREE.Group();
  top.position.y = H;
  top.add(mesh(cyl(0.4, 4 * s, 1.2 * s, 20), t.colors[1], 0, 0.6 * s, 0));
  g.add(top);
  const n = Math.round(10 * s);
  const arms: THREE.Group[] = [];
  const L = 3.2 * s;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.y = a;
    const pivot = new THREE.Group();
    pivot.position.set(3.6 * s, 0, 0);
    pivot.add(mesh(cyl(0.03, 0.03, L, 4), SPARK[i % SPARK.length], 0, -L / 2, 0));
    pivot.add(mesh(box(0.6, 0.15, 0.6), SPARK[i % SPARK.length], 0, -L, 0));
    holder.add(pivot);
    top.add(holder);
    arms.push(pivot);
  }
  let ang = 0, out = 0;
  return {
    group: g,
    top: H + 2 * s,
    update(phase, running, dt) {
      const v = spinUp(phase, running);
      ang += v * dt * 1.6;
      out += (v * 1.0 - out) * Math.min(1, dt * 2);
      top.rotation.y = ang;
      for (const p of arms) p.rotation.z = out;
    },
    seat() {
      const p = new THREE.Vector3(0, -L + 0.9, 0);
      arms[0].localToWorld(p);
      g.worldToLocal(p);
      return { pos: p };
    },
  };
}

// ---------------------------------------------------------------- bumper cars

function bumper(t: RideType): RideModel {
  const g = new THREE.Group();
  const W = 11;
  g.add(mesh(box(W, 0.3, W), t.colors[1], 0, 0.15, 0));
  for (const [x, z, w, d] of [[0, W / 2, W, 0.3], [0, -W / 2, W, 0.3], [W / 2, 0, 0.3, W], [-W / 2, 0, 0.3, W]]) {
    g.add(mesh(box(w, 0.6, d), '#ffd43b', x, 0.5, z));
  }
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.add(mesh(box(0.3, 4, 0.3), '#adb5bd', (x * W) / 2, 2, (z * W) / 2));
  g.add(mesh(box(W + 0.6, 0.3, W + 0.6), t.colors[0], 0, 4.1, 0));
  const cars: THREE.Group[] = [];
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    const col = SPARK[i % SPARK.length];
    c.add(mesh(box(1.3, 0.5, 1.8), col, 0, 0.55, 0));
    c.add(mesh(box(1.5, 0.25, 2), '#212529', 0, 0.35, 0));
    c.add(mesh(cyl(0.03, 0.03, 3.4, 4), '#dee2e6', 0, 2.3, -0.7));
    g.add(c);
    cars.push(c);
  }
  let t0 = 0;
  const place = () =>
    cars.forEach((c, i) => {
      const x = Math.sin(t0 * (0.5 + i * 0.07) + i * 2.1) * 3.8;
      const z = Math.cos(t0 * (0.37 + i * 0.05) + i * 1.3) * 3.8;
      const dx = x - c.position.x, dz = z - c.position.z;
      if (dx * dx + dz * dz > 1e-6) c.rotation.y = Math.atan2(dx, dz);
      c.position.set(x, 0, z);
    });
  place();
  return {
    group: g,
    top: 5,
    update(phase, running, dt) {
      t0 += spinUp(phase, running) * dt * 1.5;
      place();
    },
    seat() {
      const p = cars[0].position.clone().add(new THREE.Vector3(0, 1.5, 0));
      const dir = new THREE.Vector3(Math.sin(cars[0].rotation.y), 0, Math.cos(cars[0].rotation.y));
      return { pos: p, dir };
    },
  };
}

// ---------------------------------------------------------------- pirate ship

function ship(t: RideType): RideModel {
  const g = new THREE.Group();
  const s = t.size;
  const H = 6.5 * s;
  g.add(mesh(box(13 * s, 0.3, 6 * s), '#868e96', 0, 0.15, 0));
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      g.add(new THREE.Mesh(beamGeo(new THREE.Vector3(x * 3 * s, 0, z * 2.6 * s), new THREE.Vector3(0, H, z * 2.6 * s), 0.4), M('#495057')));
    }
  }
  g.add(mesh(cyl(0.3, 0.3, 5.6 * s, 8).rotateX(Math.PI / 2), '#495057', 0, H, 0));
  const swing = new THREE.Group();
  swing.position.y = H;
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(2 * s, 2 * s, 9 * s, 16, 1, false, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), M(t.colors[0]));
  hull.position.y = -H + 2.5 * s;
  swing.add(hull);
  swing.add(mesh(box(9 * s, 0.2, 3.8 * s), '#c4a484', 0, -H + 2.5 * s, 0));
  swing.add(mesh(box(0.25, 5 * s, 0.25), '#212529', 0, -H + 5 * s, 0));
  const sail = mesh(box(0.08, 2.4 * s, 2.6 * s), t.colors[1], 0, -H + 5.6 * s, 0);
  sail.rotation.y = Math.PI / 2;
  swing.add(sail);
  for (const x of [-1, 1]) swing.add(new THREE.Mesh(beamGeo(new THREE.Vector3(x * 3 * s, -H + 2.6 * s, 0), new THREE.Vector3(0, 0, 0), 0.25), M('#adb5bd')));
  g.add(swing);
  return {
    group: g,
    top: H + 2,
    update(phase, running) {
      const amp = running ? Math.sin(Math.PI * Math.min(1, phase)) * 1.25 : 0;
      swing.rotation.z = amp * Math.sin(phase * Math.PI * 2 * 4);
    },
    seat() {
      const p = new THREE.Vector3(3.5 * s, -H + 3.6 * s, 0);
      swing.localToWorld(p);
      g.worldToLocal(p);
      return { pos: p };
    },
  };
}

// ---------------------------------------------------------------- ferris wheel

function ferris(t: RideType): RideModel {
  const g = new THREE.Group();
  const s = t.size;
  const R = 6 * s;
  const H = R + 1.5;
  g.add(mesh(box(4 * s, 0.3, 2 * R * 0.7), '#868e96', 0, 0.15, 0));
  for (const z of [-1, 1]) {
    for (const x of [-1, 1]) g.add(new THREE.Mesh(beamGeo(new THREE.Vector3(x * R * 0.55, 0, z * 1.6 * s), new THREE.Vector3(0, H, z * 1.2 * s), 0.35 * s), M('#adb5bd')));
  }
  const wheel = new THREE.Group();
  wheel.position.y = H;
  g.add(wheel);
  for (const z of [-0.9 * s, 0.9 * s]) {
    const rim = mesh(new THREE.TorusGeometry(R, 0.12 * s + 0.05, 6, 48), t.colors[0], 0, 0, z);
    wheel.add(rim);
    const spokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      spokes.push(beamGeo(new THREE.Vector3(0, 0, z), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, z), 0.1 * s));
    }
    wheel.add(merged(spokes, t.colors[1]));
  }
  wheel.add(mesh(cyl(0.6 * s, 0.6 * s, 3 * s, 12).rotateX(Math.PI / 2), '#495057'));
  const n = Math.round(8 + 4 * s);
  const gons: THREE.Group[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const hold = new THREE.Group();
    hold.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const c = SPARK[i % SPARK.length];
    hold.add(mesh(box(0.08, 1.0, 0.08), c, 0, -0.5, 0));
    hold.add(mesh(box(1.3 * Math.min(s, 1.6), 1.0, 1.4 * Math.min(s, 1.6)), c, 0, -1.4, 0));
    hold.add(mesh(box(1.5 * Math.min(s, 1.6), 0.15, 1.6 * Math.min(s, 1.6)), c, 0, -0.8, 0));
    wheel.add(hold);
    gons.push(hold);
  }
  let ang = 0;
  return {
    group: g,
    top: H + R + 1,
    update(phase, running, dt) {
      ang += spinUp(phase, running) * dt * ((Math.PI * 2) / 18);
      wheel.rotation.z = ang;
      for (const q of gons) q.rotation.z = -ang;
    },
    seat() {
      const p = new THREE.Vector3(0, -1.1, 0);
      gons[0].localToWorld(p);
      g.worldToLocal(p);
      return { pos: p };
    },
  };
}

// ---------------------------------------------------------------- octopus

function octopus(t: RideType): RideModel {
  const g = new THREE.Group();
  const s = t.size;
  g.add(platform(6 * s, '#495057', 0.3));
  g.add(mesh(cyl(1 * s, 1.4 * s, 3 * s, 12), t.colors[0], 0, 1.5 * s, 0));
  const head = mesh(new THREE.SphereGeometry(1.6 * s, 16, 12), t.colors[0], 0, 3.6 * s, 0);
  g.add(head);
  for (const x of [-0.6, 0.6]) {
    g.add(mesh(new THREE.SphereGeometry(0.4 * s, 10, 8), '#ffffff', x * s, 3.9 * s, 1.4 * s));
    g.add(mesh(new THREE.SphereGeometry(0.2 * s, 8, 6), '#212529', x * s, 3.9 * s, 1.75 * s));
  }
  const hub = new THREE.Group();
  hub.position.y = 2.6 * s;
  g.add(hub);
  const arms: THREE.Group[] = [];
  const cars: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const holder = new THREE.Group();
    holder.rotation.y = (i / 6) * Math.PI * 2;
    const arm = new THREE.Group();
    arm.add(mesh(box(4.5 * s, 0.4 * s, 0.4 * s), t.colors[0], 2.25 * s, 0, 0));
    const car = new THREE.Group();
    car.position.set(4.5 * s, -0.9 * s, 0);
    car.add(mesh(cyl(0.12, 0.12, 1, 6), '#adb5bd', 0, 0.5 * s, 0));
    for (let k = 0; k < 2; k++) car.add(mesh(box(1.1, 0.7, 0.9), t.colors[1], k ? 0.7 : -0.7, -0.3, 0));
    arm.add(car);
    holder.add(arm);
    hub.add(holder);
    arms.push(arm);
    cars.push(car);
  }
  let ang = 0, wave = 0, spin = 0;
  return {
    group: g,
    top: 6 * s,
    update(phase, running, dt) {
      const v = spinUp(phase, running);
      ang += v * dt * 1.1;
      wave += v * dt * 1.6;
      spin += v * dt * 2.5;
      hub.rotation.y = ang;
      arms.forEach((a, i) => (a.rotation.z = Math.sin(wave + i * 1.05) * 0.35 * v + 0.05));
      cars.forEach((c, i) => (c.rotation.y = spin * (i % 2 ? 1 : -1)));
    },
    seat() {
      const p = new THREE.Vector3(-0.7, 0.4, 0);
      cars[0].localToWorld(p);
      g.worldToLocal(p);
      return { pos: p };
    },
  };
}

// ---------------------------------------------------------------- coasters and flumes

function coaster(t: RideType, flume: boolean): RideModel {
  const g = new THREE.Group();
  const tr: Track = makeTrack(t.track!, flume);
  const M_ = tr.pts.length - 1;
  const gold = !!t.track!.gold;
  const railCol = gold ? '#fcc419' : t.colors[0];

  // Supports (where the track is upright and off the ground).
  const sup: THREE.BufferGeometry[] = [];
  const step = Math.max(3, Math.round(4 * (M_ / tr.length)));
  for (let i = 0; i < M_; i += step) {
    const p = tr.pts[i];
    if (p.y < 1.6 || tr.up[i].y < 0.8) continue;
    sup.push(beamGeo(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, p.y - 0.4, p.z), flume ? 0.35 : 0.3));
  }
  if (sup.length) g.add(merged(sup, flume ? '#8b5a2b' : t.colors[1]));

  if (flume) {
    // A U-shaped wooden channel with water in it.
    const pos: number[] = [], wpos: number[] = [];
    const W = 1.2, Hh = 0.7;
    for (let i = 0; i < M_; i++) {
      const j = i + 1;
      const corners = (k: number) => {
        const p = tr.pts[k], s = tr.side[k], u = tr.up[k];
        const at = (x: number, y: number) => p.clone().addScaledVector(s, x).addScaledVector(u, y);
        return [at(-W, Hh), at(-W, 0), at(W, 0), at(W, Hh), at(-W + 0.1, 0.3), at(W - 0.1, 0.3)];
      };
      const A = corners(i), B = corners(j);
      for (const [a, b] of [[0, 1], [1, 2], [2, 3]]) {
        for (const v of [A[a], B[a], B[b], A[a], B[b], A[b]]) pos.push(v.x, v.y, v.z);
      }
      for (const v of [A[4], B[4], B[5], A[4], B[5], A[5]]) wpos.push(v.x, v.y, v.z);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.computeVertexNormals();
    const ch = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: t.colors[0], side: THREE.DoubleSide }));
    g.add(ch);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.computeVertexNormals();
    g.add(new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: t.colors[1], side: THREE.DoubleSide })));
    // A splash pool at the bottom of the big drop.
    g.add(mesh(cyl(4, 4, 0.2, 20), t.colors[1], 0, 0.1, -t.track!.b));
  } else {
    for (const off of [-0.55, 0.55]) {
      const rail = new THREE.CatmullRomCurve3(tr.pts.slice(0, M_).map((p, i) => p.clone().addScaledVector(tr.side[i], off)), true);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(rail, M_, 0.12, 6, true), M(railCol)));
    }
    const ties: THREE.BufferGeometry[] = [];
    for (let i = 0; i < M_; i += 1) {
      const p = tr.pts[i].clone().addScaledVector(tr.up[i], -0.15);
      ties.push(beamGeo(p.clone().addScaledVector(tr.side[i], -0.65), p.clone().addScaledVector(tr.side[i], 0.65), 0.15));
    }
    g.add(merged(ties, '#495057'));
  }

  // The station: a platform with a roof by the track at the start.
  const st = tr.pts[0];
  g.add(mesh(box(8, 0.6, 2.4), '#ced4da', st.x, 0.3, st.z + 2));
  g.add(mesh(box(8.4, 0.25, 4), t.colors[1], st.x, 3.4, st.z + 1));
  for (const x of [-3.8, 3.8]) g.add(mesh(box(0.25, 3, 0.25), '#ffffff', st.x + x, 1.9, st.z + 2.9));

  // The train.
  const nCars = flume ? 1 : Math.min(6, Math.max(2, Math.round(t.riders / 4)));
  const cars: THREE.Group[] = [];
  const spacing = 1.9;
  for (let i = 0; i < nCars; i++) {
    const c = new THREE.Group();
    if (flume) {
      c.add(mesh(box(1.6, 0.8, 3.2), '#8b5a2b', 0, 0.6, 0));
      c.add(mesh(box(1.2, 0.3, 2.6), '#5c3d1e', 0, 1.0, 0));
    } else {
      const col = gold ? '#fcc419' : i === 0 ? t.colors[1] : t.colors[0];
      c.add(mesh(box(1.3, 0.7, 1.7), col, 0, 0.55, 0));
      c.add(mesh(box(1.1, 0.5, 0.2), '#212529', 0, 1.05, -0.3));
      if (i === 0) c.add(mesh(box(1.3, 0.5, 0.4), col, 0, 0.8, 0.85));
    }
    g.add(c);
    cars.push(c);
  }
  const ds = tr.length / M_;
  const f = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), s: new THREE.Vector3() };
  const mtx = new THREE.Matrix4();
  let headIdx = 0;
  const place = (idx: number) => {
    headIdx = idx;
    cars.forEach((c, i) => {
      frameAt(tr, idx - (i * spacing) / ds, f);
      mtx.makeBasis(f.s.clone().negate(), f.u, f.t);
      c.quaternion.setFromRotationMatrix(mtx);
      c.position.copy(f.p);
    });
  };
  place(0);
  const maxY = Math.max(...tr.pts.map((p) => p.y));
  return {
    group: g,
    top: maxY + 3,
    lap: tr.lap,
    update(phase, running) {
      place(running ? trackIndexAt(tr, phase * tr.lap) : 0);
    },
    seat() {
      frameAt(tr, headIdx, f);
      return { pos: f.p.clone().addScaledVector(f.u, 1.5), dir: f.t.clone(), up: f.u.clone() };
    },
  };
}

// ----------------------------------------------------------------

export function buildRide(t: RideType, level = 0): RideModel {
  const m = buildParts(t, level);
  const groups: THREE.Object3D[] = [];
  m.group.traverse((o) => o.type === 'Group' && groups.push(o));
  for (const g of groups) bakeStatic(g);
  return m;
}

/** Merge the meshes sitting right in a group (they never move against it) into one mesh per colour,
 *  so a ride is a few draw calls instead of dozens. Moving parts live in sub-groups or are marked `keep`. */
function bakeStatic(g: THREE.Object3D) {
  const byMat = new Map<THREE.Material, THREE.Mesh[]>();
  for (const o of g.children) {
    if (!(o instanceof THREE.Mesh) || o.userData.keep || Array.isArray(o.material)) continue;
    const list = byMat.get(o.material) ?? [];
    list.push(o);
    byMat.set(o.material, list);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const x = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      if (!x.getAttribute('uv')) return null;
      return x;
    });
    if (geos.some((x) => !x)) continue;
    const merged = mergeGeometries(geos as THREE.BufferGeometry[]);
    if (!merged) continue;
    for (const m of list) {
      g.remove(m);
      m.geometry.dispose();
    }
    g.add(new THREE.Mesh(merged, mat));
  }
}

function buildParts(t: RideType, level: number): RideModel {
  switch (t.kind) {
    case 'slide': return slide(t);
    case 'stand': return stand(t);
    case 'carousel': return carousel(t);
    case 'cups': return cups(t);
    case 'drop': return drop(t, level);
    case 'swings': return swings(t);
    case 'bumper': return bumper(t);
    case 'ship': return ship(t);
    case 'ferris': return ferris(t);
    case 'octopus': return octopus(t);
    case 'coaster': return coaster(t, false);
    case 'flume': return coaster(t, true);
  }
}

/** Throw away a model's geometry (materials are shared and kept). */
export function disposeModel(g: THREE.Object3D) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
    if (o instanceof THREE.Sprite) o.material.dispose();
  });
}
