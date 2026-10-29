// San Francisco, built (its island, bay, bridge and exits: sf.ts; its streets:
// outer.ts:makeSF). The white bridge, with its two upside-down-Y towers standing in the
// bay and their fans of cables, crosses high over the city on piers; the exits wind down
// off it on slimmer decks (the two helixes round tall striped towers). Downtown fills
// the east of the island with towers of glass and stone under the Transamerica Pyramid;
// rows of painted Victorian houses fill the west, with Alamo Square and Coit Tower. The
// tunnel dives under the Embarcadero and the bay and comes up in the yard of the Crunch
// Labs warehouse on the far shore, a giant squirrel standing guard.
//
// The roads in the sky get their colliders once, at load (`skyColliders`): a smooth
// triangle-mesh deck (driven on like the loop: the wheels ride it, the body box doesn't
// scrape it) and box barriers along both sides.
import * as THREE from 'three';
import { Physics, RAPIER } from '../physics/Physics';
import {
  BAY, BAY_LEVEL, BRIDGE_FEET, BRIDGE_HW, CROSS_B, CRUNCH, DECK, EXIT_HW, EXIT_NAMES, ISLAND, SF_AT, SF_LEVEL, SKY, SkyRoad, TOWER_A, TUNNEL_A,
  bridgeB, bridgeHeight, groundOver, islandEdge, sfCoords, sfPoint, tunnelStart,
} from './sf';
import { nearestCurve } from './outer';
import { heightAt } from './layout';
import { mulberry32, type Vec2 } from '../util/math';
import { paint } from '../vehicles/builders/geo';
import { Siding, TownItem, TownKit } from './townKit';
import type { WindowStyle } from '../util/textures';

const WHITE = 0xf1f0ec, CONCRETE = 0xc9c5bc, BARRIER = 0xd9d6cf;
/** Deck slab thickness under the road. */
const SLAB = 1.3;

// ---------------------------------------------------------------- colliders

/** Colliders for every road in the sky: its deck (ridden like the loop) and its barriers. */
export function skyColliders(physics: Physics) {
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const r of SKY) {
    const n = r.pts.length, frame = frames(r);
    const pos = new Float32Array(n * 6), idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const { x, z, nx, nz } = frame[i], w = r.ws[i], y = r.ys[i];
      pos.set([x + nx * w, y, z + nz * w, x - nx * w, y, z - nz * w], i * 6);
      if (i) idx.push(i * 2 - 1, i * 2 - 2, i * 2, i * 2 - 1, i * 2, i * 2 + 1);
    }
    const deck = physics.world.createCollider(
      RAPIER.ColliderDesc.trimesh(pos, new Uint32Array(idx), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(0.9),
    );
    physics.registerLoop(deck);
    physics.setOwner(deck, { kind: 'ground', material: 'concrete' });
    // Barriers: a box every couple of points along each side (none in the gaps).
    const step = r.kind === 'bridge' ? 1 : 2;
    for (const side of [1, -1])
      for (let i = 0; i + step < n; i += step) {
        const j = i + step;
        if (r.gaps.some((g) => g.side === side && j > g.i0 && i < g.i1)) continue;
        const a = frame[i], b = frame[j];
        const oa = side * (r.ws[i] + 0.25), ob = side * (r.ws[j] + 0.25);
        const ax = a.x + a.nx * oa, az = a.z + a.nz * oa, bx = b.x + b.nx * ob, bz = b.z + b.nz * ob;
        const dx = bx - ax, dy = r.ys[j] - r.ys[i], dz = bz - az, len = Math.hypot(dx, dy, dz);
        q.setFromEuler(e.set(-Math.asin(dy / len), Math.atan2(dx, dz), 0, 'YXZ'));
        const col = physics.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.25, 0.55, len / 2 + 0.15).setTranslation((ax + bx) / 2, (r.ys[i] + r.ys[j]) / 2 + 0.5, (az + bz) / 2).setRotation(q).setFriction(0.5),
        );
        physics.setOwner(col, { kind: 'static', material: 'concrete' });
      }
  }
}

/** Each point of a sky road with its left normal (towards (−uz, ux)). */
function frames(r: SkyRoad) {
  return r.pts.map(([x, z], i) => {
    const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return { x, z, nx: -dz / l, nz: dx / l };
  });
}

// ---------------------------------------------------------------- geometry helpers

/** Triangles from a flat list of corners (three per triangle), coloured. */
function tris(pos: number[], color: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, color);
}

/**
 * A strip of quads between two lines of points, facing `out` (a direction per point;
 * each quad is wound so its front faces that way).
 */
function strip(A: THREE.Vector3[], B: THREE.Vector3[], out: (i: number) => THREE.Vector3, pos: number[]) {
  const u = new THREE.Vector3(), v = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i < A.length - 1; i++) {
    const q = [A[i], A[i + 1], B[i + 1], B[i]];
    nrm.crossVectors(u.subVectors(q[1], q[0]), v.subVectors(q[3], q[0]));
    const order = nrm.dot(out(i)) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) pos.push(q[k].x, q[k].y, q[k].z);
  }
}

/** A thin box from a to b (cables, tower legs), `w` thick. */
function strut(a: THREE.Vector3, b: THREE.Vector3, w: number, color: number, d = w) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, d, len);
  g.applyMatrix4(new THREE.Matrix4().lookAt(a, b, Math.abs(b.y - a.y) > len * 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, color);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- the build

export function buildSF(k: TownKit) {
  const rng = mulberry32(1906);
  const Y = SF_LEVEL;
  k.materials['sf-water'] = new THREE.MeshStandardMaterial({ color: 0x2b6f93, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.86, depthWrite: false, envMapIntensity: 1.2 });
  k.materials['sf-lamp'] = new THREE.MeshBasicMaterial({ color: 0xffe7a3 });
  const item = (x: number, z: number): TownItem => {
    const it: TownItem = { x, z, geos: [], solids: [], objects: [] };
    k.items.push(it);
    return it;
  };

  // ------------------------------------------------ the ground: paving all over the island and the yard, the bay
  const trench = (a: number, b: number) => Math.abs(a - TUNNEL_A) < 26 && b > tunnelStart() - 10 && b < ISLAND.b + 10;
  const onIsland = (a: number, b: number, m: number) => islandEdge(...sfPoint(a, b)) < -m;
  k.flat('town-walk', -ISLAND.a, ISLAND.a, -ISLAND.b, ISLAND.b, Y + 0.06, 5, 24, (a, b) => {
    for (const [da, db] of [[-12, -12], [12, -12], [12, 12], [-12, 12]]) if (!onIsland(a + da, b + db, 1)) return true;
    return trench(a, b);
  });
  k.flat('town-walk', CRUNCH.a0, CRUNCH.a1, CRUNCH.b0, CRUNCH.b1, Y + 0.06, 5, 24, (a, b) => Math.abs(a - TUNNEL_A) < 26 && b < CRUNCH.b0 + 30);
  // Water: everywhere round the island out to the far bank (the land hides what's under it).
  const reach = ISLAND.a + BAY.w + 16, reachB = ISLAND.b + BAY.w + 16;
  k.flat('sf-water', -reach, reach, -reachB, reachB, BAY_LEVEL, 30, 32, (a, b) => {
    let wet = false, dry = true;
    for (const [da, db] of [[-16, -16], [16, -16], [16, 16], [-16, 16], [0, 0]]) {
      const e = islandEdge(...sfPoint(a + da, b + db));
      if (e > -4) dry = false;
      if (e < BAY.w + 6) wet = true;
    }
    return dry || !wet;
  });
  k.sidewalks((a, b) => trench(a, b) || b > ISLAND.b);
  k.junctions(true);
  k.lamps(-300, CROSS_B, 300, CROSS_B, 5.5 + 2.4, 36, 'old');
  k.lamps(-300, -CROSS_B, 300, -CROSS_B, 5.5 + 2.4, 36, 'old');

  // ------------------------------------------------ the roads in the sky
  for (const r of SKY) skyRoad(k, r, item);
  bridgeTowers(item);
  bridgeSigns(k);

  // ------------------------------------------------ the tunnel to Crunch Labs
  tunnel(k);

  // ------------------------------------------------ landmarks
  const reserved: { a: number; b: number; r: number }[] = [];
  // The Transamerica Pyramid, downtown.
  {
    const [pa, pb] = [268, -242], it = k.item(pa, pb), [x, z] = k.W(pa, pb);
    const g = new THREE.CylinderGeometry(0.4, 17 * Math.SQRT2, 34, 4, 1);
    g.rotateY(Math.PI / 4);
    g.translate(x, Y + 17, z);
    it.geos.push(['plain', paint(g, 0xf3f1ea)]);
    // The two "wings" up its sides, and the spire.
    for (const s of [-1, 1]) {
      const w = new THREE.CylinderGeometry(0.3, 4.2, 27, 4, 1);
      w.rotateY(Math.PI / 4);
      w.translate(x + s * 10.5, Y + 13.5, z);
      it.geos.push(['plain', paint(w, 0xe7e4dc)]);
    }
    k.cyl(it, pa, pb, Y + 33, 0.25, 8, 0xd9d6cf, 6, 0.05);
    k.solid(it, pa, pb, Y, 22, 30, 22);
    reserved.push({ a: pa, b: pb, r: 26 });
  }
  // Coit Tower, in its little park.
  {
    const [ca, cb] = [-262, 236], it = k.item(ca, cb);
    const park = k.item(ca, cb + 1);
    k.flat('town-lawn', ca - 26, ca + 26, cb - 26, cb + 26, Y + 0.09, 7, 52);
    k.cyl(park, ca, cb, Y, 7.5, 1.2, 0xd8cfb8, 16);
    k.cyl(it, ca, cb, Y + 1.2, 5.2, 30, 0xeae1ca, 16);
    for (let j = 0; j < 16; j++) {
      const ang = (j / 16) * Math.PI * 2;
      k.box(it, ca + Math.cos(ang) * 5.2, cb + Math.sin(ang) * 5.2, Y + 1.2, 0.5, 30, 0.5, 0xd9cfb6);
    }
    k.cyl(it, ca, cb, Y + 31.2, 5.6, 1.6, 0xd9cfb6, 16);
    for (let j = 0; j < 12; j++) {
      const ang = (j / 12) * Math.PI * 2;
      k.box(it, ca + Math.cos(ang) * 5.3, cb + Math.sin(ang) * 5.3, Y + 27, 0.6, 2.8, 1.1, 0x3b3a36, false, 'plain', ang);
    }
    k.solid(it, ca, cb, Y, 11, 33, 11);
    for (let j = 0; j < 8; j++) k.tree(ca + Math.cos(j * 0.8) * 19, cb + Math.sin(j * 0.8) * 19, 'pine');
    reserved.push({ a: ca, b: cb, r: 30 });
  }
  // Alamo Square: a lawn with trees, painted ladies looking over it.
  {
    const [qa0, qa1, qb0, qb1] = [-168, -88, 96, 160];
    k.flat('town-lawn', qa0, qa1, qb0, qb1, Y + 0.09, 7, 40);
    for (let j = 0; j < 9; j++) k.tree(qa0 + 8 + rng() * (qa1 - qa0 - 16), qb0 + 8 + rng() * (qb1 - qb0 - 16), 'broad');
    reserved.push({ a: (qa0 + qa1) / 2, b: (qb0 + qb1) / 2, r: 46 });
  }

  // ------------------------------------------------ the city: downtown towers in the east, painted ladies in the west
  const ladies: Siding[] = ['yellow', 'blue', 'sage', 'plum', 'cream', 'red', 'mustard', 'white', 'grey'];
  const styles: WindowStyle[] = ['glass', 'concrete', 'stone', 'glass', 'brick', 'pru'];
  for (let a = -296; a <= 296; a += 26)
    for (let b = -286; b <= 286; b += 26) {
      const [x, z] = k.W(a, b);
      const half = 10;
      const spots: Vec2[] = [[x, z], [x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half]];
      if (spots.some(([sx, sz]) => islandEdge(sx, sz) > -22 || nearestCurve(sx, sz).edge < 3 || !skyClear(sx, sz, 5))) continue;
      if (reserved.some((r) => Math.hypot(a - r.a, b - r.b) < r.r + 12) || trench(a, b)) continue;
      const it = k.item(a, b);
      if (a > 40) {
        // Downtown: a tower (kept well under the bridge deck).
        const h = 14 + rng() * rng() * 20;
        const sa = 15 + rng() * 5, sb = 15 + rng() * 5;
        const style = styles[Math.floor(rng() * styles.length)];
        k.facade(it, a, b, Y, sa, sb, h, style, style === 'glass' ? 0xffffff : 0xf4efe6);
      } else {
        // A row of three tall, narrow Victorian houses, gables to the street.
        const face = Math.abs(b - CROSS_B) < Math.abs(b + CROSS_B) ? 1 : -1;
        for (const da of [-6.6, 0, 6.6]) {
          const h = 8.5 + rng() * 2.5, col = ladies[Math.floor(rng() * ladies.length)];
          k.walls(it, a + da, b, Y, 6.2, 15, h, col);
          k.gable(it, a + da, b, Y + h, 6.2, 15, 3.4, false, 0x4a4540);
          // A bay window and white trim on the front.
          k.box(it, a + da, b + face * 7.9, Y + 2.6, 3, 4.2, 0.9, 0xf4f1ea);
          k.box(it, a + da, b, Y + h - 0.3, 6.5, 0.35, 15.3, 0xf4f1ea);
        }
      }
    }

  // ------------------------------------------------ Crunch Labs
  crunchLabs(k);
}

/** Is a spot clear of every sky road (and helix tower) by `m` m? */
function skyClear(x: number, z: number, m: number) {
  for (const r of SKY) {
    if (x < r.x0 - 40 || x > r.x1 + 40 || z < r.z0 - 40 || z > r.z1 + 40) continue;
    if (r.helix && Math.hypot(x - r.helix.x, z - r.helix.z) < r.helix.r + EXIT_HW + m) return false;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [a, b] = [r.pts[i], r.pts[i + 1]];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < r.ws[i] + m) return false;
    }
  }
  return true;
}

/** Ground under a spot on or round the island (before the tunnel is dug), or the land itself further out. */
function groundUnder(x: number, z: number) {
  const e = islandEdge(x, z);
  return e < BAY.w ? groundOver(x, z) : heightAt(x, z);
}

/** One road in the sky: its road surface, the white slab under it, barriers, and piers. */
function skyRoad(k: TownKit, r: SkyRoad, item: (x: number, z: number) => TownItem) {
  const f = frames(r), n = r.pts.length;
  const bridge = r.kind === 'bridge';
  const lift = bridge ? 0.17 : 0.21;
  const piece = bridge ? 8 : 12;
  const slabColor = bridge ? WHITE : 0xe4e2dc;
  // Up off the ground (gets a slab and piers); underground it's the tunnel's own walls.
  const ground = r.pts.map(([x, z]) => groundUnder(x, z));
  const up = (i: number) => (bridge ? r.ys[i] - ground[i] > 2.5 : r.ys[i] - SF_LEVEL > 1.6);
  let v = 0;
  for (let i0 = 0; i0 < n - 1; i0 += piece) {
    const i1 = Math.min(n - 1, i0 + piece);
    const it = item(r.pts[i0][0], r.pts[i0][1]);
    // Road surface (lane markings from the highway or ramp texture).
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = i0; i <= i1; i++) {
      const { x, z, nx, nz } = f[i], w = r.ws[i], y = r.ys[i] + lift;
      if (i > i0) v += Math.hypot(x - f[i - 1].x, z - f[i - 1].z) / 16;
      pos.push(x + nx * w, y, z + nz * w, x - nx * w, y, z - nz * w);
      uv.push(0, v, 1, v);
      if (i > i0) {
        const q = (i - i0) * 2;
        idx.push(q - 2, q, q - 1, q - 1, q, q + 1);
      }
    }
    const road = new THREE.BufferGeometry();
    road.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    road.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    road.setIndex(idx);
    road.computeVertexNormals();
    it.geos.push([bridge ? 'road-highway' : 'road-ramp', road]);
    // The slab's sides and underside, where it's up in the air.
    const slab: number[] = [];
    let run: number[] = [];
    const flush = () => {
      if (run.length > 1) {
        const L = run.map((i) => V(f[i].x + f[i].nx * r.ws[i], r.ys[i] + lift - 0.02, f[i].z + f[i].nz * r.ws[i]));
        const R = run.map((i) => V(f[i].x - f[i].nx * r.ws[i], r.ys[i] + lift - 0.02, f[i].z - f[i].nz * r.ws[i]));
        const Lb = L.map((p) => p.clone().setY(p.y - SLAB)), Rb = R.map((p) => p.clone().setY(p.y - SLAB));
        strip(Lb, L, (j) => V(f[run[j]].nx, 0, f[run[j]].nz), slab);
        strip(R, Rb, (j) => V(-f[run[j]].nx, 0, -f[run[j]].nz), slab);
        strip(Rb, Lb, () => V(0, -1, 0), slab);
      }
      run = [];
    };
    for (let i = i0; i <= i1; i++) (up(i) ? run.push(i) : flush());
    flush();
    if (slab.length) it.geos.push(['plain', tris(slab, slabColor)]);
    // Barriers: concrete, white on the bridge (with a steel rail on top).
    const bar: number[] = [];
    for (const side of [1, -1]) {
      let run: number[] = [];
      const flushB = () => {
        if (run.length > 1) {
          const o0 = (i: number) => side * (r.ws[i] - 0.1), o1 = (i: number) => side * (r.ws[i] + 0.45);
          const P = (i: number, o: number, dy: number) => V(f[i].x + f[i].nx * o, r.ys[i] + lift + dy, f[i].z + f[i].nz * o);
          const inner = run.map((i) => P(i, o0(i), 0)), innerTop = run.map((i) => P(i, o0(i), 1.0));
          const outerTop = run.map((i) => P(i, o1(i), 1.0)), outer = run.map((i) => P(i, o1(i), -SLAB));
          const toward = (j: number, s: number) => V(f[run[j]].nx * s, 0, f[run[j]].nz * s);
          strip(inner, innerTop, (j) => toward(j, -side), bar);
          strip(innerTop, outerTop, () => V(0, 1, 0), bar);
          strip(outerTop, outer, (j) => toward(j, side), bar);
        }
        run = [];
      };
      for (let i = i0; i <= i1; i++) {
        const gap = r.gaps.some((g) => g.side === side && i > g.i0 && i < g.i1);
        if (gap) flushB();
        else run.push(i);
      }
      flushB();
    }
    if (bar.length) it.geos.push(['plain', tris(bar, bridge ? WHITE : BARRIER)]);
    if (bridge)
      for (const side of [1, -1]) {
        const rail: THREE.Vector3[] = [];
        for (let i = i0; i <= i1; i++) {
          const o = side * (r.ws[i] + 0.17);
          rail.push(V(f[i].x + f[i].nx * o, r.ys[i] + lift + 1.35, f[i].z + f[i].nz * o));
        }
        for (let j = 0; j < rail.length - 1; j++) it.geos.push(['plain', strut(rail[j], rail[j + 1], 0.12, 0x9fa5ab)]);
      }
  }
  // Piers.
  if (bridge) bridgePiers(k, r, ground, item);
  else if (!r.helix) exitPiers(k, r, up);
  else helixTower(k, r, item);
}

/** Pairs of white columns under the bridge, with a cross beam (on land, in the bay, on the island). */
function bridgePiers(k: TownKit, r: SkyRoad, ground: number[], item: (x: number, z: number) => TownItem) {
  const f = frames(r);
  for (let i = 6; i < r.pts.length - 6; i += 13) {
    const { x, z, nx, nz } = f[i];
    const { a, b } = sfCoords(x, z);
    if (Math.abs(Math.abs(a) - TOWER_A) < 30) continue;
    const top = r.ys[i] - SLAB, g = ground[i];
    if (top - g < 2.5) continue;
    const it = item(x, z), phi = Math.atan2(nz, nx) - Math.PI / 2;
    let any = false;
    for (const o of [-9.5, 9.5]) {
      const [px, pz] = [x + nx * o, z + nz * o];
      if (nearestCurve(px, pz).edge < 1.5) continue;
      any = true;
      const c = sfCoords(px, pz);
      k.box(it, c.a, c.b, g - 2, 1.8, top - g + 2, 1.8, WHITE, islandEdge(px, pz) < 0 || islandEdge(px, pz) > BAY.w, 'plain', phi);
    }
    if (any) k.box(it, a, b, top - 1.2, 2.2, 1.2, 22, WHITE, false, 'plain', phi);
  }
}

/** Single columns under an exit, every so often, where nothing else is in the way. */
function exitPiers(k: TownKit, r: SkyRoad, up: (i: number) => boolean) {
  for (let i = 10; i < r.pts.length - 2; i += 8) {
    if (!up(i)) continue;
    const [x, z] = r.pts[i];
    const top = r.ys[i] - SLAB;
    if (top - SF_LEVEL < 2.5 || nearestCurve(x, z).edge < 1.5 || islandEdge(x, z) > -2) continue;
    // Not where another deck is between this one and the ground.
    let blocked = false;
    for (const o of SKY) {
      if (o === r || x < o.x0 - 15 || x > o.x1 + 15 || z < o.z0 - 15 || z > o.z1 + 15) continue;
      for (let j = 0; j < o.pts.length && !blocked; j++)
        if (o.ys[j] < top && Math.hypot(o.pts[j][0] - x, o.pts[j][1] - z) < o.ws[j] + 2) blocked = true;
    }
    if (blocked) continue;
    const { a, b } = sfCoords(x, z), it = k.item(a, b);
    k.box(it, a, b, SF_LEVEL, 1.6, top - SF_LEVEL, 1.6, CONCRETE, true);
    const f = frames(r)[i];
    k.box(it, a, b, top - 0.9, 1.6, 0.9, EXIT_HW * 1.7, CONCRETE, false, 'plain', Math.atan2(f.nz, f.nx));
  }
}

/** The tower a helix winds round: a tall striped drum with a cap. */
function helixTower(k: TownKit, r: SkyRoad, item: (x: number, z: number) => TownItem) {
  const h = r.helix!;
  const { a, b } = sfCoords(h.x, h.z);
  const it = item(h.x, h.z);
  const rad = h.r - EXIT_HW - 0.7, top = DECK - SLAB;
  const colors = r.n === 1 ? [0xe0603a, 0xf3efe6] : [0x2f8f9d, 0xf3efe6];
  const bands = 10;
  for (let j = 0; j < bands; j++) {
    const y0 = SF_LEVEL + ((top - SF_LEVEL) * j) / bands;
    k.cyl(it, a, b, y0, rad, (top - SF_LEVEL) / bands + 0.02, colors[j % 2], 28);
  }
  k.cyl(it, a, b, top, rad + 0.6, 1, 0x55595e, 28);
  k.cyl(it, a, b, top + 1, 3, 6, 0x55595e, 10, 0.3);
  k.solid(it, a, b, SF_LEVEL, rad * 1.4, top - SF_LEVEL, rad * 1.4);
}

/**
 * The bridge's two towers, like the Zakim's: legs either side of the deck from the water
 * up past it, leaning in to meet over the middle, and a tapering mast, with fans of white
 * cables down to both edges of the deck on both sides of it.
 */
function bridgeTowers(item: (x: number, z: number) => TownItem) {
  const br = SKY[0];
  const yW = br.ys[0], yE = br.ys[br.ys.length - 1];
  for (const s of [-1, 1]) {
    const a = s * TOWER_A, [x, z] = sfPoint(a, 0);
    const it = item(x, z);
    const deck = bridgeHeight(a, yW, yE);
    const base = groundOver(x, z) - 1, meet = deck + 30, top = deck + 82;
    const at = (b: number, y: number) => V(x, y, z + b);
    for (const b of [-1, 1]) {
      it.geos.push(['plain', strut(at(b * 16.5, base), at(b * 16.5, deck + 1), 2.6, WHITE, 3.4)]);
      it.geos.push(['plain', strut(at(b * 16.5, deck + 1), at(b * 0.9, meet), 2.4, WHITE, 3.2)]);
    }
    // Under the deck, a beam between the legs; the mast, tapering, with a dark top.
    it.geos.push(['plain', strut(at(-16.5, deck - SLAB - 1), at(16.5, deck - SLAB - 1), 2, WHITE, 2.4)]);
    const mast = new THREE.CylinderGeometry(1.1, 2.4, top - meet, 4, 1);
    mast.rotateY(Math.PI / 4);
    mast.translate(x, (meet + top) / 2, z);
    it.geos.push(['plain', paint(mast, WHITE)]);
    const cap = new THREE.CylinderGeometry(0.05, 1.2, 6, 4, 1);
    cap.rotateY(Math.PI / 4);
    cap.translate(x, top + 3, z);
    it.geos.push(['plain', paint(cap, 0x6d737a)]);
    // Footings in the water.
    for (const b of [-1, 1]) it.geos.push(['plain', paint(new THREE.BoxGeometry(6, 4, 6).translate(x, BAY_LEVEL + 0.5, z + b * 16.5), 0xb8b3a8)]);
    // Cables: from the mast to the deck edges, a fan each way along the bridge.
    for (const dir of [-1, 1])
      for (let c = 0; c < 10; c++) {
        const da = dir * (40 + c * 10), y0 = meet + 4 + c * 4.6;
        const ya = bridgeHeight(a + da, yW, yE) + 1.2, db = bridgeB(a + da);
        for (const b of [-1, 1]) it.geos.push(['plain', strut(at(b * 0.6, y0), V(x + da, ya, z + db + b * (BRIDGE_HW + 0.2)), 0.16, 0xf7f7f4)]);
      }
  }
}

/** "Welcome to San Francisco" over each end of the bridge, and a sign before each exit. */
function bridgeSigns(k: TownKit) {
  const br = SKY[0];
  const yW = br.ys[0], yE = br.ys[br.ys.length - 1];
  for (const a of [-ISLAND.a - 120, BRIDGE_FEET.e - 140]) {
    const y = bridgeHeight(a, yW, yE), c = bridgeB(a), it = k.item(a, c);
    for (const b of [-1, 1]) k.box(it, a, c + b * (BRIDGE_HW + 0.9), y, 0.6, 8, 0.6, 0x8d9399, true);
    k.box(it, a, c, y + 7.6, 0.6, 0.5, BRIDGE_HW * 2 + 2.4, 0x8d9399);
    k.board(it, ['WELCOME TO', 'SAN FRANCISCO'], '#0f6b3a', '#ffffff', a, c, y + 4.2, 16, 3.4, Math.PI / 2, 'bold {s}px Helvetica, Arial, sans-serif');
  }
  SKY.slice(1).forEach((r) => {
    const side = Math.sign(sfCoords(...r.pts[0]).b); // south exits head east, north ones west
    const a = sfCoords(...r.pts[0]).a - side * 110, y = bridgeHeight(a, yW, yE), b = side * (BRIDGE_HW + 0.7);
    const it = k.item(a, b);
    for (const o of [-2.6, 2.6]) k.box(it, a + o, b, y + 1.1, 0.22, 3.6, 0.22, 0x7d8288);
    k.board(it, [`EXIT ${r.n} ↗`, EXIT_NAMES[r.n - 1]], '#0f6b3a', '#ffffff', a, b, y + 3.3, 7.5, 3.2, Math.PI / 2, 'bold {s}px Helvetica, Arial, sans-serif');
  });
}

/**
 * The tunnel: walls either side of the road wherever it's below the ground, a roof over
 * it where it's deep enough (the Embarcadero and the bay floor are on top), lights along
 * the ceiling, and a sign over the way in.
 */
function tunnel(k: TownKit) {
  const r = SKY[SKY.length - 1];
  const b0 = tunnelStart() - 4, b1 = CRUNCH.b0 + 14;
  const roadAt = (b: number) => {
    // (The road's own height, from the exit's points.)
    let best = 0, bd = Infinity;
    r.pts.forEach(([x, z], i) => {
      const d = Math.abs(z - SF_AT[1] - b) + Math.abs(x - SF_AT[0] - TUNNEL_A);
      if (d < bd) (bd = d), (best = i);
    });
    return r.ys[best];
  };
  const A = TUNNEL_A, SEG = 8;
  let portal = false;
  for (let b = b0; b < b1; b += SEG) {
    const [x, z] = sfPoint(A, b + SEG / 2);
    const g = groundOver(x, z);
    const y = Math.min(roadAt(b), roadAt(b + SEG));
    if (g - y < 0.4) continue;
    const it = k.item(A, b + SEG / 2);
    const roofed = g - y > 6.8;
    const wallTop = roofed ? g - 1.4 : g + 0.9;
    for (const s of [-1, 1]) {
      k.box(it, A + s * 7.4, b + SEG / 2, y - 1, 0.8, wallTop - y + 1, SEG + 0.05, roofed ? 0xe9e6de : CONCRETE, true);
      // A stripe of tiles along the tunnel walls.
      if (roofed) k.box(it, A + s * 6.98, b + SEG / 2, y + 1.2, 0.05, 0.5, SEG + 0.05, 0xe0603a);
    }
    if (roofed) {
      it.solids.push({ at: [x, g - 0.7, z], size: [40, 1.4, SEG + 0.1], heading: 0, kind: 'ground', color: CONCRETE });
      it.geos.push(['plain', paint(new THREE.BoxGeometry(14.6, 0.3, SEG + 0.05).translate(x, g - 1.45, z), 0x56585b)]);
      it.geos.push(['sf-lamp', paint(new THREE.BoxGeometry(0.6, 0.12, SEG * 0.6).translate(x, g - 1.62, z), 0xffffff)]);
      // Under the bay the roof is a concrete tube's top, seen through the water.
      if (islandEdge(x, z) > 0) it.geos.push(['plain', paint(new THREE.BoxGeometry(18, 1.4, SEG + 0.05).translate(x, g - 0.7, z), 0x9d9a92)]);
      if (!portal && islandEdge(x, z) < 0) {
        // The way in: a portal face over the road, and a sign on it.
        portal = true;
        k.box(it, A, b - 0.6, g - 1.4, 16.2, 2.6, 1.2, CONCRETE);
        k.board(it, ['TUNNEL TO', 'CRUNCH LABS'], '#1d1d1f', '#ffb21a', A, b - 1.3, g - 1.3, 11, 2.4, 0, 'bold {s}px Helvetica, Arial, sans-serif');
      }
    }
  }
}

/**
 * Crunch Labs: a big metal warehouse in its yard across the bay, the tunnel coming up in
 * front of it, a road round it, and outside, a giant squirrel and a rocket.
 */
function crunchLabs(k: TownKit) {
  const Y = SF_LEVEL;
  const [wa, wb] = [150, 723];
  const it = k.item(wa, wb);
  const WA = 124, WB = 46, H = 15;
  // The building: pale metal walls with ribs, a darker roof, a blue band.
  k.box(it, wa, wb, Y, WA, H, WB, 0xd5d9dc, true);
  for (let a = -WA / 2; a <= WA / 2; a += 2.4) for (const s of [-1, 1]) k.box(it, wa + a, wb + s * (WB / 2 + 0.08), Y, 0.25, H, 0.16, 0xbfc4c8);
  k.box(it, wa, wb, Y + H, WA + 1, 0.8, WB + 1, 0x6d737a);
  for (const s of [-1, 1]) k.box(it, wa, wb + s * (WB / 2 + 0.2), Y + H - 3, WA + 0.4, 1.4, 0.2, 0x1f6fd1);
  // Roll-up doors on the front (facing the tunnel), the big sign over them.
  for (const da of [-36, 0, 36]) {
    k.box(it, wa + da, wb - WB / 2 - 0.25, Y, 12, 8, 0.3, 0x5a5f66);
    for (let y = 0.6; y < 8; y += 0.8) k.box(it, wa + da, wb - WB / 2 - 0.42, Y + y, 12, 0.08, 0.06, 0x474b51);
  }
  k.board(it, ['CRUNCH LABS'], '#f7f7f7', '#111111', wa, wb - WB / 2 - 0.7, Y + 9, 40, 5, 0, 'bold {s}px "Arial Black", Helvetica, sans-serif');
  // The squirrel: a big cartoon one, sitting up, with a giant bushy tail.
  {
    const [sa, sb] = [92, 660], s = k.item(sa, sb), [x, z] = k.W(sa, sb);
    const ball = (dx: number, dy: number, dz: number, r: number, color: number, sy = 1) => {
      const g = new THREE.SphereGeometry(r, 18, 12);
      g.scale(1, sy, 1);
      g.translate(x + dx, Y + dy, z + dz);
      s.geos.push(['plain', paint(g, color)]);
    };
    const FUR = 0xb5672e, BELLY = 0xf0d2a6;
    k.cyl(s, sa, sb, Y, 4.2, 1.2, 0x8a8f96, 20);
    ball(0, 4.6, 0, 3.2, FUR, 1.25); // body
    ball(0, 4.4, -1.6, 2.2, BELLY, 1.3); // belly
    ball(0, 9.2, -0.6, 2.4, FUR); // head
    ball(0, 8.8, -2.8, 0.9, BELLY); // muzzle
    ball(0, 9.1, -3.6, 0.35, 0x231a14); // nose
    for (const e of [-1, 1]) {
      ball(e * 0.95, 9.9, -2.3, 0.45, 0xffffff);
      ball(e * 0.95, 9.9, -2.7, 0.22, 0x111111);
      ball(e * 1.4, 11.6, -0.4, 0.7, FUR, 1.6); // ears
      ball(e * 1.6, 5.5, -2.4, 0.8, FUR, 1.4); // paws
    }
    // The tail: up the back and curling over.
    [[0, 3, 3.4, 2.4], [0, 6, 4.4, 2.6], [0, 9.2, 4.3, 2.6], [0, 11.8, 3, 2.3], [0, 12.6, 0.9, 1.8]].forEach(([dx, dy, dz, r]) => ball(dx, dy, dz, r, 0xc77937));
    k.solid(s, sa, sb, Y, 7, 13, 9);
  }
  // A rocket on its stand.
  {
    const [ra, rb] = [212, 660], s = k.item(ra, rb);
    k.cyl(s, ra, rb, Y, 3.4, 0.8, 0x8a8f96, 16);
    k.cyl(s, ra, rb, Y + 0.8, 1.5, 13, 0xf2f2f2, 16);
    k.cyl(s, ra, rb, Y + 13.8, 1.5, 4, 0xd23a2a, 16, 0.05);
    for (let j = 0; j < 4; j++) {
      const ang = j * (Math.PI / 2);
      k.box(s, ra + Math.cos(ang) * 1.9, rb + Math.sin(ang) * 1.9, Y + 0.8, 0.25, 3.5, 2, 0xd23a2a, false, 'plain', ang);
    }
    k.solid(s, ra, rb, Y, 4.4, 18, 4.4);
  }
  k.lamps(CRUNCH.a0 + 20, CRUNCH.b0 + 40, CRUNCH.a1 - 20, CRUNCH.b0 + 40, 5.5 + 2.4, 30, 'cobra');
}
