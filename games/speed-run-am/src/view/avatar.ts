// Blocky people: the runner (and the chasers, bigger and grumpier). The root sits at the middle of the feet,
// facing +z. `Pieces` breaks a person into flying blocks when you make a mistake.
import * as THREE from 'three';

export interface Look {
  skin: string;
  shirt: string;
  shorts: string;
  shoes: string;
  hair: string;
  /** Headband colour (runners) or none. */
  band?: string;
  cape?: boolean;
  /** Angry eyebrows (the chaser). */
  grumpy?: boolean;
}

export const RUNNER: Look = { skin: '#f1c27d', shirt: '#f06aa8', shorts: '#8b5a3c', shoes: '#ffffff', hair: '#4a2c1a', band: '#ffffff' };
export const CHASER: Look = { skin: '#ffb3a1', shirt: '#7048e8', shorts: '#343a40', shoes: '#212529', hair: '#212529', grumpy: true };

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  cape: THREE.Object3D;
  dispose(): void;
}

export function buildPerson(look: Look): Rig {
  const mats = new Map<string, THREE.Material>();
  const geos: THREE.BufferGeometry[] = [];
  const mat = (c: string) => {
    let m = mats.get(c);
    if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
    return m;
  };
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, c: string) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const pivot = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const p = new THREE.Object3D();
    p.position.set(x, y, z);
    parent.add(p);
    return p;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs: THREE.Object3D[] = [];
  const arms: THREE.Object3D[] = [];
  for (const s of [1, -1]) {
    const p = pivot(body, s * 0.17, 0.8, 0);
    box(p, 0.3, 0.45, 0.32, 0, -0.2, 0, look.shorts);
    box(p, 0.28, 0.35, 0.3, 0, -0.6, 0, look.skin);
    box(p, 0.3, 0.12, 0.42, 0, -0.74, 0.05, look.shoes);
    legs.push(p);
  }
  box(body, 0.66, 0.62, 0.36, 0, 1.11, 0, look.shirt);
  for (const s of [1, -1]) {
    const p = pivot(body, s * 0.44, 1.38, 0);
    box(p, 0.22, 0.3, 0.26, 0, -0.12, 0, look.shirt);
    box(p, 0.2, 0.36, 0.24, 0, -0.44, 0, look.skin);
    arms.push(p);
  }
  const head = pivot(body, 0, 1.68, 0);
  box(head, 0.5, 0.5, 0.48, 0, 0, 0, look.skin);
  box(head, 0.54, 0.16, 0.52, 0, 0.22, -0.02, look.hair);
  box(head, 0.54, 0.3, 0.12, 0, 0.06, -0.22, look.hair);
  if (look.band) box(head, 0.55, 0.08, 0.53, 0, 0.15, 0, look.band);
  for (const s of [1, -1]) {
    box(head, 0.09, 0.1, 0.03, s * 0.12, 0.03, 0.245, '#222222');
    if (look.grumpy) box(head, 0.16, 0.04, 0.03, s * 0.12, 0.12, 0.25, '#222222').rotation.z = s * 0.4;
  }
  box(head, 0.18, 0.04, 0.03, 0, -0.12, 0.245, look.grumpy ? '#a61e4d' : '#c2255c');

  // The cape hangs from the shoulders and flaps out behind when running.
  const cape = pivot(body, 0, 1.4, -0.2);
  box(cape, 0.62, 0.95, 0.05, 0, -0.47, -0.02, '#e03131');
  box(cape, 0.66, 0.08, 0.1, 0, 0, 0, '#ffd43b');
  cape.visible = !!look.cape;

  return {
    root,
    body,
    legs,
    arms,
    cape,
    dispose() {
      root.removeFromParent();
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

export function animate(rig: Rig, t: number, speed: number, airborne: boolean) {
  const run = Math.min(1, speed / 7);
  const fast = 9 + Math.min(8, speed);
  const swing = Math.sin(t * fast) * 0.9 * run;
  rig.legs.forEach((l, i) => (l.rotation.x = airborne ? (i ? 0.5 : -0.5) : i ? swing : -swing));
  rig.arms.forEach((a, i) => (a.rotation.x = airborne ? Math.PI * 0.85 : i ? -swing : swing));
  rig.body.position.y = airborne ? 0 : Math.abs(Math.sin(t * fast)) * 0.07 * run;
  rig.body.rotation.x = run * 0.15; // lean into the run
  rig.cape.rotation.x = 0.15 + run * 0.9 + (airborne ? 0.4 : 0) + Math.sin(t * 10) * 0.08 * run;
}

/** The runner breaking into blocks that bounce away. */
export class Pieces {
  private parts: { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  private readonly group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  get active() {
    return this.parts.length > 0;
  }

  /** Copies every block of the rig as it is now, and throws them outwards. */
  burst(rig: Rig) {
    this.clear();
    rig.root.updateMatrixWorld(true);
    const centre = new THREE.Vector3().setFromMatrixPosition(rig.root.matrixWorld).add(new THREE.Vector3(0, 1, 0));
    rig.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible || !o.parent?.visible) return;
      const m = new THREE.Mesh(o.geometry, o.material);
      o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      const v = m.position.clone().sub(centre).normalize().multiplyScalar(4 + Math.random() * 4);
      v.y += 5 + Math.random() * 4;
      this.parts.push({ mesh: m, v, spin: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6) });
      this.group.add(m);
    });
  }

  update(dt: number, floorY: number) {
    for (const p of this.parts) {
      p.v.y -= 25 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < floorY + 0.1 && p.v.y < 0) {
        p.mesh.position.y = floorY + 0.1;
        p.v.y *= -0.4;
        p.v.x *= 0.7;
        p.v.z *= 0.7;
        p.spin.multiplyScalar(0.7);
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
    }
  }

  clear() {
    this.group.clear();
    this.parts = [];
  }
}
