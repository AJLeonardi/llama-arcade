// Speed Run PM's sounds, made from the shared `tone()`.
import { tone, unlock } from '../../../../shared/sfx';

export { unlock };

export const sfx = {
  jump: () => tone(300, 0.15, { to: 600, vol: 0.05 }),
  click: () => tone(700, 0.05, { type: 'triangle', vol: 0.1 }),
  /** Running over a key of a keyboard floor: a soft keyboard click-clack (the ASMR part). */
  tick: (n: number) => {
    tone(2000 + (n % 7) * 110, 0.018, { type: 'square', vol: 0.018 });
    tone(520 + (n % 4) * 40, 0.035, { type: 'triangle', vol: 0.05, at: 0.012 });
  },
  zoom: () => tone(400, 0.3, { to: 1400, type: 'sawtooth', vol: 0.04 }),
  /** Breaking into pieces. */
  ouch: () => {
    tone(220, 0.25, { to: 60, type: 'sawtooth', vol: 0.12 });
    [0.05, 0.12, 0.2].forEach((at) => tone(900 + at * 2000, 0.06, { type: 'square', vol: 0.04, at }));
  },
  finish: () =>
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, { type: 'triangle', vol: 0.14, at: i * 0.13 })),
  /** Smashing through a speed wall. */
  smash: () => {
    tone(140, 0.4, { to: 40, type: 'sawtooth', vol: 0.16 });
    [0, 0.06, 0.12, 0.2, 0.3].forEach((at) => tone(600 + Math.random() * 900, 0.08, { type: 'square', vol: 0.05, at }));
  },
  pad: () => tone(250, 0.5, { to: 1600, type: 'sine', vol: 0.12 }),
  next: () => tone(200, 0.6, { to: 1200, type: 'sine', vol: 0.12 }),
  nope: () => tone(200, 0.2, { type: 'triangle', vol: 0.12 }),
};
