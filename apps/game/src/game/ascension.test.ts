import { describe, expect, it } from 'vitest';

import {
  applyAscension,
  ASCEND_MIN_ZONE,
  canAscend,
  pendingSouls,
  SOUL_BONUS,
  soulMult,
  soulsForMaxZone,
} from './ascension';

describe('ascension — souls', () => {
  it('grants no souls below the ascension gate', () => {
    expect(soulsForMaxZone(ASCEND_MIN_ZONE - 1)).toBe(0);
    expect(soulsForMaxZone(1)).toBe(0);
  });

  it('is monotonic and rewards deeper runs', () => {
    expect(soulsForMaxZone(50)).toBeGreaterThan(soulsForMaxZone(25));
    expect(soulsForMaxZone(100)).toBeGreaterThan(soulsForMaxZone(50));
  });

  // RS_v2 retune (spec §4.5.1 table): ⌊z^1.6/40⌋ + ⌊1.10^z − 1⌋.
  it('matches the RS_v2 table exactly (§4.5.1)', () => {
    expect(soulsForMaxZone(10)).toBe(1);
    expect(soulsForMaxZone(15)).toBe(4);
    expect(soulsForMaxZone(20)).toBe(8);
    expect(soulsForMaxZone(25)).toBe(13);
    expect(soulsForMaxZone(30)).toBe(21);
    expect(soulsForMaxZone(40)).toBe(53);
    expect(soulsForMaxZone(50)).toBe(129);
    expect(soulsForMaxZone(60)).toBe(320);
    expect(soulsForMaxZone(75)).toBe(1295);
    expect(soulsForMaxZone(100)).toBe(13818);
  });

  // Anti-plateau property (spec §4.5-AC1): from z≥40 a +5 best-zone multiplies the
  // bank by at least ×1.3 — new records *multiply*, they don't merely increment.
  it('a +5 best-zone grows the bank by ≥ ×1.3 for z ≥ 40', () => {
    for (let z = 40; z <= 120; z += 5) {
      expect(soulsForMaxZone(z + 5)).toBeGreaterThanOrEqual(1.3 * soulsForMaxZone(z));
    }
  });

  it('soulMult is +10% per soul', () => {
    expect(soulMult(0)).toBe(1);
    expect(soulMult(1)).toBeCloseTo(1 + SOUL_BONUS, 6);
    expect(soulMult(10)).toBeCloseTo(2, 6);
  });
});

describe('ascension — pending & gating', () => {
  it('pending = souls for the deepest zone minus what is banked', () => {
    const forZone50 = soulsForMaxZone(50);
    expect(pendingSouls(50, 1, 0)).toBe(forZone50);
    expect(pendingSouls(50, 1, forZone50)).toBe(0); // already banked
    expect(pendingSouls(1, 50, 0)).toBe(forZone50); // lifetime counts too
  });

  it('cannot ascend without at least one new soul', () => {
    expect(canAscend(5, 1, 0)).toBe(false); // below gate
    expect(canAscend(50, 1, 0)).toBe(true);
    expect(canAscend(50, 50, soulsForMaxZone(50))).toBe(false); // nothing new
  });

  it('ascending again after no new record banks nothing extra (no exploit)', () => {
    const first = applyAscension(50, 1, 0);
    expect(first.souls).toBe(soulsForMaxZone(50));
    // ascend again immediately at a shallower run → souls unchanged
    const second = applyAscension(3, first.lifetimeMaxZone, first.souls);
    expect(second.souls).toBe(first.souls);
    expect(second.lifetimeMaxZone).toBe(50);
  });

  it('beating the record banks more souls', () => {
    const first = applyAscension(50, 1, 0);
    const deeper = applyAscension(80, first.lifetimeMaxZone, first.souls);
    expect(deeper.souls).toBe(soulsForMaxZone(80));
    expect(deeper.souls).toBeGreaterThan(first.souls);
  });

  // The bank-never-shrinks guard is exactly what makes the RS_v2 retune migration-
  // free: a bank already larger than the formula (any prior tuning) is preserved.
  it('never shrinks a bank that already exceeds the formula value', () => {
    const banked = soulsForMaxZone(50) + 1000;
    const after = applyAscension(50, 50, banked);
    expect(after.souls).toBe(banked);
    expect(after.lifetimeMaxZone).toBe(50);
  });
});
