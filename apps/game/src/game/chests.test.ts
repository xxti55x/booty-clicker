import { describe, expect, it } from 'vitest';

import { Rng } from '../util/rng';
import {
  type ChestCtx,
  type ChestTier,
  type PityState,
  type Reward,
  CHEST_TIERS,
  DUP_GOLD_SHARDS,
  KEY_COST,
  LOOT_TABLES,
  LUCK_MAX_SHIFT,
  PITY_DIAMOND,
  PITY_GOLD,
  PITY_THRESHOLDS,
  addToken,
  applyLuck,
  chestTierForBoss,
  createPity,
  createPermTokens,
  isPityHit,
  jackpotSkinsForTier,
  openChest,
  permTokenCritChance,
  permTokenCritMult,
  permTokenDpsMult,
  permTokenGoldMult,
  resolveDuplicate,
  shardMax,
} from './chests';

const ctx = (over: Partial<ChestCtx> = {}): ChestCtx => ({
  incomePerSec: 1000,
  luck: 0,
  pity: createPity(),
  ...over,
});

// ---------------------------------------------------------------------------
// Tables & tiers
// ---------------------------------------------------------------------------

describe('chests — tiers, tables & sources (§6.2)', () => {
  it('has 4 tiers with the documented key costs', () => {
    expect(CHEST_TIERS).toHaveLength(4);
    expect(KEY_COST).toEqual({ wood: 0, gold: 1, diamond: 3, mythic: 10 });
  });

  it('every loot table sums to weight 100 and starts with the BP consolation row', () => {
    for (const tier of ['wood', 'gold', 'diamond', 'mythic'] as ChestTier[]) {
      const table = LOOT_TABLES[tier];
      const sum = table.rows.reduce((s, r) => s + r.weight, 0);
      expect(sum).toBeCloseTo(100, 6);
      expect(table.rows[0].kind).toBe('bp'); // row 0 = the small BP reward (§6.3.4)
    }
  });

  it('Goldtruhe weights are spec-exact (30/25/22/10/8/3/2)', () => {
    const w = Object.fromEntries(LOOT_TABLES.gold.rows.map((r) => [r.kind, r.weight]));
    expect(w).toEqual({ bp: 30, boost: 25, shards: 22, keys: 10, token: 8, sugar: 3, jackpot: 2 });
  });

  it('Diamant matches its spec anchors: 🧩 10–25, jackpot 5 %, extended token pool', () => {
    const shards = LOOT_TABLES.diamond.rows.find((r) => r.kind === 'shards');
    expect([shards?.min, shards?.max]).toEqual([10, 25]);
    const jackpot = LOOT_TABLES.diamond.rows.find((r) => r.kind === 'jackpot');
    expect(jackpot?.weight).toBe(5);
    expect(LOOT_TABLES.diamond.tokenPool).toEqual(['critDmg', 'critChance', 'goldPct', 'dpsPct']);
    expect(LOOT_TABLES.gold.tokenPool).toEqual(['critDmg']);
    expect(LOOT_TABLES.wood.tokenPool).toEqual([]);
  });

  it('chestTierForBoss maps boss zones to tiers (§6.2)', () => {
    expect(chestTierForBoss(10)).toBe('gold');
    expect(chestTierForBoss(49)).toBe('gold');
    expect(chestTierForBoss(50)).toBe('diamond');
    expect(chestTierForBoss(149)).toBe('diamond');
    expect(chestTierForBoss(150)).toBe('mythic');
    expect(chestTierForBoss(400)).toBe('mythic');
  });
});

// ---------------------------------------------------------------------------
// Determinism (§6.4, AC1)
// ---------------------------------------------------------------------------

describe('chests — determinism (§6.4)', () => {
  it('same seed + cursor + ctx ⇒ identical rewards and advanced cursor', () => {
    for (const tier of ['wood', 'gold', 'diamond', 'mythic'] as ChestTier[]) {
      const a = new Rng({ seed: 777, cursor: 3 });
      const b = new Rng({ seed: 777, cursor: 3 });
      const ra = openChest(tier, ctx(), a);
      const rb = openChest(tier, ctx(), b);
      expect(ra.rewards).toEqual(rb.rewards);
      expect(ra.pity).toEqual(rb.pity);
      expect(a.cursor).toBe(b.cursor); // rng advanced identically
      expect(a.cursor).toBeGreaterThan(3);
    }
  });

  it('never yields „nothing" — every reward is a valid, non-empty payload', () => {
    const rng = new Rng({ seed: 5, cursor: 0 });
    for (let i = 0; i < 4000; i++) {
      const tier = (['wood', 'gold', 'diamond', 'mythic'] as ChestTier[])[i % 4];
      const { rewards } = openChest(tier, ctx({ luck: (i % 9) / 10 }), rng);
      expect(rewards).toHaveLength(1);
      const r = rewards[0];
      switch (r.kind) {
        case 'bp':
          expect(r.bp).toBeGreaterThanOrEqual(0);
          break;
        case 'shards':
          expect(r.shards).toBeGreaterThanOrEqual(1);
          break;
        case 'keys':
          expect(r.keys).toBeGreaterThanOrEqual(1);
          break;
        case 'sugar':
          expect(r.sugar).toBeGreaterThanOrEqual(1);
          break;
        case 'boost':
          expect(r.boost.mult).toBeGreaterThan(1);
          expect(r.boost.durMs).toBeGreaterThan(0);
          break;
        case 'token':
          expect(typeof r.token).toBe('string');
          break;
        case 'jackpot':
          expect(r.jackpot.skin.length).toBeGreaterThan(0);
          break;
      }
    }
  });

  it('BP reward equals incomePerSec × bpMinutes × 60', () => {
    // Find a seed whose first gold open (luck 0, fresh pity) yields a BP reward.
    for (let seed = 1; seed < 500; seed++) {
      const rng = new Rng({ seed, cursor: 0 });
      const r = openChest('gold', ctx({ incomePerSec: 1000 }), rng).rewards[0];
      if (r.kind === 'bp') {
        expect(r.bp).toBe(1000 * 15 * 60); // 15 min of income
        return;
      }
    }
    throw new Error('no BP reward found in 500 seeds');
  });
});

// ---------------------------------------------------------------------------
// χ² distribution (§6.2, AC1)
// ---------------------------------------------------------------------------

describe('chests — distribution matches the table weights (AC1)', () => {
  function chiSquare(tier: ChestTier, draws: number): number {
    const rng = new Rng({ seed: 24680, cursor: 0 });
    const table = LOOT_TABLES[tier];
    const total = table.rows.reduce((s, r) => s + r.weight, 0);
    const obs: Record<string, number> = {};
    const frozenPity = createPity(); // never advances ⇒ pity never forces (counter stays 0)
    for (let i = 0; i < draws; i++) {
      const r = openChest(tier, { incomePerSec: 1, luck: 0, pity: frozenPity }, rng).rewards[0];
      obs[r.kind] = (obs[r.kind] ?? 0) + 1;
    }
    let chi = 0;
    for (const row of table.rows) {
      const expected = (row.weight / total) * draws;
      const observed = obs[row.kind] ?? 0;
      chi += (observed - expected) ** 2 / expected;
    }
    return chi;
  }

  it('10 000 Goldtruhe draws fit the weights within χ² tolerance (df=6)', () => {
    // df = 6 (7 reward kinds); χ²(0.999, 6) ≈ 22.458 — deterministic seed.
    expect(chiSquare('gold', 10_000)).toBeLessThan(22.458);
  });

  it('10 000 Diamanttruhe draws fit the weights within χ² tolerance (df=6)', () => {
    expect(chiSquare('diamond', 10_000)).toBeLessThan(22.458);
  });
});

// ---------------------------------------------------------------------------
// Pity (§6.3.1, AC2)
// ---------------------------------------------------------------------------

describe('chests — pity (§6.3.1)', () => {
  it('thresholds are exposed as named constants', () => {
    expect(PITY_GOLD).toBe(12);
    expect(PITY_DIAMOND).toBe(4);
    expect(PITY_THRESHOLDS.wood).toBe(0); // wood is exempt
  });

  it('a counter at threshold−1 forces a shard-max-or-jackpot and resets to 0 (AC2)', () => {
    // Cover both forced branches (jackpot vs shard-max) across seeds.
    let sawJackpot = false;
    let sawShardMax = false;
    for (let seed = 1; seed <= 60; seed++) {
      const rng = new Rng({ seed, cursor: 0 });
      const pity: PityState = { ...createPity(), gold: PITY_GOLD - 1 }; // 11
      const res = openChest('gold', ctx({ pity }), rng);
      const r = res.rewards[0];
      expect(isPityHit(r, 'gold')).toBe(true); // shard-max OR jackpot
      expect(res.pity.gold).toBe(0); // counter reset
      if (r.kind === 'jackpot') sawJackpot = true;
      if (r.kind === 'shards') {
        expect(r.shards).toBe(shardMax('gold')); // 8
        sawShardMax = true;
      }
    }
    expect(sawJackpot).toBe(true);
    expect(sawShardMax).toBe(true);
  });

  it('across a long chain the counter never reaches the threshold (≤ 11 for gold)', () => {
    // Feed pity forward through 400 opens: increments on a miss, resets on a hit,
    // and can never survive 12 misses in a row — the „at latest 12th" guarantee.
    const rng = new Rng({ seed: 99, cursor: 0 });
    let pity = createPity();
    for (let i = 0; i < 400; i++) {
      const before = pity.gold;
      expect(before).toBeLessThan(PITY_GOLD); // never 12+
      const res = openChest('gold', ctx({ pity }), rng);
      const hit = isPityHit(res.rewards[0], 'gold');
      if (before === PITY_GOLD - 1) expect(hit).toBe(true); // 12th open forced
      expect(res.pity.gold).toBe(hit ? 0 : before + 1);
      pity = res.pity;
    }
  });

  it('wood is exempt: its pity counter stays 0 forever', () => {
    const rng = new Rng({ seed: 3, cursor: 0 });
    let pity = createPity();
    for (let i = 0; i < 50; i++) {
      const res = openChest('wood', ctx({ pity }), rng);
      expect(res.pity.wood).toBe(0);
      pity = res.pity;
    }
  });
});

// ---------------------------------------------------------------------------
// Luck reweighting (§6.3.4, AC2)
// ---------------------------------------------------------------------------

describe('chests — luck reweighting (§6.3.4)', () => {
  const rowProb = (t: ReturnType<typeof applyLuck>, kind: string): number => {
    const total = t.rows.reduce((s, r) => s + r.weight, 0);
    const row = t.rows.find((r) => r.kind === kind)!;
    return row.weight / total;
  };

  it('higher luck strictly lowers row-1 (BP) probability and raises better rows', () => {
    const lucks = [0, 0.1, 0.3, 0.6, 0.9];
    const bpProbs = lucks.map((l) => rowProb(applyLuck(LOOT_TABLES.gold, l), 'bp'));
    const jackpotProbs = lucks.map((l) => rowProb(applyLuck(LOOT_TABLES.gold, l), 'jackpot'));
    for (let i = 1; i < lucks.length; i++) {
      expect(bpProbs[i]).toBeLessThan(bpProbs[i - 1]); // BP monotonically down
      expect(jackpotProbs[i]).toBeGreaterThan(jackpotProbs[i - 1]); // better rows up
    }
  });

  it('preserves total weight and never fully drains row 0', () => {
    const base = LOOT_TABLES.gold.rows.reduce((s, r) => s + r.weight, 0);
    for (const l of [0.25, 0.5, LUCK_MAX_SHIFT, 5]) {
      const t = applyLuck(LOOT_TABLES.gold, l);
      expect(t.rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(base, 6);
      expect(t.rows[0].weight).toBeGreaterThan(0); // consolation row never empty
    }
  });

  it('luck ≤ 0 returns the table unchanged (identity)', () => {
    expect(applyLuck(LOOT_TABLES.gold, 0)).toBe(LOOT_TABLES.gold);
    expect(applyLuck(LOOT_TABLES.gold, -1)).toBe(LOOT_TABLES.gold);
  });

  it('luck raises the observed better-row share when opening (end-to-end)', () => {
    const share = (luck: number): number => {
      const rng = new Rng({ seed: 4242, cursor: 0 });
      const frozenPity = createPity();
      let bp = 0;
      const draws = 6000;
      for (let i = 0; i < draws; i++) {
        const r = openChest('gold', { incomePerSec: 1, luck, pity: frozenPity }, rng).rewards[0];
        if (r.kind === 'bp') bp++;
      }
      return bp / draws;
    };
    expect(share(0.6)).toBeLessThan(share(0)); // fewer BP consolations with luck
  });
});

// ---------------------------------------------------------------------------
// Duplicate protection (§6.3.2)
// ---------------------------------------------------------------------------

describe('chests — duplicate protection (§6.3.2)', () => {
  const jackpot: Reward = { kind: 'jackpot', jackpot: { skin: 'gold-royal', tier: 'gold' } };

  it('an owned jackpot skin converts to a fixed shard value (never nothing)', () => {
    const owned = new Set(['gold-royal']);
    const out = resolveDuplicate(jackpot, owned);
    expect(out).toEqual({ kind: 'shards', shards: DUP_GOLD_SHARDS });
  });

  it('a not-yet-owned jackpot passes through unchanged', () => {
    expect(resolveDuplicate(jackpot, new Set())).toBe(jackpot);
  });

  it('non-jackpot rewards are never touched', () => {
    const bp: Reward = { kind: 'bp', bp: 42 };
    expect(resolveDuplicate(bp, new Set(['gold-royal']))).toBe(bp);
  });

  it('every tier has at least one jackpot chest-skin to award', () => {
    for (const tier of ['wood', 'gold', 'diamond', 'mythic'] as ChestTier[]) {
      expect(jackpotSkinsForTier(tier).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Permanent tokens (§6.2/§6)
// ---------------------------------------------------------------------------

describe('chests — permanent tokens (§6)', () => {
  it('aggregators fold token counts into their stats', () => {
    const t = { critDmg: 10, critChance: 5, goldPct: 3, dpsPct: 7 };
    expect(permTokenCritMult(t)).toBeCloseTo(1.1, 6); // +1 %·10
    expect(permTokenCritChance(t)).toBeCloseTo(0.005, 6); // +0.1 %·5
    expect(permTokenGoldMult(t)).toBeCloseTo(1.03, 6); // +1 %·3
    expect(permTokenDpsMult(t)).toBeCloseTo(1.07, 6); // +1 %·7
  });

  it('an empty token map is neutral', () => {
    const t = createPermTokens();
    expect(permTokenCritMult(t)).toBe(1);
    expect(permTokenCritChance(t)).toBe(0);
    expect(permTokenGoldMult(t)).toBe(1);
    expect(permTokenDpsMult(t)).toBe(1);
  });

  it('addToken accumulates counts purely', () => {
    const a = addToken(createPermTokens(), 'critDmg', 2);
    const b = addToken(a, 'critDmg');
    expect(b.critDmg).toBe(3);
    expect(a.critDmg).toBe(2); // original untouched
  });
});
