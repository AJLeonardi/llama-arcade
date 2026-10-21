// Rocket Lab: build a rocket from parts, then see how far it gets. It's meant to be very hard: a rocket
// that's too heavy won't lift off, one without fins flips over, and to reach the Moon you need stages.
// The flight is simple physics (thrust, weight, fuel, air, wobble), worked out all at once before it's shown.
// Pure maths, no three.js: tested in tests/rocket.test.ts.
import type { Block, Level, V3 } from './types';

export type PartId = 'engS' | 'engL' | 'tankS' | 'tankL' | 'capsule' | 'nose' | 'split' | 'fins' | 'boost';

export interface PartDef {
  id: PartId;
  name: string;
  emoji: string;
  /** What it does, in a few words for the builder. */
  tip: string;
  /** Mass without fuel, and fuel (tonnes). */
  mass: number;
  fuel: number;
  /** Engines: push (kN) and how much push each tonne of fuel gives (exhaust speed, m/s). */
  thrust: number;
  ve: number;
  /** Height in the stack (m). Fins and boosters go on the side of the part they're added to. */
  height: number;
  side?: boolean;
  color: string;
}

export const PARTS: PartDef[] = [
  { id: 'engS', name: 'Small engine', emoji: '🔥', tip: 'Light, gentle push', mass: 0.5, fuel: 0, thrust: 90, ve: 2400, height: 1.2, color: '#868e96' },
  { id: 'engL', name: 'Big engine', emoji: '💥', tip: 'Heavy, huge push', mass: 1.5, fuel: 0, thrust: 320, ve: 2300, height: 1.8, color: '#495057' },
  { id: 'tankS', name: 'Small tank', emoji: '🛢️', tip: 'A little fuel', mass: 0.3, fuel: 1.5, thrust: 0, ve: 0, height: 1.5, color: '#f8f9fa' },
  { id: 'tankL', name: 'Big tank', emoji: '⛽', tip: 'Lots of fuel, heavy', mass: 0.7, fuel: 4, thrust: 0, ve: 0, height: 3.2, color: '#ff922b' },
  { id: 'capsule', name: 'Llama capsule', emoji: '🦙', tip: 'Your seat! Goes on top', mass: 1.2, fuel: 0, thrust: 0, ve: 0, height: 1.6, color: '#4dabf7' },
  { id: 'nose', name: 'Nose cone', emoji: '🔺', tip: 'Pointy top: slips through the air', mass: 0.2, fuel: 0, thrust: 0, ve: 0, height: 1.4, color: '#e03131' },
  { id: 'split', name: 'Stage splitter', emoji: '✂️', tip: 'Drops the empty part below', mass: 0.15, fuel: 0, thrust: 0, ve: 0, height: 0.4, color: '#ffd43b' },
  { id: 'fins', name: 'Fins', emoji: '🐟', tip: 'Keep it straight (put them low!)', mass: 0.1, fuel: 0, thrust: 0, ve: 0, height: 0, side: true, color: '#e03131' },
  { id: 'boost', name: 'Side boosters', emoji: '🚀', tip: 'Extra push for a while, then drop off', mass: 0.8, fuel: 3, thrust: 260, ve: 2000, height: 0, side: true, color: '#ced4da' },
];
export const part = (id: PartId) => PARTS.find((p) => p.id === id)!;
export const MAX_PARTS = 16;

/** One part in the stack, with what's stuck on its sides. */
export interface Slot {
  part: PartId;
  fins?: boolean;
  boost?: boolean;
}
/** Bottom to top. */
export type Design = Slot[];

/** Add a part: stacked on top, or (fins, boosters) on the side of the top part. Returns false if it can't go. */
export function addPart(d: Design, id: PartId): boolean {
  const p = part(id);
  if (p.side) {
    const top = d.at(-1);
    if (!top || top[id === 'fins' ? 'fins' : 'boost']) return false;
    top[id === 'fins' ? 'fins' : 'boost'] = true;
    return true;
  }
  if (d.length >= MAX_PARTS) return false;
  d.push({ part: id });
  return true;
}

/** Take off the last thing added (side parts first). */
export function undoPart(d: Design) {
  const top = d.at(-1);
  if (!top) return;
  if (top.boost) top.boost = false;
  else if (top.fins) top.fins = false;
  else d.pop();
}

/** Problems that stop a launch, explained. */
export function checkDesign(d: Design): string | null {
  if (!d.length) return 'Add some parts first! Start with an engine 🔥';
  if (!part(d[0].part).thrust) return 'Rockets need an engine at the very bottom! 🔥';
  const cap = d.findIndex((s) => s.part === 'capsule');
  if (cap < 0) return 'The llama needs a capsule to ride in! 🦙';
  if (d.slice(cap + 1).some((s) => s.part !== 'nose') || d.filter((s) => s.part === 'capsule').length > 1) {
    return 'The capsule goes at the top (a nose cone can go on it) 🦙';
  }
  return null;
}

// ---------------------------------------------------------------- numbers for the builder

const G0 = 9.81;

export function massOf(d: Design) {
  let m = 0;
  for (const s of d) {
    const p = part(s.part);
    m += p.mass + p.fuel;
    if (s.fins) m += part('fins').mass;
    if (s.boost) m += part('boost').mass + part('boost').fuel;
  }
  return m;
}

/** The engines that fire at lift-off: the bottom engine and any boosters on the first stage. */
export function liftThrust(d: Design) {
  if (!d.length) return 0;
  let t = part(d[0].part).thrust;
  for (const s of d) {
    if (s.part === 'split') break;
    if (s.boost) t += part('boost').thrust;
  }
  return t;
}

/** Push ÷ weight at lift-off: below 1 it won't leave the pad. */
export const liftRatio = (d: Design) => liftThrust(d) / (massOf(d) * G0 || 1);

/**
 * How well the fins keep it pointing up: positive is steady, negative wobbles over.
 * (The air pushes on the middle of the rocket's side area; the rocket turns about its middle of weight.
 * Steady rockets have their weight higher up than the air's push. Fins low down move the push down.)
 */
export function steadiness(d: Design) {
  let y = 0, m = 0, my = 0, a = 0, ay = 0;
  for (const s of d) {
    const p = part(s.part);
    const mid = y + p.height / 2;
    const mass = p.mass + p.fuel + (s.fins ? part('fins').mass : 0); // boosters balance themselves (they have their own fins)
    m += mass;
    my += mass * mid;
    const area = p.height * (s.part === 'nose' ? 0.5 : 1) + (s.fins ? 5 : 0);
    a += area;
    ay += area * (s.fins ? y + Math.min(p.height, 1) / 2 : mid);
    y += p.height;
  }
  if (!m || !y) return 0;
  return (my / m - ay / a) / y;
}

// ---------------------------------------------------------------- the flight

export const PLANET_R = 600_000; // m
export const CLOUDS = 2_000;
export const SPACE = 70_000;
export const MOON = 12_000_000;
const AIR_H = 6_000; // air thins out by e every this many metres
const STEADY_ENOUGH = 0.05;

export type Place = 'pad' | 'sky' | 'clouds' | 'space' | 'moon' | 'stars';
export type Problem = 'heavy' | 'flip' | 'fuel' | null;

export interface Frame {
  t: number;
  h: number;
  x: number;
  /** Tilt from straight up (radians). */
  tilt: number;
  /** Index of the lowest slot still attached. */
  base: number;
  boosters: boolean;
  firing: boolean;
}

export interface Flight {
  frames: Frame[];
  apex: number;
  place: Place;
  problem: Problem;
  /** When stages and boosters dropped off (sim time). */
  drops: { t: number; from: number; to: number; boosters: boolean }[];
  /** The fastest it went (m/s). */
  top: number;
}

interface Stage {
  from: number;
  to: number; // slot range [from, to)
  fuel: number;
  thrust: number;
  ve: number;
  boostFuel: number;
  boostThrust: number;
}

function stagesOf(d: Design): Stage[] {
  const out: Stage[] = [];
  let from = 0;
  for (let i = 0; i <= d.length; i++) {
    if (i === d.length || d[i].part === 'split') {
      const to = Math.min(d.length, i + 1); // the splitter falls off with the stage below it
      const slots = d.slice(from, to);
      if (slots.length) {
        const eng = part(slots[0].part);
        const boosts = slots.filter((s) => s.boost).length;
        out.push({
          from,
          to,
          fuel: slots.reduce((f, s) => f + part(s.part).fuel, 0),
          thrust: eng.thrust,
          ve: eng.ve || 1,
          boostFuel: boosts * part('boost').fuel,
          boostThrust: boosts * part('boost').thrust,
        });
      }
      from = to;
    }
  }
  return out;
}

export const placeOf = (h: number): Place => (h >= MOON ? 'moon' : h >= SPACE ? 'space' : h >= CLOUDS ? 'clouds' : h > 5 ? 'sky' : 'pad');

export function fly(d: Design): Flight {
  const stages = stagesOf(d);
  const frames: Frame[] = [];
  const drops: Flight['drops'] = [];
  let h = 0, x = 0, vh = 0, vx = 0, t = 0;
  let tilt = 0.015, spin = 0.004;
  let si = 0, flipped = false;
  const stageOf = d.map((_, i) => stages.findIndex((s) => i >= s.from && i < s.to));
  const boostOn = stages.map((s) => s.boostThrust > 0);
  let apex = 0, top = 0, base = 0, liftedOff = false;
  const steady = steadiness(d);
  const nose = d.at(-1)?.part === 'nose' ? 0.3 : d.at(-1)?.part === 'capsule' ? 0.65 : 1;
  const mass = () => {
    let m = 0;
    for (let i = base; i < d.length; i++) {
      const p = part(d[i].part);
      m += p.mass + (d[i].fins ? part('fins').mass : 0) + (d[i].boost && boostOn[stageOf[i]] ? part('boost').mass : 0);
    }
    for (let k = si; k < stages.length; k++) m += stages[k].fuel + (boostOn[k] ? stages[k].boostFuel : 0);
    return m;
  };
  const area = () => 1 + (boostOn[si] ? 0.8 : 0) + d.slice(base).filter((s) => s.fins).length * 0.25;

  while (t < 20_000) {
    const st = stages[si];
    const boosters = !!boostOn[si];
    let thrust = 0, burn = 0;
    if (st && !flipped) {
      if (st.fuel > 0 && st.thrust > 0) {
        thrust += st.thrust;
        burn += st.thrust / st.ve;
      }
      if (boosters && st.boostFuel > 0) thrust += st.boostThrust;
    }
    const firing = thrust > 0;
    const dt = firing || h < 20_000 ? 0.05 : Math.min(20, 0.05 + h / 5_000);
    const m = mass();
    const r = PLANET_R + h;
    const g = G0 * (PLANET_R / r) ** 2;
    const rho = 1.2 * Math.exp(-h / AIR_H);
    const v = Math.hypot(vh, vx);
    const q = 0.5 * rho * v * v; // how hard the air pushes (Pa)
    // Wobble: the air turns an unsteady rocket further over, and a steady one back up.
    if (!flipped && firing) {
      const k = (q / 1000) * area() * 0.08;
      const s = steady - STEADY_ENOUGH;
      spin += (-k * s * 6 * Math.sin(tilt) - (s > 0 ? k * 0.8 + 0.3 : 0.02) * spin) * dt;
      tilt += spin * dt;
      if (Math.abs(tilt) > 1.1) flipped = true;
    } else if (flipped) {
      tilt += dt * 2.5; // tumbling
    }
    const drag = (q * nose * area() * (flipped ? 3 : 1)) / 1000; // kN
    let ah = (thrust * Math.cos(tilt)) / m - g, ax = (thrust * Math.sin(tilt)) / m;
    if (v > 0.01) {
      ah -= (drag / m) * (vh / v);
      ax -= (drag / m) * (vx / v);
    }
    if (!liftedOff && ah <= 0 && h <= 0) {
      // Sitting on the pad: too heavy, or out of fuel.
      ah = 0;
      vh = Math.max(0, vh);
      if (t > 3 || !firing) {
        frames.push({ t, h, x, tilt: 0, base, boosters, firing });
        return { frames, apex: 0, place: 'pad', problem: firing ? 'heavy' : 'fuel', drops, top: 0 };
      }
      tilt = 0.015;
      spin = 0;
    }
    vh += ah * dt;
    vx += ax * dt;
    h += vh * dt;
    x += vx * dt;
    t += dt;
    if (h > 1) liftedOff = true;
    top = Math.max(top, Math.hypot(vh, vx));
    apex = Math.max(apex, h);
    // Use up fuel; drop boosters and stages when they're empty.
    if (st && firing) {
      st.fuel = Math.max(0, st.fuel - burn * dt);
      if (boosters) {
        st.boostFuel = Math.max(0, st.boostFuel - (st.boostThrust / part('boost').ve) * dt);
        if (st.boostFuel <= 0) {
          boostOn[si] = false;
          drops.push({ t, from: st.from, to: st.to, boosters: true });
        }
      }
      if (st.fuel <= 0 && si + 1 < stages.length && !boostOn[si]) {
        drops.push({ t, from: st.from, to: st.to, boosters: false });
        si++;
        base = stages[si].from;
      }
    }
    if (frames.length === 0 || t - frames[frames.length - 1].t >= (h < 20_000 ? 0.1 : dt)) {
      frames.push({ t, h, x, tilt, base, boosters: !!boostOn[si], firing });
    }
    if (h >= MOON) break;
    if (liftedOff && vh < 0 && !firing) break; // on the way down: the parachute takes it from here
    if (h < 0) break;
  }
  const place = placeOf(apex);
  // Going so fast it never comes back: off to the stars!
  const v = Math.hypot(vh, vx);
  const escape = Math.sqrt((2 * G0 * PLANET_R * PLANET_R) / (PLANET_R + h));
  const stars = h >= MOON && v > escape + 1500;
  const problem: Problem = flipped ? 'flip' : null;
  return { frames, apex, place: stars ? 'stars' : place, problem: problem ?? (place === 'moon' ? null : 'fuel'), drops, top };
}

/** What to try next, after a flight. */
export function hint(d: Design, f: Flight): string {
  if (f.problem === 'heavy') return 'Too heavy to lift off! 🏋️ Try a big engine, side boosters, or less fuel.';
  if (f.problem === 'flip') {
    if (!d.some((s) => s.fins)) return 'It wobbled and flipped! 🙃 Fins at the bottom keep rockets straight.';
    return 'It still flipped! 🙃 Fins work best on the lowest part. Heavy stuff higher up helps too.';
  }
  if (f.place === 'stars') return 'You flew past the Moon, out to the stars! 🌟 The best rocket ever!';
  if (f.place === 'moon') return 'You made it to the Moon! 🌙 Can you go even further, to the stars?';
  const nose = d.at(-1)?.part === 'nose';
  if (!nose) return 'The flat top pushes on the air. 🔺 A nose cone helps it slip through!';
  const stages = d.filter((s) => s.part === 'split').length + 1;
  if (f.place === 'space' && stages === 1) return 'Space! 🌌 For the Moon you need more: try ✂️ stages, so empty tanks drop off.';
  if (f.place === 'space') return `Space! 🌌 The Moon is very far. ${stages < 3 ? 'Try three stages' : 'More fuel'}, and 🚀 boosters at the bottom.`;
  if (!d.some((s) => s.part === 'split')) return 'Out of fuel! ⛽ More tanks, or ✂️ stages so empty bits drop off.';
  return 'Out of fuel! ⛽ More fuel, and make sure every stage has an engine at its bottom.';
}

/** Coins for reaching each place the first time. */
export const PLACE_COINS: Partial<Record<Place, number>> = { clouds: 5, space: 15, moon: 40, stars: 80 };
export const PLACE_NAME: Record<Place, string> = {
  pad: 'the launch pad', sky: 'the sky', clouds: 'the clouds ☁️', space: 'space 🌌', moon: 'the Moon 🌙', stars: 'the stars 🌟',
};

// ---------------------------------------------------------------- the launch site

export const PAD: V3 = [0, 1, -18]; // top centre of the launch pad

export function rocketLab(): Level {
  const blocks: Block[] = [];
  const box = (x: number, y0: number, z: number, w: number, h: number, d: number, color: string, more: Partial<Block> = {}) =>
    blocks.push({ x, y: y0 + h / 2, z, w, h, d, kind: 'solid', color, ...more });
  box(0, -1, 0, 120, 1, 120, '#94d82d');
  box(0, -0.98, -8, 30, 1, 34, '#ced4da'); // concrete
  // The launch pad, with steps up and a tower beside it.
  box(PAD[0], 0, PAD[2], 8, PAD[1], 8, '#868e96');
  box(PAD[0], 0, PAD[2] + 4.6, 3, 0.5, 1.2, '#adb5bd');
  box(PAD[0] + 6, 0, PAD[2], 2, 26, 2, '#e03131');
  for (let y = 4; y < 26; y += 5) box(PAD[0] + 4.5, y, PAD[2], 2.2, 0.3, 0.8, '#e03131');
  // Standing in front of the pad opens the workshop.
  blocks.push({ x: PAD[0], y: 1.5, z: PAD[2] + 7, w: 7, h: 3, d: 4, kind: 'zone', color: '#000', tag: 'build' });
  box(PAD[0], 0, PAD[2] + 7, 7, 0.1, 4, '#ffd43b', { deco: true });
  // The workshop hangar (for looks) and a control room.
  box(-16, 0, -14, 10, 7, 12, '#e9ecef');
  box(-16, 7, -14, 10.4, 0.6, 12.4, '#4dabf7');
  box(-10.9, 0, -14, 0.2, 5, 6, '#495057', { deco: true });
  box(14, 0, -10, 6, 4, 6, '#f1f3f5');
  box(14, 4, -10, 6.2, 0.4, 6.2, '#ff922b');
  box(11, 2.4, -10, 0.1, 1.2, 4, '#74c0fc', { deco: true });
  // A portal home.
  box(-2.4, 0, 12, 1, 5.5, 1, '#f1f3f5');
  box(2.4, 0, 12, 1, 5.5, 1, '#f1f3f5');
  box(0, 5.5, 12, 5.8, 1, 1, '#3bb273');
  blocks.push({ x: 0, y: 2.75, z: 12, w: 3.8, h: 5.5, d: 0.6, kind: 'portal', color: '#3bb273', level: 'hub' });
  return {
    id: 'rocket',
    name: 'Rocket Lab',
    emoji: '🚀',
    spawn: [0, 0, 6],
    spawnYaw: Math.PI,
    blocks,
    coins: [[-16, 8.6, -14], [14, 5.6, -10], [10, 1.2, 4], [-10, 1.2, 4]],
    reward: 0,
    fallY: -10,
    sky: ['#3d8bff', '#d0ebff'],
    signs: [{ at: [PAD[0] - 6, 4, PAD[2] + 8], text: '🔧 Build a rocket', color: '#f08c00' }],
  };
}
