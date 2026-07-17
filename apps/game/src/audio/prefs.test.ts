import { describe, expect, it } from 'vitest';

import {
  defaultAudioPrefs,
  loadAudioPrefs,
  saveAudioPrefs,
  AUDIO_KEY,
  type PrefsStorage,
} from './prefs';

function memStorage(): PrefsStorage & { removeItem(k: string): void } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('audio prefs', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadAudioPrefs(memStorage())).toEqual(defaultAudioPrefs());
  });

  it('returns defaults on null storage without throwing', () => {
    expect(() => loadAudioPrefs(null)).not.toThrow();
    expect(loadAudioPrefs(null)).toEqual(defaultAudioPrefs());
  });

  it('round-trips a saved pref set', () => {
    const store = memStorage();
    const prefs = { muted: true, master: 0.5, music: 0.3, sfx: 0.7 };
    saveAudioPrefs(prefs, store);
    expect(loadAudioPrefs(store)).toEqual(prefs);
  });

  it('falls back to defaults on corrupt JSON, never throwing', () => {
    const store = memStorage();
    store.setItem(AUDIO_KEY, '{not json');
    expect(() => loadAudioPrefs(store)).not.toThrow();
    expect(loadAudioPrefs(store)).toEqual(defaultAudioPrefs());
  });

  it('clamps out-of-range volumes and keeps a boolean muted', () => {
    const store = memStorage();
    store.setItem(
      AUDIO_KEY,
      JSON.stringify({ muted: 'yes', master: 5, music: -2, sfx: Number.NaN }),
    );
    const p = loadAudioPrefs(store);
    expect(p.master).toBe(1);
    expect(p.music).toBe(0);
    expect(p.sfx).toBe(defaultAudioPrefs().sfx); // NaN -> default
    expect(p.muted).toBe(false); // non-boolean -> default
  });

  it('treats a non-object payload as defaults', () => {
    const store = memStorage();
    store.setItem(AUDIO_KEY, '"just a string"');
    expect(loadAudioPrefs(store)).toEqual(defaultAudioPrefs());
  });
});
