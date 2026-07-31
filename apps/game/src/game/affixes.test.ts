/**
 * Der geteilte Affix-Pool (1c + 3a): Katalog-Form, Qualitäts-Ziehung, das
 * Qualitäts-Pity und — der eigentliche Punkt — die eingefrorenen Budget-Zahlen.
 */
import { describe, expect, it } from 'vitest';

import {
  AFFIXES,
  AFFIX_STAT_CAP,
  FORGE_SLOTS,
  MAX_QUALITY,
  MAX_WORN_AFFIXES,
  QUALITIES,
  QUALITY_PITY_ROLLS,
  RELIC_MAX_AFFIXES,
  RELIC_SLOTS,
  SHARED_AFFIXES,
  affixBossBudget,
  affixConfig,
  affixMaxValue,
  affixOfflineBudget,
  affixPowerBudget,
  affixSingleTermBudget,
  affixValue,
  clampQuality,
  foldAffixes,
  forgePool,
  isAffixId,
  minQualityForDry,
  nextDry,
  pickAffixId,
  rollAffix,
  rollQuality,
} from './affixes';
import { PERCENT_STATS } from './gear';

describe('affixes — der Katalog', () => {
  it('hält die Leitplanke „8–10 geteilte + 2–3 skin-exklusive"', () => {
    expect(SHARED_AFFIXES.length).toBeGreaterThanOrEqual(8);
    expect(SHARED_AFFIXES.length).toBeLessThanOrEqual(10);
    const exclusive = AFFIXES.filter((a) => a.skin !== undefined);
    expect(exclusive.length).toBeGreaterThanOrEqual(2);
    expect(exclusive.length).toBeLessThanOrEqual(3);
  });

  it('vergibt jede Id genau einmal und jeder Eintrag hat eine positive Basis', () => {
    const ids = AFFIXES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of AFFIXES) expect(a.base).toBeGreaterThan(0);
  });

  it('kennt seine eigenen Ids und keine fremden', () => {
    for (const a of AFFIXES) expect(isAffixId(a.id)).toBe(true);
    expect(isAffixId('vegas')).toBe(false);
    expect(isAffixId('toString')).toBe(false); // kein Prototyp-Durchgriff
    expect(isAffixId(undefined)).toBe(false);
    expect(affixConfig('vegas')).toBeUndefined();
  });

  it('Schmiede-Pool = geteilte Sorten + die EINE exklusive dieses Skins', () => {
    // Disco hat „Sequin-Crit", Lava „Glut-DoT", Robo „Servo-Takt".
    expect(forgePool('disco').length).toBe(SHARED_AFFIXES.length + 1);
    expect(forgePool('disco').some((a) => a.id === 'sequin')).toBe(true);
    expect(forgePool('disco').some((a) => a.id === 'glut')).toBe(false);
    // Ein Skin ohne eigene Sorte sieht genau den geteilten Pool.
    expect(forgePool('classic')).toEqual(SHARED_AFFIXES);
    // Relikte sehen NIE eine exklusive Sorte.
    expect(SHARED_AFFIXES.every((a) => a.skin === undefined)).toBe(true);
  });

  it('die skin-exklusiven Sorten liegen auf Termen außerhalb des Leistungs-Produkts', () => {
    // Genau das hält das Budget: Ein starker Roll auf einem Term, der sich mit
    // allen anderen multipliziert, hatte in einer früheren Fassung ×1.58 ergeben.
    const inProduct = new Set(['clickPct', 'dpsPct', 'goldPct']);
    for (const a of AFFIXES.filter((x) => x.skin !== undefined)) {
      expect(inProduct.has(a.stat)).toBe(false);
    }
  });
});

describe('affixes — Qualität', () => {
  it('vier Stufen, monoton steigende Faktoren, Gewichte in Prozent', () => {
    expect(QUALITIES.length).toBe(4);
    expect(MAX_QUALITY).toBe(3);
    for (let i = 1; i < QUALITIES.length; i++) {
      expect(QUALITIES[i].factor).toBeGreaterThan(QUALITIES[i - 1].factor);
      expect(QUALITIES[i].weight).toBeLessThan(QUALITIES[i - 1].weight);
    }
    expect(QUALITIES.reduce((a, q) => a + q.weight, 0)).toBe(100);
    // Die dokumentierte Spanne: Makellos ist exakt 2,5-mal Grob.
    expect(QUALITIES[3].factor / QUALITIES[0].factor).toBeCloseTo(2.5, 10);
    // „Makellos" IST die Basis — der Katalog-Wert ist zugleich der Höchstwert.
    expect(QUALITIES[3].factor).toBe(1);
  });

  it('klemmt jede kaputte Stufe auf den gültigen Bereich', () => {
    expect(clampQuality(-4)).toBe(0);
    expect(clampQuality(99)).toBe(MAX_QUALITY);
    expect(clampQuality(1.9)).toBe(1);
    expect(clampQuality(Number.NaN)).toBe(0);
    expect(clampQuality('gut')).toBe(0);
  });

  it('rollQuality trifft die Gewichte und respektiert das Mindest-Niveau', () => {
    // Gewichte 45/30/18/7 ⇒ die Grenzen liegen bei 0.45 / 0.75 / 0.93.
    expect(rollQuality(0)).toBe(0);
    expect(rollQuality(0.44)).toBe(0);
    expect(rollQuality(0.46)).toBe(1);
    expect(rollQuality(0.74)).toBe(1);
    expect(rollQuality(0.76)).toBe(2);
    expect(rollQuality(0.94)).toBe(3);
    // Mit Mindest-Niveau fällt nichts mehr darunter, die Verteilung renormiert.
    for (let i = 0; i <= 100; i++) expect(rollQuality(i / 100, 2)).toBeGreaterThanOrEqual(2);
    // Am Endpunkt des Pity ist „Makellos" deterministisch.
    for (let i = 0; i <= 100; i++) expect(rollQuality(i / 100, MAX_QUALITY)).toBe(MAX_QUALITY);
  });

  it('entartete Floats klemmen, statt undefined zu liefern', () => {
    expect(rollQuality(Number.NaN)).toBe(0);
    expect(rollQuality(1.5)).toBe(MAX_QUALITY);
    expect(rollQuality(-1)).toBe(0);
    expect(pickAffixId(SHARED_AFFIXES, Number.NaN)).toBe(SHARED_AFFIXES[0].id);
    expect(pickAffixId(SHARED_AFFIXES, 1.5)).toBe(SHARED_AFFIXES[SHARED_AFFIXES.length - 1].id);
    expect(pickAffixId([], 0.5)).toBe(SHARED_AFFIXES[0].id);
  });

  it('affixValue = Basis × Faktor, Müll-Ids sind 0', () => {
    const cfg = affixConfig('click')!;
    expect(affixValue({ id: 'click', q: 3 })).toBeCloseTo(cfg.base, 10);
    expect(affixValue({ id: 'click', q: 0 })).toBeCloseTo(cfg.base * 0.4, 10);
    expect(affixValue({ id: 'vegas', q: 3 })).toBe(0);
    expect(affixMaxValue(cfg)).toBeCloseTo(cfg.base, 10);
  });
});

describe('affixes — Qualitäts-Pity (die exakte Regel)', () => {
  it('hebt die Mindest-Qualität je 5 trockene Rolls um eine Stufe', () => {
    expect(QUALITY_PITY_ROLLS).toBe(5);
    expect(minQualityForDry(0)).toBe(0);
    expect(minQualityForDry(4)).toBe(0);
    expect(minQualityForDry(5)).toBe(1);
    expect(minQualityForDry(9)).toBe(1);
    expect(minQualityForDry(10)).toBe(2);
    expect(minQualityForDry(15)).toBe(3); // „Makellos" garantiert
    expect(minQualityForDry(999)).toBe(MAX_QUALITY); // und nie darüber
    expect(minQualityForDry(-3)).toBe(0);
  });

  it('ein besserer Wurf setzt den Zähler zurück, ein gleicher/schlechterer zählt hoch', () => {
    const cur = { id: 'click', q: 1 };
    expect(nextDry(4, cur, { id: 'click', q: 2 })).toBe(0); // besser ⇒ Reset
    expect(nextDry(4, cur, { id: 'gold', q: 2 })).toBe(0); // andere Sorte, aber besser
    expect(nextDry(4, cur, { id: 'gold', q: 1 })).toBe(5); // gleich ⇒ trocken
    expect(nextDry(4, cur, { id: 'gold', q: 0 })).toBe(5); // schlechter ⇒ trocken
  });

  it('ein LEERER Slot zählt als Qualität −1: der erste Roll ist immer eine Verbesserung', () => {
    expect(nextDry(7, null, { id: 'click', q: 0 })).toBe(0);
  });

  it('nach spätestens 16 trockenen Rolls ist die Höchststufe garantiert', () => {
    // Der Worst Case des Ideen-Dokuments, durchgespielt: immer der schlechteste
    // erlaubte Wurf, Slot bleibt leer (jeder Wurf würde ihn verbessern) …
    let dry = 0;
    let current: { id: string; q: number } | null = { id: 'click', q: MAX_QUALITY };
    let rolls = 0;
    while (minQualityForDry(dry) < MAX_QUALITY) {
      const offer = { id: 'click', q: rollQuality(0, minQualityForDry(dry)) };
      dry = nextDry(dry, current, offer);
      rolls++;
      expect(rolls).toBeLessThanOrEqual(15);
    }
    expect(rolls).toBe(15);
    // Der 16. Roll ist dann zwangsläufig makellos.
    current = { id: 'click', q: MAX_QUALITY };
    expect(rollQuality(0, minQualityForDry(dry))).toBe(MAX_QUALITY);
  });
});

describe('affixes — der Fold', () => {
  it('summiert je Term und lässt fremde Terme in Ruhe', () => {
    const b = foldAffixes([
      { id: 'click', q: 3 },
      { id: 'click', q: 3 },
      { id: 'gold', q: 0 },
    ]);
    const click = affixConfig('click')!.base;
    expect(b.clickPct).toBeCloseTo(2 * click, 10);
    expect(b.goldPct).toBeCloseTo(affixConfig('gold')!.base * 0.4, 10);
    expect(b.dpsPct).toBe(0);
  });

  it('wirft Müll-Ids still weg (der Fold läuft im Renderpfad)', () => {
    expect(foldAffixes([{ id: 'vegas', q: 2 }]).clickPct).toBe(0);
    expect(() => foldAffixes([{ id: 'vegas', q: 2 }])).not.toThrow();
  });

  it('klemmt JEDEN Prozent-Term strukturell auf den Deckel', () => {
    for (const stat of PERCENT_STATS) {
      const cfg = AFFIXES.find((a) => a.stat === stat);
      if (!cfg) continue;
      const many = Array.from({ length: 50 }, () => ({ id: cfg.id, q: MAX_QUALITY }));
      expect(foldAffixes(many)[stat]).toBeLessThanOrEqual(AFFIX_STAT_CAP + 1e-12);
    }
  });

  it('die absoluten Terme laufen bewusst NICHT in den Prozent-Deckel', () => {
    // Combo-Fenster (Sekunden) und Coach-cps sind keine Multiplikatoren; sie
    // laufen in ihre eigenen, bereits existierenden Schranken.
    const many = Array.from({ length: 50 }, () => ({ id: 'combo', q: MAX_QUALITY }));
    expect(foldAffixes(many).comboWindow).toBeGreaterThan(AFFIX_STAT_CAP);
  });
});

describe('affixes — das Budget (eingefroren)', () => {
  it('der Höchstfall sind 9 getragene Affixe', () => {
    expect(RELIC_SLOTS).toBe(3);
    expect(RELIC_MAX_AFFIXES).toBe(2);
    expect(FORGE_SLOTS).toBe(3);
    expect(MAX_WORN_AFFIXES).toBe(9);
  });

  it('Einzel-Term ≤ ×2 (Richtwert) — der Deckel macht die Zahl unabhängig vom Katalog', () => {
    expect(affixSingleTermBudget()).toBeCloseTo(1.75, 6);
    expect(affixSingleTermBudget()).toBeLessThanOrEqual(2);
    expect(affixSingleTermBudget()).toBeCloseTo(1 + AFFIX_STAT_CAP, 6);
  });

  it('Leistungs-Produkt ≤ ×1.5 (Richtwert) — erschöpfend gerechnet', () => {
    const budget = affixPowerBudget();
    expect(budget).toBeCloseTo(1.4298, 3);
    expect(budget).toBeLessThanOrEqual(1.5);
    // Und es ist wirklich ein MAXIMUM: keine einzelne Verteilung darf drüber.
    expect(budget).toBeGreaterThan(1.4);
  });

  it('Boss-Schaden hat sein EIGENES Budget (A2: Gates, nicht Farm)', () => {
    expect(affixBossBudget()).toBeCloseTo(1.75, 6);
    // Zum Vergleich: der Tyrann-Skin zahlt auf Lv 50 allein +600 % Boss-Schaden.
    expect(affixBossBudget()).toBeLessThan(1 + 0.12 * 50);
  });

  it('Offline hat sein eigenes Budget und bleibt beim 2a-Maß', () => {
    expect(affixOfflineBudget()).toBeCloseTo(1.36, 6);
    expect(affixOfflineBudget()).toBeLessThanOrEqual(1.5);
  });

  it('rollAffix liefert immer eine echte Sorte mit gültiger Qualität', () => {
    for (let i = 0; i < 200; i++) {
      const a = rollAffix(forgePool('lava'), i / 200, ((i * 7) % 200) / 200);
      expect(isAffixId(a.id)).toBe(true);
      expect(a.q).toBeGreaterThanOrEqual(0);
      expect(a.q).toBeLessThanOrEqual(MAX_QUALITY);
    }
  });
});
