import { describe, expect, it } from 'vitest';

import { STAGE_TIERS, stageK, stageTier } from './escalation';
import { ZONES_PER_THEME } from '../game/boss-gimmicks';

describe('Bühnen-Eskalation (D-08/D-12)', () => {
  it('teilt die Zehnerstrecke in früh / mittig / kurz vor dem Boss', () => {
    expect([1, 2, 3].map(stageTier)).toEqual([0, 0, 0]);
    expect([4, 5, 6].map(stageTier)).toEqual([1, 1, 1]);
    // Die Boss-Bühne gehört zum Höhepunkt, nicht zu einer eigenen vierten Stufe.
    expect([7, 8, 9, 10].map(stageTier)).toEqual([2, 2, 2, 2]);
  });

  it('wiederholt sich mit jedem Theme (Bühne 21/24/28 = 1/4/8)', () => {
    for (const base of [0, 10, 20, 30, 100, 1000]) {
      expect(stageTier(base + 1)).toBe(0);
      expect(stageTier(base + 4)).toBe(1);
      expect(stageTier(base + 8)).toBe(2);
    }
  });

  it('liefert nie eine Stufe außerhalb 0…STAGE_TIERS−1', () => {
    for (let z = -5; z < 250; z++) {
      const t = stageTier(z);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(STAGE_TIERS - 1);
      expect(Number.isInteger(t)).toBe(true);
    }
  });

  it('stageK läuft stetig von 0 auf 1 und springt an der Theme-Grenze zurück', () => {
    expect(stageK(1)).toBe(0);
    expect(stageK(ZONES_PER_THEME)).toBe(1);
    expect(stageK(ZONES_PER_THEME + 1)).toBe(0);
    for (let z = 1; z < ZONES_PER_THEME; z++) {
      expect(stageK(z)).toBeLessThan(stageK(z + 1));
    }
  });

  it('ist gegen kaputte Eingaben robust (Bühne 0/NaN ⇒ Bühne 1)', () => {
    expect(stageTier(0)).toBe(0);
    expect(stageTier(Number.NaN)).toBe(0);
    expect(stageK(Number.NaN)).toBe(0);
    expect(Number.isFinite(stageK(1e9))).toBe(true);
  });
});
