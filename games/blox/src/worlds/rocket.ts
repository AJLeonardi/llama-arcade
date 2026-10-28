// Rocket Lab: stand by the launch pad and tap Build. Add parts in the workshop panel (they stack up on the
// pad), then launch and watch how far it gets. The flight is worked out first (sim/rocket.ts) and then
// played back, faster and faster as it climbs.
import * as THREE from 'three';
import { gameStorage } from '../../../../shared/storage';
import {
  addPart, checkDesign, CLOUDS, fly, hint, liftRatio, MAX_PARTS, MOON, PAD, part, PARTS, PLACE_COINS, PLACE_NAME,
  PLANET_R, SPACE, undoPart, type Design, type Flight, type Frame, type PartId,
} from '../sim/rocket';
import { LEVELS } from '../sim/levels';
import type { Rig } from '../view/avatar';
import { BoxBatch } from '../../../../shared/boxes';
import { sfx } from '../ui/sfx';
import type { Action, Activity, CamView, WorldCtx } from './activity';

const R = 0.9; // rocket radius
const CAP = 2500; // above this the rocket stops climbing in the 3D world, and the sky does the rest
type Mode = 'walk' | 'build' | 'count' | 'fly' | 'result';

interface RocketMesh {
  group: THREE.Group;
  /** One group per slot, bottom to top. */
  slots: THREE.Group[];
  boosters: (THREE.Group | null)[];
  flames: (THREE.Mesh | null)[];
  boosterFlames: THREE.Mesh[][];
  height: number;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class RocketWorld implements Activity {
  private store = gameStorage('blox');
  private design: Design;
  private mode: Mode = 'walk';
  private mesh: RocketMesh | null = null;
  private group = new THREE.Group();
  private panel = el('div', 'shop rocket-panel hidden');
  private meter = el('div', 'pill alt-meter hidden');
  private mats = new Map<string, THREE.Material>();
  private extraMats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private rocketGeos: THREE.BufferGeometry[] = [];
  private flight: Flight | null = null;
  private ft = 0; // flight time (sim seconds)
  private fi = 0; // frame index
  private countT = 0;
  private turbo = false;
  private falling: { g: THREE.Group; v: THREE.Vector3; spin: number; life: number }[] = [];
  private dropsDone = 0;
  private said = new Set<string>();
  private skyT = 0;
  private stars: THREE.Points;
  private planet: THREE.Mesh;
  private moon: THREE.Mesh;
  private smoke: THREE.InstancedMesh;
  private puffs: { p: THREE.Vector3; age: number }[] = [];
  private rig: Rig | null = null;
  private endT = 0;

  constructor(private ctx: WorldCtx) {
    const saved = this.store.load<Design>('rocket');
    this.design = Array.isArray(saved) ? saved.filter((s) => PARTS.some((p) => p.id === s?.part && !p.side)) : [];
    ctx.scene.add(this.group);
    ctx.ui.root.append(this.panel, this.meter);
    this.rebuild();

    // Space things, hidden until you're up there.
    const starGeo = this.geo(new THREE.BufferGeometry());
    const pts: number[] = [];
    for (let i = 0; i < 700; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pts.push(Math.cos(a) * s * 300, u * 300, Math.sin(a) * s * 300);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, this.track(new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })));
    this.planet = new THREE.Mesh(this.geo(new THREE.SphereGeometry(1, 48, 32)), this.track(new THREE.MeshLambertMaterial({ color: 0x3f8fe0, emissive: 0x0b3a2a, fog: false })));
    this.moon = new THREE.Mesh(this.geo(new THREE.SphereGeometry(1, 40, 28)), this.track(new THREE.MeshLambertMaterial({ color: 0xdee2e6, emissive: 0x333333, fog: false })));
    this.stars.visible = this.planet.visible = this.moon.visible = false;
    this.smoke = new THREE.InstancedMesh(this.geo(new THREE.IcosahedronGeometry(1, 0)), this.track(new THREE.MeshLambertMaterial({ color: 0xf1f3f5 })), 80);
    this.smoke.count = 0;
    this.group.add(this.stars, this.planet, this.moon, this.smoke);
    this.buildClouds();
  }

  // ---------------------------------------------------------------- three.js bits

  private track<M extends THREE.Material>(m: M): M {
    this.extraMats.push(m);
    return m;
  }

  private geo<G extends THREE.BufferGeometry>(g: G): G {
    this.geos.push(g);
    return g;
  }

  private mat(color: string, emissive = 0) {
    const key = color + emissive;
    let m = this.mats.get(key);
    if (!m) this.mats.set(key, (m = new THREE.MeshLambertMaterial({ color, emissive })));
    return m;
  }

  /** A layer of puffy clouds at about 2 km, to fly up through. */
  private buildClouds() {
    const b = new BoxBatch();
    const white = new THREE.Color('#ffffff');
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const x = PAD[0] + (rnd() - 0.5) * 260, z = PAD[2] + (rnd() - 0.5) * 260, y = PAD[1] + CLOUDS - 150 + rnd() * 120;
      if (Math.hypot(x - PAD[0], z - PAD[2]) < 8) continue;
      b.add(x, y, z, 12 + rnd() * 20, 5 + rnd() * 6, 10 + rnd() * 18, white);
    }
    const m = new THREE.Mesh(this.geo(b.geometry()), this.track(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x777777, transparent: true, opacity: 0.92 })));
    this.group.add(m);
  }

  private buildRocket(d: Design): RocketMesh {
    const group = new THREE.Group();
    const slots: THREE.Group[] = [], boosters: (THREE.Group | null)[] = [], flames: (THREE.Mesh | null)[] = [];
    const boosterFlames: THREE.Mesh[][] = [];
    const flameMat = this.mat('#ffa94d', 0xff6a00);
    let y = 0;
    const cyl = (g: THREE.Object3D, rt: number, rb: number, h: number, yy: number, color: string, x = 0) => {
      const m = new THREE.Mesh(this.rgeo(new THREE.CylinderGeometry(rt, rb, h, 20)), this.mat(color));
      m.position.set(x, yy, 0);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    d.forEach((s, i) => {
      const p = part(s.part);
      const g = new THREE.Group();
      g.position.y = y;
      const h = p.height;
      let flame: THREE.Mesh | null = null;
      switch (s.part) {
        case 'engS':
        case 'engL': {
          const big = s.part === 'engL';
          cyl(g, R, R * 0.8, h * 0.45, h * 0.775, p.color);
          cyl(g, R * 0.45, big ? R * 0.95 : R * 0.7, h * 0.55, h * 0.275, '#343a40');
          flame = new THREE.Mesh(this.rgeo(new THREE.ConeGeometry(big ? R * 0.9 : R * 0.65, big ? 6 : 4, 14).rotateX(Math.PI)), flameMat);
          flame.position.y = big ? -3 : -2;
          flame.visible = false;
          g.add(flame);
          break;
        }
        case 'tankS':
        case 'tankL':
          cyl(g, R, R, h, h / 2, p.color);
          cyl(g, R * 1.01, R * 1.01, 0.25, h * 0.75, i % 2 ? '#e03131' : '#1c7ed6');
          break;
        case 'capsule': {
          cyl(g, R * 0.5, R, h, h / 2, p.color);
          const win = new THREE.Mesh(this.rgeo(new THREE.BoxGeometry(0.5, 0.45, 0.1)), this.mat('#fff3bf', 0x332200));
          win.position.set(0, h * 0.55, R * 0.76);
          win.rotation.x = -0.3;
          g.add(win);
          break;
        }
        case 'nose':
          cyl(g, 0.02, R * 0.5, h, h / 2, p.color);
          break;
        case 'split':
          cyl(g, R * 1.02, R * 1.02, h, h / 2, '#212529');
          cyl(g, R * 1.04, R * 1.04, h * 0.4, h / 2, p.color);
          break;
      }
      if (s.fins) {
        for (let k = 0; k < 4; k++) {
          const f = new THREE.Mesh(this.rgeo(new THREE.BoxGeometry(0.08, Math.min(h, 1.4), 1.1)), this.mat('#e03131'));
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          f.position.set(Math.sin(a) * (R + 0.5), Math.min(h, 1.4) / 2, Math.cos(a) * (R + 0.5));
          f.rotation.y = a;
          f.castShadow = true;
          g.add(f);
        }
      }
      let bg: THREE.Group | null = null;
      const bf: THREE.Mesh[] = [];
      if (s.boost) {
        bg = new THREE.Group();
        for (const side of [-1, 1]) {
          const bx = side * (R + 0.5);
          cyl(bg, 0.45, 0.45, h + 0.6, (h + 0.6) / 2 - 0.3, '#ced4da', bx);
          cyl(bg, 0.02, 0.45, 0.8, h + 0.7, '#e03131', bx);
          const fl = new THREE.Mesh(this.rgeo(new THREE.ConeGeometry(0.4, 3, 10).rotateX(Math.PI)), flameMat);
          fl.position.set(bx, -1.8, 0);
          fl.visible = false;
          bg.add(fl);
          bf.push(fl);
        }
        g.add(bg);
      }
      group.add(g);
      slots.push(g);
      boosters.push(bg);
      flames.push(flame);
      boosterFlames.push(bf);
      y += h;
    });
    group.position.set(PAD[0], PAD[1], PAD[2]);
    return { group, slots, boosters, flames, boosterFlames, height: y };
  }

  /** Geometry for the rocket itself: thrown away each time it's rebuilt. */
  private rgeo<G extends THREE.BufferGeometry>(g: G): G {
    this.rocketGeos.push(g);
    return g;
  }

  private rebuild() {
    this.mesh?.group.removeFromParent();
    for (const g of this.rocketGeos) g.dispose();
    this.rocketGeos = [];
    this.mesh = this.buildRocket(this.design);
    this.group.add(this.mesh.group);
  }

  // ---------------------------------------------------------------- the workshop

  private openBuild() {
    this.mode = 'build';
    this.ctx.ui.setLocked(true);
    this.drawPanel();
  }

  private closeBuild() {
    this.mode = 'walk';
    this.panel.classList.add('hidden');
    this.store.save('rocket', this.design);
  }

  private drawPanel() {
    const p = this.panel;
    p.classList.remove('hidden');
    const top = el('div', 'shop-top');
    const done = el('button', 'done-btn', 'Done ✓');
    done.onclick = () => {
      sfx.click();
      this.closeBuild();
    };
    top.append(el('h2', '', '🔧 Rocket Workshop'), done);

    const twr = liftRatio(this.design);
    const power = !this.design.length ? '—' : twr < 1 ? '🔴 Too heavy to lift off!' : twr < 1.3 ? '🟡 Slow and heavy' : '🟢 Plenty of push';
    const stats = el('div', 'rocket-stats');
    stats.append(el('div', '', `🧱 ${this.design.length} / ${MAX_PARTS} parts`), el('div', '', `💪 ${power}`));

    const grid = el('div', 'items');
    for (const def of PARTS) {
      const b = el('button', 'item part-btn');
      b.append(el('div', 'icon', def.emoji), el('div', '', def.name), el('div', 'tip', def.tip));
      b.onclick = () => {
        if (addPart(this.design, def.id as PartId)) {
          sfx.click();
          this.rebuild();
          this.drawPanel();
        } else {
          sfx.nope();
          this.ctx.ui.toast(def.side ? (this.design.length ? 'Already on that part!' : 'Add a part first!') : 'That’s as tall as it goes!');
        }
      };
      grid.append(b);
    }

    const row = el('div', 'rocket-row');
    const undo = el('button', 'tab', '↩️ Undo');
    undo.onclick = () => {
      sfx.click();
      undoPart(this.design);
      this.rebuild();
      this.drawPanel();
    };
    const clear = el('button', 'tab', '🗑️ Clear');
    clear.onclick = () => {
      sfx.click();
      this.design = [];
      this.rebuild();
      this.drawPanel();
    };
    const launch = el('button', 'big launch-btn', '🚀 LAUNCH!');
    launch.onclick = () => this.launch();
    row.append(undo, clear, launch);
    p.replaceChildren(top, stats, grid, row);
  }

  private launch() {
    const problem = checkDesign(this.design);
    if (problem) {
      sfx.nope();
      this.ctx.ui.toast(problem, 2600);
      return;
    }
    sfx.click();
    this.store.save('rocket', this.design);
    this.panel.classList.add('hidden');
    this.flight = fly(this.design.map((s) => ({ ...s })));
    this.rebuild();
    this.mode = 'count';
    this.countT = 0;
    this.ft = 0;
    this.fi = 0;
    this.turbo = false;
    this.dropsDone = 0;
    this.said.clear();
    this.endT = 0;
    this.ctx.camera.far = 30000;
    this.ctx.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- flying

  actions(): Action[] {
    if (this.mode === 'walk' && this.ctx.sim().zones.includes('build')) {
      return [{ label: '🔧 Build a rocket', run: () => this.openBuild(), color: '#f08c00' }];
    }
    if (this.mode === 'fly' && this.flight && this.flight.frames.length > 60) {
      return [{ label: this.turbo ? '🐢 Normal speed' : '⏩ Faster!', run: () => (this.turbo = !this.turbo), color: '#2f7de1' }];
    }
    return [];
  }

  private say(key: string, text: string, ms = 1800) {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.ctx.ui.toast(text, ms);
  }

  /** The flight frame at time t (interpolated). */
  private frameAt(t: number): Frame {
    const F = this.flight!.frames;
    while (this.fi < F.length - 2 && F[this.fi + 1].t < t) this.fi++;
    const a = F[this.fi], b = F[Math.min(F.length - 1, this.fi + 1)];
    const f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
    return { ...a, h: a.h + (b.h - a.h) * f, x: a.x + (b.x - a.x) * f, tilt: a.tilt + (b.tilt - a.tilt) * f };
  }

  update(dt: number) {
    const m = this.mesh!;
    // Falling stages and boosters tumble away.
    for (const f of this.falling) {
      f.v.y -= 9.8 * dt;
      f.g.position.addScaledVector(f.v, dt);
      f.g.rotation.z += f.spin * dt;
      f.life -= dt;
      if (f.life <= 0) f.g.removeFromParent();
    }
    this.falling = this.falling.filter((f) => f.life > 0);
    this.updateSmoke(dt);

    if (this.mode === 'count') {
      const before = Math.ceil(3 - this.countT);
      this.countT += dt;
      const now = Math.ceil(3 - this.countT);
      if (now !== before && now > 0) {
        this.ctx.ui.toast(`${now}…`, 800);
        sfx.click();
      }
      if (this.countT >= 3) {
        this.mode = 'fly';
        this.ctx.ui.toast('🔥 LIFT OFF!', 1200);
        sfx.speed();
        this.meter.classList.remove('hidden');
      }
      return;
    }
    if (this.mode !== 'fly') return;

    const F = this.flight!;
    const last = F.frames[F.frames.length - 1];
    const prevH = this.frameAt(this.ft).h;
    const warp = this.ft < 2 ? 1 : Math.min(1200, 1 + prevH / 1200) * (this.turbo ? 5 : 1);
    this.ft = Math.min(last.t, this.ft + dt * warp);
    const fr = this.frameAt(this.ft);

    // Drop stages and boosters as they run out.
    while (this.dropsDone < F.drops.length && F.drops[this.dropsDone].t <= this.ft) {
      const d = F.drops[this.dropsDone++];
      if (d.boosters) {
        for (let i = d.from; i < d.to; i++) {
          const b = m.boosters[i];
          if (b && b.parent === m.slots[i]) this.drop(b);
        }
        this.ctx.ui.toast('🚀 Boosters off!', 1200);
      } else {
        for (let i = d.from; i < d.to; i++) this.drop(m.slots[i]);
        this.ctx.ui.toast('✂️ Stage dropped! Next engine!', 1400);
        sfx.bounce();
      }
    }

    // Where the rocket is.
    const y = PAD[1] + Math.min(fr.h, CAP);
    m.group.position.set(PAD[0] + Math.max(-400, Math.min(400, fr.x * 0.15)), y, PAD[2]);
    m.group.rotation.z = -fr.tilt;
    const shake = fr.h < 1 && fr.firing ? 0.06 : 0;
    m.group.position.x += (Math.random() - 0.5) * shake;
    m.group.translateY(-m.slots[fr.base]?.position.y || 0);
    m.flames.forEach((f, i) => f && (f.visible = fr.firing && i === fr.base));
    m.boosterFlames.forEach((list, i) => list.forEach((f) => (f.visible = fr.firing && fr.boosters && m.boosters[i]?.parent === m.slots[i])));
    const flick = 0.85 + Math.random() * 0.3;
    for (const f of [...m.flames, ...m.boosterFlames.flat()]) if (f) f.scale.set(1, flick, 1);
    if (fr.firing && fr.h < 15_000 && Math.random() < 0.7) this.puff(m.slots[fr.base]);

    this.meter.textContent = fr.h < 1000 ? `⬆️ ${Math.round(fr.h)} m` : `⬆️ ${Math.round(fr.h / 1000).toLocaleString()} km`;
    if (fr.h > 1 && fr.h < CLOUDS) this.say('up', '🦙 Wheee!', 1200);
    if (fr.h >= CLOUDS) this.say('clouds', '☁️ Above the clouds!');
    if (fr.h >= SPACE) this.say('space', '🌌 SPACE!', 2400);
    if (fr.h >= MOON * 0.5) this.say('half', '🌙 Halfway to the Moon!');
    if (Math.abs(fr.tilt) > 0.5 && F.problem === 'flip') this.say('flip', '🙃 Uh oh, it’s wobbling over!');
    if (!fr.firing && fr.h > 10 && !this.said.has('flip')) this.say('out', '⛽ Out of fuel! Coasting…', 1500);
    this.space(fr);

    if (this.ft >= last.t) {
      this.endT += dt;
      if (F.problem === 'heavy' && this.endT < 1.5) return;
      if (this.endT > 1.2) this.finish();
    }
  }

  private drop(g: THREE.Object3D) {
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    g.getWorldPosition(wp);
    g.getWorldQuaternion(wq);
    const holder = new THREE.Group();
    holder.position.copy(wp);
    holder.quaternion.copy(wq);
    g.position.set(0, 0, 0);
    holder.add(g);
    this.group.add(holder);
    this.falling.push({ g: holder, v: new THREE.Vector3((Math.random() - 0.5) * 6, -4, (Math.random() - 0.5) * 6), spin: (Math.random() - 0.5) * 3, life: 6 });
  }

  /** A puff of smoke under the bottom part. */
  private puff(bottom: THREE.Object3D) {
    const p = new THREE.Vector3();
    bottom.getWorldPosition(p);
    p.x += (Math.random() - 0.5) * 1.5;
    p.z += (Math.random() - 0.5) * 1.5;
    p.y -= 2.5;
    if (this.puffs.length >= 80) this.puffs.shift();
    this.puffs.push({ p, age: 0 });
  }

  private updateSmoke(dt: number) {
    const dummy = new THREE.Object3D();
    this.puffs = this.puffs.filter((p) => (p.age += dt) < 4);
    this.puffs.forEach((p, i) => {
      dummy.position.copy(p.p);
      dummy.scale.setScalar(0.8 + p.age * 1.6);
      dummy.updateMatrix();
      this.smoke.setMatrixAt(i, dummy.matrix);
    });
    this.smoke.count = this.puffs.length;
    this.smoke.instanceMatrix.needsUpdate = true;
  }

  /** Sky getting dark, stars coming out, the planet shrinking below and the Moon growing above. */
  private space(fr: Frame) {
    const sky = LEVELS.rocket.sky;
    const k = Math.min(1, fr.h / 45_000);
    this.skyT -= 1;
    if (this.skyT <= 0 && fr.h > 300) {
      this.skyT = 12;
      const top = new THREE.Color(sky[0]).lerp(new THREE.Color('#02030a'), k);
      const hor = new THREE.Color(sky[1]).lerp(new THREE.Color('#0b1030'), Math.min(1, fr.h / 30_000));
      this.ctx.setSky('#' + top.getHexString(), '#' + hor.getHexString());
      const fog = this.ctx.scene.fog as THREE.Fog | null;
      if (fog && fr.h > CLOUDS + 400) fog.far = fog.near = 1e6;
    }
    const cam = this.ctx.camera;
    const rocketPos = this.mesh!.group.position;
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, Math.min(1, (fr.h - 15_000) / 30_000));
    this.stars.visible = fr.h > 15_000;
    this.stars.position.copy(cam.position);
    // The planet: as big as it really looks from up here (seen from this far away, it's a ball).
    this.planet.visible = fr.h > CAP;
    if (this.planet.visible) {
      const ang = Math.asin(PLANET_R / (PLANET_R + fr.h));
      const dist = 3000;
      const r = dist * Math.sin(ang);
      this.planet.scale.setScalar(r);
      this.planet.position.set(rocketPos.x, rocketPos.y - dist, rocketPos.z);
    }
    this.moon.visible = fr.h > SPACE;
    if (this.moon.visible) {
      const toMoon = Math.max(1, MOON - fr.h + 200_000);
      const ang = Math.atan(200_000 / toMoon);
      const dist = 2500;
      this.moon.scale.setScalar(Math.min(1200, Math.max(4, dist * Math.tan(ang))));
      const side = new THREE.Vector3().subVectors(rocketPos, cam.position).setY(0).normalize();
      this.moon.position.set(rocketPos.x + side.x * dist * 0.9, rocketPos.y + dist * 0.35, rocketPos.z + side.z * dist * 0.9);
    }
  }

  private finish() {
    const F = this.flight!;
    this.mode = 'result';
    this.meter.classList.add('hidden');
    const s = this.ctx.save;
    const best = s.stats['rocket:best'] ?? 0;
    const order = ['pad', 'sky', 'clouds', 'space', 'moon', 'stars'];
    let coins = 0;
    for (const place of order.slice(0, order.indexOf(F.place) + 1)) {
      const key = `rocket:${place}`;
      const c = PLACE_COINS[place as keyof typeof PLACE_COINS];
      if (c && !s.stats[key]) {
        s.stats[key] = 1;
        coins += c;
      }
    }
    s.stats['rocket:best'] = Math.max(best, F.apex);
    this.ctx.persist();
    if (coins) this.ctx.addCoins(coins);
    if (F.place === 'moon' || F.place === 'stars') {
      this.ctx.complete('rocket');
      this.ctx.confetti([this.mesh!.group.position.x, this.mesh!.group.position.y + 4, this.mesh!.group.position.z]);
      sfx.finish();
    }
    const km = F.apex < 1000 ? `${Math.round(F.apex)} m` : `${Math.round(F.apex / 1000).toLocaleString()} km`;
    const title = F.place === 'stars' ? '🌟 To the stars! 🌟' : F.place === 'moon' ? '🌙 The Moon! 🌙' : F.place === 'pad' ? '😬 Didn’t take off' : `🚀 ${km} high!`;
    const lines = [
      F.place === 'pad' ? 'It stayed on the launch pad.' : `You got to ${PLACE_NAME[F.place]}${F.apex > best && best > 0 ? ' (your best yet!)' : ''}`,
      hint(this.design, F),
    ];
    if (F.place !== 'pad') lines.push('🪂 The llama parachuted home safely.');
    if (coins) lines.push(`🪙 +${coins} coins`);
    this.ctx.ui.card(title, lines, [
      ['🔧 Build again', 'blue', () => this.reset(true)],
      ['🚶 Walk around', 'grey', () => this.reset(false)],
    ]);
  }

  private reset(build: boolean) {
    this.ctx.ui.showScreen(null);
    this.flight = null;
    for (const f of this.falling) f.g.removeFromParent();
    this.falling = [];
    this.puffs = [];
    this.rebuild();
    this.stars.visible = this.planet.visible = this.moon.visible = false;
    this.ctx.setSky(...LEVELS.rocket.sky);
    this.ctx.camera.far = 400;
    this.ctx.camera.updateProjectionMatrix();
    this.mode = 'walk';
    if (build) this.openBuild();
  }

  locked() {
    return this.mode !== 'walk';
  }

  pose(rig: Rig) {
    this.rig = rig;
    rig.root.visible = this.mode === 'walk' || this.mode === 'build';
    return false;
  }

  camera(cam: THREE.PerspectiveCamera, view: CamView) {
    if (this.mode === 'walk') return false;
    const m = this.mesh!;
    const target = new THREE.Vector3();
    m.group.getWorldPosition(target);
    let dist: number, pitch: number;
    if (this.mode === 'build') {
      target.y += m.height / 2;
      dist = Math.max(9, m.height * 1.25 + 4);
      pitch = 0.15;
      const w = window.innerWidth, h = window.innerHeight;
      cam.setViewOffset(w, h, w * 0.24, 0, w, h);
    } else {
      target.y += Math.min(m.height / 2, 6);
      dist = Math.max(16, m.height * 1.4);
      pitch = this.mode === 'count' ? 0.05 : -0.2;
    }
    const yaw = view.yaw;
    cam.position.set(target.x - Math.sin(yaw) * dist * Math.cos(pitch), target.y + dist * Math.sin(pitch), target.z - Math.cos(yaw) * dist * Math.cos(pitch));
    cam.lookAt(target);
    return true;
  }

  dispose() {
    if (this.rig) this.rig.root.visible = true;
    this.store.save('rocket', this.design);
    this.panel.remove();
    this.meter.remove();
    for (const m of [...this.mats.values(), ...this.extraMats]) m.dispose();
    for (const g of [...this.geos, ...this.rocketGeos]) g.dispose();
    this.group.removeFromParent();
    this.ctx.camera.far = 400;
    this.ctx.camera.updateProjectionMatrix();
  }
}
