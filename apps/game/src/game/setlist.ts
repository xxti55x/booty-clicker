/**
 * **Die Setlist — das neue Verb der zweiten Prestige-Stufe (L2).**
 *
 * Das Problem, das sie löst: Ruhm → Himmel → Transzendenz brachte je Stufe nur
 * eine weitere Währung und einen weiteren Prozentwert. Man spielte oben genau
 * dasselbe Spiel wie unten, nur mit größeren Zahlen — „quasi 0 neues".
 *
 * Ab der ersten Himmelfahrt wählt der Spieler nach jeder Aszension **eine von
 * drei Karten**, und diese Karte ändert die REGELN des kommenden Laufs: wie
 * viele Rivalen eine Bühne hält, was ein Boss wert ist, wie sich Klick und Crew
 * zueinander verhalten. Kein Lauf gleicht dem vorigen, und die Wahl ist eine
 * echte Entscheidung — jede Karte gibt etwas und nimmt etwas.
 *
 * **Warum das ein Verb ist und kein Buff.** Ein Buff verschiebt eine Zahl; eine
 * Setlist-Karte verschiebt, WIE man spielt. „Kurzer Auftritt" macht Bühnen zu
 * Sprints und Gold knapp — man farmt anders. „Rampenfieber" macht Bosse zur
 * Hauptbeute — man stößt anders vor. Genau das fehlte der Progression.
 *
 * **Reinheit.** Alles hier ist pur und deterministisch: Der Katalog ist eine
 * Tabelle, die Auswahl folgt aus einem Seed, die Wirkung aus der gewählten Id.
 * Damit können Spiel, Sim-Bot und Tests dieselbe Rechnung lesen — es gibt keinen
 * zweiten Rechenweg.
 */

/** Die Kennung einer Setlist-Karte. */
export type SetlistId =
  'doppelschicht' | 'rampenfieber' | 'kurzerAuftritt' | 'zugabe' | 'stromausfall' | 'kollekte';

/**
 * Die Wirkung einer Karte als Faktoren-Bündel.
 *
 * Jeder Wert ist ein MULTIPLIKATOR (1 = unverändert), außer `zoneKills`, das
 * eine absolute Zahl von Rivalen je Bühne ist. Bewusst wenige, klar benannte
 * Achsen: Eine Karte, die an sieben Stellschrauben dreht, kann niemand mehr
 * abschätzen — und genau das Abschätzen ist die Entscheidung.
 */
export interface SetlistEffect {
  /** Faktor auf den Crew-/Idle-Schaden. */
  readonly dps: number;
  /** Faktor auf den Klick-Schaden. */
  readonly click: number;
  /** Faktor auf jede BP-Quelle. */
  readonly gold: number;
  /** Faktor auf den Schaden gegen Bosse. */
  readonly boss: number;
  /** Faktor auf die Beute eines Boss-Kills. */
  readonly bossLoot: number;
  /** Wie viele Rivalen eine Bühne hält (absolut, nicht multiplikativ). */
  readonly zoneKills: number;
}

/** Eine Karte des Katalogs. */
export interface SetlistCard {
  readonly id: SetlistId;
  readonly name: string;
  /** Was die Karte tut, in einem Satz — genau so steht es auf der Karte. */
  readonly text: string;
  /** Das Emoji-freie Motiv-Kürzel für die UI (die Karte malt es als SVG). */
  readonly art: 'crew' | 'boss' | 'sprint' | 'encore' | 'dark' | 'coin';
  readonly effect: SetlistEffect;
}

/** Die Rivalen-Zahl einer normalen Bühne ohne Karte (spiegelt `combat.MONSTERS_PER_ZONE`). */
export const SETLIST_BASE_KILLS = 10;

/** Der neutrale Effekt — kein Lauf ohne Karte rechnet anders als vorher. */
export const NO_SETLIST: SetlistEffect = {
  dps: 1,
  click: 1,
  gold: 1,
  boss: 1,
  bossLoot: 1,
  zoneKills: SETLIST_BASE_KILLS,
};

/**
 * Der Katalog.
 *
 * Jede Karte gibt etwas und nimmt etwas — eine reine Verbesserung wäre keine
 * Wahl, sondern nur eine Verzögerung des Klickens. Die Beträge sind bewusst
 * GROSS (Faktor 2 bis 3 statt 10 %): Eine Karte, die man nicht spürt, ändert
 * das Spiel nicht, und genau darum geht es hier.
 */
export const SETLIST_CARDS: readonly SetlistCard[] = [
  {
    id: 'doppelschicht',
    name: 'Doppelschicht',
    text: 'Die Crew legt doppelt auf — du selbst kommst kaum zum Klicken.',
    art: 'crew',
    effect: { ...NO_SETLIST, dps: 2.5, click: 0.4 },
  },
  {
    id: 'rampenfieber',
    name: 'Rampenfieber',
    text: 'Bosse werfen dreifache Beute ab, halten dafür doppelt so lange durch.',
    art: 'boss',
    effect: { ...NO_SETLIST, bossLoot: 3, boss: 0.5 },
  },
  {
    id: 'kurzerAuftritt',
    name: 'Kurzer Auftritt',
    text: 'Nur vier Rivalen je Bühne — dafür ist die Kasse knapp.',
    art: 'sprint',
    effect: { ...NO_SETLIST, zoneKills: 4, gold: 0.55 },
  },
  {
    id: 'zugabe',
    name: 'Zugabe',
    text: 'Dein Klick sitzt doppelt — die Crew macht Pause.',
    art: 'encore',
    effect: { ...NO_SETLIST, click: 2.5, dps: 0.4 },
  },
  {
    id: 'stromausfall',
    name: 'Stromausfall',
    text: 'Alles schlägt schwächer zu, aber jede Bühne hält nur halb so viele Rivalen.',
    art: 'dark',
    effect: { ...NO_SETLIST, dps: 0.6, click: 0.6, zoneKills: 5, gold: 1.8 },
  },
  {
    id: 'kollekte',
    name: 'Kollekte',
    text: 'Doppelte Kasse — dafür stehen die Rivalen dichter.',
    art: 'coin',
    effect: { ...NO_SETLIST, gold: 2.2, zoneKills: 16 },
  },
];

const BY_ID: Record<string, SetlistCard> = Object.fromEntries(SETLIST_CARDS.map((c) => [c.id, c]));

/** Wie viele Karten zur Wahl stehen. Drei: genug Auswahl, keine Qual. */
export const SETLIST_CHOICES = 3;

/** Die Karte zu einer Id — `undefined` für alles Unbekannte (nie werfend). */
export function setlistCard(id: string): SetlistCard | undefined {
  return BY_ID[id];
}

/**
 * Die Wirkung der aktiven Karte. Keine oder eine unbekannte Karte ⇒
 * {@link NO_SETLIST}, also exakt die Rechnung von vor diesem System.
 */
export function setlistEffect(id: string | null | undefined): SetlistEffect {
  if (!id) return NO_SETLIST;
  return BY_ID[id]?.effect ?? NO_SETLIST;
}

/**
 * Die Rivalen-Zahl einer Bühne unter der aktiven Karte — gesäubert auf einen
 * sinnvollen Bereich, damit eine kaputte Id die Bühne nie unendlich lang oder
 * null Gegner lang macht.
 */
export function setlistZoneKills(id: string | null | undefined): number {
  const n = Math.floor(setlistEffect(id).zoneKills);
  return Math.max(1, Math.min(50, Number.isFinite(n) ? n : SETLIST_BASE_KILLS));
}

/**
 * Die drei Karten, die nach dieser Aszension zur Wahl stehen — deterministisch
 * aus `seed`.
 *
 * Warum aus einem Seed und nicht aus einem RNG-Strom: Die Auswahl muss einen
 * Reload überleben. Wer die App schließt, während der Dialog offen ist, findet
 * dieselben drei Karten vor — sonst wäre das Wegklicken ein Reroll, und die
 * Wahl verlöre ihr Gewicht.
 */
export function setlistOffer(seed: number): readonly SetlistCard[] {
  const pool = [...SETLIST_CARDS];
  const out: SetlistCard[] = [];
  // Ganzzahliger LCG auf dem Seed: klein, stabil, ohne Gleitkomma-Überraschungen.
  let s = Math.abs(Math.floor(Number.isFinite(seed) ? seed : 0)) % 2147483647 || 1;
  const next = (): number => (s = (s * 48271) % 2147483647);
  for (let i = 0; i < SETLIST_CHOICES && pool.length > 0; i++) {
    out.push(pool.splice(next() % pool.length, 1)[0]!);
  }
  return out;
}

/** Ist `id` eine Karte, die dieses Angebot überhaupt enthält? */
export function setlistOfferHas(seed: number, id: string): boolean {
  return setlistOffer(seed).some((c) => c.id === id);
}
