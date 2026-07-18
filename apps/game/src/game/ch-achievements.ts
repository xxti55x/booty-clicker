/**
 * CH-native achievements (spec §7.3, M13). A fresh, data-driven set for the
 * Clicker-Heroes loop — NOT the legacy M4 set (`game/achievements.ts`, frozen
 * archive over `GameState`/upgrades). Each `check` is a pure predicate over an
 * {@link AchievementCtx} snapshot, so the whole set is unit-testable without a DOM.
 *
 * Unlocked ids persist in the CH-save v8 `achievements: string[]` slice and — like
 * every lifetime acquisition — survive both ascension and Himmelfahrt. The zone
 * gate reads the deepest zone EVER reached (`lifetimeMaxZone` floored by the
 * Himmelfahrt-surviving `gear.zoneEver`), so a Himmelfahrt (which drops
 * `lifetimeMaxZone` to 1 for RS accounting) never makes a zone milestone un-earnable.
 */
import type { ChState } from './ch-state';
import { comboTier } from './combo';
import { totalGilds } from './gild';

/** The read-only snapshot the achievement predicates evaluate against. */
export interface AchievementCtx {
  /** Deepest zone ever reached (Himmelfahrt-safe). */
  bestZone: number;
  /** Bosses defeated (lifetime). */
  bossKills: number;
  /** Longest no-timeout boss streak reached (lifetime max). */
  maxBossStreak: number;
  /** Highest combo stacks ever reached (drives the reached-tier check). */
  maxCombo: number;
  /** Crit clicks landed (lifetime). */
  crits: number;
  /** L1 ascensions performed (lifetime). */
  ascensions: number;
  /** L2 Himmelfahrten performed (lifetime). */
  himmelfahrten: number;
  /** Vergoldungen earned (total across the crew). */
  gilds: number;
  /** Pfirsich-Truhen opened (lifetime). */
  chestsOpened: number;
  /** Truhenschlüssel earned (lifetime). */
  keys: number;
  /** Ruhm-Seelen earned (lifetime highwater = `rsLifetime`). */
  souls: number;
  /** Himmelspfirsiche earned (lifetime highwater). */
  hpf: number;
}

/** A single achievement (data). */
export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly icon: string;
  readonly check: (c: AchievementCtx) => boolean;
}

/**
 * The CH achievement set (spec §7.3): zone milestones, boss kills, no-timeout boss
 * streaks, combo tiers reached, crit counts, ascensions, Himmelfahrten, gilds,
 * chests opened, keys, souls and HPF. Pure data; balancing = thresholds here.
 */
export const CH_ACHIEVEMENTS: readonly Achievement[] = [
  // --- Zone milestones (10/25/50/100/200) ---
  {
    id: 'zone-10',
    name: 'Tyrannen-Bezwinger',
    desc: 'Bühne 10 erreicht',
    icon: '👑',
    check: (c) => c.bestZone >= 10,
  },
  {
    id: 'zone-25',
    name: 'Aufsteiger',
    desc: 'Bühne 25 erreicht',
    icon: '🎪',
    check: (c) => c.bestZone >= 25,
  },
  {
    id: 'zone-50',
    name: 'Headliner',
    desc: 'Bühne 50 erreicht',
    icon: '🌟',
    check: (c) => c.bestZone >= 50,
  },
  {
    id: 'zone-100',
    name: 'Welttournee',
    desc: 'Bühne 100 erreicht',
    icon: '🌍',
    check: (c) => c.bestZone >= 100,
  },
  {
    id: 'zone-200',
    name: 'Orbital-Legende',
    desc: 'Bühne 200 erreicht',
    icon: '🛸',
    check: (c) => c.bestZone >= 200,
  },
  // --- Boss kills ---
  {
    id: 'boss-1',
    name: 'Erstes Blut',
    desc: 'Ersten Boss besiegt',
    icon: '💥',
    check: (c) => c.bossKills >= 1,
  },
  {
    id: 'boss-50',
    name: 'Boss-Brecher',
    desc: '50 Bosse besiegt',
    icon: '🥊',
    check: (c) => c.bossKills >= 50,
  },
  {
    id: 'boss-500',
    name: 'Boss-Vernichter',
    desc: '500 Bosse besiegt',
    icon: '☠️',
    check: (c) => c.bossKills >= 500,
  },
  // --- No-timeout boss streaks ---
  {
    id: 'streak-10',
    name: 'Kaltblütig',
    desc: '10 Bosse ohne Timeout in Folge',
    icon: '🧊',
    check: (c) => c.maxBossStreak >= 10,
  },
  {
    id: 'streak-25',
    name: 'Unaufhaltsam',
    desc: '25 Bosse ohne Timeout in Folge',
    icon: '🔥',
    check: (c) => c.maxBossStreak >= 25,
  },
  // --- Combo tiers reached (via max combo stacks) ---
  {
    id: 'combo-t2',
    name: 'Heiß gelaufen',
    desc: 'Combo-Tier 2 (Heiß) erreicht',
    icon: '♨️',
    check: (c) => comboTier(c.maxCombo) >= 2,
  },
  {
    id: 'combo-t3',
    name: 'Lichterloh',
    desc: 'Combo-Tier 3 (Feuer) erreicht',
    icon: '🔥',
    check: (c) => comboTier(c.maxCombo) >= 3,
  },
  {
    id: 'combo-t4',
    name: 'Inferno',
    desc: 'Combo-Tier 4 (Inferno) erreicht',
    icon: '🌋',
    check: (c) => comboTier(c.maxCombo) >= 4,
  },
  // --- Crit counts ---
  {
    id: 'crit-1k',
    name: 'Krit-Kenner',
    desc: '1 000 Krit-Klicks gelandet',
    icon: '⚡',
    check: (c) => c.crits >= 1000,
  },
  {
    id: 'crit-100k',
    name: 'Krit-Maschine',
    desc: '100 000 Krit-Klicks gelandet',
    icon: '🌩️',
    check: (c) => c.crits >= 100_000,
  },
  // --- Ascensions ---
  {
    id: 'ascend-1',
    name: 'Wiedergeboren',
    desc: 'Zum ersten Mal aszendiert',
    icon: '✨',
    check: (c) => c.ascensions >= 1,
  },
  {
    id: 'ascend-10',
    name: 'Serien-Star',
    desc: '10× aszendiert',
    icon: '💫',
    check: (c) => c.ascensions >= 10,
  },
  {
    id: 'ascend-50',
    name: 'Ruhm-Junkie',
    desc: '50× aszendiert',
    icon: '🏆',
    check: (c) => c.ascensions >= 50,
  },
  // --- Himmelfahrten ---
  {
    id: 'himmel-1',
    name: 'Himmelfahrt',
    desc: 'Erste Ruhmes-Himmelfahrt',
    icon: '🍑',
    check: (c) => c.himmelfahrten >= 1,
  },
  // --- Gilds ---
  {
    id: 'gild-1',
    name: 'Erstvergoldung',
    desc: 'Erste Vergoldung erhalten',
    icon: '🏅',
    check: (c) => c.gilds >= 1,
  },
  {
    id: 'gild-10',
    name: 'Goldrahmen',
    desc: '10 Vergoldungen erhalten',
    icon: '🥇',
    check: (c) => c.gilds >= 10,
  },
  // --- Chests + keys ---
  {
    id: 'chest-1',
    name: 'Truhen-Öffner',
    desc: 'Erste Truhe geöffnet',
    icon: '🎁',
    check: (c) => c.chestsOpened >= 1,
  },
  {
    id: 'chest-50',
    name: 'Schatzjäger',
    desc: '50 Truhen geöffnet',
    icon: '💰',
    check: (c) => c.chestsOpened >= 50,
  },
  {
    id: 'keys-25',
    name: 'Schlüsselmeister',
    desc: '25 Schlüssel verdient',
    icon: '🔑',
    check: (c) => c.keys >= 25,
  },
  // --- Souls + HPF ---
  {
    id: 'souls-100',
    name: 'Seelensammler',
    desc: '100 Ruhm-Seelen verdient',
    icon: '👻',
    check: (c) => c.souls >= 100,
  },
  {
    id: 'souls-10k',
    name: 'Seelen-Magnat',
    desc: '10 000 Ruhm-Seelen verdient',
    icon: '🌀',
    check: (c) => c.souls >= 10_000,
  },
  {
    id: 'hpf-1',
    name: 'Himmelsgärtner',
    desc: 'Ersten Himmelspfirsich verdient',
    icon: '🌸',
    check: (c) => c.hpf >= 1,
  },
];

const CH_ACHIEVEMENT_IDS_SET: ReadonlySet<string> = new Set(CH_ACHIEVEMENTS.map((a) => a.id));

/** All catalog achievement ids (for the save-repair filter). */
export const CH_ACHIEVEMENT_IDS: readonly string[] = CH_ACHIEVEMENTS.map((a) => a.id);

/** Whether `id` is a real catalog achievement id. */
export function isAchievementId(id: unknown): id is string {
  return typeof id === 'string' && CH_ACHIEVEMENT_IDS_SET.has(id);
}

/**
 * Build the evaluation snapshot from a CH-state. Lifetime counters come from
 * `state.stats` (monotonic across both prestige layers); `himmelfahrten` and `hpf`
 * from the L2 `heaven` slice; `gilds` from the gild map; `souls` from the lifetime
 * RS highwater. The zone gate uses the deepest zone EVER reached so a Himmelfahrt
 * (lifetimeMaxZone → 1) never un-earns a zone milestone.
 */
export function buildAchievementCtx(state: ChState): AchievementCtx {
  const s = state.stats;
  return {
    bestZone: Math.max(state.lifetimeMaxZone, state.gear?.zoneEver ?? 1),
    bossKills: s.bossKills,
    maxBossStreak: s.maxBossStreak,
    maxCombo: s.maxCombo,
    crits: s.crits,
    ascensions: s.ascensions,
    himmelfahrten: state.heaven.ascensions2,
    gilds: totalGilds(state.gilds),
    chestsOpened: s.chestsOpened,
    keys: s.keysEarned,
    souls: state.rsLifetime,
    hpf: state.heaven.hpfLifetime,
  };
}

/**
 * The achievements whose predicate now holds but that are not yet in `already`.
 * Part 2 unions the returned ids into the persisted set and fires the toasts.
 */
export function newlyUnlocked(ctx: AchievementCtx, already: ReadonlySet<string>): Achievement[] {
  return CH_ACHIEVEMENTS.filter((a) => !already.has(a.id) && a.check(ctx));
}
