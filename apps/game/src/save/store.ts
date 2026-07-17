import { deriveStats, type UpgradeState } from '../game/economy';
import { createGameState, type GameState } from '../game/state';
import { migrate } from './migrate';
import type { SaveDataV3 } from './schema';

export const SAVE_KEY = 'bootyclicker.save';

/** Minimal storage surface — lets Vitest (node env, no jsdom) inject an in-memory fake. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): SaveStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Snapshot the current game into the current save schema. Pure — no I/O. */
export function serialize(
  state: GameState,
  upgrades: readonly UpgradeState[],
  now = Date.now(),
): SaveDataV3 {
  const levels: Record<string, number> = {};
  for (const u of upgrades) levels[u.id] = u.lv;
  return {
    schemaVersion: 3,
    bp: state.bp,
    upgrades: levels,
    skin: state.skin,
    bg: state.bg,
    unlocked: { ...state.unlocked },
    lastSeen: now,
    maxBp: state.maxBp,
    prestigeMult: state.prestigeMult,
    rebirths: state.rebirths,
    bossDefeated: state.bossDefeated,
  };
}

/** Persist the current game. No-ops if storage is unavailable; never throws. */
export function saveGame(
  state: GameState,
  upgrades: readonly UpgradeState[],
  storage: SaveStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(state, upgrades)));
  } catch {
    // Quota exceeded, storage disabled, etc. — silently skip this save.
  }
}

/** Load + migrate the stored save, if any. Never throws — bad data yields null. */
export function loadGame(storage: SaveStorage | null = defaultStorage()): SaveDataV3 | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
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
  return migrate(parsed);
}

/**
 * Apply a validated save onto a fresh state + upgrade set. Pure mutation:
 * derived stats (perClick/perSec/mult) are rebuilt via deriveStats, never
 * trusted from disk.
 */
export function applySave(save: SaveDataV3, state: GameState, upgrades: UpgradeState[]): void {
  for (const u of upgrades) u.lv = save.upgrades[u.id] ?? 0;

  state.prestigeMult = save.prestigeMult;
  state.rebirths = save.rebirths;
  state.bossDefeated = save.bossDefeated;
  state.maxBp = save.maxBp;

  // Prestige multiplier is folded into the derived multiplier (never trust a
  // stored `mult`; rebuild it from levels + prestige).
  const derived = deriveStats(upgrades, { perClick: 1, perSec: 0, mult: state.prestigeMult });
  state.perClick = derived.perClick;
  state.perSec = derived.perSec;
  state.mult = derived.mult;

  state.bp = save.bp;
  state.skin = save.skin;
  state.bg = save.bg;

  const fresh = createGameState().unlocked;
  const merged = { ...fresh };
  for (const k of Object.keys(fresh) as (keyof typeof fresh)[]) {
    merged[k] = fresh[k] || save.unlocked[k] === true;
  }
  merged[save.skin] = true;
  state.unlocked = merged;
}

/** Offline-earnings rules: capped duration, half the online passive rate. */
export const OFFLINE_CAP_MS = 2 * 60 * 60 * 1000;
export const OFFLINE_RATE = 0.5;

/** BP earned while away, pure: clamp elapsed to [0, cap], then passive * rate. */
export function computeOfflineEarnings(elapsedMs: number, perSec: number, mult: number): number {
  const clamped = Math.min(Math.max(elapsedMs, 0), OFFLINE_CAP_MS);
  return (clamped / 1000) * perSec * mult * OFFLINE_RATE;
}

/** UTF-8-safe base64 encode (TextEncoder → binary string → btoa). */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** UTF-8-safe base64 decode (atob → bytes → TextDecoder). */
export function decodeBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Export the current game as a shareable base64 code. Pure — no storage. */
export function exportSave(state: GameState, upgrades: readonly UpgradeState[]): string {
  return encodeBase64(JSON.stringify(serialize(state, upgrades)));
}

/** Parse a base64 save code back into a validated save. Never throws. */
export function importSave(b64: string): SaveDataV3 | null {
  const trimmed = b64.trim();
  let json: string;
  try {
    json = decodeBase64(trimmed);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  return migrate(parsed);
}

/** Wipe the stored save. No-op if storage is unavailable; never throws. */
export function resetSave(storage: SaveStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
