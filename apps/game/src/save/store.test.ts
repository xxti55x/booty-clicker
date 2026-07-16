import { describe, expect, it } from 'vitest';

import { createUpgrades, deriveStats, type UpgradeState } from '../game/economy';
import { createGameState } from '../game/state';
import type { SaveDataV2 } from './schema';
import {
  applySave,
  computeOfflineEarnings,
  decodeBase64,
  encodeBase64,
  exportSave,
  importSave,
  loadGame,
  OFFLINE_CAP_MS,
  resetSave,
  SAVE_KEY,
  saveGame,
  serialize,
  type SaveStorage,
} from './store';

/** In-memory fake — Vitest runs node env (no jsdom, no real localStorage). */
function memStorage(): SaveStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

function byId(upgrades: UpgradeState[], id: string): UpgradeState {
  const u = upgrades.find((x) => x.id === id);
  if (!u) throw new Error(`missing upgrade ${id}`);
  return u;
}

describe('serialize / saveGame / loadGame / applySave — round-trip', () => {
  it('round-trips bp, upgrade levels, skin, bg, unlocked, and re-derives stats', () => {
    const store = memStorage();

    const state = createGameState();
    const upgrades = createUpgrades();
    state.bp = 1234.5;
    byId(upgrades, 'hips').lv = 3;
    byId(upgrades, 'disco').lv = 1;
    byId(upgrades, 'god').lv = 2;
    const derived = deriveStats(upgrades);
    state.perClick = derived.perClick;
    state.perSec = derived.perSec;
    state.mult = derived.mult;
    state.skin = 'robo';
    state.bg = 'space';
    state.unlocked.robo = true;

    saveGame(state, upgrades, store);
    const loaded = loadGame(store);
    expect(loaded).not.toBeNull();
    if (!loaded) throw new Error('unreachable');

    const freshState = createGameState();
    const freshUpgrades = createUpgrades();
    applySave(loaded, freshState, freshUpgrades);

    expect(freshState.bp).toBe(1234.5);
    for (const u of freshUpgrades) {
      expect(u.lv).toBe(byId(upgrades, u.id).lv);
    }
    expect(freshState.skin).toBe('robo');
    expect(freshState.bg).toBe('space');
    expect(freshState.unlocked).toEqual(state.unlocked);

    const expectedDerived = deriveStats(freshUpgrades);
    expect(freshState.perClick).toBe(expectedDerived.perClick);
    expect(freshState.perSec).toBe(expectedDerived.perSec);
    expect(freshState.mult).toBe(expectedDerived.mult);
  });

  it('serialize() copies unlocked rather than aliasing it', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const save = serialize(state, upgrades);
    save.unlocked.robo = true;
    expect(state.unlocked.robo).toBe(false);
  });
});

describe('loadGame — corrupt data never throws, always falls back to fresh start', () => {
  const validElse = {
    schemaVersion: 2,
    upgrades: {},
    skin: 'classic',
    bg: 'club',
    unlocked: {},
    lastSeen: Date.now(),
  };

  const badRaws: string[] = [
    'not json',
    '{"half":',
    '"just a string"',
    '[]',
    '{}',
    '{"schemaVersion":99,"bp":1}',
    '{"schemaVersion":2,"bp":"lots"}',
    JSON.stringify({ ...validElse, bp: -5 }),
    JSON.stringify({ ...validElse, bp: 1, skin: 'hackerman' }),
    JSON.stringify({ ...validElse, bp: 1, upgrades: { hips: 2.5 } }),
    JSON.stringify({ ...validElse, bp: null }),
  ];

  it.each(badRaws)('raw payload %#: results in null, never throws', (raw) => {
    const store = memStorage();
    store.setItem(SAVE_KEY, raw);
    expect(() => loadGame(store)).not.toThrow();
    expect(loadGame(store)).toBeNull();
  });

  it('an empty store yields null', () => {
    const store = memStorage();
    expect(loadGame(store)).toBeNull();
  });

  it('a null-storage default (no localStorage) yields null, no throw', () => {
    expect(() => loadGame(null)).not.toThrow();
    expect(loadGame(null)).toBeNull();
  });
});

describe('computeOfflineEarnings — capped, half-rate passive income', () => {
  it('matches perSec * mult * rate over the elapsed seconds', () => {
    expect(computeOfflineEarnings(60_000, 10, 2)).toBeCloseTo(600, 10);
  });

  it('clamps elapsed time to the 2h cap', () => {
    const uncapped = computeOfflineEarnings(3 * 3_600_000, 1, 1);
    const capped = computeOfflineEarnings(OFFLINE_CAP_MS, 1, 1);
    expect(uncapped).toBe(capped);
    expect(uncapped).toBeCloseTo(3600, 10);
  });

  it('is continuous at the cap boundary', () => {
    const justUnder = computeOfflineEarnings(OFFLINE_CAP_MS - 1, 1, 1);
    const atCap = computeOfflineEarnings(OFFLINE_CAP_MS, 1, 1);
    const over = computeOfflineEarnings(OFFLINE_CAP_MS + 1000, 1, 1);
    expect(atCap - justUnder).toBeLessThan(0.001);
    expect(over).toBe(atCap);
  });

  it('is 0 for negative elapsed time', () => {
    expect(computeOfflineEarnings(-1000, 10, 2)).toBe(0);
  });

  it('is 0 when perSec is 0', () => {
    expect(computeOfflineEarnings(60_000, 0, 5)).toBe(0);
  });
});

describe('export / import', () => {
  it('importSave(exportSave(...)) round-trips the serialized save (modulo lastSeen)', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    state.bp = 42;
    byId(upgrades, 'auto').lv = 5;

    const code = exportSave(state, upgrades);
    const imported = importSave(code);
    expect(imported).not.toBeNull();
    if (!imported) throw new Error('unreachable');

    const expected = serialize(state, upgrades, imported.lastSeen);
    expect(imported).toEqual(expected);
  });

  it('rejects non-base64 input without throwing', () => {
    expect(() => importSave('%%%not-base64%%%')).not.toThrow();
    expect(importSave('%%%not-base64%%%')).toBeNull();
  });

  it('rejects base64 that decodes to non-JSON garbage without throwing', () => {
    const code = encodeBase64('garbage');
    expect(() => importSave(code)).not.toThrow();
    expect(importSave(code)).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const code = exportSave(state, upgrades);
    expect(importSave(`  \n${code}\t  `)).not.toBeNull();
  });

  it('encodeBase64/decodeBase64 round-trip UTF-8 text (emoji, umlauts)', () => {
    const text = '🍑 Booty-Gottheit äöü';
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });
});

describe('applySave — hardening against tampered/partial saves', () => {
  function baseSave(overrides: Partial<SaveDataV2> = {}): SaveDataV2 {
    return {
      schemaVersion: 2,
      bp: 10,
      upgrades: {},
      skin: 'classic',
      bg: 'club',
      unlocked: {} as SaveDataV2['unlocked'],
      lastSeen: Date.now(),
      ...overrides,
    };
  }

  it('ignores unknown upgrade ids', () => {
    const save = baseSave({ upgrades: { warp: 99 } as unknown as Record<string, number> });
    const state = createGameState();
    const upgrades = createUpgrades();
    applySave(save, state, upgrades);
    for (const u of upgrades) expect(u.lv).toBe(0);
  });

  it('preserves default unlocks when the save omits keys', () => {
    const save = baseSave({ skin: 'classic' });
    const state = createGameState();
    const upgrades = createUpgrades();
    applySave(save, state, upgrades);
    expect(state.unlocked.classic).toBe(true);
    expect(state.unlocked.disco).toBe(true);
    expect(state.unlocked.robo).toBe(false);
    expect(state.unlocked.host).toBe(false);
    expect(state.unlocked.boss).toBe(false);
  });

  it('force-unlocks the active skin even if the save forgot to mark it unlocked', () => {
    const save = baseSave({ skin: 'boss' });
    const state = createGameState();
    const upgrades = createUpgrades();
    applySave(save, state, upgrades);
    expect(state.unlocked.boss).toBe(true);
  });
});

describe('resetSave', () => {
  it('removes the stored save and never throws', () => {
    const store = memStorage();
    const state = createGameState();
    const upgrades = createUpgrades();
    saveGame(state, upgrades, store);
    expect(loadGame(store)).not.toBeNull();
    expect(() => resetSave(store)).not.toThrow();
    expect(loadGame(store)).toBeNull();
  });

  it('no-ops on null storage without throwing', () => {
    expect(() => resetSave(null)).not.toThrow();
  });
});
