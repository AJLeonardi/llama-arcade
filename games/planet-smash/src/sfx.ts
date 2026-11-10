// Sounds, all made in code: zaps, booms, whooshes. Its own AudioContext, woken on the first tap.
let ac: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let master: GainNode | null = null;

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.6;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') void ac.resume();
}

function env(g: GainNode, t: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

/** A pitch sweep. */
export function zap(from: number, to: number, dur: number, type: OscillatorType = 'sawtooth', vol = 0.25, delay = 0) {
  if (!ac || !master) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  env(g, t, vol, 0.01, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Filtered noise: booms (low), whooshes (sweeping), crackles (high). */
export function noise(dur: number, f1: number, f2: number, vol = 0.5, attack = 0.01, delay = 0) {
  if (!ac || !master || !noiseBuf) return;
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f1, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const g = ac.createGain();
  env(g, t, vol, attack, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.05);
}

export const sfx = {
  laser: () => zap(1400, 300, 0.35, 'sawtooth', 0.18),
  plasma: () => { for (let i = 0; i < 3; i++) zap(900, 200, 0.25, 'square', 0.12, i * 0.18); },
  rainbow: () => { zap(300, 2400, 1.2, 'sawtooth', 0.12); zap(450, 3000, 1.2, 'triangle', 0.15); zap(600, 1800, 1.2, 'sine', 0.15); },
  charge: () => zap(200, 2400, 0.5, 'sine', 0.15),
  railgun: () => { zap(3000, 60, 0.4, 'sawtooth', 0.25); noise(0.5, 8000, 400, 0.4); },
  ship: () => zap(1800, 900, 0.12, 'square', 0.06),
  whoosh: (dur = 1.2) => noise(dur, 300, 3000, 0.3, dur * 0.8),
  ufo: () => { zap(500, 520, 1.2, 'sine', 0.12); zap(700, 300, 1.2, 'triangle', 0.08); },
  hum: () => zap(55, 30, 4, 'sine', 0.5),
  hit: () => { noise(0.7, 2000, 80, 0.7); zap(160, 40, 0.5, 'sine', 0.5); },
  bigHit: () => { noise(1.6, 3000, 50, 1); zap(120, 25, 1.4, 'sine', 0.8); },
  plink: () => { zap(2400, 2200, 0.15, 'triangle', 0.2); zap(3200, 3000, 0.2, 'sine', 0.12, 0.05); },
  explode: () => { noise(3.5, 4000, 40, 1.2, 0.02); zap(90, 20, 3, 'sine', 1); noise(2, 600, 60, 0.6, 0.3, 0.4); },
  supernova: () => { noise(5, 6000, 30, 1.2, 0.05); zap(70, 18, 4.5, 'sine', 1); zap(400, 3200, 2.5, 'triangle', 0.1, 0.2); },
  camera: () => { noise(0.08, 9000, 6000, 0.5); noise(0.1, 7000, 3000, 0.4, 0.005, 0.12); },
  click: () => zap(900, 1200, 0.06, 'sine', 0.12),
};
