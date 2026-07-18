import { describe, expect, it } from 'vitest';

import { seasonFor } from './season';

describe('seasonFor (spec §7.5)', () => {
  it('October ⇒ Spooky Booty', () => {
    const s = seasonFor(new Date(2026, 9, 31));
    expect(s?.id).toBe('spooky');
    expect(s?.emoji).toBe('🎃');
  });

  it('December ⇒ Frost-Twerk', () => {
    const s = seasonFor(new Date(2026, 11, 24));
    expect(s?.id).toBe('frost');
    expect(s?.emoji).toBe('❄️');
  });

  it('other months ⇒ no season (null)', () => {
    for (const m of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10]) {
      expect(seasonFor(new Date(2026, m, 15))).toBeNull();
    }
  });

  it('is a total function — every month maps without throwing', () => {
    for (let m = 0; m < 12; m++) {
      expect(() => seasonFor(new Date(2026, m, 1))).not.toThrow();
    }
  });
});
