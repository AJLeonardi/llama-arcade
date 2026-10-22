// Fish Tank to the Ocean: you're a fish rolling along in a bowl, from the pet store to the Pacific.
// The rules and physics are in sim/fish.ts and the seven levels in sim/fishLevels.ts; this file draws the bowl,
// the fish, the ramps, goo and sparks, runs the air bar and the clock, and shows the menus.
import * as THREE from 'three';
import { gameStorage } from '../../../../shared/storage';
import { AIR, FISHES, FishSim, HAZARD_TAGS, VESSELS, type FishDef, type FishEvent, type FishLevel, type Ramp, type Vessel } from '../sim/fish';
import { FISH_BY_ID, FISH_LEVELS } from '../sim/fishLevels';
import type { V3 } from '../sim/types';
import type { Rig } from '../view/avatar';
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
    this.group.add(this.shell);
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

  /** Slopes: a plank with a sloping top (and bottom), all merged into one mesh. */
  private buildRamps(ramps: Ramp[]) {
    if (!ramps.length) return;
    const pos: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    for (const r of ramps) {
      c.set(r.color);
      const T = Math.min(r.w, r.d) < 2 ? 0.3 : 0.6;
      const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2;
      // Height of the top at each corner.
      const h = (x: number, z: number) => (r.along === 'z' ? (z === z0 ? r.y0 : r.y1) : x === x0 ? r.y0 : r.y1);
      const corner = (x: number, z: number, top: boolean): V3 => [x, h(x, z) - (top ? 0 : T), z];
      const quad = (a: V3, b: V3, cc: V3, d: V3, shade: number) => {
        for (const p of [a, b, cc, a, cc, d]) {
          pos.push(...p);
          col.push(c.r * shade, c.g * shade, c.b * shade);
        }
      };
      const t = (x: number, z: number) => corner(x, z, true), u = (x: number, z: number) => corner(x, z, false);
      quad(t(x0, z0), t(x0, z1), t(x1, z1), t(x1, z0), 1);
      quad(u(x0, z0), u(x1, z0), u(x1, z1), u(x0, z1), 0.6);
      quad(u(x0, z0), u(x0, z1), t(x0, z1), t(x0, z0), 0.8);
      quad(u(x1, z0), t(x1, z0), t(x1, z1), u(x1, z1), 0.8);
      quad(u(x0, z0), t(x0, z0), t(x1, z0), u(x1, z0), 0.7);
      quad(u(x0, z1), u(x1, z1), t(x1, z1), t(x0, z1), 0.7);
    }
    const g = this.geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide }));
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  /** Goo, hot pipes and sparks glow; small ways out get a swirly blue glow. */
  private buildZones() {
    for (const b of this.f.level.blocks) {
      if (b.kind !== 'zone' || !b.tag) continue;
      if (HAZARD_TAGS.has(b.tag) && b.tag !== 'drop') {
        const goo = b.tag === 'goo';
        const mat = this.mat(goo ? '#69db7c' : '#ff6b6b', { emissive: goo ? '#2b8a3e' : '#c92a2a', transparent: true, opacity: goo ? 0.92 : 0.85 });
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

  /** The buyer in the pet store, and the sea in the last level. */
  private buildExtras() {
    if (this.f.house) {
      const r = randomRider();
      r.root.position.set(4, 0, 30.5);
      r.root.rotation.y = Math.PI;
      this.group.add(r.root);
      this.people.push(r);
    }
    if (this.f.level.id === 'fish7') {
      const sea = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2)), this.mat('#1c7ed6'));
      sea.position.y = -11.8;
      sea.receiveShadow = true;
      this.group.add(sea);
    }
  }

  /** A fish bowl, water bottle or bucket. Standing up (to jump into), or lying down to roll (along x). */
  private vesselModel(v: Vessel, full: boolean, standing: boolean) {
    const g = new THREE.Group();
    const r = VESSELS[v].r;
    const glass = this.mat('#e7f5ff', { transparent: true, opacity: 0.16, depthWrite: false });
    const water = this.mat('#74c0fc', { transparent: true, opacity: 0.18, depthWrite: false });
    if (v === 'bowl') {
      const shellG = new THREE.Mesh(this.geo(new THREE.SphereGeometry(r, 20, 14)), glass);
      g.add(shellG);
      if (full) g.add(new THREE.Mesh(this.geo(new THREE.SphereGeometry(r * 0.86, 16, 12)), water));
      const rim = new THREE.Mesh(this.geo(new THREE.TorusGeometry(r * 0.55, 0.06, 6, 20).rotateX(Math.PI / 2)), this.mat('#a5d8ff'));
      rim.position.y = r * 0.82;
      g.add(rim);
      // A couple of pebbles so you can see it roll.
      for (const [x, y, z, c] of [[0.25, -0.55, 0.1, '#ff922b'], [-0.2, -0.56, -0.15, '#cc5de8'], [0.05, -0.58, -0.3, '#51cf66']] as const) {
        this.part(g, 0.16, 0.12, 0.16, x * r / 0.7, y * r / 0.7, z * r / 0.7, this.mat(c));
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
    body.add(new THREE.Mesh(this.geo(new THREE.CylinderGeometry(rad, bottle ? rad : rad * 0.85, len, 18, 1, !bottle)), glass));
    if (!bottle) (body.children[0] as THREE.Mesh).material = this.mat('#fab005', { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    if (full) body.add(new THREE.Mesh(this.geo(new THREE.CylinderGeometry(rad * 0.9, rad * 0.9 * (bottle ? 1 : 0.85), len * 0.85, 14)), water));
    if (bottle) {
      this.part(body, rad * 0.8, len * 0.12, rad * 0.8, 0, len * 0.56, 0, this.mat('#1c7ed6'));
      this.part(body, rad * 2.05, len * 0.3, rad * 2.05, 0, 0, 0, this.mat('#ffffff', { transparent: true, opacity: 0.8 }));
    } else {
      const handle = new THREE.Mesh(this.geo(new THREE.TorusGeometry(rad * 0.95, 0.04, 5, 16, Math.PI)), this.mat('#868e96'));
      handle.position.y = len / 2;
      body.add(handle);
    }
    if (standing) {
      body.position.y = len / 2;
    } else {
      body.rotation.z = Math.PI / 2;
    }
    g.add(body);
    return g;
  }

  /** Blocky fish, facing +z. */
  private fishModel(d: FishDef) {
    const g = new THREE.Group();
    // A little glow so the colours still show through the glass and water.
    const bright = (c: string) => this.mat(c, { emissive: new THREE.Color(c).multiplyScalar(0.45) });
    const body = bright(d.body), stripe = bright(d.stripe), fin = bright(d.fin), eye = this.mat('#111111'), white = bright('#ffffff');
    const puffer = d.id === 'puffer';
    const [w, h, l] = puffer ? [0.4, 0.4, 0.44] : d.id === 'bass' ? [0.24, 0.3, 0.6] : [0.22, 0.3, 0.5];
    this.part(g, w, h, l, 0, 0, 0, body);
    if (d.id === 'clown') for (const z of [0.12, -0.1]) this.part(g, w + 0.02, h + 0.02, 0.06, 0, 0, z, stripe);
    else if (d.id === 'bass') this.part(g, w + 0.02, 0.06, l * 0.8, 0, 0, 0, stripe);
    else if (d.id === 'tang') this.part(g, w + 0.02, h * 0.5, l * 0.4, 0, 0.04, 0.02, stripe);
    else if (d.id === 'shark') this.part(g, w + 0.01, h * 0.35, l * 0.9, 0, -h * 0.35, 0.02, stripe);
    if (puffer) {
      for (const [x, y, z] of [[0.22, 0, 0], [-0.22, 0, 0], [0, 0.22, 0], [0, -0.22, 0], [0.15, 0.15, 0.1], [-0.15, 0.15, -0.1], [0.15, -0.15, -0.1], [-0.15, -0.15, 0.1]]) {
        this.part(g, 0.06, 0.06, 0.06, x, y, z, stripe);
      }
    }
    // Tail, fins and eyes.
    const tail = this.part(g, 0.04, h * 0.9, 0.2, 0, 0, -l / 2 - 0.08, fin);
    tail.name = 'tail';
    this.part(g, 0.03, d.id === 'shark' ? 0.22 : 0.1, 0.16, 0, h / 2 + (d.id === 'shark' ? 0.1 : 0.04), -0.02, fin);
    for (const s of [-1, 1]) {
      this.part(g, 0.02, 0.08, 0.08, s * (w / 2 + 0.01), 0.04, l / 2 - 0.1, white);
      this.part(g, 0.025, 0.045, 0.045, s * (w / 2 + 0.02), 0.04, l / 2 - 0.09, eye);
    }
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
    if (v) this.shell.add(this.vesselModel(v, true, false));
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
