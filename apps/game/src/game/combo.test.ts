import { describe, expect, it } from 'vitest';

import { Rng } from '../util/rng';
import { critChance, CRIT_CHANCE, rollCrit } from './click';
import {
  COMBO_CAP,
  comboMult,
  comboOnClick,
  comboStep,
  comboTier,
  comboTierName,
  createCombo,
  decay,
  tierBeatWindowBonusMs,
  tierCritChanceBonus,
  tierCritMultBonus,
} from './combo';

describe('comboOnClick', () => {
  it('adds +1 per click and +1 more on the beat, refreshing the window', () => {
    let c = createCombo();
    c = comboOnClick(c, false);
    expect(c.stacks).toBe(1);
    expect(c.window).toBeGreaterThan(0);
    c = comboOnClick(c, true); // on-beat ⇒ +2
    expect(c.stacks).toBe(3);
  });
});

describe('decay (soft-decay, spec §4.2.2)', () => {
  it('loses ~20 %/s of large combos exactly (base 0.8) and never resets to 0', () => {
    expect(decay(100, 1)).toBeCloseTo(80, 9);
    expect(decay(100, 2)).toBeCloseTo(64, 9);
    // After a 1.5 s pause it drops gradually, but stays well above 0 (no reset).
    const after = decay(50, 1.5);
    expect(after).toBeGreaterThan(30);
    expect(after).toBeLessThan(50);
  });

  it('falls back to a −1/s floor for small combos and floors at 0', () => {
    expect(decay(3, 1)).toBeCloseTo(2, 9); // 20 % of 3 < 1 ⇒ lose 1
    expect(decay(0.5, 10)).toBe(0); // cannot go negative
    expect(decay(5, 100)).toBe(0);
  });

  it('is a no-op for zero time or empty combos', () => {
    expect(decay(42, 0)).toBe(42);
    expect(decay(0, 5)).toBe(0);
    expect(decay(-3, 5)).toBe(0);
  });

  it('is monotonically non-increasing over time', () => {
    let prev = 120;
    for (let t = 0.1; t <= 20; t += 0.1) {
      const s = decay(120, t);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      expect(s).toBeGreaterThanOrEqual(0);
      prev = s;
    }
  });
});

describe('comboStep', () => {
  it('spends the grace window before any decay', () => {
    let c = comboOnClick(createCombo(), false); // window = 1.5 s, stacks = 1
    c = { ...c, stacks: 40 };
    const still = comboStep(c, 1.0); // inside the window
    expect(still.stacks).toBe(40);
    expect(still.window).toBeCloseTo(0.5, 9);
  });

  it('decays only the time beyond the window', () => {
    const c = { stacks: 100, window: 0.2 };
    const stepped = comboStep(c, 1.2); // 0.2 s window + 1.0 s decay
    expect(stepped.window).toBe(0);
    expect(stepped.stacks).toBeCloseTo(decay(100, 1.0), 9);
  });

  it('is a no-op for non-positive dt', () => {
    const c = { stacks: 10, window: 1 };
    expect(comboStep(c, 0)).toBe(c);
  });
});

describe('comboMult (re-exported single source)', () => {
  it('caps at ×2', () => {
    expect(comboMult(0)).toBe(1);
    expect(comboMult(COMBO_CAP)).toBe(2);
    expect(comboMult(10_000)).toBe(2);
  });
});

describe('comboTier', () => {
  it('maps stacks to the named tiers', () => {
    expect(comboTier(0)).toBe(0);
    expect(comboTier(9)).toBe(0);
    expect(comboTier(10)).toBe(1);
    expect(comboTier(24)).toBe(1);
    expect(comboTier(25)).toBe(2);
    expect(comboTier(49)).toBe(2);
    expect(comboTier(50)).toBe(3);
    expect(comboTier(99)).toBe(3);
    expect(comboTier(100)).toBe(4);
    expect(comboTier(10_000)).toBe(4);
    expect(comboTierName(2)).toBe('Heiß');
    expect(comboTierName(4)).toBe('Inferno');
    expect(comboTierName(0)).toBe('');
  });
});

describe('tier perks (spec §4.2.2 table)', () => {
  it('exposes the exact crit/beat bonuses per tier', () => {
    expect(tierCritChanceBonus(1)).toBe(0);
    expect(tierCritChanceBonus(2)).toBe(0.03);
    expect(tierCritChanceBonus(3)).toBe(0.06);
    expect(tierCritChanceBonus(4)).toBe(0.06);
    expect(tierCritMultBonus(3)).toBe(0);
    expect(tierCritMultBonus(4)).toBe(0.25);
    expect(tierBeatWindowBonusMs(4)).toBe(40);
    expect(tierBeatWindowBonusMs(2)).toBe(0);
  });

  it('AC2: Tier 2 raises the effective crit chance by +3 % (deterministic, seeded)', () => {
    // The perk is exactly +0.03 on the chance used by rollCrit.
    expect(critChance(tierCritChanceBonus(2))).toBeCloseTo(CRIT_CHANCE + 0.03, 12);
    // A float in the (0.20, 0.23] band crits at Tier 2 but not at Tier 0.
    expect(rollCrit(0.21, critChance(tierCritChanceBonus(0)))).toBe(false);
    expect(rollCrit(0.21, critChance(tierCritChanceBonus(2)))).toBe(true);

    // Seeded stream: Tier 2 lands strictly more crits than Tier 0 over 100k rolls,
    // and the surplus is ~3 % of rolls (the +0.03 chance), deterministically.
    const n = 100_000;
    const rng0 = new Rng({ seed: 4242, cursor: 0 });
    const rng2 = new Rng({ seed: 4242, cursor: 0 });
    let c0 = 0;
    let c2 = 0;
    for (let i = 0; i < n; i++) {
      if (rollCrit(rng0.next(), critChance(tierCritChanceBonus(0)))) c0++;
      if (rollCrit(rng2.next(), critChance(tierCritChanceBonus(2)))) c2++;
    }
    expect(c2).toBeGreaterThan(c0);
    expect((c2 - c0) / n).toBeGreaterThan(0.02);
    expect((c2 - c0) / n).toBeLessThan(0.04);
  });
});
