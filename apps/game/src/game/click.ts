/**
 * The pure click-math core (spec §4.1/§4.2.1) — moved out of `main.ts` (N2).
 *
 * `effectiveClick` is the single source of click-damage truth: base click damage
 * (already folding crew DPS + soulMult via `clickDamageOf`) times the combo
 * multiplier times the crit multiplier. It is written as an extensible pipeline
 * so later milestones can fold in beat / frenzy / gear / event factors (§4.1)
 * through `extraMult` without changing the call site's shape — today only
 * crit + combo are implemented.
 *
 * Balancing lives here as exported data, never as inline literals in the glue.
 * All crit rolls draw from the seedable RNG (`util/rng.ts`); this module only
 * consumes an already-drawn float so it stays pure and deterministically tested.
 */

/** Crit chance per click (spec §4.2.1 baseline — the pacing tables assume 20 %). */
export const CRIT_CHANCE = 0.2;
/** Crit damage multiplier (×5 → EV ×1.8 together with the 20 % chance). */
export const CRIT_MULT = 5;
/** Combo multiplier gained per stack (+2 %). */
export const COMBO_STEP = 0.02;
/** Stacks beyond this no longer raise the multiplier (cap ×2). */
export const COMBO_CAP = 50;
/** Seconds a combo survives without a click before it decays (hard-reset in M7). */
export const COMBO_WINDOW_S = 1.5;

/** Combo multiplier: 1 + min(combo, cap)·step ⇒ 1 (at 0) … 2 (at/over cap). */
export function comboMult(combo: number): number {
  return 1 + Math.min(combo, COMBO_CAP) * COMBO_STEP;
}

/** Did this click crit? Pure over an already-drawn RNG float in [0, 1). */
export function rollCrit(rngFloat: number, chance: number = CRIT_CHANCE): boolean {
  return rngFloat < chance;
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
   * Product of every future multiplicative factor (beat, frenzy, gear, event…).
   * Defaults to 1 so today's pipeline is crit + combo only; M8+ multiplies its
   * own factors in here without touching callers.
   */
  extraMult?: number;
}

/** The effective damage of one click. */
export function effectiveClick(ctx: ClickCtx): number {
  const { baseClick, combo, crit, extraMult = 1 } = ctx;
  return baseClick * comboMult(combo) * (crit ? CRIT_MULT : 1) * extraMult;
}
