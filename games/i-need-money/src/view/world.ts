// The park around the rides: grass, the fence, the gate, trees, the sky, the guests (one instanced mesh),
// your workers and mechanics, ride signs, smoke from broken rides and flying money.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../../../../shared/textures';
import { GATE_Z, HALF, Guest, Helper } from '../sim/park';
import { M } from './rides';

export function makeWorld(scene: THREE.Scene) {
  scene.background = new THREE.Color('#8fd3ff');
  scene.fog = new THREE.Fog('#bfe6ff', 200, 900);
  scene.add(new THREE.HemisphereLight('#dff4ff', '#4f7a3a', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.8);
  sun.position.set(80, 140, 60);
  scene.add(sun);

  const grass = canvasTexture(256, (g, s) => {
    g.fillStyle = '#5fae4a';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = Math.random() < 0.5 ? '#6cbd55' : '#539e40';
      g.fillRect(Math.random() * s, Math.random() * s, 2, 3);
    }
  });
  grass.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: grass }));
  scene.add(ground);
  // A path from the gate into the middle.
  scene.add(mesh(new THREE.PlaneGeometry(6, HALF + 4).rotateX(-Math.PI / 2), '#d8c39a', 0, 0.02, HALF / 2 + 2));
  scene.add(mesh(new THREE.CircleGeometry(10, 32).rotateX(-Math.PI / 2), '#d8c39a', 0, 0.02, 0));

  // Fence.
  const posts: THREE.BufferGeometry[] = [];
  for (let k = -HALF; k <= HALF; k += 4) {
    for (const [x, z] of [[k, -HALF], [k, HALF], [-HALF, k], [HALF, k]]) {
      if (z === HALF && Math.abs(x) < 6) continue;
      posts.push(new THREE.BoxGeometry(0.3, 1.6, 0.3).translate(x, 0.8, z));
    }
  }
  for (const [x, z, w, d] of [[0, -HALF, 2 * HALF, 0.15], [-HALF, 0, 0.15, 2 * HALF], [HALF, 0, 0.15, 2 * HALF], [-(HALF + 6) / 2, HALF, HALF - 6, 0.15], [(HALF + 6) / 2, HALF, HALF - 6, 0.15]]) {
    posts.push(new THREE.BoxGeometry(w, 0.2, d).translate(x, 1.2, z));
  }
  scene.add(new THREE.Mesh(mergeGeometries(posts), M('#ffffff')));

  // The gate with the park's name.
  for (const x of [-5, 5]) scene.add(mesh(new THREE.BoxGeometry(1, 7, 1), '#e03131', x, 3.5, HALF));
  const sc = document.createElement('canvas');
  sc.width = 512;
  sc.height = 128;
  const sg = sc.getContext('2d')!;
  sg.fillStyle = '#2f9e44';
  sg.fillRect(0, 0, 512, 128);
  sg.fillStyle = '#ffd43b';
  sg.font = 'bold 58px sans-serif';
  sg.textAlign = 'center';
  sg.textBaseline = 'middle';
  sg.fillText('💵 I NEED MONEY 💵', 256, 66, 490);
  const sign = new THREE.CanvasTexture(sc);
  sign.colorSpace = THREE.SRGBColorSpace;
  const signGeo = new THREE.PlaneGeometry(11, 2.75);
  const front = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: sign }));
  front.position.set(0, 7.5, HALF - 0.1);
  front.rotation.y = Math.PI;
  scene.add(front);
  const back = front.clone();
  back.position.z = HALF + 0.1;
  back.rotation.y = 0;
  scene.add(back);

  // Trees outside the fence.
  const trunks: THREE.BufferGeometry[] = [], tops: THREE.BufferGeometry[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, d = HALF + 12 + rnd() * 140;
    const x = Math.cos(a) * d * 1.1, z = Math.sin(a) * d * 1.1;
    if (Math.abs(x) < 20 && z > HALF) continue;
    const s = 0.8 + rnd() * 1.2;
    trunks.push(new THREE.CylinderGeometry(0.3 * s, 0.4 * s, 3 * s, 6).translate(x, 1.5 * s, z));
    tops.push(new THREE.ConeGeometry(2.2 * s, 5 * s, 7).translate(x, 5 * s, z));
  }
  scene.add(new THREE.Mesh(mergeGeometries(trunks), M('#7a5230')));
  scene.add(new THREE.Mesh(mergeGeometries(tops), M('#2b8a3e')));

  // Little clouds.
  const cl: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 30; i++) {
    const x = (rnd() - 0.5) * 1200, z = (rnd() - 0.5) * 1200, y = 160 + rnd() * 120;
    for (let k = 0; k < 4; k++) cl.push(new THREE.SphereGeometry(10 + rnd() * 8, 8, 6).translate(x + k * 12, y + rnd() * 5, z + rnd() * 8));
  }
  const clouds = new THREE.Mesh(mergeGeometries(cl), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }));
  scene.add(clouds);
}

function mesh(g: THREE.BufferGeometry, color: string, x: number, y: number, z: number) {
  const m = new THREE.Mesh(g, M(color));
  m.position.set(x, y, z);
  return m;
}

/** A small llama shape, merged into one geometry. Faces +z. */
export function llamaGeo(scale = 1) {
  const parts = [
    new THREE.BoxGeometry(0.6, 0.55, 1.0).translate(0, 0.95, 0),
    new THREE.BoxGeometry(0.28, 0.75, 0.28).translate(0, 1.45, 0.38),
    new THREE.BoxGeometry(0.32, 0.3, 0.5).translate(0, 1.85, 0.48),
    new THREE.BoxGeometry(0.08, 0.2, 0.08).translate(-0.1, 2.08, 0.35),
    new THREE.BoxGeometry(0.08, 0.2, 0.08).translate(0.1, 2.08, 0.35),
  ];
  for (const [x, z] of [[-0.2, 0.35], [0.2, 0.35], [-0.2, -0.35], [0.2, -0.35]]) parts.push(new THREE.BoxGeometry(0.14, 0.7, 0.14).translate(x, 0.35, z));
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  g.scale(scale, scale, scale);
  return g;
}

export class Guests {
  private mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private last = new Map<number, { x: number; z: number; h: number }>();
  private time = 0;
  constructor(scene: THREE.Scene, private max = 140) {
    this.mesh = new THREE.InstancedMesh(llamaGeo(), new THREE.MeshLambertMaterial({ color: '#ffffff' }), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  update(guests: Guest[], dt: number) {
    this.time += dt;
    let n = 0;
    const seen = new Set<number>();
    for (const g of guests) {
      if (g.state === 'ride' || n >= this.max) continue;
      seen.add(g.id);
      const prev = this.last.get(g.id);
      let h = prev?.h ?? 0;
      let moving = false;
      if (prev) {
        const dx = g.x - prev.x, dz = g.z - prev.z;
        if (dx * dx + dz * dz > 1e-5) {
          h = Math.atan2(dx, dz);
          moving = true;
        }
      }
      this.last.set(g.id, { x: g.x, z: g.z, h });
      this.dummy.position.set(g.x, moving ? Math.abs(Math.sin(this.time * 8 + g.id)) * 0.12 : 0, g.z);
      this.dummy.rotation.set(0, h, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, this.color.setHex(g.color));
      n++;
    }
    for (const id of [...this.last.keys()]) if (!seen.has(id)) this.last.delete(id);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Your workers (yellow hats, a money bag) and mechanics (orange hats, a wrench). */
export class Helpers {
  private figs: THREE.Group[] = [];
  private geo = llamaGeo(1.1);
  constructor(private scene: THREE.Scene) {}
  update(list: Helper[], time: number) {
    while (this.figs.length < list.length) {
      const k = list[this.figs.length].kind;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.geo, M(k === 'worker' ? '#fff3bf' : '#ffe8cc')));
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.2, 10), k === 'worker' ? '#fab005' : '#f76707', 0, 2.38, 0.53));
      g.add(mesh(new THREE.BoxGeometry(0.66, 0.3, 0.9), k === 'worker' ? '#fab005' : '#1c7ed6', 0, 1.15, 0));
      const tool = k === 'worker'
        ? mesh(new THREE.SphereGeometry(0.25, 8, 6), '#2f9e44', 0.45, 1.0, 0.2)
        : mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), '#adb5bd', 0.45, 1.0, 0.4);
      g.add(tool);
      this.scene.add(g);
      this.figs.push(g);
    }
    list.forEach((h, i) => {
      const f = this.figs[i];
      const dx = h.x - f.position.x, dz = h.z - f.position.z;
      const moving = dx * dx + dz * dz > 1e-5;
      if (moving) f.rotation.y = Math.atan2(dx, dz);
      f.position.set(h.x, moving ? Math.abs(Math.sin(time * 9 + i)) * 0.15 : 0, h.z);
    });
    while (this.figs.length > list.length) this.scene.remove(this.figs.pop()!);
  }
}

/** A name sign floating over a ride. */
export function labelSprite(text: string, color = '#ffffff', bg = 'rgba(0,0,0,0.55)') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = 'bold 48px sans-serif';
  const w = Math.min(500, g.measureText(text).width + 40);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect((512 - w) / 2, 8, w, 80, 24);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50, 480);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(8, 1.5, 1);
  return sp;
}

/** Things that fly or float for a moment: money flying to you, smoke from broken rides. */
export class Puffs {
  private list: { sp: THREE.Sprite; v: THREE.Vector3; life: number; to?: THREE.Object3D; max: number }[] = [];
  private moneyTex: THREE.Texture;
  private smokeTex: THREE.Texture;
  constructor(private scene: THREE.Scene) {
    this.moneyTex = emojiTex('💵');
    this.smokeTex = canvasTexture(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(90,90,90,0.9)');
      gr.addColorStop(1, 'rgba(90,90,90,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }, false);
  }
  money(from: THREE.Vector3, to: THREE.Object3D, n: number) {
    for (let i = 0; i < Math.min(12, n); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.moneyTex, depthTest: false }));
      sp.scale.setScalar(1.2);
      sp.position.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3));
      this.scene.add(sp);
      this.list.push({ sp, v: new THREE.Vector3(0, 4, 0), life: 1.2 + i * 0.05, to, max: 1.2 });
    }
  }
  smoke(at: THREE.Vector3) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false }));
    sp.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
    sp.scale.setScalar(2);
    this.scene.add(sp);
    this.list.push({ sp, v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.2, (Math.random() - 0.5) * 0.6), life: 2.2, max: 2.2 });
  }
  update(dt: number) {
    const tmp = new THREE.Vector3();
    this.list = this.list.filter((p) => {
      p.life -= dt;
      if (p.to) {
        p.to.getWorldPosition(tmp);
        tmp.y -= 0.4;
        const k = Math.min(1, dt * (3 + (p.max - p.life) * 6));
        p.sp.position.lerp(tmp, k);
        if (p.sp.position.distanceTo(tmp) < 0.6) p.life = 0;
      } else {
        p.sp.position.addScaledVector(p.v, dt);
        p.sp.scale.setScalar(2 + (p.max - p.life) * 1.5);
        p.sp.material.opacity = Math.max(0, p.life / p.max);
      }
      if (p.life <= 0) {
        this.scene.remove(p.sp);
        p.sp.material.dispose();
        return false;
      }
      return true;
    });
  }
}

const emojis = new Map<string, THREE.Texture>();
export function emojiTex(e: string) {
  let t = emojis.get(e);
  if (!t) {
    t = canvasTexture(128, (g) => {
      g.font = '100px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(e, 64, 72);
    }, false);
    emojis.set(e, t);
  }
  return t;
}

export const GATE = { x: 0, z: GATE_Z };
