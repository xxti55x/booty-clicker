/**
 * Audio preferences — persisted separately from the game save so audio settings
 * never force a save-schema migration (spec M3: "Mute persistiert").
 *
 * Pure + storage-injectable (like the save layer) so it is unit-testable in the
 * node Vitest environment with an in-memory fake. Never throws.
 */

export const AUDIO_KEY = 'bootyclicker.audio';

export interface AudioPrefs {
  muted: boolean;
  /** Master volume 0..1. */
  master: number;
  /** Music bus volume 0..1. */
  music: number;
  /** SFX bus volume 0..1. */
  sfx: number;
}

/** Minimal storage surface (matches the save layer's SaveStorage shape). */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultAudioPrefs(): AudioPrefs {
  return { muted: false, master: 0.8, music: 0.55, sfx: 0.9 };
}

function defaultStorage(): PrefsStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

/** Load audio prefs, clamping volumes and falling back to defaults. Never throws. */
export function loadAudioPrefs(storage: PrefsStorage | null = defaultStorage()): AudioPrefs {
  const d = defaultAudioPrefs();
  if (!storage) return d;
  let raw: string | null;
  try {
    raw = storage.getItem(AUDIO_KEY);
  } catch {
    return d;
  }
  if (raw === null) return d;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return d;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return d;
  const p = parsed as Record<string, unknown>;
  return {
    muted: typeof p.muted === 'boolean' ? p.muted : d.muted,
    master: clamp01(p.master, d.master),
    music: clamp01(p.music, d.music),
    sfx: clamp01(p.sfx, d.sfx),
  };
}

/** Persist audio prefs. No-op if storage is unavailable; never throws. */
export function saveAudioPrefs(
  prefs: AudioPrefs,
  storage: PrefsStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(AUDIO_KEY, JSON.stringify(prefs));
  } catch {
    // quota / disabled storage — ignore
  }
}
