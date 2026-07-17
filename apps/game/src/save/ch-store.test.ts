import { describe, expect, it } from 'vitest';

import { type ChState, createChState, createStats } from '../game/ch-state';
import { monsterHp } from '../game/combat';
import {
  CH_SAVE_KEY,
  type ChStorage,
  deserializeCh,
  exportCh,
  importCh,
  isChSave,
  loadCh,
  offlineGold,
  OFFLINE_CAP_S,
  OFFLINE_EFF,
  resetCh,
  saveCh,
  serializeCh,
  visibilityGrant,
} from './ch-store';

function memStorage(): ChStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('ch-store — round-trip', () => {
  it('saves and loads a state, repairing invariants', () => {
    const store = memStorage();
    const s = {
      ...createChState(),
      zone: 12,
      runMaxZone: 12,
      crew: { boss: 5 },
      gold: 500,
      souls: 3,
    };
    saveCh(s, 1_000_000, store);
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    expect(loaded!.state.zone).toBe(12);
    expect(loaded!.state.gold).toBe(500);
    expect(loaded!.state.crew).toEqual({ boss: 5 });
    expect(loaded!.lastSeen).toBe(1_000_000);
  });

  it('returns null for missing / corrupt / wrong-version data', () => {
    const store = memStorage();
    expect(loadCh(store)).toBeNull();
    store.setItem(CH_SAVE_KEY, '{not json');
    expect(loadCh(store)).toBeNull();
    store.setItem(CH_SAVE_KEY, JSON.stringify({ v: 99, gold: 0 }));
    expect(loadCh(store)).toBeNull();
    expect(() => loadCh(store)).not.toThrow();
  });

  it('rejects bad fields without throwing', () => {
    const good = JSON.parse(serializeCh(createChState(), 1)) as Record<string, unknown>;
    expect(isChSave(good)).toBe(true);
    expect(isChSave({ ...good, zone: 0 })).toBe(false);
    expect(isChSave({ ...good, gold: -1 })).toBe(false);
    expect(isChSave({ ...good, crew: { boss: -2 } })).toBe(false);
    expect(isChSave({ ...good, crew: { boss: 1.5 } })).toBe(false);
    expect(isChSave({ ...good, lastSeen: 0 })).toBe(false);
  });

  it('export → import round-trips through a base64 code', () => {
    const s = { ...createChState(), zone: 7, runMaxZone: 7, crew: { boss: 3, dj: 1 }, souls: 2 };
    const code = exportCh(s, 12345);
    const back = importCh(code);
    expect(back).not.toBeNull();
    expect(back!.zone).toBe(7);
    expect(back!.crew).toEqual({ boss: 3, dj: 1 });
    expect(importCh('not-valid-base64!!')).toBeNull();
    expect(importCh(exportCh(createChState(), 1))).not.toBeNull();
  });

  it('reset removes the save', () => {
    const store = memStorage();
    saveCh(createChState(), 1, store);
    expect(store.map.has(CH_SAVE_KEY)).toBe(true);
    resetCh(store);
    expect(store.map.has(CH_SAVE_KEY)).toBe(false);
  });

  it('null storage is a no-op (never throws)', () => {
    expect(() => saveCh(createChState(), 1, null)).not.toThrow();
    expect(loadCh(null)).toBeNull();
    expect(() => resetCh(null)).not.toThrow();
  });
});

describe('ch-store — v2 migration & repair', () => {
  it('migrates a v1 blob losslessly into v2 with M7 defaults', () => {
    const store = memStorage();
    const v1 = {
      v: 1,
      lastSeen: 5000,
      gold: 500,
      zone: 12,
      killsThisZone: 3,
      runMaxZone: 12,
      crew: { boss: 5, dj: 2 },
      souls: 3,
      lifetimeMaxZone: 12,
      totalClicks: 42,
    };
    store.setItem(CH_SAVE_KEY, JSON.stringify(v1));
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    const s = loaded!.state;
    // v1 fields carried through losslessly
    expect(s.gold).toBe(500);
    expect(s.zone).toBe(12);
    expect(s.crew).toEqual({ boss: 5, dj: 2 });
    expect(s.souls).toBe(3);
    expect(s.totalClicks).toBe(42);
    expect(loaded!.lastSeen).toBe(5000);
    // v2 defaults added
    expect(s.rng.cursor).toBe(0);
    expect(Number.isInteger(s.rng.seed)).toBe(true);
    expect(s.stats).toEqual(createStats());
    expect(s.legacyImported).toBe(false);
  });

  it('repairs a corrupt rng field to a fresh seed without throwing', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.rng = 'garbage';
    const json = JSON.stringify(raw);
    let s: ChState | null = null;
    expect(() => {
      s = deserializeCh(json);
    }).not.toThrow();
    expect(s).not.toBeNull();
    expect(s!.rng.cursor).toBe(0);
    expect(Number.isInteger(s!.rng.seed)).toBe(true);
  });

  it('repairs negative / absent stats to 0', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.stats = { crits: -5 }; // negative + missing keys
    const s = deserializeCh(JSON.stringify(raw));
    expect(s).not.toBeNull();
    expect(s!.stats.crits).toBe(0);
    expect(s!.stats.bossKills).toBe(0);
    expect(s!.stats.goldLifetime).toBe(0);
  });

  it('preserves rng cursor + stats + legacy flag through a v2 round-trip', () => {
    const store = memStorage();
    const s = {
      ...createChState(),
      rng: { seed: 777, cursor: 123 },
      stats: { ...createStats(), crits: 9, goldLifetime: 12345 },
      legacyImported: true,
    };
    saveCh(s, 2000, store);
    const loaded = loadCh(store);
    expect(loaded!.state.rng).toEqual({ seed: 777, cursor: 123 });
    expect(loaded!.state.stats.crits).toBe(9);
    expect(loaded!.state.stats.goldLifetime).toBe(12345);
    expect(loaded!.state.legacyImported).toBe(true);
  });

  it('rejects unknown / future versions to a clean fresh start', () => {
    const store = memStorage();
    store.setItem(CH_SAVE_KEY, JSON.stringify({ v: 3, gold: 0 }));
    expect(loadCh(store)).toBeNull();
    store.setItem(CH_SAVE_KEY, JSON.stringify({ v: 0, gold: 0 }));
    expect(loadCh(store)).toBeNull();
    expect(() => loadCh(store)).not.toThrow();
  });
});

describe('ch-store — visibility return grant (B5)', () => {
  it('a 10-minute hidden tab grants offlineGold over that interval (injected clock)', () => {
    const dps = monsterHp(5) * 2;
    const zone = 5;
    const hiddenAt = 1_000_000;
    const now = hiddenAt + 10 * 60_000; // injected: tab returns 10 min later
    const elapsed = now - hiddenAt;
    expect(visibilityGrant(dps, zone, elapsed)).toBe(offlineGold(dps, zone, 600_000));
    expect(visibilityGrant(dps, zone, elapsed)).toBeGreaterThan(0);
  });
});

describe('ch-store — offline gold', () => {
  it('is zero without DPS', () => {
    expect(offlineGold(0, 5, 3600_000)).toBe(0);
  });

  it('scales with dps, time and efficiency, and caps the elapsed time', () => {
    const dps = monsterHp(5) * 2; // 2 kills/sec
    const oneHour = offlineGold(dps, 5, 3600_000);
    expect(oneHour).toBeGreaterThan(0);
    // Cap: 100h elapsed counts as OFFLINE_CAP_S only.
    const capped = offlineGold(dps, 5, 100 * 3600_000);
    const atCap = offlineGold(dps, 5, OFFLINE_CAP_S * 1000);
    expect(capped).toBe(atCap);
    // Efficiency halves throughput vs. a naive full-rate estimate.
    expect(oneHour).toBeLessThan(2 * 3600 * OFFLINE_EFF * 10); // sanity upper bound-ish
  });
});
