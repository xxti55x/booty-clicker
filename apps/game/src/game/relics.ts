/**
 * **Relikte** (IDEEN-GAMEPLAY 1c) — der Endgame-Loot oberhalb der Mythos-Truhen.
 *
 * Ab Bühne {@link RELIC_MIN_ZONE} lässt ein Boss-Gate selten ein **Relikt**
 * fallen: ein sammelbares Stück mit ein bis zwei gerollten Affixen aus dem
 * geteilten Pool (`affixes.ts` — derselbe, aus dem die Skin-Schmiede zieht).
 * Drei **Trage-Slots** entscheiden, welche davon wirken; der Rest bleibt
 * Sammlung (oder wandert als {@link meltRelicEmber} in die Schmiede-Glut).
 *
 * ## Die Drop-Regel: FRONTIER-Gates, nicht Farm-Gates
 *
 * Ein Relikt fällt nur an einem Boss-Gate, das **tiefer liegt als jedes Gate,
 * das je gewürfelt hat** ({@link RelicsState.deepestGate}). Drei Gründe:
 *
 *  1. **Gegen den Farm-Exploit.** Das Spiel erlaubt `travelTo` auf jede
 *     geclerte Bühne und `challengeBoss` direkt am Gate. Ohne den Highwater
 *     könnte man Bühne 50 endlos wiederholen und alle 30 Sekunden würfeln —
 *     die Drop-Rate wäre dann nicht „selten", sondern „so oft du willst".
 *  2. **Gegen die Prestige-Wäsche.** Der Zähler ist ein Lebenszeit-Highwater
 *     wie `gear.zoneEver` und fällt bei KEINEM der drei Resets. Eine
 *     Transzendenz würde sonst die ganze Leiter 50…∞ neu auszahlen.
 *  3. **Weil der Bot dann dieselbe Zahl misst wie das Spiel.** Die Sim gattert
 *     ihren Loot ohnehin auf den Frontier (`stepSecond`, dokumentiertes
 *     Modell) — mit derselben Regel im Spiel ist die gemessene Drop-Kurve
 *     keine Untergrenze mehr, sondern die Wahrheit.
 *
 * Die Kehrseite ist gewollt: Relikte belohnen **Vorstoß**, nicht Sitzfleisch.
 * Wer an seiner Wand farmt, sammelt Splitter und Truhen; wer eine Bühne tiefer
 * kommt, bekommt vielleicht ein Relikt.
 *
 * ## Rate + Pity (gemessen, siehe `npm run balance` Abschnitt 11)
 *
 * {@link RELIC_DROP_CHANCE} = 25 % je neuem Gate, garantiert spätestens am
 * {@link RELIC_PITY}. Erwartungswert daraus: **ein Relikt je ~2,73 neue Gates**,
 * also je ~14 Bühnen Vorstoß. Weil ein Gate nur EINMAL im Leben würfelt, ist das
 * zugleich die Obergrenze — die Kurve hängt an der TIEFE, nicht an der Spielzeit:
 *
 * | tiefste Bühne | Gates ≥ 50 | ⇒ Relikte |
 * | ------------- | ---------- | --------- |
 * | 80 (E2-Wand)  | 6          | ~2        |
 * | 100           | 10         | ~4        |
 * | 150           | 20         | ~7        |
 * | 300           | 50         | ~18       |
 *
 * Die drei Trage-Slots sind damit um Bühne ~90 gefüllt, und alles danach ist
 * Verbesserung statt Erstausstattung. Genau das meint „Endgame-Loot oberhalb
 * der Mythos-Truhen": Das System startet, wo die Truhen-Leiter aufhört, und es
 * bezahlt Vorstoß statt Sitzfleisch.
 */
import {
  type RolledAffix,
  type RollSource,
  RELIC_SLOTS,
  SHARED_AFFIXES,
  affixValue,
  clampQuality,
  isAffixId,
  rollAffix,
} from './affixes';

// ---------------------------------------------------------------------------
// Der Zustand
// ---------------------------------------------------------------------------

/** Ein gefundenes Relikt. */
export interface Relic {
  /** Stabile, monoton vergebene Id — die Trage-Slots zeigen darauf. */
  readonly id: number;
  /** Das Boss-Gate, an dem es fiel (Anzeige + Sortierung). */
  readonly zone: number;
  /** Ein oder zwei gerollte Affixe (nie zwei derselben Sorte). */
  readonly affixes: readonly RolledAffix[];
}

/** Die persistierte Relikt-Slice (CH-Save v17). */
export interface RelicsState {
  /** Die Sammlung — jedes je gefundene, nicht eingeschmolzene Relikt. */
  owned: Relic[];
  /** Die drei Trage-Slots: Relikt-Id oder 0 („leer"). */
  slots: number[];
  /** Nächste freie Id (monoton, damit gelöschte Ids nie recycelt werden). */
  nextId: number;
  /** Gates ohne Drop seit dem letzten Relikt (Pity-Zähler). */
  pity: number;
  /**
   * Tiefstes Boss-Gate, das schon einmal gewürfelt hat. Lebenszeit-Highwater —
   * die eine Zahl, die Farm-Wiederholungen und Prestige-Resets aussperrt.
   */
  deepestGate: number;
}

/** Eine frische (leere) Relikt-Slice. */
export function createRelics(): RelicsState {
  return {
    owned: [],
    slots: new Array<number>(RELIC_SLOTS).fill(0),
    nextId: 1,
    pity: 0,
    deepestGate: 0,
  };
}

// ---------------------------------------------------------------------------
// Die Drop-Regel
// ---------------------------------------------------------------------------

/** Ab dieser Bühne würfeln Boss-Gates überhaupt auf Relikte. */
export const RELIC_MIN_ZONE = 50;
/** Basis-Chance je NEUEM Gate. */
export const RELIC_DROP_CHANCE = 0.25;
/**
 * Spätestens das `RELIC_PITY`-te berechtigte Gate liefert garantiert ein Relikt.
 * Bewusst dieselbe Zahl wie `chests.PITY_DIAMOND` — beide schützen einen
 * SELTENEN Zug, und ein Spieler, der die Truhen-Garantie schon kennt, muss die
 * Relikt-Garantie nicht neu lernen.
 */
export const RELIC_PITY = 4;

/**
 * Ist `zone` ein Gate, das jetzt würfeln darf? Boss-Bühne (Vielfaches von 5),
 * mindestens {@link RELIC_MIN_ZONE}, und tiefer als alles, was schon gewürfelt
 * hat. Rein und nie werfend.
 */
export function relicGateEligible(r: RelicsState, zone: number): boolean {
  if (!Number.isFinite(zone) || zone < RELIC_MIN_ZONE || zone % 5 !== 0) return false;
  return zone > relicDeepestGate(r);
}

/** Der sanierte Gate-Highwater (0 für alles Kaputte). */
export function relicDeepestGate(r: RelicsState): number {
  const v = r.deepestGate;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Der sanierte Pity-Zähler. */
export function relicPity(r: RelicsState): number {
  const v = r.pity;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Fällt an diesem Gate ein Relikt? `pity + 1 >= RELIC_PITY` erzwingt es,
 * sonst entscheidet `r` gegen {@link RELIC_DROP_CHANCE} — dieselbe Form wie
 * `chests.openChest` (Zähler hoch, beim Treffer auf 0). Rein über
 * `(pity, rngFloat)`.
 */
export function relicDropHits(pity: number, rngFloat: number): boolean {
  return relicPity({ pity } as RelicsState) + 1 >= RELIC_PITY || rngFloat < RELIC_DROP_CHANCE;
}

/**
 * Chance auf ZWEI Affixe statt einem, wachsend mit der Tiefe des Gates: 30 % auf
 * Bühne 50, +2 pp je zehn Bühnen, gedeckelt bei 60 % (ab Bühne 200). Das ist die
 * einzige Stelle, an der Tiefe die Qualität des Loots hebt — die Affixe selbst
 * rollen überall aus demselben Katalog, sonst wäre ein früh gefundenes Relikt
 * nach zwei Aszensionen Müll.
 */
export function twoAffixChance(zone: number): number {
  if (!Number.isFinite(zone)) return 0.3;
  return Math.min(0.6, 0.3 + Math.max(0, zone - RELIC_MIN_ZONE) / 500);
}

/**
 * Ein Relikt für Gate `zone` würfeln: Affix-Anzahl nach {@link twoAffixChance},
 * dann je Affix Sorte + Qualität aus dem GETEILTEN Pool. Das zweite Affix zieht
 * aus dem Pool OHNE die erste Sorte — zwei „Hüftschwung" auf einem Stück wären
 * nur eine verdoppelte Zahl mit doppelter Zeile.
 *
 * Zieht 1 + 2·n Floats aus `rng` (Anzahl, dann Sorte/Qualität je Affix) — also
 * derselbe persistierte Strom wie Krits, Truhen und Vergoldungen, und damit
 * save-scum-fest.
 */
export function rollRelic(id: number, zone: number, rng: RollSource): Relic {
  const two = rng.next() < twoAffixChance(zone);
  const first = rollAffix(SHARED_AFFIXES, rng.next(), rng.next());
  const affixes: RolledAffix[] = [first];
  if (two) {
    const rest = SHARED_AFFIXES.filter((a) => a.id !== first.id);
    affixes.push(rollAffix(rest, rng.next(), rng.next()));
  }
  return { id, zone: Math.max(0, Math.floor(zone)), affixes };
}

/** Das Ergebnis eines Gate-Wurfs: die neue Slice + das gefallene Relikt (oder `null`). */
export interface RelicDrop {
  readonly relics: RelicsState;
  readonly relic: Relic | null;
}

/**
 * Ein Boss-Gate abarbeiten: Highwater setzen, würfeln, bei einem Treffer das
 * Relikt anlegen und den Pity zurücksetzen. Ist das Gate nicht berechtigt
 * (zu flach, keine Boss-Bühne, schon gewürfelt), passiert GAR NICHTS und
 * dieselbe Referenz kommt zurück — der Aufrufer kann sich dann den Persist
 * sparen.
 *
 * Rein bis auf den `rng`-Cursor; die Slice wird immer NEU gebaut (nie mutiert).
 */
export function gateRelicRoll(r: RelicsState, zone: number, rng: RollSource): RelicDrop {
  if (!relicGateEligible(r, zone)) return { relics: r, relic: null };
  const gate = Math.floor(zone);
  const pity = relicPity(r);
  const hit = relicDropHits(pity, rng.next());
  if (!hit) {
    return { relics: { ...r, deepestGate: gate, pity: pity + 1 }, relic: null };
  }
  const relic = rollRelic(relicNextId(r), gate, rng);
  return {
    relics: {
      ...r,
      owned: [...r.owned, relic],
      nextId: relic.id + 1,
      pity: 0,
      deepestGate: gate,
    },
    relic,
  };
}

/** Die nächste freie Id (immer über allem, was die Sammlung schon trägt). */
export function relicNextId(r: RelicsState): number {
  const stored = Number.isFinite(r.nextId) && r.nextId > 0 ? Math.floor(r.nextId) : 1;
  let max = 0;
  for (const rel of r.owned) if (rel.id > max) max = rel.id;
  return Math.max(stored, max + 1);
}

// ---------------------------------------------------------------------------
// Tragen
// ---------------------------------------------------------------------------

/** Das Relikt mit dieser Id (`null`, wenn es die Sammlung nicht kennt). */
export function relicById(r: RelicsState, id: number): Relic | null {
  if (!(id > 0)) return null;
  return r.owned.find((rel) => rel.id === id) ?? null;
}

/** Das Relikt in Trage-Slot `slot` (`null` = leer). */
export function relicInSlot(r: RelicsState, slot: number): Relic | null {
  const id = r.slots[slot];
  return typeof id === 'number' ? relicById(r, id) : null;
}

/** Trägt der Spieler dieses Relikt gerade? */
export function isRelicEquipped(r: RelicsState, id: number): boolean {
  return r.slots.includes(id);
}

/**
 * Ein Relikt in `slot` legen. Trägt der Spieler es bereits in einem ANDEREN
 * Slot, tauschen die beiden Slots ihren Inhalt (statt dass dasselbe Stück
 * doppelt zählt) — das ist der einzige Weg, wie ein Relikt zweimal wirken
 * könnte, und er ist hier zu. `id = 0` leert den Slot.
 */
export function equipRelic(r: RelicsState, slot: number, id: number): RelicsState {
  if (!Number.isInteger(slot) || slot < 0 || slot >= RELIC_SLOTS) return r;
  if (id !== 0 && relicById(r, id) === null) return r;
  const slots = [...r.slots];
  const prev = slots[slot] ?? 0;
  const other = slots.indexOf(id);
  if (id !== 0 && other >= 0 && other !== slot) slots[other] = prev;
  slots[slot] = id;
  return { ...r, slots };
}

/** Die Affixe ALLER getragenen Relikte — die Liste, die in den Fold geht. */
export function equippedRelicAffixes(r: RelicsState): readonly RolledAffix[] {
  const out: RolledAffix[] = [];
  for (let s = 0; s < RELIC_SLOTS; s++) {
    const rel = relicInSlot(r, s);
    if (rel) out.push(...rel.affixes);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Einschmelzen (die Brücke zu 3a)
// ---------------------------------------------------------------------------

/** Glut je Affix eines eingeschmolzenen Relikts. */
export const EMBER_PER_AFFIX = 2;
/** Zusätzliche Glut je Qualitätsstufe eines Affixes. */
export const EMBER_PER_QUALITY = 2;

/**
 * Was ein Relikt beim Einschmelzen einbringt: je Affix
 * `EMBER_PER_AFFIX + EMBER_PER_QUALITY · Qualität`. Ein einzelnes grobes Affix
 * zahlt also 2 🔥, ein zweifach makelloses 16 🔥 — genug für einen Reforge auf
 * Slot 1, aber nie genug, um die Schmiede allein aus Relikten zu finanzieren.
 * Genau so schließt sich der Kreis zwischen 1c und 3a: Überzähliger Loot wird
 * zum Rohstoff für den Loot, den man behalten will.
 */
export function meltRelicEmber(relic: Relic): number {
  let n = 0;
  for (const a of relic.affixes) n += EMBER_PER_AFFIX + EMBER_PER_QUALITY * clampQuality(a.q);
  return n;
}

/**
 * Ein Relikt einschmelzen: aus der Sammlung nehmen und aus jedem Trage-Slot
 * lösen. Liefert die neue Slice + die gutgeschriebene Glut; ein unbekanntes
 * Relikt lässt alles unverändert (Rückgabe: dieselbe Referenz, 0 Glut).
 */
export function meltRelic(r: RelicsState, id: number): { relics: RelicsState; ember: number } {
  const relic = relicById(r, id);
  if (!relic) return { relics: r, ember: 0 };
  return {
    relics: {
      ...r,
      owned: r.owned.filter((rel) => rel.id !== id),
      slots: r.slots.map((s) => (s === id ? 0 : s)),
    },
    ember: meltRelicEmber(relic),
  };
}

// ---------------------------------------------------------------------------
// Vergleichen (Anzeige-Sortierung + die Auto-Wahl des Bots)
// ---------------------------------------------------------------------------

/**
 * Eine EINZIGE Vergleichszahl je Relikt: die Summe seiner Affix-Werte, jeweils
 * normiert auf die Basis ihrer Sorte. Damit zählt ein makelloses Affix (×1.25)
 * mehr als ein grobes (×0.5), ohne dass Prozent-Terme (0.04) und
 * Sekunden-Terme (0.08 s) gegeneinander verrechnet würden — die Zahl misst
 * „wie gut gerollt", nicht „wie viel Macht".
 *
 * Sie sortiert die Sammlung in der UI und entscheidet im Bot, welche drei
 * Relikte getragen werden. Bewusst KEIN Macht-Modell: Welches Affix WERTVOLL
 * ist, hängt am Build, und ein Bot, der das optimiert, wäre schneller als jeder
 * Spieler (dieselbe Untergrenzen-Logik wie überall im Sim).
 */
export function relicScore(relic: Relic): number {
  let s = 0;
  for (const a of relic.affixes) {
    const cfg = SHARED_AFFIXES.find((c) => c.id === a.id);
    const base = cfg?.base ?? 0;
    s += base > 0 ? affixValue(a) / base : 0;
  }
  return s;
}

/**
 * Die drei besten Relikte der Sammlung tragen (nach {@link relicScore}). Die
 * Auto-Wahl des Bots — und im Spiel der Knopf „Beste tragen", damit niemand
 * eine Sammlung von Hand durchsortieren muss, um den offensichtlichen Fall zu
 * treffen. Bei Gleichstand entscheidet die kleinere Id (älter zuerst), damit
 * die Wahl deterministisch bleibt.
 */
export function equipBestRelics(r: RelicsState): RelicsState {
  const ranked = [...r.owned].sort((a, b) => relicScore(b) - relicScore(a) || a.id - b.id);
  const slots = new Array<number>(RELIC_SLOTS).fill(0);
  for (let i = 0; i < Math.min(RELIC_SLOTS, ranked.length); i++) slots[i] = ranked[i].id;
  return { ...r, slots };
}

/** Ist der Eintrag ein plausibles Affix-Paar? (Reparatur + Import-Prüfung.) */
export function isRolledAffix(v: unknown): v is RolledAffix {
  return (
    typeof v === 'object' &&
    v !== null &&
    isAffixId((v as { id?: unknown }).id) &&
    typeof (v as { q?: unknown }).q === 'number'
  );
}
