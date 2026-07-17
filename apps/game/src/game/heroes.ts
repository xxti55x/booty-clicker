/**
 * Crew (heroes) core — pure, data-driven (Clicker-Heroes-style).
 *
 * You recruit and level **Crew-Mitglieder** (dancers/staff) with BP. Each level
 * adds idle DPS; at milestone levels a member's output doubles (their "gilding"
 * equivalent). Total DPS also feeds your **click damage** — active twerking stays
 * the star because a click lands a chunky share of your whole crew's DPS *at once*
 * (plus crits/Frenzy applied at the call site).
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
  /** DPS contributed per level (before milestone multipliers). */
  readonly baseDps: number;
}

/** Cost multiplier per owned level (Clicker Heroes uses ~1.07). */
export const HERO_COST_GROWTH = 1.07;

/** Levels at which a crew member's output doubles (×2 each threshold passed). */
export const MILESTONES: readonly number[] = [10, 25, 50, 100, 200, 400, 800];

/** Share of total raw DPS delivered by a single click (before global/crit mult). */
export const CLICK_DPS_SHARE = 0.2;
/** Flat click damage floor, so zone 1 is beatable before any crew exists. */
export const CLICK_BASE = 1;

/** The recruitable crew, cheapest → strongest (each a big DPS jump but pricier). */
export const CREW: readonly HeroConfig[] = [
  { id: 'boss', name: 'Booty-Boss (Du)', ds: 'Der Star der Show.', baseCost: 5, baseDps: 1 },
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
];

/** Crew levels keyed by hero id (absent = level 0). */
export type CrewLevels = Record<string, number>;

/** Fresh crew (all level 0). */
export function createCrew(): CrewLevels {
  return {};
}

/** ×2 for each milestone level reached (10 → ×2, 25 → ×4, …). */
export function milestoneMult(level: number): number {
  let m = 1;
  for (const t of MILESTONES) if (level >= t) m *= 2;
  return m;
}

/** A single member's DPS at `level` (0 when un-recruited). */
export function heroDps(cfg: HeroConfig, level: number): number {
  if (level <= 0) return 0;
  return cfg.baseDps * level * milestoneMult(level);
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

/** Total raw crew DPS (before global/soul/frenzy multipliers). */
export function totalRawDps(levels: CrewLevels): number {
  let dps = 0;
  for (const cfg of CREW) dps += heroDps(cfg, levels[cfg.id] ?? 0);
  return dps;
}

/**
 * Raw click damage (before global/crit/frenzy): a flat floor plus a share of the
 * whole crew's DPS, so a shake always out-hits a single DPS tick and active play
 * stays worthwhile.
 */
export function clickDamageRaw(levels: CrewLevels): number {
  return CLICK_BASE + CLICK_DPS_SHARE * totalRawDps(levels);
}
