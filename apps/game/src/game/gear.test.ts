import { describe, expect, it } from 'vitest';

import type { BuffStat } from '../types';
import {
  accrueSugar,
  activeSets,
  beatWindowBonus,
  BOSS_SHARD_BASE,
  bossDmgMult,
  bossShardReward,
  chestLuckBonus,
  clickGearMult,
  coachCpsBonus,
  comboWindowBonus,
  craftCost,
  craftSkin,
  createGear,
  critChanceBonus,
  critMultBonus,
  DUP_SHARD_VALUE,
  dpsGearMult,
  emptyGearBonus,
  frenzyChargeReduction,
  frenzyDurBonus,
  frenzyDurSecBonus,
  type GearState,
  gearBonus,
  goldGearMult,
  keyDropBonus,
  MAX_SKIN_LEVEL,
  MAX_SKIN_STARS,
  maturedSugar,
  offlineCapBonus,
  offlineRateBonus,
  onBeatMultBonus,
  PERCENT_STATS,
  shardCost,
  SKIN_UNLOCKS,
  skinCrafted,
  skinLevel,
  skinStarCount,
  skinUnlocked,
  SUGAR_PERIOD_MS,
  sugarCostForStar,
  type UnlockCtx,
} from './gear';

/** Build a gear state from the default with overrides + explicit level/stars. */
function gear(
  skin: GearState['skin'],
  bg: GearState['bg'],
  level = 0,
  stars = 0,
  extra: Partial<GearState> = {},
): GearState {
  return {
    ...createGear(),
    skin,
    bg,
    skinLevels: level ? { [skin]: level } : {},
    skinStars: stars ? { [skin]: stars } : {},
    ...extra,
  };
}

describe('gear — createGear default', () => {
  it('is the deterministic classic/club Tour-Modus default with 0 timestamp', () => {
    expect(createGear()).toEqual({
      skin: 'classic',
      bg: 'club',
      bgAuto: true,
      skinLevels: {},
      skinStars: {},
      shards: 0,
      sugarPeaches: 0,
      nextSugarAt: 0,
      crafted: [],
    });
  });
});

describe('gear — level/star access (sanitised, clamped)', () => {
  it('reads stored counts and clamps to caps; junk ⇒ 0', () => {
    const g = gear('classic', 'club', 999, 99);
    expect(skinLevel(g, 'classic')).toBe(MAX_SKIN_LEVEL);
    expect(skinStarCount(g, 'classic')).toBe(MAX_SKIN_STARS);
    expect(skinLevel(g, 'disco')).toBe(0); // absent
    const bad = { ...createGear(), skinLevels: { classic: -5 }, skinStars: { classic: NaN } };
    expect(skinLevel(bad, 'classic')).toBe(0);
    expect(skinStarCount(bad, 'classic')).toBe(0);
  });
});

describe('gear — gearBonus folds skin (level + star) + kulisse', () => {
  it('classic level 10 + 2⭐ on Club: clickPct 0.6, comboWindow +0.1 s', () => {
    const b = gearBonus(gear('classic', 'club', 10, 2));
    // buff +4 %/lvl · 10 = 0.4, star +10 %/⭐ · 2 = 0.2 ⇒ 0.6
    expect(b.clickPct).toBeCloseTo(0.6, 9);
    expect(clickGearMult(gear('classic', 'club', 10, 2))).toBeCloseTo(1.6, 9);
    // Club mini-buff: +0.1 s combo-window (an absolute stat, untouched by allPct).
    expect(b.comboWindow).toBeCloseTo(0.1, 9);
    expect(comboWindowBonus(gear('classic', 'club', 10, 2))).toBeCloseTo(0.1, 9);
    expect(activeSets(gear('classic', 'club', 10, 2))).toHaveLength(0);
  });

  it('buff and star stats can differ (Disco: critChance buff, critMult star)', () => {
    const b = gearBonus(gear('disco', 'synth', 10, 3));
    expect(b.critChance).toBeCloseTo(0.04, 9); // 0.4 %/lvl · 10
    expect(b.critMult).toBeCloseTo(0.15, 9); // 5 %/⭐ · 3
    // Synth mini-buff: +10 ms beat-window.
    expect(b.beatWindow).toBeCloseTo(10, 9);
    expect(activeSets(gear('disco', 'synth', 10, 3))).toHaveLength(0); // Studio 54 needs Club
  });
});

describe('gear — set detection (exact) & fold (≥ 2 sets)', () => {
  it('Studio 54 (Disco + Club): +10 % crit-mult stacks with the star', () => {
    const g = gear('disco', 'club', 10, 3);
    expect(activeSets(g).map((s) => s.id)).toEqual(['studio54']);
    // star 5 %·3 = 0.15 + set 0.10 = 0.25
    expect(critMultBonus(g)).toBeCloseTo(0.25, 9);
    expect(critChanceBonus(g)).toBeCloseTo(0.04, 9);
    expect(comboWindowBonus(g)).toBeCloseTo(0.1, 9); // Club mini-buff
  });

  it('Retrowelle (Neon-Ninja + Synth): beat-window folds buff + kulisse + set', () => {
    const g = gear('neon', 'synth', 4, 2);
    expect(activeSets(g).map((s) => s.id)).toEqual(['retrowelle']);
    // buff 8 ms·4 = 32 + Synth 10 + set 20 = 62
    expect(beatWindowBonus(g)).toBeCloseTo(62, 9);
    expect(onBeatMultBonus(g)).toBeCloseTo(0.2, 9); // 0.1/⭐ · 2
  });

  it('Endless Summer (Pfirsich-Pirat + Beach): offline-rate + offline-cap', () => {
    const g = gear('pirate', 'beach', 5, 2);
    expect(activeSets(g).map((s) => s.id)).toEqual(['endlessSummer']);
    expect(keyDropBonus(g)).toBeCloseTo(0.3, 9); // buff 6 %·5
    expect(goldGearMult(g)).toBeCloseTo(1.1, 9); // star 5 %·2
    expect(offlineCapBonus(g)).toBeCloseTo(2 * 3600, 9); // Beach +2 h
    expect(offlineRateBonus(g)).toBeCloseTo(0.15, 9); // set 50 % → 65 %
  });

  it('Void-Funk (Gyrator + Space): crew-DPS folds kulisse + set', () => {
    const g = gear('gyrator', 'space', 3, 1);
    expect(activeSets(g).map((s) => s.id)).toEqual(['voidFunk']);
    expect(dpsGearMult(g)).toBeCloseTo(1.2, 9); // Space 5 % + set 15 %
    expect(frenzyDurBonus(g)).toBeCloseTo(0.3, 9); // buff 10 %·3
    expect(frenzyChargeReduction(g)).toBeCloseTo(0.08, 9); // star 8 %·1
  });

  it('Krönung (Tyrann + ANY kulisse): +10 % boss-dmg regardless of background', () => {
    const club = gear('boss', 'club', 5, 4);
    const space = gear('boss', 'space', 5, 4);
    expect(activeSets(club).map((s) => s.id)).toEqual(['kronung']);
    expect(activeSets(space).map((s) => s.id)).toEqual(['kronung']);
    // buff 12 %·5 = 0.60 + set 0.10 = 0.70
    expect(bossDmgMult(club)).toBeCloseTo(1.7, 9);
    expect(bossDmgMult(space)).toBeCloseTo(1.7, 9);
    expect(chestLuckBonus(club)).toBeCloseTo(0.08, 9); // star 2 %·4
  });

  it('a non-matching combo yields no set', () => {
    expect(activeSets(gear('disco', 'beach'))).toHaveLength(0);
    expect(activeSets(gear('neon', 'club'))).toHaveLength(0);
    expect(activeSets(gear('robo', 'space'))).toHaveLength(0);
  });
});

describe('gear — Diamant-Booty "+X % ALLES"', () => {
  it('applies to every percentage stat but not to absolute stats', () => {
    const g = gear('diamond', 'club', 5, 2);
    const b = gearBonus(g);
    // allPct = 2 %·5 + 3 %·2 = 0.10 + 0.06 = 0.16
    expect(b.allPct).toBeCloseTo(0.16, 9);
    for (const s of PERCENT_STATS) {
      expect(b[s]).toBeCloseTo(0.16, 9);
    }
    expect(clickGearMult(g)).toBeCloseTo(1.16, 9);
    expect(dpsGearMult(g)).toBeCloseTo(1.16, 9);
    expect(goldGearMult(g)).toBeCloseTo(1.16, 9);
    expect(bossDmgMult(g)).toBeCloseTo(1.16, 9);
    expect(critChanceBonus(g)).toBeCloseTo(0.16, 9);
    expect(critMultBonus(g)).toBeCloseTo(0.16, 9);
    // Absolute stats: Club gives +0.1 s combo-window, everything else stays 0.
    expect(comboWindowBonus(g)).toBeCloseTo(0.1, 9);
    expect(beatWindowBonus(g)).toBe(0);
    expect(offlineCapBonus(g)).toBe(0);
    expect(frenzyDurSecBonus(g)).toBe(0);
    expect(coachCpsBonus(g)).toBe(0);
  });

  it('emptyGearBonus has every BuffStat at 0', () => {
    const b = emptyGearBonus();
    for (const v of Object.values(b)) expect(v).toBe(0);
    // A BuffStat that no skin/kulisse/set grants stays 0 in a real fold too.
    expect((gearBonus(gear('classic', 'club')) as Record<BuffStat, number>).bossTimer).toBe(0);
  });
});

describe('gear — economy (spec §5.4)', () => {
  it('shardCost = 10·⌈1.25^level⌉', () => {
    expect(shardCost(0)).toBe(10); // 10·⌈1⌉
    expect(shardCost(1)).toBe(20); // 10·⌈1.25⌉ = 10·2
    expect(shardCost(3)).toBe(20); // 10·⌈1.953⌉ = 10·2
    expect(shardCost(4)).toBe(30); // 10·⌈2.441⌉ = 10·3
    expect(shardCost(10)).toBe(100); // 10·⌈9.313⌉ = 10·10
    // Matches the explicit formula at every level.
    for (let lv = 0; lv <= MAX_SKIN_LEVEL; lv++) {
      expect(shardCost(lv)).toBe(10 * Math.ceil(Math.pow(1.25, lv)));
    }
  });

  it('sugarCostForStar = star + 1, null at the 5-star cap', () => {
    expect(sugarCostForStar(0)).toBe(1);
    expect(sugarCostForStar(1)).toBe(2);
    expect(sugarCostForStar(4)).toBe(5);
    expect(sugarCostForStar(5)).toBeNull();
    expect(sugarCostForStar(99)).toBeNull();
  });

  it('duplicate → shard values span 25 (common) … 400 (legendary)', () => {
    expect(DUP_SHARD_VALUE.common).toBe(25);
    expect(DUP_SHARD_VALUE.legendary).toBe(400);
    // Monotonically increasing by rarity.
    const order = [
      DUP_SHARD_VALUE.common,
      DUP_SHARD_VALUE.rare,
      DUP_SHARD_VALUE.epic,
      DUP_SHARD_VALUE.legendary,
      DUP_SHARD_VALUE.mythic,
    ];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
});

describe('gear — sugar maturation (backwards-clock safe, AC2)', () => {
  const now = 1_700_000_000_000;

  it('ripens exactly one per 24 h and advances the timer', () => {
    expect(maturedSugar(now, now)).toEqual({ ripened: 1, nextSugarAt: now + SUGAR_PERIOD_MS });
    const three = maturedSugar(now, now + 2.5 * SUGAR_PERIOD_MS);
    expect(three.ripened).toBe(3);
    expect(three.nextSugarAt).toBe(now + 3 * SUGAR_PERIOD_MS);
  });

  it('is not yet ripe before the timer (no clamp when within one period)', () => {
    const half = maturedSugar(now + SUGAR_PERIOD_MS / 2, now);
    expect(half.ripened).toBe(0);
    expect(half.nextSugarAt).toBe(now + SUGAR_PERIOD_MS / 2);
  });

  it('clamps a far-future timer (clock set forward then back) — never negative', () => {
    const far = maturedSugar(now + 100 * SUGAR_PERIOD_MS, now);
    expect(far.ripened).toBe(0);
    expect(far.nextSugarAt).toBe(now + SUGAR_PERIOD_MS);
    // A non-finite timer is clamped the same way.
    expect(maturedSugar(Infinity, now)).toEqual({ ripened: 0, nextSugarAt: now + SUGAR_PERIOD_MS });
    expect(maturedSugar(NaN, now).ripened).toBe(0);
    // Never a negative count regardless of how far back the clock jumped.
    expect(maturedSugar(now, now - 5 * SUGAR_PERIOD_MS).ripened).toBe(0);
  });
});

describe('gear — sugar faucet (accrueSugar, injected clock)', () => {
  const now = 1_700_000_000_000;

  it('folds one ripened 🍬 into the slice per 24 h and advances the timer', () => {
    const g = { ...createGear(), sugarPeaches: 2, nextSugarAt: now };
    const one = accrueSugar(g, now);
    expect(one.sugarPeaches).toBe(3);
    expect(one.nextSugarAt).toBe(now + SUGAR_PERIOD_MS);
    // 2.5 periods later ⇒ +3 (from the freshly-advanced timer).
    const more = accrueSugar(one, now + 3.5 * SUGAR_PERIOD_MS);
    expect(more.sugarPeaches).toBe(6);
    expect(more.nextSugarAt).toBe(now + 4 * SUGAR_PERIOD_MS);
  });

  it('is a no-op (same reference) before the timer ripens', () => {
    const g = { ...createGear(), sugarPeaches: 1, nextSugarAt: now + SUGAR_PERIOD_MS };
    expect(accrueSugar(g, now)).toBe(g); // unchanged ref — nothing matured, no clamp
  });

  it('clamps a far-future timer (clock forward then back) without a negative/added count', () => {
    const g = { ...createGear(), sugarPeaches: 3, nextSugarAt: now + 100 * SUGAR_PERIOD_MS };
    const clamped = accrueSugar(g, now);
    expect(clamped.sugarPeaches).toBe(3); // no phantom ripening
    expect(clamped.nextSugarAt).toBe(now + SUGAR_PERIOD_MS); // clamped, persisted
    expect(clamped).not.toBe(g); // changed ref because the timer was repaired
  });
});

describe('gear — shard faucet (provisional pre-M12)', () => {
  it('grants BOSS_SHARD_BASE + ⌊zone/10⌋ per boss kill, clamped', () => {
    expect(bossShardReward(10)).toBe(BOSS_SHARD_BASE + 1); // 4
    expect(bossShardReward(50)).toBe(BOSS_SHARD_BASE + 5); // 8
    expect(bossShardReward(5)).toBe(BOSS_SHARD_BASE); // 3
    expect(bossShardReward(0)).toBe(0);
    expect(bossShardReward(-5)).toBe(0);
    // Monotonic non-decreasing in the boss zone.
    for (let z = 5; z <= 200; z += 5) {
      expect(bossShardReward(z + 5)).toBeGreaterThanOrEqual(bossShardReward(z));
    }
  });
});

describe('gear — unlock gating (spec §5.3)', () => {
  function ctx(over: Partial<UnlockCtx> = {}): UnlockCtx {
    return {
      lifetimeMaxZone: 1,
      bossFirstKills: new Set<number>(),
      himmelfahrten: 0,
      crafted: new Set<string>(),
      ...over,
    };
  }

  it('Klassiker & Disco start unlocked', () => {
    expect(skinUnlocked('classic', ctx())).toBe(true);
    expect(skinUnlocked('disco', ctx())).toBe(true);
  });

  it('Robo ≥ zone 15, Showmaster ≥ zone 25', () => {
    expect(skinUnlocked('robo', ctx({ lifetimeMaxZone: 14 }))).toBe(false);
    expect(skinUnlocked('robo', ctx({ lifetimeMaxZone: 15 }))).toBe(true);
    expect(skinUnlocked('host', ctx({ lifetimeMaxZone: 24 }))).toBe(false);
    expect(skinUnlocked('host', ctx({ lifetimeMaxZone: 25 }))).toBe(true);
  });

  it('Tyrann = boss-zone-10 first kill; Lava = boss-zone-50 first kill', () => {
    expect(skinUnlocked('boss', ctx())).toBe(false);
    expect(skinUnlocked('boss', ctx({ bossFirstKills: new Set([10]) }))).toBe(true);
    expect(skinUnlocked('lava', ctx({ bossFirstKills: new Set([10]) }))).toBe(false);
    expect(skinUnlocked('lava', ctx({ bossFirstKills: new Set([50]) }))).toBe(true);
  });

  it('Gyrator = ≥ 1 Himmelfahrt', () => {
    expect(skinUnlocked('gyrator', ctx({ himmelfahrten: 0 }))).toBe(false);
    expect(skinUnlocked('gyrator', ctx({ himmelfahrten: 1 }))).toBe(true);
  });

  it('Neon-Ninja / Pfirsich-Pirat = crafted; Diamant locked until Transzendenz', () => {
    expect(skinUnlocked('neon', ctx())).toBe(false);
    expect(skinUnlocked('neon', ctx({ crafted: new Set(['neon']) }))).toBe(true);
    expect(skinUnlocked('pirate', ctx({ crafted: new Set(['pirate']) }))).toBe(true);
    expect(skinUnlocked('pirate', ctx({ crafted: new Set(['neon']) }))).toBe(false);
    expect(skinUnlocked('diamond', ctx({ crafted: new Set(['diamond']), himmelfahrten: 9 }))).toBe(
      false,
    );
  });

  it('exposes craft costs from the catalog (120 / 80 🧩)', () => {
    expect(craftCost('neon')).toBe(120);
    expect(craftCost('pirate')).toBe(80);
    expect(craftCost('classic')).toBeNull();
    // Every skin has an unlock rule.
    expect(Object.keys(SKIN_UNLOCKS)).toHaveLength(10);
  });
});

describe('gear — provisional craft (spec §5.3, pure)', () => {
  it('spends craftCost 🧩, latches the id, and then reads as unlocked', () => {
    const g = { ...createGear(), shards: 200 };
    expect(skinCrafted(g, 'neon')).toBe(false);
    const r = craftSkin(g, 'neon');
    expect(r.ok).toBe(true);
    expect(r.gear.shards).toBe(80); // 200 − 120
    expect(r.gear.crafted).toEqual(['neon']);
    expect(skinCrafted(r.gear, 'neon')).toBe(true);
    expect(r.gear).not.toBe(g); // new slice on success
    // Pure: the original is untouched.
    expect(g.shards).toBe(200);
    expect(g.crafted).toEqual([]);
  });

  it('refuses when too few 🧩, already crafted, or not a craft skin (same ref)', () => {
    const poor = { ...createGear(), shards: 79 };
    expect(craftSkin(poor, 'pirate').ok).toBe(false); // needs 80
    expect(craftSkin(poor, 'pirate').gear).toBe(poor);
    const done = { ...createGear(), shards: 500, crafted: ['neon'] };
    const twice = craftSkin(done, 'neon');
    expect(twice.ok).toBe(false); // already crafted
    expect(twice.gear).toBe(done);
    const rich = { ...createGear(), shards: 9999 };
    expect(craftSkin(rich, 'classic').ok).toBe(false); // classic isn't craft-gated
    expect(craftSkin(rich, 'boss').ok).toBe(false); // boss is boss-gated, not craft
  });
});
