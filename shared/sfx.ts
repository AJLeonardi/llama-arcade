// Little sound effects made with WebAudio (no sound files): `tone()` plays one note; each game builds its own
// list of sounds from it. iOS only allows sound after a tap, so
// `unlock()` is called from the first pointerdown.
let ctx: AudioContext | null = null;

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

/** One note: a frequency (or a slide from one to another), a wave shape, a length and a volume. */
export function tone(freq: number, len: number, opts: { to?: number; type?: OscillatorType; vol?: number; at?: number } = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + (opts.at ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + len);
  const vol = opts.vol ?? 0.08;
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + len + 0.02);
}
