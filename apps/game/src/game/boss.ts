/**
 * Boss fight — pure state machine (spec §5 M2: Goldener Twerk-Tyrann).
 *
 * A 90-second burst-DPS check. Each click deals `perClick * mult` damage
 * (spec: "Klick-DPS = perClick-Skalierung"). HP is a fixed pool calibrated to
 * the player's expected click power at the ~50k-BP unlock (perClick·mult ≈ 260,
 * so ~75k HP is a close fight at a brisk click cadence). Losing eases the next
 * attempt's HP by 25%, so the fight is always eventually winnable.
 *
 * No DOM, no randomness — fully unit-testable.
 */

/** Boss HP at the first attempt. */
export const BOSS_MAX_HP = 75_000;
/** Seconds on the fight timer. */
export const BOSS_TIME_S = 90;
/** Each lost attempt multiplies HP by this (25% easing). */
export const BOSS_RETRY_EASING = 0.75;

export type BossStatus = 'fighting' | 'won' | 'lost';

export interface BossState {
  maxHp: number;
  hp: number;
  /** Seconds remaining. */
  timeLeft: number;
  status: BossStatus;
  /** 0-based attempt index; higher attempts start with eased HP. */
  attempt: number;
}

/** HP pool for a given attempt (attempt 0 = full, then 25% easier each retry). */
export function bossMaxHpForAttempt(attempt: number): number {
  return BOSS_MAX_HP * Math.pow(BOSS_RETRY_EASING, Math.max(0, attempt));
}

/** Start (or retry) the fight. */
export function createBoss(attempt = 0): BossState {
  const maxHp = bossMaxHpForAttempt(attempt);
  return { maxHp, hp: maxHp, timeLeft: BOSS_TIME_S, status: 'fighting', attempt };
}

/** Apply one click's damage; returns the damage dealt. No-op once resolved. */
export function bossHit(boss: BossState, perClick: number, mult: number): number {
  if (boss.status !== 'fighting') return 0;
  const dmg = Math.max(0, perClick * mult);
  boss.hp = Math.max(0, boss.hp - dmg);
  if (boss.hp <= 0) boss.status = 'won';
  return dmg;
}

/** Advance the countdown by `dt` seconds; a timeout with HP left is a loss. */
export function bossTick(boss: BossState, dt: number): void {
  if (boss.status !== 'fighting') return;
  boss.timeLeft = Math.max(0, boss.timeLeft - dt);
  if (boss.timeLeft <= 0 && boss.hp > 0) boss.status = 'lost';
}

/** Remaining HP as a 0..1 fraction (for the HP bar). */
export function bossHpFraction(boss: BossState): number {
  return boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
}
