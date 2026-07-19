import { describe, expect, it } from 'vitest';

import {
  ABILITY_COST_MULT,
  DPS_TUNE,
  SPECIAL_BEAT_CAP_MS,
  SPECIAL_BOSS,
  SPECIAL_COMBO_CAP_S,
  SPECIAL_CRIT_CHANCE,
  SPECIAL_CRIT_DMG,
  SPECIAL_GOLD,
  abilityCost,
  abilityKind,
  abilityKindLabel,
  abilityLevel,
  abilityMult,
  abilityTiersUnlocked,
  bulkCost,
  CLICK_BASE,
  CLICK_DPS_SHARE,
  clickDamageRaw,
  CREW,
  createCrew,
  crewSpecialBonuses,
  heroClick,
  heroDps,
  HERO_COST_GROWTH,
  maxAffordable,
  nextAbility,
  nextLevelCost,
  powerTiers,
  specialTiers,
  totalRawDps,
} from './heroes';

const boss = CREW[0]; // Booty-Boss: click hero, baseCost 5, baseDps 2 (click/level)
const hype = CREW[1]; // Hype-Girl: first pure-DPS member, baseDps 5

describe('heroes — click line vs DPS lines (v10)', () => {
  it('un-recruited members contribute nothing', () => {
    expect(heroDps(hype, 0)).toBe(0);
    expect(heroClick(boss, 0)).toBe(0);
    expect(totalRawDps(createCrew())).toBe(0);
  });

  it('slot 1 is CLICK damage only — zero DPS at any level', () => {
    expect(heroDps(boss, 50)).toBe(0);
    expect(heroClick(boss, 5)).toBe(boss.baseDps * 5);
    expect(totalRawDps({ boss: 50 })).toBe(0);
  });

  it('every member after slot 1 is pure DPS — zero click line', () => {
    for (const cfg of CREW.slice(1)) {
      expect(cfg.click).toBeUndefined();
      expect(heroClick(cfg, 50)).toBe(0);
    }
    expect(heroDps(hype, 4)).toBe(hype.baseDps * DPS_TUNE * 4);
  });

  it('sums DPS across the crew (click hero excluded)', () => {
    const levels = { boss: 10, hype: 4, dj: 2 };
    expect(totalRawDps(levels)).toBe(heroDps(hype, 4) + heroDps(CREW[2], 2));
  });
});

describe('heroes — kaufbare Fähigkeiten (buyable abilities)', () => {
  it('tiers unlock at Lv 25, then every 50 levels (25, 75, 125, …)', () => {
    expect(abilityLevel(1)).toBe(25);
    expect(abilityLevel(2)).toBe(75);
    expect(abilityLevel(3)).toBe(125);
    expect(abilityTiersUnlocked(24)).toBe(0);
    expect(abilityTiersUnlocked(25)).toBe(1);
    expect(abilityTiersUnlocked(74)).toBe(1);
    expect(abilityTiersUnlocked(75)).toBe(2);
    expect(abilityTiersUnlocked(125)).toBe(3);
    expect(abilityTiersUnlocked(1025)).toBe(21);
  });

  it('only ODD (power) tiers raise output — mult = 1 + power tiers (v11)', () => {
    expect(abilityMult(0)).toBe(1);
    expect(abilityMult(1)).toBe(2); // tier 1 = power
    expect(abilityMult(2)).toBe(2); // tier 2 = special (no self output)
    expect(abilityMult(3)).toBe(3); // tiers 1+3 = 2 power tiers
    expect(abilityMult(4)).toBe(3);
    expect(abilityMult(5)).toBe(4);
    expect(powerTiers(7)).toBe(4);
    expect(specialTiers(7)).toBe(3);
    // A Lv-100 member with nothing bought has NO milestone multiplier any more
    // (DPS_TUNE is the flat idle retune, not level-derived).
    expect(heroDps(hype, 100, 0, 0)).toBe(hype.baseDps * DPS_TUNE * 100);
    expect(heroDps(hype, 100, 0, 3)).toBe(hype.baseDps * DPS_TUNE * 100 * 3);
    expect(heroClick(boss, 100, 0, 3)).toBe(boss.baseDps * 100 * 3);
  });

  it('abilityKind: odd tiers are power, even tiers the member theme (v11)', () => {
    expect(abilityKind(hype, 1)).toBe('power');
    expect(abilityKind(hype, 2)).toBe('combo'); // Hype-Girl keeps the crowd going
    expect(abilityKind(hype, 3)).toBe('power');
    expect(abilityKind(boss, 2)).toBe('critdmg');
    expect(abilityKind(CREW[2], 4)).toBe('beat'); // DJ Wumms owns the beat
    // Every member declares a themed special and every kind label resolves.
    for (const cfg of CREW) {
      expect(cfg.special).not.toBe('power');
      expect(abilityKindLabel(abilityKind(cfg, 2), 'DPS').length).toBeGreaterThan(3);
    }
  });

  it('crewSpecialBonuses aggregates bought EVEN tiers per theme, with caps', () => {
    const none = crewSpecialBonuses({});
    expect(none.goldMult).toBe(1);
    expect(none.critChance).toBe(0);
    expect(none.bossMult).toBe(1);
    // 4 bought tiers on the Insta-Influencerin (gold theme) = 2 special tiers.
    const gold = crewSpecialBonuses({ influencer: 4 });
    expect(gold.goldMult).toBeCloseTo(1 + 2 * SPECIAL_GOLD, 9);
    // Türsteher (boss) + Choreograph (crit) + Booty-Boss (critdmg) mix cleanly.
    const mix = crewSpecialBonuses({ bouncer: 2, choreo: 2, boss: 6 });
    expect(mix.bossMult).toBeCloseTo(1 + SPECIAL_BOSS, 9);
    expect(mix.critChance).toBeCloseTo(SPECIAL_CRIT_CHANCE, 9);
    expect(mix.critDmg).toBeCloseTo(3 * SPECIAL_CRIT_DMG, 9);
    // Window caps: a silly-deep combo/beat stack clamps at the cap.
    const deep = crewSpecialBonuses({ hype: 200, dj: 200 });
    expect(deep.comboWindowS).toBe(SPECIAL_COMBO_CAP_S);
    expect(deep.beatWindowMs).toBe(SPECIAL_BEAT_CAP_MS);
  });

  it('ability price = level-cost at the unlock level × ABILITY_COST_MULT', () => {
    expect(abilityCost(hype, 1)).toBe(
      Math.floor(hype.baseCost * Math.pow(HERO_COST_GROWTH, 25) * ABILITY_COST_MULT),
    );
    expect(abilityCost(hype, 2)).toBe(
      Math.floor(hype.baseCost * Math.pow(HERO_COST_GROWTH, 75) * ABILITY_COST_MULT),
    );
  });

  it('nextAbility reports the next tier in order with its gate', () => {
    expect(nextAbility(hype, 24, 0).unlocked).toBe(false);
    expect(nextAbility(hype, 25, 0)).toMatchObject({ tier: 1, level: 25, unlocked: true });
    expect(nextAbility(hype, 25, 1)).toMatchObject({ tier: 2, level: 75, unlocked: false });
    expect(nextAbility(hype, 80, 1)).toMatchObject({ tier: 2, level: 75, unlocked: true });
  });

  it('gilds stack multiplicatively on top of bought abilities', () => {
    expect(heroDps(hype, 10, 2, 1)).toBeCloseTo(hype.baseDps * DPS_TUNE * 10 * 2 * 1.25 ** 2, 6);
  });
});

describe('heroes — costs', () => {
  it('the first level costs baseCost, then grows by the growth rate', () => {
    expect(nextLevelCost(boss, 0)).toBe(5);
    expect(nextLevelCost(boss, 1)).toBe(Math.floor(5 * HERO_COST_GROWTH));
  });

  it('bulk cost equals the sum of the individual level costs', () => {
    let manual = 0;
    for (let l = 0; l < 10; l++) manual += boss.baseCost * Math.pow(HERO_COST_GROWTH, l);
    expect(bulkCost(boss, 0, 10)).toBe(Math.floor(manual));
    expect(bulkCost(boss, 3, 0)).toBe(0);
  });

  it('maxAffordable never over-spends and is consistent with bulkCost', () => {
    const gold = 1000;
    const n = maxAffordable(boss, 0, gold);
    expect(bulkCost(boss, 0, n)).toBeLessThanOrEqual(gold);
    expect(bulkCost(boss, 0, n + 1)).toBeGreaterThan(gold);
    expect(maxAffordable(boss, 0, 1)).toBe(0); // baseCost is 5
  });

  // The M9 crew tiers (large baseCost) must keep the closed-form bulk/max math
  // exact against an iterative sum (spec §4.3.3 / M9-AC2).
  it('bulkCost + maxAffordable stay exact for the endless tiers', () => {
    const newTiers = CREW.slice(10); // viral … cosmic
    expect(newTiers.length).toBe(5);
    for (const cfg of newTiers) {
      const from = 7;
      let manual = 0;
      for (let l = from; l < from + 12; l++) manual += cfg.baseCost * Math.pow(HERO_COST_GROWTH, l);
      expect(bulkCost(cfg, from, 12)).toBe(Math.floor(manual));

      const gold = cfg.baseCost * 5000;
      const n = maxAffordable(cfg, from, gold);
      expect(bulkCost(cfg, from, n)).toBeLessThanOrEqual(gold);
      expect(bulkCost(cfg, from, n + 1)).toBeGreaterThan(gold);
    }
  });
});

describe('heroes — click damage', () => {
  it('is at least the flat floor with no crew', () => {
    expect(clickDamageRaw(createCrew())).toBe(CLICK_BASE);
  });

  it('upgrade 1 IS click damage: the Boss line lands 1:1 in the shake', () => {
    const levels = { boss: 20 };
    expect(clickDamageRaw(levels)).toBeCloseTo(CLICK_BASE + heroClick(boss, 20), 6);
  });

  it('DPS members feed the click via the share — active play keeps scaling (P1)', () => {
    const levels = { boss: 10, hype: 30 };
    const expected = CLICK_BASE + heroClick(boss, 10) + CLICK_DPS_SHARE * totalRawDps(levels);
    expect(clickDamageRaw(levels)).toBeCloseTo(expected, 6);
    expect(clickDamageRaw(levels)).toBeGreaterThan(clickDamageRaw({ boss: 10 }));
  });

  it('bought Boss abilities double the click line (not the DPS share)', () => {
    const noUp = clickDamageRaw({ boss: 40 }, {}, {});
    const withUp = clickDamageRaw({ boss: 40 }, {}, { boss: 1 });
    expect(withUp - CLICK_BASE).toBeCloseTo((noUp - CLICK_BASE) * 2, 6);
  });
});
