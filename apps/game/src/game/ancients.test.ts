import { describe, expect, it } from 'vitest';

import { soulMult } from './ascension';
import {
  ANCIENTS,
  ancientAtCap,
  ancientBonus,
  ancientClickMult,
  ancientCost,
  ancientCritChanceBonus,
  ancientDpsMult,
  ancientLevel,
  ancientTotalCost,
  buyAncient,
  canBuyAncient,
  createAncients,
} from './ancients';

describe('ancients — config & cost', () => {
  it('has the 10 spec ancients with the documented caps (§4.6)', () => {
    expect(ANCIENTS).toHaveLength(10);
    const capById = Object.fromEntries(ANCIENTS.map((a) => [a.id, a.cap]));
    expect(capById.twerkules).toBeNull();
    expect(capById.poposeidon).toBeNull();
    expect(capById.glutaeus).toBeNull();
    expect(capById.peachiel).toBeNull();
    expect(capById.cheeksana).toBe(40);
    expect(capById.chronilla).toBe(15);
    expect(capById.wackelias).toBe(10);
    expect(capById.beatrix).toBe(8);
    expect(capById.truhilda).toBe(15);
    expect(capById.ekstasius).toBe(10);
  });

  it('cost to reach the next level is level+1; totals are triangular', () => {
    expect(ancientCost(0)).toBe(1);
    expect(ancientCost(4)).toBe(5);
    expect(ancientTotalCost(0)).toBe(0);
    expect(ancientTotalCost(1)).toBe(1);
    expect(ancientTotalCost(5)).toBe(15); // 1+2+3+4+5
    // Total cost is the running sum of per-level costs.
    let sum = 0;
    for (let lv = 0; lv < 20; lv++) {
      expect(ancientTotalCost(lv)).toBe(sum);
      sum += ancientCost(lv);
    }
  });

  it('ancientBonus scales linearly and respects the cap', () => {
    expect(ancientBonus('twerkules', 3)).toBeCloseTo(0.15, 6); // 3 × 5 %
    // Cheeksana caps at level 40 (+0.5 %/lv ⇒ +20 % max).
    expect(ancientBonus('cheeksana', 40)).toBeCloseTo(0.2, 6);
    expect(ancientBonus('cheeksana', 999)).toBeCloseTo(0.2, 6); // clamped
    expect(ancientBonus('unknown', 5)).toBe(0);
  });
});

describe('ancients — buying (guarded by souls + cap)', () => {
  it('spends held souls and raises the level', () => {
    const r0 = buyAncient(createAncients(), 10, 'twerkules'); // cost 1
    expect(r0.bought).toBe(true);
    expect(r0.souls).toBe(9);
    expect(ancientLevel(r0.ancients, 'twerkules')).toBe(1);
    const r1 = buyAncient(r0.ancients, r0.souls, 'twerkules'); // cost 2
    expect(r1.souls).toBe(7);
    expect(ancientLevel(r1.ancients, 'twerkules')).toBe(2);
  });

  it('rejects an unaffordable purchase (no state change)', () => {
    const a = { twerkules: 5 }; // next level costs 6
    const r = buyAncient(a, 3, 'twerkules');
    expect(r.bought).toBe(false);
    expect(r.ancients).toBe(a);
    expect(r.souls).toBe(3);
  });

  it('rejects buying past a cap (clamped)', () => {
    const atCap = { beatrix: 8 }; // cap 8
    expect(ancientAtCap('beatrix', 8)).toBe(true);
    expect(canBuyAncient(atCap, 1e9, 'beatrix')).toBe(false);
    const r = buyAncient(atCap, 1e9, 'beatrix');
    expect(r.bought).toBe(false);
    expect(ancientLevel(r.ancients, 'beatrix')).toBe(8);
  });
});

// M10-AC1: buying an Ancient LOWERS soulMult (spends held souls) yet RAISES its
// perk — the classic CH trade-off (raw multiplier for a specialised perk).
describe('ancients — AC1 balance: spend souls, gain perk', () => {
  it('a Twerkules purchase drops soulMult but lifts the click multiplier', () => {
    const soulsBefore = 20;
    const a0 = createAncients();
    const r = buyAncient(a0, soulsBefore, 'twerkules'); // cost 1
    expect(r.bought).toBe(true);

    // soulMult falls because held souls dropped 20 → 19.
    expect(soulMult(r.souls)).toBeLessThan(soulMult(soulsBefore));
    // …but Twerkules' click multiplier rose 1.0 → 1.05.
    expect(ancientClickMult(r.ancients)).toBeGreaterThan(ancientClickMult(a0));
    expect(ancientClickMult(r.ancients)).toBeCloseTo(1.05, 6);
  });

  it('Poposeidon lifts crew-DPS, Cheeksana lifts crit-chance', () => {
    const dps = buyAncient(createAncients(), 100, 'poposeidon');
    expect(ancientDpsMult(dps.ancients)).toBeCloseTo(1.15, 6);
    const crit = buyAncient(createAncients(), 100, 'cheeksana');
    expect(ancientCritChanceBonus(crit.ancients)).toBeCloseTo(0.005, 6);
  });
});
