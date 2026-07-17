/**
 * Compact number formatting for an ENDLESS economy.
 *
 * Named short-scale suffixes up to Decillion (10^33); beyond that we fall back to
 * scientific notation (e.g. "1.23e45") so exponential zone HP never renders as a
 * 40-digit wall. Small numbers (< 1000) stay plain integers, as before.
 */
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'] as const;

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '0';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return Math.floor(n).toString();

  // Pick the tier from log10, then correct float drift at exact powers of 1000
  // (e.g. 1e33 can otherwise render as "1000.00No" instead of "1.00Dc").
  let tier = Math.max(1, Math.floor(Math.log10(n) / 3));
  while (tier + 1 < SUFFIXES.length && n / Math.pow(1000, tier) >= 999.995) tier++;
  if (tier < SUFFIXES.length) {
    const v = n / Math.pow(1000, tier);
    if (v < 999.995) return v.toFixed(2) + SUFFIXES[tier];
  }

  // Past the named suffixes → scientific notation (normalized mantissa).
  let exp = Math.floor(Math.log10(n));
  let mant = n / Math.pow(10, exp);
  if (mant >= 10) {
    mant /= 10;
    exp++;
  }
  return mant.toFixed(2) + 'e' + exp;
}

/** Browser-tab title reflecting current BP (spec §5 M6). */
export function titleFor(bp: number): string {
  return `${fmt(bp)} BP · Booty Clicker`;
}
