/**
 * Ascension core — the prestige layer (pure), Clicker-Heroes "Hero Souls".
 *
 * Booty theme: retiring your current tour banks **Ruhm-Seelen** (fame souls).
 * Each held soul is a permanent **+10 % to all damage** (click *and* crew DPS),
 * so a reset trades raw progress for a compounding multiplier — the engine that
 * keeps the game endless: deeper zones → more souls → more damage → deeper zones.
 *
 * **Souls accounting (M10 — held-balance + additive-earn).** Before M10 souls were
 * a lifetime-pinned bank (`souls = max(current, soulsForMaxZone(deepest))`). M10
 * makes Ancients (§4.6) *spend* souls, so ascension must never refund what you
 * spent. The model is therefore split in two:
 *
 *   · `rsLifetime` = total souls ever EARNED (monotonic) = `soulsForMaxZone(deepest
 *     zone you have ascended from)`.
 *   · `souls`      = spendable **held** balance = `rsLifetime − Σ(spent on Ancients)`.
 *
 * Ascending to deepest zone z earns only the *new* souls beyond what has already
 * been earned: `gain = max(0, soulsForMaxZone(z) − rsLifetime)`, added to the held
 * balance, with `rsLifetime` lifted to the new earned total. Held souls therefore
 * carry across ascensions (they're only reset by a Ruhmes-Himmelfahrt, L2/§4.5.2),
 * and what you spent on Ancients stays spent. A first ascension from scratch yields
 * exactly the pre-M10 numbers (zone 50 ⇒ 129), so the pacing tables still hold.
 *
 * The `soulMult` amplifier (`0.10 + 0.002·HPF`, §4.5.2) is threaded in as the
 * `bonusPerSoul` argument by the caller — this module stays free of any L2 import.
 */

/** You can't ascend before reaching this zone (keeps early souls non-trivial). */
export const ASCEND_MIN_ZONE = 10;
/** Base damage bonus per held soul (+10 %); amplified by held HPF at the call site. */
export const SOUL_BONUS = 0.1;

const SOUL_SCALE = 40;
const SOUL_EXP = 1.6;
/**
 * Base of the exponential "Legendäre Auftritte" term added in RS_v2 (spec §4.5.1,
 * the M9 anti-plateau retune, N1). The polynomial term alone (`⌊z^1.6/40⌋`) is too
 * flat and the bank plateaus around 13 souls / zone ~50; adding `⌊1.10^z − 1⌋` makes
 * every new best-zone *multiply* the earned total instead of incrementing it.
 */
const SOUL_EXP_BASE = 1.1;

/** Souls corresponding to a lifetime-deepest `zone` (monotonic, 0 below the gate). */
export function soulsForMaxZone(zone: number): number {
  if (zone < ASCEND_MIN_ZONE) return 0;
  const poly = Math.floor(Math.pow(zone, SOUL_EXP) / SOUL_SCALE);
  const legendary = Math.floor(Math.pow(SOUL_EXP_BASE, zone) - 1);
  return poly + legendary;
}

/**
 * Global damage multiplier from `souls` held. `bonusPerSoul` defaults to the base
 * +10 %; the HPF soul-amplifier (`soulBonusEff`, §4.5.2) passes a larger value so
 * L1 (more souls) and L2 (fatter souls) *multiply* rather than add.
 */
export function soulMult(souls: number, bonusPerSoul: number = SOUL_BONUS): number {
  return 1 + bonusPerSoul * Math.max(0, souls);
}

/**
 * Souls you would GAIN by ascending right now: the earned total for the lifetime-
 * deepest zone (including the current run) minus what you have **already earned**
 * (`rsLifetime`). Spending souls on Ancients lowers your held balance but not
 * `rsLifetime`, so it can never be farmed back by re-ascending.
 */
export function pendingSouls(
  runMaxZone: number,
  lifetimeMaxZone: number,
  rsLifetime: number,
): number {
  const deepest = Math.max(runMaxZone, lifetimeMaxZone);
  return Math.max(0, soulsForMaxZone(deepest) - rsLifetime);
}

/** Whether ascending is worth it (at least one newly-earned soul, past the gate). */
export function canAscend(
  runMaxZone: number,
  lifetimeMaxZone: number,
  rsLifetime: number,
): boolean {
  return pendingSouls(runMaxZone, lifetimeMaxZone, rsLifetime) >= 1;
}

export interface AscendResult {
  /** New held (spendable) soul balance. */
  souls: number;
  /** New lifetime-deepest zone. */
  lifetimeMaxZone: number;
  /** New lifetime-earned soul total (monotonic highwater). */
  rsLifetime: number;
}

/**
 * Compute the post-ascension held balance, lifetime record + earned total. The
 * caller performs the run reset (zone → 1, crew → empty, gold → 0); held souls,
 * Ancients and all L2 state carry over (only a Himmelfahrt resets them).
 */
export function applyAscension(
  runMaxZone: number,
  lifetimeMaxZone: number,
  currentSouls: number,
  rsLifetime: number,
): AscendResult {
  const deepest = Math.max(runMaxZone, lifetimeMaxZone);
  const earnedTotal = soulsForMaxZone(deepest);
  const gain = Math.max(0, earnedTotal - rsLifetime);
  return {
    souls: currentSouls + gain,
    lifetimeMaxZone: deepest,
    rsLifetime: Math.max(rsLifetime, earnedTotal),
  };
}
