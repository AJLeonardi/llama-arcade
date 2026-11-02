// Cars, built from their side outline (sim/car.ts): the painted body pushed out across the car's width with
// rounded edges and arches cut over the wheels, a glass cabin with a painted roof, wheels, lights, bumpers.
// Car space: +z is the nose, +x is the car's left, y up, the ground at y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAR_TYPES, type Car } from '../sim/car';

export interface CarParts {
  paint: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  chrome: THREE.BufferGeometry[];
  head: THREE.BufferGeometry[];
  tail: THREE.BufferGeometry[];
  /** One wheel (tyre + rim), centred on its axle, and where the four go. */
  tyre: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  wheelAt: THREE.Vector3[];
}

/** A side outline pushed out across the car, centred, with rounded edges. */
function extrude(pts: [number, number][], width: number, round: number, segs = 3) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  const depth = Math.max(0.01, width - round * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: round, bevelSize: round * 0.8, bevelOffset: -round * 0.8, bevelSegments: segs, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  g.deleteAttribute('uv');
  return g;
}

const made = new Map<string, CarParts>();

/** A car's parts. `low` is the cheaper version for the many parked cars (fewer curves, plain wheels). */
export function carParts(type: number, low = false): CarParts {
  const hit = made.get(`${type}${low}`);
  if (hit) return hit;
  const t = CAR_TYPES[type];
  const L = t.length, W = t.width, R = t.wheelR;
  const parts: CarParts = { paint: [], glass: [], dark: [], chrome: [], head: [], tail: [], tyre: new THREE.BufferGeometry(), rim: new THREE.BufferGeometry(), wheelAt: [] };
  // The body: along the bottom from the back, with an arch over each wheel, then up and over the outline.
  const [rear, front, ...top] = t.body;
  const bottom = rear[1];
  const out: [number, number][] = [rear];
  const arch = R + 0.07;
  for (const w of t.wheels) {
    const dy = bottom - R;
    if (Math.abs(dy) >= arch) continue;
    const half = Math.sqrt(arch * arch - dy * dy);
    const a0 = Math.atan2(dy, -half), a1 = Math.atan2(dy, half);
    // From the back of the arch over the top to its front (the angle going down, through 90°).
    let da = a1 - a0;
    if (da > 0) da -= Math.PI * 2;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (da * i) / 10;
      out.push([w + Math.cos(a) * arch, R + Math.sin(a) * arch]);
    }
  }
  // Up the nose, over the hood, roof line and trunk: a smooth curve through the outline's corners.
  const curve = new THREE.SplineCurve([front, ...top].map(([a, b]) => new THREE.Vector2(a, b)));
  for (const p of curve.getPoints(top.length * (low ? 3 : 8))) out.push([p.x, p.y]);
  const round = Math.min(0.16, W * 0.08);
  parts.paint.push(extrude(out, W, round, low ? 1 : 3));
  // Glass cabin and its roof.
  parts.glass.push(extrude(t.cabin, t.cabinWidth, 0.06, low ? 1 : 3));
  const [cf, ct, rt, cr] = t.cabin;
  parts.paint.push(extrude([[ct[0] + 0.05, ct[1] - 0.06], [ct[0] - 0.02, ct[1] + 0.03], [rt[0] + 0.02, rt[1] + 0.03], [rt[0] - 0.05, rt[1] - 0.06]], t.cabinWidth + 0.04, 0.04, low ? 1 : 3));
  // Pillars between the windows.
  const mid = (cf[0] + cr[0]) / 2 - 0.1;
  const pillarTop = ct[1] + ((rt[1] - ct[1]) * (ct[0] - mid)) / (ct[0] - rt[0] || 1);
  for (const x of [-1, 1]) {
    parts.paint.push(new THREE.BoxGeometry(0.03, pillarTop - cf[1], 0.12).translate((x * t.cabinWidth) / 2 + x * 0.04, (pillarTop + cf[1]) / 2, mid));
  }
  // Bumpers, grille, mirrors, lights.
  const nose = front[0], tailX = rear[0];
  parts.dark.push(new THREE.BoxGeometry(W * 0.96, 0.16, 0.18).translate(0, bottom + 0.1, nose + 0.02));
  parts.dark.push(new THREE.BoxGeometry(W * 0.96, 0.16, 0.18).translate(0, bottom + 0.1, tailX - 0.02));
  const grilleY = (bottom + t.body[2][1]) / 2 + 0.05;
  parts.dark.push(new THREE.BoxGeometry(W * 0.42, 0.14, 0.05).translate(0, grilleY, nose + 0.05));
  for (const x of [-1, 1]) {
    parts.head.push(new THREE.BoxGeometry(W * 0.2, 0.09, 0.06).translate(x * W * 0.33, grilleY + 0.04, nose + 0.03));
    parts.tail.push(new THREE.BoxGeometry(W * 0.2, 0.08, 0.06).translate(x * W * 0.34, (bottom + t.body[t.body.length - 1][1]) / 2 + 0.12, tailX - 0.03));
    parts.paint.push(new THREE.BoxGeometry(0.16, 0.09, 0.12).translate(x * (t.cabinWidth / 2 + 0.12), cf[1] + 0.12, cf[0] - 0.15));
    parts.chrome.push(new THREE.BoxGeometry(0.02, 0.025, 0.25).translate(x * (W / 2 + 0.005), (bottom + t.body[2][1]) / 2 + 0.12, mid - 0.4)); // door handles
  }
  // The steering wheel, in front of the driver's seat.
  const [sAlong, sUp, sLeft] = t.seat;
  parts.dark.push(new THREE.TorusGeometry(0.17, 0.022, 6, 18).rotateX(0.35).translate(sLeft, sUp + 0.5, sAlong + 0.47));
  if (t.extra === 'bed') {
    parts.dark.push(new THREE.BoxGeometry(W - 0.25, 0.05, 2.9).translate(0, top[top.length - 1][1] + 0.005, -1.15));
    for (const x of [-1, 1]) parts.paint.push(new THREE.BoxGeometry(0.1, 0.32, 3.3).translate(x * (W / 2 - 0.05), top[top.length - 1][1] + 0.14, -1.0));
    parts.paint.push(new THREE.BoxGeometry(W, 0.32, 0.1).translate(0, top[top.length - 1][1] + 0.14, tailX + 0.05));
  }
  if (t.extra === 'spoiler') {
    parts.paint.push(new THREE.BoxGeometry(W * 0.9, 0.04, 0.32).translate(0, 1.08, tailX + 0.25));
    for (const x of [-1, 1]) parts.dark.push(new THREE.BoxGeometry(0.05, 0.24, 0.1).translate(x * W * 0.32, 0.95, tailX + 0.28));
  }
  if (t.extra === 'monster') {
    // A big frame and suspension under the body.
    parts.dark.push(new THREE.BoxGeometry(W * 0.5, 0.3, L * 0.8).translate(0, 1.05, 0));
    for (const w of t.wheels) parts.dark.push(new THREE.BoxGeometry(W - 0.6, 0.14, 0.14).translate(0, R, w));
    for (const w of t.wheels) for (const x of [-1, 1]) parts.chrome.push(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8).rotateZ(x * 0.5).translate(x * 0.6, R + 0.35, w));
  }
  // The wheel: a tyre with rounded shoulders, a shiny rim with spokes.
  const tyreProfile: THREE.Vector2[] = [];
  const hw = t.tyreW / 2;
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    tyreProfile.push(new THREE.Vector2(R - 0.04 + Math.cos(a) * 0.04, Math.sin(a) * hw));
  }
  tyreProfile.unshift(new THREE.Vector2(R * 0.6, -hw));
  tyreProfile.push(new THREE.Vector2(R * 0.6, hw));
  parts.tyre = low ? new THREE.CylinderGeometry(R, R, t.tyreW, 12).rotateZ(Math.PI / 2) : new THREE.LatheGeometry(tyreProfile, 22).rotateZ(Math.PI / 2);
  parts.tyre.deleteAttribute('uv');
  const rimParts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(R * 0.62, R * 0.62, t.tyreW * (low ? 1.04 : 0.7), low ? 8 : 18).rotateZ(Math.PI / 2)];
  for (let i = 0; i < (low ? 0 : 5); i++) {
    const a = (i / 5) * Math.PI * 2;
    rimParts.push(new THREE.BoxGeometry(0.04, R * 1.1, 0.06).rotateX(a).translate(0, 0, 0));
  }
  parts.rim = mergeGeometries(rimParts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g)));
  const tx = W / 2 - t.tyreW / 2 - 0.03;
  for (const w of t.wheels) for (const x of [-1, 1]) parts.wheelAt.push(new THREE.Vector3(x * (tx + (t.extra === 'monster' ? 0.15 : 0)), R, w));
  made.set(`${type}${low}`, parts);
  return parts;
}

export const carMats = (() => {
  let m: { glass: THREE.Material; dark: THREE.Material; chrome: THREE.Material; tyre: THREE.Material; head: THREE.MeshStandardMaterial; tail: THREE.MeshStandardMaterial } | null = null;
  return () =>
    (m ??= {
      glass: new THREE.MeshPhysicalMaterial({ color: 0x1a232c, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.6, envMapIntensity: 1.6 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.15, metalness: 1 }),
      tyre: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9 }),
      head: new THREE.MeshStandardMaterial({ color: 0xf4f6ff, emissive: 0xfff4dd, emissiveIntensity: 0.2, roughness: 0.2 }),
      tail: new THREE.MeshStandardMaterial({ color: 0x8a0f0f, emissive: 0xff2010, emissiveIntensity: 0.3, roughness: 0.3 }),
    });
})();

export function paintMaterial(color: string) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 });
}

/** A car you can drive: the body and four turning wheels (front ones steer). */
export class CarModel {
  readonly root = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private paint: THREE.MeshPhysicalMaterial;
  readonly head: THREE.MeshStandardMaterial;

  constructor(readonly type: number, color = CAR_TYPES[type].color) {
    const p = carParts(type), M = carMats();
    this.paint = paintMaterial(color);
    // Headlights get their own material so this car's can glow at night.
    this.head = M.head.clone();
    const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
      if (!geos.length) return;
      const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => (x.hasAttribute('uv') && x.deleteAttribute('uv'), x)));
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = shadow;
      this.root.add(mesh);
    };
    add(p.paint, this.paint);
    add(p.glass, M.glass, false);
    add(p.dark, M.dark);
    add(p.chrome, M.chrome, false);
    add(p.head, this.head, false);
    add(p.tail, M.tail, false);
    for (const at of p.wheelAt) {
      const w = new THREE.Group();
      w.position.copy(at);
      const spin = new THREE.Group();
      const tyre = new THREE.Mesh(p.tyre, M.tyre);
      tyre.castShadow = true;
      spin.add(tyre, new THREE.Mesh(p.rim, M.chrome));
      w.add(spin);
      this.root.add(w);
      this.wheels.push(w);
    }
  }

  /** Puts it where the car is, turns the wheels. */
  update(c: Car) {
    this.root.position.set(c.x, 0, c.z);
    this.root.rotation.y = c.heading;
    const fronts = CAR_TYPES[this.type].wheels[1];
    for (const w of this.wheels) {
      w.children[0].rotation.x = c.spin;
      w.rotation.y = w.position.z === fronts ? -c.steer : 0;
    }
  }

  setLights(on: number) {
    this.head.emissiveIntensity = 0.2 + on * 3;
  }
}
