// The rules of Planet Smash as plain data and numbers: no three.js or DOM, so the tests can run them.

/** rocky planets crumble into rocks; gas giants, ice giants and stars blow up like a supernova. */
export type Kind = 'rocky' | 'gas' | 'ice' | 'star' | 'giant';
export type Tab = 'planets' | 'giants';

export interface Body {
  id: string;
  name: string;
  tab: Tab;
  kind: Kind;
  /** How much smashing it takes. */
  hp: number;
  /** Picture file in public/games/planet-smash/textures/ (made in code for terraformed Mars and the giant star). */
  tex: string;
  /** Glow around the edge (air), as a CSS-style hex colour. */
  air?: number;
  clouds?: boolean;
  rings?: boolean;
  /** A small planet: the Moon smashes it in one hit. */
  small?: boolean;
  /** Only the Rainbow Laser can hurt it. */
  rainbowOnly?: boolean;
  /** Shown under the name. */
  fact: string;
}

export const BODIES: Body[] = [
  { id: 'mercury', name: 'Mercury', tab: 'planets', kind: 'rocky', hp: 60, tex: 'mercury', small: true,
    fact: 'The closest planet to the Sun' },
  { id: 'venus', name: 'Venus', tab: 'planets', kind: 'rocky', hp: 110, tex: 'venus', air: 0xffd27a,
    fact: 'The hottest planet, covered in thick clouds' },
  { id: 'earth', name: 'Earth', tab: 'planets', kind: 'rocky', hp: 120, tex: 'earth', air: 0x5aa9ff, clouds: true,
    fact: 'Our home planet, with oceans, land and clouds' },
  { id: 'moon', name: 'The Moon', tab: 'planets', kind: 'rocky', hp: 50, tex: 'moon', small: true,
    fact: 'Earth\'s moon. People have walked on it!' },
  { id: 'mars', name: 'Mars', tab: 'planets', kind: 'rocky', hp: 80, tex: 'mars', air: 0xff9a6a, small: true,
    fact: 'The red planet' },
  { id: 'mars-green', name: 'Terraformed Mars', tab: 'planets', kind: 'rocky', hp: 80, tex: 'mars-green',
    air: 0x7fc8ff, small: true, fact: 'Mars made like Earth, with oceans and forests' },
  { id: 'jupiter', name: 'Jupiter', tab: 'giants', kind: 'gas', hp: 300, tex: 'jupiter', air: 0xffd9a8,
    fact: 'The biggest planet. 1,300 Earths could fit inside' },
  { id: 'saturn', name: 'Saturn', tab: 'giants', kind: 'gas', hp: 260, tex: 'saturn', air: 0xffe7b0, rings: true,
    fact: 'The planet with the giant rings' },
  { id: 'uranus', name: 'Uranus', tab: 'giants', kind: 'ice', hp: 200, tex: 'uranus', air: 0x9ff3ff,
    fact: 'An ice giant that spins on its side' },
  { id: 'neptune', name: 'Neptune', tab: 'giants', kind: 'ice', hp: 200, tex: 'neptune', air: 0x6f9bff,
    fact: 'The windiest planet, far, far away' },
  { id: 'sun', name: 'The Sun', tab: 'giants', kind: 'star', hp: 500, tex: 'sun',
    fact: 'Our star. 1.3 million Earths could fit inside' },
  { id: 'giant-star', name: 'The Biggest Star', tab: 'giants', kind: 'giant', hp: 560, tex: 'giant-star',
    rainbowOnly: true, fact: 'Stephenson 2-18: 2,150 times wider than the Sun! Only the Rainbow Laser can hurt it' },
];

export type WeaponId = 'laser' | 'plasma' | 'rainbow' | 'railgun' | 'ships' | 'asteroid' | 'ufo' | 'moon' | 'blackhole';

export interface Weapon {
  id: WeaponId;
  name: string;
  emoji: string;
  damage: number;
  /** Crater size as an angle on the planet (radians). */
  crater: number;
}

export const WEAPONS: Weapon[] = [
  { id: 'laser', name: 'Laser', emoji: '🔴', damage: 10, crater: 0.07 },
  { id: 'plasma', name: 'Plasma Laser', emoji: '🔵', damage: 18, crater: 0.1 },
  { id: 'rainbow', name: 'Rainbow Laser', emoji: '🌈', damage: 70, crater: 0.24 },
  { id: 'railgun', name: 'Railgun', emoji: '⚡', damage: 25, crater: 0.13 },
  { id: 'ships', name: 'Spaceships', emoji: '🚀', damage: 35, crater: 0.06 },
  { id: 'asteroid', name: 'Asteroid', emoji: '☄️', damage: 40, crater: 0.18 },
  { id: 'ufo', name: 'Alien Ray', emoji: '🛸', damage: 30, crater: 0.13 },
  { id: 'moon', name: 'The Moon', emoji: '🌕', damage: 80, crater: 0.34 },
  { id: 'blackhole', name: 'Black Hole', emoji: '⚫', damage: Infinity, crater: 0 },
];

export function bodyById(id: string): Body {
  return BODIES.find((b) => b.id === id) ?? BODIES[2];
}
export function weaponById(id: string): Weapon {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}

export interface HitResult {
  /** The weapon can't hurt this body (the giant star without the Rainbow Laser). */
  blocked: boolean;
  damage: number;
  hp: number;
  destroyed: boolean;
}

/** What one shot does to a body that has `hp` left. */
export function hit(body: Body, weapon: Weapon, hp: number): HitResult {
  if (hp <= 0) return { blocked: false, damage: 0, hp: 0, destroyed: true };
  if (body.rainbowOnly && weapon.id !== 'rainbow') return { blocked: true, damage: 0, hp, destroyed: false };
  let damage = weapon.damage;
  if (weapon.id === 'moon' && body.small) damage = hp; // smaller planets go on the first try
  damage = Math.min(hp, damage);
  const left = hp - damage;
  return { blocked: false, damage, hp: left, destroyed: left <= 0 };
}

/** How the body ends: a cloud of rocks and hot gas, a supernova, or sucked into a black hole. */
export function endingFor(body: Body, weapon: Weapon): 'rocks' | 'supernova' | 'blackhole' {
  if (weapon.id === 'blackhole') return 'blackhole';
  return body.kind === 'rocky' ? 'rocks' : 'supernova';
}

/** How much health is left, 0..100 (for the health bar). */
export function healthPercent(body: Body, hp: number): number {
  return Math.max(0, Math.min(100, Math.round((hp / body.hp) * 100)));
}

/** How fiery and red a gas giant or star looks: 0 when new, 1 just before it blows. Rocky planets stay 0. */
export function heat(body: Body, hp: number): number {
  if (body.kind === 'rocky') return 0;
  return Math.max(0, Math.min(1, 1 - hp / body.hp));
}

/**
 * Where a direction from the planet's centre lands on its picture (0..1 across, 0..1 down from the top),
 * matching three.js's SphereGeometry UVs: x = -cos(u·2π)·sin(θ), y = cos(θ), z = sin(u·2π)·sin(θ).
 */
export function dirToMap(x: number, y: number, z: number): { u: number; v: number } {
  const len = Math.hypot(x, y, z) || 1;
  const theta = Math.acos(Math.max(-1, Math.min(1, y / len)));
  let phi = Math.atan2(z, -x);
  if (phi < 0) phi += Math.PI * 2;
  return { u: phi / (Math.PI * 2), v: theta / Math.PI };
}

/** The point where a straight shot that enters the ball (radius 1) at `p` going `d` comes out the far side. */
export function exitPoint(p: [number, number, number], d: [number, number, number]): [number, number, number] {
  const dl = Math.hypot(...d) || 1;
  const dx = d[0] / dl, dy = d[1] / dl, dz = d[2] / dl;
  const t = -2 * (p[0] * dx + p[1] * dy + p[2] * dz);
  return [p[0] + dx * t, p[1] + dy * t, p[2] + dz * t];
}

/** 8200000000 → "8,200,000,000" */
export function bigNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
