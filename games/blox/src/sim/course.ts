// A tiny helper for laying out obbies: a cursor walks forward (+z), placing one platform after another.
// It keeps the main path's platforms in order, so tests/levels.test.ts can check every jump is possible.
import type { Block, Kind, V3 } from './types';

export interface PlatformOpts {
  /** Space before this platform (from the back edge of the last one). */
  gap?: number;
  /** Platform size across (x) and along (z). */
  w?: number;
  d?: number;
  /** Height change of the top from the last platform. */
  rise?: number;
  /** Sideways shift of the centre from the last platform. */
  side?: number;
  kind?: Kind;
  color?: string;
  /** Put a coin floating above it. */
  coin?: boolean;
  move?: Block['move'];
  push?: Block['push'];
}

export class Course {
  readonly blocks: Block[] = [];
  readonly coins: V3[] = [];
  /** The main path's platforms, in order. */
  readonly path: Block[] = [];
  /** The last platform on the path. */
  private last: Block | null = null;
  private colors: string[];
  private n = 0;

  constructor(colors: string[], readonly thick = 1) {
    this.colors = colors;
  }

  /** Top of the last platform, and its centre. */
  get top() {
    return this.last ? this.last.y + this.last.h / 2 : 0;
  }
  get end(): V3 {
    return this.last ? [this.last.x, this.top, this.last.z + this.last.d / 2] : [0, 0, 0];
  }

  /** The next platform on the path. */
  add(o: PlatformOpts = {}) {
    const w = o.w ?? 3, d = o.d ?? 3, gap = o.gap ?? 2, rise = o.rise ?? 0, side = o.side ?? 0;
    const kind = o.kind ?? 'solid';
    const prev = this.last;
    const top = this.top + rise;
    const z0 = prev ? prev.z + prev.d / 2 + gap : 0;
    const b: Block = {
      x: (prev ? prev.x : 0) + side,
      y: top - this.thick / 2,
      z: z0 + d / 2,
      w,
      h: this.thick,
      d,
      kind,
      color: o.color ?? KIND_COLOR[kind] ?? this.colors[this.n++ % this.colors.length],
    };
    if (o.move) b.move = o.move;
    if (o.push) b.push = o.push;
    this.blocks.push(b);
    this.path.push(b);
    if (o.coin) this.coins.push([b.x, top + 1.3, b.z]);
    this.last = b;
    return b;
  }

  /** Any extra block that isn't on the main path (lava, walls, decorations). */
  block(b: Omit<Block, 'color'> & { color?: string }) {
    const full = { ...b, color: b.color ?? KIND_COLOR[b.kind] ?? '#cccccc' } as Block;
    this.blocks.push(full);
    return full;
  }

  coin(x: number, y: number, z: number) {
    this.coins.push([x, y, z]);
  }
}

/** Special blocks always look the same, so kids learn what they do. */
export const KIND_COLOR: Partial<Record<Kind, string>> = {
  lava: '#ff4a1c',
  bounce: '#ff4fa3',
  speed: '#ffd02a',
  checkpoint: '#3d8bff',
  finish: '#ffffff',
  conveyor: '#55606e',
  vanish: '#b98cff',
};
