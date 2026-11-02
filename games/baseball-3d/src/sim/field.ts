// The ballparks as numbers. Axes: home plate at the origin, +z out to centre field, +y up. Looking out from
// home, first base is on the right, which is -x (third base is +x). A "spray" angle is measured from the
// line to centre field, + toward right field (first-base side), so the direction is (-sin a, cos a).

export type ParkKind = 'hs' | 'college' | 'pro' | 'backyard';

export interface Park {
  kind: ParkKind;
  name: string;
  /** Distance between bases (m). */
  base: number;
  /** Home plate to the pitching rubber (m). */
  mound: number;
  /** Fence distance down the lines and to dead centre (m). */
  fenceLine: number;
  fenceCenter: number;
  fenceH: number;
  night: boolean;
}

export const PARKS: Record<string, Park> = {
  hs: { kind: 'hs', name: 'Pine Valley Field', base: 27.43, mound: 18.44, fenceLine: 80, fenceCenter: 100, fenceH: 2.4, night: false },
  college: { kind: 'college', name: 'Strikers Park, Boston', base: 27.43, mound: 18.44, fenceLine: 88, fenceCenter: 112, fenceH: 3.6, night: false },
  pro: { kind: 'pro', name: 'Lightning Stadium, Providence', base: 27.43, mound: 18.44, fenceLine: 96, fenceCenter: 120, fenceH: 3.0, night: true },
  backyard: { kind: 'backyard', name: 'The Backyard', base: 15, mound: 11, fenceLine: 32, fenceCenter: 40, fenceH: 1.8, night: false },
};

export const FAIR = Math.PI / 4;

/** How far the fence is at a spray angle (fair territory only). */
export function fenceDist(p: Park, a: number) {
  const k = Math.cos(2 * Math.max(-FAIR, Math.min(FAIR, a)));
  return p.fenceLine + (p.fenceCenter - p.fenceLine) * k;
}

export const sprayOf = (x: number, z: number) => Math.atan2(-x, z);
export const dirOf = (a: number): [number, number] => [-Math.sin(a), Math.cos(a)];

/** Bases 0 = home, 1 = first, 2 = second, 3 = third, 4 = home again. */
export function basePos(p: Park, i: number): [number, number] {
  const d = p.base / Math.SQRT2;
  switch (((i % 4) + 4) % 4) {
    case 1: return [-d, d];
    case 2: return [0, p.base * Math.SQRT2];
    case 3: return [d, d];
    default: return [0, 0];
  }
}

export type Pos = 'P' | 'C' | '1B' | '2B' | 'SS' | '3B' | 'LF' | 'CF' | 'RF';
export const POSITIONS: Pos[] = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];

/** Where each fielder stands before the pitch. */
export function fielderHome(p: Park, pos: Pos): [number, number] {
  const ki = p.base / 27.43, ko = p.fenceCenter / 122;
  const polar = (d: number, deg: number): [number, number] => dirOf((deg * Math.PI) / 180).map((v) => v * d) as [number, number];
  switch (pos) {
    case 'P': return [0, p.mound - 0.3];
    case 'C': return [0, -1.1];
    case '1B': return polar(28 * ki, 37);
    case '2B': return polar(36 * ki, 14);
    case 'SS': return polar(36 * ki, -14);
    case '3B': return polar(28 * ki, -37);
    case 'LF': return polar(82 * ko, -27);
    case 'CF': return polar(94 * ko, 0);
    case 'RF': return polar(82 * ko, 27);
  }
}

export const isInfielder = (pos: Pos) => pos !== 'LF' && pos !== 'CF' && pos !== 'RF';
