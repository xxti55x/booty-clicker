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

/**
 * Ein 16-Schritt-Muster in HALBTÖNEN über dem Grundton; `null` ist eine Pause.
 * Genau das unterscheidet einen SONG von einem Generator: vorher lief die Melodie
 * als reiner Skalen-Durchlauf (`scale[step % scale.length]`) und klang auf jeder
 * Bühne nach derselben Übung. Jetzt trägt jedes Theme ein eigenes Riff, das man
 * nach zwei Takten wiedererkennt.
 */
export type Pattern = readonly (number | null)[];

/** Länge jedes Musters — ein Takt des 16tel-Rasters, in dem der Loop läuft. */
export const PATTERN_STEPS = 16;

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
  /** Der Melodie-Hook (16 Schritte, Halbtöne über `rootHz`, `null` = Pause). */
  hook: Pattern;
  /** Die Bassfigur (16 Schritte, Halbtöne über `rootHz / 2`). */
  bass: Pattern;
  /**
   * Verstimmung der Doppel-Stimme des Leads in Cent. Zwei minimal
   * gegeneinander verstimmte Oszillatoren schweben — das ist der Unterschied
   * zwischen „ein Ton" und „ein Sound". 0 lässt den Lead schlank.
   */
  detune: number;
  /**
   * Grundfarbe des Lead-Tiefpasses in Hz. Klein = dumpf und untergründig,
   * groß = offen und vorn. Der Filter atmet zusätzlich mit der Songstruktur
   * (Build öffnet, Breakdown schließt).
   */
  cutoff: number;
}

// Techno-Umbau: jede Bühne ein Subgenre, Moll-Farben bleiben Theme-eigen.
// Jeder Track trägt jetzt EINEN wiedererkennbaren Hook — die Muster sind so
// geschrieben, dass man sie liest wie eine Klaviatur: Zahl = Halbton, `n` = Pause.
const n = null;

export const MUSIC_TRACKS: Record<BackgroundKey, TrackConfig> = {
  // Club = Bounce: 128 BPM, der Donk hüpft zwischen den Kicks. Der Hook ist ein
  // frecher Moll-Sprung mit Synkope auf der „und" — Discokugel-Musik.
  club: {
    bpm: 128,
    rootHz: 110,
    scale: [0, 3, 5, 7, 10, 12],
    wave: 'sawtooth',
    ekstase: 'stab',
    genre: 'bounce',
    hook: [12, n, 10, 12, n, 7, n, 10, 12, n, 15, n, 14, n, 12, 10],
    bass: [0, n, n, 0, n, n, 7, n, 0, n, n, 0, n, 10, n, 7],
    detune: 9,
    cutoff: 2100,
  },
  // Synth = Trance: 138 BPM, rollender Achtel-Bass unterm Doppel-Arp. Der Hook
  // ist die klassische aufsteigende Trance-Linie, die sich in der zweiten
  // Takthälfte überschlägt.
  synth: {
    bpm: 138,
    rootHz: 98,
    scale: [0, 2, 3, 7, 8, 10],
    wave: 'sawtooth',
    ekstase: 'arp',
    genre: 'trance',
    hook: [12, 15, 19, 15, n, 15, 19, 22, 24, n, 22, 19, 15, n, 12, 10],
    bass: [0, 0, n, 0, 0, n, 0, 0, n, 0, 0, n, 3, n, 0, n],
    detune: 16,
    cutoff: 2600,
  },
  // Beach = Sunset-House: 122 BPM, offene Hats, warme Dur-Farbe bleibt. Der
  // Hook schaukelt wie eine Steel-Drum-Figur zur blauen Stunde.
  beach: {
    bpm: 122,
    rootHz: 130.81,
    scale: [0, 2, 4, 7, 9, 12],
    wave: 'triangle',
    ekstase: 'steel',
    genre: 'house',
    hook: [7, n, 9, 12, n, 9, 7, n, 4, n, 7, 9, n, 12, n, 7],
    bass: [0, n, n, n, 7, n, n, n, 5, n, n, n, 4, n, 2, n],
    detune: 6,
    cutoff: 1700,
  },
  // Space = Dark Hardtechno: 145 BPM, Doppel-Kick, dunkles Moll tief unten. Der
  // Hook kreist eng um den Grundton — ein Signal aus dem Funkverkehr, kein Lied.
  space: {
    bpm: 145,
    rootHz: 82.41,
    scale: [0, 1, 3, 7, 8, 10],
    wave: 'sawtooth',
    ekstase: 'pad',
    genre: 'hardtechno',
    hook: [12, n, n, 13, n, 12, n, n, 10, n, 12, n, n, 8, n, 7],
    bass: [0, n, 0, n, 0, n, 0, n, 1, n, 1, n, 0, n, 0, n],
    detune: 22,
    cutoff: 1400,
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
  // Der Boss-Hook ist ein Alarm, kein Riff: Tritonus-Pendel (0 ⇒ 6), das sich
  // gegen Ende des Takts hochschraubt. Er soll drohen, nicht gefallen.
  hook: [12, n, 18, n, 12, n, 18, 19, 12, n, 18, n, 19, n, 20, 18],
  bass: [0, 0, n, 0, 1, n, 0, 0, 0, 0, n, 1, 0, n, 6, n],
  detune: 28,
  cutoff: 1200,
};
