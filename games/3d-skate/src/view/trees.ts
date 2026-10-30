// Street trees: a bark trunk that forks into branches, and a crown of see-through leaf cards painted from the
// leaf photo (public/games/3d-skate/textures/leaves_broad.webp, six leaves side by side). The cards' normals
// point out from the middle of the crown, so it lights like one round, bushy shape instead of flat planes.
import * as THREE from 'three';
import { rng } from '../sim/world';
import { Geo } from './geo';
import { bark } from './textures';

const SIZE = 512;

/** Paints a clump of leaves on a see-through canvas: shaded leaves at the back, sunlit ones on top. */
function paintClump(img: HTMLImageElement) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const r = rng(42);
  const cell = img.width / 6;
  const leaf = (n: number) => {
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      do {
        x = r() * 2 - 1;
        y = r() * 2 - 1;
      } while (x * x + y * y > 1);
      const len = SIZE * (0.07 + r() * 0.05);
      g.save();
      g.translate(SIZE / 2 + x * SIZE * 0.42, SIZE / 2 + y * SIZE * 0.42);
      g.rotate(Math.atan2(y, x) + Math.PI / 2 + (r() - 0.5) * 1.6);
      g.drawImage(img, Math.floor(r() * 6) * cell, 0, cell, img.height, -len * 0.33, -len / 2, len * 0.66, len);
      g.restore();
    }
  };
  leaf(300);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(10, 22, 6, 0.45)';
  g.fillRect(0, 0, SIZE, SIZE);
  g.globalCompositeOperation = 'source-over';
  leaf(240);
  return c;
}

/** Texture whose see-through pixels carry the leaves' average colour (not black), so far trees don't go dark. */
function bleed(c: HTMLCanvasElement) {
  const src = c.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < src.length; i += 4) if (src[i + 3] > 200) (r += src[i]), (g += src[i + 1]), (b += src[i + 2]), n++;
  const avg = [r / n, g / n, b / n];
  const out = new Uint8Array(src.length);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4, o = ((SIZE - 1 - y) * SIZE + x) * 4;
      const a = src[i + 3];
      for (let k = 0; k < 3; k++) out[o + k] = a > 8 ? Math.min(255, (src[i + k] * 255) / a) : avg[k];
      out[o + 3] = a;
    }
  const t = new THREE.DataTexture(out, SIZE, SIZE, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let mats: { leaves: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } | null = null;

/** The leaf material (filled in once the photo loads) and its shadow material, which shows the gaps. */
export function leafMaterials() {
  if (mats) return mats;
  const leaves = new THREE.MeshStandardMaterial({ color: 0xc8d8b0, roughness: 0.8, alphaTest: 0.5, alphaToCoverage: true });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
  const img = new Image();
  img.onload = () => {
    const t = bleed(paintClump(img));
    leaves.map = depth.map = t;
    leaves.needsUpdate = depth.needsUpdate = true;
  };
  img.src = './textures/leaves_broad.webp';
  mats = { leaves, depth };
  return mats;
}

export function barkMaterial() {
  const b = bark();
  return new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normal, roughness: 0.95 });
}

type V3 = [number, number, number];

/** A tapered branch from a to b (radius ra to rb), bark UVs running along it. */
function branch(g: Geo, a: V3, b: V3, ra: number, rb: number, sides = 7) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  d.normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(d);
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(d, side);
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    const n0 = side.clone().multiplyScalar(Math.cos(a0)).addScaledVector(up, Math.sin(a0));
    const n1 = side.clone().multiplyScalar(Math.cos(a1)).addScaledVector(up, Math.sin(a1));
    const p = (n: THREE.Vector3, r: number, base: V3): V3 => [base[0] + n.x * r, base[1] + n.y * r, base[2] + n.z * r];
    g.quad(
      [p(n0, ra, a), p(n1, ra, a), p(n1, rb, b), p(n0, rb, b)],
      [n0.toArray() as V3, n1.toArray() as V3, n1.toArray() as V3, n0.toArray() as V3],
      [[i / sides, 0], [(i + 1) / sides, 0], [(i + 1) / sides, len / 1.5], [i / sides, len / 1.5]],
    );
  }
}

/** One tree (trunk + branches, crown cards), standing at the origin. A few variants by seed. */
export function treeGeometry(seed: number) {
  const r = rng(seed * 977 + 3);
  const bark = new Geo(), leaves = new Geo();
  const H = 3.2 + r() * 1.2; // where the trunk forks
  const top: V3 = [(r() - 0.5) * 0.3, H, (r() - 0.5) * 0.3];
  branch(bark, [0, 0, 0], top, 0.17, 0.12, 9);
  const crownY = H + 2.2 + r() * 0.6, R = 2.3 + r() * 0.6;
  const tips: V3[] = [];
  const nb = 4 + Math.floor(r() * 2);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + r() * 0.8;
    const tip: V3 = [Math.cos(a) * R * 0.55, crownY + (r() - 0.3) * 1.2, Math.sin(a) * R * 0.55];
    branch(bark, top, tip, 0.09, 0.03, 6);
    tips.push(tip);
  }
  // Leaf cards: on a squashed ball round the crown, each facing a random way, both sides drawn.
  const card = (cx: number, cy: number, cz: number, s: number) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI));
    const ux = new THREE.Vector3(s, 0, 0).applyQuaternion(q), uy = new THREE.Vector3(0, s, 0).applyQuaternion(q);
    const corners: [V3, V3, V3, V3] = [
      [cx - ux.x - uy.x, cy - ux.y - uy.y, cz - ux.z - uy.z],
      [cx + ux.x - uy.x, cy + ux.y - uy.y, cz + ux.z - uy.z],
      [cx + ux.x + uy.x, cy + ux.y + uy.y, cz + ux.z + uy.z],
      [cx - ux.x + uy.x, cy - ux.y + uy.y, cz - ux.z + uy.z],
    ];
    // Normals out from the crown's middle (a bit up), so the crown shades like a ball.
    const ns = corners.map(([x, y, z]) => new THREE.Vector3(x, (y - crownY) * 1.3 + 0.4, z).normalize().toArray() as V3) as [V3, V3, V3, V3];
    const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    leaves.quad(corners, ns, uv);
    // The back side: same corners the other way round, same outward normals.
    leaves.quad([corners[0], corners[3], corners[2], corners[1]], [ns[0], ns[3], ns[2], ns[1]], [uv[0], uv[3], uv[2], uv[1]]);
  };
  for (let i = 0; i < 38; i++) {
    let x = 0, y = 0, z = 0;
    do {
      x = r() * 2 - 1;
      y = r() * 2 - 1;
      z = r() * 2 - 1;
    } while (x * x + y * y + z * z > 1);
    card(x * R, crownY + y * R * 0.75, z * R, 1.1 + r() * 0.4);
  }
  for (const t of tips) card(t[0], t[1] + 0.3, t[2], 1.2);
  return { bark: bark.build(), leaves: leaves.build() };
}
