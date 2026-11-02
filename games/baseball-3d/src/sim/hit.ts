// Hitting, the ball's flight, and the fielders. The swing is "Big Zone" style (MLB The Show 26): a big oval
// you move over where the pitch will cross, and a swing you time. Where the ball meets the oval sets the
// launch angle (oval above the ball = you hit the top of it = ground ball), the timing sets the direction
// (early = pulled to left field), and both together set how hard it is hit. Then the ball flies with gravity
// and air drag, and the fielders run for it: whoever gets there first catches it or picks it up and throws.
import { basePos, dirOf, FAIR, fenceDist, fielderHome, isInfielder, POSITIONS, sprayOf, type Park, type Pos } from './field';

/** The bat crosses the plate this long after you press swing. */
export const SWING_DELAY = 0.12;
/** Off by more than this (s) and you miss. */
export const TIMING = 0.15;

export interface Oval { x: number; y: number; rx: number; ry: number }

export interface Contact {
  /** Exit speed (m/s), launch angle and spray angle (radians). */
  ev: number;
  la: number;
  spray: number;
  /** 0..1, how well it was hit (for the sound and the pop-up). */
  quality: number;
}

/**
 * The swing against the ball. `timing` = when the bat crossed the plate minus when the ball did (s, - = early).
 * `ball` is where the ball crossed. `power` scales how hard the hitter can hit it (1 = a strong high-schooler).
 * Returns null for a swing and a miss.
 */
export function swingResult(oval: Oval, ball: [number, number], timing: number, power: number, maxEv: number): Contact | null {
  if (Math.abs(timing) > TIMING) return null;
  const dx = (ball[0] - oval.x) / oval.rx, dy = (ball[1] - oval.y) / oval.ry;
  if (Math.hypot(dx, dy) > 1) return null;
  const tk = timing / TIMING;
  // Up/down mostly changes the launch angle; side to side and timing change how hard it's hit.
  const off = Math.hypot(dx, dy * 0.6);
  const quality = (1 - off * off) * (1 - tk * tk * 0.85);
  const ev = maxEv * power * (0.42 + 0.58 * quality);
  // Oval above the ball (dy < 0) = top of the ball = grounder; below it = fly ball.
  const la = ((20 + dy * 40) * Math.PI) / 180;
  // Right-handed batter: early pulls toward left field (spray < 0), late goes the other way.
  const spray = ((tk * 52 - dx * 8) * Math.PI) / 180;
  return { ev, la, spray, quality };
}

export const G = 9.81;
const DRAG = 0.0036;
const DT = 1 / 120;

export interface Flight {
  /** Ball positions every 1/30 s until it stops or is caught/picked up. */
  path: [number, number, number][];
  kind: 'fair' | 'foul' | 'hr';
  /** Where and when it first comes down (or crosses the fence). */
  land: [number, number];
  hang: number;
}

/** Fly the ball from the plate: through the air, then bounce and roll. Stops at the fence. */
export function fly(park: Park, c: Contact, maxT = 14): Flight {
  const [dx, dz] = dirOf(c.spray);
  let x = 0, y = 0.9, z = 0.6;
  let vh = c.ev * Math.cos(c.la), vy = c.ev * Math.sin(c.la);
  const path: [number, number, number][] = [[x, y, z]];
  let t = 0, landed = false, hang = 0, land: [number, number] = [0, 0];
  let kind: Flight['kind'] = 'fair';
  let bounces = 0;
  for (let i = 1; t < maxT; i++) {
    t += DT;
    const v = Math.hypot(vh, vy);
    if (y > 0 || vy > 0) {
      vh -= DRAG * v * vh * DT;
      vy -= (G + DRAG * v * vy) * DT;
    } else {
      vh = Math.max(0, vh - 3.2 * DT); // rolling on grass
    }
    x += dx * vh * DT;
    z += dz * vh * DT;
    y += vy * DT;
    const r = Math.hypot(x, z), a = sprayOf(x, z);
    if (Math.abs(a) <= FAIR && r >= fenceDist(park, a)) {
      if (y > park.fenceH && !landed) {
        kind = 'hr';
        land = [x, z];
        hang = t;
        path.push([x, y, z]);
        // Keep it flying a bit into the stands so you can watch it go.
        for (let k = 0; k < 40 && y > -2; k++) {
          vy -= G / 30;
          x += (dx * vh) / 30;
          z += (dz * vh) / 30;
          y += vy / 30;
          path.push([x, y, z]);
        }
        return { path, kind, land, hang };
      }
      // Off the wall: it drops back toward the field.
      const back = fenceDist(park, a) - 0.3;
      x = dirOf(a)[0] * back;
      z = dirOf(a)[1] * back;
      vh = -Math.abs(vh) * 0.3;
    }
    if (y <= 0 && vy < 0) {
      y = 0;
      if (!landed) {
        landed = true;
        hang = t;
        land = [x, z];
        // Foul if it first lands outside the lines past the bases, or (before the bases) rolls foul.
        if (Math.abs(a) > FAIR && r > 1) kind = 'foul';
      }
      bounces++;
      vy = -vy * (bounces < 4 ? 0.38 : 0);
      vh *= c.la < 0.15 ? 0.82 : 0.6;
      if (vy < 1) vy = 0;
    }
    if (landed && kind === 'fair' && Math.abs(a) > FAIR && r < park.base * 1.1 && r > 1) {
      kind = 'foul'; // a grounder that rolls foul before the bases
    }
    if (i % 4 === 0) path.push([x, y, z]);
    if (landed && vh < 0.3 && vy === 0) break;
  }
  if (!landed) {
    hang = t;
    land = [x, z];
  }
  return { path, kind, land, hang };
}

export const RUN_SPEED = 6.6; // fielders, m/s
export const REACT = 0.35;
export const THROW = 30; // m/s

export interface Fielding {
  pos: Pos;
  /** When and where the fielder has the ball. */
  t: number;
  at: [number, number];
  /** Caught before it touched the ground. */
  caught: boolean;
}

const pathAt = (f: Flight, t: number): [number, number, number] => {
  const i = Math.min(f.path.length - 1, Math.max(0, t * 30));
  const i0 = Math.floor(i), i1 = Math.min(f.path.length - 1, i0 + 1), u = i - i0;
  const a = f.path[i0], b = f.path[i1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};
export { pathAt };

/** Who gets to the ball first, and when. Fly balls are caught if someone gets under them in time. */
export function field(park: Park, f: Flight, skill = 1): Fielding {
  const speed = RUN_SPEED * (park.kind === 'backyard' ? 0.75 : 1) * skill;
  const last = (f.path.length - 1) / 30;
  let best: Fielding | null = null;
  for (const pos of POSITIONS) {
    if (pos === 'C' && f.hang > 1.5) continue;
    const home = fielderHome(park, pos);
    // The pitcher is still finishing his throw; outfielders take a moment to read the ball.
    const react = pos === 'P' ? 0.55 : isInfielder(pos) ? REACT : 0.6;
    const reach = pos === 'P' ? 0.6 : 1.3;
    for (let t = 0.1; t <= last + 0.001; t += 1 / 30) {
      const b = pathAt(f, t);
      if (b[1] > 2.6) continue; // too high to catch yet
      const air = t < f.hang;
      const d = Math.hypot(b[0] - home[0], b[2] - home[1]) - reach;
      const need = react + Math.max(0, d) / speed;
      if (need <= t) {
        if (!best || t < best.t) best = { pos, t, at: [b[0], b[2]], caught: air && b[1] > 0.15 };
        break;
      }
    }
  }
  if (best) return best;
  // Nobody got there before it stopped: the closest fielder runs to where it stopped.
  const end = f.path[f.path.length - 1];
  let bp: Pos = 'CF', bd = Infinity;
  for (const pos of POSITIONS) {
    const h = fielderHome(park, pos);
    const d = Math.hypot(end[0] - h[0], end[2] - h[1]);
    if (d < bd) { bd = d; bp = pos; }
  }
  return { pos: bp, t: Math.max(last, REACT + bd / speed), at: [end[0], end[2]], caught: false };
}

/** Seconds for the batter to run to first, and then each base after. */
export function runTimes(park: Park) {
  const k = park.base / 27.43;
  return { first: 4.3 * k, each: 3.8 * k };
}

export interface BallInPlay {
  flight: Flight;
  fielding: Fielding | null;
  /** 'out' (caught or thrown out at first), a hit of 1-4 bases, 'hr' over the fence, or 'foul'. */
  result: 'foul' | 'hr' | 'out' | 1 | 2 | 3 | 4;
  /** How the out was made, for the pop-up. */
  outHow?: 'fly' | 'line' | 'pop' | 'ground';
  /** Ground ball fielded fast enough to turn two (if there's a runner on first). */
  quick: boolean;
}

/** Everything that happens to a ball once it's hit. */
export function play(park: Park, c: Contact, skill = 1): BallInPlay {
  const flight = fly(park, c);
  if (flight.kind === 'hr') return { flight, fielding: null, result: 'hr', quick: false };
  if (flight.kind === 'foul') return { flight, fielding: null, result: 'foul', quick: false };
  const fl = field(park, flight, skill);
  // Cut the ball's path where the fielder takes it.
  flight.path = flight.path.slice(0, Math.max(2, Math.ceil(fl.t * 30) + 1));
  if (fl.caught) {
    const deg = (c.la * 180) / Math.PI;
    return { flight, fielding: fl, result: 'out', outHow: deg > 45 ? 'pop' : deg < 18 ? 'line' : 'fly', quick: false };
  }
  const run = runTimes(park);
  // Picking up a rolling ball and throwing takes a moment; long throws from the outfield go through a relay.
  const toBase = (i: number) => {
    const b = basePos(park, i);
    const d = Math.hypot(b[0] - fl.at[0], b[1] - fl.at[1]);
    return fl.t + (isInfielder(fl.pos) ? 0.55 : 0.9) + d / THROW + (d > park.base * 2 ? 0.7 : 0);
  };
  if (isInfielder(fl.pos) && toBase(1) < run.first) {
    return { flight, fielding: fl, result: 'out', outHow: 'ground', quick: fl.t < 1.7 };
  }
  // A hit: the batter keeps running while he'd beat the throw to the next base (with a bit to spare).
  let bases = 1;
  while (bases < 4 && run.first + run.each * bases + 0.4 < toBase(bases + 1)) bases++;
  return { flight, fielding: fl, result: bases as 1 | 2 | 3 | 4, quick: false };
}

/** Where the ball goes after it's fielded, and who catches it there. */
export interface Relay {
  base: 1 | 2;
  /** Who covers the base; null = the fielder runs it to the bag himself. */
  receiver: Pos | null;
}

/**
 * Ground outs go to first, everything else back in to second. Someone is always on the bag: the first
 * baseman (or the pitcher, when the first baseman fielded it away from the bag), and at second the middle
 * infielder who didn't go for the ball.
 */
export function relayFor(park: Park, b: BallInPlay): Relay | null {
  const fl = b.fielding;
  if (!fl || b.result === 'foul' || b.result === 'hr') return null;
  const base = b.result === 'out' && b.outHow === 'ground' ? 1 : 2;
  const [bx, bz] = basePos(park, base);
  const near = Math.hypot(fl.at[0] - bx, fl.at[1] - bz) < 8 * (park.base / 27.43);
  if (base === 1) {
    if (fl.pos === '1B') return { base, receiver: near ? null : 'P' };
    return { base, receiver: '1B' };
  }
  if (fl.pos === 'SS' || fl.pos === '2B') return { base, receiver: near ? null : fl.pos === 'SS' ? '2B' : 'SS' };
  // Ball on the left side (+x): the shortstop goes out, the second baseman covers. Right side: the other way.
  return { base, receiver: fl.at[0] > 0 ? '2B' : 'SS' };
}
