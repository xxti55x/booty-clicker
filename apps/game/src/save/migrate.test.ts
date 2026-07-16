import { describe, expect, it } from 'vitest';

import { createGameState } from '../game/state';
import { createUpgrades, deriveStats } from '../game/economy';
import { applySave, loadGame, SAVE_KEY, saveGame, serialize, type SaveStorage } from './store';
import { migrate, type SaveDataV1 } from './migrate';
import { isSaveDataV2, SCHEMA_VERSION } from './schema';

function memStorage(): SaveStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const v1: SaveDataV1 = {
  schemaVersion: 1,
  bp: 500,
  // Deliberately bogus derived stats — must be dropped, never trusted.
  perClick: 999,
  perSec: 999,
  mult: 999,
  // Positional, index-aligned with UPGRADES: hips, auto, bass, squad, disco, arena, god.
  upgrades: [3, 2, 1, 0, 1, 0, 1],
  skin: 'classic',
  bg: 'club',
  unlocked: { classic: true, disco: true },
};

describe('migrate — v1 to v2', () => {
  it('maps positional upgrade levels to id-keyed levels and drops derived stats', () => {
    const v2 = migrate(v1);
    expect(v2).not.toBeNull();
    if (!v2) throw new Error('unreachable');

    expect(v2.schemaVersion).toBe(2);
    expect(v2.upgrades.hips).toBe(3);
    expect(v2.upgrades.auto).toBe(2);
    expect(v2.upgrades.bass).toBe(1);
    expect(v2.upgrades.disco).toBe(1);
    expect(v2.upgrades.god).toBe(1);

    expect('perClick' in v2).toBe(false);
    expect('perSec' in v2).toBe(false);
    expect('mult' in v2).toBe(false);

    expect(typeof v2.lastSeen).toBe('number');
    expect(v2.lastSeen).toBeGreaterThan(Date.now() - 5000);
    expect(v2.lastSeen).toBeLessThanOrEqual(Date.now());
  });

  it('full path: a stored v1 save loads, migrates, and derives real stats (not the bogus 999s)', () => {
    const store = memStorage();
    store.setItem(SAVE_KEY, JSON.stringify(v1));

    const loaded = loadGame(store);
    expect(loaded).not.toBeNull();
    if (!loaded) throw new Error('unreachable');

    const state = createGameState();
    const upgrades = createUpgrades();
    applySave(loaded, state, upgrades);

    const expected = deriveStats(upgrades);
    expect(state.perClick).toBe(expected.perClick);
    expect(state.perSec).toBe(expected.perSec);
    expect(state.mult).toBe(expected.mult);
    expect(state.perClick).not.toBe(999);
    expect(state.perSec).not.toBe(999);
    expect(state.mult).not.toBe(999);
    expect(state.bp).toBe(500);
  });

  it('a save-load-apply round trip via saveGame also drops bogus v1 derived stats', () => {
    const store = memStorage();
    store.setItem(SAVE_KEY, JSON.stringify(v1));
    const loaded = loadGame(store);
    if (!loaded) throw new Error('unreachable');
    const state = createGameState();
    const upgrades = createUpgrades();
    applySave(loaded, state, upgrades);
    saveGame(state, upgrades, store);

    const reloaded = loadGame(store);
    expect(reloaded).not.toBeNull();
    if (!reloaded) throw new Error('unreachable');
    expect(reloaded.schemaVersion).toBe(2);
    expect(reloaded.upgrades.hips).toBe(3);
  });
});

describe('migrate — version handling', () => {
  it('rejects a future schema version', () => {
    expect(migrate({ schemaVersion: 3, bp: 1 })).toBeNull();
    expect(migrate({ schemaVersion: SCHEMA_VERSION + 5, bp: 1 })).toBeNull();
  });

  it('rejects version 0', () => {
    expect(migrate({ schemaVersion: 0, bp: 1 })).toBeNull();
  });

  it('rejects a missing schemaVersion', () => {
    expect(migrate({ bp: 1 })).toBeNull();
  });

  it('rejects a non-integer schemaVersion', () => {
    expect(migrate({ schemaVersion: 1.5, bp: 1 })).toBeNull();
  });

  it('rejects non-object input (null, array, primitive) without throwing', () => {
    expect(() => migrate(null)).not.toThrow();
    expect(migrate(null)).toBeNull();
    expect(migrate([])).toBeNull();
    expect(migrate('nope')).toBeNull();
    expect(migrate(42)).toBeNull();
  });
});

describe('migrate — corrupt v1 payloads never throw', () => {
  it('a non-array upgrades field is tolerated (no throw) and invalid siblings still yield null', () => {
    const raw = {
      schemaVersion: 1,
      bp: 'not-a-number',
      perClick: 1,
      perSec: 0,
      mult: 1,
      upgrades: 'nope',
      skin: 'classic',
      bg: 'club',
      unlocked: {},
    };
    expect(() => migrate(raw)).not.toThrow();
    expect(migrate(raw)).toBeNull();
  });

  it('non-numeric entries inside the upgrades array are skipped, not fatal', () => {
    const raw = {
      ...v1,
      upgrades: [3, 'oops', 1, 0, 1, 0, 1],
    };
    const v2 = migrate(raw);
    expect(v2).not.toBeNull();
    if (!v2) throw new Error('unreachable');
    expect(v2.upgrades.hips).toBe(3);
    expect(v2.upgrades.auto).toBeUndefined();
    expect(v2.upgrades.bass).toBe(1);
  });
});

describe('migrate — a current v2 save passes through unchanged', () => {
  it('round trips a v2 save as-is', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const v2 = serialize(state, upgrades);
    expect(migrate(v2)).toEqual(v2);
  });
});

describe('isSaveDataV2', () => {
  it('accepts a real serialize() output', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const save = serialize(state, upgrades);
    expect(isSaveDataV2(save)).toBe(true);
  });

  it('rejects a wrong schemaVersion', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const save = serialize(state, upgrades);
    expect(isSaveDataV2({ ...save, schemaVersion: 1 })).toBe(false);
  });

  it('rejects a negative/non-finite bp', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const save = serialize(state, upgrades);
    expect(isSaveDataV2({ ...save, bp: -1 })).toBe(false);
    expect(isSaveDataV2({ ...save, bp: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('rejects an unknown skin key', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const save = serialize(state, upgrades);
    expect(isSaveDataV2({ ...save, skin: 'hackerman' })).toBe(false);
  });

  it('rejects a non-integer upgrade level', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const save = serialize(state, upgrades);
    expect(isSaveDataV2({ ...save, upgrades: { hips: 2.5 } })).toBe(false);
  });
});
