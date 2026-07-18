import { describe, expect, it } from 'vitest';

import { Rng } from '../util/rng';
import {
  PEACH_BOOST,
  PEACH_BOOST_S,
  PEACH_KEY_CHANCE,
  PEACH_MAX_S,
  PEACH_MIN_S,
  activateBoost,
  boostActive,
  incomeMultiplier,
  peachKeyRoll,
  rollNextPeachAt,
} from './peach';

describe('peach — schedule (§6.1)', () => {
  it('rolls the next spawn inside the documented 90–240 s window', () => {
    const now = 1_000_000;
    const rng = new Rng({ seed: 11, cursor: 0 });
    for (let i = 0; i < 5000; i++) {
      const at = rollNextPeachAt(now, rng);
      const delayS = (at - now) / 1000;
      expect(delayS).toBeGreaterThanOrEqual(PEACH_MIN_S);
      expect(delayS).toBeLessThan(PEACH_MAX_S);
    }
  });

  it('is deterministic over the seedable RNG', () => {
    const a = new Rng({ seed: 42, cursor: 7 });
    const b = new Rng({ seed: 42, cursor: 7 });
    expect(rollNextPeachAt(0, a)).toBe(rollNextPeachAt(0, b));
    expect(a.cursor).toBe(b.cursor);
  });
});

describe('peach — boost (§6.1)', () => {
  it('is ×3 income for exactly 60 s', () => {
    const now = 5_000;
    const until = activateBoost(now);
    expect(until).toBe(now + PEACH_BOOST_S * 1000);
    expect(PEACH_BOOST).toBe(3);
    expect(incomeMultiplier(until, now)).toBe(3);
    expect(incomeMultiplier(until, now + 59_999)).toBe(3);
    expect(boostActive(until, now + 59_999)).toBe(true);
    expect(incomeMultiplier(until, now + 60_001)).toBe(1); // expired
    expect(boostActive(until, now + 60_001)).toBe(false);
  });
});

describe('peach — key roll (§6.1)', () => {
  it('drops 1 🔑 ~25 % of the time over N seeded draws', () => {
    const rng = new Rng({ seed: 2024, cursor: 0 });
    const draws = 20_000;
    let keys = 0;
    for (let i = 0; i < draws; i++) keys += peachKeyRoll(rng);
    const rate = keys / draws;
    expect(rate).toBeGreaterThan(PEACH_KEY_CHANCE - 0.02);
    expect(rate).toBeLessThan(PEACH_KEY_CHANCE + 0.02);
  });

  it('returns only 0 or 1', () => {
    const rng = new Rng({ seed: 1, cursor: 0 });
    for (let i = 0; i < 100; i++) expect([0, 1]).toContain(peachKeyRoll(rng));
  });
});
