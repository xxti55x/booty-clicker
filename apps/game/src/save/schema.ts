import type { BackgroundKey, SkinKey } from '../types';

/**
 * Save schema — current version.
 *
 * Architecture rule (spec §4.2): derived stats (perClick/perSec/mult) are never
 * persisted. Only `bp`, upgrade *levels* (keyed by id) and progression flags are
 * stored; derived stats are rebuilt from a fresh `createUpgrades()` via
 * `deriveStats` (with the prestige multiplier folded in) on load, so a
 * corrupted/tampered stored multiplier can never leak in.
 *
 * v3 (M2) adds progression: maxBp, prestigeMult, rebirths, bossDefeated.
 */
export const SCHEMA_VERSION = 3;

export interface SaveDataV3 {
  schemaVersion: 3;
  bp: number;
  upgrades: Record<string, number>;
  skin: SkinKey;
  bg: BackgroundKey;
  unlocked: Record<SkinKey, boolean>;
  lastSeen: number;
  /** Highest BP ever reached (sticky content-gate reveals). */
  maxBp: number;
  /** Permanent Rebirth multiplier (1 + rebirths). */
  prestigeMult: number;
  /** Number of rebirths performed. */
  rebirths: number;
  /** Whether the boss has been defeated at least once. */
  bossDefeated: boolean;
}

/** The current save shape. */
export type SaveData = SaveDataV3;

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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Type guard: validates an unknown value as a current-schema save. Never throws. */
export function isSaveDataV3(raw: unknown): raw is SaveDataV3 {
  if (!isRecord(raw)) return false;
  if (raw.schemaVersion !== SCHEMA_VERSION) return false;
  if (!isFiniteNumber(raw.bp) || raw.bp < 0) return false;

  if (!isRecord(raw.upgrades)) return false;
  for (const v of Object.values(raw.upgrades)) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return false;
  }

  // Object.hasOwn (not `in`) — `in` walks the prototype chain, so a save with
  // e.g. bg: "toString" would otherwise pass and later crash setBackground().
  if (typeof raw.skin !== 'string' || !Object.hasOwn(SKIN_KEYS, raw.skin)) return false;
  if (typeof raw.bg !== 'string' || !Object.hasOwn(BG_KEYS, raw.bg)) return false;

  if (!isRecord(raw.unlocked)) return false;
  for (const v of Object.values(raw.unlocked)) {
    if (v !== undefined && typeof v !== 'boolean') return false;
  }

  if (!isFiniteNumber(raw.lastSeen) || raw.lastSeen <= 0) return false;

  if (!isFiniteNumber(raw.maxBp) || raw.maxBp < 0) return false;
  if (!isFiniteNumber(raw.prestigeMult) || raw.prestigeMult < 1) return false;
  if (typeof raw.rebirths !== 'number' || !Number.isInteger(raw.rebirths) || raw.rebirths < 0) {
    return false;
  }
  if (typeof raw.bossDefeated !== 'boolean') return false;

  return true;
}
