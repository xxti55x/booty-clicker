/**
 * Clicker-Heroes-mode game state (the endless Booty Clicker MVP).
 *
 * Kept deliberately separate from the legacy M0–M6 `GameState`/save layer: this
 * mode has its own persisted slice + save key, so the old economy tests stay
 * green while the new loop drives the game. Derived combat numbers (DPS, click
 * damage) are NEVER persisted — they're recomputed from crew levels + souls.
 */
import { type AbilityState, createAbility } from './ability';
import { applyAscension, soulsForMaxZone } from './ascension';
import { soulMult } from './ascension';
import { type Gilds, createGilds } from './gild';
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
   * Running max of banked souls (lifetime RS), for the later Himmelfahrt gate
   * (§4.5.2). Only ever grows; souls aren't spent yet, so it tracks `souls`.
   */
  rsLifetime: number;
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
  };
}

/** Total crew DPS including gilds and the soul multiplier. */
export function dpsOf(state: Pick<ChState, 'crew' | 'souls' | 'gilds'>): number {
  return totalRawDps(state.crew, state.gilds) * soulMult(state.souls);
}

/** Click (shake) damage including gilds + the soul multiplier (before crit/frenzy). */
export function clickDamageOf(state: Pick<ChState, 'crew' | 'souls' | 'gilds'>): number {
  return clickDamageRaw(state.crew, state.gilds) * soulMult(state.souls);
}

/**
 * Ascend: bank souls from the lifetime-deepest zone and reset the run (zone,
 * kills, crew, gold). Souls + lifetime record persist and only ever grow.
 */
export function ascendState(state: ChState): ChState {
  const { souls, lifetimeMaxZone } = applyAscension(
    state.runMaxZone,
    state.lifetimeMaxZone,
    state.souls,
  );
  // Souls, lifetime record and all meta (RNG stream, lifetime stats, the
  // legacy-import flag) persist; only the run itself (gold/crew/zone) resets.
  // Gilds are permanent (§4.3.4) — carried over so a soul-less run that still
  // reached a new 10-zone keeps its power (anti-plateau, P3). `rsLifetime` is the
  // never-shrinking lifetime-RS highwater for the later Himmelfahrt gate.
  return {
    ...createChState(),
    souls,
    lifetimeMaxZone,
    totalClicks: state.totalClicks,
    rng: state.rng,
    stats: state.stats,
    legacyImported: state.legacyImported,
    gilds: state.gilds,
    rsLifetime: Math.max(state.rsLifetime, souls, soulsForMaxZone(lifetimeMaxZone)),
  };
}
