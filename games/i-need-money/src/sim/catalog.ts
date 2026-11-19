// Every ride and stand you can build. Plain data (no three.js) so the tests can use it.

export type Kind =
  | 'slide' | 'stand' | 'carousel' | 'coaster' | 'cups' | 'drop'
  | 'swings' | 'bumper' | 'ship' | 'ferris' | 'flume' | 'octopus';

export interface RideType {
  id: string;
  name: string;
  emoji: string;
  kind: Kind;
  /** Price to build. */
  cost: number;
  /** Ticket price each guest pays. */
  ticket: number;
  /** Footprint radius (m): rides can't overlap. */
  r: number;
  /** Guests per go. */
  riders: number;
  /** Seconds per go (coasters: the view measures the real lap and changes it). */
  cycle: number;
  /** Model size (1 = normal). */
  size: number;
  colors: [string, string];
  /** Coasters and flumes: half-width a, half-depth b, hill height h, hills, loops. */
  track?: { a: number; b: number; h: number; hills: number; loops: number; gold?: boolean };
  /** Chance it breaks after each go. */
  breaks: number;
  /** Only the Up-and-Down Tower can be made bigger. */
  grows?: boolean;
}

type Row = [string, string, string, Kind, number, number, number, number, number, string, string, RideType['track']?];

// id, name, emoji, kind, cost, r, riders, cycle, size, colours, track
const ROWS: Row[] = [
  ['tiny-slide', 'Tiny Slide', '🛝', 'slide', 5, 3, 1, 4, 1, '#ff6b6b', '#ffd43b'],
  ['lemonade', 'Lemonade Stand', '🍋', 'stand', 10, 2.5, 1, 2.5, 1, '#ffe066', '#ffffff'],
  ['baby-carousel', 'Baby Carousel', '🎠', 'carousel', 20, 4, 4, 8, 0.7, '#f783ac', '#ffffff'],
  ['kiddie-coaster', 'Kiddie Coaster', '🐛', 'coaster', 40, 10, 6, 12, 1, '#69db7c', '#2b8a3e', { a: 8, b: 5, h: 2.5, hills: 2, loops: 0 }],
  ['teacups', 'Spinning Teacups', '☕', 'cups', 60, 6, 8, 10, 1, '#74c0fc', '#ffffff'],
  ['drop', 'Up-and-Down Tower', '⬆️', 'drop', 80, 4, 8, 12, 1, '#7950f2', '#ffd43b'],
  ['ice-cream', 'Ice Cream Stand', '🍦', 'stand', 100, 2.5, 1, 2.5, 1, '#fcc2d7', '#ffffff'],
  ['swings', 'Swing Ride', '🪂', 'swings', 150, 7, 12, 12, 1, '#ff922b', '#4dabf7'],
  ['bumper', 'Bumper Cars', '🚗', 'bumper', 200, 8, 8, 14, 1, '#fa5252', '#343a40'],
  ['pirate', 'Pirate Ship', '🏴‍☠️', 'ship', 300, 7, 16, 12, 1, '#8b5a2b', '#212529'],
  ['twisty-slide', 'Giant Twisty Slide', '🌀', 'slide', 350, 5, 2, 7, 2.2, '#4dabf7', '#ffd43b'],
  ['ferris', 'Ferris Wheel', '🎡', 'ferris', 500, 8, 16, 20, 1, '#e64980', '#ffffff'],
  ['cotton-candy', 'Cotton Candy Cart', '🍭', 'stand', 600, 2.5, 1, 2.5, 1, '#e599f7', '#ffffff'],
  ['wild-mouse', 'Wild Mouse', '🐭', 'coaster', 800, 17, 8, 20, 1, '#adb5bd', '#e03131', { a: 14, b: 9, h: 7, hills: 3, loops: 0 }],
  ['log-flume', 'Log Flume', '🪵', 'flume', 1000, 19, 6, 25, 1, '#8b5a2b', '#4dabf7', { a: 16, b: 10, h: 8, hills: 1, loops: 0 }],
  ['octopus', 'Octopus', '🐙', 'octopus', 1500, 8, 12, 14, 1, '#be4bdb', '#ffd43b'],
  ['grand-carousel', 'Grand Carousel', '🎠', 'carousel', 2000, 7, 12, 14, 1.4, '#fab005', '#e03131'],
  ['loop-coaster', 'Loop-de-Loop Coaster', '🎢', 'coaster', 3000, 21, 12, 25, 1, '#1c7ed6', '#ffd43b', { a: 18, b: 11, h: 12, hills: 2, loops: 1 }],
  ['pizza', 'Pizza Palace', '🍕', 'stand', 3500, 3.5, 2, 2.5, 1.4, '#e8590c', '#ffffff'],
  ['mega-swings', 'Mega Swings', '🌪️', 'swings', 5000, 11, 24, 16, 1.8, '#20c997', '#f03e3e'],
  ['giant-wheel', 'Giant Ferris Wheel', '🎡', 'ferris', 8000, 14, 32, 30, 2, '#228be6', '#ffffff'],
  ['viking', 'Viking Ship', '⛵', 'ship', 10000, 12, 30, 16, 1.8, '#a5673f', '#f8f9fa'],
  ['double-loop', 'Double Loop Coaster', '🎢', 'coaster', 15000, 27, 16, 30, 1, '#f03e3e', '#ffffff', { a: 24, b: 14, h: 16, hills: 3, loops: 2 }],
  ['rapids', 'Rapids Splash', '🌊', 'flume', 20000, 27, 12, 30, 1, '#5c940d', '#22b8cf', { a: 24, b: 14, h: 14, hills: 2, loops: 0 }],
  ['mega-octopus', 'Mega Octopus', '🦑', 'octopus', 30000, 14, 24, 18, 1.8, '#f76707', '#7048e8'],
  ['sky-wheel', 'Sky Wheel', '🌈', 'ferris', 50000, 20, 48, 40, 3, '#ff6b6b', '#fff3bf'],
  ['triple-loop', 'Triple Loop Coaster', '🎢', 'coaster', 75000, 33, 20, 35, 1, '#7048e8', '#63e6be', { a: 30, b: 16, h: 20, hills: 4, loops: 3 }],
  ['hyper', 'Hyper Coaster', '🚀', 'coaster', 100000, 39, 24, 40, 1, '#ffffff', '#1971c2', { a: 36, b: 18, h: 40, hills: 3, loops: 0 }],
  ['gold', 'Golden Money Coaster', '💰', 'coaster', 250000, 41, 24, 40, 1, '#fcc419', '#2f9e44', { a: 38, b: 22, h: 30, hills: 4, loops: 2, gold: true }],
  ['king', 'Llama King Coaster', '👑', 'coaster', 1000000, 48, 32, 50, 1, '#ae3ec9', '#fcc419', { a: 45, b: 26, h: 50, hills: 5, loops: 4 }],
];

/** How many seconds of a full ride it takes to earn back its price. Cheap rides pay back fast. */
function payback(cost: number) {
  return 25 + 25 * Math.log10(cost);
}

export const RIDES: RideType[] = ROWS.map(([id, name, emoji, kind, cost, r, riders, cycle, size, a, b, track]) => ({
  id, name, emoji, kind, cost, r, riders, cycle, size,
  colors: [a, b],
  track,
  ticket: kind === 'stand'
    ? Math.max(1, Math.round((cost * cycle) / (riders * payback(cost) * 1.5)))
    : Math.max(1, Math.round((cost * cycle) / (riders * payback(cost)))),
  breaks: kind === 'stand' ? 0 : kind === 'slide' && cost <= 5 ? 0.03 : 0.05,
  grows: kind === 'drop' ? true : undefined,
}));

export const RIDE_BY_ID: Record<string, RideType> = Object.fromEntries(RIDES.map((t) => [t.id, t]));

// ---- the Up-and-Down Tower: bigger and bigger and bigger ----

export function dropHeight(level: number) {
  return 12 + 7 * level;
}
export function dropRiders(level: number) {
  return Math.min(40, 8 + 2 * level);
}
export function dropTicket(level: number) {
  return RIDE_BY_ID.drop.ticket * (1 + level);
}
export function dropCycle(level: number) {
  return 8 + dropHeight(level) / 5;
}
/** Cost to make it one bigger. */
export function biggerCost(level: number) {
  return Math.round(60 * Math.pow(1.4, level));
}

// ---- helpers ----

export function hireCost(kind: 'worker' | 'mechanic', have: number) {
  const base = kind === 'worker' ? 30 : 60;
  return Math.round(base * Math.pow(1.8, have));
}

export function money(n: number) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}
