// A ballplayer made of smooth shapes on a skeleton of joints (copied from Wolf Lodge's person, which is built
// like 3D Skate's skater), in a uniform: cap, jersey with a number on the back, baseball pants, socks, a glove
// and a bat. The arms reach for things with two-bone IK (hands on the bat, the ball, the glove), so the
// swing and the pitch are just paths for the hands plus a turn of the hips and shoulders.
// Faces +z; a right-hander, so the throwing hand is on -x.
import * as THREE from 'three';

export interface Look {
  skin: string;
  hair: string;
  jersey: string;
  trim: string;
  pants: string;
  num: number;
  /** Letters across the chest. */
  abbr: string;
}

// Body measurements (metres), a kid's; grown-ups are the same scaled up.
const HIP_Y = 0.7, THIGH = 0.3, SHIN = 0.325, UPPER = 0.22, FORE = 0.2;
const HIP_X = 0.072, SHOULDER_X = 0.14, SHOULDER_Y = 0.33;
const SPINE_Y = 0.09;

function limb(len: number, r0: number, r1: number, bulge = 0.12, seg = 10) {
  const pts: THREE.Vector2[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const cap = Math.sin(Math.min(1, Math.min(t, 1 - t) * 5) * (Math.PI / 2));
    const r = (r0 + (r1 - r0) * t) * (1 + bulge * Math.sin(Math.PI * Math.min(1, t * 1.5))) * (0.35 + 0.65 * cap);
    pts.push(new THREE.Vector2(Math.max(0.002, r), -len * t + (t === 0 ? 0.01 : 0)));
  }
  pts.unshift(new THREE.Vector2(0.0001, 0.01 + r0 * 0.4));
  pts.push(new THREE.Vector2(0.0001, -len - r1 * 0.4));
  return new THREE.LatheGeometry(pts.reverse(), seg);
}

function trunk(profile: [number, number][], depth = 0.7) {
  const g = new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r, y)), 18);
  g.scale(1, 1, depth);
  return g;
}

function mat(color: string, rough = 0.75, sheen = 0) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, sheen, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).multiplyScalar(1.4) });
}

/** The jersey: team colour, trim down the sides, letters on the front, the number on the back. */
function jerseyTexture(look: Look) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = look.jersey;
  g.fillRect(0, 0, 256, 128);
  // Lathe u: 0 = front, 0.5 = back. v: 0 = waist (canvas bottom), 1 = neck.
  g.fillStyle = look.trim;
  g.font = 'bold 30px Arial Black, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 4;
  g.strokeStyle = '#ffffff';
  const num = String(look.num);
  g.font = 'bold 54px Arial Black, Arial, sans-serif';
  g.strokeText(num, 128, 58);
  g.fillText(num, 128, 58);
  g.font = 'bold 22px Arial Black, Arial, sans-serif';
  // Front letters wrap round u = 0 / 1.
  for (const x of [0, 256]) {
    g.strokeText(look.abbr, x, 52);
    g.fillText(look.abbr, x, 52);
  }
  // Sleeve-edge / side stripes.
  g.fillRect(62, 0, 4, 128);
  g.fillRect(190, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface Leg { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group }
interface Arm { shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group }

export type PoseMode = 'walk' | 'stand' | 'bat' | 'pitch' | 'ready' | 'squat' | 'reach' | 'cheer' | 'sad';

export interface PoseInput {
  mode: PoseMode;
  /** Walk/run cycle (radians, 2π per stride). */
  phase?: number;
  speed?: number;
  /** Seconds, for breathing and fidgets. */
  t: number;
  /** Progress of a swing or a pitch, 0..1. */
  s?: number;
  /** Where the glove hand should go (root space), for the catcher and catches. */
  glove?: THREE.Vector3;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Key = [number, THREE.Vector3];
/** Smoothly through keyframes [s, value]. */
function keys(k: Key[], s: number, out = new THREE.Vector3()) {
  if (s <= k[0][0]) return out.copy(k[0][1]);
  for (let i = 1; i < k.length; i++) {
    if (s <= k[i][0]) {
      const u = (s - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      const e = u * u * (3 - 2 * u);
      return out.lerpVectors(k[i - 1][1], k[i][1], e);
    }
  }
  return out.copy(k[k.length - 1][1]);
}
function num(k: [number, number][], s: number) {
  if (s <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (s <= k[i][0]) {
      const u = (s - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * u * u * (3 - 2 * u);
    }
  }
  return k[k.length - 1][1];
}

// The swing (right-handed batter: the pitcher is on his left, +x; the plate in front, +z). Hands are in root
// space; the bat points from the hands toward the barrel. Contact is at s = 0.55.
const SWING_HANDS: Key[] = [
  [0, V(-0.17, 1.0, 0.12)], [0.3, V(-0.16, 0.96, 0.08)], [0.45, V(-0.06, 0.86, 0.22)], [0.55, V(0.05, 0.8, 0.32)],
  [0.75, V(0.22, 0.86, 0.22)], [1, V(0.14, 1.04, 0.0)],
];
const SWING_BAT: Key[] = [
  [0, V(-0.45, 0.85, -0.25)], [0.3, V(-0.6, 0.75, -0.3)], [0.45, V(-0.85, 0.05, 0.4)], [0.55, V(0, -0.1, 1)],
  [0.75, V(0.9, 0.15, 0.35)], [1, V(0.25, 0.4, -0.9)],
];
// The pitch: the throwing hand's path (root space, facing +z). Release at s = 0.68.
export const RELEASE_S = 0.68;
const PITCH_HAND: Key[] = [
  [0, V(-0.02, 1.0, 0.2)], [0.3, V(-0.02, 1.02, 0.18)], [0.45, V(-0.35, 0.95, -0.2)], [0.56, V(-0.42, 1.45, -0.42)],
  [0.64, V(-0.3, 1.62, -0.05)], [RELEASE_S, V(-0.2, 1.5, 0.42)], [0.8, V(0.05, 0.8, 0.5)], [1, V(0.2, 0.62, 0.38)],
];
const PITCH_GLOVE: Key[] = [
  [0, V(0.02, 1.0, 0.22)], [0.3, V(0.02, 1.02, 0.2)], [0.45, V(0.4, 1.15, 0.3)], [0.6, V(0.3, 1.2, 0.45)],
  [RELEASE_S, V(0.2, 1.0, 0.18)], [1, V(0.15, 0.95, 0.15)],
];

export class Person {
  readonly root = new THREE.Group();
  private readonly pelvis = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly legs: Leg[] = [];
  private readonly arms: Arm[] = [];
  readonly bat: THREE.Group;
  readonly ball: THREE.Mesh;
  private readonly glove: THREE.Mesh;
  private readonly helmet: THREE.Group;
  private readonly cap: THREE.Group;
  private readonly M: Record<'skin' | 'hair', THREE.MeshPhysicalMaterial>;
  private readonly jersey: THREE.MeshPhysicalMaterial;

  constructor(public look: Look, simple = false) {
    const M = {
      skin: mat(look.skin, 0.6, 0.3),
      hair: mat(look.hair, 0.55, 0.6),
      jersey: new THREE.MeshPhysicalMaterial({ map: jerseyTexture(look), roughness: 0.85, sheen: 0.8, sheenRoughness: 0.8, sheenColor: new THREE.Color(look.jersey).multiplyScalar(1.3) }),
      sleeve: mat(look.jersey, 0.85, 0.8),
      pants: mat(look.pants, 0.9, 0.7),
      trim: mat(look.trim, 0.6, 0.4),
      shoes: mat('#1a1a1a', 0.45),
      leather: mat('#8a5226', 0.55, 0.2),
    };
    this.M = M;
    this.jersey = M.jersey;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = !simple;
      parent.add(mesh);
      return mesh;
    };

    this.root.add(this.pelvis);
    this.pelvis.position.y = HIP_Y;
    add(this.pelvis, trunk([[-0.1, 0.06], [-0.07, 0.112], [0, 0.118], [0.06, 0.112], [0.1, 0.104]], 0.72), M.pants);
    this.spine.position.y = SPINE_Y;
    this.pelvis.add(this.spine);
    add(this.spine, trunk([[-0.02, 0.106], [0.06, 0.103], [0.14, 0.12], [0.2, 0.128], [0.25, 0.124], [0.285, 0.104], [0.3, 0.064], [0.31, 0.03]], 0.66), M.jersey);
    // Belt.
    add(this.spine, trunk([[-0.035, 0.112], [-0.01, 0.112]], 0.7), M.trim);
    this.neck.position.y = SHOULDER_Y - 0.02;
    this.spine.add(this.neck);
    add(this.neck, new THREE.CylinderGeometry(0.034, 0.038, 0.09, 8), M.skin, 0, 0.03, 0);
    const head = new THREE.Group();
    head.position.y = 0.155;
    this.neck.add(head);
    const skull = add(head, new THREE.SphereGeometry(0.098, simple ? 12 : 22, simple ? 9 : 16), M.skin);
    skull.scale.set(0.9, 1.06, 0.98);
    const jaw = add(head, new THREE.SphereGeometry(0.075, 14, 10), M.skin, 0, -0.04, 0.018);
    jaw.scale.set(0.95, 0.85, 0.95);
    if (!simple) {
      add(head, new THREE.SphereGeometry(0.014, 8, 6), M.skin, 0, -0.008, 0.096);
      const white = new THREE.MeshStandardMaterial({ color: '#f6f3ee', roughness: 0.2 });
      const iris = new THREE.MeshStandardMaterial({ color: '#2b1a0e', roughness: 0.1 });
      for (const s of [-1, 1]) {
        const ear = add(head, new THREE.SphereGeometry(0.022, 8, 6), M.skin, s * 0.088, 0, 0);
        ear.scale.set(0.45, 1, 0.75);
        add(head, new THREE.SphereGeometry(0.014, 10, 8), white, s * 0.034, 0.016, 0.083).scale.set(1, 0.85, 0.5);
        add(head, new THREE.SphereGeometry(0.008, 8, 6), iris, s * 0.034, 0.016, 0.09);
        const brow = add(head, new THREE.BoxGeometry(0.03, 0.006, 0.008), M.hair, s * 0.035, 0.038, 0.088);
        brow.rotation.z = s * -0.12;
      }
      const mouth = add(head, new THREE.TorusGeometry(0.018, 0.003, 4, 10, Math.PI), new THREE.MeshStandardMaterial({ color: '#a8463e' }), 0, -0.034, 0.088);
      mouth.rotation.z = Math.PI;
    }
    // Hair at the back and sides, under the cap.
    const hair = add(head, new THREE.SphereGeometry(0.103, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), M.hair, 0, 0.0, -0.012);
    hair.scale.set(0.93, 1.05, 1.02);
    hair.rotation.x = -0.9;
    // Cap: a dome and a brim. The batting helmet: a shiny bigger dome with an ear flap.
    this.cap = new THREE.Group();
    head.add(this.cap);
    const dome = add(this.cap, new THREE.SphereGeometry(0.106, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M.trim, 0, 0.03, -0.004);
    dome.scale.set(0.95, 0.9, 1.04);
    const brim = add(this.cap, new THREE.CylinderGeometry(0.075, 0.075, 0.008, 16, 1, false, -Math.PI / 2, Math.PI), M.trim, 0, 0.035, 0.08);
    brim.scale.set(1, 1, 0.85);
    brim.rotation.x = 0.12;
    this.helmet = new THREE.Group();
    head.add(this.helmet);
    const hm = new THREE.MeshPhysicalMaterial({ color: look.trim, roughness: 0.2, clearcoat: 1 });
    const hd = add(this.helmet, new THREE.SphereGeometry(0.12, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hm, 0, 0.012, -0.01);
    hd.scale.set(0.95, 0.95, 1.05);
    const flap = add(this.helmet, new THREE.SphereGeometry(0.06, 10, 8), hm, 0.085, -0.03, 0.0); // ear flap toward the pitcher
    flap.scale.set(0.4, 1, 1);
    add(this.helmet, new THREE.CylinderGeometry(0.07, 0.07, 0.008, 14, 1, false, -Math.PI / 2, Math.PI), hm, 0, 0.02, 0.09).scale.set(1, 1, 0.6);
    this.helmet.visible = false;

    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * HIP_X, -0.03, 0);
      this.pelvis.add(hip);
      add(hip, limb(THIGH, 0.064, 0.05, 0.1), M.pants);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      add(knee, limb(SHIN * 0.5, 0.052, 0.046, 0.05), M.pants);
      add(knee, limb(SHIN, 0.046, 0.032, 0.18), M.trim); // socks
      const ankle = new THREE.Group();
      ankle.position.y = -SHIN;
      knee.add(ankle);
      const shoeGeo = new THREE.SphereGeometry(0.05, 12, 8);
      shoeGeo.scale(0.8, 0.55, 1.75);
      shoeGeo.translate(0, -0.045, 0.045);
      add(ankle, shoeGeo, M.shoes);
      this.legs.push({ hip, knee, ankle });
    }
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * SHOULDER_X, SHOULDER_Y - 0.08, 0);
      this.spine.add(shoulder);
      add(shoulder, limb(UPPER * 0.55, 0.048, 0.044, 0), M.sleeve);
      add(shoulder, limb(UPPER, 0.04, 0.032, 0.15), M.skin);
      const elbow = new THREE.Group();
      elbow.position.y = -UPPER;
      shoulder.add(elbow);
      add(elbow, limb(FORE, 0.032, 0.024, 0.12), M.skin);
      const wrist = new THREE.Group();
      wrist.position.y = -FORE;
      elbow.add(wrist);
      const hand = add(wrist, new THREE.SphereGeometry(0.03, 10, 8), M.skin, 0, -0.035, 0.004);
      hand.scale.set(0.6, 1.25, 1);
      this.arms.push({ shoulder, elbow, wrist });
    }
    // Glove on the left hand, ball in the right.
    const gg = new THREE.SphereGeometry(0.075, 12, 10);
    gg.scale(0.55, 1.15, 1);
    this.glove = add(this.arms[1].wrist, gg, M.leather, 0.01, -0.06, 0.02);
    this.ball = add(this.arms[0].wrist, new THREE.SphereGeometry(0.037, 10, 8), new THREE.MeshStandardMaterial({ color: '#f7f4ec', roughness: 0.6 }), 0, -0.07, 0.03);
    this.ball.visible = false;
    // The bat: handle, knob, barrel (a lathe), placed by the swing.
    this.bat = new THREE.Group();
    const prof: [number, number][] = [[-0.02, 0], [-0.02, 0.02], [-0.008, 0.022], [0, 0.013], [0.3, 0.014], [0.5, 0.024], [0.68, 0.032], [0.8, 0.033], [0.83, 0.025], [0.835, 0]];
    const batGeo = new THREE.LatheGeometry(prof.map(([y, r]) => new THREE.Vector2(r, y)), 12);
    const wood = new THREE.MeshPhysicalMaterial({ color: '#c99a5c', roughness: 0.35, clearcoat: 0.6 });
    const bm = add(this.bat, batGeo, wood);
    bm.position.y = -0.05; // the bottom hand is just above the knob
    this.bat.visible = false;
    this.root.add(this.bat);
  }

  /** A different player in the same uniform: number, skin, hair. */
  setPlayer(num: number, skin: string, hair: string) {
    if (num !== this.look.num) {
      this.look = { ...this.look, num };
      this.jersey.map?.dispose();
      this.jersey.map = jerseyTexture(this.look);
      this.jersey.needsUpdate = true;
    }
    this.M.skin.color.set(skin);
    this.M.skin.sheenColor.set(skin);
    this.M.hair.color.set(hair);
  }

  setGear(g: { bat?: boolean; glove?: boolean; helmet?: boolean; ball?: boolean }) {
    if (g.bat !== undefined) this.bat.visible = g.bat;
    if (g.glove !== undefined) this.glove.visible = g.glove;
    if (g.helmet !== undefined) {
      this.helmet.visible = g.helmet;
      this.cap.visible = !g.helmet;
    }
    if (g.ball !== undefined) this.ball.visible = g.ball;
  }

  private reset() {
    this.pelvis.position.set(0, HIP_Y, 0);
    this.pelvis.rotation.set(0, 0, 0);
    this.spine.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    for (const g of this.legs) {
      g.hip.rotation.set(0, 0, 0);
      g.knee.rotation.set(0, 0, 0);
      g.ankle.rotation.set(0, 0, 0);
    }
    for (const a of this.arms) {
      a.shoulder.quaternion.identity();
      a.elbow.rotation.set(0, 0, 0);
      a.wrist.rotation.set(0, 0, 0);
    }
  }

  private static tmpM = new THREE.Matrix4();
  private static tmpV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  /** Put arm i's hand at a point in root space (two-bone IK; `pole` = which way the elbow points). */
  private reachTo(i: number, target: THREE.Vector3, pole: THREE.Vector3) {
    const a = this.arms[i];
    this.pelvis.updateMatrix();
    this.spine.updateMatrix();
    const m = Person.tmpM.multiplyMatrices(this.pelvis.matrix, this.spine.matrix).invert();
    const [t, d, e, u, w] = Person.tmpV;
    t.copy(target).applyMatrix4(m).sub(a.shoulder.position); // shoulder → hand, in spine space
    const pole2 = e.copy(pole).transformDirection(m);
    const reach = UPPER + FORE + 0.03;
    const L = Math.min(t.length(), reach * 0.995);
    d.copy(t).normalize();
    const cosA = (UPPER * UPPER + L * L - (FORE + 0.03) ** 2) / (2 * UPPER * L);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    // The direction the elbow bends toward, square to the arm line.
    e.copy(pole2).addScaledVector(d, -pole2.dot(d)).normalize();
    if (!isFinite(e.x)) e.set(0, 0, -1);
    u.copy(d).multiplyScalar(Math.cos(alpha)).addScaledVector(e, Math.sin(alpha)); // upper arm
    const elbowP = new THREE.Vector3().copy(u).multiplyScalar(UPPER);
    w.copy(d).multiplyScalar(L).sub(elbowP).normalize(); // forearm
    // Shoulder frame: local -y along the upper arm, the forearm bends toward local +z.
    const y = u.clone().negate();
    const z = w.clone().addScaledVector(u, -w.dot(u));
    if (z.lengthSq() < 1e-6) z.copy(e).negate();
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    a.shoulder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    a.elbow.rotation.set(-Math.acos(Math.max(-1, Math.min(1, u.dot(w)))), 0, 0);
  }

  pose(p: PoseInput) {
    this.reset();
    const L = this.legs, A = this.arms;
    const t = p.t, s = p.s ?? 0;
    const breathe = Math.sin(t * 1.6) * 0.012;
    switch (p.mode) {
      case 'walk':
      case 'stand':
        this.walk(p.phase ?? 0, p.speed ?? 0, t, breathe);
        break;
      case 'bat': {
        // Stance, a little leg lift as the pitch comes, stride, then turn and swing through.
        const lift = num([[0, 0], [0.12, 0.6], [0.3, 0.1], [0.4, 0]], s);
        const hipYaw = num([[0, -0.15], [0.35, -0.2], [0.55, 0.55], [0.8, 0.85], [1, 0.9]], s);
        const shYaw = num([[0, -0.15], [0.35, -0.25], [0.55, 0.25], [1, 0.75]], s);
        this.pelvis.position.y = HIP_Y - 0.07;
        this.pelvis.rotation.y = hipYaw;
        this.spine.rotation.y = shYaw;
        this.spine.rotation.x = 0.22 - s * 0.05;
        this.spine.rotation.z = num([[0, 0.05], [0.55, -0.12], [1, -0.05]], s);
        for (const [i, g] of L.entries()) {
          const side = i ? 1 : -1;
          g.hip.rotation.y = -hipYaw * 0.9;
          g.hip.rotation.z = side * (0.24 + (i ? -lift * 0.2 : 0));
          g.hip.rotation.x = -0.3 - (i ? lift : 0);
          g.knee.rotation.x = 0.45 + (i ? lift * 1.2 : 0) + (i ? 0 : num([[0.4, 0], [0.7, 0.35], [1, 0.45]], s));
          g.ankle.rotation.x = -0.15;
          g.ankle.rotation.z = -side * 0.2;
        }
        const hands = keys(SWING_HANDS, s);
        const dir = keys(SWING_BAT, s).normalize();
        hands.y -= 0.07;
        this.bat.position.copy(hands);
        this.bat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const top = hands.clone().addScaledVector(dir, 0.09);
        this.reachTo(1, hands, V(0.6, -0.6, -0.4)); // bottom (left) hand
        this.reachTo(0, top, V(-0.7, -0.7, -0.2));
        this.neck.rotation.y = Math.max(-0.2, 1.35 - hipYaw - shYaw);
        this.neck.rotation.x = 0.1;
        break;
      }
      case 'pitch': {
        // Set, leg kick, stride, arm over the top, follow through.
        const kick = num([[0.15, 0], [0.32, 1], [0.48, 0.2], [0.56, 0]], s);
        const stride = num([[0.4, 0], [0.6, 1]], s);
        const hipYaw = num([[0, 0], [0.2, -1.2], [0.5, -1.15], [RELEASE_S, 0.1], [1, 0.4]], s);
        this.pelvis.rotation.y = hipYaw;
        this.spine.rotation.y = num([[0.4, 0], [0.56, -0.3], [RELEASE_S, 0.4], [1, 0.5]], s);
        this.spine.rotation.x = num([[0, 0.05], [0.56, -0.05], [RELEASE_S, 0.45], [0.85, 0.7], [1, 0.5]], s);
        this.pelvis.position.y = HIP_Y - stride * 0.12;
        this.pelvis.position.z = stride * 0.32;
        for (const [i, g] of L.entries()) {
          g.hip.rotation.y = -hipYaw * 0.8;
          if (i) {
            // Front (left) leg: kick up, then reach toward the plate.
            g.hip.rotation.x = -kick * 1.45 - stride * 0.75;
            g.knee.rotation.x = kick * 1.6 + 0.15 + stride * 0.35;
            g.hip.rotation.z = 0.08;
          } else {
            g.hip.rotation.x = stride * 0.55;
            g.knee.rotation.x = 0.2 + stride * 0.5 + num([[RELEASE_S, 0], [1, 0.6]], s);
            g.hip.rotation.z = -0.08;
            g.ankle.rotation.x = stride * 0.4;
          }
        }
        this.reachTo(0, keys(PITCH_HAND, s), V(-0.8, -0.5, -0.6));
        this.reachTo(1, keys(PITCH_GLOVE, s), V(0.8, -0.6, -0.2));
        this.neck.rotation.y = -this.pelvis.rotation.y - this.spine.rotation.y;
        this.neck.rotation.x = -this.spine.rotation.x * 0.6;
        break;
      }
      case 'ready':
      case 'reach': {
        // Fielder: knees bent, weight forward, glove out front.
        this.pelvis.position.y = HIP_Y - 0.12 + breathe;
        this.spine.rotation.x = 0.55;
        for (const [i, g] of L.entries()) {
          g.hip.rotation.x = -0.6;
          g.hip.rotation.z = (i ? 1 : -1) * 0.22;
          g.knee.rotation.x = 0.85;
          g.ankle.rotation.x = -0.25;
        }
        if (p.mode === 'reach' && p.glove) {
          this.reachTo(1, p.glove, V(0.8, -0.5, -0.4));
          this.reachTo(0, p.glove.clone().add(V(-0.12, 0, 0)), V(-0.8, -0.5, -0.4));
          this.spine.rotation.x = Math.max(-0.2, 0.55 - Math.max(0, p.glove.y - 1) * 0.6);
        } else {
          this.reachTo(0, V(-0.17, 0.5, 0.32), V(-1, -0.2, -0.3));
          this.reachTo(1, V(0.17, 0.5, 0.32), V(1, -0.2, -0.3));
        }
        this.neck.rotation.x = -0.5;
        break;
      }
      case 'squat': {
        // Catcher: crouched, glove up as the target (or out to where the ball is).
        this.pelvis.position.y = 0.36;
        this.spine.rotation.x = 0.12;
        for (const [i, g] of L.entries()) {
          g.hip.rotation.x = -1.45;
          g.hip.rotation.z = (i ? 1 : -1) * 0.42;
          g.knee.rotation.x = 2.35;
          g.ankle.rotation.x = -0.75;
        }
        this.reachTo(1, p.glove ?? V(0.05, 0.75, 0.55), V(0.9, -0.4, -0.4));
        this.reachTo(0, V(-0.18, 0.42, 0.3), V(-1, -0.3, -0.3)); // throwing hand tucked by the knee
        this.neck.rotation.x = -0.1;
        break;
      }
      case 'cheer': {
        const hop = Math.max(0, Math.sin(t * 9)) * 0.12;
        this.pelvis.position.y = HIP_Y + hop;
        for (const [i, g] of L.entries()) g.knee.rotation.x = hop * 2 + (i ? 0.05 : 0);
        const w = Math.sin(t * 9) * 0.12;
        this.reachTo(0, V(-0.22 - w, 1.62, 0.1), V(-1, 0, -0.5));
        this.reachTo(1, V(0.22 + w, 1.62, 0.1), V(1, 0, -0.5));
        this.neck.rotation.x = -0.25;
        break;
      }
      case 'sad': {
        this.spine.rotation.x = 0.35;
        this.neck.rotation.x = 0.5;
        for (const a of A) a.elbow.rotation.x = -0.1;
        break;
      }
    }
  }

  private walk(ph: number, v: number, t: number, breathe: number) {
    const L = this.legs, A = this.arms;
    const run = Math.max(0, Math.min(1, (v - 1.7) / 1.4));
    const moving = Math.min(1, v / 0.6);
    const stride = 0.75 + v * 0.42;
    const ampWalk = Math.asin(Math.min(0.85, stride / (4 * (THIGH + SHIN)))) * moving;
    const amp = ampWalk * (1 - run) + 0.78 * run;
    for (const [i, g] of L.entries()) {
      const phi = ph + (i ? Math.PI : 0);
      const thigh = amp * Math.sin(phi);
      const swingBend = Math.pow(Math.max(0, Math.cos(phi + 0.35)), 1.4) * (0.95 * (1 - run) + 1.85 * run) * moving;
      const stanceGive = Math.max(0, -Math.cos(phi)) * Math.max(0, Math.sin(2 * phi + Math.PI)) * 0.25 * moving;
      const knee = 0.06 + swingBend + stanceGive;
      g.hip.rotation.x = -thigh - run * 0.12;
      g.knee.rotation.x = knee;
      const stance = Math.cos(phi) < 0;
      g.ankle.rotation.x = stance ? thigh - knee + run * 0.12 : 0.15 + (thigh - knee) * 0.4;
      g.hip.rotation.z = (i ? -1 : 1) * 0.02;
    }
    const bob = (1 - run) * 0.022 * Math.cos(2 * ph) + run * 0.045 * Math.cos(2 * ph);
    this.pelvis.position.y = HIP_Y - run * 0.05 - ampWalk * 0.04 + bob * moving;
    this.pelvis.rotation.y = 0.12 * Math.sin(ph) * moving * (1 - run * 0.4);
    this.pelvis.rotation.z = 0.04 * Math.sin(ph) * moving * (1 - run);
    this.spine.rotation.x = 0.04 + run * 0.25 + breathe;
    this.spine.rotation.y = -0.2 * Math.sin(ph) * moving;
    this.neck.rotation.x = -run * 0.2 - breathe;
    this.neck.rotation.y = -this.pelvis.rotation.y - this.spine.rotation.y + (1 - moving) * Math.sin(t * 0.35) * 0.35;
    for (const [i, a] of A.entries()) {
      const phi = ph + (i ? 0 : Math.PI);
      const swing = (0.35 * (1 - run) + 0.85 * run) * Math.sin(phi) * moving;
      a.shoulder.rotation.x = -swing;
      a.shoulder.rotation.z = (i ? 1 : -1) * (0.07 + run * 0.12 + (1 - moving) * 0.02 + Math.abs(breathe) * 0.3);
      a.elbow.rotation.x = -(0.18 + 0.2 * Math.max(0, Math.sin(phi)) * moving) * (1 - run) - run * (1.5 + 0.2 * Math.sin(phi));
    }
  }

  /** Where the bat's sweet spot is (root space), for a quick check that the swing reaches the plate. */
  sweetSpot(out = new THREE.Vector3()) {
    this.bat.updateMatrix();
    return out.set(0, 0.68, 0).applyMatrix4(this.bat.matrix);
  }
}
