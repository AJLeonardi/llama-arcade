// Plain data shared by the sim, the levels and the view. No three.js or DOM here, so the tests run in Node.
// Axes: +x east, +y up, +z north (levels run along +z). Yaw θ faces (sin θ, cos θ).

export type V3 = [number, number, number];

export type Kind =
  | 'solid' // plain block
  | 'goo' // touching it breaks you into pieces
  | 'treadmill' // moves you along `push`; running on it makes you faster and faster
  | 'key' // a key on the giant keyboard: each new key you step on makes you a little faster
  | 'checkpoint' // standing on it moves your restart point here
  | 'finish' // end of a level
  | 'crush' // a closing wall: solid, and getting squished by it breaks you into pieces
  | 'trap' // a maze dead end: looks like floor, sends you all the way back to the level start
  | 'door' // walk-through doorway to a level (`level`); solid while that level is locked
  | 'cape' // walk-through: pick up the cape
  | 'zone'; // invisible walk-through area with a `tag` (starts the chaser, the poop...)

export interface Block {
  /** Centre of the box. */
  x: number;
  y: number;
  z: number;
  /** Full size along x, y, z. */
  w: number;
  h: number;
  d: number;
  kind: Kind;
  color: string;
  /** Moving block: swings smoothly from its start out to start + (dx, dy, dz) and back, every `period` seconds. */
  move?: { dx: number; dy: number; dz: number; period: number; phase?: number };
  /** Treadmill speed (units/s) along x and z. */
  push?: [number, number];
  /** Doors: which level (1..10). */
  level?: number;
  /** Zones: what they're for. */
  tag?: string;
  /** Keyboard keys: the letter. */
  letter?: string;
  /** A giant-keyboard floor: drawn as keys with letters in these colours; each new key you run over makes you a tiny bit faster. */
  keyboard?: string[];
  /** Magic logs: drawn as a glowing log. */
  log?: boolean;
  /** Just for looks: drawn but never touched. */
  deco?: boolean;
}

/** Someone chasing you around a room once you step into the zone with their `tag`. */
export interface Chaser {
  home: V3;
  speed: number;
  /** The room they stay inside: [minX, minZ, maxX, maxZ]. */
  room: [number, number, number, number];
  tag: string;
}

/** A big boulder rolling along -z from `z0` to `z1`, then again after `wait` seconds. Centre height is `r` above `y`. */
export interface Boulder {
  x: number;
  y: number;
  z0: number;
  z1: number;
  r: number;
  speed: number;
  wait: number;
}

/** Poop rising inside an area once you step into the zone with its `tag`. */
export interface Poop {
  area: [number, number, number, number];
  y0: number;
  y1: number;
  speed: number;
  delay: number;
  tag: string;
}

export interface Sign {
  at: V3;
  text: string;
  /** Letters take turns in these colours. */
  colors: string[];
  size: number;
  /** Which way the sign faces. */
  yaw: number;
}

export interface Level {
  /** 0 = the workout room, 1..10 = the levels. */
  num: number;
  name: string;
  emoji: string;
  spawn: V3;
  spawnYaw: number;
  blocks: Block[];
  chasers: Chaser[];
  boulders: Boulder[];
  poops: Poop[];
  signs: Sign[];
  /** Falling below this breaks you into pieces. */
  fallY: number;
  /** Background and fog colour. */
  sky: string;
  /** The maze's size in cells (for the HUD and tests), if there is one. */
  maze?: number;
}
