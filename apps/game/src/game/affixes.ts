/**
 * **Der geteilte Affix-Pool** (IDEEN-GAMEPLAY 1c + 3a) — die eine Quelle, aus der
 * sowohl die **Relikte** (`relics.ts`) als auch die **Skin-Schmiede** (`forge.ts`)
 * ziehen.
 *
 * Ein Affix ist ein PAAR aus Sorte und Qualität — mehr steht nie im Save. Der
 * WERT wird immer gerechnet ({@link affixValue}), nie gespeichert: Ein Katalog,
 * der sich ändert, ändert damit rückwirkend jedes getragene Affix, statt einen
 * Save mit eingefrorenen Zahlen zu hinterlassen, den niemand mehr nachrechnen
 * kann. Dasselbe Prinzip wie bei den Skin-Buffs (`SKINS[id].buff.perLevel · Level`).
 *
 * ## Der Pool: 9 geteilte + 3 skin-exklusive
 *
 * Die neun geteilten Sorten decken genau die Terme ab, die das Spiel ohnehin
 * kennt (und die `gear.ts` schon als {@link BuffStat} führt) — Klick, Crew-DPS,
 * BP, Boss-Schaden, Krit-Chance, Krit-Schaden, Combo-Fenster, Offline-Rate,
 * Truhen-Luck. Kein Affix erfindet einen neuen Rechenweg; jedes fällt in einen
 * Term, der schon existiert, und wird dort ADDIERT wie ein Skin-Buff.
 *
 * Dazu drei **skin-exklusive** Sorten als Beweis des Musters: Sie erscheinen nur
 * im Pool des Skins, dem sie gehören, und sie zahlen etwa das Doppelte ihres
 * geteilten Gegenstücks — der Preis dafür ist, dass sie nur wirken, solange
 * GENAU DIESER Skin getragen wird (die Schmiede-Slots eines nicht ausgerüsteten
 * Skins falten ×1, exakt wie `gearBonus` nur den aktiven Skin liest).
 *
 * ## Qualität (die dokumentierte Spanne)
 *
 * Vier Stufen mit festen Faktoren auf den Basiswert — Grob ×0.4, Solide ×0.6,
 * Fein ×0.8, Makellos ×1.0 — und den Gewichten 45 / 30 / 18 / 7. Der BASISWERT
 * ist damit zugleich der Höchstwert („Makellos" = die volle Basis), ein
 * Makellos-Roll ist 7 % wahrscheinlich und exakt **2,5-mal** so stark wie ein
 * Grob-Roll. Die Basiswerte sind so gewählt, dass jede Qualitätsstufe eine
 * runde Zahl ergibt (Basis 0.04 ⇒ 1,6 / 2,4 / 3,2 / 4,0 %), damit die UI keine
 * Zahlen wie „3,75 %" zeigen muss.
 *
 * ## Das Budget (die harte Leitplanke)
 *
 * Höchstfall sind **9 Affixe**: drei Relikt-Slots à bis zu zwei Affixen plus drei
 * Schmiede-Slots à einem. Zwei Deckel halten das im Rahmen:
 *
 *  1. **{@link AFFIX_STAT_CAP} je Term** (+75 %, also ×1.75) — ein STRUKTURELLER
 *     Deckel im Fold, keine Arithmetik, die zufällig aufgeht. Wer alle neun
 *     Affixe auf denselben Term stapelt, landet bei ×1.75, nicht bei ×2.05.
 *  2. **{@link affixPowerBudget}** — das Produkt der Standard-Terme im
 *     bestmöglichen Verteilungsfall (gerechnet, nicht geschätzt, siehe dort).
 *
 * Beide Zahlen frieren Tests ein, und `npm run balance` druckt sie in
 * Abschnitt 11 — dieselbe Disziplin wie `constellationPowerBudget` (2a) und
 * `territoryPowerBudget` (1b).
 *
 * Alles hier ist pur und DOM-frei.
 */
import { type GearBonus, PERCENT_STATS, emptyGearBonus } from './gear';
import { CRIT_CHANCE, CRIT_CHANCE_CAP, CRIT_MULT } from './click';
import type { BuffStat, SkinKey } from '../types';

// ---------------------------------------------------------------------------
// Qualität
// ---------------------------------------------------------------------------

/** Eine Qualitätsstufe: Anzeige-Name, Wert-Faktor, Ziehungs-Gewicht. */
export interface QualityConfig {
  readonly name: string;
  /** Faktor auf den Basiswert des Affixes. */
  readonly factor: number;
  /** Gewicht in der Ziehung (Summe 100 ⇒ die Zahl IST die Prozentchance). */
  readonly weight: number;
  /** Kurzzeichen für enge Kacheln. */
  readonly mark: string;
}

/**
 * Die vier Qualitätsstufen, schwächste zuerst. Der Index IST die Stufe
 * (0…3) — er steht so im Save und trägt das Qualitäts-Pity.
 */
export const QUALITIES: readonly QualityConfig[] = [
  { name: 'Grob', factor: 0.4, weight: 45, mark: '◦' },
  { name: 'Solide', factor: 0.6, weight: 30, mark: '◍' },
  { name: 'Fein', factor: 0.8, weight: 18, mark: '◉' },
  { name: 'Makellos', factor: 1.0, weight: 7, mark: '✦' },
];

/** Höchste Qualitätsstufe (Index in {@link QUALITIES}). */
export const MAX_QUALITY = QUALITIES.length - 1;

/** Eine Qualitätsstufe auf den gültigen Bereich klemmen (nie werfend). */
export function clampQuality(q: unknown): number {
  if (typeof q !== 'number' || !Number.isFinite(q)) return 0;
  return Math.max(0, Math.min(MAX_QUALITY, Math.floor(q)));
}

/** Die Anzeige-Daten einer Qualitätsstufe (geklemmt, also immer definiert). */
export function qualityConfig(q: number): QualityConfig {
  return QUALITIES[clampQuality(q)];
}

// ---------------------------------------------------------------------------
// Der Katalog
// ---------------------------------------------------------------------------

/** Ein Affix im Katalog (reine Daten). */
export interface AffixConfig {
  readonly id: string;
  readonly name: string;
  /** Der Term, in den der Wert fällt — dieselben Stats wie beim Gear. */
  readonly stat: BuffStat;
  /** Wert bei Qualität „Fein" (Faktor 1.0); alle anderen Stufen skalieren davon. */
  readonly base: number;
  /**
   * Nur für DIESEN Skin ziehbar (skin-exklusiv). Fehlt ⇒ geteilter Pool, den
   * Relikte UND jede Schmiede sehen.
   */
  readonly skin?: SkinKey;
  /** Kurzzeichen in der Stroke-/Glyphen-Sprache der Slot-Kacheln. */
  readonly glyph: string;
}

/**
 * **Der Katalog.** Neun geteilte Sorten, danach die drei skin-exklusiven.
 *
 * Die Basiswerte sind gegen die bestehenden Machtquellen geeicht, nicht geraten:
 * Ein makelloses Klick-Affix zahlt +4 % — halb so viel wie EIN Level des
 * Klassiker-Skins (+8 %/Lv), und ein Skin trägt bis zu 50 Level. Die neun
 * Affixe eines Voll-Ausbaus sind damit ungefähr so stark wie fünf Skin-Level:
 * spürbar, aber nie die Hauptquelle. Drei Sorten weichen davon bewusst ab:
 *
 *  · **Boss-Schaden** trägt die doppelte Basis (0.08), weil er gegen sehr große
 *    bestehende Faktoren läuft (der Tyrann-Skin zahlt auf Lv 50 allein +600 %)
 *    und ein 4-%-Häppchen dort unsichtbar wäre.
 *  · **Krit-Schaden** rechnet in MULTIPLIKATOR-PUNKTEN, nicht in Prozent: Das
 *    Spiel addiert `critMultBonus` auf `CRIT_MULT` (5), genau wie der
 *    Lava-Skin (+0.06/Lv) und der Disco-Stern (+0.05/⭐). 0.2 Punkte je Affix
 *    liegen also zwischen einem Disco-Stern und vier Lava-Leveln.
 *  · **Offline-Rate** trägt die HALBE Basis (0.02), weil sie als einzige gegen
 *    eine harte Schranke läuft (100 % Effizienz) — dieselbe Überlegung, mit der
 *    2a sein Offline-Budget getrennt auf ×1.35 gedeckelt hat.
 *
 * Die drei skin-exklusiven Sorten zahlen auf Terme, die das Leistungs-Produkt
 * bewusst NICHT enthält (Boss-Schaden, Twerk-Coach-cps) oder nur mit kleinem
 * Hebel (Krit-Chance). Das ist kein Zufall: Sie sind die stärksten Rolls des
 * Katalogs, und ein starker Roll auf einem Term, der sich mit allen anderen
 * multipliziert, hätte das Budget gesprengt (gemessen: eine frühere Fassung mit
 * skin-exklusivem +8 % Crew-DPS landete bei ×1.58 statt ×1.43).
 */
export const AFFIXES: readonly AffixConfig[] = [
  { id: 'click', name: 'Hüftschwung', stat: 'clickPct', base: 0.04, glyph: '✋' },
  { id: 'dps', name: 'Crew-Groove', stat: 'dpsPct', base: 0.04, glyph: '≣' },
  { id: 'gold', name: 'Trinkgeld', stat: 'goldPct', base: 0.04, glyph: '◎' },
  { id: 'boss', name: 'Gate-Brecher', stat: 'bossDmg', base: 0.08, glyph: '♛' },
  { id: 'crit', name: 'Glückstreffer', stat: 'critChance', base: 0.01, glyph: '⚡' },
  { id: 'critdmg', name: 'Wuchtschlag', stat: 'critMult', base: 0.2, glyph: '✸' },
  { id: 'combo', name: 'Langer Atem', stat: 'comboWindow', base: 0.1, glyph: '∞' },
  { id: 'offline', name: 'Nachtschwärmer', stat: 'offlineRate', base: 0.02, glyph: '☾' },
  { id: 'luck', name: 'Spürnase', stat: 'chestLuck', base: 0.04, glyph: '🔍' },
  // ---- skin-exklusiv: nur im Pool ihres Skins ----
  { id: 'sequin', name: 'Sequin-Crit', stat: 'critChance', base: 0.02, skin: 'disco', glyph: '✧' },
  { id: 'glut', name: 'Glut-DoT', stat: 'bossDmg', base: 0.16, skin: 'lava', glyph: '🔥' },
  { id: 'servo', name: 'Servo-Takt', stat: 'coachCps', base: 0.2, skin: 'robo', glyph: '⚙' },
];

const AFFIX_BY_ID: Record<string, AffixConfig> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/** Die geteilten (nicht skin-gebundenen) Sorten — der Relikt-Pool. */
export const SHARED_AFFIXES: readonly AffixConfig[] = AFFIXES.filter((a) => a.skin === undefined);

/** Der Katalog-Eintrag einer Sorte (`undefined` für alles Unbekannte). */
export function affixConfig(id: string): AffixConfig | undefined {
  return AFFIX_BY_ID[id];
}

/** Type-Guard: ist `id` eine echte Affix-Sorte des Katalogs? */
export function isAffixId(id: unknown): id is string {
  return typeof id === 'string' && Object.hasOwn(AFFIX_BY_ID, id);
}

/**
 * Der Ziehungs-Pool einer **Schmiede** auf `skin`: die neun geteilten Sorten
 * plus die eine skin-exklusive dieses Skins (falls es eine gibt). Genau das
 * meint „derselbe Pool wie die Relikte, plus wenige skin-exklusive".
 */
export function forgePool(skin: string): readonly AffixConfig[] {
  const own = AFFIXES.filter((a) => a.skin === skin);
  return own.length > 0 ? [...SHARED_AFFIXES, ...own] : SHARED_AFFIXES;
}

// ---------------------------------------------------------------------------
// Das gerollte Affix
// ---------------------------------------------------------------------------

/**
 * Ein gerolltes Affix, wie es im Save steht: Sorte + Qualitätsstufe. Der Wert
 * ist eine FUNKTION dieser beiden (siehe {@link affixValue}) und wird nie
 * persistiert.
 */
export interface RolledAffix {
  /** Katalog-Id der Sorte. */
  readonly id: string;
  /** Qualitätsstufe 0…{@link MAX_QUALITY}. */
  readonly q: number;
}

/** Der Wert eines gerollten Affixes: Basis × Qualitätsfaktor. 0 für Müll-Ids. */
export function affixValue(a: RolledAffix): number {
  const cfg = AFFIX_BY_ID[a.id];
  if (!cfg) return 0;
  return cfg.base * qualityConfig(a.q).factor;
}

/** Der Term, in den ein gerolltes Affix fällt (`null` für Müll-Ids). */
export function affixStat(a: RolledAffix): BuffStat | null {
  return AFFIX_BY_ID[a.id]?.stat ?? null;
}

// ---------------------------------------------------------------------------
// Ziehen
// ---------------------------------------------------------------------------

/**
 * Alles, was ein Wurf braucht: ein Strom von Floats in [0,1). `util/rng.Rng`
 * erfüllt das, aber die Loot-Module verlangen bewusst NUR diese eine Methode —
 * so kann der Dialog den persistierten Spiel-Strom durchreichen, ohne dass die
 * pure Schicht die RNG-Klasse importieren müsste.
 */
export interface RollSource {
  next(): number;
}

/**
 * Eine Qualitätsstufe aus `r` ∈ [0,1) ziehen, **niemals unter `minQ`**. Die
 * Gewichte der ausgeschlossenen Stufen fallen weg und der Rest wird
 * renormiert — ein Mindest-Niveau macht die verbleibenden Stufen also
 * proportional wahrscheinlicher, statt die Verteilung zu verzerren.
 *
 * `minQ ≥ MAX_QUALITY` liefert deterministisch die Höchststufe: Das ist der
 * Endpunkt des Qualitäts-Pity (siehe {@link minQualityForDry}).
 */
export function rollQuality(r: number, minQ = 0): number {
  const lo = clampQuality(minQ);
  if (lo >= MAX_QUALITY) return MAX_QUALITY;
  const f = Number.isFinite(r) ? Math.min(0.999999, Math.max(0, r)) : 0;
  let total = 0;
  for (let i = lo; i <= MAX_QUALITY; i++) total += QUALITIES[i].weight;
  let x = f * total;
  for (let i = lo; i <= MAX_QUALITY; i++) {
    x -= QUALITIES[i].weight;
    if (x < 0) return i;
  }
  return MAX_QUALITY;
}

/**
 * Eine Sorte aus `pool` ziehen (gleichverteilt über die Sorten — die
 * Seltenheits-Achse ist die QUALITÄT, nicht die Sorte). Kaputte Floats werden
 * geklemmt statt `undefined` zu liefern.
 */
export function pickAffixId(pool: readonly AffixConfig[], r: number): string {
  if (pool.length === 0) return SHARED_AFFIXES[0].id;
  const f = Number.isFinite(r) ? Math.min(0.999999, Math.max(0, r)) : 0;
  return pool[Math.min(pool.length - 1, Math.floor(f * pool.length))].id;
}

/**
 * Ein vollständiges Affix ziehen: Sorte aus `pool` (Float `r1`), Qualität mit
 * Mindest-Niveau `minQ` (Float `r2`). Rein über `(pool, r1, r2, minQ)`, also im
 * Test exakt vorhersagbar.
 */
export function rollAffix(
  pool: readonly AffixConfig[],
  r1: number,
  r2: number,
  minQ = 0,
): RolledAffix {
  return { id: pickAffixId(pool, r1), q: rollQuality(r2, minQ) };
}

// ---------------------------------------------------------------------------
// Qualitäts-Pity (die exakte Regel)
// ---------------------------------------------------------------------------

/**
 * Rolls ohne Verbesserung, nach denen die Mindest-Qualität um EINE Stufe steigt.
 *
 * **Die exakte Regel.** Jeder Schmiede-Slot führt einen Trocken-Zähler `dry`:
 *
 *  · Ein bezahlter Roll, dessen ANGEBOT eine **echt höhere** Qualität hat als
 *    das gerade getragene Affix, setzt `dry` auf 0 — unabhängig davon, ob der
 *    Spieler das Angebot annimmt (bezahlt wurde der Roll, und der Wurf WAR eine
 *    Verbesserung; das Ablehnen ist eine Geschmacksfrage über die Sorte).
 *  · Jeder andere Roll (gleiche oder schlechtere Qualität) zählt `dry` um 1
 *    hoch. Ein leerer Slot zählt als Qualität −1, der erste Roll auf einen
 *    leeren Slot ist also IMMER eine Verbesserung.
 *  · Die Mindest-Qualität des nächsten Rolls ist
 *    `min(MAX_QUALITY, ⌊dry / 5⌋)`.
 *
 * Also: nach 5 trockenen Rolls kann nichts unter „Solide" mehr fallen, nach 10
 * nichts unter „Fein", nach 15 ist „Makellos" GARANTIERT. Wer Pech hat, kommt
 * spätestens mit dem 16. Roll am Ziel an — und die Trockenstrecke ist im Dialog
 * jederzeit sichtbar, damit niemand raten muss.
 */
export const QUALITY_PITY_ROLLS = 5;

/** Die Mindest-Qualität für einen Slot mit `dry` erfolglosen Rolls. */
export function minQualityForDry(dry: number): number {
  if (!Number.isFinite(dry) || dry <= 0) return 0;
  return Math.min(MAX_QUALITY, Math.floor(dry / QUALITY_PITY_ROLLS));
}

/**
 * Der neue Trocken-Zähler, nachdem `offer` gegen `current` gerollt wurde. Ein
 * leerer Slot (`null`) zählt als Qualität −1 (jeder Roll verbessert ihn).
 */
export function nextDry(dry: number, current: RolledAffix | null, offer: RolledAffix): number {
  const now = current ? clampQuality(current.q) : -1;
  return clampQuality(offer.q) > now ? 0 : Math.max(0, Math.floor(dry)) + 1;
}

// ---------------------------------------------------------------------------
// Der Fold (mit dem strukturellen Deckel)
// ---------------------------------------------------------------------------

/**
 * **Der Deckel je Term.** Egal wie viele Affixe auf denselben Stat zeigen: Der
 * Fold klemmt die Summe hier. `+0.75` heißt ×1.75 auf einem einzelnen
 * Prozent-Term — unter dem Richtwert ×2 des Ideen-Dokuments, mit Luft nach oben
 * für spätere Katalog-Änderungen.
 *
 * Warum ein STRUKTURELLER Deckel und nicht bloß passende Zahlen: Der Höchstfall
 * aus neun Affixen liegt mit dem heutigen Katalog bei +105 % Boss-Schaden
 * (6 × 10 % Relikt + 3 × 15 % Glut-DoT) — die Arithmetik allein hielte die
 * Leitplanke also NICHT. Der Deckel macht sie unabhängig vom Katalog wahr.
 *
 * Die absoluten Terme (Combo-Fenster in Sekunden, Krit-Chance in Prozentpunkten)
 * sind bewusst ausgenommen: Sie laufen in ihre eigenen, bereits existierenden
 * Schranken (`CRIT_CHANCE_CAP` = 40 %, das Combo-Fenster ist eine Gnadenfrist,
 * kein Multiplikator).
 */
export const AFFIX_STAT_CAP = 0.75;

/** Die Terme, die der Deckel klemmt — die Prozent-Stats des Gear-Folds. */
const CAPPED_STATS: ReadonlySet<string> = new Set<string>(PERCENT_STATS);

/**
 * Eine Liste gerollter Affixe in EINEN {@link GearBonus} falten: je Term
 * summiert, danach die Prozent-Terme auf {@link AFFIX_STAT_CAP} geklemmt. Pur
 * über die Liste; Müll-Ids fallen still weg (ein reparierter Save trägt keine,
 * aber der Fold läuft im Renderpfad und darf nie werfen).
 *
 * Bewusst DERSELBE Record-Typ wie `gearBonus`: Die abgeleitete Pipeline liest
 * beide über dieselben `1 + x`-Griffe, und ein Affix wirkt damit exakt wie ein
 * Skin-Buff derselben Größe — es gibt keinen zweiten Rechenweg.
 */
export function foldAffixes(list: readonly RolledAffix[]): GearBonus {
  const bonus = emptyGearBonus();
  for (const a of list) {
    const cfg = AFFIX_BY_ID[a.id];
    if (!cfg) continue;
    bonus[cfg.stat] += cfg.base * qualityConfig(a.q).factor;
  }
  for (const s of PERCENT_STATS) {
    if (bonus[s] > AFFIX_STAT_CAP) bonus[s] = AFFIX_STAT_CAP;
  }
  return bonus;
}

/** Ob `stat` vom {@link AFFIX_STAT_CAP} geklemmt wird (Anzeige/Tests). */
export function isCappedStat(stat: BuffStat): boolean {
  return CAPPED_STATS.has(stat);
}

// ---------------------------------------------------------------------------
// Das Budget
// ---------------------------------------------------------------------------

/** Relikt-Trage-Slots (1c) — drei. */
export const RELIC_SLOTS = 3;
/** Höchstzahl Affixe je Relikt (1c: „1–2 gerollte Affixe"). */
export const RELIC_MAX_AFFIXES = 2;
/** Schmiede-Slots je Skin (3a) — bis zu drei. */
export const FORGE_SLOTS = 3;

/**
 * Der Höchstfall: **9 Affixe** — drei Relikte à zwei plus drei Schmiede-Slots.
 * Diese Zahl ist die Grundlage jeder Budget-Rechnung unten.
 */
export const MAX_WORN_AFFIXES = RELIC_SLOTS * RELIC_MAX_AFFIXES + FORGE_SLOTS;

/** Der stärkste Wert, den eine Sorte je erreichen kann (Makellos). */
export function affixMaxValue(cfg: AffixConfig): number {
  return cfg.base * QUALITIES[MAX_QUALITY].factor;
}

/**
 * **Das Einzel-Term-Budget**: der höchste Faktor, den ein einzelner
 * Prozent-Term je sehen kann, wenn ALLE neun Affixe auf ihn zeigen — inklusive
 * des skin-exklusiven Affixes in den drei Schmiede-Slots.
 *
 * Ohne den {@link AFFIX_STAT_CAP} wäre das ×2.05 (Boss-Schaden: 6 × 10 % aus
 * Relikten + 3 × 15 % Glut-DoT). MIT dem Deckel ist es ×1.75, egal was im
 * Katalog steht — genau dafür ist er da. Ein Test friert die Zahl ein.
 */
export function affixSingleTermBudget(): number {
  let worst = 0;
  for (const stat of PERCENT_STATS) {
    // Bestes Relikt-Affix (nur geteilte Sorten) × 6, bestes Schmiede-Affix
    // (geteilt ODER skin-exklusiv) × 3 — der theoretische Voll-Stapel.
    const shared = Math.max(
      0,
      ...SHARED_AFFIXES.filter((a) => a.stat === stat).map((a) => affixMaxValue(a)),
    );
    const any = Math.max(0, ...AFFIXES.filter((a) => a.stat === stat).map((a) => affixMaxValue(a)));
    const sum = Math.min(
      AFFIX_STAT_CAP,
      shared * RELIC_SLOTS * RELIC_MAX_AFFIXES + any * FORGE_SLOTS,
    );
    worst = Math.max(worst, sum);
  }
  return 1 + worst;
}

/**
 * Der Krit-EV-Faktor eines Affix-Folds, gegen die echten Klick-Konstanten.
 *
 * Beide Terme folgen exakt der Pipeline des Spiels: Die Krit-CHANCE wird addiert
 * und läuft durch `CRIT_CHANCE_CAP` (40 %), der Krit-SCHADEN wird als
 * MULTIPLIKATOR-PUNKT auf `CRIT_MULT` addiert (`click.critMult(bonus)`), nicht
 * als Prozentsatz darauf — dieselbe Semantik wie beim Lava-Skin und beim
 * Disco-Stern. Ein Fold, der das verwechselt, überschätzt das Budget massiv.
 */
export function affixCritEvFactor(bonus: GearBonus): number {
  const base = 1 + CRIT_CHANCE * (CRIT_MULT - 1);
  const chance = Math.min(CRIT_CHANCE_CAP, CRIT_CHANCE + bonus.critChance);
  const mult = CRIT_MULT + bonus.critMult;
  return (1 + chance * (mult - 1)) / base;
}

/** Die Terme, die ins Leistungs-Produkt eingehen (Reihenfolge = Bin-Index). */
const BUDGET_TERMS: readonly BuffStat[] = [
  'clickPct',
  'dpsPct',
  'goldPct',
  'critChance',
  'critMult',
  'chestLuck',
];

/** Der stärkste Wert, den `stat` je aus dem erlaubten Pool bekommen kann. */
function bestValueFor(stat: BuffStat, sharedOnly: boolean): number {
  const pool = sharedOnly ? SHARED_AFFIXES : AFFIXES;
  const vals = pool.filter((a) => a.stat === stat).map((a) => affixMaxValue(a));
  return vals.length > 0 ? Math.max(...vals) : 0;
}

/** Alle Aufteilungen von `n` gleichen Plätzen auf `bins` Terme. */
function compositions(n: number, bins: number): number[][] {
  if (bins === 1) return [[n]];
  const out: number[][] = [];
  for (let k = 0; k <= n; k++) {
    for (const rest of compositions(n - k, bins - 1)) out.push([k, ...rest]);
  }
  return out;
}

/**
 * **Das Leistungs-Budget**: das PRODUKT der Standard-Terme im bestmöglichen
 * Verteilungsfall — also die Zahl, gegen die der Richtwert „≤ ×1.5 aufs Produkt
 * der Standard-Terme" läuft.
 *
 * Gerechnet, nicht geschätzt, und zwar **erschöpfend**: Die sechs Relikt-Plätze
 * (nur geteilte Sorten) und die drei Schmiede-Plätze (auch skin-exklusive)
 * werden über ALLE Aufteilungen auf die sechs Produkt-Terme durchprobiert —
 * 462 × 56 = 25 872 Fälle, in Millisekunden. Ein Greedy hätte hier nicht
 * gereicht: Die Plätze sind nicht gleichwertig (nur die Schmiede darf
 * „Sequin-Crit" ziehen), und für ungleiche Einheiten ist Greedy nicht
 * beweisbar optimal. Der Deckel {@link AFFIX_STAT_CAP} wirkt dabei je Term
 * genauso wie im echten Fold.
 *
 * Ins Produkt gehen dieselben Terme wie bei `constellationPowerBudget` (2a):
 * Klick × Crew-DPS × BP × Krit-EV × Truhen-Luck. Das ist die KONSERVATIVE
 * Lesart — Klick und Crew-DPS multiplizieren sich in Wahrheit nie miteinander
 * (sie sind zwei getrennte Schadensquellen). **Boss-Schaden fehlt mit Absicht**
 * und wird getrennt betrachtet ({@link affixBossBudget}): Er läuft gegen die
 * 30-s-Gates, nicht gegen die Farm-Geschwindigkeit (A2), und ein gemeinsames
 * Produkt würde zwei Dinge verrechnen, die nie zusammen wirken. Das
 * Combo-Fenster zählt wie bei 2a ×1.00 (es hebt keinen Multiplikator, nur eine
 * Gnadenfrist), die Offline-Rate und die Coach-cps haben ihre eigenen Pfade.
 */
export function affixPowerBudget(): number {
  const relicBest = BUDGET_TERMS.map((t) => bestValueFor(t, true));
  const forgeBest = BUDGET_TERMS.map((t) => bestValueFor(t, false));
  const relicSplits = compositions(RELIC_SLOTS * RELIC_MAX_AFFIXES, BUDGET_TERMS.length);
  const forgeSplits = compositions(FORGE_SLOTS, BUDGET_TERMS.length);
  let best = 0;
  for (const a of relicSplits) {
    for (const b of forgeSplits) {
      const bonus = emptyGearBonus();
      for (let i = 0; i < BUDGET_TERMS.length; i++) {
        const raw = a[i] * relicBest[i] + b[i] * forgeBest[i];
        bonus[BUDGET_TERMS[i]] = isCappedStat(BUDGET_TERMS[i])
          ? Math.min(AFFIX_STAT_CAP, raw)
          : raw;
      }
      const v =
        (1 + bonus.clickPct) *
        (1 + bonus.dpsPct) *
        (1 + bonus.goldPct) *
        affixCritEvFactor(bonus) *
        (1 + bonus.chestLuck);
      if (v > best) best = v;
    }
  }
  return best;
}

/**
 * **Das Boss-Budget, getrennt gerechnet** (A2: Boss-Schaden läuft gegen Gates,
 * nicht gegen Farm). Voll gestapelt und vom Deckel geklemmt: ×1.75 auf den
 * Boss-Term — neben einem Tyrann-Skin, der auf Lv 50 allein ×7 zahlt.
 */
export function affixBossBudget(): number {
  const shared = Math.max(
    0,
    ...SHARED_AFFIXES.filter((a) => a.stat === 'bossDmg').map((a) => affixMaxValue(a)),
  );
  const any = Math.max(
    0,
    ...AFFIXES.filter((a) => a.stat === 'bossDmg').map((a) => affixMaxValue(a)),
  );
  return 1 + Math.min(AFFIX_STAT_CAP, shared * RELIC_SLOTS * RELIC_MAX_AFFIXES + any * FORGE_SLOTS);
}

/**
 * **Das Offline-Budget**, getrennt wie bei 2a: Der Offline-Ertrag multipliziert
 * nichts an der Live-Rechnung. Neun Offline-Affixe wären +45 pp auf die
 * 50-%-Basis — vom Deckel auf +75 pp gar nicht erst berührt, aber durch die
 * Rate-Obergrenze 100 % des Spiels ohnehin bei ×2 abgeschnitten.
 */
export function affixOfflineBudget(baseRate = 0.5): number {
  const per = affixMaxValue(AFFIXES.find((a) => a.id === 'offline')!);
  const sum = Math.min(AFFIX_STAT_CAP, per * MAX_WORN_AFFIXES);
  return Math.min(1, baseRate + sum) / baseRate;
}
