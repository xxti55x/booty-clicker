/**
 * Pfirsich-Truhen — the pure loot engine (spec §6, M12). Chest tiers, weighted
 * loot tables, deterministic `openChest`, per-tier **Pity**, **Luck** reweighting,
 * duplicate protection and the permanent-token catalog. Everything here is pure
 * data + pure functions — no save-schema, no glue, no UI (those are parts 2/3).
 *
 * Determinism (§6.4): every random choice draws from an injected `Rng` (§9.4), so
 * `openChest(tier, ctx, rng)` is a pure function of `(tier, ctx, rng-state)` — same
 * inputs ⇒ identical rewards + identical advanced cursor. Because `{ seed, cursor }`
 * live in the save (part 2), save-scumming a chest open is impossible.
 *
 * Player-power-dependent amounts (BP = 15 min of income; boost duration) are NEVER
 * read from a live state here — they are computed from values passed IN via `ctx`
 * (`incomePerSec`), keeping the engine pure and testable. Balancing (tables,
 * weights, ranges, pity thresholds, token magnitudes) is exported data.
 */
import { Rng } from '../util/rng';

// ---------------------------------------------------------------------------
// Tiers & sources (spec §6.2)
// ---------------------------------------------------------------------------

/** The four chest tiers (spec §6.2). */
export type ChestTier = 'wood' | 'gold' | 'diamond' | 'mythic';

/** Tier metadata (emoji + display name) — data. */
export interface ChestTierConfig {
  readonly tier: ChestTier;
  readonly emoji: string;
  readonly name: string;
}

/** Ordered tier catalog (weakest → strongest). */
export const CHEST_TIERS: readonly ChestTierConfig[] = [
  { tier: 'wood', emoji: '🪵', name: 'Holztruhe' },
  { tier: 'gold', emoji: '🥇', name: 'Goldtruhe' },
  { tier: 'diamond', emoji: '💠', name: 'Diamanttruhe' },
  { tier: 'mythic', emoji: '🌌', name: 'Mythostruhe' },
];

/** 🔑 cost to open each tier (spec §6.1: Holz 0, Gold 1, Diamant 3, Mythos 10). */
export const KEY_COST: Record<ChestTier, number> = {
  wood: 0,
  gold: 1,
  diamond: 3,
  mythic: 10,
};

/** Boss zone at/above which a boss drops a Diamanttruhe (spec §6.2). */
export const BOSS_TIER_DIAMOND_ZONE = 50;
/** Boss zone at/above which a boss drops a Mythostruhe (spec §6.2). */
export const BOSS_TIER_MYTHIC_ZONE = 150;

/**
 * The chest tier a boss kill at `zone` drops (spec §6.2): bosses below zone 50 →
 * Gold, ≥ 50 → Diamant, ≥ 150 → Mythos. (Wood comes from rival kills / sessions,
 * not from bosses — handled by part 2's drop hooks.) Pure over `zone` alone.
 */
export function chestTierForBoss(zone: number): ChestTier {
  if (zone >= BOSS_TIER_MYTHIC_ZONE) return 'mythic';
  if (zone >= BOSS_TIER_DIAMOND_ZONE) return 'diamond';
  return 'gold';
}

// ---------------------------------------------------------------------------
// Permanent tokens (spec §6.2/§6) — the extended diamond pool
// ---------------------------------------------------------------------------

/** Permanent-token ids (spec §6.2). */
export type TokenId = 'critDmg' | 'critChance' | 'goldPct' | 'dpsPct';

/** Which aggregate stat a token feeds. */
export type TokenEffect = 'critMult' | 'critChance' | 'goldMult' | 'dpsMult';

/** A permanent token's definition (data). */
export interface TokenConfig {
  readonly id: TokenId;
  readonly name: string;
  /** The aggregate this token contributes to. */
  readonly effect: TokenEffect;
  /** Magnitude per token held (fraction). */
  readonly per: number;
}

/**
 * The permanent-token catalog (spec §6.2/§6). `critDmg` is the base Goldtruhe
 * token; the other three are the extended Diamant pool. Magnitudes are per token
 * held; the aggregators below fold a `PermTokens` count map into the derived
 * pipeline (part 2 threads them into crit/gold/dps).
 */
export const TOKENS: readonly TokenConfig[] = [
  { id: 'critDmg', name: '+1 % Krit-Schaden', effect: 'critMult', per: 0.01 },
  { id: 'critChance', name: '+0,1 % Krit-Chance', effect: 'critChance', per: 0.001 },
  { id: 'goldPct', name: '+1 % Gold', effect: 'goldMult', per: 0.01 },
  { id: 'dpsPct', name: '+1 % Crew-DPS', effect: 'dpsMult', per: 0.01 },
];

const TOKEN_BY_ID: Record<string, TokenConfig> = Object.fromEntries(TOKENS.map((t) => [t.id, t]));

/** Held permanent tokens, keyed by id (absent = 0). */
export type PermTokens = Record<string, number>;

/** A fresh (empty) token map. */
export function createPermTokens(): PermTokens {
  return {};
}

/** Sanitised (non-negative integer) count of a token id. */
export function tokenCount(tokens: PermTokens, id: TokenId): number {
  const v = tokens[id];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Add `n` tokens of `id` (pure — returns a new map). */
export function addToken(tokens: PermTokens, id: TokenId, n = 1): PermTokens {
  if (!(n > 0)) return tokens;
  return { ...tokens, [id]: tokenCount(tokens, id) + Math.floor(n) };
}

function tokenPer(id: TokenId): number {
  return TOKEN_BY_ID[id]?.per ?? 0;
}

/** Crit-damage multiplier from held `critDmg` tokens: ×(1 + 1 %·count). */
export function permTokenCritMult(tokens: PermTokens): number {
  return 1 + tokenPer('critDmg') * tokenCount(tokens, 'critDmg');
}
/** Additive crit-chance from held `critChance` tokens: +0.1 %·count. */
export function permTokenCritChance(tokens: PermTokens): number {
  return tokenPer('critChance') * tokenCount(tokens, 'critChance');
}
/** Gold multiplier from held `goldPct` tokens: ×(1 + 1 %·count). */
export function permTokenGoldMult(tokens: PermTokens): number {
  return 1 + tokenPer('goldPct') * tokenCount(tokens, 'goldPct');
}
/** Crew-DPS multiplier from held `dpsPct` tokens: ×(1 + 1 %·count). */
export function permTokenDpsMult(tokens: PermTokens): number {
  return 1 + tokenPer('dpsPct') * tokenCount(tokens, 'dpsPct');
}

// ---------------------------------------------------------------------------
// Reward union (spec §6.2)
// ---------------------------------------------------------------------------

/** The reward kinds a chest can yield. */
export type RewardKind = 'bp' | 'shards' | 'keys' | 'sugar' | 'boost' | 'token' | 'jackpot';

/** A time-limited income boost reward (`mult`× for `durMs`, stacks DURATION §6.2). */
export interface BoostReward {
  readonly mult: number;
  readonly durMs: number;
}

/** A jackpot reward — a cosmetic Truhen-Skin (duplicate → shards, §6.3.2). */
export interface JackpotReward {
  readonly skin: string;
  readonly tier: ChestTier;
}

/** A single chest reward (typed union, spec §6.2). */
export type Reward =
  | { readonly kind: 'bp'; readonly bp: number }
  | { readonly kind: 'shards'; readonly shards: number }
  | { readonly kind: 'keys'; readonly keys: number }
  | { readonly kind: 'sugar'; readonly sugar: number }
  | { readonly kind: 'boost'; readonly boost: BoostReward }
  | { readonly kind: 'token'; readonly token: TokenId }
  | { readonly kind: 'jackpot'; readonly jackpot: JackpotReward };

// ---------------------------------------------------------------------------
// Jackpot chest-skins (spec §6.2) + duplicate protection (§6.3.2)
// ---------------------------------------------------------------------------

/** A cosmetic chest-skin awarded by a jackpot (data). */
export interface ChestSkinConfig {
  readonly id: string;
  readonly name: string;
  readonly tier: ChestTier;
}

/** The jackpot chest-skin catalog (data) — the jackpot pool per tier. */
export const CHEST_SKINS: readonly ChestSkinConfig[] = [
  { id: 'wood-mossy', name: 'Moos-Truhe', tier: 'wood' },
  { id: 'wood-cracked', name: 'Rissige Truhe', tier: 'wood' },
  { id: 'gold-baroque', name: 'Barock-Truhe', tier: 'gold' },
  { id: 'gold-royal', name: 'Königstruhe', tier: 'gold' },
  { id: 'gold-neon', name: 'Neon-Truhe', tier: 'gold' },
  { id: 'diamond-prism', name: 'Prisma-Truhe', tier: 'diamond' },
  { id: 'diamond-frost', name: 'Frost-Truhe', tier: 'diamond' },
  { id: 'diamond-aurora', name: 'Aurora-Truhe', tier: 'diamond' },
  { id: 'mythic-cosmic', name: 'Kosmos-Truhe', tier: 'mythic' },
  { id: 'mythic-void', name: 'Leere-Truhe', tier: 'mythic' },
  { id: 'mythic-astral', name: 'Astral-Truhe', tier: 'mythic' },
];

/** The jackpot chest-skin ids available for a tier. */
export function jackpotSkinsForTier(tier: ChestTier): readonly string[] {
  return CHEST_SKINS.filter((s) => s.tier === tier).map((s) => s.id);
}

/** Fixed 🧩 value a duplicate jackpot converts to, per tier (spec §6.3.2). */
export const DUP_WOOD_SHARDS = 5;
export const DUP_GOLD_SHARDS = 20;
export const DUP_DIAMOND_SHARDS = 60;
export const DUP_MYTHIC_SHARDS = 200;

/** Duplicate-jackpot shard value by tier — never „nothing" (spec §6.3.2). */
export const DUP_SHARDS: Record<ChestTier, number> = {
  wood: DUP_WOOD_SHARDS,
  gold: DUP_GOLD_SHARDS,
  diamond: DUP_DIAMOND_SHARDS,
  mythic: DUP_MYTHIC_SHARDS,
};

/**
 * Duplicate protection (spec §6.3.2): a jackpot chest-skin that is already owned
 * converts to a fixed 🧩 value (`DUP_SHARDS[tier]`) — never „nothing". Any
 * non-jackpot reward, or a jackpot for a not-yet-owned skin, passes through
 * unchanged. Pure. Part 2 supplies `ownedSkins` (ctx has no ownership, so
 * `openChest` stays pure over player power alone); the glue calls this on each
 * jackpot reward before crediting it.
 */
export function resolveDuplicate(reward: Reward, ownedSkins: ReadonlySet<string>): Reward {
  if (reward.kind !== 'jackpot' || !ownedSkins.has(reward.jackpot.skin)) return reward;
  return { kind: 'shards', shards: DUP_SHARDS[reward.jackpot.tier] };
}

// ---------------------------------------------------------------------------
// Loot tables (spec §6.2) — data
// ---------------------------------------------------------------------------

/**
 * One weighted row of a loot table. The realization parameters that apply depend
 * on `kind`; unused ones are simply absent. Row 0 of every table is the `bp`
 * consolation row that Luck shifts weight away from (§6.3.4).
 */
export interface LootRow {
  readonly kind: RewardKind;
  readonly weight: number;
  /** `bp`: minutes of current income the BP reward equals (§6.2: Gold = 15 min). */
  readonly bpMinutes?: number;
  /** `boost`: income multiplier (×2 stacks duration, §6.2). */
  readonly boostMult?: number;
  /** `boost`: duration in ms. */
  readonly boostDurMs?: number;
  /** `shards`/`keys`: inclusive integer range [min, max]. */
  readonly min?: number;
  readonly max?: number;
  /** `sugar`: amount (🍬). */
  readonly sugar?: number;
}

/** A full loot table for one tier. */
export interface LootTable {
  readonly tier: ChestTier;
  /** Weighted rows; `rows[0]` is always the `bp` consolation row (§6.3.4). */
  readonly rows: readonly LootRow[];
  /** The permanent-token pool this tier draws from (empty for Wood). */
  readonly tokenPool: readonly TokenId[];
}

const MIN = 60 * 1000; // one minute in ms
const GOLD_TOKEN_POOL: readonly TokenId[] = ['critDmg'];
const DIAMOND_TOKEN_POOL: readonly TokenId[] = ['critDmg', 'critChance', 'goldPct', 'dpsPct'];

/**
 * The four loot tables (spec §6.2). The Goldtruhe row weights are spec-exact
 * (sum 100: 30/25/22/10/8/3/2). Wood/Diamant/Mythos follow the spec's stated
 * anchors (Diamant: budget ×4, 🧩 10–25, jackpot 5 %, extended token pool) with
 * the remaining weights filled in analogously — see the module report for the
 * filled-in numbers. Row 0 is `bp` everywhere so Luck has a single, consistent
 * consolation row to shift weight off.
 */
export const LOOT_TABLES: Record<ChestTier, LootTable> = {
  // Wood — small budget (BP / short boost). No permanent tokens. (Filled-in.)
  wood: {
    tier: 'wood',
    tokenPool: [],
    rows: [
      { kind: 'bp', weight: 45, bpMinutes: 5 },
      { kind: 'boost', weight: 30, boostMult: 2, boostDurMs: 3 * MIN },
      { kind: 'shards', weight: 18, min: 1, max: 3 },
      { kind: 'keys', weight: 5, min: 1, max: 1 },
      { kind: 'sugar', weight: 1, sugar: 1 },
      { kind: 'jackpot', weight: 1 },
    ],
  },
  // Gold — spec-exact weights (sum 100: 30/25/22/10/8/3/2).
  gold: {
    tier: 'gold',
    tokenPool: GOLD_TOKEN_POOL,
    rows: [
      { kind: 'bp', weight: 30, bpMinutes: 15 },
      { kind: 'boost', weight: 25, boostMult: 2, boostDurMs: 10 * MIN },
      { kind: 'shards', weight: 22, min: 3, max: 8 },
      { kind: 'keys', weight: 10, min: 1, max: 1 },
      { kind: 'token', weight: 8 },
      { kind: 'sugar', weight: 3, sugar: 1 },
      { kind: 'jackpot', weight: 2 },
    ],
  },
  // Diamant — budget ×4, 🧩 10–25, jackpot 5 %, extended token pool. (Filled-in.)
  diamond: {
    tier: 'diamond',
    tokenPool: DIAMOND_TOKEN_POOL,
    rows: [
      { kind: 'bp', weight: 20, bpMinutes: 60 },
      { kind: 'boost', weight: 20, boostMult: 2, boostDurMs: 40 * MIN },
      { kind: 'shards', weight: 25, min: 10, max: 25 },
      { kind: 'keys', weight: 12, min: 1, max: 2 },
      { kind: 'token', weight: 15 },
      { kind: 'sugar', weight: 3, sugar: 2 },
      { kind: 'jackpot', weight: 5 },
    ],
  },
  // Mythos — jackpot tier: huge budget, 15 % jackpot, extended tokens. (Filled-in.)
  mythic: {
    tier: 'mythic',
    tokenPool: DIAMOND_TOKEN_POOL,
    rows: [
      { kind: 'bp', weight: 15, bpMinutes: 240 },
      { kind: 'boost', weight: 15, boostMult: 2, boostDurMs: 160 * MIN },
      { kind: 'shards', weight: 25, min: 40, max: 100 },
      { kind: 'keys', weight: 15, min: 2, max: 3 },
      { kind: 'token', weight: 12 },
      { kind: 'sugar', weight: 3, sugar: 3 },
      { kind: 'jackpot', weight: 15 },
    ],
  },
};

/** The max 🧩 a tier's shard row can roll (drives pity + duplicate parity). */
export function shardMax(tier: ChestTier): number {
  const row = LOOT_TABLES[tier].rows.find((r) => r.kind === 'shards');
  return row?.max ?? 0;
}

// ---------------------------------------------------------------------------
// Luck reweighting (spec §6.3.4)
// ---------------------------------------------------------------------------

/**
 * The cap on how much of row 0's weight Luck may redistribute (never fully drains
 * the consolation row, so every table stays valid). Truhilda + gear + Truhen-Magnet
 * feed a single `luck` fraction; part 2 sums them and clamps here.
 */
export const LUCK_MAX_SHIFT = 0.9;

/**
 * Luck reweight (spec §6.3.4): shift a `luck`-proportional slice of row 0's weight
 * (the small BP consolation) onto the better rows, distributed proportionally to
 * their existing weights. Total weight is preserved, so the probability of row 0
 * strictly DECREASES and every other row's probability strictly INCREASES as
 * `luck` rises (monotone). `luck` is clamped to [0, `LUCK_MAX_SHIFT`]; `luck ≤ 0`
 * (or a degenerate table) returns the table unchanged. Pure.
 */
export function applyLuck(table: LootTable, luck: number): LootTable {
  const rows = table.rows;
  if (rows.length < 2) return table;
  const f = Math.max(0, Math.min(LUCK_MAX_SHIFT, luck));
  if (f <= 0) return table;
  const removed = rows[0].weight * f;
  let othersTotal = 0;
  for (let i = 1; i < rows.length; i++) othersTotal += rows[i].weight;
  if (!(othersTotal > 0)) return table;
  const newRows = rows.map((r, i) =>
    i === 0
      ? { ...r, weight: r.weight - removed }
      : { ...r, weight: r.weight + removed * (r.weight / othersTotal) },
  );
  return { ...table, rows: newRows };
}

// ---------------------------------------------------------------------------
// Pity (spec §6.3.1)
// ---------------------------------------------------------------------------

/** Pity threshold for Gold: at latest the 12th open hits (spec §6.3.1). */
export const PITY_GOLD = 12;
/** Pity threshold for Diamant: at latest the 4th open hits (spec §6.3.1). */
export const PITY_DIAMOND = 4;
/** Pity threshold for Mythos (rarer opens ⇒ a tighter guarantee). */
export const PITY_MYTHIC = 3;

/**
 * Opens-until-forced-hit per tier. `0` = exempt (Wood has trivial cost and no
 * meaningful jackpot economy, so it carries no pity counter, §6.3.1 "or exempt
 * wood").
 */
export const PITY_THRESHOLDS: Record<ChestTier, number> = {
  wood: 0,
  gold: PITY_GOLD,
  diamond: PITY_DIAMOND,
  mythic: PITY_MYTHIC,
};

/** On a forced pity hit, the chance it is a jackpot (else shard-max). */
export const PITY_JACKPOT_CHANCE = 0.5;

/** The per-tier pity counters (opens since the last max/jackpot hit). */
export type PityState = Record<ChestTier, number>;

/** A fresh, all-zero pity state. */
export function createPity(): PityState {
  return { wood: 0, gold: 0, diamond: 0, mythic: 0 };
}

function sanitizeCounter(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Normalise a (possibly partial/corrupt) pity map to all four non-negative ints. */
export function normalizePity(p: Partial<PityState> | undefined | null): PityState {
  return {
    wood: sanitizeCounter(p?.wood),
    gold: sanitizeCounter(p?.gold),
    diamond: sanitizeCounter(p?.diamond),
    mythic: sanitizeCounter(p?.mythic),
  };
}

/** Whether a reward resets the pity counter (a shard-max OR jackpot hit, §6.3.1). */
export function isPityHit(reward: Reward, tier: ChestTier): boolean {
  if (reward.kind === 'jackpot') return true;
  return reward.kind === 'shards' && reward.shards >= shardMax(tier);
}

// ---------------------------------------------------------------------------
// openChest (spec §6.4) — deterministic, pure over (tier, ctx, rng-state)
// ---------------------------------------------------------------------------

/** Context passed into `openChest` (player power + luck + incoming pity). */
export interface ChestCtx {
  /** Current total income per second (drives BP rewards; kept out of the engine). */
  readonly incomePerSec: number;
  /** Summed Truhen-Luck fraction (Truhilda + gear + Truhen-Magnet), §6.3.4. */
  readonly luck: number;
  /** Incoming per-tier pity counters. */
  readonly pity: PityState;
}

/** The result of opening a chest: the rewards plus the advanced pity state. */
export interface OpenResult {
  readonly rewards: readonly Reward[];
  readonly pity: PityState;
}

/** Inclusive integer in [min, max] drawn from `rng`; no draw when min ≥ max. */
function intInRange(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng.next() * (max - min + 1));
}

/** Weighted row pick from an already-drawn float in [0, 1). */
function pickRow(rows: readonly LootRow[], f: number): LootRow {
  let total = 0;
  for (const r of rows) total += r.weight;
  let x = f * total;
  for (const r of rows) {
    x -= r.weight;
    if (x < 0) return r;
  }
  return rows[rows.length - 1];
}

/** Realize a jackpot reward for a tier (picks a chest-skin from the tier pool). */
function jackpotReward(tier: ChestTier, rng: Rng): Reward {
  const skins = jackpotSkinsForTier(tier);
  const skin = skins.length > 1 ? skins[intInRange(rng, 0, skins.length - 1)] : (skins[0] ?? '');
  return { kind: 'jackpot', jackpot: { skin, tier } };
}

/** Realize a concrete reward from a picked row + ctx (drawing extra rng as needed). */
function realizeRow(table: LootTable, row: LootRow, ctx: ChestCtx, rng: Rng): Reward {
  switch (row.kind) {
    case 'bp': {
      const bp = Math.max(0, Math.round(ctx.incomePerSec * (row.bpMinutes ?? 0) * 60));
      return { kind: 'bp', bp };
    }
    case 'boost':
      return { kind: 'boost', boost: { mult: row.boostMult ?? 1, durMs: row.boostDurMs ?? 0 } };
    case 'shards':
      return { kind: 'shards', shards: intInRange(rng, row.min ?? 0, row.max ?? 0) };
    case 'keys':
      return { kind: 'keys', keys: intInRange(rng, row.min ?? 1, row.max ?? 1) };
    case 'sugar':
      return { kind: 'sugar', sugar: row.sugar ?? 1 };
    case 'token': {
      const pool = table.tokenPool;
      const token = pool.length > 1 ? pool[intInRange(rng, 0, pool.length - 1)] : pool[0];
      // A `token` row without a pool cannot occur in the shipped tables; fall back
      // to the base token so the union stays total.
      return { kind: 'token', token: token ?? 'critDmg' };
    }
    case 'jackpot':
      return jackpotReward(table.tier, rng);
    default:
      // Unreachable; keeps the switch total for `noImplicitReturns`.
      return { kind: 'bp', bp: 0 };
  }
}

/** The forced pity reward (spec §6.3.1): shard-max OR jackpot. */
function pityReward(tier: ChestTier, rng: Rng): Reward {
  if (rng.next() < PITY_JACKPOT_CHANCE) return jackpotReward(tier, rng);
  return { kind: 'shards', shards: shardMax(tier) };
}

/**
 * Open a chest (spec §6.4). Deterministic + pure over `(tier, ctx, rng-state)`:
 * every random choice draws from `rng`, so the same tier + ctx + rng cursor yields
 * identical rewards and advances the cursor identically. Applies Luck (§6.3.4) to
 * the table, honours Pity (§6.3.1) — forcing a shard-max-or-jackpot at latest on
 * the tier's threshold open and resetting the counter on any max/jackpot hit — and
 * returns the rewards plus the advanced pity state. Duplicate protection (§6.3.2)
 * is applied downstream via `resolveDuplicate` (ctx carries no ownership so the
 * engine stays pure over player power alone).
 */
export function openChest(tier: ChestTier, ctx: ChestCtx, rng: Rng): OpenResult {
  const table = LOOT_TABLES[tier];
  const pity = normalizePity(ctx.pity);
  const threshold = PITY_THRESHOLDS[tier];
  const counter = pity[tier];
  const forced = threshold > 0 && counter + 1 >= threshold;

  let reward: Reward;
  if (forced) {
    reward = pityReward(tier, rng);
  } else {
    const lucked = applyLuck(table, ctx.luck);
    const row = pickRow(lucked.rows, rng.next());
    reward = realizeRow(table, row, ctx, rng);
  }

  const nextCounter = threshold > 0 ? (isPityHit(reward, tier) ? 0 : counter + 1) : 0;
  return { rewards: [reward], pity: { ...pity, [tier]: nextCounter } };
}
