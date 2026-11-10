// Things that happen over time: flashes, sparks, beams, shock rings, and the three ways a planet ends
// (rocks and hot gas, a supernova, a black hole). Each effect is a function called every frame until it
// returns false.
import * as THREE from 'three';
import { puffTex, roundMask, softDot, texture } from './textures';

type Tick = (dt: number, t: number) => boolean | void;

export class Fx {
  private ticks: { fn: Tick; t: number }[] = [];
  /** Camera shake, 0..1, fades by itself. */
  shake = 0;
  constructor(readonly scene: THREE.Scene) {}

  /** Run `fn` every frame (t = seconds since it started) until it returns false. */
  run(fn: Tick) {
    this.ticks.push({ fn, t: 0 });
  }
  /** Run `fn` once after `secs`. */
  after(secs: number, fn: () => void) {
    this.run((_, t) => {
      if (t < secs) return true;
      fn();
      return false;
    });
  }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const list = this.ticks;
    this.ticks = [];
    const keep: typeof list = [];
    for (const k of list) {
      k.t += dt;
      if (k.fn(dt, k.t) !== false) keep.push(k);
    }
    this.ticks = keep.concat(this.ticks); // ones started during this frame go on the end
  }

  /** Remove everything (going back to the planet chooser). */
  clear(keep: Set<THREE.Object3D>) {
    this.ticks = [];
    this.shake = 0;
    for (const o of [...this.scene.children]) {
      if (keep.has(o)) continue;
      this.scene.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    }
  }

  remove(o: THREE.Object3D) {
    this.scene.remove(o);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && !(mat as { keep?: boolean }).keep) mat.dispose();
    });
  }

  glow(color: THREE.ColorRepresentation, opacity = 1, tex = softDot()): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity,
    }));
    this.scene.add(s);
    return s;
  }

  /** A bright flash that grows and fades. */
  flash(at: THREE.Vector3, color: THREE.ColorRepresentation, size: number, secs = 0.5) {
    const s = this.glow(color);
    s.position.copy(at);
    this.run((_, t) => {
      const k = t / secs;
      s.scale.setScalar(size * (0.3 + 0.7 * Math.min(1, k * 4)));
      s.material.opacity = 1 - k;
      if (k >= 1) { this.remove(s); return false; }
    });
  }

  /** Sparks flying out from a point, mostly along `dir`. */
  sparks(at: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation, count = 60, speed = 1.5, size = 0.05, secs = 1) {
    const pos = new Float32Array(count * 3);
    const vel: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      const v = new THREE.Vector3().randomDirection().multiplyScalar(0.7).add(dir).normalize();
      vel.push(v.multiplyScalar(speed * (0.3 + Math.random())));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size, map: softDot(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const p = new THREE.Points(geo, mat);
    this.scene.add(p);
    this.run((dt, t) => {
      const a = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        vel[i].multiplyScalar(Math.exp(-dt * 1.2));
        a.setXYZ(i, a.getX(i) + vel[i].x * dt, a.getY(i) + vel[i].y * dt, a.getZ(i) + vel[i].z * dt);
      }
      a.needsUpdate = true;
      mat.opacity = 1 - t / secs;
      if (t >= secs) { this.remove(p); return false; }
    });
  }

  /** A glowing beam between two points. `to` is read every frame, so it can follow a spinning planet. */
  beam(from: THREE.Vector3, to: () => THREE.Vector3, color: THREE.ColorRepresentation, width: number, secs: number,
    material?: THREE.Material) {
    const group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    geo.translate(0, 0.5, 0);
    geo.rotateX(Math.PI / 2); // along +z, from 0 to 1
    const outer = new THREE.Mesh(geo, material ?? new THREE.MeshBasicMaterial({
      color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7,
    }));
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    core.scale.set(0.35, 0.35, 1);
    group.add(outer, core);
    this.scene.add(group);
    this.run((_, t) => {
      const end = to();
      const grow = Math.min(1, t / 0.08);
      const fade = t > secs - 0.15 ? Math.max(0, (secs - t) / 0.15) : 1;
      const len = from.distanceTo(end) * grow;
      group.position.copy(from);
      group.lookAt(end);
      const w = width * fade * (0.85 + 0.15 * Math.sin(t * 60));
      group.scale.set(w, w, Math.max(0.001, len));
      if (t >= secs) { this.remove(group); return false; }
    });
    return group;
  }

  /** A flat ring of light that spreads out (the shock wave of a big hit). */
  ring(at: THREE.Vector3, normal: THREE.Vector3, color: THREE.ColorRepresentation, size: number, secs: number) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
          float streak = 0.6 + 0.4 * h(vec2(floor(a * 40.0), 1.0));
          float edge = smoothstep(0.55, 0.97, r) * smoothstep(1.0, 0.97, r);
          float inner = smoothstep(0.2, 0.95, r) * 0.25;
          gl_FragColor = vec4(color * (edge * streak + inner * edge) * opacity, 1.0); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 128), mat);
    m.position.copy(at);
    m.lookAt(at.clone().add(normal));
    this.scene.add(m);
    this.run((_, t) => {
      const k = t / secs;
      const e = 1 - Math.pow(1 - Math.min(1, k), 3);
      m.scale.setScalar(0.1 + size * e);
      mat.uniforms.opacity.value = Math.pow(1 - k, 1.5) * 0.8;
      if (k >= 1) { this.remove(m); return false; }
    });
  }

  /** A plume of dust and rock thrown up from a big impact (normal blending, so it can darken things). */
  plume(at: THREE.Vector3, normal: THREE.Vector3, size: number, color: number) {
    const n = Math.round(6 + size * 40);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex(), color, transparent: true, depthWrite: false, opacity: 0,
      }));
      this.scene.add(s);
      const dir = normal.clone().multiplyScalar(1.4).add(new THREE.Vector3().randomDirection()).normalize();
      const speed = size * (1.5 + Math.random() * 3);
      const big = size * (2 + Math.random() * 3);
      const secs = 2.5 + Math.random() * 1.5;
      s.material.rotation = Math.random() * 6;
      this.run((_, t) => {
        const k = t / secs;
        const e = 1 - Math.pow(1 - Math.min(1, k), 3);
        s.position.copy(at).addScaledVector(dir, speed * e);
        s.scale.setScalar(big * (0.3 + e));
        s.material.opacity = (k < 0.08 ? k / 0.08 : 1 - (k - 0.08) / 0.92) * 0.55;
        if (k >= 1) { this.remove(s); return false; }
      });
    }
  }

  /** Puffs of hot gas that spread and stay glowing (they don't go away). */
  gas(at: THREE.Vector3, radius: number, colors: number[], count: number, grow: number, secs: number, stay: number, peak = 0.9, sizeMul = 1) {
    for (let i = 0; i < count; i++) {
      const s = this.glow(colors[i % colors.length], 0, puffTex());
      const dir = new THREE.Vector3().randomDirection();
      const start = at.clone().addScaledVector(dir, Math.random() * radius * 0.8);
      const endR = radius * (0.6 + Math.random() * grow);
      const size = radius * (1.2 + Math.random() * 1.6) * sizeMul;
      s.material.rotation = Math.random() * Math.PI * 2;
      const spin = (Math.random() - 0.5) * 0.3;
      this.run((dt, t) => {
        const k = Math.min(1, t / secs);
        const e = 1 - Math.pow(1 - k, 3);
        s.position.copy(start).addScaledVector(dir, endR * e);
        s.scale.setScalar(size * (0.4 + e * 1.4));
        s.material.rotation += spin * dt;
        s.material.opacity = k < 0.1 ? (k / 0.1) * peak : peak - (peak - stay) * Math.min(1, (k - 0.1) / 0.9);
        return true; // stays until the next planet
      });
    }
  }

  /** A rocky planet breaks into rocks floating in space, with glowing red-hot gas. */
  rocks(center: THREE.Vector3, surface: HTMLCanvasElement, quat: THREE.Quaternion) {
    const N = 240;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const gp = geo.attributes.position;
    const lumps = new Map<string, number>(); // same corner, same push, so the rock has no cracks
    for (let i = 0; i < gp.count; i++) {
      const key = `${gp.getX(i).toFixed(3)},${gp.getY(i).toFixed(3)},${gp.getZ(i).toFixed(3)}`;
      if (!lumps.has(key)) lumps.set(key, 0.7 + Math.random() * 0.45);
      const k = lumps.get(key)!;
      gp.setXYZ(i, gp.getX(i) * k, gp.getY(i) * k, gp.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ emissive: 0xff3300, emissiveIntensity: 1.6, flatShading: true });
    // rock colours: half plain rock, half the colour of a random spot on the planet's surface
    const sctx = surface.getContext('2d')!;
    const rockCols = [0x6b5a4c, 0x4f4640, 0x7d6b5a, 0x3d3530].map((c) => new THREE.Color(c));
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const items: { p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; spin: THREE.Quaternion; s: THREE.Vector3 }[] = [];
    for (let i = 0; i < N; i++) {
      const dir = new THREE.Vector3().randomDirection();
      const big = Math.random() < 0.08;
      const base = big ? 0.16 + Math.random() * 0.14 : 0.03 + Math.random() * 0.09;
      const px = sctx.getImageData(Math.floor(Math.random() * surface.width), Math.floor(Math.random() * surface.height), 1, 1).data;
      const col = rockCols[i % rockCols.length].clone().lerp(new THREE.Color(px[0] / 255, px[1] / 255, px[2] / 255).convertSRGBToLinear(), 0.5);
      inst.setColorAt(i, col);
      items.push({
        p: center.clone().addScaledVector(dir, Math.cbrt(Math.random()) * 0.85),
        v: dir.clone().multiplyScalar((0.3 + Math.random() * 0.9) * (big ? 0.5 : 1)),
        q: new THREE.Quaternion().random().premultiply(quat),
        spin: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().randomDirection(), (Math.random() - 0.5) * 0.05),
        s: new THREE.Vector3(base * (0.7 + Math.random() * 0.6), base * (0.6 + Math.random() * 0.5), base),
      });
    }
    this.scene.add(inst);
    const light = new THREE.PointLight(0xff7733, 8, 0, 1.5);
    light.position.copy(center);
    this.scene.add(light);
    const m = new THREE.Matrix4();
    this.run((dt, t) => {
      for (let i = 0; i < N; i++) {
        const it = items[i];
        const drag = Math.exp(-dt * 0.5);
        it.v.multiplyScalar(drag < 1 && it.v.length() > 0.06 ? drag : 1);
        it.p.addScaledVector(it.v, dt);
        it.q.multiply(it.spin);
        inst.setMatrixAt(i, m.compose(it.p, it.q, it.s));
      }
      inst.instanceMatrix.needsUpdate = true;
      mat.emissiveIntensity = 1.2 * Math.exp(-t * 0.9);
      light.intensity = 0.3 + 8 * Math.exp(-t * 0.6);
      return true;
    });
    this.flash(center, 0xffd27a, 7, 1.2);
    this.flash(center, 0xffffff, 4, 0.5);
    this.ring(center, new THREE.Vector3(0.3, 1, 0.2).normalize(), 0xffc890, 7, 2.5);
    this.gas(center, 1.1, [0x801804, 0xa03008, 0x500a02, 0xb04010], 30, 2.4, 6, 0.035, 0.22);
    this.sparks(center, new THREE.Vector3(), 0xffaa44, 300, 3, 0.07, 2.5);
    this.shake = 1;
  }

  /** A gas giant, ice giant or star blows up like a supernova. */
  supernova(center: THREE.Vector3, kind: string) {
    const palette = kind === 'ice'
      ? [0x4fd8ff, 0x3a6bff, 0xa060ff, 0x7fffe0]
      : kind === 'gas'
        ? [0xff7a30, 0xff3c7a, 0x40c8ff, 0xffc040]
        : [0xffd040, 0xff4a20, 0xff40a0, 0x80a0ff];
    this.flash(center, 0xffffff, 9, 1.4);
    this.flash(center, palette[0], 6, 2.5);
    this.ring(center, new THREE.Vector3(0.2, 1, 0.1).normalize(), 0xbfe6ff, 14, 3.5);
    this.ring(center, new THREE.Vector3(1, 0.3, 0.6).normalize(), palette[1], 11, 4);
    // an expanding glowing shell
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(palette[3]) }, fade: { value: 1 } },
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
        fragmentShader: `uniform vec3 color; uniform float fade; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)), 2.5); gl_FragColor = vec4(color*f*fade, 1.0); }`,
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      }),
    );
    shell.position.copy(center);
    this.scene.add(shell);
    this.run((_, t) => {
      const k = Math.min(1, t / 5);
      shell.scale.setScalar(0.5 + 8 * (1 - Math.pow(1 - k, 2.5)));
      (shell.material as THREE.ShaderMaterial).uniforms.fade.value = 1 - k;
      if (k >= 1) { this.remove(shell); return false; }
    });
    this.gas(center, 1.6, palette, 30, 3.5, 9, 0.03, 0.18, 0.55);
    // the leftover cloud: the real Crab Nebula (photo by the James Webb Space Telescope), growing out from the blast
    const tint = kind === 'ice' ? 0xb0dcff : kind === 'giant' ? 0xffc8a8 : kind === 'star' ? 0xffe8d0 : 0xffffff;
    const nebTex = texture('nebula');
    const layers = [
      { size: 9.5, peak: 0.95, spin: 0.012, rot: 0 },
      { size: 7, peak: 0.35, spin: -0.02, rot: 2.4 },
    ];
    for (const L of layers) {
      const neb = this.glow(tint, 0, nebTex);
      neb.material.alphaMap = roundMask();
      neb.material.rotation = L.rot;
      neb.position.copy(center);
      neb.renderOrder = -1;
      this.run((dt, t) => {
        const k = Math.min(1, t / 10);
        neb.scale.setScalar(0.4 + L.size * (1 - Math.pow(1 - k, 3)));
        neb.material.opacity = L.peak * Math.min(1, Math.max(0, (t - 0.3) / 2.5));
        neb.material.rotation += L.spin * dt;
        return true;
      });
    }
    this.sparks(center, new THREE.Vector3(), 0xffffff, 600, 6, 0.06, 3.5);
    this.sparks(center, new THREE.Vector3(), palette[2], 400, 4, 0.1, 4);
    // what's left in the middle: a tiny, very bright spinning star
    const core = this.glow(0xcfe8ff);
    core.position.copy(center);
    this.run((_, t) => {
      core.scale.setScalar(Math.min(1, t / 2) * (0.5 + 0.12 * Math.sin(t * 9)));
      return true;
    });
    const light = new THREE.PointLight(palette[0], 20, 0, 1.2);
    light.position.copy(center);
    this.scene.add(light);
    this.run((_, t) => { light.intensity = 1 + 20 * Math.exp(-t * 0.7); return true; });
    this.shake = 1;
  }
}
