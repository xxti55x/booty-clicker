/**
 * Combo 2.0 — pure engine (spec §4.2.2). Replaces the WIP glue's linear counter
 * with a hard reset (N6). The raw multiplier is unchanged (cap ×2 at 50 stacks,
 * so the measured balance in §4.8 holds); on top of it sit named **tiers** with
 * extra crit/beat perks, and a **soft-decay** so a shop grab costs momentum, not
 * the whole combo.
 *
 * `comboMult` / `COMBO_CAP` / `COMBO_STEP` / `COMBO_WINDOW_S` keep their single
 * source in `click.ts` and are re-exported for a complete combo API. All the new
 * logic (stacking, decay, tiers, perks) is pure and unit-tested; the glue only
 * calls in.
 */
import { COMBO_CAP, COMBO_STEP, COMBO_WINDOW_S, comboMult } from './click';

export { COMBO_CAP, COMBO_STEP, COMBO_WINDOW_S, comboMult };

/** Extra stacks a click grants when it lands on the beat (§4.2.3 → total +2). */
export const ON_BEAT_COMBO_BONUS = 1;

/** Soft-decay: fraction of stacks lost per second once the window has elapsed. */
export const COMBO_DECAY_PER_S = 0.2;
/** …but at least this many stacks per second (so small combos still bleed off). */
export const COMBO_DECAY_MIN_PER_S = 1;

/**
 * Runtime combo state. Only `stacks` is persisted (CH-save v3, spec §9.2.1);
 * `window` is the transient no-decay grace timer kept in the loop.
 */
export interface ComboState {
  /** Current combo stacks (persisted). */
  stacks: number;
  /** Seconds left in the no-decay grace window (runtime only). */
  window: number;
}

/** A combo state seeded from a persisted stack count (window starts empty). */
export function createCombo(stacks = 0): ComboState {
  return { stacks: Math.max(0, stacks), window: 0 };
}

/**
 * A click adds +1 stack (+1 more on the beat, so an on-beat click is +2) and
 * refreshes the grace window. `windowS` defaults to `COMBO_WINDOW_S`; Wackelias
 * (§4.6) widens it, so the caller passes an extended window.
 */
export function comboOnClick(
  state: ComboState,
  onBeat: boolean,
  windowS: number = COMBO_WINDOW_S,
): ComboState {
  return {
    stacks: state.stacks + 1 + (onBeat ? ON_BEAT_COMBO_BONUS : 0),
    window: windowS,
  };
}

/**
 * Pure soft-decay (spec §4.2.2): losing `COMBO_DECAY_PER_S` of the stacks per
 * second, but never fewer than `COMBO_DECAY_MIN_PER_S` per second, floored at 0.
 * Modelled continuously so it is frame-rate independent: an exponential regime
 * (base `1 − rate`) while the 20 % loss exceeds the floor (stacks > 5), then a
 * linear −1/s regime below. Never a hard reset.
 *
 * `reduction` (0…1, e.g. Showmaster stars −4 %/⭐) scales BOTH decay rates down by
 * `(1 − reduction)`, so the shape (and the stacks-5 threshold, their ratio) is
 * preserved and a fully-immune combo (reduction ≥ 1) simply never bleeds. Defaults
 * to 0 so existing callers are unaffected.
 */
export function decay(stacks: number, seconds: number, reduction = 0): number {
  if (!(stacks > 0) || !(seconds > 0)) return Math.max(0, stacks);
  const scale = 1 - Math.max(0, Math.min(1, reduction));
  const perS = COMBO_DECAY_PER_S * scale; // 0.2·scale
  const minPerS = COMBO_DECAY_MIN_PER_S * scale; // 1·scale
  if (perS <= 0) return stacks; // reduction ≥ 1 ⇒ no decay
  const base = 1 - perS;
  const threshold = minPerS / perS; // 5 (scale cancels)
  let s = stacks;
  let t = seconds;
  if (s > threshold) {
    // Exponential decay s·base^t, but only until s reaches the floor threshold.
    const tToThreshold = Math.log(threshold / s) / Math.log(base);
    if (t <= tToThreshold) return s * Math.pow(base, t);
    s = threshold;
    t -= tToThreshold;
  }
  return Math.max(0, s - minPerS * t);
}

/**
 * Advance the combo by `dt` seconds: spend the grace window first; any time
 * beyond it soft-decays the stacks (scaled down by `decayReduction`, e.g. from
 * Showmaster stars). Pure — the glue keeps no combo timer of its own. `decayReduction`
 * defaults to 0 so existing callers are unaffected.
 */
export function comboStep(state: ComboState, dt: number, decayReduction = 0): ComboState {
  if (!(dt > 0)) return state;
  const window = state.window - dt;
  if (window >= 0) return { stacks: state.stacks, window };
  return { stacks: decay(state.stacks, -window, decayReduction), window: 0 };
}

/**
 * A named combo tier and its perks (spec §4.2.2). Bonuses are **absolute at that
 * tier** (not cumulative), so `tierCritChanceBonus(2) = 0.03`, `(3) = 0.06`, and
 * Tier 4 keeps the +6 % chance while adding +25 % crit mult and +40 ms beat.
 */
export interface ComboTierConfig {
  readonly tier: number;
  readonly minStacks: number;
  readonly name: string;
  /** Added to `CRIT_CHANCE` (before the 40 % cap). */
  readonly critChanceBonus: number;
  /** Added to `CRIT_MULT` on a crit. */
  readonly critMultBonus: number;
  /** Widens the on-beat window by this many ms. */
  readonly beatWindowBonusMs: number;
}

export const COMBO_TIERS: readonly ComboTierConfig[] = [
  {
    tier: 1,
    minStacks: 10,
    name: 'Warm',
    critChanceBonus: 0,
    critMultBonus: 0,
    beatWindowBonusMs: 0,
  },
  {
    tier: 2,
    minStacks: 25,
    name: 'Heiß',
    critChanceBonus: 0.03,
    critMultBonus: 0,
    beatWindowBonusMs: 0,
  },
  {
    tier: 3,
    minStacks: 50,
    name: 'Feuer',
    critChanceBonus: 0.06,
    critMultBonus: 0,
    beatWindowBonusMs: 0,
  },
  {
    tier: 4,
    minStacks: 100,
    name: 'Inferno',
    critChanceBonus: 0.06,
    critMultBonus: 0.25,
    beatWindowBonusMs: 40,
  },
];

/** The tier (0…4) for a stack count. 0 below the first threshold (10). */
export function comboTier(stacks: number): number {
  let tier = 0;
  for (const t of COMBO_TIERS) if (stacks >= t.minStacks) tier = t.tier;
  return tier;
}

function tierConfig(tier: number): ComboTierConfig | undefined {
  return COMBO_TIERS.find((t) => t.tier === tier);
}

/** Display name for a tier ('' for tier 0). */
export function comboTierName(tier: number): string {
  return tierConfig(tier)?.name ?? '';
}

/** Crit-chance bonus (added to `CRIT_CHANCE`) at a combo tier. */
export function tierCritChanceBonus(tier: number): number {
  return tierConfig(tier)?.critChanceBonus ?? 0;
}

/** Crit-multiplier bonus (added to `CRIT_MULT`) at a combo tier. */
export function tierCritMultBonus(tier: number): number {
  return tierConfig(tier)?.critMultBonus ?? 0;
}

/** On-beat window widening (ms) at a combo tier. */
export function tierBeatWindowBonusMs(tier: number): number {
  return tierConfig(tier)?.beatWindowBonusMs ?? 0;
}
