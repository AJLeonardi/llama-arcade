// Sounds made in code, with its own AudioContext (it needs noise): the crack of the bat, the pop of the
// catcher's mitt, the crowd (a murmur that swells into a roar), the organ's "charge!", the umpire's call.
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let crowd: GainNode | null = null;

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
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.4;
    crowd = ctx.createGain();
    crowd.gain.value = 0;
    src.connect(f).connect(crowd).connect(ctx.destination);
    src.start();
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
  osc.stop(t0 + len + 0.02);
}

function burst(len: number, freq: number, q: number, vol: number, at = 0) {
  if (!live()) return;
  const c = ctx!, t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0, Math.random());
  src.stop(t0 + len + 0.02);
}

/** The crowd's background murmur (0..1). */
export function setCrowd(level: number) {
  if (crowd && live()) crowd.gain.setTargetAtTime(level * 0.06, ctx!.currentTime, 0.4);
}

export const sfx = {
  crack(quality: number) {
    burst(0.12, 2600 + quality * 1500, 1.5, 0.5 + quality * 0.4);
    tone(900 + quality * 500, 0.08, { type: 'square', vol: 0.06 });
  },
  foulTip() {
    burst(0.06, 1800, 2, 0.25);
  },
  mitt() {
    burst(0.07, 500, 1.2, 0.6);
    tone(140, 0.08, { vol: 0.15 });
  },
  whoosh() {
    burst(0.25, 400, 0.8, 0.12);
  },
  strike() {
    tone(220, 0.25, { type: 'sawtooth', vol: 0.05, to: 180 });
  },
  cheer(big = false) {
    if (!live()) return;
    for (let i = 0; i < (big ? 6 : 3); i++) burst(big ? 2.8 : 1.4, 800 + i * 300, 0.5, big ? 0.35 : 0.2, i * 0.08);
  },
  groan() {
    burst(1.2, 300, 0.6, 0.18);
    tone(200, 0.8, { to: 120, vol: 0.03, type: 'triangle' });
  },
  /** The ballpark organ: "da-da-da-DAH-da-DAH... CHARGE!" */
  charge() {
    const n = [392, 523, 659, 784, 659, 784];
    const at = [0, 0.15, 0.3, 0.45, 0.75, 0.9];
    n.forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, { type: 'square', vol: 0.05, at: at[i] }));
  },
  tap() {
    tone(660, 0.06, { type: 'triangle', vol: 0.08 });
  },
  fireworks() {
    for (let i = 0; i < 6; i++) {
      burst(0.5, 300, 0.4, 0.4, i * 0.35);
      tone(1200, 0.4, { to: 300, vol: 0.02, at: i * 0.35 - 0.3 > 0 ? i * 0.35 - 0.3 : 0 });
    }
  },
};
