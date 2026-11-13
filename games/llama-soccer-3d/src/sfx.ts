// Sounds, all made from shared/sfx.ts tones (no sound files).
import { tone } from '../../../shared/sfx';

export const sfx = {
  kick() {
    tone(150, 0.12, { to: 50, type: 'sine', vol: 0.35 });
    tone(900, 0.03, { type: 'triangle', vol: 0.05 });
  },
  pass() {
    tone(220, 0.08, { to: 90, type: 'sine', vol: 0.2 });
  },
  whistle() {
    for (let i = 0; i < 3; i++) tone(2600 + (i % 2) * 180, 0.07, { type: 'square', vol: 0.05, at: i * 0.07 });
  },
  longWhistle() {
    tone(2600, 0.25, { type: 'square', vol: 0.05 });
    tone(2600, 0.25, { type: 'square', vol: 0.05, at: 0.35 });
    tone(2600, 0.7, { type: 'square', vol: 0.05, at: 0.7 });
  },
  goal() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.14, at: i * 0.1 }));
    for (let i = 0; i < 14; i++) tone(300 + Math.random() * 500, 0.4, { type: 'sawtooth', vol: 0.02, at: Math.random() * 0.8 });
  },
  sad() {
    [392, 349, 311].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.1, at: i * 0.22 }));
  },
  save() {
    tone(120, 0.15, { to: 70, type: 'sine', vol: 0.3 });
    tone(500, 0.2, { to: 300, type: 'triangle', vol: 0.06, at: 0.05 });
  },
  tackle() {
    tone(260, 0.07, { to: 120, type: 'square', vol: 0.06 });
  },
  bounce() {
    tone(180, 0.05, { to: 100, type: 'sine', vol: 0.12 });
  },
  tap() {
    tone(660, 0.06, { type: 'triangle', vol: 0.08 });
  },
  coin() {
    tone(988, 0.08, { type: 'square', vol: 0.05 });
    tone(1319, 0.2, { type: 'square', vol: 0.05, at: 0.08 });
  },
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.13, at: i * 0.13 }));
  },
};
