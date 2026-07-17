import { describe, expect, it } from 'vitest';

import { createChState } from '../game/ch-state';
import { monsterHp } from '../game/combat';
import {
  CH_SAVE_KEY,
  type ChStorage,
  isChSave,
  loadCh,
  offlineGold,
  OFFLINE_CAP_S,
  OFFLINE_EFF,
  resetCh,
  saveCh,
  serializeCh,
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
