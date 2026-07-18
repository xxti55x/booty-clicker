import { describe, expect, it } from 'vitest';

import { createAbility } from './ability';
import { soulsForMaxZone } from './ascension';
import { ascendState, clickDamageOf, createChState, createComboSave, dpsOf } from './ch-state';
import { clickDamageRaw, totalRawDps } from './heroes';

describe('ch-state', () => {
  it('fresh state starts at zone 1 with nothing', () => {
    const s = createChState();
    expect(s.zone).toBe(1);
    expect(s.gold).toBe(0);
    expect(s.souls).toBe(0);
    expect(dpsOf(s)).toBe(0);
    expect(clickDamageOf(s)).toBe(clickDamageRaw({}));
    expect(s.ability).toEqual(createAbility());
    expect(s.combo).toEqual(createComboSave());
  });

  it('dps/click include the soul multiplier', () => {
    const s = { ...createChState(), crew: { boss: 20 }, souls: 10 }; // soulMult(10)=2
    expect(dpsOf(s)).toBeCloseTo(totalRawDps({ boss: 20 }) * 2, 6);
    expect(clickDamageOf(s)).toBeCloseTo(clickDamageRaw({ boss: 20 }) * 2, 6);
  });

  it('ascending banks souls, resets the run, keeps totals', () => {
    const s = {
      ...createChState(),
      zone: 40,
      runMaxZone: 50,
      crew: { boss: 30 },
      gold: 999,
      totalClicks: 123,
      ability: { charge: 80, frenzyUntil: 5000, cooldowns: {} },
      combo: { stacks: 60 },
    };
    const after = ascendState(s);
    expect(after.souls).toBe(soulsForMaxZone(50));
    expect(after.lifetimeMaxZone).toBe(50);
    expect(after.zone).toBe(1);
    expect(after.gold).toBe(0);
    expect(after.crew).toEqual({});
    expect(after.totalClicks).toBe(123); // stat preserved
    // Run-scoped juice resets with the run.
    expect(after.ability).toEqual(createAbility());
    expect(after.combo).toEqual(createComboSave());
  });

  it('gilds survive ascension; rsLifetime never shrinks (M9 §4.3.4/§4.5.2)', () => {
    const s = {
      ...createChState(),
      zone: 40,
      runMaxZone: 40,
      crew: { boss: 30 },
      gilds: { boss: 2, legend: 1 },
      souls: 5,
      rsLifetime: 5,
    };
    const after = ascendState(s);
    expect(after.gilds).toEqual({ boss: 2, legend: 1 }); // permanent, carried over
    expect(after.crew).toEqual({}); // run reset
    expect(after.souls).toBe(soulsForMaxZone(40)); // new bank
    expect(after.rsLifetime).toBeGreaterThanOrEqual(after.souls); // highwater
    expect(after.rsLifetime).toBeGreaterThanOrEqual(5); // never shrinks
  });
});
