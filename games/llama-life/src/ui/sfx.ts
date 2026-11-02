// Sounds made with WebAudio (no sound files). Its own AudioContext, since the engine hum keeps running.
// iOS only allows sound after a tap, so unlock() is called from the first pointerdown.
let ctx: AudioContext | null = null;
let engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

export function unlock() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function note(freq: number, len: number, o: { type?: OscillatorType; vol?: number; at?: number; to?: number } = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + len);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(o.vol ?? 0.1, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + len + 0.05);
}

function noise(len: number, vol: number, freq: number) {
  if (!ctx || ctx.state !== 'running') return;
  const n = Math.floor(ctx.sampleRate * len);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

export const sfx = {
  click: () => note(660, 0.08, { type: 'triangle', vol: 0.06 }),
  take: () => {
    note(880, 0.12, { type: 'triangle', vol: 0.09 });
    note(1320, 0.18, { type: 'triangle', vol: 0.08, at: 0.08 });
  },
  yum: () => {
    note(520, 0.1, { type: 'sine', vol: 0.1 });
    note(390, 0.12, { type: 'sine', vol: 0.1, at: 0.12 });
    note(620, 0.16, { type: 'sine', vol: 0.1, at: 0.24 });
  },
  door: () => note(300, 0.15, { type: 'triangle', vol: 0.07, to: 200 }),
  horn: () => {
    note(392, 0.45, { type: 'sawtooth', vol: 0.06 });
    note(494, 0.45, { type: 'sawtooth', vol: 0.05 });
  },
  bump: (hard: number) => noise(0.25, Math.min(0.5, 0.1 + hard * 0.03), 500),
  splash: () => noise(0.5, 0.25, 1800),
  jump: () => note(400, 0.15, { type: 'sine', vol: 0.06, to: 700 }),
  reward: () => [523, 659, 784, 1047].forEach((f, i) => note(f, 0.35, { type: 'triangle', vol: 0.1, at: i * 0.12 })),
  bell: () => [784, 659, 523].forEach((f, i) => note(f, 0.5, { type: 'sine', vol: 0.1, at: i * 0.25 })),
  lullaby: () => [392, 330, 349, 294, 262].forEach((f, i) => note(f, 0.6, { type: 'sine', vol: 0.08, at: i * 0.3 })),
  morning: () => [523, 659, 784].forEach((f, i) => note(f, 0.3, { type: 'sine', vol: 0.08, at: i * 0.15 })),
  nope: () => note(220, 0.25, { type: 'triangle', vol: 0.08, to: 180 }),
};

/** The engine hum: on while you're in a car, pitch going up with speed. */
export function engineSound(on: boolean, speed: number, top: number) {
  if (!ctx || ctx.state !== 'running') return;
  if (!engine) {
    const osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(ctx.destination);
    osc.start();
    osc2.start();
    engine = { osc, osc2, gain, filter };
  }
  const t = ctx.currentTime;
  const k = Math.min(1, Math.abs(speed) / top);
  // Gears: the pitch climbs, drops a bit, climbs again.
  const gear = Math.min(4, Math.floor(k * 4.5));
  const inGear = k * 4.5 - gear;
  const f = 38 + gear * 6 + inGear * 40;
  engine.osc.frequency.setTargetAtTime(f, t, 0.05);
  engine.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
  engine.filter.frequency.setTargetAtTime(300 + k * 900, t, 0.05);
  engine.gain.gain.setTargetAtTime(on ? 0.05 + k * 0.05 : 0, t, 0.08);
}
