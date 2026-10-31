// Merging: everything that doesn't move is collected per material and merged into one mesh each, so the whole
// lodge is a few dozen draw calls (the old iPad can't do thousands).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** UVs in metres from the world position, picked by which way each face points (like a box). */
export function worldUV(g: THREE.BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) [u, v] = [p.getX(i), p.getZ(i)];
    else if (ax >= az) [u, v] = [p.getZ(i), p.getY(i)];
    else [u, v] = [p.getX(i), p.getY(i)];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** Add a geometry (copied), moved by `m`. With `uvs: 'world'` it gets metre UVs after moving. */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4, uvs: 'keep' | 'world' = 'keep') {
    const g = geo.clone();
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (uvs === 'world' || !g.attributes.uv) worldUV(g);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
    return this;
  }

  /** A box from corner to corner, with metre UVs. */
  box(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(mat, g, undefined, 'world');
  }

  /** A geometry placed at a position with a turn round y (radians) and a scale. */
  put(mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, s: number | THREE.Vector3 = 1, uvs: 'keep' | 'world' = 'keep') {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      typeof s === 'number' ? new THREE.Vector3(s, s, s) : s,
    );
    return this.add(mat, geo, m, uvs);
  }

  /** Merge everything into meshes under `parent`. */
  flush(parent: THREE.Object3D, shadows: { cast?: boolean; receive?: boolean } = { cast: true, receive: true }) {
    for (const [mat, list] of this.parts) {
      const indexed = list.every((g) => g.index);
      const geos = indexed ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !!shadows.cast && !(mat as THREE.MeshStandardMaterial).transparent;
      mesh.receiveShadow = !!shadows.receive;
      parent.add(mesh);
      for (const g of list) g.dispose();
    }
    this.parts.clear();
  }
}
