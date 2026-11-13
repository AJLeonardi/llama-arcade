// The World Cup table, your squad (Team USA with Mr. Random), the lineup, and the shop for new players.
// Plain data, no three.js or DOM, so the tests can run it in Node.

export interface Country {
  id: string;
  name: string;
  flag: string;
  /** Shirt and trim colours. Nobody but USA wears white, so the kits never clash. */
  shirt: string;
  trim: string;
}

/** The starting table, #1 first. USA starts last. */
export const COUNTRIES: Country[] = [
  { id: 'bra', name: 'Brazil', flag: '🇧🇷', shirt: '#ffd400', trim: '#1a8f3a' },
  { id: 'fra', name: 'France', flag: '🇫🇷', shirt: '#1e3a8a', trim: '#e63946' },
  { id: 'arg', name: 'Argentina', flag: '🇦🇷', shirt: '#74b9f0', trim: '#1b2a49' },
  { id: 'eng', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', shirt: '#d62828', trim: '#1b2a49' },
  { id: 'esp', name: 'Spain', flag: '🇪🇸', shirt: '#c1121f', trim: '#ffd60a' },
  { id: 'ger', name: 'Germany', flag: '🇩🇪', shirt: '#222222', trim: '#e63946' },
  { id: 'por', name: 'Portugal', flag: '🇵🇹', shirt: '#8b1e2d', trim: '#2a9d4b' },
  { id: 'ned', name: 'Netherlands', flag: '🇳🇱', shirt: '#ff7a00', trim: '#1b2a49' },
  { id: 'ita', name: 'Italy', flag: '🇮🇹', shirt: '#1f6fd1', trim: '#f1f1f1' },
  { id: 'jpn', name: 'Japan', flag: '🇯🇵', shirt: '#14306b', trim: '#e63946' },
  { id: 'mex', name: 'Mexico', flag: '🇲🇽', shirt: '#0b6e3b', trim: '#c1121f' },
  { id: 'mar', name: 'Morocco', flag: '🇲🇦', shirt: '#b5121b', trim: '#0b6e3b' },
  { id: 'cro', name: 'Croatia', flag: '🇭🇷', shirt: '#e5383b', trim: '#1f3c88' },
  { id: 'kor', name: 'Korea', flag: '🇰🇷', shirt: '#9d0208', trim: '#111111' },
  { id: 'can', name: 'Canada', flag: '🇨🇦', shirt: '#7a0010', trim: '#ffffff' },
  { id: 'usa', name: 'USA', flag: '🇺🇸', shirt: '#f4f6fb', trim: '#1b2a6b' },
];

export const US = 'usa';
export const country = (id: string) => COUNTRIES.find((c) => c.id === id)!;

export interface Player {
  id: string;
  name: string;
  /** 1-5 each. */
  speed: number;
  kick: number;
  save: number;
  fur: string;
  /** Mr. Random himself: you control him. */
  star?: boolean;
}

/** The five places on the field, in lineup order. */
export const SLOTS = [
  { id: 'GK', name: 'Keeper' },
  { id: 'LB', name: 'Left Back' },
  { id: 'RB', name: 'Right Back' },
  { id: 'MID', name: 'Midfield' },
  { id: 'ST', name: 'Striker' },
] as const;

export interface Save {
  /** Country ids, #1 first. */
  table: string[];
  squad: Player[];
  /** One player id per slot (SLOTS order). */
  lineup: string[];
  coins: number;
  shop: Player[];
  seed: number;
  champion: boolean;
  played: number;
  won: number;
  /** Seen the "Mr. Random joins Team USA" card. */
  intro: boolean;
}

export const MR_RANDOM: Player = { id: 'mr-random', name: 'Mr. Random', speed: 4, kick: 5, save: 1, fur: '#d9b382', star: true };

export function newSave(): Save {
  const squad: Player[] = [
    { id: 'gloves', name: 'Gloves McGee', speed: 2, kick: 2, save: 3, fur: '#f2efe6' },
    { id: 'noodle', name: 'Noodle Neck', speed: 3, kick: 2, save: 1, fur: '#8a5a3b' },
    { id: 'pickles', name: 'Pickles', speed: 2, kick: 3, save: 1, fur: '#c9a26b' },
    { id: 'banana', name: 'Banana Bob', speed: 3, kick: 3, save: 1, fur: '#efe0b9' },
    MR_RANDOM,
    { id: 'tiny', name: 'Tiny Tim', speed: 2, kick: 1, save: 2, fur: '#5b4636' },
  ];
  const s: Save = {
    table: COUNTRIES.map((c) => c.id),
    squad,
    lineup: ['gloves', 'noodle', 'pickles', 'banana', 'mr-random'],
    coins: 50,
    shop: [],
    seed: 1,
    champion: false,
    played: 0,
    won: 0,
    intro: false,
  };
  s.shop = makeShop(s);
  return s;
}

/** A save from an older version, or a broken one, becomes something playable. */
export function fixSave(s: Partial<Save> | undefined): Save {
  const fresh = newSave();
  if (!s || !Array.isArray(s.table) || !Array.isArray(s.squad) || !Array.isArray(s.lineup)) return fresh;
  const ok = s.table.length === COUNTRIES.length && COUNTRIES.every((c) => s.table!.includes(c.id));
  const save: Save = { ...fresh, ...s, table: ok ? s.table : fresh.table } as Save;
  if (!save.squad.some((p) => p.star)) save.squad.push(MR_RANDOM);
  const ids = new Set(save.squad.map((p) => p.id));
  if (save.lineup.length !== SLOTS.length || !save.lineup.every((id) => ids.has(id))) save.lineup = fresh.lineup.filter((id) => ids.has(id));
  while (save.lineup.length < SLOTS.length) save.lineup.push(save.squad.find((p) => !save.lineup.includes(p.id))!.id);
  return save;
}

/** 1 = top of the table. */
export const rankOf = (s: Save, id = US) => s.table.indexOf(id) + 1;

/** Who USA plays next: the team just above, or #2 when USA is on top (the Final). */
export function nextOpponent(s: Save) {
  const r = rankOf(s);
  return r === 1 ? s.table[1] : s.table[r - 2];
}

/** How good a country is, 0 (last) to 1 (#1), from where it is in the table. */
export function strengthOf(s: Save, id: string) {
  return 1 - (rankOf(s, id) - 1) / (COUNTRIES.length - 1);
}

export interface Result {
  us: number;
  them: number;
  win: boolean;
  draw: boolean;
  oldRank: number;
  newRank: number;
  coins: number;
  /** Won the Final (USA was #1 and beat #2) for the first time. */
  champion: boolean;
}

/** After a match: a win moves USA up one place per goal it won by (at most 3). Losing never moves you down. */
export function afterMatch(s: Save, us: number, them: number): Result {
  const oldRank = rankOf(s);
  const win = us > them, draw = us === them;
  if (win && oldRank > 1) {
    const up = Math.min(3, us - them, oldRank - 1);
    s.table.splice(oldRank - 1, 1);
    s.table.splice(oldRank - 1 - up, 0, US);
  }
  const coins = us * 10 + (win ? 30 : draw ? 15 : 10);
  s.coins += coins;
  s.played++;
  if (win) s.won++;
  const champion = win && oldRank === 1 && !s.champion;
  if (champion) s.champion = true;
  s.seed++;
  s.shop = makeShop(s);
  return { us, them, win, draw, oldRank, newRank: rankOf(s), coins, champion };
}

/** A little seeded random number maker, so tests and the shop are repeatable. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Captain', 'Fluffy', 'Speedy', 'Sir', 'Big', 'Little', 'Doctor', 'Zoomy', 'Silly', 'Super', 'Lucky', 'Professor'];
const LAST = ['Hooves', 'Wooly', 'Kicks-a-Lot', 'Spitz', 'Noodle', 'Haystack', 'Fuzzball', 'McFluff', 'Pancake', 'Thunder', 'Waffles', 'Boots'];
const FURS = ['#f2efe6', '#d9b382', '#8a5a3b', '#5b4636', '#c9a26b', '#efe0b9', '#a0a0a0', '#3b2f2a'];

/** Three llamas for sale. They get better as USA climbs the table. */
export function makeShop(s: Save): Player[] {
  const r = rng(s.seed * 7919 + 13);
  const climb = 1 - (rankOf(s) - 1) / (COUNTRIES.length - 1); // 0 at the bottom, 1 at the top
  const out: Player[] = [];
  for (let i = 0; i < 3; i++) {
    const stat = () => Math.max(1, Math.min(5, Math.round(1.5 + climb * 2 + r() * 2.2)));
    const keeper = i === 2;
    out.push({
      id: `p${s.seed}-${i}`,
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      speed: stat(),
      kick: keeper ? Math.max(1, stat() - 1) : stat(),
      save: keeper ? Math.min(5, stat() + 1) : Math.max(1, stat() - 2),
      fur: FURS[Math.floor(r() * FURS.length)],
    });
  }
  return out;
}

export const priceOf = (p: Player) => 10 * (p.speed + p.kick + p.save) + 10;
export const MAX_SQUAD = 10;

/** Buy shop llama `i`. False if there aren't enough coins or the squad is full. */
export function buy(s: Save, i: number) {
  const p = s.shop[i];
  if (!p || s.coins < priceOf(p) || s.squad.length >= MAX_SQUAD) return false;
  s.coins -= priceOf(p);
  s.squad.push(p);
  s.shop.splice(i, 1);
  return true;
}

/** Let a player go (never Mr. Random, never someone in the lineup). */
export function release(s: Save, id: string) {
  const p = s.squad.find((q) => q.id === id);
  if (!p || p.star || s.lineup.includes(id)) return false;
  s.squad = s.squad.filter((q) => q !== p);
  return true;
}

/**
 * Swap two places. Each of `a` and `b` is a lineup slot index (0-4) or a player id on the bench.
 * Slot ↔ slot swaps the two players' positions; slot ↔ bench puts the bench player in and the other out.
 */
export function swap(s: Save, a: number | string, b: number | string) {
  const slotA = typeof a === 'number' ? a : s.lineup.indexOf(a);
  const slotB = typeof b === 'number' ? b : s.lineup.indexOf(b);
  const isStar = (slot: number) => s.squad.find((p) => p.id === s.lineup[slot])?.star;
  if (slotA >= 0 && slotB >= 0) {
    [s.lineup[slotA], s.lineup[slotB]] = [s.lineup[slotB], s.lineup[slotA]];
  } else if (slotA >= 0 && typeof b === 'string') {
    if (!isStar(slotA) && s.squad.some((p) => p.id === b)) s.lineup[slotA] = b;
  } else if (slotB >= 0 && typeof a === 'string') {
    if (!isStar(slotB) && s.squad.some((p) => p.id === a)) s.lineup[slotB] = a;
  }
}

export const lineupPlayers = (s: Save) => s.lineup.map((id) => s.squad.find((p) => p.id === id)!);
