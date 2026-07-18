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
import { type AncientLevels, ancientClickMult, ancientDpsMult, createAncients } from './ancients';
import { type GearState, type UnlockCtx, clickGearMult, createGear, dpsGearMult } from './gear';
import { type Gilds, createGilds } from './gild';
import {
  type HeavenState,
  bankHimmelfahrt,
  createHeaven,
  heavenGlobalMult,
  soulBonusEff,
} from './heaven';
import { type CrewLevels, clickDamageRaw, createCrew, totalRawDps } from './heroes';
import { createRngState, type RngState } from '../util/rng';

/** Persisted combo slice (CH-save v3): only the stack count survives a reload. */
export interface ComboSave {
  stacks: number;
}

/** A zeroed combo slice. */
export function createComboSave(): ComboSave {
  return { stacks: 0 };
}

/** Lifetime bookkeeping counters (spec §9.2, CH-save v2). All non-negative. */
export interface ChStats {
  /** Crit clicks landed (lifetime). */
  crits: number;
  /** On-beat clicks (stays 0 until M8 wires the beat bonus). */
  onBeatClicks: number;
  /** Bosses defeated (lifetime). */
  bossKills: number;
  /** Boss timers that expired (lifetime). */
  bossTimeouts: number;
  /** Total gold ever earned (lifetime, never reset by ascension). */
  goldLifetime: number;
  /** Seconds of active play accumulated in the loop. */
  playTimeS: number;
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
  };
}

/**
 * The fields the derived combat numbers depend on. `gear` is optional so callers
 * (and older tests) that don't supply it still fold correctly — a missing gear
 * contributes the empty (×1) bonus, matching a fresh classic/club default.
 */
type DerivedInput = Pick<ChState, 'crew' | 'souls' | 'gilds' | 'ancients' | 'heaven'> & {
  gear?: GearState;
};

/**
 * Total crew DPS: raw crew (with gilds) × the held-soul multiplier (amplified by
 * held HPF) × Poposeidon's Ancient DPS mult × the +2 %/HPF global mult × the gear
 * DPS mult (§5). Idle DPS never draws crit/combo/beat/frenzy — active clicking
 * stays king (P1).
 */
export function dpsOf(state: DerivedInput): number {
  const hpf = state.heaven.hpf;
  return (
    totalRawDps(state.crew, state.gilds) *
    soulMult(state.souls, soulBonusEff(hpf)) *
    ancientDpsMult(state.ancients) *
    heavenGlobalMult(hpf) *
    (state.gear ? dpsGearMult(state.gear) : 1)
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
  };
}
