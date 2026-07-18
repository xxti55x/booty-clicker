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
  };
}

/** The fields the derived combat numbers depend on. */
type DerivedInput = Pick<ChState, 'crew' | 'souls' | 'gilds' | 'ancients' | 'heaven'>;

/**
 * Total crew DPS: raw crew (with gilds) × the held-soul multiplier (amplified by
 * held HPF) × Poposeidon's Ancient DPS mult × the +2 %/HPF global mult. Idle DPS
 * never draws crit/combo/beat/frenzy — active clicking stays king (P1).
 */
export function dpsOf(state: DerivedInput): number {
  const hpf = state.heaven.hpf;
  return (
    totalRawDps(state.crew, state.gilds) *
    soulMult(state.souls, soulBonusEff(hpf)) *
    ancientDpsMult(state.ancients) *
    heavenGlobalMult(hpf)
  );
}

/**
 * Click (shake) damage before crit/combo/beat/frenzy: raw click × held-soul mult
 * (HPF-amplified) × Twerkules' Ancient click mult × the +2 %/HPF global mult.
 */
export function clickDamageOf(state: DerivedInput): number {
  const hpf = state.heaven.hpf;
  return (
    clickDamageRaw(state.crew, state.gilds) *
    soulMult(state.souls, soulBonusEff(hpf)) *
    ancientClickMult(state.ancients) *
    heavenGlobalMult(hpf)
  );
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
  };
}
