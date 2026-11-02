// The lazy river's things: inner tubes floating round in the current (some with guests in them), the docks
// where you get in, the footbridges over it, and Old Spitter on the island: a bronze llama standing on a rock
// in a splash basin, with a geyser in front of it that blows.
import * as THREE from 'three';
import { DS } from '../sim/ride';
import { BRIDGES, bridgeY, GEYSER, RIVER, RIVER_DOCKS, type Bridge } from '../sim/slides';
import { WATER_Y } from '../sim/world';
import { Batch } from './build';
import { signBoard, type Mats } from './lodge';
import { Person, type Look } from './person';
import type { BlockWater } from './water';

export interface RiverView {
  group: THREE.Group;
  /** Blow the geyser (it rumbles first). */
  erupt(): void;
  /** True from the button press until the geyser has finished. */
  readonly busy: boolean;
  /** `rider`: where you are floating, so the tubes keep out of your way. Returns 'rumble'/'blow' when they start. */
  animate(dt: number, t: number, rider: [number, number] | null): 'rumble' | 'blow' | null;
}

const LEN = (RIVER.length - 1) * DS;
const CURRENT = 0.9; // m/s, the same as the river's current for you

/** Position and direction along the river, `s` metres from its start. */
function along(s: number) {
  s = ((s % LEN) + LEN) % LEN;
  const f = s / DS, i = Math.floor(f), k = f - i;
  const a = RIVER[i], c = RIVER[Math.min(RIVER.length - 1, i + 1)];
  const p0 = RIVER[Math.max(0, i - 2)], p1 = RIVER[Math.min(RIVER.length - 1, i + 3)];
  const tx = p1[0] - p0[0], tz = p1[2] - p0[2], l = Math.hypot(tx, tz) || 1;
  return { x: a[0] + (c[0] - a[0]) * k, z: a[2] + (c[2] - a[2]) * k, tx: tx / l, tz: tz / l };
}

/** A beam (box) from a to c. */
function beam(b: Batch, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, w: number, h = w) {
  const d = c.clone().sub(a), len = d.length();
  const g = new THREE.BoxGeometry(w, len, h);
  const m = new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
  b.add(mat, g, m, 'world');
}

/** Turn a geometry inside out (to see a cylinder's wall from inside). */
function inward(g: THREE.BufferGeometry) {
  const idx = Array.from(g.index!.array);
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  g.setIndex(idx);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

function bridge(b: Batch, m: Mats, br: Bridge) {
  // The deck and ramps: the side profile (an arch under the deck), extruded across.
  const shape = new THREE.Shape();
  const S = 0.2;
  shape.moveTo(br.x0, 0);
  for (let x = br.x0; x <= br.x1 + 1e-6; x += S) shape.lineTo(x, bridgeY(br, x) + 0.02);
  shape.lineTo(br.x1, 0);
  shape.lineTo(br.d1, 0);
  // Underneath: an arch over the water.
  const mid = (br.d0 + br.d1) / 2, half = (br.d1 - br.d0) / 2;
  for (let x = br.d1; x >= br.d0 - 1e-6; x -= S) {
    const u = (x - mid) / half;
    shape.lineTo(x, br.h - 0.32 - 0.6 * u ** 4);
  }
  shape.lineTo(br.d0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: br.w, bevelEnabled: false });
  g.translate(0, 0, br.z - br.w / 2);
  b.add(m.plank, g, undefined, 'world');
  // A painted beam along each side of the deck, and log posts with a rope-wrapped handrail.
  const z0 = br.z - br.w / 2 - 0.05, z1 = br.z + br.w / 2 + 0.05;
  for (const z of [z0, z1]) {
    for (let x = br.x0 + 0.5; x <= br.x1 - 0.4; x += 1) {
      const y = bridgeY(br, x);
      b.put(m.bark, new THREE.CylinderGeometry(0.07, 0.08, 1.1, 8), x, y + 0.55, z);
    }
    const P = 0.5;
    for (let x = br.x0 + 0.5; x < br.x1 - 0.5 - 1e-6; x += P) {
      const x2 = Math.min(br.x1 - 0.5, x + P);
      beam(b, m.wood, new THREE.Vector3(x, bridgeY(br, x) + 1.05, z), new THREE.Vector3(x2, bridgeY(br, x2) + 1.05, z), 0.09);
      beam(b, m.wood, new THREE.Vector3(x, bridgeY(br, x) + 0.55, z), new THREE.Vector3(x2, bridgeY(br, x2) + 0.55, z), 0.05);
    }
    // The red-painted fascia over the water.
    b.box(m.redPaint, br.d0, br.h - 0.34, z - 0.03, br.d1, br.h - 0.12, z + 0.03);
  }
}

function basin(b: Batch, m: Mats) {
  const { x, z, basin: r, depth: d } = GEYSER;
  b.put(m.poolTile, new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), x, -d, z, 0, 1, 'world');
  const wall = inward(new THREE.CylinderGeometry(r, r, d, 40, 1, true));
  b.put(m.poolTile, wall, x, -d / 2, z, 0, 1, 'world');
  b.put(m.coping, new THREE.RingGeometry(r, r + 0.45, 40).rotateX(-Math.PI / 2), x, 0.05, z, 0, 1, 'world');
  b.put(m.coping, new THREE.CylinderGeometry(r + 0.45, r + 0.45, 0.05, 40, 1, true), x, 0.025, z, 0, 1, 'world');
  b.put(m.water, new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), x, WATER_Y, z, 0, 1, 'world');
  // The rock, lumpy.
  const lumps: [number, number, number, number, number][] = [
    [0, 0.3, 0, 1.45, 1.25], [0.7, 0.0, 0.5, 0.8, 0.9], [-0.8, 0.05, -0.3, 0.75, 0.9], [0.3, 0.0, -0.9, 0.7, 0.8], [-0.4, -0.05, 0.85, 0.6, 0.8],
  ];
  for (const [dx, y, dz, s, sy] of lumps) b.put(m.stone, new THREE.IcosahedronGeometry(1, 1), x + dx, y, z + dz, dx * 3, new THREE.Vector3(s, s * sy, s), 'world');
  // The vent: a ring of stones in the water.
  const [vx, vz] = GEYSER.vent;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.put(m.stone, new THREE.IcosahedronGeometry(0.22, 0), vx + Math.cos(a) * 0.45, WATER_Y + 0.02, vz + Math.sin(a) * 0.45, a, 1, 'world');
  }
}

/** The bronze llama, standing on the rock, head up, looking towards the lodge (+z). */
function llama(b: Batch, bronze: THREE.Material) {
  const K = 1.5; // bigger than life
  const x0 = GEYSER.x, y0 = GEYSER.rockH - 0.1, z0 = GEYSER.z - 0.1;
  const put = (g: THREE.BufferGeometry, dx: number, dy: number, dz: number) => b.put(bronze, g.scale(K, K, K), x0 + dx * K, y0 + dy * K, z0 + dz * K);
  const at = (dx: number, dy: number, dz: number) => new THREE.Vector3(x0 + dx * K, y0 + dy * K, z0 + dz * K);
  const blob = (dx: number, dy: number, dz: number, sx: number, sy: number, sz: number, tilt = 0) => put(new THREE.SphereGeometry(1, 18, 12).scale(sx, sy, sz).rotateX(tilt), dx, dy, dz);
  blob(0, 0.78, -0.05, 0.26, 0.26, 0.52); // the woolly body
  blob(0, 0.86, -0.42, 0.22, 0.22, 0.2); // rump
  blob(0, 0.86, 0.3, 0.22, 0.24, 0.22); // chest
  // The long neck, straight up from the chest.
  beam(b, bronze, at(0, 0.9, 0.36), at(0, 1.62, 0.44), 0.19 * K, 0.17 * K);
  blob(0, 1.25, 0.4, 0.12, 0.42, 0.11, 0.08); // (rounded front of the neck)
  // The head: a long face with a soft nose, eyes, and banana ears.
  blob(0, 1.7, 0.5, 0.12, 0.13, 0.15);
  blob(0, 1.66, 0.66, 0.085, 0.08, 0.12);
  for (const s of [-1, 1]) {
    put(new THREE.ConeGeometry(0.035, 0.2, 6).rotateZ(-s * 0.18).rotateX(-0.15), s * 0.065, 1.88, 0.44);
    // Four legs, with knobbly knees and little feet.
    for (const z of [-0.45, 0.3]) {
      beam(b, bronze, at(s * 0.13, 0.72, z), at(s * 0.13, 0.03, z + 0.02), 0.075 * K);
      put(new THREE.SphereGeometry(0.05, 8, 6), s * 0.13, 0.35, z + 0.01);
      put(new THREE.SphereGeometry(0.06, 8, 6).scale(1, 0.5, 1.5), s * 0.13, 0.03, z + 0.05);
    }
  }
  // A short fluffy tail.
  put(new THREE.SphereGeometry(0.08, 10, 8).scale(1, 1.4, 1), 0, 0.9, -0.64);
}

/** A dock: decking on the bank, a sign, and a stack of tubes. */
function dock(b: Batch, group: THREE.Group, m: Mats, tubeGeo: THREE.BufferGeometry, tubeMats: THREE.Material[], at: number) {
  const p = RIVER[at], { tx, tz } = along(at * DS);
  // Out of the river, away from the island.
  let ox = p[0] - GEYSER.x, oz = p[2] - GEYSER.z;
  const ol = Math.hypot(ox, oz);
  ox /= ol;
  oz /= ol;
  const yaw = Math.atan2(ox, oz);
  const cx = p[0] + ox * 3.4, cz = p[2] + oz * 3.4;
  b.put(m.plank, new THREE.BoxGeometry(3.6, 0.03, 2.6), cx - ox * 0.4, 0.015, cz - oz * 0.4, yaw, 1, 'world');
  // The sign on two posts, behind the deck, facing the river.
  const sx = cx + ox * 1.3, sz = cz + oz * 1.3;
  for (const s of [-1, 1]) b.put(m.bark, new THREE.CylinderGeometry(0.08, 0.09, 2.6, 8), sx + tx * s * 1.1, 1.3, sz + tz * s * 1.1);
  signBoard(group, ['🛟 LAZY RIVER', 'Grab a tube & float!'], sx - ox * 0.06, 2.05, sz - oz * 0.06, yaw + Math.PI, 2.4, 0.9, '#1f6f8b');
  // A stack of tubes beside the sign.
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(tubeGeo, tubeMats[(i + at) % tubeMats.length]);
    t.position.set(sx + tx * 1.9, 0.2 + i * 0.36, sz + tz * 1.9);
    t.rotation.set(Math.PI / 2 + (i % 2 ? 0.08 : -0.06), 0, i * 0.7);
    t.castShadow = true;
    group.add(t);
  }
}

export function buildRiver(m: Mats, water: BlockWater): RiverView {
  const group = new THREE.Group();
  const b = new Batch();
  for (const br of BRIDGES) bridge(b, m, br);
  basin(b, m);
  const bronze = new THREE.MeshStandardMaterial({ color: '#8c6a3c', roughness: 0.35, metalness: 0.85 });
  llama(b, bronze);
  // The button that sets it off: a big red button on a post, and a sign.
  const [bx, bz] = GEYSER.button;
  b.put(m.wood, new THREE.CylinderGeometry(0.12, 0.15, 1.0, 10), bx, 0.5, bz);
  b.put(m.redPaint, new THREE.CylinderGeometry(0.22, 0.24, 0.12, 16), bx, 1.06, bz);
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 0.4, roughness: 0.3 }));
  button.position.set(bx, 1.1, bz);
  group.add(button);
  b.put(m.bark, new THREE.CylinderGeometry(0.07, 0.08, 2.2, 8), bx + 1.5, 1.1, bz - 0.4);
  signBoard(group, ['🦙 OLD SPITTER', 'Push the button!'], bx + 1.5, 2.0, bz - 0.3, 0, 1.8, 0.75, '#5a2a1a');

  // Inner tubes: on the river, at the docks.
  const tubeGeo = new THREE.TorusGeometry(0.5, 0.2, 12, 24);
  const colors = ['#2f9be0', '#f2b51c', '#e8452c', '#3ba55c', '#e85d9c', '#f07b22'];
  const tubeMats = colors.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.6 }));
  RIVER_DOCKS.forEach((at) => dock(b, group, m, tubeGeo, tubeMats, at));
  b.flush(group);

  // Floating round: some empty, some with guests in them.
  const looks: (Look & { grown: boolean })[] = [
    { skin: '#f6d2b8', hair: '#c79a4a', shirt: '#fff', shorts: '#333', shoes: '#fff', swim: '#2f9be0', longHair: true, grown: true },
    { skin: '#8d5a3c', hair: '#111', shirt: '#fff', shorts: '#333', shoes: '#fff', swim: '#f2b51c', longHair: false, grown: false },
    { skin: '#e8b48f', hair: '#6b4423', shirt: '#fff', shorts: '#333', shoes: '#fff', swim: '#3ba55c', longHair: false, grown: true },
    { skin: '#c68863', hair: '#2b1d14', shirt: '#fff', shorts: '#333', shoes: '#fff', swim: '#e85d9c', longHair: true, grown: false },
  ];
  const N = 14;
  const floaters = Array.from({ length: N }, (_, k) => {
    const who = k % 3 === 1 ? looks[(k / 3) | 0] : undefined;
    let obj: THREE.Object3D;
    let person: Person | null = null;
    if (who) {
      person = new Person(who, { tube: true });
      person.setSwim(true);
      person.root.scale.setScalar(who.grown ? 1.2 : 1);
      obj = person.root;
    } else {
      const t = new THREE.Mesh(tubeGeo, tubeMats[k % tubeMats.length]);
      t.castShadow = true;
      obj = new THREE.Group();
      t.rotation.x = Math.PI / 2;
      obj.add(t);
    }
    group.add(obj);
    return { obj, person, s: (k / N) * LEN + Math.random() * 2, side: 0, spin: Math.random() * 6, k };
  });

  // The geyser.
  let blowT = -1; // seconds since the button (-1 = quiet)
  let auto = 20;
  let bubble = 0;
  const vent = new THREE.Vector3(GEYSER.vent[0], WATER_Y, GEYSER.vent[1]);
  const v = new THREE.Vector3(), p = new THREE.Vector3();
  const RUMBLE = 1.6, BLOW = 3.2;

  return {
    group,
    get busy() {
      return blowT >= 0;
    },
    erupt() {
      if (blowT < 0) blowT = 0;
    },
    animate(dt, t, rider) {
      // Tubes ride the current, drift side to side, turn slowly, and get out of your way.
      for (const f of floaters) {
        f.s += CURRENT * dt;
        const a = along(f.s);
        const nx = -a.tz, nz = a.tx; // across the river
        let want = Math.sin(t * 0.08 + f.k * 2.3) * 1.1;
        if (rider) {
          const dx = a.x - rider[0], dz = a.z - rider[1];
          if (dx * dx + dz * dz < 9) want = dx * nx + dz * nz > 0 ? 1.5 : -1.5;
          // Right on top of you: wait a moment.
          if (dx * dx + dz * dz < 1.4) f.s -= CURRENT * dt * 0.8;
        }
        f.side += (want - f.side) * Math.min(1, dt * 0.8);
        f.spin += dt * (f.k % 2 ? 0.12 : -0.1);
        const bob = Math.sin(t * 1.6 + f.k) * 0.025;
        if (f.person) {
          f.obj.position.set(a.x + nx * f.side, bob, a.z + nz * f.side);
          f.obj.rotation.set(0, Math.atan2(a.tx, a.tz) + Math.sin(t * 0.2 + f.k) * 0.6, 0);
          f.person.pose({ mode: 'tube', phase: 0, speed: 0, lean: 0, t: t + f.k, air: null, wet: 1, push: 0 });
        } else {
          f.obj.position.set(a.x + nx * f.side, WATER_Y + 0.06 + bob, a.z + nz * f.side);
          f.obj.rotation.set(Math.sin(t * 1.1 + f.k) * 0.04, f.spin, Math.cos(t * 1.3 + f.k) * 0.04);
        }
      }

      // The geyser: bubbles away, then (the button, or every so often) rumbles and BLOWS.
      let started: 'rumble' | 'blow' | null = null;
      auto -= dt;
      if (blowT < 0 && auto <= 0) blowT = 0;
      if (blowT >= 0) {
        if (blowT === 0) started = 'rumble';
        const before = blowT;
        blowT += dt;
        if (before < RUMBLE && blowT >= RUMBLE) started = 'blow';
        if (blowT > RUMBLE + BLOW) {
          blowT = -1;
          auto = 35;
        }
      }
      const rumbling = blowT >= 0 && blowT < RUMBLE;
      const blowing = blowT >= RUMBLE;
      // Blocks per second, and how fast they go up.
      const rate = blowing ? 110 : rumbling ? 30 : 6;
      const up = blowing ? 9 + 4 * Math.sin(Math.min(1, (blowT - RUMBLE) / BLOW) * Math.PI) : rumbling ? 2.5 + blowT * 2 : 2;
      bubble += dt * rate;
      while (bubble >= 1) {
        bubble--;
        const a = Math.random() * Math.PI * 2, r = Math.random() * (blowing ? 0.3 : 0.2);
        p.set(vent.x + Math.cos(a) * r, vent.y, vent.z + Math.sin(a) * r);
        const spread = blowing ? 0.9 : 0.4;
        v.set((Math.random() - 0.5) * spread * 2, up * (0.8 + Math.random() * 0.3), (Math.random() - 0.5) * spread * 2);
        water.throw(p, v, blowing ? 0.18 + Math.random() * 0.2 : 0.1 + Math.random() * 0.08);
      }
      button.position.y = 1.1 - (blowT >= 0 && blowT < 0.3 ? 0.06 : 0);
      return started;
    },
  };
}
