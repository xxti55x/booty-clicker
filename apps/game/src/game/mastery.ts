/**
 * Crew-Meisterschaft (IDEEN-GAMEPLAY 1a) — die kleinste permanente Schicht.
 *
 * Jedes Crew-Mitglied sammelt **Einsatz-XP**: die Summe aller Level, die je in
 * DIESES Mitglied gekauft wurden. Der Zähler ist ein reiner Highwater — er
 * wächst bei jedem Level-Kauf und wird von KEINEM der drei Resets angefasst
 * (Aszension, Himmelfahrt, Transzendenz). Vier Schwellen ergeben die
 * Meisterschafts-Ränge; jeder Rang zahlt einen KLEINEN, additiven Perk auf das
 * Mitglied selbst.
 *
 * **Was hier NICHT steht.** Dieses Modul kennt weder `CREW` noch Level-Kurven —
 * es ist reine Rang-Arithmetik über eine Zahl. Die crew-spezifische Anwendung
 * (Eigen-DPS-Faktor in `heroDps`/`heroClick`, die Gratis-Erststufe des
 * Legenden-Rangs) lebt in `heroes.ts`, das dieses Modul importiert. So bleibt
 * die Abhängigkeit einseitig und die Rang-Mathematik einzeln testbar.
 *
 * **Warum genau diese Schwellen — gemessen, nicht geraten.** Der Bot, der die
 * Anker fährt, zählt die Einsatz-XP mit (`sim.ts`, ausgewiesen in
 * `npm run balance`, Abschnitt „Meisterschaft"). Gemessen (Profil `SIM_ACTIVE`,
 * 3 Klicks/s + Juice, volle Loot-Ökonomie):
 *
 * | Spielzeit             | Einsatz-XP des stärksten Mitglieds |
 * | --------------------- | ---------------------------------- |
 * | 1 Sitzung (45 min)    | 167 · 234 · 167 (Seeds 1 / 7 / 12345) |
 * | 3 h (4 Läufe)         | 1 384                              |
 * | 12 h (16 Läufe)       | 6 974                              |
 * | 24 h (32 Läufe)       | 14 411                             |
 * | 72 h (96 Läufe)       | 43 487                             |
 *
 * Nach den ersten Stunden wächst der Zähler fast LINEAR mit ~450 Level pro
 * 45-min-Lauf: Die Kosten-Leiter (×1.075/Level) frisst jeden Meta-Zuwachs
 * logarithmisch wieder auf, ein dickerer Seelen-Stack kauft also nicht
 * dramatisch mehr Level, sondern erreicht sie schneller. Daraus folgen die
 * Schwellen: **Bronze 150** fällt in der ERSTEN Sitzung — aber nur für das
 * Mitglied, an dem man wirklich hängt (Platz 2 lag bei Seed 1 bei 138, Platz 3
 * bei 116). **Silber 1 200** ≈ 3 h, **Gold 8 000** ≈ 13 h, **Legende 60 000**
 * ≈ 100 h aktives Spiel — bei einer Stunde am Abend also die „vielen Wochen"
 * aus dem Ideen-Dokument. Die im Ideen-Dokument skizzierten 100/500/2500/10000
 * wären nach dieser Messung viel zu schnell gewesen (Legende an einem
 * Wochenende); die Leiter ist deshalb bewusst über-linear gespreizt.
 *
 * **Leitplanke** (Ideen-Dokument): additiv-klein, ≤ +6 % Eigen-Output pro
 * Mitglied plus der Gratis-Slot. Drei Ränge à +2 % ergeben exakt die +6 %; der
 * vierte Rang zahlt bewusst KEINEN weiteren Prozentpunkt, sondern die
 * Gratis-Erststufe — Permanenz, die man SIEHT (der Slot ist nach jedem Reset
 * sofort da), statt einer weiteren stillen Zahl im DPS-Produkt.
 */

/** Lebenszeit-Level je Mitglied (fehlt = 0) — spiegelt `CrewLevels`. */
export type CrewMastery = Record<string, number>;

/** Frische (leere) Meisterschafts-Tafel. */
export function createMastery(): CrewMastery {
  return {};
}

/** Die vier Rang-Ids, aufsteigend. */
export type MasteryRankId = 'bronze' | 'silber' | 'gold' | 'legende';

export interface MasteryRankConfig {
  readonly id: MasteryRankId;
  /** Deutscher Anzeigename (UI + Toast). */
  readonly name: string;
  /** Lebenszeit-Level, ab denen der Rang gilt. */
  readonly at: number;
}

/**
 * Die Rang-Leiter, aufsteigend nach `at`. Rang-INDEX ist `MASTERY_RANKS`-Index
 * + 1; Rang 0 („noch kein Rang") hat bewusst keinen Eintrag, damit `at` immer
 * eine echte Schwelle ist.
 */
export const MASTERY_RANKS: readonly MasteryRankConfig[] = [
  { id: 'bronze', name: 'Bronze', at: 150 },
  { id: 'silber', name: 'Silber', at: 1_200 },
  { id: 'gold', name: 'Gold', at: 8_000 },
  { id: 'legende', name: 'Legende', at: 60_000 },
];

/** Eigen-Output-Bonus je Rang (additiv, +2 % — Ideen-Leitplanke). */
export const MASTERY_DPS_PER_RANK = 0.02;

/**
 * Wie viele Ränge den DPS-Perk zahlen. Rang 4 (Legende) zahlt stattdessen die
 * Gratis-Erststufe, also deckelt diese Zahl den Prozent-Anteil bei +6 %.
 */
export const MASTERY_DPS_RANKS = 3;

/** Der höchste erreichbare Prozent-Perk (Leitplanken-Konstante für Tests/UI). */
export const MASTERY_MAX_DPS_BONUS = MASTERY_DPS_PER_RANK * MASTERY_DPS_RANKS;

/**
 * Der Rang zu `xp` als Index 0…4 (0 = noch keiner). Nicht-endliche oder
 * negative Werte lesen als 0 — die Funktion ist überall im Renderpfad und darf
 * nie werfen.
 */
export function masteryRank(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  let rank = 0;
  for (const cfg of MASTERY_RANKS) if (xp >= cfg.at) rank++;
  return rank;
}

/** Die Rang-Konfiguration zu `xp` (`null` unterhalb von Bronze). */
export function masteryRankConfig(xp: number): MasteryRankConfig | null {
  const r = masteryRank(xp);
  return r > 0 ? MASTERY_RANKS[r - 1] : null;
}

/**
 * Der Eigen-Output-Faktor eines Mitglieds aus seinen Einsatz-XP:
 * `1 + 2 % · min(Rang, 3)` — Bronze ×1.02, Silber ×1.04, Gold/Legende ×1.06.
 * Trifft DPS bzw. (beim Klick-Mitglied) den Klick-Schaden, nie etwas Globales.
 */
export function masteryOwnMult(xp: number): number {
  return 1 + MASTERY_DPS_PER_RANK * Math.min(MASTERY_DPS_RANKS, masteryRank(xp));
}

/** `true`, sobald der Legenden-Rang die erste Fähigkeits-Stufe gratis macht. */
export function masteryFreeFirstTier(xp: number): boolean {
  return masteryRank(xp) >= MASTERY_RANKS.length;
}

/**
 * `n` frisch gekaufte Level auf das Konto von `id` buchen — der EINZIGE Weg,
 * wie Einsatz-XP entstehen. Monoton: ein nicht-positives oder krummes `n`
 * lässt die Tafel unverändert (kein Abzug, kein Bruchteil). Rein: liefert eine
 * NEUE Tafel, die alte bleibt stehen.
 */
export function addMastery(m: CrewMastery, id: string, n: number): CrewMastery {
  if (!Number.isFinite(n) || n <= 0) return m;
  const add = Math.floor(n);
  if (add <= 0) return m;
  return { ...m, [id]: (m[id] ?? 0) + add };
}

/** Was die Karte/der Tooltip über ein Mitglied wissen muss. */
export interface MasteryProgress {
  /** Rang-Index 0…4. */
  readonly rank: number;
  /** Deutscher Rang-Name (`''` unterhalb von Bronze). */
  readonly name: string;
  /** Rang-Id (`null` unterhalb von Bronze) — treibt die Rahmen-Klasse. */
  readonly id: MasteryRankId | null;
  /** Gebuchte Lebenszeit-Level. */
  readonly xp: number;
  /** Schwelle des NÄCHSTEN Rangs (0, wenn Legende erreicht ist). */
  readonly next: number;
  /** Name des nächsten Rangs (`''` bei Legende). */
  readonly nextName: string;
}

/** Rang + Fortschritt zum nächsten Rang für `xp` (rein, UI-freundlich). */
export function masteryProgress(xp: number): MasteryProgress {
  const safe = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const rank = masteryRank(safe);
  const cur = rank > 0 ? MASTERY_RANKS[rank - 1] : null;
  const nxt = rank < MASTERY_RANKS.length ? MASTERY_RANKS[rank] : null;
  return {
    rank,
    name: cur?.name ?? '',
    id: cur?.id ?? null,
    xp: safe,
    next: nxt?.at ?? 0,
    nextName: nxt?.name ?? '',
  };
}
