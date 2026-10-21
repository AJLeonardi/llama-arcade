// Plain data shared by the sim, the levels and the view. No three.js or DOM here, so the tests run in Node.
// Axes: +x east, +y up, +z south. Yaw θ faces (sin θ, cos θ).

export type V3 = [number, number, number];

export type Kind =
  | 'solid' // plain block
  | 'lava' // touching it sends you back to the last checkpoint ("Whoops!")
  | 'bounce' // trampoline: standing on it throws you high
  | 'speed' // speed pad: run fast for a couple of seconds
  | 'checkpoint' // standing on it moves your respawn point here
  | 'finish' // end of an obby
  | 'conveyor' // moves you along `push` while you stand on it
  | 'vanish' // fades away soon after you step on it, then comes back
  | 'portal' // walk-through door to an obby (`level`); not solid
  | 'shop' // walk-through spot that opens the dress-up shop; not solid
  | 'door' // solid until you have its `key`, then it slides open
  | 'crawl' // walk-through: inside it you crawl (half height), for air vents
  | 'spot' // searchlight: walk-through, but being in it sends you back to the last checkpoint
  | 'zone'; // invisible walk-through area with a `tag`, for a world's own stations (rides, grills...)

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
  /** Conveyor speed (units/s) along x and z. */
  push?: [number, number];
  /** Portal target. */
  level?: string;
  /** Doors: the key that opens them. */
  key?: string;
  /** Zones: what they're for (read by the world's activity). */
  tag?: string;
  /** Drawn as a see-through grate (vent roofs), so the camera can see you underneath. */
  see?: boolean;
  /** Just for looks (trees, flowers, signs): drawn but never touched. */
  deco?: boolean;
}

export interface Level {
  id: string;
  name: string;
  emoji: string;
  /** Feet position when you arrive, and the way the camera faces. */
  spawn: V3;
  spawnYaw: number;
  blocks: Block[];
  /** Coin centres. */
  coins: V3[];
  /** Bonus coins for reaching the finish. */
  reward: number;
  /** Falling below this sends you back to the last checkpoint. */
  fallY: number;
  /** Sky colour (top) and fog/horizon colour. */
  sky: [string, string];
  /** An obby's main path, platform by platform (for the tests). */
  path?: Block[];
  /** Keys to pick up (they open doors with the same id). */
  keys?: { at: V3; id: string; color: string }[];
  /** Floating name signs. */
  signs?: { at: V3; text: string; color: string; size?: number }[];
  /** Waypoints a robot can walk through to the finish (for the tests); `wait` = wait here until the way is clear. */
  route?: { to: V3; wait?: boolean }[];
}
