import { describe, expect, it } from 'vitest';

import {
  COMBO_BONUS_PER,
  clickGain,
  createUpgrades,
  deriveStats,
  passiveGain,
  stackMultipliers,
  upgradeCost,
  type UpgradeState,
} from './economy';

describe('upgradeCost — cost formula floor(base * gr^lv)', () => {
  it('returns the base cost at level 0', () => {
    expect(upgradeCost({ base: 15, gr: 1.15, lv: 0 })).toBe(15);
  });

  it('grows geometrically and floors like the prototype', () => {
    // 15 * 1.15^1 = 17.25 -> 17 ; 15 * 1.15^2 = 19.8375 -> 19
    expect(upgradeCost({ base: 15, gr: 1.15, lv: 1 })).toBe(17);
    expect(upgradeCost({ base: 15, gr: 1.15, lv: 2 })).toBe(19);
    // 2500 * 1.9^3 = 17147.5 -> 17147
    expect(upgradeCost({ base: 2500, gr: 1.9, lv: 3 })).toBe(17147);
  });

  it('defaults missing level to 0', () => {
    expect(upgradeCost({ base: 50, gr: 1.16 })).toBe(50);
  });
});

describe('clickGain — combo bonus (+5% per stack)', () => {
  it('with no combo the payout is perClick * mult', () => {
    expect(clickGain(1, 1, 0)).toBe(1);
    expect(clickGain(4, 2, 0)).toBe(8);
  });

  it('adds COMBO_BONUS_PER per combo point', () => {
    expect(COMBO_BONUS_PER).toBe(0.05);
    // 10 * 1 * (1 + 10*0.05) = 15
    expect(clickGain(10, 1, 10)).toBeCloseTo(15, 10);
    // 2 * 3 * (1 + 4*0.05) = 6 * 1.2 = 7.2
    expect(clickGain(2, 3, 4)).toBeCloseTo(7.2, 10);
  });

  it('passiveGain is perSec * mult * dt (combo-independent)', () => {
    expect(passiveGain(8, 1.25, 2)).toBeCloseTo(20, 10);
  });
});

describe('multiplier stacking (mult upgrades multiply, they do not add)', () => {
  it('stackMultipliers folds values multiplicatively from the base', () => {
    expect(stackMultipliers([])).toBe(1);
    // disco (1.25) then god (1.5) => 1.875
    expect(stackMultipliers([1.25, 1.5])).toBeCloseTo(1.875, 10);
    expect(stackMultipliers([1.25, 1.5], 2)).toBeCloseTo(3.75, 10);
  });

  it('deriveStats stacks two mult upgrades and sums click/sec upgrades', () => {
    const upgrades: UpgradeState[] = createUpgrades();
    const byId = (id: string): UpgradeState => {
      const u = upgrades.find((x) => x.id === id);
      if (!u) throw new Error(`missing upgrade ${id}`);
      return u;
    };
    byId('hips').lv = 3; // +1/click * 3 = +3
    byId('bass').lv = 1; // +3/click
    byId('auto').lv = 2; // +1/sec * 2 = +2
    byId('disco').lv = 1; // x1.25
    byId('god').lv = 1; // x1.5

    const stats = deriveStats(upgrades);
    expect(stats.perClick).toBe(1 + 3 + 3); // base 1 + hips + bass
    expect(stats.perSec).toBe(2);
    expect(stats.mult).toBeCloseTo(1.25 * 1.5, 10);
  });

  it('a mult upgrade at level N applies val^N', () => {
    const upgrades = createUpgrades();
    const god = upgrades.find((x) => x.id === 'god');
    if (!god) throw new Error('missing god upgrade');
    god.lv = 2;
    expect(deriveStats(upgrades).mult).toBeCloseTo(1.5 * 1.5, 10);
  });
});
