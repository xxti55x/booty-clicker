/**
 * Random event — "Goldener Pfirsich" (spec §5 M4). Pure timing helpers so the
 * schedule is testable and can be persisted (AC: "Event-Timing im Save
 * persistiert"). The save stores `nextPeachAt` and `boostUntil` as epoch ms.
 */

/** Earliest / latest gap between peaches (seconds). */
export const PEACH_MIN_S = 90;
export const PEACH_MAX_S = 240;
/** How long a peach stays clickable (seconds). */
export const PEACH_VISIBLE_S = 8;
/** Income-boost duration once caught (seconds). */
export const BOOST_S = 60;
/** Income multiplier while the boost is active. */
export const PEACH_BOOST = 3;

/** Epoch ms for the next peach: now + a random 90–240 s. */
export function rollNextPeachAt(now: number, rand: () => number = Math.random): number {
  const delayS = PEACH_MIN_S + rand() * (PEACH_MAX_S - PEACH_MIN_S);
  return now + delayS * 1000;
}

/** Epoch ms until which the boost runs after catching a peach. */
export function activateBoost(now: number): number {
  return now + BOOST_S * 1000;
}

export function boostActive(boostUntil: number, now: number): boolean {
  return boostUntil > now;
}

/** Income multiplier from the peach boost (×3 while active, else ×1). */
export function incomeMultiplier(boostUntil: number, now: number): number {
  return boostActive(boostUntil, now) ? PEACH_BOOST : 1;
}
