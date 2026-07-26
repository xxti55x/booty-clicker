import { describe, expect, it } from 'vitest';

import { OFFLINE_CAP_S, offlineGold } from '../save/ch-store';
import { formatAway, formatCap, WELCOME_BACK_MIN_MS, welcomeBackData } from './welcome-back';

const MIN = 60_000;
const H = 3_600_000;

describe('X3 — Willkommen-zurück-Card', () => {
  // Die Kern-Zusage des Pakets: was die Card zeigt, ist EXAKT was gebucht wird.
  it('zeigt exakt den `offlineGold`-Betrag — über alle Zonen/DPS/Optionen', () => {
    const cases: [number, number, number, Parameters<typeof offlineGold>[3]][] = [
      [50, 1, 42 * MIN, {}],
      [1_200, 7, 3 * H, {}],
      [9e6, 61, 26 * H, {}],
      [500, 12, 2 * H, { clickDmg: 40, coachCps: 3 }],
      [500, 12, 2 * H, { goldMult: 4.5, rateBonus: 0.2 }],
      [500, 12, 30 * H, { capS: 12 * 3600 }],
      [1e12, 200, 11 * MIN, { clickDmg: 1e6, coachCps: 12, goldMult: 3, rateBonus: 0.35 }],
    ];
    for (const [dps, zone, ms, opts] of cases) {
      const card = welcomeBackData(dps, zone, ms, opts);
      expect(card, `dps=${dps} zone=${zone}`).not.toBeNull();
      expect(card!.gold).toBe(offlineGold(dps, zone, ms, opts));
    }
  });

  it('erscheint erst über 10 min Abwesenheit', () => {
    expect(WELCOME_BACK_MIN_MS).toBe(10 * MIN);
    expect(welcomeBackData(1e6, 5, 9 * MIN)).toBeNull();
    expect(welcomeBackData(1e6, 5, 10 * MIN)).toBeNull(); // exakt 10 min ⇒ noch nicht
    expect(welcomeBackData(1e6, 5, 10 * MIN + 1)).not.toBeNull();
  });

  it('bleibt still, wenn nichts verdient wurde (keine Crew, kein Coach)', () => {
    expect(offlineGold(0, 1, 5 * H)).toBe(0);
    expect(welcomeBackData(0, 1, 5 * H)).toBeNull();
  });

  it('meldet den Cap nur, wenn er wirklich gegriffen hat', () => {
    const under = welcomeBackData(1e5, 3, 7 * H)!;
    expect(under.capped).toBe(false);
    expect(under.capS).toBe(OFFLINE_CAP_S);
    expect(under.capLabel).toBe('8 h');

    const over = welcomeBackData(1e5, 3, 30 * H)!;
    expect(over.capped).toBe(true);
    // Gekappt heißt: 30 h zahlen exakt so viel wie 8 h — die Card zeigt beides.
    expect(over.gold).toBe(offlineGold(1e5, 3, OFFLINE_CAP_S * 1000));
    expect(over.away).toBe('1 T 6 h');
  });

  it('führt einen ausgebauten Cap (Nachtschicht/Gear) mit', () => {
    const card = welcomeBackData(1e5, 3, 30 * H, { capS: 14 * 3600 })!;
    expect(card.capS).toBe(14 * 3600);
    expect(card.capLabel).toBe('14 h');
    expect(card.capped).toBe(true);
    const still = welcomeBackData(1e5, 3, 10 * H, { capS: 14 * 3600 })!;
    expect(still.capped).toBe(false);
  });

  it('trägt die ungekappte Abwesenheit — die Card lügt nicht über die Zeit', () => {
    const card = welcomeBackData(1e5, 3, 30 * H)!;
    expect(card.awayMs).toBe(30 * H);
  });
});

describe('X3 — Formatierung', () => {
  it('formatiert die Abwesenheit deutsch und kurz', () => {
    expect(formatAway(0)).toBe('< 1 min');
    expect(formatAway(59_999)).toBe('< 1 min');
    expect(formatAway(60_000)).toBe('1 min');
    expect(formatAway(45 * MIN)).toBe('45 min');
    expect(formatAway(59 * MIN + 59_000)).toBe('59 min');
    expect(formatAway(H)).toBe('1 h');
    expect(formatAway(2 * H + 14 * MIN)).toBe('2 h 14 min');
    expect(formatAway(23 * H + 59 * MIN)).toBe('23 h 59 min');
    expect(formatAway(24 * H)).toBe('1 T');
    expect(formatAway(27 * H + 30 * MIN)).toBe('1 T 3 h');
    expect(formatAway(-5)).toBe('< 1 min');
  });

  it('formatiert den Cap mit Dezimalkomma und ohne Nullkommastelle', () => {
    expect(formatCap(OFFLINE_CAP_S)).toBe('8 h');
    expect(formatCap(12 * 3600)).toBe('12 h');
    expect(formatCap(9000)).toBe('2,5 h');
    expect(formatCap(0)).toBe('0 h');
  });
});
