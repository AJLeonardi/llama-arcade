// The teams (all made up) and Leonardo Benjamin's road from high school to the Finals.
import { PARKS, type Park } from './field';

export interface Player {
  name: string;
  num: number;
  /** 0.7..1.2: how hard they hit. */
  power: number;
  /** 0..1: how often they make good contact (computer batters). */
  eye: number;
}

export interface Team {
  id: string;
  name: string;
  city: string;
  abbr: string;
  /** Jersey, trim (cap, socks, sleeves), pants. */
  colors: [string, string, string];
  /** Fastball speed (m/s) of their pitchers. */
  fastball: number;
  /** 0..1 how well their pitchers hit their spot. */
  control: number;
  /** 0..1 how good their batters are. */
  skill: number;
  /** How fast their fielders get to the ball (1 = normal). */
  fielding: number;
  park: keyof typeof PARKS;
  emoji: string;
  /** Kids' size in the backyard; grown-ups everywhere else. */
  kids?: boolean;
}

export const LEO: Player = { name: 'Leonardo Benjamin', num: 7, power: 1.1, eye: 0.8 };

const FIRST = ['Max', 'Sam', 'Theo', 'Jack', 'Leo', 'Owen', 'Eli', 'Noah', 'Ben', 'Cole', 'Finn', 'Gus', 'Hank', 'Ike', 'Jude', 'Kai', 'Luke', 'Milo', 'Nate', 'Oscar', 'Pete', 'Ray', 'Tom', 'Wes', 'Zeke', 'Ava', 'Mia', 'Lucy', 'Ruby', 'Zoe'];
const LAST = ['Rivera', 'Kim', 'Patel', 'Brooks', 'Nguyen', 'Garcia', 'Miller', 'Lopez', 'Carter', 'Bell', 'Hayes', 'Price', 'Ortiz', 'Reed', 'Shaw', 'Ward', 'Fox', 'Lane', 'Stone', 'Park', 'Cruz', 'Diaz', 'Webb', 'Ross'];

/** A seeded random number generator (so a team's players are the same every time). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
const hash = (str: string) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** The nine batters for a team. Leonardo bats third for his teams. */
export function lineup(t: Team, withLeo: boolean): Player[] {
  const r = rng(hash(t.id));
  const out: Player[] = [];
  const used = new Set<number>([7]);
  for (let i = 0; i < 9; i++) {
    let num = 1 + Math.floor(r() * 49);
    while (used.has(num)) num = (num % 49) + 1;
    used.add(num);
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    const slugger = i === 2 || i === 3;
    out.push({ name, num, power: (slugger ? 1.05 : 0.85) + r() * 0.15, eye: 0.4 + r() * 0.3 });
  }
  if (withLeo) out[2] = LEO;
  return out;
}

export const TEAMS: Team[] = [
  // High school.
  { id: 'pinevalley', name: 'Llamas', city: 'Pine Valley High', abbr: 'PVH', colors: ['#1d6b3a', '#f2c230', '#f4f1e8'], fastball: 30, control: 0.7, skill: 0.5, fielding: 0.95, park: 'hs', emoji: '🦙' },
  { id: 'riverside', name: 'Raccoons', city: 'Riverside High', abbr: 'RIV', colors: ['#5a5f6b', '#111111', '#e9e9e9'], fastball: 27, control: 0.55, skill: 0.28, fielding: 0.85, park: 'hs', emoji: '🦝' },
  { id: 'oakhill', name: 'Owls', city: 'Oak Hill High', abbr: 'OAK', colors: ['#6b3d1f', '#e8a33c', '#f1e6d2'], fastball: 28, control: 0.6, skill: 0.33, fielding: 0.9, park: 'hs', emoji: '🦉' },
  { id: 'lakeview', name: 'Lions', city: 'Lakeview High', abbr: 'LKV', colors: ['#c8902a', '#4a2a10', '#f4f1e8'], fastball: 29, control: 0.62, skill: 0.38, fielding: 0.9, park: 'hs', emoji: '🦁' },
  { id: 'cedarcreek', name: 'Coyotes', city: 'Cedar Creek High', abbr: 'CCK', colors: ['#8a2b2b', '#e5d3b3', '#eeeeee'], fastball: 30, control: 0.66, skill: 0.43, fielding: 0.95, park: 'hs', emoji: '🐺' },
  { id: 'summit', name: 'Sharks', city: 'Summit High', abbr: 'SUM', colors: ['#1f5fa8', '#c0c8d0', '#f4f4f4'], fastball: 31, control: 0.7, skill: 0.48, fielding: 1, park: 'hs', emoji: '🦈' },
  // College.
  { id: 'strikers', name: 'Strikers', city: 'Boston', abbr: 'BOS', colors: ['#14284b', '#c8102e', '#f4f4f4'], fastball: 35, control: 0.78, skill: 0.62, fielding: 1, park: 'college', emoji: '⚾' },
  { id: 'newhaven', name: 'Knights', city: 'New Haven', abbr: 'NHK', colors: ['#2a2a6b', '#9fb3d1', '#ececec'], fastball: 33, control: 0.72, skill: 0.55, fielding: 1, park: 'college', emoji: '🛡️' },
  { id: 'albany', name: 'Comets', city: 'Albany', abbr: 'ALB', colors: ['#d9531e', '#1b1b1b', '#f2f2f2'], fastball: 34, control: 0.74, skill: 0.58, fielding: 1, park: 'college', emoji: '☄️' },
  { id: 'burlington', name: 'Bears', city: 'Burlington', abbr: 'BUR', colors: ['#2e5a2e', '#e9e2c8', '#f2f2f2'], fastball: 34, control: 0.76, skill: 0.6, fielding: 1.02, park: 'college', emoji: '🐻' },
  // The big one.
  { id: 'lightning', name: 'Lightning', city: 'Providence', abbr: 'PRV', colors: ['#3b1f7a', '#ffd21f', '#f4f4f4'], fastball: 38, control: 0.84, skill: 0.72, fielding: 1.05, park: 'pro', emoji: '⚡' },
  // Backyard.
  { id: 'backyard-a', name: 'Backyard Bandits', city: 'Your Street', abbr: 'YOU', colors: ['#e8452c', '#ffffff', '#3a4a6a'], fastball: 17, control: 0.6, skill: 0.35, fielding: 0.8, park: 'backyard', emoji: '🏡', kids: true },
  { id: 'backyard-b', name: 'Next Door Dogs', city: 'Next Door', abbr: 'DOG', colors: ['#3a7fd6', '#ffffff', '#555555'], fastball: 17, control: 0.6, skill: 0.35, fielding: 0.8, park: 'backyard', emoji: '🐶', kids: true },
];

export const team = (id: string) => TEAMS.find((t) => t.id === id)!;

// ---------------------------------------------------------------- the career

export interface Stage {
  title: string;
  /** Leonardo's team in this stage. */
  team: string;
  /** Opponents, one game each. */
  games: string[];
  /** Wins needed to move on. Playoff stages need every game (lose one and you try it again). */
  need: number;
  playoff: boolean;
  intro: string;
  park: keyof typeof PARKS;
}

export const CAREER: Stage[] = [
  {
    title: 'High School Season',
    team: 'pinevalley',
    games: ['riverside', 'oakhill', 'lakeview'],
    need: 2,
    playoff: false,
    intro: 'Leonardo Benjamin plays for the Pine Valley High Llamas. Win 2 of 3 games to make the playoffs!',
    park: 'hs',
  },
  {
    title: 'High School Playoffs',
    team: 'pinevalley',
    games: ['cedarcreek', 'summit'],
    need: 2,
    playoff: true,
    intro: 'Playoffs! Win the semifinal and the championship. College scouts are watching...',
    park: 'hs',
  },
  {
    title: 'College: Boston Strikers',
    team: 'strikers',
    games: ['newhaven', 'albany', 'burlington'],
    need: 2,
    playoff: false,
    intro: 'The Boston Strikers picked Leonardo for their college team! Win 2 of 3 to get to the Finals.',
    park: 'college',
  },
  {
    title: 'THE FINALS',
    team: 'strikers',
    games: ['lightning'],
    need: 1,
    playoff: true,
    intro: 'The Finals, under the lights in Providence. The Lightning have been to 7 Finals. Beat them!',
    park: 'pro',
  },
];

export interface CareerSave {
  stage: number;
  game: number;
  wins: number;
  played: number;
  champion: boolean;
}
export const NEW_CAREER: CareerSave = { stage: 0, game: 0, wins: 0, played: 0, champion: false };

/** Move the career on after a game. Returns what to tell the player. */
export function afterGame(c: CareerSave, won: boolean): { save: CareerSave; text: string; stageDone: boolean } {
  const st = CAREER[c.stage];
  const s = { ...c };
  if (st.playoff) {
    if (!won) return { save: s, text: 'So close! Playoff games have to be won. Try this game again!', stageDone: false };
    s.game++;
    s.wins++;
    s.played++;
  } else {
    s.game++;
    s.played++;
    if (won) s.wins++;
    const left = st.games.length - s.game;
    if (s.wins < st.need && s.wins + left < st.need) {
      return { save: { ...s, game: 0, wins: 0, played: 0 }, text: `Not enough wins this time. Let's play the ${st.title} again!`, stageDone: false };
    }
  }
  if (s.wins >= st.need) {
    if (c.stage === CAREER.length - 1) return { save: { ...s, champion: true }, text: 'CHAMPIONS! Leonardo Benjamin won the Finals!', stageDone: true };
    return { save: { stage: c.stage + 1, game: 0, wins: 0, played: 0, champion: c.champion }, text: `${st.title}: done! On to the ${CAREER[c.stage + 1].title}!`, stageDone: true };
  }
  return { save: s, text: won ? 'You won! Next game...' : 'You lost this one. Next game!', stageDone: false };
}

export const parkOf = (id: keyof typeof PARKS): Park => PARKS[id];
