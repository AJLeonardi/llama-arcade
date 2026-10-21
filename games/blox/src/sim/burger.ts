// Llama Burgers: run a burger and fries place. Customers come to the counter, and cars come to the
// drive-through window. Cook patties on the grill, make burgers on the board, fry fries, pour drinks,
// then serve. No rush: customers wait a long time, and if one gives up they just go home.
// Pure rules, no three.js: tested in tests/burger.test.ts.
import type { Block, Level } from './types';

export type Food = 'burger' | 'cheese' | 'fries' | 'drink' | 'icecream';
/** What you can carry: food, a cooked patty on its way to the board, or something burnt. */
export type Held = Food | 'patty' | 'burnt';

export const FOOD_EMOJI: Record<Held, string> = {
  burger: '🍔', cheese: '🧀🍔', fries: '🍟', drink: '🥤', icecream: '🍦', patty: '🥩', burnt: '⚫',
};
export const FOOD_NAME: Record<Food, string> = {
  burger: 'burger', cheese: 'cheeseburger', fries: 'fries', drink: 'drink', icecream: 'ice cream',
};

export const COOK_TIME = 5; // a patty is cooked after this long on the grill (s)
export const BURN_TIME = 20; // ...and burnt after this long
export const FRY_TIME = 6;
export const GRILL_SPOTS = 3;
export const HANDS = 4;
const WALK_IN = 4; // customers take this long to walk up (s)
const WALK_OUT = 4;
export const PER_ITEM = 2; // coins for each thing in an order
export const TIP = 2; // extra for serving before they get grumpy
export const STAR_EVERY = 10; // a bonus for every 10 orders served
export const STAR_BONUS = 15;

export type Spot = 'counter' | 'window';

export interface Customer {
  id: number;
  at: Spot;
  wants: Food[];
  got: Food[];
  /** Seconds of patience left, and how much they had. */
  patience: number;
  max: number;
  state: 'coming' | 'waiting' | 'leaving';
  /** Time left in the current walk (coming or leaving). */
  timer: number;
  happy: boolean;
}

export type Station = 'grill' | 'fryer' | 'drinks' | 'icecream' | 'board' | 'bin' | 'counter' | 'window';

export interface Act {
  id: string;
  label: string;
}

export type BurgerEvent =
  | { type: 'arrive'; c: Customer }
  | { type: 'paid'; c: Customer; coins: number; tip: boolean }
  | { type: 'gave'; c: Customer }
  | { type: 'wrong' }
  | { type: 'gone'; c: Customer }
  | { type: 'star'; served: number }
  | { type: 'full' }
  | { type: 'ok'; what: string };

export class Restaurant {
  t = 0;
  hands: Held[] = [];
  /** Patties on the grill: how long each has cooked. */
  grill: number[] = [];
  /** Fries in the fryer: how long they've cooked, or null if the basket's empty. */
  fries: number | null = null;
  customers: Customer[] = [];
  served = 0;
  private nextId = 1;
  private nextCounter = 3;
  private nextCar = 14;

  /** `auto`: customers turn up by themselves (the tests turn it off to add their own). */
  constructor(private rnd: () => number = Math.random, private auto = true) {}

  waiting(at: Spot) {
    return this.customers.filter((c) => c.at === at && c.state !== 'leaving');
  }

  /** The customer being served at a spot (the front of the line, once they've walked up). */
  front(at: Spot) {
    const c = this.waiting(at)[0];
    return c && c.state === 'waiting' ? c : null;
  }

  step(dt: number): BurgerEvent[] {
    const ev: BurgerEvent[] = [];
    this.t += dt;
    this.grill = this.grill.map((g) => g + dt);
    if (this.fries !== null) this.fries += dt;

    // New customers, a few at a time.
    this.nextCounter -= dt;
    this.nextCar -= dt;
    const busy = this.customers.filter((c) => c.state !== 'leaving').length;
    if (this.nextCounter <= 0 && this.auto) {
      this.nextCounter = 14 + this.rnd() * 10;
      if (this.waiting('counter').length < 3 && busy < 4) ev.push({ type: 'arrive', c: this.add('counter') });
    }
    if (this.nextCar <= 0 && this.auto) {
      this.nextCar = 22 + this.rnd() * 14;
      if (this.waiting('window').length < 2 && busy < 4) ev.push({ type: 'arrive', c: this.add('window') });
    }

    for (const c of this.customers) {
      if (c.state === 'coming') {
        c.timer -= dt;
        if (c.timer <= 0) c.state = 'waiting';
      } else if (c.state === 'waiting') {
        // Only the one at the front gets impatient; the rest are happy chatting in the line.
        if (this.front(c.at) === c) c.patience -= dt;
        if (c.patience <= 0) {
          this.leave(c, false);
          ev.push({ type: 'gone', c });
        }
      } else c.timer -= dt;
    }
    this.customers = this.customers.filter((c) => c.state !== 'leaving' || c.timer > 0);
    return ev;
  }

  /** A new customer with an order: small at first, bigger as you get better. */
  add(at: Spot, wants?: Food[]): Customer {
    const foods: Food[] = ['burger', 'cheese', 'fries', 'drink', 'icecream'];
    const n = Math.min(4, 1 + Math.floor(this.rnd() * (1.5 + this.served / 4)));
    const order = wants ?? Array.from({ length: n }, () => foods[Math.floor(this.rnd() * foods.length)]);
    const max = 80 + order.length * 20;
    const c: Customer = { id: this.nextId++, at, wants: order, got: [], patience: max, max, state: 'coming', timer: WALK_IN, happy: true };
    this.customers.push(c);
    return c;
  }

  private leave(c: Customer, happy: boolean) {
    c.state = 'leaving';
    c.timer = WALK_OUT;
    c.happy = happy;
  }

  /** What you can do at a station right now. */
  actions(at: Station): Act[] {
    const out: Act[] = [];
    const full = this.hands.length >= HANDS;
    switch (at) {
      case 'grill':
        if (this.grill.length < GRILL_SPOTS) out.push({ id: 'grill-add', label: '🥩 Cook a patty' });
        if (this.grill.some((g) => g >= COOK_TIME)) out.push({ id: 'grill-take', label: '🍳 Take patty' });
        break;
      case 'fryer':
        if (this.fries === null) out.push({ id: 'fry', label: '🍟 Fry fries' });
        else if (this.fries >= FRY_TIME) out.push({ id: 'fry-take', label: '🍟 Take fries' });
        break;
      case 'drinks':
        out.push({ id: 'drink', label: '🥤 Pour a drink' });
        break;
      case 'icecream':
        out.push({ id: 'icecream', label: '🍦 Ice cream' });
        break;
      case 'board':
        if (this.hands.includes('patty')) {
          out.push({ id: 'make-burger', label: '🍔 Make burger' }, { id: 'make-cheese', label: '🧀 Cheeseburger' });
        }
        break;
      case 'bin':
        if (this.hands.length) out.push({ id: 'bin', label: '🗑️ Throw away' });
        break;
      case 'counter':
      case 'window':
        if (this.front(at) && this.hands.length) out.push({ id: `serve-${at}`, label: '🛎️ Serve' });
        break;
    }
    return full ? out.filter((a) => !['grill-take', 'fry-take', 'drink', 'icecream'].includes(a.id)).concat(
      ['grill', 'fryer', 'drinks', 'icecream'].includes(at) ? [{ id: 'full', label: '🙌 Hands full!' }] : [],
    ) : out;
  }

  act(id: string): BurgerEvent[] {
    const take = (h: Held): BurgerEvent[] => {
      if (this.hands.length >= HANDS) return [{ type: 'full' }];
      this.hands.push(h);
      return [{ type: 'ok', what: h }];
    };
    switch (id) {
      case 'grill-add':
        if (this.grill.length < GRILL_SPOTS) this.grill.push(0);
        return [{ type: 'ok', what: 'sizzle' }];
      case 'grill-take': {
        // Take the most cooked one.
        let i = -1;
        this.grill.forEach((g, k) => g >= COOK_TIME && (i < 0 || g > this.grill[i]) && (i = k));
        if (i < 0 || this.hands.length >= HANDS) return [{ type: 'full' }];
        const g = this.grill.splice(i, 1)[0];
        return take(g >= BURN_TIME ? 'burnt' : 'patty');
      }
      case 'fry':
        this.fries = 0;
        return [{ type: 'ok', what: 'sizzle' }];
      case 'fry-take':
        if (this.hands.length >= HANDS) return [{ type: 'full' }];
        this.fries = null;
        return take('fries');
      case 'drink':
        return take('drink');
      case 'icecream':
        return take('icecream');
      case 'make-burger':
      case 'make-cheese': {
        const i = this.hands.indexOf('patty');
        if (i < 0) return [];
        this.hands[i] = id === 'make-cheese' ? 'cheese' : 'burger';
        return [{ type: 'ok', what: this.hands[i] }];
      }
      case 'bin':
        this.hands = [];
        return [{ type: 'ok', what: 'bin' }];
      case 'serve-counter':
      case 'serve-window':
        return this.serve(id === 'serve-counter' ? 'counter' : 'window');
    }
    return [];
  }

  /** Hand over whatever they still want from what you're carrying. */
  serve(at: Spot): BurgerEvent[] {
    const c = this.front(at);
    if (!c) return [];
    const need = [...c.wants];
    for (const g of c.got) need.splice(need.indexOf(g), 1);
    let gave = false;
    for (let i = 0; i < this.hands.length; i++) {
      const h = this.hands[i] as Food;
      const k = need.indexOf(h);
      if (k >= 0) {
        need.splice(k, 1);
        c.got.push(h);
        this.hands.splice(i--, 1);
        gave = true;
      }
    }
    if (!gave) return [{ type: 'wrong' }];
    if (need.length) return [{ type: 'gave', c }];
    const tip = c.patience > c.max / 2;
    const coins = c.wants.length * PER_ITEM + (tip ? TIP : 0);
    this.leave(c, true);
    this.served++;
    const ev: BurgerEvent[] = [{ type: 'paid', c, coins, tip }];
    if (this.served % STAR_EVERY === 0) ev.push({ type: 'star', served: this.served });
    return ev;
  }
}

/** The happy/okay/grumpy face for a customer's patience. */
export const mood = (c: Customer) => (c.patience > c.max / 2 ? '😀' : c.patience > c.max / 5 ? '😐' : '😟');

// ---------------------------------------------------------------- the restaurant building

/** Where things are, for the view. */
export const BURGER_SPOTS = {
  door: [0, 0, 16] as [number, number, number],
  counter: [[-4, 0, 0.6], [-4, 0, 2.8], [-4, 0, 5]] as [number, number, number][],
  window: [[15.5, 0, -5], [15.5, 0, 2], [15.5, 0, 9]] as [number, number, number][],
  carFrom: [15.5, 0, 50] as [number, number, number],
  carTo: [15.5, 0, -50] as [number, number, number],
  grill: [-8, 1, -9] as [number, number, number],
  fryer: [-3.5, 1, -9] as [number, number, number],
};

export function burgerPlace(): Level {
  const blocks: Block[] = [];
  const box = (x: number, y0: number, z: number, w: number, h: number, d: number, color: string, more: Partial<Block> = {}) =>
    blocks.push({ x, y: y0 + h / 2, z, w, h, d, kind: 'solid', color, ...more });
  const zone = (x: number, z: number, w: number, d: number, tag: Station) =>
    blocks.push({ x, y: 1.2, z, w, h: 2.4, d, kind: 'zone', color: '#000', tag });
  const W = '#fff4e6', H = 2.4; // low walls, so the camera can see over them

  box(0, -1, 0, 140, 1, 140, '#8ce99a');
  box(0, -0.98, 0, 24, 1, 20, '#f1f3f5'); // floor
  box(0, -0.97, -6, 24, 1, 8, '#ffe8cc'); // kitchen tiles
  box(15.5, -0.98, 0, 5, 1, 140, '#495057', { deco: true }); // the drive-through lane
  box(0, -0.98, 20, 4, 1, 20, '#dee2e6', { deco: true }); // path to the door
  // Walls: a door in the front (south) and the drive-through window on the east side.
  box(0, 0, -10.25, 24.5, H, 0.5, W);
  box(-12.25, 0, 0, 0.5, H, 20, W);
  box(12.25, 0, -8.25, 0.5, H, 3.5, W);
  box(12.25, 0, 3.25, 0.5, H, 13.5, W);
  box(12.25, 0, -5, 0.5, 1, 3, W);
  box(12.25, 2.1, -5, 0.5, H - 2.1, 3, W);
  box(13.2, 1, -5, 1.4, 0.15, 3, '#e8590c'); // the window ledge
  box(-7, 0, 10.25, 10.5, H, 0.5, W);
  box(7, 0, 10.25, 10.5, H, 0.5, W);
  // The counter between the kitchen and the tables (you can hop over it, but you don't need to).
  box(-4, 0, -1.5, 16, 1.1, 1, '#e8590c');
  box(-4, 1.1, -1.5, 16.4, 0.12, 1.2, '#ffd43b');
  box(9, 0, -1.5, 6, 1.1, 1, '#e8590c');
  // Kitchen stations along the back wall, each with a zone in front where its buttons appear.
  box(-8, 0, -9.2, 3.4, 1, 1.6, '#495057'); // grill
  zone(-8, -7.6, 3.4, 1.6, 'grill');
  box(-3.5, 0, -9.2, 2.6, 1, 1.6, '#adb5bd'); // fryer
  zone(-3.5, -7.6, 2.6, 1.6, 'fryer');
  box(0.6, 0, -9.2, 2.6, 2.2, 1.6, '#e03131'); // drinks machine
  zone(0.6, -7.6, 2.6, 1.6, 'drinks');
  box(4.6, 0, -9.2, 2.6, 2, 1.6, '#f783ac'); // ice cream machine
  zone(4.6, -7.6, 2.6, 1.6, 'icecream');
  box(9, 0, -9.2, 1.2, 1.1, 1.2, '#2b8a3e'); // bin
  zone(9, -7.6, 2.4, 1.6, 'bin');
  // The assembly board in the middle.
  box(-3, 0, -5, 4, 1, 1.4, '#c08b5c');
  box(-3, 1, -5, 3.6, 0.08, 1.1, '#f8f9fa');
  zone(-3, -5, 6, 3, 'board');
  zone(-4, -2.6, 8, 1.2, 'counter');
  zone(10.6, -5, 2, 3, 'window');
  // Tables and stools for looks.
  for (const [x, z] of [[-9, 4], [-9, 8], [5, 4], [5, 8], [9, 6]]) {
    box(x, 0, z, 2, 0.9, 2, '#4dabf7');
    for (const s of [-1.3, 1.3]) box(x + s, 0, z, 0.6, 0.5, 0.6, '#ffd43b');
  }
  // A portal home, in the kitchen corner.
  box(-11.6, 0, -6.4, 0.6, 4, 0.6, '#f1f3f5');
  box(-11.6, 0, -2.6, 0.6, 4, 0.6, '#f1f3f5');
  blocks.push({ x: -11.7, y: 2, z: -4.5, w: 0.4, h: 4, d: 3.2, kind: 'portal', color: '#3bb273', level: 'hub' });
  return {
    id: 'burger',
    name: 'Llama Burgers',
    emoji: '🍔',
    spawn: [-3, 0, -7],
    spawnYaw: Math.PI,
    blocks,
    coins: [],
    reward: 0,
    fallY: -10,
    sky: ['#74c0fc', '#fff3bf'],
    signs: [
      { at: [0, 4.5, 10.5], text: '🍔 Llama Burgers 🍟', color: '#e03131', size: 1.4 },
      { at: [15.5, 4.5, -8.5], text: '🚗 Drive-Thru', color: '#f08c00' },
      { at: [-8, 2.2, -9.6], text: '🍳 Grill', color: '#495057', size: 0.6 },
      { at: [-3.5, 2.2, -9.6], text: '🍟 Fryer', color: '#868e96', size: 0.6 },
      { at: [0.6, 3, -9.6], text: '🥤 Drinks', color: '#e03131', size: 0.6 },
      { at: [4.6, 2.8, -9.6], text: '🍦 Ice cream', color: '#e64980', size: 0.6 },
      { at: [-3, 2, -5], text: '🍔 Burger board', color: '#c08b5c', size: 0.6 },
    ],
  };
}
