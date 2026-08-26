/**
 * Ascension core — the prestige layer (pure), Clicker-Heroes "Hero Souls".
 *
 * Booty theme: retiring your current tour banks **Ruhm-Seelen** (fame souls).
 * Each held soul is a permanent **+10 % to all damage** (click *and* crew DPS),
 * so a reset trades raw progress for a compounding multiplier — the engine that
 * keeps the game endless: deeper zones → more souls → more damage → deeper zones.
 *
 * **Souls accounting (M10 — held-balance + additive-earn).** Before M10 souls were
 * a lifetime-pinned bank (`souls = max(current, soulsForMaxZone(deepest))`). M10
 * makes Ancients (§4.6) *spend* souls, so ascension must never refund what you
 * spent. The model is therefore split in two:
 *
 *   · `rsLifetime` = total souls ever EARNED (monotonic) = `soulsForMaxZone(deepest
 *     zone you have ascended from)`.
 *   · `souls`      = spendable **held** balance = `rsLifetime − Σ(spent on Ancients)`.
 *
 * Ascending to deepest zone z earns only the *new* souls beyond what has already
 * been earned: `gain = max(0, soulsForMaxZone(z) − rsLifetime)`, added to the held
 * balance, with `rsLifetime` lifted to the new earned total. Held souls therefore
 * carry across ascensions (they're only reset by a Ruhmes-Himmelfahrt, L2/§4.5.2),
 * and what you spent on Ancients stays spent. A first ascension from scratch yields
 * exactly the pre-M10 numbers (zone 50 ⇒ 129), so the pacing tables still hold.
 *
 * The `soulMult` amplifier (`0.10 + 0.002·HPF`, §4.5.2) is threaded in as the
 * `bonusPerSoul` argument by the caller — this module stays free of any L2 import.
 */

/** You can't ascend before reaching this zone (keeps early souls non-trivial). */
export const ASCEND_MIN_ZONE = 10;
/** Base damage bonus per held soul (+10 %); amplified by held HPF at the call site. */
export const SOUL_BONUS = 0.1;

const SOUL_SCALE = 40;
const SOUL_EXP = 1.6;
/**
 * Base of the exponential "Legendäre Auftritte" term added in RS_v2 (spec §4.5.1,
 * the M9 anti-plateau retune, N1). The polynomial term alone (`⌊z^1.6/40⌋`) is too
 * flat and the bank plateaus around 13 souls / zone ~50; adding `⌊1.10^z − 1⌋` makes
 * every new best-zone *multiply* the earned total instead of incrementing it.
 */
const SOUL_EXP_BASE = 1.1;

/** Souls corresponding to a lifetime-deepest `zone` (monotonic, 0 below the gate). */
export function soulsForMaxZone(zone: number): number {
  if (zone < ASCEND_MIN_ZONE) return 0;
  const poly = Math.floor(Math.pow(zone, SOUL_EXP) / SOUL_SCALE);
  const legendary = Math.floor(Math.pow(SOUL_EXP_BASE, zone) - 1);
  return poly + legendary;
}

/**
 * Globaler Schadens-Multiplikator aus den **verdienten** Seelen (`rsLifetime`).
 *
 * **Warum verdient und nicht gehalten.** Bis hierher hing der Multiplikator am
 * gehaltenen Bestand — und damit war jeder Ahnen-Kauf ein direkter
 * Schadensverlust. Gemessen war Sparen deshalb IMMER besser, und der Abstand
 * öffnete sich mit jedem Lauf weiter:
 *
 * | Seelen | behalten | alles ausgeben | Sparen ist … |
 * | ---: | ---: | ---: | ---: |
 * | 100 | ×11 | ×2,95 (Lv 13) | 3,7× besser |
 * | 1 000 | ×101 | ×7,6 (Lv 44) | 13,3× besser |
 * | 1 000 000 | ×100 001 | ×213 (Lv 1413) | **469× besser** |
 *
 * Das ist keine Kalibrierungsfrage, sondern Mathematik: Sparen wächst LINEAR in
 * n, Ausgeben nur mit √n (die Ahnen-Leiter kostet `level + 1`, ihre Summe ist
 * eine Dreieckszahl). Eine Wurzel holt eine Gerade nie ein — auch nicht mit
 * zehnmal stärkeren Ahnen.
 *
 * Am verdienten Stand ist der Multiplikator unverlierbar, Ausgeben kostet
 * nichts mehr, und die Entscheidung verschiebt sich von „ausgeben oder sparen?"
 * (die keine war) zu „welcher Ahne?" — die eigentlich gemeinte Frage.
 *
 * Wer nie ausgibt, merkt keinen Unterschied: Ohne Ausgaben sind verdient und
 * gehalten dieselbe Zahl. Die Obergrenze der Kurve bleibt damit unverändert,
 * und nichts muss neu kalibriert werden.
 *
 * `bonusPerSoul` ist der Grundwert +10 %; der HPF-Verstärker (`soulBonusEff`,
 * §4.5.2) reicht am Aufrufort einen größeren Wert durch, damit L1 (mehr Seelen)
 * und L2 (fettere Seelen) sich MULTIPLIZIEREN statt zu addieren.
 */
export function soulMult(earnedSouls: number, bonusPerSoul: number = SOUL_BONUS): number {
  return 1 + bonusPerSoul * Math.max(0, earnedSouls);
}

// ---------------------------------------------------------------------------
// Die BREITE: Ruhm hängt nicht mehr nur an der Bühne
// ---------------------------------------------------------------------------

/**
 * Was ein Spieler AUSSER der Tiefe vorzuweisen hat.
 *
 * Alle drei Achsen sind Lebenszeit-Highwater und überleben jede Aszension —
 * genau wie die tiefste Bühne. Das ist keine Formsache: `pendingSouls` rechnet
 * „Gesamtanspruch minus schon verdient", und dieser Trick trägt nur, solange
 * der Anspruch nie fällt. Eine Achse, die sich zurücksetzt (Crew-Level, Gold
 * des Laufs), wäre hier eine Farm-Lücke.
 */
export interface FameBreadth {
  /** Summe der Crew-Meisterschafts-Ränge — Zeit im Einsatz. */
  readonly masteryRanks: number;
  /** Gesammelter Ruf über alle Bühnen-Themen — wo man gefarmt hat. */
  readonly reputation: number;
  /** Geöffnete Truhen — was man eingesammelt statt überrannt hat. */
  readonly chestsOpened: number;
}

/** Ein Spieler ohne jede Breite — der Faktor bleibt dann ×1. */
export const NO_BREADTH: FameBreadth = { masteryRanks: 0, reputation: 0, chestsOpened: 0 };

/**
 * Die Normierungen der drei Achsen (Nenner: „hier ist die Achse voll").
 *
 * Gemessen an echten Ketten statt geschätzt. Eine 4×45-Minuten-Kette bringt
 * Σ18 Ränge, 3 883 Ruf und 45 Truhen; eine 8×45-Kette Σ30, 9 282 und 78. Die
 * Nenner sind so gesetzt, dass die erste Kette bei rund ×1,6 landet und die
 * zweite den Deckel erreicht — spürbar, aber nie die Hauptsache.
 */
export const BREADTH_MASTERY_FULL = 60; // 15 Mitglieder × Rang 4
export const BREADTH_REPUTATION_FULL = 400; // auf die Wurzel des Rufs
export const BREADTH_CHESTS_FULL = 300;

/** Wie weit die Breite den Ruhm höchstens hebt (×2 bei voller Breite). */
export const BREADTH_MAX_BONUS = 1;

/**
 * Der Breiten-Faktor: 1 (nur Tiefe) bis 2 (alle Achsen voll).
 *
 * **Warum ein Faktor und keine Summanden.** Der Tiefen-Term ist exponentiell
 * (`1,10^z`): Bei Bühne 90 stammen 99,3 % des Ruhms aus ihm. Additive Achsen
 * hätten dagegen keine Chance — man müsste sie selbst exponentiell wachsen
 * lassen, und dann wäre die Tiefe wieder egal. Als Faktor wirkt die Breite in
 * JEDER Größenordnung gleich stark, ganz gleich, wie tief jemand schon steht.
 *
 * Die Wurzel auf dem Ruf, weil er als Einziger ungebremst mitläuft: Er zählt
 * jeden Kill, also müsste er sonst als Zahl schlicht alles andere erschlagen.
 *
 * Nie werfend; kaputte Eingaben zählen als null.
 */
export function fameBreadth(b: FameBreadth = NO_BREADTH): number {
  const ok = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
  const anteil =
    ok(b.masteryRanks) / BREADTH_MASTERY_FULL +
    Math.sqrt(ok(b.reputation)) / BREADTH_REPUTATION_FULL +
    ok(b.chestsOpened) / BREADTH_CHESTS_FULL;
  return 1 + Math.min(BREADTH_MAX_BONUS, anteil);
}

/**
 * Der Gesamtanspruch auf Ruhm: Tiefe × Breite.
 *
 * Monoton in beiden Argumenten — die Voraussetzung dafür, dass `pendingSouls`
 * weiter „Anspruch minus verdient" rechnen darf, ohne je negativ zu werden.
 */
export function soulsForProgress(zone: number, breadth: FameBreadth = NO_BREADTH): number {
  return Math.floor(soulsForMaxZone(zone) * fameBreadth(breadth));
}

/**
 * Souls you would GAIN by ascending right now: the earned total for the lifetime-
 * deepest zone (including the current run) minus what you have **already earned**
 * (`rsLifetime`). Spending souls on Ancients lowers your held balance but not
 * `rsLifetime`, so it can never be farmed back by re-ascending.
 *
 * Seit dem Breiten-Umbau zählt nicht mehr nur, wie tief jemand stand, sondern
 * auch, was er auf dem Weg getan hat — siehe {@link fameBreadth}.
 */
export function pendingSouls(
  runMaxZone: number,
  lifetimeMaxZone: number,
  rsLifetime: number,
  breadth: FameBreadth = NO_BREADTH,
): number {
  const deepest = Math.max(runMaxZone, lifetimeMaxZone);
  return Math.max(0, soulsForProgress(deepest, breadth) - rsLifetime);
}

/** Whether ascending is worth it (at least one newly-earned soul, past the gate). */
export function canAscend(
  runMaxZone: number,
  lifetimeMaxZone: number,
  rsLifetime: number,
  breadth: FameBreadth = NO_BREADTH,
): boolean {
  return pendingSouls(runMaxZone, lifetimeMaxZone, rsLifetime, breadth) >= 1;
}

/**
 * PLAYTEST G-04: Die kleinste Bühne, deren Erst-Erreichen NEUE Seelen einbrächte
 * (`soulsForMaxZone(z) > rsLifetime`). Der Ruhm-Tab sagt damit ein konkretes
 * Ziel an („neue Seelen ab Bühne X") statt des ratlosen „stoß tiefer vor".
 * Sucht ab `max(deepest, ASCEND_MIN_ZONE)` aufwärts — dank des exponentiellen
 * Legendär-Terms (1.1^z) terminiert das für jeden endlichen `rsLifetime` weit
 * vor dem Sicherheits-Deckel (1.1^7440 ≈ Number-Overflow ⇒ Infinity > alles).
 */
export function nextSoulZone(deepest: number, rsLifetime: number): number {
  const CAP = 20_000;
  let z = Math.max(Math.floor(deepest), ASCEND_MIN_ZONE);
  while (z < CAP && soulsForMaxZone(z) <= rsLifetime) z++;
  return z;
}

export interface AscendResult {
  /** New held (spendable) soul balance. */
  souls: number;
  /** New lifetime-deepest zone. */
  lifetimeMaxZone: number;
  /** New lifetime-earned soul total (monotonic highwater). */
  rsLifetime: number;
}

/**
 * Compute the post-ascension held balance, lifetime record + earned total. The
 * caller performs the run reset (zone → 1, crew → empty, gold → 0); held souls,
 * Ancients and all L2 state carry over (only a Himmelfahrt resets them).
 */
export function applyAscension(
  runMaxZone: number,
  lifetimeMaxZone: number,
  currentSouls: number,
  rsLifetime: number,
  breadth: FameBreadth = NO_BREADTH,
): AscendResult {
  const deepest = Math.max(runMaxZone, lifetimeMaxZone);
  const earnedTotal = soulsForProgress(deepest, breadth);
  const gain = Math.max(0, earnedTotal - rsLifetime);
  return {
    souls: currentSouls + gain,
    lifetimeMaxZone: deepest,
    rsLifetime: Math.max(rsLifetime, earnedTotal),
  };
}
