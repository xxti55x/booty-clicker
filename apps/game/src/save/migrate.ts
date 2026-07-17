import { UPGRADES } from '../game/economy';
import { isSaveDataV3, SCHEMA_VERSION, type SaveDataV3 } from './schema';

/**
 * v1 shape, defined retroactively — the naive serialization M0's prototype
 * would have produced: derived stats stored directly, upgrade levels as a
 * positional array index-aligned with `UPGRADES`, no `lastSeen`.
 */
export interface SaveDataV1 {
  schemaVersion: 1;
  bp: number;
  perClick: number;
  perSec: number;
  mult: number;
  upgrades: number[];
  skin: string;
  bg: string;
  unlocked: Record<string, boolean>;
}

/** v2 shape (M1): id-keyed levels, derived stats dropped, `lastSeen` added. */
export interface SaveDataV2 {
  schemaVersion: 2;
  bp: number;
  upgrades: Record<string, number>;
  skin: string;
  bg: string;
  unlocked: Record<string, boolean>;
  lastSeen: number;
}

type MigrationStep = (raw: Record<string, unknown>) => Record<string, unknown>;

function migrateV1toV2(raw: Record<string, unknown>): Record<string, unknown> {
  const levels: Record<string, number> = {};
  const positional = raw.upgrades;
  if (Array.isArray(positional)) {
    positional.forEach((lv, i) => {
      const cfg = UPGRADES[i];
      if (cfg && typeof lv === 'number') levels[cfg.id] = lv;
    });
  }

  // Drop perClick/perSec/mult — derived stats are never trusted from disk.
  const { bp, skin, bg, unlocked } = raw;
  return {
    schemaVersion: 2,
    bp,
    upgrades: levels,
    skin,
    bg,
    unlocked,
    lastSeen: Date.now(),
  };
}

function migrateV2toV3(raw: Record<string, unknown>): Record<string, unknown> {
  // Progression fields (M2) default to a fresh, un-prestiged run. maxBp is
  // seeded from the current bp (best guess for the highest seen so far).
  const bp = typeof raw.bp === 'number' && Number.isFinite(raw.bp) ? raw.bp : 0;
  return {
    ...raw,
    schemaVersion: 3,
    maxBp: bp,
    prestigeMult: 1,
    rebirths: 0,
    bossDefeated: false,
  };
}

const MIGRATIONS: Record<number, MigrationStep> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
};

/**
 * Migrate an unknown parsed value up to the current schema. Returns null on
 * any structural failure — never throws.
 */
export function migrate(raw: unknown): SaveDataV3 | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  let version = (raw as Record<string, unknown>).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) return null;
  if (version < 1 || version > SCHEMA_VERSION) return null;

  let data: Record<string, unknown> = raw as Record<string, unknown>;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return null;
    data = step(data);
    if (data.schemaVersion !== version + 1) return null;
    version += 1;
  }

  return isSaveDataV3(data) ? data : null;
}
