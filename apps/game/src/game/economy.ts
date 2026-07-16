/**
 * Economy — pure, data-driven game math.
 *
 * Ported verbatim from `legacy/index.html` (the prototype's GAME section):
 *   cost(u)      = floor(u.base * u.gr ^ u.lv)
 *   click gain   = perClick * mult * (1 + combo * 0.05)
 *   passive gain = perSec   * mult * dt
 *   mult upgrades stack multiplicatively (G.mult *= val)
 *
 * Architecture rule 3 (spec §4): balancing lives in typed config arrays, never
 * in logic. Changing a number here must never require a logic change.
 */

/** How a purchased upgrade affects the player's stats. */
export type UpgradeType = 'click' | 'sec' | 'mult';

export interface UpgradeConfig {
  readonly id: string;
  readonly name: string;
  /** Short shop description. */
  readonly ds: string;
  /** Base cost at level 0. */
  readonly base: number;
  /** Growth rate: cost multiplies by this per level. */
  readonly gr: number;
  /** What the upgrade adds/multiplies. */
  readonly type: UpgradeType;
  /** Magnitude: +val for click/sec, ×val for mult. */
  readonly val: number;
}

/** A runtime upgrade instance: config + current level. */
export interface UpgradeState extends UpgradeConfig {
  lv: number;
}

/** Combo adds 5% per stack to a shake's payout. */
export const COMBO_BONUS_PER = 0.05;
/** Seconds a combo survives without another shake. */
export const COMBO_WINDOW_S = 1.2;

/**
 * Upgrade catalogue — identical values to the prototype so the port stays
 * behaviour-compatible. `lv` is added at runtime via {@link createUpgrades}.
 */
export const UPGRADES: readonly UpgradeConfig[] = [
  {
    id: 'hips',
    name: 'Hüftschwung-Training',
    ds: '+1 BP pro Shake',
    base: 15,
    gr: 1.15,
    type: 'click',
    val: 1,
  },
  {
    id: 'auto',
    name: 'Auto-Twerker',
    ds: '+1 BP / Sekunde',
    base: 50,
    gr: 1.16,
    type: 'sec',
    val: 1,
  },
  {
    id: 'bass',
    name: 'Bass Boost',
    ds: '+3 BP pro Shake',
    base: 200,
    gr: 1.18,
    type: 'click',
    val: 3,
  },
  {
    id: 'squad',
    name: 'Twerk-Squad',
    ds: '+8 BP / Sekunde',
    base: 650,
    gr: 1.17,
    type: 'sec',
    val: 8,
  },
  {
    id: 'disco',
    name: 'Discokugel-Faktor',
    ds: 'x1.25 Gesamt-Multiplikator',
    base: 2500,
    gr: 1.9,
    type: 'mult',
    val: 1.25,
  },
  {
    id: 'arena',
    name: 'Twerk-Arena',
    ds: '+45 BP / Sekunde',
    base: 8000,
    gr: 1.18,
    type: 'sec',
    val: 45,
  },
  {
    id: 'god',
    name: 'Booty-Gottheit',
    ds: 'x1.5 Gesamt-Multiplikator',
    base: 60000,
    gr: 2.2,
    type: 'mult',
    val: 1.5,
  },
];

/** Instantiate the upgrade catalogue at level 0 for a fresh game. */
export function createUpgrades(): UpgradeState[] {
  return UPGRADES.map((u) => ({ ...u, lv: 0 }));
}

/** Cost of the next level of an upgrade: `floor(base * gr ^ lv)`. */
export function upgradeCost(u: Pick<UpgradeConfig, 'base' | 'gr'> & { lv?: number }): number {
  return Math.floor(u.base * Math.pow(u.gr, u.lv ?? 0));
}

/** BP earned from a single shake, including the combo bonus. */
export function clickGain(perClick: number, mult: number, combo: number): number {
  return perClick * mult * (1 + combo * COMBO_BONUS_PER);
}

/** Passive BP earned over `dt` seconds. */
export function passiveGain(perSec: number, mult: number, dt: number): number {
  return perSec * mult * dt;
}

/** Combined multiplier from a list of mult-upgrade values (multiplicative stack). */
export function stackMultipliers(values: readonly number[], baseMult = 1): number {
  return values.reduce((acc, v) => acc * v, baseMult);
}

/** Derived stats from a set of owned upgrades (per-click, per-sec, multiplier). */
export interface DerivedStats {
  perClick: number;
  perSec: number;
  mult: number;
}

/**
 * Recompute derived stats from base values and current upgrade levels.
 * Mirrors the prototype's incremental application, but as a pure fold so it can
 * be reconstructed from a save without replaying every purchase.
 */
export function deriveStats(
  upgrades: readonly UpgradeState[],
  base: DerivedStats = { perClick: 1, perSec: 0, mult: 1 },
): DerivedStats {
  const out: DerivedStats = { ...base };
  for (const u of upgrades) {
    if (u.lv <= 0) continue;
    if (u.type === 'click') out.perClick += u.val * u.lv;
    else if (u.type === 'sec') out.perSec += u.val * u.lv;
    else out.mult *= Math.pow(u.val, u.lv);
  }
  return out;
}
