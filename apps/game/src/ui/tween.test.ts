import { describe, expect, it } from 'vitest';

import { TWEEN_MS, shouldTween, tweenEase, tweenValue } from './tween';

describe('ROADMAP-V2 G6 — tweenEase', () => {
  it('läuft von 0 nach 1 und klemmt außerhalb', () => {
    expect(tweenEase(0)).toBe(0);
    expect(tweenEase(1)).toBe(1);
    expect(tweenEase(-5)).toBe(0);
    expect(tweenEase(9)).toBe(1);
  });

  it('ist monoton und vorn schneller als hinten (ease-out)', () => {
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const v = tweenEase(k);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(tweenEase(0.5)).toBeGreaterThan(0.5);
  });
});

describe('tweenValue', () => {
  it('startet auf dem Ausgangswert und landet exakt auf dem Ziel', () => {
    expect(tweenValue(100, 500, 0)).toBe(100);
    expect(tweenValue(100, 500, TWEEN_MS)).toBe(500);
    expect(tweenValue(100, 500, TWEEN_MS * 3)).toBe(500);
  });

  it('bleibt zwischen den Enden — auch abwärts (Prestige-Reset auf 0)', () => {
    for (let t = 0; t <= TWEEN_MS; t += 20) {
      const v = tweenValue(9000, 0, t);
      expect(v).toBeLessThanOrEqual(9000);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(tweenValue(9000, 0, TWEEN_MS)).toBe(0);
  });

  it('schreibt bei Dauer 0 sofort das Ziel', () => {
    expect(tweenValue(1, 2, 0, 0)).toBe(2);
  });
});

describe('shouldTween', () => {
  it('überspringt gleiche Werte, Nicht-Zahlen und die winzigen Idle-Ticks', () => {
    expect(shouldTween(500, 500)).toBe(false);
    expect(shouldTween(Number.NaN, 5)).toBe(false);
    expect(shouldTween(5, Number.POSITIVE_INFINITY)).toBe(false);
    expect(shouldTween(0, 0)).toBe(false);
    expect(shouldTween(1_000_000, 1_000_050)).toBe(false); // 0.005 % — unsichtbar
  });

  it('tweent echte Sprünge (Kauf, Boss-Beute, Prestige-Reset)', () => {
    expect(shouldTween(1000, 800)).toBe(true);
    expect(shouldTween(0, 25)).toBe(true);
    expect(shouldTween(9000, 0)).toBe(true);
  });
});
