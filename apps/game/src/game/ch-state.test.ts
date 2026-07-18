import { describe, expect, it } from 'vitest';

import { createAbility } from './ability';
import { soulsForMaxZone } from './ascension';
import {
  ascendState,
  bossFirstKillZones,
  clickDamageOf,
  createChState,
  createComboSave,
  dpsOf,
  gearUnlockCtx,
  himmelfahrtState,
} from './ch-state';
import { createAncients } from './ancients';
import { createGear, skinUnlocked } from './gear';
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

  // M11-AC1: equipping a non-default skin/level/star folds deterministically into
  // the derived DPS/click numbers (backs the equip-changes-numbers acceptance).
  it('gear folds into dpsOf / clickDamageOf (§5 threading)', () => {
    const base = { ...createChState(), crew: { boss: 20 } };
    // Default classic/club gear is the empty (×1) bonus — numbers unchanged.
    expect(dpsOf(base)).toBeCloseTo(totalRawDps({ boss: 20 }), 6);
    expect(clickDamageOf(base)).toBeCloseTo(clickDamageRaw({ boss: 20 }), 6);

    // Robo-Twerk lv 10 = +8 %/lvl crew-DPS ⇒ dpsGearMult ×1.8; click unaffected.
    const robo = {
      ...base,
      gear: { ...createGear(), skin: 'robo' as const, skinLevels: { robo: 10 } },
    };
    expect(dpsOf(robo)).toBeCloseTo(totalRawDps({ boss: 20 }) * 1.8, 6);
    expect(clickDamageOf(robo)).toBeCloseTo(clickDamageRaw({ boss: 20 }), 6);

    // Classic lv 10 + 2⭐ = 0.4 + 0.2 = +60 % click ⇒ clickGearMult ×1.6; DPS unaffected.
    const classic = {
      ...base,
      gear: { ...createGear(), skinLevels: { classic: 10 }, skinStars: { classic: 2 } },
    };
    expect(clickDamageOf(classic)).toBeCloseTo(clickDamageRaw({ boss: 20 }) * 1.6, 6);
    expect(dpsOf(classic)).toBeCloseTo(totalRawDps({ boss: 20 }), 6);
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

  it('gear (skins/levels/stars) + the legacy-Tyrann latch survive L1 and Himmelfahrt', () => {
    const gear = {
      ...createGear(),
      skin: 'boss' as const,
      skinLevels: { boss: 20 },
      skinStars: { boss: 3 },
      shards: 200,
      sugarPeaches: 5,
    };
    const s = {
      ...createChState(),
      zone: 60,
      runMaxZone: 60,
      lifetimeMaxZone: 60,
      rsLifetime: 1_000_000,
      gear,
      legacyTyrann: true,
    };
    const asc = ascendState(s);
    expect(asc.gear).toEqual(gear); // permanent meta — survives ascension
    expect(asc.legacyTyrann).toBe(true);
    const hf = himmelfahrtState(s);
    expect(hf.gear).toEqual(gear); // survives Himmelfahrt too
    expect(hf.legacyTyrann).toBe(true);
  });
});

describe('ch-state — gear unlock context (§5.3)', () => {
  it('derives boss-first-kills from lifetimeMaxZone (boss Z killed ⇔ zone > Z)', () => {
    // lifetimeMaxZone 11 ⇒ bosses 5 and 10 cleared (advanced past), not 15.
    expect(bossFirstKillZones({ lifetimeMaxZone: 11, legacyTyrann: false })).toEqual(
      new Set([5, 10]),
    );
    // Exactly at a boss zone is NOT yet a first-kill (need to advance past it).
    expect(bossFirstKillZones({ lifetimeMaxZone: 50, legacyTyrann: false })).not.toContain(50);
    expect(bossFirstKillZones({ lifetimeMaxZone: 51, legacyTyrann: false })).toContain(50);
  });

  it('unions the legacy-Tyrann latch as zone 10 even at a shallow CH zone', () => {
    const shallow = { lifetimeMaxZone: 1, legacyTyrann: true, heaven: createHeaven() };
    expect(bossFirstKillZones(shallow)).toEqual(new Set([10]));
    // ⇒ Tyrann unlocks; Lava (boss@50) stays locked.
    expect(skinUnlocked('boss', gearUnlockCtx(shallow))).toBe(true);
    expect(skinUnlocked('lava', gearUnlockCtx(shallow))).toBe(false);
  });

  it('maps Himmelfahrten and zone gates through gearUnlockCtx', () => {
    const ctx = gearUnlockCtx({
      lifetimeMaxZone: 25,
      legacyTyrann: false,
      heaven: { ...createHeaven(), ascensions2: 1 },
    });
    expect(ctx.lifetimeMaxZone).toBe(25);
    expect(ctx.himmelfahrten).toBe(1);
    expect(skinUnlocked('robo', ctx)).toBe(true); // zone ≥ 15
    expect(skinUnlocked('host', ctx)).toBe(true); // zone ≥ 25
    expect(skinUnlocked('gyrator', ctx)).toBe(true); // ≥ 1 Himmelfahrt
    expect(skinUnlocked('boss', ctx)).toBe(true); // boss@10 cleared (25 > 10)
    expect(skinUnlocked('lava', ctx)).toBe(false); // boss@50 not yet reached
    expect(skinUnlocked('diamond', ctx)).toBe(false); // Transzendenz-locked (M14)

    // A shallow, non-legacy run keeps the boss-kill skins locked.
    const shallow = gearUnlockCtx({
      lifetimeMaxZone: 8,
      legacyTyrann: false,
      heaven: createHeaven(),
    });
    expect(skinUnlocked('boss', shallow)).toBe(false); // boss@10 not killed, no legacy claim
  });
});
