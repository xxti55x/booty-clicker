import { describe, expect, it } from 'vitest';

import { createGameState } from '../game/state';
import { createUpgrades, deriveStats } from '../game/economy';
import { applySave, loadGame, SAVE_KEY, saveGame, serialize, type SaveStorage } from './store';
import { migrate, type SaveDataV1, type SaveDataV2, type SaveDataV3 } from './migrate';
import { isSaveDataV4, SCHEMA_VERSION } from './schema';

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

describe('migrate — v1 through to the current schema (v4)', () => {
  it('maps positional levels to id-keyed, drops derived stats, adds progression defaults', () => {
    const v3 = migrate(v1);
    expect(v3).not.toBeNull();
    if (!v3) throw new Error('unreachable');

    expect(v3.schemaVersion).toBe(SCHEMA_VERSION);
    expect(v3.upgrades.hips).toBe(3);
    expect(v3.upgrades.auto).toBe(2);
    expect(v3.upgrades.bass).toBe(1);
    expect(v3.upgrades.disco).toBe(1);
    expect(v3.upgrades.god).toBe(1);

    expect('perClick' in v3).toBe(false);
    expect('perSec' in v3).toBe(false);
    expect('mult' in v3).toBe(false);

    // v3 progression defaults.
    expect(v3.prestigeMult).toBe(1);
    expect(v3.rebirths).toBe(0);
    expect(v3.bossDefeated).toBe(false);
    expect(v3.maxBp).toBe(500); // seeded from bp
    // v4 defaults.
    expect(v3.achievements).toEqual([]);
    expect(v3.totalClicks).toBe(0);
    expect(v3.peachesClicked).toBe(0);
    expect(v3.boostUntil).toBe(0);

    expect(typeof v3.lastSeen).toBe('number');
    expect(v3.lastSeen).toBeGreaterThan(Date.now() - 5000);
    expect(v3.lastSeen).toBeLessThanOrEqual(Date.now());
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

    const expected = deriveStats(upgrades, { perClick: 1, perSec: 0, mult: 1 });
    expect(state.perClick).toBe(expected.perClick);
    expect(state.perSec).toBe(expected.perSec);
    expect(state.mult).toBe(expected.mult);
    expect(state.perClick).not.toBe(999);
    expect(state.mult).not.toBe(999);
    expect(state.bp).toBe(500);
    expect(state.prestigeMult).toBe(1);
  });

  it('a save-load-apply round trip via saveGame lands on the current schema', () => {
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
    expect(reloaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(reloaded.upgrades.hips).toBe(3);
  });
});

describe('migrate — v2 forward to the current schema', () => {
  const v2: SaveDataV2 = {
    schemaVersion: 2,
    bp: 2500,
    upgrades: { hips: 4, disco: 1 },
    skin: 'disco',
    bg: 'synth',
    unlocked: { classic: true, disco: true },
    lastSeen: 1_700_000_000_000,
  };

  it('adds progression + achievement defaults and seeds maxBp from bp', () => {
    const v4 = migrate(v2);
    expect(v4).not.toBeNull();
    if (!v4) throw new Error('unreachable');
    expect(v4.schemaVersion).toBe(4);
    expect(v4.bp).toBe(2500);
    expect(v4.upgrades).toEqual({ hips: 4, disco: 1 });
    expect(v4.skin).toBe('disco');
    expect(v4.bg).toBe('synth');
    expect(v4.lastSeen).toBe(1_700_000_000_000);
    expect(v4.maxBp).toBe(2500);
    expect(v4.prestigeMult).toBe(1);
    expect(v4.rebirths).toBe(0);
    expect(v4.bossDefeated).toBe(false);
    expect(v4.achievements).toEqual([]);
    expect(v4.totalClicks).toBe(0);
  });
});

describe('migrate — v3 to v4', () => {
  const v3: SaveDataV3 = {
    schemaVersion: 3,
    bp: 9000,
    upgrades: { hips: 10 },
    skin: 'robo',
    bg: 'space',
    unlocked: { classic: true, disco: true, robo: true },
    lastSeen: 1_700_000_000_000,
    maxBp: 12000,
    prestigeMult: 2,
    rebirths: 1,
    bossDefeated: true,
  };

  it('adds achievement/stat/event defaults, keeping progression intact', () => {
    const v4 = migrate(v3);
    expect(v4).not.toBeNull();
    if (!v4) throw new Error('unreachable');
    expect(v4.schemaVersion).toBe(4);
    expect(v4.maxBp).toBe(12000);
    expect(v4.prestigeMult).toBe(2);
    expect(v4.rebirths).toBe(1);
    expect(v4.bossDefeated).toBe(true);
    expect(v4.achievements).toEqual([]);
    expect(v4.totalClicks).toBe(0);
    expect(v4.maxCombo).toBe(0);
    expect(v4.peachesClicked).toBe(0);
    expect(v4.nextPeachAt).toBe(0);
    expect(v4.boostUntil).toBe(0);
  });
});

describe('migrate — version handling', () => {
  it('rejects a future schema version', () => {
    expect(migrate({ schemaVersion: SCHEMA_VERSION + 1, bp: 1 })).toBeNull();
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
    const v3 = migrate(raw);
    expect(v3).not.toBeNull();
    if (!v3) throw new Error('unreachable');
    expect(v3.upgrades.hips).toBe(3);
    expect(v3.upgrades.auto).toBeUndefined();
    expect(v3.upgrades.bass).toBe(1);
  });
});

describe('migrate — a current save passes through unchanged', () => {
  it('round trips a current-schema save as-is', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const save = serialize(state, upgrades);
    expect(migrate(save)).toEqual(save);
  });
});

describe('isSaveDataV4', () => {
  it('accepts a real serialize() output', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const save = serialize(state, upgrades);
    expect(isSaveDataV4(save)).toBe(true);
  });

  it('rejects a wrong schemaVersion', () => {
    const save = serialize(createGameState(), createUpgrades());
    expect(isSaveDataV4({ ...save, schemaVersion: 2 })).toBe(false);
  });

  it('rejects a negative/non-finite bp', () => {
    const save = serialize(createGameState(), createUpgrades());
    expect(isSaveDataV4({ ...save, bp: -1 })).toBe(false);
    expect(isSaveDataV4({ ...save, bp: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('rejects an unknown skin key', () => {
    const save = serialize(createGameState(), createUpgrades());
    expect(isSaveDataV4({ ...save, skin: 'hackerman' })).toBe(false);
  });

  it('rejects a non-integer upgrade level', () => {
    const save = serialize(createGameState(), createUpgrades());
    expect(isSaveDataV4({ ...save, upgrades: { hips: 2.5 } })).toBe(false);
  });

  it('rejects prototype-chain keys for skin/bg (own-property check, not `in`)', () => {
    const save = serialize(createGameState(), createUpgrades());
    expect(isSaveDataV4({ ...save, bg: 'toString' })).toBe(false);
    expect(isSaveDataV4({ ...save, skin: 'constructor' })).toBe(false);
  });

  it('rejects bad progression fields', () => {
    const save = serialize(createGameState(), createUpgrades());
    expect(isSaveDataV4({ ...save, prestigeMult: 0 })).toBe(false);
    expect(isSaveDataV4({ ...save, rebirths: -1 })).toBe(false);
    expect(isSaveDataV4({ ...save, bossDefeated: 1 })).toBe(false);
    expect(isSaveDataV4({ ...save, maxBp: -5 })).toBe(false);
  });

  it('rejects bad achievement/stat/event fields', () => {
    const save = serialize(createGameState(), createUpgrades());
    expect(isSaveDataV4({ ...save, achievements: 'nope' })).toBe(false);
    expect(isSaveDataV4({ ...save, achievements: [1] })).toBe(false);
    expect(isSaveDataV4({ ...save, totalClicks: -1 })).toBe(false);
    expect(isSaveDataV4({ ...save, maxCombo: 1.5 })).toBe(false);
    expect(isSaveDataV4({ ...save, boostUntil: -1 })).toBe(false);
  });
});
