import { describe, expect, it } from 'vitest';

import {
  ACHIEVEMENTS,
  buildAchievementCtx,
  newlyUnlocked,
  type AchievementCtx,
} from './achievements';
import { createUpgrades } from './economy';
import { createGameState } from './state';

function ctx(overrides: Partial<AchievementCtx> = {}): AchievementCtx {
  return {
    maxBp: 0,
    totalClicks: 0,
    maxCombo: 0,
    peachesClicked: 0,
    totalLevels: 0,
    discoLv: 0,
    unlockedSkins: 2,
    rebirths: 0,
    bossDefeated: false,
    ...overrides,
  };
}

const byId = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;

describe('ACHIEVEMENTS', () => {
  it('has 18 unique ids', () => {
    expect(ACHIEVEMENTS.length).toBe(18);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(18);
  });
});

describe('individual predicates (spec AC: at least 3)', () => {
  it('"first" triggers on the first shake', () => {
    expect(byId('first').check(ctx({ totalClicks: 0 }))).toBe(false);
    expect(byId('first').check(ctx({ totalClicks: 1 }))).toBe(true);
  });

  it('"slayer" triggers only once the boss is defeated', () => {
    expect(byId('slayer').check(ctx({ bossDefeated: false }))).toBe(false);
    expect(byId('slayer').check(ctx({ bossDefeated: true }))).toBe(true);
  });

  it('"millionaire" triggers at 1,000,000 BP', () => {
    expect(byId('millionaire').check(ctx({ maxBp: 999_999 }))).toBe(false);
    expect(byId('millionaire').check(ctx({ maxBp: 1_000_000 }))).toBe(true);
  });

  it('"goldrush" triggers after catching a peach', () => {
    expect(byId('goldrush').check(ctx({ peachesClicked: 1 }))).toBe(true);
  });
});

describe('buildAchievementCtx', () => {
  it('derives totalLevels, discoLv and unlockedSkins from state + upgrades', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    upgrades.find((u) => u.id === 'hips')!.lv = 4;
    upgrades.find((u) => u.id === 'disco')!.lv = 2;
    state.unlocked.robo = true; // classic + disco + robo = 3
    const c = buildAchievementCtx(state, upgrades);
    expect(c.totalLevels).toBe(6);
    expect(c.discoLv).toBe(2);
    expect(c.unlockedSkins).toBe(3);
  });
});

describe('newlyUnlocked', () => {
  it('returns met achievements not already unlocked', () => {
    const c = ctx({ totalClicks: 100, maxBp: 1000 });
    const already = new Set(['first']);
    const ids = newlyUnlocked(c, already).map((a) => a.id);
    expect(ids).toContain('warm');
    expect(ids).toContain('coins');
    expect(ids).not.toContain('first'); // already unlocked
    expect(ids).not.toContain('millionaire'); // not met
  });
});
