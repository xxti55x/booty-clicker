/**
 * Twerk-Ekstase — pure active-ability core (spec §4.2.4, Cookie-Clicker's Click
 * Frenzy). A charge meter fills as you click; full ⇒ the player fires it (key `F`
 * / button) for a fixed window of ×10 click damage. All state is serializable and
 * persisted in CH-save v3 (§9.2.1); the glue only calls these pure functions.
 *
 * `cooldowns` is reserved for the later Himmelsbaum abilities (Beat-Drop /
 * Pfirsichregen, §4.2.4) — carried through the save now so no schema bump is
 * needed when they land.
 */

/** Charge needed to activate (meter runs 0…100). */
export const ABILITY_CHARGE_MAX = 100;
/** Charge gained per normal click. */
export const ABILITY_CHARGE_PER_CLICK = 1;
/** Charge gained per on-beat click. */
export const ABILITY_CHARGE_PER_ONBEAT = 2;
/** Ekstase (frenzy) duration in ms once activated. */
export const FRENZY_DURATION_MS = 12_000;
/** Click-damage multiplier while frenzy is active. */
export const FRENZY_MULT = 10;

/** The serializable ability state (CH-save v3). */
export interface AbilityState {
  /** Charge meter, 0…`ABILITY_CHARGE_MAX`. */
  charge: number;
  /** Epoch-ms the current frenzy ends at (frenzy active while `now < frenzyUntil`). */
  frenzyUntil: number;
  /** Reserved per-ability cooldown end times (epoch-ms) for future abilities. */
  cooldowns: Record<string, number>;
}

/** A fresh, empty ability state. */
export function createAbility(): AbilityState {
  return { charge: 0, frenzyUntil: 0, cooldowns: {} };
}

/** A click charges the meter (+1, or +2 on the beat), clamped at the max. */
export function abilityOnClick(state: AbilityState, onBeat: boolean): AbilityState {
  const gain = onBeat ? ABILITY_CHARGE_PER_ONBEAT : ABILITY_CHARGE_PER_CLICK;
  return { ...state, charge: Math.min(ABILITY_CHARGE_MAX, state.charge + gain) };
}

/**
 * Can Ekstase be fired? Full at `chargeMax` (default 100). Ekstasius (§4.6) lowers
 * the effective threshold, so the caller passes a reduced `chargeMax`.
 */
export function canActivate(state: AbilityState, chargeMax: number = ABILITY_CHARGE_MAX): boolean {
  return state.charge >= chargeMax;
}

/**
 * Fire Ekstase at `now`: open the frenzy window and reset the meter (no-op if not
 * charged to `chargeMax`). `durationMs` defaults to 12 s; Ekstase-Ausdauer (§4.5.2)
 * extends it.
 */
export function activate(
  state: AbilityState,
  now: number,
  chargeMax: number = ABILITY_CHARGE_MAX,
  durationMs: number = FRENZY_DURATION_MS,
): AbilityState {
  if (!canActivate(state, chargeMax)) return state;
  return { ...state, charge: 0, frenzyUntil: now + durationMs };
}

/** Whether the frenzy window is active at `now`. */
export function isFrenzyActive(state: AbilityState, now: number): boolean {
  return now < state.frenzyUntil;
}

/** Click-damage multiplier from Ekstase: `FRENZY_MULT` while active, else 1. */
export function frenzyMult(state: AbilityState, now: number): number {
  return isFrenzyActive(state, now) ? FRENZY_MULT : 1;
}

/** Meter fill fraction in [0, 1] (for the ability bar), full at `chargeMax`. */
export function chargeFraction(
  state: AbilityState,
  chargeMax: number = ABILITY_CHARGE_MAX,
): number {
  return Math.max(0, Math.min(1, state.charge / chargeMax));
}

/** Remaining-frenzy fraction in [0, 1] (for the active-window bar), 0 when idle. */
export function frenzyFraction(state: AbilityState, now: number): number {
  if (!isFrenzyActive(state, now)) return 0;
  return Math.max(0, Math.min(1, (state.frenzyUntil - now) / FRENZY_DURATION_MS));
}
