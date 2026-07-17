import type { BackgroundKey } from '../types';

/**
 * Per-background generative music config (spec M3: "1 Loop-Track pro Kulisse").
 * Tracks are synthesised procedurally from these settings — no audio files —
 * so the bundle stays tiny and licence-clean (see public/CREDITS.md).
 */
export interface TrackConfig {
  /** Tempo in beats per minute. */
  bpm: number;
  /** Root note frequency (Hz). */
  rootHz: number;
  /** Semitone offsets forming the loop's arpeggio/scale. */
  scale: readonly number[];
  /** Oscillator timbre for the melodic voices. */
  wave: OscillatorType;
}

// Minor pentatonic / natural-minor flavours per stage mood.
export const MUSIC_TRACKS: Record<BackgroundKey, TrackConfig> = {
  club: { bpm: 124, rootHz: 110, scale: [0, 3, 5, 7, 10, 12], wave: 'sawtooth' },
  synth: { bpm: 112, rootHz: 98, scale: [0, 2, 3, 7, 8, 10], wave: 'square' },
  beach: { bpm: 96, rootHz: 130.81, scale: [0, 2, 4, 7, 9, 12], wave: 'triangle' },
  space: { bpm: 84, rootHz: 82.41, scale: [0, 3, 7, 10, 12, 15], wave: 'sine' },
};
