/**
 * The pure click-math core (spec §4.1/§4.2.1/§4.2.3) — moved out of `main.ts` (N2).
 *
 * `effectiveClick` is the single source of click-damage truth. Written as an
 * extensible pipeline so each milestone folds its own factor in without changing
 * the call site's shape (§4.1):
 *
 *   effectiveClick = clickDamageOf(state)      // base (crew DPS + soulMult)
 *     × comboMult(stacks)                      // §4.2.2
 *     × critMult(crit, tier)                   // §4.2.1 (+ tier perk)
 *     × beatBonus(onBeat)                      // §4.2.3  (via extraMult)
 *     × frenzyMult(now)                        // §4.2.4  (via extraMult)
 *     × gearMult / eventMult …                 // M11/M12 (via extraMult)
 *
 * Idle DPS runs in parallel but NEVER draws crit/combo/beat/frenzy — the active
 * click stays king (P1). Balancing lives here as exported data, never as inline
 * literals in the glue. Crit rolls draw from the seedable RNG (`util/rng.ts`);
 * this module only consumes an already-drawn float so it stays pure & tested.
 */

import { CLAPS_PER_PHASE } from '../audio/beat';

/** Crit chance per click (spec §4.2.1 baseline — the pacing tables assume 20 %). */
export const CRIT_CHANCE = 0.2;
/** Crit damage multiplier (×5 → EV ×1.8 together with the 20 % chance). */
export const CRIT_MULT = 5;
/** Hard cap on crit chance (base 20 % + at most +20 %, spec §4.2.1). */
export const CRIT_CHANCE_CAP = 0.4;
/** Combo multiplier gained per stack (+2 %). */
export const COMBO_STEP = 0.02;
/** Stacks beyond this no longer raise the multiplier (cap ×2). */
export const COMBO_CAP = 50;
/** Seconds a combo survives without a click before it soft-decays (§4.2.2). */
export const COMBO_WINDOW_S = 1.5;

/** On-beat click bonus (spec §4.2.3): ×1.5 to a click landed in the beat window. */
export const ON_BEAT_MULT = 1.5;
/** On-beat detection window, ± this many ms around a BeatTracker onset (§4.2.3). */
export const ON_BEAT_WINDOW_MS = 100;

/**
 * Choreography phase advances at `PHASE_RATE_BASE · (1 + drive·PHASE_RATE_DRIVE)`
 * phase-units/sec — mirrors `physics.stepPhysics` (kept as named data so on-beat
 * timing has one source of truth). Beat onsets fall on integer multiples of the
 * beat period in phase-space (see `BeatTracker`), i.e. every `BEAT_PERIOD_PHASE`.
 */
export const PHASE_RATE_BASE = 2.2;
export const PHASE_RATE_DRIVE = 0.35;
export const BEAT_PERIOD_PHASE = 1 / CLAPS_PER_PHASE;

/** Combo multiplier: 1 + min(combo, cap)·step ⇒ 1 (at 0) … 2 (at/over cap). */
export function comboMult(combo: number): number {
  return 1 + Math.min(combo, COMBO_CAP) * COMBO_STEP;
}

/** Effective crit chance given a tier/gear bonus, hard-capped at `CRIT_CHANCE_CAP`. */
export function critChance(bonus = 0): number {
  return Math.min(CRIT_CHANCE + Math.max(0, bonus), CRIT_CHANCE_CAP);
}

/** Effective crit multiplier given a tier/gear bonus (uncapped — the endless lever). */
export function critMult(bonus = 0): number {
  return CRIT_MULT + Math.max(0, bonus);
}

/** Did this click crit? Pure over an already-drawn RNG float in [0, 1). */
export function rollCrit(rngFloat: number, chance: number = CRIT_CHANCE): boolean {
  return rngFloat < chance;
}

/**
 * Multiplicative bonus for a click landed on the beat (§4.2.3): `ON_BEAT_MULT`
 * plus a gear/tier `bonus` (Neon-Ninja stars raise ×1.5 → ×1.6 per ⭐). Off-beat
 * clicks always ×1. `bonus` defaults to 0 so existing callers are unaffected.
 */
export function beatBonus(onBeat: boolean, bonus = 0): number {
  return onBeat ? ON_BEAT_MULT + Math.max(0, bonus) : 1;
}

/** Instantaneous choreography phase velocity (phase-units/sec) for a given drive. */
export function phaseVelocity(drive: number): number {
  return PHASE_RATE_BASE * (1 + Math.max(0, drive) * PHASE_RATE_DRIVE);
}

/** The on-beat detection window in ms, widened by a tier bonus (Tier 4 = +40 ms). */
export function beatWindowMs(bonusMs = 0): number {
  return ON_BEAT_WINDOW_MS + Math.max(0, bonusMs);
}

/**
 * Is a click at choreography `phase` on the beat? Beat onsets fall on integer
 * multiples of `BEAT_PERIOD_PHASE` in phase-space; the time-distance to the
 * nearest onset (phase-distance ÷ phase-velocity) must be within `windowMs`.
 * Pure & deterministic: tests inject `phase` + `phasePerSecond` directly.
 */
export function isOnBeat(
  phase: number,
  phasePerSecond: number,
  windowMs: number = ON_BEAT_WINDOW_MS,
): boolean {
  if (!Number.isFinite(phase) || !(phasePerSecond > 0) || windowMs < 0) return false;
  const period = BEAT_PERIOD_PHASE;
  const nearest = Math.round(phase / period) * period;
  const distMs = (Math.abs(phase - nearest) / phasePerSecond) * 1000;
  return distMs <= windowMs;
}

/** Inputs to the click pipeline. */
export interface ClickCtx {
  /** Base click damage (`clickDamageOf(state)` — already includes soulMult). */
  baseClick: number;
  /** Current combo stack count. */
  combo: number;
  /** Whether this click rolled a crit (see `rollCrit`). */
  crit: boolean;
  /**
   * Extra crit multiplier from combo-tier / gear perks, added to `CRIT_MULT`
   * (only applied when `crit`). Tier 4 adds +0.25 here (spec §4.2.2).
   */
  critMultBonus?: number;
  /**
   * Product of every remaining multiplicative factor (beat, frenzy, gear, event…).
   * Defaults to 1; M8+ multiplies its own factors in here without touching callers.
   */
  extraMult?: number;
}

/** The effective damage of one click. */
export function effectiveClick(ctx: ClickCtx): number {
  const { baseClick, combo, crit, critMultBonus = 0, extraMult = 1 } = ctx;
  const cm = crit ? critMult(critMultBonus) : 1;
  return baseClick * comboMult(combo) * cm * extraMult;
}
