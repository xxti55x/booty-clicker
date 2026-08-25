import { describe, expect, it } from 'vitest';

import {
  RETRAIN_BASE_COST,
  RETRAIN_MAX_EXP,
  SPECIAL_KINDS,
  applyRetrain,
  createRetrain,
  createRetrainRolls,
  isSpecialKind,
  noteRetrainRoll,
  retrainCost,
  retrainOffers,
  retrainSeed,
  retrainRollCount,
  retrainedKind,
} from './retrain';
import { CLICK_KINDS, OWN_KINDS } from './heroes';

describe('retrain — der Sorten-Pool (3b)', () => {
  it('kennt genau die sieben Spezial-Sorten und niemals `power`', () => {
    // Sieben seit dem Eigen-Boost-Umbau: drei Klick-Sorten (crit/critdmg/beat)
    // plus vier Eigen-Sorten (boss/combo/ekstase/idle). `gold` ist entfallen —
    // ein BP-Multiplikator lässt sich nicht an ein Mitglied binden.
    expect(SPECIAL_KINDS).toHaveLength(7);
    expect(new Set(SPECIAL_KINDS).size).toBe(7);
    expect(SPECIAL_KINDS).not.toContain('power');
    expect(SPECIAL_KINDS).not.toContain('gold');
    for (const k of SPECIAL_KINDS) expect(isSpecialKind(k)).toBe(true);
    // Die Sorte jedes Mitglieds stammt aus genau einer der beiden Hälften.
    expect([...CLICK_KINDS, ...OWN_KINDS].sort()).toEqual([...SPECIAL_KINDS].sort());
  });

  it('weist alles zurück, was keine Sorte ist (der Save-Guard hängt daran)', () => {
    for (const junk of ['power', 'gold ', 'GOLD', '', 'toString', 42, null, undefined, {}]) {
      expect(isSpecialKind(junk)).toBe(false);
    }
  });
});

describe('retrain — die Override-Map', () => {
  it('liest einen Eintrag, meldet sonst `null` (leer = Stock-Sorte)', () => {
    const map = { boss: { '2': 'idle' as const } };
    expect(retrainedKind(map, 'boss', 2)).toBe('idle');
    expect(retrainedKind(map, 'boss', 4)).toBeNull();
    expect(retrainedKind(map, 'hype', 2)).toBeNull();
    expect(retrainedKind(createRetrain(), 'boss', 2)).toBeNull();
  });

  it('ignoriert kaputte Werte in der Map, statt sie durchzureichen', () => {
    const map = { boss: { '2': 'quatsch', '4': 'power' } } as unknown as Parameters<
      typeof retrainedKind
    >[0];
    expect(retrainedKind(map, 'boss', 2)).toBeNull();
    expect(retrainedKind(map, 'boss', 4)).toBeNull();
  });

  it('schreibt immer eine NEUE Map (die alte bleibt stehen)', () => {
    const before = { boss: { '2': 'idle' as const } };
    const after = applyRetrain(before, 'boss', 4, 'crit');
    expect(before).toEqual({ boss: { '2': 'idle' } });
    expect(after).toEqual({ boss: { '2': 'idle', '4': 'crit' } });
    expect(after.boss).not.toBe(before.boss);
    // Ein zweiter Roll auf denselben Slot ÜBERSCHREIBT (es gibt nur eine Sorte).
    expect(applyRetrain(after, 'boss', 2, 'beat').boss).toEqual({ '2': 'beat', '4': 'crit' });
  });
});

describe('retrain — die Kostenleiter (gemessen gegen ~140 🧩/h)', () => {
  it('verdoppelt je Spezial-Slot: 40 · 2^(Slot−1)', () => {
    expect(retrainCost(1, 0)).toBe(RETRAIN_BASE_COST);
    expect(retrainCost(2, 0)).toBe(80);
    expect(retrainCost(3, 0)).toBe(160);
    expect(retrainCost(4, 0)).toBe(320);
    expect(retrainCost(5, 0)).toBe(640);
  });

  // Umschul-Umbau: Wiederholungen kosten NICHT mehr extra. Die Slot-Leiter ist
  // die Bremse; die Verdopplung je Roll bestrafte das Feinjustieren doppelt.
  it('bleibt beim selben Preis, egal wie oft man dasselbe Mitglied umschult', () => {
    expect(retrainCost(1, 1)).toBe(RETRAIN_BASE_COST);
    expect(retrainCost(1, 7)).toBe(RETRAIN_BASE_COST);
    expect(retrainCost(3, 0)).toBe(160);
    expect(retrainCost(3, 12)).toBe(160);
  });

  it('bleibt endlich, egal wie absurd Slot oder Roll-Zähler sind', () => {
    const cap = RETRAIN_BASE_COST * Math.pow(2, RETRAIN_MAX_EXP);
    expect(retrainCost(1e9, 1e9)).toBe(cap);
    expect(Number.isFinite(retrainCost(1e9, 1e9))).toBe(true);
    // Kein Spezial-Slot ⇒ kein Preis (der Aufrufer prüft, die Funktion wirft nie).
    expect(retrainCost(0, 3)).toBe(0);
    expect(retrainCost(-2, 0)).toBe(0);
    expect(retrainCost(Number.NaN, Number.NaN)).toBe(0);
  });

  it('zählt nur ganze, nicht-negative Rolls (kaputter Save ⇒ 0)', () => {
    expect(retrainRollCount(createRetrainRolls(), 'boss')).toBe(0);
    expect(retrainRollCount({ boss: 2.9 }, 'boss')).toBe(2);
    expect(retrainRollCount({ boss: -4 }, 'boss')).toBe(0);
    expect(retrainRollCount({ boss: Number.NaN }, 'boss')).toBe(0);
    expect(retrainCost(1, Number.NaN)).toBe(RETRAIN_BASE_COST);
  });

  it('bucht einen bezahlten Roll in einen NEUEN Zähler', () => {
    const before = { boss: 1 };
    const after = noteRetrainRoll(before, 'boss');
    expect(before).toEqual({ boss: 1 });
    expect(after).toEqual({ boss: 2 });
    expect(noteRetrainRoll({}, 'hype')).toEqual({ hype: 1 });
  });
});

describe('retrain — das Angebot (Guardrail: kein Blind-Roll)', () => {
  it('bietet nie die aktuelle Sorte und nie zweimal dieselbe an', () => {
    // Über den ganzen Pool und ein feines Raster beider Ziehungen.
    for (const current of SPECIAL_KINDS) {
      for (let a = 0; a < 20; a++) {
        for (let b = 0; b < 20; b++) {
          const { kinds } = retrainOffers(current, a / 20, b / 20);
          expect(kinds[0]).not.toBe(current);
          expect(kinds[1]).not.toBe(current);
          expect(kinds[0]).not.toBe(kinds[1]);
          expect(SPECIAL_KINDS).toContain(kinds[0]);
          expect(SPECIAL_KINDS).toContain(kinds[1]);
        }
      }
    }
  });

  it('ist rein über die beiden Floats — derselbe Wurf, dasselbe Angebot', () => {
    expect(retrainOffers('crit', 0.3, 0.7)).toEqual(retrainOffers('crit', 0.3, 0.7));
    // Der Pool schließt die AKTUELLE Sorte aus. Ohne `crit` bleiben sechs, in
    // der Reihenfolge von SPECIAL_KINDS ⇒ Index ⌊0·6⌋ = 0 = `critdmg`.
    expect(retrainOffers('crit', 0, 0).kinds[0]).toBe('critdmg');
    // Zweite Ziehung aus den verbleibenden fünf ⇒ Index 0 = `boss`.
    expect(retrainOffers('crit', 0, 0).kinds[1]).toBe('boss');
  });

  it('erreicht über den Float-Bereich jede der sieben Alternativen', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 70; i++) seen.add(retrainOffers('idle', i / 70, 0).kinds[0]);
    expect(seen.size).toBe(SPECIAL_KINDS.length - 1);
    expect(seen.has('idle')).toBe(false);
  });

  it('liefert auch bei entarteten Floats zwei gültige Sorten (nie `undefined`)', () => {
    for (const [a, b] of [
      [Number.NaN, Number.NaN],
      [-1, 2],
      [1, 1],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ]) {
      const { kinds } = retrainOffers('boss', a, b);
      expect(SPECIAL_KINDS).toContain(kinds[0]);
      expect(SPECIAL_KINDS).toContain(kinds[1]);
      expect(kinds[0]).not.toBe(kinds[1]);
      expect(kinds).not.toContain('boss');
    }
  });
});

// Umschul-Umbau: Angebote darf man ansehen, ohne zu zahlen — dafür MÜSSEN sie
// festliegen, sonst würfelt man den Dialog auf und zu, bis das Wunschpaar kommt.
describe('retrainSeed — feste Angebote statt Gratis-Würfeln', () => {
  it('liefert für dieselbe Lage immer dasselbe Zahlenpaar', () => {
    expect(retrainSeed('boss', 3, 0)).toEqual(retrainSeed('boss', 3, 0));
    expect(retrainSeed('dj', 7, 2)).toEqual(retrainSeed('dj', 7, 2));
  });

  it('unterscheidet Mitglied, Stufe und Roll-Zähler', () => {
    const base = retrainSeed('boss', 3, 0).join();
    expect(retrainSeed('dj', 3, 0).join()).not.toBe(base);
    expect(retrainSeed('boss', 4, 0).join()).not.toBe(base);
    expect(retrainSeed('boss', 3, 1).join()).not.toBe(base);
  });

  it('bleibt im Einheitsintervall und liefert zwei verschiedene Ströme', () => {
    for (const id of ['boss', 'dj', 'hype', 'tycoon']) {
      const [a, b] = retrainSeed(id, 5, 1);
      for (const r of [a, b]) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(1);
      }
      expect(a).not.toBe(b);
    }
  });

  it('taugt als Angebots-Quelle: gleicher Seed ⇒ gleiche zwei Sorten', () => {
    const [r1, r2] = retrainSeed('boss', 3, 0);
    const first = retrainOffers('crit', r1, r2);
    const again = retrainOffers('crit', r1, r2);
    expect(again.kinds).toEqual(first.kinds);
    expect(first.kinds[0]).not.toBe(first.kinds[1]);
    expect(first.kinds).not.toContain('crit');
  });
});
