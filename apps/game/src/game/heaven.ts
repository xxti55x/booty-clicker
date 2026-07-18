/**
 * Ruhmes-Himmelfahrt — prestige layer 2 (pure, spec §4.5.2). Once you have earned
 * enough Ruhm-Seelen over your lifetime you can *ascend a second time* into the
 * heavens, banking **Himmelspfirsiche (HPF)** and resetting all of L1 (souls,
 * Ancients, the whole tour) for a permanent, compounding boost.
 *
 * **Held-balance model** (mirrors souls, §ascension): `hpfLifetime` is the earned
 * total (`⌊√(RS_lifetime/1000)⌋`, monotonic); `hpf` is the spendable **held**
 * balance = `hpfLifetime − Σ(spent in the Himmelsbaum)`. Held HPF has a double,
 * *multiplying* effect (the anti-plateau core, N1):
 *
 *   1. +2 % global damage per held HPF (`heavenGlobalMult`);
 *   2. a **soul amplifier** `SOUL_BONUS_eff = 0.10 + 0.002·HPF` (`soulBonusEff`) so
 *      every held soul is itself worth more — L1 and L2 multiply, they don't add.
 *
 * Spent HPF buys **Himmelsbaum** nodes: permanent across all ascensions AND
 * Himmelfahrten. The grundknoten (Twerk-Coach, Frühstarter, Nachtschicht,
 * Ekstase-Ausdauer) are active here; the combat/loot nodes (§4.5.2) land with M12.
 *
 * All pure; the glue only calls in and folds the modifiers through.
 */
import { SOUL_BONUS } from './ascension';

/** Held HPF each add +2 % global damage. */
export const HPF_GLOBAL_PER = 0.02;
/** Each held HPF raises the per-soul bonus by this (the soul amplifier, §4.5.2). */
export const SOUL_AMP_PER_HPF = 0.002;
/** RS-lifetime needed per HPF² — first Himmelfahrt at 1 000 RS lifetime. */
export const HPF_RS_DIVISOR = 1000;
/** A coach auto-click deals this share of the effective click value (§4.3.5). */
export const COACH_CLICK_SHARE = 0.25;

/** The serializable L2 state (CH-save v5, §9.2.1). */
export interface HeavenState {
  /** Held (spendable) Himmelspfirsiche. */
  hpf: number;
  /** Lifetime-earned HPF (monotonic highwater — drives the Transzendenz gate). */
  hpfLifetime: number;
  /** Number of Himmelfahrten performed. */
  ascensions2: number;
  /** Bought Himmelsbaum node levels keyed by node id (absent = 0). */
  tree: Record<string, number>;
}

/** A fresh (never-ascended-to-heaven) L2 state. */
export function createHeaven(): HeavenState {
  return { hpf: 0, hpfLifetime: 0, ascensions2: 0, tree: {} };
}

/** Lifetime HPF earned for a given lifetime-RS total: `⌊√(RS/1000)⌋`. */
export function hpfForRsLifetime(rsLifetime: number): number {
  if (!(rsLifetime > 0)) return 0;
  return Math.floor(Math.sqrt(rsLifetime / HPF_RS_DIVISOR));
}

/** Global damage multiplier from held HPF: 1 + 2 %·HPF. */
export function heavenGlobalMult(hpf: number): number {
  return 1 + HPF_GLOBAL_PER * Math.max(0, hpf);
}

/** Effective per-soul bonus given held HPF: 0.10 + 0.002·HPF (the amplifier). */
export function soulBonusEff(hpf: number): number {
  return SOUL_BONUS + SOUL_AMP_PER_HPF * Math.max(0, hpf);
}

// ---- Himmelfahrt (bank HPF + reset scope handled by the caller) ----

/** HPF you would GAIN by a Himmelfahrt now: earned-for-RS minus already-earned. */
export function himmelfahrtGain(heaven: HeavenState, rsLifetime: number): number {
  return Math.max(0, hpfForRsLifetime(rsLifetime) - heaven.hpfLifetime);
}

/** Whether a Himmelfahrt would bank at least one HPF (the 1 000-RS gate first time). */
export function canHimmelfahrt(heaven: HeavenState, rsLifetime: number): boolean {
  return himmelfahrtGain(heaven, rsLifetime) >= 1;
}

/**
 * Bank the Himmelfahrt's HPF (held += gain, lifetime lifted, count++). Pure — the
 * caller resets the L1 state (souls/rsLifetime/Ancients/gold/crew/zone) around it.
 */
export function bankHimmelfahrt(heaven: HeavenState, rsLifetime: number): HeavenState {
  const earned = hpfForRsLifetime(rsLifetime);
  const gain = Math.max(0, earned - heaven.hpfLifetime);
  return {
    ...heaven,
    hpf: heaven.hpf + gain,
    hpfLifetime: Math.max(heaven.hpfLifetime, earned),
    ascensions2: heaven.ascensions2 + 1,
  };
}

// ---- Himmelsbaum (spent HPF, permanent) ----

export interface TreeNodeConfig {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  /** HPF cost per level: `costs[level]` buys `level → level+1`. */
  readonly costs: readonly number[];
}

/** Key-drop bonus fraction the Truhen-Magnet node grants (spec §4.5.2: +25 %). */
export const TRUHEN_MAGNET_KEYDROP = 0.25;

/**
 * The active grundknoten (spec §4.5.2) plus the M12 loot node **Truhen-Magnet**.
 * The remaining combat nodes (Beat-Drop, Pfirsichregen, Bühnen-Sprinter) stay
 * deferred so no HPF is spent on a no-op; they'll be appended as data when they
 * land. Truhen-Magnet lands now (M12) as a single 15-HPF node → +25 % key drops
 * (its effect is consumed by `keyDropMult` in the loot glue, §6.1).
 */
export const TREE_NODES: readonly TreeNodeConfig[] = [
  {
    id: 'coach',
    name: 'Twerk-Coach I–IV',
    desc: 'Auto-Klicker 1 → 4 cps (25 % Klickwert)',
    costs: [5, 15, 40, 100],
  },
  {
    id: 'fruhstarter',
    name: 'Frühstarter',
    desc: 'Nach Aszension: Crew-Level = 10 % der vorherigen',
    costs: [8],
  },
  {
    id: 'nachtschicht',
    name: 'Nachtschicht I–II',
    desc: 'Offline-Cap 8 h → 16 h → 24 h',
    costs: [10, 25],
  },
  {
    id: 'ekstaseausdauer',
    name: 'Ekstase-Ausdauer I–III',
    desc: 'Ekstase +3 s je Stufe',
    costs: [12, 30, 75],
  },
  {
    id: 'truhenmagnet',
    name: 'Truhen-Magnet',
    desc: '+25 % Schlüssel-Drops',
    costs: [15],
  },
];

const NODE_BY_ID: Record<string, TreeNodeConfig> = Object.fromEntries(
  TREE_NODES.map((n) => [n.id, n]),
);

/** The config for a tree-node id, or undefined. */
export function treeNodeConfig(id: string): TreeNodeConfig | undefined {
  return NODE_BY_ID[id];
}

/** Max level of a tree node (its cost-list length). */
export function treeNodeMaxLevel(id: string): number {
  return NODE_BY_ID[id]?.costs.length ?? 0;
}

/** Current (sanitised) level of a tree node. */
export function treeLevel(heaven: HeavenState, id: string): number {
  const v = heaven.tree[id];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** HPF cost to buy the next level of `id`, or null when already maxed. */
export function treeNodeCost(id: string, level: number): number | null {
  const cfg = NODE_BY_ID[id];
  if (!cfg || level >= cfg.costs.length) return null;
  return cfg.costs[level];
}

/** Whether the next level of a tree node can be bought (HPF available, not maxed). */
export function canBuyTreeNode(heaven: HeavenState, id: string): boolean {
  const cost = treeNodeCost(id, treeLevel(heaven, id));
  return cost !== null && heaven.hpf >= cost;
}

export interface BuyTreeResult {
  heaven: HeavenState;
  bought: boolean;
}

/** Buy one level of a Himmelsbaum node, spending held HPF. No-op when it can't. */
export function buyTreeNode(heaven: HeavenState, id: string): BuyTreeResult {
  if (!canBuyTreeNode(heaven, id)) return { heaven, bought: false };
  const level = treeLevel(heaven, id);
  const cost = treeNodeCost(id, level)!;
  return {
    heaven: { ...heaven, hpf: heaven.hpf - cost, tree: { ...heaven.tree, [id]: level + 1 } },
    bought: true,
  };
}

// ---- Tree effects (folded into the loop) ----

/** Twerk-Coach clicks per second (0…4). */
export function coachCps(heaven: HeavenState): number {
  return treeLevel(heaven, 'coach');
}

/** Damage a coach deals per second: `cps · 25 % · clickDamage` (no crit/beat). */
export function coachDps(clickDmg: number, cps: number): number {
  return Math.max(0, cps) * COACH_CLICK_SHARE * Math.max(0, clickDmg);
}

/** Offline cap in seconds: 8 h + 8 h per Nachtschicht level (→ 16 h, 24 h). */
export function offlineCapS(heaven: HeavenState): number {
  return (8 + treeLevel(heaven, 'nachtschicht') * 8) * 3600;
}

/** Fraction of previous crew levels restored after an ascension (Frühstarter). */
export function fruhstarterFraction(heaven: HeavenState): number {
  return treeLevel(heaven, 'fruhstarter') > 0 ? 0.1 : 0;
}

/** Extra Ekstase duration in ms: +3 s per Ekstase-Ausdauer level. */
export function ekstaseBonusMs(heaven: HeavenState): number {
  return treeLevel(heaven, 'ekstaseausdauer') * 3000;
}

/**
 * Additive key-drop bonus fraction from the Truhen-Magnet node (spec §4.5.2/§6.1):
 * a single-level node worth +25 % key drops (0 when unbought). Fed into the loot
 * glue's `keyDropMult` so boss/peach/quest key drops scale up.
 */
export function truhenMagnetBonus(heaven: HeavenState): number {
  return treeLevel(heaven, 'truhenmagnet') > 0 ? TRUHEN_MAGNET_KEYDROP : 0;
}
