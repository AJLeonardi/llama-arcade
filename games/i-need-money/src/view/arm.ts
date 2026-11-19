// Your builder arm, on your right hand. It sways when you walk and shoots a building beam that makes rides.
import * as THREE from 'three';
import { M } from './rides';

export class Arm {
  readonly group = new THREE.Group();
  /** The glowing tip, where the beam and the money go. */
  readonly tip: THREE.Object3D;
  private beam: THREE.Mesh;
  private glow: THREE.Mesh;
  private beamTime = 0;
  private beamTarget = new THREE.Vector3();
  private sway = 0;

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    const g = this.group;
    // Upper arm comes in from the bottom right corner; the forearm points forward.
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 10), M('#868e96'));
    upper.position.set(0.12, -0.12, 0.18);
    upper.rotation.set(-1.1, 0, 0.3);
    g.add(upper);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M('#fab005'));
    elbow.position.set(0.04, -0.02, -0.05);
    g.add(elbow);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 10), M('#adb5bd'));
    fore.position.set(0, 0.0, -0.25);
    fore.rotation.x = -Math.PI / 2 + 0.1;
    g.add(fore);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10), M('#2f9e44'));
    band.position.set(0, 0.0, -0.18);
    band.rotation.x = -Math.PI / 2 + 0.1;
    g.add(band);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), M('#fab005'));
    hand.position.set(0, 0.03, -0.48);
    g.add(hand);
    for (const x of [-0.05, 0.05]) {
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), M('#495057'));
      claw.position.set(x, 0.03, -0.58);
      g.add(claw);
    }
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: '#66fff0' }));
    this.glow.position.set(0, 0.03, -0.6);
    g.add(this.glow);
    this.tip = this.glow;
    g.position.set(0.32, -0.3, -0.35);
    g.scale.setScalar(0.75);
    g.rotation.y = 0.12;
    g.traverse((o) => (o.renderOrder = 10));
    camera.add(g);

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#66fff0', transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.beam.visible = false;
    scene.add(this.beam);
  }

  /** Shoot the building beam at a spot for a while. */
  zap(at: THREE.Vector3, secs = 1.6) {
    this.beamTarget.copy(at);
    this.beamTime = secs;
  }

  get zapping() {
    return this.beamTime > 0;
  }

  update(dt: number, walking: number, time: number) {
    this.sway += dt * walking * 9;
    const g = this.group;
    g.position.x = 0.32 + Math.sin(this.sway) * 0.012;
    g.position.y = -0.3 + Math.abs(Math.cos(this.sway)) * 0.015 + (this.beamTime > 0 ? Math.sin(time * 40) * 0.006 : 0);
    const s = 1 + Math.sin(time * 5) * 0.15 + (this.beamTime > 0 ? 0.8 : 0);
    this.glow.scale.setScalar(s);
    if (this.beamTime > 0) {
      this.beamTime -= dt;
      const from = new THREE.Vector3();
      this.tip.getWorldPosition(from);
      this.beam.visible = true;
      this.beam.position.copy(from);
      this.beam.lookAt(this.beamTarget);
      this.beam.scale.set(1 + Math.sin(time * 30) * 0.3, 1 + Math.sin(time * 30) * 0.3, from.distanceTo(this.beamTarget));
    } else this.beam.visible = false;
  }
}
