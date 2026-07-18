import { describe, expect, it } from 'vitest';

import { createAbility } from './ability';
import { soulsForMaxZone } from './ascension';
import {
  RIVAL_CHEST_CHANCE,
  ascendState,
  bossFirstKillZones,
  chestLuck,
  clickDamageOf,
  createChState,
  createChests,
  createComboSave,
  createPeach,
  dpsOf,
  gearUnlockCtx,
  goldMult,
  himmelfahrtState,
  keyDropAmount,
  keyDropMult,
  peachIncomeMult,
  rivalChestChance,
  transcendState,
} from './ch-state';
import { createAncients } from './ancients';
import { createGear, skinUnlocked } from './gear';
import { createHeaven } from './heaven';
import { clickDamageRaw, totalRawDps } from './heroes';
import { PEACH_BOOST } from './peach';
import { TRANSCEND_GLOBAL_BASE, createTranscend } from './transcend';

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

    // Robo-Twerk lv 10 = +6 %/lvl crew-DPS ⇒ dpsGearMult ×1.6; click unaffected.
    const robo = {
      ...base,
      gear: { ...createGear(), skin: 'robo' as const, skinLevels: { robo: 10 } },
    };
    expect(dpsOf(robo)).toBeCloseTo(totalRawDps({ boss: 20 }) * 1.6, 6);
    expect(clickDamageOf(robo)).toBeCloseTo(clickDamageRaw({ boss: 20 }), 6);

    // Classic lv 10 + 2⭐ = 0.8 + 0.2 = +100 % click ⇒ clickGearMult ×2; DPS unaffected.
    const classic = {
      ...base,
      gear: { ...createGear(), skinLevels: { classic: 10 }, skinStars: { classic: 2 } },
    };
    expect(clickDamageOf(classic)).toBeCloseTo(clickDamageRaw({ boss: 20 }) * 2, 6);
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
    // Permanent meta — survives ascension; the deepest-zone latch lifts to 60.
    expect(asc.gear).toEqual({ ...gear, zoneEver: 60 });
    expect(asc.legacyTyrann).toBe(true);
    const hf = himmelfahrtState(s);
    expect(hf.gear).toEqual({ ...gear, zoneEver: 60 }); // survives Himmelfahrt too
    expect(hf.legacyTyrann).toBe(true);
  });

  // §5.3: skin unlocks are ONE-WAY acquisitions („Bühne 15 erreicht", „Erst-Kill").
  // A Himmelfahrt resets lifetimeMaxZone to 1 (RS accounting, §4.5.2) but must
  // never re-lock a skin — the gear.zoneEver latch keeps the unlock context deep.
  it('zone/boss skin unlocks survive a Himmelfahrt (zoneEver latch)', () => {
    const s = {
      ...createChState(),
      zone: 60,
      runMaxZone: 60,
      lifetimeMaxZone: 60,
      rsLifetime: 1_000_000,
    };
    const before = gearUnlockCtx(s);
    expect(skinUnlocked('robo', before)).toBe(true);
    expect(skinUnlocked('host', before)).toBe(true);
    expect(skinUnlocked('boss', before)).toBe(true); // boss@10 first-killed
    expect(skinUnlocked('lava', before)).toBe(true); // boss@50 first-killed

    const hf = himmelfahrtState(s);
    expect(hf.lifetimeMaxZone).toBe(1); // the RS accounting reset stands (M10-AC2)
    expect(hf.gear.zoneEver).toBe(60); // …but the unlock latch survives
    const after = gearUnlockCtx(hf);
    expect(skinUnlocked('robo', after)).toBe(true);
    expect(skinUnlocked('host', after)).toBe(true);
    expect(skinUnlocked('boss', after)).toBe(true);
    expect(skinUnlocked('lava', after)).toBe(true);
    expect(skinUnlocked('gyrator', after)).toBe(true); // 1 Himmelfahrt banked
    expect(skinUnlocked('diamond', after)).toBe(false); // still Transzendenz-locked
  });
});

// M12 (§6): the loot economy folds into the ch-state derived layer — permanent
// tokens into crit/gold/dps, Truhen-Luck + key-drop sources, and the loot meta
// slices survive both resets.
describe('ch-state — loot threading (§6)', () => {
  it('fresh state seeds empty loot / token / peach slices', () => {
    const s = createChState();
    expect(s.chests).toEqual(createChests());
    expect(s.permTokens).toEqual({});
    expect(s.peach).toEqual(createPeach());
    expect(s.chests.inventory).toEqual({ wood: 0, gold: 0, diamond: 0, mythic: 0 });
  });

  it('permanent dps-tokens fold into dpsOf (empty ⇒ ×1, so old callers unaffected)', () => {
    const base = { ...createChState(), crew: { boss: 20 } };
    expect(dpsOf(base)).toBeCloseTo(totalRawDps({ boss: 20 }), 6); // empty tokens ⇒ ×1
    const withTokens = { ...base, permTokens: { dpsPct: 10 } }; // +1 %·10 = ×1.1
    expect(dpsOf(withTokens)).toBeCloseTo(totalRawDps({ boss: 20 }) * 1.1, 6);
  });

  it('goldMult multiplies Peachiel × gold-gear × permanent gold-tokens (no peach boost)', () => {
    const s = { ...createChState(), ancients: { peachiel: 2 }, permTokens: { goldPct: 5 } };
    // (1 + 0.10·2) × 1 (classic gear) × (1 + 0.01·5) = 1.2 × 1.05.
    expect(goldMult(s)).toBeCloseTo(1.2 * 1.05, 6);
    expect(goldMult(createChState())).toBe(1); // neutral by default
  });

  it('chestLuck sums gear chest-luck + Truhilda (fed to openChest as ctx.luck)', () => {
    expect(chestLuck(createChState())).toBe(0); // classic gear, no Truhilda
    const s = { ...createChState(), ancients: { truhilda: 3 } }; // +2 %·3 = 0.06
    expect(chestLuck(s)).toBeCloseTo(0.06, 6);
  });

  it('keyDropMult adds the Truhen-Magnet node (+25 %) — raises key drops', () => {
    expect(keyDropMult(createChState())).toBe(1);
    const magnet = { ...createChState(), heaven: { ...createHeaven(), tree: { truhenmagnet: 1 } } };
    expect(keyDropMult(magnet)).toBeCloseTo(1.25, 6);
    expect(keyDropMult(magnet)).toBeGreaterThan(keyDropMult(createChState()));
  });

  it('rivalChestChance is the 3 % base scaled by Truhen-Luck (monotone)', () => {
    expect(rivalChestChance(0)).toBeCloseTo(RIVAL_CHEST_CHANCE, 6);
    expect(rivalChestChance(1)).toBeCloseTo(RIVAL_CHEST_CHANCE * 2, 6);
    expect(rivalChestChance(0.5)).toBeGreaterThan(rivalChestChance(0));
  });

  it('keyDropAmount guarantees the whole part and rolls the fractional bonus key', () => {
    expect(keyDropAmount(1, 1, 0.5)).toBe(1); // no fractional part ⇒ always 1
    expect(keyDropAmount(1, 1.25, 0.1)).toBe(2); // 0.1 < 0.25 ⇒ bonus key
    expect(keyDropAmount(1, 1.25, 0.9)).toBe(1); // 0.9 ≥ 0.25 ⇒ no bonus
    expect(keyDropAmount(2, 1, 0.99)).toBe(2); // base ≥ 1 always guaranteed
  });

  it('peachIncomeMult is ×3 while a caught boost is live, else ×1', () => {
    const now = 1_000_000;
    const active = { ...createChState(), peach: { nextPeachAt: 0, boostUntil: now + 30_000 } };
    expect(peachIncomeMult(active, now)).toBe(PEACH_BOOST); // ×3
    expect(peachIncomeMult(active, now + 40_000)).toBe(1); // expired
    expect(peachIncomeMult(createChState(), now)).toBe(1);
  });

  it('loot meta (chests/tokens/peach) survive ascension and Himmelfahrt', () => {
    const s = {
      ...createChState(),
      zone: 60,
      runMaxZone: 60,
      lifetimeMaxZone: 60,
      rsLifetime: 1_000_000,
      chests: {
        keys: 7,
        inventory: { wood: 2, gold: 1, diamond: 0, mythic: 0 },
        pity: { wood: 0, gold: 5, diamond: 1, mythic: 0 },
        skins: ['gold-royal'],
      },
      permTokens: { critDmg: 4, goldPct: 2 },
      peach: { nextPeachAt: 5_000, boostUntil: 9_000 },
    };
    const asc = ascendState(s);
    expect(asc.chests).toEqual(s.chests);
    expect(asc.permTokens).toEqual(s.permTokens);
    expect(asc.peach).toEqual(s.peach);
    const hf = himmelfahrtState(s);
    expect(hf.chests).toEqual(s.chests);
    expect(hf.permTokens).toEqual(s.permTokens);
    expect(hf.peach).toEqual(s.peach);
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

  it('threads the gear craft latch into `crafted` (Neon-Ninja/Pfirsich-Pirat)', () => {
    const base = { lifetimeMaxZone: 8, legacyTyrann: false, heaven: createHeaven() };
    // No gear ⇒ empty crafted set (older call sites) ⇒ craft skins stay locked.
    expect(skinUnlocked('neon', gearUnlockCtx(base))).toBe(false);
    // A gear slice with a craft latch unlocks exactly the crafted skin.
    const withCraft = gearUnlockCtx({
      ...base,
      gear: { ...createGear(), crafted: ['neon'] },
    });
    expect(skinUnlocked('neon', withCraft)).toBe(true);
    expect(skinUnlocked('pirate', withCraft)).toBe(false); // only neon was crafted
  });
});

// M15 (§4.5.3): the Transzendenz layer folds into the ch-state derived power and the
// L3 reset glue. The ×3^TE global mult is P1-neutral (hits click and idle identically),
// and `transcendState` resets all of L1 AND L2 while preserving every „nie"-reset meta.
describe('ch-state — Transzendenz threading (§4.5.3)', () => {
  it('fresh state seeds an empty transcend slice (×1 global mult, no power change)', () => {
    const s = createChState();
    expect(s.transcend).toEqual(createTranscend());
    // Empty slice ⇒ ×1: a fresh state's derived numbers are the raw crew values.
    const base = { ...createChState(), crew: { boss: 20 } };
    expect(dpsOf(base)).toBeCloseTo(totalRawDps({ boss: 20 }), 6);
    expect(clickDamageOf(base)).toBeCloseTo(clickDamageRaw({ boss: 20 }), 6);
  });

  // The M14 F10c acceptance: the REAL derived pipeline (not the isolated formula) must
  // scale click AND idle by exactly 3^TE and leave their ratio invariant — the proof
  // idle can never out-scale active clicking through TE (P1 „aktiv bleibt König").
  it('P1-neutrality: TE scales clickDamageOf AND dpsOf by exactly 3^3, ratio invariant', () => {
    // A state with both idle (crew DPS) and click contributions, plus soul/Ancient/HPF
    // folds, so the ratio is finite, non-trivial and genuinely at risk if TE were biased.
    const base = {
      ...createChState(),
      crew: { boss: 30, hype: 10 }, // hype: DPS line (boss is click-only, v10)
      souls: 8,
      ancients: { twerkules: 3, poposeidon: 2 },
      heaven: { ...createHeaven(), hpf: 4 },
    };
    const te0 = { ...base, transcend: createTranscend() }; // te 0 ⇒ ×1
    const te3 = {
      ...base,
      transcend: { ...createTranscend(), te: 3, teLifetime: 3, transcendences: 1 },
    };
    const factor = TRANSCEND_GLOBAL_BASE ** 3; // 27

    // Sanity: both channels are non-zero so the ratio assertion below is meaningful.
    expect(dpsOf(te0)).toBeGreaterThan(0);
    expect(clickDamageOf(te0)).toBeGreaterThan(0);
    // BOTH click and idle scaled by exactly 3^3 — the same global scalar on each.
    expect(clickDamageOf(te3)).toBeCloseTo(clickDamageOf(te0) * factor, 6);
    expect(dpsOf(te3)).toBeCloseTo(dpsOf(te0) * factor, 6);
    // ⇒ the click:idle ratio is invariant: TE never lets idle out-scale click (P1).
    expect(clickDamageOf(te3) / dpsOf(te3)).toBeCloseTo(clickDamageOf(te0) / dpsOf(te0), 9);
  });

  // The L3 reset glue mirrors `himmelfahrtState` but ALSO wipes L2 (heaven fresh) and
  // preserves the banked Transzendenz slice. Gate metric = lifetime HPF.
  it('transcendState banks TE (from lifetime HPF), resets L1+L2, preserves meta', () => {
    const s = {
      ...createChState(),
      zone: 60,
      killsThisZone: 4,
      runMaxZone: 80,
      lifetimeMaxZone: 80,
      gold: 12345,
      crew: { boss: 40, legend: 3 },
      souls: 900,
      rsLifetime: 1_000_000,
      totalClicks: 5000,
      ancients: { twerkules: 10, poposeidon: 4 },
      gilds: { boss: 5, dj: 2 },
      // Held HPF is low (5) but the LIFETIME highwater is 1 000 ⇒ ⌊log10⌋ = 3 TE.
      heaven: { hpf: 5, hpfLifetime: 1_000, ascensions2: 20, tree: { coach: 4 } },
      gear: { ...createGear(), skin: 'boss' as const, skinLevels: { boss: 20 } },
      chests: {
        keys: 7,
        inventory: { wood: 2, gold: 1, diamond: 0, mythic: 0 },
        pity: { wood: 0, gold: 5, diamond: 1, mythic: 0 },
        skins: ['gold-royal'],
      },
      permTokens: { critDmg: 4 },
      peach: { nextPeachAt: 5_000, boostUntil: 9_000 },
      achievements: ['zone-10'],
    };
    const after = transcendState(s);

    // Banked TE from the LIFETIME HPF total (1 000 ⇒ 3), not held HPF (5 ⇒ would be 0).
    expect(after.transcend.te).toBe(3);
    expect(after.transcend.teLifetime).toBe(3);
    expect(after.transcend.transcendences).toBe(1);

    // All of L1 resets to a fresh tour.
    expect(after.gold).toBe(0);
    expect(after.crew).toEqual({});
    expect(after.zone).toBe(1);
    expect(after.killsThisZone).toBe(0);
    expect(after.runMaxZone).toBe(1);
    expect(after.lifetimeMaxZone).toBe(1);
    expect(after.souls).toBe(0);
    expect(after.rsLifetime).toBe(0);
    expect(after.ancients).toEqual({});
    // All of L2 resets too — heaven (HPF + Himmelsbaum) is fresh.
    expect(after.heaven).toEqual(createHeaven());

    // Survivors: gilds, gear (+ zoneEver latch), loot, retention meta, lifetime stats.
    expect(after.gilds).toEqual({ boss: 5, dj: 2 });
    expect(after.totalClicks).toBe(5000);
    expect(after.gear.skin).toBe('boss');
    expect(after.gear.skinLevels).toEqual({ boss: 20 });
    expect(after.gear.zoneEver).toBe(80); // latched before lifetimeMaxZone fell to 1
    expect(after.chests).toEqual(s.chests);
    expect(after.permTokens).toEqual(s.permTokens);
    expect(after.peach).toEqual(s.peach);
    expect(after.achievements).toEqual(['zone-10']);

    // ⇒ Diamant-Booty unlocks now that a Transzendenz is banked (§5.3).
    expect(skinUnlocked('diamond', gearUnlockCtx(after))).toBe(true);
  });

  it('a prior transcend slice survives; only NEW TE beyond the highwater is banked', () => {
    const s = {
      ...createChState(),
      heaven: { hpf: 2, hpfLifetime: 10_000, ascensions2: 5, tree: {} }, // ⌊log10⌋ = 4
      // Already transcended once (te 3), then spent 1 on a Mythos node (held 2).
      transcend: { te: 2, teLifetime: 3, transcendences: 1, mythos: { someNode: 1 } },
    };
    const after = transcendState(s);
    // Earned highwater lifts 3 → 4 (gain 1); held 2 + 1 = 3; spending stays spent.
    expect(after.transcend.teLifetime).toBe(4);
    expect(after.transcend.te).toBe(3);
    expect(after.transcend.transcendences).toBe(2);
    expect(after.transcend.mythos).toEqual({ someNode: 1 }); // ledger preserved
    // Safe at 0 gain: a second call at the SAME lifetime HPF banks no TE, just resets.
    const again = transcendState(after);
    expect(again.transcend.te).toBe(3);
    expect(again.transcend.teLifetime).toBe(4);
    expect(again.transcend.transcendences).toBe(3);
  });

  // Regression (P0): the held TE slice MUST survive a plain L1 ascension AND an L2
  // Himmelfahrt — nothing above L2 resets it (§4.5.3). Without carrying `transcend`
  // forward, `createChState()`'s zeroed seed would wipe held TE / teLifetime /
  // transcendences / mythos on the very next reset — killing the ×3^TE boost, the 🔮
  // HUD badge and re-locking Diamant-Booty.
  it('held TE survives ascension and Himmelfahrt (L3 never resets below §4.5.3)', () => {
    const slice = { te: 2, teLifetime: 3, transcendences: 1, mythos: { someNode: 1 } };
    const s = {
      ...createChState(),
      zone: 60,
      runMaxZone: 60,
      lifetimeMaxZone: 60,
      rsLifetime: 1_000_000,
      transcend: slice,
    };
    // A plain L1 ascension preserves the banked L3 slice untouched.
    expect(ascendState(s).transcend).toEqual(slice);
    // An L2 Himmelfahrt (which wipes L1 + L2) still preserves the L3 slice.
    const hf = himmelfahrtState(s);
    expect(hf.transcend).toEqual(slice);
    // ⇒ Diamant-Booty stays unlocked after a Himmelfahrt (transcendences carried over).
    expect(skinUnlocked('diamond', gearUnlockCtx(hf))).toBe(true);
    // And the ×3^TE global mult survives: with the same crew, the post-Himmelfahrt
    // DPS carries the surviving te=2 factor (×9). Compared against the same state with
    // a wiped slice, the ratio is exactly 3^2 — isolating the TE factor from the
    // (banked-HPF) heaven mult, which a wiped `transcend` would collapse to ×1.
    const hfCrew = { ...hf, crew: { boss: 20, hype: 8 } }; // hype: DPS line (v10)
    const hfNoTE = { ...hfCrew, transcend: createTranscend() };
    expect(dpsOf(hfNoTE)).toBeGreaterThan(0);
    expect(dpsOf(hfCrew)).toBeCloseTo(dpsOf(hfNoTE) * TRANSCEND_GLOBAL_BASE ** 2, 6);
    // The existing `transcendState` preserve behaviour is unchanged: it also carries it.
    expect(transcendState(s).transcend.transcendences).toBe(2); // banked once more here
  });
});
