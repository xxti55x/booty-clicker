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
  return { ...createChState(), souls, lifetimeMaxZone, totalClicks: state.totalClicks };
}
