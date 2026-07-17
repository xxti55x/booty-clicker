import { describe, expect, it } from 'vitest';

import {
  defaultSettings,
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

  it('round-trips a saved settings object', () => {
    const store = memStorage();
    const s = { screenShake: false, particles: false };
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
    store.setItem(SETTINGS_KEY, JSON.stringify({ screenShake: false, particles: 'nope' }));
    const s = loadSettings(store);
    expect(s.screenShake).toBe(false);
    expect(s.particles).toBe(true); // invalid -> default
  });
});
