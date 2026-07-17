/**
 * Beat detection — pure. Turns the choreography `phase` accumulator into
 * discrete beat onsets so the audio engine can clap in time (spec M3:
 * "Beat-Klatschen synchron zur Choreo-phase"). Beats speed up with `phase`,
 * which itself speeds up with the click "drive", so the rhythm intensifies as
 * the player shakes harder.
 */

/** Beats per unit of phase (~2 claps/s at rest, faster under drive). */
export const CLAPS_PER_PHASE = 0.9;

export class BeatTracker {
  private lastBeat = -Infinity;

  /** Returns true once each time `phase` advances into a new beat slot. */
  update(phase: number): boolean {
    const idx = Math.floor(phase * CLAPS_PER_PHASE);
    if (idx > this.lastBeat) {
      this.lastBeat = idx;
      return true;
    }
    return false;
  }

  reset(): void {
    this.lastBeat = -Infinity;
  }
}
