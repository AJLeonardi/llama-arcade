// A person (a kid about 1.38 m tall) made of smooth shapes on a skeleton of joints, posed every frame.
// The walk is a real gait: the stride gets longer as you speed up, the knee bends most just after the foot
// leaves the ground, the body rises over the standing leg, hips and shoulders twist against each other, and
// the arms swing opposite the legs. Running leans forward with bent arms and a moment in the air each step.
// Other poses: sitting in a tube, lying on your back (body slides), hanging from the zip line, sleeping.
import * as THREE from 'three';

export interface Look {
  skin: string;
  hair: string;
  shirt: string;
  shorts: string;
  shoes: string;
  swim: string;
  longHair: boolean;
}
export const PLAYER_LOOK: Look = { skin: '#e8b48f', hair: '#4a2e1a', shirt: '#2f7de1', shorts: '#3a3f4a', shoes: '#f4f4f4', swim: '#e8452c', longHair: false };

// Body measurements (metres).
const HIP_Y = 0.7, THIGH = 0.3, SHIN = 0.325, UPPER = 0.22, FORE = 0.2;
const HIP_X = 0.072, SHOULDER_X = 0.14, SHOULDER_Y = 0.33; // shoulder height above the pelvis

/** A rounded limb hanging down from its joint: radius r0 at the top to r1 at the bottom, length len. */
function limb(len: number, r0: number, r1: number, bulge = 0.12) {
  const pts: THREE.Vector2[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Rounded caps at both ends, a gentle muscle bulge in the upper third.
    const cap = Math.sin(Math.min(1, Math.min(t, 1 - t) * 5) * (Math.PI / 2));
    const r = (r0 + (r1 - r0) * t) * (1 + bulge * Math.sin(Math.PI * Math.min(1, t * 1.5))) * (0.35 + 0.65 * cap);
    pts.push(new THREE.Vector2(Math.max(0.002, r), -len * t + (t === 0 ? 0.01 : 0)));
  }
  pts.unshift(new THREE.Vector2(0.0001, 0.01 + r0 * 0.4));
  pts.push(new THREE.Vector2(0.0001, -len - r1 * 0.4));
  // Lathe wants the profile from bottom to top.
  return new THREE.LatheGeometry(pts.reverse(), 12);
}

/** A body section from a list of [height, radius] (bottom to top), flattened front to back. */
function trunk(profile: [number, number][], depth = 0.7) {
  const g = new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r, y)), 18);
  g.scale(1, 1, depth);
  return g;
}

function mat(color: string, rough = 0.75, sheen = 0) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, sheen, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).multiplyScalar(1.4) });
  return m;
}

interface Leg { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group; shoe: THREE.Mesh }
interface Arm { shoulder: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; sleeve: THREE.Mesh }

export type PoseMode = 'walk' | 'tube' | 'lie' | 'zip' | 'hang' | 'sleep' | 'stand' | 'wave';

export interface PoseInput {
  mode: PoseMode;
  /** Walk cycle (radians, 2π per stride). */
  phase: number;
  speed: number;
  /** Lean into a turn (radians). */
  lean: number;
  /** Seconds, for breathing and fidgets. */
  t: number;
  /** In the air (jumping/falling): vertical speed. */
  air: number | null;
  /** Water depth at the feet. */
  wet: number;
  /** Rides: how hard you're leaning forward (+) or braking (-). */
  push?: number;
}

export class Person {
  readonly root = new THREE.Group();
  /** The pose's body: offset from the root by bob/lean; the root is placed by the game. */
  private readonly pelvis = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly legs: Leg[] = [];
  private readonly arms: Arm[] = [];
  private readonly mats: Record<'skin' | 'hair' | 'shirt' | 'shorts' | 'shoes', THREE.MeshPhysicalMaterial>;
  private readonly torso: THREE.Mesh;
  private swim = false;
  readonly tube: THREE.Mesh;
  readonly wand: THREE.Group;

  constructor(readonly look: Look = PLAYER_LOOK, extras: { tube?: boolean } = {}) {
    this.mats = {
      skin: mat(look.skin, 0.6, 0.3),
      hair: mat(look.hair, 0.55, 0.6),
      shirt: mat(look.shirt, 0.9, 0.9),
      shorts: mat(look.shorts, 0.92, 0.8),
      shoes: mat(look.shoes, 0.5),
    };
    const M = this.mats;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    this.root.add(this.pelvis);
    this.pelvis.position.y = HIP_Y;
    // Hips (shorts).
    add(this.pelvis, trunk([[-0.1, 0.06], [-0.07, 0.112], [0, 0.118], [0.06, 0.112], [0.1, 0.104]], 0.72), M.shorts);
    // Torso (shirt): waist, chest, shoulders.
    this.spine.position.y = 0.09;
    this.pelvis.add(this.spine);
    this.torso = add(this.spine, trunk([[-0.02, 0.104], [0.06, 0.1], [0.14, 0.116], [0.2, 0.124], [0.25, 0.12], [0.285, 0.1], [0.3, 0.06], [0.31, 0.03]], 0.66), M.shirt);
    // Neck and head.
    this.neck.position.y = SHOULDER_Y - 0.02 + 0.0;
    this.spine.add(this.neck);
    add(this.neck, new THREE.CylinderGeometry(0.034, 0.038, 0.09, 10), M.skin, 0, 0.03, 0);
    const head = new THREE.Group();
    head.position.y = 0.155;
    this.neck.add(head);
    const skull = add(head, new THREE.SphereGeometry(0.098, 24, 18), M.skin);
    skull.scale.set(0.9, 1.06, 0.98);
    const jaw = add(head, new THREE.SphereGeometry(0.075, 18, 12), M.skin, 0, -0.04, 0.018);
    jaw.scale.set(0.95, 0.85, 0.95);
    add(head, new THREE.SphereGeometry(0.014, 8, 6), M.skin, 0, -0.008, 0.096); // nose
    for (const s of [-1, 1]) {
      const ear = add(head, new THREE.SphereGeometry(0.022, 8, 6), M.skin, s * 0.088, 0, 0);
      ear.scale.set(0.45, 1, 0.75);
      const white = add(head, new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshStandardMaterial({ color: '#f6f3ee', roughness: 0.2 }), s * 0.034, 0.016, 0.083);
      white.scale.set(1, 0.85, 0.5);
      add(head, new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: '#2b1a0e', roughness: 0.1 }), s * 0.034, 0.016, 0.09);
      const brow = add(head, new THREE.BoxGeometry(0.03, 0.006, 0.008), M.hair, s * 0.035, 0.038, 0.088);
      brow.rotation.z = s * -0.12;
    }
    const mouth = add(head, new THREE.TorusGeometry(0.018, 0.003, 4, 10, Math.PI), new THREE.MeshStandardMaterial({ color: '#a8463e' }), 0, -0.034, 0.088);
    mouth.rotation.z = Math.PI;
    // Hair: a cap over the top and back, plus a fringe.
    const cap = add(head, new THREE.SphereGeometry(0.104, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), M.hair, 0, 0.008, -0.006);
    cap.scale.set(0.93, 1.08, 1.02);
    cap.rotation.x = -0.35;
    if (look.longHair) {
      const back = add(head, limb(0.2, 0.085, 0.07, 0), M.hair, 0, 0.02, -0.05);
      back.scale.set(1.05, 1, 0.55);
    }

    // Legs.
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * HIP_X, -0.03, 0);
      this.pelvis.add(hip);
      add(hip, limb(THIGH, 0.06, 0.045, 0.1), M.shorts).scale.set(1, 0.55, 1); // shorts leg (top half)
      add(hip, limb(THIGH, 0.056, 0.042, 0.1), M.skin);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      add(knee, limb(SHIN, 0.044, 0.03, 0.18), M.skin);
      const ankle = new THREE.Group();
      ankle.position.y = -SHIN;
      knee.add(ankle);
      const shoeGeo = new THREE.SphereGeometry(0.05, 14, 10);
      shoeGeo.scale(0.8, 0.55, 1.75);
      shoeGeo.translate(0, -0.045, 0.045);
      const shoe = add(ankle, shoeGeo, M.shoes);
      this.legs.push({ hip, knee, ankle, shoe });
    }
    // Arms.
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * SHOULDER_X, SHOULDER_Y - 0.08, 0);
      this.spine.add(shoulder);
      const sleeve = add(shoulder, limb(UPPER * 0.5, 0.046, 0.042, 0), M.shirt);
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
      const thumb = add(wrist, new THREE.SphereGeometry(0.012, 6, 5), M.skin, -s * 0.0, -0.02, 0.022);
      thumb.scale.set(1, 1.8, 1);
      this.arms.push({ shoulder, elbow, wrist, sleeve });
    }

    // The inner tube (shown on tube rides) and the magic wand (shown in the adventure wing).
    this.tube = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 14, 28), new THREE.MeshPhysicalMaterial({ color: '#2f9be0', roughness: 0.35, clearcoat: 0.6 }));
    this.tube.rotation.x = Math.PI / 2;
    this.tube.position.y = HIP_Y - 0.45;
    this.tube.visible = !!extras.tube;
    this.tube.castShadow = true;
    this.root.add(this.tube);
    this.wand = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.34, 8), new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: 0.4 }));
    stick.position.y = -0.17;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({ color: '#bff', emissive: '#6ff', emissiveIntensity: 2 }));
    tip.position.y = -0.34;
    this.wand.add(stick, tip);
    this.wand.rotation.x = -Math.PI / 2 - 0.3;
    this.wand.position.set(0, -0.05, 0.02);
    this.wand.visible = false;
    this.arms[1].wrist.add(this.wand);
  }

  /** Swimsuit on (in the water park) or clothes on. */
  setSwim(on: boolean, look = this.look) {
    if (on === this.swim) return;
    this.swim = on;
    this.torso.material = on ? this.mats.skin : this.mats.shirt;
    for (const a of this.arms) a.sleeve.visible = !on;
    this.mats.shorts.color.set(on ? look.swim : look.shorts);
    this.mats.shorts.sheenColor.set(on ? look.swim : look.shorts);
    this.mats.shoes.color.set(on ? look.skin : look.shoes);
  }

  pose(p: PoseInput) {
    const L = this.legs, A = this.arms;
    const reset = () => {
      this.pelvis.position.set(0, HIP_Y, 0);
      this.pelvis.rotation.set(0, 0, 0);
      this.spine.rotation.set(0, 0, 0);
      this.neck.rotation.set(0, 0, 0);
      for (const g of L) {
        g.hip.rotation.set(0, 0, 0);
        g.knee.rotation.set(0, 0, 0);
        g.ankle.rotation.set(0, 0, 0);
      }
      for (const a of A) {
        a.shoulder.rotation.set(0, 0, 0);
        a.elbow.rotation.set(0, 0, 0);
        a.wrist.rotation.set(0, 0, 0);
      }
    };
    reset();
    const breathe = Math.sin(p.t * 1.6) * 0.012;
    switch (p.mode) {
      case 'walk':
      case 'stand':
      case 'wave':
        this.walk(p, breathe);
        break;
      case 'tube': {
        // Sitting in the tube: bottom in the hole, legs over the front, hands on the handles.
        this.pelvis.position.y = 0.22;
        this.spine.rotation.x = -0.35 - (p.push ?? 0) * 0.3;
        for (const [i, g] of L.entries()) {
          g.hip.rotation.x = -1.35;
          g.hip.rotation.z = (i ? -1 : 1) * 0.08;
          g.knee.rotation.x = 1.0 + Math.sin(p.t * 3 + i) * 0.05;
          g.ankle.rotation.x = 0.3;
        }
        for (const [i, a] of A.entries()) {
          a.shoulder.rotation.x = -0.4;
          a.shoulder.rotation.z = (i ? 1 : -1) * 0.5;
          a.elbow.rotation.x = -0.9;
        }
        this.neck.rotation.x = 0.25;
        break;
      }
      case 'lie': {
        // Lying on your back, feet first, arms crossed on your chest (the slide rule!), head up a bit.
        this.pelvis.position.y = 0.12;
        this.pelvis.rotation.x = -Math.PI / 2 + 0.12 - (p.push ?? 0) * 0.15;
        for (const [i, g] of L.entries()) {
          g.hip.rotation.x = 0.0;
          g.hip.rotation.z = (i ? -1 : 1) * -0.02;
          g.ankle.rotation.x = -0.6;
        }
        for (const [i, a] of A.entries()) {
          a.shoulder.rotation.x = -0.5;
          a.shoulder.rotation.z = (i ? -1 : 1) * 0.35;
          a.elbow.rotation.x = -2.2;
          a.elbow.rotation.z = (i ? -1 : 1) * 0.6;
        }
        this.neck.rotation.x = -0.5;
        break;
      }
      case 'zip':
      case 'hang': {
        // Hanging from the harness, hands up on the straps, legs dangling and swinging.
        const sw = Math.sin(p.t * 2.2) * 0.12;
        for (const [i, g] of L.entries()) {
          g.hip.rotation.x = -0.35 + sw * (i ? 1 : -1);
          g.knee.rotation.x = 0.5 + sw * 0.5;
          g.ankle.rotation.x = 0.4;
        }
        for (const [i, a] of A.entries()) {
          a.shoulder.rotation.x = -2.9;
          a.shoulder.rotation.z = (i ? 1 : -1) * 0.2;
          a.elbow.rotation.x = -0.4;
        }
        this.neck.rotation.x = p.mode === 'zip' ? -0.1 : 0.2;
        break;
      }
      case 'sleep': {
        this.pelvis.position.y = 0.12;
        this.pelvis.rotation.x = -Math.PI / 2;
        this.pelvis.rotation.z = 0.15;
        for (const g of L) g.knee.rotation.x = 0.25;
        for (const a of A) {
          a.shoulder.rotation.x = -0.2;
          a.elbow.rotation.x = -0.4;
        }
        this.spine.position.y = 0.09 + breathe;
        break;
      }
    }
  }

  private walk(p: PoseInput, breathe: number) {
    const L = this.legs, A = this.arms;
    const v = p.speed;
    const run = Math.max(0, Math.min(1, (v - 1.7) / 1.4));
    const moving = Math.min(1, v / 0.6);
    // Stride length sets how far each thigh swings, so the feet don't slide on the ground.
    const stride = 0.75 + v * 0.42;
    const ampWalk = Math.asin(Math.min(0.85, stride / (4 * (THIGH + SHIN)))) * moving;
    const amp = ampWalk * (1 - run) + 0.72 * run;
    const ph = p.phase;

    if (p.air !== null) {
      // In the air: knees up, arms out.
      const up = p.air > 0 ? 1 : 0.6;
      for (const [i, g] of L.entries()) {
        g.hip.rotation.x = -0.6 * up + (i ? 0.25 : -0.1);
        g.knee.rotation.x = 1.0 * up;
        g.ankle.rotation.x = 0.2;
      }
      for (const [i, a] of A.entries()) {
        a.shoulder.rotation.x = -0.6;
        a.shoulder.rotation.z = (i ? 1 : -1) * 0.7;
        a.elbow.rotation.x = -0.6;
      }
      this.spine.rotation.x = 0.1;
      return;
    }

    for (const [i, g] of L.entries()) {
      const phi = ph + (i ? Math.PI : 0);
      const thigh = amp * Math.sin(phi); // + = forward
      // Knee: bends most early in the swing, nearly straight at heel strike, a little give in the stance.
      const swingBend = Math.pow(Math.max(0, Math.cos(phi + 0.35)), 1.4) * (0.95 * (1 - run) + 1.75 * run) * moving;
      const stanceGive = Math.max(0, -Math.cos(phi)) * Math.max(0, Math.sin(2 * phi + Math.PI)) * 0.25 * moving;
      const knee = 0.06 + swingBend + stanceGive + (p.wet > 0.3 ? 0.25 : 0);
      g.hip.rotation.x = -thigh - run * 0.12;
      g.knee.rotation.x = knee;
      // Foot: flat on the ground in the stance, toes down a bit in the swing.
      const stance = Math.cos(phi) < 0;
      g.ankle.rotation.x = stance ? thigh - knee + run * 0.12 : 0.15 + (thigh - knee) * 0.4;
      g.hip.rotation.z = (i ? -1 : 1) * 0.02;
    }
    // Body bob: up over the standing leg when walking; when running, down in the stance, up in the flight.
    const bob = (1 - run) * 0.022 * Math.cos(2 * ph) - run * 0.045 * Math.cos(2 * ph) * -1;
    const legBend = run * 0.05 + ampWalk * 0.04;
    this.pelvis.position.y = HIP_Y - legBend + bob * moving + (p.wet > 0.3 ? -0.05 : 0);
    this.pelvis.rotation.y = 0.12 * Math.sin(ph) * moving * (1 - run * 0.4);
    this.pelvis.rotation.z = 0.04 * Math.sin(ph) * moving * (1 - run) + p.lean;
    // Upper body: lean forward when running, twist against the hips, breathe.
    this.spine.rotation.x = 0.04 + run * 0.22 + breathe;
    this.spine.rotation.y = -0.2 * Math.sin(ph) * moving;
    this.spine.rotation.z = -p.lean * 0.5;
    this.neck.rotation.x = -run * 0.18 - breathe;
    this.neck.rotation.y = -this.pelvis.rotation.y - this.spine.rotation.y + (1 - moving) * Math.sin(p.t * 0.35) * 0.35;
    // Arms: swing opposite the legs; bent at the elbow, much more when running.
    for (const [i, a] of A.entries()) {
      const phi = ph + (i ? 0 : Math.PI);
      const swing = (0.35 * (1 - run) + 0.8 * run) * Math.sin(phi) * moving;
      a.shoulder.rotation.x = -swing;
      a.shoulder.rotation.z = (i ? 1 : -1) * (0.07 + run * 0.12 + (1 - moving) * 0.02 + Math.abs(breathe) * 0.3);
      a.elbow.rotation.x = -(0.18 + 0.2 * Math.max(0, Math.sin(phi)) * moving) * (1 - run) - run * (1.45 + 0.2 * Math.sin(phi));
    }
    if (p.mode === 'wave') {
      // Waving the magic wand.
      const w = this.arms[1];
      w.shoulder.rotation.x = -2.2 + Math.sin(p.t * 9) * 0.25;
      w.shoulder.rotation.z = 0.25;
      w.elbow.rotation.x = -0.4 - Math.sin(p.t * 9) * 0.3;
    }
  }

  setTube(on: boolean) {
    this.tube.visible = on;
  }
}
