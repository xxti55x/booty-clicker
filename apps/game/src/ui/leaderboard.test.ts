/**
 * ROADMAP-V2 X4 — der Saison-/Board-Countdown.
 *
 * `untilText` ist die einzige reine Funktion der Leaderboard-UI (der Rest ist
 * DOM-Kleber und wird headless bewiesen). Sie beschriftet zwei Countdowns, die
 * ein Spieler nebeneinander sieht — Saison-Ende und Wochen-Board-Ende —, muss
 * also über den ganzen Bereich von Wochen bis Minuten lesbar bleiben und darf an
 * keiner Grenze etwas Unsinniges behaupten („in 0 T").
 */
import { describe, expect, it } from 'vitest';

import { untilText } from './leaderboard';
import { boardSeasonFor, weekEndMs, weekIndexOf } from '../game/weekly';

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

describe('untilText', () => {
  it('zeigt ab einer Woche nur ganze Tage', () => {
    expect(untilText(12 * D)).toBe('12 T');
    expect(untilText(7 * D)).toBe('7 T');
    expect(untilText(12 * D + 23 * H)).toBe('12 T');
  });

  it('zeigt unter einer Woche Tage UND Stunden (der Rest zählt dort noch)', () => {
    expect(untilText(6 * D + 23 * H)).toBe('6 T 23 h');
    expect(untilText(1 * D)).toBe('1 T 0 h');
    expect(untilText(3 * D + 5 * H + 59 * MIN)).toBe('3 T 5 h');
  });

  it('fällt unter einem Tag auf Stunden und unter einer Stunde auf Minuten', () => {
    expect(untilText(23 * H + 59 * MIN)).toBe('23 h');
    expect(untilText(1 * H)).toBe('1 h');
    expect(untilText(59 * MIN)).toBe('59 min');
    expect(untilText(2 * MIN)).toBe('2 min');
  });

  it('sagt an der Grenze ehrlich „gleich" statt „in 0 min"', () => {
    expect(untilText(MIN)).toBe('gleich');
    expect(untilText(0)).toBe('gleich');
    expect(untilText(-5000)).toBe('gleich'); // abgelaufen (Uhr sprang)
    expect(untilText(Number.NaN)).toBe('gleich');
  });

  it('beschriftet echte Saison-/Wochen-Fenster plausibel', () => {
    const now = Date.UTC(2026, 6, 26); // Sonntag, 26.07.2026
    const week = weekIndexOf(now);
    // Das Wochen-Board endet am Montag darauf — also in gut einem Tag.
    expect(untilText(weekEndMs(week) - now)).toBe('1 T 0 h');
    // Die Saison läuft 13 Wochen; ihr Ende liegt in Tagen, nie in Minuten.
    expect(untilText(boardSeasonFor(week).endMs - now)).toMatch(/^\d+ T( \d+ h)?$/);
  });
});
