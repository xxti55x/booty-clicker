/**
 * ROADMAP-V2 A5 — „Bühne der Woche".
 *
 * Drei Dinge müssen hier bombenfest sein, weil sie WELTWEIT gleich sein sollen:
 * die Wochen-Rechnung (ISO, UTC), die Bühnen-Formel (immer eine Nicht-Boss-Bühne)
 * und die PRÄZEDENZ (auf der Wochen-Bühne ersetzen die zwei Wochen-Regeln die
 * A1-Regel — sie stapeln nicht darauf). Dazu die Wochen-Bestzone als
 * Highwater-Reduzierer und die Board-Saison-Rechnung für X4.
 */
import { describe, expect, it } from 'vitest';

import { createCombat, spawnFor } from './combat';
import { ZONES_PER_THEME } from './boss-gimmicks';
import { createMeta } from './quests';
import {
  MOD_MIN_ZONE,
  NEUTRAL_FACTORS,
  REMIX_OFF,
  STAGE_MODS,
  factorsForZone,
  modForZone,
  remixSeedFor,
  stageHpScale,
} from './stage-mods';
import {
  SEASON_EPOCH_WEEK,
  SEASON_WEEKS,
  WEEKLY_MIN_ZONE,
  WEEKLY_SPAN,
  WEEK_OFF,
  boardSeasonFor,
  combineFactors,
  isWeeklyZone,
  isoWeekOf,
  noteWeeklyBest,
  stageFactorsFor,
  stageModsFor,
  weekEndMs,
  weekIndexOf,
  weekStartMs,
  weeklyBestZone,
  weeklyBoardKey,
  weeklyHpScale,
  weeklyModsFor,
  weeklyStage,
  weeklyStageFor,
  weeklyZoneFor,
} from './weekly';

const DAY = 86_400_000;
/** Montag, 20.07.2026 00:00 UTC — Beginn von ISO 2026-W30. */
const MON_2026_W30 = Date.UTC(2026, 6, 20);
const WEEK_2026_W30 = 2951;
const REMIX = remixSeedFor(2024, 0);

describe('weekIndexOf — ISO-Wochen, UTC, Montags-Raster', () => {
  it('gibt für jeden Tag EINER Woche denselben Index', () => {
    for (let d = 0; d < 7; d++) {
      expect(weekIndexOf(MON_2026_W30 + d * DAY)).toBe(WEEK_2026_W30);
      // auch spät am Tag (23:59:59) — die Grenze liegt bei Mitternacht UTC
      expect(weekIndexOf(MON_2026_W30 + d * DAY + DAY - 1)).toBe(WEEK_2026_W30);
    }
  });

  it('wechselt exakt am Montag 00:00 UTC', () => {
    expect(weekIndexOf(MON_2026_W30 - 1)).toBe(WEEK_2026_W30 - 1);
    expect(weekIndexOf(MON_2026_W30 + 7 * DAY)).toBe(WEEK_2026_W30 + 1);
  });

  it('jeder Wochen-Beginn ist ein Montag um 00:00 UTC', () => {
    for (let w = 2900; w < 2960; w++) {
      const start = weekStartMs(w);
      expect(new Date(start).getUTCDay()).toBe(1); // 1 = Montag
      expect(start % DAY).toBe(0);
      expect(weekEndMs(w)).toBe(start + 7 * DAY);
      expect(weekIndexOf(start)).toBe(w);
      expect(weekIndexOf(weekEndMs(w) - 1)).toBe(w);
    }
  });

  it('nummeriert die ISO-Woche inkl. Jahreswechsel korrekt', () => {
    expect(isoWeekOf(WEEK_2026_W30)).toEqual({ isoYear: 2026, isoWeek: 30 });
    // 01.01.2021 (Freitag) gehört noch zu ISO 2020-W53.
    expect(isoWeekOf(weekIndexOf(Date.UTC(2021, 0, 1)))).toEqual({ isoYear: 2020, isoWeek: 53 });
    // 30.12.2024 (Montag) ist bereits ISO 2025-W01.
    expect(isoWeekOf(weekIndexOf(Date.UTC(2024, 11, 30)))).toEqual({ isoYear: 2025, isoWeek: 1 });
    // 04.01.2027 (Montag) ist ISO 2027-W01.
    expect(isoWeekOf(weekIndexOf(Date.UTC(2027, 0, 4)))).toEqual({ isoYear: 2027, isoWeek: 1 });
  });

  it('liefert für JEDE Woche eine Nummer zwischen 1 und 53', () => {
    for (let w = 2600; w < 3200; w++) {
      const { isoWeek } = isoWeekOf(w);
      expect(isoWeek).toBeGreaterThanOrEqual(1);
      expect(isoWeek).toBeLessThanOrEqual(53);
    }
  });
});

describe('weeklyZoneFor — die Bühnen-Formel', () => {
  it('trifft NIE eine Boss-Bühne und liegt immer im Fenster', () => {
    for (let w = 0; w < 600; w++) {
      const z = weeklyZoneFor(w);
      expect(z % ZONES_PER_THEME).not.toBe(0);
      expect(z).toBeGreaterThanOrEqual(WEEKLY_MIN_ZONE);
      expect(z).toBeLessThanOrEqual(WEEKLY_MIN_ZONE + WEEKLY_SPAN - 1);
      // und damit immer über der A1-Untergrenze (Bühnen < 11 tragen nie Regeln)
      expect(z).toBeGreaterThanOrEqual(MOD_MIN_ZONE);
    }
  });

  it('folgt der dokumentierten Formel 20 + (week·7 mod 60), Boss-Gates +1', () => {
    for (let w = 0; w < 120; w++) {
      const raw = WEEKLY_MIN_ZONE + ((w * 7) % WEEKLY_SPAN);
      expect(weeklyZoneFor(w)).toBe(raw % ZONES_PER_THEME === 0 ? raw + 1 : raw);
    }
  });

  it('läuft über 60 Wochen durch das ganze Fenster (kein kurzer Zyklus)', () => {
    const seen = new Set<number>();
    for (let w = 0; w < WEEKLY_SPAN; w++) seen.add(weeklyZoneFor(w));
    // 60 Restklassen, 12 davon Boss-Gates ⇒ 48 verschiedene Nicht-Boss-Bühnen.
    expect(seen.size).toBe(48);
    expect(weeklyZoneFor(WEEKLY_SPAN)).toBe(weeklyZoneFor(0)); // Zyklus schließt
  });

  it('setzt aufeinanderfolgende Wochen weit auseinander (neues Theme)', () => {
    for (let w = 0; w < 60; w++) {
      expect(weeklyZoneFor(w)).not.toBe(weeklyZoneFor(w + 1));
    }
  });
});

describe('weeklyModsFor — zwei verschiedene Regeln, weltweit gleich', () => {
  it('zieht immer GENAU ZWEI verschiedene Katalog-Einträge', () => {
    for (let w = 0; w < 500; w++) {
      const [a, b] = weeklyModsFor(w);
      expect(a.id).not.toBe(b.id);
      expect(STAGE_MODS).toContain(a);
      expect(STAGE_MODS).toContain(b);
    }
  });

  it('ist deterministisch und hängt NICHT am Spieler-Seed', () => {
    const a = weeklyModsFor(WEEK_2026_W30).map((m) => m.id);
    const b = weeklyModsFor(WEEK_2026_W30).map((m) => m.id);
    expect(a).toEqual(b);
    // Die einzige Eingabe ist die Woche: es gibt schlicht keinen Seed-Parameter.
    expect(weeklyModsFor.length).toBe(1);
  });

  it('würfelt über die Wochen breit (nutzt den ganzen Katalog)', () => {
    const used = new Set<string>();
    for (let w = 0; w < 200; w++) for (const m of weeklyModsFor(w)) used.add(m.id);
    expect(used.size).toBe(STAGE_MODS.length);
  });
});

describe('weeklyStage — die zusammengesetzte Wochen-Wahrheit', () => {
  it('setzt Bühne, Regeln, ISO-Anzeige und Fenster konsistent zusammen', () => {
    const wk = weeklyStage(MON_2026_W30 + 3 * DAY)!;
    expect(wk.week).toBe(WEEK_2026_W30);
    expect(wk.isoWeek).toBe(30);
    expect(wk.isoYear).toBe(2026);
    expect(wk.zone).toBe(weeklyZoneFor(WEEK_2026_W30));
    expect(wk.mods.map((m) => m.id)).toEqual(weeklyModsFor(WEEK_2026_W30).map((m) => m.id));
    expect(wk.startMs).toBe(MON_2026_W30);
    expect(wk.endMs).toBe(MON_2026_W30 + 7 * DAY);
  });

  it('ist mit WEEK_OFF abgeschaltet (wie REMIX_OFF bei A1)', () => {
    expect(weeklyStageFor(WEEK_OFF)).toBeNull();
    expect(weeklyStageFor(-5)).toBeNull();
    expect(weeklyStageFor(Number.NaN)).toBeNull();
    expect(isWeeklyZone(37, WEEK_OFF)).toBe(false);
  });

  it('erkennt die Wochen-Bühne und nur sie', () => {
    const z = weeklyZoneFor(WEEK_2026_W30);
    expect(isWeeklyZone(z, WEEK_2026_W30)).toBe(true);
    expect(isWeeklyZone(z + 1, WEEK_2026_W30)).toBe(false);
    expect(isWeeklyZone(z, WEEK_2026_W30 + 1)).toBe(false);
  });
});

describe('Präzedenz — auf der Wochen-Bühne ERSETZEN die Wochen-Regeln die A1-Regel', () => {
  const week = WEEK_2026_W30;
  const wz = weeklyZoneFor(week);

  it('liefert auf der Wochen-Bühne genau die zwei Wochen-Regeln', () => {
    const mods = stageModsFor(wz, REMIX, week);
    expect(mods.map((m) => m.id)).toEqual(weeklyModsFor(week).map((m) => m.id));
    expect(mods).toHaveLength(2);
  });

  it('stapelt NICHT: die A1-Regel der Bühne ist dort nicht dabei', () => {
    const a1 = modForZone(wz, REMIX)!;
    const ids = stageModsFor(wz, REMIX, week).map((m) => m.id);
    const weeklyIds = weeklyModsFor(week).map((m) => m.id);
    // Der A1-Modifikator taucht nur auf, wenn er zufällig selbst gezogen wurde.
    expect(ids).toEqual(weeklyIds);
    if (!weeklyIds.includes(a1.id)) expect(ids).not.toContain(a1.id);
    expect(ids.length).toBe(2); // niemals drei Regeln gleichzeitig
  });

  it('lässt JEDE andere Bühne byte-gleich zu A1', () => {
    for (let z = 1; z <= 120; z++) {
      if (z === wz) continue;
      const a1 = modForZone(z, REMIX);
      expect(stageModsFor(z, REMIX, week).map((m) => m.id)).toEqual(a1 ? [a1.id] : []);
      expect(stageFactorsFor(z, REMIX, week)).toEqual(factorsForZone(z, REMIX));
    }
  });

  it('ist mit WEEK_OFF überall byte-gleich zu A1', () => {
    for (let z = 1; z <= 120; z++) {
      expect(stageFactorsFor(z, REMIX, WEEK_OFF)).toEqual(factorsForZone(z, REMIX));
      expect(weeklyHpScale(z, REMIX, WEEK_OFF)).toBe(stageHpScale(z, REMIX));
    }
  });

  it('gilt auch ohne A1-Remix: die Wochen-Bühne trägt ihre Regeln immer', () => {
    // REMIX_OFF schaltet A1 ab — die Wochen-Bühne bleibt davon unberührt, sie
    // hängt am Kalender, nicht am Lauf.
    expect(stageModsFor(wz, REMIX_OFF, week)).toHaveLength(2);
    expect(stageModsFor(wz + 1, REMIX_OFF, week)).toHaveLength(0);
  });
});

describe('combineFactors — zwei gestapelte Regeln', () => {
  it('ist neutral ohne Regel und identisch bei genau einer', () => {
    expect(combineFactors([])).toEqual(NEUTRAL_FACTORS);
    expect(combineFactors([STAGE_MODS[0]])).toEqual(STAGE_MODS[0].f);
  });

  it('multipliziert die Multiplikatoren und addiert crit/beat', () => {
    const gold = STAGE_MODS.find((m) => m.id === 'goldrausch')!;
    const krit = STAGE_MODS.find((m) => m.id === 'krit-funken')!;
    const f = combineFactors([gold, krit]);
    expect(f.gold).toBeCloseTo(gold.f.gold * krit.f.gold, 12);
    expect(f.comboDecay).toBeCloseTo(gold.f.comboDecay * krit.f.comboDecay, 12);
    expect(f.crit).toBeCloseTo(gold.f.crit + krit.f.crit, 12);
    const beat = STAGE_MODS.find((m) => m.id === 'beat-nacht')!;
    expect(combineFactors([beat, krit]).beat).toBeCloseTo(beat.f.beat + krit.f.beat, 12);
  });

  it('ist reihenfolge-unabhängig', () => {
    const [a, b] = [STAGE_MODS[1], STAGE_MODS[3]];
    expect(combineFactors([a, b])).toEqual(combineFactors([b, a]));
  });

  it('bleibt in jeder Woche in einem gesunden Fenster (Balance-Schranke)', () => {
    for (let w = 1; w < 400; w++) {
      const f = combineFactors(weeklyModsFor(w));
      expect(f.hp).toBeGreaterThanOrEqual(0.6);
      expect(f.hp).toBeLessThanOrEqual(1.5);
      expect(f.gold).toBeGreaterThanOrEqual(0.6);
      expect(f.gold).toBeLessThanOrEqual(1.9);
      expect(f.dps).toBeGreaterThanOrEqual(0.8);
      expect(f.crit).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('combat.spawnFor — die Wochen-Regeln stehen in der Ausdauer', () => {
  const week = WEEK_2026_W30;
  const wz = weeklyZoneFor(week);

  it('spawnt Rivalen der Wochen-Bühne mit dem kombinierten HP-Faktor', () => {
    const withWeek = spawnFor(wz, 0, wz, REMIX, week);
    const a1Only = spawnFor(wz, 0, wz, REMIX, WEEK_OFF);
    const expected = combineFactors(weeklyModsFor(week)).hp / factorsForZone(wz, REMIX).hp;
    expect(withWeek.hpMax / a1Only.hpMax).toBeCloseTo(expected, 9);
    expect(withWeek.week).toBe(week);
  });

  it('lässt jede andere Bühne unverändert', () => {
    for (const z of [12, 13, 21, 44, 61]) {
      if (z === wz) continue;
      expect(spawnFor(z, 0, z, REMIX, week).hpMax).toBe(spawnFor(z, 0, z, REMIX, WEEK_OFF).hpMax);
    }
  });

  it('trägt den Wochen-Index durch jeden Re-Spawn (Default = aus)', () => {
    expect(createCombat(1, REMIX).week).toBe(WEEK_OFF);
    expect(createCombat(1, REMIX, week).week).toBe(week);
    expect(spawnFor(30, 0, 30, REMIX).week).toBe(WEEK_OFF);
  });

  it('lässt Boss-Bühnen unberührt (sie tragen nie eine Regel)', () => {
    const boss = spawnFor(40, 10, 40, REMIX, week);
    expect(boss.boss).toBe(true);
    expect(boss.hpMax).toBe(spawnFor(40, 10, 40, REMIX, WEEK_OFF).hpMax);
  });
});

describe('noteWeeklyBest — Frontier-Highwater pro Woche', () => {
  it('zählt in derselben Woche nur nach oben', () => {
    let m = noteWeeklyBest(createMeta(), 2951, 40);
    expect(m.weekIndex).toBe(2951);
    expect(m.weekBestZone).toBe(40);
    m = noteWeeklyBest(m, 2951, 55);
    expect(m.weekBestZone).toBe(55);
    // Rückreise auf Bühne 12 senkt die Wochen-Bestzone NICHT.
    const same = noteWeeklyBest(m, 2951, 12);
    expect(same).toBe(m); // gleiche Referenz ⇒ kein unnötiger Save-Schreiber
    expect(same.weekBestZone).toBe(55);
  });

  it('startet mit der neuen Woche neu (kein Timer, nur der Vergleich)', () => {
    const m = noteWeeklyBest(createMeta(), 2951, 55);
    const next = noteWeeklyBest(m, 2952, 18);
    expect(next.weekIndex).toBe(2952);
    expect(next.weekBestZone).toBe(18);
  });

  it('behandelt eine rückwärts gestellte Uhr wie jeden anderen Wochenwechsel', () => {
    const m = noteWeeklyBest(createMeta(), 2951, 55);
    const back = noteWeeklyBest(m, 2950, 20);
    expect(back.weekIndex).toBe(2950);
    expect(back.weekBestZone).toBe(20);
  });

  it('lässt den übrigen Meta-Slice unangetastet und wirft nie', () => {
    const base = { ...createMeta(), streak: 5, streakProtectWeek: 2898 };
    const m = noteWeeklyBest(base, 2951, 40);
    expect(m.streak).toBe(5);
    expect(m.streakProtectWeek).toBe(2898);
    expect(noteWeeklyBest(base, Number.NaN, 40)).toBe(base);
    expect(noteWeeklyBest(base, 2951, Number.NaN)).toBe(base);
  });

  it('liest die Bestzone nur für die passende Woche', () => {
    const m = noteWeeklyBest(createMeta(), 2951, 55);
    expect(weeklyBestZone(m, 2951)).toBe(55);
    expect(weeklyBestZone(m, 2952)).toBe(0);
    expect(weeklyBestZone(createMeta(), 2951)).toBe(0);
  });
});

describe('Board-Saisons + Board-Schlüssel (X4)', () => {
  it('startet Saison 1 in der Epoch-Woche und zählt in 13er-Blöcken', () => {
    expect(boardSeasonFor(SEASON_EPOCH_WEEK).number).toBe(1);
    expect(boardSeasonFor(SEASON_EPOCH_WEEK + SEASON_WEEKS - 1).number).toBe(1);
    expect(boardSeasonFor(SEASON_EPOCH_WEEK + SEASON_WEEKS).number).toBe(2);
    expect(boardSeasonFor(WEEK_2026_W30).number).toBe(7);
  });

  it('spannt ein lückenloses Fenster und endet an einem Montag', () => {
    for (let s = 0; s < 12; s++) {
      const season = boardSeasonFor(SEASON_EPOCH_WEEK + s * SEASON_WEEKS + 3);
      expect(season.lastWeek - season.firstWeek).toBe(SEASON_WEEKS - 1);
      expect(season.endMs).toBe(weekStartMs(season.lastWeek + 1));
      expect(new Date(season.endMs).getUTCDay()).toBe(1);
      // lückenlos: das Ende der einen Saison ist der Beginn der nächsten
      expect(boardSeasonFor(season.lastWeek + 1).firstWeek).toBe(season.lastWeek + 1);
    }
  });

  it('zeigt vor der Epoche (verstellte Uhr) nie eine Saison < 1', () => {
    expect(boardSeasonFor(0).number).toBe(1);
    expect(boardSeasonFor(-99).number).toBe(1);
    expect(boardSeasonFor(Number.NaN).number).toBe(1);
  });

  it('baut je Woche einen eigenen Board-Schlüssel', () => {
    expect(weeklyBoardKey(WEEK_2026_W30)).toBe('weekly-2951');
    expect(weeklyBoardKey(WEEK_2026_W30 + 1)).not.toBe(weeklyBoardKey(WEEK_2026_W30));
    // Der Schlüssel muss durch den Server-Filter passen (klein, [a-z0-9-]).
    for (let w = 0; w < 200; w++) expect(weeklyBoardKey(w)).toMatch(/^[a-z0-9-]{1,24}$/);
  });
});
