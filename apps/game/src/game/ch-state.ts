/**
 * Clicker-Heroes-mode game state (the endless Booty Clicker MVP).
 *
 * Kept deliberately separate from the legacy M0–M6 `GameState`/save layer: this
 * mode has its own persisted slice + save key, so the old economy tests stay
 * green while the new loop drives the game. Derived combat numbers (DPS, click
 * damage) are NEVER persisted — they're recomputed from crew levels + souls.
 */
import { applyAscension } from './ascension';
import { soulMult } from './ascension';
import { type CrewLevels, clickDamageRaw, createCrew, totalRawDps } from './heroes';
import { createRngState, type RngState } from '../util/rng';

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
  };
}

/** Total crew DPS including the soul multiplier. */
export function dpsOf(state: Pick<ChState, 'crew' | 'souls'>): number {
  return totalRawDps(state.crew) * soulMult(state.souls);
}

/** Click (shake) damage including the soul multiplier (before crit/frenzy). */
export function clickDamageOf(state: Pick<ChState, 'crew' | 'souls'>): number {
  return clickDamageRaw(state.crew) * soulMult(state.souls);
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
  return {
    ...createChState(),
    souls,
    lifetimeMaxZone,
    totalClicks: state.totalClicks,
    rng: state.rng,
    stats: state.stats,
    legacyImported: state.legacyImported,
  };
}
