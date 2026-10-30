// A small mesh builder: quads with explicit normals and UVs, plus copies of other geometries.
import * as THREE from 'three';

type V3 = [number, number, number];

export class Geo {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];

  get empty() {
    return this.pos.length === 0;
  }

  private vert(p: V3, n: V3, u: number, v: number) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(u, v);
  }

  /**
   * A quad a-b-c-d (in order round the edge) with per-corner normals (one normal = flat) and UVs.
   * The winding is fixed up so the front faces the normal.
   */
  quad(p: [V3, V3, V3, V3], n: V3 | [V3, V3, V3, V3], uv: [number, number][]) {
    const ns: V3[] = n.length === 3 && typeof n[0] === 'number' ? [n as V3, n as V3, n as V3, n as V3] : (n as V3[]);
    const e1 = sub(p[1], p[0]), e2 = sub(p[2], p[0]);
    const f = cross(e1, e2);
    const avg = add(add(ns[0], ns[1]), add(ns[2], ns[3]));
    const order = dot(f, avg) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) this.vert(p[i], ns[i], uv[i][0], uv[i][1]);
  }

  /** An axis-aligned box with world-sized UVs (one texture tile per `tile` metres). `faces` skips some. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 4, skipBottom = true) {
    const t = 1 / tile;
    // +x, -x
    this.quad([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0], [[z0 * t, y0 * t], [z1 * t, y0 * t], [z1 * t, y1 * t], [z0 * t, y1 * t]]);
    this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[-z0 * t, y0 * t], [-z1 * t, y0 * t], [-z1 * t, y1 * t], [-z0 * t, y1 * t]]);
    // +z, -z
    this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[-x0 * t, y0 * t], [-x1 * t, y0 * t], [-x1 * t, y1 * t], [-x0 * t, y1 * t]]);
    this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], [[x0 * t, y0 * t], [x1 * t, y0 * t], [x1 * t, y1 * t], [x0 * t, y1 * t]]);
    // top (and bottom)
    this.quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], [[x0 * t, z0 * t], [x1 * t, z0 * t], [x1 * t, z1 * t], [x0 * t, z1 * t]]);
    if (!skipBottom) this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0 * t, z0 * t], [x1 * t, z0 * t], [x1 * t, z1 * t], [x0 * t, z1 * t]]);
  }

  /** Adds a copy of another geometry, moved by a matrix. */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4) {
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.getAttribute('position'), n = src.getAttribute('normal'), uv = src.getAttribute('uv');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.nrm.push(v.x, v.y, v.z);
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A matrix placing a unit-length +y cylinder from a to b. */
export function between(a: V3, b: V3) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1));
}
