/**
 * Frame pacing for the optional FPS cap (spec §5 M6). Pure so it can be unit
 * tested without a render loop. `fpsCap <= 0` means uncapped (always due).
 */
export function frameDue(nowMs: number, lastRenderMs: number, fpsCap: number): boolean {
  if (fpsCap <= 0) return true;
  // Sub-ms slack so a 60 Hz display isn't unfairly throttled to 59 at a 60 cap.
  return nowMs - lastRenderMs >= 1000 / fpsCap - 0.5;
}
