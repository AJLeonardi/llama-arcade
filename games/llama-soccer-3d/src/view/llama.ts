// A soccer llama: four legs, a long neck, ears, and the team's shirt on its body with the number on both sides.
// Faces +z. The head, neck, ears and snout are merged into one mesh so ten llamas stay cheap to draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Body } from '../sim/match';

const LEG_TOP = 0.86, LEG = 0.78;

let shared: ReturnType<typeof makeShared> | null = null;

function makeShared() {
  const body = new THREE.CapsuleGeometry(0.34, 0.62, 6, 14);
  body.rotateX(Math.PI / 2);
  const neck = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 10);
  neck.rotateX(-0.25);
  neck.translate(0, 1.42, 0.42);
  const head = new THREE.CapsuleGeometry(0.15, 0.2, 4, 10);
  head.rotateX(Math.PI / 2);
  head.translate(0, 1.86, 0.55);
  const ear = (x: number) => {
    const e = new THREE.ConeGeometry(0.05, 0.2, 6);
    e.rotateZ(-x * 1.6);
    e.translate(x * 0.1, 2.04, 0.45);
    return e;
  };
  const tail = new THREE.SphereGeometry(0.11, 8, 6);
  tail.translate(0, 1.12, -0.66);
  const fur = mergeGeometries([neck, head, ear(1), ear(-1), tail].map((g) => g.toNonIndexed()));
  const snout = new THREE.SphereGeometry(0.11, 10, 8);
  snout.scale(1, 0.85, 1);
  snout.translate(0, 1.82, 0.74);
  const eyes = mergeGeometries([1, -1].map((x) => new THREE.SphereGeometry(0.035, 8, 6).translate(x * 0.12, 1.93, 0.66)));
  const leg = new THREE.CylinderGeometry(0.075, 0.065, LEG * 0.6, 8);
  leg.translate(0, -LEG * 0.3, 0);
  const sock = new THREE.CylinderGeometry(0.07, 0.07, LEG * 0.4, 8);
  sock.translate(0, -LEG * 0.8, 0);
  const collar = new THREE.TorusGeometry(0.15, 0.04, 6, 14);
  collar.rotateX(Math.PI / 2 - 0.25);
  collar.translate(0, 1.12, 0.36);
  return {
    body,
    fur,
    snout,
    eyes,
    leg,
    sock,
    collar,
    eyeMat: new THREE.MeshBasicMaterial({ color: '#111' }),
    snoutMat: new THREE.MeshLambertMaterial({ color: '#4a3a30' }),
  };
}

const shirtMats = new Map<string, THREE.Material>();
/** The shirt: team colour with a trim stripe and the number on both sides (one texture per team + number). */
function shirtMat(shirt: string, trim: string, num: number) {
  const key = `${shirt}${trim}${num}`;
  let m = shirtMats.get(key);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = shirt;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = trim;
    g.fillRect(0, 0, 256, 14); // stripe along the back
    g.font = 'bold 54px Arial Black, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Capsule u goes round the body: the two sides are at u = 0.25 and 0.75.
    for (const u of [0.25, 0.75]) {
      g.save();
      g.translate(u * 256, 66);
      g.scale(1, 1.2);
      g.lineWidth = 6;
      g.strokeStyle = trim;
      g.strokeText(String(num), 0, 0);
      g.fillStyle = shirt === '#f4f6fb' ? '#1b2a6b' : '#fff';
      g.fillText(String(num), 0, 0);
      g.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshLambertMaterial({ map: tex });
    shirtMats.set(key, m);
  }
  return m;
}

const lambert = new Map<string, THREE.Material>();
const mat = (color: string) => {
  let m = lambert.get(color);
  if (!m) lambert.set(color, (m = new THREE.MeshLambertMaterial({ color })));
  return m;
};

export class Llama {
  readonly group = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private phase = Math.random() * 6;

  constructor(fur: string, shirt: string, trim: string, num: number, keeperGloves = false) {
    shared ??= makeShared();
    const S = shared;
    this.group.add(this.tilt);
    const body = new THREE.Mesh(S.body, shirtMat(shirt, trim, num));
    body.position.y = 1.0;
    const furMesh = new THREE.Mesh(S.fur, mat(fur));
    this.tilt.add(body, furMesh, new THREE.Mesh(S.snout, S.snoutMat), new THREE.Mesh(S.eyes, S.eyeMat), new THREE.Mesh(S.collar, mat(trim)));
    for (const [x, z] of [[0.17, 0.36], [-0.17, 0.36], [0.17, -0.36], [-0.17, -0.36]]) {
      const leg = new THREE.Group();
      leg.position.set(x, LEG_TOP, z);
      leg.add(new THREE.Mesh(S.leg, mat(fur)), new THREE.Mesh(S.sock, mat(keeperGloves && z > 0 ? '#39d353' : trim)));
      this.tilt.add(leg);
      this.legs.push(leg);
    }
  }

  /** Put the llama where the match says and move its legs. `cheer` makes it bounce. */
  update(b: Body, dt: number, cheer: boolean, time: number) {
    const g = this.group;
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.face;
    const speed = Math.hypot(b.vx, b.vz);
    this.phase += dt * (3 + speed * 1.6);
    const swing = Math.min(1, speed / 5) * 0.7;
    const s = Math.sin(this.phase);
    // Diagonal pairs move together, like a trotting llama.
    this.legs[0].rotation.x = s * swing;
    this.legs[3].rotation.x = s * swing;
    this.legs[1].rotation.x = -s * swing;
    this.legs[2].rotation.x = -s * swing;
    if (b.kickT > 0) this.legs[1].rotation.x = -1.3 * Math.sin((b.kickT / 0.3) * Math.PI); // the right front leg kicks
    this.tilt.position.y = Math.abs(s) * 0.05 * Math.min(1, speed / 3);
    this.tilt.rotation.z = 0;
    this.tilt.position.x = 0;
    if (b.dive !== 0 && b.diveT > 0) {
      // Keeper dive: lean right over to that side.
      const k = Math.sin(Math.min(1, (0.7 - b.diveT) / 0.25) * (Math.PI / 2));
      const side = b.dive * (Math.cos(b.face) >= 0 ? -1 : 1);
      this.tilt.rotation.z = side * 1.1 * k;
      this.tilt.position.x = -side * 0.5 * k;
      this.tilt.position.y = 0.3 * k;
    }
    if (cheer) this.tilt.position.y = Math.abs(Math.sin(time * 7 + b.slot)) * 0.5;
  }
}
