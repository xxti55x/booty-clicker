import type { BackgroundKey, SkinKey } from '../types';

/**
 * Save schema — current version.
 *
 * Architecture rule (spec §4.2): derived stats (perClick/perSec/mult) are never
 * persisted. Only `bp`, upgrade *levels* (keyed by id) and progression flags are
 * stored; derived stats are rebuilt from a fresh `createUpgrades()` via
 * `deriveStats` (with the prestige multiplier folded in) on load.
 *
 * v3 (M2): maxBp, prestigeMult, rebirths, bossDefeated.
 * v4 (M4): achievements, totalClicks, maxCombo, peachesClicked, nextPeachAt, boostUntil.
 */
export const SCHEMA_VERSION = 4;

export interface SaveDataV4 {
  schemaVersion: 4;
  bp: number;
  upgrades: Record<string, number>;
  skin: SkinKey;
  bg: BackgroundKey;
  unlocked: Record<SkinKey, boolean>;
  lastSeen: number;
  maxBp: number;
  prestigeMult: number;
  rebirths: number;
  bossDefeated: boolean;
  achievements: string[];
  totalClicks: number;
  maxCombo: number;
  peachesClicked: number;
  nextPeachAt: number;
  boostUntil: number;
}

/** The current save shape. */
export type SaveData = SaveDataV4;

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

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** Type guard: validates an unknown value as a current-schema save. Never throws. */
export function isSaveDataV4(raw: unknown): raw is SaveDataV4 {
  if (!isRecord(raw)) return false;
  if (raw.schemaVersion !== SCHEMA_VERSION) return false;
  if (!isFiniteNumber(raw.bp) || raw.bp < 0) return false;

  if (!isRecord(raw.upgrades)) return false;
  for (const v of Object.values(raw.upgrades)) {
    if (!isNonNegInt(v)) return false;
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
  if (!isNonNegInt(raw.rebirths)) return false;
  if (typeof raw.bossDefeated !== 'boolean') return false;

  if (!Array.isArray(raw.achievements) || !raw.achievements.every((a) => typeof a === 'string')) {
    return false;
  }
  if (!isNonNegInt(raw.totalClicks)) return false;
  if (!isNonNegInt(raw.maxCombo)) return false;
  if (!isNonNegInt(raw.peachesClicked)) return false;
  if (!isFiniteNumber(raw.nextPeachAt) || raw.nextPeachAt < 0) return false;
  if (!isFiniteNumber(raw.boostUntil) || raw.boostUntil < 0) return false;

  return true;
}
