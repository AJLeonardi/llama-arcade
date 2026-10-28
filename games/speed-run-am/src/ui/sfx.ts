// Speed Run AM's sounds, made from the shared `tone()`.
import { tone, unlock } from '../../../../shared/sfx';

export { unlock };

export const sfx = {
  jump: () => tone(300, 0.15, { to: 600, vol: 0.05 }),
  click: () => tone(700, 0.05, { type: 'triangle', vol: 0.1 }),
  key: (n: number) => tone(440 * Math.pow(2, (n % 12) / 12), 0.12, { type: 'triangle', vol: 0.08 }),
  /** Running over a key of a keyboard floor: a soft clicky tick. */
  tick: (n: number) => tone(1800 + (n % 5) * 120, 0.03, { type: 'triangle', vol: 0.025 }),
  zoom: () => tone(400, 0.3, { to: 1400, type: 'sawtooth', vol: 0.04 }),
  /** Breaking into pieces. */
  smash: () => {
    tone(220, 0.25, { to: 60, type: 'sawtooth', vol: 0.12 });
    [0.05, 0.12, 0.2].forEach((at) => tone(900 + at * 2000, 0.06, { type: 'square', vol: 0.04, at }));
  },
  trap: () => tone(1200, 0.7, { to: 150, type: 'sine', vol: 0.15 }),
  chase: () => [392, 370, 392, 370].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.06, at: i * 0.14 })),
  poop: () => tone(90, 0.6, { to: 60, type: 'sawtooth', vol: 0.12 }),
  checkpoint: () => [523, 659, 784].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.12, at: i * 0.08 })),
  cape: () => [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.12, at: i * 0.1 })),
  finish: () =>
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, { type: 'triangle', vol: 0.14, at: i * 0.13 })),
  door: () => tone(200, 0.6, { to: 1200, type: 'sine', vol: 0.12 }),
  nope: () => tone(200, 0.2, { type: 'triangle', vol: 0.12 }),
};
