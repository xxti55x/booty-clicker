/**
 * Ascension core — the prestige layer (pure), Clicker-Heroes "Hero Souls".
 *
 * Booty theme: retiring your current tour banks **Ruhm-Seelen** (fame souls).
 * Each soul is a permanent **+10 % to all damage** (click *and* crew DPS), so a
 * reset trades raw progress for a compounding multiplier — the engine that keeps
 * the game endless: deeper zones → more souls → more damage → deeper zones.
 *
 * Souls are pinned to your **lifetime** deepest zone (not per-run), so ascending
 * early or often can never farm free souls — you only bank new ones by beating
 * your record. No soul *spending* yet (Ancients/skill-tree = a later milestone);
 * every banked soul is pure bonus.
 */

/** You can't ascend before reaching this zone (keeps early souls non-trivial). */
export const ASCEND_MIN_ZONE = 10;
/** Damage bonus per banked soul. */
export const SOUL_BONUS = 0.1;

const SOUL_SCALE = 40;
const SOUL_EXP = 1.6;

/** Souls corresponding to a lifetime-deepest `zone` (monotonic, 0 below the gate). */
export function soulsForMaxZone(zone: number): number {
  if (zone < ASCEND_MIN_ZONE) return 0;
  return Math.floor(Math.pow(zone, SOUL_EXP) / SOUL_SCALE);
}

/** Global damage multiplier from `souls` banked (+10 % each). */
export function soulMult(souls: number): number {
  return 1 + SOUL_BONUS * Math.max(0, souls);
}

/**
 * Souls you would GAIN by ascending right now: the lifetime-deepest zone
 * (including the current run) mapped to souls, minus what you've already banked.
 */
export function pendingSouls(
  runMaxZone: number,
  lifetimeMaxZone: number,
  currentSouls: number,
): number {
  const deepest = Math.max(runMaxZone, lifetimeMaxZone);
  return Math.max(0, soulsForMaxZone(deepest) - currentSouls);
}

/** Whether ascending is worth it (at least one new soul, past the gate). */
export function canAscend(
  runMaxZone: number,
  lifetimeMaxZone: number,
  currentSouls: number,
): boolean {
  return pendingSouls(runMaxZone, lifetimeMaxZone, currentSouls) >= 1;
}

export interface AscendResult {
  /** New total banked souls. */
  souls: number;
  /** New lifetime-deepest zone. */
  lifetimeMaxZone: number;
}

/**
 * Compute the post-ascension soul bank + lifetime record. The caller performs
 * the run reset (zone → 1, crew → empty, gold → 0) using these values.
 */
export function applyAscension(
  runMaxZone: number,
  lifetimeMaxZone: number,
  currentSouls: number,
): AscendResult {
  const deepest = Math.max(runMaxZone, lifetimeMaxZone);
  // Never let the bank shrink, even if the formula is later retuned downward.
  return { souls: Math.max(currentSouls, soulsForMaxZone(deepest)), lifetimeMaxZone: deepest };
}
