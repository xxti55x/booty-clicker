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
  retrainRollCount,
  retrainedKind,
} from './retrain';

describe('retrain — der Sorten-Pool (3b)', () => {
  it('kennt genau die acht Spezial-Sorten und niemals `power`', () => {
    expect(SPECIAL_KINDS).toHaveLength(8);
    expect(new Set(SPECIAL_KINDS).size).toBe(8);
    expect(SPECIAL_KINDS).not.toContain('power');
    for (const k of SPECIAL_KINDS) expect(isSpecialKind(k)).toBe(true);
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
    const after = applyRetrain(before, 'boss', 4, 'gold');
    expect(before).toEqual({ boss: { '2': 'idle' } });
    expect(after).toEqual({ boss: { '2': 'idle', '4': 'gold' } });
    expect(after.boss).not.toBe(before.boss);
    // Ein zweiter Roll auf denselben Slot ÜBERSCHREIBT (es gibt nur eine Sorte).
    expect(applyRetrain(after, 'boss', 2, 'beat').boss).toEqual({ '2': 'beat', '4': 'gold' });
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

  it('verdoppelt je weiterem Roll am selben Mitglied (Währungs-Eskalation)', () => {
    expect(retrainCost(1, 1)).toBe(80);
    expect(retrainCost(1, 2)).toBe(160);
    expect(retrainCost(1, 3)).toBe(320);
    // Slot- und Roll-Eskalation multiplizieren sich.
    expect(retrainCost(3, 2)).toBe(160 * 4);
  });

  it('bleibt endlich, egal wie absurd Slot oder Roll-Zähler sind', () => {
    const cap = RETRAIN_BASE_COST * Math.pow(2, RETRAIN_MAX_EXP) * Math.pow(2, RETRAIN_MAX_EXP);
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
    expect(retrainOffers('gold', 0.3, 0.7)).toEqual(retrainOffers('gold', 0.3, 0.7));
    // Erste Ziehung: Pool ohne `gold` (7 Sorten) ⇒ Index ⌊0.0·7⌋ = 0 = `crit`.
    expect(retrainOffers('gold', 0, 0).kinds[0]).toBe('crit');
    // Zweite Ziehung aus den verbleibenden 6 ⇒ Index 0 = `critdmg`.
    expect(retrainOffers('gold', 0, 0).kinds[1]).toBe('critdmg');
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
