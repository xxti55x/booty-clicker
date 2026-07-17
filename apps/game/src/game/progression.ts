import {
  deriveStats,
  UPGRADES,
  upgradeCost,
  type UpgradeConfig,
  type UpgradeState,
} from './economy';
import type { GameState } from './state';

/**
 * Progression milestones & the balancing simulator (spec §5 M2).
 *
 * Target curve (optimal play, verified by `simulatePlaythrough` + the M2 test):
 *   - first ~5 min: a purchase is always affordable within ~60 s
 *   - min 5–30:     2–4 min between purchases as costs outrun income
 *   - endgame:      50 000 BP (boss unlock) reached at ~35–45 min
 *   - rebirth gate: 100 000 BP available a few minutes after the boss unlock
 * Balancing lives entirely in `UPGRADES` (data). This module only reads it.
 */

/** BP needed to unlock the boss fight. */
export const BOSS_UNLOCK_BP = 50_000;
/** BP needed to unlock the Rebirth/prestige reset. */
export const REBIRTH_BP = 100_000;

interface SimUpgrade {
  cfg: UpgradeConfig;
  lv: number;
}

export interface SimResult {
  /** Sim time (ms) when BP first reached the boss unlock, or null if not reached. */
  bossMs: number | null;
  /** Sim time (ms) when BP first reached the rebirth gate, or null if not reached. */
  rebirthMs: number | null;
  /** Total upgrade purchases made up to the boss unlock. */
  purchasesToBoss: number;
  /** perClick at the moment the boss unlocked (backs boss HP calibration). */
  perClickAtBoss: number;
  /** mult at the moment the boss unlocked. */
  multAtBoss: number;
}

export interface SimOptions {
  /** Sustained clicks per second an engaged player produces. */
  clickRate?: number;
  /** Simulation step in ms. */
  dtMs?: number;
  /** Safety cap so the loop always terminates. */
  maxMs?: number;
  /** Override the upgrade catalogue (defaults to the live `UPGRADES`). */
  upgrades?: readonly UpgradeConfig[];
}

/**
 * Deterministic optimal-buy playthrough. Each step accrues click + passive
 * income, then greedily buys the affordable upgrade with the best payback
 * (marginal income-per-second ÷ cost) until nothing is worth buying. Pure — no
 * DOM, no randomness — so it backs the balancing acceptance test.
 */
export function simulatePlaythrough(opts: SimOptions = {}): SimResult {
  const clickRate = opts.clickRate ?? 6;
  const stepMs = opts.dtMs ?? 250;
  const dt = stepMs / 1000;
  const maxMs = opts.maxMs ?? 6 * 60 * 60 * 1000;

  const ups: SimUpgrade[] = (opts.upgrades ?? UPGRADES).map((cfg) => ({ cfg, lv: 0 }));
  let bp = 0;
  let perClick = 1;
  let perSec = 0;
  let mult = 1;
  let purchases = 0;
  let purchasesToBoss = 0;
  let perClickAtBoss = 0;
  let multAtBoss = 0;

  let bossMs: number | null = null;
  let rebirthMs: number | null = null;

  for (let tMs = 0; tMs <= maxMs; tMs += stepMs) {
    bp += (perSec * mult + perClick * mult * clickRate) * dt;

    // Greedy buy loop: keep buying the best-payback affordable upgrade.
    for (;;) {
      const incomeNow = perSec * mult + perClick * mult * clickRate;
      let best = -1;
      let bestRoi = 0;
      for (let i = 0; i < ups.length; i++) {
        const u = ups[i];
        const cost = upgradeCost({ base: u.cfg.base, gr: u.cfg.gr, lv: u.lv });
        if (cost > bp) continue;
        let dInc: number;
        if (u.cfg.type === 'click') dInc = u.cfg.val * mult * clickRate;
        else if (u.cfg.type === 'sec') dInc = u.cfg.val * mult;
        else dInc = incomeNow * (u.cfg.val - 1);
        const roi = dInc / cost;
        if (roi > bestRoi) {
          bestRoi = roi;
          best = i;
        }
      }
      if (best < 0) break;
      const u = ups[best];
      bp -= upgradeCost({ base: u.cfg.base, gr: u.cfg.gr, lv: u.lv });
      u.lv += 1;
      purchases += 1;
      if (u.cfg.type === 'click') perClick += u.cfg.val;
      else if (u.cfg.type === 'sec') perSec += u.cfg.val;
      else mult *= u.cfg.val;
    }

    if (bossMs === null && bp >= BOSS_UNLOCK_BP) {
      bossMs = tMs;
      purchasesToBoss = purchases;
      perClickAtBoss = perClick;
      multAtBoss = mult;
    }
    if (rebirthMs === null && bp >= REBIRTH_BP) rebirthMs = tMs;
    if (bossMs !== null && rebirthMs !== null) break;
  }

  return { bossMs, rebirthMs, purchasesToBoss, perClickAtBoss, multAtBoss };
}

/** Base perClick/perSec before upgrades (mult carries the prestige bonus). */
function prestigeBase(prestigeMult: number): { perClick: number; perSec: number; mult: number } {
  return { perClick: 1, perSec: 0, mult: prestigeMult };
}

/**
 * Perform a Rebirth/prestige reset (spec §5 M2). Wipes BP and upgrade levels,
 * grants a permanent +100% multiplier (cumulative), and rebuilds derived stats
 * with the new prestige multiplier folded in. Cosmetic unlocks, the boss-defeated
 * flag and `maxBp` are kept. Pure mutation — the caller gates it on REBIRTH_BP.
 */
export function applyRebirth(state: GameState, upgrades: UpgradeState[]): void {
  state.rebirths += 1;
  state.prestigeMult = 1 + state.rebirths; // each rebirth adds +100%
  for (const u of upgrades) u.lv = 0;
  const derived = deriveStats(upgrades, prestigeBase(state.prestigeMult));
  state.perClick = derived.perClick;
  state.perSec = derived.perSec;
  state.mult = derived.mult;
  state.bp = 0;
}

/** Recompute derived stats from upgrade levels with the prestige multiplier folded in. */
export function deriveWithPrestige(state: GameState, upgrades: readonly UpgradeState[]): void {
  const derived = deriveStats(upgrades, prestigeBase(state.prestigeMult));
  state.perClick = derived.perClick;
  state.perSec = derived.perSec;
  state.mult = derived.mult;
}
