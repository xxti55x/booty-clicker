import { describe, expect, it } from 'vitest';

import {
  CH_ACHIEVEMENTS,
  CH_ACHIEVEMENT_IDS,
  buildAchievementCtx,
  isAchievementId,
  newlyUnlocked,
} from './ch-achievements';
import { type ChState, createChState, createStats } from './ch-state';
import { createGear } from './gear';

function unlockedIds(state: ChState, already: Iterable<string> = []): string[] {
  const ctx = buildAchievementCtx(state);
  return newlyUnlocked(ctx, new Set(already))
    .map((a) => a.id)
    .sort();
}

describe('CH achievements — catalog', () => {
  it('has distinct ids, all recognised by isAchievementId', () => {
    expect(new Set(CH_ACHIEVEMENT_IDS).size).toBe(CH_ACHIEVEMENT_IDS.length);
    for (const a of CH_ACHIEVEMENTS) expect(isAchievementId(a.id)).toBe(true);
    expect(isAchievementId('not-real')).toBe(false);
  });
  it('a fresh state unlocks nothing', () => {
    expect(unlockedIds(createChState())).toEqual([]);
  });
});

describe('CH achievements — predicates over the snapshot ctx', () => {
  it('zone milestones read the deepest zone ever reached', () => {
    const s: ChState = { ...createChState(), lifetimeMaxZone: 55 };
    const ids = unlockedIds(s);
    expect(ids).toContain('zone-10');
    expect(ids).toContain('zone-25');
    expect(ids).toContain('zone-50');
    expect(ids).not.toContain('zone-100');
  });

  it('combo-tier achievements derive from max combo stacks', () => {
    const s: ChState = { ...createChState(), stats: { ...createStats(), maxCombo: 55 } };
    const ids = unlockedIds(s);
    expect(ids).toContain('combo-t2'); // 25 stacks
    expect(ids).toContain('combo-t3'); // 50 stacks
    expect(ids).not.toContain('combo-t4'); // needs 100
  });

  it('boss/crit/ascension/gild/chest/key/soul counters gate their achievements', () => {
    const s: ChState = {
      ...createChState(),
      stats: {
        ...createStats(),
        bossKills: 60,
        crits: 1200,
        ascensions: 12,
        chestsOpened: 3,
        keysEarned: 30,
        maxBossStreak: 12,
      },
      gilds: { boss: 7, dj: 4 }, // total 11
      rsLifetime: 150,
      heaven: { hpf: 0, hpfLifetime: 2, ascensions2: 1, tree: {} },
    };
    const ids = unlockedIds(s);
    expect(ids).toEqual(
      expect.arrayContaining([
        'boss-1',
        'boss-50',
        'crit-1k',
        'ascend-1',
        'ascend-10',
        'gild-1',
        'gild-10',
        'chest-1',
        'keys-25',
        'streak-10',
        'souls-100',
        'himmel-1',
        'hpf-1',
      ]),
    );
    expect(ids).not.toContain('boss-500');
    expect(ids).not.toContain('ascend-50');
    expect(ids).not.toContain('souls-10k');
  });

  it('newlyUnlocked excludes ids already in the unlocked set', () => {
    const s: ChState = { ...createChState(), lifetimeMaxZone: 30 };
    const all = unlockedIds(s);
    expect(all).toContain('zone-25');
    const minusOne = unlockedIds(s, ['zone-25']);
    expect(minusOne).not.toContain('zone-25');
    expect(minusOne).toContain('zone-10');
  });
});

describe('CH achievements — Himmelfahrt-safe zone gate', () => {
  it('a zone milestone stays earnable via gear.zoneEver after lifetimeMaxZone resets', () => {
    // A Himmelfahrt drops lifetimeMaxZone to 1 but gear.zoneEver latches the deepest.
    const s: ChState = {
      ...createChState(),
      lifetimeMaxZone: 1,
      gear: { ...createGear(), zoneEver: 120 },
    };
    const ids = unlockedIds(s);
    expect(ids).toContain('zone-100');
    expect(ids).toContain('zone-50');
    expect(ids).not.toContain('zone-200');
  });
});
