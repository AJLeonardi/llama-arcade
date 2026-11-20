// Big numbers made short for the screen: 1,234 → "1.2K", 5,600,000 → "5.6M", and Infinity → "∞".

const NAMES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function short(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const k = Math.floor(Math.log10(n) / 3);
  if (k >= NAMES.length) {
    const e = Math.floor(Math.log10(n));
    return `${(n / 10 ** e).toFixed(1)}e${e}`;
  }
  const v = n / 1000 ** k;
  return `${v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10}${NAMES[k]}`;
}

/** Rounded to 2 digits: 3276 → 3300. */
export function nice(n: number): number {
  if (!Number.isFinite(n) || n < 100) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}
