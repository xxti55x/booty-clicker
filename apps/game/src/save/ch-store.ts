/**
 * Persistence for the Clicker-Heroes mode — self-contained, versioned, and
 * behind its own localStorage key so the legacy save layer (and its tests) stays
 * untouched. Never throws; injectable storage for node unit tests.
 */
import { type AbilityState, ABILITY_CHARGE_MAX, createAbility } from '../game/ability';
import { goldFor, monsterHp } from '../game/combat';
import {
  type ChStats,
  type ChState,
  type ComboSave,
  createComboSave,
  createStats,
} from '../game/ch-state';
import type { CrewLevels } from '../game/heroes';
import { createRngState, type RngState } from '../util/rng';

export const CH_SAVE_KEY = 'bootyclicker.ch';
export const CH_SCHEMA = 3;

/** Idle earnings: crew farms the current zone at reduced efficiency, hard-capped. */
export const OFFLINE_CAP_S = 8 * 3600;
export const OFFLINE_EFF = 0.5;

export interface ChStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The v1 persisted shape (MVP): the original ChState slice + envelope, defined
 * explicitly so the migration chain has a real predecessor even though the live
 * `ChState` has since grown (rng/stats/legacyImported).
 */
export interface ChSaveV1 {
  v: 1;
  lastSeen: number;
  gold: number;
  zone: number;
  killsThisZone: number;
  runMaxZone: number;
  crew: CrewLevels;
  souls: number;
  lifetimeMaxZone: number;
  totalClicks: number;
}

/** The v3 persisted shape (M8): the current ChState + envelope. */
interface ChSaveV3 extends ChState {
  v: 3;
  lastSeen: number;
}

function defaultStorage(): ChStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Never-throw validation of a stored CH save (the v3 guard). The gameplay-
 * critical fields are checked strictly (a corrupt one ⇒ reject ⇒ fresh start).
 * The meta/juice fields (rng/stats/legacyImported/ability/combo) are deliberately
 * NOT gated here: they are runtime bookkeeping and get repaired (fresh seed /
 * zeroed stats / false flag / default ability+combo) in `stateFromSave` — the
 * same "repair, don't nuke progress" spirit as the runMaxZone invariant.
 * Per-field type+range checks for them live in the `repair*` helpers below.
 */
export function isChSave(raw: unknown): raw is ChSaveV3 {
  if (!isRecord(raw)) return false;
  if (raw.v !== CH_SCHEMA) return false;
  if (!isFiniteNumber(raw.gold) || raw.gold < 0) return false;
  if (!isNonNegInt(raw.zone) || raw.zone < 1) return false;
  if (!isNonNegInt(raw.killsThisZone)) return false;
  if (!isNonNegInt(raw.runMaxZone) || raw.runMaxZone < 1) return false;
  if (!isRecord(raw.crew)) return false;
  for (const v of Object.values(raw.crew)) if (!isNonNegInt(v)) return false;
  if (!isNonNegInt(raw.souls)) return false;
  if (!isNonNegInt(raw.lifetimeMaxZone) || raw.lifetimeMaxZone < 1) return false;
  if (!isNonNegInt(raw.totalClicks)) return false;
  if (!isFiniteNumber(raw.lastSeen) || raw.lastSeen <= 0) return false;
  return true;
}

/** Serialize state + timestamp to a JSON string. */
export function serializeCh(state: ChState, now: number): string {
  const save: ChSaveV3 = { v: CH_SCHEMA, lastSeen: now, ...state };
  return JSON.stringify(save);
}

/** Repair the persisted RNG slice: a corrupt/absent value ⇒ a fresh random seed. */
function repairRng(v: unknown): RngState {
  if (isRecord(v) && isFiniteNumber(v.seed) && Number.isInteger(v.seed) && isNonNegInt(v.cursor)) {
    return { seed: v.seed | 0, cursor: v.cursor };
  }
  return createRngState();
}

/** Repair the persisted stats slice: missing/negative/non-finite counters ⇒ 0. */
function repairStats(v: unknown): ChStats {
  const src = isRecord(v) ? v : {};
  const num = (x: unknown): number => (isFiniteNumber(x) && x >= 0 ? x : 0);
  return {
    crits: num(src.crits),
    onBeatClicks: num(src.onBeatClicks),
    bossKills: num(src.bossKills),
    bossTimeouts: num(src.bossTimeouts),
    goldLifetime: num(src.goldLifetime),
    playTimeS: num(src.playTimeS),
  };
}

/** Repair the persisted ability slice: corrupt/absent ⇒ a fresh (empty) ability. */
function repairAbility(v: unknown): AbilityState {
  if (isRecord(v) && isFiniteNumber(v.charge) && isFiniteNumber(v.frenzyUntil)) {
    const cooldowns: Record<string, number> = {};
    if (isRecord(v.cooldowns)) {
      for (const [k, val] of Object.entries(v.cooldowns))
        if (isFiniteNumber(val)) cooldowns[k] = val;
    }
    return {
      charge: Math.max(0, Math.min(ABILITY_CHARGE_MAX, v.charge)),
      frenzyUntil: v.frenzyUntil >= 0 ? v.frenzyUntil : 0,
      cooldowns,
    };
  }
  return createAbility();
}

/** Repair the persisted combo slice: corrupt/absent/negative stacks ⇒ 0. */
function repairCombo(v: unknown): ComboSave {
  if (isRecord(v) && isFiniteNumber(v.stacks) && v.stacks >= 0) return { stacks: v.stacks };
  return createComboSave();
}

/** Extract a clean `ChState` from a validated save (repairing any stale invariants). */
function stateFromSave(save: ChSaveV3): ChState {
  return {
    gold: save.gold,
    zone: save.zone,
    killsThisZone: save.killsThisZone,
    runMaxZone: Math.max(save.runMaxZone, save.zone),
    crew: { ...save.crew },
    souls: save.souls,
    lifetimeMaxZone: Math.max(save.lifetimeMaxZone, save.runMaxZone, save.zone),
    totalClicks: save.totalClicks,
    rng: repairRng(save.rng),
    stats: repairStats(save.stats),
    legacyImported: save.legacyImported === true,
    ability: repairAbility(save.ability),
    combo: repairCombo(save.combo),
  };
}

type ChMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** v1 → v2: fill the M7 defaults (fresh RNG seed, zeroed stats, no legacy import). */
function migrateChV1toV2(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 2,
    rng: createRngState(),
    stats: createStats(),
    legacyImported: false,
  };
}

/** v2 → v3: fill the M8 defaults (empty Ekstase ability + zeroed combo stacks). */
function migrateChV2toV3(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 3,
    ability: createAbility(),
    combo: createComboSave(),
  };
}

const CH_MIGRATIONS: Record<number, ChMigration> = {
  1: migrateChV1toV2,
  2: migrateChV2toV3,
};

/**
 * Migrate an unknown parsed value up to the current CH schema, then validate.
 * Never throws; unknown/future/corrupt data ⇒ null ⇒ clean fresh start.
 * (Registry pattern mirrors `save/migrate.ts`.)
 */
function migrateCh(raw: unknown): ChSaveV3 | null {
  if (!isRecord(raw)) return null;
  let version = raw.v;
  if (typeof version !== 'number' || !Number.isInteger(version)) return null;
  if (version < 1 || version > CH_SCHEMA) return null;

  let data: Record<string, unknown> = raw;
  while (version < CH_SCHEMA) {
    const step = CH_MIGRATIONS[version];
    if (!step) return null;
    data = step(data);
    if (data.v !== version + 1) return null;
    version += 1;
  }
  return isChSave(data) ? data : null;
}

/** Parse + migrate + validate a save JSON string into a clean state (null if invalid). */
export function deserializeCh(json: string): ChState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const migrated = migrateCh(parsed);
  return migrated ? stateFromSave(migrated) : null;
}

// UTF-8-safe base64 (mirrors the legacy store) so export codes survive emoji.
function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromB64(code: string): string {
  const bin = atob(code);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Portable save code (base64) for manual export. */
export function exportCh(state: ChState, now: number): string {
  return toB64(serializeCh(state, now));
}

/** Decode + validate a base64 save code back into a state (null if invalid). */
export function importCh(code: string): ChState | null {
  try {
    return deserializeCh(fromB64(code.trim()));
  } catch {
    return null;
  }
}

export function saveCh(
  state: ChState,
  now: number,
  storage: ChStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(CH_SAVE_KEY, serializeCh(state, now));
  } catch {
    // ignore quota/serialize errors
  }
}

export interface LoadedCh {
  state: ChState;
  lastSeen: number;
}

/** Load + validate. Returns null when nothing valid is stored. */
export function loadCh(storage: ChStorage | null = defaultStorage()): LoadedCh | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(CH_SAVE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const migrated = migrateCh(parsed);
  if (migrated === null) return null;
  return { state: stateFromSave(migrated), lastSeen: migrated.lastSeen };
}

/** Wipe the CH save (reset). */
export function resetCh(storage: ChStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(CH_SAVE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Idle gold earned while away: the crew farms the CURRENT zone's rivals (never
 * bosses — idle can't beat a timed boss) at `OFFLINE_EFF`, capped at
 * `OFFLINE_CAP_S`. Returns 0 without any DPS.
 */
export function offlineGold(dps: number, zone: number, elapsedMs: number): number {
  if (dps <= 0 || elapsedMs <= 0) return 0;
  const seconds = Math.min(elapsedMs / 1000, OFFLINE_CAP_S);
  const killsPerSec = dps / monsterHp(zone);
  const goldPerSec = killsPerSec * goldFor(zone, false);
  return Math.floor(goldPerSec * seconds * OFFLINE_EFF);
}

/**
 * BP to grant when a hidden tab becomes visible again (B5): identical accrual to
 * boot-time offline gold over the interval the tab was hidden. A thin named seam
 * so `main.ts` reads clearly and the grant is unit-testable with injected times.
 */
export function visibilityGrant(dps: number, zone: number, hiddenMs: number): number {
  return offlineGold(dps, zone, hiddenMs);
}
