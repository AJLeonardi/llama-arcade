// The planet (or star) you're smashing: the real picture on a ball, with craters painted onto a copy of the
// picture, holes cut right through (you see glowing magma inside), and a fiery look as gas giants get close
// to blowing up.
import * as THREE from 'three';
import { Body, dirToMap } from '../sim/game';
import { copyCanvas, softDot, texture } from './textures';

export const MAX_HOLES = 16;
export const MAX_WAVES = 6;

const NOISE = /* glsl */ `
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return noise(p) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.15; }
`;

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vObj; varying vec3 vWN; varying vec3 vWP;
void main() {
  vUv = uv; vObj = normalize(position);
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map; uniform sampler2D glowMap;
uniform vec3 lightDir; uniform float lit; uniform float heat; uniform float time; uniform float flash;
uniform vec4 holes[${MAX_HOLES}];
uniform vec4 waves[${MAX_WAVES}]; uniform float waveSize[${MAX_WAVES}];
varying vec2 vUv; varying vec3 vObj; varying vec3 vWN; varying vec3 vWP;
${NOISE}
void main() {
  for (int i = 0; i < ${MAX_HOLES}; i++) { if (dot(vObj, holes[i].xyz) > holes[i].w) discard; }
  if (!gl_FrontFacing) { // the inside, seen through a hole: glowing magma
    float n = fbm(vObj * 5.0 + vec3(0.0, time * 0.3, 0.0));
    gl_FragColor = vec4(mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.65, 0.15), n), 1.0);
    return;
  }
  vec3 c = texture2D(map, vUv).rgb;
  vec3 n = normalize(vWN);
  vec3 v = normalize(cameraPosition - vWP);
  vec3 col;
  if (lit > 0.5) {
    float d = dot(n, lightDir);
    col = c * (0.13 + 1.05 * smoothstep(-0.15, 0.6, d));
  } else { // a star glows by itself, a bit darker at the edge
    float mu = max(dot(n, v), 0.0);
    col = c * (0.55 + 0.75 * pow(mu, 0.5));
  }
  float f = fbm(vObj * 4.0 + vec3(0.0, time * 0.5, time * 0.2));
  vec3 fire = mix(vec3(0.85, 0.1, 0.02), vec3(1.0, 0.75, 0.25), f);
  col = mix(col, fire * (0.65 + 0.6 * f), heat * 0.8);
  col += texture2D(glowMap, vUv).rgb * (0.85 + 0.25 * sin(time * 4.0 + vObj.x * 9.0));
  // shock waves: a hot bright front rolling over the surface, with a dust cloud spreading behind it
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    float age = time - waves[i].w;
    if (age < 0.0 || age > 4.0) continue;
    float sz = waveSize[i];
    float ang = acos(clamp(dot(vObj, waves[i].xyz), -1.0, 1.0));
    float reach = sz * 7.0 * (1.0 - exp(-age * 1.3));
    float width = 0.025 + sz * 0.22;
    float fade = pow(1.0 - age / 4.0, 2.0);
    float wob = fbm(vObj * 18.0) * 0.6 + 0.7;
    float front = exp(-pow((ang - reach) / width, 2.0)) * wob;
    float behind = smoothstep(reach + width * 0.5, reach - width * 2.0, ang);
    float dust = fbm(vObj * 9.0 + waves[i].xyz * 3.0 + age * 0.15);
    col = mix(col, col * 0.45 + vec3(0.16, 0.12, 0.09) * dust, behind * fade * 0.7);
    float hot = exp(-age * 2.5);
    col += mix(vec3(0.9, 0.75, 0.6), vec3(1.0, 0.55, 0.2), hot) * front * fade * (0.5 + hot * 1.5);
    col += vec3(1.0, 0.5, 0.15) * exp(-pow(ang / (sz * 1.2), 2.0)) * hot * 1.5; // the impact flash on the ground
  }
  col = mix(col, vec3(1.0, 0.95, 0.85), flash);
  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D map; uniform vec3 lightDir; uniform float amount;
uniform vec4 holes[${MAX_HOLES}];
varying vec2 vUv; varying vec3 vObj; varying vec3 vWN; varying vec3 vWP;
void main() {
  for (int i = 0; i < ${MAX_HOLES}; i++) { if (dot(vObj, holes[i].xyz) > holes[i].w - 0.01) discard; }
  float a = texture2D(map, vUv).r * amount;
  float d = dot(normalize(vWN), lightDir);
  gl_FragColor = vec4(vec3(1.0) * (0.1 + smoothstep(-0.15, 0.6, d)), a);
}`;

const HALO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const HALO_FRAG = /* glsl */ `
uniform vec3 color; uniform float edge; uniform float strength;
varying vec3 vN; varying vec3 vV;
void main() {
  float x = dot(-vN, vV);
  float a = pow(clamp(x / edge, 0.0, 1.0), 2.5) * strength;
  gl_FragColor = vec4(color * a, 1.0);
}`;

export type CraterStyle = 'rock' | 'gas' | 'star' | 'alien';

export class Planet {
  readonly root = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly colorCanvas: HTMLCanvasElement;
  readonly colorTex: THREE.CanvasTexture;
  private glowCanvas: HTMLCanvasElement;
  private glowTex: THREE.CanvasTexture;
  private cloudCanvas: HTMLCanvasElement | null = null;
  private cloudTex: THREE.CanvasTexture | null = null;
  readonly clouds: THREE.Mesh | null = null;
  readonly rings: THREE.Mesh | null = null;
  readonly extras: THREE.Object3D[] = [];
  readonly uniforms: Record<string, THREE.IUniform>;
  private holes: THREE.Vector4[];
  private waves: THREE.Vector4[];
  private waveSizes: number[];
  private waveCount = 0;
  private holeCount = 0;
  readonly style: CraterStyle;

  constructor(readonly body: Body, lightDir: THREE.Vector3) {
    const star = body.kind === 'star' || body.kind === 'giant';
    this.style = star ? 'star' : body.kind === 'rocky' ? 'rock' : 'gas';
    this.colorCanvas = copyCanvas(body.tex);
    this.colorTex = new THREE.CanvasTexture(this.colorCanvas);
    this.colorTex.anisotropy = 4;
    this.glowCanvas = document.createElement('canvas');
    this.glowCanvas.width = 512;
    this.glowCanvas.height = 256;
    const g = this.glowCanvas.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 256);
    this.glowTex = new THREE.CanvasTexture(this.glowCanvas);
    this.holes = Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 1, 2));
    this.waves = Array.from({ length: MAX_WAVES }, () => new THREE.Vector4(0, 0, 1, -100));
    this.waveSizes = Array.from({ length: MAX_WAVES }, () => 0.1);
    this.uniforms = {
      waves: { value: this.waves },
      waveSize: { value: this.waveSizes },
      map: { value: this.colorTex },
      glowMap: { value: this.glowTex },
      lightDir: { value: lightDir },
      lit: { value: star ? 0 : 1 },
      heat: { value: 0 },
      time: { value: 0 },
      flash: { value: 0 },
      holes: { value: this.holes },
    };
    const geo = new THREE.SphereGeometry(1, 96, 64);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide }),
    );
    this.root.add(this.mesh);

    if (body.clouds) {
      this.cloudCanvas = copyCanvas('earth_clouds');
      this.cloudTex = new THREE.CanvasTexture(this.cloudCanvas);
      this.clouds = new THREE.Mesh(
        new THREE.SphereGeometry(1.012, 72, 48),
        new THREE.ShaderMaterial({
          uniforms: { map: { value: this.cloudTex }, lightDir: { value: lightDir }, amount: { value: 0.9 }, holes: { value: this.holes } },
          vertexShader: VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
        }),
      );
      this.root.add(this.clouds);
    }

    if (body.air !== undefined) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 48, 32),
        new THREE.ShaderMaterial({
          uniforms: { color: { value: new THREE.Color(body.air) }, edge: { value: 0.42 }, strength: { value: 0.9 } },
          vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, side: THREE.BackSide, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      this.root.add(halo);
      this.extras.push(halo);
    }

    if (star) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softDot(), color: body.kind === 'giant' ? 0xff5522 : 0xffaa33, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, opacity: 0.9,
      }));
      glow.scale.setScalar(4.2);
      glow.renderOrder = -1;
      this.root.add(glow);
      this.extras.push(glow);
    }

    if (body.rings) {
      const inner = 1.24, outer = 2.27;
      const rg = new THREE.RingGeometry(inner, outer, 128, 1);
      const pos = rg.attributes.position, uv = rg.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, (r - inner) / (outer - inner), 0.5);
      }
      const ringTex = texture('saturn_ring');
      this.rings = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
        map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: 0xdddddd,
      }));
      this.rings.rotation.x = -Math.PI / 2;
      this.root.add(this.rings);
    }

    // Tilt like the real ones, so Saturn's rings and Uranus's sideways spin show.
    const tilt: Record<string, number> = { earth: 0.41, mars: 0.44, 'mars-green': 0.44, saturn: 0.47, uranus: 1.7, neptune: 0.49, jupiter: 0.05 };
    this.root.rotation.set(0.25 + (tilt[body.id] ?? 0.1) * 0.6, -0.6, (tilt[body.id] ?? 0.1) * 0.5);
    if (body.id === 'saturn') this.root.rotation.set(0.42, 0, 0.12);
  }

  setTime(t: number) {
    this.uniforms.time.value = t;
  }
  setHeat(h: number) {
    this.uniforms.heat.value = h;
  }

  /** Paint a crater (burnt, with glowing lava) where the direction `d` (in the planet's own space) points. */
  crater(d: THREE.Vector3, size: number, style: CraterStyle = this.style) {
    const { u, v } = dirToMap(d.x, d.y, d.z);
    const sinT = Math.max(Math.sin(v * Math.PI), 0.12);
    paintBlob(this.colorCanvas, u, v, size, sinT, (ctx) => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.6);
      if (style === 'rock' || style === 'alien') {
        g.addColorStop(0, 'rgba(18,8,4,1)');
        g.addColorStop(0.4, 'rgba(40,20,10,0.95)');
        g.addColorStop(0.55, 'rgba(95,65,45,0.9)');
        g.addColorStop(0.65, 'rgba(30,18,10,0.6)');
        g.addColorStop(1, 'rgba(20,12,8,0)');
      } else if (style === 'gas') {
        g.addColorStop(0, 'rgba(60,8,0,1)');
        g.addColorStop(0.45, 'rgba(150,40,10,0.9)');
        g.addColorStop(0.7, 'rgba(90,30,10,0.4)');
        g.addColorStop(1, 'rgba(60,20,10,0)');
      } else {
        g.addColorStop(0, 'rgba(70,15,0,1)');
        g.addColorStop(0.45, 'rgba(130,40,0,0.9)');
        g.addColorStop(0.6, 'rgba(255,240,170,0.9)');
        g.addColorStop(1, 'rgba(255,200,100,0)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      // splashes of rock thrown out around it
      if (style === 'rock' || style === 'alien') {
        ctx.fillStyle = 'rgba(30,18,12,0.5)';
        for (let i = 0; i < 9; i++) {
          const a = Math.random() * Math.PI * 2, r = 1.1 + Math.random() * 0.9;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.08 + Math.random() * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    this.colorTex.needsUpdate = true;

    const lava = style === 'alien' ? [80, 255, 120] : style === 'star' ? [255, 230, 140] : [255, 110, 20];
    paintBlob(this.glowCanvas, u, v, size, sinT, (ctx) => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.7);
      g.addColorStop(0, `rgba(${lava[0]},${lava[1]},${lava[2]},0.95)`);
      g.addColorStop(0.6, `rgba(${lava[0]},${lava[1] * 0.5},${lava[2] * 0.3},0.5)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 0.7, 0, Math.PI * 2);
      ctx.fill();
    });
    this.glowTex.needsUpdate = true;

    if (this.cloudCanvas && this.cloudTex) {
      paintBlob(this.cloudCanvas, u, v, size * 1.6, sinT, (ctx) => {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
      });
      this.cloudTex.needsUpdate = true;
    }
  }

  /** Start a shock wave spreading over the surface from `d`. */
  shockwave(d: THREE.Vector3, size: number) {
    const i = this.waveCount++ % MAX_WAVES;
    const n = d.clone().normalize();
    this.waves[i].set(n.x, n.y, n.z, this.uniforms.time.value as number);
    this.waveSizes[i] = size;
  }

  /** Cut a round hole through the surface (both ends of a railgun shot). Old holes are reused when full. */
  hole(d: THREE.Vector3, size: number) {
    const h = this.holes[this.holeCount % MAX_HOLES];
    const n = d.clone().normalize();
    h.set(n.x, n.y, n.z, Math.cos(size));
    this.holeCount++;
  }

  /** Hide the planet (it blew up). */
  hide() {
    this.root.visible = false;
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
    this.colorTex.dispose();
    this.glowTex.dispose();
    this.cloudTex?.dispose();
  }
}

/** Draw something round at (u, v) on an equirectangular picture, stretched sideways near the poles and
 * wrapped around the left/right edge. `draw` paints in a space where the crater is radius 1. */
function paintBlob(canvas: HTMLCanvasElement, u: number, v: number, size: number, sinT: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  const ry = (size / Math.PI) * H;
  const rx = Math.min(W / 2, ((size / (Math.PI * 2)) * W) / sinT);
  for (const ox of [-W, 0, W]) {
    const cx = u * W + ox;
    if (cx + rx * 2 < 0 || cx - rx * 2 > W) continue;
    ctx.save();
    ctx.translate(cx, v * H);
    ctx.scale(rx, ry);
    draw(ctx);
    ctx.restore();
  }
}
