import { describe, expect, it } from 'vitest';

import { themeForZone } from './boss-gimmicks';
import {
  REP_BASE,
  REP_GROWTH,
  REP_PER_BOSS,
  REP_PER_RIVAL,
  TERRITORY_GOLD_PER_RANK,
  TERRITORY_MAX_RANK,
  THEMES,
  TROPHY_MIN_RANK,
  ZONE_THEMES,
  addRep,
  createTerritory,
  isThemeKey,
  rankOf,
  repForKill,
  repForRank,
  repOf,
  territoryGoldMult,
  territoryGoldMultForTheme,
  territoryPowerBudget,
  territoryProgress,
  territoryRank,
  territoryTitle,
  themeConfig,
  titleForRank,
  trophyTier,
} from './territory';

describe('territory — der Katalog (1b)', () => {
  it('kennt genau die vier Bühnen-Themen des Spiels, in Rotations-Reihenfolge', () => {
    expect(THEMES.map((t) => t.id)).toEqual([...ZONE_THEMES]);
    expect(ZONE_THEMES).toEqual(['club', 'synth', 'beach', 'space']);
    for (const cfg of THEMES) {
      expect(themeConfig(cfg.id)).toBe(cfg);
      expect(cfg.short.length).toBeGreaterThan(0);
      expect(cfg.icon.length).toBeGreaterThan(0);
    }
    expect(themeConfig('vegas')).toBeUndefined();
    expect(isThemeKey('club')).toBe(true);
    expect(isThemeKey('vegas')).toBe(false);
    expect(isThemeKey(7)).toBe(false);
  });

  it('liest das Theme einer Bühne aus DER Quelle des Spiels (keine zweite Formel)', () => {
    // `themeForZone` ist re-exportiert, nicht nachgebaut — dieselbe Zuordnung wie
    // Kulisse, Zonen-Strip und Boss-Gimmick.
    for (const zone of [1, 5, 6, 12, 18, 21, 37, 100]) {
      expect(territoryGoldMultForTheme({}, themeForZone(zone))).toBe(territoryGoldMult({}, zone));
    }
  });
});

describe('territory — Ruf entsteht nur aus Kills', () => {
  it('bucht Rivalen und Bosse in ihrem Verhältnis (1 : 10)', () => {
    expect(repForKill(false)).toBe(REP_PER_RIVAL);
    expect(repForKill(true)).toBe(REP_PER_BOSS);
    expect(REP_PER_BOSS).toBe(10 * REP_PER_RIVAL);
  });

  it('ist rein und monoton — nichts kann Ruf verringern', () => {
    const t0 = createTerritory();
    const t1 = addRep(t0, 'club', 5);
    expect(t0).toEqual({}); // die alte Tafel bleibt stehen
    expect(repOf(t1, 'club')).toBe(5);
    expect(addRep(t1, 'club', 0)).toBe(t1); // kein Gewinn ⇒ dieselbe Referenz
    expect(addRep(t1, 'club', -20)).toBe(t1);
    expect(addRep(t1, 'club', Number.NaN)).toBe(t1);
    expect(repOf(addRep(t1, 'club', 2.9), 'club')).toBe(7); // krumm ⇒ abgerundet
  });

  it('kennt nur die vier echten Themen (ein erfundenes Gebiet bekommt kein Konto)', () => {
    const t = addRep(createTerritory(), 'vegas', 500);
    expect(t).toEqual({});
    expect(repOf({ vegas: 500 }, 'vegas')).toBe(500); // roh lesbar …
    expect(rankOf({ vegas: 500 }, 'vegas')).toBe(2); // … aber es gibt keine Vegas-Bühne
  });

  it('liest kaputte Zähler defensiv als 0', () => {
    expect(repOf({ club: Number.NaN }, 'club')).toBe(0);
    expect(repOf({ club: -5 }, 'club')).toBe(0);
    expect(repOf({}, 'club')).toBe(0);
  });
});

describe('territory — die Kurve ist logarithmisch', () => {
  it('wächst geometrisch mit REP_GROWTH je Stufe', () => {
    for (let r = 2; r <= TERRITORY_MAX_RANK; r++) {
      const ratio = repForRank(r) / repForRank(r - 1);
      expect(ratio).toBeGreaterThan(REP_GROWTH - 0.02);
      expect(ratio).toBeLessThan(REP_GROWTH + 0.02);
    }
    expect(repForRank(1)).toBe(REP_BASE);
    expect(repForRank(0)).toBe(0);
    expect(repForRank(TERRITORY_MAX_RANK + 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('friert die gemessene Leiter ein (Stufe 10 = Wochen, nicht Stunden)', () => {
    // Gegen die Bot-Messung geeicht (~530 Ruf/h auf dem stärksten Theme):
    // Stufe 1 in der ersten Sitzung, Stufe 10 nach ~94 h aktivem Spiel.
    expect(repForRank(1)).toBe(250);
    expect(repForRank(3)).toBe(810);
    expect(repForRank(10)).toBe(49_590);
  });

  it('stuft jeden Ruf-Stand richtig ein und klemmt bei Stufe 10', () => {
    expect(territoryRank(0)).toBe(0);
    expect(territoryRank(repForRank(1) - 1)).toBe(0);
    expect(territoryRank(repForRank(1))).toBe(1);
    expect(territoryRank(repForRank(5) + 1)).toBe(5);
    expect(territoryRank(repForRank(10) * 1000)).toBe(TERRITORY_MAX_RANK);
    expect(territoryRank(Number.NaN)).toBe(0);
    expect(territoryRank(-5)).toBe(0);
  });
});

describe('territory — die Wirkung bleibt theme-gebunden (kein Global-Creep)', () => {
  it('zahlt +1,5 % BP je Stufe, aber NUR auf Bühnen des eigenen Themes', () => {
    const t = { club: repForRank(10) }; // Club voll ausgebaut
    expect(territoryGoldMult(t, 1)).toBeCloseTo(1.15, 10); // Bühne 1–5: Club
    expect(territoryGoldMult(t, 5)).toBeCloseTo(1.15, 10);
    expect(territoryGoldMult(t, 6)).toBe(1); // Synth
    expect(territoryGoldMult(t, 12)).toBe(1); // Beach
    expect(territoryGoldMult(t, 18)).toBe(1); // Space
    expect(territoryGoldMult(t, 21)).toBeCloseTo(1.15, 10); // zweite Club-Runde
  });

  it('friert das Budget ein: ×1.15 auf einer Theme-Bühne, auch bei VOLL-Ausbau aller vier', () => {
    expect(territoryPowerBudget()).toBeCloseTo(1.15, 10);
    expect(territoryPowerBudget()).toBeLessThanOrEqual(1.15);
    expect(TERRITORY_GOLD_PER_RANK * TERRITORY_MAX_RANK).toBeCloseTo(0.15, 10);
    // Alle vier Leisten auf Stufe 10 — auf JEDER Bühne bleibt es bei ×1.15,
    // weil ein Kill immer genau EINEM Theme gehört (kein Produkt über die vier).
    const all = Object.fromEntries(ZONE_THEMES.map((id) => [id, repForRank(10)]));
    for (let zone = 1; zone <= 40; zone++) {
      expect(territoryGoldMult(all, zone)).toBeCloseTo(territoryPowerBudget(), 10);
    }
  });

  it('ist ohne Ruf exakt neutral (ein Save vor 1b rechnet bit-gleich weiter)', () => {
    for (let zone = 1; zone <= 25; zone++) expect(territoryGoldMult({}, zone)).toBe(1);
  });
});

describe('territory — Titel, Trophäe, Fortschritt', () => {
  it('setzt den Kurznamen vor den Titel — genau das Beispiel des Ideen-Dokuments', () => {
    expect(territoryTitle('club', TERRITORY_MAX_RANK)).toBe('Club-Legende');
    expect(territoryTitle('beach', 5)).toBe('Beach-Hausherr');
    expect(territoryTitle('club', 0)).toBe(''); // ohne Rang kein Titel
    expect(territoryTitle('vegas', 5)).toBe('');
    expect(titleForRank(1)).toBe('Gast');
    expect(titleForRank(TERRITORY_MAX_RANK)).toBe('Legende');
  });

  it('stellt die Trophäe in drei sichtbaren Sprüngen auf', () => {
    expect(trophyTier(TROPHY_MIN_RANK - 1)).toBe(0);
    expect(trophyTier(TROPHY_MIN_RANK)).toBe(1);
    expect(trophyTier(5)).toBe(1);
    expect(trophyTier(6)).toBe(2);
    expect(trophyTier(9)).toBe(2);
    expect(trophyTier(TERRITORY_MAX_RANK)).toBe(3);
  });

  it('rechnet den Fortschritt in der laufenden Stufe (für die Leiste)', () => {
    const at5 = repForRank(5);
    const at6 = repForRank(6);
    const p = territoryProgress(at5 + (at6 - at5) / 2);
    expect(p.rank).toBe(5);
    expect(p.at).toBe(at5);
    expect(p.next).toBe(at6);
    expect(p.frac).toBeCloseTo(0.5, 2);
    expect(p.title).toBe('Hausherr');
    expect(p.goldMult).toBeCloseTo(1.075, 10);
    expect(p.trophy).toBe(1);
    // Stufe 10: kein „nächstes" mehr, die Leiste steht voll.
    const full = territoryProgress(repForRank(10) + 12_345);
    expect(full.rank).toBe(TERRITORY_MAX_RANK);
    expect(full.next).toBe(0);
    expect(full.frac).toBe(1);
    expect(full.trophy).toBe(3);
    // Und ein leeres Konto kippt nichts um.
    const none = territoryProgress(0);
    expect(none).toMatchObject({ rank: 0, rep: 0, title: '', at: 0, frac: 0, goldMult: 1 });
  });
});
