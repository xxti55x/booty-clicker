/**
 * Client effect settings (spec §5 M4: screen-shake is "abschaltbar"). Persisted
 * separately from the game save under its own key so toggling effects never
 * forces a save migration. Pure + storage-injectable, never throws. M6 extends
 * this with graphics quality / FPS cap.
 */

export const SETTINGS_KEY = 'bootyclicker.settings';

export interface GameSettings {
  screenShake: boolean;
  particles: boolean;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSettings(): GameSettings {
  return { screenShake: true, particles: true };
}

function defaultStorage(): SettingsStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSettings(storage: SettingsStorage | null = defaultStorage()): GameSettings {
  const d = defaultSettings();
  if (!storage) return d;
  let raw: string | null;
  try {
    raw = storage.getItem(SETTINGS_KEY);
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
    screenShake: typeof p.screenShake === 'boolean' ? p.screenShake : d.screenShake,
    particles: typeof p.particles === 'boolean' ? p.particles : d.particles,
  };
}

export function saveSettings(
  settings: GameSettings,
  storage: SettingsStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
