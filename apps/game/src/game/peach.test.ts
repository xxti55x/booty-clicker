import { describe, expect, it } from 'vitest';

import { Rng } from '../util/rng';
import {
  BOOST_MAX_AHEAD_MS,
  PEACH_BOOST,
  PEACH_BOOST_S,
  PEACH_KEY_CHANCE,
  PEACH_MAX_S,
  PEACH_MIN_S,
  activateBoost,
  boostActive,
  clampBoostUntil,
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

describe('peach — boost-window clamp (§6.2 stacking + clock guard)', () => {
  const now = 1_000_000_000;

  it('is the identity for every legit window — incl. chest-stacked hours past 60 s', () => {
    expect(clampBoostUntil(0, now)).toBe(0); // no boost stays no boost
    expect(clampBoostUntil(now + PEACH_BOOST_S * 1000, now)).toBe(now + PEACH_BOOST_S * 1000);
    // A mythic ×3 boost (160 min) reaches FAR past the 60-s peach base and must
    // survive a reload — the regression this clamp guards against (never wipe to 0).
    const mythic = now + 160 * 60 * 1000;
    expect(clampBoostUntil(mythic, now)).toBe(mythic);
    // Several stacked boosts inside the 24-h ceiling pass through untouched.
    const stacked = now + 20 * 3600 * 1000;
    expect(clampBoostUntil(stacked, now)).toBe(stacked);
  });

  it('clips an absurd-future window (clock set forward, then back) to now + 24 h', () => {
    const yearAhead = now + 365 * 24 * 3600 * 1000;
    expect(clampBoostUntil(yearAhead, now)).toBe(now + BOOST_MAX_AHEAD_MS);
    expect(clampBoostUntil(now + BOOST_MAX_AHEAD_MS + 1, now)).toBe(now + BOOST_MAX_AHEAD_MS);
  });

  it('never returns a negative window', () => {
    expect(clampBoostUntil(-5, now)).toBe(0);
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
