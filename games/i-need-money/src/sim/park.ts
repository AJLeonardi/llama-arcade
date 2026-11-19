// The whole park as plain numbers: money, rides, guests, workers and mechanics. No three.js or DOM.
// +x east, +z south. The gate is at the south edge (z = GATE_Z); guests come in there.
import { RIDE_BY_ID, RideType, biggerCost, dropCycle, dropRiders, dropTicket, hireCost } from './catalog';

export const HALF = 150; // the park is a square, -HALF..HALF
export const GATE_Z = HALF - 4;
export const START_MONEY = 5;
const MAX_GUESTS = 120;
/** You collect a ride's cash when you're this close to its edge. */
export const COLLECT_DIST = 5;

export interface Ride {
  id: number;
  type: string;
  x: number;
  z: number;
  /** Which way the entrance faces (radians; 0 = south). */
  rot: number;
  level: number;
  cash: number;
  broken: boolean;
  /** Repair progress 0..1 while someone is fixing it. */
  fix: number;
  queue: number[];
  riders: number[];
  running: boolean;
  /** 0..1 through the current go. */
  phase: number;
  wait: number;
  /** Seconds per go (the view can change it for coasters). */
  cycle: number;
  /** Seconds since it was built (the view grows it in). */
  age: number;
}

export interface Guest {
  id: number;
  x: number;
  z: number;
  state: 'walk' | 'queue' | 'ride' | 'leave';
  target: number;
  ridesLeft: number;
  speed: number;
  color: number;
  tipWait: number;
}

export interface Helper {
  kind: 'worker' | 'mechanic';
  x: number;
  z: number;
  target: number;
  carrying: number;
}

export type ParkEvent =
  | { t: 'collect'; amount: number; x: number; z: number; by: 'you' | 'worker' }
  | { t: 'tip'; amount: number; x: number; z: number }
  | { t: 'broke'; ride: number }
  | { t: 'fixed'; ride: number }
  | { t: 'go'; ride: number };

export interface Save {
  money: number;
  earned: number;
  rides: { type: string; x: number; z: number; rot: number; level: number }[];
  workers: number;
  mechanics: number;
}

const GUEST_COLORS = [0xf1e3c8, 0xffffff, 0xc89f6c, 0x8d6e4c, 0xe8d5b7, 0xfff0d4, 0x5c4033, 0xd9c2a5];

export class Park {
  money = START_MONEY;
  earned = 0;
  rides: Ride[] = [];
  guests: Guest[] = [];
  helpers: Helper[] = [];
  private nextId = 1;
  private spawnWait = 2;
  /** The ride you're fixing yourself, if any. */
  youFixing = -1;

  constructor(private rand: () => number = Math.random) {}

  type(r: Ride): RideType {
    return RIDE_BY_ID[r.type];
  }
  ticket(r: Ride) {
    return r.type === 'drop' ? dropTicket(r.level) : this.type(r).ticket;
  }
  seats(r: Ride) {
    return r.type === 'drop' ? dropRiders(r.level) : this.type(r).riders;
  }
  ride(id: number) {
    return this.rides.find((r) => r.id === id);
  }
  count(kind: Helper['kind']) {
    return this.helpers.filter((h) => h.kind === kind).length;
  }

  // ---- building ----

  /** Why you can't build here, or null if you can. */
  blocked(typeId: string, x: number, z: number): string | null {
    const t = RIDE_BY_ID[typeId];
    if (Math.abs(x) > HALF - t.r - 2 || Math.abs(z) > HALF - t.r - 2) return 'Too close to the fence';
    if (Math.abs(x) < t.r + 3 && z > GATE_Z - t.r - 12) return 'That blocks the gate';
    for (const r of this.rides) {
      if (Math.hypot(r.x - x, r.z - z) < this.type(r).r + t.r + 1) return 'Something is in the way';
    }
    return null;
  }

  canAfford(cost: number) {
    return this.money >= cost;
  }

  build(typeId: string, x: number, z: number, rot = 0): Ride | null {
    const t = RIDE_BY_ID[typeId];
    if (!t || !this.canAfford(t.cost) || this.blocked(typeId, x, z)) return null;
    this.money -= t.cost;
    return this.add(typeId, x, z, rot, 0, 0);
  }

  private add(type: string, x: number, z: number, rot: number, level: number, age: number): Ride {
    const r: Ride = {
      id: this.nextId++, type, x, z, rot, level, cash: 0, broken: false, fix: 0,
      queue: [], riders: [], running: false, phase: 0, wait: 0,
      cycle: type === 'drop' ? dropCycle(level) : RIDE_BY_ID[type].cycle, age,
    };
    this.rides.push(r);
    return r;
  }

  /** Make the Up-and-Down Tower bigger. */
  bigger(id: number) {
    const r = this.ride(id);
    if (!r || !this.type(r).grows) return false;
    const cost = biggerCost(r.level);
    if (!this.canAfford(cost)) return false;
    this.money -= cost;
    r.level++;
    r.cycle = dropCycle(r.level);
    return true;
  }

  sellPrice(r: Ride) {
    let paid = this.type(r).cost;
    for (let l = 0; l < r.level; l++) paid += biggerCost(l);
    return Math.floor(paid / 2);
  }

  sell(id: number) {
    const r = this.ride(id);
    if (!r) return false;
    this.money += this.sellPrice(r) + r.cash;
    for (const g of [...r.queue, ...r.riders]) this.redirect(g);
    this.rides = this.rides.filter((x) => x !== r);
    for (const h of this.helpers) if (h.target === id) h.target = -1;
    return true;
  }

  hire(kind: Helper['kind']) {
    const cost = hireCost(kind, this.count(kind));
    if (!this.canAfford(cost)) return false;
    this.money -= cost;
    this.helpers.push({ kind, x: (this.rand() - 0.5) * 6, z: GATE_Z - 6, target: -1, carrying: 0 });
    return true;
  }

  /** Where guests line up for a ride. */
  entrance(r: Ride) {
    const d = this.type(r).r + 1;
    return { x: r.x + Math.sin(r.rot) * d, z: r.z + Math.cos(r.rot) * d };
  }

  // ---- one step of time ----

  step(dt: number, you: { x: number; z: number } | null): ParkEvent[] {
    const ev: ParkEvent[] = [];
    this.spawn(dt);
    for (const r of this.rides) this.stepRide(r, dt, ev);
    this.stepGuests(dt, you, ev);
    this.stepHelpers(dt, ev);
    if (you) this.stepYou(dt, you, ev);
    return ev;
  }

  private working() {
    return this.rides.filter((r) => !r.broken && r.age > 1.5);
  }

  private spawn(dt: number) {
    const open = this.working();
    if (!open.length) return;
    const cap = Math.min(MAX_GUESTS, 6 + 4 * this.rides.length + open.reduce((s, r) => s + r.level, 0));
    this.spawnWait -= dt;
    if (this.spawnWait > 0 || this.guests.length >= cap) return;
    this.spawnWait = Math.max(0.35, 5 / (1 + 0.6 * this.rides.length));
    const g: Guest = {
      id: this.nextId++, x: (this.rand() - 0.5) * 6, z: HALF + 2, state: 'walk', target: -1,
      ridesLeft: 2 + Math.floor(this.rand() * 4), speed: 3.2 + this.rand() * 1.6,
      color: GUEST_COLORS[Math.floor(this.rand() * GUEST_COLORS.length)], tipWait: 0,
    };
    this.guests.push(g);
    this.pick(g);
  }

  /** Choose a ride for a guest (bigger rides and shorter lines are more likely), or head home. */
  private pick(g: Guest) {
    const open = this.working();
    if (g.ridesLeft <= 0 || !open.length) {
      g.state = 'leave';
      g.target = -1;
      return;
    }
    const w = open.map((r) => (1 + Math.sqrt(this.type(r).cost) + r.level * 3) / (1 + r.queue.length / this.seats(r)));
    let x = this.rand() * w.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < w.length - 1 && x > w[i]) x -= w[i++];
    g.target = open[i].id;
    g.state = 'walk';
  }

  private redirect(id: number) {
    const g = this.guests.find((q) => q.id === id);
    if (g) this.pick(g);
  }

  private stepRide(r: Ride, dt: number, ev: ParkEvent[]) {
    r.age += dt;
    if (r.broken) return;
    if (r.running) {
      r.phase += dt / r.cycle;
      if (r.phase >= 1) {
        r.phase = 0;
        r.running = false;
        const out = r.riders;
        r.riders = [];
        const e = this.entrance(r);
        for (const id of out) {
          const g = this.guests.find((q) => q.id === id);
          if (!g) continue;
          g.ridesLeft--;
          g.x = e.x + (this.rand() - 0.5) * 3;
          g.z = e.z + (this.rand() - 0.5) * 3;
          this.pick(g);
        }
        if (this.rand() < this.type(r).breaks) {
          r.broken = true;
          r.fix = 0;
          for (const id of r.queue) this.redirect(id);
          r.queue = [];
          ev.push({ t: 'broke', ride: r.id });
        }
      }
      return;
    }
    if (!r.queue.length) {
      r.wait = 0;
      return;
    }
    r.wait += dt;
    const seats = this.seats(r);
    if (r.queue.length >= seats || r.wait > 2) {
      r.riders = r.queue.splice(0, seats);
      r.cash += this.ticket(r) * r.riders.length;
      for (const id of r.riders) {
        const g = this.guests.find((q) => q.id === id);
        if (g) g.state = 'ride';
      }
      r.running = true;
      r.phase = 0;
      r.wait = 0;
      ev.push({ t: 'go', ride: r.id });
    }
  }

  private stepGuests(dt: number, you: { x: number; z: number } | null, ev: ParkEvent[]) {
    for (const g of this.guests) {
      if (g.state === 'ride') continue;
      let tx: number, tz: number;
      if (g.state === 'leave') {
        tx = g.x * 0.9;
        tz = HALF + 3;
      } else {
        const r = this.ride(g.target);
        if (!r || r.broken) {
          this.pick(g);
          continue;
        }
        const e = this.entrance(r);
        if (g.state === 'queue') {
          // Stand in line, one behind the other, going out from the entrance.
          const i = r.queue.indexOf(g.id);
          const k = 1.1 * i;
          tx = e.x + Math.sin(r.rot) * k;
          tz = e.z + Math.cos(r.rot) * k;
        } else {
          (tx = e.x), (tz = e.z);
        }
      }
      const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
      const step = g.speed * dt;
      if (d > step) {
        g.x += (dx / d) * step;
        g.z += (dz / d) * step;
      } else {
        g.x = tx;
        g.z = tz;
        if (g.state === 'walk') {
          const r = this.ride(g.target)!;
          g.state = 'queue';
          r.queue.push(g.id);
        }
      }
      // Happy guests sometimes hand you a tip when they walk past.
      g.tipWait -= dt;
      if (you && g.tipWait <= 0 && Math.hypot(you.x - g.x, you.z - g.z) < 3) {
        g.tipWait = 30;
        if (this.rand() < 0.5) {
          this.money += 1;
          this.earned += 1;
          ev.push({ t: 'tip', amount: 1, x: g.x, z: g.z });
        }
      }
    }
    this.guests = this.guests.filter((g) => !(g.state === 'leave' && g.z > HALF + 2));
  }

  private stepHelpers(dt: number, ev: ParkEvent[]) {
    for (const h of this.helpers) {
      let r = h.target >= 0 ? this.ride(h.target) : undefined;
      if (h.kind === 'mechanic') {
        if (!r || !r.broken) r = this.nearest(h, (q) => q.broken && !this.helpers.some((o) => o !== h && o.target === q.id));
      } else if (!r || r.cash <= 0) {
        // Go to the ride with the most cash waiting.
        r = this.rides.filter((q) => q.cash > 0).sort((a, b) => b.cash - a.cash)[0];
      }
      h.target = r ? r.id : -1;
      const goal = r ? this.entrance(r) : { x: h.kind === 'worker' ? -6 : 6, z: GATE_Z - 8 };
      const dx = goal.x - h.x, dz = goal.z - h.z, d = Math.hypot(dx, dz);
      const speed = 7;
      if (d > 1.5) {
        h.x += (dx / d) * Math.min(d, speed * dt);
        h.z += (dz / d) * Math.min(d, speed * dt);
        continue;
      }
      if (!r) continue;
      if (h.kind === 'worker' && r.cash > 0) {
        const amount = r.cash;
        r.cash = 0;
        this.money += amount;
        this.earned += amount;
        ev.push({ t: 'collect', amount, x: r.x, z: r.z, by: 'worker' });
        h.target = -1;
      } else if (h.kind === 'mechanic' && r.broken) {
        this.repair(r, dt / 3, ev);
      }
    }
  }

  private nearest(p: { x: number; z: number }, ok: (r: Ride) => boolean) {
    let best: Ride | undefined, bd = Infinity;
    for (const r of this.rides) {
      if (!ok(r)) continue;
      const d = Math.hypot(r.x - p.x, r.z - p.z);
      if (d < bd) (bd = d), (best = r);
    }
    return best;
  }

  private repair(r: Ride, amount: number, ev: ParkEvent[]) {
    r.fix += amount;
    if (r.fix >= 1) {
      r.broken = false;
      r.fix = 0;
      r.running = false;
      r.phase = 0;
      if (this.youFixing === r.id) this.youFixing = -1;
      ev.push({ t: 'fixed', ride: r.id });
    }
  }

  /** The ride you're standing next to (closest edge within reach). */
  near(you: { x: number; z: number }, reach = COLLECT_DIST) {
    let best: Ride | undefined, bd = Infinity;
    for (const r of this.rides) {
      const d = Math.hypot(r.x - you.x, r.z - you.z) - this.type(r).r;
      if (d < reach && d < bd) (bd = d), (best = r);
    }
    return best;
  }

  private stepYou(dt: number, you: { x: number; z: number }, ev: ParkEvent[]) {
    for (const r of this.rides) {
      if (r.cash > 0 && Math.hypot(r.x - you.x, r.z - you.z) - this.type(r).r < COLLECT_DIST) {
        ev.push({ t: 'collect', amount: r.cash, x: r.x, z: r.z, by: 'you' });
        this.money += r.cash;
        this.earned += r.cash;
        r.cash = 0;
      }
    }
    if (this.youFixing >= 0) {
      const r = this.ride(this.youFixing);
      if (!r || !r.broken) this.youFixing = -1;
      else if (Math.hypot(r.x - you.x, r.z - you.z) - this.type(r).r < COLLECT_DIST + 2) this.repair(r, dt / 6, ev);
      else this.youFixing = -1;
    }
  }

  // ---- saving ----

  save(): Save {
    return {
      money: this.money,
      earned: this.earned,
      rides: this.rides.map((r) => ({ type: r.type, x: r.x, z: r.z, rot: r.rot, level: r.level })),
      workers: this.count('worker'),
      mechanics: this.count('mechanic'),
    };
  }

  static load(s: Partial<Save> | null | undefined, rand?: () => number) {
    const p = new Park(rand);
    if (!s) return p;
    p.money = Number.isFinite(s.money) ? Math.max(0, s.money!) : START_MONEY;
    p.earned = Number.isFinite(s.earned) ? s.earned! : 0;
    for (const r of s.rides ?? []) {
      if (RIDE_BY_ID[r.type] && Number.isFinite(r.x) && Number.isFinite(r.z)) {
        p.add(r.type, r.x, r.z, r.rot || 0, Math.max(0, Math.floor(r.level || 0)), 10);
      }
    }
    for (let i = 0; i < (s.workers ?? 0); i++) p.helpers.push({ kind: 'worker', x: -6 - i, z: GATE_Z - 8, target: -1, carrying: 0 });
    for (let i = 0; i < (s.mechanics ?? 0); i++) p.helpers.push({ kind: 'mechanic', x: 6 + i, z: GATE_Z - 8, target: -1, carrying: 0 });
    return p;
  }
}
