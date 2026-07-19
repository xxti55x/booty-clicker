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
export type AbilityKind =
  'power' | 'gold' | 'crit' | 'critdmg' | 'boss' | 'combo' | 'beat' | 'ekstase' | 'idle';

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
  readonly special: Exclude<AbilityKind, 'power'>;
  /** Tier-Rhythmus-Index in `TIER_PATTERNS` (v11.1 Abwechslung). */
  readonly rhythm: 0 | 1 | 2;
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
export const DPS_TUNE = 1.5;
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
  },
  {
    id: 'hype',
    name: 'Hype-Girl',
    ds: 'Feuert das Publikum an.',
    baseCost: 50,
    baseDps: 5,
    special: 'combo',
    rhythm: 1,
  },
  {
    id: 'dj',
    name: 'DJ Wumms',
    ds: 'Legt den fetten Bass auf.',
    baseCost: 250,
    baseDps: 22,
    special: 'beat',
    rhythm: 2,
  },
  {
    id: 'bouncer',
    name: 'Türsteher',
    ds: 'Hält den Beat am Laufen.',
    baseCost: 1000,
    baseDps: 74,
    special: 'boss',
    rhythm: 0,
  },
  {
    id: 'influencer',
    name: 'Insta-Influencerin',
    ds: 'Streamt jeden Move.',
    baseCost: 4000,
    baseDps: 245,
    special: 'gold',
    rhythm: 1,
  },
  {
    id: 'choreo',
    name: 'Star-Choreograph',
    ds: 'Perfektioniert die Routine.',
    baseCost: 20000,
    baseDps: 1100,
    special: 'crit',
    rhythm: 2,
  },
  {
    id: 'producer',
    name: 'Musik-Produzent',
    ds: 'Pumpt Hits am Fließband.',
    baseCost: 100000,
    baseDps: 5000,
    special: 'idle',
    rhythm: 0,
  },
  {
    id: 'promi',
    name: 'A-Promi',
    ds: 'Zieht die Massen an.',
    baseCost: 500000,
    baseDps: 22000,
    special: 'critdmg',
    rhythm: 1,
  },
  {
    id: 'tycoon',
    name: 'Club-Tycoon',
    ds: 'Besitzt den ganzen Laden.',
    baseCost: 3000000,
    baseDps: 120000,
    special: 'gold',
    rhythm: 2,
  },
  {
    id: 'legend',
    name: 'Twerk-Legende',
    ds: 'Schreibt Tanzgeschichte.',
    baseCost: 20000000,
    baseDps: 700000,
    special: 'ekstase',
    rhythm: 0,
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
  },
  {
    id: 'hologram',
    name: 'Hologramm-Double',
    ds: 'Tanzt an zwei Orten zugleich.',
    baseCost: 1200000000,
    baseDps: 30000000,
    special: 'crit',
    rhythm: 2,
  },
  {
    id: 'aicluster',
    name: 'KI-Choreo-Cluster',
    ds: 'Rechnet die perfekte Routine.',
    baseCost: 10000000000,
    baseDps: 220000000,
    special: 'idle',
    rhythm: 0,
  },
  {
    id: 'orbital',
    name: 'Orbitale Tanz-Station',
    ds: 'Twerkt in der Umlaufbahn.',
    baseCost: 80000000000,
    baseDps: 1600000000,
    special: 'boss',
    rhythm: 1,
  },
  {
    id: 'cosmic',
    name: 'Kosmische Twerk-Entität',
    ds: 'Der Beat des Universums.',
    baseCost: 650000000000,
    baseDps: 12000000000,
    special: 'ekstase',
    rhythm: 2,
  },
];

/** Crew levels keyed by hero id (absent = level 0). */
export type CrewLevels = Record<string, number>;

/** Fresh crew (all level 0). */
export function createCrew(): CrewLevels {
  return {};
}

/** Unlock level of ability tier `n` (1-based): 25, 75, 125, … */
export function abilityLevel(tier: number): number {
  return ABILITY_FIRST_LEVEL + ABILITY_SPACING * (Math.max(1, Math.floor(tier)) - 1);
}

/** How many ability tiers `level` has unlocked (0 below Lv 25, endless above). */
export function abilityTiersUnlocked(level: number): number {
  if (level < ABILITY_FIRST_LEVEL) return 0;
  return Math.floor((level - ABILITY_FIRST_LEVEL) / ABILITY_SPACING) + 1;
}

/**
 * The kind of ability tier `n` (1-based) for a member — v11.1: read from the
 * member's TIER-RHYTHMUS (`TIER_PATTERNS[cfg.rhythm]`, 4er-Zyklus). Every
 * pattern carries 2 power + 2 special per cycle, so the long-run balance is
 * rhythm-independent; only the ORDER differs per member.
 */
export function abilityKind(cfg: HeroConfig, tier: number): AbilityKind {
  const pat = TIER_PATTERNS[cfg.rhythm];
  return pat[(Math.max(1, Math.floor(tier)) - 1) % pat.length] === 'power' ? 'power' : cfg.special;
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
 */
export function crewSpecialBonuses(ups: CrewUps): CrewSpecialBonuses {
  const n: Record<Exclude<AbilityKind, 'power'>, number> = {
    gold: 0,
    crit: 0,
    critdmg: 0,
    boss: 0,
    combo: 0,
    beat: 0,
    ekstase: 0,
    idle: 0,
  };
  for (const cfg of CREW) n[cfg.special] += specialTiers(cfg, ups[cfg.id] ?? 0);
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
): { tier: number; level: number; cost: number; unlocked: boolean } {
  const tier = Math.max(0, Math.floor(bought)) + 1;
  const lv = abilityLevel(tier);
  return { tier, level: lv, cost: abilityCost(cfg, tier), unlocked: level >= lv };
}

/** Permanent DPS multiplier from `gildCount` gilds on a member (×1.25 each, §4.3.4). */
export function gildMult(gildCount: number): number {
  return Math.pow(GILD_DPS_MULT, Math.max(0, gildCount));
}

/**
 * A single member's DPS at `level` (0 when un-recruited or for the click hero),
 * scaled by BOUGHT abilities (`ups`) and gilds. Abilities no longer come free
 * with levels — pass the purchased count.
 */
export function heroDps(cfg: HeroConfig, level: number, gildCount = 0, ups = 0): number {
  if (level <= 0 || cfg.click) return 0;
  return cfg.baseDps * DPS_TUNE * level * abilityMult(cfg, ups) * gildMult(gildCount);
}

/** The click hero's shake damage at `level` (0 for DPS members), same scaling. */
export function heroClick(cfg: HeroConfig, level: number, gildCount = 0, ups = 0): number {
  if (level <= 0 || !cfg.click) return 0;
  return cfg.baseDps * level * abilityMult(cfg, ups) * gildMult(gildCount);
}

/** Cost to buy the NEXT level from `level`: floor(baseCost · growth^level). */
export function nextLevelCost(cfg: HeroConfig, level: number): number {
  return Math.floor(cfg.baseCost * Math.pow(HERO_COST_GROWTH, level));
}

/** Cost to buy `count` levels starting at `fromLevel` (geometric sum, floored). */
export function bulkCost(cfg: HeroConfig, fromLevel: number, count: number): number {
  if (count <= 0) return 0;
  const r = HERO_COST_GROWTH;
  const first = cfg.baseCost * Math.pow(r, fromLevel);
  const sum = (first * (Math.pow(r, count) - 1)) / (r - 1);
  return Math.floor(sum);
}

/** How many levels are affordable from `fromLevel` with `gold` (for "buy max"). */
export function maxAffordable(cfg: HeroConfig, fromLevel: number, gold: number): number {
  if (gold < nextLevelCost(cfg, fromLevel)) return 0;
  const r = HERO_COST_GROWTH;
  const first = cfg.baseCost * Math.pow(r, fromLevel);
  // Largest n with first·(r^n − 1)/(r − 1) ≤ gold.
  const n = Math.floor(Math.log((gold * (r - 1)) / first + 1) / Math.log(r));
  // Guard floating error: step down until it truly fits.
  let count = Math.max(0, n);
  while (count > 0 && bulkCost(cfg, fromLevel, count) > gold) count--;
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

/** Total raw crew DPS (before global/soul/frenzy multipliers): gilds + bought abilities. */
export function totalRawDps(levels: CrewLevels, gilds: CrewGilds = {}, ups: CrewUps = {}): number {
  let dps = 0;
  for (const cfg of CREW)
    dps += heroDps(cfg, levels[cfg.id] ?? 0, gilds[cfg.id] ?? 0, ups[cfg.id] ?? 0);
  return dps;
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
): number {
  let click = CLICK_BASE;
  for (const cfg of CREW)
    click += heroClick(cfg, levels[cfg.id] ?? 0, gilds[cfg.id] ?? 0, ups[cfg.id] ?? 0);
  return click + CLICK_DPS_SHARE * totalRawDps(levels, gilds, ups);
}
