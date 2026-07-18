import { describe, expect, it } from 'vitest';

import { ABILITY_CHARGE_MAX, createAbility } from '../game/ability';
import { pendingSouls, soulsForMaxZone } from '../game/ascension';
import { type ChState, createChState, createComboSave, createStats } from '../game/ch-state';
import { createGear } from '../game/gear';
import { monsterHp } from '../game/combat';
import {
  CH_SAVE_KEY,
  type ChStorage,
  deserializeCh,
  exportCh,
  importCh,
  isChSave,
  loadCh,
  offlineGold,
  OFFLINE_CAP_S,
  OFFLINE_EFF,
  resetCh,
  saveCh,
  serializeCh,
  visibilityGrant,
} from './ch-store';

function memStorage(): ChStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('ch-store — round-trip', () => {
  it('saves and loads a state, repairing invariants', () => {
    const store = memStorage();
    const s = {
      ...createChState(),
      zone: 12,
      runMaxZone: 12,
      crew: { boss: 5 },
      gold: 500,
      souls: 3,
    };
    saveCh(s, 1_000_000, store);
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    expect(loaded!.state.zone).toBe(12);
    expect(loaded!.state.gold).toBe(500);
    expect(loaded!.state.crew).toEqual({ boss: 5 });
    expect(loaded!.lastSeen).toBe(1_000_000);
  });

  it('returns null for missing / corrupt / wrong-version data', () => {
    const store = memStorage();
    expect(loadCh(store)).toBeNull();
    store.setItem(CH_SAVE_KEY, '{not json');
    expect(loadCh(store)).toBeNull();
    store.setItem(CH_SAVE_KEY, JSON.stringify({ v: 99, gold: 0 }));
    expect(loadCh(store)).toBeNull();
    expect(() => loadCh(store)).not.toThrow();
  });

  it('rejects bad fields without throwing', () => {
    const good = JSON.parse(serializeCh(createChState(), 1)) as Record<string, unknown>;
    expect(isChSave(good)).toBe(true);
    expect(isChSave({ ...good, zone: 0 })).toBe(false);
    expect(isChSave({ ...good, gold: -1 })).toBe(false);
    expect(isChSave({ ...good, crew: { boss: -2 } })).toBe(false);
    expect(isChSave({ ...good, crew: { boss: 1.5 } })).toBe(false);
    expect(isChSave({ ...good, lastSeen: 0 })).toBe(false);
  });

  it('export → import round-trips through a base64 code', () => {
    const s = { ...createChState(), zone: 7, runMaxZone: 7, crew: { boss: 3, dj: 1 }, souls: 2 };
    const code = exportCh(s, 12345);
    const back = importCh(code);
    expect(back).not.toBeNull();
    expect(back!.zone).toBe(7);
    expect(back!.crew).toEqual({ boss: 3, dj: 1 });
    expect(importCh('not-valid-base64!!')).toBeNull();
    expect(importCh(exportCh(createChState(), 1))).not.toBeNull();
  });

  it('reset removes the save', () => {
    const store = memStorage();
    saveCh(createChState(), 1, store);
    expect(store.map.has(CH_SAVE_KEY)).toBe(true);
    resetCh(store);
    expect(store.map.has(CH_SAVE_KEY)).toBe(false);
  });

  it('null storage is a no-op (never throws)', () => {
    expect(() => saveCh(createChState(), 1, null)).not.toThrow();
    expect(loadCh(null)).toBeNull();
    expect(() => resetCh(null)).not.toThrow();
  });
});

describe('ch-store — v2 migration & repair', () => {
  it('migrates a v1 blob losslessly into v2 with M7 defaults', () => {
    const store = memStorage();
    const v1 = {
      v: 1,
      lastSeen: 5000,
      gold: 500,
      zone: 12,
      killsThisZone: 3,
      runMaxZone: 12,
      crew: { boss: 5, dj: 2 },
      souls: 3,
      lifetimeMaxZone: 12,
      totalClicks: 42,
    };
    store.setItem(CH_SAVE_KEY, JSON.stringify(v1));
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    const s = loaded!.state;
    // v1 fields carried through losslessly
    expect(s.gold).toBe(500);
    expect(s.zone).toBe(12);
    expect(s.crew).toEqual({ boss: 5, dj: 2 });
    expect(s.souls).toBe(3);
    expect(s.totalClicks).toBe(42);
    expect(loaded!.lastSeen).toBe(5000);
    // v2 defaults added
    expect(s.rng.cursor).toBe(0);
    expect(Number.isInteger(s.rng.seed)).toBe(true);
    expect(s.stats).toEqual(createStats());
    expect(s.legacyImported).toBe(false);
  });

  it('repairs a corrupt rng field to a fresh seed without throwing', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.rng = 'garbage';
    const json = JSON.stringify(raw);
    let s: ChState | null = null;
    expect(() => {
      s = deserializeCh(json);
    }).not.toThrow();
    expect(s).not.toBeNull();
    expect(s!.rng.cursor).toBe(0);
    expect(Number.isInteger(s!.rng.seed)).toBe(true);
  });

  it('repairs negative / absent stats to 0', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.stats = { crits: -5 }; // negative + missing keys
    const s = deserializeCh(JSON.stringify(raw));
    expect(s).not.toBeNull();
    expect(s!.stats.crits).toBe(0);
    expect(s!.stats.bossKills).toBe(0);
    expect(s!.stats.goldLifetime).toBe(0);
  });

  it('preserves rng cursor + stats + legacy flag through a v2 round-trip', () => {
    const store = memStorage();
    const s = {
      ...createChState(),
      rng: { seed: 777, cursor: 123 },
      stats: { ...createStats(), crits: 9, goldLifetime: 12345 },
      legacyImported: true,
    };
    saveCh(s, 2000, store);
    const loaded = loadCh(store);
    expect(loaded!.state.rng).toEqual({ seed: 777, cursor: 123 });
    expect(loaded!.state.stats.crits).toBe(9);
    expect(loaded!.state.stats.goldLifetime).toBe(12345);
    expect(loaded!.state.legacyImported).toBe(true);
  });

  it('rejects unknown / future versions to a clean fresh start', () => {
    const store = memStorage();
    store.setItem(CH_SAVE_KEY, JSON.stringify({ v: 7, gold: 0 }));
    expect(loadCh(store)).toBeNull();
    store.setItem(CH_SAVE_KEY, JSON.stringify({ v: 0, gold: 0 }));
    expect(loadCh(store)).toBeNull();
    expect(() => loadCh(store)).not.toThrow();
  });
});

describe('ch-store — v5 migration & repair (M10)', () => {
  it('migrates a v4 blob losslessly into v5 (ancients empty, heaven default, earned = souls)', () => {
    const store = memStorage();
    const v4 = {
      v: 4,
      lastSeen: 11000,
      gold: 2000,
      zone: 50,
      killsThisZone: 1,
      runMaxZone: 50,
      crew: { boss: 20, legend: 2 },
      souls: 129,
      lifetimeMaxZone: 50,
      totalClicks: 800,
      rng: { seed: 333, cursor: 99 },
      stats: { ...createStats(), crits: 20 },
      legacyImported: true,
      ability: createAbility(),
      combo: { stacks: 30 },
      gilds: { boss: 4 },
      rsLifetime: 129,
    };
    store.setItem(CH_SAVE_KEY, JSON.stringify(v4));
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    const s = loaded!.state;
    // v4 fields carried through losslessly.
    expect(s.gold).toBe(2000);
    expect(s.crew).toEqual({ boss: 20, legend: 2 });
    expect(s.souls).toBe(129);
    expect(s.gilds).toEqual({ boss: 4 });
    expect(s.rng).toEqual({ seed: 333, cursor: 99 });
    // v5 defaults added.
    expect(s.ancients).toEqual({});
    expect(s.heaven).toEqual({ hpf: 0, hpfLifetime: 0, ascensions2: 0, tree: {} });
    // Pre-M10 earned == held == souls (129 here, which equals soulsForMaxZone(50)).
    expect(s.rsLifetime).toBe(129);
    expect(s.rsLifetime).toBe(soulsForMaxZone(50));
  });

  // The M10 souls-accounting hazard: an un-ascended deep-zone save must keep its
  // PENDING souls. souls=13 (old-curve bank, ascended at ~z25) but lifetimeMaxZone=50:
  // rsLifetime must become 13 (banked), NOT soulsForMaxZone(50)=129 — a zone-lift
  // would silently erase the 116 souls still claimable on the next ascension.
  it('v4→v5 keeps pending souls of an un-ascended deep zone (earned = banked, no zone-lift)', () => {
    const store = memStorage();
    const v4 = {
      v: 4,
      lastSeen: 11000,
      gold: 100,
      zone: 50,
      killsThisZone: 0,
      runMaxZone: 50,
      crew: { boss: 10 },
      souls: 13,
      lifetimeMaxZone: 50,
      totalClicks: 100,
      rng: { seed: 1, cursor: 0 },
      stats: createStats(),
      legacyImported: false,
      ability: createAbility(),
      combo: { stacks: 0 },
      gilds: {},
      rsLifetime: 13,
    };
    store.setItem(CH_SAVE_KEY, JSON.stringify(v4));
    const s = loadCh(store)!.state;
    expect(s.souls).toBe(13);
    expect(s.rsLifetime).toBe(13); // NOT lifted to soulsForMaxZone(50) = 129
    expect(s.rsLifetime).not.toBe(soulsForMaxZone(50));
    // The deep zone's souls remain pending for the next ascension.
    expect(pendingSouls(s.runMaxZone, s.lifetimeMaxZone, s.rsLifetime)).toBe(
      soulsForMaxZone(50) - 13,
    );
  });

  // §9.2: the full chain — a v1 (MVP) blob still loads all the way to v5.
  it('migrates a v1 blob through the whole chain to v5 (all defaults present)', () => {
    const store = memStorage();
    const v1 = {
      v: 1,
      lastSeen: 5000,
      gold: 500,
      zone: 12,
      killsThisZone: 3,
      runMaxZone: 12,
      crew: { boss: 5 },
      souls: 3,
      lifetimeMaxZone: 12,
      totalClicks: 42,
    };
    store.setItem(CH_SAVE_KEY, JSON.stringify(v1));
    const s = loadCh(store)!.state;
    // v1 progress intact.
    expect(s.gold).toBe(500);
    expect(s.zone).toBe(12);
    expect(s.crew).toEqual({ boss: 5 });
    expect(s.souls).toBe(3);
    // v2–v5 defaults all filled.
    expect(s.stats).toEqual(createStats());
    expect(s.ability).toEqual(createAbility());
    expect(s.combo).toEqual(createComboSave());
    expect(s.gilds).toEqual({});
    expect(s.rsLifetime).toBe(3); // = banked souls, no zone-lift
    expect(s.ancients).toEqual({});
    expect(s.heaven).toEqual({ hpf: 0, hpfLifetime: 0, ascensions2: 0, tree: {} });
  });

  it('round-trips Ancients + heaven through a v5 save', () => {
    const store = memStorage();
    const s = {
      ...createChState(),
      zone: 30,
      runMaxZone: 30,
      lifetimeMaxZone: 30,
      souls: 5,
      rsLifetime: 21,
      ancients: { twerkules: 7, cheeksana: 12 },
      heaven: { hpf: 3, hpfLifetime: 8, ascensions2: 2, tree: { coach: 2, nachtschicht: 1 } },
    };
    saveCh(s, 4000, store);
    const loaded = loadCh(store);
    expect(loaded!.state.ancients).toEqual({ twerkules: 7, cheeksana: 12 });
    expect(loaded!.state.heaven).toEqual({
      hpf: 3,
      hpfLifetime: 8,
      ascensions2: 2,
      tree: { coach: 2, nachtschicht: 1 },
    });
  });

  it('repairs corrupt ancients/heaven to defaults without throwing', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.ancients = { twerkules: -2, cheeksana: 1.5, glutaeus: 4, junk: 'x' }; // keep glutaeus:4
    raw.heaven = 'garbage';
    let s: ChState | null = null;
    expect(() => {
      s = deserializeCh(JSON.stringify(raw));
    }).not.toThrow();
    expect(s).not.toBeNull();
    expect(s!.ancients).toEqual({ glutaeus: 4 });
    expect(s!.heaven).toEqual({ hpf: 0, hpfLifetime: 0, ascensions2: 0, tree: {} });
  });

  it('clamps held HPF above the lifetime total on load', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.heaven = { hpf: 99, hpfLifetime: 10, ascensions2: 1, tree: { coach: 5, junk: 'x' } };
    const s = deserializeCh(JSON.stringify(raw));
    expect(s!.heaven.hpf).toBe(10); // clamped to hpfLifetime
    expect(s!.heaven.tree).toEqual({ coach: 5 });
  });
});

describe('ch-store — v6 migration & repair (M11)', () => {
  it('migrates a v5 blob losslessly into v6 (gear default, all v5 fields intact)', () => {
    const store = memStorage();
    const v5 = {
      v: 5,
      lastSeen: 12000,
      gold: 3000,
      zone: 40,
      killsThisZone: 2,
      runMaxZone: 40,
      crew: { boss: 22, legend: 3 },
      souls: 100,
      lifetimeMaxZone: 40,
      totalClicks: 900,
      rng: { seed: 444, cursor: 88 },
      stats: { ...createStats(), crits: 33 },
      legacyImported: true,
      ability: createAbility(),
      combo: { stacks: 40 },
      gilds: { boss: 5 },
      rsLifetime: 100,
      ancients: { twerkules: 8 },
      heaven: { hpf: 2, hpfLifetime: 5, ascensions2: 1, tree: { coach: 3 } },
    };
    store.setItem(CH_SAVE_KEY, JSON.stringify(v5));
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    const s = loaded!.state;
    // v5 fields carried through losslessly.
    expect(s.gold).toBe(3000);
    expect(s.crew).toEqual({ boss: 22, legend: 3 });
    expect(s.souls).toBe(100);
    expect(s.ancients).toEqual({ twerkules: 8 });
    expect(s.heaven).toEqual({ hpf: 2, hpfLifetime: 5, ascensions2: 1, tree: { coach: 3 } });
    expect(s.gilds).toEqual({ boss: 5 });
    // v6 default added — a fresh classic/club Tour-Modus gear slice, and the
    // legacy-Tyrann latch defaults false (no legacy import inferred at load).
    expect(s.gear).toEqual(createGear());
    expect(s.legacyTyrann).toBe(false);
  });

  it('round-trips gear (skin/level/star/shards/sugar) through a v6 save', () => {
    const store = memStorage();
    const s = {
      ...createChState(),
      zone: 20,
      runMaxZone: 20,
      lifetimeMaxZone: 20,
      legacyTyrann: true,
      gear: {
        skin: 'disco' as const,
        bg: 'synth' as const,
        bgAuto: false,
        skinLevels: { disco: 10, classic: 3 },
        skinStars: { disco: 2 },
        shards: 140,
        sugarPeaches: 4,
        nextSugarAt: 1_800_000_000_000,
        crafted: ['neon'],
      },
    };
    saveCh(s, 5000, store);
    const loaded = loadCh(store);
    expect(loaded!.state.gear).toEqual(s.gear);
    expect(loaded!.state.legacyTyrann).toBe(true);
  });

  it('repairs a wholly corrupt gear slice to createGear() defaults (never nukes progress)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.gear = 'garbage';
    // Real progress on OTHER slices must survive the gear repair.
    raw.souls = 42;
    raw.crew = { boss: 7 };
    let s: ChState | null = null;
    expect(() => {
      s = deserializeCh(JSON.stringify(raw));
    }).not.toThrow();
    expect(s).not.toBeNull();
    expect(s!.gear).toEqual(createGear());
    expect(s!.souls).toBe(42);
    expect(s!.crew).toEqual({ boss: 7 });
  });

  it('repairs corrupt gear SUB-fields in isolation (valid levels/stars preserved)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.gear = {
      skin: 'toString', // not a real SkinKey (Object.hasOwn discipline) ⇒ classic
      bg: 'nope', // not a real kulisse ⇒ club
      bgAuto: 'yes', // not a boolean ⇒ default true
      skinLevels: { host: 12, junk: 'x', neg: -3 }, // keep host:12, drop junk/neg
      skinStars: { host: 3 },
      shards: -50, // negative ⇒ 0
      sugarPeaches: 2.9, // floored ⇒ 2
      nextSugarAt: Number.NaN, // NaN ⇒ 0 (glue re-seeds)
      crafted: ['neon', 'toString', 42, 'neon', 'notaskin'], // keep real keys, dedupe
    };
    const s = deserializeCh(JSON.stringify(raw));
    expect(s).not.toBeNull();
    expect(s!.gear.skin).toBe('classic');
    expect(s!.gear.bg).toBe('club');
    expect(s!.gear.bgAuto).toBe(true);
    expect(s!.gear.skinLevels).toEqual({ host: 12 }); // real progress preserved
    expect(s!.gear.skinStars).toEqual({ host: 3 });
    expect(s!.gear.shards).toBe(0);
    expect(s!.gear.sugarPeaches).toBe(2);
    expect(s!.gear.nextSugarAt).toBe(0);
    expect(s!.gear.crafted).toEqual(['neon']); // junk/dupes/prototype keys dropped
  });

  it('migrates a v1 blob all the way through to v6 (gear default present)', () => {
    const store = memStorage();
    const v1 = {
      v: 1,
      lastSeen: 5000,
      gold: 500,
      zone: 12,
      killsThisZone: 3,
      runMaxZone: 12,
      crew: { boss: 5 },
      souls: 3,
      lifetimeMaxZone: 12,
      totalClicks: 42,
    };
    store.setItem(CH_SAVE_KEY, JSON.stringify(v1));
    const s = loadCh(store)!.state;
    expect(s.gold).toBe(500);
    expect(s.gear).toEqual(createGear());
    expect(s.legacyTyrann).toBe(false);
  });
});

describe('ch-store — v4 migration & repair (M9)', () => {
  it('migrates a v3 blob losslessly into v4 (gilds default empty, rsLifetime seeded)', () => {
    const store = memStorage();
    const v3 = {
      v: 3,
      lastSeen: 9000,
      gold: 1200,
      zone: 30,
      killsThisZone: 2,
      runMaxZone: 30,
      crew: { boss: 12, dj: 4 },
      souls: 21,
      lifetimeMaxZone: 30,
      totalClicks: 500,
      rng: { seed: 222, cursor: 77 },
      stats: { ...createStats(), crits: 11 },
      legacyImported: true,
      ability: createAbility(),
      combo: { stacks: 12 },
    };
    store.setItem(CH_SAVE_KEY, JSON.stringify(v3));
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    const s = loaded!.state;
    // v3 fields carried through losslessly
    expect(s.gold).toBe(1200);
    expect(s.crew).toEqual({ boss: 12, dj: 4 });
    expect(s.souls).toBe(21);
    expect(s.rng).toEqual({ seed: 222, cursor: 77 });
    expect(s.combo).toEqual({ stacks: 12 });
    // v4 defaults added
    expect(s.gilds).toEqual({});
    // rsLifetime seeded from the banked souls (21 == soulsForMaxZone(30) here);
    // NEVER zone-lifted — see the v4→v5 "pending souls survive" test below.
    expect(s.rsLifetime).toBe(21);
  });

  it('round-trips gilds + rsLifetime through a v4 save', () => {
    const store = memStorage();
    const s = {
      ...createChState(),
      zone: 25,
      runMaxZone: 25,
      lifetimeMaxZone: 25,
      souls: 13,
      gilds: { boss: 3, legend: 1 },
      rsLifetime: 200,
    };
    saveCh(s, 3000, store);
    const loaded = loadCh(store);
    expect(loaded!.state.gilds).toEqual({ boss: 3, legend: 1 });
    expect(loaded!.state.rsLifetime).toBe(200);
  });

  it('repairs a corrupt gilds slice + negative rsLifetime without throwing', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.gilds = { boss: -2, dj: 1.5, legend: 3, junk: 'x' }; // drop all but legend:3
    raw.rsLifetime = -50;
    let s: ChState | null = null;
    expect(() => {
      s = deserializeCh(JSON.stringify(raw));
    }).not.toThrow();
    expect(s).not.toBeNull();
    expect(s!.gilds).toEqual({ legend: 3 });
    expect(s!.rsLifetime).toBe(0);
  });
});

describe('ch-store — v3 migration & repair (M8)', () => {
  it('migrates a v2 blob losslessly into v3 with default ability + combo', () => {
    const store = memStorage();
    const v2 = {
      v: 2,
      lastSeen: 8000,
      gold: 750,
      zone: 20,
      killsThisZone: 4,
      runMaxZone: 20,
      crew: { boss: 8, dj: 3 },
      souls: 6,
      lifetimeMaxZone: 22,
      totalClicks: 314,
      rng: { seed: 111, cursor: 55 },
      stats: { ...createStats(), crits: 7, goldLifetime: 999 },
      legacyImported: true,
    };
    store.setItem(CH_SAVE_KEY, JSON.stringify(v2));
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    const s = loaded!.state;
    // v2 fields carried through losslessly
    expect(s.gold).toBe(750);
    expect(s.zone).toBe(20);
    expect(s.crew).toEqual({ boss: 8, dj: 3 });
    expect(s.rng).toEqual({ seed: 111, cursor: 55 });
    expect(s.stats.crits).toBe(7);
    expect(s.legacyImported).toBe(true);
    // v3 defaults added
    expect(s.ability).toEqual(createAbility());
    expect(s.combo).toEqual(createComboSave());
  });

  it('repairs a corrupt ability / combo slice to defaults without throwing', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.ability = 'garbage';
    raw.combo = { stacks: -9 };
    let s: ChState | null = null;
    expect(() => {
      s = deserializeCh(JSON.stringify(raw));
    }).not.toThrow();
    expect(s).not.toBeNull();
    expect(s!.ability).toEqual(createAbility());
    expect(s!.combo).toEqual({ stacks: 0 });
  });

  it('clamps an out-of-range charge and drops non-numeric cooldowns', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.ability = { charge: 9999, frenzyUntil: -5, cooldowns: { beatDrop: 42, junk: 'x' } };
    const s = deserializeCh(JSON.stringify(raw));
    expect(s!.ability.charge).toBe(ABILITY_CHARGE_MAX);
    expect(s!.ability.frenzyUntil).toBe(0); // negative ⇒ 0
    expect(s!.ability.cooldowns).toEqual({ beatDrop: 42 });
  });

  it('AC3: an active Ekstase + combo survive a v3 save round-trip (reload)', () => {
    const store = memStorage();
    const s = {
      ...createChState(),
      ability: { charge: 100, frenzyUntil: 1_712_000_000_000, cooldowns: {} },
      combo: { stacks: 73 },
    };
    saveCh(s, 2000, store);
    const loaded = loadCh(store);
    expect(loaded!.state.ability).toEqual({
      charge: 100,
      frenzyUntil: 1_712_000_000_000,
      cooldowns: {},
    });
    expect(loaded!.state.combo).toEqual({ stacks: 73 });
  });
});

describe('ch-store — visibility return grant (B5)', () => {
  it('a 10-minute hidden tab grants offlineGold over that interval (injected clock)', () => {
    const dps = monsterHp(5) * 2;
    const zone = 5;
    const hiddenAt = 1_000_000;
    const now = hiddenAt + 10 * 60_000; // injected: tab returns 10 min later
    const elapsed = now - hiddenAt;
    expect(visibilityGrant(dps, zone, elapsed)).toBe(offlineGold(dps, zone, 600_000));
    expect(visibilityGrant(dps, zone, elapsed)).toBeGreaterThan(0);
  });
});

describe('ch-store — offline gold', () => {
  it('is zero without DPS', () => {
    expect(offlineGold(0, 5, 3600_000)).toBe(0);
  });

  it('scales with dps, time and efficiency, and caps the elapsed time', () => {
    const dps = monsterHp(5) * 2; // 2 kills/sec
    const oneHour = offlineGold(dps, 5, 3600_000);
    expect(oneHour).toBeGreaterThan(0);
    // Cap: 100h elapsed counts as OFFLINE_CAP_S only.
    const capped = offlineGold(dps, 5, 100 * 3600_000);
    const atCap = offlineGold(dps, 5, OFFLINE_CAP_S * 1000);
    expect(capped).toBe(atCap);
    // Efficiency halves throughput vs. a naive full-rate estimate.
    expect(oneHour).toBeLessThan(2 * 3600 * OFFLINE_EFF * 10); // sanity upper bound-ish
  });

  // M10-AC5 (offline half): a Twerk-Coach contributes to offline gold even with
  // ZERO crew DPS, so a crew-less click build still earns while away (rest of B11).
  it('a coach earns offline for a crew-less build (25 % of clickDmg × cps)', () => {
    const clickDmg = monsterHp(5) * 8; // chunky click
    const noCoach = offlineGold(0, 5, 3600_000);
    expect(noCoach).toBe(0); // no DPS, no coach ⇒ nothing
    const withCoach = offlineGold(0, 5, 3600_000, { clickDmg, coachCps: 2 });
    expect(withCoach).toBeGreaterThan(0);
    // Equivalent to a plain-DPS run at the coach's effective throughput.
    const coachDps = 2 * 0.25 * clickDmg;
    expect(withCoach).toBe(offlineGold(coachDps, 5, 3600_000));
  });

  // Peachiel (§4.6): offline models the same rival kills as live play, so the
  // gold multiplier applies to offline/visibility accrual too (not only live kills).
  it('applies the Peachiel gold multiplier to offline accrual', () => {
    const dps = monsterHp(5) * 2;
    const base = offlineGold(dps, 5, 3600_000);
    const boosted = offlineGold(dps, 5, 3600_000, { goldMult: 1.5 });
    expect(boosted).toBe(Math.floor(base * 1.5));
    // Defaults to ×1 and guards a nonsense negative multiplier.
    expect(offlineGold(dps, 5, 3600_000, { goldMult: 1 })).toBe(base);
    expect(offlineGold(dps, 5, 3600_000, { goldMult: -2 })).toBe(0);
  });

  // Endless Summer set (§5.5): the offline efficiency rises above the 50 % base,
  // capped at the full live rate (100 %). A nonsense negative bonus is guarded.
  it('applies the gear offline-rate bonus (base 50 %, capped at 100 %)', () => {
    const dps = monsterHp(5) * 2;
    const base = offlineGold(dps, 5, 3600_000);
    const boosted = offlineGold(dps, 5, 3600_000, { rateBonus: 0.15 });
    // 65 % / 50 % = 1.3× the base throughput.
    expect(boosted).toBeCloseTo(base * (0.65 / OFFLINE_EFF), -1);
    expect(boosted).toBeGreaterThan(base);
    // Clamped at 100 %: a huge bonus never exceeds full live-rate accrual.
    const full = offlineGold(dps, 5, 3600_000, { rateBonus: 5 });
    expect(full).toBe(Math.floor(base / OFFLINE_EFF));
    // Guards + defaults.
    expect(offlineGold(dps, 5, 3600_000, { rateBonus: 0 })).toBe(base);
    expect(offlineGold(dps, 5, 3600_000, { rateBonus: -2 })).toBe(base);
  });

  it('a raised offline cap (Nachtschicht) lets more time accrue', () => {
    const dps = monsterHp(5) * 2;
    const at8h = offlineGold(dps, 5, 100 * 3600_000);
    const at24h = offlineGold(dps, 5, 100 * 3600_000, { capS: 24 * 3600 });
    expect(at24h).toBeGreaterThan(at8h);
    expect(at24h).toBeCloseTo(at8h * 3, -1); // 24 h ≈ 3 × 8 h
  });
});
