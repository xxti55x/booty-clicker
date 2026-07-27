/**
 * ROADMAP-V2 G4 — Der Katalog der Prestige-Zeremonien.
 *
 * Aszension, Himmelfahrt und Transzendenz wipen Stunden Fortschritt und waren
 * bis hierher ein Klick + Toast. Die Zeremonie ist die Antwort darauf — und sie
 * ist REIN OPTISCH: die Gutschrift passiert immer VOR der Blende (siehe die drei
 * Reset-Handler in `main.ts`), das Overlay zeigt also nur noch, was schon im
 * Konto steht. Deshalb lebt hier auch keine Zahl, die irgendetwas gewährt —
 * nur Dauer, Text, Sprite und Bewegung.
 *
 * Die drei müssen auf EINEN BLICK unterscheidbar sein. Getrennt wird deshalb
 * dreifach: Glyph (✨ / 🍑 / 🔮 — exakt die Währungs-Icons, die HUD, Toasts und
 * Panels schon benutzen), Bewegung (Regen vs. Implosion) und Dauer.
 */

/** Die drei Prestige-Schichten (L1/L2/L3). */
export type CeremonyKind = 'ascend' | 'himmelfahrt' | 'transcend';

/** Wie die Sprites laufen: Regen von oben oder Implosion zur Mitte. */
export type CeremonyMotion = 'rain' | 'implode';

export interface CeremonyConfig {
  readonly kind: CeremonyKind;
  /** Gesamtdauer der Blende in ms (Skip-Tap kürzt sie jederzeit ab). */
  readonly durationMs: number;
  /** Überschrift der Blende. */
  readonly title: string;
  /** Ein Satz darunter — was der Reset gerade gekostet und gebracht hat. */
  readonly sub: string;
  /** Glyph der gutgeschriebenen Währung (steht im Aufzähler UND als Sprite). */
  readonly glyph: string;
  /** Bewegung der Sprites. */
  readonly motion: CeremonyMotion;
  /** Sprite-Stückzahl bei voller Dichte (high-Preset). */
  readonly sprites: number;
}

/**
 * Aszension hell/aufsteigend, Himmelfahrt warm/groß, Transzendenz mystisch/tief
 * — dieselbe Dreiteilung tragen die Farben (CSS `.k-*`) und die Stinger
 * (`AudioEngine.ceremony`).
 */
export const CEREMONIES: Record<CeremonyKind, CeremonyConfig> = {
  ascend: {
    kind: 'ascend',
    durationMs: 1500,
    title: 'Aszension',
    sub: 'Deine Tour endet — der Ruhm bleibt.',
    glyph: '✨',
    motion: 'rain',
    sprites: 26,
  },
  himmelfahrt: {
    kind: 'himmelfahrt',
    durationMs: 2000,
    title: 'Himmelfahrt',
    sub: 'Ruhm, Ahnen und Tour fallen — die Pfirsiche bleiben für immer.',
    glyph: '🍑',
    motion: 'rain',
    sprites: 22,
  },
  transcend: {
    kind: 'transcend',
    durationMs: 2000,
    title: 'Transzendenz',
    sub: 'Alles kollabiert in einen Punkt — und beginnt größer von vorn.',
    glyph: '🔮',
    motion: 'implode',
    sprites: 30,
  },
};

/** Die Konfiguration einer Schicht (eine Quelle für UI, CSS-Klasse und Audio). */
export function ceremonyFor(kind: CeremonyKind): CeremonyConfig {
  return CEREMONIES[kind];
}

/**
 * Preset-Pflicht (ROADMAP-V2): die Sprite-Dichte hängt am selben `confetti`-Wert
 * wie der G2-Sieg-Wurf, skaliert gegen das high-Preset. `0` (low) heißt gar
 * keine Zeremonie — dort bleibt es beim Toast von früher, den `preset.cinematics`
 * schon abfängt; die Funktion gibt trotzdem sauber 0 zurück.
 */
export function ceremonySpriteCount(cfg: CeremonyConfig, confetti: number): number {
  if (!(confetti > 0)) return 0;
  const scale = Math.min(1, confetti / 130);
  return Math.max(6, Math.round(cfg.sprites * scale));
}

/** Anteil der Dauer, über den der Zahlen-Aufzähler läuft (danach steht er). */
export const COUNT_RAMP = 0.62;

/**
 * Der Stand des Aufzählers zum Zeitpunkt `elapsedMs`. Läuft über die ersten
 * `COUNT_RAMP` der Blende hoch (leicht ease-out, damit die letzte Ziffer nicht
 * ins Nichts tickt) und steht danach — die Zahl soll am Ende LESBAR stehen,
 * nicht im selben Moment verschwinden, in dem sie fertig ist.
 */
export function ceremonyCountAt(total: number, elapsedMs: number, durationMs: number): number {
  if (!(total > 0) || !(durationMs > 0)) return Math.max(0, Math.floor(total));
  const k = Math.min(1, Math.max(0, elapsedMs / (durationMs * COUNT_RAMP)));
  const eased = 1 - Math.pow(1 - k, 2);
  return Math.min(total, Math.floor(total * eased));
}
