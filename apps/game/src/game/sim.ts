/**
 * `simulateEndless` — a deterministic balancing bot over the REAL game modules
 * (combat / heroes / ascension / click / gild), the M9 CI gate that replaces the
 * old `simulatePlaythrough` (spec §9.5, §4.8).
 *
 * The bot plays in 1-second steps: it clicks at a fixed `clickRate` with the
 * §4.8 juice assumptions (sustained combo ×2 + crit EV ×1.8 when `juice`), lets
 * idle crew DPS tick in parallel (never juiced — P1), buys crew ROI-greedy
 * (milestone jumps fall out of the marginal-DPS ranking), whittles bosses over
 * their timer (a timeout drops it to farming the zone's rivals, never a soft-lock),
 * gilds each fresh 10-zone, and ascends between fixed runs. Everything is pure and
 * seeded, so the asserted pacing (§4.8) and endless criteria (E1/E2/E4) are
 * reproducible. Kept fast (bounded runs, integer-second steps) to stay a CI gate.
 */
import { applyAscension, soulMult } from './ascension';
import { CRIT_CHANCE, CRIT_MULT, COMBO_CAP, comboMult } from './click';
import { type CombatState, hit, spawnFor, tickBoss, travelTo } from './combat';
import { awardGildOnZone, type Gilds, isGildZone } from './gild';
import { CREW, clickDamageRaw, heroDps, nextLevelCost, totalRawDps } from './heroes';
import { Rng } from '../util/rng';

/** A bot configuration. */
export interface SimConfig {
  /** Clicks per second the bot sustains. */
  clickRate: number;
  /** Whether the bot uses juice (sustained combo ×2 + crit EV ×1.8, §4.8). */
  juice: boolean;
  /** RNG seed (deterministic gild targets). */
  seed?: number;
}

/** The mutable bot state that persists across ascensions within a chain. */
interface Sim {
  gold: number;
  crew: Record<string, number>;
  gilds: Gilds;
  souls: number;
  lifetimeMaxZone: number;
  /** Lifetime-earned RS highwater (held-balance model, §ascension). */
  rsLifetime: number;
  rng: Rng;
}

function newSim(seed: number): Sim {
  return {
    gold: 0,
    crew: {},
    gilds: {},
    souls: 0,
    lifetimeMaxZone: 1,
    rsLifetime: 0,
    rng: new Rng({ seed, cursor: 0 }),
  };
}

/** The per-click juice multipliers (combo, crit-EV) for a config (§4.8 baseline). */
function juiceFactors(config: SimConfig): { combo: number; crit: number } {
  if (!config.juice) return { combo: 1, crit: 1 };
  return {
    combo: comboMult(COMBO_CAP), // sustained ×2
    crit: 1 + CRIT_CHANCE * (CRIT_MULT - 1), // EV ×1.8 (20 % / ×5)
  };
}

/** Effective damage the bot deals in one second at the current state. */
function damagePerSecond(sim: Sim, config: SimConfig, combo: number, crit: number): number {
  const mult = soulMult(sim.souls);
  const baseClick = clickDamageRaw(sim.crew, sim.gilds) * mult;
  const idle = totalRawDps(sim.crew, sim.gilds) * mult;
  return config.clickRate * baseClick * combo * crit + idle;
}

/**
 * Apply one second of damage to the combat state, banking gold, advancing zones,
 * and gilding fresh 10-zones. Excess damage carries across targets (unlike the
 * in-game one-hit-per-frame model, which is fine at 60 fps but too coarse here).
 * Boss HP persists across seconds; the timer ticks once and a timeout drops to
 * farming the zone's rivals (never a soft-lock).
 */
function stepSecond(sim: Sim, combat: CombatState, dmg: number): CombatState {
  let remaining = dmg;
  let guard = 50000; // bounds a runaway burst; ×1.6/zone means it always terminates
  while (remaining > 0 && guard-- > 0) {
    if (remaining >= combat.hp) {
      remaining -= combat.hp;
      const r = hit(combat, combat.hp);
      sim.gold += r.gold;
      combat = r.state;
      if (r.advancedZone && combat.zone > sim.lifetimeMaxZone) {
        const cleared = combat.zone - 1;
        if (isGildZone(cleared)) sim.gilds = awardGildOnZone(sim.gilds, cleared, false, sim.rng);
        sim.lifetimeMaxZone = combat.zone;
      }
    } else {
      combat = hit(combat, remaining).state;
      remaining = 0;
    }
  }
  return combat.boss ? tickBoss(combat, 1).state : combat;
}

/** Spend gold ROI-greedy: repeatedly buy the best marginal-DPS-per-BP next level. */
function buyCrewGreedy(sim: Sim): void {
  let guard = 5000;
  for (;;) {
    if (guard-- <= 0) break;
    let bestId: string | null = null;
    let bestRoi = 0;
    let bestCost = 0;
    for (const cfg of CREW) {
      const lvl = sim.crew[cfg.id] ?? 0;
      const cost = nextLevelCost(cfg, lvl);
      if (cost > sim.gold) continue;
      const g = sim.gilds[cfg.id] ?? 0;
      const gain = heroDps(cfg, lvl + 1, g) - heroDps(cfg, lvl, g);
      const roi = gain / cost;
      if (roi > bestRoi) {
        bestRoi = roi;
        bestId = cfg.id;
        bestCost = cost;
      }
    }
    if (bestId === null) break;
    sim.gold -= bestCost;
    sim.crew[bestId] = (sim.crew[bestId] ?? 0) + 1;
  }
}

/** The result of a single run (one ascension cycle). */
export interface RunResult {
  /** Deepest zone (frontier) reached this run. */
  bestZone: number;
  /** Second-of-run at which each frontier zone was first reached. */
  timeToZone: Map<number, number>;
  seconds: number;
}

/**
 * Play one run from zone 1 for `seconds`, mutating `sim` (gold/crew/gilds/
 * lifetimeMaxZone). `onFrontier(zone, globalSec)` fires the first time each new
 * frontier zone is reached (with the global clock offset by `tOffset`).
 */
function runOnce(
  sim: Sim,
  seconds: number,
  config: SimConfig,
  onFrontier?: (zone: number, globalSec: number) => void,
  tOffset = 0,
): RunResult {
  const { combo, crit } = juiceFactors(config);
  let combat = spawnFor(1, 0, 1);
  const timeToZone = new Map<number, number>([[1, 0]]);
  for (let t = 1; t <= seconds; t++) {
    const dmg = damagePerSecond(sim, config, combo, crit);
    const prevFrontier = combat.maxZone;
    combat = stepSecond(sim, combat, dmg);
    if (combat.maxZone > prevFrontier) {
      for (let z = prevFrontier + 1; z <= combat.maxZone; z++) {
        if (!timeToZone.has(z)) timeToZone.set(z, t);
        onFrontier?.(z, tOffset + t);
      }
    }
    buyCrewGreedy(sim);
  }
  return { bestZone: combat.maxZone, timeToZone, seconds };
}

/** One run's ascension summary within a chain. */
export interface RunSummary {
  run: number;
  bestZone: number;
  bankBefore: number;
  bank: number;
  gained: number;
}

/** The result of an ascension run-chain. */
export interface ChainResult {
  runs: RunSummary[];
  finalBank: number;
  maxBestZone: number;
  /** Global second at which each new lifetime-record zone was first reached. */
  timeToLifetime: Map<number, number>;
}

/**
 * Play `runs` fixed-length runs, ascending between each (crew/gold reset; souls,
 * gilds and the lifetime record carry over). Mirrors the §4.8 "45-min run-chain"
 * measurement. `timeToLifetime` records the global time to each new best zone for
 * the endless-wall criterion (E2).
 */
export function simulateRunChain(config: SimConfig, runs: number, runSeconds: number): ChainResult {
  const sim = newSim(config.seed ?? 1);
  const summaries: RunSummary[] = [];
  const timeToLifetime = new Map<number, number>();
  let globalT = 0;
  let maxBestZone = 1;
  for (let r = 0; r < runs; r++) {
    sim.gold = 0;
    sim.crew = {};
    const res = runOnce(
      sim,
      runSeconds,
      config,
      (zone, globalSec) => {
        if (zone > maxBestZone && !timeToLifetime.has(zone)) timeToLifetime.set(zone, globalSec);
      },
      globalT,
    );
    globalT += runSeconds;
    maxBestZone = Math.max(maxBestZone, res.bestZone);
    const before = sim.souls;
    const asc = applyAscension(res.bestZone, sim.lifetimeMaxZone, sim.souls, sim.rsLifetime);
    sim.souls = asc.souls;
    sim.lifetimeMaxZone = asc.lifetimeMaxZone;
    sim.rsLifetime = asc.rsLifetime;
    summaries.push({
      run: r + 1,
      bestZone: res.bestZone,
      bankBefore: before,
      bank: sim.souls,
      gained: sim.souls - before,
    });
  }
  return { runs: summaries, finalBank: sim.souls, maxBestZone, timeToLifetime };
}

/** Play a single fresh run (0 souls); the E4 active-vs-casual comparison unit. */
export function simulateSingleRun(config: SimConfig, seconds: number): RunResult {
  return runOnce(newSim(config.seed ?? 1), seconds, config);
}

/** Options for the adaptive-ascension continuous sim (the E2 measurement). */
export interface ContinuousOptions {
  /** Seconds without a frontier advance before the bot ascends (hits the wall). */
  stallSeconds: number;
  /** Global-second budget (bounds runtime). */
  maxSeconds: number;
  /** Stop after this many consecutive +0-soul ascensions (the honest M9 plateau). */
  plateauAscensions: number;
}

/** The result of a continuous (adaptive-ascension) progression. */
export interface ContinuousResult {
  /** Global second at which each new lifetime-record zone was first reached. */
  timeToLifetime: Map<number, number>;
  ascensions: number;
  maxBestZone: number;
  finalBank: number;
  /** Whether the run stopped because souls stopped growing (the M9 wall, N1). */
  plateaued: boolean;
}

/**
 * Play continuously, ascending **adaptively** the moment the frontier stalls for
 * `stallSeconds` (the player's "I'm stuck — retire" reflex) rather than on a fixed
 * clock. Souls/gilds compound across ascensions, so re-climbs get faster; this is
 * the fair measurement for the endless soft-wall criterion E2 (§4.8). Stops at the
 * M9 linear-mult plateau (souls stop growing) — which §4.5.2/§4.6 (HPF + Ancients,
 * M10) lift; until then a bounded number of improvements is the honest ceiling.
 */
export function simulateContinuous(config: SimConfig, opts: ContinuousOptions): ContinuousResult {
  const sim = newSim(config.seed ?? 1);
  const { combo, crit } = juiceFactors(config);
  let combat = spawnFor(1, 0, 1);
  const timeToLifetime = new Map<number, number>();
  let globalT = 0;
  let lastAdvanceT = 0;
  let maxBest = 1;
  let ascensions = 0;
  let plateauStreak = 0;
  let plateaued = false;

  while (globalT < opts.maxSeconds) {
    globalT++;
    const dmg = damagePerSecond(sim, config, combo, crit);
    const prevFrontier = combat.maxZone;
    combat = stepSecond(sim, combat, dmg);
    if (combat.maxZone > prevFrontier) {
      lastAdvanceT = globalT;
      for (let z = prevFrontier + 1; z <= combat.maxZone; z++) {
        if (z > maxBest && !timeToLifetime.has(z)) timeToLifetime.set(z, globalT);
      }
      maxBest = Math.max(maxBest, combat.maxZone);
    }
    buyCrewGreedy(sim);

    if (globalT - lastAdvanceT >= opts.stallSeconds) {
      const asc = applyAscension(combat.maxZone, sim.lifetimeMaxZone, sim.souls, sim.rsLifetime);
      const gained = asc.souls - sim.souls;
      sim.souls = asc.souls;
      sim.lifetimeMaxZone = asc.lifetimeMaxZone;
      sim.rsLifetime = asc.rsLifetime;
      sim.gold = 0;
      sim.crew = {};
      combat = spawnFor(1, 0, 1);
      lastAdvanceT = globalT;
      ascensions++;
      if (gained <= 0) {
        plateauStreak++;
        if (plateauStreak >= opts.plateauAscensions) {
          plateaued = true;
          break;
        }
      } else {
        plateauStreak = 0;
      }
    }
  }

  return { timeToLifetime, ascensions, maxBestZone: maxBest, finalBank: sim.souls, plateaued };
}

/**
 * The bot can also farm a cleared zone via the pure `travelTo` (clamped to
 * 1..maxZone). Exposed so tests can assert the travel clamp end-to-end over a real
 * combat state (spec §4.4-AC2 / M9-AC5).
 */
export function farmZone(combat: CombatState, zone: number): CombatState {
  return travelTo(combat, zone);
}
