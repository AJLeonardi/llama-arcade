// Splashing water, made of blocks like everything in a game should be: big blocks fly (out of the tipping
// bucket, up out of the geyser, up out of the pool when you jump in) and fall; when one lands it smashes into
// little blocks that fly apart. On the floor the little blocks bounce once and shrink away; on water they
// sink.
import * as THREE from 'three';

interface Block { p: THREE.Vector3; v: THREE.Vector3; s: number; spin: THREE.Vector3; r: THREE.Euler }
interface Bit extends Block { age: number; life: number; bounced: boolean }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const spin = (k: number) => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(k);
const turn = () => new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3);

export class BlockWater {
  private readonly big: THREE.InstancedMesh;
  private readonly bits: THREE.InstancedMesh;
  private readonly blocks: Block[] = [];
  private readonly pieces: Bit[] = [];
  /** The floor under each 25 cm cell, worked out once. */
  private readonly floors = new Map<number, number>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly sc = new THREE.Vector3();
  static readonly MAX_BIG = 400;
  static readonly MAX_BITS = 2000;

  /** `floorAt(x, z)`: where blocks land. Below 0 is water (they sink into it). */
  constructor(parent: THREE.Object3D, private readonly floorAt: (x: number, z: number) => number) {
    const mat = new THREE.MeshStandardMaterial({ color: '#6fd0f2', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.78, emissive: '#1a6f96', emissiveIntensity: 0.25 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.big = new THREE.InstancedMesh(geo, mat, BlockWater.MAX_BIG);
    this.bits = new THREE.InstancedMesh(geo, mat, BlockWater.MAX_BITS);
    for (const im of [this.big, this.bits]) {
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      parent.add(im);
    }
  }

  private floor(x: number, z: number) {
    const k = Math.round(x * 4) * 100000 + Math.round(z * 4);
    let f = this.floors.get(k);
    if (f === undefined) this.floors.set(k, (f = this.floorAt(x, z)));
    return f;
  }

  /** Throw one big block of water (size `s` metres). */
  throw(p: THREE.Vector3, v: THREE.Vector3, s: number) {
    if (this.blocks.length < BlockWater.MAX_BIG) this.blocks.push({ p: p.clone(), v: v.clone(), s, spin: spin(8), r: turn() });
  }

  /**
   * Something went into the water at (x, y, z): a crown of little blocks, and a few bigger ones thrown up that
   * smash when they come down, like the bucket's water but smaller. `power` 0..1.
   */
  splash(x: number, y: number, z: number, power: number) {
    const k = Math.max(0.25, Math.min(1, power));
    const nBig = Math.round(4 + 10 * k);
    for (let i = 0; i < nBig; i++) {
      const a = Math.random() * Math.PI * 2, out = rnd(0.5, 1.6) * k;
      this.throw(new THREE.Vector3(x + Math.cos(a) * 0.25, y + 0.1, z + Math.sin(a) * 0.25), new THREE.Vector3(Math.cos(a) * out, rnd(2.2, 4.2) * Math.sqrt(k), Math.sin(a) * out), rnd(0.1, 0.2) * (0.6 + k * 0.4));
    }
    this.burst(x, y, z, Math.round(14 + 24 * k), 0.12 * (0.6 + k * 0.4), k);
  }

  /** Little blocks flying out from a point (a block smashing). */
  private burst(x: number, y: number, z: number, n: number, s: number, k = 1, carry?: THREE.Vector3) {
    for (let i = 0; i < n && this.pieces.length < BlockWater.MAX_BITS; i++) {
      const a = Math.random() * Math.PI * 2, out = rnd(0.8, 3.2) * k;
      this.pieces.push({
        p: new THREE.Vector3(x + Math.cos(a) * s * 0.3, y + 0.05, z + Math.sin(a) * s * 0.3),
        v: new THREE.Vector3(Math.cos(a) * out + (carry?.x ?? 0) * 0.25, rnd(1, 3.6) * Math.max(0.6, k), Math.sin(a) * out + (carry?.z ?? 0) * 0.25),
        s: s * rnd(0.28, 0.5), age: 0, life: rnd(0.7, 1.3), bounced: false, spin: spin(14), r: turn(),
      });
    }
  }

  step(dt: number) {
    const G = 9.8;
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      b.v.y -= G * dt;
      b.p.addScaledVector(b.v, dt);
      b.r.x += b.spin.x * dt; b.r.y += b.spin.y * dt; b.r.z += b.spin.z * dt;
      const f = this.floor(b.p.x, b.p.z);
      if (b.p.y - b.s / 2 > f || b.v.y > 0) continue;
      // Splash! The block breaks into little blocks.
      this.blocks.splice(i, 1);
      this.burst(b.p.x, f, b.p.z, 6 + Math.floor(Math.random() * 4), b.s, 1, b.v);
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const c = this.pieces[i];
      c.age += dt;
      if (c.age > c.life) {
        this.pieces.splice(i, 1);
        continue;
      }
      c.v.y -= G * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.spin.x * dt; c.r.y += c.spin.y * dt; c.r.z += c.spin.z * dt;
      const f = this.floor(c.p.x, c.p.z);
      if (c.p.y - c.s / 2 < f && c.v.y < 0) {
        if (f < 0) {
          // Back into the water.
          this.pieces.splice(i, 1);
          continue;
        }
        c.p.y = f + c.s / 2;
        if (c.bounced) c.v.set(c.v.x * 0.5, 0, c.v.z * 0.5);
        else c.v.set(c.v.x * 0.6, -c.v.y * 0.3, c.v.z * 0.6);
        c.bounced = true;
      }
    }
    this.write(this.big, this.blocks.map((b) => [b.p, b.r, b.s] as const));
    this.write(this.bits, this.pieces.map((c) => [c.p, c.r, c.s * Math.min(1, (c.life - c.age) / 0.35)] as const));
  }

  private write(im: THREE.InstancedMesh, list: (readonly [THREE.Vector3, THREE.Euler, number])[]) {
    list.forEach(([p, r, s], i) => {
      this.q.setFromEuler(r);
      this.m.compose(p, this.q, this.sc.set(s, s, s));
      im.setMatrixAt(i, this.m);
    });
    im.count = list.length;
    im.instanceMatrix.needsUpdate = true;
  }
}
