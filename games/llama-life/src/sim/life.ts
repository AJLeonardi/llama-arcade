// Your life so far: the day and time, the cars you own, what's in your bag, how many times you've been to
// work and school. This is what gets saved.
import type { Clock } from './clock';
import { REWARD_CARS, CAR_TYPES } from './car';

export interface Look {
  skin: number;
  hair: number;
  hairStyle: number;
  shirt: number;
  pants: number;
  shoes: number;
}

export const SKIN = ['#f6d2b8', '#e8b48f', '#c68863', '#8d5a3c', '#5c3a24'];
export const HAIR = ['#2b1d14', '#6b4423', '#d9a441', '#b5462b', '#111111', '#e8e2d0'];
export const HAIR_STYLES = ['Short', 'Long', 'Ponytail', 'Curly', 'Buzz'];
export const SHIRT = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#f5f5f5', '#212121', '#fb8c00', '#f48fb1'];
export const PANTS = ['#2b3a55', '#1c1c1c', '#6d6d6d', '#8b6b4a', '#3d5a3d', '#a3c4e8', '#f5f5f5'];
export const SHOES = ['#f5f5f5', '#111111', '#e53935', '#1e88e5', '#fdd835'];
export const DEFAULT_LOOK: Look = { skin: 1, hair: 1, hairStyle: 0, shirt: 1, pants: 0, shoes: 0 };

export interface Life extends Clock {
  look: Look;
  /** How many of the reward cars you've earned (the family car is yours from the start). */
  earned: number;
  trophies: number;
  shifts: number;
  classes: number;
  books: number;
  bag: string[];
}

export function newLife(): Life {
  return { day: 1, hour: 8, look: { ...DEFAULT_LOOK }, earned: 0, trophies: 0, shifts: 0, classes: 0, books: 0, bag: [] };
}

/** A save from an older version (or a broken one) turned back into a whole Life. */
export function fromSave(s: Partial<Life> | null | undefined): Life {
  const l = newLife();
  if (!s) return l;
  const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
  l.day = Math.max(1, Math.floor(num(s.day, 1)));
  l.hour = Math.max(0, Math.min(23.99, num(s.hour, 8)));
  l.earned = Math.max(0, Math.min(REWARD_CARS.length, Math.floor(num(s.earned, 0))));
  l.trophies = Math.max(0, Math.floor(num(s.trophies, 0)));
  l.shifts = Math.max(0, Math.floor(num(s.shifts, 0)));
  l.classes = Math.max(0, Math.floor(num(s.classes, 0)));
  l.books = Math.max(0, Math.floor(num(s.books, 0)));
  l.bag = Array.isArray(s.bag) ? s.bag.filter((x) => typeof x === 'string').slice(0, BAG_MAX) : [];
  l.look = { ...l.look, ...(s.look ?? {}) };
  return l;
}

/** The car types you own, in the order you got them. */
export function ownedCars(l: Life) {
  return [0, ...REWARD_CARS.slice(0, l.earned)];
}

/** A shift at work: you earn the next car, or a trophy once you have them all. Says what you got. */
export function doWork(l: Life): { car?: number; trophy?: boolean; text: string } {
  l.shifts++;
  if (l.earned < REWARD_CARS.length) {
    const car = REWARD_CARS[l.earned++];
    return { car, text: `You earned a ${CAR_TYPES[car].name}! It's parked at your mansion.` };
  }
  l.trophies++;
  return { trophy: true, text: `You earned a golden trophy! 🏆 (${l.trophies})` };
}

export const BAG_MAX = 12;

/** Puts something in your bag. False if the bag is full. */
export function take(l: Life, item: string) {
  if (l.bag.length >= BAG_MAX) return false;
  l.bag.push(item);
  return true;
}

/** Eats or drinks something from the bag. */
export function eat(l: Life, i: number) {
  if (i < 0 || i >= l.bag.length) return undefined;
  return l.bag.splice(i, 1)[0];
}

const DRINKS = new Set(['☕', '🍫', '🥛', '🧃']);
export const yum = (item: string) => (DRINKS.has(item) ? `Slurp! ${item}` : `Yum! ${item}`);

/** Things you learn at school, one per class. */
export const LESSONS = [
  'A blue whale is as long as three school buses! 🐋',
  'Llamas hum to talk to each other! 🦙',
  'The Moon is 384,000 km away. 🌙',
  'Octopuses have three hearts! 🐙',
  'Honey never goes bad. 🍯',
  '7 × 8 = 56! ✏️',
  'Bees dance to tell other bees where flowers are. 🐝',
  'The Sun is a star! ☀️',
  'A day on Venus is longer than a year on Venus. 🪐',
  'Sharks were around before trees! 🦈',
  'Your heart beats about 100,000 times a day. ❤️',
  'Penguins live in the south, polar bears in the north. 🐧',
];

export const BOOKS = [
  'The Llama Who Learned to Drive 📕',
  'Dinosaurs of Every Size 📗',
  'How Rockets Work 📘',
  'The Big Book of Jokes 📙',
  'Under the Sea 📒',
  'The Mystery of the Missing Muffin 📕',
];

export const SHOWS = ['Cartoons! 📺', 'A nature show about tigers 🐯', 'A cooking show 🍰', 'A soccer game ⚽', 'A funny movie 🍿'];
