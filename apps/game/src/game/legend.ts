/**
 * **Legenden-Level** (IDEEN-GAMEPLAY 1d) — der Zähler, der immer tickt.
 *
 * Nach der ERSTEN Transzendenz gibt jede weitere **Himmelfahrt** genau ein
 * Legenden-Level. Unendlich viele, je **+0,5 % global**, **rein additiv**, und
 * von keinem Reset je angefasst.
 *
 * ## Additiv heißt additiv — und das ist die ganze Leitplanke
 *
 * Der Gesamtfaktor ist `1 + 0.005 · L`, **nicht** `1.005^L`. Der Unterschied ist
 * bei L = 20 belanglos (×1,10 gegen ×1,105) und bei L = 2 000 der Unterschied
 * zwischen ×11 und ×39 000 — und genau dort entscheidet er über den Float-Guard
 * (§9.3, z300) und über jeden Anker. Ein unendlicher Zähler DARF nicht
 * exponentiell sein; ein Test friert das mit einem absurden L ein.
 *
 * Zum Vergleich, damit die Größenordnung sitzt: `transcendGlobalMult` zahlt ×3
 * **je TE**. Ein Legenden-Level ist +0,5 % — es braucht **400 Level**, um die
 * Wirkung eines EINZIGEN TE zu erreichen. Bei der gemessenen Himmelfahrt-Kadenz
 * des Bots (die erste fällt nach ⌀ 16,7 h, `npm run balance` Abschnitt 3) sind
 * das rund 6 700 Stunden Spielzeit. Der Zähler ist damit exakt das, was das
 * Ideen-Dokument wollte: **eine sichtbare Zahl für Ultra-Langzeitspieler**, kein
 * Machtterm.
 *
 * ## Warum er wie `transcendGlobalMult` auf BEIDE Seiten zahlt
 *
 * Der Faktor hängt in `dpsOf` UND `clickDamageOf`, mit demselben Skalar. Ein
 * globaler Faktor, der auf beide Seiten gleich wirkt, lässt das Klick:Idle-
 * Verhältnis unverändert — die P1-Invariante („aktiv bleibt König") hält also
 * per Konstruktion, genau wie bei der Transzendenz-Schicht darüber. Ein
 * klick- oder idle-seitiger Bonus derselben Größe täte das nicht.
 */

/** Globaler Zuschlag je Legenden-Level (additiv, +0,5 %). */
export const LEGEND_PER_LEVEL = 0.005;

/**
 * Der globale Faktor aus `level` Legenden-Leveln: **`1 + 0.005 · L`**.
 * Nicht-endliche/negative Werte lesen als 0 (die Funktion hängt im Renderpfad
 * und darf nie werfen, nie `NaN` liefern und nie `Infinity` erzeugen).
 */
export function legendGlobalMult(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 1;
  return 1 + LEGEND_PER_LEVEL * Math.floor(level);
}

/**
 * Ob eine Himmelfahrt JETZT ein Legenden-Level zahlt: erst **nach der ersten
 * Transzendenz**. Vorher ist die Himmelfahrt die oberste Schicht des Spielers
 * und braucht keinen Trostpreis; danach ist sie eine Zwischenstufe auf dem Weg
 * zur nächsten Transzendenz — und genau dort setzt der Zähler an.
 */
export function legendEarns(transcendences: number): boolean {
  return Number.isFinite(transcendences) && transcendences >= 1;
}

/**
 * Der Zähler nach einer Himmelfahrt. Rein, monoton, nie schrumpfend: ohne
 * Transzendenz bleibt er stehen, mit Transzendenz steigt er um genau 1.
 */
export function gainLegend(level: number, transcendences: number): number {
  const cur = Number.isFinite(level) && level > 0 ? Math.floor(level) : 0;
  return legendEarns(transcendences) ? cur + 1 : cur;
}

/** Der angezeigte Prozentsatz eines Standes (`+X %`, eine Nachkommastelle). */
export function legendPercent(level: number): number {
  return (legendGlobalMult(level) - 1) * 100;
}
