// Day and night: the sky (three's Sky shader), the sun (or moon) light with shadows that follow you, stars,
// fog and exposure, all set from the hour.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { daylight, sunAt } from '../sim/clock';

export class DayNight {
  readonly sun = new THREE.DirectionalLight(0xfff1dc, 2.8);
  readonly hemi = new THREE.HemisphereLight(0xcfe0ff, 0x5a5550, 0.4);
  private sky = new Sky();
  private stars: THREE.Points;
  private dir = new THREE.Vector3();
  /** 0 in the day, 1 at night. */
  night = 0;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
  ) {
    this.sky.scale.setScalar(2000);
    this.sky.renderOrder = -1;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3.5;
    u.rayleigh.value = 1.3;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    scene.add(this.sky);
    // Stars: points on a big dome.
    const pos: number[] = [];
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, y = 0.08 + r() * 0.92;
      const h = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * h * 1500, y * 1500, Math.sin(a) * h * 1500);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -1;
    scene.add(this.stars);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target, this.hemi);
    scene.fog = new THREE.Fog(0xb4c3d3, 200, 1300);
    // A soft environment for reflections (made once from a daytime sky; turned down at night).
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const s2 = new Sky();
    s2.scale.setScalar(1000);
    Object.assign(s2.material.uniforms, THREE.UniformsUtils.clone(this.sky.material.uniforms));
    s2.material.uniforms.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), 0.6);
    envScene.add(s2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a5340 }));
    ground.position.y = -5;
    envScene.add(ground);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
  }

  /** Sets everything for the hour; `at` is where you are (the shadows and sky follow). */
  update(hour: number, at: THREE.Vector3, camera: THREE.Camera) {
    const { elev, az } = sunAt(hour);
    const day = daylight(hour);
    this.night = 1 - day;
    // Sun direction: azimuth 0 = north (-z), turning toward east (+x).
    this.dir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev));
    this.sky.material.uniforms.sunPosition.value.copy(this.dir);
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, this.night - 0.3) * 1.3;
    // The light: the sun by day, a pale moon high in the south-west at night.
    const low = Math.max(0, Math.min(1, Math.sin(elev) * 4)); // reddens near the horizon
    const lightDir = day > 0.15 ? this.dir.clone() : new THREE.Vector3(-0.35, 0.8, 0.45).normalize();
    if (day > 0.15) {
      this.sun.color.setRGB(1, 0.75 + 0.2 * low, 0.55 + 0.35 * low);
      this.sun.intensity = 2.8 * Math.min(1, (day - 0.15) / 0.5);
    } else {
      this.sun.color.setRGB(0.6, 0.7, 1);
      this.sun.intensity = 0.7 * (1 - day / 0.15) + 0.4 * (day / 0.15);
    }
    this.sun.target.position.copy(at);
    this.sun.position.copy(at).addScaledVector(lightDir, 120);
    this.hemi.intensity = 0.3 + 0.2 * day;
    this.hemi.color.setRGB(0.55 + 0.26 * day, 0.6 + 0.28 * day, 0.85 + 0.15 * day);
    this.scene.environmentIntensity = 0.22 + 0.65 * day;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setRGB(0.04 + 0.66 * day, 0.06 + 0.7 * day, 0.12 + 0.71 * day);
    if (low < 1 && day > 0.2) fog.color.lerp(new THREE.Color(0.85, 0.6, 0.45), (1 - low) * 0.5);
    this.renderer.toneMappingExposure = 0.7 + 0.2 * day;
  }
}
