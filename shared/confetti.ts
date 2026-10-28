// A burst of coloured confetti blocks for finishing a level (Llama-blox, Speed Run AM).
import * as THREE from 'three';

const N = 120;

export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private parts: { p: THREE.Vector3; v: THREE.Vector3; spin: THREE.Vector3; r: THREE.Euler }[] = [];
  private life = 0;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.04, 0.14), new THREE.MeshBasicMaterial(), N);
    const cols = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f783ac'].map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      this.mesh.setColorAt(i, cols[i % cols.length]);
      this.parts.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), r: new THREE.Euler() });
    }
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  burst(at: THREE.Vector3) {
    this.life = 4;
    this.mesh.visible = true;
    for (const q of this.parts) {
      q.p.copy(at);
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      q.v.set(Math.cos(a) * s, 8 + Math.random() * 8, Math.sin(a) * s);
      q.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    }
  }

  update(dt: number) {
    if (this.life <= 0) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.mesh.visible = false;
      return;
    }
    this.parts.forEach((q, i) => {
      q.v.y = Math.max(-2.5, q.v.y - 14 * dt); // flutters down slowly
      q.v.x *= 1 - dt * 1.5;
      q.v.z *= 1 - dt * 1.5;
      q.p.addScaledVector(q.v, dt);
      q.r.set(q.r.x + q.spin.x * dt, q.r.y + q.spin.y * dt, q.r.z + q.spin.z * dt);
      this.dummy.position.copy(q.p);
      this.dummy.rotation.copy(q.r);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
