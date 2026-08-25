/**
 * **Der Vorsprung — das neue Verb der dritten Prestige-Stufe (L3).**
 *
 * Die zweite Stufe ändert mit der {@link import('./setlist')|Setlist} die
 * Regeln eines Laufs. Die dritte ändert, **wo ein Lauf überhaupt anfängt.**
 *
 * Nach einer Transzendenz muss man sich nicht mehr durch Bühnen kriechen, die
 * man längst gelöst hat: Man startet so tief, wie die gesammelte Transzendenz-
 * Erfahrung es zulässt. Das ist der Unterschied zwischen „dasselbe nochmal, nur
 * schneller" und einer Ära, die einen anderen Rhythmus hat — der eigentliche
 * Vorwurf an die alte Progression war ja, dass jede Stufe sich gleich anfühlte.
 *
 * **Warum ein Deckel und keine freie Wahl.** Ohne Grenze wäre der Vorsprung
 * kein Verb, sondern ein Sprung ans Ende: Man setzte sich auf die tiefste je
 * erreichte Bühne und das Spiel dazwischen fiele weg. Der Deckel wächst mit
 * `teLifetime` — der Vorsprung ist damit selbst ein Fortschritt, den man sich
 * über mehrere Ären erarbeitet, und er bleibt immer ein Stück hinter dem
 * eigenen Rekord zurück.
 *
 * Rein und DOM-frei: Spiel, Sim und Tests lesen dieselbe Rechnung.
 */

/** Ab wie viel Lebenszeit-TE der Vorsprung überhaupt beginnt. */
export const VORSPRUNG_MIN_TE = 1;

/**
 * Wie viele Bühnen ein Punkt Lebenszeit-TE trägt.
 *
 * Fünf: Eine Transzendenz bringt anfangs wenige TE, und der erste Vorsprung
 * soll spürbar sein (ein paar Bühnen), ohne die Ära zu überspringen. Der
 * eigentliche Riegel ist ohnehin {@link VORSPRUNG_RECORD_SHARE}.
 */
export const VORSPRUNG_PER_TE = 5;

/**
 * Der harte Anteil am eigenen Rekord, den der Vorsprung nie überschreitet.
 *
 * Auch mit sehr viel TE startet man höchstens bei 60 % der tiefsten je
 * erreichten Bühne. Ohne diesen Riegel würde ein alter Spielstand die Ära auf
 * seinem Rekord beginnen — dann gäbe es nichts mehr zu spielen, nur noch
 * zuzusehen. Vierzig Prozent Weg bleiben immer übrig.
 */
export const VORSPRUNG_RECORD_SHARE = 0.6;

/**
 * Die tiefste Bühne, auf der eine neue Ära starten darf.
 *
 * `teLifetime` ist der Lebenszeit-Highwater der Transzendenz-Erfahrung,
 * `recordZone` die tiefste je erreichte Bühne. Ohne Transzendenz (oder ohne
 * Rekord) ist das Ergebnis 1 — also exakt der Zustand vor diesem System.
 *
 * Nie werfend; kaputte Eingaben fallen auf 1 zurück.
 */
export function vorsprungMaxZone(teLifetime: number, recordZone: number): number {
  const te = Number.isFinite(teLifetime) ? Math.floor(teLifetime) : 0;
  const rec = Number.isFinite(recordZone) ? Math.floor(recordZone) : 1;
  if (te < VORSPRUNG_MIN_TE || rec <= 1) return 1;
  const ausTe = 1 + te * VORSPRUNG_PER_TE;
  const ausRekord = Math.floor(rec * VORSPRUNG_RECORD_SHARE);
  // Der kleinere der beiden Deckel gewinnt, und nie unter Bühne 1.
  return Math.max(1, Math.min(ausTe, ausRekord));
}

/**
 * Hat der Spieler den Vorsprung überhaupt freigeschaltet? Genau dann, wenn er
 * mehr als eine Bühne überspringen dürfte — sonst ist der Wähler eine leere
 * Geste.
 */
export function vorsprungUnlocked(teLifetime: number, recordZone: number): boolean {
  return vorsprungMaxZone(teLifetime, recordZone) > 1;
}

/**
 * Die Startbühne einer neuen Ära: der Wunsch, geklemmt auf das Erlaubte.
 *
 * Der Wunsch kommt aus der UI (oder aus einem geladenen Spielstand) und wird
 * hier zurechtgestutzt — die Klemme liegt bewusst in der REGEL und nicht im
 * Dialog, damit ein gecrafteter Save nicht auf Bühne 900 startet.
 */
export function vorsprungStartZone(wunsch: number, teLifetime: number, recordZone: number): number {
  const max = vorsprungMaxZone(teLifetime, recordZone);
  const w = Number.isFinite(wunsch) ? Math.floor(wunsch) : 1;
  return Math.max(1, Math.min(max, w));
}

/**
 * Die Stufen, die der Wähler anbietet — Bühne 1 plus einige runde Marken bis
 * zum Maximum.
 *
 * Bewusst wenige, runde Zahlen statt eines Schiebereglers über hunderte
 * Bühnen: Die Entscheidung ist „wie weit steige ich ein", nicht „auf welche
 * Bühne genau". Die letzte Stufe ist immer exakt das Maximum, damit der
 * Vollausbau erreichbar bleibt.
 */
export function vorsprungSteps(teLifetime: number, recordZone: number): readonly number[] {
  const max = vorsprungMaxZone(teLifetime, recordZone);
  if (max <= 1) return [1];
  const out: number[] = [1];
  for (const z of [10, 25, 50, 100, 200, 400, 800]) {
    if (z < max) out.push(z);
  }
  out.push(max);
  return out;
}
