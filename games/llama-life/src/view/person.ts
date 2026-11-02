// A person, built from smooth shapes like 3D Skate's skater (lathe-shaped limbs aimed joint to joint, two-bone
// legs and arms), posed every frame: standing, walking, running, jumping, swimming, sitting in a car, lying in bed.
// Person space: facing +z, their left is +x, feet on y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fabric } from './textures';
import { HAIR, PANTS, SHIRT, SHOES, SKIN, type Look } from '../sim/life';

/**
 * A limb shaped like a real one: `prof` gives the radius at points along it (0 = the top joint, 1 = the
 * bottom one), with rounded ends. It hangs down from y = 0 to y = -len. `open` leaves the bottom open (sleeves).
 */
function shaped(prof: [number, number][], len: number, open = false) {
  const rAt = (t: number) => {
    for (let i = 1; i < prof.length; i++) {
      if (t <= prof[i][0]) {
        const [t0, r0] = prof[i - 1], [t1, r1] = prof[i];
        return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0 || 1);
      }
    }
    return prof[prof.length - 1][1];
  };
  const pts: THREE.Vector2[] = [];
  const r0 = rAt(0), r1 = rAt(1);
  if (!open) for (let i = 0; i < 4; i++) pts.push(new THREE.Vector2(r1 * Math.sin((i / 4) * Math.PI * 0.5), -len - r1 * 0.6 * Math.cos((i / 4) * Math.PI * 0.5)));
  const n = 10;
  for (let j = 0; j <= n; j++) {
    const t = 1 - j / n;
    pts.push(new THREE.Vector2(rAt(t), -t * len));
  }
  for (let i = 3; i >= 0; i--) pts.push(new THREE.Vector2(r0 * Math.sin((i / 4) * Math.PI * 0.5), r0 * 0.6 * Math.cos((i / 4) * Math.PI * 0.5)));
  return new THREE.LatheGeometry(pts, 14);
}

function cloth(kind: 'denim' | 'cotton', rough: number) {
  const f = fabric(kind);
  const map = f.map.clone(), normal = f.normal.clone();
  for (const t of [map, normal]) t.repeat.set(kind === 'denim' ? 5 : 6, kind === 'denim' ? 4 : 5);
  return new THREE.MeshPhysicalMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: rough, sheen: 0.6, sheenRoughness: 0.8, sheenColor: 0xffffff });
}

/** Many little geometries made into one (they share a material). */
function merged(list: THREE.BufferGeometry[]) {
  return mergeGeometries(list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n.hasAttribute('uv')) n.deleteAttribute('uv');
    return n;
  }));
}

interface Limb {
  g: THREE.Group;
  len: number;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const tmp = new THREE.Vector3();

/** Points a limb (built hanging down from its joint) from a to b, stretched to fit. */
function aim(l: Limb, a: THREE.Vector3, b: THREE.Vector3) {
  l.g.position.copy(a);
  tmp.subVectors(b, a);
  const d = tmp.length();
  l.g.quaternion.setFromUnitVectors(DOWN, tmp.divideScalar(d || 1));
  l.g.scale.set(1, d / l.len, 1);
}

/** Knee (or elbow) for a two-bone limb from a to c, bending toward `bend`. */
function joint(a: THREE.Vector3, c: THREE.Vector3, l1: number, l2: number, bend: THREE.Vector3, out: THREE.Vector3) {
  const d = Math.min(c.distanceTo(a), l1 + l2 - 1e-4);
  const ax = new THREE.Vector3().subVectors(c, a).normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const side = bend.clone().addScaledVector(ax, -bend.dot(ax)).normalize();
  return out.copy(a).addScaledVector(ax, x).addScaledVector(side, h);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export type PoseMode = 'stand' | 'sit' | 'lie' | 'swim' | 'air';

const THIGH = 0.44, SHIN = 0.43, UPPER = 0.29, LOWER = 0.26, TORSO = 0.56;

export class Person {
  /** Where they are and which way they face. */
  readonly root = new THREE.Group();
  /** Tipped over to lie down. */
  readonly body = new THREE.Group();
  private mats: Record<'skin' | 'shirt' | 'pants' | 'shoes' | 'hair', THREE.MeshStandardMaterial>;
  private hairs: THREE.Object3D[] = [];
  private torso: Limb;
  private head = new THREE.Group();
  private thighs: Limb[] = [];
  private shins: Limb[] = [];
  private feet: THREE.Group[] = [];
  private uppers: Limb[] = [];
  private lowers: Limb[] = [];
  private hands: THREE.Object3D[] = [];
  private knees: THREE.Mesh[] = [];
  private elbows: THREE.Mesh[] = [];
  private shoulders: THREE.Mesh[] = [];
  private phase = 0;
  private t = Math.random() * 10;

  constructor(look: Look, shadows = true) {
    const M = (c: string, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
    const skin = new THREE.MeshPhysicalMaterial({ roughness: 0.55, sheen: 0.3, sheenRoughness: 0.6, sheenColor: 0xffd8c8 });
    this.mats = { skin, shirt: cloth('cotton', 0.9), pants: cloth('denim', 0.85), shoes: M('#fff', 0.65), hair: M('#fff', 0.75) };
    this.root.add(this.body);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = shadows;
      parent.add(x);
      return x;
    };
    const limb = (prof: [number, number][], len: number, mat: THREE.Material, extra?: (g: THREE.Group) => void): Limb => {
      const g = new THREE.Group();
      mesh(shaped(prof, len), mat, g);
      extra?.(g);
      this.body.add(g);
      return { g, len };
    };
    const white = M('#f2f2f2', 0.9);
    const sole = merged([new THREE.BoxGeometry(0.104, 0.024, 0.28).translate(0, -0.066, 0.06), new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.03, 0.55, 0.9).translate(0, -0.054, 0.16)]);
    const upperShoe = merged([new THREE.CapsuleGeometry(0.048, 0.17, 4, 10).rotateX(Math.PI / 2).scale(1.05, 0.78, 1).translate(0, -0.028, 0.06), new THREE.CylinderGeometry(0.052, 0.05, 0.05, 10).translate(0, -0.005, -0.03)]);
    for (let i = 0; i < 2; i++) {
      this.thighs.push(limb([[0, 0.1], [0.3, 0.09], [0.85, 0.07], [1, 0.068]], THIGH, this.mats.pants));
      this.shins.push(limb([[0, 0.069], [0.5, 0.066], [1, 0.068]], SHIN, this.mats.pants));
      const ball = (r: number, m: THREE.Material, list: THREE.Mesh[]) => list.push(mesh(new THREE.SphereGeometry(r, 12, 8), m, this.body));
      ball(0.07, this.mats.pants, this.knees);
      ball(0.043, this.mats.skin, this.elbows);
      ball(0.064, this.mats.shirt, this.shoulders);
      const foot = new THREE.Group();
      mesh(upperShoe, this.mats.shoes, foot);
      mesh(sole, white, foot);
      this.body.add(foot);
      this.feet.push(foot);
      this.uppers.push(limb([[0, 0.05], [0.5, 0.046], [1, 0.039]], UPPER, this.mats.skin, (g) => {
        const sleeve = mesh(shaped([[0, 0.068], [1, 0.064]], 0.15, true), this.mats.shirt, g);
        void sleeve;
      }));
      this.lowers.push(limb([[0, 0.04], [0.3, 0.043], [1, 0.03]], LOWER, this.mats.skin));
      const hand = mesh(merged([new THREE.SphereGeometry(0.04, 10, 8).scale(0.95, 1.2, 0.55).translate(0, -0.035, 0), new THREE.CapsuleGeometry(0.017, 0.045, 3, 6).rotateZ(i ? -0.5 : 0.5).translate(i ? -0.03 : 0.03, -0.035, 0.012)]), this.mats.skin, this.body);
      this.hands.push(hand);
    }
    (this.mats.shirt as THREE.Material).side = THREE.DoubleSide;
    this.torso = limb([[0, 0.06], [1, 0.15]], TORSO, this.mats.shirt, (g) => {
      const shirt = g.children[0] as THREE.Mesh;
      shirt.geometry.dispose();
      shirt.geometry = shaped([[0, 0.06], [0.12, 0.14], [0.3, 0.165], [0.65, 0.15], [1, 0.142]], 0.47);
      shirt.scale.set(1.28, 1, 0.75);
      const pelvis = mesh(new THREE.SphereGeometry(0.17, 18, 12), this.mats.pants, g);
      pelvis.scale.set(1.16, 0.78, 0.86);
      pelvis.position.y = -0.53;
      const belt = mesh(new THREE.CylinderGeometry(0.163, 0.163, 0.035, 16), M('#2a211b', 0.5), g);
      belt.scale.set(1.17, 1, 0.83);
      belt.position.y = -0.47;
    });
    // Head: one mesh per material (skin, eyes, irises, lips, brows).
    const skinParts = [
      new THREE.CylinderGeometry(0.043, 0.05, 0.11, 10).translate(0, 0.05, 0),
      new THREE.SphereGeometry(0.103, 24, 16).scale(0.88, 1.05, 0.98).translate(0, 0.185, 0),
      new THREE.SphereGeometry(0.07, 16, 12).scale(1.05, 0.85, 1).translate(0, 0.125, 0.03),
      new THREE.ConeGeometry(0.016, 0.042, 8).rotateX(Math.PI / 2).translate(0, 0.162, 0.1),
    ];
    const eyes: THREE.BufferGeometry[] = [], irises: THREE.BufferGeometry[] = [], brows: THREE.BufferGeometry[] = [];
    for (const x of [-0.033, 0.033]) {
      eyes.push(new THREE.SphereGeometry(0.015, 10, 8).translate(x, 0.19, 0.083));
      irises.push(new THREE.SphereGeometry(0.0085, 8, 6).translate(x, 0.19, 0.097));
      brows.push(new THREE.BoxGeometry(0.034, 0.007, 0.012).rotateZ(x > 0 ? -0.12 : 0.12).translate(x, 0.212, 0.091));
      skinParts.push(new THREE.SphereGeometry(0.024, 8, 6).scale(0.45, 1, 0.75).translate(x * 2.75, 0.18, -0.005));
    }
    mesh(merged(skinParts), this.mats.skin, this.head);
    mesh(merged(eyes), M('#f4f1ec', 0.3), this.head);
    mesh(merged(irises), M('#3b2a1e', 0.15), this.head);
    mesh(merged(brows), this.mats.hair, this.head);
    mesh(new THREE.CapsuleGeometry(0.006, 0.026, 3, 6).rotateZ(Math.PI / 2).translate(0, 0.128, 0.093), M('#b5655a', 0.6), this.head);
    // Hair styles: short, long, ponytail, curly, buzz.
    const cap = (r = 0.11, cut = 0.58) => new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * cut).scale(0.93, 1.05, 1.04).rotateX(-0.32).translate(0, 0.19, -0.008);
    const fringe = () => new THREE.SphereGeometry(0.06, 12, 8).scale(1.45, 0.42, 0.75).rotateZ(0.12).translate(0.008, 0.252, 0.06);
    const styles: THREE.BufferGeometry[][] = [
      [cap(), fringe()],
      [cap(), fringe(), new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(1.02, 1.9, 0.62).rotateX(Math.PI).translate(0, 0.25, -0.045)],
      [cap(), fringe(), new THREE.CapsuleGeometry(0.035, 0.16, 4, 8).rotateX(0.5).translate(0, 0.14, -0.15), new THREE.SphereGeometry(0.03, 8, 6).translate(0, 0.23, -0.115)],
      [cap(0.115), ...Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2, up = i % 2 ? 0.27 : 0.22;
        return new THREE.SphereGeometry(0.04, 8, 6).translate(Math.cos(a) * 0.085, up, Math.sin(a) * 0.085 - 0.01);
      })],
      [cap(0.106, 0.52)],
    ];
    for (const parts of styles) {
      const h = mesh(merged(parts), this.mats.hair, this.head);
      this.hairs.push(h);
    }
    this.body.add(this.head);
    this.setLook(look);
    this.pose('stand', 0, 0);
  }

  setLook(l: Look) {
    this.mats.skin.color.set(SKIN[l.skin] ?? SKIN[0]);
    this.mats.hair.color.set(HAIR[l.hair] ?? HAIR[0]);
    this.mats.shirt.color.set(SHIRT[l.shirt] ?? SHIRT[0]);
    this.mats.pants.color.set(PANTS[l.pants] ?? PANTS[0]);
    this.mats.shoes.color.set(SHOES[l.shoes] ?? SHOES[0]);
    this.hairs.forEach((h, i) => (h.visible = i === (l.hairStyle ?? 0)));
  }

  /**
   * Poses them. `speed` is how fast they're going (m/s) when standing/walking; `steer` turns the hands on the
   * wheel when sitting.
   */
  pose(mode: PoseMode, speed: number, dt: number, steer = 0) {
    this.t += dt;
    const k = Math.min(1, speed / 2); // 0 standing .. 1 walking
    const run = Math.max(0, Math.min(1, (speed - 2.5) / 3));
    const cadence = speed / (1.3 + speed * 0.22);
    this.phase = (this.phase + Math.PI * 2 * cadence * dt) % (Math.PI * 2);
    const ph = this.phase;
    const breathe = Math.sin(this.t * 1.6) * 0.006;
    this.body.rotation.set(mode === 'lie' ? -Math.PI / 2 : 0, 0, 0);

    let hips: THREE.Vector3, lean: number;
    const feet: THREE.Vector3[] = [], hands: THREE.Vector3[] = [];
    const kneeBend = V(0, 0, 1), elbowBend = V(0, 0, -1);
    if (mode === 'sit') {
      hips = V(0, 0.5, 0);
      lean = -0.12;
      for (const s of [1, -1]) feet.push(V(s * 0.12, 0.08, 0.62));
      for (const s of [1, -1]) hands.push(V(s * 0.17 + steer * 0.05, 0.98 + s * steer * 0.06, 0.42));
    } else if (mode === 'lie') {
      hips = V(0, 0.95, 0);
      lean = 0;
      for (const s of [1, -1]) feet.push(V(s * 0.1, 0.07, 0.02));
      for (const s of [1, -1]) hands.push(V(s * 0.24, 0.85, 0.08));
    } else if (mode === 'air') {
      hips = V(0, 0.9, 0);
      lean = 0.1;
      feet.push(V(0.11, 0.22, 0.12), V(-0.11, 0.3, -0.12));
      for (const s of [1, -1]) hands.push(V(s * 0.42, 1.55, 0.05));
    } else {
      const swim = mode === 'swim';
      const bob = Math.cos(ph * 2) * 0.025 * k;
      hips = V(Math.sin(ph) * 0.015 * k, 0.93 - 0.02 * k - 0.07 * run + bob + breathe, 0);
      lean = 0.04 + 0.22 * run;
      const stride = (0.22 + 0.2 * run) * k;
      for (let i = 0; i < 2; i++) {
        const s = i ? -1 : 1, p = ph + i * Math.PI;
        const lift = Math.max(0, Math.cos(p)) * (0.1 + 0.18 * run) * k;
        feet.push(V(s * 0.1, 0.075 + lift, Math.sin(p) * stride));
      }
      for (let i = 0; i < 2; i++) {
        const s = i ? -1 : 1, p = ph + i * Math.PI;
        if (swim) {
          // Breaststroke: hands sweep forward and round.
          const a = this.t * 3;
          hands.push(V(s * (0.2 + Math.max(0, Math.sin(a)) * 0.35), 1.18, 0.35 + Math.cos(a) * 0.2));
        } else {
          const swing = -Math.sin(p) * (0.18 + 0.15 * run) * k;
          hands.push(V(s * (0.2 + 0.02 * run), 0.82 + 0.18 * run + Math.abs(swing) * 0.2, swing + 0.04));
        }
      }
    }
    // The torso, then the legs and arms from it.
    const neck = hips.clone().add(V(0, Math.cos(lean), Math.sin(lean)).multiplyScalar(TORSO));
    aim(this.torso, neck, hips);
    this.torso.g.scale.set(1, 1, 1);
    this.torso.g.quaternion.setFromUnitVectors(DOWN, tmp.subVectors(hips, neck).normalize());
    this.head.position.copy(neck);
    this.head.rotation.set(-lean * 0.6 + (mode === 'swim' ? -0.3 : 0), 0, 0);
    const knee = new THREE.Vector3(), elbow = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const hip = hips.clone().add(V(s * 0.09, 0, 0));
      joint(hip, feet[i], THIGH, SHIN, kneeBend, knee);
      aim(this.thighs[i], hip, knee);
      this.knees[i].position.copy(knee);
      aim(this.shins[i], knee, feet[i]);
      this.feet[i].position.copy(feet[i]);
      this.feet[i].rotation.set(mode === 'lie' ? -1.2 : mode === 'sit' ? -0.4 : 0, s * 0.08, 0);
      const shoulder = neck.clone().add(V(s * 0.185, -0.09, -0.02));
      joint(shoulder, hands[i], UPPER, LOWER, elbowBend.clone().add(V(s * 0.3, 0, 0)), elbow);
      aim(this.uppers[i], shoulder, elbow);
      this.elbows[i].position.copy(elbow);
      this.shoulders[i].position.copy(shoulder);
      aim(this.lowers[i], elbow, hands[i]);
      this.hands[i].position.copy(hands[i]);
      this.hands[i].quaternion.copy(this.lowers[i].g.quaternion);
    }
  }
}

/** Looks for the people you meet: the barista, the cashier, the teacher, people at work. */
export const NPC_LOOKS: Look[] = [
  { skin: 0, hair: 2, hairStyle: 1, shirt: 5, pants: 1, shoes: 1 },
  { skin: 2, hair: 0, hairStyle: 2, shirt: 2, pants: 1, shoes: 1 },
  { skin: 3, hair: 4, hairStyle: 3, shirt: 0, pants: 0, shoes: 0 },
  { skin: 1, hair: 5, hairStyle: 0, shirt: 4, pants: 3, shoes: 1 },
  { skin: 4, hair: 4, hairStyle: 4, shirt: 6, pants: 2, shoes: 1 },
  { skin: 0, hair: 3, hairStyle: 1, shirt: 7, pants: 0, shoes: 2 },
];
