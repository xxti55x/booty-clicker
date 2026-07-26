import { describe, expect, it } from 'vitest';

import { COMBO_CAP, comboMult } from './click';
import { BOSS_EVERY, isBossZone } from './combat';
import {
  STAR_ALL,
  STAR_CLEARED,
  STAR_COMBO,
  STAR_COMBO_MULT,
  STAR_COMBO_STACKS,
  STAR_MILESTONE,
  STAR_NO_TIMEOUT,
  type StageStars,
  addStar,
  comboStarQualifies,
  createStageStars,
  hasStar,
  maxStarsFor,
  milestoneChests,
  milestoneHighwater,
  starBitsFor,
  starCount,
  starMaskFor,
  starsAt,
  totalStars,
} from './stars';

describe('stars — Bit-Regeln pro Bühne (P1)', () => {
  it('Boss-Bühnen tragen drei Sterne, normale Bühnen zwei', () => {
    expect(isBossZone(BOSS_EVERY)).toBe(true);
    expect(maxStarsFor(5)).toBe(3);
    expect(starBitsFor(5)).toEqual([STAR_CLEARED, STAR_NO_TIMEOUT, STAR_COMBO]);
    expect(starMaskFor(5)).toBe(STAR_ALL);
    // Ohne Gate gibt es keinen Timeout, den man vermeiden könnte (Design-Entscheid).
    expect(maxStarsFor(7)).toBe(2);
    expect(starBitsFor(7)).toEqual([STAR_CLEARED, STAR_COMBO]);
    expect(starMaskFor(7)).toBe(STAR_CLEARED | STAR_COMBO);
  });

  it('zählt Bits einer Maske', () => {
    expect(starCount(0)).toBe(0);
    expect(starCount(STAR_CLEARED)).toBe(1);
    expect(starCount(STAR_CLEARED | STAR_COMBO)).toBe(2);
    expect(starCount(STAR_ALL)).toBe(3);
  });
});

describe('stars — Sterne setzen (P1)', () => {
  it('setzt einen Stern und lässt die Quelle unangetastet', () => {
    const before = createStageStars();
    const after = addStar(before, 5, STAR_CLEARED);
    expect(before).toEqual({});
    expect(starsAt(after, 5)).toBe(STAR_CLEARED);
    expect(hasStar(after, 5, STAR_CLEARED)).toBe(true);
    expect(hasStar(after, 5, STAR_COMBO)).toBe(false);
  });

  it('gibt bei „nichts geändert" DIESELBE Referenz zurück (Glue-Signal)', () => {
    const once = addStar(createStageStars(), 5, STAR_CLEARED);
    expect(addStar(once, 5, STAR_CLEARED)).toBe(once); // schon da
    expect(addStar(once, 7, STAR_NO_TIMEOUT)).toBe(once); // auf Nicht-Boss unmöglich
    expect(addStar(once, 0, STAR_CLEARED)).toBe(once); // keine gültige Bühne
    expect(addStar(once, 2.5, STAR_CLEARED)).toBe(once);
    expect(addStar(once, -3, STAR_CLEARED)).toBe(once);
  });

  it('sammelt mehrere Bits derselben Bühne auf', () => {
    let map: StageStars = createStageStars();
    map = addStar(map, 10, STAR_CLEARED);
    map = addStar(map, 10, STAR_NO_TIMEOUT);
    map = addStar(map, 10, STAR_COMBO);
    expect(starsAt(map, 10)).toBe(STAR_ALL);
    expect(starCount(starsAt(map, 10))).toBe(3);
  });

  it('maskiert unmögliche/kaputte Werte beim Lesen weg', () => {
    // Ein handgeschriebener Blob mit allen Bits auf einer Nicht-Boss-Bühne …
    const crafted: StageStars = { '7': STAR_ALL, '5': STAR_ALL, x: 3, '9': Number.NaN };
    expect(starsAt(crafted, 7)).toBe(STAR_CLEARED | STAR_COMBO); // Timeout-Bit fällt raus
    expect(starsAt(crafted, 5)).toBe(STAR_ALL);
    expect(starsAt(crafted, 9)).toBe(0);
    // … zählt in der Summe nur mit dem, was die Regeln hergeben: 2 + 3 = 5.
    expect(totalStars(crafted)).toBe(5);
  });

  it('summiert über die ganze Sammlung', () => {
    let map: StageStars = createStageStars();
    for (const z of [1, 2, 3]) map = addStar(map, z, STAR_CLEARED);
    map = addStar(map, 5, STAR_CLEARED);
    map = addStar(map, 5, STAR_NO_TIMEOUT);
    expect(totalStars(map)).toBe(5);
    expect(totalStars(createStageStars())).toBe(0);
  });
});

describe('stars — Combo-Schwelle (P1, Stern 3)', () => {
  it('leitet die Stack-Grenze aus der ECHTEN comboMult-Skala ab', () => {
    expect(comboMult(STAR_COMBO_STACKS)).toBeGreaterThanOrEqual(STAR_COMBO_MULT);
    expect(comboMult(STAR_COMBO_STACKS - 1)).toBeLessThan(STAR_COMBO_MULT);
    // Halbe Strecke zum v12-Cap (×1.2): erreichbar, aber nicht geschenkt.
    expect(STAR_COMBO_STACKS).toBe(COMBO_CAP / 2);
    expect(STAR_COMBO_MULT).toBeLessThan(comboMult(COMBO_CAP));
  });

  it('qualifiziert erst ab der Schwelle', () => {
    expect(comboStarQualifies(0)).toBe(false);
    expect(comboStarQualifies(STAR_COMBO_STACKS - 1)).toBe(false);
    expect(comboStarQualifies(STAR_COMBO_STACKS)).toBe(true);
    expect(comboStarQualifies(COMBO_CAP * 4)).toBe(true); // über dem Cap bleibt wahr
    expect(comboStarQualifies(-5)).toBe(false);
  });
});

describe('stars — Sammel-Meilenstein (P1)', () => {
  it('zahlt genau eine Truhe je 15 Sterne, gegen den Highwater gerechnet', () => {
    expect(milestoneChests(14, 0)).toBe(0);
    expect(milestoneChests(15, 0)).toBe(1);
    expect(milestoneChests(29, 15)).toBe(0);
    expect(milestoneChests(30, 15)).toBe(1);
    // Ein Sprung über mehrere Blöcke (Import eines fetten Saves) zahlt alle offenen.
    expect(milestoneChests(46, 0)).toBe(3);
    expect(STAR_MILESTONE).toBe(15);
  });

  it('hebt den Highwater auf den erreichten Block — nie doppelt', () => {
    let awarded = 0;
    awarded = milestoneHighwater(15, awarded);
    expect(awarded).toBe(15);
    expect(milestoneChests(15, awarded)).toBe(0); // Reload zahlt nicht erneut
    awarded = milestoneHighwater(44, awarded);
    expect(awarded).toBe(30);
    expect(milestoneChests(44, awarded)).toBe(0);
  });

  it('bleibt bei Müll-Eingaben ruhig', () => {
    expect(milestoneChests(-5, 0)).toBe(0);
    expect(milestoneChests(20, -30)).toBe(1);
    expect(milestoneHighwater(0, 45)).toBe(45); // ein gehobener Highwater sinkt nie
  });
});
