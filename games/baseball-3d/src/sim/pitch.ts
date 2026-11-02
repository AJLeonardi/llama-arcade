// Pitches: a type (fastball, curveball, slider, changeup), a speed and where it crosses the plate. The ball
// flies from the pitcher's hand toward an aim point and bends late (break grows with the square of the
// distance flown), so a curveball looks like a strike and drops out of the zone, like the real thing.
import type { Park } from './field';

export type PitchType = 'fast' | 'curve' | 'slider' | 'change';

export interface PitchKind {
  name: string;
  short: string;
  /** Speed compared with the pitcher's fastball. */
  speedK: number;
  /** Late break at the plate (m): x (- = toward first base, the glove side of a right-hander), y (- = drops). */
  brk: [number, number];
  /** How much the ball rises then falls on its way (m), on top of the break. */
  arc: number;
}

export const PITCHES: Record<PitchType, PitchKind> = {
  fast: { name: 'Fastball', short: 'FB', speedK: 1, brk: [0.04, 0.02], arc: 0.12 },
  curve: { name: 'Curveball', short: 'CB', speedK: 0.78, brk: [-0.16, -0.48], arc: 0.35 },
  slider: { name: 'Slider', short: 'SL', speedK: 0.86, brk: [-0.32, -0.14], arc: 0.2 },
  change: { name: 'Changeup', short: 'CH', speedK: 0.83, brk: [0.12, -0.24], arc: 0.25 },
};
export const PITCH_TYPES = Object.keys(PITCHES) as PitchType[];

export const BALL_R = 0.037;
export const PLATE_HALF = 0.216;

export interface Zone { lo: number; hi: number; half: number }

/** The strike zone for the players in this park (kids in the backyard are smaller). */
export function zoneFor(p: Park): Zone {
  return p.kind === 'backyard' ? { lo: 0.42, hi: 0.9, half: PLATE_HALF } : { lo: 0.5, hi: 1.12, half: PLATE_HALF };
}

export function inZone(z: Zone, x: number, y: number) {
  return Math.abs(x) <= z.half + BALL_R && y >= z.lo - BALL_R && y <= z.hi + BALL_R;
}

export interface Pitch {
  type: PitchType;
  /** m/s. */
  speed: number;
  release: [number, number, number];
  aim: [number, number];
  /** Where it really crosses the plate (aim + break). */
  end: [number, number];
  /** Seconds from release to the plate. */
  T: number;
}

export const MPH = 2.23694;

export function makePitch(park: Park, type: PitchType, fastball: number, aim: [number, number]): Pitch {
  const k = PITCHES[type];
  const scale = park.kind === 'backyard' ? 0.75 : 1;
  const release: [number, number, number] = [0.32 * scale, 1.72 * scale, park.mound - 1.4 * scale];
  const speed = fastball * k.speedK;
  const dist = Math.hypot(release[2], release[1] - aim[1], release[0] - aim[0]);
  return { type, speed, release, aim, end: [aim[0] + k.brk[0], aim[1] + k.brk[1]], T: dist / speed };
}

/** Where the ball is t seconds after release (it keeps going past the plate on the same line). */
export function pitchPos(p: Pitch, t: number): [number, number, number] {
  const u = t / p.T;
  const k = PITCHES[p.type];
  const [rx, ry, rz] = p.release;
  const b = u * u;
  return [
    rx + (p.aim[0] - rx) * u + k.brk[0] * b,
    ry + (p.aim[1] - ry) * u + k.brk[1] * b + 4 * k.arc * u * (1 - u),
    rz * (1 - u),
  ];
}
