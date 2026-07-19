/**
 * Combat core — the Clicker-Heroes-style zone/monster loop (pure, DOM-free).
 *
 * Booty theme: each "monster" is a Twerk-Rivale/Groupie whose **Ausdauer** (HP)
 * you drain by shaking (click damage) and via your Crew (idle DPS). Clearing a
 * zone means out-twerking `MONSTERS_PER_ZONE` rivals; every `BOSS_EVERY`-th zone
 * is gated by a **Boss** on a `BOSS_TIME_S` timer.
 *
 * All balancing lives in the formulas/consts below (spec rule: numbers in config,
 * never buried in logic). The reducer functions (`hit`, `tickBoss`, `travelTo`)
 * are pure so the whole progression is unit-testable and deterministic.
 */

/** Normal rivals to out-twerk before a zone is cleared. */
export const MONSTERS_PER_ZONE = 10;
/** Every Nth zone is a boss gate. */
export const BOSS_EVERY = 5;
/** Seconds to defeat a boss before it bounces you back to farming. */
export const BOSS_TIME_S = 30;

/** Base HP of a zone-1 rival. */
const HP_BASE = 10;
/** HP growth per zone (exponential wall, à la Clicker Heroes ~1.6). */
const HP_GROWTH = 1.6;
/** A boss has this many times a normal rival's HP. */
const BOSS_HP_FACTOR = 10;
/** Gold (BP) per kill ≈ HP / this (v12 Goal-Nerf: 15 → 20, Einkommen gedrosselt). */
const GOLD_DIVISOR = 20;
/** Bosses drop this many times the per-kill gold. */
const BOSS_GOLD_FACTOR = 12;

export function isBossZone(zone: number): boolean {
  return zone % BOSS_EVERY === 0;
}

/** Max Ausdauer (HP) of a normal rival at `zone`. */
export function monsterHp(zone: number): number {
  return HP_BASE * Math.pow(HP_GROWTH, zone - 1);
}

/** Max Ausdauer (HP) of the boss guarding `zone`. */
export function bossHp(zone: number): number {
  return monsterHp(zone) * BOSS_HP_FACTOR;
}

/** BP dropped for defeating a rival (or boss) at `zone`. */
export function goldFor(zone: number, boss: boolean): number {
  const base = Math.ceil(monsterHp(zone) / GOLD_DIVISOR);
  return boss ? base * BOSS_GOLD_FACTOR : base;
}

/** The current target the player is shaking. */
export interface CombatState {
  /** Current zone (1..∞). */
  zone: number;
  /** Highest zone ever reached (drives ascension souls). */
  maxZone: number;
  /** Normal rivals defeated in this zone (0..MONSTERS_PER_ZONE). */
  killsThisZone: number;
  /** Current target's remaining Ausdauer. */
  hp: number;
  /** Current target's max Ausdauer. */
  hpMax: number;
  /** Whether the current target is a boss. */
  boss: boolean;
  /** Seconds left on the boss timer (0 when not a boss). */
  bossTimer: number;
}

/**
 * Build the combat state for a given zone + kill count. A boss is the target
 * when we're on a boss zone and the normal rivals are already cleared.
 */
export function spawnFor(zone: number, killsThisZone: number, maxZone: number): CombatState {
  const boss = isBossZone(zone) && killsThisZone >= MONSTERS_PER_ZONE;
  const hpMax = boss ? bossHp(zone) : monsterHp(zone);
  return {
    zone,
    maxZone: Math.max(maxZone, zone),
    killsThisZone,
    hp: hpMax,
    hpMax,
    boss,
    bossTimer: boss ? BOSS_TIME_S : 0,
  };
}

/** A fresh run: zone 1, no kills. */
export function createCombat(maxZone = 1): CombatState {
  return spawnFor(1, 0, Math.max(1, maxZone));
}

export interface HitResult {
  state: CombatState;
  /** Whether this hit defeated the target. */
  killed: boolean;
  /** BP awarded (0 unless killed). */
  gold: number;
  /** Whether the kill advanced to a new zone. */
  advancedZone: boolean;
  /** Whether a boss just spawned as a result of this kill. */
  bossSpawned: boolean;
}

/**
 * Apply `dmg` to the current target. On a kill, award gold and progress:
 *   · normal kill, zone not full  → next rival, same zone
 *   · normal kill, zone full, boss zone → spawn the boss
 *   · normal kill, zone full, normal zone → advance to next zone
 *   · boss kill → advance to next zone
 */
export function hit(state: CombatState, dmg: number): HitResult {
  const hp = state.hp - dmg;
  if (hp > 0) {
    return {
      state: { ...state, hp },
      killed: false,
      gold: 0,
      advancedZone: false,
      bossSpawned: false,
    };
  }

  const gold = goldFor(state.zone, state.boss);

  if (state.boss) {
    const next = spawnFor(state.zone + 1, 0, state.maxZone);
    return { state: next, killed: true, gold, advancedZone: true, bossSpawned: false };
  }

  const kills = state.killsThisZone + 1;
  if (kills >= MONSTERS_PER_ZONE) {
    if (isBossZone(state.zone)) {
      const boss = spawnFor(state.zone, kills, state.maxZone);
      return { state: boss, killed: true, gold, advancedZone: false, bossSpawned: true };
    }
    const next = spawnFor(state.zone + 1, 0, state.maxZone);
    return { state: next, killed: true, gold, advancedZone: true, bossSpawned: false };
  }

  const same = spawnFor(state.zone, kills, state.maxZone);
  return { state: same, killed: true, gold, advancedZone: false, bossSpawned: false };
}

export interface BossTickResult {
  state: CombatState;
  /** Whether the boss timer just expired. */
  failed: boolean;
}

/**
 * Advance the boss timer by `dt`. On expiry the boss bounces the player back to
 * the PREVIOUS stage (zone − 1, clamped) to farm gold and buy upgrades; the
 * frontier (`maxZone`) is kept, so the boss stage stays reachable via the zone
 * strip and the boss can be re-challenged when stronger. Never a soft-lock.
 */
export function tickBoss(state: CombatState, dt: number): BossTickResult {
  if (!state.boss) return { state, failed: false };
  const bossTimer = state.bossTimer - dt;
  if (bossTimer <= 0) {
    return { state: spawnFor(Math.max(1, state.zone - 1), 0, state.maxZone), failed: true };
  }
  return { state: { ...state, bossTimer }, failed: false };
}

/**
 * Challenge the frontier boss directly (skip the remaining rival wave). Only
 * meaningful on the highest reached boss stage while its gate is unbeaten —
 * everywhere else this is a no-op. Skipping the wave is a strictly risky
 * trade (less farm gold, boss sooner), never an exploit.
 */
export function challengeBoss(state: CombatState): CombatState {
  if (!isBossZone(state.zone) || state.boss || state.zone !== state.maxZone) return state;
  return spawnFor(state.zone, MONSTERS_PER_ZONE, state.maxZone);
}

/** Fraction of the boss timer remaining (1..0), for the timer bar. */
export function bossTimeFraction(state: CombatState): number {
  return state.boss ? Math.max(0, Math.min(1, state.bossTimer / BOSS_TIME_S)) : 0;
}

/** Fraction of the target's Ausdauer remaining (1..0), for the HP bar. */
export function hpFraction(state: CombatState): number {
  return state.hpMax > 0 ? Math.max(0, Math.min(1, state.hp / state.hpMax)) : 0;
}

/** Travel to a cleared zone to farm gold. Clamped to 1..maxZone; spawns a rival. */
export function travelTo(state: CombatState, zone: number): CombatState {
  const target = Math.max(1, Math.min(state.maxZone, Math.floor(zone)));
  return spawnFor(target, 0, state.maxZone);
}
