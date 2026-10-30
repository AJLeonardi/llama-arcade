// The skater and the board, built from smooth shapes, posed every frame from the sim's state
// (two-bone legs that keep the feet on the deck, arms out for balance, crouching, pushing, flips and falls).
import * as THREE from 'three';
import { BOARDS, deckGraphic, fabric, gripTape } from './textures';

export interface Look {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
  helmet: number; // 0 = no helmet
}

export const SKIN = ['#f6d2b8', '#e8b48f', '#c68863', '#8d5a3c', '#5c3a24'];
export const HAIR = ['#2b1d14', '#6b4423', '#d9a441', '#b5462b', '#111111', '#e8e2d0'];
export const SHIRT = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#f5f5f5', '#212121', '#fb8c00'];
export const PANTS = ['#2b3a55', '#1c1c1c', '#6d6d6d', '#8b6b4a', '#3d5a3d', '#a3c4e8'];
export const SHOES = ['#f5f5f5', '#111111', '#e53935', '#1e88e5', '#fdd835'];
export const HELMET = ['', '#111111', '#e53935', '#1e88e5', '#fdd835', '#f5f5f5', '#8e24aa'];
export const DEFAULT_LOOK: Look = { skin: 1, hair: 1, shirt: 0, pants: 0, shoes: 0, helmet: 2 };

// ---------------------------------------------------------------- the board

const DECK_L = 0.8, DECK_W = 0.205, DECK_T = 0.012, DECK_Y = 0.098;
const KICK_AT = 0.27;
/** The deck's centre-line height at t (along the board, -0.4 tail .. 0.4 nose). */
const kick = (t: number) => {
  const a = Math.abs(t) - KICK_AT;
  return a > 0 ? Math.pow(a / (DECK_L / 2 - KICK_AT), 1.5) * 0.055 : 0;
};
const halfWidth = (t: number) => {
  const r = DECK_W / 2, c = DECK_L / 2 - r, a = Math.abs(t);
  return a <= c ? r : Math.sqrt(Math.max(0, r * r - (a - c) ** 2));
};

/** One face of the deck (top or bottom), bent up at the kicktails. */
function deckSurface(top: boolean) {
  const N = 48, M = 6;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = -DECK_L / 2 + (DECK_L * i) / N;
    const w = Math.max(halfWidth(t), 0.004);
    for (let j = 0; j <= M; j++) {
      const a = -1 + (2 * j) / M;
      pos.push(a * w, DECK_Y + kick(t) + (top ? DECK_T : 0), t);
      uv.push((a + 1) / 2, i / N);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
      if (top) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The wooden edge all round the deck. */
function deckEdge() {
  const N = 96;
  const pos: number[] = [], idx: number[] = [];
  const pts: [number, number][] = [];
  // Walk round the outline: up the left side, back down the right.
  for (let i = 0; i <= N; i++) pts.push([-1, -DECK_L / 2 + (DECK_L * i) / N]);
  for (let i = N; i >= 0; i--) pts.push([1, -DECK_L / 2 + (DECK_L * i) / N]);
  for (const [side, t] of pts) {
    const x = side * halfWidth(t), y = DECK_Y + kick(t);
    pos.push(x, y, t, x, y + DECK_T, t);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildBoard(design: number) {
  const d = BOARDS[design];
  const board = new THREE.Group();
  const grip = gripTape();
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    board.add(mesh);
    return mesh;
  };
  add(deckSurface(true), new THREE.MeshStandardMaterial({ map: grip.map, normalMap: grip.normal, roughness: 0.95 }));
  add(deckSurface(false), new THREE.MeshStandardMaterial({ map: deckGraphic(design), roughness: 0.45, side: THREE.DoubleSide }));
  add(deckEdge(), new THREE.MeshStandardMaterial({ color: 0xc9a46e, roughness: 0.7, side: THREE.DoubleSide }));
  const metal = new THREE.MeshStandardMaterial({ color: d.trucks, metalness: 0.9, roughness: 0.35 });
  const wheel = new THREE.MeshStandardMaterial({ color: d.wheels, roughness: 0.55 });
  const bearing = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.3 });
  for (const z of [-0.2, 0.2]) {
    add(new THREE.BoxGeometry(0.06, 0.012, 0.085).translate(0, DECK_Y - 0.006, z), metal); // base plate
    add(new THREE.CylinderGeometry(0.014, 0.022, 0.04, 10).translate(0, DECK_Y - 0.03, z + (z > 0 ? -0.012 : 0.012)), metal); // kingpin + bushing
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 10).rotateZ(Math.PI / 2).translate(0, 0.031, z), metal); // hanger
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.225, 6).rotateZ(Math.PI / 2).translate(0, 0.027, z), bearing); // axle
    for (const x of [-0.092, 0.092]) {
      const w = new THREE.CylinderGeometry(0.027, 0.027, 0.034, 20).rotateZ(Math.PI / 2).translate(x, 0.027, z);
      add(w, wheel);
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.036, 10).rotateZ(Math.PI / 2).translate(x, 0.027, z), bearing);
    }
  }
  return board;
}

// ---------------------------------------------------------------- the person

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
  const n = 12;
  for (let j = 0; j <= n; j++) {
    const t = 1 - j / n;
    pts.push(new THREE.Vector2(rAt(t), -t * len));
  }
  for (let i = 3; i >= 0; i--) pts.push(new THREE.Vector2(r0 * Math.sin((i / 4) * Math.PI * 0.5), r0 * 0.6 * Math.cos((i / 4) * Math.PI * 0.5)));
  return new THREE.LatheGeometry(pts, 16);
}

/** A cloth material: colour set later, a weave in the normal map, a soft sheen at grazing angles. */
function cloth(kind: 'denim' | 'cotton', rough: number) {
  const f = fabric(kind);
  const map = f.map.clone(), normal = f.normal.clone();
  for (const t of [map, normal]) t.repeat.set(kind === 'denim' ? 5 : 6, kind === 'denim' ? 4 : 5);
  return new THREE.MeshPhysicalMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: rough, sheen: 0.6, sheenRoughness: 0.8, sheenColor: 0xffffff });
}

interface Limb {
  g: THREE.Group;
  len: number;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const tmp = new THREE.Vector3();

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const turnQ = new THREE.Quaternion();

/**
 * Points a limb (built hanging down from its joint) from a to b. `turn` is how far the body is turned
 * (radians round the vertical), so wide parts like the chest turn with it.
 */
function aim(l: Limb, a: THREE.Vector3, b: THREE.Vector3, turn = 0) {
  l.g.position.copy(a);
  tmp.subVectors(b, a);
  const d = tmp.length();
  tmp.divideScalar(d || 1).applyAxisAngle(Y_AXIS, -turn);
  l.g.quaternion.setFromUnitVectors(DOWN, tmp);
  l.g.quaternion.premultiply(turnQ.setFromAxisAngle(Y_AXIS, turn));
  l.g.scale.set(1, d / l.len, 1);
}

const lerp = THREE.MathUtils.lerp;
const ease = (t: number) => t * t * (3 - 2 * t);

/** Knee (or elbow) for a two-bone limb from a to c, bending toward `bend`. */
function joint(a: THREE.Vector3, c: THREE.Vector3, l1: number, l2: number, bend: THREE.Vector3, out: THREE.Vector3) {
  const d = Math.min(c.distanceTo(a), l1 + l2 - 1e-4);
  const ax = tmp.subVectors(c, a).normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const side = bend.clone().addScaledVector(ax, -bend.dot(ax)).normalize();
  return out.copy(a).addScaledVector(ax, x).addScaledVector(side, h);
}

export class SkaterModel {
  readonly root = new THREE.Group();
  /** Pivot for backflips, at the skater's middle. */
  private flip = new THREE.Group();
  private boardHolder = new THREE.Group();
  private board: THREE.Group;
  private person = new THREE.Group();
  private mats: Record<'skin' | 'shirt' | 'pants' | 'shoes' | 'hair' | 'helmet', THREE.MeshStandardMaterial>;
  private hair!: THREE.Group;
  private helmet: THREE.Mesh;
  private torso: Limb;
  private head = new THREE.Group();
  private thighs: Limb[] = [];
  private shins: Limb[] = [];
  private feet: THREE.Group[] = [];
  private uppers: Limb[] = [];
  private lowers: Limb[] = [];
  private hands: THREE.Group[] = [];
  /** Round caps over the joints so the limbs flow into each other. */
  private knees: THREE.Mesh[] = [];
  private elbows: THREE.Mesh[] = [];
  private shoulders: THREE.Mesh[] = [];
  private t = 0;
  /** 0 = riding sideways, 1 = turned to face the nose and pushing; eases between the two. */
  private pushB = 0;
  /** Where the pushing foot is in its stroke: 0..0.5 on the ground shoving back, 0.5..1 swinging forward. */
  private pushPh = 0;

  constructor(look: Look, design: number) {
    const M = (c: string, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
    const skin = new THREE.MeshPhysicalMaterial({ roughness: 0.55, sheen: 0.3, sheenRoughness: 0.6, sheenColor: 0xffd8c8 });
    this.mats = { skin, shirt: cloth('cotton', 0.9), pants: cloth('denim', 0.85), shoes: M('#fff', 0.65), hair: M('#fff', 0.75), helmet: M('#fff', 0.25) };
    this.root.add(this.flip);
    this.flip.position.y = 0.9;
    const body = new THREE.Group();
    body.position.y = -0.9;
    this.flip.add(body);
    body.add(this.boardHolder);
    this.board = buildBoard(design);
    this.boardHolder.add(this.board);
    this.boardHolder.position.y = DECK_Y + DECK_T / 2;
    this.board.position.y = -(DECK_Y + DECK_T / 2);
    // The person is built facing +z (their left is +x), then turned so their left foot is at the nose:
    // they face the board's -x side.
    this.person.rotation.y = -Math.PI / 2;
    body.add(this.person);

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = this.person) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = true;
      parent.add(x);
      return x;
    };
    const limb = (prof: [number, number][], len: number, mat: THREE.Material, extra?: (g: THREE.Group) => void): Limb => {
      const g = new THREE.Group();
      mesh(shaped(prof, len), mat, g);
      extra?.(g);
      this.person.add(g);
      return { g, len };
    };
    const white = M('#f2f2f2', 0.9);
    for (let i = 0; i < 2; i++) {
      // Legs in jeans: a thigh that narrows to the knee, a straight-cut leg below.
      this.thighs.push(limb([[0, 0.1], [0.3, 0.09], [0.85, 0.07], [1, 0.068]], 0.44, this.mats.pants));
      this.shins.push(limb([[0, 0.069], [0.5, 0.066], [1, 0.068]], 0.43, this.mats.pants));
      const ball = (r: number, m: THREE.Material, list: THREE.Mesh[]) => list.push(mesh(new THREE.SphereGeometry(r, 14, 10), m));
      ball(0.07, this.mats.pants, this.knees);
      ball(0.043, this.mats.skin, this.elbows);
      ball(0.064, this.mats.shirt, this.shoulders);
      // Sneakers: a rounded upper with a white sole and toe cap.
      const foot = new THREE.Group();
      const upper = mesh(new THREE.CapsuleGeometry(0.048, 0.17, 6, 12).rotateX(Math.PI / 2).translate(0, -0.028, 0.06), this.mats.shoes, foot);
      upper.scale.set(1.05, 0.78, 1);
      mesh(new THREE.BoxGeometry(0.104, 0.024, 0.28).translate(0, -0.066, 0.06), white, foot);
      mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.03, 0.55, 0.9).translate(0, -0.054, 0.16), white, foot);
      mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.05, 12).translate(0, -0.005, -0.03), this.mats.shoes, foot); // ankle collar
      this.person.add(foot);
      this.feet.push(foot);
      // Arms: a short sleeve over the top of the upper arm, then skin.
      this.uppers.push(limb([[0, 0.05], [0.5, 0.046], [1, 0.039]], 0.29, this.mats.skin, (g) => {
        const sleeve = new THREE.Mesh(shaped([[0, 0.068], [1, 0.064]], 0.15, true), this.mats.shirt);
        sleeve.castShadow = true;
        (sleeve.material as THREE.Material).side = THREE.DoubleSide;
        g.add(sleeve);
      }));
      this.lowers.push(limb([[0, 0.04], [0.3, 0.043], [1, 0.03]], 0.25, this.mats.skin));
      // Hand: a palm, fingers curled together, and a thumb.
      const hand = new THREE.Group();
      mesh(new THREE.SphereGeometry(0.04, 12, 10).scale(0.95, 1.2, 0.55).translate(0, -0.035, 0), this.mats.skin, hand);
      mesh(new THREE.CapsuleGeometry(0.017, 0.045, 4, 8).rotateZ(i ? -0.5 : 0.5).translate(i ? -0.03 : 0.03, -0.035, 0.012), this.mats.skin, hand);
      this.person.add(hand);
      this.hands.push(hand);
    }
    // Torso: chest wider than the waist, shoulders sloping to the neck. The shirt stops at the belt (its
    // rounded end tucked inside the jeans), and the jeans' seat covers the hips, so no shirt pokes out
    // between the legs. The limb is 0.56 long (neck to hip joints); the shirt is drawn 0.47 of that.
    this.torso = limb([[0, 0.06], [1, 0.15]], 0.56, this.mats.shirt, (g) => {
      const shirt = g.children[0] as THREE.Mesh;
      shirt.geometry.dispose();
      shirt.geometry = shaped([[0, 0.06], [0.12, 0.14], [0.3, 0.165], [0.65, 0.15], [1, 0.142]], 0.47);
      shirt.scale.set(1.28, 1, 0.75);
      const pelvis = mesh(new THREE.SphereGeometry(0.17, 20, 14), this.mats.pants, g);
      pelvis.scale.set(1.16, 0.78, 0.86);
      pelvis.position.y = -0.53;
      const belt = mesh(new THREE.CylinderGeometry(0.163, 0.163, 0.035, 18), M('#2a211b', 0.5), g);
      belt.scale.set(1.17, 1, 0.83);
      belt.position.y = -0.47;
    });
    // Head: skull and jaw, eyes with irises, brows, nose, mouth, ears, hair (or a helmet).
    mesh(new THREE.CylinderGeometry(0.043, 0.05, 0.11, 12).translate(0, 0.05, 0), this.mats.skin, this.head);
    mesh(new THREE.SphereGeometry(0.103, 28, 20).scale(0.88, 1.05, 0.98).translate(0, 0.185, 0), this.mats.skin, this.head);
    mesh(new THREE.SphereGeometry(0.07, 20, 14).scale(1.05, 0.85, 1).translate(0, 0.125, 0.03), this.mats.skin, this.head);
    const eyeWhite = M('#f4f1ec', 0.3), iris = M('#3b2a1e', 0.15), lips = M('#b5655a', 0.6);
    for (const x of [-0.033, 0.033]) {
      mesh(new THREE.SphereGeometry(0.015, 12, 8).translate(x, 0.19, 0.083), eyeWhite, this.head);
      mesh(new THREE.SphereGeometry(0.0085, 10, 8).translate(x, 0.19, 0.097), iris, this.head);
      const brow = mesh(new THREE.BoxGeometry(0.034, 0.007, 0.012).translate(x, 0.212, 0.091), this.mats.hair, this.head);
      brow.rotation.z = x > 0 ? -0.12 : 0.12;
      const ear = mesh(new THREE.SphereGeometry(0.024, 10, 8).scale(0.45, 1, 0.75).translate(x * 2.75, 0.18, -0.005), this.mats.skin, this.head);
      void ear;
    }
    mesh(new THREE.ConeGeometry(0.016, 0.042, 10).rotateX(Math.PI / 2).translate(0, 0.162, 0.1), this.mats.skin, this.head);
    mesh(new THREE.CapsuleGeometry(0.006, 0.026, 3, 6).rotateZ(Math.PI / 2).translate(0, 0.128, 0.093), lips, this.head);
    this.hair = new THREE.Group();
    const cap = mesh(new THREE.SphereGeometry(0.11, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), this.mats.hair, this.hair);
    cap.scale.set(0.93, 1.05, 1.04);
    cap.position.set(0, 0.19, -0.008);
    cap.rotation.x = -0.32;
    const fringe = mesh(new THREE.SphereGeometry(0.06, 14, 10), this.mats.hair, this.hair);
    fringe.scale.set(1.45, 0.42, 0.75);
    fringe.position.set(0.008, 0.252, 0.06);
    fringe.rotation.z = 0.12;
    this.head.add(this.hair);
    this.helmet = mesh(new THREE.SphereGeometry(0.135, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mats.helmet, this.head);
    this.helmet.scale.set(0.95, 1, 1.05);
    this.helmet.position.set(0, 0.2, 0);
    this.helmet.rotation.x = -0.15;
    // The helmet's chin strap.
    for (const x of [-0.088, 0.088]) {
      const strap = mesh(new THREE.BoxGeometry(0.006, 0.12, 0.012), M('#1a1a1a', 0.6), this.helmet);
      strap.position.set(x / 0.95, -0.06, 0.01);
      strap.rotation.z = x > 0 ? 0.25 : -0.25;
    }
    this.person.add(this.head);
    this.setLook(look);
  }

  setLook(l: Look) {
    this.mats.skin.color.set(SKIN[l.skin]);
    this.mats.hair.color.set(HAIR[l.hair]);
    this.mats.shirt.color.set(SHIRT[l.shirt]);
    this.mats.pants.color.set(PANTS[l.pants]);
    this.mats.shoes.color.set(SHOES[l.shoes]);
    this.helmet.visible = l.helmet > 0;
    if (l.helmet > 0) this.mats.helmet.color.set(HELMET[l.helmet]);
    this.hair.visible = l.helmet === 0;
  }

  setBoard(design: number) {
    this.boardHolder.remove(this.board);
    this.board.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    this.board = buildBoard(design);
    this.board.position.y = -(DECK_Y + DECK_T / 2);
    this.boardHolder.add(this.board);
  }

  /**
   * Poses everything. All amounts are 0..1 unless said otherwise.
   * `kick`: kickflip progress; `pitch`: backflip angle; `pop`: seconds since the ollie; `push`: pushing;
   * `bail`: seconds since falling (or -1).
   */
  pose(p: { crouch: number; kick: number; pitch: number; pop: number; push: boolean; bail: number; lean: number; grind: boolean }, dt: number) {
    this.t += dt;
    this.flip.rotation.x = -p.pitch;
    // The board: nose pops up in an ollie, rolls over in a kickflip.
    const popTilt = p.pop < 0.35 ? Math.sin((p.pop / 0.35) * Math.PI) * 0.4 : 0;
    this.boardHolder.rotation.set(-popTilt, 0, p.kick * Math.PI * 2);
    const lift = p.kick > 0 ? Math.sin(p.kick * Math.PI) * 0.22 : 0;
    this.boardHolder.position.y = DECK_Y + DECK_T / 2 + lift;

    // Person space: +x is toward the nose, +z is the toes' side. Riding, the skater stands sideways with
    // both feet across the deck. Pushing, they turn to face the nose: the front foot swivels to point
    // forward over the front truck, and the back foot steps down beside the board (toe side), shoves
    // backward along the ground, then lifts and swings forward for the next push.
    const want = p.push && p.bail < 0 ? 1 : 0;
    this.pushB += (want - this.pushB) * Math.min(1, dt * 5);
    const b = ease(this.pushB);
    if (this.pushB < 0.02) this.pushPh = 0;
    else this.pushPh = (this.pushPh + dt * 1.15) % 1;
    const ph = this.pushPh;
    const contact = ph < 0.5 ? Math.sin((ph / 0.5) * Math.PI) : 0;
    const turn = b * 1.3;
    const R = (v: THREE.Vector3) => v.applyAxisAngle(Y_AXIS, turn);

    const deckTop = DECK_Y + DECK_T + 0.075;
    const ground = 0.075;
    const tuck = Math.max(p.crouch, lift > 0 ? 0.9 : 0);
    const front = new THREE.Vector3(lerp(0.24, 0.16, b), deckTop + lift * 1.3, 0);
    const back = new THREE.Vector3(-0.2, deckTop + lift * 0.9 + popTilt * -0.05, 0);
    if (b > 0) {
      const pushFoot = new THREE.Vector3();
      if (ph < 0.5) pushFoot.set(lerp(0.12, -0.5, ease(ph / 0.5)), ground, 0.22);
      else {
        const u = (ph - 0.5) / 0.5;
        pushFoot.set(lerp(-0.5, 0.12, ease(u)), ground + Math.sin(u * Math.PI) * 0.15, 0.2);
      }
      back.lerp(pushFoot, b);
    }
    // Hips: over the middle of the board riding; over the front foot, a bit toward the push side, when
    // pushing, dipping as the standing knee bends during each shove.
    const rideHipY = 0.98 - 0.34 * tuck - 0.04;
    const hips = new THREE.Vector3(lerp(0.02, 0.1, b), lerp(rideHipY, 0.9 - 0.06 * contact, b), lerp(-0.06 + p.lean * 0.05, 0.07, b));
    const torsoLean = lerp(0.25 + 0.35 * tuck + p.lean * 0.2, 0.2 + 0.12 * contact, b);
    const neck = hips.clone().add(R(new THREE.Vector3(0, Math.cos(torsoLean), Math.sin(torsoLean)).multiplyScalar(0.56)));
    aim(this.torso, neck, hips, turn);
    this.head.position.copy(neck);
    this.head.rotation.set(0.1 - torsoLean * 0.3, lerp(1.15, 1.45, b), 0, 'YXZ'); // looking where we're going
    const knee = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      const hip = hips.clone().add(R(new THREE.Vector3(i ? -0.09 : 0.09, 0, 0)));
      const foot = i ? back : front;
      joint(hip, foot, 0.44, 0.43, R(new THREE.Vector3(i ? -0.3 : 0.3, 0, 1)), knee);
      aim(this.thighs[i], hip, knee, turn);
      this.knees[i].position.copy(knee);
      aim(this.shins[i], knee, foot, turn);
      this.feet[i].position.copy(foot);
      // Toes across the deck when riding (a little toward the nose); pointing forward when pushing.
      this.feet[i].rotation.set(0, lerp(i ? 0.15 : 0.35, i ? 1.45 : 1.4, b), 0);
    }
    // Arms: out for balance when riding (wider when grinding or flying); hanging and swinging, opposite
    // to the pushing leg, when pushing.
    const wide = p.grind ? 1 : Math.min(1, 0.4 + tuck * 0.6);
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const shoulder = neck.clone().add(R(new THREE.Vector3(s * 0.185, -0.09, -0.02)));
      const swing = Math.sin(this.t * 2 + i) * 0.05;
      const ride = new THREE.Vector3(s * (0.25 + wide * 0.25), -0.48 + wide * 0.22 + swing, 0.12);
      const walk = new THREE.Vector3(s * 0.09, -0.49, 0.05 + Math.cos(ph * Math.PI * 2) * 0.16 * s);
      const hand = shoulder.clone().add(R(ride.lerp(walk, b)));
      const elbow = new THREE.Vector3();
      joint(shoulder, hand, 0.29, 0.25, R(new THREE.Vector3(0, -0.3, -1)), elbow);
      aim(this.uppers[i], shoulder, elbow, turn);
      this.elbows[i].position.copy(elbow);
      this.shoulders[i].position.copy(shoulder);
      aim(this.lowers[i], elbow, hand, turn);
      this.hands[i].position.copy(hand);
      this.hands[i].quaternion.copy(this.lowers[i].g.quaternion);
    }
    // Falling: tip over onto the ground, the board sliding away.
    if (p.bail >= 0) {
      const k = Math.min(1, p.bail / 0.35);
      this.person.rotation.set(0, -Math.PI / 2, 0);
      this.person.rotateX(-k * Math.PI * 0.5);
      this.person.position.set(0, k * 0.12, 0);
      this.boardHolder.position.set(0.5 * k, DECK_Y + DECK_T / 2, -0.7 * k);
      this.boardHolder.rotation.set(0, 0.6 * k, Math.PI * k);
    } else {
      this.person.rotation.set(0, -Math.PI / 2, 0);
      this.person.position.set(0, 0, 0);
      this.boardHolder.position.x = this.boardHolder.position.z = 0;
    }
  }
}
