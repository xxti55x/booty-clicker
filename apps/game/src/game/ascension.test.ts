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

  it('soulMult is +10% per held soul (base bonus)', () => {
    expect(soulMult(0)).toBe(1);
    expect(soulMult(1)).toBeCloseTo(1 + SOUL_BONUS, 6);
    expect(soulMult(10)).toBeCloseTo(2, 6);
  });

  // §4.5.2 soul amplifier: a larger per-soul bonus makes each held soul worth more.
  it('soulMult scales with the per-soul bonus (HPF amplifier)', () => {
    expect(soulMult(10, 0.12)).toBeCloseTo(1 + 0.12 * 10, 6); // 0.10 + 0.002·10
    expect(soulMult(10, 0.12)).toBeGreaterThan(soulMult(10, SOUL_BONUS));
  });
});

describe('ascension — pending & gating (against rsLifetime = earned total)', () => {
  it('pending = souls for the deepest zone minus what has been earned', () => {
    const forZone50 = soulsForMaxZone(50);
    expect(pendingSouls(50, 1, 0)).toBe(forZone50);
    expect(pendingSouls(50, 1, forZone50)).toBe(0); // already earned
    expect(pendingSouls(1, 50, 0)).toBe(forZone50); // lifetime counts too
  });

  it('spending souls (held < earned) does NOT refund pending on re-ascension', () => {
    // Earned 129 at zone 50, spent 100 on Ancients ⇒ held 29 but rsLifetime 129.
    expect(pendingSouls(50, 50, 129)).toBe(0); // no new record ⇒ nothing pending
    expect(canAscend(50, 50, 129)).toBe(false);
  });

  it('cannot ascend without at least one newly-earned soul', () => {
    expect(canAscend(5, 1, 0)).toBe(false); // below gate
    expect(canAscend(50, 1, 0)).toBe(true);
    expect(canAscend(50, 50, soulsForMaxZone(50))).toBe(false); // nothing new
  });
});

describe('ascension — held-balance + additive-earn (M10)', () => {
  it('a first ascension from scratch earns exactly the RS_v2 value', () => {
    const after = applyAscension(50, 1, 0, 0);
    expect(after.souls).toBe(soulsForMaxZone(50)); // 129
    expect(after.lifetimeMaxZone).toBe(50);
    expect(after.rsLifetime).toBe(soulsForMaxZone(50));
  });

  it('held souls carry over + only the NEW earned gain is added', () => {
    // Earned 129 at zone 50, spent 100 → held 29, rsLifetime 129. Deepen to zone 80.
    const after = applyAscension(80, 50, 29, 129);
    const gain = soulsForMaxZone(80) - 129;
    expect(after.souls).toBe(29 + gain); // spent souls stay spent
    expect(after.rsLifetime).toBe(soulsForMaxZone(80));
    expect(after.lifetimeMaxZone).toBe(80);
  });

  it('re-ascending without a new record banks nothing extra (no exploit)', () => {
    const first = applyAscension(50, 1, 0, 0);
    const second = applyAscension(3, first.lifetimeMaxZone, first.souls, first.rsLifetime);
    expect(second.souls).toBe(first.souls);
    expect(second.rsLifetime).toBe(first.rsLifetime);
    expect(second.lifetimeMaxZone).toBe(50);
  });

  it('beating the record banks more souls', () => {
    const first = applyAscension(50, 1, 0, 0);
    const deeper = applyAscension(80, first.lifetimeMaxZone, first.souls, first.rsLifetime);
    expect(deeper.souls).toBe(soulsForMaxZone(80));
    expect(deeper.souls).toBeGreaterThan(first.souls);
  });

  // The earned highwater never shrinks: a rsLifetime already above the formula value
  // (e.g. from a prior, steeper tuning) is preserved and yields no phantom gain.
  it('never shrinks the earned highwater or double-grants', () => {
    const earned = soulsForMaxZone(50) + 1000;
    const after = applyAscension(50, 50, earned, earned);
    expect(after.souls).toBe(earned); // no gain, held preserved
    expect(after.rsLifetime).toBe(earned);
    expect(after.lifetimeMaxZone).toBe(50);
  });
});
