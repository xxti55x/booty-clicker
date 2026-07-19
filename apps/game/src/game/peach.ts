/**
 * Golden-Peach pure logic (spec §6.1, M12) — the Goldener Pfirsich returns as a
 * random event. This is a FRESH module (the legacy `events.ts` stays frozen); it
 * differs from the legacy version in one important way: every roll draws from the
 * seedable `Rng` (§9.4) instead of `Math.random`, so the peach schedule and its
 * 🔑-drop are deterministic + save-scum-proof once part 2 persists the RNG cursor.
 *
 * Pure timing + effect helpers only: `rollNextPeachAt` schedules the next spawn in
 * a documented window, `activateBoost`/`incomeMultiplier` model the ×3 income boost
 * for 60 s, and `peachKeyRoll` is the 25 % → 1 🔑 chance (§6.1). Part 2/3 wire the
 * on-screen button, the boost into the loop, and the key into the inventory.
 */
import { Rng } from '../util/rng';

/** Earliest gap between peaches (seconds) — the documented spawn window. */
export const PEACH_MIN_S = 90;
/** Latest gap between peaches (seconds). */
export const PEACH_MAX_S = 240;
/** How long a peach stays clickable once spawned (seconds). */
export const PEACH_VISIBLE_S = 8;
/** Income-boost multiplier while a caught peach's boost is active (v12 Goal-Nerf:
 * ×3 → ×2 — der Pfirsich war der dominante Beschleuniger der Gesamt-Progression). */
export const PEACH_BOOST = 2;
/** Boost duration once a peach is caught (seconds, §6.1). */
export const PEACH_BOOST_S = 60;
/** Chance a caught peach also drops a 🔑 (spec §6.1: 25 %). */
export const PEACH_KEY_CHANCE = 0.25;
/**
 * Hard ceiling on how far `boostUntil` may reach past `now` (24 h). Chest `boost`
 * rewards stack DURATION onto the single income window (§6.2), so a legit
 * `boostUntil` can lie far beyond the 60-s peach base — the forward-clock guard
 * must therefore CLAMP against this generous ceiling, never wipe anything past
 * `now + 60 s` (that would destroy an already-credited chest reward on reload).
 * The same ceiling caps duration-stacking at credit time, so a saved window is
 * always ≤ 24 h ahead and a set-clock-forward exploit is bounded by the same 24 h.
 */
export const BOOST_MAX_AHEAD_MS = 24 * 3600 * 1000;

/**
 * Clamp a persisted/credited boost end so it never reaches further than
 * `now + BOOST_MAX_AHEAD_MS` (and never below 0). Identity for every legit value —
 * only an absurd-future timestamp (clock set forward, then back) or an over-stacked
 * window is clipped. Pure; used by the boot repair AND the reward-credit glue.
 */
export function clampBoostUntil(boostUntil: number, now: number): number {
  return Math.max(0, Math.min(boostUntil, now + BOOST_MAX_AHEAD_MS));
}

/**
 * Epoch-ms for the next peach: `now` + a random `PEACH_MIN_S..PEACH_MAX_S` seconds,
 * drawn from the injected `rng` (§9.4). Pure over `(now, rng-state)`; advances the
 * cursor by one draw.
 */
export function rollNextPeachAt(now: number, rng: Rng): number {
  const delayS = PEACH_MIN_S + rng.next() * (PEACH_MAX_S - PEACH_MIN_S);
  return now + delayS * 1000;
}

/** Epoch-ms until which the ×3 boost runs after catching a peach at `now`. */
export function activateBoost(now: number): number {
  return now + PEACH_BOOST_S * 1000;
}

/** Whether the peach boost is still active at `now`. */
export function boostActive(boostUntil: number, now: number): boolean {
  return boostUntil > now;
}

/** Income multiplier from the peach boost (×3 while active, else ×1). */
export function incomeMultiplier(boostUntil: number, now: number): number {
  return boostActive(boostUntil, now) ? PEACH_BOOST : 1;
}

/**
 * The 🔑 a caught peach drops (spec §6.1): 25 % → 1 key, else 0. Draws one float
 * from the injected `rng` so it is deterministic + save-scum-proof. Returns the key
 * count (0 or 1) so the caller can credit it directly.
 */
export function peachKeyRoll(rng: Rng): number {
  return rng.next() < PEACH_KEY_CHANCE ? 1 : 0;
}
