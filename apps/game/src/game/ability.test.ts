import { describe, expect, it } from 'vitest';

import {
  ABILITY_CHARGE_MAX,
  abilityOnClick,
  activate,
  canActivate,
  chargeFraction,
  createAbility,
  FRENZY_DURATION_MS,
  FRENZY_MULT,
  frenzyFraction,
  frenzyMult,
  isFrenzyActive,
} from './ability';

describe('abilityOnClick (charge meter)', () => {
  it('gains +1 per click and +2 on the beat, clamped at the max', () => {
    let a = createAbility();
    expect(a.charge).toBe(0);
    a = abilityOnClick(a, false);
    expect(a.charge).toBe(1);
    a = abilityOnClick(a, true);
    expect(a.charge).toBe(3);
    a = { ...a, charge: 99 };
    a = abilityOnClick(a, true); // 99 + 2 clamps to 100
    expect(a.charge).toBe(ABILITY_CHARGE_MAX);
  });
});

describe('activate / frenzy (spec §4.2.4 — ×10 for 12 s)', () => {
  it('cannot activate until the meter is full', () => {
    const half = { ...createAbility(), charge: 50 };
    expect(canActivate(half)).toBe(false);
    expect(activate(half, 1000)).toBe(half); // no-op
    const full = { ...createAbility(), charge: ABILITY_CHARGE_MAX };
    expect(canActivate(full)).toBe(true);
  });

  it('activating resets the meter and opens a 12 s ×10 window', () => {
    const now = 1_000_000;
    const full = { ...createAbility(), charge: ABILITY_CHARGE_MAX };
    const fired = activate(full, now);
    expect(fired.charge).toBe(0);
    expect(fired.frenzyUntil).toBe(now + FRENZY_DURATION_MS);
    expect(isFrenzyActive(fired, now)).toBe(true);
    expect(frenzyMult(fired, now)).toBe(FRENZY_MULT);
    expect(frenzyMult(fired, now + FRENZY_DURATION_MS - 1)).toBe(FRENZY_MULT);
    // At/after the end the multiplier drops back to 1.
    expect(frenzyMult(fired, now + FRENZY_DURATION_MS)).toBe(1);
    expect(isFrenzyActive(fired, now + FRENZY_DURATION_MS)).toBe(false);
  });

  it('reports charge + frenzy fractions for the UI', () => {
    expect(chargeFraction({ ...createAbility(), charge: 25 })).toBeCloseTo(0.25, 9);
    expect(chargeFraction({ ...createAbility(), charge: 999 })).toBe(1);
    const now = 5000;
    const fired = activate({ ...createAbility(), charge: ABILITY_CHARGE_MAX }, now);
    expect(frenzyFraction(fired, now)).toBeCloseTo(1, 9);
    expect(frenzyFraction(fired, now + FRENZY_DURATION_MS / 2)).toBeCloseTo(0.5, 6);
    expect(frenzyFraction(fired, now + FRENZY_DURATION_MS)).toBe(0);
  });
});
