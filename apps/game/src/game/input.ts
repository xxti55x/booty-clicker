/**
 * Pointer tap detection (spec §5 M6 mobile). A shake is a quick, near-stationary
 * press/release; anything longer or draggier is an orbit-camera gesture and must
 * NOT count as a shake. Pure so the thresholds are unit tested.
 */

/** Max Manhattan travel (px) between pointerdown and pointerup to still be a tap. */
export const TAP_MAX_DIST = 10;
/** Max press duration (ms) to still be a tap. */
export const TAP_MAX_MS = 500;

export function isTap(distancePx: number, durationMs: number): boolean {
  return distancePx <= TAP_MAX_DIST && durationMs <= TAP_MAX_MS;
}
