// Plain data shared by the sim, the levels and the view. No three.js or DOM here, so the tests run in Node.
// Axes: +x east, +y up, +z north (every level is one straight road along +z). Yaw θ faces (sin θ, cos θ).

export type V3 = [number, number, number];

export type Kind =
  | 'solid' // plain block
  | 'goo' // touching it breaks you into pieces
  | 'treadmill' // pushes you back along `push`; running on it makes your speed go up and up (`gain` says how fast)
  | 'wall' // a speed wall: you smash through it if your speed is at least `need`, otherwise it stops you
  | 'pad'; // a jump pad: throws you high in the air

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
  /** Treadmill belt speed (units/s) along x and z. */
  push?: [number, number];
  /** Treadmill: how much faster this one makes you (×1, ×2, ×5...). They're all free. */
  gain?: number;
  /** Speed wall: the speed you need to smash through. */
  need?: number;
  /** A giant-keyboard floor: drawn as keys with letters in these colours; each new key you run over adds 1 to your speed. */
  keyboard?: string[];
  /** Drawn as a black-and-white finish line. */
  finish?: boolean;
  /** Touched but not drawn (it's already drawn by the level before). */
  hidden?: boolean;
  /** Just for looks: drawn but never touched. */
  deco?: boolean;
}

export interface Sign {
  at: V3;
  text: string;
  /** Letters take turns in these colours. */
  colors: string[];
  size: number;
  /** Which way the sign faces. */
  yaw: number;
  /** Disappears when this block (a speed wall) is smashed. */
  block?: number;
}

export interface Level {
  /** 1, 2, 3... forever. */
  num: number;
  spawn: V3;
  spawnYaw: number;
  blocks: Block[];
  signs: Sign[];
  /** Crossing this line (z) finishes the level. */
  finishZ: number;
  /** Falling below this breaks you into pieces. */
  fallY: number;
  /** Background and fog colour. */
  sky: string;
}
