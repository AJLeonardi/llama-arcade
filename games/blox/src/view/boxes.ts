// Builds one BufferGeometry out of many boxes, with per-box vertex colours and world-sized UVs (one texture
// tile per unit, so a long block shows more tiles rather than a stretched one).
import * as THREE from 'three';

// Each face: normal, then the two in-face axes (u, v) as [axis, sign].
const FACES: { n: [number, number, number]; u: [number, number]; v: [number, number] }[] = [
  { n: [1, 0, 0], u: [2, -1], v: [1, 1] },
  { n: [-1, 0, 0], u: [2, 1], v: [1, 1] },
  { n: [0, 1, 0], u: [0, 1], v: [2, -1] },
  { n: [0, -1, 0], u: [0, 1], v: [2, 1] },
  { n: [0, 0, 1], u: [0, 1], v: [1, 1] },
  { n: [0, 0, -1], u: [0, -1], v: [1, 1] },
];

export class BoxBatch {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  get empty() {
    return this.pos.length === 0;
  }

  /**
   * Adds a box centred at (x, y, z) with size (w, h, d).
   * `topSpin` turns the top face's texture (radians), so arrows on speed pads and belts point the right way.
   */
  add(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.Color, topSpin = 0) {
    const half = [w / 2, h / 2, d / 2];
    const c = [x, y, z];
    for (const f of FACES) {
      const base = this.pos.length / 3;
      const nAxis = f.n.findIndex((v) => v !== 0);
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [0, 0, 0];
        p[nAxis] = f.n[nAxis] * half[nAxis];
        p[f.u[0]] = su * f.u[1] * half[f.u[0]];
        p[f.v[0]] = sv * f.v[1] * half[f.v[0]];
        this.pos.push(c[0] + p[0], c[1] + p[1], c[2] + p[2]);
        this.nrm.push(...f.n);
        // UVs in world units, anchored to world position so neighbouring blocks line up.
        let u = c[f.u[0]] * f.u[1] + su * half[f.u[0]];
        let v = c[f.v[0]] * f.v[1] + sv * half[f.v[0]];
        if (topSpin && nAxis === 1 && f.n[1] > 0) {
          const cs = Math.cos(topSpin), sn = Math.sin(topSpin);
          [u, v] = [u * cs - v * sn, u * sn + v * cs];
        }
        this.uv.push(u, v);
        this.col.push(color.r, color.g, color.b);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
