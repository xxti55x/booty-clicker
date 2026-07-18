import { describe, expect, it } from 'vitest';

import { ABILITY_CHARGE_MAX, createAbility } from '../game/ability';
import { pendingSouls, soulsForMaxZone } from '../game/ascension';
import {
  type ChState,
  createChState,
  createChests,
  createComboSave,
  createPeach,
  createStats,
} from '../game/ch-state';
import { createGear } from '../game/gear';
import { createMeta, dailyQuests } from '../game/quests';
import { createTranscend, transcendGlobalMult } from '../game/transcend';
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

describe('ch-store — v9 migration & repair (M15)', () => {
  // A full v8 blob (the pre-M15 shape) for the migration tests.
  const v8Blob = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    v: 8,
    lastSeen: 15000,
    gold: 5000,
    zone: 65,
    killsThisZone: 2,
    runMaxZone: 65,
    crew: { boss: 30, legend: 6 },
    souls: 200,
    lifetimeMaxZone: 65,
    totalClicks: 2000,
    rng: { seed: 777, cursor: 300 },
    stats: { ...createStats(), crits: 100, bossKills: 20 },
    legacyImported: true,
    ability: createAbility(),
    combo: { stacks: 70 },
    gilds: { boss: 8 },
    rsLifetime: 200,
    ancients: { twerkules: 12 },
    heaven: { hpf: 5, hpfLifetime: 1000, ascensions2: 3, tree: { coach: 4 } },
    gear: { ...createGear(), skin: 'disco', shards: 400 },
    legacyTyrann: true,
    chests: {
      keys: 6,
      inventory: { wood: 1, gold: 2, diamond: 1, mythic: 0 },
      pity: { wood: 0, gold: 0, diamond: 0, mythic: 0 },
      skins: [],
    },
    permTokens: { critDmg: 5 },
    peach: createPeach(),
    meta: createMeta(),
    achievements: ['zone-10'],
    ...over,
  });

  it('migrates a v8 blob losslessly into v9 (transcend default, all v8 fields intact)', () => {
    const store = memStorage();
    store.setItem(CH_SAVE_KEY, JSON.stringify(v8Blob()));
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    const s = loaded!.state;
    // v8 fields carried through losslessly.
    expect(s.gold).toBe(5000);
    expect(s.crew).toEqual({ boss: 30, legend: 6 });
    expect(s.souls).toBe(200);
    expect(s.heaven).toEqual({ hpf: 5, hpfLifetime: 1000, ascensions2: 3, tree: { coach: 4 } });
    expect(s.meta).toEqual(createMeta());
    expect(s.achievements).toEqual(['zone-10']);
    // v9 default added — a fresh (never-transcended) L3 slice.
    expect(s.transcend).toEqual(createTranscend());
  });

  it('round-trips a full transcend slice (te/teLifetime/transcendences/mythos)', () => {
    const store = memStorage();
    const s: ChState = {
      ...createChState(),
      transcend: { te: 4, teLifetime: 6, transcendences: 3, mythos: { diamantBooty: 2 } },
    };
    saveCh(s, 8000, store);
    const loaded = loadCh(store);
    expect(loaded!.state.transcend).toEqual({
      te: 4,
      teLifetime: 6,
      transcendences: 3,
      mythos: { diamantBooty: 2 },
    });
  });

  it('repairs a wholly corrupt transcend slice to createTranscend() (never nukes progress)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.transcend = 'garbage';
    // Real progress on OTHER slices must survive the transcend repair.
    raw.souls = 55;
    raw.crew = { boss: 8 };
    let s: ChState | null = null;
    expect(() => {
      s = deserializeCh(JSON.stringify(raw));
    }).not.toThrow();
    expect(s).not.toBeNull();
    expect(s!.transcend).toEqual(createTranscend());
    expect(s!.souls).toBe(55);
    expect(s!.crew).toEqual({ boss: 8 });
  });

  it('repairs corrupt transcend SUB-fields in isolation (held ≤ earned invariant restored)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.transcend = {
      te: 5, // held above the (corrupt) lifetime ⇒ LIFT lifetime, never nuke held
      teLifetime: 3,
      transcendences: -2, // negative ⇒ 0
      mythos: { good: 2, bad: -1, junk: 'x', frac: 1.5 }, // count-map: keep non-neg, floor
    };
    const s = deserializeCh(JSON.stringify(raw));
    expect(s).not.toBeNull();
    expect(s!.transcend.te).toBe(5); // held preserved
    expect(s!.transcend.teLifetime).toBe(5); // lifted to ≥ held (not clamped down to 3)
    expect(s!.transcend.transcendences).toBe(0);
    expect(s!.transcend.mythos).toEqual({ good: 2, frac: 1 }); // 1.5 floored, bad/junk dropped
  });

  it('floors + caps TE counters (fractional te floored; huge te capped ⇒ mult stays finite)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.transcend = {
      te: 2.5, // fractional ⇒ floored to 2 (no ×3^2.5)
      teLifetime: 2.9, // fractional ⇒ floored to 2 (still ≥ held)
      transcendences: 1.7, // fractional ⇒ floored to 1
      mythos: {},
    };
    const s = deserializeCh(JSON.stringify(raw));
    expect(s).not.toBeNull();
    expect(s!.transcend.te).toBe(2); // 2.5 floored
    expect(s!.transcend.teLifetime).toBe(2);
    expect(s!.transcend.transcendences).toBe(1);
    expect(Number.isFinite(transcendGlobalMult(s!.transcend.te))).toBe(true);

    // A crafted, absurd te must be capped so transcendGlobalMult stays finite
    // (te 1e300 ⇒ 3^1e300 = Infinity ⇒ dpsOf = Infinity without the cap).
    const huge = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    huge.transcend = { te: 1e300, teLifetime: 1e300, transcendences: 0, mythos: {} };
    const hs = deserializeCh(JSON.stringify(huge));
    expect(hs).not.toBeNull();
    expect(hs!.transcend.te).toBe(308); // capped at ⌊log10(MAX_VALUE)⌋
    expect(hs!.transcend.teLifetime).toBe(308);
    expect(Number.isFinite(transcendGlobalMult(hs!.transcend.te))).toBe(true);
  });

  it('migrates a v1 blob all the way through to v9 (transcend default present)', () => {
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
    expect(s.chests).toEqual(createChests());
    expect(s.meta).toEqual(createMeta());
    expect(s.achievements).toEqual([]);
    expect(s.transcend).toEqual(createTranscend());
  });
});

describe('ch-store — v8 migration & repair (M13)', () => {
  // A full v7 blob (the pre-M13 shape) for the migration tests.
  const v7Blob = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    v: 7,
    lastSeen: 14000,
    gold: 4200,
    zone: 60,
    killsThisZone: 5,
    runMaxZone: 60,
    crew: { boss: 26, legend: 5 },
    souls: 140,
    lifetimeMaxZone: 60,
    totalClicks: 1500,
    rng: { seed: 666, cursor: 200 },
    stats: { ...createStats(), crits: 88, bossKills: 12 },
    legacyImported: true,
    ability: createAbility(),
    combo: { stacks: 60 },
    gilds: { boss: 7 },
    rsLifetime: 140,
    ancients: { twerkules: 10 },
    heaven: { hpf: 4, hpfLifetime: 9, ascensions2: 2, tree: { coach: 4 } },
    gear: { ...createGear(), skin: 'disco', shards: 300 },
    legacyTyrann: true,
    chests: {
      keys: 5,
      inventory: { wood: 1, gold: 2, diamond: 0, mythic: 0 },
      pity: { wood: 0, gold: 0, diamond: 0, mythic: 0 },
      skins: [],
    },
    permTokens: { critDmg: 4 },
    peach: createPeach(),
    ...over,
  });

  it('migrates a v7 blob losslessly into v8 (meta/achievements defaults, v7 fields intact)', () => {
    const store = memStorage();
    store.setItem(CH_SAVE_KEY, JSON.stringify(v7Blob()));
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    const s = loaded!.state;
    // v7 fields carried through losslessly.
    expect(s.gold).toBe(4200);
    expect(s.crew).toEqual({ boss: 26, legend: 5 });
    expect(s.souls).toBe(140);
    expect(s.ancients).toEqual({ twerkules: 10 });
    expect(s.heaven).toEqual({ hpf: 4, hpfLifetime: 9, ascensions2: 2, tree: { coach: 4 } });
    expect(s.chests.keys).toBe(5);
    expect(s.permTokens).toEqual({ critDmg: 4 });
    // v8 defaults added.
    expect(s.meta).toEqual(createMeta());
    expect(s.achievements).toEqual([]);
    // v8 stats counters absent in v7 default to 0; existing stats preserved.
    expect(s.stats.crits).toBe(88);
    expect(s.stats.bossKills).toBe(12);
    expect(s.stats.ascensions).toBe(0);
    expect(s.stats.chestsOpened).toBe(0);
    expect(s.stats.maxCombo).toBe(0);
    expect(s.stats.maxBossStreak).toBe(0);
    expect(s.stats.keysEarned).toBe(0);
  });

  it('round-trips a full meta slice + achievements + v8 stats counters', () => {
    const store = memStorage();
    const s: ChState = {
      ...createChState(),
      zone: 30,
      runMaxZone: 30,
      lifetimeMaxZone: 30,
      stats: {
        ...createStats(),
        ascensions: 7,
        chestsOpened: 12,
        maxCombo: 130,
        bossStreak: 4,
        maxBossStreak: 18,
        keysEarned: 44,
      },
      meta: {
        day: 20_289,
        questIds: dailyQuests(20_289, 0),
        questProgress: { 'boss-4': 2 },
        questsClaimed: ['boss-4'],
        rerollsUsed: 1,
        streak: 5,
        lastLoginDay: 20_289,
        streakProtectWeek: 2898,
      },
      achievements: ['zone-10', 'boss-1'],
    };
    saveCh(s, 7000, store);
    const loaded = loadCh(store);
    expect(loaded!.state.meta).toEqual(s.meta);
    expect(loaded!.state.achievements).toEqual(['zone-10', 'boss-1']);
    expect(loaded!.state.stats.ascensions).toBe(7);
    expect(loaded!.state.stats.maxCombo).toBe(130);
    expect(loaded!.state.stats.maxBossStreak).toBe(18);
    expect(loaded!.state.stats.keysEarned).toBe(44);
  });

  it('repairs wholly corrupt meta/achievements to defaults (never nukes progress)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.meta = 'garbage';
    raw.achievements = 42;
    raw.souls = 77;
    raw.crew = { boss: 9 };
    let s: ChState | null = null;
    expect(() => {
      s = deserializeCh(JSON.stringify(raw));
    }).not.toThrow();
    expect(s).not.toBeNull();
    expect(s!.meta).toEqual(createMeta());
    expect(s!.achievements).toEqual([]);
    expect(s!.souls).toBe(77);
    expect(s!.crew).toEqual({ boss: 9 });
  });

  it('repairs corrupt meta SUB-fields in isolation (valid values preserved)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.meta = {
      day: 1.5, // non-integer ⇒ default -1
      questIds: ['boss-4', 'not-a-quest', 42, 'boss-4'], // keep real ids, dedupe
      questProgress: { 'boss-4': 3, junk: 'x', 'crits-200': -5 }, // keep valid non-neg ints
      questsClaimed: ['boss-4', 'nope'], // keep real ids
      rerollsUsed: 9, // clamp to MAX_REROLLS (1)
      streak: 99, // clamp to STREAK_MAX (7)
      lastLoginDay: 20_000,
      streakProtectWeek: 'x', // junk ⇒ default -1
    };
    raw.achievements = ['zone-10', 'fake-ach', 7, 'zone-10']; // keep real ids, dedupe
    const s = deserializeCh(JSON.stringify(raw));
    expect(s).not.toBeNull();
    expect(s!.meta.day).toBe(-1);
    expect(s!.meta.questIds).toEqual(['boss-4']);
    expect(s!.meta.questProgress).toEqual({ 'boss-4': 3 });
    expect(s!.meta.questsClaimed).toEqual(['boss-4']);
    expect(s!.meta.rerollsUsed).toBe(1);
    expect(s!.meta.streak).toBe(7);
    expect(s!.meta.lastLoginDay).toBe(20_000);
    expect(s!.meta.streakProtectWeek).toBe(-1);
    expect(s!.achievements).toEqual(['zone-10']);
  });

  it('migrates a v1 blob all the way through to v8 (meta/achievements defaults present)', () => {
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
    expect(s.chests).toEqual(createChests());
    expect(s.meta).toEqual(createMeta());
    expect(s.achievements).toEqual([]);
  });
});

describe('ch-store — v7 migration & repair (M12)', () => {
  // A full v6 blob (the pre-M12 shape) for the migration tests.
  const v6Blob = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    v: 6,
    lastSeen: 13000,
    gold: 4000,
    zone: 55,
    killsThisZone: 3,
    runMaxZone: 55,
    crew: { boss: 25, legend: 4 },
    souls: 130,
    lifetimeMaxZone: 55,
    totalClicks: 1200,
    rng: { seed: 555, cursor: 123 },
    stats: { ...createStats(), crits: 44 },
    legacyImported: true,
    ability: createAbility(),
    combo: { stacks: 55 },
    gilds: { boss: 6 },
    rsLifetime: 130,
    ancients: { twerkules: 9 },
    heaven: { hpf: 3, hpfLifetime: 7, ascensions2: 1, tree: { coach: 4 } },
    gear: { ...createGear(), skin: 'disco', shards: 200 },
    legacyTyrann: true,
    ...over,
  });

  it('migrates a v6 blob losslessly into v7 (loot/token/peach defaults, all v6 fields intact)', () => {
    const store = memStorage();
    store.setItem(CH_SAVE_KEY, JSON.stringify(v6Blob()));
    const loaded = loadCh(store);
    expect(loaded).not.toBeNull();
    const s = loaded!.state;
    // v6 fields carried through losslessly.
    expect(s.gold).toBe(4000);
    expect(s.crew).toEqual({ boss: 25, legend: 4 });
    expect(s.souls).toBe(130);
    expect(s.ancients).toEqual({ twerkules: 9 });
    expect(s.heaven).toEqual({ hpf: 3, hpfLifetime: 7, ascensions2: 1, tree: { coach: 4 } });
    expect(s.gear.skin).toBe('disco');
    expect(s.gear.shards).toBe(200);
    expect(s.legacyTyrann).toBe(true);
    // v7 defaults added.
    expect(s.chests).toEqual(createChests());
    expect(s.permTokens).toEqual({});
    expect(s.peach).toEqual(createPeach());
  });

  it('round-trips a full loot slice (keys/inventory/pity/skins), tokens and peach', () => {
    const store = memStorage();
    const s: ChState = {
      ...createChState(),
      zone: 30,
      runMaxZone: 30,
      lifetimeMaxZone: 30,
      chests: {
        keys: 9,
        inventory: { wood: 3, gold: 2, diamond: 1, mythic: 0 },
        pity: { wood: 0, gold: 7, diamond: 2, mythic: 1 },
        skins: ['gold-royal', 'diamond-frost'],
      },
      permTokens: { critDmg: 12, critChance: 3, goldPct: 5, dpsPct: 8 },
      peach: { nextPeachAt: 1_800_000_500_000, boostUntil: 1_800_000_100_000 },
    };
    saveCh(s, 6000, store);
    const loaded = loadCh(store);
    expect(loaded!.state.chests).toEqual(s.chests);
    expect(loaded!.state.permTokens).toEqual(s.permTokens);
    expect(loaded!.state.peach).toEqual(s.peach);
  });

  it('repairs wholly corrupt loot/token/peach slices to defaults (never nukes progress)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.chests = 'garbage';
    raw.permTokens = 42;
    raw.peach = null;
    // Real progress on OTHER slices must survive the loot repair.
    raw.souls = 77;
    raw.crew = { boss: 9 };
    let s: ChState | null = null;
    expect(() => {
      s = deserializeCh(JSON.stringify(raw));
    }).not.toThrow();
    expect(s).not.toBeNull();
    expect(s!.chests).toEqual(createChests());
    expect(s!.permTokens).toEqual({});
    expect(s!.peach).toEqual(createPeach());
    expect(s!.souls).toBe(77);
    expect(s!.crew).toEqual({ boss: 9 });
  });

  it('repairs corrupt loot SUB-fields in isolation (valid counts preserved)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    raw.chests = {
      keys: -3, // negative ⇒ 0
      inventory: { wood: 2.9, gold: -1, diamond: 'x', mythic: 4 }, // floor/drop junk
      pity: { gold: -5, diamond: 3, junk: 'x' }, // normalizePity ⇒ all four ≥ 0
      skins: ['gold-royal', 'not-a-skin', 42, 'gold-royal'], // keep real ids, dedupe
    };
    raw.permTokens = { critDmg: 6, bad: -2, junk: 'x', frac: 1.5 }; // keep positive ints only
    raw.peach = { nextPeachAt: -10, boostUntil: Number.NaN }; // ⇒ 0/0
    const s = deserializeCh(JSON.stringify(raw));
    expect(s).not.toBeNull();
    expect(s!.chests.keys).toBe(0);
    expect(s!.chests.inventory).toEqual({ wood: 2, gold: 0, diamond: 0, mythic: 4 });
    expect(s!.chests.pity).toEqual({ wood: 0, gold: 0, diamond: 3, mythic: 0 });
    expect(s!.chests.skins).toEqual(['gold-royal']);
    expect(s!.permTokens).toEqual({ critDmg: 6 });
    expect(s!.peach).toEqual({ nextPeachAt: 0, boostUntil: 0 });
  });

  it('migrates a v1 blob all the way through to v7 (loot defaults present)', () => {
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
    expect(s.chests).toEqual(createChests());
    expect(s.permTokens).toEqual({});
    expect(s.peach).toEqual(createPeach());
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
        zoneEver: 20,
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
      zoneEver: -7, // junk ⇒ default 1 (ctx also floors with lifetimeMaxZone)
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
    expect(s!.gear.zoneEver).toBe(1);
  });

  it('an early-v6 save without zoneEver/crafted repairs to the defaults (no bump needed)', () => {
    const raw = JSON.parse(serializeCh(createChState(), 1000)) as Record<string, unknown>;
    const g = raw.gear as Record<string, unknown>;
    delete g.zoneEver;
    delete g.crafted;
    g.skinLevels = { robo: 5 };
    const s = deserializeCh(JSON.stringify(raw));
    expect(s).not.toBeNull();
    expect(s!.gear.zoneEver).toBe(1);
    expect(s!.gear.crafted).toEqual([]);
    expect(s!.gear.skinLevels).toEqual({ robo: 5 }); // progress untouched by the repair
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
