// Llama Burgers: walk to a station and its buttons appear (cook, fry, pour...). Customers walk up to the
// counter and cars pull up at the drive-through window, each with a bubble showing what they want.
// The rules are in sim/burger.ts; this file draws the people, cars and food, and shows the buttons.
import * as THREE from 'three';
import {
  BURGER_SPOTS, COOK_TIME, BURN_TIME, FOOD_EMOJI, FRY_TIME, mood, Restaurant, STAR_BONUS,
  type BurgerEvent, type Customer, type Station,
} from '../sim/burger';
import type { V3 } from '../sim/types';
import { animate, type Rig } from '../view/avatar';
import { labelTex } from '../view/textures';
import { sfx } from '../ui/sfx';
import type { Action, Activity, WorldCtx } from './activity';
import { randomRider, sit } from './npc';

const STATIONS: Station[] = ['grill', 'fryer', 'drinks', 'icecream', 'board', 'bin', 'counter', 'window'];
const WALK = 3;
const DRIVE = 7;
const CAR_COLORS = ['#e03131', '#1c7ed6', '#f59f00', '#7048e8', '#2b8a3e', '#f783ac'];

interface Guest {
  c: Customer;
  rig: Rig;
  pos: THREE.Vector3;
  car: THREE.Group | null;
  bubble: THREE.Sprite | null;
  bubbleKey: string;
}

const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

export class BurgerWorld implements Activity {
  private r = new Restaurant();
  private guests = new Map<number, Guest>();
  private group = new THREE.Group();
  private hands = document.createElement('div');
  private handsKey = '';
  private patties: THREE.Mesh[] = [];
  private basket: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];
  private pattyMat = { raw: this.mat('#f783ac'), done: this.mat('#8a5a2b'), burnt: this.mat('#212529') };
  private fryMats = { empty: this.mat('#ced4da'), frying: this.mat('#ffd8a8'), ready: this.mat('#ffd43b') };

  constructor(private ctx: WorldCtx) {
    ctx.scene.add(this.group);
    this.hands.className = 'pill hands';
    ctx.ui.root.append(this.hands);
    // Patties on the grill and the fries basket.
    const [gx, gy, gz] = BURGER_SPOTS.grill;
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.8, 0.18, 0.8)), this.pattyMat.raw);
      p.position.set(gx - 1.1 + i * 1.1, gy + 0.09, gz);
      p.castShadow = true;
      this.group.add(p);
      this.patties.push(p);
    }
    const [fx, fy, fz] = BURGER_SPOTS.fryer;
    this.basket = new THREE.Mesh(this.geo(new THREE.BoxGeometry(1.2, 0.5, 0.9)), this.fryMats.empty);
    this.basket.position.set(fx, fy + 0.3, fz);
    this.group.add(this.basket);
    this.drawHands();
  }

  private mat(color: string) {
    const m = new THREE.MeshLambertMaterial({ color });
    this.disposables.push(m);
    return m;
  }

  private geo<G extends THREE.BufferGeometry>(g: G): G {
    this.disposables.push(g);
    return g;
  }

  // ---------------------------------------------------------------- buttons

  actions(): Action[] {
    const out: Action[] = [];
    for (const tag of this.ctx.sim().zones) {
      if (!STATIONS.includes(tag as Station)) continue;
      for (const a of this.r.actions(tag as Station)) {
        out.push({
          label: a.label,
          run: () => this.handle(this.r.act(a.id)),
          color: a.id.startsWith('serve') ? '#2f9e44' : a.id === 'full' ? '#868e96' : undefined,
        });
      }
    }
    return out;
  }

  private handle(events: BurgerEvent[]) {
    const ui = this.ctx.ui, s = this.ctx.save;
    for (const e of events) {
      switch (e.type) {
        case 'ok':
          if (e.what === 'sizzle') sfx.speed();
          else if (e.what === 'bin') sfx.nope();
          else sfx.click();
          break;
        case 'full':
          sfx.nope();
          ui.toast('🙌 Your hands are full! Serve or throw away', 1600);
          break;
        case 'wrong':
          sfx.nope();
          ui.toast('🤔 They didn’t order that!');
          break;
        case 'gave':
          sfx.checkpoint();
          ui.toast('👍 Yum! What else do they want?', 1400);
          break;
        case 'paid':
          s.stats['burger:served'] = (s.stats['burger:served'] ?? 0) + 1;
          this.ctx.addCoins(e.coins);
          ui.toast(`😀 Thank you! +${e.coins} 🪙${e.tip ? ' (with a tip!)' : ''}`, 1800);
          break;
        case 'star': {
          this.ctx.addCoins(STAR_BONUS);
          this.ctx.complete('burger');
          const p = this.ctx.sim().pos;
          this.ctx.confetti([p[0], p[1] + 2, p[2]]);
          sfx.finish();
          setTimeout(() => ui.toast(`⭐ Star Burger Chef! ${e.served} orders! +${STAR_BONUS} 🪙`, 3000), 1900);
          break;
        }
        case 'arrive':
          ui.toast(e.c.at === 'window' ? '🚗 Beep beep! Drive-thru!' : '🛎️ A customer!', 1300);
          break;
        case 'gone':
          ui.toast('😢 Someone got tired of waiting', 1600);
          break;
      }
    }
  }

  private drawHands() {
    const key = this.r.hands.join(',') + '|' + this.r.served;
    if (key === this.handsKey) return;
    this.handsKey = key;
    const held = this.r.hands.map((h) => FOOD_EMOJI[h]).join(' ');
    this.hands.textContent = `🖐️ ${held || 'empty'}  ·  🧾 ${this.r.served} served`;
  }

  // ---------------------------------------------------------------- every frame

  update(dt: number, t: number) {
    this.handle(this.r.step(dt));
    this.drawHands();

    // The grill and fryer.
    this.patties.forEach((p, i) => {
      const g = this.r.grill[i];
      p.visible = g !== undefined;
      if (g !== undefined) p.material = g >= BURN_TIME ? this.pattyMat.burnt : g >= COOK_TIME ? this.pattyMat.done : this.pattyMat.raw;
      p.position.y = BURGER_SPOTS.grill[1] + 0.09 + (g !== undefined && g < COOK_TIME ? Math.abs(Math.sin(t * 20 + i)) * 0.03 : 0);
    });
    const f = this.r.fries;
    this.basket.material = f === null ? this.fryMats.empty : f >= FRY_TIME ? this.fryMats.ready : this.fryMats.frying;
    this.basket.position.y = BURGER_SPOTS.fryer[1] + (f !== null && f < FRY_TIME ? -0.1 : 0.3);

    // Guests: add new ones, move everyone, and say goodbye to those who've gone.
    const seen = new Set<number>();
    const lines = { counter: this.r.waiting('counter'), window: this.r.waiting('window') };
    for (const c of this.r.customers) {
      seen.add(c.id);
      let g = this.guests.get(c.id);
      if (!g) g = this.addGuest(c);
      const spots = c.at === 'window' ? BURGER_SPOTS.window : BURGER_SPOTS.counter;
      const k = lines[c.at].indexOf(c);
      let target: THREE.Vector3;
      if (c.state === 'leaving') target = c.at === 'window' ? v(BURGER_SPOTS.carTo) : v(BURGER_SPOTS.door).setZ(26);
      else target = v(spots[Math.min(k, spots.length - 1)]);
      // Counter customers come and go through the door.
      if (c.at === 'counter' && c.state === 'leaving' && g.pos.z < 10.5) target = new THREE.Vector3(0, 0, 11);
      const to = target.clone().sub(g.pos);
      const d = to.length();
      const speed = c.at === 'window' ? DRIVE : WALK;
      const step = Math.min(d, speed * dt);
      if (d > 0.01) g.pos.addScaledVector(to, step / d);
      const moving = d > 0.05;
      if (g.car) {
        g.car.position.copy(g.pos);
        g.rig.root.position.set(g.pos.x - 0.45, 0.35, g.pos.z + 0.2);
        g.rig.root.rotation.set(0, Math.PI, 0);
        g.rig.root.scale.setScalar(0.8);
        sit(g.rig);
      } else {
        g.rig.root.position.copy(g.pos);
        g.rig.root.rotation.set(0, moving ? Math.atan2(to.x, to.z) : Math.PI, 0);
        animate(g.rig, t + c.id, moving ? WALK : 0, false);
      }
      this.drawBubble(g, t);
    }
    for (const [id, g] of this.guests) {
      if (seen.has(id)) continue;
      g.rig.dispose();
      g.car?.removeFromParent();
      if (g.bubble) {
        g.bubble.material.map?.dispose();
        g.bubble.material.dispose();
        g.bubble.removeFromParent();
      }
      this.guests.delete(id);
    }
  }

  private addGuest(c: Customer): Guest {
    const rig = randomRider();
    this.group.add(rig.root);
    let car: THREE.Group | null = null;
    const pos = v(c.at === 'window' ? BURGER_SPOTS.carFrom : BURGER_SPOTS.door);
    if (c.at === 'window') {
      car = new THREE.Group();
      const paint = this.mat(CAR_COLORS[c.id % CAR_COLORS.length]);
      const part = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
        const mesh = new THREE.Mesh(this.geo(new THREE.BoxGeometry(w, h, d)), m);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        car!.add(mesh);
      };
      part(2.2, 0.8, 4.2, 0, 0.75, 0, paint);
      part(2.0, 0.12, 1.6, 0, 1.2, -1.3, this.mat('#a5d8ff')); // windscreen (open top, so you can see the driver)
      for (const [x, z] of [[1, 1.4], [-1, 1.4], [1, -1.4], [-1, -1.4]]) part(0.4, 0.7, 0.7, x, 0.35, z, this.mat('#212529'));
      part(0.5, 0.3, 0.1, 0.6, 0.85, -2.1, this.mat('#fff3bf'));
      part(0.5, 0.3, 0.1, -0.6, 0.85, -2.1, this.mat('#fff3bf'));
      this.group.add(car);
    }
    const g: Guest = { c, rig, pos, car, bubble: null, bubbleKey: '' };
    this.guests.set(c.id, g);
    return g;
  }

  /** The speech bubble: what they want (✅ when given), and how they're feeling. */
  private drawBubble(g: Guest, t: number) {
    const c = g.c;
    let key = '';
    if (c.state === 'waiting') {
      const got = [...c.got];
      const items = c.wants.map((w) => {
        const i = got.indexOf(w);
        if (i >= 0) {
          got.splice(i, 1);
          return '✅';
        }
        return FOOD_EMOJI[w];
      });
      key = `${mood(c)} ${items.join(' ')}`;
    } else if (c.state === 'leaving') key = c.happy ? '😋 Yum!' : '😢 Bye';
    if (key !== g.bubbleKey) {
      g.bubbleKey = key;
      if (g.bubble) {
        g.bubble.material.map?.dispose();
        g.bubble.material.dispose();
        g.bubble.removeFromParent();
        g.bubble = null;
      }
      if (key) {
        const { tex, aspect } = labelTex(key, '#ffffff', '#212529');
        g.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
        const h = 0.9;
        g.bubble.scale.set(h * aspect, h, 1);
        this.group.add(g.bubble);
      }
    }
    if (g.bubble) g.bubble.position.set(g.pos.x, (g.car ? 3.4 : 3.2) + Math.sin(t * 3 + c.id) * 0.08, g.pos.z);
  }

  locked() {
    return false;
  }

  pose() {
    return false;
  }

  camera() {
    return false;
  }

  dispose() {
    for (const g of this.guests.values()) {
      g.rig.dispose();
      g.bubble?.material.map?.dispose();
      g.bubble?.material.dispose();
    }
    for (const d of this.disposables) d.dispose();
    this.hands.remove();
    this.group.removeFromParent();
  }
}
