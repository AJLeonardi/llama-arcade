// Mazes: a grid of cells with exactly one way between any two cells (a "perfect" maze), made the same way
// every time from a seed. Dead ends are where the traps go.

/** A tiny random number maker that always gives the same numbers for the same seed. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export interface Maze {
  n: number;
  /** open[cell] = which sides have no wall: [north (+z), east (+x), south (-z), west (-x)]. Cell = row * n + col, row 0 is south. */
  open: boolean[][];
  /** Column of the way in (on the south edge) and the way out (on the north edge). */
  entry: number;
  exit: number;
}

const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // [drow, dcol]: N, E, S, W

export function makeMaze(n: number, seed: number): Maze {
  const rand = rng(seed);
  const open = Array.from({ length: n * n }, () => [false, false, false, false]);
  const seen = new Array(n * n).fill(false);
  // Walk randomly, backing up when stuck (a "recursive backtracker").
  const stack = [0];
  seen[0] = true;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const r = Math.floor(c / n), col = c % n;
    const next = DIRS.map((d, i) => [r + d[0], col + d[1], i] as const).filter(
      ([nr, nc]) => nr >= 0 && nr < n && nc >= 0 && nc < n && !seen[nr * n + nc],
    );
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nr, nc, dir] = next[Math.floor(rand() * next.length)];
    const nxt = nr * n + nc;
    open[c][dir] = true;
    open[nxt][(dir + 2) % 4] = true;
    seen[nxt] = true;
    stack.push(nxt);
  }
  const entry = Math.floor(n / 2);
  const exit = Math.floor(rand() * n);
  return { n, open, entry, exit };
}

/** The cells on the one true way from the entry to the exit. */
export function solve(m: Maze): number[] {
  const { n, open } = m;
  const start = m.entry, goal = (n - 1) * n + m.exit;
  const from = new Map<number, number>([[start, -1]]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift()!;
    if (c === goal) break;
    const r = Math.floor(c / n), col = c % n;
    DIRS.forEach((d, i) => {
      if (!open[c][i]) return;
      const nxt = (r + d[0]) * n + col + d[1];
      if (!from.has(nxt)) {
        from.set(nxt, c);
        queue.push(nxt);
      }
    });
  }
  const path: number[] = [];
  for (let c = goal; c !== -1; c = from.get(c)!) path.unshift(c);
  return path;
}

/** Dead ends (cells with only one way out), not counting the way in and the way out. These get the traps. */
export function deadEnds(m: Maze): number[] {
  const goal = (m.n - 1) * m.n + m.exit;
  return m.open
    .map((o, c) => [o.filter(Boolean).length, c] as const)
    .filter(([ways, c]) => ways === 1 && c !== m.entry && c !== goal)
    .map(([, c]) => c);
}
