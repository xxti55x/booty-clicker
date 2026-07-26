import type { BackgroundKey } from '../types';

/**
 * Per-background generative music config (spec M3: "1 Loop-Track pro Kulisse").
 * Tracks are synthesised procedurally from these settings — no audio files —
 * so the bundle stays tiny and licence-clean (see public/CREDITS.md).
 */
/**
 * ROADMAP-V2 X5: Die ZWEITE Instrumenten-Lage, die NUR im Ekstase-Fenster
 * mitspielt — eine je Theme, damit das Fenster überall nach der eigenen Insel
 * klingt statt nach einem generischen Aufsatz:
 *
 *  · `stab`  — Club: kurze, synkopierte Akkord-Stiche auf den Off-Beats (funky).
 *  · `arp`   — Synth: schnelles Sechzehntel-Arpeggio, leicht verstimmt.
 *  · `steel` — Beach: Steel-Drum-artige Partialtöne (inharmonisch, weich).
 *  · `pad`   — Space: langes, atmendes Pad im Achttakt.
 *
 * Sie hängt an der Ekstase, NICHT an der Combo-Intensität: Stufe 3 erreicht man
 * auch mit einer heißen Combo, das Fenster soll aber sein eigenes Signal haben.
 */
export type EkstaseLayer = 'stab' | 'arp' | 'steel' | 'pad';

export interface TrackConfig {
  /** Tempo in beats per minute. */
  bpm: number;
  /** Root note frequency (Hz). */
  rootHz: number;
  /** Semitone offsets forming the loop's arpeggio/scale. */
  scale: readonly number[];
  /** Oscillator timbre for the melodic voices. */
  wave: OscillatorType;
  /** ROADMAP-V2 X5: Zusatz-Stimme im Ekstase-Fenster (Theme-eigen). */
  ekstase: EkstaseLayer;
}

// Minor pentatonic / natural-minor flavours per stage mood.
export const MUSIC_TRACKS: Record<BackgroundKey, TrackConfig> = {
  club: { bpm: 124, rootHz: 110, scale: [0, 3, 5, 7, 10, 12], wave: 'sawtooth', ekstase: 'stab' },
  synth: { bpm: 112, rootHz: 98, scale: [0, 2, 3, 7, 8, 10], wave: 'square', ekstase: 'arp' },
  beach: {
    bpm: 96,
    rootHz: 130.81,
    scale: [0, 2, 4, 7, 9, 12],
    wave: 'triangle',
    ekstase: 'steel',
  },
  space: { bpm: 84, rootHz: 82.41, scale: [0, 3, 7, 10, 12, 15], wave: 'sine', ekstase: 'pad' },
};
