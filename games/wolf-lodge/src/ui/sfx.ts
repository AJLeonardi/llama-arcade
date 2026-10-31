// Sounds made in code. Its own AudioContext (like 3D Skate) because water needs noise, not just notes:
// footsteps, splashes, the rush of water on a slide (louder the faster you go), the hum of the water park,
// the front-desk bell, the countdown beeps, the dragon's roar.
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let rush: { gain: GainNode; filter: BiquadFilterNode } | null = null;
let hum: GainNode | null = null;

export function unlock() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // A looping water rush (rides) and a soft hum of water and people (the water park).
    const loop = (freq: number, q: number) => {
      const src = ctx!.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = ctx!.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx!.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(ctx!.destination);
      src.start();
      return { gain, filter };
    };
    rush = loop(900, 0.6);
    hum = loop(500, 0.3).gain;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

const live = () => ctx && ctx.state === 'running';

function tone(freq: number, len: number, o: { to?: number; type?: OscillatorType; vol?: number; at?: number } = {}) {
  if (!live()) return;
  const c = ctx!, t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + len);
  g.gain.setValueAtTime(o.vol ?? 0.1, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + len + 0.05);
}

function burst(len: number, freq: number, vol: number, o: { type?: BiquadFilterType; to?: number; at?: number } = {}) {
  if (!live() || !noise) return;
  const c = ctx!, t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(freq, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + len);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0, Math.random());
  src.stop(t0 + len + 0.05);
}

export const sfx = {
  step: (wet: boolean) => (wet ? burst(0.18, 1400, 0.05, { type: 'bandpass' }) : burst(0.05, 600 + Math.random() * 300, 0.06)),
  splash: (big = true) => {
    burst(big ? 0.9 : 0.4, big ? 2400 : 1800, big ? 0.35 : 0.15, { to: 300 });
    burst(0.3, 600, 0.2, { at: 0.05 });
  },
  jump: () => burst(0.08, 500, 0.05),
  land: () => burst(0.1, 300, 0.12),
  bounce: () => tone(220, 0.35, { to: 520, type: 'triangle', vol: 0.12 }),
  bell: () => [0, 0.01].forEach((at) => tone(1980, 1.4, { type: 'sine', vol: 0.12, at })),
  click: () => tone(900, 0.05, { type: 'triangle', vol: 0.08 }),
  door: () => {
    tone(1200, 0.08, { type: 'square', vol: 0.03 });
    tone(1600, 0.12, { type: 'square', vol: 0.03, at: 0.09 });
    burst(0.4, 300, 0.08, { at: 0.15 });
  },
  nope: () => tone(180, 0.25, { type: 'triangle', vol: 0.12 }),
  chime: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.1, at: i * 0.09 })),
  wand: () => tone(1200, 0.6, { to: 2400, type: 'sine', vol: 0.06 }),
  beep: (last = false) => tone(last ? 1320 : 880, last ? 0.5 : 0.18, { type: 'square', vol: 0.07 }),
  drop: () => {
    burst(1.2, 4000, 0.25, { to: 400 });
    tone(80, 0.3, { type: 'square', vol: 0.1 });
  },
  whoosh: () => burst(0.5, 1200, 0.12, { type: 'bandpass', to: 3000 }),
  flush: () => {
    burst(1.6, 800, 0.3, { type: 'bandpass', to: 200 });
    tone(300, 1.2, { to: 90, type: 'sine', vol: 0.08 });
  },
  harness: () => tone(120, 0.6, { to: 260, type: 'triangle', vol: 0.12 }),
  roar: () => {
    tone(90, 1.8, { to: 55, type: 'sawtooth', vol: 0.18 });
    tone(140, 1.6, { to: 70, type: 'sawtooth', vol: 0.1 });
    burst(1.8, 700, 0.2, { to: 200 });
  },
  fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.7 : 0.18, { type: 'triangle', vol: 0.12, at: i * 0.14 })),
  snore: () => tone(110, 1.2, { to: 90, type: 'sine', vol: 0.05 }),
};

/** The water rushing past on a slide: speed in m/s (0 = silent). */
export function setRush(speed: number) {
  if (!rush || !ctx) return;
  const t = ctx.currentTime;
  rush.gain.gain.setTargetAtTime(Math.min(0.35, speed * 0.025), t, 0.1);
  rush.filter.frequency.setTargetAtTime(500 + speed * 140, t, 0.1);
}

/** The water park's background noise: 0..1. */
export function setHum(level: number) {
  if (!hum || !ctx) return;
  hum.gain.setTargetAtTime(level * 0.05, ctx.currentTime, 0.5);
}
