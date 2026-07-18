/**
 * Clicker-Heroes-mode game state (the endless Booty Clicker MVP).
 *
 * Kept deliberately separate from the legacy M0–M6 `GameState`/save layer: this
 * mode has its own persisted slice + save key, so the old economy tests stay
 * green while the new loop drives the game. Derived combat numbers (DPS, click
 * damage) are NEVER persisted — they're recomputed from crew levels + souls.
 */
import { type AbilityState, createAbility } from './ability';
import { applyAscension, soulMult } from './ascension';
import {
  type AncientLevels,
  ancientChestLuckBonus,
  ancientClickMult,
  ancientDpsMult,
  ancientGoldMult,
  createAncients,
} from './ancients';
import {
  type ChestTier,
  type PermTokens,
  type PityState,
  createPermTokens,
  createPity,
  permTokenDpsMult,
  permTokenGoldMult,
} from './chests';
import {
  type GearState,
  type UnlockCtx,
  chestLuckBonus,
  clickGearMult,
  createGear,
  dpsGearMult,
  goldGearMult,
  keyDropBonus,
} from './gear';
import { type Gilds, createGilds } from './gild';
import {
  type HeavenState,
  bankHimmelfahrt,
  createHeaven,
  heavenGlobalMult,
  soulBonusEff,
  truhenMagnetBonus,
} from './heaven';
import { type CrewLevels, clickDamageRaw, createCrew, totalRawDps } from './heroes';
import { incomeMultiplier } from './peach';
import { type MetaState, createMeta } from './quests';
import { createRngState, type RngState } from '../util/rng';

/** Persisted combo slice (CH-save v3): only the stack count survives a reload. */
export interface ComboSave {
  stacks: number;
}

/** A zeroed combo slice. */
export function createComboSave(): ComboSave {
  return { stacks: 0 };
}

/**
 * Pfirsich-Truhen inventory slice (CH-save v7, §6). `keys` are 🔑 (spent opening
 * chests); `inventory` counts unopened chests per tier; `pity` holds the per-tier
 * pity counters (§6.3.1, persisted); `skins` is the collectible set of owned
 * jackpot chest-skin ids (§6.3.2 — a duplicate jackpot converts to 🧩). These are
 * meta loot: they survive both ascension and Himmelfahrt.
 */
export interface ChestsState {
  keys: number;
  inventory: Record<ChestTier, number>;
  pity: PityState;
  /** Owned jackpot chest-skin ids (collectibles, not 3D rigs — §6.3.2). */
  skins: string[];
}

/** A fresh, empty loot inventory (no keys, no chests, zeroed pity, no skins). */
export function createChests(): ChestsState {
  return {
    keys: 0,
    inventory: { wood: 0, gold: 0, diamond: 0, mythic: 0 },
    pity: createPity(),
    skins: [],
  };
}

/**
 * Golden-Peach event slice (CH-save v7, §6.1). `nextPeachAt` is the epoch-ms the
 * next peach spawns (0 = unseeded ⇒ the glue seeds `rollNextPeachAt` on boot);
 * `boostUntil` is the epoch-ms the active ×3 income boost runs until. The event
 * schedule is real-time, so both survive ascension and Himmelfahrt.
 */
export interface PeachState {
  nextPeachAt: number;
  boostUntil: number;
}

/** A fresh (unseeded) Golden-Peach slice. */
export function createPeach(): PeachState {
  return { nextPeachAt: 0, boostUntil: 0 };
}

/**
 * Lifetime bookkeeping counters (spec §9.2 / §7.5). All non-negative and monotonic
 * across BOTH prestige layers — `ascendState`/`himmelfahrtState` carry this slice
 * forward untouched, so the stats page (§7.5) and the CH achievements/quests (§7.3)
 * read stable lifetime totals. Run-scoped values (current zone/gold) are NOT here.
 */
export interface ChStats {
  /** Crit clicks landed (lifetime). */
  crits: number;
  /** On-beat clicks (§4.2.3). */
  onBeatClicks: number;
  /** Bosses defeated (lifetime). */
  bossKills: number;
  /** Boss timers that expired (lifetime). */
  bossTimeouts: number;
  /** Total gold ever earned (lifetime, never reset by ascension). */
  goldLifetime: number;
  /** Seconds of active play accumulated in the loop. */
  playTimeS: number;
  /** L1 ascensions performed (lifetime; §7.5). */
  ascensions: number;
  /** Pfirsich-Truhen opened (lifetime; §7.5/§6). */
  chestsOpened: number;
  /** Highest combo stacks ever reached (§7.5 „höchste Combo"). */
  maxCombo: number;
  /** Current no-timeout boss streak (reset by part 2 on a boss timeout). */
  bossStreak: number;
  /** Longest no-timeout boss streak ever reached (achievement gate, §7.3). */
  maxBossStreak: number;
  /** Truhenschlüssel earned over the lifetime (§7.3/§7.5). */
  keysEarned: number;
}

/** A zeroed stats block. */
export function createStats(): ChStats {
  return {
    crits: 0,
    onBeatClicks: 0,
    bossKills: 0,
    bossTimeouts: 0,
    goldLifetime: 0,
    playTimeS: 0,
    ascensions: 0,
    chestsOpened: 0,
    maxCombo: 0,
    bossStreak: 0,
    maxBossStreak: 0,
    keysEarned: 0,
  };
}

/** The serializable CH-mode state. */
export interface ChState {
  /** BP — the single currency (gold), spent on crew levels. */
  gold: number;
  /** Current zone. */
  zone: number;
  /** Normal rivals defeated in the current zone. */
  killsThisZone: number;
  /** Deepest zone reached THIS run (combat frontier). */
  runMaxZone: number;
  /** Crew levels by hero id. */
  crew: CrewLevels;
  /** Banked Ruhm-Seelen (permanent damage bonus). */
  souls: number;
  /** Deepest zone reached across ALL runs (drives soul gains). */
  lifetimeMaxZone: number;
  /** Lifetime shake count (stat). */
  totalClicks: number;
  /** Seedable RNG stream position — all gameplay rolls draw from here. */
  rng: RngState;
  /** Lifetime bookkeeping counters. */
  stats: ChStats;
  /** True once the one-time legacy-save inheritance has run (§9.2.3). */
  legacyImported: boolean;
  /** Twerk-Ekstase ability meter + active window (CH-save v3, §4.2.4). */
  ability: AbilityState;
  /** Combo stacks carried across a reload (CH-save v3, §4.2.2). */
  combo: ComboSave;
  /** Permanent per-member gilds, ×1.25 DPS each; survive ascension (CH-save v4, §4.3.4). */
  gilds: Gilds;
  /**
   * Lifetime-earned Ruhm-Seelen (monotonic highwater = `soulsForMaxZone(deepest
   * ascended zone)`). Held `souls` = `rsLifetime − Σ(spent on Ancients)`; it drives
   * the Himmelfahrt gate (§4.5.2). Only grows, and only via ascension/Himmelfahrt.
   */
  rsLifetime: number;
  /** Bought Twerk-Ahnen levels; the Ruhm-Seelen sink (CH-save v5, §4.6). */
  ancients: AncientLevels;
  /** Prestige layer 2 — Himmelspfirsiche + Himmelsbaum (CH-save v5, §4.5.2). */
  heaven: HeavenState;
  /** Skins-as-Gear slice: equipped skin/kulisse + level/star progress (CH-save v6, §5). */
  gear: GearState;
  /**
   * Legacy Tyrann-skin claim latch (§9.2.3): a `bossDefeated` old-save unlocks the
   * Goldener Twerk-Tyrann even at a shallow CH zone. A persisted boolean unioned into
   * the boss-first-kill unlock context; set once at boot, survives everything.
   */
  legacyTyrann: boolean;
  /** Pfirsich-Truhen: 🔑 + chest inventory + pity + owned skins (CH-save v7, §6). */
  chests: ChestsState;
  /** Permanent tokens: the endless crit/gold/dps buff pool (CH-save v7, §6.2). */
  permTokens: PermTokens;
  /** Golden-Peach event schedule + active ×3 boost window (CH-save v7, §6.1). */
  peach: PeachState;
  /** Daily-Login/Streak + rotating Quests (CH-save v8, §7.1/§7.2). Survives prestige. */
  meta: MetaState;
  /** Unlocked CH-achievement ids (CH-save v8, §7.3). Survives prestige. */
  achievements: string[];
}

/** A brand-new run/profile. */
export function createChState(): ChState {
  return {
    gold: 0,
    zone: 1,
    killsThisZone: 0,
    runMaxZone: 1,
    crew: createCrew(),
    souls: 0,
    lifetimeMaxZone: 1,
    totalClicks: 0,
    rng: createRngState(),
    stats: createStats(),
    legacyImported: false,
    ability: createAbility(),
    combo: createComboSave(),
    gilds: createGilds(),
    rsLifetime: 0,
    ancients: createAncients(),
    heaven: createHeaven(),
    gear: createGear(),
    legacyTyrann: false,
    chests: createChests(),
    permTokens: createPermTokens(),
    peach: createPeach(),
    meta: createMeta(),
    achievements: [],
  };
}

/**
 * The fields the derived combat numbers depend on. `gear` is optional so callers
 * (and older tests) that don't supply it still fold correctly — a missing gear
 * contributes the empty (×1) bonus, matching a fresh classic/club default.
 */
type DerivedInput = Pick<ChState, 'crew' | 'souls' | 'gilds' | 'ancients' | 'heaven'> & {
  gear?: GearState;
  permTokens?: PermTokens;
};

/**
 * Total crew DPS: raw crew (with gilds) × the held-soul multiplier (amplified by
 * held HPF) × Poposeidon's Ancient DPS mult × the +2 %/HPF global mult × the gear
 * DPS mult (§5) × the permanent-token crew-DPS mult (§6.2). Idle DPS never draws
 * crit/combo/beat/frenzy — active clicking stays king (P1). `permTokens` is
 * optional so callers/tests without a v7 slice fold the empty (×1) bonus.
 */
export function dpsOf(state: DerivedInput): number {
  const hpf = state.heaven.hpf;
  return (
    totalRawDps(state.crew, state.gilds) *
    soulMult(state.souls, soulBonusEff(hpf)) *
    ancientDpsMult(state.ancients) *
    heavenGlobalMult(hpf) *
    (state.gear ? dpsGearMult(state.gear) : 1) *
    (state.permTokens ? permTokenDpsMult(state.permTokens) : 1)
  );
}

/**
 * Click (shake) damage before crit/combo/beat/frenzy: raw click × held-soul mult
 * (HPF-amplified) × Twerkules' Ancient click mult × the +2 %/HPF global mult × the
 * gear click mult (§5 — the strongest gear buffs are click buffs, P1).
 */
export function clickDamageOf(state: DerivedInput): number {
  const hpf = state.heaven.hpf;
  return (
    clickDamageRaw(state.crew, state.gilds) *
    soulMult(state.souls, soulBonusEff(hpf)) *
    ancientClickMult(state.ancients) *
    heavenGlobalMult(hpf) *
    (state.gear ? clickGearMult(state.gear) : 1)
  );
}

/**
 * Full BP (gold) multiplier from the persistent meta stack (§4.6/§5/§6.2):
 * Peachiel (Ancient) × gold-gear (§5) × the permanent gold-token pool. Does NOT
 * include the transient Golden-Peach ×3 income boost — the glue folds that in
 * live via `peach.incomeMultiplier` (kills) while offline accrual uses this alone.
 */
export function goldMult(
  state: Pick<ChState, 'ancients' | 'gear'> & { permTokens?: PermTokens },
): number {
  return (
    ancientGoldMult(state.ancients) *
    goldGearMult(state.gear) *
    (state.permTokens ? permTokenGoldMult(state.permTokens) : 1)
  );
}

/**
 * Summed Truhen-Luck fraction fed to `openChest` as `ctx.luck` (§6.3.4): the gear
 * chest-luck total (which already folds Tyrann-skin stars) + Truhilda's Ancient
 * chest-luck. Pure over `(gear, ancients)`; `applyLuck` clamps it to `LUCK_MAX_SHIFT`.
 */
export function chestLuck(state: Pick<ChState, 'gear' | 'ancients'>): number {
  return chestLuckBonus(state.gear) + ancientChestLuckBonus(state.ancients);
}

/**
 * Multiplier applied to key-drop chances (§6.1): `1 + gear keyDrop + Truhen-Magnet`
 * (the Himmelsbaum node, +25 %). Pure over `(gear, heaven)`.
 */
export function keyDropMult(state: Pick<ChState, 'gear' | 'heaven'>): number {
  return 1 + keyDropBonus(state.gear) + truhenMagnetBonus(state.heaven);
}

/**
 * Realize an integer key count from a `base` guaranteed drop scaled by `mult`
 * (`keyDropMult`): the whole part is guaranteed, the fractional part is a single
 * seeded chance for one more 🔑. So a boss's `keyDropAmount(1, 1.25, …)` is always
 * ≥ 1 („1 garantiert", §6.1) and pays a 25 %-chance bonus key with Truhen-Magnet.
 * Pure over `(base, mult, rngFloat)`.
 */
export function keyDropAmount(base: number, mult: number, rngFloat: number): number {
  const scaled = Math.max(0, base) * Math.max(0, mult);
  const whole = Math.floor(scaled);
  return whole + (rngFloat < scaled - whole ? 1 : 0);
}

/** Base chance a rival kill drops a Holztruhe (spec §6.1: 3 %). */
export const RIVAL_CHEST_CHANCE = 0.03;

/**
 * Chance a rival kill drops a Holztruhe (spec §6.1): the 3 % base scaled by
 * Truhen-Luck (`1 + luck`), so Truhilda/Tyrann-stars/Truhen-Magnet make wood
 * chests rain a little harder. Pure over `luck`; the glue rolls it against the RNG.
 */
export function rivalChestChance(luck: number): number {
  return RIVAL_CHEST_CHANCE * (1 + Math.max(0, luck));
}

/**
 * Multiplier on the transient Golden-Peach ×3 income boost at `now` (§6.1). A thin
 * re-export seam over `peach.incomeMultiplier` so the glue folds the live boost
 * into kill gold through the ch-state derived layer (keeps `main.ts` imports tidy).
 */
export function peachIncomeMult(state: Pick<ChState, 'peach'>, now: number): number {
  return incomeMultiplier(state.peach.boostUntil, now);
}

/**
 * The deepest zone ever reached for unlock gating (§5.3): `lifetimeMaxZone`,
 * floored by the gear slice's never-resetting `zoneEver` latch — a Himmelfahrt
 * drops `lifetimeMaxZone` to 1 (RS accounting, §4.5.2) but must never re-lock a
 * skin („Bühne X erreicht" / „Erst-Kill" are one-way acquisitions).
 */
function unlockZone(state: Pick<ChState, 'lifetimeMaxZone'> & { gear?: GearState }): number {
  return Math.max(state.lifetimeMaxZone, state.gear?.zoneEver ?? 1);
}

/**
 * Boss zones whose boss has been first-killed, for the gear unlock context (§5.3).
 * Normal play: a boss zone Z (multiple of 5) is first-killed ⇔ the deepest zone
 * ever reached (`lifetimeMaxZone`, floored by the Himmelfahrt-surviving
 * `gear.zoneEver`) is > Z (advancing past it as a new record). The legacy Tyrann
 * claim (§9.2.3) is unioned in as zone 10 so a `bossDefeated` old-save unlocks
 * Tyrann even at a shallow CH zone.
 */
export function bossFirstKillZones(
  state: Pick<ChState, 'lifetimeMaxZone' | 'legacyTyrann'> & { gear?: GearState },
): Set<number> {
  const zones = new Set<number>();
  const deepest = unlockZone(state);
  for (let z = 5; z < deepest; z += 5) zones.add(z);
  if (state.legacyTyrann) zones.add(10);
  return zones;
}

/**
 * Build the pure gear-unlock context (§5.3) from the CH-state: zone gate from
 * `lifetimeMaxZone`, boss-first-kills from `bossFirstKillZones` (incl. the legacy
 * Tyrann claim), Himmelfahrten from the L2 count, and `crafted` from the gear slice's
 * craft latch (Neon-Ninja/Pfirsich-Pirat once a provisional 🧩-craft has run, §5.3).
 * `gear` is optional so older call sites (which never craft) still get an empty set.
 * Consumed by `skinUnlocked` in the glue and part 3's equip UI.
 */
export function gearUnlockCtx(
  state: Pick<ChState, 'lifetimeMaxZone' | 'legacyTyrann' | 'heaven'> & { gear?: GearState },
): UnlockCtx {
  return {
    lifetimeMaxZone: unlockZone(state), // floored by gear.zoneEver — survives Himmelfahrt
    bossFirstKills: bossFirstKillZones(state),
    himmelfahrten: state.heaven.ascensions2,
    crafted: new Set<string>(state.gear?.crafted ?? []),
  };
}

/**
 * Ascend (L1): earn the *new* souls for the lifetime-deepest zone and reset the
 * run (zone, kills, crew, gold). **Held souls carry over** (only a Himmelfahrt
 * resets them) plus the newly-earned gain, and what was spent on Ancients stays
 * spent. Ancients, gilds, the L2 heaven state and all lifetime meta persist; only
 * the L1 run itself resets. `rsLifetime` is the never-shrinking earned highwater.
 */
export function ascendState(state: ChState): ChState {
  const { souls, lifetimeMaxZone, rsLifetime } = applyAscension(
    state.runMaxZone,
    state.lifetimeMaxZone,
    state.souls,
    state.rsLifetime,
  );
  return {
    ...createChState(),
    souls,
    lifetimeMaxZone,
    rsLifetime,
    totalClicks: state.totalClicks,
    rng: state.rng,
    stats: state.stats,
    legacyImported: state.legacyImported,
    gilds: state.gilds,
    ancients: state.ancients, // Ancients survive L1 (§4.5 reset table)
    heaven: state.heaven, // L2 state survives L1
    // Skins/levels/stars are permanent meta (§5) — survive L1; latch the deepest
    // zone ever reached so unlocks stay one-way through every later reset.
    gear: { ...state.gear, zoneEver: Math.max(state.gear.zoneEver, lifetimeMaxZone) },
    legacyTyrann: state.legacyTyrann,
    // Loot is meta (§6): keys/chests/pity/skins, permanent tokens and the real-time
    // peach schedule all survive an L1 ascension untouched.
    chests: state.chests,
    permTokens: state.permTokens,
    peach: state.peach,
    // Retention meta (§7) — daily/streak/quests + unlocked achievements are lifetime
    // acquisitions, never reset by prestige.
    meta: state.meta,
    achievements: state.achievements,
  };
}

/**
 * Ruhmes-Himmelfahrt (L2): bank HPF from the lifetime-RS total, then reset all of
 * L1 per the §4.5.2 reset scope (AC2). RS (`souls` + `rsLifetime`), Ancients and
 * the whole tour (gold/crew/zone/kills/lifetime record) fall to fresh; **gilds,
 * the heaven state (HPF + Himmelsbaum) and lifetime stats survive.**
 */
export function himmelfahrtState(state: ChState): ChState {
  const heaven = bankHimmelfahrt(state.heaven, state.rsLifetime);
  return {
    ...createChState(),
    heaven,
    gilds: state.gilds, // Vergoldungen survive Himmelfahrt (M10-AC2)
    totalClicks: state.totalClicks,
    rng: state.rng,
    stats: state.stats,
    legacyImported: state.legacyImported,
    // Skins/levels/stars are permanent meta (§5) — survive Himmelfahrt. Latch the
    // deepest zone ever reached BEFORE `lifetimeMaxZone` falls to 1, so zone/boss
    // skin unlocks (Robo/Showmaster/Tyrann/Lava) never re-lock (§5.3 one-way gates).
    gear: {
      ...state.gear,
      zoneEver: Math.max(state.gear.zoneEver, state.lifetimeMaxZone, state.runMaxZone),
    },
    legacyTyrann: state.legacyTyrann,
    // Loot meta (§6) survives a Himmelfahrt too — keys/chests/pity/skins, the
    // permanent tokens and the real-time peach schedule all carry over.
    chests: state.chests,
    permTokens: state.permTokens,
    peach: state.peach,
    // Retention meta (§7) survives a Himmelfahrt too (lifetime acquisitions).
    meta: state.meta,
    achievements: state.achievements,
  };
}
