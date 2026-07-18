/**
 * Crew (heroes) core — pure, data-driven (Clicker-Heroes-style).
 *
 * You recruit and level **Crew-Mitglieder** (dancers/staff) with BP. Slot 1
 * (Booty-Boss, `click: true`) is THE click-damage line — its levels raise shake
 * damage, not DPS; every member after it is a pure idle-DPS upgrade. On top of
 * levels each member has **kaufbare Fähigkeiten** (buyable abilities): the first
 * unlocks at Lv 25 and then one every 50 levels (25, 75, 125, …), each granting
 * +100 % base output — but only once PAID for in BP. Converting the old free
 * ×2 milestones into paid, additively-stacking abilities is the deliberate
 * slow-down: power now costs gold, and the multiplier grows linearly in bought
 * tiers (1+n) instead of exponentially, keeping the M9 anti-plateau shape
 * (DPS(level) ~ level²) at a gentler slope.
 *
 * Clicks still land `CLICK_DPS_SHARE` of total crew DPS on top of the Boss line,
 * so active twerking stays the star at every depth (P1).
 *
 * Balancing is entirely in `CREW` + the consts here. All math is pure so DPS,
 * costs and buy-amounts are unit-tested and deterministic.
 */

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
}

/** Cost multiplier per owned level (Clicker Heroes uses ~1.07). */
export const HERO_COST_GROWTH = 1.07;

/**
 * Buyable-ability schedule: first at Lv 25, then one every 50 levels
 * (25, 75, 125, … — inside the goal's "alle 25–50 Level" window, endless).
 */
export const ABILITY_FIRST_LEVEL = 25;
export const ABILITY_SPACING = 50;
/** Each bought ability adds +100 % of base output (additive: mult = 1 + n). */
export const ABILITY_BONUS = 1;
/**
 * v10 idle retune: paid abilities removed ~×8 of the old free milestone power,
 * which over-nerfed the idle side (a 1-cps player relies on crew DPS almost
 * alone). This factor gives the DPS lines ~×2 back — actives feel it only via
 * the 20 % click share, so the deliberate active-progression slowdown stays.
 */
export const DPS_TUNE = 2;
/** Ability price = the level-cost at its unlock level × this factor. */
export const ABILITY_COST_MULT = 6;

/** Permanent per-gild DPS multiplier for a crew member (×1.25 each, spec §4.3.4). */
export const GILD_DPS_MULT = 1.25;

/** Share of total raw DPS delivered by a single click (before global/crit mult). */
export const CLICK_DPS_SHARE = 0.2;
/** Flat click damage floor, so zone 1 is beatable before any crew exists. */
export const CLICK_BASE = 1;

/** The recruitable crew, cheapest → strongest (each a big DPS jump but pricier). */
export const CREW: readonly HeroConfig[] = [
  {
    id: 'boss',
    name: 'Booty-Boss (Du)',
    ds: 'Der Star der Show — jedes Level: mehr Klick-Schaden.',
    baseCost: 5,
    baseDps: 1,
    click: true,
  },
  { id: 'hype', name: 'Hype-Girl', ds: 'Feuert das Publikum an.', baseCost: 50, baseDps: 5 },
  { id: 'dj', name: 'DJ Wumms', ds: 'Legt den fetten Bass auf.', baseCost: 250, baseDps: 22 },
  { id: 'bouncer', name: 'Türsteher', ds: 'Hält den Beat am Laufen.', baseCost: 1000, baseDps: 74 },
  {
    id: 'influencer',
    name: 'Insta-Influencerin',
    ds: 'Streamt jeden Move.',
    baseCost: 4000,
    baseDps: 245,
  },
  {
    id: 'choreo',
    name: 'Star-Choreograph',
    ds: 'Perfektioniert die Routine.',
    baseCost: 20000,
    baseDps: 1100,
  },
  {
    id: 'producer',
    name: 'Musik-Produzent',
    ds: 'Pumpt Hits am Fließband.',
    baseCost: 100000,
    baseDps: 5000,
  },
  { id: 'promi', name: 'A-Promi', ds: 'Zieht die Massen an.', baseCost: 500000, baseDps: 22000 },
  {
    id: 'tycoon',
    name: 'Club-Tycoon',
    ds: 'Besitzt den ganzen Laden.',
    baseCost: 3000000,
    baseDps: 120000,
  },
  {
    id: 'legend',
    name: 'Twerk-Legende',
    ds: 'Schreibt Tanzgeschichte.',
    baseCost: 20000000,
    baseDps: 700000,
  },
  // M9 crew expansion (spec §4.3.3): +5 endless tiers, ~×6–8 cost / ~×6–7 DPS each.
  {
    id: 'viral',
    name: 'Viral-Video-Team',
    ds: 'Dreht jeden Move zum Meme.',
    baseCost: 150000000,
    baseDps: 4500000,
  },
  {
    id: 'hologram',
    name: 'Hologramm-Double',
    ds: 'Tanzt an zwei Orten zugleich.',
    baseCost: 1200000000,
    baseDps: 30000000,
  },
  {
    id: 'aicluster',
    name: 'KI-Choreo-Cluster',
    ds: 'Rechnet die perfekte Routine.',
    baseCost: 10000000000,
    baseDps: 220000000,
  },
  {
    id: 'orbital',
    name: 'Orbitale Tanz-Station',
    ds: 'Twerkt in der Umlaufbahn.',
    baseCost: 80000000000,
    baseDps: 1600000000,
  },
  {
    id: 'cosmic',
    name: 'Kosmische Twerk-Entität',
    ds: 'Der Beat des Universums.',
    baseCost: 650000000000,
    baseDps: 12000000000,
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

/** Output multiplier from `bought` abilities: 1 + n (each = +100 % base). */
export function abilityMult(bought: number): number {
  return 1 + ABILITY_BONUS * Math.max(0, Math.floor(bought));
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
  return cfg.baseDps * DPS_TUNE * level * abilityMult(ups) * gildMult(gildCount);
}

/** The click hero's shake damage at `level` (0 for DPS members), same scaling. */
export function heroClick(cfg: HeroConfig, level: number, gildCount = 0, ups = 0): number {
  if (level <= 0 || !cfg.click) return 0;
  return cfg.baseDps * level * abilityMult(ups) * gildMult(gildCount);
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
