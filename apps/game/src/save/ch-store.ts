/**
 * Persistence for the Clicker-Heroes mode — self-contained, versioned, and
 * behind its own localStorage key so the legacy save layer (and its tests) stays
 * untouched. Never throws; injectable storage for node unit tests.
 */
import { goldFor, monsterHp } from '../game/combat';
import type { ChState } from '../game/ch-state';

export const CH_SAVE_KEY = 'bootyclicker.ch';
export const CH_SCHEMA = 1;

/** Idle earnings: crew farms the current zone at reduced efficiency, hard-capped. */
export const OFFLINE_CAP_S = 8 * 3600;
export const OFFLINE_EFF = 0.5;

export interface ChStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface ChSaveV1 extends ChState {
  v: 1;
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

/** Never-throw validation of a stored CH save. */
export function isChSave(raw: unknown): raw is ChSaveV1 {
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
  const save: ChSaveV1 = { v: CH_SCHEMA, lastSeen: now, ...state };
  return JSON.stringify(save);
}

/** Extract a clean `ChState` from a validated save (repairing any stale invariants). */
function stateFromSave(save: ChSaveV1): ChState {
  return {
    gold: save.gold,
    zone: save.zone,
    killsThisZone: save.killsThisZone,
    runMaxZone: Math.max(save.runMaxZone, save.zone),
    crew: { ...save.crew },
    souls: save.souls,
    lifetimeMaxZone: Math.max(save.lifetimeMaxZone, save.runMaxZone, save.zone),
    totalClicks: save.totalClicks,
  };
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
  if (!isChSave(parsed)) return null;
  return { state: stateFromSave(parsed), lastSeen: parsed.lastSeen };
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
