import { describe, expect, it } from 'vitest';

import {
  LEGEND_PER_LEVEL,
  gainLegend,
  legendEarns,
  legendGlobalMult,
  legendPercent,
} from './legend';
import { TRANSCEND_GLOBAL_BASE } from './transcend';

describe('legend — der additive Faktor', () => {
  it('zahlt +0,5 % je Level', () => {
    expect(LEGEND_PER_LEVEL).toBe(0.005);
    expect(legendGlobalMult(1)).toBeCloseTo(1.005, 12);
    expect(legendGlobalMult(20)).toBeCloseTo(1.1, 12);
    expect(legendGlobalMult(200)).toBeCloseTo(2, 12);
  });

  it('ist ADDITIV, nicht multiplikativ — die eine Leitplanke von 1d', () => {
    for (const L of [10, 100, 500, 2000]) {
      expect(legendGlobalMult(L)).toBeCloseTo(1 + LEGEND_PER_LEVEL * L, 9);
      // Die Gegenprobe: exponentiell wäre bei L = 2000 um Größenordnungen mehr.
      expect(legendGlobalMult(L)).toBeLessThanOrEqual(Math.pow(1 + LEGEND_PER_LEVEL, L));
    }
    expect(Math.pow(1 + LEGEND_PER_LEVEL, 2000) / legendGlobalMult(2000)).toBeGreaterThan(1000);
  });

  /**
   * Der Float-Guard (§9.3) darf von einem UNENDLICHEN Zähler nie erreicht
   * werden. Additiv ist das strukturell wahr: Selbst ein absurdes L bleibt
   * linear und endlich.
   */
  it('bleibt auch bei absurden Ständen endlich und weit unter dem Float-Ceiling', () => {
    const abs = legendGlobalMult(1e15);
    expect(Number.isFinite(abs)).toBe(true);
    expect(abs).toBeLessThan(1e300);
  });

  it('faltet ohne Level exakt ×1 und wirft nie', () => {
    expect(legendGlobalMult(0)).toBe(1);
    expect(legendGlobalMult(-5)).toBe(1);
    expect(legendGlobalMult(Number.NaN)).toBe(1);
    expect(legendGlobalMult(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('floort gebrochene Stände (ein halbes Level gibt es nicht)', () => {
    expect(legendGlobalMult(3.9)).toBeCloseTo(1.015, 12);
  });

  /**
   * Die Größenordnung, die den Zähler harmlos macht: Ein einziges TE ist ×3 —
   * dafür braucht es 400 Legenden-Level.
   */
  it('braucht 400 Level für die Wirkung EINES Transzendenz-Punktes', () => {
    expect(legendGlobalMult(400)).toBeCloseTo(TRANSCEND_GLOBAL_BASE, 12);
    expect(legendGlobalMult(100)).toBeLessThan(TRANSCEND_GLOBAL_BASE);
  });

  it('rechnet den Anzeige-Prozentsatz', () => {
    expect(legendPercent(0)).toBe(0);
    expect(legendPercent(12)).toBeCloseTo(6, 10);
  });
});

describe('legend — wer verdient', () => {
  it('zahlt erst NACH der ersten Transzendenz', () => {
    expect(legendEarns(0)).toBe(false);
    expect(legendEarns(1)).toBe(true);
    expect(legendEarns(7)).toBe(true);
    expect(legendEarns(Number.NaN)).toBe(false);
  });

  it('steigt je Himmelfahrt um genau 1 — und nur mit Transzendenz', () => {
    expect(gainLegend(0, 0)).toBe(0);
    expect(gainLegend(5, 0)).toBe(5);
    expect(gainLegend(0, 1)).toBe(1);
    expect(gainLegend(5, 2)).toBe(6);
  });

  it('schrumpft nie und saniert kaputte Stände', () => {
    expect(gainLegend(-3, 1)).toBe(1);
    expect(gainLegend(Number.NaN, 1)).toBe(1);
    expect(gainLegend(4.8, 0)).toBe(4);
  });
});
