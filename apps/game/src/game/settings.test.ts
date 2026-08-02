import { describe, expect, it } from 'vitest';

import {
  defaultSettings,
  type GameSettings,
  loadSettings,
  saveSettings,
  SETTINGS_KEY,
  type SettingsStorage,
} from './settings';

function memStorage(): SettingsStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('game settings', () => {
  it('returns defaults when nothing is stored / null storage', () => {
    expect(loadSettings(memStorage())).toEqual(defaultSettings());
    expect(() => loadSettings(null)).not.toThrow();
    expect(loadSettings(null)).toEqual(defaultSettings());
  });

  it('default settings shape — V2-2: Auto-Qualität ist der Default', () => {
    expect(defaultSettings()).toEqual({
      screenShake: true,
      particles: true,
      haptics: true,
      quality: 'auto',
      qualityChosen: false,
      fpsCap: 0,
      onboarded: false,
    });
  });

  it('round-trips a saved settings object', () => {
    const store = memStorage();
    const s: GameSettings = {
      screenShake: false,
      particles: false,
      haptics: false,
      quality: 'low',
      qualityChosen: true,
      fpsCap: 30,
      onboarded: true,
    };
    saveSettings(s, store);
    expect(loadSettings(store)).toEqual(s);
  });

  it('falls back to defaults on corrupt JSON, never throwing', () => {
    const store = memStorage();
    store.setItem(SETTINGS_KEY, '{oops');
    expect(() => loadSettings(store)).not.toThrow();
    expect(loadSettings(store)).toEqual(defaultSettings());
  });

  it('merges partial/invalid fields over defaults', () => {
    const store = memStorage();
    store.setItem(
      SETTINGS_KEY,
      JSON.stringify({ screenShake: false, particles: 'nope', quality: 'ultra', fpsCap: 144 }),
    );
    const s = loadSettings(store);
    expect(s.screenShake).toBe(false);
    expect(s.particles).toBe(true); // invalid -> default
    expect(s.quality).toBe('auto'); // invalid enum + nie gewählt -> auto
    expect(s.fpsCap).toBe(0); // not in FPS_CAPS -> default
    expect(s.onboarded).toBe(false); // missing -> default
  });

  it('accepts each valid quality and fps cap (als eigene Wahl markiert)', () => {
    const store = memStorage();
    for (const quality of ['auto', 'low', 'medium', 'high'] as const) {
      for (const fpsCap of [0, 30, 60]) {
        saveSettings(
          { ...defaultSettings(), quality, qualityChosen: true, fpsCap, onboarded: true },
          store,
        );
        const s = loadSettings(store);
        expect(s.quality).toBe(quality);
        expect(s.fpsCap).toBe(fpsCap);
        expect(s.onboarded).toBe(true);
      }
    }
  });

  // V2-2: Alt-Saves speicherten den alten DEFAULT 'high' — das war nie eine
  // Entscheidung. Ohne `qualityChosen` erzwingt der Loader die Automatik;
  // eine dokumentierte eigene Wahl bleibt für immer stehen.
  it('migrates the old high default into auto, keeps a real choice', () => {
    const store = memStorage();
    store.setItem(SETTINGS_KEY, JSON.stringify({ quality: 'high', onboarded: true }));
    expect(loadSettings(store).quality).toBe('auto');
    store.setItem(
      SETTINGS_KEY,
      JSON.stringify({ quality: 'low', qualityChosen: true, onboarded: true }),
    );
    expect(loadSettings(store).quality).toBe('low');
    store.setItem(
      SETTINGS_KEY,
      JSON.stringify({ quality: 'high', qualityChosen: true, onboarded: true }),
    );
    expect(loadSettings(store).quality).toBe('high');
  });
});
