// The water park's rides in 3D, built from the same paths the riders follow: fibreglass tubes and open
// troughs swept along the centre line, a sheet of running water inside, steel columns holding them up, the
// funnels and the toilet bowl turned on a lathe from their real profiles, and the stair towers.
import * as THREE from 'three';
import { DS, surfH, type PathSeg, type RideDef, type SurfSeg } from '../sim/ride';
import { DROP_TOWER, RIDES, RIVER, RIVER_DEPTH, RIVER_W, SPLASH, TOWER, TOWER_STAIRS, type Tower } from '../sim/slides';
import { RAIL_H, treads, type Piece, type Rect, type Side } from '../sim/stairs';
import { WATER_Y, type V3 } from '../sim/world';
import { Batch } from './build';
import { slideWater, signTexture } from './textures';

const glossy = new Map<string, THREE.MeshPhysicalMaterial>();
/** Shiny gel-coat fibreglass. Tubes are see-through, so you can watch the riders inside. */
function fibreglass(color: string, seeThrough: boolean) {
  const key = color + seeThrough;
  let m = glossy.get(key);
  if (!m) {
    m = seeThrough
      ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false, envMapIntensity: 0.4 })
      : new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.3, side: THREE.DoubleSide, envMapIntensity: 0.35 });
    glossy.set(key, m);
  }
  return m;
}
export const steel = new THREE.MeshStandardMaterial({ color: '#c9ced4', roughness: 0.35, metalness: 0.85 });
const darkSteel = new THREE.MeshStandardMaterial({ color: '#5a6066', roughness: 0.5, metalness: 0.7 });
/** Steel safety mesh for the stair railings: a wire grid (cut out, so it's one cheap panel per railing). */
const safetyMesh = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#d6dade';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 0.07, 1 / 0.07); // 7 cm squares (the UVs are in metres)
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 });
})();

/** Sheet of water running down the slides: its texture scrolls (see `animate`). */
const flowMat = new THREE.MeshStandardMaterial({ map: slideWater(), transparent: true, opacity: 0.75, roughness: 0.05, depthWrite: false });

interface Frame { p: V3; side: V3; up: V3; t: V3 }

/** Level frames along a path (no twisting): `side` stays horizontal. */
function frames(pts: V3[]): Frame[] {
  const out: Frame[] = [];
  let lastSide: V3 = [1, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let t: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const tl = Math.hypot(...t) || 1;
    t = [t[0] / tl, t[1] / tl, t[2] / tl];
    let side: V3 = [-t[2], 0, t[0]]; // t × up, like the rider's frame
    const sl = Math.hypot(side[0], side[2]);
    if (sl < 0.15) side = lastSide;
    else side = [side[0] / sl, 0, side[2] / sl];
    lastSide = side;
    // up = side × t
    const up: V3 = [side[1] * t[2] - side[2] * t[1], side[2] * t[0] - side[0] * t[2], side[0] * t[1] - side[1] * t[0]];
    out.push({ p: pts[i], side, up, t });
  }
  return out;
}

/** Sweep a cross-section (angles round the centre line, 0 = straight down) along a path. */
function sweep(fr: Frame[], radius: number, a0: number, a1: number, segs: number, uvAlong = 1) {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i];
    for (let j = 0; j <= segs; j++) {
      const a = a0 + ((a1 - a0) * j) / segs;
      // Direction from the centre: down is -up; positive angles go round towards +side.
      const dx = -f.up[0] * Math.cos(a) + f.side[0] * Math.sin(a);
      const dy = -f.up[1] * Math.cos(a) + f.side[1] * Math.sin(a);
      const dz = -f.up[2] * Math.cos(a) + f.side[2] * Math.sin(a);
      pos.push(f.p[0] + dx * radius, f.p[1] + dy * radius, f.p[2] + dz * radius);
      nrm.push(-dx, -dy, -dz);
      uv.push(j / segs, (i * DS) / uvAlong);
    }
  }
  const w = segs + 1;
  for (let i = 0; i < fr.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Steel columns from the floor up to the slide every few metres. */
function supports(b: Batch, pts: V3[], radius: number, every = 6, skipNear: (p: V3) => boolean = () => false) {
  const col = new THREE.CylinderGeometry(0.11, 0.13, 1, 10);
  const foot = new THREE.CylinderGeometry(0.25, 0.25, 0.08, 12);
  for (let i = Math.floor(every / DS / 2); i < pts.length; i += Math.round(every / DS)) {
    const p = pts[i];
    const top = p[1] - radius - 0.05;
    if (top < 1 || skipNear(p)) continue;
    b.put(steel, col, p[0], top / 2, p[2], 0, new THREE.Vector3(1, top, 1));
    b.put(darkSteel, foot, p[0], 0.04, p[2]);
    // A saddle under the slide.
    b.box(steel, p[0] - radius * 0.7, top - 0.08, p[2] - 0.08, p[0] + radius * 0.7, top + 0.02, p[2] + 0.08);
  }
}

function pathSlide(b: Batch, seg: PathSeg, skip: (p: V3) => boolean) {
  const fr = frames(seg.pts);
  const R = seg.radius;
  if (seg.style === 'tube' || seg.style === 'capsule') {
    b.add(fibreglass(seg.color, true), sweep(fr, R, -Math.PI, Math.PI, 18));
  } else if (seg.style === 'open') {
    b.add(fibreglass(seg.color, false), sweep(fr, R, -1.95, 1.95, 16));
    // A rolled lip along both edges.
    for (const s of [-1, 1]) {
      const lip = fr.map((f) => {
        const a = s * 1.95, dx = -f.up[0] * Math.cos(a) + f.side[0] * Math.sin(a), dy = -f.up[1] * Math.cos(a) + f.side[1] * Math.sin(a), dz = -f.up[2] * Math.cos(a) + f.side[2] * Math.sin(a);
        return { ...f, p: [f.p[0] + dx * R, f.p[1] + dy * R, f.p[2] + dz * R] as V3 };
      });
      b.add(fibreglass(seg.color, false), sweep(lip, 0.05, -Math.PI, Math.PI, 6));
    }
  } else if (seg.style === 'zip') {
    b.add(darkSteel, sweep(fr, 0.018, -Math.PI, Math.PI, 5));
    return;
  }
  // Running water along the bottom.
  b.add(flowMat, sweep(fr, R - 0.03, -0.7, 0.7, 4, 2.5));
  supports(b, seg.pts, R, 5, skip);
}

/** A funnel or bowl: the surface from its real profile, a rim, and legs. */
function surface(b: Batch, s: SurfSeg) {
  const prof: THREE.Vector2[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const r = s.hole + ((s.R - s.hole) * i) / N;
    prof.push(new THREE.Vector2(r, surfH(s, r)));
  }
  const top = surfH(s, s.R);
  prof.push(new THREE.Vector2(s.R + 0.15, top + 0.1));
  const lathe = new THREE.LatheGeometry(prof, 64);
  b.put(fibreglass(s.color, false), lathe, s.cx, s.cy, s.cz);
  // Legs: from the floor to the outside of the wall, a ring of them.
  const legs = s.shape === 'funnel' ? 8 : 6;
  const col = new THREE.CylinderGeometry(0.16, 0.18, 1, 10);
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + 0.2;
    const r = s.shape === 'funnel' ? s.R * 0.55 : s.R * 0.7;
    const h = s.cy + surfH(s, r) - 0.1;
    b.put(steel, col, s.cx + Math.cos(a) * r, h / 2, s.cz + Math.sin(a) * r, 0, new THREE.Vector3(1, h, 1));
  }
  // A ring beam round the rim.
  const ring = new THREE.TorusGeometry(s.R + 0.18, 0.08, 6, 64);
  ring.rotateX(Math.PI / 2);
  b.put(steel, ring, s.cx, s.cy + top + 0.05, s.cz);
}

/** A beam from a to b (a box `t` thick and `tall` high, tilted to follow the slope). */
function beam(b: Batch, mat: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, tall = t, uvs: 'keep' | 'world' = 'keep') {
  const dx = bx - ax, dy = by - ay, dz = bz - az, run = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(Math.hypot(run, dy), tall, t);
  g.rotateZ(Math.atan2(dy, run));
  b.put(mat, g, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, Math.atan2(-dz, dx), 1, uvs);
}

/** The two ends of side `s` of `r`, a few cm inside it. */
function sideLine(r: Rect, s: Side, inset = 0.04): [number, number, number, number] {
  if (s === 'x0') return [r.x0 + inset, r.z0, r.x0 + inset, r.z1];
  if (s === 'x1') return [r.x1 - inset, r.z0, r.x1 - inset, r.z1];
  if (s === 'z0') return [r.x0, r.z0 + inset, r.x1, r.z0 + inset];
  return [r.x0, r.z1 - inset, r.x1, r.z1 - inset];
}

/** Where slides leave the tower decks: the railings have a gap there (the sim's railing is still solid). */
const slideStarts: V3[] = Object.values(RIDES).flatMap((r) => (r.segs[0].type === 'path' && r.id !== 'drop' && r.id !== 'zip' && r.segs[0].pts[0][1] > 15 ? [r.segs[0].pts[0]] : []));

/** A railing from (ax, ay, az) to (bx, by, bz) (heights are the walking surface): handrail, mid rail, kick
 * plate, posts about every metre, and safety mesh in between. */
function railing(b: Batch, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  // Level railings (decks) leave a gap where a slide starts.
  if (ay === by) {
    const len = Math.hypot(bx - ax, bz - az);
    for (const g of slideStarts) {
      if (Math.abs(g[1] - ay) > 2) continue;
      const f = ((g[0] - ax) * (bx - ax) + (g[2] - az) * (bz - az)) / (len * len);
      const px = ax + (bx - ax) * f, pz = az + (bz - az) * f;
      if (f <= 0 || f >= 1 || Math.hypot(px - g[0], pz - g[2]) > 0.3) continue;
      const gap = 0.8 / len;
      if (f - gap > 0.02) railing(b, ax, ay, az, ax + (bx - ax) * (f - gap), ay, az + (bz - az) * (f - gap));
      if (f + gap < 0.98) railing(b, ax + (bx - ax) * (f + gap), ay, az + (bz - az) * (f + gap), bx, by, bz);
      return;
    }
  }
  beam(b, steel, ax, ay + RAIL_H, az, bx, by + RAIL_H, bz, 0.06);
  beam(b, steel, ax, ay + RAIL_H / 2, az, bx, by + RAIL_H / 2, bz, 0.03);
  beam(b, darkSteel, ax, ay + 0.06, az, bx, by + 0.06, bz, 0.04, 0.12); // kick plate
  // The mesh, from just above the kick plate to just under the handrail.
  beam(b, safetyMesh, ax, ay + 0.12 + (RAIL_H - 0.15) / 2, az, bx, by + 0.12 + (RAIL_H - 0.15) / 2, bz, 0.01, RAIL_H - 0.15, 'world');
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const f = i / n, y = ay + (by - ay) * f, w = 0.05;
    b.box(darkSteel, ax + (bx - ax) * f - w / 2, y, az + (bz - az) * f - w / 2, ax + (bx - ax) * f + w / 2, y + RAIL_H, az + (bz - az) * f + w / 2);
  }
}

/** The stairs, landings and deck from the sim's pieces, with stringers under the steps and railings. */
function stairs(b: Batch, pieces: Piece[], wood: THREE.Material) {
  for (const p of pieces) {
    if (p.kind === 'rail') {
      railing(b, p.x0, p.y, p.z0, p.x1, p.y, p.z1);
      continue;
    }
    if (p.kind === 'landing') {
      if (p.y > 0) {
        b.box(wood, p.x0, p.y - 0.08, p.z0, p.x1, p.y, p.z1);
        b.box(darkSteel, p.x0, p.y - 0.22, p.z0, p.x1, p.y - 0.08, p.z1); // steel frame under it
      }
      for (const s of p.rails) {
        const [ax, az, bx, bz] = sideLine(p, s);
        railing(b, ax, p.y, az, bx, p.y, bz);
      }
      continue;
    }
    // A flight: the steps (tread + riser), and a steel stringer along each long side.
    const ts = treads(p);
    const alongX = p.dir[0] === 'x';
    for (const t of ts) {
      b.box(wood, t.x0, t.y - 0.05, t.z0, t.x1, t.y, t.z1);
      const sign = p.dir[1] === '+' ? 1 : -1;
      // The riser at the low edge of the step.
      if (alongX) {
        const x = sign > 0 ? t.x0 : t.x1;
        b.box(darkSteel, x - 0.015, t.y - p.rise / ts.length, t.z0 + 0.05, x + 0.015, t.y - 0.05, t.z1 - 0.05);
      } else {
        const z = sign > 0 ? t.z0 : t.z1;
        b.box(darkSteel, t.x0 + 0.05, t.y - p.rise / ts.length, z - 0.015, t.x1 - 0.05, t.y - 0.05, z + 0.015);
      }
    }
    // Ends of the flight along its direction (low end first), at the step nosing heights.
    const lo = p.y0, hi = p.y0 + p.rise;
    const ends = (s: Side): [number, number, number, number] => {
      const [ax, az, bx, bz] = sideLine(p, s, 0.04);
      const fwd = p.dir === 'x+' || p.dir === 'z+';
      return fwd ? [ax, az, bx, bz] : [bx, bz, ax, az];
    };
    for (const s of (alongX ? ['z0', 'z1'] : ['x0', 'x1']) as Side[]) {
      const [ax, az, bx, bz] = ends(s);
      beam(b, darkSteel, ax, lo - 0.15, az, bx, hi - 0.15, bz, 0.06, 0.3);
      if (p.rails.includes(s)) railing(b, ax, lo + p.rise / ts.length, az, bx, hi, bz);
    }
  }
  // Steel posts holding up the landings, down to the floor.
  for (const p of pieces) {
    if (p.kind !== 'landing' || p.y <= 0) continue;
    for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z0], [p.x0, p.z1], [p.x1, p.z1]]) b.box(darkSteel, x - 0.05, 0, z - 0.05, x + 0.05, p.y - 0.2, z + 0.05);
  }
}

/** A stair tower: four columns, the stairs and deck (with railings), a roof, cross bracing. */
function tower(b: Batch, t: Tower, pieces: Piece[], wood: THREE.Material, roof: THREE.Material) {
  const h = t.w / 2;
  const col = new THREE.BoxGeometry(0.3, 1, 0.3);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    b.put(darkSteel, col, t.x + sx * h, (t.top + 3) / 2, t.z + sz * h, 0, new THREE.Vector3(1, t.top + 3, 1));
  }
  stairs(b, pieces, wood);
  const cone = new THREE.ConeGeometry(t.w * 0.8, 2, 4, 1);
  b.put(roof, cone, t.x, t.top + 4, t.z, Math.PI / 4);
  // Cross bracing on the outside.
  for (let yy = 2; yy < t.top; yy += 4) {
    for (const s of [-1, 1]) {
      b.box(darkSteel, t.x - h, yy, t.z + s * h - 0.05, t.x + h, yy + 0.12, t.z + s * h + 0.05);
      b.box(darkSteel, t.x + s * h - 0.05, yy, t.z - h, t.x + s * h + 0.05, yy + 0.12, t.z + h);
    }
  }
}

export interface SlidesView {
  group: THREE.Group;
  /** The drop capsule's trapdoor (opens when it drops). */
  trapdoor: THREE.Mesh;
  animate(dt: number): void;
}

export function buildSlides(wood: THREE.Material, roof: THREE.Material, poolTileMat: THREE.Material, water: THREE.Material, coping: THREE.Material): SlidesView {
  const group = new THREE.Group();
  const b = new Batch();
  const onTower = (p: V3) =>
    [TOWER, DROP_TOWER].some((t) => Math.abs(p[0] - t.x) < t.w / 2 + 0.6 && Math.abs(p[2] - t.z) < t.w / 2 + 0.6);
  const ridden = new Set<RideDef>();
  for (const r of Object.values(RIDES)) {
    if (r.loop || ridden.has(r)) continue;
    ridden.add(r);
    for (const s of r.segs) {
      if (s.type === 'path') pathSlide(b, s, onTower);
      else surface(b, s);
    }
  }
  tower(b, TOWER, TOWER_STAIRS[0], wood, roof);
  tower(b, DROP_TOWER, TOWER_STAIRS[1], wood, roof);

  // The drop capsule: a clear launch tube on top of the Wolf Drop tower.
  const D = DROP_TOWER;
  const capsule = new THREE.CylinderGeometry(0.62, 0.62, 2.4, 20, 1, true);
  b.put(fibreglass('#bfe8ff', true), capsule, D.x, D.top + 1.4, D.z);
  b.put(darkSteel, new THREE.TorusGeometry(0.64, 0.05, 6, 24).rotateX(Math.PI / 2), D.x, D.top + 2.6, D.z);
  const trapdoor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20).rotateX(-Math.PI / 2), darkSteel);
  trapdoor.position.set(D.x, D.top + 0.2, D.z);
  group.add(trapdoor);

  // Splash pools at the bottom of each slide.
  for (const p of SPLASH) pool(b, p.x0, p.x1, p.z0, p.z1, 1, poolTileMat, water, coping);

  // The lazy river: bottom, walls, coping and water, swept along its centre line.
  river(b, poolTileMat, water, coping);

  // Ride signs at the tower foot.
  const sign = (text: string[], x: number, z: number, yaw: number, bg: string) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.0), new THREE.MeshStandardMaterial({ map: signTexture(text, { w: 512, h: 200, bg }), roughness: 0.6 }));
    m.position.set(x, 2.6, z);
    m.rotation.y = yaw;
    group.add(m);
  };
  sign(['BIG TOWER', 'Twister · Dipper · Flush'], TOWER.x + TOWER.w / 2 + 0.05, TOWER.z + 2, Math.PI / 2, '#204a6b');
  sign(['WOLF DROP', '🐺 3 · 2 · 1 · DROP'], DROP_TOWER.x + DROP_TOWER.w / 2 + 0.05, DROP_TOWER.z, Math.PI / 2, '#5a2a1a');

  b.flush(group);
  return {
    group,
    trapdoor,
    animate(dt) {
      // The water runs down the slides.
      slideWater().offset.y -= dt * 1.6;
    },
  };
}

/** A rectangular pool: tiled floor and walls, a stone coping round the edge, and the water. */
export function pool(b: Batch, x0: number, x1: number, z0: number, z1: number, depth: number, tile: THREE.Material, water: THREE.Material, coping: THREE.Material) {
  b.box(tile, x0, -depth - 0.1, z0, x1, -depth, z1);
  const t = 0.12;
  b.box(tile, x0 - t, -depth, z0 - t, x0, 0, z1 + t);
  b.box(tile, x1, -depth, z0 - t, x1 + t, 0, z1 + t);
  b.box(tile, x0, -depth, z0 - t, x1, 0, z0);
  b.box(tile, x0, -depth, z1, x1, 0, z1 + t);
  const c = 0.3;
  b.box(coping, x0 - c, 0, z0 - c, x1 + c, 0.06, z0);
  b.box(coping, x0 - c, 0, z1, x1 + c, 0.06, z1 + c);
  b.box(coping, x0 - c, 0, z0, x0, 0.06, z1);
  b.box(coping, x1, 0, z0, x1 + c, 0.06, z1);
  const w = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
  b.put(water, w, (x0 + x1) / 2, WATER_Y, (z0 + z1) / 2, 0, 1, 'world');
}

/** A ribbon along the river's centre line between two offsets, at height y (flat) or as a wall (y0..y1). */
function ribbon(o0: number, o1: number, y0: number, y1: number) {
  const pos: number[] = [], idx: number[] = [];
  const n = RIVER.length;
  for (let i = 0; i < n; i++) {
    const a = RIVER[(i - 1 + n) % n], c = RIVER[(i + 1) % n], p = RIVER[i];
    const tx = c[0] - a[0], tz = c[2] - a[2], l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    pos.push(p[0] + nx * o0, y0, p[2] + nz * o0, p[0] + nx * o1, y1, p[2] + nz * o1);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function river(b: Batch, tile: THREE.Material, water: THREE.Material, coping: THREE.Material) {
  const h = RIVER_W / 2, d = RIVER_DEPTH;
  const both = (g: THREE.BufferGeometry, m: THREE.Material) => {
    b.add(m, g, undefined, 'world');
    // and the other face
    const f = g.clone();
    const idx = f.index!.array as Uint32Array | Uint16Array;
    const flipped = Array.from(idx);
    for (let i = 0; i < flipped.length; i += 3) [flipped[i + 1], flipped[i + 2]] = [flipped[i + 2], flipped[i + 1]];
    f.setIndex(flipped);
    f.computeVertexNormals();
    b.add(m, f, undefined, 'world');
  };
  both(ribbon(-h, h, -d, -d), tile);
  both(ribbon(-h, -h, -d, 0), tile);
  both(ribbon(h, h, -d, 0), tile);
  both(ribbon(-h - 0.35, -h, 0.05, 0.05), coping);
  both(ribbon(h, h + 0.35, 0.05, 0.05), coping);
  both(ribbon(-h, h, WATER_Y, WATER_Y), water);
}
