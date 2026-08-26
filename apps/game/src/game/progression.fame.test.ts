import { describe, expect, it } from 'vitest';

import {
  BREADTH_CHESTS_FULL,
  BREADTH_MASTERY_FULL,
  BREADTH_MAX_BONUS,
  BREADTH_REPUTATION_FULL,
  NO_BREADTH,
  applyAscension,
  fameBreadth,
  pendingSouls,
  soulsForMaxZone,
  soulsForProgress,
} from './ascension';
import { breadthOf, createChState } from './ch-state';

/**
 * Goal: „Ruhm soll nicht bühnenabhängig sein, mache das an anderen werten fest
 * als nur die bühne."
 *
 * Er hing an genau einer Zahl — der tiefsten Bühne — und daran exponentiell:
 * Bei Bühne 90 stammten **99,3 %** des Ruhms aus dem Term `1,10^z`. Deshalb
 * wirkt die Breite als FAKTOR und nicht als Summand: Additive Achsen hätten
 * gegen einen Exponenten keine Chance, man müsste sie selbst exponentiell
 * wachsen lassen — und dann wäre die Tiefe egal.
 *
 * Die drei Achsen sind gemessen normiert (4×45-min-Kette: Σ18 Ränge, 3 883
 * Ruf, 45 Truhen ⇒ ×1,6; 8×45 ⇒ Deckel).
 */
describe('Ruhm — die Breite neben der Tiefe', () => {
  it('bleibt ohne jede Breite exakt die alte Rechnung', () => {
    expect(fameBreadth(NO_BREADTH)).toBe(1);
    for (const z of [10, 40, 90, 200]) {
      expect(soulsForProgress(z, NO_BREADTH)).toBe(soulsForMaxZone(z));
    }
  });

  it('lässt JEDE Achse einzeln zählen — keine ist Beiwerk', () => {
    const nur = (k: keyof typeof NO_BREADTH, v: number) => fameBreadth({ ...NO_BREADTH, [k]: v });
    expect(nur('masteryRanks', BREADTH_MASTERY_FULL)).toBeGreaterThan(1.9);
    expect(nur('reputation', BREADTH_REPUTATION_FULL ** 2)).toBeGreaterThan(1.9);
    expect(nur('chestsOpened', BREADTH_CHESTS_FULL)).toBeGreaterThan(1.9);
  });

  it('deckelt die Breite, damit sie die Tiefe nie ersetzt', () => {
    const masslos = { masteryRanks: 1e9, reputation: 1e12, chestsOpened: 1e9 };
    expect(fameBreadth(masslos)).toBe(1 + BREADTH_MAX_BONUS);
    // Und der Deckel ist eine echte Grenze, kein Zufall der Normierung.
    expect(BREADTH_MAX_BONUS).toBeLessThanOrEqual(1);
  });

  it('wächst monoton in jeder Achse (die Bedingung für „Anspruch minus verdient")', () => {
    let vorher = fameBreadth(NO_BREADTH);
    for (const n of [1, 5, 20, 60, 200]) {
      const jetzt = fameBreadth({ masteryRanks: n, reputation: n * 40, chestsOpened: n });
      expect(jetzt).toBeGreaterThanOrEqual(vorher);
      vorher = jetzt;
    }
  });

  // Der eigentliche Punkt des Auftrags: Zwei Spieler auf DERSELBEN Bühne
  // bekommen verschiedenen Ruhm — je nachdem, was sie sonst getan haben.
  it('trennt zwei Spieler auf derselben Bühne nach ihrer Breite', () => {
    const durchrenner = pendingSouls(90, 90, 0, NO_BREADTH);
    const sammler = pendingSouls(90, 90, 0, {
      masteryRanks: 18,
      reputation: 3883,
      chestsOpened: 45,
    });
    expect(sammler).toBeGreaterThan(durchrenner);
    // Spürbar, nicht kosmetisch: die gemessene 4×45-Kette liegt bei rund ×1,6.
    expect(sammler / durchrenner).toBeGreaterThan(1.4);
  });

  it('kann durch wiederholtes Aszendieren nicht gefarmt werden', () => {
    const b = { masteryRanks: 18, reputation: 3883, chestsOpened: 45 };
    const erste = applyAscension(90, 90, 0, 0, b);
    expect(erste.souls).toBeGreaterThan(0);
    // Sofort noch einmal, ohne tiefer gekommen zu sein UND ohne mehr Breite:
    const zweite = applyAscension(90, 90, erste.souls, erste.rsLifetime, b);
    expect(zweite.souls).toBe(erste.souls);
  });

  it('liest die Achsen aus dem Spielstand, ohne bei leeren Feldern zu werfen', () => {
    const frisch = createChState();
    expect(breadthOf(frisch)).toEqual({ masteryRanks: 0, reputation: 0, chestsOpened: 0 });
    expect(fameBreadth(breadthOf(frisch))).toBe(1);
  });

  it('bleibt bei kaputten Eingaben ein gültiger Faktor', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -7]) {
      const f = fameBreadth({ masteryRanks: bad, reputation: bad, chestsOpened: bad });
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(1 + BREADTH_MAX_BONUS);
    }
  });
});
