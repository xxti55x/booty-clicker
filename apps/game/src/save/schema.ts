import type { BackgroundKey, SkinKey } from '../types';

/**
 * Save schema — current version.
 *
 * Architecture rule (spec M1): derived stats (perClick/perSec/mult) are never
 * persisted. Only `bp` and upgrade *levels* (keyed by upgrade id) are stored;
 * derived stats are rebuilt from a fresh `createUpgrades()` via `deriveStats`
 * on load, so a corrupted/tampered stored multiplier can never leak in.
 */
export const SCHEMA_VERSION = 2;

export interface SaveDataV2 {
  schemaVersion: 2;
  bp: number;
  upgrades: Record<string, number>;
  skin: SkinKey;
  bg: BackgroundKey;
  unlocked: Record<SkinKey, boolean>;
  lastSeen: number;
}

/** Compile-time exhaustive key sets. Do NOT import BGS — it pulls in three. */
const SKIN_KEYS: Record<SkinKey, true> = {
  classic: true,
  disco: true,
  robo: true,
  host: true,
  boss: true,
};
const BG_KEYS: Record<BackgroundKey, true> = {
  club: true,
  synth: true,
  beach: true,
  space: true,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Type guard: validates an unknown value as a current-schema save. Never throws. */
export function isSaveDataV2(raw: unknown): raw is SaveDataV2 {
  if (!isRecord(raw)) return false;
  if (raw.schemaVersion !== SCHEMA_VERSION) return false;
  if (typeof raw.bp !== 'number' || !Number.isFinite(raw.bp) || raw.bp < 0) return false;

  if (!isRecord(raw.upgrades)) return false;
  for (const v of Object.values(raw.upgrades)) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return false;
  }

  if (typeof raw.skin !== 'string' || !(raw.skin in SKIN_KEYS)) return false;
  if (typeof raw.bg !== 'string' || !(raw.bg in BG_KEYS)) return false;

  if (!isRecord(raw.unlocked)) return false;
  for (const v of Object.values(raw.unlocked)) {
    if (v !== undefined && typeof v !== 'boolean') return false;
  }

  if (typeof raw.lastSeen !== 'number' || !Number.isFinite(raw.lastSeen) || raw.lastSeen <= 0) {
    return false;
  }

  return true;
}
