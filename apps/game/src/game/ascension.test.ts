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
});
