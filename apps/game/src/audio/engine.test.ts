import { describe, expect, it } from 'vitest';

import { AudioEngine } from './engine';
import type { AudioPrefs, PrefsStorage } from './prefs';

/** Winziger Speicher-Doppelgänger (dieselbe Rolle wie in `prefs.test.ts`). */
function memStorage(seed?: Partial<AudioPrefs>): PrefsStorage {
  const map = new Map<string, string>();
  if (seed) map.set('bootyclicker.audio', JSON.stringify(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

/**
 * ROADMAP-V2 X5 — Der Vertrag der SFX-Oberfläche: **ohne AudioContext ist jeder
 * Klang ein stiller No-op**. Das ist im Spiel der Normalfall vor der ersten
 * Geste (nichts darf autoplayen) und hier der Grund, warum die neuen X5-Rufe
 * aus dem Spawn-Pfad des Kobolds oder dem Prestige-Handler nie werfen können.
 * Der Klang SELBST wird im Browser-Smoke gemessen (`window.chAudio`), nicht hier
 * — Node hat keinen Audio-Stack.
 */
describe('AudioEngine ohne Kontext (vor der ersten Geste)', () => {
  const engine = new AudioEngine(memStorage());

  it('meldet „kein Kontext" statt zu werfen', () => {
    expect(engine.debug.ctx).toBe('none');
    expect(engine.debug.muted).toBe(false);
  });

  it('schluckt jeden Zeremonie-Stinger lautlos', () => {
    for (const k of ['ascend', 'himmelfahrt', 'transcend'] as const) {
      expect(() => engine.ceremony(k)).not.toThrow();
    }
  });

  it('schluckt Kobold-Jingle, Ekstase-Lage und die Alt-SFX lautlos', () => {
    expect(() => engine.goblinSpawn()).not.toThrow();
    expect(() => engine.goblinCatch()).not.toThrow();
    expect(() => engine.setEkstase(true)).not.toThrow();
    expect(() => engine.setEkstase(false)).not.toThrow();
    expect(() => engine.setIntensity(3)).not.toThrow();
    expect(() => engine.bossIntro()).not.toThrow();
    expect(() => engine.zoneClear()).not.toThrow();
    expect(() => engine.setBackground('space')).not.toThrow();
  });
});

describe('Mute-Vertrag', () => {
  it('persistiert den Mute-Zustand und meldet ihn im Debug-Blick', () => {
    const storage = memStorage();
    const engine = new AudioEngine(storage);
    expect(engine.toggleMute()).toBe(true);
    expect(engine.muted).toBe(true);
    expect(engine.debug.muted).toBe(true);
    // Eine frische Engine auf demselben Speicher startet stumm.
    expect(new AudioEngine(storage).muted).toBe(true);
    engine.setMuted(false);
    expect(new AudioEngine(storage).muted).toBe(false);
  });

  it('lässt sich auch stumm gefahrlos anspielen', () => {
    const engine = new AudioEngine(memStorage({ muted: true }));
    expect(engine.muted).toBe(true);
    expect(() => engine.ceremony('transcend')).not.toThrow();
    expect(() => engine.goblinSpawn()).not.toThrow();
  });
});
