// Dress-up: what you can wear, what it costs, and the save file. Pure data + rules (tests/shop.test.ts).

export type Body = 'llama' | 'human';
export type Slot = 'color' | 'pants' | 'skin' | 'hat' | 'glasses' | 'cape';

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  /** Shown on the shop button. For colours, the colour itself is shown instead. */
  emoji?: string;
  /** Colour value (colour slots). 'rainbow' is special. */
  color?: string;
  /** Coins; 0 = free. */
  price: number;
}

const col = (slot: Slot, id: string, name: string, color: string, price = 0): Item => ({ id, slot, name, color, price });

export const ITEMS: Item[] = [
  // Fur (llama) or shirt (human) colour.
  col('color', 'c-cream', 'Cream', '#f4ead8'),
  col('color', 'c-brown', 'Brown', '#a8714a'),
  col('color', 'c-white', 'White', '#ffffff'),
  col('color', 'c-pink', 'Pink', '#ff8cc6'),
  col('color', 'c-blue', 'Blue', '#4dabf7'),
  col('color', 'c-green', 'Green', '#51cf66'),
  col('color', 'c-purple', 'Purple', '#9775fa'),
  col('color', 'c-red', 'Red', '#ff6b6b'),
  col('color', 'c-black', 'Black', '#343a40'),
  col('color', 'c-gold', 'Gold', '#ffcc33', 60),
  col('color', 'c-rainbow', 'Rainbow', 'rainbow', 100),
  // Human only.
  col('pants', 'p-blue', 'Blue', '#3b5bdb'),
  col('pants', 'p-black', 'Black', '#343a40'),
  col('pants', 'p-green', 'Green', '#2f9e44'),
  col('pants', 'p-pink', 'Pink', '#f06595'),
  col('pants', 'p-brown', 'Brown', '#8a5a2b'),
  col('skin', 's-1', 'Skin 1', '#ffe0bd'),
  col('skin', 's-2', 'Skin 2', '#f1c27d'),
  col('skin', 's-3', 'Skin 3', '#e0ac69'),
  col('skin', 's-4', 'Skin 4', '#c68642'),
  col('skin', 's-5', 'Skin 5', '#8d5524'),
  col('skin', 's-6', 'Skin 6', '#5c3a1e'),
  col('skin', 's-yellow', 'Blocky Yellow', '#ffd93b'),
  // Hats, glasses and capes.
  { id: 'h-none', slot: 'hat', name: 'No hat', emoji: '🚫', price: 0 },
  { id: 'h-cap', slot: 'hat', name: 'Cap', emoji: '🧢', price: 10 },
  { id: 'h-party', slot: 'hat', name: 'Party Hat', emoji: '🥳', price: 15 },
  { id: 'h-cowboy', slot: 'hat', name: 'Cowboy Hat', emoji: '🤠', price: 25 },
  { id: 'h-top', slot: 'hat', name: 'Top Hat', emoji: '🎩', price: 30 },
  { id: 'h-flower', slot: 'hat', name: 'Flower', emoji: '🌸', price: 20 },
  { id: 'h-crown', slot: 'hat', name: 'Crown', emoji: '👑', price: 80 },
  { id: 'g-none', slot: 'glasses', name: 'No glasses', emoji: '🚫', price: 0 },
  { id: 'g-sun', slot: 'glasses', name: 'Sunglasses', emoji: '🕶️', price: 10 },
  { id: 'g-heart', slot: 'glasses', name: 'Heart Glasses', emoji: '😍', price: 20 },
  { id: 'g-star', slot: 'glasses', name: 'Star Glasses', emoji: '🤩', price: 30 },
  { id: 'k-none', slot: 'cape', name: 'No cape', emoji: '🚫', price: 0 },
  { id: 'k-red', slot: 'cape', name: 'Hero Cape', emoji: '🦸', price: 25 },
  { id: 'k-blue', slot: 'cape', name: 'Sky Cape', emoji: '💙', price: 25 },
  { id: 'k-rainbow', slot: 'cape', name: 'Rainbow Cape', emoji: '🌈', price: 60 },
];

export const itemById = (id: string) => ITEMS.find((i) => i.id === id);

export interface Outfit {
  body: Body;
  color: string; // item ids
  pants: string;
  skin: string;
  hat: string;
  glasses: string;
  cape: string;
}

export interface Save {
  coins: number;
  owned: string[];
  outfit: Outfit;
  /** Obbies (and worlds) finished at least once. */
  done: string[];
  /** Per-world numbers: rides ridden, best rocket height, burgers served... */
  stats: Record<string, number>;
}

export function newSave(): Save {
  return {
    coins: 0,
    owned: [],
    outfit: { body: 'llama', color: 'c-cream', pants: 'p-blue', skin: 's-yellow', hat: 'h-none', glasses: 'g-none', cape: 'k-none' },
    done: [],
    stats: {},
  };
}

/** Fill in anything missing from an older save (or a broken one). */
export function fixSave(s: Partial<Save> | undefined): Save {
  const d = newSave();
  if (!s || typeof s !== 'object') return d;
  const outfit = { ...d.outfit, ...(s.outfit ?? {}) };
  for (const slot of ['color', 'pants', 'skin', 'hat', 'glasses', 'cape'] as const) {
    if (itemById(outfit[slot])?.slot !== slot) outfit[slot] = d.outfit[slot];
  }
  if (outfit.body !== 'llama' && outfit.body !== 'human') outfit.body = 'llama';
  return {
    coins: Number.isFinite(s.coins) ? Math.max(0, Math.floor(s.coins!)) : 0,
    owned: Array.isArray(s.owned) ? s.owned.filter((id) => typeof id === 'string') : [],
    outfit,
    done: Array.isArray(s.done) ? s.done.filter((id) => typeof id === 'string') : [],
    stats: Object.fromEntries(
      Object.entries(s.stats && typeof s.stats === 'object' ? s.stats : {}).filter(([, v]) => Number.isFinite(v)),
    ),
  };
}

export const owns = (s: Save, item: Item) => item.price === 0 || s.owned.includes(item.id);

/** Wear an item, buying it first if needed. Returns what happened, for the shop to show. */
export function pick(s: Save, item: Item): 'worn' | 'bought' | 'too-pricey' {
  let bought = false;
  if (!owns(s, item)) {
    if (s.coins < item.price) return 'too-pricey';
    s.coins -= item.price;
    s.owned.push(item.id);
    bought = true;
  }
  s.outfit[item.slot] = item.id;
  return bought ? 'bought' : 'worn';
}
