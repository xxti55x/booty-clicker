/**
 * Crew (heroes) core — pure, data-driven (Clicker-Heroes-style).
 *
 * You recruit and level **Crew-Mitglieder** (dancers/staff) with BP. Slot 1
 * (Booty-Boss, `click: true`) is THE click-damage line — its levels raise shake
 * damage, not DPS; every member after it is a pure idle-DPS upgrade. On top of
 * levels each member has **kaufbare Fähigkeiten** (buyable abilities): the first
 * unlocks at Lv 25 and then one every 50 levels (25, 75, 125, …) — but only once
 * PAID for in BP, and bought strictly in order.
 *
 * **v11 — themed specials.** Ability tiers are no longer uniform „+100 % DPS":
 * POWER tiers are the classic **Verstärkung** (+100 % of this member's base
 * output, additive: mult = 1 + n_power), the member's other tiers grant its
 * **themed special** — a crew-wide utility bonus in the member's flavor (the
 * DJ widens the on-beat window, the Türsteher melts bosses, the Tycoon prints
 * BP, the Produzent grooves the whole crew's idle DPS, …). Specials stack
 * additively per bought tier and are aggregated by `crewSpecialBonuses`; the
 * glue folds them into exactly the same hooks the Twerk-Ahnen already use.
 * **v11.1:** WHICH tiers are power vs. special follows the member's
 * TIER-RHYTHMUS (`TIER_PATTERNS`, 2 P + 2 S per 4er-Zyklus, immer P zuerst) —
 * three rhythms across the roster so the upgrade lanes read differently per
 * member while the long-run balance stays identical. The `CrewUps` ledger
 * stays a plain bought-count, so saves migrate for free.
 *
 * **1a — Crew-Meisterschaft.** Obendrauf trägt jedes Mitglied seine Einsatz-XP
 * (Lebenszeit-Level, `mastery.ts`): ein permanenter, additiv-kleiner Eigen-Perk
 * (+2 % je Rang, gedeckelt bei +6 %) und ab Legende die Gratis-Erststufe
 * (`grantFreeMasteryTiers`). Der Faktor hängt in `heroDps`/`heroClick`, also in
 * genau EINER Multiplikation — Spiel, Sim-Bot und Kauf-Tipp lesen dieselbe.
 *
 * Clicks still land `CLICK_DPS_SHARE` of total crew DPS on top of the Boss line,
 * so active twerking stays the star at every depth (P1).
 *
 * Balancing is entirely in `CREW` + the consts here. All math is pure so DPS,
 * costs and buy-amounts are unit-tested and deterministic.
 */

/**
 * The ability-tier kinds (v11). `power` is the classic +100 %-output tier;
 * a member's other tiers grant its themed `special` — one of the crew-wide
 * utility kinds below (same hooks the Twerk-Ahnen use; `idle` folds into
 * `dpsOf` like the idle gear does).
 */
import { HEIR_WEIGHT, type CrewMastery, masteryFreeFirstTier, masteryOwnMult } from './mastery';
import { type CrewRetrain, retrainedKind } from './retrain';

export type AbilityKind =
  'power' | 'gold' | 'crit' | 'critdmg' | 'boss' | 'combo' | 'beat' | 'ekstase' | 'idle';

/**
 * Die Sorten, die eine SPEZIAL-Stufe zahlen kann — alles außer `power`. Der
 * Roll-Pool der Umschulung (3b) ist genau diese Menge (`SPECIAL_KINDS`).
 */
export type SpecialKind = Exclude<AbilityKind, 'power'>;

/**
 * v11.1 „Abwechslung": Mitglieder folgen unterschiedlichen TIER-RHYTHMEN statt
 * überall striktem Power/Special-Wechsel. Jedes Muster hat 2× power + 2×
 * special pro 4er-Zyklus (Langzeit-Balance identisch) und beginnt mit power
 * (Tier 1 = Lv 25 bleibt der vertraute +100-%-Einstieg — schützt die frühe
 * Pacing-Wand). Nur die REIHENFOLGE variiert, sodass die Slot-Reihen der
 * Heldenkarten unterschiedlich lesen.
 */
export const TIER_PATTERNS: readonly (readonly ('power' | 'special')[])[] = [
  ['power', 'special', 'power', 'special'], // 0 · klassischer Wechsel
  ['power', 'power', 'special', 'special'], // 1 · Kraft-Rush, dann Utility
  ['power', 'special', 'special', 'power'], // 2 · Utility-Klammer
];

export interface HeroConfig {
  readonly id: string;
  readonly name: string;
  /** Short shop flavor. */
  readonly ds: string;
  /** Cost to recruit (level 0 → 1). */
  readonly baseCost: number;
  /** Output per level (before ability multipliers): DPS, or click damage if `click`. */
  readonly baseDps: number;
  /** Slot-1 marker: levels raise CLICK damage instead of idle DPS. */
  readonly click?: boolean;
  /** This member's themed special — granted on its special tiers (v11). */
  readonly special: SpecialKind;
  /** Tier-Rhythmus-Index in `TIER_PATTERNS` (v11.1 Abwechslung). */
  readonly rhythm: 0 | 1 | 2;
  /**
   * Wie viele Fähigkeiten dieses Mitglied ÜBERHAUPT lernen kann (4…8).
   *
   * Vorher galt für alle 15 Mitglieder dieselbe Zahl — jeder konnte alles, und
   * damit unterschieden sie sich nur noch in ihren Grundwerten. Die Spanne gibt
   * jedem ein Profil: Ein Mitglied mit vier Fähigkeiten ist früh fertig und
   * lebt von seinem Grundwert, eines mit acht bleibt über die ganze Partie ein
   * Ausbau-Ziel.
   */
  readonly tiers: number;
}

/**
 * Cost multiplier per owned level (Clicker Heroes uses ~1.07; v12 Goal-Nerf
 * hebt auf 1.075 — jede Leiter wird spürbar steiler, die Progression tiefer
 * hinein deutlich langsamer).
 */
export const HERO_COST_GROWTH = 1.075;

/**
 * Buyable-ability schedule: first at Lv 25, then one every 50 levels
 * (25, 75, 125, … — inside the goal's "alle 25–50 Level" window, endless).
 */
export const ABILITY_FIRST_LEVEL = 25;
export const ABILITY_SPACING = 50;
/** Each bought POWER tier (odd tiers) adds +100 % of base output (mult = 1 + n). */
export const ABILITY_BONUS = 1;

// ---- v11 themed-special magnitudes (per bought EVEN tier, additive stacks) ----
/** `gold`: +25 % BP from every kill (global income). */
export const SPECIAL_GOLD = 0.25;
/** `crit`: +1.5 % click crit chance (the 40 % pipeline cap still applies). */
export const SPECIAL_CRIT_CHANCE = 0.015;
/** `critdmg`: +0.5 on the crit multiplier (×5 → ×5.5 → …, the endless lever). */
export const SPECIAL_CRIT_DMG = 0.5;
/** `boss`: +25 % damage against boss targets (click AND idle). */
export const SPECIAL_BOSS = 0.25;
/** `combo`: +0.2 s combo grace window per tier … */
export const SPECIAL_COMBO_S = 0.2;
/** … capped so deep runs can't trivialize the combo entirely. */
export const SPECIAL_COMBO_CAP_S = 3;
/** `beat`: +12 ms on-beat detection window per tier … */
export const SPECIAL_BEAT_MS = 12;
/** … capped (base is ±100 ms — the beat must stay a skill check). */
export const SPECIAL_BEAT_CAP_MS = 60;
/** `ekstase`: −5 % Ekstase charge threshold per tier (shares the glue's 90 % clamp). */
export const SPECIAL_EKSTASE = 0.05;
/**
 * `idle` („Groove"): +20 % Crew-DPS (global, idle only) per tier. Deliberately
 * a touch weaker than a power tier and limited to two members — it lifts the
 * idle side like the idle gear does without threatening P1 (clicks still take
 * their 20 % DPS share of it).
 */
export const SPECIAL_IDLE = 0.2;
/**
 * v10 idle retune: paid abilities removed ~×8 of the old free milestone power,
 * which over-nerfed the idle side (a 1-cps player relies on crew DPS almost
 * alone); v10 gave the DPS lines ×2 back. v12 Goal-Nerf („a lot slower") nimmt
 * davon wieder ein Viertel: ×1.5 — actives feel it only via the 20 % click
 * share, so the click:idle shape stays.
 */
export const DPS_TUNE = 0.72;
/** Ability price = the level-cost at its unlock level × this factor (v12: 6 → 9). */
export const ABILITY_COST_MULT = 9;

/** Permanent per-gild DPS multiplier for a crew member (×1.25 each, spec §4.3.4). */
export const GILD_DPS_MULT = 1.25;

/** Share of total raw DPS delivered by a single click (before global/crit mult). */
export const CLICK_DPS_SHARE = 0.2;
/** Flat click damage floor, so zone 1 is beatable before any crew exists. */
export const CLICK_BASE = 1;

/**
 * The recruitable crew, cheapest → strongest (each a big DPS jump but pricier).
 * `special` is the member's themed even-tier ability (v11) — chosen to match the
 * flavor: the DJ owns the beat, the Türsteher handles the (boss) trouble, the
 * money people print BP, the show-offs sharpen crits, the crowd-workers keep the
 * combo alive, and the transcendent dancers feed the Ekstase.
 */
export const CREW: readonly HeroConfig[] = [
  {
    id: 'boss',
    name: 'Booty-Boss (Du)',
    ds: 'Der Star der Show — jedes Level: mehr Klick-Schaden.',
    baseCost: 5,
    baseDps: 1,
    click: true,
    special: 'critdmg',
    rhythm: 0,
    tiers: 8,
  },
  {
    id: 'hype',
    name: 'Hype-Girl',
    ds: 'Feuert das Publikum an.',
    baseCost: 50,
    baseDps: 5,
    special: 'combo',
    rhythm: 1,
    tiers: 5,
  },
  {
    id: 'dj',
    name: 'DJ Wumms',
    ds: 'Legt den fetten Bass auf.',
    baseCost: 250,
    baseDps: 22,
    special: 'beat',
    rhythm: 2,
    tiers: 6,
  },
  {
    id: 'bouncer',
    name: 'Türsteher',
    ds: 'Hält den Beat am Laufen.',
    baseCost: 1000,
    baseDps: 74,
    special: 'boss',
    rhythm: 0,
    tiers: 4,
  },
  {
    id: 'influencer',
    name: 'Insta-Influencerin',
    ds: 'Streamt jeden Move.',
    baseCost: 4000,
    baseDps: 245,
    special: 'gold',
    rhythm: 1,
    tiers: 7,
  },
  {
    id: 'choreo',
    name: 'Star-Choreograph',
    ds: 'Perfektioniert die Routine.',
    baseCost: 20000,
    baseDps: 1100,
    special: 'crit',
    rhythm: 2,
    tiers: 5,
  },
  {
    id: 'producer',
    name: 'Musik-Produzent',
    ds: 'Pumpt Hits am Fließband.',
    baseCost: 100000,
    baseDps: 5000,
    special: 'idle',
    rhythm: 0,
    tiers: 6,
  },
  {
    id: 'promi',
    name: 'A-Promi',
    ds: 'Zieht die Massen an.',
    baseCost: 500000,
    baseDps: 22000,
    special: 'critdmg',
    rhythm: 1,
    tiers: 4,
  },
  {
    id: 'tycoon',
    name: 'Club-Tycoon',
    ds: 'Besitzt den ganzen Laden.',
    baseCost: 3000000,
    baseDps: 120000,
    special: 'gold',
    rhythm: 2,
    tiers: 8,
  },
  {
    id: 'legend',
    name: 'Twerk-Legende',
    ds: 'Schreibt Tanzgeschichte.',
    baseCost: 20000000,
    baseDps: 700000,
    special: 'ekstase',
    rhythm: 0,
    tiers: 7,
  },
  // M9 crew expansion (spec §4.3.3): +5 endless tiers, ~×6–8 cost / ~×6–7 DPS each.
  {
    id: 'viral',
    name: 'Viral-Video-Team',
    ds: 'Dreht jeden Move zum Meme.',
    baseCost: 150000000,
    baseDps: 4500000,
    special: 'combo',
    rhythm: 1,
    tiers: 5,
  },
  {
    id: 'hologram',
    name: 'Hologramm-Double',
    ds: 'Tanzt an zwei Orten zugleich.',
    baseCost: 1200000000,
    baseDps: 30000000,
    special: 'crit',
    rhythm: 2,
    tiers: 6,
  },
  {
    id: 'aicluster',
    name: 'KI-Choreo-Cluster',
    ds: 'Rechnet die perfekte Routine.',
    baseCost: 10000000000,
    baseDps: 220000000,
    special: 'idle',
    rhythm: 0,
    tiers: 4,
  },
  {
    id: 'orbital',
    name: 'Orbitale Tanz-Station',
    ds: 'Twerkt in der Umlaufbahn.',
    baseCost: 80000000000,
    baseDps: 1600000000,
    special: 'boss',
    rhythm: 1,
    tiers: 7,
  },
  {
    id: 'cosmic',
    name: 'Kosmische Twerk-Entität',
    ds: 'Der Beat des Universums.',
    baseCost: 650000000000,
    baseDps: 12000000000,
    special: 'ekstase',
    rhythm: 2,
    tiers: 8,
  },
];

/** Crew levels keyed by hero id (absent = level 0). */
export type CrewLevels = Record<string, number>;

/** Fresh crew (all level 0). */
export function createCrew(): CrewLevels {
  return {};
}

// ---------------------------------------------------------------------------
// Meilensteine, Soft-Cap und Fähigkeiten-Deckel
// ---------------------------------------------------------------------------

/**
 * Level, an denen ein Mitglied seinen Ausstoß VERDOPPELT (+100 %). Vorher wuchs
 * DPS strikt linear mit dem Level — jedes Level war gleich viel wert, und weil
 * die Kosten nur mit 7.5 % je Stufe stiegen, ließ sich ein Mitglied praktisch
 * beliebig weit hochkaufen.
 *
 * Jetzt liegt der Fortschritt in SPRÜNGEN: Wer den nächsten Meilenstein
 * erreicht, verdoppelt; dazwischen wächst es linear weiter. Das gibt jedem
 * Mitglied ein sichtbares Nahziel, statt einer endlosen flachen Rampe.
 */
export const DPS_MILESTONES: readonly number[] = [25, 50, 100, 200, 250];

/**
 * Ab hier wird Leveln zum Sink statt zur Strategie: Der Ausstoß wächst nur noch
 * LINEAR (keine Meilensteine mehr), der Preis dagegen zusätzlich exponentiell
 * ({@link SOFTCAP_COST_GROWTH}). Ein Mitglied jenseits davon weiterzuziehen ist
 * möglich, lohnt aber schnell weniger als der nächste Kauf woanders — genau die
 * Bremse, die vorher fehlte.
 */
export const LEVEL_SOFTCAP = DPS_MILESTONES[DPS_MILESTONES.length - 1]!;

/** Zusätzliches Kostenwachstum je Level ÜBER dem Soft-Cap (multiplikativ). */
export const SOFTCAP_COST_GROWTH = 1.06;

/**
 * Der Meilenstein-Multiplikator eines Levels: ×2 je erreichtem Meilenstein.
 * Auf dem Soft-Cap steht er bei ×32 und wächst danach nicht weiter.
 */
export function milestoneMult(level: number): number {
  const lv = Number.isFinite(level) ? Math.floor(level) : 0;
  let hit = 0;
  for (const m of DPS_MILESTONES) if (lv >= m) hit++;
  return Math.pow(2, hit);
}

/**
 * Der Level-Faktor des Ausstoßes: das Level selbst, multipliziert mit den
 * erreichten Meilenstein-Verdopplungen. Er ersetzt das frühere blanke `level`.
 *
 * Über dem Soft-Cap kommt KEIN Meilenstein mehr dazu — dort wächst der Ausstoß
 * nur noch linear, während der Preis zusätzlich exponentiell steigt. Genau das
 * ist die Bremse: Weiterleveln bleibt möglich, lohnt aber schnell weniger als
 * der nächste Kauf woanders.
 */
export function dpsLevelFactor(level: number): number {
  const lv = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  if (lv <= 0) return 0;
  return lv * milestoneMult(lv);
}

/** Der NÄCHSTE Meilenstein über `level` — `null`, wenn der Soft-Cap erreicht ist. */
export function nextMilestone(level: number): number | null {
  const lv = Number.isFinite(level) ? Math.floor(level) : 0;
  for (const m of DPS_MILESTONES) if (lv < m) return m;
  return null;
}

/**
 * Maximale Anzahl Fähigkeiten je Mitglied. Vorher liefen die Stufen endlos
 * weiter (alle 50 Level eine neue) — mit dem Deckel ist ein Mitglied irgendwann
 * fertig, und „vollständig ausgebaut" wird ein erreichbarer Zustand.
 */
export const MAX_ABILITY_TIERS = 8;
/** Die wenigsten Fähigkeiten, die ein Mitglied haben darf. */
export const MIN_ABILITY_TIERS = 4;

/**
 * Wie viele Fähigkeiten `cfg` lernen kann — sein eigenes {@link HeroConfig.tiers},
 * hart geklemmt auf {@link MIN_ABILITY_TIERS}…{@link MAX_ABILITY_TIERS}.
 *
 * Die Klemme ist kein Misstrauen gegen die eigene Tabelle, sondern die Stelle,
 * an der die Spanne GILT: Jede Rechnung fragt hier, niemand liest `cfg.tiers`
 * direkt. Ein Tippfehler in der Tabelle verschiebt damit die Balance, sprengt
 * aber nie die Anzeige.
 */
export function maxAbilityTiers(cfg: HeroConfig): number {
  const t = Number.isFinite(cfg.tiers) ? Math.floor(cfg.tiers) : MIN_ABILITY_TIERS;
  return Math.max(MIN_ABILITY_TIERS, Math.min(MAX_ABILITY_TIERS, t));
}

/** Unlock level of ability tier `n` (1-based): 25, 75, 125, … */
export function abilityLevel(tier: number): number {
  return ABILITY_FIRST_LEVEL + ABILITY_SPACING * (Math.max(1, Math.floor(tier)) - 1);
}

/**
 * Wie viele Fähigkeiten `level` freigeschaltet hat — 0 unter Lv 25, danach eine
 * je {@link ABILITY_SPACING} Level, gedeckelt bei {@link MAX_ABILITY_TIERS}.
 */
export function abilityTiersUnlocked(cfg: HeroConfig, level: number): number {
  if (!Number.isFinite(level) || level < ABILITY_FIRST_LEVEL) return 0;
  const n = Math.floor((level - ABILITY_FIRST_LEVEL) / ABILITY_SPACING) + 1;
  return Math.min(maxAbilityTiers(cfg), n);
}

/**
 * Wie viele Level fehlen bis zum nächsten Fähigkeiten-MEILENSTEIN (Lv 25, 75,
 * 125, …) — die Kaufmenge „Nächste Fähigkeit".
 *
 * Genau ein Level ÜBER den Meilenstein hinaus zu kaufen wäre Verschwendung,
 * genau einen darunter zu stoppen verfehlt den Zweck: Der Rückgabewert landet
 * deshalb exakt AUF dem nächsten Freischalt-Level. Steht man bereits darauf,
 * zeigt er auf den übernächsten — sonst wäre der Knopf auf einem Meilenstein
 * ein No-Op.
 */
export function levelsToNextAbility(cfg: HeroConfig, level: number): number {
  const lv = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  if (lv < ABILITY_FIRST_LEVEL) return ABILITY_FIRST_LEVEL - lv;
  const tiers = abilityTiersUnlocked(cfg, level);
  // Alle Fähigkeiten DIESES Mitglieds freigeschaltet? Dann gibt es kein Ziel
  // mehr — der Knopf zielt stattdessen auf den nächsten Meilenstein bzw. ein
  // einzelnes Level. Die Grenze ist mitgliedsabhängig (4…8), nicht global.
  if (tiers >= maxAbilityTiers(cfg)) {
    const m = nextMilestone(lv);
    return m === null ? 1 : m - lv;
  }
  return abilityLevel(tiers + 1) - lv;
}

/**
 * The kind of ability tier `n` (1-based) for a member — v11.1: read from the
 * member's TIER-RHYTHMUS (`TIER_PATTERNS[cfg.rhythm]`, 4er-Zyklus). Every
 * pattern carries 2 power + 2 special per cycle, so the long-run balance is
 * rhythm-independent; only the ORDER differs per member.
 *
 * **3b — die EINE Lesekette.** Ist der Slot ein SPEZIAL-Slot und trägt die
 * Umschul-Map (`retrain`) für ihn einen Eintrag, gewinnt dieser Eintrag über
 * `cfg.special`. POWER-Slots ignorieren jeden Override: Der Rhythmus (WELCHE
 * Stufen Spezial sind) ist unantastbar, nur die SORTE rollt. Spiel-Glue,
 * `crewSpecialBonuses`, Sim, Kauf-Tipp und Crew-Card fragen alle hier — es gibt
 * keinen zweiten Pfad zur Sorte eines Slots. Ohne Map (Default `{}`) verhält
 * sich die Funktion exakt wie vor 3b, also falten Alt-Aufrufer unverändert.
 */
export function abilityKind(cfg: HeroConfig, tier: number, retrain: CrewRetrain = {}): AbilityKind {
  const pat = TIER_PATTERNS[cfg.rhythm];
  const t = Math.max(1, Math.floor(tier));
  if (pat[(t - 1) % pat.length] === 'power') return 'power';
  return retrainedKind(retrain, cfg.id, t) ?? cfg.special;
}

/**
 * Die 1-basierte Nummer eines Spezial-Slots innerhalb seines Mitglieds
 * (Stufe 2 im Muster 0 ⇒ Slot 1, Stufe 4 ⇒ Slot 2, …) — **0**, wenn `tier` eine
 * Power-Stufe ist. Genau diese Nummer treibt die Umschul-Kosten (3b:
 * `retrainCost`), und sie ist rhythmus-bewusst: Im Muster „P P S S" ist Stufe 3
 * der erste Spezial-Slot, im Muster „P S P S" die Stufe 2.
 */
export function retrainSlotOrdinal(cfg: HeroConfig, tier: number): number {
  const pat = TIER_PATTERNS[cfg.rhythm];
  const t = Math.max(1, Math.floor(tier));
  if (pat[(t - 1) % pat.length] === 'power') return 0;
  return specialTiers(cfg, t);
}

/** How many POWER tiers are among a member's first `bought` tiers (rhythm-aware). */
export function powerTiers(cfg: HeroConfig, bought: number): number {
  const n = Math.max(0, Math.floor(bought));
  const pat = TIER_PATTERNS[cfg.rhythm];
  const perCycle = pat.filter((k) => k === 'power').length; // 2 in jedem Muster
  let count = Math.floor(n / pat.length) * perCycle;
  for (let i = 0; i < n % pat.length; i++) if (pat[i] === 'power') count++;
  return count;
}

/** How many SPECIAL tiers are among a member's first `bought` tiers (rhythm-aware). */
export function specialTiers(cfg: HeroConfig, bought: number): number {
  return Math.max(0, Math.floor(bought)) - powerTiers(cfg, bought);
}

/**
 * Output multiplier from `bought` abilities: 1 + (power tiers bought). Only the
 * POWER tiers of the member's rhythm are +100 %-output tiers — its special
 * tiers are crew-wide utility and leave its own output untouched.
 */
export function abilityMult(cfg: HeroConfig, bought: number): number {
  return 1 + ABILITY_BONUS * powerTiers(cfg, bought);
}

/** Crew-wide bonuses aggregated from every member's bought SPECIAL tiers (v11). */
export interface CrewSpecialBonuses {
  /** Global BP multiplier from `gold` tiers: 1 + 0.25·n. */
  goldMult: number;
  /** Additive click crit-chance bonus (pipeline still caps at 40 %). */
  critChance: number;
  /** Additive crit-multiplier bonus (on top of the base ×5). */
  critDmg: number;
  /** Damage multiplier vs boss targets: 1 + 0.25·n. */
  bossMult: number;
  /** Extra combo grace window in seconds (capped). */
  comboWindowS: number;
  /** Extra on-beat detection window in ms (capped). */
  beatWindowMs: number;
  /** Ekstase charge-threshold reduction (the glue clamps the summed total at 90 %). */
  ekstaseChargeRed: number;
  /** Global crew-DPS multiplier from `idle` („Groove") tiers: 1 + 0.2·n. */
  idleMult: number;
}

/**
 * Aggregate all bought special tiers across the crew into the crew-wide
 * bonuses. Pure over the `CrewUps` ledger — each member contributes its
 * rhythm-aware `specialTiers(cfg, ups)` stacks of its themed special. The
 * combo/beat windows are capped here (they gate skill checks); crit chance and
 * the Ekstase reduction are clamped by their existing pipeline caps at the
 * call sites.
 *
 * **3b — umgeschulte Slots.** Trägt die Umschul-Map für ein Mitglied Einträge,
 * kann dessen Sorte je Stufe verschieden sein; dann wird Stufe für Stufe über
 * `abilityKind` gezählt — dieselbe Funktion, die auch die Card beschriftet. Für
 * jedes Mitglied OHNE Eintrag bleibt der alte O(1)-Pfad (`specialTiers`)
 * erhalten: Ein Save ohne Umschulung — und damit jeder Sim-Lauf, denn der Bot
 * schult nie um — rechnet exakt so schnell und exakt dieselben Zahlen wie vor 3b.
 */
export function crewSpecialBonuses(ups: CrewUps, retrain: CrewRetrain = {}): CrewSpecialBonuses {
  const n: Record<SpecialKind, number> = {
    gold: 0,
    crit: 0,
    critdmg: 0,
    boss: 0,
    combo: 0,
    beat: 0,
    ekstase: 0,
    idle: 0,
  };
  for (const cfg of CREW) {
    const bought = Math.max(0, Math.floor(ups[cfg.id] ?? 0));
    const slots = retrain[cfg.id];
    if (!slots) {
      n[cfg.special] += specialTiers(cfg, bought);
      continue;
    }
    for (let t = 1; t <= bought; t++) {
      const kind = abilityKind(cfg, t, retrain);
      if (kind !== 'power') n[kind] += 1;
    }
  }
  return {
    goldMult: 1 + SPECIAL_GOLD * n.gold,
    critChance: SPECIAL_CRIT_CHANCE * n.crit,
    critDmg: SPECIAL_CRIT_DMG * n.critdmg,
    bossMult: 1 + SPECIAL_BOSS * n.boss,
    comboWindowS: Math.min(SPECIAL_COMBO_CAP_S, SPECIAL_COMBO_S * n.combo),
    beatWindowMs: Math.min(SPECIAL_BEAT_CAP_MS, SPECIAL_BEAT_MS * n.beat),
    ekstaseChargeRed: SPECIAL_EKSTASE * n.ekstase,
    idleMult: 1 + SPECIAL_IDLE * n.idle,
  };
}

/**
 * Der NAME einer Sorte (was sie ist), Gegenstück zu `abilityKindLabel` (was sie
 * zahlt). Der Umschul-Dialog stellt beide übereinander — „Boss-Schaden" über
 * „+25% Boss-Schaden" liest sich als Karte, zwei nackte Prozentzeilen nicht.
 */
export function abilityKindName(kind: AbilityKind): string {
  switch (kind) {
    case 'power':
      return 'Verstärkung';
    case 'gold':
      return 'Gold';
    case 'crit':
      return 'Krit-Chance';
    case 'critdmg':
      return 'Krit-Schaden';
    case 'boss':
      return 'Boss-Schaden';
    case 'combo':
      return 'Combo-Fenster';
    case 'beat':
      return 'Beat-Fenster';
    case 'ekstase':
      return 'Ekstase-Ladung';
    case 'idle':
      return 'Groove (Crew-DPS)';
  }
}

/** Short German UI label for an ability tier of `kind` (power appends the out-label). */
export function abilityKindLabel(kind: AbilityKind, outLabel: string): string {
  switch (kind) {
    case 'power':
      return `+100% ${outLabel}`;
    case 'gold':
      return '+25% BP';
    case 'crit':
      return '+1,5% Krit-Chance';
    case 'critdmg':
      return '+0,5× Krit-Schaden';
    case 'boss':
      return '+25% Boss-Schaden';
    case 'combo':
      return '+0,2s Combo-Fenster';
    case 'beat':
      return '+12ms Beat-Fenster';
    case 'ekstase':
      return '−5% Ekstase-Ladung';
    case 'idle':
      return '+20% Crew-DPS';
  }
}

/** BP price of ability tier `n` for a member (level-cost at unlock × factor). */
export function abilityCost(cfg: HeroConfig, tier: number): number {
  return Math.floor(
    cfg.baseCost * Math.pow(HERO_COST_GROWTH, abilityLevel(tier)) * ABILITY_COST_MULT,
  );
}

/**
 * The next buyable ability for a member: its tier, unlock level, price and
 * whether the level requirement is already met. Pure UI/sim helper — abilities
 * must be bought in order, so "next" is always `bought + 1`.
 */
export function nextAbility(
  cfg: HeroConfig,
  level: number,
  bought: number,
): { tier: number; level: number; cost: number; unlocked: boolean } | null {
  const tier = Math.max(0, Math.floor(bought)) + 1;
  // Über der Grenze dieses Mitglieds gibt es NICHTS mehr — vorher lieferte die
  // Funktion stur `gekauft + 1` und die Crew-Card zeichnete daraufhin eine
  // neunte Kachel („ab Lv 425"), die niemand je kaufen konnte.
  if (tier > maxAbilityTiers(cfg)) return null;
  const lv = abilityLevel(tier);
  return { tier, level: lv, cost: abilityCost(cfg, tier), unlocked: level >= lv };
}

/**
 * **Die Erben-Gewichtung** (3c): {@link HEIR_WEIGHT} für das beim Transzendieren
 * gewählte Mitglied, sonst 1. Eine leere Erben-Id (der Normalfall — es gibt
 * genau EINEN Erben je Ära, und vor der ersten Transzendenz gar keinen) faltet
 * damit für JEDES Mitglied ×1, also rechnen alle Alt-Aufrufer zahlengleich.
 */
export function heirWeightFor(id: string, heir: string): number {
  return heir !== '' && id === heir ? HEIR_WEIGHT : 1;
}

/** Permanent DPS multiplier from `gildCount` gilds on a member (×1.25 each, §4.3.4). */
export function gildMult(gildCount: number): number {
  return Math.pow(GILD_DPS_MULT, Math.max(0, gildCount));
}

/**
 * A single member's DPS at `level` (0 when un-recruited or for the click hero),
 * scaled by BOUGHT abilities (`ups`), gilds and — seit 1a — den Eigen-Perk
 * seiner Meisterschaft (`masteryXp`, Lebenszeit-Level; 0 ⇒ ×1, sodass jeder
 * ältere Aufrufer unverändert faltet). Abilities no longer come free with
 * levels — pass the purchased count.
 */
export function heroDps(
  cfg: HeroConfig,
  level: number,
  gildCount = 0,
  ups = 0,
  masteryXp = 0,
  heirWeight = 1,
): number {
  if (level <= 0 || cfg.click) return 0;
  return (
    cfg.baseDps *
    DPS_TUNE *
    dpsLevelFactor(level) *
    abilityMult(cfg, ups) *
    gildMult(gildCount) *
    masteryOwnMult(masteryXp, heirWeight)
  );
}

/**
 * The click hero's shake damage at `level` (0 for DPS members), same scaling —
 * beim Klick-Mitglied zahlt der Meisterschafts-Perk also auf den KLICK, genau
 * wie seine Level (Ideen-Dokument 1a: „+2 % Eigen-DPS bzw. Klick beim
 * boss-Mitglied").
 */
export function heroClick(
  cfg: HeroConfig,
  level: number,
  gildCount = 0,
  ups = 0,
  masteryXp = 0,
  heirWeight = 1,
): number {
  if (level <= 0 || !cfg.click) return 0;
  return (
    cfg.baseDps *
    dpsLevelFactor(level) *
    abilityMult(cfg, ups) *
    gildMult(gildCount) *
    masteryOwnMult(masteryXp, heirWeight)
  );
}

/**
 * Preis des NÄCHSTEN Levels. Bis zum Soft-Cap die gewohnte Leiter
 * (`baseCost · 1.075^level`); darüber kommt ein ZWEITES Wachstum obendrauf
 * ({@link SOFTCAP_COST_GROWTH} je Level über dem Cap), weil der Ausstoß dort
 * nur noch linear steigt. Ein Mitglied über 250 zu ziehen ist damit ein
 * bewusster Luxus und keine Selbstverständlichkeit mehr.
 */
export function nextLevelCost(cfg: HeroConfig, level: number): number {
  const lv = Math.max(0, Math.floor(level));
  const base = cfg.baseCost * Math.pow(HERO_COST_GROWTH, lv);
  const over = Math.max(0, lv - LEVEL_SOFTCAP);
  return Math.floor(base * Math.pow(SOFTCAP_COST_GROWTH, over));
}

/**
 * Preis für `count` Level ab `fromLevel`.
 *
 * Unterhalb des Soft-Caps ist das eine geometrische Summe (geschlossen, sofort).
 * Reicht der Kauf darüber hinaus, gilt die geschlossene Formel NICHT mehr — dort
 * wirken zwei Wachstumsraten übereinander, also wird der überstehende Teil
 * Stufe für Stufe summiert. Das ist der ehrliche Preis; eine Formel, die den
 * Soft-Cap ignoriert, würde ihn systematisch zu billig ausweisen.
 */
export function bulkCost(cfg: HeroConfig, fromLevel: number, count: number): number {
  if (count <= 0) return 0;
  const from = Math.max(0, Math.floor(fromLevel));
  const n = Math.floor(count);
  const r = HERO_COST_GROWTH;
  const plain = Math.max(0, Math.min(n, LEVEL_SOFTCAP - from));
  let sum = 0;
  if (plain > 0) {
    const first = cfg.baseCost * Math.pow(r, from);
    sum += (first * (Math.pow(r, plain) - 1)) / (r - 1);
  }
  for (let i = plain; i < n; i++) sum += nextLevelCost(cfg, from + i);
  return Math.floor(sum);
}

/** How many levels are affordable from `fromLevel` with `gold` (for "buy max"). */
export function maxAffordable(cfg: HeroConfig, fromLevel: number, gold: number): number {
  if (gold < nextLevelCost(cfg, fromLevel)) return 0;
  const from = Math.max(0, Math.floor(fromLevel));
  const r = HERO_COST_GROWTH;
  const first = cfg.baseCost * Math.pow(r, from);
  // Schätzung aus der geschlossenen Formel (ohne Soft-Cap) — sie liegt nie zu
  // NIEDRIG, weil der echte Preis über dem Cap nur höher sein kann.
  const guess = Math.floor(Math.log((gold * (r - 1)) / first + 1) / Math.log(r));
  let count = Math.max(0, guess);
  while (count > 0 && bulkCost(cfg, from, count) > gold) count--;
  // Und nach oben nachziehen, falls die Schätzung (Rundung) zu vorsichtig war.
  while (bulkCost(cfg, from, count + 1) <= gold) count++;
  return count;
}

/** Per-hero gild counts (absent = 0), mirrors `CrewLevels`. */
export type CrewGilds = Record<string, number>;

/** Per-hero BOUGHT ability counts (absent = 0), mirrors `CrewLevels`. */
export type CrewUps = Record<string, number>;

/** Fresh ability ledger (nothing bought). */
export function createCrewUps(): CrewUps {
  return {};
}

/**
 * Total raw crew DPS (before global/soul/frenzy multipliers): gilds + bought
 * abilities + Meisterschafts-Perks (1a). Eine fehlende Meisterschafts-Tafel
 * faltet ×1 — Alt-Tests und Sim-Fixtures bleiben zahlengleich.
 */
export function totalRawDps(
  levels: CrewLevels,
  gilds: CrewGilds = {},
  ups: CrewUps = {},
  mastery: CrewMastery = {},
  heir = '',
): number {
  let dps = 0;
  for (const cfg of CREW)
    dps += heroDps(
      cfg,
      levels[cfg.id] ?? 0,
      gilds[cfg.id] ?? 0,
      ups[cfg.id] ?? 0,
      mastery[cfg.id] ?? 0,
      heirWeightFor(cfg.id, heir),
    );
  return dps;
}

/**
 * **Die Gratis-Erststufen des Legenden-Rangs (1a).** Wer ein Mitglied bis
 * Legende gespielt hat, bekommt dessen ERSTE Fähigkeits-Stufe nach jedem Reset
 * geschenkt: Sobald das Level die Tier-1-Schwelle (Lv 25) erreicht und noch
 * nichts gekauft ist, wird Stufe 1 ohne BP-Abzug gutgeschrieben.
 *
 * Bewusst als PURE Funktion über (Level, Ledger, Meisterschaft) statt als
 * Sonderfall im Kauf-Code: Die Glue ruft sie an genau drei Stellen (Boot, nach
 * jedem Level-Kauf, nach jedem der drei Resets), der Sim-Bot an einer — und
 * alle bekommen dieselbe Antwort. Liefert einen NEUEN Ledger plus die Ids, die
 * frisch gutgeschrieben wurden (leer ⇒ nichts zu tun, `ups` kommt unverändert
 * zurück, sodass der Aufrufer ohne Kosten prüfen kann).
 */
export function grantFreeMasteryTiers(
  levels: CrewLevels,
  ups: CrewUps,
  mastery: CrewMastery,
): { ups: CrewUps; granted: string[] } {
  const granted: string[] = [];
  for (const cfg of CREW) {
    if (!masteryFreeFirstTier(mastery[cfg.id] ?? 0)) continue;
    if ((levels[cfg.id] ?? 0) < ABILITY_FIRST_LEVEL) continue;
    if ((ups[cfg.id] ?? 0) > 0) continue;
    granted.push(cfg.id);
  }
  if (granted.length === 0) return { ups, granted };
  const next: CrewUps = { ...ups };
  for (const id of granted) next[id] = 1;
  return { ups: next, granted };
}

// ---------------------------------------------------------------------------
// Greedy-ROI-Auswahl — EINE Quelle für Sim-Bot und Spiel-Tipp
// ---------------------------------------------------------------------------

/** Eine Kauf-Option mit ihrem Grenznutzen (Output-Zuwachs pro BP). */
export interface CrewBuy {
  /** Ein Level der Leiter oder die nächste Fähigkeits-Stufe. */
  readonly kind: 'level' | 'ability';
  readonly id: string;
  /** Preis DIESES Kaufs in BP (bei einer Special-Klammer der erste Schritt). */
  readonly cost: number;
  /** Grenznutzen pro BP — die Größe, nach der sortiert wird. */
  readonly roi: number;
}

/**
 * Der Output eines Mitglieds bei `level`/`ups`. Die Klick-Linie zählt hier 1:1
 * wie DPS: Sim-Treiber wie Spieler klicken quasi durchgehend, also ist
 * „1 Klick-Schaden ≈ Klicks/s DPS" nah genug für eine Greedy-Rangfolge und hält
 * die Schleife mitglieds-agnostisch.
 */
function outputAt(cfg: HeroConfig, level: number, gild: number, ups: number, xp: number): number {
  return cfg.click ? heroClick(cfg, level, gild, ups, xp) : heroDps(cfg, level, gild, ups, xp);
}

/**
 * Die EINE beste Kauf-Option innerhalb von `budget` BP: nächstes Level oder
 * nächste freigeschaltete Fähigkeit, quer über die ganze Crew, nach
 * Grenznutzen/BP sortiert (`null`, wenn nichts ins Budget passt).
 *
 * Special-Fähigkeitsstufen (v11) tragen keinen eigenen Output — `gold`/`crit`/
 * `idle` wirken über die Economy, nicht über die Ausgabe des Mitglieds. Da
 * Fähigkeiten strikt der Reihe nach gekauft werden, würde ein reiner Output-
 * Greedy an ihnen hängenbleiben; sie werden deshalb als TOR zur nächsten
 * Power-Stufe bewertet: die Klammer (alle aufeinanderfolgenden Specials + die
 * folgende Power-Stufe — die v11.1-Rhythmen haben bis zu zwei Specials in Folge)
 * wird zusammen gegen den Output-Zuwachs der Power-Stufe gepreist. Der
 * Utility-Wert der Specials selbst wird bewusst NICHT gutgeschrieben, damit der
 * Sim-Bot eine ehrliche Untergrenze bleibt.
 *
 * Pur über (Level, Fähigkeiten, Vergoldungen, Budget) — `sim.ts` fährt damit
 * seinen ROI-Greedy, `game/advisor.ts` leitet daraus den Kauf-Tipp im Spiel ab
 * (ROADMAP-V2 P3), beide ohne eine zweite Kopie der Rangfolge.
 */
export function bestCrewBuy(
  levels: CrewLevels,
  ups: CrewUps,
  gilds: CrewGilds,
  budget: number,
  mastery: CrewMastery = {},
): CrewBuy | null {
  let best: CrewBuy | null = null;
  let bestRoi = 0;
  for (const cfg of CREW) {
    const lvl = levels[cfg.id] ?? 0;
    const bought = ups[cfg.id] ?? 0;
    const gild = gilds[cfg.id] ?? 0;
    // 1a: Der Meisterschafts-Perk ist ein KONSTANTER Faktor auf den Output
    // dieses Mitglieds — er kürzt sich im Grenznutzen also nicht heraus, sondern
    // hebt die Rangfolge eines gemeisterten Mitglieds um genau seine 2–6 %.
    const xp = mastery[cfg.id] ?? 0;
    const cost = nextLevelCost(cfg, lvl);
    if (cost <= budget) {
      const gain = outputAt(cfg, lvl + 1, gild, bought, xp) - outputAt(cfg, lvl, gild, bought, xp);
      let roi = gain / cost;
      // MEILENSTEIN-SICHT. Ein einzelnes Level kurz vor einem Meilenstein bringt
      // fast nichts, das Level DANACH verdoppelt — eine rein schrittweise
      // Bewertung sieht deshalb nur die flache Strecke und meidet sie, obwohl
      // sich der Weg als Ganzes lohnt. Bewertet wird darum zusätzlich die
      // gesamte Strecke bis zum nächsten Meilenstein; führt sie, zählt sie.
      // Dieselbe Sicht, die ein Spieler mit dem „Fähigkeit"-Kaufknopf hat.
      const ms = nextMilestone(lvl);
      if (ms !== null && ms > lvl) {
        const span = ms - lvl;
        const bulk = bulkCost(cfg, lvl, span);
        if (bulk > 0) {
          const spanGain =
            outputAt(cfg, ms, gild, bought, xp) - outputAt(cfg, lvl, gild, bought, xp);
          roi = Math.max(roi, spanGain / bulk);
        }
      }
      if (roi > bestRoi) {
        bestRoi = roi;
        best = { kind: 'level', id: cfg.id, cost, roi };
      }
    }
    const ab = nextAbility(cfg, lvl, bought);
    if (ab && ab.unlocked && ab.cost <= budget && bought < abilityTiersUnlocked(cfg, lvl)) {
      const direct =
        outputAt(cfg, lvl, gild, bought + 1, xp) - outputAt(cfg, lvl, gild, bought, xp);
      let roi = direct / ab.cost;
      if (direct <= 0) {
        // Special-Stufe(n): die Klammer bis zur nächsten Power-Stufe zusammen
        // preisen (Rhythmen erlauben höchstens zwei Specials in Folge; die
        // Schleifen-Grenze 4 ist reine Absicherung).
        let costSum = ab.cost;
        for (let k = bought + 1; k - bought <= 4; k++) {
          const nxt = nextAbility(cfg, lvl, k);
          if (!nxt || !nxt.unlocked || k >= abilityTiersUnlocked(cfg, lvl)) break;
          costSum += nxt.cost;
          const gain = outputAt(cfg, lvl, gild, k + 1, xp) - outputAt(cfg, lvl, gild, bought, xp);
          if (gain > 0) {
            if (costSum <= budget) roi = gain / costSum;
            break;
          }
        }
      }
      if (roi > bestRoi) {
        bestRoi = roi;
        best = { kind: 'ability', id: cfg.id, cost: ab.cost, roi };
      }
    }
  }
  return best;
}

/**
 * Raw click damage (before global/crit/frenzy): flat floor + the Booty-Boss
 * click line (upgrade 1 IS click damage) + a share of the whole crew's DPS, so
 * a shake always out-hits a single DPS tick and active play stays king (P1).
 */
export function clickDamageRaw(
  levels: CrewLevels,
  gilds: CrewGilds = {},
  ups: CrewUps = {},
  mastery: CrewMastery = {},
  heir = '',
): number {
  let click = CLICK_BASE;
  for (const cfg of CREW)
    click += heroClick(
      cfg,
      levels[cfg.id] ?? 0,
      gilds[cfg.id] ?? 0,
      ups[cfg.id] ?? 0,
      mastery[cfg.id] ?? 0,
      heirWeightFor(cfg.id, heir),
    );
  return click + CLICK_DPS_SHARE * totalRawDps(levels, gilds, ups, mastery, heir);
}
