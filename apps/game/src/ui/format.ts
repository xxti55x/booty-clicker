const SUFFIXES = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** Compact number formatting (e.g. 1500 → "1.50K"), ported from the prototype's `fmt`. */
export function fmt(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  let i = -1;
  while (n >= 1000 && i < SUFFIXES.length - 1) {
    n /= 1000;
    i++;
  }
  return n.toFixed(2) + SUFFIXES[i];
}
