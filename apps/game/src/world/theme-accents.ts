import type { GimmickId } from '../game/boss-gimmicks';
import type { BackgroundKey } from '../types';

/**
 * K-1 „Eine Akzentfarbe pro Theme" — die EINZIGE Quelle der Bühnen-Signalfarbe.
 *
 * Wer sie liest: Rim-Licht B (`BGS[*].light.rimB`), die Deck-Kanten-Emissive,
 * die Klick-Splitter (D-02), die Boss-Aura (D-13), die Schadenszahlen-CSS-Var
 * (D-22) und der Übergangs-Wischer (D-24). Alles andere im Bild bleibt
 * Grundpalette — genau EIN Farbfaden zieht sich durch alle Effekte einer Bühne.
 *
 * Bewusst ein reiner Datenexport ohne three-Import: der Modul-Graph bleibt
 * testbar (node, kein DOM), und es gibt keinen zweiten Ort, an dem jemand
 * „schnell mal" eine abweichende Akzentfarbe hardcodet.
 */
export const THEME_ACCENT: Record<BackgroundKey, number> = {
  club: 0xa8e831, // Limette — der Neonclub-Klassiker
  synth: 0x2ff5e8, // Cyan — die Gegenfarbe zum Magenta-Himmel
  beach: 0x3adfc0, // Türkis — flaches Wasser gegen den Abendhimmel
  space: 0xd9f0ff, // Eisblau — das einzige Kalt-Hell im dunklen Theme
};

/**
 * K-1-Ausnahme (D-23): In der Boss-Arena tauscht das Theme seine Akzentfarbe
 * gegen die Farbe des Boss-Gimmicks — Spotlight/Schild/Welle/Gravitation
 * bekommen so je eine eigene Arenastimmung, statt vier Mal dieselbe Bühne mit
 * goldener Leiste zu sein. Rot/Orange bleibt frei (K-2: Gefahr/Schaden).
 */
export const GIMMICK_MOOD: Record<GimmickId, number> = {
  spotlight: 0xffd24d, // Gold — der Kegel, der die Bühne sucht
  shield: 0x7de8ff, // Eis — das Metronom-Fenster
  wave: 0x3adfc0, // Türkis — die anrollende Welle
  gravity: 0xb45cf6, // Violett — der schwere Sog
};

/** Akzentfarbe als CSS-Hex (`#rrggbb`) — für die `--accent`-Variable (D-22). */
export function accentCss(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}
