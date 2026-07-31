/**
 * Crew-Umschulung (IDEEN-GAMEPLAY 3b) — Reforging der Spezial-Fähigkeiten.
 *
 * Die v11-Spezial-Stufen sind pro Mitglied fest verdrahtet: WELCHE Stufen
 * Spezial sind, sagt der Tier-Rhythmus (`TIER_PATTERNS`), WELCHE SORTE sie
 * zahlen, sagt `HeroConfig.special`. Die Umschulung dreht ausschließlich an der
 * zweiten Zahl: Gegen Pfirsich-Splitter darf ein GEKAUFTER Spezial-Slot eines
 * Mitglieds auf eine andere Sorte gerollt werden. Der Rhythmus bleibt
 * unangetastet — ein Power-Slot wird nie zu einem Spezial-Slot und umgekehrt,
 * also bleibt die Langzeit-Balance (2 P + 2 S je Zyklus) exakt die alte.
 *
 * **Was hier NICHT steht.** Dieses Modul kennt weder `CREW` noch die Rhythmen —
 * es ist reine Arithmetik über eine Map, eine Kostenleiter und zwei
 * RNG-Ziehungen. Die crew-spezifische Anwendung (welche Stufe überhaupt ein
 * Spezial-Slot ist, welche Sorte ein Slot am Ende zahlt) lebt in `heroes.ts`,
 * das dieses Modul importiert. Dieselbe einseitige Abhängigkeit wie bei
 * `mastery.ts` — die Kosten-/Angebots-Mathematik bleibt einzeln testbar.
 *
 * **Die Override-Map ist die EINE Quelle.** `abilityKind(cfg, tier, retrain)`
 * liest sie zuerst; Spiel, Sim-Faltung (`crewSpecialBonuses`), Kauf-Tipp und
 * Crew-Card gehen alle durch diese eine Funktion. Ein umgeschulter Slot wirkt
 * damit exakt wie ein gekaufter Slot dieser Sorte — es gibt keinen zweiten Pfad.
 *
 * **Warum Währungs-Eskalation statt Echtzeit-Abklingzeit.** Das Ideen-Dokument
 * skizzierte „Splitter + Abklingzeit". Ein 24-h-Echtzeit-Cooldown bestraft aber
 * genau die Spielweise, für die dieses Spiel gebaut ist (kurze Sitzungen,
 * Idle-Fortschritt): Wer abends 20 Minuten spielt, sieht seinen Roll frühestens
 * am nächsten Abend — und muss sich dafür einen Timer merken. Stattdessen
 * eskaliert die WÄHRUNG: Jeder weitere Roll am SELBEN Mitglied innerhalb der
 * laufenden Aszension kostet doppelt (`RETRAIN_ROLL_GROWTH`), der Zähler fällt
 * mit jedem Reset auf 0 (`retrainRolls` ist Run-Zustand, die Overrides selbst
 * sind permanent). Das bremst dasselbe Spam-Verhalten, kostet aber nur Splitter
 * statt Lebenszeit — und die Bremse löst sich durch WEITERSPIELEN, nicht durchs
 * Warten.
 *
 * **Kosten, gemessen statt geraten** (Bot-Profil `SIM_ACTIVE`, 3 cps + Juice,
 * volle Loot-Ökonomie, Seeds 1/7/12345; Truhen aus der Sim-Ökonomie plus der
 * Boss-Faucet `bossShardReward`, den das Spiel pro Boss-Kill zahlt):
 *
 * | Spielzeit          | 🧩 Truhen | 🧩 Bosse | Σ     | ⇒ 🧩/h |
 * | ------------------ | --------- | -------- | ----- | ------ |
 * | 45 min (1 Sitzung) | 12        | 36       | 48    | 64     |
 * | 3 h (4 Läufe)      | 52        | 323      | 375   | 125    |
 * | 12 h (16 Läufe)    | 78        | 1 579    | 1 656 | 138    |
 * | 24 h (32 Läufe)    | 121       | 3 253    | 3 375 | 141    |
 *
 * Der Beharrungszustand liegt also bei ~140 🧩/h. Daraus die Leiter
 * `40 · 2^(Slot−1)`: Slot 1 kostet 40 🧩 (≈ 20 min bzw. knapp eine erste
 * Sitzung), Slot 2 80, Slot 3 160, Slot 4 320 (≈ 2.3 h), Slot 5 640 — die
 * Umschulung tiefer Slots ist damit ein echtes Sparziel, das erste Experimentieren
 * aber schon am Ende des ersten Abends bezahlbar. Die Verdopplung je Slot spiegelt
 * bewusst den bestehenden Splitter-Sink (Skin-Level, `shardCost` ×1.25/Level):
 * Beide Leitern wachsen geometrisch, konkurrieren also über die ganze Spielzeit um
 * dieselben Splitter, statt dass eine die andere ab Stunde 3 trivialisiert.
 */
import type { SpecialKind } from './heroes';

/**
 * Die acht Spezial-Sorten — der vollständige Roll-Pool, in Anzeigereihenfolge.
 * Bewusst hier und nicht in `heroes.ts`: So bleibt die Abhängigkeit einseitig
 * (`heroes` → `retrain`) und der Pool hat genau EINE Definition.
 */
export const SPECIAL_KINDS: readonly SpecialKind[] = [
  'gold',
  'crit',
  'critdmg',
  'boss',
  'combo',
  'beat',
  'ekstase',
  'idle',
];

const SPECIAL_SET: ReadonlySet<string> = new Set<string>(SPECIAL_KINDS);

/** Type-Guard: ist `v` eine echte Spezial-Sorte (nie `power`, nie Müll)? */
export function isSpecialKind(v: unknown): v is SpecialKind {
  return typeof v === 'string' && SPECIAL_SET.has(v);
}

/**
 * Die Override-Map: Mitglied → Stufen-Index (1-basiert, als String-Schlüssel wie
 * jede JSON-Map) → umgeschulte Sorte. Leer heißt „alles Stock-Sorte"; ein
 * fehlender Eintrag ist niemals ein Fehler, sondern der Normalfall.
 */
export type CrewRetrain = Record<string, Record<string, SpecialKind>>;

/** Frische (leere) Override-Map. */
export function createRetrain(): CrewRetrain {
  return {};
}

/**
 * Rolls je Mitglied in der LAUFENDEN Aszension — treibt allein die
 * Kosten-Eskalation. Run-Zustand: Jeder der drei Resets lässt ihn fallen,
 * während die Overrides selbst bleiben.
 */
export type RetrainRolls = Record<string, number>;

/** Frischer (leerer) Roll-Zähler. */
export function createRetrainRolls(): RetrainRolls {
  return {};
}

/** Die umgeschulte Sorte eines Slots, oder `null` für „Stock-Sorte". */
export function retrainedKind(retrain: CrewRetrain, id: string, tier: number): SpecialKind | null {
  const t = Math.max(1, Math.floor(tier));
  const k = retrain[id]?.[String(t)];
  return isSpecialKind(k) ? k : null;
}

/** Eine gezählte Menge sanieren: nicht-negative ganze Zahl, sonst 0. */
function count(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Wie oft `id` in dieser Aszension schon gerollt hat (0 = noch nie). */
export function retrainRollCount(rolls: RetrainRolls, id: string): number {
  return count(rolls[id]);
}

// ---------------------------------------------------------------------------
// Kosten
// ---------------------------------------------------------------------------

/** 🧩-Preis des ERSTEN Rolls auf dem ersten Spezial-Slot eines Mitglieds. */
export const RETRAIN_BASE_COST = 40;
/** Verdopplung je Spezial-Slot (Slot 1 → 40, Slot 2 → 80, Slot 3 → 160, …). */
export const RETRAIN_SLOT_GROWTH = 2;
/** Verdopplung je weiterem Roll am selben Mitglied in derselben Aszension. */
export const RETRAIN_ROLL_GROWTH = 2;
/**
 * Deckel für beide Exponenten. Rein defensiv: Ein Save mit absurden Zahlen (oder
 * ein Mitglied auf Level 100 000) darf keinen `Infinity`-Preis erzeugen, denn ein
 * `Infinity > shards`-Vergleich wäre zwar korrekt, ein `NaN` im UI-Text aber nicht.
 */
export const RETRAIN_MAX_EXP = 20;

/**
 * 🧩-Preis eines Rolls: `40 · 2^(Slot−1) · 2^(bisherige Rolls)`. `slot` ist die
 * 1-basierte Nummer des Spezial-Slots innerhalb des Mitglieds (`retrainSlotOrdinal`
 * in `heroes.ts`), `rolls` die Anzahl bereits bezahlter Rolls an DIESEM Mitglied in
 * der laufenden Aszension. Ein Slot ≤ 0 (also gar kein Spezial-Slot) liefert 0 —
 * der Aufrufer prüft das ohnehin, aber die Funktion wirft nie.
 */
export function retrainCost(slot: number, rolls: number): number {
  const s = Math.floor(slot);
  if (!Number.isFinite(s) || s <= 0) return 0;
  const slotExp = Math.min(RETRAIN_MAX_EXP, s - 1);
  const rollExp = Math.min(RETRAIN_MAX_EXP, count(rolls));
  return (
    RETRAIN_BASE_COST *
    Math.pow(RETRAIN_SLOT_GROWTH, slotExp) *
    Math.pow(RETRAIN_ROLL_GROWTH, rollExp)
  );
}

// ---------------------------------------------------------------------------
// Das Angebot (Guardrail: kein Blind-Roll)
// ---------------------------------------------------------------------------

/** Ein bezahltes Angebot: zwei Alternativen zur aktuellen Sorte. */
export interface RetrainOffer {
  /** Die beiden angebotenen Sorten — nie die aktuelle, nie zweimal dieselbe. */
  readonly kinds: readonly [SpecialKind, SpecialKind];
}

/**
 * Zwei ZUFÄLLIGE Alternativen zur aktuellen Sorte, gezogen aus zwei Floats des
 * seeded RNG-Stroms (`rng.next()`). Die aktuelle Sorte fällt vor der ersten
 * Ziehung aus dem Pool, die erste gezogene vor der zweiten — beide Angebote sind
 * damit garantiert voneinander UND von der aktuellen Sorte verschieden. Rein über
 * `(current, r1, r2)`, also im Test exakt vorhersagbar.
 *
 * Kaputte/entartete Floats (NaN, ≥ 1, negativ) werden in den gültigen Bereich
 * geklemmt, statt `undefined` zurückzugeben — ein Angebot muss immer existieren.
 */
export function retrainOffers(current: SpecialKind, r1: number, r2: number): RetrainOffer {
  const pool = SPECIAL_KINDS.filter((k) => k !== current);
  const pick = (xs: readonly SpecialKind[], r: number): number => {
    const f = Number.isFinite(r) ? Math.min(0.999999, Math.max(0, r)) : 0;
    return Math.min(xs.length - 1, Math.floor(f * xs.length));
  };
  const i = pick(pool, r1);
  const first = pool[i];
  const rest = pool.filter((_, n) => n !== i);
  const second = rest[pick(rest, r2)];
  return { kinds: [first, second] };
}

// ---------------------------------------------------------------------------
// Buchen (pur, immer eine NEUE Map)
// ---------------------------------------------------------------------------

/**
 * Einen Slot auf `kind` umschreiben. Liefert eine NEUE Map (die alte bleibt
 * stehen). Der Aufrufer stellt sicher, dass `tier` wirklich ein Spezial-Slot des
 * Mitglieds ist — `repairCrewRetrain` wirft beim Laden alles andere ohnehin raus.
 */
export function applyRetrain(
  retrain: CrewRetrain,
  id: string,
  tier: number,
  kind: SpecialKind,
): CrewRetrain {
  const t = String(Math.max(1, Math.floor(tier)));
  return { ...retrain, [id]: { ...(retrain[id] ?? {}), [t]: kind } };
}

/**
 * Einen bezahlten Roll am Mitglied `id` verbuchen (die Eskalation für den
 * NÄCHSTEN Roll). Liefert einen NEUEN Zähler.
 */
export function noteRetrainRoll(rolls: RetrainRolls, id: string): RetrainRolls {
  return { ...rolls, [id]: retrainRollCount(rolls, id) + 1 };
}
