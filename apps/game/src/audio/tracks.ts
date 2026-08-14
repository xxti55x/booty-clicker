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

/**
 * Techno-Subgenre des Grooves (User-Auftrag „alle Theme-Songs Techno"): das
 * Genre entscheidet in `engine.scheduleStep` über Kick-Muster, Bass-Verhalten
 * und Hat-Dichte — die Melodie-Seite (Skala/Arp/Wave) bleibt Theme-eigen:
 *
 *  · `bounce`     — Four-on-the-floor + der Offbeat-„Donk"-Bass dazwischen.
 *  · `trance`     — rollender Bass auf jedem Achtel, Arp doppelt (verstimmt).
 *  · `house`      — Four-on-the-floor + offene Hats auf den Offbeats, warm.
 *  · `hardtechno` — treibende Doppel-Kick, dunkler Drone-Bass, Hats überall.
 *  · `hardcore`   — die Boss-Eskalation: Kick-Wand mit Verzerr-Transiente.
 */
export type TechnoGenre = 'bounce' | 'trance' | 'house' | 'hardtechno' | 'hardcore';

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
  /** Techno-Subgenre des Grund-Grooves. */
  genre: TechnoGenre;
}

// Techno-Umbau: jede Bühne ein Subgenre, Moll-Farben bleiben Theme-eigen.
export const MUSIC_TRACKS: Record<BackgroundKey, TrackConfig> = {
  // Club = Bounce: 128 BPM, der Donk hüpft zwischen den Kicks.
  club: {
    bpm: 128,
    rootHz: 110,
    scale: [0, 3, 5, 7, 10, 12],
    wave: 'sawtooth',
    ekstase: 'stab',
    genre: 'bounce',
  },
  // Synth = Trance: 138 BPM, rollender Achtel-Bass unterm Doppel-Arp.
  synth: {
    bpm: 138,
    rootHz: 98,
    scale: [0, 2, 3, 7, 8, 10],
    wave: 'square',
    ekstase: 'arp',
    genre: 'trance',
  },
  // Beach = Sunset-House: 122 BPM, offene Hats, warme Dur-Farbe bleibt.
  beach: {
    bpm: 122,
    rootHz: 130.81,
    scale: [0, 2, 4, 7, 9, 12],
    wave: 'triangle',
    ekstase: 'steel',
    genre: 'house',
  },
  // Space = Dark Hardtechno: 145 BPM, Doppel-Kick, dunkles Moll tief unten.
  space: {
    bpm: 145,
    rootHz: 82.41,
    scale: [0, 1, 3, 7, 8, 10],
    wave: 'sawtooth',
    ekstase: 'pad',
    genre: 'hardtechno',
  },
};

/**
 * Der Boss-Track (User-Auftrag „Boss extra hard"): Hardcore, 160 BPM,
 * Halbton-Pendel in tiefem Moll — läuft auf JEDER Boss-Bühne statt des
 * Theme-Tracks (`engine.setBossMode`), damit ein Gate sich sofort anders
 * anhört als Farmen.
 */
export const BOSS_TRACK: TrackConfig = {
  bpm: 160,
  rootHz: 73.42,
  scale: [0, 1, 0, 6, 0, 1, 0, 3],
  wave: 'sawtooth',
  ekstase: 'stab',
  genre: 'hardcore',
};
