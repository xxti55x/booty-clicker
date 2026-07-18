/**
 * Haptic feedback (spec §8.8). Feature-detected (`navigator.vibrate`), throttled
 * to ≤ 10×/s so a fast clicker can never buzz the motor to death, and a no-op on
 * iOS / unsupported browsers. The throttle is pure over an injected clock, and
 * the vibrate function is injectable, so the gate is unit-tested without a DOM.
 */

/** Click buzz length (ms). */
export const HAPTIC_CLICK_MS = 8;
/** Crit buzz length (ms). */
export const HAPTIC_CRIT_MS = 35;
/** Boss-kill / jackpot pattern (ms on/off/on…). */
export const HAPTIC_BOSS_PATTERN: readonly number[] = [20, 30, 60];
/** Minimum gap between click/crit pulses (⇒ ≤ 10 pulses/s). */
export const HAPTIC_MIN_GAP_MS = 100;

type VibrateFn = (pattern: number | number[]) => void;

function detectVibrate(): VibrateFn | null {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  return nav && typeof nav.vibrate === 'function' ? nav.vibrate.bind(nav) : null;
}

export class Haptics {
  private last = -Infinity;
  private readonly vibrate: VibrateFn | null;

  /** Pass a vibrate fn (or null) for tests; omit to feature-detect. */
  constructor(vibrate: VibrateFn | null = detectVibrate()) {
    this.vibrate = vibrate;
  }

  get supported(): boolean {
    return this.vibrate !== null;
  }

  /** A click pulse (35 ms on a crit, else 8 ms), throttled to ≤ 10×/s. */
  pulse(now: number, enabled: boolean, crit: boolean): void {
    if (!enabled || !this.vibrate) return;
    if (now - this.last < HAPTIC_MIN_GAP_MS) return;
    this.last = now;
    this.vibrate(crit ? HAPTIC_CRIT_MS : HAPTIC_CLICK_MS);
  }

  /** The boss-kill pattern — rare, so not throttled. */
  boss(enabled: boolean): void {
    if (!enabled || !this.vibrate) return;
    this.vibrate([...HAPTIC_BOSS_PATTERN]);
  }
}
