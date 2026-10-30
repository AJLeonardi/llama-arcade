// Draws the city from the sim's data (`sim/world.ts`), streaming chunks in ahead of the skater and dropping
// them behind. Each chunk is a handful of merged meshes, one per material.
import * as THREE from 'three';
import { CHUNK, CITY_LEN, chunk, chunkIndex, HALF_W, rng, ROOF_Y, type Building, type Chunk, type Decor, type Look, type Piece, type RampPiece } from '../sim/world';
import { between, Geo, norm } from './geo';
import { barkMaterial, leafMaterials, treeGeometry } from './trees';
import { asphalt, concrete, facade, FACADE_H, FACADE_W, FACADES, plywood, rampSurface, roofTex, textTexture } from './textures';

type V3 = [number, number, number];
type Key = Look | 'asphalt' | 'steel' | 'metal' | 'leaves' | 'bark' | 'bench' | 'lampGlow' | `facade${number}`;

function makeMaterials() {
  const cc = concrete(2), cw = concrete(1), wood = plywood(), ramp = rampSurface(), asp = asphalt();
  const m: Partial<Record<Key, THREE.Material>> = {
    concrete: new THREE.MeshStandardMaterial({ map: cc.map, normalMap: cc.normal, roughness: 0.92, color: 0xd8d6d0 }),
    wall: new THREE.MeshStandardMaterial({ map: cw.map, normalMap: cw.normal, roughness: 0.85, color: 0x9da3aa }),
    blue: new THREE.MeshStandardMaterial({ map: ramp.map, normalMap: ramp.normal, normalScale: new THREE.Vector2(0.5, 0.5), color: 0x1e6ee8, roughness: 0.38 }),
    wood: new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.7 }),
    red: new THREE.MeshStandardMaterial({ map: ramp.map, color: 0xc0392b, roughness: 0.45 }),
    roof: new THREE.MeshStandardMaterial({ map: roofTex(), roughness: 0.95 }),
    asphalt: new THREE.MeshStandardMaterial({ map: asp.map, normalMap: asp.normal, roughness: 0.95, color: 0xc4c4c4 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x6b7480, metalness: 0.7, roughness: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 1, roughness: 0.25 }),
    leaves: leafMaterials().leaves,
    bark: barkMaterial(),
    bench: new THREE.MeshStandardMaterial({ map: wood.map, color: 0xb07a4a, roughness: 0.75 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff0cc, emissiveIntensity: 1.5 }),
  };
  FACADES.forEach((st, i) => {
    const f = facade(i);
    m[`facade${i}`] = new THREE.MeshStandardMaterial({ map: f.map, roughnessMap: f.rm, metalnessMap: f.rm, roughness: 1, metalness: 1, envMapIntensity: 1.2 });
    void st;
  });
  return m as Record<Key, THREE.Material>;
}

/** What each surface look uses on the sides. */
const SIDE: Record<Look, Key> = { concrete: 'concrete', blue: 'steel', wood: 'wood', red: 'concrete', roof: 'roof', wall: 'wall' };
const TILE: Partial<Record<Key, number>> = { concrete: 4, wall: 4, blue: 4, wood: 2, red: 4, roof: 8, asphalt: 8 };

// ---------------------------------------------------------------- props (one geometry each, copied into chunks)

const lampParts = (() => {
  let made: { metal: THREE.BufferGeometry[]; glow: THREE.BufferGeometry } | null = null;
  return () => {
    if (made) return made;
    const pole = new THREE.CylinderGeometry(0.07, 0.11, 7, 10).translate(0, 3.5, 0);
    const arm = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8).rotateZ(Math.PI / 2).translate(1.1, 6.9, 0);
    const head = new THREE.BoxGeometry(0.8, 0.14, 0.32).translate(2.1, 6.85, 0);
    const base = new THREE.CylinderGeometry(0.2, 0.24, 0.5, 10).translate(0, 0.25, 0);
    const glow = new THREE.BoxGeometry(0.66, 0.03, 0.24).translate(2.1, 6.77, 0);
    return (made = { metal: [pole, arm, head, base], glow });
  };
})();

/** A few tree shapes, so the street doesn't look copy-pasted. */
const TREE_KINDS = 4;
const treeParts = (() => {
  const made: { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry; grate: THREE.BufferGeometry }[] = [];
  return (i: number) => {
    const k = ((i % TREE_KINDS) + TREE_KINDS) % TREE_KINDS;
    if (!made[k]) made[k] = { ...treeGeometry(k), grate: new THREE.BoxGeometry(1.4, 0.04, 1.4).translate(0, 0.17, 0) };
    return made[k];
  };
})();

const benchParts = (() => {
  let made: { wood: THREE.BufferGeometry[]; metal: THREE.BufferGeometry[] } | null = null;
  return () => {
    if (made) return made;
    const wood: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) wood.push(new THREE.BoxGeometry(1.8, 0.04, 0.13).translate(0, 0.45, -0.18 + i * 0.16));
    wood.push(new THREE.BoxGeometry(1.8, 0.12, 0.04).translate(0, 0.75, -0.27));
    const metal = [-0.75, 0.75].map((x) => new THREE.BoxGeometry(0.06, 0.45, 0.5).translate(x, 0.225, -0.05));
    return (made = { wood, metal });
  };
})();

// ---------------------------------------------------------------- building a chunk

class Batch {
  geos = new Map<Key, Geo>();
  get(k: Key) {
    let g = this.geos.get(k);
    if (!g) this.geos.set(k, (g = new Geo()));
    return g;
  }
}

/** World point for a ramp piece: s along it, `a` across (0..1), height h. */
function rampPoint(p: RampPiece, s: number, a: number, h: number): V3 {
  const along = p.s0 + p.dir * s;
  if (p.axis === 'z') return [p.x0 + (p.x1 - p.x0) * a, h, along];
  return [along, h, p.z0 + (p.z1 - p.z0) * a];
}

function addRamp(b: Batch, p: RampPiece) {
  const top = b.get(p.look), side = b.get(SIDE[p.look]);
  const tile = TILE[p.look] ?? 4, st = TILE[SIDE[p.look]] ?? 4;
  const { s: S, h: H } = p.prof;
  const width = p.axis === 'z' ? p.x1 - p.x0 : p.z1 - p.z0;
  // Normal of segment i (from point i to i+1) in world space.
  const segN = (i: number): V3 => {
    const ds = S[i + 1] - S[i], dh = H[i + 1] - H[i];
    const l = Math.hypot(ds, dh) || 1;
    const along = (-dh / l) * p.dir, up = ds / l;
    return p.axis === 'z' ? [0, up, along] : [along, up, 0];
  };
  const smooth = (i: number, j: number): V3 => {
    // Normal at point j shared by segments i and its neighbour, if they're nearly in line.
    if (j < 0 || j >= S.length - 1) return segN(i);
    const a = segN(i), c = segN(j);
    return a[0] * c[0] + a[1] * c[1] + a[2] * c[2] > 0.9 ? norm([a[0] + c[0], a[1] + c[1], a[2] + c[2]]) : a;
  };
  let run = 0;
  for (let i = 0; i < S.length - 1; i++) {
    const len = Math.hypot(S[i + 1] - S[i], H[i + 1] - H[i]);
    if (len < 1e-6) continue;
    const n0 = smooth(i, i - 1), n1 = smooth(i, i + 1);
    const v0 = run / tile, v1 = (run + len) / tile;
    run += len;
    top.quad(
      [rampPoint(p, S[i], 0, H[i]), rampPoint(p, S[i], 1, H[i]), rampPoint(p, S[i + 1], 1, H[i + 1]), rampPoint(p, S[i + 1], 0, H[i + 1])],
      [n0, n0, n1, n1],
      [[0, v0], [width / tile, v0], [width / tile, v1], [0, v1]],
    );
    // The two sides, down to the ground.
    for (const a of [0, 1]) {
      const out: V3 = p.axis === 'z' ? [a ? 1 : -1, 0, 0] : [0, 0, a ? 1 : -1];
      const sa = (p.s0 + p.dir * S[i]) / st, sb = (p.s0 + p.dir * S[i + 1]) / st;
      side.quad(
        [rampPoint(p, S[i], a, 0), rampPoint(p, S[i + 1], a, 0), rampPoint(p, S[i + 1], a, H[i + 1]), rampPoint(p, S[i], a, H[i])],
        out,
        [[sa, 0], [sb, 0], [sb, H[i + 1] / st], [sa, H[i] / st]],
      );
    }
  }
  // End walls.
  for (const [s, h, sign] of [[0, H[0], -1], [p.prof.len, H[H.length - 1], 1]] as const) {
    if (h < 0.01) continue;
    const d = p.dir * sign;
    const n: V3 = p.axis === 'z' ? [0, 0, d] : [d, 0, 0];
    side.quad([rampPoint(p, s, 0, 0), rampPoint(p, s, 1, 0), rampPoint(p, s, 1, h), rampPoint(p, s, 0, h)], n, [[0, 0], [width / st, 0], [width / st, h / st], [0, h / st]]);
  }
  if (p.coping) {
    const h = H[H.length - 1];
    const a = rampPoint(p, p.prof.len, 0, h), c = rampPoint(p, p.prof.len, 1, h);
    b.get('metal').add(new THREE.CylinderGeometry(0.035, 0.035, 1, 10), between(a, c));
  }
}

function addPiece(b: Batch, p: Piece) {
  if (p.kind === 'ramp') return addRamp(b, p);
  if (p.look === 'roof') return; // drawn as a building
  b.get(p.look).box(p.x0, p.x1, 0, p.top, p.z0, p.z1, TILE[p.look] ?? 4);
}

function addBuilding(b: Batch, bl: Building) {
  const g = b.get(`facade${bl.style}`);
  const { x0, x1, z0, z1, h } = bl;
  const u = 1 / FACADE_W, v = 1 / FACADE_H;
  // The four walls, texture lined up to the floors.
  g.quad([[x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0]], [1, 0, 0], [[z0 * u, 0], [z1 * u, 0], [z1 * u, h * v], [z0 * u, h * v]]);
  g.quad([[x0, 0, z1], [x0, 0, z0], [x0, h, z0], [x0, h, z1]], [-1, 0, 0], [[z1 * u, 0], [z0 * u, 0], [z0 * u, h * v], [z1 * u, h * v]]);
  g.quad([[x1, 0, z1], [x0, 0, z1], [x0, h, z1], [x1, h, z1]], [0, 0, 1], [[x1 * u, 0], [x0 * u, 0], [x0 * u, h * v], [x1 * u, h * v]]);
  g.quad([[x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0]], [0, 0, -1], [[x0 * u, 0], [x1 * u, 0], [x1 * u, h * v], [x0 * u, h * v]]);
  const r = b.get('roof');
  r.quad([[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]], [0, 1, 0], [[x0 / 8, z0 / 8], [x1 / 8, z0 / 8], [x1 / 8, z1 / 8], [x0 / 8, z1 / 8]]);
  // A parapet and a rooftop box or two.
  if (h > 20 && !bl.noParapet) {
    const w = b.get('wall');
    const t = 0.4, ph = 1.1;
    w.box(x0, x1, h, h + ph, z0, z0 + t);
    w.box(x0, x1, h, h + ph, z1 - t, z1);
    w.box(x0, x0 + t, h, h + ph, z0, z1);
    w.box(x1 - t, x1, h, h + ph, z0, z1);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    w.box(cx - 2, cx + 2, h, h + 3, cz - 1.5, cz + 1.5);
  }
}

function addRail(b: Batch, a: V3, c: V3) {
  const m = b.get('metal');
  m.add(new THREE.CylinderGeometry(0.03, 0.03, 1, 10), between(a, c));
  const len = Math.hypot(c[0] - a[0], c[2] - a[2]);
  const posts = Math.max(2, Math.ceil(len / 3) + 1);
  for (let i = 0; i < posts; i++) {
    const t = 0.04 + (0.92 * i) / (posts - 1);
    const x = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * t, z = a[2] + (c[2] - a[2]) * t;
    // Down to whatever is below (the stairs' handrail stands on the steps).
    m.add(new THREE.CylinderGeometry(0.025, 0.025, 1, 8), between([x, y, z], [x, Math.max(0, groundUnder(x, z, y)), z]));
  }
}

let currentChunk: Chunk | null = null;
function groundUnder(x: number, z: number, y: number) {
  let h = 0;
  for (const p of currentChunk?.pieces ?? []) {
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    if (p.kind === 'box') h = Math.max(h, p.top <= y ? p.top : h);
    else {
      const c = p.axis === 'x' ? x : z, s = (c - p.s0) * p.dir;
      let best = 0;
      for (let i = 0; i < p.prof.s.length; i++) if (p.prof.s[i] <= s) best = p.prof.h[i];
      if (best <= y) h = Math.max(h, best);
    }
  }
  return h;
}

function place(x: number, y: number, z: number, rot = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
}

function addDecor(b: Batch, d: Decor, extra: THREE.Object3D[]) {
  if (d.kind === 'lamp') {
    const lp = lampParts(), m = place(d.x, 0.15, d.z, d.rot);
    for (const g of lp.metal) b.get('steel').add(g, m);
    b.get('lampGlow').add(lp.glow, m);
  } else if (d.kind === 'tree') {
    const tp = treeParts(Math.round(d.z / 10)), m = place(d.x, 0, d.z, d.x * 7 + d.z);
    b.get('bark').add(tp.bark, m);
    b.get('leaves').add(tp.leaves, m);
    b.get('steel').add(tp.grate, m);
  } else if (d.kind === 'bench') {
    const bp = benchParts(), m = place(d.x, 0.15, d.z, d.rot);
    for (const g of bp.wood) b.get('bench').add(g, m);
    for (const g of bp.metal) b.get('steel').add(g, m);
  } else if (d.kind === 'mile' || d.kind === 'banner') {
    // An arch over the street (or over the drop-in at the top of the building).
    const top = d.kind === 'banner';
    const y0 = top ? ROOF_Y : 0, half = top ? 6.8 : HALF_W - 3, h = top ? 4.5 : 9;
    const z = top ? -1.5 : d.z;
    for (const s of [-1, 1]) b.get('steel').add(new THREE.CylinderGeometry(0.15, 0.15, 1, 10), between([s * half, y0, z], [s * half, y0 + h + 1.2, z]));
    const w = top ? 2 * half : 24;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshStandardMaterial({ map: textTexture(d.text ?? '', top ? '#1e6ee8' : '#163a6b', '#ffffff'), roughness: 0.6, side: THREE.DoubleSide }),
    );
    sign.position.set(0, y0 + h + w / 8, z);
    if (top) sign.rotation.y = Math.PI; // faces the skater on the roof
    sign.castShadow = true;
    extra.push(sign);
    b.get('steel').add(new THREE.BoxGeometry(2 * half, 0.25, 0.25), place(0, y0 + h, z));
  }
}

/** Far-off towers beside the street, for the skyline (seen from the roof). Not solid. */
function skyline(i: number): Building[] {
  const r = rng(i * 31 + 999);
  const out: Building[] = [];
  for (let k = 0; k < 4; k++) {
    const side = k % 2 ? 1 : -1;
    const x = side * (110 + r() * 300), z = i * CHUNK + r() * CHUNK;
    const w = 20 + r() * 25, d = 20 + r() * 25;
    out.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: 40 + r() * r() * 220, style: Math.floor(r() * FACADES.length) });
  }
  return out;
}

const START_BUILDINGS: Building[] = [
  { x0: -15, x1: 15, z0: -40, z1: 0, h: ROOF_Y, style: 0, noParapet: true },
  { x0: -HALF_W, x1: -15, z0: -40, z1: 0, h: 50, style: 2 },
  { x0: 15, x1: HALF_W, z0: -40, z1: 0, h: 50, style: 4 },
  { x0: -80, x1: -HALF_W, z0: -40, z1: 0, h: 70, style: 1 },
  { x0: HALF_W, x1: 80, z0: -40, z1: 0, h: 65, style: 3 },
  { x0: -80, x1: 80, z0: -90, z1: -40, h: 85, style: 2 },
];

function buildChunk(c: Chunk, mats: Record<Key, THREE.Material>) {
  const b = new Batch();
  const extra: THREE.Object3D[] = [];
  currentChunk = c;
  if (c.i >= 0) {
    const z0 = c.i * CHUNK, z1 = Math.min(CITY_LEN + 20, z0 + CHUNK);
    const t = 1 / 8;
    b.get('asphalt').quad([[-HALF_W + 4, 0, z0], [HALF_W - 4, 0, z0], [HALF_W - 4, 0, z1], [-HALF_W + 4, 0, z1]], [0, 1, 0], [[(-HALF_W + 4) * t, z0 * t], [(HALF_W - 4) * t, z0 * t], [(HALF_W - 4) * t, z1 * t], [(-HALF_W + 4) * t, z1 * t]]);
    for (const bl of skyline(c.i)) addBuilding(b, bl);
    if (z0 + CHUNK > CITY_LEN) addBuilding(b, { x0: -HALF_W - 30, x1: HALF_W + 30, z0: CITY_LEN, z1: CITY_LEN + 40, h: 60, style: 3 });
  } else {
    for (const bl of START_BUILDINGS) addBuilding(b, bl);
  }
  for (const p of c.pieces) addPiece(b, p);
  for (const r of c.rails) if (!r.edge) addRail(b, r.a, r.b);
  for (const d of c.decor) addDecor(b, d, extra);
  for (const bl of c.buildings) addBuilding(b, bl);
  currentChunk = null;
  const group = new THREE.Group();
  for (const [k, g] of b.geos) {
    if (g.empty) continue;
    const mesh = new THREE.Mesh(g.build(), mats[k]);
    const facadeOrRoof = k.startsWith('facade') || k === 'roof';
    mesh.receiveShadow = true;
    mesh.castShadow = !facadeOrRoof && k !== 'asphalt';
    if (k === 'leaves') mesh.customDepthMaterial = leafMaterials().depth;
    group.add(mesh);
  }
  for (const e of extra) group.add(e);
  return group;
}

export class CityView {
  readonly root = new THREE.Group();
  private mats = makeMaterials();
  private loaded = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    // Land far beyond the street, under everything.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, CITY_LEN + 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 1 }));
    ground.position.set(0, -0.03, CITY_LEN / 2);
    ground.receiveShadow = true;
    this.root.add(ground);
    this.load(-1);
  }

  private load(i: number) {
    const g = buildChunk(chunk(i), this.mats);
    this.loaded.set(i, g);
    this.root.add(g);
  }

  /** Keep the chunks around street position z built. Builds at most `budget` new ones. */
  update(z: number, budget = 1) {
    const at = chunkIndex(Math.max(0, z));
    const lo = Math.max(0, at - 2), hi = Math.min(Math.floor(CITY_LEN / CHUNK), at + 6);
    for (const [i, g] of this.loaded) {
      if (i >= 0 && (i < lo - 1 || i > hi + 1)) {
        this.root.remove(g);
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            if (!Object.values(this.mats).includes(o.material)) {
              (o.material as THREE.MeshStandardMaterial).map?.dispose();
              (o.material as THREE.Material).dispose();
            }
          }
        });
        this.loaded.delete(i);
      }
    }
    // Nearest first.
    const want: number[] = [];
    for (let i = lo; i <= hi; i++) if (!this.loaded.has(i)) want.push(i);
    want.sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
    for (const i of want.slice(0, budget)) this.load(i);
  }
}
