// Skateboard sounds made in code: the wheels' roll (filtered noise that follows the speed), the pop of an
// ollie, the clack of a landing, the scrape of a grind. Uses its own AudioContext because it needs noise,
// which shared/sfx.ts's `tone()` can't make.
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let roll: { gain: GainNode; filter: BiquadFilterNode } | null = null;
let grind: { gain: GainNode } | null = null;

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
    roll = loop(400, 'lowpass', 0.8);
    const g = loop(2600, 'bandpass', 3);
    grind = { gain: g.gain };
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function loop(freq: number, type: BiquadFilterType, q: number) {
  const src = ctx!.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = ctx!.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx!.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(ctx!.destination);
  src.start();
  return { gain, filter };
}

/** Called every frame: wheel noise for this speed (0 when in the air), grind scrape on or off. */
export function rolling(speed: number, onGround: boolean, grinding: boolean) {
  if (!ctx || !roll || !grind) return;
  const t = ctx.currentTime;
  const v = onGround ? Math.min(1, speed / 14) : 0;
  roll.gain.gain.setTargetAtTime(v * 0.35, t, 0.05);
  roll.filter.frequency.setTargetAtTime(250 + v * 900, t, 0.05);
  grind.gain.gain.setTargetAtTime(grinding ? 0.12 : 0, t, 0.03);
}

/** A short burst of noise through a filter: the clacks and pops. */
function hit(freq: number, len: number, vol: number, type: BiquadFilterType = 'bandpass') {
  if (!ctx || !noise || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t, Math.random());
  src.stop(t + len + 0.02);
}

function tone(freq: number, len: number, vol = 0.06, at = 0, type: OscillatorType = 'triangle') {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

export const sfx = {
  pop: () => {
    hit(1800, 0.06, 0.6);
    hit(500, 0.08, 0.4);
  },
  land: (hard: number) => {
    const v = Math.min(1, 0.3 + hard / 12);
    hit(900, 0.09, 0.7 * v);
    hit(160, 0.18, 0.9 * v, 'lowpass');
  },
  bump: () => hit(200, 0.12, 0.5, 'lowpass'),
  bail: () => {
    hit(300, 0.25, 0.8, 'lowpass');
    hit(1200, 0.15, 0.4);
    tone(220, 0.25, 0.05, 0.05, 'sawtooth');
    tone(160, 0.35, 0.05, 0.18, 'sawtooth');
  },
  trick: (n: number) => {
    const notes = [523, 659, 784, 1047];
    for (let i = 0; i < Math.min(4, n + 1); i++) tone(notes[i], 0.18, 0.05, i * 0.07);
  },
  click: () => tone(880, 0.06, 0.04),
};
