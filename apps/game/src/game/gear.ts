/**
 * Skins-as-Gear — the pure gear fold (spec §5, M11).
 *
 * One active **skin** (full buff, scaled by level + stars), one active **kulisse**
 * (a small mini-buff), and any **set bonuses** their combination unlocks fold into a
 * single pure `GearBonus` record — a total per `BuffStat`. The derived click/DPS/
 * gold/boss/combo/beat/ability pipelines read it through the helper functions
 * (`clickGearMult`, `dpsGearMult`, …), mirroring how `ancients.ts`/`heaven.ts`
 * expose their aggregated modifiers. No skin is cosmetic; the strongest buffs are
 * click buffs (P1). Everything is data + pure functions — balancing lives in the
 * `SKINS` catalog (`character/skins.ts`), `KULISSE_BUFFS`, `SET_BONUSES` and the
 * economy/unlock tables here.
 *
 * This is the M11 CORE only: the `GearState` shape is defined here but persisted by
 * part 2 (CH-save v6), and the glue/UI wiring is part 3. Chest/key stats are
 * data-only until M12; Diamant-Booty is locked until Transzendenz (M14).
 */
import { SKINS } from '../character/skins';
import type { BackgroundKey, BuffStat, SkinKey, SkinRarity } from '../types';

/**
 * The serializable gear slice (spec §5.2; persisted as CH-save v6 by part 2).
 * `skinLevels`/`skinStars` are keyed by skin id (absent = 0). `nextSugarAt` is the
 * epoch-ms at which the next Zuckerpfirsich ripens (0 in a fresh, pure default —
 * part 2 seeds `now + 24 h`).
 */
export interface GearState {
  /** The equipped skin (its full buff applies). */
  skin: SkinKey;
  /** The equipped kulisse/background (its mini-buff applies). */
  bg: BackgroundKey;
  /** Whether the kulisse auto-rotates with the zone ("Tour-Modus", MVP default). */
  bgAuto: boolean;
  /** Per-skin levels (1–50), keyed by skin id. */
  skinLevels: Record<string, number>;
  /** Per-skin stars (0–5), keyed by skin id. */
  skinStars: Record<string, number>;
  /** Held Pfirsich-Splitter (🧩) — spent levelling skins (§5.4, M12 supplies them). */
  shards: number;
  /** Held Zuckerpfirsiche (🍬) — spent on skin stars (§5.4). */
  sugarPeaches: number;
  /** Epoch-ms when the next 🍬 ripens (0 = unseeded; part 2 seeds `now + 24 h`). */
  nextSugarAt: number;
}

/** A brand-new gear slice (deterministic/pure — part 2 seeds `nextSugarAt`). */
export function createGear(): GearState {
  return {
    skin: 'classic',
    bg: 'club',
    bgAuto: true,
    skinLevels: {},
    skinStars: {},
    shards: 0,
    sugarPeaches: 0,
    nextSugarAt: 0,
  };
}

// ---------------------------------------------------------------------------
// Level & star access (sanitised, clamped)
// ---------------------------------------------------------------------------

/** Max skin level (spec §5.4: levels 1–50). */
export const MAX_SKIN_LEVEL = 50;
/** Max skin stars (spec §5.4: stars 0–5). */
export const MAX_SKIN_STARS = 5;

function sanitizeCount(v: unknown, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : 0;
}

/** Current (sanitised, 0–50) level of a skin. */
export function skinLevel(gear: GearState, id: string): number {
  return sanitizeCount(gear.skinLevels[id], MAX_SKIN_LEVEL);
}

/** Current (sanitised, 0–5) star count of a skin. */
export function skinStarCount(gear: GearState, id: string): number {
  return sanitizeCount(gear.skinStars[id], MAX_SKIN_STARS);
}

// ---------------------------------------------------------------------------
// Kulisse mini-buffs & set bonuses (spec §5.5)
// ---------------------------------------------------------------------------

/** A single (stat, amount) contribution. */
export interface StatContribution {
  readonly stat: BuffStat;
  readonly amount: number;
}

/**
 * Kulisse mini-buffs (spec §5.5): Club +0.1 s combo-window · Synth +10 ms beat-
 * window · Beach +2 h offline-cap · Space +5 % crew-DPS. Windows are in their
 * native units (comboWindow s, beatWindow ms), offlineCap in seconds.
 */
export const KULISSE_BUFFS: Record<BackgroundKey, StatContribution> = {
  club: { stat: 'comboWindow', amount: 0.1 },
  synth: { stat: 'beatWindow', amount: 10 },
  beach: { stat: 'offlineCap', amount: 2 * 3600 },
  space: { stat: 'dpsPct', amount: 0.05 },
};

/** A set-bonus definition (skin × kulisse ⇒ one stat contribution). */
export interface SetBonusConfig {
  readonly id: string;
  readonly name: string;
  readonly skin: SkinKey;
  /** Required kulisse, or `null` for "any" (Krönung). */
  readonly bg: BackgroundKey | null;
  readonly stat: BuffStat;
  readonly amount: number;
}

/**
 * Set bonuses (spec §5.5). Detected purely from the active skin × active kulisse.
 * "Krönung" is Tyrann + any boss-zone kulisse; since its only effect is +10 % boss
 * damage, and boss damage only ever lands on a boss zone (z % 5 = 0), it is encoded
 * as `bg: null` ("any kulisse") — it is behaviourally identical to the boss-zone
 * gate because `bossDmg` is only applied during boss fights. (Catalog interpretation.)
 */
export const SET_BONUSES: readonly SetBonusConfig[] = [
  { id: 'studio54', name: 'Studio 54', skin: 'disco', bg: 'club', stat: 'critMult', amount: 0.1 },
  {
    id: 'retrowelle',
    name: 'Retrowelle',
    skin: 'neon',
    bg: 'synth',
    stat: 'beatWindow',
    amount: 20,
  },
  {
    id: 'endlessSummer',
    name: 'Endless Summer',
    skin: 'pirate',
    bg: 'beach',
    stat: 'offlineRate',
    amount: 0.15,
  },
  { id: 'voidFunk', name: 'Void-Funk', skin: 'gyrator', bg: 'space', stat: 'dpsPct', amount: 0.15 },
  { id: 'kronung', name: 'Krönung', skin: 'boss', bg: null, stat: 'bossDmg', amount: 0.1 },
];

/** The set bonuses active for the current skin × kulisse combination. */
export function activeSets(gear: GearState): readonly SetBonusConfig[] {
  return SET_BONUSES.filter((s) => s.skin === gear.skin && (s.bg === null || s.bg === gear.bg));
}

// ---------------------------------------------------------------------------
// The pure fold
// ---------------------------------------------------------------------------

/** A summed total per `BuffStat`. */
export type GearBonus = Record<BuffStat, number>;

/**
 * The percentage-unit stats. Diamant-Booty's "+X % ALLES" (`allPct`) is added to
 * each of these; the absolute-unit stats (windows in s/ms, offline-cap seconds,
 * coach cps, on-beat multiplier, flat Ekstase seconds) are left untouched.
 */
export const PERCENT_STATS: readonly BuffStat[] = [
  'clickPct',
  'dpsPct',
  'critChance',
  'critMult',
  'goldPct',
  'bossDmg',
  'keyDrop',
  'chestLuck',
  'frenzyDur',
  'comboDecay',
  'frenzyCharge',
  'offlineRate',
];

/** A zeroed `GearBonus` (every stat at 0). */
export function emptyGearBonus(): GearBonus {
  return {
    clickPct: 0,
    dpsPct: 0,
    critChance: 0,
    critMult: 0,
    comboWindow: 0,
    comboDecay: 0,
    goldPct: 0,
    bossDmg: 0,
    bossTimer: 0,
    beatWindow: 0,
    chestLuck: 0,
    keyDrop: 0,
    offlineCap: 0,
    frenzyDur: 0,
    allPct: 0,
    coachCps: 0,
    onBeatMult: 0,
    frenzyDurSec: 0,
    frenzyCharge: 0,
    offlineRate: 0,
  };
}

/**
 * Fold the active skin (buff·level + star·stars) + active kulisse mini-buff + set
 * bonuses into a single `GearBonus`. Finally, Diamant-Booty's `allPct` total is
 * distributed across every percentage stat ("+X % ALLES"). Pure over `gear` alone.
 */
export function gearBonus(gear: GearState): GearBonus {
  const bonus = emptyGearBonus();

  // 1. Active skin: buff·level + star·stars (buff.stat and star.stat may differ).
  const cfg = SKINS[gear.skin];
  if (cfg) {
    bonus[cfg.buff.stat] += cfg.buff.perLevel * skinLevel(gear, gear.skin);
    bonus[cfg.star.stat] += cfg.star.perStar * skinStarCount(gear, gear.skin);
  }

  // 2. Active kulisse mini-buff.
  const kul = KULISSE_BUFFS[gear.bg];
  if (kul) bonus[kul.stat] += kul.amount;

  // 3. Set bonuses (skin × kulisse).
  for (const set of activeSets(gear)) bonus[set.stat] += set.amount;

  // 4. Diamant "+X % ALLES": distribute allPct across every percentage stat.
  if (bonus.allPct !== 0) {
    for (const s of PERCENT_STATS) bonus[s] += bonus.allPct;
  }

  return bonus;
}

// ---------------------------------------------------------------------------
// Helpers consumed by the derived pipelines (parts 2/3)
// ---------------------------------------------------------------------------

/** Click-damage multiplier from gear: ×(1 + clickPct). */
export function clickGearMult(gear: GearState): number {
  return 1 + gearBonus(gear).clickPct;
}
/** Crew-DPS multiplier from gear: ×(1 + dpsPct). */
export function dpsGearMult(gear: GearState): number {
  return 1 + gearBonus(gear).dpsPct;
}
/** Gold multiplier from gear: ×(1 + goldPct). */
export function goldGearMult(gear: GearState): number {
  return 1 + gearBonus(gear).goldPct;
}
/** Boss-damage multiplier from gear: ×(1 + bossDmg) (Krönung + Tyrann fold in here). */
export function bossDmgMult(gear: GearState): number {
  return 1 + gearBonus(gear).bossDmg;
}
/** Additive crit-chance bonus (feeds `click.critChance`, which caps it). */
export function critChanceBonus(gear: GearState): number {
  return gearBonus(gear).critChance;
}
/** Additive crit-multiplier bonus (feeds `click.critMult`, added to CRIT_MULT). */
export function critMultBonus(gear: GearState): number {
  return gearBonus(gear).critMult;
}
/** Extra combo-window seconds. */
export function comboWindowBonus(gear: GearState): number {
  return gearBonus(gear).comboWindow;
}
/** Combo-decay reduction fraction (Showmaster stars, −4 %/⭐). */
export function comboDecayReduction(gear: GearState): number {
  return gearBonus(gear).comboDecay;
}
/** Extra on-beat detection window in ms. */
export function beatWindowBonus(gear: GearState): number {
  return gearBonus(gear).beatWindow;
}
/** Extra boss-timer seconds. */
export function bossTimerBonus(gear: GearState): number {
  return gearBonus(gear).bossTimer;
}
/** Ekstase-duration multiplier bonus fraction (+10 %/level from Gyrator). */
export function frenzyDurBonus(gear: GearState): number {
  return gearBonus(gear).frenzyDur;
}
/** Flat extra Ekstase seconds (Lava stars, +1 s/⭐). */
export function frenzyDurSecBonus(gear: GearState): number {
  return gearBonus(gear).frenzyDurSec;
}
/** Ekstase charge-need reduction fraction (Gyrator stars, −8 %/⭐). */
export function frenzyChargeReduction(gear: GearState): number {
  return gearBonus(gear).frenzyCharge;
}
/** Extra offline cap in seconds (Beach kulisse, +2 h). */
export function offlineCapBonus(gear: GearState): number {
  return gearBonus(gear).offlineCap;
}
/** Offline-efficiency bump fraction (Endless Summer set, 50 % → 65 %). */
export function offlineRateBonus(gear: GearState): number {
  return gearBonus(gear).offlineRate;
}
/** Additive chest-luck fraction (data-only until M12). */
export function chestLuckBonus(gear: GearState): number {
  return gearBonus(gear).chestLuck;
}
/** Additive key-drop fraction (data-only until M12). */
export function keyDropBonus(gear: GearState): number {
  return gearBonus(gear).keyDrop;
}
/** Extra coach clicks-per-second (Robo stars, +0.2 cps/⭐). */
export function coachCpsBonus(gear: GearState): number {
  return gearBonus(gear).coachCps;
}
/** Additive on-beat multiplier bonus (Neon-Ninja stars, ×1.5 → ×1.6 per ⭐). */
export function onBeatMultBonus(gear: GearState): number {
  return gearBonus(gear).onBeatMult;
}

// ---------------------------------------------------------------------------
// Economy (spec §5.4): shards, sugar, duplicate → shard values
// ---------------------------------------------------------------------------

/** Base shard cost factor. */
export const SHARD_BASE = 10;
/** Per-level shard growth. */
export const SHARD_GROWTH = 1.25;

/** 🧩 cost to raise a skin to `level` (spec §5.4: `10·⌈1.25^level⌉`, levels 1–50). */
export function shardCost(level: number): number {
  return SHARD_BASE * Math.ceil(Math.pow(SHARD_GROWTH, level));
}

/**
 * 🍬 cost to buy the star that takes a skin from `star` → `star+1` (spec §5.4:
 * `star + 1`, stars 0–5). Returns `null` at the cap (already 5 stars).
 */
export function sugarCostForStar(star: number): number | null {
  if (star >= MAX_SKIN_STARS) return null;
  return Math.max(0, Math.floor(star)) + 1;
}

/** Duplicate-from-chest 🧩 value per rarity (spec §5.4: 25 common … 400 legendary; M12). */
export const DUP_SHARD_VALUE: Record<SkinRarity, number> = {
  common: 25,
  rare: 60,
  epic: 160,
  legendary: 400,
  mythic: 1000,
};

// ---------------------------------------------------------------------------
// Sugar maturation (spec §5.4 / AC2): one 🍬 ripens per 24 h real-time
// ---------------------------------------------------------------------------

/** Real-time period a Zuckerpfirsich takes to ripen: 24 h in ms. */
export const SUGAR_PERIOD_MS = 24 * 3600 * 1000;

/**
 * How many 🍬 have ripened at `now`, plus the updated `nextSugarAt`. One ripens per
 * `SUGAR_PERIOD_MS`. A far-future `nextSugarAt` (clock set forward, then back) is
 * clamped to `now + SUGAR_PERIOD_MS`, so a backwards clock can never yield a
 * negative timer or a negative count (§9.2.2 invariant repair, AC2). Pure.
 */
export function maturedSugar(
  nextSugarAt: number,
  now: number,
): { ripened: number; nextSugarAt: number } {
  let next = nextSugarAt;
  // Clamp a nonsensical/too-far-future timer down to one full period from now.
  if (!Number.isFinite(next) || next > now + SUGAR_PERIOD_MS) {
    next = now + SUGAR_PERIOD_MS;
  }
  if (now < next) return { ripened: 0, nextSugarAt: next };
  const ripened = Math.floor((now - next) / SUGAR_PERIOD_MS) + 1;
  return { ripened, nextSugarAt: next + ripened * SUGAR_PERIOD_MS };
}

// ---------------------------------------------------------------------------
// Unlock gating (spec §5.1/§5.3) — pure
// ---------------------------------------------------------------------------

/** How a skin is unlocked. */
export type UnlockKind = 'start' | 'zone' | 'boss' | 'himmelfahrt' | 'craft' | 'transcend';

/** A skin's unlock rule (data). */
export interface UnlockRule {
  readonly kind: UnlockKind;
  /** For 'zone' (lifetimeMaxZone ≥) and 'boss' (first-kill of this boss zone). */
  readonly zone?: number;
  /** For 'craft': 🧩 cost to craft (M12). */
  readonly craftCost?: number;
}

/** Per-skin unlock rules (spec §5.3 "Beschaffung"). */
export const SKIN_UNLOCKS: Record<SkinKey, UnlockRule> = {
  classic: { kind: 'start' },
  disco: { kind: 'start' },
  robo: { kind: 'zone', zone: 15 },
  host: { kind: 'zone', zone: 25 },
  boss: { kind: 'boss', zone: 10 },
  neon: { kind: 'craft', craftCost: 120 },
  pirate: { kind: 'craft', craftCost: 80 },
  lava: { kind: 'boss', zone: 50 },
  gyrator: { kind: 'himmelfahrt' },
  diamond: { kind: 'transcend' },
};

/** Context for unlock checks (supplied by part 2 from the CH-state/legacy import). */
export interface UnlockCtx {
  /** Deepest zone ever reached (drives zone-gated skins). */
  readonly lifetimeMaxZone: number;
  /** Boss zones whose boss has been first-killed (drives Tyrann/Lava). */
  readonly bossFirstKills: ReadonlySet<number>;
  /** Number of Himmelfahrten performed (drives Gyrator). */
  readonly himmelfahrten: number;
  /** Skin ids already crafted with shards (drives Neon-Ninja/Pfirsich-Pirat). */
  readonly crafted: ReadonlySet<string>;
}

/**
 * Whether `skinId` is unlocked given `ctx`. Tyrann's legacy claim (`bossDefeated`
 * old-save ⇒ unlocked) is handled by part 2 seeding `bossFirstKills` with zone 10.
 * Diamant-Booty stays locked until Transzendenz (M14) — always false for now.
 */
export function skinUnlocked(skinId: SkinKey, ctx: UnlockCtx): boolean {
  const rule = SKIN_UNLOCKS[skinId];
  if (!rule) return false;
  switch (rule.kind) {
    case 'start':
      return true;
    case 'zone':
      return ctx.lifetimeMaxZone >= (rule.zone ?? Infinity);
    case 'boss':
      return ctx.bossFirstKills.has(rule.zone ?? -1);
    case 'himmelfahrt':
      return ctx.himmelfahrten >= 1;
    case 'craft':
      return ctx.crafted.has(skinId);
    case 'transcend':
      return false;
    default:
      return false;
  }
}

/** 🧩 craft cost for a craftable skin, or `null` when it isn't craft-gated. */
export function craftCost(skinId: SkinKey): number | null {
  return SKIN_UNLOCKS[skinId]?.craftCost ?? null;
}
