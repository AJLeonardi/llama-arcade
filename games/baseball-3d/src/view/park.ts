// The ballpark, drawn from the sim's numbers (sim/field.ts): mowed grass, the dirt infield, chalk lines,
// bases, the mound, the outfield wall, foul poles, stands full of people, and a scoreboard. Each kind of park
// looks different: high school (chain-link and bleachers), college in Boston (brick, a tall green wall, the
// city behind), the Finals stadium in Providence (a big two-deck bowl at night, light towers), the backyard
// (a wooden fence, the house, trees).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { basePos, dirOf, FAIR, fenceDist, type Park } from '../sim/field';
import { brickTexture, chainTexture, crowdTexture, dirtTexture, grassTexture, signTexture, woodTexture } from './textures';

type V2 = [number, number];

/** Geometry merged per material, so a whole park is a handful of draw calls. */
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(m: THREE.Material, g: THREE.BufferGeometry) {
    const g2 = g.index ? g.toNonIndexed() : g;
    if (!g2.attributes.uv) g2.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2));
    for (const k of Object.keys(g2.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g2.deleteAttribute(k);
    (this.parts.get(m) ?? this.parts.set(m, []).get(m)!).push(g2);
  }
  box(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(rotY);
    g.translate(x, y, z);
    this.add(m, g);
  }
  build(group: THREE.Group, shadows = true) {
    for (const [m, gs] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(gs), m);
      mesh.receiveShadow = shadows;
      mesh.castShadow = false;
      group.add(mesh);
    }
  }
}

/** A flat shape on the ground at height y, with world-sized UVs (metres / uvScale). */
function flat(pts: V2[], y: number, uvScale = 1, rot = 0) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    uv.setXY(i, (x * c - z * s) / uvScale, (x * s + z * c) / uvScale);
  }
  return g;
}

function circle(cx: number, cz: number, r: number, n = 40): V2[] {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r] as V2);
}

/** A strip standing up along a polyline (walls, fences), UVs in metres along and up. */
function wallStrip(pts: V2[], y0: number, y1: number, uScale = 1, vScale = 1) {
  const pos: number[] = [], uv: number[] = [];
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = along / uScale, u1 = (along + len) / uScale;
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
    uv.push(u0, y0 / vScale, u1, y0 / vScale, u1, y1 / vScale, u0, y0 / vScale, u1, y1 / vScale, u0, y1 / vScale);
    along += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Seats rising away from a polyline: `out` is which side (+1 = left of the direction of travel). */
function stands(pts: V2[], out: number, y0: number, depth: number, rise: number, rowsPerTex = 8, rowDepth = 0.9) {
  const pos: number[] = [], uv: number[] = [];
  let along = 0;
  const nrm = (i: number): V2 => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    return [(-dz / l) * out, (dx / l) * out];
  };
  const vTop = depth / rowDepth / rowsPerTex;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const na = nrm(i), nb = nrm(i + 1);
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = along / 26, u1 = (along + len) / 26; // 26 seats per texture width, ~1 m each
    const A = [ax, y0, az], B = [bx, y0, bz];
    const C = [bx + nb[0] * depth, y0 + rise, bz + nb[1] * depth], D = [ax + na[0] * depth, y0 + rise, az + na[1] * depth];
    pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    uv.push(u0, 0, u1, 0, u1, vTop, u0, 0, u1, vTop, u0, vTop);
    along += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Where the ray from home at spray angle a meets the circle around (0, cz) with radius r. */
function rayCircle(a: number, cz: number, r: number): V2 {
  const [dx, dz] = dirOf(a);
  const dc = dz * cz;
  const t = dc + Math.sqrt(dc * dc - cz * cz + r * r);
  return [dx * t, dz * t];
}

export interface ParkView {
  group: THREE.Group;
  /** Redraw the scoreboard. */
  scoreboard: (lines: { away: string; home: string; line: [number[], number[]]; score: [number, number]; inning: number; top: boolean; msg: string }) => void;
  /** Light towers on (night games). */
  night: boolean;
}

export function buildPark(park: Park, homeColor: string, homeName: string): ParkView {
  const group = new THREE.Group();
  const B = new Batch();
  const m = park.base / 27.43;
  const yard = park.kind === 'backyard';

  // ---- materials
  const grassMap = grassTexture(yard ? '#5aa040' : '#4f9a3a', yard ? '#4c9036' : '#3f8530');
  const grass = new THREE.MeshStandardMaterial({ map: grassMap, roughness: 0.95 });
  const dirt = new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 1 });
  const track = new THREE.MeshStandardMaterial({ map: dirtTexture('#8f6a4a'), roughness: 1 });
  const chalk = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
  const pad = new THREE.MeshStandardMaterial({ color: park.kind === 'college' ? '#1f5a37' : park.kind === 'pro' ? '#1b2a4a' : '#2a6b3a', roughness: 0.8 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#f2d22e', roughness: 0.5, emissive: park.night ? '#665500' : '#000' });
  const concrete = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.9 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.6, metalness: 0.4 });
  const crowd = new THREE.MeshStandardMaterial({ map: crowdTexture(homeColor), roughness: 0.9, side: THREE.DoubleSide });
  const net = new THREE.MeshStandardMaterial({ map: chainTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6 });
  net.map!.repeat.set(1, 1);

  // ---- ground: grass everywhere, mowed in a diamond pattern
  const R = park.fenceCenter + (yard ? 40 : 80);
  B.add(grass, flat(circle(0, 0, R, 64), 0, yard ? 8 : 12, Math.PI / 4));

  if (!yard) {
    // Warning track in front of the wall.
    const tr: V2[] = [];
    for (let i = 0; i <= 30; i++) {
      const a = -FAIR - 0.03 + ((2 * FAIR + 0.06) * i) / 30;
      const d = fenceDist(park, a);
      tr.push([dirOf(a)[0] * d, dirOf(a)[1] * d]);
    }
    for (let i = 30; i >= 0; i--) {
      const a = -FAIR - 0.03 + ((2 * FAIR + 0.06) * i) / 30;
      const d = fenceDist(park, a) - 4.5;
      tr.push([dirOf(a)[0] * d, dirOf(a)[1] * d]);
    }
    B.add(track, flat(tr, 0.012, 3));
  }

  // ---- the infield: dirt skin (an arc round the mound), then the grass square inside the base paths
  const arcR = 28.96 * m;
  const skin: V2[] = [[0, -0.5]];
  const a0 = FAIR + 0.04;
  skin.push(rayCircle(-a0, park.mound, arcR));
  for (let i = 0; i <= 30; i++) {
    // Along the arc, from the third-base line round to the first-base line.
    const p0 = rayCircle(-a0, park.mound, arcR), p1 = rayCircle(a0, park.mound, arcR);
    const t0 = Math.atan2(p0[1] - park.mound, p0[0]), t1 = Math.atan2(p1[1] - park.mound, p1[0]);
    const t = t0 + (t1 - t0) * (i / 30);
    skin.push([Math.cos(t) * arcR, park.mound + Math.sin(t) * arcR]);
  }
  skin.push(rayCircle(a0, park.mound, arcR));
  B.add(dirt, flat(skin, 0.02, 3));
  const c: V2 = [0, park.base / Math.SQRT2];
  const sq: V2[] = [0, 1, 2, 3].map((i) => {
    const b = basePos(park, i);
    const dx = b[0] - c[0], dz = b[1] - c[1], l = Math.hypot(dx, dz);
    const k = 1 - (yard ? 1.1 : 1.9) / l;
    return [c[0] + dx * k, c[1] + dz * k];
  });
  B.add(grass, flat(sq.slice().reverse(), 0.035, yard ? 8 : 12, Math.PI / 4));
  // Dirt circles: home plate area, round each base, the mound.
  B.add(dirt, flat(circle(0, 0, 4 * m, 32), 0.05, 3));
  for (let i = 1; i <= 3; i++) {
    const b = basePos(park, i);
    B.add(dirt, flat(circle(b[0], b[1], 2 * m, 20), 0.05, 3));
  }
  const moundR = 2.74 * m;
  const moundGeo = new THREE.CylinderGeometry(moundR * 0.35, moundR, 0.25 * m, 28, 1);
  moundGeo.translate(0, 0.125 * m, park.mound);
  B.add(dirt, moundGeo);
  B.box(white, 0.61 * m, 0.03, 0.15, 0, 0.26 * m, park.mound);

  // ---- chalk: foul lines out to the wall, batter's boxes, catcher's box
  const lineW = 0.08;
  for (const s of [-1, 1]) {
    const a = s * FAIR;
    const [dx, dz] = dirOf(a);
    const L = fenceDist(park, a);
    const nx = -dz * lineW / 2, nz = dx * lineW / 2;
    B.add(chalk, flat([[nx, nz], [dx * L + nx, dz * L + nz], [dx * L - nx, dz * L - nz], [-nx, -nz]], 0.06));
  }
  const boxLines = (x0: number, z0: number, x1: number, z1: number) => {
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
      const nx = -dz * 0.04, nz = dx * 0.04;
      B.add(chalk, flat([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], 0.065));
    }
  };
  for (const s of [-1, 1]) boxLines(s * 0.37 * m, -0.9 * m, s * 1.6 * m, 0.95 * m);
  // ---- bases and the plate
  for (let i = 1; i <= 3; i++) {
    const b = basePos(park, i);
    B.box(white, 0.38, 0.09, 0.38, b[0], 0.08, b[1], Math.PI / 4);
  }
  const plate = flat([[-0.216, 0.216], [0.216, 0.216], [0.216, 0], [0, -0.216], [-0.216, 0]], 0.075);
  B.add(white, plate);

  // ---- the wall: outfield fence from pole to pole, foul walls, backstop behind home
  const rb = yard ? 7 : park.kind === 'hs' ? 14 : park.kind === 'college' ? 16 : 18;
  const fence: V2[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = -FAIR + (2 * FAIR * i) / 48;
    const d = fenceDist(park, a);
    fence.push([dirOf(a)[0] * d, dirOf(a)[1] * d]);
  }
  const nOut = (s: number): V2 => dirOf(s * (FAIR + Math.PI / 2)); // away from fair territory, beside a foul line
  const foul = (s: number): V2[] => {
    const pole = dirOf(s * FAIR).map((v) => v * park.fenceLine) as V2;
    const n = nOut(s);
    return [pole, [pole[0] + n[0] * rb, pole[1] + n[1] * rb], [n[0] * rb, n[1] * rb]];
  };
  const behind: V2[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = FAIR + Math.PI / 2 + ((2 * Math.PI - 2 * (FAIR + Math.PI / 2)) * i) / 16;
    behind.push(dirOf(a).map((v) => v * rb) as V2);
  }
  // One loop: right-field pole → foul wall → behind home → foul wall → left-field pole (then the fence).
  const foulLoop: V2[] = [...foul(1), ...behind.slice(1, -1), ...foul(-1).reverse()];

  const fenceMat = yard ? new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.9, side: THREE.DoubleSide }) : pad;
  if (yard) fenceMat.map!.repeat.set(1, 1);
  const fenceTop = park.fenceH;
  B.add(fenceMat, wallStrip(fence, 0, fenceTop, yard ? 4 : 1, yard ? 4 : 1));
  B.add(fenceMat, wallStrip(fence.slice().reverse(), 0, fenceTop, yard ? 4 : 1, yard ? 4 : 1));
  if (!yard) B.add(yellow, wallStrip(fence, fenceTop, fenceTop + 0.12));
  const foulH = yard ? park.fenceH : 1.2;
  const foulMat = yard ? fenceMat : park.kind === 'college' ? new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9 }) : pad;
  if (foulMat.map && !yard) foulMat.map.repeat.set(1, 1);
  B.add(foulMat, wallStrip(foulLoop, 0, foulH, yard ? 4 : 3, yard ? 4 : 1.5));
  B.add(foulMat, wallStrip(foulLoop.slice().reverse(), 0, foulH, yard ? 4 : 3, yard ? 4 : 1.5));
  // Backstop net behind home.
  if (!yard) {
    const back = behind.slice(3, -3);
    B.add(net, wallStrip(back, foulH, park.kind === 'hs' ? 6 : 9, 1.2, 1.2));
    for (const p of back.filter((_, i) => i % 3 === 0)) B.box(darkSteel, 0.1, park.kind === 'hs' ? 6 : 9, 0.1, p[0], (park.kind === 'hs' ? 6 : 9) / 2, p[1]);
  }
  // Foul poles.
  for (const s of [-1, 1]) {
    const p = dirOf(s * FAIR).map((v) => v * park.fenceLine);
    const pole = new THREE.CylinderGeometry(0.12, 0.12, fenceTop + (yard ? 2 : 14), 8);
    pole.translate(p[0], (fenceTop + (yard ? 2 : 14)) / 2, p[1]);
    B.add(yellow, pole);
  }

  // ---- stands
  if (park.kind === 'hs') {
    // Aluminium bleachers along both baselines, with a chain-link fence round the outfield on top of the wall.
    const alu = new THREE.MeshStandardMaterial({ color: '#b8bec6', roughness: 0.4, metalness: 0.6 });
    for (const s of [-1, 1]) {
      const n = nOut(s), d = dirOf(s * FAIR);
      const a: V2 = [n[0] * (rb + 1) + d[0] * 3, n[1] * (rb + 1) + d[1] * 3];
      const b: V2 = [a[0] + d[0] * 22, a[1] + d[1] * 22];
      const pts = s > 0 ? [a, b] : [b, a];
      B.add(crowd, stands(pts, 1, 0.5, 5, 2.6));
      B.box(alu, 0.1, 3.2, 0.1, b[0] + n[0] * 5, 1.6, b[1] + n[1] * 5);
    }
    B.add(net, wallStrip(fence, fenceTop, fenceTop + 1.8, 1.2, 1.2));
    // Trees beyond the outfield.
    trees(B, park.fenceCenter + 14, 36, 9);
  } else if (park.kind === 'college' || park.kind === 'pro') {
    const deep = park.kind === 'pro' ? 34 : 22;
    const rise = park.kind === 'pro' ? 17 : 10;
    // Lower bowl along the foul walls (and in the pro park, behind the outfield wall too).
    B.add(crowd, stands(foulLoop, -1, foulH + 0.3, deep, rise));
    B.add(concrete, wallStrip(foulLoop.map(([x, z]) => [x, z]), foulH, foulH + 0.3));
    if (park.kind === 'pro') {
      // The bleachers past the outfield wall, and an upper deck all round the infield.
      const back = fence.map(([x, z]) => {
        const l = Math.hypot(x, z);
        return [(x / l) * (l + 3), (z / l) * (l + 3)] as V2;
      });
      B.add(crowd, stands(back.slice().reverse(), 1, fenceTop + 1, 22, 12));
      B.add(concrete, wallStrip(back, 0, fenceTop + 1));
      const upper = foulLoop.map(([x, z]) => {
        const l = Math.hypot(x, z) || 1;
        return [(x / l) * (l + deep + 4), (z / l) * (l + deep + 4)] as V2;
      });
      B.add(crowd, stands(upper, -1, rise + 6, 20, 13));
      B.add(concrete, wallStrip(upper, rise + 1, rise + 6, 3, 3));
      // Light towers.
      const lampMat = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff6d0', emissiveIntensity: 2.2 });
      for (const a of [-1.15, -0.45, 0.45, 1.15]) {
        const d = a > 0.6 || a < -0.6 ? park.fenceLine + 25 : park.fenceCenter + 26;
        const p = dirOf(a).map((v) => v * d);
        B.box(darkSteel, 0.8, 42, 0.8, p[0], 21, p[1]);
        B.box(darkSteel, 9, 5, 0.6, p[0], 44, p[1], -a);
        const panel = new THREE.BoxGeometry(8.4, 4.4, 0.2);
        panel.rotateY(-a);
        panel.translate(p[0] - dirOf(a)[0] * 0.4, 44, p[1] - dirOf(a)[1] * 0.4);
        B.add(lampMat, panel);
      }
    } else {
      // Boston: the city behind the stands.
      const towers = new THREE.MeshStandardMaterial({ color: '#7d8796', roughness: 0.4, metalness: 0.3 });
      const brickTall = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9 });
      brickTall.map!.repeat.set(4, 8);
      for (let i = 0; i < 26; i++) {
        const a = -1.2 + (2.4 * i) / 25;
        const d = park.fenceCenter + 60 + ((i * 37) % 50);
        const p = dirOf(a).map((v) => v * d);
        const h = 18 + ((i * 53) % 60);
        B.box(i % 3 ? towers : brickTall, 14, h, 14, p[0], h / 2, p[1], -a);
      }
      B.add(net, wallStrip(fence.slice(0, 18), fenceTop, fenceTop + 6, 1.2, 1.2)); // a tall net over the big wall
    }
    // Wall signs.
    const signs = park.kind === 'pro' ? ['⚡ LIGHTNING', 'PROVIDENCE', '7× FINALISTS', 'LLAMA COLA'] : ['STRIKERS', 'BOSTON', 'GO STRIKERS!', 'LLAMA COLA'];
    for (let i = 0; i < 6; i++) {
      const a = -0.6 + i * 0.24;
      const d = fenceDist(park, a) - 0.06;
      const p = dirOf(a);
      const sm = new THREE.MeshBasicMaterial({ map: signTexture(signs[i % signs.length], i % 2 ? homeColor : '#ffffff', i % 2 ? '#ffffff' : homeColor) });
      const g = new THREE.PlaneGeometry(9, Math.min(1.6, fenceTop * 0.5));
      g.rotateY(Math.PI - a);
      g.translate(p[0] * d, fenceTop * 0.55, p[1] * d);
      B.add(sm, g);
    }
  } else {
    // Backyard: the house behind home plate, trees, a swing set.
    const siding = new THREE.MeshStandardMaterial({ color: '#e8dcc2', roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: '#5a3a2e', roughness: 0.8 });
    const trim = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: '#7fa7c8', roughness: 0.1, metalness: 0.5 });
    B.box(siding, 18, 6, 10, 0, 3, -rb - 6);
    const rg = new THREE.CylinderGeometry(0.01, 7.8, 3.2, 4, 1);
    rg.rotateY(Math.PI / 4);
    rg.scale(1.6, 1, 0.95);
    rg.translate(0, 7.6, -rb - 6);
    B.add(roof, rg);
    for (const x of [-5, 0, 5]) {
      B.box(trim, 2.2, 1.8, 0.1, x, 3.6, -rb - 0.98);
      B.box(glass, 1.9, 1.5, 0.12, x, 3.6, -rb - 0.97);
    }
    B.box(roof, 1.4, 2.4, 0.12, 8, 1.2, -rb - 0.98); // back door
    trees(B, park.fenceCenter + 8, 18, 5);
    // Swing set in left field foul ground.
    const p = dirOf(-1.2).map((v) => v * 20);
    for (const dz of [-1.5, 1.5]) for (const dx of [-1.2, 1.2]) {
      const leg = new THREE.CylinderGeometry(0.06, 0.06, 3.0, 6);
      leg.rotateX(dx > 0 ? 0.35 : -0.35);
      leg.translate(p[0] + dz, 1.4, p[1] + dx * 0.55);
      B.add(darkSteel, leg);
    }
    B.box(darkSteel, 3.4, 0.1, 0.1, p[0], 2.8, p[1]);
    B.box(roof, 0.5, 0.05, 0.25, p[0] - 0.7, 0.6, p[1]);
    B.box(roof, 0.5, 0.05, 0.25, p[0] + 0.7, 0.6, p[1]);
  }

  B.build(group);

  // ---- scoreboard in centre field
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 512;
  sbCanvas.height = 256;
  const sbTex = new THREE.CanvasTexture(sbCanvas);
  sbTex.colorSpace = THREE.SRGBColorSpace;
  const sbW = yard ? 4 : park.kind === 'hs' ? 9 : 18, sbH = sbW / 2;
  const sbD = park.fenceCenter + (yard ? 2.5 : park.kind === 'pro' ? 30 : 8);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(sbW, sbH), new THREE.MeshBasicMaterial({ map: sbTex, toneMapped: false }));
  const sbY = yard ? 2.6 : park.kind === 'pro' ? 36 : park.kind === 'college' ? 14 : 6;
  board.position.set(-sbD * 0.25, sbY, sbD);
  board.rotation.y = Math.PI - Math.atan2(sbD * 0.25, sbD);
  group.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(sbW + 0.6, sbH + 0.6, 0.4), darkSteel);
  frame.position.copy(board.position).add(new THREE.Vector3(0, 0, 0.25));
  frame.rotation.y = board.rotation.y;
  group.add(frame);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, sbY, 0.5), darkSteel);
  post.position.set(board.position.x, sbY / 2 - sbH / 2, board.position.z + 0.5);
  group.add(post);

  const scoreboard: ParkView['scoreboard'] = (s) => {
    const g = sbCanvas.getContext('2d')!;
    g.fillStyle = '#0d1a12';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = homeColor;
    g.fillRect(0, 0, 512, 36);
    g.fillStyle = '#fff';
    g.font = '900 24px Arial Black, Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(yard ? 'BACKYARD BASEBALL' : homeName.toUpperCase(), 256, 27);
    g.font = 'bold 26px Courier New, monospace';
    g.textAlign = 'left';
    const n = Math.max(3, s.line[0].length, s.line[1].length);
    const cw = Math.min(40, 300 / n);
    for (let i = 0; i < n; i++) {
      g.fillStyle = i + 1 === s.inning ? '#ffd21f' : '#9fb3a6';
      g.fillText(String(i + 1), 120 + i * cw, 76);
    }
    g.fillStyle = '#ffd21f';
    g.fillText('R', 448, 76);
    for (const [k, name] of [s.away, s.home].entries()) {
      const y = 120 + k * 44;
      g.fillStyle = '#ffffff';
      g.fillText(name.slice(0, 5), 14, y);
      for (let i = 0; i < n; i++) {
        const v = s.line[k][i];
        g.fillStyle = '#ffe9a8';
        if (v !== undefined) g.fillText(String(v), 120 + i * cw, y);
      }
      g.fillStyle = '#ffd21f';
      g.fillText(String(s.score[k]), 448, y);
    }
    g.fillStyle = '#7dffb0';
    g.font = 'bold 22px Arial, sans-serif';
    g.fillText(s.msg.slice(0, 36), 14, 236);
    sbTex.needsUpdate = true;
  };

  return { group, scoreboard, night: park.night };
}

function trees(B: Batch, dist: number, n: number, spread: number) {
  const bark = new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: 1 });
  const leaves = new THREE.MeshStandardMaterial({ color: '#2f6b2a', roughness: 0.9 });
  for (let i = 0; i < n; i++) {
    const a = -1.0 + (2.0 * i) / Math.max(1, n - 1);
    const d = dist + ((i * 7919) % (spread * 10)) / 10;
    const [x, z] = dirOf(a).map((v) => v * d);
    const h = 4 + ((i * 31) % 5);
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, h, 6);
    trunk.translate(x, h / 2, z);
    B.add(bark, trunk);
    const crown = new THREE.IcosahedronGeometry(2.4 + ((i * 13) % 3) * 0.6, 1);
    crown.scale(1, 1.15, 1);
    crown.translate(x, h + 1.5, z);
    B.add(leaves, crown);
  }
}
