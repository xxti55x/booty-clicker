import { describe, expect, it } from 'vitest';

import {
  VORSPRUNG_MIN_TE,
  VORSPRUNG_PER_TE,
  VORSPRUNG_RECORD_SHARE,
  vorsprungMaxZone,
  vorsprungStartZone,
  vorsprungSteps,
  vorsprungUnlocked,
} from './vorsprung';

/**
 * Goal: „Progression … zu eintönig … sorge für mehr abwechslung."
 *
 * Die dritte Stufe ändert, WO ein Lauf anfängt. Diese Anker halten die zwei
 * Zusicherungen fest, an denen das Verb hängt: Es gibt vor der Transzendenz
 * nichts, und es überspringt nie das ganze Spiel.
 */
describe('Vorsprung — der Deckel', () => {
  it('gibt es ohne Transzendenz überhaupt nicht', () => {
    for (const rec of [1, 50, 500, 5000]) {
      expect(vorsprungMaxZone(0, rec)).toBe(1);
      expect(vorsprungUnlocked(0, rec)).toBe(false);
    }
  });

  it('bleibt bei einem frischen Rekord wirkungslos (nichts zu überspringen)', () => {
    expect(vorsprungMaxZone(99, 1)).toBe(1);
    expect(vorsprungUnlocked(99, 1)).toBe(false);
  });

  // Der eigentliche Riegel: Auch mit beliebig viel TE bleibt ein Rest Spiel.
  it('startet NIE über dem erlaubten Anteil des eigenen Rekords', () => {
    for (const rec of [10, 50, 200, 1000, 9999]) {
      const max = vorsprungMaxZone(1e9, rec);
      expect(max).toBeLessThanOrEqual(Math.floor(rec * VORSPRUNG_RECORD_SHARE));
      // Und damit bleibt echt Weg übrig — kein Zuschauer-Modus.
      expect(max).toBeLessThan(rec);
    }
  });

  it('wächst mit der Lebenszeit-TE, solange der Rekord Luft lässt', () => {
    const rec = 100_000; // Rekord weit weg ⇒ die TE ist der bindende Deckel
    let vorher = vorsprungMaxZone(VORSPRUNG_MIN_TE, rec);
    for (const te of [2, 5, 20, 100]) {
      const jetzt = vorsprungMaxZone(te, rec);
      expect(jetzt).toBeGreaterThan(vorher);
      vorher = jetzt;
    }
    // Und zwar genau mit der dokumentierten Rate.
    expect(vorsprungMaxZone(10, rec)).toBe(1 + 10 * VORSPRUNG_PER_TE);
  });

  it('nimmt immer den KLEINEREN der beiden Deckel', () => {
    // TE üppig, Rekord knapp ⇒ der Rekord bindet.
    expect(vorsprungMaxZone(1000, 40)).toBe(Math.floor(40 * VORSPRUNG_RECORD_SHARE));
    // TE knapp, Rekord üppig ⇒ die TE bindet.
    expect(vorsprungMaxZone(2, 100_000)).toBe(1 + 2 * VORSPRUNG_PER_TE);
  });

  it('bleibt bei kaputten Eingaben eine gültige Bühne', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -7]) {
      expect(vorsprungMaxZone(bad, 500)).toBeGreaterThanOrEqual(1);
      expect(vorsprungMaxZone(50, bad)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Vorsprung — die Startbühne', () => {
  it('klemmt den Wunsch auf das Erlaubte (der Guard gegen gecraftete Saves)', () => {
    const te = 5;
    const rec = 1000;
    const max = vorsprungMaxZone(te, rec);
    expect(vorsprungStartZone(max + 500, te, rec)).toBe(max);
    expect(vorsprungStartZone(-9, te, rec)).toBe(1);
    expect(vorsprungStartZone(Number.NaN, te, rec)).toBe(1);
  });

  it('lässt jeden erlaubten Wunsch unverändert', () => {
    const te = 20;
    const rec = 1000;
    for (const z of [1, 10, 50, vorsprungMaxZone(te, rec)]) {
      expect(vorsprungStartZone(z, te, rec)).toBe(z);
    }
  });

  it('erlaubt ohne Freischaltung nur Bühne 1', () => {
    expect(vorsprungStartZone(500, 0, 5000)).toBe(1);
  });
});

describe('Vorsprung — die Stufen des Wählers', () => {
  it('bietet ohne Freischaltung genau Bühne 1', () => {
    expect(vorsprungSteps(0, 5000)).toEqual([1]);
  });

  it('beginnt bei 1, endet exakt beim Maximum und steigt monoton', () => {
    for (const [te, rec] of [
      [2, 1000],
      [10, 1000],
      [100, 10_000],
      [1000, 300],
    ] as const) {
      const steps = vorsprungSteps(te, rec);
      const max = vorsprungMaxZone(te, rec);
      expect(steps[0]).toBe(1);
      expect(steps[steps.length - 1]).toBe(max);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
      }
      // Und keine Stufe liegt über dem Erlaubten.
      for (const z of steps) expect(z).toBeLessThanOrEqual(max);
    }
  });

  it('bleibt eine kurze Liste (eine Entscheidung, kein Schieberegler)', () => {
    expect(vorsprungSteps(1e9, 1e6).length).toBeLessThanOrEqual(9);
  });
});
