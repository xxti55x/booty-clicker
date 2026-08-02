/**
 * X7 — Save-Migrations-Matrix (ROADMAP-V2, „Save-Hygiene vor neuen Feldern").
 *
 * Ein Test-Tisch über JEDEN historischen CH-Schema-Stand (v1 … v18). Pro Version
 * zwei Inline-Fixtures (kein Datei-IO):
 *
 *   1. ein REALISTISCHER Save der jeweiligen Ära, der die volle Ladekette
 *      (`loadCh` → `migrateCh` → `isChSave` → `stateFromSave`) verlustfrei im
 *      aktuellen Schema erreichen muss — Kernfelder (Gold/Bühne/Crew/RS) exakt,
 *      jede Slice der Ära exakt, jede JÜNGERE Slice auf ihrem Default;
 *   2. ein KAPUTTER Save derselben Ära (fehlende Felder, falsche Typen, NaN),
 *      den die Kette reparieren muss, ohne echten Fortschritt zu nuken.
 *
 * Dazu die Gegenprobe: ist ein GATE-Feld (gold/zone/crew/souls/lastSeen …) kaputt,
 * ist nichts mehr zu retten — die Kette fällt sauber auf `null` (frischer Start)
 * zurück und wirft NIE.
 *
 * Die narrativen Einzel-Migrationstests bleiben in `ch-store.test.ts` (dort steht
 * das WARUM je Schema-Bump); diese Datei ist das Netz darunter. Bumpt ein neues
 * Feld das Schema (P1/A1/P4), schlägt `deckt jede historische Schema-Version ab`
 * fehl und erzwingt ein neues Fixture-Paar, BEVOR die Migration als fertig gilt.
 */
import { describe, expect, it } from 'vitest';

import { ABILITY_CHARGE_MAX, createAbility } from '../game/ability';
import {
  type ChState,
  createChests,
  createComboSave,
  createPeach,
  createStats,
} from '../game/ch-state';
import { createForge } from '../game/forge';
import { createGear } from '../game/gear';
import { createHeaven } from '../game/heaven';
import { dustEntitlement } from '../game/constellation';
import { createMeta } from '../game/quests';
import { createTranscend } from '../game/transcend';
import { CH_SAVE_KEY, CH_SCHEMA, type ChStorage, deserializeCh, loadCh, saveCh } from './ch-store';

function memStorage(): ChStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** Every historical CH schema version, oldest first — the spine of the matrix. */
const VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;
type SchemaVersion = (typeof VERSIONS)[number];

const LAST_SEEN = 1_752_800_000_000;

// ---------------------------------------------------------------------------
// Fixture-Bausteine: EIN Spielstand, in der Sprache jeder Ära ausgedrückt
// ---------------------------------------------------------------------------

/** The gameplay core every version has carried since v1 (the MVP shape). */
const CORE = {
  gold: 12_345,
  zone: 55,
  killsThisZone: 4,
  runMaxZone: 55,
  crew: { boss: 80, hype: 30, legend: 6 },
  souls: 130,
  lifetimeMaxZone: 55,
  totalClicks: 4_321,
} as const;

/** v2 (M7): seedable RNG stream, lifetime counters, legacy-import latch. */
const RNG = { seed: 20_260_719, cursor: 512 };
const STATS_V2 = {
  crits: 900,
  onBeatClicks: 310,
  bossKills: 40,
  bossTimeouts: 3,
  goldLifetime: 987_654,
  playTimeS: 7_200,
};
/** v8 (M13) added six more counters to the SAME stats slice (§7.5). */
const STATS_V8 = {
  ascensions: 12,
  chestsOpened: 21,
  maxCombo: 140,
  bossStreak: 4,
  maxBossStreak: 19,
  keysEarned: 55,
};
/** v19 (Easter Egg): der Konami-Latch in derselben stats-Slice — 2 = schon getanzt. */
const STATS_V19 = { konami: 2 };

/** v3 (M8): Ekstase + combo stacks. */
const ABILITY = {
  charge: 40,
  frenzyUntil: 1_752_800_060_000,
  cooldowns: { beatDrop: 1_752_800_090_000 },
};
const COMBO = { stacks: 42 };

/** v4 (M9): Vergoldungen + the lifetime-RS highwater. */
const GILDS = { boss: 5, legend: 2 };
/**
 * v5+ (M10) macht Ahnen zur ersten echten Seelen-SENKE, also darf „je verdient"
 * hier über „gehalten" liegen (130 auf Ahnen ausgegeben). Bis v4 gab es keine
 * Senke — earned == held —, und `migrateChV4toV5` setzt `max(rsLifetime, souls)`
 * an (Review-Härtung X7: ein Highwater darf durch die Kette nie sinken).
 * Die v≤4-Fixtures tragen deshalb bewusst `rsLifetime === souls`.
 */
const RS_LIFETIME_SPENT = 260;
const ANCIENTS = { twerkules: 14, cheeksana: 6 };
const HEAVEN = { hpf: 6, hpfLifetime: 20, ascensions2: 3, tree: { coach: 4, nachtschicht: 2 } };

/** v6 (M11): Gear/Kulisse + der Legacy-Tyrann-Latch. */
const GEAR = {
  skin: 'disco',
  bg: 'synth',
  bgAuto: false,
  skinLevels: { disco: 12, classic: 4 },
  skinStars: { disco: 2 },
  shards: 640,
  sugarPeaches: 3,
  nextSugarAt: 1_752_886_400_000,
  crafted: ['neon'],
  zoneEver: 55,
};

/** v7 (M12): Truhen/Schlüssel/Pity/Truhen-Skins, Perm-Tokens, Goldener Pfirsich. */
const CHESTS = {
  keys: 7,
  inventory: { wood: 3, gold: 2, diamond: 1, mythic: 0 },
  pity: { wood: 2, gold: 5, diamond: 1, mythic: 0 },
  skins: ['gold-royal', 'diamond-frost'],
};
const PERM_TOKENS = { critDmg: 9, goldPct: 4 };
const PEACH = { nextPeachAt: 1_752_800_300_000, boostUntil: 1_752_800_120_000 };

/** v8 (M13): Tages-Quests/Streak + Achievements. */
const META = {
  day: 20_289,
  questIds: ['combo-t3', 'boss-4', 'onbeat-500'],
  questProgress: { 'boss-4': 2 },
  questsClaimed: ['combo-t3'],
  rerollsUsed: 1,
  streak: 5,
  lastLoginDay: 20_289,
  streakProtectWeek: 2898,
};
const ACHIEVEMENTS = ['zone-10', 'zone-25', 'boss-1'];

/**
 * v12 (A5): das Wochen-Paar im SELBEN Meta-Slice — ISO-Wochen-Index plus die
 * Frontier-Bestzone dieser Woche. Ältere Ären kannten die Woche nicht; ihre
 * Bestzone startet deshalb bewusst bei 0 statt bei `lifetimeMaxZone` (ein
 * v11-Save weiß nicht, WANN die 55 erreicht wurde — die Zahl füllt sich beim
 * ersten Tick von selbst).
 */
const META_V12 = { weekIndex: 2951, weekBestZone: 58 };
/** Was ein Save VOR v12 nach der Migration im Wochen-Paar stehen haben muss. */
const META_PRE_V12 = { weekIndex: -1, weekBestZone: 0 };

/** v9 (M15): Transzendenz (L3). */
const TRANSCEND = { te: 4, teLifetime: 6, transcendences: 2, mythos: { diamantBooty: 2 } };

/** v10: gekaufte Crew-Fähigkeiten — boss Lv 80 ⇒ 2 Stufen, hype Lv 30 ⇒ 1 Stufe. */
const CREW_UP = { boss: 2, hype: 1 };

/**
 * v13 (1a): Crew-Meisterschaft — Lebenszeit-Level je Mitglied. Bewusst ÜBER dem
 * aktuellen `crew`-Stand (boss 80 ⇒ 900 je gekaufte Level): der Save hat schon
 * aszendiert, die Leiter also mehrfach hochgekauft. Genau das kann eine
 * Migration aus einem Alt-Save NICHT wissen — sie startet deshalb beim
 * aktuellen Stand (`MASTERY_PRE_V13`).
 */
const CREW_MASTERY = { boss: 900, hype: 460, dj: 120, legend: 6 };
/**
 * Was ein Save VOR v13 nach der Migration in der Meisterschaft stehen haben
 * muss: seinen AKTUELLEN Crew-Stand. „Die Level, die du JETZT hältst, hast du
 * nachweislich einmal gekauft" — großzügig, aber ehrlich, und die einzige
 * Untergrenze, die aus einem Alt-Save überhaupt ableitbar ist.
 */
const MASTERY_PRE_V13 = { ...CORE.crew };

/**
 * v14 (3b): Crew-Umschulung. `boss` folgt Muster 0 (P S P S), Stufe 2 ist also
 * sein erster Spezial-Slot — hier auf `idle` gerollt (Stock wäre `critdmg`).
 * `hype` folgt Muster 1 (P P S S), Stufe 3 ist sein erster Spezial-Slot — auf
 * `gold` gerollt (Stock wäre `combo`). Dazu ein Eskalator-Stand: An `boss` wurde
 * in DIESER Aszension schon zweimal gerollt, der nächste Roll kostet also ×4.
 */
const CREW_RETRAIN = { boss: { '2': 'idle' }, hype: { '3': 'gold' } };
const RETRAIN_ROLLS = { boss: 2 };

/**
 * v11 (P1): Bühnen-Sterne. Bühne 5 voll (Boss-Gate: geclert + ohne Timeout +
 * Combo), Bühne 10 halb, Bühne 7 als Nicht-Boss-Bühne mit ihren zwei möglichen
 * Sternen — Summe 3 + 2 + 2 = 7, also noch kein Meilenstein (15) fällig.
 */
const STAGE_STARS = { '5': 7, '7': 5, '10': 3 };
const STARS_AWARDED = 0;
/** Run-Zustand: an Bühne 10 lief eben die Uhr ab (der Timeout-Stern bleibt zu). */
const BOSS_FOUL_ZONE = 10;

/**
 * v15 (2a): Legenden-Konstellation. „Der Aufbruch" steht bis Stern 3 (2+3+5 =
 * 10 💫), „Das Tempo" hat den ersten (2 💫) — zusammen 12 💫 verbaut, bei 96 💫
 * je verdient. Bewusst ÜBER dem, was die drei Quellen dieses Fixtures gerade
 * hergeben: `earned` ist ein Lebenszeit-Highwater und darf nie unter den
 * Anspruch von IRGENDWANN fallen (der Save hat vor der Himmelfahrt tiefer
 * gestanden, als `lifetimeMaxZone` heute behauptet).
 */
const CONSTELLATION = { earned: 96, spent: 12, nodes: { aufbruch: 3, tempo: 1 } };

/**
 * v16 (1b): Gebietsherrschaft. Vier Ruf-Zähler in ganz verschiedenen Ständen —
 * Club knapp über Stufe 5 (2 700 ≥ 2 624), Synth auf Stufe 3, Beach ohne Rang
 * (unter den 250 der ersten Stufe), Space gar nicht erst im Save (fehlt = 0).
 * Genau diese Streuung ist der Punkt der Leiste: Wo man farmt, zählt.
 */
const TERRITORY = { club: 2_700, synth: 900, beach: 120 };

/**
 * v17 (1c): Relikte. Drei gefundene Stücke in verschiedenen Formen — eines mit
 * zwei Affixen, zwei mit einem —, davon zwei getragen und eines nur in der
 * Sammlung. Der Gate-Highwater steht auf 55: Bühne 55 hat schon gewürfelt, das
 * nächste berechtigte Gate ist 60. Pity 2 = zwei Gates ohne Drop seit dem
 * letzten Relikt.
 */
const RELICS = {
  owned: [
    { id: 1, zone: 50, affixes: [{ id: 'click', q: 2 }] },
    {
      id: 2,
      zone: 55,
      affixes: [
        { id: 'boss', q: 3 },
        { id: 'gold', q: 0 },
      ],
    },
    { id: 3, zone: 55, affixes: [{ id: 'luck', q: 1 }] },
  ],
  slots: [2, 0, 1],
  nextId: 4,
  pity: 2,
  deepestGate: 55,
};

/**
 * v17 (3a): die Skin-Schmiede. Der getragene Disco-King hat Level 12, also
 * genau EINEN offenen Slot — er trägt sein skin-exklusives „Sequin-Crit". Der
 * zweite Slot ist leer, hat aber schon sieben trockene Rolls gesehen (die
 * Mindest-Qualität steht dort also bereits auf „Solide"). Dazu ein zweiter Skin
 * mit einem geschmiedeten Slot, den sein Level (4) gerade NICHT freigeschaltet
 * hat — er bleibt im Save stehen und faltet trotzdem ×1.
 */
const FORGE = {
  ember: 140,
  slots: {
    disco: [
      { affix: { id: 'sequin', q: 3 }, dry: 0 },
      { affix: null, dry: 7 },
      { affix: null, dry: 0 },
    ],
    classic: [
      { affix: { id: 'click', q: 1 }, dry: 3 },
      { affix: null, dry: 0 },
      { affix: null, dry: 0 },
    ],
  },
};

/**
 * v18 (2b): Skin-Meisterschafts-Pfade. Drei Skins in ganz verschiedenen
 * Ständen — der getragene Disco-King mit VOLLEM Pfad (720 000 Pfad-Sekunden
 * ⇒ alle fünf Knoten inklusive Signature-Move), der Klassiker mitten in der
 * Leiter (Knoten 2: 30 000 Trage-Sekunden + 40 Bosse = 37 200) und Robo mit
 * reiner Tragezeit unter Knoten 1. Genau diese Streuung ist der Punkt: Der Pfad
 * misst TREUE, und Treue verteilt sich nicht gleichmäßig.
 */
const SKIN_PATH = {
  disco: { s: 600_000, b: 700 },
  classic: { s: 30_000, b: 40 },
  robo: { s: 1_500, b: 0 },
};

/** v18 (3c): Der Erbe dieser Ära — DJ Wumms trägt seine Ränge doppelt. */
const HEIR = 'dj';

/** v18 (1d): Legenden-Level — 12 Himmelfahrten nach der ersten Transzendenz. */
const LEGEND = 12;

/**
 * Was ein Save VOR v17 nach der Migration in den Relikten stehen haben muss:
 * eine LEERE Sammlung, aber einen GESETZTEN Gate-Highwater. Die Sammlung ist
 * leer, weil gefallene Relikte, die nie gefallen sind, erfunden wären; der
 * Highwater ist gesetzt, weil dieses Fixture Bühne 55 erreicht hat und damit
 * jedes Gate bis einschließlich 50 nachweislich geclert hat — ohne die Saat
 * bekäme es genau diese Gates beim nächsten Rückweg ein zweites Mal ausgezahlt.
 */
const RELICS_PRE_V17 = { owned: [], slots: [0, 0, 0], nextId: 1, pity: 0, deepestGate: 50 };
/**
 * Was ein Save VOR v15 nach der Migration im Konto stehen haben muss: den
 * RÜCKWIRKEND gerechneten Anspruch aus genau diesem Fixture. Er hängt an der
 * ÄRA, denn ältere Saves haben schlicht weniger Quellen: Erfolge gibt es erst
 * ab v8, Bühnen-Sterne erst ab v11 — die Boss-Gates dagegen stecken schon im
 * v1-Kern (`lifetimeMaxZone` 55 ⇒ die Gates 25…50 sind gefallen, 6 × 2 = 12 💫).
 * Der Baum selbst startet in jeder Ära leer.
 */
function constellationPreV15(v: SchemaVersion): { earned: number; spent: number; nodes: object } {
  return {
    earned: dustEntitlement({
      stars: v >= 11 ? 7 : 0, // STAGE_STARS: 3 + 2 + 2, noch kein 15er-Meilenstein
      achievements: v >= 8 ? ACHIEVEMENTS.length : 0,
      deepestZone: CORE.lifetimeMaxZone,
    }),
    spent: 0,
    nodes: {},
  };
}

/**
 * Der eine Spielstand, ausgedrückt im Schema-Stand `v`: jede Slice erscheint
 * genau ab der Version, die sie eingeführt hat — so sieht die Kette exakt das,
 * was ein echter Save dieser Ära im localStorage hinterlassen hätte.
 */
function saveAt(v: SchemaVersion): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    v,
    lastSeen: LAST_SEEN,
    gold: CORE.gold,
    zone: CORE.zone,
    killsThisZone: CORE.killsThisZone,
    runMaxZone: CORE.runMaxZone,
    crew: { ...CORE.crew },
    souls: CORE.souls,
    lifetimeMaxZone: CORE.lifetimeMaxZone,
    totalClicks: CORE.totalClicks,
  };
  if (v >= 2) {
    raw.rng = { ...RNG };
    raw.stats = {
      ...STATS_V2,
      ...(v >= 8 ? STATS_V8 : {}),
      ...(v >= 19 ? STATS_V19 : {}),
    };
    raw.legacyImported = true;
  }
  if (v >= 3) {
    raw.ability = { ...ABILITY, cooldowns: { ...ABILITY.cooldowns } };
    raw.combo = { ...COMBO };
  }
  if (v >= 4) {
    raw.gilds = { ...GILDS };
    // Bis v4 ohne Seelen-Senke: verdient == gehalten (siehe RS_LIFETIME_SPENT).
    raw.rsLifetime = v >= 5 ? RS_LIFETIME_SPENT : CORE.souls;
  }
  if (v >= 5) {
    raw.ancients = { ...ANCIENTS };
    raw.heaven = { ...HEAVEN, tree: { ...HEAVEN.tree } };
  }
  if (v >= 6) {
    raw.gear = { ...GEAR, skinLevels: { ...GEAR.skinLevels }, skinStars: { ...GEAR.skinStars } };
    raw.legacyTyrann = true;
  }
  if (v >= 7) {
    raw.chests = { ...CHESTS, inventory: { ...CHESTS.inventory }, pity: { ...CHESTS.pity } };
    raw.permTokens = { ...PERM_TOKENS };
    raw.peach = { ...PEACH };
  }
  if (v >= 8) {
    raw.meta = {
      ...META,
      questProgress: { ...META.questProgress },
      ...(v >= 12 ? META_V12 : {}),
    };
    raw.achievements = [...ACHIEVEMENTS];
  }
  if (v >= 9) raw.transcend = { ...TRANSCEND, mythos: { ...TRANSCEND.mythos } };
  if (v >= 10) raw.crewUp = { ...CREW_UP };
  if (v >= 11) {
    raw.stageStars = { ...STAGE_STARS };
    raw.starsAwarded = STARS_AWARDED;
    raw.bossFoulZone = BOSS_FOUL_ZONE;
  }
  if (v >= 13) raw.crewMastery = { ...CREW_MASTERY };
  if (v >= 15) raw.constellation = { ...CONSTELLATION, nodes: { ...CONSTELLATION.nodes } };
  if (v >= 14) {
    raw.crewRetrain = { boss: { ...CREW_RETRAIN.boss }, hype: { ...CREW_RETRAIN.hype } };
    raw.retrainRolls = { ...RETRAIN_ROLLS };
  }
  if (v >= 16) raw.territory = { ...TERRITORY };
  if (v >= 17) {
    raw.relics = {
      ...RELICS,
      slots: [...RELICS.slots],
      owned: RELICS.owned.map((r) => ({ ...r, affixes: r.affixes.map((a) => ({ ...a })) })),
    };
    raw.forge = {
      ...FORGE,
      slots: Object.fromEntries(
        Object.entries(FORGE.slots).map(([k, row]) => [
          k,
          row.map((s) => ({ affix: s.affix ? { ...s.affix } : null, dry: s.dry })),
        ]),
      ),
    };
  }
  if (v >= 18) {
    raw.skinPath = Object.fromEntries(Object.entries(SKIN_PATH).map(([k, e]) => [k, { ...e }]));
    raw.heir = HEIR;
    raw.legend = LEGEND;
  }
  return raw;
}

/** The v1 core must arrive byte-for-byte, whatever the save's era. */
function expectCore(s: ChState): void {
  expect(s.gold).toBe(CORE.gold);
  expect(s.zone).toBe(CORE.zone);
  expect(s.killsThisZone).toBe(CORE.killsThisZone);
  expect(s.runMaxZone).toBe(CORE.runMaxZone);
  expect(s.crew).toEqual(CORE.crew);
  expect(s.souls).toBe(CORE.souls);
  expect(s.lifetimeMaxZone).toBe(CORE.lifetimeMaxZone);
  expect(s.totalClicks).toBe(CORE.totalClicks);
}

/**
 * Jede Slice entweder mit ihrem Fixture-Wert (die Ära kannte sie) oder auf dem
 * dokumentierten Default (die Ära kannte sie noch nicht) — das ist die eigentliche
 * Matrix-Zeile: „verlustfrei nach oben, sauber defaultet nach unten".
 */
function expectSlices(s: ChState, v: SchemaVersion): void {
  // v2 — RNG-Strom, Lifetime-Zähler, Legacy-Flag.
  if (v >= 2) {
    expect(s.rng).toEqual(RNG);
    expect(s.legacyImported).toBe(true);
  } else {
    expect(s.rng.cursor).toBe(0);
    expect(Number.isInteger(s.rng.seed)).toBe(true);
    expect(s.legacyImported).toBe(false);
  }
  const stats =
    v >= 8
      ? { ...createStats(), ...STATS_V2, ...STATS_V8, ...(v >= 19 ? STATS_V19 : {}) }
      : v >= 2
        ? { ...createStats(), ...STATS_V2 }
        : createStats();
  // v19 — der Konami-Latch: vor v19 IMMER 0 (niemand kann getanzt haben).
  expect(s.stats).toEqual(stats);
  // v3 — Ekstase + Combo.
  expect(s.ability).toEqual(v >= 3 ? ABILITY : createAbility());
  expect(s.combo).toEqual(v >= 3 ? COMBO : createComboSave());
  // v4 — Vergoldungen + RS-Highwater (bis v4 == gebankte Seelen).
  expect(s.gilds).toEqual(v >= 4 ? GILDS : {});
  expect(s.rsLifetime).toBe(v >= 5 ? RS_LIFETIME_SPENT : CORE.souls);
  // v5 — Ahnen + Himmel.
  expect(s.ancients).toEqual(v >= 5 ? ANCIENTS : {});
  expect(s.heaven).toEqual(v >= 5 ? HEAVEN : createHeaven());
  // v6 — Gear + Legacy-Tyrann.
  expect(s.gear).toEqual(v >= 6 ? GEAR : createGear());
  expect(s.legacyTyrann).toBe(v >= 6);
  // v7 — Truhen/Tokens/Pfirsich.
  expect(s.chests).toEqual(v >= 7 ? CHESTS : createChests());
  expect(s.permTokens).toEqual(v >= 7 ? PERM_TOKENS : {});
  expect(s.peach).toEqual(v >= 7 ? PEACH : createPeach());
  // v8 — Retention-Meta + Achievements (v12 legt das A5-Wochen-Paar dazu).
  expect(s.meta).toEqual(
    v >= 8 ? { ...META, ...(v >= 12 ? META_V12 : META_PRE_V12) } : createMeta(),
  );
  expect(s.achievements).toEqual(v >= 8 ? ACHIEVEMENTS : []);
  // v9 — Transzendenz.
  expect(s.transcend).toEqual(v >= 9 ? TRANSCEND : createTranscend());
  // v10 — gekaufte Crew-Fähigkeiten.
  expect(s.crewUp).toEqual(v >= 10 ? CREW_UP : {});
  // v11 — Bühnen-Sterne (P1). Ältere Ären starten die Sammlung bewusst leer:
  // „geclert" wäre aus `lifetimeMaxZone` zwar ableitbar, „ohne Timeout"/„Combo"
  // nicht — eine halb gefüllte Sammlung wäre irreführender als eine frische.
  expect(s.stageStars).toEqual(v >= 11 ? STAGE_STARS : {});
  expect(s.starsAwarded).toBe(v >= 11 ? STARS_AWARDED : 0);
  expect(s.bossFoulZone).toBe(v >= 11 ? BOSS_FOUL_ZONE : 0);
  // v13 — Crew-Meisterschaft (1a). Ältere Ären starten NICHT bei 0, sondern beim
  // gehaltenen Crew-Stand: der einzige Einsatz-XP-Betrag, den ein Alt-Save
  // beweisen kann (siehe `migrateChV12toV13`).
  expect(s.crewMastery).toEqual(v >= 13 ? CREW_MASTERY : MASTERY_PRE_V13);
  // v14 — Crew-Umschulung (3b). Ältere Ären starten LEER: Wer nie Splitter für
  // eine Umschulung bezahlt hat, trägt überall die Stock-Sorte — genau das sagt
  // die leere Map, es geht also nichts verloren.
  expect(s.crewRetrain).toEqual(v >= 14 ? CREW_RETRAIN : {});
  expect(s.retrainRolls).toEqual(v >= 14 ? RETRAIN_ROLLS : {});
  // v15 — Legenden-Konstellation (2a). Ältere Ären starten mit LEEREM Baum, aber
  // gefülltem Konto: Sternenstaub ist der Lohn für Dinge, die der Save schon
  // BEWEIST (Erfolge stehen als Liste drin, Sterne sind summierbar, gefallene
  // Boss-Gates stecken in der Bestzone) — anders als bei den Bühnen-Sternen
  // selbst ist die Rückwirkung hier also nicht geraten, sondern gerechnet.
  expect(s.constellation).toEqual(v >= 15 ? CONSTELLATION : constellationPreV15(v));
  // v16 — Gebietsherrschaft (1b). Ältere Ären starten bei NULL, und zwar bewusst:
  // Ruf entsteht nur aus Kills PRO THEME, und diese Zählung hat das Spiel nie
  // geführt — weder `stats.bossKills` (kennt kein Theme) noch `lifetimeMaxZone`
  // (kennt keine Wiederholungen) trügen sie. Anders als beim Sternenstaub (v15)
  // gibt es hier also nichts zu rechnen; jede Herleitung wäre eine Erfindung.
  expect(s.territory).toEqual(v >= 16 ? TERRITORY : {});
  // v17 — Relikte (1c) + Schmiede (3a). Zwei GEGENSÄTZLICHE Entscheidungen im
  // selben Bump: Die Schmiede startet komplett leer (Glut und gerollte Affixe
  // lassen sich aus nichts herleiten — eine erfundene Qualität hätte niemand
  // gewürfelt), der Relikt-Gate-Highwater dagegen wird ZWINGEND gesät. Ohne ihn
  // bekäme ein Alt-Save jedes längst geclerte Gate ab Bühne 50 noch einmal
  // ausgezahlt; die Zahl ist gerechnet (`clearedGateFor`), nicht geraten.
  expect(s.relics).toEqual(v >= 17 ? RELICS : RELICS_PRE_V17);
  expect(s.forge).toEqual(v >= 17 ? FORGE : createForge());
  // v18 — Skin-Pfade (2b) + Erbe (3c) + Legenden-Level (1d). ALLE DREI starten
  // in älteren Ären leer, und jedes aus seinem eigenen Grund:
  //  · Tragezeit hat das Spiel nie gemessen — `stats.playTimeS` kennt die
  //    Spielzeit, aber nicht, WELCHER Skin dabei anlag.
  //  · Ein Erbe entsteht nur durch eine WAHL in der Zeremonie; ihn zu raten
  //    hieße, dem Spieler genau die Entscheidung abzunehmen, um die es geht.
  //  · Für das Legenden-Level bräuchte es einen Lebenszeit-Zähler der
  //    Himmelfahrten. Der einzige Kandidat (`heaven.ascensions2`) wird von
  //    `transcendState` auf 0 zurückgesetzt, zählt also nur die laufende Ära —
  //    aus ihm zu säen wäre eine untere Schranke mit dem Anschein einer Zahl.
  expect(s.skinPath).toEqual(v >= 18 ? SKIN_PATH : {});
  expect(s.heir).toBe(v >= 18 ? HEIR : '');
  expect(s.legend).toBe(v >= 18 ? LEGEND : 0);
}

// ---------------------------------------------------------------------------
// Kaputte Alt-Saves: EINER pro Version, jeweils an den Feldern DIESER Ära
// ---------------------------------------------------------------------------

interface BrokenCase {
  /** Kurzbeschreibung des Schadens (Testnamen-Suffix). */
  readonly what: string;
  /** Beschädigt einen gesunden Save derselben Version in-place. */
  readonly damage: (raw: Record<string, unknown>) => void;
  /** Worauf die Kette ihn repariert haben muss. */
  readonly check: (s: ChState) => void;
}

const BROKEN: Record<SchemaVersion, BrokenCase> = {
  1: {
    what: 'Highwater unter der aktuellen Bühne + unbekannte Müll-Felder',
    damage: (raw) => {
      raw.runMaxZone = 1; // stale invariant: Lauf-/Lifetime-Rekord < zone
      raw.lifetimeMaxZone = 1;
      raw.junk = { nested: Number.NaN };
      raw.souls = 130.0; // ganzzahlig geschrieben, bleibt gültig
    },
    check: (s) => {
      // Beide Highwater werden auf die aktuelle Bühne gehoben, nicht genullt.
      expect(s.runMaxZone).toBe(CORE.zone);
      expect(s.lifetimeMaxZone).toBe(CORE.zone);
      // Unbekannte Felder kommen NIE im State an (stateFromSave baut explizit).
      expect(Object.keys(s)).not.toContain('junk');
    },
  },
  2: {
    what: 'RNG-Müll, negative/typfalsche Zähler, nicht-boolesches Legacy-Flag',
    damage: (raw) => {
      raw.rng = 'garbage';
      raw.stats = { crits: -5, bossKills: 'x', goldLifetime: Number.NaN, playTimeS: 7_200 };
      raw.legacyImported = 'yes';
    },
    check: (s) => {
      expect(s.rng.cursor).toBe(0);
      expect(Number.isInteger(s.rng.seed)).toBe(true);
      // Nur der heile Zähler überlebt; der Rest fällt einzeln auf 0.
      expect(s.stats).toEqual({ ...createStats(), playTimeS: 7_200 });
      expect(s.legacyImported).toBe(false);
    },
  },
  3: {
    what: 'Ekstase außerhalb der Range + fehlender Combo-Slice',
    damage: (raw) => {
      raw.ability = { charge: 9_999, frenzyUntil: -5, cooldowns: { beatDrop: 42, junk: 'x' } };
      delete raw.combo;
    },
    check: (s) => {
      expect(s.ability.charge).toBe(ABILITY_CHARGE_MAX);
      expect(s.ability.frenzyUntil).toBe(0);
      expect(s.ability.cooldowns).toEqual({ beatDrop: 42 });
      expect(s.combo).toEqual(createComboSave());
    },
  },
  4: {
    what: 'Gild-Müll + NaN-RS-Highwater',
    damage: (raw) => {
      raw.gilds = { boss: -2, dj: 1.5, legend: 3, junk: 'x' };
      raw.rsLifetime = Number.NaN; // JSON ⇒ null
    },
    check: (s) => {
      expect(s.gilds).toEqual({ legend: 3 });
      // Verdient kann nie unter „gehalten" fallen: repariert auf die Seelen-Untergrenze.
      expect(s.rsLifetime).toBe(CORE.souls);
    },
  },
  5: {
    what: 'Ahnen-Müll + Himmel über dem Lebenszeit-Total',
    damage: (raw) => {
      raw.ancients = { twerkules: -3, cheeksana: 1.5, glutaeus: 4, junk: 'x' };
      raw.heaven = {
        hpf: 99,
        hpfLifetime: 20,
        ascensions2: Number.NaN,
        tree: { coach: 4, j: 'x' },
      };
    },
    check: (s) => {
      expect(s.ancients).toEqual({ glutaeus: 4 });
      // Gehaltene HPF werden auf das je verdiente Total geklemmt (Gegenrichtung zu TE).
      expect(s.heaven).toEqual({ hpf: 20, hpfLifetime: 20, ascensions2: 0, tree: { coach: 4 } });
    },
  },
  6: {
    what: 'Gear mit Prototyp-Keys, NaN-Timer und Müll-Maps',
    damage: (raw) => {
      raw.gear = {
        skin: 'toString', // kein echter SkinKey (Object.hasOwn-Disziplin)
        bg: 'nope',
        bgAuto: 'yes',
        skinLevels: { disco: 12, junk: 'x', neg: -3 },
        skinStars: 42,
        shards: -50,
        sugarPeaches: 2.9,
        nextSugarAt: Number.NaN,
        crafted: ['neon', 'toString', 7, 'neon'],
        zoneEver: -7,
      };
      raw.legacyTyrann = 1;
    },
    check: (s) => {
      expect(s.gear.skin).toBe('classic');
      expect(s.gear.bg).toBe('club');
      expect(s.gear.bgAuto).toBe(true);
      expect(s.gear.skinLevels).toEqual({ disco: 12 }); // echter Fortschritt bleibt
      expect(s.gear.skinStars).toEqual({});
      expect(s.gear.shards).toBe(0);
      expect(s.gear.sugarPeaches).toBe(2);
      expect(s.gear.nextSugarAt).toBe(0); // Glue sät neu
      expect(s.gear.crafted).toEqual(['neon']);
      expect(s.gear.zoneEver).toBe(1);
      expect(s.legacyTyrann).toBe(false);
    },
  },
  7: {
    what: 'Truhen-/Token-/Pfirsich-Slices mit negativen, gebrochenen und NaN-Werten',
    damage: (raw) => {
      raw.chests = {
        keys: -3,
        inventory: { wood: 2.9, gold: -1, diamond: 'x', mythic: 4 },
        pity: { gold: -5, diamond: 3, junk: 'x' },
        skins: ['gold-royal', 'not-a-skin', 42, 'gold-royal'],
      };
      raw.permTokens = { critDmg: 9, bad: -2, junk: 'x', frac: 1.5 };
      raw.peach = { nextPeachAt: -10, boostUntil: Number.NaN };
    },
    check: (s) => {
      expect(s.chests.keys).toBe(0);
      expect(s.chests.inventory).toEqual({ wood: 2, gold: 0, diamond: 0, mythic: 4 });
      expect(s.chests.pity).toEqual({ wood: 0, gold: 0, diamond: 3, mythic: 0 });
      expect(s.chests.skins).toEqual(['gold-royal']);
      expect(s.permTokens).toEqual({ critDmg: 9 });
      expect(s.peach).toEqual(createPeach());
    },
  },
  8: {
    what: 'Quest-Meta mit Fake-Ids/Range-Bruch + Achievements als Nicht-Array',
    damage: (raw) => {
      raw.meta = {
        day: Number.NaN,
        questIds: ['combo-t3', 'nope', 99, 'combo-t3'],
        questProgress: { 'combo-t3': 4, 'boss-4': -1, junk: 'x' },
        questsClaimed: ['combo-t3', 'not-a-quest'],
        rerollsUsed: 9,
        streak: -4,
        lastLoginDay: 20_355,
        streakProtectWeek: 1.5,
      };
      raw.achievements = 'garbage';
    },
    check: (s) => {
      expect(s.meta).toEqual({
        day: -1,
        questIds: ['combo-t3'],
        questProgress: { 'combo-t3': 4 },
        questsClaimed: ['combo-t3'],
        rerollsUsed: 1, // MAX_REROLLS
        streak: 0,
        lastLoginDay: 20_355,
        streakProtectWeek: -1,
        // v12-Felder: die v8-Ära kannte sie nicht ⇒ Default aus der Migration.
        ...META_PRE_V12,
      });
      expect(s.achievements).toEqual([]);
    },
  },
  9: {
    what: 'TE über dem Lebenszeit-Total, negative Transzendenzen, Mythos-Müll',
    damage: (raw) => {
      raw.transcend = {
        te: 9,
        teLifetime: 2,
        transcendences: -2,
        mythos: { diamantBooty: 2.7, bad: -1, junk: 'x' },
      };
    },
    check: (s) => {
      // Gehaltene TE bleiben; der Highwater wird GEHOBEN (nie Macht nuken).
      expect(s.transcend.te).toBe(9);
      expect(s.transcend.teLifetime).toBe(9);
      expect(s.transcend.transcendences).toBe(0);
      expect(s.transcend.mythos).toEqual({ diamantBooty: 2 });
    },
  },
  10: {
    what: 'Fähigkeits-Ledger über den freigeschalteten Stufen (gebastelter Save)',
    damage: (raw) => {
      raw.crewUp = { boss: 99, hype: -3, dj: 5, junk: 2 };
    },
    check: (s) => {
      // boss Lv 80 ⇒ 2 Stufen; hype negativ ⇒ raus; dj Lv 0 ⇒ 0; junk kein Crew-Mitglied.
      expect(s.crewUp).toEqual({ boss: 2 });
    },
  },
  11: {
    what: 'Sterne mit unmöglichen Bits, Müll-Keys und krummem Meilenstein-Highwater',
    damage: (raw) => {
      raw.stageStars = {
        '5': 15, // Bit 8 existiert nicht ⇒ auf die Vollmaske 7 gestutzt
        '7': 7, // Nicht-Boss-Bühne: der Timeout-Stern fällt weg ⇒ 5
        '9': 0, // leer ⇒ gar nicht erst aufnehmen
        '12': -4, // negativ ⇒ raus
        '3.5': 3, // keine Bühnen-Nummer
        junk: 7,
        '20': Number.NaN, // JSON ⇒ null ⇒ raus
      };
      raw.starsAwarded = 22.7; // auf den vollen 15er-Block abgerundet
      raw.bossFoulZone = 'x';
    },
    check: (s) => {
      expect(s.stageStars).toEqual({ '5': 7, '7': 5 });
      expect(s.starsAwarded).toBe(15);
      expect(s.bossFoulZone).toBe(0);
    },
  },
  13: {
    what: 'Meisterschaft mit Müll-Ids, negativen und gebrochenen Lebenszeit-Ständen',
    damage: (raw) => {
      raw.crewMastery = {
        boss: 900.7, // krumm ⇒ abgerundet, echter Fortschritt bleibt
        hype: -40, // negativ ⇒ raus (ein Highwater ist nie negativ)
        dj: 'viele', // typfalsch ⇒ raus
        legend: Number.NaN, // JSON ⇒ null ⇒ raus
        junk: 5_000, // kein Crew-Mitglied ⇒ raus
      };
    },
    check: (s) => {
      expect(s.crewMastery).toEqual({ boss: 900 });
      // Bewusst NICHT auf den Crew-Stand gehoben: die Reparatur repariert, sie
      // erfindet nicht (hype hält Lv 30, seine kaputte XP-Zahl bleibt weg).
      expect(s.crew).toEqual(CORE.crew);
    },
  },
  14: {
    what: 'Umschul-Map auf einer POWER-Stufe, mit Müll-Sorten, -Ids und -Schlüsseln',
    damage: (raw) => {
      raw.crewRetrain = {
        boss: {
          '1': 'gold', // Stufe 1 ist im Muster 0 eine POWER-Stufe ⇒ raus
          '2': 'idle', // echter Spezial-Slot ⇒ bleibt
          '4': 'power', // `power` ist keine Spezial-Sorte ⇒ raus
          '04': 'gold', // Nicht-Normalform ⇒ raus (zwei Schlüssel, ein Slot)
          x: 'gold', // keine Stufen-Nummer ⇒ raus
        },
        hype: { '3': 'quatsch' }, // unbekannte Sorte ⇒ raus, Mitglied fällt ganz weg
        junk: { '2': 'gold' }, // kein Crew-Mitglied ⇒ raus
      };
      raw.retrainRolls = { boss: 2.8, hype: -1, junk: 4 };
    },
    check: (s) => {
      // Der Rhythmus ist unantastbar: Nur echte Spezial-Slots überleben.
      expect(s.crewRetrain).toEqual({ boss: { '2': 'idle' } });
      expect(s.retrainRolls).toEqual({ boss: 2 });
    },
  },
  12: {
    what: 'Wochen-Paar mit krummem Index und negativer Bestzone (A5)',
    damage: (raw) => {
      const meta = raw.meta as Record<string, unknown>;
      meta.weekIndex = 2951.7; // krumm ⇒ kein gültiger Wochen-Schlüssel
      meta.weekBestZone = -12; // negativ ⇒ 0 (eine Bestzone ist nie negativ)
    },
    check: (s) => {
      // Ein krummer Index fällt auf „noch keine Woche gezählt" zurück; der
      // nächste Tick setzt das Paar sowieso frisch (`noteWeeklyBest`).
      expect(s.meta.weekIndex).toBe(-1);
      expect(s.meta.weekBestZone).toBe(0);
      // Der restliche Meta-Slice bleibt unangetastet — der Schaden ist lokal.
      expect(s.meta.streak).toBe(META.streak);
      expect(s.meta.streakProtectWeek).toBe(META.streakProtectWeek);
    },
  },
  15: {
    what: 'Konstellation mit übervollen/negativen Ketten, Müll-Linie und NaN-Konto',
    damage: (raw) => {
      raw.constellation = {
        earned: Number.NaN, // JSON ⇒ null ⇒ 0, wird aus `spent` wieder gehoben
        spent: 0, // gelogen: die Knoten unten kosten 70 💫
        nodes: { aufbruch: 99, tempo: -2, junk: 4, ausdauer: 'x' },
      };
    },
    check: (s) => {
      // Die Kette wird auf ihre acht Sterne gedeckelt, negative/typfalsche
      // Linien fallen weg, eine unbekannte Linien-Id existiert nicht.
      expect(s.constellation.nodes).toEqual({ aufbruch: 8 });
      // `spent` wird NEU GERECHNET (2+3+5+7+9+12+14+18 = 70) — der gelogene
      // Nullwert kauft sich keinen Rabatt …
      expect(s.constellation.spent).toBe(70);
      // … und `earned` wird nach OBEN korrigiert, statt echte Knoten zu nuken.
      expect(s.constellation.earned).toBe(70);
    },
  },
  16: {
    what: 'Ruf-Tafel mit erfundenem Gebiet, negativen, krummen und typfalschen Zählern',
    damage: (raw) => {
      raw.territory = {
        club: 2_700.9, // krumm ⇒ abgerundet, echter Ruf bleibt
        synth: -900, // negativ ⇒ raus (ein Highwater ist nie negativ)
        beach: 'viel', // typfalsch ⇒ raus
        space: Number.NaN, // JSON ⇒ null ⇒ raus
        vegas: 99_999, // KEIN Bühnen-Theme ⇒ raus (es gibt keine Vegas-Bühne)
      };
    },
    check: (s) => {
      expect(s.territory).toEqual({ club: 2_700 });
      // Bewusst NICHT gegen den Spielstand geklemmt: Ein Ruf-Zähler ist ein
      // Highwater über ALLE Touren, während `zone`/`lifetimeMaxZone` bei
      // Himmelfahrt und Transzendenz auf 1 zurückfallen — es gibt keine Zahl im
      // Save, gegen die ein Vergleich stimmen würde.
      expect(s.lifetimeMaxZone).toBe(CORE.lifetimeMaxZone);
    },
  },
  17: {
    what: 'Relikte mit Doppel-Ids/Müll-Affixen und eine Schmiede mit Phantom-Skin',
    damage: (raw) => {
      raw.relics = {
        owned: [
          // gültig, aber mit einem Müll-Affix und einer übervollen Qualität
          {
            id: 1,
            zone: 50,
            affixes: [
              { id: 'click', q: 99 },
              { id: 'nope', q: 1 },
            ],
          },
          // dieselbe Id ein zweites Mal ⇒ der zweite Treffer fliegt raus
          { id: 1, zone: 60, affixes: [{ id: 'gold', q: 1 }] },
          // zwei Affixe DERSELBEN Sorte ⇒ das zweite fällt weg
          {
            id: 5,
            zone: 65,
            affixes: [
              { id: 'dps', q: 2 },
              { id: 'dps', q: 3 },
            ],
          },
          // gar kein gültiges Affix ⇒ das ganze Relikt fällt weg
          { id: 6, zone: 70, affixes: [{ id: 'phantom', q: 2 }] },
          { id: -3, zone: 75, affixes: [{ id: 'boss', q: 1 }] }, // Id ≤ 0 ⇒ raus
        ],
        slots: [1, 1, 404], // dasselbe Relikt doppelt + eine unbekannte Id
        nextId: 2, // gelogen: Id 5 ist vergeben
        pity: -4, // negativ ⇒ 0
        deepestGate: 65.9, // krumm ⇒ abgerundet
      };
      raw.forge = {
        ember: -50, // negativ ⇒ 0
        slots: {
          disco: [
            { affix: { id: 'sequin', q: 2 }, dry: -1 },
            { affix: { id: 'nope', q: 1 }, dry: 2 },
          ],
          vegasking: [{ affix: { id: 'click', q: 3 }, dry: 0 }], // KEIN echter Skin ⇒ raus
        },
      };
    },
    check: (s) => {
      // Zwei Relikte überleben: das erste (Müll-Affix weg, Qualität geklemmt)
      // und das dritte (die doppelte Sorte fällt weg).
      expect(s.relics.owned).toEqual([
        { id: 1, zone: 50, affixes: [{ id: 'click', q: 3 }] },
        { id: 5, zone: 65, affixes: [{ id: 'dps', q: 2 }] },
      ]);
      // Ein Relikt kann nie zweimal wirken, eine unbekannte Id nie einmal.
      expect(s.relics.slots).toEqual([1, 0, 0]);
      // `nextId` wird über die größte vergebene Id gehoben — sonst zeigte ein
      // Slot später auf ein FREMDES Relikt.
      expect(s.relics.nextId).toBe(6);
      expect(s.relics.pity).toBe(0);
      expect(s.relics.deepestGate).toBe(65);
      // Schmiede: nur echte Skin-Ids, Müll-Affix wird ein leerer Slot, der
      // Trocken-Zähler dort bleibt aber stehen (er ist bezahlt).
      expect(s.forge.ember).toBe(0);
      expect(Object.keys(s.forge.slots)).toEqual(['disco']);
      expect(s.forge.slots.disco).toEqual([
        { affix: { id: 'sequin', q: 2 }, dry: 0 },
        { affix: null, dry: 2 },
        { affix: null, dry: 0 },
      ]);
    },
  },
  18: {
    what: 'Pfad mit Phantom-Skin/NaN, Erbe ohne Crew-Mitglied, krummes Legenden-Level',
    damage: (raw) => {
      raw.skinPath = {
        disco: { s: 600_000, b: 700 }, // heil — muss unangetastet durchkommen
        classic: { s: Number.NaN, b: 40.7 }, // NaN-Sekunden ⇒ 0, krumme Bosse ⇒ abgerundet
        robo: { s: -900, b: -3 }, // beides negativ ⇒ das Fach fällt ganz weg
        vegasking: { s: 99_999, b: 99 }, // KEIN echter Skin ⇒ raus
        toString: { s: 10, b: 1 }, // Prototyp-Schlüssel ⇒ raus
        host: 'kaputt', // gar kein Objekt ⇒ raus
      };
      raw.heir = 'niemand'; // keine Crew-Id ⇒ ''
      raw.legend = 12.9; // krumm ⇒ abgerundet
    },
    check: (s) => {
      // Nur echte Skin-Ids mit echtem Fortschritt überleben. Die Sekunden
      // bleiben BEWUSST ungefloort (die Glue bucht Bruchteile je 0,25-s-Tick),
      // die Boss-Stückzahlen werden gefloort.
      expect(s.skinPath).toEqual({
        disco: { s: 600_000, b: 700 },
        classic: { s: 0, b: 40 },
      });
      // Eine Müll-Id hinge sonst als Geist in `heirWeightFor` und käme nie zu
      // einer Wirkung — sie wird zu „kein Erbe".
      expect(s.heir).toBe('');
      // Der Zähler ist unendlich und wird deshalb NICHT gedeckelt, nur gefloort.
      expect(s.legend).toBe(12);
    },
  },
  19: {
    what: 'Konami-Latch krumm/negativ/als String — der Einmal-Jackpot darf nie neu scharf werden',
    damage: (raw) => {
      const stats = raw.stats as Record<string, unknown>;
      stats.konami = 1.9; // krumm ⇒ abgerundet auf 1 (ein halber Tanz zählt nicht)
    },
    check: (s) => {
      // 1.9 ⇒ 1: der Latch bleibt GEZOGEN. Abrunden auf 0 wäre der Bug, der
      // den Einmal-Jackpot wieder scharf macht; NaN/negativ (⇒ 0) prüft die
      // repairStats-Konvention wie bei jedem anderen Zähler.
      expect(s.stats.konami).toBe(1);
    },
  },
};

/**
 * Gate-kritischer Schaden: `isChSave` lehnt ab, die Kette liefert `null` und der
 * Boot startet frisch. Gilt in JEDER Ära, weil diese Felder seit v1 existieren.
 */
const FATAL: readonly { readonly what: string; readonly patch: Record<string, unknown> }[] = [
  { what: 'gold NaN (JSON ⇒ null)', patch: { gold: Number.NaN } },
  { what: 'gold negativ', patch: { gold: -1 } },
  { what: 'zone 0', patch: { zone: 0 } },
  { what: 'crew kein Objekt', patch: { crew: 'garbage' } },
  { what: 'crew-Level negativ', patch: { crew: { boss: -1 } } },
  { what: 'crew-Level gebrochen', patch: { crew: { boss: 1.5 } } },
  { what: 'souls gebrochen', patch: { souls: 1.5 } },
  { what: 'killsThisZone als String', patch: { killsThisZone: '3' } },
  { what: 'lifetimeMaxZone fehlt', patch: { lifetimeMaxZone: undefined } },
  { what: 'lastSeen fehlt', patch: { lastSeen: undefined } },
  { what: 'lastSeen 0', patch: { lastSeen: 0 } },
];

// ---------------------------------------------------------------------------
// Die Matrix
// ---------------------------------------------------------------------------

describe('ch-store — X7 Migrations-Matrix', () => {
  it('deckt jede historische Schema-Version ab (Bremse für den nächsten v-Bump)', () => {
    expect(VERSIONS).toEqual(Array.from({ length: CH_SCHEMA }, (_, i) => i + 1));
    expect(VERSIONS[VERSIONS.length - 1]).toBe(CH_SCHEMA);
    for (const v of VERSIONS) expect(Object.hasOwn(BROKEN, v)).toBe(true);
  });
});

describe('ch-store — X7 Matrix: gesunde Alt-Saves laufen verlustfrei hoch', () => {
  for (const v of VERSIONS) {
    it(`v${v} → v${CH_SCHEMA}: Kernfelder exakt, jüngere Slices auf Default`, () => {
      const store = memStorage();
      store.setItem(CH_SAVE_KEY, JSON.stringify(saveAt(v)));
      const loaded = loadCh(store);
      expect(loaded).not.toBeNull();
      expect(loaded!.lastSeen).toBe(LAST_SEEN);
      expectCore(loaded!.state);
      expectSlices(loaded!.state, v);
    });
  }
});

describe('ch-store — X7 Matrix: Highwater bleibt monoton (Review-Härtung)', () => {
  it('v4-Blob mit rsLifetime ÜBER den gebankten Seelen behält den Highwater', () => {
    const storage = memStorage();
    const blob = { ...saveAt(4), rsLifetime: 500 }; // Hand-Edit/Drittquelle
    storage.setItem(CH_SAVE_KEY, JSON.stringify(blob));
    const s = loadCh(storage);
    expect(s).not.toBeNull();
    expect(s!.state.rsLifetime).toBe(500); // max(500, souls=130) — nie gesenkt
  });
});

describe('ch-store — X7 Matrix: der migrierte Stand ist ein Fixpunkt', () => {
  for (const v of VERSIONS) {
    it(`v${v}: Re-Save/Reload ändert nichts mehr (kein Feld-Drift)`, () => {
      const store = memStorage();
      store.setItem(CH_SAVE_KEY, JSON.stringify(saveAt(v)));
      const first = loadCh(store)!.state;
      saveCh(first, LAST_SEEN, store);
      const stored = JSON.parse(store.map.get(CH_SAVE_KEY)!) as Record<string, unknown>;
      expect(stored.v).toBe(CH_SCHEMA);
      const second = loadCh(store)!;
      expect(second.state).toEqual(first);
      expect(second.lastSeen).toBe(LAST_SEEN);
    });
  }
});

describe('ch-store — X7 Matrix: EIN kaputter Alt-Save pro Version', () => {
  for (const v of VERSIONS) {
    const c = BROKEN[v];
    it(`v${v}: ${c.what} — repariert, Fortschritt bleibt`, () => {
      const store = memStorage();
      const raw = saveAt(v);
      c.damage(raw);
      const json = JSON.stringify(raw);
      let loaded: ReturnType<typeof loadCh> = null;
      expect(() => {
        store.setItem(CH_SAVE_KEY, json);
        loaded = loadCh(store);
      }).not.toThrow();
      expect(loaded).not.toBeNull();
      const s = loaded!.state;
      // „Reparieren, nicht nuken": der Kern überlebt jede Slice-Reparatur.
      expectCore(s);
      c.check(s);
      // Und der reparierte Stand ist sofort wieder speicher-/ladbar.
      expect(deserializeCh(JSON.stringify({ ...s, v: CH_SCHEMA, lastSeen: LAST_SEEN }))).toEqual(s);
    });
  }
});

describe('ch-store — X7 Matrix: kaputte Gate-Felder ⇒ sauberer Frischstart', () => {
  for (const v of VERSIONS) {
    it(`v${v}: unreparierbarer Kern fällt auf null zurück, ohne zu werfen`, () => {
      const store = memStorage();
      for (const f of FATAL) {
        const json = JSON.stringify({ ...saveAt(v), ...f.patch });
        let loaded: ReturnType<typeof loadCh> = null;
        expect(() => {
          store.setItem(CH_SAVE_KEY, json);
          loaded = loadCh(store);
        }).not.toThrow();
        expect(loaded, `v${v}: ${f.what}`).toBeNull();
      }
      // Roh-NaN im JSON (kein gültiges JSON) ⇒ Parse-Fehler ⇒ ebenfalls null.
      const rawNaN = JSON.stringify(saveAt(v)).replace(`"gold":${CORE.gold}`, '"gold":NaN');
      expect(() => store.setItem(CH_SAVE_KEY, rawNaN)).not.toThrow();
      expect(loadCh(store)).toBeNull();
      expect(deserializeCh(rawNaN)).toBeNull();
    });
  }
});
