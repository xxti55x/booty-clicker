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
 * Techno-Subgenre des Grooves. Das Genre entscheidet in `engine.scheduleStep`
 * über Kick-Muster, Bass-Verhalten und Hat-Dichte — die Melodie-Seite (Skala,
 * Hooks, Wave) bleibt Theme-eigen:
 *
 *  · `schranz`  — Club: die harte Berliner Schule. Kick auf jedem Achtel mit
 *    Verzerr-Transiente, rollende Tom-Figuren, Offbeat-Hats. Kein Gesang, kein
 *    Gefühl, nur Druck.
 *  · `bleep`    — Synth: früher Berlin/Warp-Techno. Tiefer Sinus-Sub trägt
 *    alles, darüber sparsame kurze Bleeps; die Lücken sind Teil der Musik.
 *  · `bounce`   — Beach: Four-on-the-floor mit dem harten Offbeat-„Donk"
 *    dazwischen, der den Körper vorwärts kippt.
 *  · `trance`   — Space: rollender Sechzehntel-Bass unter einem hypnotischen
 *    Arpeggio, lange Steigerungen.
 *  · `hardcore` — die Boss-Eskalation: Kick-Wand ohne Verschnaufpause.
 */
export type TechnoGenre = 'schranz' | 'bleep' | 'bounce' | 'trance' | 'hardcore';

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

/**
 * Ein Abschnitt des Songs. Erst diese Liste macht aus einer Schleife ein STÜCK:
 * Vorher lief ein Achttakter endlos durch, und nach einer halben Minute hatte
 * man alles gehört. Jetzt zieht sich ein Track über {@link SONG_BARS} Takte mit
 * eigenen Teilen — Intro, zwei A-Teile, Breakdown, Drop, zwei B-Teile, Ausklang.
 */
export interface SongSection {
  /** Länge in Takten. */
  readonly bars: number;
  /** Index in {@link TrackConfig.hooks} — welche Melodie hier läuft. */
  readonly hook: number;
  /** Index in {@link TrackConfig.basses}. */
  readonly bass: number;
  /** `full` = alles, `light` = ohne Kick (Breakdown), `none` = nur Melodie. */
  readonly drums: 'full' | 'light' | 'none';
  /** Läuft der Lead zusätzlich eine Oktave höher? (Der Drop tut es.) */
  readonly octave: boolean;
  /** Filter-Öffnung: 1 = Grundfarbe, >1 heller/offener. */
  readonly open: number;
  /** Läuft in diesem Abschnitt ein Rausch-Anstieg auf den nächsten zu? */
  readonly riser?: boolean;
}

/**
 * Die Standard-Dramaturgie, die alle vier Themes teilen. Die INHALTE (Hooks,
 * Bässe, Genre-Groove) unterscheiden sich, der Spannungsbogen nicht: Er ist die
 * Form, in der Techno seit jeher erzählt wird.
 *
 * **Zur Einheit `bars`:** Ein Eintrag zählt Durchläufe des 16-Schritt-Rasters.
 * Ein Schritt ist eine ACHTEL (`engine`: `60 / bpm / 2`), ein Durchlauf also
 * zwei 4/4-Takte. Die 64 Einheiten der Form entsprechen damit 128 Takten
 * Musik — bei 126–164 BPM sind das 3:07 bis 4:04 je Stück. Deutlich mehr als
 * die geforderte Mindestlänge, und in dieser Zeit wiederholt sich kein Teil
 * unverändert.
 */
export const SONG_FORM: readonly SongSection[] = [
  { bars: 8, hook: 0, bass: 0, drums: 'light', octave: false, open: 0.75 }, // Intro
  { bars: 8, hook: 0, bass: 0, drums: 'full', octave: false, open: 1 }, // A
  { bars: 8, hook: 1, bass: 0, drums: 'full', octave: false, open: 1.25 }, // A'
  { bars: 8, hook: 2, bass: 1, drums: 'none', octave: false, open: 0.6, riser: true }, // Breakdown
  { bars: 8, hook: 0, bass: 0, drums: 'full', octave: true, open: 2.1 }, // Drop
  { bars: 8, hook: 1, bass: 1, drums: 'full', octave: true, open: 1.7 }, // B
  { bars: 8, hook: 2, bass: 1, drums: 'full', octave: false, open: 1.35 }, // B'
  { bars: 8, hook: 0, bass: 0, drums: 'light', octave: false, open: 0.9 }, // Ausklang
];

/** Gesamtlänge der Form in 16-Schritt-Einheiten (Summe über {@link SONG_FORM}). */
export const SONG_BARS = SONG_FORM.reduce((n, s) => n + s.bars, 0);

/**
 * Spieldauer eines vollen Durchlaufs in Sekunden. Eine Einheit = 16 Achtel,
 * eine Achtel = `60 / bpm / 2` — daraus fällt die Länge direkt heraus.
 */
export function songSeconds(bpm: number): number {
  return SONG_BARS * 16 * (60 / bpm / 2);
}

/** Der Abschnitt, in dem Takt `bar` liegt (zyklisch über die ganze Form). */
export function sectionAt(bar: number): SongSection {
  const b = ((Math.floor(bar) % SONG_BARS) + SONG_BARS) % SONG_BARS;
  let acc = 0;
  for (const sec of SONG_FORM) {
    acc += sec.bars;
    if (b < acc) return sec;
  }
  return SONG_FORM[0]!;
}

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
  /**
   * DREI Melodie-Varianten (je 16 Schritte, Halbtöne über `rootHz`,
   * `null` = Pause). Die Song-Form ruft sie in wechselnder Reihenfolge auf —
   * daher klingt ein Durchlauf nicht wie derselbe Takt achtmal.
   */
  hooks: readonly Pattern[];
  /** Zwei Bassfiguren (16 Schritte, Halbtöne über `rootHz / 2`). */
  basses: readonly Pattern[];
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

// Vier Themes, vier echte Subgenres — die Zuordnung folgt dem Charakter der
// Bühne, nicht dem Zufall. Jeder Track trägt drei Melodie-Varianten und zwei
// Bassfiguren; die Song-Form (SONG_FORM) ordnet sie zu einem Stück.
const n = null;

export const MUSIC_TRACKS: Record<BackgroundKey, TrackConfig> = {
  // CLUB = SCHRANZ. Die harte Schule: 152 BPM, Kick auf jedem Achtel, Hook ist
  // kein Lied, sondern ein Stich — enge Halbton-Reibung, die sich einhämmert.
  club: {
    bpm: 152,
    rootHz: 103.83,
    scale: [0, 1, 5, 6, 7, 10],
    wave: 'sawtooth',
    ekstase: 'stab',
    genre: 'schranz',
    hooks: [
      [12, n, n, 12, n, 13, n, n, 12, n, n, 12, n, 10, n, n],
      [n, 12, n, 12, 17, n, 12, n, n, 12, n, 18, 17, n, 12, n],
      [19, n, 18, n, 17, n, 12, n, 19, n, 18, n, 13, n, 12, 10],
    ],
    basses: [
      [0, n, 0, n, 0, n, 0, n, 0, n, 0, n, 1, n, 0, n],
      [0, 0, n, 0, 0, n, 5, n, 0, 0, n, 0, 6, n, 5, n],
    ],
    detune: 24,
    cutoff: 1500,
  },
  // SYNTH = BLEEP-TECHNO (Berlin/Warp-Ära). 126 BPM, tiefer Sinus-Sub trägt
  // alles, darüber kurze, sparsame Bleeps. Die LÜCKEN sind hier die Musik —
  // deshalb hat jeder Hook mehr Pausen als Töne.
  synth: {
    bpm: 126,
    rootHz: 65.41,
    scale: [0, 3, 5, 7, 10, 12],
    wave: 'square',
    ekstase: 'arp',
    genre: 'bleep',
    hooks: [
      [24, n, n, n, 19, n, n, n, 24, n, n, 22, n, n, 19, n],
      [n, n, 24, n, n, 27, n, n, 24, n, n, n, 22, n, n, n],
      [19, n, n, 22, n, n, 24, n, n, 27, n, n, 29, n, 27, n],
    ],
    basses: [
      [0, n, n, n, n, n, n, n, 0, n, n, n, n, n, n, n],
      [0, n, n, n, 0, n, n, n, 3, n, n, n, 0, n, n, n],
    ],
    detune: 4,
    cutoff: 1200,
  },
  // BEACH = BOUNCE. 150 BPM, Four-on-the-floor mit dem harten Offbeat-Donk
  // dazwischen; die Melodie hüpft in Dur-Sprüngen mit, statt zu schweben.
  beach: {
    bpm: 150,
    rootHz: 116.54,
    scale: [0, 2, 4, 7, 9, 12],
    wave: 'sawtooth',
    ekstase: 'steel',
    genre: 'bounce',
    hooks: [
      [12, n, 16, n, 19, n, 16, n, 12, n, 16, n, 14, n, 12, n],
      [19, n, n, 19, 21, n, 19, n, 16, n, n, 16, 14, n, 12, n],
      [24, n, 21, n, 19, n, 16, n, 21, n, 19, n, 16, n, 12, n],
    ],
    basses: [
      [0, n, n, n, 0, n, n, n, 0, n, n, n, 0, n, n, n],
      [0, n, n, n, 7, n, n, n, 5, n, n, n, 4, n, 2, n],
    ],
    detune: 11,
    cutoff: 2200,
  },
  // SPACE = TRANCE (hypnotisch, hart). 148 BPM, rollender Sechzehntel-Bass
  // unter einem Arpeggio, das sich über die Form hochschraubt.
  space: {
    bpm: 148,
    rootHz: 73.42,
    scale: [0, 2, 3, 7, 8, 10],
    wave: 'sawtooth',
    ekstase: 'pad',
    genre: 'trance',
    hooks: [
      [12, 15, 19, 15, 12, 15, 19, 22, 24, n, 22, 19, 15, n, 12, 10],
      [19, n, 22, 19, 15, n, 19, 15, 12, n, 15, 19, 22, n, 24, n],
      [24, 22, 19, 22, 24, 27, 24, 22, 19, n, 15, 12, 15, n, 19, n],
    ],
    basses: [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 3, 3, 3, 3, 0, 0, 0, 0, 8, 8, 7, 7],
    ],
    detune: 18,
    cutoff: 2600,
  },
};

/**
 * Der Boss-Track (User-Auftrag „Boss extra hard"): Hardcore, 160 BPM,
 * Halbton-Pendel in tiefem Moll — läuft auf JEDER Boss-Bühne statt des
 * Theme-Tracks (`engine.setBossMode`), damit ein Gate sich sofort anders
 * anhört als Farmen.
 */
export const BOSS_TRACK: TrackConfig = {
  bpm: 164,
  rootHz: 61.74,
  scale: [0, 1, 0, 6, 0, 1, 0, 3],
  wave: 'sawtooth',
  ekstase: 'stab',
  genre: 'hardcore',
  // Der Boss-Hook ist ein Alarm, kein Riff: Tritonus-Pendel, das sich gegen
  // Ende hochschraubt. Er soll drohen, nicht gefallen.
  hooks: [
    [12, n, 18, n, 12, n, 18, 19, 12, n, 18, n, 19, n, 20, 18],
    [18, 19, 18, n, 12, n, 12, 13, 18, 19, 20, n, 19, n, 18, n],
    [24, n, 23, n, 22, n, 18, n, 19, n, 18, n, 13, n, 12, n],
  ],
  basses: [
    [0, 0, n, 0, 1, n, 0, 0, 0, 0, n, 1, 0, n, 6, n],
    [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 6, 6, 1, 1],
  ],
  detune: 30,
  cutoff: 1100,
};
