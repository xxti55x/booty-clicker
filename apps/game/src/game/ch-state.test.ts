import { describe, expect, it } from 'vitest';

import { createAbility } from './ability';
import { soulsForMaxZone } from './ascension';
import {
  ascendState,
  clickDamageOf,
  createChState,
  createComboSave,
  dpsOf,
  himmelfahrtState,
} from './ch-state';
import { createAncients } from './ancients';
import { createHeaven } from './heaven';
import { clickDamageRaw, totalRawDps } from './heroes';

describe('ch-state', () => {
  it('fresh state starts at zone 1 with nothing', () => {
    const s = createChState();
    expect(s.zone).toBe(1);
    expect(s.gold).toBe(0);
    expect(s.souls).toBe(0);
    expect(s.rsLifetime).toBe(0);
    expect(dpsOf(s)).toBe(0);
    expect(clickDamageOf(s)).toBe(clickDamageRaw({}));
    expect(s.ability).toEqual(createAbility());
    expect(s.combo).toEqual(createComboSave());
    expect(s.ancients).toEqual(createAncients());
    expect(s.heaven).toEqual(createHeaven());
  });

  it('dps/click include the soul multiplier', () => {
    const s = { ...createChState(), crew: { boss: 20 }, souls: 10 }; // soulMult(10)=2
    expect(dpsOf(s)).toBeCloseTo(totalRawDps({ boss: 20 }) * 2, 6);
    expect(clickDamageOf(s)).toBeCloseTo(clickDamageRaw({ boss: 20 }) * 2, 6);
  });

  it('Ancient DPS/click mults + HPF amplifier fold into the derived numbers', () => {
    const s = {
      ...createChState(),
      crew: { boss: 20 },
      souls: 10,
      ancients: { poposeidon: 2, twerkules: 4 }, // +30 % DPS, +20 % click
      heaven: { ...createHeaven(), hpf: 5 }, // +10 % global, soul bonus 0.11
    };
    const soulM = 1 + (0.1 + 0.002 * 5) * 10; // 1 + 0.11·10 = 2.1
    const global = 1 + 0.02 * 5; // 1.1
    expect(dpsOf(s)).toBeCloseTo(totalRawDps({ boss: 20 }) * soulM * 1.3 * global, 6);
    expect(clickDamageOf(s)).toBeCloseTo(clickDamageRaw({ boss: 20 }) * soulM * 1.2 * global, 6);
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
    expect(after.rsLifetime).toBe(soulsForMaxZone(50));
    expect(after.lifetimeMaxZone).toBe(50);
    expect(after.zone).toBe(1);
    expect(after.gold).toBe(0);
    expect(after.crew).toEqual({});
    expect(after.totalClicks).toBe(123); // stat preserved
    // Run-scoped juice resets with the run.
    expect(after.ability).toEqual(createAbility());
    expect(after.combo).toEqual(createComboSave());
  });

  it('gilds + Ancients + heaven survive ascension; held souls carry over', () => {
    const s = {
      ...createChState(),
      zone: 40,
      runMaxZone: 40,
      crew: { boss: 30 },
      gilds: { boss: 2, legend: 1 },
      ancients: { twerkules: 3 },
      heaven: { hpf: 4, hpfLifetime: 4, ascensions2: 1, tree: { coach: 2 } },
      souls: 5, // held (spent some)
      rsLifetime: 5,
    };
    const after = ascendState(s);
    expect(after.gilds).toEqual({ boss: 2, legend: 1 }); // permanent, carried over
    expect(after.ancients).toEqual({ twerkules: 3 }); // Ancients survive L1 (§4.5)
    expect(after.heaven).toEqual(s.heaven); // L2 state survives L1
    expect(after.crew).toEqual({}); // run reset
    // Held 5 + gain (53 − rsLifetime 5) = 53 = earned total at zone 40.
    expect(after.souls).toBe(soulsForMaxZone(40));
    expect(after.rsLifetime).toBe(soulsForMaxZone(40));
  });

  // M10-AC2: Himmelfahrt reset scope EXACT. RS (souls + rsLifetime) and Ancients
  // fall; gilds, HPF and the Himmelsbaum survive; the tour resets fresh.
  it('AC2: Himmelfahrt banks HPF and resets exactly the right scope', () => {
    const s = {
      ...createChState(),
      zone: 60,
      killsThisZone: 4,
      runMaxZone: 80,
      lifetimeMaxZone: 80,
      gold: 12345,
      crew: { boss: 40, legend: 3 },
      souls: 900, // held
      rsLifetime: 1_000_000, // earned ⇒ HPF 31
      totalClicks: 5000,
      ancients: { twerkules: 10, poposeidon: 4 },
      gilds: { boss: 5, dj: 2 },
      heaven: { hpf: 2, hpfLifetime: 2, ascensions2: 1, tree: { coach: 1 } },
    };
    const after = himmelfahrtState(s);

    // RS + Ancients fall to fresh.
    expect(after.souls).toBe(0);
    expect(after.rsLifetime).toBe(0);
    expect(after.ancients).toEqual({});
    // The whole L1 tour resets.
    expect(after.gold).toBe(0);
    expect(after.crew).toEqual({});
    expect(after.zone).toBe(1);
    expect(after.killsThisZone).toBe(0);
    expect(after.runMaxZone).toBe(1);
    expect(after.lifetimeMaxZone).toBe(1);
    // Survivors: gilds, HPF (banked +31 gain on top of held 2), the Himmelsbaum,
    // and lifetime stats.
    expect(after.gilds).toEqual({ boss: 5, dj: 2 });
    expect(after.heaven.hpf).toBe(2 + (31 - 2)); // held 2 + gain (31 earned − 2 lifetime)
    expect(after.heaven.hpfLifetime).toBe(31);
    expect(after.heaven.ascensions2).toBe(2);
    expect(after.heaven.tree).toEqual({ coach: 1 });
    expect(after.totalClicks).toBe(5000);
  });
});
