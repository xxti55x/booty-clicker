import { describe, expect, it } from 'vitest';

import { Rng } from '../util/rng';
import { COMBO_CAP, comboMult, CRIT_CHANCE, CRIT_MULT, effectiveClick, rollCrit } from './click';

describe('comboMult', () => {
  it('is 1 at 0 stacks, 2 at the cap, and clamps beyond the cap', () => {
    expect(comboMult(0)).toBe(1);
    expect(comboMult(25)).toBeCloseTo(1.5, 10);
    expect(comboMult(COMBO_CAP)).toBe(2);
    expect(comboMult(COMBO_CAP + 50)).toBe(2); // > cap ⇒ still 2
    expect(comboMult(10_000)).toBe(2);
  });
});

describe('rollCrit', () => {
  it('crits iff the drawn float is below the chance', () => {
    expect(rollCrit(0)).toBe(true);
    expect(rollCrit(CRIT_CHANCE - 1e-9)).toBe(true);
    expect(rollCrit(CRIT_CHANCE)).toBe(false); // boundary is exclusive
    expect(rollCrit(0.9999)).toBe(false);
  });

  it('produces an exact crit sequence for a fixed seed (deterministic)', () => {
    // Seed 12345, chance 0.2 — regression fixture computed from the RNG stream.
    const expected = [
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ];
    const rng = new Rng({ seed: 12345, cursor: 0 });
    const got = Array.from({ length: expected.length }, () => rollCrit(rng.next()));
    expect(got).toEqual(expected);
  });
});

describe('effectiveClick', () => {
  it('multiplies base by combo and crit', () => {
    expect(effectiveClick({ baseClick: 10, combo: 0, crit: false })).toBe(10);
    expect(effectiveClick({ baseClick: 10, combo: 0, crit: true })).toBe(50);
    expect(effectiveClick({ baseClick: 10, combo: COMBO_CAP, crit: false })).toBe(20);
    expect(effectiveClick({ baseClick: 10, combo: COMBO_CAP, crit: true })).toBe(100);
  });

  it('folds in an optional extraMult (the M8+ beat/frenzy/gear hook)', () => {
    expect(effectiveClick({ baseClick: 10, combo: 0, crit: false, extraMult: 3 })).toBe(30);
    // extraMult defaults to 1 (no change).
    expect(effectiveClick({ baseClick: 7, combo: 0, crit: false })).toBe(
      effectiveClick({ baseClick: 7, combo: 0, crit: false, extraMult: 1 }),
    );
  });

  it('has EV ≈ 1.8 per click over 100k seeded rolls (0.2·5 + 0.8·1)', () => {
    const rng = new Rng({ seed: 12345, cursor: 0 });
    const n = 100_000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const crit = rollCrit(rng.next());
      sum += effectiveClick({ baseClick: 1, combo: 0, crit });
    }
    const mean = sum / n;
    const target = CRIT_CHANCE * CRIT_MULT + (1 - CRIT_CHANCE) * 1; // 1.8
    expect(target).toBe(1.8);
    expect(mean).toBeGreaterThan(target * 0.99);
    expect(mean).toBeLessThan(target * 1.01);
  });
});
