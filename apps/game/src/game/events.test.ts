import { describe, expect, it } from 'vitest';

import {
  activateBoost,
  boostActive,
  BOOST_S,
  incomeMultiplier,
  PEACH_BOOST,
  PEACH_MAX_S,
  PEACH_MIN_S,
  rollNextPeachAt,
} from './events';

describe('rollNextPeachAt', () => {
  it('schedules within the 90–240 s window', () => {
    const now = 1_000_000;
    expect(rollNextPeachAt(now, () => 0)).toBe(now + PEACH_MIN_S * 1000);
    expect(rollNextPeachAt(now, () => 1)).toBe(now + PEACH_MAX_S * 1000);
    const mid = rollNextPeachAt(now, () => 0.5);
    expect(mid).toBeGreaterThanOrEqual(now + PEACH_MIN_S * 1000);
    expect(mid).toBeLessThanOrEqual(now + PEACH_MAX_S * 1000);
  });
});

describe('boost', () => {
  it('activateBoost lasts BOOST_S seconds', () => {
    expect(activateBoost(5000)).toBe(5000 + BOOST_S * 1000);
  });

  it('boostActive reflects the deadline', () => {
    expect(boostActive(2000, 1000)).toBe(true);
    expect(boostActive(1000, 1000)).toBe(false);
    expect(boostActive(0, 1000)).toBe(false);
  });

  it('incomeMultiplier is ×3 while active, ×1 otherwise', () => {
    expect(incomeMultiplier(2000, 1000)).toBe(PEACH_BOOST);
    expect(incomeMultiplier(500, 1000)).toBe(1);
  });
});
