// The player's character, all boxes: a blocky llama or a blocky person, plus a hat, glasses and a cape.
// The root sits at the middle of the feet, facing +z.
import * as THREE from 'three';
import { itemById, type Outfit } from '../sim/shop';
import { rainbowTex } from './textures';

export interface Rig {
  root: THREE.Group;
  /** Swing pivots, in step order (front-left, front-right, back-left, back-right for a llama). */
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  cape: THREE.Object3D | null;
  /** The body (bobs while running). */
  body: THREE.Object3D;
  llama: boolean;
  dispose(): void;
}

const colorOf = (id: string) => itemById(id)?.color ?? '#ffffff';

export function buildAvatar(o: Outfit): Rig {
  const mats = new Map<string, THREE.Material>();
  const geos: THREE.BufferGeometry[] = [];
  const mat = (c: string) => {
    let m = mats.get(c);
    if (!m) {
      if (c === 'rainbow') m = new THREE.MeshLambertMaterial({ map: rainbowTex() });
      else if (c === '#ffcc33') m = new THREE.MeshLambertMaterial({ color: c, emissive: 0x553300 }); // gold shines
      else m = new THREE.MeshLambertMaterial({ color: c });
      mats.set(c, m);
    }
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
  let cape: THREE.Object3D | null = null;
  const fur = colorOf(o.color);
  const capeColor = { 'k-red': '#e03131', 'k-blue': '#339af0', 'k-rainbow': 'rainbow' }[o.cape] ?? '';
  // Where hats and glasses go.
  const headTop = new THREE.Object3D();
  const face = new THREE.Object3D();

  if (o.body === 'llama') {
    const light = fur === 'rainbow' ? '#fff8ec' : '#' + new THREE.Color(fur).lerp(new THREE.Color('#ffffff'), 0.45).getHexString();
    for (const [x, z] of [[0.24, 0.42], [-0.24, 0.42], [0.24, -0.42], [-0.24, -0.42]]) {
      const p = pivot(root, x, 0.65, z);
      box(p, 0.22, 0.65, 0.22, 0, -0.325, 0, fur);
      box(p, 0.24, 0.1, 0.26, 0, -0.6, 0.02, '#5c4033'); // hooves
      legs.push(p);
    }
    box(body, 0.78, 0.6, 1.25, 0, 0.95, 0, fur);
    box(body, 0.34, 0.8, 0.34, 0, 1.55, 0.46, fur); // neck
    const head = pivot(body, 0, 2.0, 0.56);
    box(head, 0.44, 0.42, 0.5, 0, 0, 0, fur);
    box(head, 0.32, 0.26, 0.24, 0, -0.08, 0.34, light); // snout
    box(head, 0.06, 0.05, 0.02, 0.06, -0.06, 0.465, '#3b2a20'); // nostrils
    box(head, 0.06, 0.05, 0.02, -0.06, -0.06, 0.465, '#3b2a20');
    box(head, 0.12, 0.03, 0.02, 0, -0.16, 0.465, '#3b2a20'); // smile
    for (const s of [1, -1]) {
      box(head, 0.1, 0.11, 0.04, s * 0.14, 0.06, 0.25, '#222222'); // eyes
      box(head, 0.04, 0.04, 0.02, s * 0.12, 0.08, 0.275, '#ffffff');
      const ear = box(head, 0.1, 0.28, 0.1, s * 0.14, 0.32, -0.08, fur);
      ear.rotation.z = -s * 0.15;
    }
    const tail = box(body, 0.2, 0.32, 0.2, 0, 1.12, -0.68, fur);
    tail.rotation.x = -0.5;
    headTop.position.set(0, 0.21, 0);
    face.position.set(0, 0.07, 0.26);
    head.add(headTop, face);
    if (capeColor) {
      // On a llama the "cape" is a blanket over its back.
      const c = pivot(body, 0, 1.25, -0.05);
      box(c, 0.86, 0.06, 0.8, 0, 0.005, 0, capeColor);
      box(c, 0.04, 0.38, 0.8, 0.43, -0.17, 0, capeColor);
      box(c, 0.04, 0.38, 0.8, -0.43, -0.17, 0, capeColor);
      box(c, 0.88, 0.05, 0.05, 0, 0.02, 0.4, '#ffd43b');
      cape = c;
    }
  } else {
    const skin = colorOf(o.skin), pants = colorOf(o.pants);
    for (const x of [0.2, -0.2]) {
      const p = pivot(root, x, 0.78, 0);
      box(p, 0.38, 0.78, 0.38, 0, -0.39, 0, pants);
      legs.push(p);
    }
    box(body, 0.8, 0.78, 0.4, 0, 1.17, 0, fur); // torso (shirt)
    for (const x of [0.6, -0.6]) {
      const p = pivot(body, x, 1.5, 0);
      box(p, 0.38, 0.78, 0.38, 0, -0.33, 0, skin);
      box(p, 0.4, 0.3, 0.4, 0, -0.07, 0, fur); // sleeve
      arms.push(p);
    }
    const head = pivot(body, 0, 1.86, 0);
    box(head, 0.56, 0.56, 0.56, 0, 0, 0, skin);
    for (const s of [1, -1]) box(head, 0.08, 0.13, 0.02, s * 0.12, 0.06, 0.285, '#222222');
    box(head, 0.24, 0.05, 0.02, 0, -0.12, 0.285, '#222222'); // smile
    box(head, 0.05, 0.05, 0.02, 0.13, -0.08, 0.285, '#222222');
    box(head, 0.05, 0.05, 0.02, -0.13, -0.08, 0.285, '#222222');
    headTop.position.set(0, 0.28, 0);
    face.position.set(0, 0.06, 0.29);
    head.add(headTop, face);
    if (capeColor) {
      const c = pivot(body, 0, 1.52, -0.22);
      box(c, 0.76, 1.1, 0.05, 0, -0.55, 0, capeColor);
      cape = c;
    }
  }

  addHat(headTop, o.hat, box, geos, mat, o.body === 'llama');
  addGlasses(face, o.glasses, box, geos, mat, o.body === 'llama' ? 0.4 : 0.56);

  return {
    root, legs, arms, cape, body, llama: o.body === 'llama',
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats.values()) m.dispose();
      root.removeFromParent();
    },
  };
}

type BoxFn = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, c: string) => THREE.Mesh;

function addHat(at: THREE.Object3D, hat: string, box: BoxFn, geos: THREE.BufferGeometry[], mat: (c: string) => THREE.Material, llama: boolean) {
  const mesh = (g: THREE.BufferGeometry, c: string, y: number) => {
    geos.push(g);
    const m = new THREE.Mesh(g, mat(c));
    m.position.y = y;
    m.castShadow = true;
    at.add(m);
    return m;
  };
  const s = llama ? 0.85 : 1; // llama heads are a bit narrower
  switch (hat) {
    case 'h-cap':
      box(at, 0.58 * s, 0.18, 0.58 * s, 0, 0.09, 0, '#e03131');
      box(at, 0.5 * s, 0.04, 0.3, 0, 0.02, 0.4 * s, '#e03131');
      box(at, 0.1, 0.06, 0.1, 0, 0.2, 0, '#ffffff');
      break;
    case 'h-party':
      mesh(new THREE.ConeGeometry(0.2, 0.5, 12), '#ffd43b', 0.25);
      mesh(new THREE.SphereGeometry(0.07, 8, 6), '#e23d8f', 0.52);
      break;
    case 'h-cowboy':
      mesh(new THREE.CylinderGeometry(0.5 * s, 0.5 * s, 0.04, 20), '#8a5a2b', 0.02);
      box(at, 0.4 * s, 0.26, 0.4 * s, 0, 0.17, 0, '#8a5a2b');
      box(at, 0.41 * s, 0.06, 0.41 * s, 0, 0.08, 0, '#4a2e17');
      break;
    case 'h-top':
      mesh(new THREE.CylinderGeometry(0.4 * s, 0.4 * s, 0.04, 20), '#212529', 0.02);
      mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 20), '#212529', 0.27);
      mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.08, 20), '#e03131', 0.08);
      break;
    case 'h-flower':
      box(at, 0.16, 0.1, 0.16, 0.12, 0.05, 0.05, '#ffd43b');
      for (const [x, z] of [[0.24, 0.05], [0, 0.05], [0.12, 0.17], [0.12, -0.07]]) box(at, 0.13, 0.08, 0.13, x, 0.04, z, '#f783ac');
      break;
    case 'h-crown': {
      mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 12), '#ffcc33', 0.08);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = mesh(new THREE.ConeGeometry(0.06, 0.16, 6), '#ffcc33', 0.24);
        spike.position.x = Math.sin(a) * 0.23;
        spike.position.z = Math.cos(a) * 0.23;
      }
      box(at, 0.08, 0.08, 0.04, 0, 0.08, 0.26, '#e03131');
      break;
    }
  }
}

function addGlasses(at: THREE.Object3D, glasses: string, box: BoxFn, geos: THREE.BufferGeometry[], mat: (c: string) => THREE.Material, width: number) {
  const gap = width * 0.25;
  switch (glasses) {
    case 'g-sun':
      box(at, width * 0.95, 0.04, 0.04, 0, 0.04, 0.02, '#111111');
      for (const s of [1, -1]) box(at, width * 0.36, 0.15, 0.04, s * gap, -0.01, 0.03, '#111111');
      break;
    case 'g-heart':
      box(at, width * 0.95, 0.03, 0.03, 0, 0.04, 0.02, '#e64980');
      for (const s of [1, -1]) {
        box(at, 0.14, 0.14, 0.04, s * gap, -0.01, 0.03, '#ff4f8b').rotation.z = Math.PI / 4;
        box(at, 0.08, 0.08, 0.045, s * gap - 0.04, 0.04, 0.03, '#ff4f8b').rotation.z = Math.PI / 4;
        box(at, 0.08, 0.08, 0.045, s * gap + 0.04, 0.04, 0.03, '#ff4f8b').rotation.z = Math.PI / 4;
      }
      break;
    case 'g-star': {
      box(at, width * 0.95, 0.03, 0.03, 0, 0.04, 0.02, '#f59f00');
      const shape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.05 : 0.12, a = (i / 10) * Math.PI * 2;
        if (i === 0) shape.moveTo(Math.sin(a) * r, Math.cos(a) * r);
        else shape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
      geos.push(g);
      for (const s of [1, -1]) {
        const m = new THREE.Mesh(g, mat('#ffd43b'));
        m.position.set(s * gap, 0, 0.02);
        at.add(m);
      }
      break;
    }
  }
}

/** Walk/run/jump poses. `speed` is ground speed (units/s); `t` is time (s). */
export function animate(rig: Rig, t: number, speed: number, airborne: boolean) {
  const run = Math.min(1, speed / 7);
  const swing = Math.sin(t * (rig.llama ? 13 : 11)) * 0.8 * run;
  if (rig.llama) {
    const tuck = airborne ? 0.6 : 0;
    rig.legs.forEach((l, i) => (l.rotation.x = airborne ? (i < 2 ? -tuck : tuck) : (i === 0 || i === 3 ? swing : -swing)));
  } else {
    rig.legs.forEach((l, i) => (l.rotation.x = airborne ? (i ? 0.4 : -0.4) : i ? swing : -swing));
    // Arms up when jumping, like a Roblox jump.
    rig.arms.forEach((a, i) => (a.rotation.x = airborne ? Math.PI * 0.9 : i ? -swing : swing));
  }
  rig.body.position.y = airborne ? 0 : Math.abs(Math.sin(t * 11)) * 0.06 * run;
  if (rig.cape) rig.cape.rotation.x = rig.llama ? 0 : 0.15 + run * 0.6 + (airborne ? 0.3 : 0) + Math.sin(t * 9) * 0.05 * run;
}
