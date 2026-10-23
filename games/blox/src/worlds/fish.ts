// Fish Tank to the Ocean: you're a fish rolling along in a bowl, from the pet store to the Pacific.
// The rules and physics are in sim/fish.ts and the seven levels in sim/fishLevels.ts; this file draws the bowl,
// the fish, the ramps, goo and sparks, runs the air bar and the clock, and shows the menus.
import * as THREE from 'three';
import { gameStorage } from '../../../../shared/storage';
import { AIR, FISHES, FishSim, HAZARD_TAGS, VESSELS, type FishDef, type FishEvent, type FishLevel, type Ramp, type Vessel } from '../sim/fish';
import { FISH_BY_ID, FISH_LEVELS } from '../sim/fishLevels';
import type { Surface, V3 } from '../sim/types';
import type { Rig } from '../view/avatar';
import { gooTex, surfaceTex, waveTex } from '../view/textures';
import { sfx } from '../ui/sfx';
import type { Action, Activity, DriveInput, WorldCtx } from './activity';
import { randomRider } from './npc';

interface FishSave {
  fish: string;
  /** Levels finished at least once. */
  done: string[];
}

/** Set when we move to another fish level ourselves, so the menu doesn't pop up again on arrival. */
let arriving = false;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** A little picture of the fish in its real colours, for the menu (emoji fish are the wrong colours). */
function fishIcon(d: FishDef) {
  const puffer = d.id === 'puffer', shark = d.id === 'shark';
  const body = puffer ? '<circle cx="26" cy="24" r="14"/>' : `<ellipse cx="26" cy="24" rx="${shark ? 18 : 15}" ry="${shark ? 8 : 10}"/>`;
  let marks = '';
  if (d.id === 'clown') marks = `<rect x="18" y="12" width="4" height="24" fill="${d.stripe}" stroke="${d.fin}" stroke-width="1"/><rect x="29" y="13" width="4" height="22" fill="${d.stripe}" stroke="${d.fin}" stroke-width="1"/>`;
  else if (d.id === 'bass') marks = `<rect x="12" y="22" width="28" height="4" fill="${d.stripe}"/>`;
  else if (d.id === 'tang') marks = `<ellipse cx="25" cy="22" rx="9" ry="4" fill="${d.stripe}"/>`;
  else if (d.id === 'shark') marks = `<ellipse cx="27" cy="28" rx="14" ry="3.5" fill="${d.stripe}"/><path d="M22 17 L28 6 L31 17 Z" fill="${d.fin}"/>`;
  else if (puffer) marks = [[26, 8], [26, 40], [12, 24], [10, 14], [12, 34], [38, 12], [38, 36]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${d.stripe}"/>`).join('');
  else marks = `<path d="M24 14 L30 8 L34 15 Z" fill="${d.fin}"/>`;
  const tailX = puffer ? 10 : shark ? 8 : 11;
  const div = el('div', 'icon');
  div.innerHTML = `<svg viewBox="0 0 56 48" width="56" height="48">
    <path d="M${tailX + 2} 24 L${tailX - 9} 13 L${tailX - 9} 35 Z" fill="${d.fin}"/>
    <g fill="${d.body}">${body}</g>${marks}
    <circle cx="${puffer ? 34 : 35}" cy="21" r="3" fill="#fff"/><circle cx="${puffer ? 35 : 36}" cy="21" r="1.6" fill="#111"/>
  </svg>`;
  return div;
}

const label = (f: FishLevel) => (f.house ? 'Pet Store & Home' : f.level.name);

export class FishWorld implements Activity {
  private f: FishLevel;
  private sim: FishSim;
  private store = gameStorage('blox');
  private data: FishSave;
  private group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  /** The player: the vessel (rolls) and the fish (stays upright). */
  private shell = new THREE.Group();
  private fishMesh!: THREE.Group;
  private shellVessel: Vessel | null | undefined = undefined;
  private rollAngle = 0;
  private travelYaw = 0;
  private prev: V3;
  private waterMeshes: THREE.Group[] = [];
  private leftMeshes: THREE.Group[] = [];
  private hazards: { mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; tag: string }[] = [];
  private exits: THREE.Mesh[] = [];
  /** Textures that flow along (goo, the sea). */
  private scrolling: { tex: THREE.Texture; speed: number }[] = [];
  /** Fish swimming in the aquariums, and bubbles rising in them. */
  private tankFish: { mesh: THREE.Group; x: number; z: number; y: number; along: 'x' | 'z'; reach: number; speed: number; phase: number }[] = [];
  private bubbles: { mesh: THREE.Mesh; x: number; z: number; y0: number; h: number; phase: number }[] = [];
  /** The parts of the player that don't roll: the water inside and the shine on the glass. */
  private still = new THREE.Group();
  private shine = new THREE.Group();
  private sphereGeo: THREE.SphereGeometry | null = null;
  private meter = el('div', 'pill fish-meter hidden');
  private meterKey = '';
  private menuOpen = false;
  /** Redraws the open menu or card (the pause screen replaces it, so it's shown again after). */
  private reshow: (() => void) | null = null;
  private runCoins = 0;
  private rig: Rig | null = null;
  private people: Rig[] = [];
  private tipTimer = 0;

  constructor(private ctx: WorldCtx, id: string) {
    this.f = FISH_BY_ID[id];
    this.sim = new FishSim(this.f);
    this.prev = [...this.sim.pos];
    const saved = this.store.load<FishSave>('fish');
    this.data = { fish: FISHES.some((f) => f.id === saved?.fish) ? saved!.fish : FISHES[0].id, done: Array.isArray(saved?.done) ? saved!.done : [] };
    ctx.scene.add(this.group);
    ctx.ui.root.append(this.meter);
    this.buildRamps(this.f.ramps);
    this.buildZones();
    this.buildWaters();
    this.buildExtras();
    this.buildTanks();
    this.group.add(this.shell, this.still, this.shine);
    this.still.add(this.bowlWater(VESSELS.bowl.r));
    // A curved streak of light on the glass, kept facing the camera (top left).
    const streak = new THREE.Mesh(this.geo(new THREE.SphereGeometry(1.01, 16, 6, 0.5, 0.55, 0.5, 0.45)), this.mat('#ffffff', { transparent: true, opacity: 0.5, depthWrite: false }));
    const dot = new THREE.Mesh(this.geo(new THREE.SphereGeometry(1.01, 8, 4, 1.25, 0.18, 0.95, 0.15)), this.mat('#ffffff', { transparent: true, opacity: 0.4, depthWrite: false }));
    this.shine.add(streak, dot);
    this.rebuildFish();
    (window as unknown as { __fish: unknown }).__fish = this; // for poking from the console while testing
    // The menu opens just after arriving (arriving closes any open screen).
    if (id === 'fish' && !arriving) {
      this.menuOpen = true;
      setTimeout(() => this.openMenu(), 0);
    }
    else this.tipTimer = window.setTimeout(() => this.ctx.ui.toast(this.f.tip, 3200), 2300);
    arriving = false;
  }

  private def(): FishDef {
    return FISHES.find((f) => f.id === this.data.fish) ?? FISHES[0];
  }

  private save() {
    this.store.save('fish', this.data);
  }

  // ---------------------------------------------------------------- materials and meshes

  private mat(color: string, more: THREE.MeshLambertMaterialParameters = {}) {
    const m = new THREE.MeshLambertMaterial({ color, ...more });
    this.disposables.push(m);
    return m;
  }

  private geo<G extends THREE.BufferGeometry>(g: G): G {
    this.disposables.push(g);
    return g;
  }

  private part(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
    const mesh = new THREE.Mesh(this.geo(new THREE.BoxGeometry(w, h, d)), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** Slopes: a plank with a sloping top (and bottom), merged into one mesh per surface. */
  private buildRamps(ramps: Ramp[]) {
    const bySurface = new Map<string, Ramp[]>();
    for (const r of ramps) {
      const k = r.surface ?? '';
      bySurface.set(k, [...(bySurface.get(k) ?? []), r]);
    }
    for (const [surface, list] of bySurface) {
      const pos: number[] = [], col: number[] = [], uv: number[] = [];
      const c = new THREE.Color();
      for (const r of list) {
        c.set(r.color);
        const T = Math.min(r.w, r.d) < 2 ? 0.3 : 0.6;
        const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2;
        // Height of the top at each corner.
        const h = (x: number, z: number) => (r.along === 'z' ? (z === z0 ? r.y0 : r.y1) : x === x0 ? r.y0 : r.y1);
        const corner = (x: number, z: number, top: boolean): V3 => [x, h(x, z) - (top ? 0 : T), z];
        // UVs in world units like the blocks: (x, z) on top and bottom, along the side and up on the sides.
        const quad = (a: V3, b: V3, cc: V3, d: V3, shade: number, face: 'flat' | 'x' | 'z') => {
          for (const p of [a, b, cc, a, cc, d]) {
            pos.push(...p);
            col.push(c.r * shade, c.g * shade, c.b * shade);
            uv.push(...(face === 'flat' ? [p[0], -p[2]] : face === 'x' ? [p[2], p[1]] : [p[0], p[1]]));
          }
        };
        const t = (x: number, z: number) => corner(x, z, true), u = (x: number, z: number) => corner(x, z, false);
        quad(t(x0, z0), t(x0, z1), t(x1, z1), t(x1, z0), 1, 'flat');
        quad(u(x0, z0), u(x1, z0), u(x1, z1), u(x0, z1), 0.6, 'flat');
        quad(u(x0, z0), u(x0, z1), t(x0, z1), t(x0, z0), 0.8, 'x');
        quad(u(x1, z0), t(x1, z0), t(x1, z1), u(x1, z1), 0.8, 'x');
        quad(u(x0, z0), t(x0, z0), t(x1, z0), u(x1, z0), 0.7, 'z');
        quad(u(x0, z1), u(x1, z1), t(x1, z1), t(x0, z1), 0.7, 'z');
      }
      const g = this.geo(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      const map = surface ? surfaceTex(surface as Surface) : undefined;
      const mesh = new THREE.Mesh(g, this.mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide, map }));
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  /** Goo, hot pipes and sparks glow; small ways out get a swirly blue glow. */
  private buildZones() {
    for (const b of this.f.level.blocks) {
      if (b.kind !== 'zone' || !b.tag) continue;
      if (HAZARD_TAGS.has(b.tag) && b.tag !== 'drop') {
        const goo = b.tag === 'goo';
        // Bubbly blobs, one repeat every 2 units, slowly flowing.
        const map = gooTex().clone();
        map.needsUpdate = true;
        map.repeat.set(Math.max(1, b.w / 2), Math.max(1, b.d / 2));
        this.disposables.push(map);
        this.scrolling.push({ tex: map, speed: goo ? 0.12 : 0.6 });
        const mat = this.mat(goo ? '#5fd35f' : '#ff6b3d', { map, emissive: goo ? '#1f6b2a' : '#c92a2a', transparent: true, opacity: goo ? 0.94 : 0.9 });
        const mesh = new THREE.Mesh(this.geo(new THREE.BoxGeometry(b.w, b.h, b.d)), mat);
        mesh.position.set(b.x, b.y, b.z);
        this.group.add(mesh);
        this.hazards.push({ mesh, mat, tag: b.tag });
      } else if (b.tag === 'exit' && b.w < 12) {
        const mat = this.mat('#66d9e8', { emissive: '#1098ad', transparent: true, opacity: 0.45, depthWrite: false });
        const mesh = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(Math.min(b.w, b.d) / 2, Math.min(b.w, b.d) / 2, b.h, 20)), mat);
        mesh.position.set(b.x, b.y, b.z);
        this.group.add(mesh);
        this.exits.push(mesh);
      }
    }
  }

  private buildWaters() {
    for (const w of this.f.waters) {
      const g = this.vesselModel(w.vessel, true, true);
      g.position.set(...w.at);
      this.group.add(g);
      this.waterMeshes.push(g);
    }
  }

  /** The buyer in the pet store (and more bowls for sale), and the sea in the last level. */
  private buildExtras() {
    if (this.f.house) {
      for (const x of [-1.3, 1.3]) {
        const bowl = this.vesselModel('bowl', true, true);
        bowl.position.set(x, 2.6, -3.9);
        this.group.add(bowl);
      }
      const r = randomRider();
      r.root.position.set(4, 0, 30.5);
      r.root.rotation.y = Math.PI;
      this.group.add(r.root);
      this.people.push(r);
    }
    if (this.f.level.id === 'fish7') {
      const map = waveTex().clone();
      map.needsUpdate = true;
      map.repeat.set(60, 60);
      this.disposables.push(map);
      this.scrolling.push({ tex: map, speed: 0.01 });
      const sea = new THREE.Mesh(
        this.geo(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2)),
        new THREE.MeshPhongMaterial({ color: '#1c7ed6', map, shininess: 80, specular: 0x88bbff }),
      );
      this.disposables.push(sea.material as THREE.Material);
      sea.position.y = -11.8;
      sea.receiveShadow = true;
      this.group.add(sea);
    }
  }

  /** Inside every aquarium (solid blocks with the 'tank' surface): gravel, weed, bubbles and a few fish. */
  private buildTanks() {
    const gravel = this.mat('#d9a066', { map: surfaceTex('sand') });
    const weed = [this.mat('#2f9e44'), this.mat('#66a80f')];
    const bubble = this.mat('#ffffff', { transparent: true, opacity: 0.7, emissive: '#5c7cfa', emissiveIntensity: 0.3 });
    const bubbleGeo = this.geo(new THREE.SphereGeometry(0.06, 8, 6));
    let n = 0;
    for (const b of this.f.level.blocks) {
      if (b.surface !== 'tank' || b.deco || Math.min(b.w, b.d) < 1 || b.h < 1.5) continue;
      const bottom = b.y - b.h / 2, along = b.d >= b.w ? 'z' : 'x';
      const long = Math.max(b.w, b.d), short = Math.min(b.w, b.d);
      const g = this.part(this.group, b.w - 0.1, 0.3, b.d - 0.1, b.x, bottom + 0.15, b.z, gravel);
      g.castShadow = false;
      // Weed: tall leaves at a few spots along the back.
      for (let i = 0; i < Math.round(long / 2); i++) {
        const a = -long / 2 + 0.8 + (i * (long - 1.6)) / Math.max(1, Math.round(long / 2) - 1);
        const across = ((i % 2) - 0.5) * short * 0.4;
        for (let k = 0; k < 3; k++) {
          const hgt = b.h * (0.35 + ((i + k) % 3) * 0.12);
          const leaf = this.part(this.group, 0.08, hgt, 0.08, 0, bottom + 0.3 + hgt / 2, 0, weed[(i + k) % 2]);
          leaf.position.x = b.x + (along === 'x' ? a : across) + (k - 1) * 0.12;
          leaf.position.z = b.z + (along === 'z' ? a : across) + (k - 1) * 0.07;
          leaf.rotation.z = (k - 1) * 0.15;
          leaf.castShadow = false;
        }
      }
      // A few fish of different kinds.
      for (let i = 0; i < Math.max(2, Math.round(long / 3)); i++, n++) {
        const mesh = this.fishModel(FISHES[n % FISHES.length]);
        mesh.scale.setScalar(Math.min(1.1, short * 0.6));
        this.group.add(mesh);
        this.tankFish.push({
          mesh, x: b.x + (along === 'x' ? 0 : ((i % 3) - 1) * short * 0.2), z: b.z + (along === 'z' ? 0 : ((i % 3) - 1) * short * 0.2),
          y: bottom + 0.8 + ((i * 0.37) % 1) * (b.h - 1.3), along, reach: long / 2 - 0.6, speed: 0.35 + ((n * 0.13) % 0.3), phase: n * 1.9,
        });
      }
      // A stream of bubbles from one end.
      const bx = b.x + (along === 'x' ? -long / 2 + 0.4 : 0), bz = b.z + (along === 'z' ? -long / 2 + 0.4 : 0);
      for (let i = 0; i < 6; i++) {
        const mesh = new THREE.Mesh(bubbleGeo, bubble);
        this.group.add(mesh);
        this.bubbles.push({ mesh, x: bx, z: bz, y0: bottom + 0.3, h: b.h - 0.4, phase: i / 6 });
      }
    }
  }

  /** See-through glass: nearly clear face-on, brighter towards the edges (like real glass), so the shape reads. */
  private glassMat(tint: string) {
    const m = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(tint) } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 tint; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          gl_FragColor = vec4(mix(tint, vec3(1.0), f * 0.7), 0.06 + f * 0.75);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.disposables.push(m);
    return m;
  }

  /** The water in a bowl: the bottom of a sphere with a flat top, which stays level while the bowl rolls. */
  private bowlWater(r: number) {
    const g = new THREE.Group();
    const cut = 1.0; // where the water's surface is, as an angle down from the top
    g.add(new THREE.Mesh(this.geo(new THREE.SphereGeometry(r * 0.94, 24, 12, 0, Math.PI * 2, cut, Math.PI - cut)), this.mat('#339af0', { transparent: true, opacity: 0.3, depthWrite: false })));
    const top = new THREE.Mesh(this.geo(new THREE.CircleGeometry(r * 0.94 * Math.sin(cut), 24).rotateX(-Math.PI / 2)), this.mat('#a5d8ff', { transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    top.position.y = r * 0.94 * Math.cos(cut);
    g.add(top);
    return g;
  }

  /** A fish bowl, water bottle or bucket. Standing up (to jump into), or lying down to roll (along x). */
  private vesselModel(v: Vessel, full: boolean, standing: boolean) {
    const g = new THREE.Group();
    const r = VESSELS[v].r;
    const glass = this.glassMat('#d0ebff');
    const water = this.mat('#339af0', { transparent: true, opacity: 0.3, depthWrite: false });
    if (v === 'bowl') {
      g.add(new THREE.Mesh(this.geo(new THREE.SphereGeometry(r, 32, 20)), glass));
      if (full) g.add(this.bowlWater(r));
      const rim = new THREE.Mesh(this.geo(new THREE.TorusGeometry(r * 0.55, 0.05, 8, 28).rotateX(Math.PI / 2)), this.glassMat('#a5d8ff'));
      rim.position.y = r * 0.84;
      g.add(rim);
      // Coloured gravel in the bottom, so you can see it roll.
      const cols = ['#ff922b', '#cc5de8', '#51cf66', '#339af0', '#fcc419'];
      const pebble = this.geo(new THREE.IcosahedronGeometry(0.07, 0));
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4, d = 0.12 + ((i * 0.37) % 1) * 0.3;
        const m = new THREE.Mesh(pebble, this.mat(cols[i % cols.length]));
        m.position.set(Math.cos(a) * d * r, -r * 0.82 + d * d * r * 0.9, Math.sin(a) * d * r);
        m.rotation.set(i, i * 2, 0);
        g.add(m);
      }
      if (!standing) return g;
      const wrap = new THREE.Group();
      g.position.y = r;
      wrap.add(g);
      return wrap;
    }
    // Bottles and buckets are cylinders: upright when standing, along x when rolling.
    const bottle = v === 'bottle';
    const rad = bottle ? r * 0.8 : r, len = bottle ? r * 2.6 : r * 1.5;
    const body = new THREE.Group();
    const shellMat = bottle ? glass : this.mat('#fab005', { transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    body.add(new THREE.Mesh(this.geo(new THREE.CylinderGeometry(rad, bottle ? rad : rad * 0.85, len, 24, 1, !bottle)), shellMat));
    if (full) body.add(new THREE.Mesh(this.geo(new THREE.CylinderGeometry(rad * 0.9, rad * 0.9 * (bottle ? 1 : 0.85), len * 0.85, 20)), water));
    if (bottle) {
      // Shoulders, a blue cap, and a label round the middle.
      const neck = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(rad * 0.45, rad, len * 0.14, 24, 1, true)), glass);
      neck.position.y = len / 2 + len * 0.07;
      body.add(neck);
      const cap = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(rad * 0.42, rad * 0.42, len * 0.1, 16)), new THREE.MeshPhongMaterial({ color: '#1c7ed6', shininess: 60 }));
      this.disposables.push(cap.material as THREE.Material);
      cap.position.y = len / 2 + len * 0.18;
      body.add(cap);
      const label = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(rad * 1.01, rad * 1.01, len * 0.3, 24, 1, true)), this.mat('#e7f5ff', { side: THREE.DoubleSide }));
      body.add(label);
      const stripe = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(rad * 1.02, rad * 1.02, len * 0.08, 24, 1, true)), this.mat('#228be6', { side: THREE.DoubleSide }));
      body.add(stripe);
    } else {
      const handle = new THREE.Mesh(this.geo(new THREE.TorusGeometry(rad * 0.95, 0.04, 6, 20, Math.PI)), new THREE.MeshPhongMaterial({ color: '#adb5bd', shininess: 80 }));
      this.disposables.push(handle.material as THREE.Material);
      handle.position.y = len / 2;
      body.add(handle);
      const lip = new THREE.Mesh(this.geo(new THREE.TorusGeometry(rad, 0.05, 6, 24).rotateX(Math.PI / 2)), this.mat('#f08c00'));
      lip.position.y = len / 2;
      body.add(lip);
    }
    if (standing) {
      body.position.y = len / 2;
    } else {
      body.rotation.z = Math.PI / 2;
    }
    g.add(body);
    return g;
  }

  /** One material per colour for the fish, with a little glow so the colours still show through glass and water. */
  private fishMats = new Map<string, THREE.Material>();
  private fishMat(c: string) {
    let m = this.fishMats.get(c);
    if (!m) {
      m = new THREE.MeshPhongMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.35), shininess: 60, specular: 0x444444, side: THREE.DoubleSide });
      this.disposables.push(m);
      this.fishMats.set(c, m);
    }
    return m;
  }

  /** A rounded fish, facing +z: an egg-shaped body with its markings, a tail that swishes, fins and big eyes. */
  private fishModel(d: FishDef) {
    const g = new THREE.Group();
    const ball = this.sphereGeo ??= this.geo(new THREE.SphereGeometry(1, 20, 14));
    const blob = (rx: number, ry: number, rz: number, x: number, y: number, z: number, c: string) => {
      const m = new THREE.Mesh(ball, this.fishMat(c));
      m.scale.set(rx, ry, rz);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const fin = (pts: [number, number][], c: string) => {
      const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
      const m = new THREE.Mesh(this.geo(new THREE.ShapeGeometry(shape).rotateY(-Math.PI / 2)), this.fishMat(c)); // points are (z, y)
      g.add(m);
      return m;
    };
    const puffer = d.id === 'puffer', shark = d.id === 'shark';
    // Half-sizes across (x), up (y) and along (z).
    const [w, h, l] = puffer ? [0.22, 0.22, 0.24] : d.id === 'bass' ? [0.12, 0.16, 0.32] : shark ? [0.12, 0.13, 0.34] : [0.11, 0.16, 0.26];
    blob(w, h, l, 0, 0, 0, d.body);
    // Markings: slices of a slightly bigger egg, so they wrap round the body.
    const band = (z: number, width: number) => {
      const k = Math.sqrt(Math.max(0, 1 - (z / l) ** 2));
      blob(w * k * 1.04, h * k * 1.04, width, 0, 0, z, d.stripe);
      blob(w * k * 1.05, h * k * 1.05, width * 0.35, 0, 0, z - width, d.fin); // the dark edge
    };
    if (d.id === 'clown') {
      band(l * 0.35, 0.04);
      band(-l * 0.25, 0.045);
    } else if (d.id === 'bass') blob(w * 1.03, h * 0.18, l * 0.85, 0, 0, 0, d.stripe);
    else if (d.id === 'tang') blob(w * 1.03, h * 0.45, l * 0.5, 0, h * 0.15, -l * 0.05, d.stripe);
    else if (shark) blob(w * 1.02, h * 0.55, l * 0.9, 0, -h * 0.45, 0.02, d.stripe);
    else if (d.id === 'gold') blob(w * 1.02, h * 0.6, l * 0.7, 0, -h * 0.35, l * 0.1, d.stripe);
    if (puffer) {
      const spike = this.geo(new THREE.ConeGeometry(0.025, 0.08, 5));
      for (let i = 0; i < 18; i++) {
        const t = Math.acos(1 - (2 * (i + 0.5)) / 18), p = i * 2.4;
        const dir = new THREE.Vector3(Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p));
        if (dir.z > 0.75) continue; // not on its face
        const m = new THREE.Mesh(spike, this.fishMat(d.stripe));
        m.position.copy(dir).multiplyScalar(0.22);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        g.add(m);
      }
    }
    // The tail (it swishes from its root), the top fin and the little side fins.
    const tail = new THREE.Group();
    tail.name = 'tail';
    tail.position.z = -l * 0.9;
    g.add(tail);
    const tl = shark ? 0.2 : 0.16, th = shark ? 0.16 : 0.13;
    const tailFin = fin(shark ? [[0, 0], [-tl, th], [-tl * 0.6, 0], [-tl * 0.8, -th * 0.6]] : [[0, 0], [-tl, th], [-tl * 0.75, 0], [-tl, -th]], d.fin);
    tailFin.removeFromParent();
    tail.add(tailFin);
    if (shark) fin([[l * 0.3, h * 0.8], [-l * 0.1, h * 2.1], [-l * 0.35, h * 0.8]], d.fin);
    else fin([[l * 0.4, h * 0.8], [l * 0.1, h * 1.45], [-l * 0.5, h * 1.25], [-l * 0.6, h * 0.6]], d.fin);
    for (const s of [-1, 1]) {
      const side = blob(0.012, h * 0.35, l * 0.25, s * w * 0.95, -h * 0.35, l * 0.05, d.fin);
      side.rotation.y = s * 0.5;
      // Eyes: white, then a black pupil with a glint.
      blob(w * 0.35, 0.055, 0.055, s * w * 0.78, h * 0.25, l * 0.6, '#ffffff');
      blob(0.02, 0.033, 0.033, s * (w * 0.78 + w * 0.3), h * 0.26, l * 0.63, '#111111');
      blob(0.008, 0.011, 0.011, s * (w * 0.78 + w * 0.34), h * 0.31, l * 0.66, '#ffffff');
    }
    g.traverse((o) => (o.castShadow = true));
    return g;
  }

  private rebuildFish() {
    if (this.fishMesh) this.fishMesh.removeFromParent();
    this.fishMesh = this.fishModel(this.def());
    this.group.add(this.fishMesh);
  }

  /** Rebuild the rolling part when you change what you're in. */
  private syncShell() {
    const v = this.sim.vessel;
    if (v === this.shellVessel) return;
    this.shellVessel = v;
    this.shell.clear();
    if (v) this.shell.add(this.vesselModel(v, v !== 'bowl', false)); // a bowl's water is in `still`
    this.rollAngle = 0;
    this.shell.quaternion.identity();
  }

  // ---------------------------------------------------------------- playing

  drive(input: DriveInput, dt: number) {
    if (this.menuOpen || this.sim.finished) return;
    this.prev = [...this.sim.pos];
    const ev = this.sim.step(input, dt, this.ctx.sim().t);
    this.handle(ev);
  }

  private handle(events: FishEvent[]) {
    const ui = this.ctx.ui, walker = this.ctx.sim();
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          sfx.jump();
          break;
        case 'bonk':
          sfx.bonk(Math.min(1, e.speed / 10));
          break;
        case 'bounce':
          sfx.bounce();
          ui.toast('🫧 Boing!', 900);
          break;
        case 'speed':
          sfx.speed();
          ui.toast('💨 Zoom!', 900);
          break;
        case 'coin':
          walker.coinTaken[e.index] = true;
          this.runCoins++;
          this.ctx.addCoins(1);
          break;
        case 'checkpoint': {
          sfx.checkpoint();
          ui.toast('✅ Checkpoint!');
          walker.checkpoint = [...this.sim.checkpoint.at]; // turns the flag green
          break;
        }
        case 'crack':
          sfx.oops();
          ui.toast('💥 CRACK!', 1800);
          this.prev = [...this.sim.pos];
          break;
        case 'oops':
          sfx.oops();
          ui.toast('🙈 Oops!', 1600);
          this.prev = [...this.sim.pos];
          break;
        case 'noair':
          sfx.oops();
          ui.toast('😵 Out of air!', 2000);
          this.prev = [...this.sim.pos];
          break;
        case 'flop':
          sfx.jump();
          ui.toast('🐟 Flop! Find water fast!', 2000);
          break;
        case 'splash':
          sfx.buy();
          ui.toast(`💦 ${VESSELS[e.vessel].emoji} Into the ${VESSELS[e.vessel].name}!`, 1800);
          break;
        case 'bought':
          sfx.buy();
          this.prev = [...this.sim.pos];
          ui.fade(() => {});
          ui.toast('🛍️ Someone bought you!', 2400);
          this.tipTimer = window.setTimeout(() => ui.toast(`⏰ Reach the filter in ${Math.round(this.f.house!.time / 60)} minutes!`, 3000), 2500);
          break;
        case 'late':
          sfx.oops();
          this.prev = [...this.sim.pos];
          ui.fade(() => {});
          ui.toast('⏰ Too late! Try again', 2600);
          break;
        case 'exit':
          this.finish();
          break;
      }
    }
  }

  private finish() {
    const ui = this.ctx.ui, f = this.f, id = f.level.id;
    const first = !this.data.done.includes(id);
    if (first) this.data.done.push(id);
    this.save();
    this.ctx.addCoins(f.level.reward);
    const all = FISH_LEVELS.every((l) => this.data.done.includes(l.level.id));
    if (all) this.ctx.complete('fish');
    sfx.finish();
    const p = this.sim.pos;
    this.ctx.confetti([p[0], p[1] + 2, p[2]]);
    this.menuOpen = true;
    const i = FISH_LEVELS.indexOf(f);
    const next = FISH_LEVELS[i + 1];
    setTimeout(() => {
      const lines = [f.done, `🪙 ${this.runCoins} coin${this.runCoins === 1 ? '' : 's'} + ${f.level.reward} bonus!`];
      if (this.sim.cracks === 0) lines.push('🏅 Not one crack!');
      if (all && !next) lines.push('⭐ You got the fish all the way home!');
      const buttons: [string, string, () => void][] = [];
      if (next) buttons.push([`➡️ Next: ${next.level.emoji} ${label(next)}`, 'blue', () => this.play(i + 1)]);
      buttons.push(['🗺️ Pick a level', 'pink', () => this.openMenu()]);
      buttons.push(['🏝️ Back to the island', 'grey', () => this.ctx.goTo('hub')]);
      this.reshow = () => ui.card(next ? '🎉 Level cleared! 🎉' : '🌊 FREE! 🌊', lines, buttons);
      this.reshow();
    }, 1300);
  }

  /** The start menu: pick your fish and a level. */
  private openMenu() {
    this.menuOpen = true;
    this.reshow = () => this.openMenu();
    const ui = this.ctx.ui;
    const card = el('div', 'card fish-menu');
    card.append(el('h1', '', '🐠 Fish Tank to the Ocean'));
    card.append(el('p', '', 'Roll your fish all the way from the pet store to the ocean!'));
    card.append(el('div', 'sub', 'Pick your fish'));
    const fishes = el('div', 'items');
    for (const d of FISHES) {
      const b = el('button', `item${d.id === this.data.fish ? ' on' : ''}`);
      b.append(fishIcon(d), el('div', '', d.name));
      b.addEventListener('click', () => {
        sfx.click();
        this.data.fish = d.id;
        this.save();
        this.rebuildFish();
        this.openMenu();
      });
      fishes.append(b);
    }
    card.append(fishes, el('div', 'sub', 'Pick a level'));
    const levels = el('div', 'items levels');
    FISH_LEVELS.forEach((f, i) => {
      const done = this.data.done.includes(f.level.id);
      const b = el('button', `item${done ? ' on' : ''}`);
      b.append(el('div', 'icon', f.level.emoji), el('div', '', `${i + 1}. ${label(f)}`));
      if (done) b.append(el('div', 'price owned', '✓ done'));
      b.addEventListener('click', () => {
        sfx.click();
        this.play(i);
      });
      levels.append(b);
    });
    card.append(levels);
    const home = el('button', 'big grey', '🏝️ Back to the island');
    home.addEventListener('click', () => {
      sfx.click();
      this.ctx.goTo('hub');
    });
    card.append(home);
    ui.showScreen([card]);
  }

  /** Start level i: here if it's this one, otherwise go there. */
  private play(i: number) {
    const f = FISH_LEVELS[i];
    this.reshow = null;
    this.ctx.ui.showScreen(null);
    if (f === this.f) {
      this.sim = new FishSim(this.f);
      this.prev = [...this.sim.pos];
      this.ctx.sim().coinTaken.fill(false);
      this.ctx.sim().checkpoint = [...this.f.start];
      this.runCoins = 0;
      this.menuOpen = false;
      this.ctx.ui.toast(this.f.tip, 3200);
      return;
    }
    arriving = true;
    this.ctx.goTo(f.level.id);
  }

  actions(): Action[] {
    if (this.menuOpen || this.sim.finished || !this.sim.vessel) return [];
    return [{ label: '🐟 Flop out!', color: '#15aabf', run: () => this.handle(this.sim.flopOut()) }];
  }

  update(dt: number, t: number) {
    const s = this.sim;
    if (this.menuOpen && this.reshow && document.querySelector('#ui > .screen.hidden')) this.reshow();
    // Water objects hide once used; bowls you flopped out of stay where you left them.
    this.waterMeshes.forEach((m, i) => {
      m.visible = !s.waterUsed[i];
      m.rotation.y = Math.sin(t + i) * 0.2;
    });
    if (this.leftMeshes.length !== s.left.length) {
      for (const m of this.leftMeshes) m.removeFromParent();
      this.leftMeshes = s.left.map((l) => {
        const g = this.vesselModel(l.vessel, false, true);
        g.position.set(...l.at);
        g.rotation.z = 0.3;
        this.group.add(g);
        return g;
      });
    }
    for (const h of this.hazards) h.mat.emissiveIntensity = h.tag === 'goo' ? 0.8 + Math.sin(t * 3) * 0.2 : 0.7 + Math.sin(t * 12) * 0.3;
    for (const e of this.exits) e.rotation.y = t * 2;
    for (const sc of this.scrolling) sc.tex.offset.set(t * sc.speed * 0.4, t * sc.speed);
    for (const f of this.tankFish) {
      const k = Math.sin(t * f.speed + f.phase); // swims back and forth, turning round at each end
      const dir = Math.cos(t * f.speed + f.phase) > 0 ? 1 : -1;
      f.mesh.position.set(f.along === 'x' ? f.x + k * f.reach : f.x, f.y + Math.sin(t * 1.7 + f.phase) * 0.12, f.along === 'z' ? f.z + k * f.reach : f.z);
      f.mesh.rotation.y = f.along === 'z' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const tail = f.mesh.getObjectByName('tail');
      if (tail) tail.rotation.y = Math.sin(t * 10 + f.phase) * 0.5;
    }
    for (const bb of this.bubbles) bb.mesh.position.set(bb.x + Math.sin(t * 3 + bb.phase) * 0.05, bb.y0 + ((t * 0.5 + bb.phase) % 1) * bb.h, bb.z);
    // Roll the shell.
    this.syncShell();
    const sp = Math.hypot(s.vel[0], s.vel[2]);
    if (s.vessel && sp > 0.05) {
      const r = s.r;
      if (s.vessel === 'bowl') {
        const axis = new THREE.Vector3(s.vel[2], 0, -s.vel[0]).normalize();
        this.shell.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, (sp * dt) / r));
      } else {
        const want = Math.atan2(s.vel[0], s.vel[2]);
        let d = Math.atan2(Math.sin(want - this.travelYaw), Math.cos(want - this.travelYaw));
        // A cylinder rolls the same either way, so never turn more than a quarter.
        if (d > Math.PI / 2) d -= Math.PI;
        if (d < -Math.PI / 2) d += Math.PI;
        this.travelYaw += d * Math.min(1, dt * 8);
        const fwd = Math.sin(this.travelYaw) * s.vel[0] + Math.cos(this.travelYaw) * s.vel[2];
        this.rollAngle += (fwd * dt) / r;
        this.shell.rotation.set(this.rollAngle, this.travelYaw, 0, 'YXZ');
      }
    }
    // Swish the tail.
    const tail = this.fishMesh.getObjectByName('tail');
    if (tail) tail.rotation.y = Math.sin(t * (s.vessel ? 8 : 20)) * 0.5;
    for (const p of this.people) p.root.rotation.y = Math.PI + Math.sin(t * 0.7) * 0.3;
    this.drawMeter();
  }

  /** The clock (level 1) and the air bar (out of the water). */
  private drawMeter() {
    const s = this.sim;
    let key = '';
    if (this.menuOpen || s.finished) key = '';
    else if (!s.vessel) key = `air:${Math.ceil(s.air)}`;
    else if (s.timeLeft !== null) key = `time:${Math.ceil(s.timeLeft)}`;
    if (key === this.meterKey) return;
    this.meterKey = key;
    this.meter.classList.toggle('hidden', !key);
    this.meter.classList.toggle('low', (!s.vessel && s.air < 15) || (s.timeLeft !== null && s.timeLeft < 30));
    if (!s.vessel) {
      const bar = el('div', 'air-bar');
      const fill = el('i');
      fill.style.width = `${(s.air / AIR) * 100}%`;
      bar.append(fill);
      this.meter.replaceChildren(el('span', '', '🫧 Air'), bar, el('b', '', `${Math.ceil(s.air)}`));
    } else if (s.timeLeft !== null) {
      const sec = Math.ceil(s.timeLeft);
      this.meter.replaceChildren(el('span', '', `⏰ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`));
    }
  }

  locked() {
    return this.menuOpen;
  }

  pose(rig: Rig) {
    this.rig = rig;
    rig.root.visible = false;
    return true;
  }

  camera() {
    return false;
  }

  follow(alpha: number) {
    const s = this.sim, p = this.prev;
    const at: V3 = [p[0] + (s.pos[0] - p[0]) * alpha, p[1] + (s.pos[1] - p[1]) * alpha, p[2] + (s.pos[2] - p[2]) * alpha];
    this.shell.position.set(...at);
    this.still.position.set(...at);
    this.still.visible = s.vessel === 'bowl';
    this.shine.position.set(...at);
    this.shine.quaternion.copy(this.ctx.camera.quaternion);
    this.shine.scale.setScalar(s.r);
    this.shine.visible = s.vessel === 'bowl' || s.vessel === 'bottle';
    const fm = this.fishMesh;
    const scale = s.vessel === 'bottle' ? 1.1 : 1.5;
    fm.scale.setScalar(scale);
    fm.position.set(at[0], at[1] + (s.vessel ? Math.sin(s.t * 3) * 0.05 : 0), at[2]);
    // In water it swims round and round in its bowl (so you can see it from the side).
    if (s.vessel) fm.rotation.set(0, s.t * 1.3, Math.sin(s.t * 2) * 0.1);
    else fm.rotation.set(0, s.yaw, Math.PI / 2 + Math.sin(s.t * 18) * 0.4); // flopping on its side
    return { at: [at[0], at[1] + 0.9, at[2]] as V3, vel: s.vel };
  }

  dispose() {
    clearTimeout(this.tipTimer);
    if (this.rig) this.rig.root.visible = true;
    for (const p of this.people) p.dispose();
    for (const d of this.disposables) d.dispose();
    this.meter.remove();
    this.group.removeFromParent();
    this.ctx.ui.showScreen(null);
  }
}
