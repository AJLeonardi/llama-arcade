// Llama-blox's sounds, made from the shared `tone()`.
import { tone, unlock } from '../../../../shared/sfx';

export { unlock };

export const sfx = {
  jump: () => tone(300, 0.15, { to: 600, vol: 0.05 }),
  coin: () => {
    tone(988, 0.08, { vol: 0.06 });
    tone(1319, 0.25, { vol: 0.06, at: 0.08 });
  },
  bounce: () => tone(150, 0.45, { to: 900, type: 'sine', vol: 0.18 }),
  speed: () => tone(400, 0.3, { to: 1400, type: 'sawtooth', vol: 0.04 }),
  oops: () => {
    tone(500, 0.18, { to: 380, type: 'triangle', vol: 0.15 });
    tone(380, 0.3, { to: 220, type: 'triangle', vol: 0.15, at: 0.18 });
  },
  checkpoint: () => [523, 659, 784].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.12, at: i * 0.08 })),
  finish: () =>
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, { type: 'triangle', vol: 0.14, at: i * 0.13 })),
  portal: () => tone(200, 0.6, { to: 1200, type: 'sine', vol: 0.12 }),
  buy: () => {
    tone(1568, 0.1, { vol: 0.05 });
    tone(2093, 0.3, { vol: 0.05, at: 0.1 });
  },
  click: () => tone(700, 0.05, { type: 'triangle', vol: 0.1 }),
  /** A glassy bonk off a wall; louder the harder you hit. */
  bonk: (hard: number) => tone(1200, 0.12, { to: 700, type: 'sine', vol: 0.04 + hard * 0.1 }),
  nope: () => tone(200, 0.2, { type: 'triangle', vol: 0.12 }),
};
