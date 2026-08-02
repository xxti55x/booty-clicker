/**
 * Client settings (spec §5 M4 effects + M6 graphics/onboarding). Persisted
 * separately from the game save under its own key so toggling never forces a
 * save migration. Pure + storage-injectable, never throws.
 */

export const SETTINGS_KEY = 'bootyclicker.settings';

export type Quality = 'low' | 'medium' | 'high';

/**
 * V2-2: Was der SPIELER wählt — `'auto'` (Default) heißt: das Gerät entscheidet
 * (Signal-Wahl beim Boot + FPS-Governor zur Laufzeit, `engine/auto-quality`).
 * Die Renderer-Seite ({@link Quality}) kennt weiterhin nur die drei Presets;
 * `'auto'` wird in `main.ts` VOR `applyQuality` aufgelöst.
 */
export type QualityChoice = Quality | 'auto';
const QUALITY_CHOICES: readonly QualityChoice[] = ['auto', 'low', 'medium', 'high'];

/** Allowed FPS caps (0 = uncapped). */
export const FPS_CAPS: readonly number[] = [0, 30, 60];

export interface GameSettings {
  screenShake: boolean;
  particles: boolean;
  /** Click/crit/boss haptics (spec §8.8) — feature-detected, iOS is a no-op. */
  haptics: boolean;
  /** Graphics preset — `'auto'` = Gerät entscheidet (V2-2). */
  quality: QualityChoice;
  /**
   * V2-2: Hat der Spieler die Qualität je SELBST angefasst? Solange nicht,
   * erzwingt der Loader `'auto'` — damit wandern Alt-Saves, die nur den alten
   * Default `'high'` gespeichert hatten (das war nie eine Entscheidung), in die
   * Automatik, während eine echte Wahl für immer respektiert wird.
   */
  qualityChosen: boolean;
  /** Frame-rate cap (0 = uncapped). */
  fpsCap: number;
  /** Whether the first-run onboarding has been shown. */
  onboarded: boolean;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSettings(): GameSettings {
  return {
    screenShake: true,
    particles: true,
    haptics: true,
    quality: 'auto',
    qualityChosen: false,
    fpsCap: 0,
    onboarded: false,
  };
}

function defaultStorage(): SettingsStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function asQualityChoice(v: unknown, fallback: QualityChoice): QualityChoice {
  return typeof v === 'string' && (QUALITY_CHOICES as readonly string[]).includes(v)
    ? (v as QualityChoice)
    : fallback;
}

function asFpsCap(v: unknown, fallback: number): number {
  return typeof v === 'number' && FPS_CAPS.includes(v) ? v : fallback;
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
  const qualityChosen = p.qualityChosen === true;
  return {
    screenShake: typeof p.screenShake === 'boolean' ? p.screenShake : d.screenShake,
    particles: typeof p.particles === 'boolean' ? p.particles : d.particles,
    haptics: typeof p.haptics === 'boolean' ? p.haptics : d.haptics,
    // V2-2: Ohne dokumentierte eigene Wahl gilt 'auto' — auch für Alt-Saves,
    // die nur den früheren Default 'high' gespeichert hatten (keine Wahl).
    quality: qualityChosen ? asQualityChoice(p.quality, d.quality) : 'auto',
    qualityChosen,
    fpsCap: asFpsCap(p.fpsCap, d.fpsCap),
    onboarded: typeof p.onboarded === 'boolean' ? p.onboarded : d.onboarded,
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
