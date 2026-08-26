import { describe, expect, it } from 'vitest';

import { ancientBulkCost, ancientTotalCost } from './ancients';
import { SOUL_BONUS, soulMult } from './ascension';
import { createChState, dpsOf } from './ch-state';

/**
 * Goal: „Seelen sind schlauer zu behalten für mehr dps als auszugeben für dps?
 * das macht keinen sinn."
 *
 * Sie waren es — und nicht knapp. Der globale Multiplikator hing am GEHALTENEN
 * Bestand, also war jeder Ahnen-Kauf ein direkter Schadensverlust. Gemessen:
 *
 * | Seelen | behalten | alles ausgeben | Sparen ist … |
 * | ---: | ---: | ---: | ---: |
 * | 100 | ×11 | ×2,95 | 3,7× besser |
 * | 1 000 | ×101 | ×7,6 | 13,3× besser |
 * | 1 000 000 | ×100 001 | ×213 | 469× besser |
 *
 * Der Grund ist Mathematik, keine Kalibrierung: Sparen wächst LINEAR in n,
 * Ausgeben nur mit √n — die Ahnen-Leiter kostet `level + 1`, ihre Summe ist
 * eine Dreieckszahl. Eine Wurzel holt eine Gerade nie ein.
 *
 * Diese Anker halten fest, dass Ausgeben nie wieder bestraft wird.
 */
describe('Seelen ausgeben darf nie Schaden kosten', () => {
  // Der Kern: Der Multiplikator hängt am Verdienst. Zwei Zustände mit demselben
  // Verdienst sind gleich stark — egal, wie viel davon schon in Ahnen steckt.
  it('lässt den globalen Multiplikator unberührt, wenn Seelen ausgegeben werden', () => {
    const basis = { ...createChState(), crew: { boss: 20 }, rsLifetime: 500, souls: 500 };
    const voll = dpsOf(basis);
    for (const ausgegeben of [1, 50, 250, 499, 500]) {
      const nachKauf = { ...basis, souls: 500 - ausgegeben };
      expect(dpsOf(nachKauf), `${ausgegeben} ausgegeben`).toBeCloseTo(voll, 6);
    }
  });

  /**
   * Die Leitplanke gegen einen Rückfall: Solange der Multiplikator am
   * gehaltenen Bestand hinge, wäre der Verlust bei großen Beständen erdrückend.
   * Hier wird nachgerechnet, WIE erdrückend — der Anker beschreibt damit den
   * Fehler, den es nicht mehr geben darf.
   */
  it('rechnet den alten Fehler nach (Sparen schlug Ausgeben um Größenordnungen)', () => {
    const levelFuer = (seelen: number): number => {
      let l = 0;
      while (ancientTotalCost(l + 1) <= seelen) l++;
      return l;
    };
    for (const [n, mindestens] of [
      [100, 3],
      [1000, 12],
      [1_000_000, 400],
    ] as const) {
      const alterSparWert = soulMult(n); // was Behalten unter der alten Regel gab
      const besterAhne = 1 + 0.15 * levelFuer(n); // der stärkste reine DPS-Ahne
      expect(alterSparWert / besterAhne, `${n} Seelen`).toBeGreaterThan(mindestens);
    }
  });

  it('bleibt bei einem widersprüchlichen Stand auf der Seite des Spielers', () => {
    // „verdient ≥ gehalten" ist eine Invariante. Ein Spielstand, in dem sie
    // verletzt ist, darf keinen Schaden verlieren — sonst wäre eine Migration
    // nötig, nur um einen Zähler nachzuziehen.
    const krumm = { ...createChState(), crew: { boss: 20 }, rsLifetime: 0, souls: 300 };
    const heil = { ...createChState(), crew: { boss: 20 }, rsLifetime: 300, souls: 300 };
    expect(dpsOf(krumm)).toBeCloseTo(dpsOf(heil), 6);
  });

  it('lässt die Ahnen-Leiter die Dreieckszahl bleiben (der Grund für √n)', () => {
    expect(ancientTotalCost(10)).toBe(55);
    expect(ancientBulkCost(10, 5)).toBe(ancientTotalCost(15) - ancientTotalCost(10));
    // Und der Grundbonus je Seele ist unverändert — die Kurve wurde NICHT neu
    // kalibriert, nur ihr Anker verschoben.
    expect(SOUL_BONUS).toBe(0.1);
  });
});
