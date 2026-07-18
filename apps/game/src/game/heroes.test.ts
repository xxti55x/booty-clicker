import { describe, expect, it } from 'vitest';

import {
  bulkCost,
  CLICK_BASE,
  CLICK_DPS_SHARE,
  clickDamageRaw,
  CREW,
  createCrew,
  heroDps,
  HERO_COST_GROWTH,
  maxAffordable,
  milestoneMult,
  nextLevelCost,
  nextMilestone,
  totalRawDps,
} from './heroes';

const cid = CREW[0]; // Booty-Boss: baseCost 5, baseDps 1

describe('heroes — DPS & milestones', () => {
  it('un-recruited members contribute nothing', () => {
    expect(heroDps(cid, 0)).toBe(0);
    expect(totalRawDps(createCrew())).toBe(0);
  });

  it('DPS is baseDps · level below the first milestone', () => {
    expect(heroDps(cid, 5)).toBe(5); // 1 · 5 · 1
    expect(heroDps(cid, 9)).toBe(9);
  });

  it('doubles at each milestone level', () => {
    expect(milestoneMult(9)).toBe(1);
    expect(milestoneMult(10)).toBe(2);
    expect(milestoneMult(25)).toBe(4);
    expect(milestoneMult(50)).toBe(8);
    expect(heroDps(cid, 10)).toBe(10 * 2); // 1·10·2
  });

  it('milestones are endless past 800 (each further doubling = another ×2)', () => {
    expect(milestoneMult(800)).toBe(2 ** 7); // 7 fixed thresholds
    expect(milestoneMult(1599)).toBe(2 ** 7); // still under 1600
    expect(milestoneMult(1600)).toBe(2 ** 8);
    expect(milestoneMult(3200)).toBe(2 ** 9);
    expect(milestoneMult(6400)).toBe(2 ** 10);
    expect(milestoneMult(12800)).toBe(2 ** 11);
  });

  it('sums DPS across the crew', () => {
    const levels = { boss: 10, hype: 4 };
    expect(totalRawDps(levels)).toBe(heroDps(CREW[0], 10) + heroDps(CREW[1], 4));
  });

  it('reports the next ×2 milestone bracket ("noch n Level bis ×2"), endless', () => {
    expect(nextMilestone(0)).toEqual({ next: 10, prev: 0, remaining: 10 });
    expect(nextMilestone(7)).toEqual({ next: 10, prev: 0, remaining: 3 });
    expect(nextMilestone(10)).toEqual({ next: 25, prev: 10, remaining: 15 });
    expect(nextMilestone(799)).toEqual({ next: 800, prev: 400, remaining: 1 });
    // Never null now — endless doublings past the last fixed milestone.
    expect(nextMilestone(800)).toEqual({ next: 1600, prev: 800, remaining: 800 });
    expect(nextMilestone(1600)).toEqual({ next: 3200, prev: 1600, remaining: 1600 });
    expect(nextMilestone(5000)).toEqual({ next: 6400, prev: 3200, remaining: 1400 });
  });
});

describe('heroes — costs', () => {
  it('the first level costs baseCost, then grows by the growth rate', () => {
    expect(nextLevelCost(cid, 0)).toBe(5);
    expect(nextLevelCost(cid, 1)).toBe(Math.floor(5 * HERO_COST_GROWTH));
  });

  it('bulk cost equals the sum of the individual level costs', () => {
    let manual = 0;
    for (let l = 0; l < 10; l++) manual += cid.baseCost * Math.pow(HERO_COST_GROWTH, l);
    expect(bulkCost(cid, 0, 10)).toBe(Math.floor(manual));
    expect(bulkCost(cid, 3, 0)).toBe(0);
  });

  it('maxAffordable never over-spends and is consistent with bulkCost', () => {
    const gold = 1000;
    const n = maxAffordable(cid, 0, gold);
    expect(bulkCost(cid, 0, n)).toBeLessThanOrEqual(gold);
    expect(bulkCost(cid, 0, n + 1)).toBeGreaterThan(gold);
    expect(maxAffordable(cid, 0, 1)).toBe(0); // baseCost is 5
  });

  // The new M9 crew tiers (large baseCost) must keep the closed-form bulk/max math
  // exact against an iterative sum (spec §4.3.3 / M9-AC2).
  it('bulkCost + maxAffordable stay exact for the new endless tiers', () => {
    const newTiers = CREW.slice(10); // viral … cosmic
    expect(newTiers.length).toBe(5);
    for (const cfg of newTiers) {
      const from = 7; // arbitrary owned level within the milestone range
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

  it('scales with a share of total crew DPS', () => {
    const levels = { boss: 20 };
    const dps = totalRawDps(levels);
    expect(clickDamageRaw(levels)).toBeCloseTo(CLICK_BASE + CLICK_DPS_SHARE * dps, 6);
    expect(clickDamageRaw(levels)).toBeGreaterThan(CLICK_BASE);
  });
});
