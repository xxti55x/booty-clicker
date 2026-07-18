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

/**
 * Fixed milestone levels at which a crew member's output doubles (×2 each passed).
 * Beyond the last one, milestones become **endless**: every further doubling of
 * the last fixed threshold (1600, 3200, 6400, …) is also a ×2 gate (spec §4.3.3),
 * so long-run DPS(level) grows ~quadratically instead of linearly and the crew
 * never saturates hard (M9 anti-plateau, cost-side).
 */
export const MILESTONES: readonly number[] = [10, 25, 50, 100, 200, 400, 800];

/** The last fixed milestone; endless doublings (×2, ×4, …) continue past it. */
export const MILESTONE_ENDLESS_BASE = MILESTONES[MILESTONES.length - 1];

/** Permanent per-gild DPS multiplier for a crew member (×1.25 each, spec §4.3.4). */
export const GILD_DPS_MULT = 1.25;

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

/**
 * How many ×2 milestone thresholds `level` has passed — the fixed list plus the
 * endless doublings (1600, 3200, …) beyond `MILESTONE_ENDLESS_BASE`. Integer
 * doubling stays exact (≤ 2^53), so this is float-safe at any level.
 */
export function milestoneCount(level: number): number {
  let count = 0;
  for (const t of MILESTONES) if (level >= t) count++;
  for (let t = MILESTONE_ENDLESS_BASE * 2; level >= t; t *= 2) count++;
  return count;
}

/** ×2 for each milestone level reached (10 → ×2, 25 → ×4, … 1600 → ×2⁸, endless). */
export function milestoneMult(level: number): number {
  return Math.pow(2, milestoneCount(level));
}

/**
 * Levels remaining until this member's next ×2 milestone (spec §4.3.2, the AdCap
 * "noch n Level bis ×2" bar), plus the [prev, next] milestone bracket for a
 * progress fraction. Milestones are endless (§4.3.3), so there is always a next
 * bracket — never null. Pure UI helper.
 */
export function nextMilestone(level: number): { next: number; prev: number; remaining: number } {
  for (let i = 0; i < MILESTONES.length; i++) {
    if (level < MILESTONES[i]) {
      const prev = i === 0 ? 0 : MILESTONES[i - 1];
      return { next: MILESTONES[i], prev, remaining: MILESTONES[i] - level };
    }
  }
  // Endless doublings past the last fixed milestone.
  let prev = MILESTONE_ENDLESS_BASE;
  let next = MILESTONE_ENDLESS_BASE * 2;
  while (level >= next) {
    prev = next;
    next *= 2;
  }
  return { next, prev, remaining: next - level };
}

/** Permanent DPS multiplier from `gildCount` gilds on a member (×1.25 each, §4.3.4). */
export function gildMult(gildCount: number): number {
  return Math.pow(GILD_DPS_MULT, Math.max(0, gildCount));
}

/** A single member's DPS at `level` (0 when un-recruited), scaled by its gilds. */
export function heroDps(cfg: HeroConfig, level: number, gildCount = 0): number {
  if (level <= 0) return 0;
  return cfg.baseDps * level * milestoneMult(level) * gildMult(gildCount);
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

/** Total raw crew DPS (before global/soul/frenzy multipliers), folding in gilds. */
export function totalRawDps(levels: CrewLevels, gilds: CrewGilds = {}): number {
  let dps = 0;
  for (const cfg of CREW) dps += heroDps(cfg, levels[cfg.id] ?? 0, gilds[cfg.id] ?? 0);
  return dps;
}

/**
 * Raw click damage (before global/crit/frenzy): a flat floor plus a share of the
 * whole crew's DPS, so a shake always out-hits a single DPS tick and active play
 * stays worthwhile.
 */
export function clickDamageRaw(levels: CrewLevels, gilds: CrewGilds = {}): number {
  return CLICK_BASE + CLICK_DPS_SHARE * totalRawDps(levels, gilds);
}
