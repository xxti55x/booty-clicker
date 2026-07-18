import { describe, expect, it } from 'vitest';

import {
  ABILITY_COST_MULT,
  DPS_TUNE,
  abilityCost,
  abilityLevel,
  abilityMult,
  abilityTiersUnlocked,
  bulkCost,
  CLICK_BASE,
  CLICK_DPS_SHARE,
  clickDamageRaw,
  CREW,
  createCrew,
  heroClick,
  heroDps,
  HERO_COST_GROWTH,
  maxAffordable,
  nextAbility,
  nextLevelCost,
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

  it('each BOUGHT ability adds +100 % base output (mult = 1 + n), levels alone add nothing', () => {
    expect(abilityMult(0)).toBe(1);
    expect(abilityMult(1)).toBe(2);
    expect(abilityMult(3)).toBe(4);
    // A Lv-100 member with nothing bought has NO milestone multiplier any more
    // (DPS_TUNE is the flat idle retune, not level-derived).
    expect(heroDps(hype, 100, 0, 0)).toBe(hype.baseDps * DPS_TUNE * 100);
    expect(heroDps(hype, 100, 0, 2)).toBe(hype.baseDps * DPS_TUNE * 100 * 3);
    expect(heroClick(boss, 100, 0, 2)).toBe(boss.baseDps * 100 * 3);
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
