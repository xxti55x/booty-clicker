import { ZONES_PER_THEME } from '../game/boss-gimmicks';

/**
 * **Bühnen-Eskalation** (D-08/D-12) — der EINE Regler, an dem Bühne und Gegner
 * gemeinsam hängen.
 *
 * Befund: Bühne 21, 24 und 28 waren dasselbe Bild und derselbe Gegner
 * (shots/SHEET-tiers.png). Fortschritt muss man SEHEN (S4), also leitet dieses
 * Modul aus der Zonen-Position innerhalb des Themes zwei Werte ab:
 *
 *  · {@link stageTier} — die DISKRETE Stufe 0/1/2 (Bühnen 1–3 / 4–6 / 7–10).
 *    Sie treibt alles, was einen Rebuild braucht: Publikumszahl,
 *    Rand-Requisiten, Rivalen-Rang. Drei Stufen, weil ein Rebuild pro Bühne
 *    den Kill-Fluss zäh machen würde.
 *  · {@link stageK} — der STETIGE Fortschritt 0…1. Er treibt alles, was ohne
 *    Rebuild geht: Deck-Emissive, Sättigung, Himmel-Intensität.
 *
 * Pur, ohne three und ohne Save-Feld: die Bühne ist die einzige Eingabe
 * (K-8). `ZONES_PER_THEME` kommt read-only aus derselben Quelle, aus der auch
 * `themeForZone` seine Zehnerstrecke nimmt — es gibt keine zweite Wahrheit
 * darüber, wie lang ein Theme ist.
 */

/** Anzahl Eskalationsstufen je Theme (früh / mittig / kurz vor dem Boss). */
export const STAGE_TIERS = 3;

/** Bühnen je Stufe — 10 Bühnen auf 3 Stufen: 1–3, 4–6, 7–10. */
const ZONES_PER_TIER = 3;

/** Position der Bühne INNERHALB ihres Themes, 0-basiert (Bühne 1 ⇒ 0). */
function indexInTheme(zone: number): number {
  const z = Math.max(1, Math.floor(Number.isFinite(zone) ? zone : 1));
  return (z - 1) % ZONES_PER_THEME;
}

/**
 * Diskrete Eskalationsstufe 0 | 1 | 2. Die letzte Stufe ist bewusst vier Bühnen
 * lang (7–10): die Boss-Bühne gehört zum Höhepunkt, nicht zu einer vierten
 * Stufe, die man nur einmal sieht.
 */
export function stageTier(zone: number): 0 | 1 | 2 {
  const t = Math.min(STAGE_TIERS - 1, Math.floor(indexInTheme(zone) / ZONES_PER_TIER));
  return t as 0 | 1 | 2;
}

/** Stetiger Fortschritt innerhalb des Themes: Bühne 1 ⇒ 0, Bühne 10 ⇒ 1. */
export function stageK(zone: number): number {
  return indexInTheme(zone) / (ZONES_PER_THEME - 1);
}
