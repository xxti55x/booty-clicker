/**
 * Crew-Meisterschaft (IDEEN-GAMEPLAY 1a) — die pure Rang-Arithmetik.
 *
 * Hier steht, was NICHT verrutschen darf: die Schwellen selbst, die Leitplanke
 * „≤ +6 % Eigen-Output", die Monotonie des Highwaters und die Kante, an der der
 * Legenden-Rang die Gratis-Erststufe einschaltet. Die crew-seitige Anwendung
 * (DPS-Faltung, `grantFreeMasteryTiers`) testet `heroes.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  HEIR_WEIGHT,
  MASTERY_DPS_PER_RANK,
  MASTERY_DPS_RANKS,
  MASTERY_MAX_DPS_BONUS,
  MASTERY_RANKS,
  addMastery,
  createMastery,
  masteryFreeFirstTier,
  masteryOwnMult,
  masteryProgress,
  masteryRank,
  masteryRankConfig,
} from './mastery';

describe('mastery — die Rang-Leiter', () => {
  it('hat vier aufsteigende Schwellen mit deutschen Namen', () => {
    expect(MASTERY_RANKS.map((r) => r.id)).toEqual(['bronze', 'silber', 'gold', 'legende']);
    expect(MASTERY_RANKS.map((r) => r.name)).toEqual(['Bronze', 'Silber', 'Gold', 'Legende']);
    for (let i = 1; i < MASTERY_RANKS.length; i++) {
      expect(MASTERY_RANKS[i].at).toBeGreaterThan(MASTERY_RANKS[i - 1].at);
    }
  });

  it('hält die gemessenen Kalibrier-Schwellen fest (Bronze erste Sitzung … Legende Wochen)', () => {
    // Messung (npm run balance, Profil SIM_ACTIVE): ~170–235 Einsatz-XP im
    // stärksten Mitglied nach EINER 45-min-Sitzung, danach ~450 je Lauf. Wandern
    // diese Zahlen, muss die Messung neu gefahren werden — deshalb stehen sie
    // hier als bewusster Pin und nicht nur im Modul-Kommentar.
    expect(MASTERY_RANKS.map((r) => r.at)).toEqual([150, 1_200, 8_000, 60_000]);
  });

  it('liest den Rang exakt an jeder Schwelle (Kante gehört zum höheren Rang)', () => {
    expect(masteryRank(0)).toBe(0);
    expect(masteryRank(149)).toBe(0);
    expect(masteryRank(150)).toBe(1);
    expect(masteryRank(1_199)).toBe(1);
    expect(masteryRank(1_200)).toBe(2);
    expect(masteryRank(7_999)).toBe(2);
    expect(masteryRank(8_000)).toBe(3);
    expect(masteryRank(59_999)).toBe(3);
    expect(masteryRank(60_000)).toBe(4);
    expect(masteryRank(10_000_000)).toBe(4); // endlos, aber gedeckelt
  });

  it('wirft bei kaputten Eingaben nicht (der Renderpfad fragt sie viermal je Sekunde)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5, -0.001]) {
      expect(masteryRank(bad)).toBe(0);
      expect(masteryOwnMult(bad)).toBe(1);
      expect(masteryFreeFirstTier(bad)).toBe(false);
      expect(masteryProgress(bad).xp).toBe(0);
    }
    // Unendlich ist kein Rang 4 — der Guard fängt es vor der Schwellen-Schleife.
    expect(masteryRankConfig(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('liefert die Rang-Konfiguration bzw. null unterhalb von Bronze', () => {
    expect(masteryRankConfig(10)).toBeNull();
    expect(masteryRankConfig(150)?.id).toBe('bronze');
    expect(masteryRankConfig(60_000)?.id).toBe('legende');
  });
});

describe('mastery — die Perks bleiben in der Leitplanke', () => {
  it('zahlt +2 % je Rang, aber nur für die ersten drei Ränge (≤ +6 %)', () => {
    expect(masteryOwnMult(0)).toBe(1);
    expect(masteryOwnMult(150)).toBeCloseTo(1.02, 12);
    expect(masteryOwnMult(1_200)).toBeCloseTo(1.04, 12);
    expect(masteryOwnMult(8_000)).toBeCloseTo(1.06, 12);
    // Legende zahlt KEINEN weiteren Prozentpunkt — nur den Gratis-Slot.
    expect(masteryOwnMult(60_000)).toBeCloseTo(1.06, 12);
    expect(masteryOwnMult(1e9)).toBeCloseTo(1 + MASTERY_MAX_DPS_BONUS, 12);
  });

  it('deckelt den Prozent-Perk exakt bei der dokumentierten Leitplanke', () => {
    expect(MASTERY_DPS_PER_RANK).toBe(0.02);
    expect(MASTERY_DPS_RANKS).toBe(3);
    expect(MASTERY_MAX_DPS_BONUS).toBeCloseTo(0.06, 12);
    // „≤ +6 % gesamt" (Ideen-Dokument): kein XP-Betrag hebt darüber hinaus.
    for (const xp of [0, 1, 149, 150, 1_200, 8_000, 60_000, 1e6, 1e12]) {
      expect(masteryOwnMult(xp)).toBeLessThanOrEqual(1 + MASTERY_MAX_DPS_BONUS + 1e-12);
    }
  });

  it('schaltet die Gratis-Erststufe genau ab dem Legenden-Rang ein', () => {
    expect(masteryFreeFirstTier(59_999)).toBe(false);
    expect(masteryFreeFirstTier(60_000)).toBe(true);
  });
});

describe('mastery — der Highwater ist monoton', () => {
  it('bucht gekaufte Level auf und lässt die alte Tafel stehen (rein)', () => {
    const a = createMastery();
    const b = addMastery(a, 'boss', 40);
    const c = addMastery(b, 'boss', 110);
    expect(a).toEqual({});
    expect(b).toEqual({ boss: 40 });
    expect(c).toEqual({ boss: 150 });
    expect(masteryRank(c.boss)).toBe(1); // die Bronze-Kante fällt beim Summieren
  });

  it('kennt keinen Abzug: 0, negative und krumme Beträge lassen sie unverändert', () => {
    const m = addMastery(createMastery(), 'dj', 300);
    expect(addMastery(m, 'dj', 0)).toBe(m);
    expect(addMastery(m, 'dj', -100)).toBe(m);
    expect(addMastery(m, 'dj', Number.NaN)).toBe(m);
    expect(addMastery(m, 'dj', 0.9)).toBe(m); // < 1 ganzer Level ⇒ nichts
    expect(addMastery(m, 'dj', 2.7)).toEqual({ dj: 302 }); // sonst abgerundet
  });

  it('bleibt über viele Buchungen exakt gleich der Summe der Käufe', () => {
    let m = createMastery();
    let sum = 0;
    for (let i = 1; i <= 200; i++) {
      const n = (i % 7) + 1;
      m = addMastery(m, 'hype', n);
      sum += n;
      expect(m.hype).toBe(sum);
    }
    // Monotonie über die ganze Kette: nie gesunken.
    expect(m.hype).toBe(sum);
  });

  it('führt Mitglieder getrennt (die Meisterschaft ist per Mitglied, nicht global)', () => {
    let m = createMastery();
    m = addMastery(m, 'boss', 200);
    m = addMastery(m, 'legend', 10);
    expect(masteryRank(m.boss)).toBe(1);
    expect(masteryRank(m.legend ?? 0)).toBe(0);
  });
});

describe('mastery — Fortschritt für Card und Tooltip', () => {
  it('zeigt unterhalb von Bronze den Weg zum ersten Rang', () => {
    const p = masteryProgress(40);
    expect(p).toEqual({ rank: 0, name: '', id: null, xp: 40, next: 150, nextName: 'Bronze' });
  });

  it('zeigt zwischen zwei Rängen Name und nächste Schwelle', () => {
    const p = masteryProgress(1_240);
    expect(p.rank).toBe(2);
    expect(p.name).toBe('Silber');
    expect(p.id).toBe('silber');
    expect(p.xp).toBe(1_240);
    expect(p.next).toBe(8_000);
    expect(p.nextName).toBe('Gold');
  });

  it('meldet bei Legende, dass es nichts mehr zu erreichen gibt', () => {
    const p = masteryProgress(75_000);
    expect(p.rank).toBe(4);
    expect(p.name).toBe('Legende');
    expect(p.next).toBe(0);
    expect(p.nextName).toBe('');
  });

  it('rundet krumme Stände ab, statt sie anzuzeigen', () => {
    expect(masteryProgress(1_240.9).xp).toBe(1_240);
  });
});

describe('Erben-Gewichtung (3c)', () => {
  it('verdoppelt die Perk-Wirkung — und nur die des Erben', () => {
    const gold = MASTERY_RANKS[2].at; // Gold ⇒ der Prozent-Perk steht am Deckel
    expect(masteryOwnMult(gold)).toBeCloseTo(1 + MASTERY_MAX_DPS_BONUS, 12);
    expect(masteryOwnMult(gold, HEIR_WEIGHT)).toBeCloseTo(1 + 2 * MASTERY_MAX_DPS_BONUS, 12);
    expect(masteryOwnMult(gold, 1)).toBeCloseTo(1 + MASTERY_MAX_DPS_BONUS, 12);
  });

  it('hebt den Deckel MIT — der Erbe darf +12 % statt +6 %', () => {
    expect(masteryOwnMult(MASTERY_RANKS[3].at, HEIR_WEIGHT)).toBeCloseTo(1.12, 12);
  });

  it('verdoppelt auf jeder Stufe der Leiter, nicht nur oben', () => {
    for (const [i, cfg] of MASTERY_RANKS.entries()) {
      const base = MASTERY_DPS_PER_RANK * Math.min(MASTERY_DPS_RANKS, i + 1);
      expect(masteryOwnMult(cfg.at, HEIR_WEIGHT) - 1).toBeCloseTo(2 * base, 12);
    }
  });

  it('macht aus einem Mitglied OHNE Rang keinen Bonus (doppelt null ist null)', () => {
    expect(masteryOwnMult(0, HEIR_WEIGHT)).toBe(1);
    expect(masteryOwnMult(MASTERY_RANKS[0].at - 1, HEIR_WEIGHT)).toBe(1);
  });

  it('klemmt ein unsinniges Gewicht auf den Erlaubten-Bereich statt zu werfen', () => {
    const gold = MASTERY_RANKS[2].at;
    expect(masteryOwnMult(gold, 0)).toBeCloseTo(masteryOwnMult(gold), 12);
    expect(masteryOwnMult(gold, -4)).toBeCloseTo(masteryOwnMult(gold), 12);
    expect(masteryOwnMult(gold, Number.NaN)).toBeCloseTo(masteryOwnMult(gold), 12);
    // Ein gebasteltes Riesen-Gewicht kann den Perk nicht über die Verdopplung heben.
    expect(masteryOwnMult(gold, 99)).toBeCloseTo(masteryOwnMult(gold, HEIR_WEIGHT), 12);
  });
});
