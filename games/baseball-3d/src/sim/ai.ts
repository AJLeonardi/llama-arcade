// The computer's pitcher and batters. The computer batter uses the same swing as you (sim/hit.ts): it guesses
// where the pitch will be and when, with mistakes that grow on pitches near the edges and breaking balls.
import { swingResult, type Contact, type Oval } from './hit';
import { inZone, PITCH_TYPES, type Pitch, type PitchType, type Zone } from './pitch';

export type Rand = () => number;

/** A normally distributed random number (mean 0, spread 1). */
export function gauss(r: Rand) {
  return Math.sqrt(-2 * Math.log(1 - r() * 0.9999)) * Math.cos(2 * Math.PI * r());
}

/** What the computer pitcher throws: a pitch type and a spot (with a miss that depends on its control). */
export function aiPitch(r: Rand, zone: Zone, control: number, balls: number, strikes: number): { type: PitchType; aim: [number, number] } {
  const roll = r();
  const type: PitchType = roll < 0.5 ? 'fast' : PITCH_TYPES[1 + Math.floor(r() * 3)];
  // Behind in the count: throw strikes. Ahead: try the edges.
  const strikeChance = 0.62 + balls * 0.08 - strikes * 0.1;
  const mid = (zone.lo + zone.hi) / 2, hh = (zone.hi - zone.lo) / 2;
  let x: number, y: number;
  if (r() < strikeChance) {
    x = (r() * 2 - 1) * zone.half * 0.85;
    y = mid + (r() * 2 - 1) * hh * 0.8;
  } else {
    const side = r() < 0.5 ? -1 : 1;
    x = side * (zone.half + 0.05 + r() * 0.15);
    y = mid + (r() * 2 - 1) * hh * 1.3;
  }
  const miss = (1 - control) * 0.16;
  // The aim is before the break, so the computer aims to where the pitch should end up minus the break.
  return { type, aim: [x + gauss(r) * miss, y + gauss(r) * miss] };
}

/** The computer at bat. Returns null for no swing, or the swing (which may still miss). */
export function aiSwing(r: Rand, pitch: Pitch, zone: Zone, skill: number, strikes: number, oval: Omit<Oval, 'x' | 'y'>, power: number, maxEv: number):
  { swung: false } | { swung: true; contact: Contact | null } {
  const [ex, ey] = pitch.end;
  const strike = inZone(zone, ex, ey);
  const breaking = pitch.type !== 'fast';
  const edge = Math.min(1, Math.max(0, Math.abs(ex) - zone.half * 0.6) / 0.15 + Math.max(0, Math.abs(ey - (zone.lo + zone.hi) / 2) - 0.15) / 0.2);
  const swingChance = strike ? 0.62 + skill * 0.2 + strikes * 0.1 : 0.12 + (1 - skill) * 0.25 + (breaking ? 0.12 : 0) + strikes * 0.08;
  if (r() > swingChance) return { swung: false };
  // Where it guesses the ball will be, and its timing.
  const guess = 0.45 - skill * 0.25 + edge * 0.25 + (breaking ? 0.2 : 0);
  const ovalX = ex + gauss(r) * oval.rx * guess;
  const ovalY = ey + gauss(r) * oval.ry * guess + (breaking ? pitch.end[1] - pitch.aim[1] : 0) * -0.3;
  const speedK = pitch.speed / 33;
  const timing = gauss(r) * 0.05 * (1.35 - skill) * speedK + (pitch.type === 'change' ? 0.04 : 0) * (r() < 0.5 ? -1 : 1);
  return { swung: true, contact: swingResult({ x: ovalX, y: ovalY, ...oval }, [ex, ey], timing, power, maxEv) };
}
