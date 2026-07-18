import { describe, expect, it } from 'vitest';

import { CLAPS_PER_PHASE } from '../audio/beat';
import { Rng } from '../util/rng';
import {
  beatBonus,
  BEAT_PERIOD_PHASE,
  beatWindowMs,
  COMBO_CAP,
  comboMult,
  CRIT_CHANCE,
  CRIT_CHANCE_CAP,
  CRIT_MULT,
  critChance,
  critMult,
  effectiveClick,
  isOnBeat,
  ON_BEAT_MULT,
  ON_BEAT_WINDOW_MS,
  phaseVelocity,
  rollCrit,
} from './click';

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

  it('adds a tier crit-mult bonus only on a crit (Tier 4 = +0.25 ⇒ ×5.25)', () => {
    expect(effectiveClick({ baseClick: 10, combo: 0, crit: true, critMultBonus: 0.25 })).toBe(52.5);
    // No effect when the click did not crit.
    expect(effectiveClick({ baseClick: 10, combo: 0, crit: false, critMultBonus: 0.25 })).toBe(10);
  });

  it('scales the WHOLE crit multiplier by critMultFactor (permanent crit-damage tokens)', () => {
    // ×5 base crit × 1.1 token factor = ×5.5 on a crit; the factor multiplies the
    // additive gear/tier bonus too (5.25 × 1.1 = 5.775).
    expect(effectiveClick({ baseClick: 10, combo: 0, crit: true, critMultFactor: 1.1 })).toBe(55);
    expect(
      effectiveClick({
        baseClick: 10,
        combo: 0,
        crit: true,
        critMultBonus: 0.25,
        critMultFactor: 1.1,
      }),
    ).toBeCloseTo(57.75, 6);
    // No effect off a crit, and it defaults to 1.
    expect(effectiveClick({ baseClick: 10, combo: 0, crit: false, critMultFactor: 5 })).toBe(10);
    expect(effectiveClick({ baseClick: 10, combo: 0, crit: true })).toBe(
      effectiveClick({ baseClick: 10, combo: 0, crit: true, critMultFactor: 1 }),
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

describe('critChance / critMult', () => {
  it('adds a bonus and hard-caps chance at 40 %', () => {
    expect(critChance(0)).toBe(CRIT_CHANCE);
    expect(critChance(0.03)).toBeCloseTo(0.23, 12);
    expect(critChance(0.5)).toBe(CRIT_CHANCE_CAP); // 0.2 + 0.5 → capped at 0.4
    expect(critChance(-1)).toBe(CRIT_CHANCE); // negatives ignored
  });

  it('adds an uncapped bonus to the multiplier', () => {
    expect(critMult(0)).toBe(CRIT_MULT);
    expect(critMult(0.25)).toBe(5.25);
  });
});

describe('beatBonus', () => {
  it('is ×1.5 on the beat, ×1 otherwise', () => {
    expect(beatBonus(true)).toBe(ON_BEAT_MULT);
    expect(beatBonus(false)).toBe(1);
  });

  it('widens by a gear/tier bonus on the beat (Neon-Ninja ×1.5 → ×1.6/⭐)', () => {
    expect(beatBonus(true, 0.1)).toBeCloseTo(ON_BEAT_MULT + 0.1, 9);
    expect(beatBonus(false, 0.1)).toBe(1); // off-beat is always ×1
    expect(beatBonus(true, -1)).toBe(ON_BEAT_MULT); // negatives ignored
  });
});

describe('beatWindowMs', () => {
  it('is 100 ms by default and widens with a tier bonus', () => {
    expect(beatWindowMs()).toBe(ON_BEAT_WINDOW_MS);
    expect(beatWindowMs(40)).toBe(140);
    expect(beatWindowMs(-5)).toBe(ON_BEAT_WINDOW_MS); // negatives ignored
  });
});

describe('isOnBeat (AC4 — ±100 ms of a BeatTracker onset, pure phase injection)', () => {
  // Beat onsets fall on integer multiples of BEAT_PERIOD_PHASE = 1/CLAPS_PER_PHASE.
  const period = BEAT_PERIOD_PHASE;
  // Pick a phase velocity so the window maps to a clean phase distance:
  // 100 ms at `vel` phase-units/s ⇒ 0.1·vel phase-units of tolerance.
  const vel = phaseVelocity(0); // base tempo

  it('mirrors the BeatTracker cadence constant', () => {
    expect(period).toBeCloseTo(1 / CLAPS_PER_PHASE, 12);
  });

  it('is on-beat exactly on an onset and just inside ±100 ms', () => {
    const onset = 5 * period; // an onset in phase-space
    expect(isOnBeat(onset, vel, ON_BEAT_WINDOW_MS)).toBe(true);
    // A click 90 ms early/late (in phase-units) is still on-beat…
    const dPhase90 = (90 / 1000) * vel;
    expect(isOnBeat(onset - dPhase90, vel, ON_BEAT_WINDOW_MS)).toBe(true);
    expect(isOnBeat(onset + dPhase90, vel, ON_BEAT_WINDOW_MS)).toBe(true);
  });

  it('is off-beat just outside the window and mid-way between onsets', () => {
    const onset = 5 * period;
    const dPhase110 = (110 / 1000) * vel;
    expect(isOnBeat(onset + dPhase110, vel, ON_BEAT_WINDOW_MS)).toBe(false);
    // Half a beat away is maximally off-beat.
    expect(isOnBeat(onset + period / 2, vel, ON_BEAT_WINDOW_MS)).toBe(false);
  });

  it('the Tier 4 widening (+40 ms) rescues a 120 ms-off click', () => {
    const onset = 3 * period;
    const dPhase120 = (120 / 1000) * vel;
    expect(isOnBeat(onset + dPhase120, vel, ON_BEAT_WINDOW_MS)).toBe(false);
    expect(isOnBeat(onset + dPhase120, vel, beatWindowMs(40))).toBe(true);
  });

  it('guards degenerate inputs', () => {
    expect(isOnBeat(1, 0)).toBe(false); // stationary phase
    expect(isOnBeat(Number.NaN, vel)).toBe(false);
  });
});
