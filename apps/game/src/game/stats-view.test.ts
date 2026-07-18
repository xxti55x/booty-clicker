import { describe, expect, it } from 'vitest';

import {
  ascendState,
  createChState,
  createStats,
  himmelfahrtState,
  type ChState,
} from './ch-state';
import { createGear } from './gear';
import { bestZoneEver, onBeatQuote, statsView, type StatRow } from './stats-view';

function val(rows: readonly StatRow[], key: string): number {
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`no stat row ${key}`);
  return row.value;
}

/** A rich state: deep lifetime counters + a live run to prestige away. */
function richState(): ChState {
  return {
    ...createChState(),
    zone: 40,
    runMaxZone: 40,
    lifetimeMaxZone: 40,
    gold: 5000,
    souls: 20,
    rsLifetime: 53,
    totalClicks: 3000,
    gilds: { boss: 3 },
    heaven: { hpf: 2, hpfLifetime: 7, ascensions2: 1, tree: {} },
    gear: { ...createGear(), zoneEver: 40 },
    combo: { stacks: 60 },
    stats: {
      ...createStats(),
      crits: 500,
      onBeatClicks: 300,
      bossKills: 8,
      bossTimeouts: 2,
      goldLifetime: 999_999,
      playTimeS: 3600,
      ascensions: 4,
      chestsOpened: 6,
      maxCombo: 80,
      bossStreak: 5,
      maxBossStreak: 9,
      keysEarned: 15,
    },
  };
}

describe('statsView — lifetime vs current-run split', () => {
  it('projects lifetime counters and run values into the right buckets', () => {
    const view = statsView(richState());
    // Lifetime bucket.
    expect(val(view.lifetime, 'bestZone')).toBe(40);
    expect(val(view.lifetime, 'goldLifetime')).toBe(999_999);
    expect(val(view.lifetime, 'crits')).toBe(500);
    expect(val(view.lifetime, 'onBeatQuote')).toBeCloseTo(0.1);
    expect(val(view.lifetime, 'maxCombo')).toBe(80);
    expect(val(view.lifetime, 'bossKills')).toBe(8);
    expect(val(view.lifetime, 'ascensions')).toBe(4);
    expect(val(view.lifetime, 'himmelfahrten')).toBe(1);
    expect(val(view.lifetime, 'gilds')).toBe(3);
    expect(val(view.lifetime, 'chestsOpened')).toBe(6);
    expect(val(view.lifetime, 'keysEarned')).toBe(15);
    // Run bucket.
    expect(val(view.run, 'zone')).toBe(40);
    expect(val(view.run, 'gold')).toBe(5000);
    expect(val(view.run, 'souls')).toBe(20);
    expect(val(view.run, 'combo')).toBe(60);
  });

  it('onBeatQuote is 0 without clicks and clamped to [0,1]', () => {
    expect(onBeatQuote(createChState())).toBe(0);
  });
});

describe('AC5 — lifetime vs run correct across ascension AND Himmelfahrt', () => {
  it('an ascension resets the run but keeps every lifetime counter', () => {
    const s = richState();
    const asc = ascendState(s);
    const view = statsView(asc);
    // Run reset.
    expect(val(view.run, 'zone')).toBe(1);
    expect(val(view.run, 'gold')).toBe(0);
    expect(val(view.run, 'runMaxZone')).toBe(1);
    // Lifetime counters intact (stats slice carried forward untouched).
    expect(val(view.lifetime, 'crits')).toBe(500);
    expect(val(view.lifetime, 'bossKills')).toBe(8);
    expect(val(view.lifetime, 'ascensions')).toBe(4);
    expect(val(view.lifetime, 'chestsOpened')).toBe(6);
    expect(val(view.lifetime, 'maxCombo')).toBe(80);
    expect(val(view.lifetime, 'keysEarned')).toBe(15);
    expect(val(view.lifetime, 'goldLifetime')).toBe(999_999);
    // Best zone is a lifetime highwater — never falls on ascension.
    expect(val(view.lifetime, 'bestZone')).toBe(40);
  });

  it('a Himmelfahrt resets the tour but lifetime counters + best-zone survive', () => {
    const s = richState();
    const hf = himmelfahrtState(s);
    const view = statsView(hf);
    // Tour reset (RS falls — it is an L2-reset currency).
    expect(val(view.run, 'zone')).toBe(1);
    expect(val(view.run, 'gold')).toBe(0);
    expect(val(view.run, 'souls')).toBe(0);
    // Himmelfahrt count incremented; lifetime stats survive the deeper reset.
    expect(val(view.lifetime, 'himmelfahrten')).toBe(2);
    expect(val(view.lifetime, 'crits')).toBe(500);
    expect(val(view.lifetime, 'bossKills')).toBe(8);
    expect(val(view.lifetime, 'ascensions')).toBe(4);
    expect(val(view.lifetime, 'chestsOpened')).toBe(6);
    expect(val(view.lifetime, 'maxCombo')).toBe(80);
    expect(val(view.lifetime, 'keysEarned')).toBe(15);
    // lifetimeMaxZone falls to 1 for RS accounting, but the best-zone stat is
    // floored by the surviving gear.zoneEver latch — it never regresses.
    expect(hf.lifetimeMaxZone).toBe(1);
    expect(bestZoneEver(hf)).toBe(40);
    expect(val(view.lifetime, 'bestZone')).toBe(40);
  });
});
