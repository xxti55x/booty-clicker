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

  it('default settings shape', () => {
    expect(defaultSettings()).toEqual({
      screenShake: true,
      particles: true,
      quality: 'high',
      fpsCap: 0,
      onboarded: false,
    });
  });

  it('round-trips a saved settings object', () => {
    const store = memStorage();
    const s: GameSettings = {
      screenShake: false,
      particles: false,
      quality: 'low',
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
    expect(s.quality).toBe('high'); // invalid enum -> default
    expect(s.fpsCap).toBe(0); // not in FPS_CAPS -> default
    expect(s.onboarded).toBe(false); // missing -> default
  });

  it('accepts each valid quality and fps cap', () => {
    const store = memStorage();
    for (const quality of ['low', 'medium', 'high'] as const) {
      for (const fpsCap of [0, 30, 60]) {
        saveSettings({ ...defaultSettings(), quality, fpsCap, onboarded: true }, store);
        const s = loadSettings(store);
        expect(s.quality).toBe(quality);
        expect(s.fpsCap).toBe(fpsCap);
        expect(s.onboarded).toBe(true);
      }
    }
  });
});
