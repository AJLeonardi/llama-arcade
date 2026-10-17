import { game } from './core.js';
/* Game data: materials, rocket parts, planets, and inventory helpers. */

const MATS = [
  { id: 'stone', name: 'Stone', icon: '🪨', color: '#b8b8b8' },
  { id: 'metal', name: 'Metal', icon: '🔩', color: '#cfd8e3' },
  { id: 'gold', name: 'Gold', icon: '🪙', color: '#ffc928' },
  { id: 'diamond', name: 'Diamonds', icon: '💎', color: '#6ff0ff' },
];
const TOKEN = { id: 'tokens', name: 'Tokens', icon: '🎟️', color: '#ff6fb5' };
const INV_ITEMS = [...MATS, TOKEN];
const MAT_BY_ID = Object.fromEntries(INV_ITEMS.map(m => [m.id, m]));

function randomMaterial(luck = 0) {
  const r = Math.random();
  if (r < 0.04 + luck * 0.03) return 'diamond';
  if (r < 0.17 + luck * 0.07) return 'gold';
  if (r < 0.5) return 'metal';
  return 'stone';
}

// Rocket parts. weight/thrust decide if a rocket can lift off; tier decides how far it can go.
const PARTS = {
  nose:     { name: 'Nose Cone', icon: '🔺', cost: { stone: 2 }, weight: 1, desc: 'Goes on top' },
  cockpit:  { name: 'Cockpit', icon: '🦙', cost: { metal: 3, stone: 1 }, weight: 2, desc: 'Your llama sits here' },
  body:     { name: 'Body Tube', icon: '🛢️', cost: { stone: 2, metal: 1 }, weight: 2, desc: 'Makes it taller' },
  wing:     { name: 'Wing', icon: '🪽', cost: { metal: 2 }, weight: 1, desc: 'Less wobble. Bring spares!' },
  thruster: { name: 'Thruster', icon: '💨', cost: { metal: 2, gold: 1 }, weight: 1, desc: 'Steer faster' },
  engine1:  { name: 'Basic Engine', icon: '🔥', cost: { stone: 3, metal: 3 }, weight: 2, thrust: 12, tier: 1, desc: 'Reaches Mercury & Mars' },
  engine2:  { name: 'Turbo Engine', icon: '⚡', cost: { metal: 5, gold: 3 }, weight: 2, thrust: 20, tier: 2, desc: 'Reaches Choco & Video Games' },
  engine3:  { name: 'Mega Engine', icon: '💥', cost: { gold: 5, diamond: 3 }, weight: 3, thrust: 32, tier: 3, desc: 'Strong enough for Planet Evil!' },
};
const PART_ORDER = ['nose', 'cockpit', 'body', 'wing', 'thruster', 'engine1', 'engine2', 'engine3'];
const isEngine = t => t && t.startsWith('engine');
const ENGINE_NAMES = ['No Engine', 'Basic Engine', 'Turbo Engine', 'Mega Engine'];

const ROCKET_COLORS = ['#ff5a4e', '#3fa9ff', '#5bd65b', '#b46bff', '#ffb31f', '#ff6fb5', '#f2f2f2'];
const PLAYER_SCARF = ['#ff8a1f', '#2ad0ff'];

const EARTH = { name: 'Earth', c1: '#6cc0ff', c2: '#1f5fbf' };
const PLANETS = [
  { name: 'Mercury', need: 1, c1: '#cdbca8', c2: '#6f5f52', sky: ['#120c0a', '#4a3628'], ground: '#a8917a', ground2: '#937d68',
    loot: { stone: 6, metal: 5 }, about: 'Super hot and rocky. It is the closest planet to the Sun!' },
  { name: 'Mars', need: 1, c1: '#ff8a55', c2: '#9a2f17', sky: ['#2a0f08', '#c0613a'], ground: '#c4552c', ground2: '#a8441f',
    loot: { metal: 6, gold: 5 }, about: 'The red planet! Dusty, rusty and full of metal.' },
  { name: 'Planet Choco', need: 2, c1: '#b07040', c2: '#4e2a14', sky: ['#3a1830', '#f6a6c8'], ground: '#6b3b1e', ground2: '#56301a',
    loot: { gold: 7, metal: 3 }, about: 'Everything here is made of chocolate! Yum yum!' },
  { name: 'Planet Video Games', need: 2, c1: '#9b6bff', c2: '#2b1a7a', sky: ['#0a0630', '#3b1fa0'], ground: '#2a2a6a', ground2: '#35358a',
    loot: { diamond: 6, gold: 3 }, about: 'Pixels, power-ups and high scores everywhere!' },
  { name: 'Planet Evil', need: 3, c1: '#e0203a', c2: '#3a0008', sky: ['#100004', '#5a0010'], ground: '#3a0a12', ground2: '#2a060c',
    loot: {}, about: 'The very last planet. Spooky... but you made it!' },
];

// ---------- Save shape ----------
const GRID_W = 7, GRID_H = 9;
function newSave() {
  return {
    inv: { stone: 10, metal: 12, gold: 1, diamond: 0, tokens: 0 },
    parts: Object.fromEntries(PART_ORDER.map(k => [k, 0])),
    design: { cells: {}, color: 0 },
    visited: [],
    won: false,
    seenBay: false,
    seenBuilder: false,
  };
}

// ---------- Inventory helpers ----------
function partCount(key) { return game.save.parts[key] || 0; }
function addPart(key, n) { game.save.parts[key] = Math.max(0, partCount(key) + n); }
function canAfford(cost) { return Object.entries(cost).every(([k, n]) => game.save.inv[k] >= n); }
function pay(cost) { for (const [k, n] of Object.entries(cost)) game.save.inv[k] -= n; }

export { EARTH, ENGINE_NAMES, GRID_H, GRID_W, INV_ITEMS, MATS, MAT_BY_ID, PARTS, PART_ORDER, PLANETS, PLAYER_SCARF, ROCKET_COLORS, TOKEN, addPart, canAfford, isEngine, newSave, partCount, pay, randomMaterial };
