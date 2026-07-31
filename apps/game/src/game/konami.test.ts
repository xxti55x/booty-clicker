import { describe, expect, it } from 'vitest';

import { goldFor } from './combat';
import { KONAMI_BOSS_DROPS, KONAMI_SEQUENCE, createKonami, konamiJackpot } from './konami';

describe('createKonami — der Sequenz-Detektor', () => {
  it('zündet exakt am Ende der vollen Sequenz und startet danach von vorn', () => {
    const k = createKonami();
    const hits = KONAMI_SEQUENCE.map((c) => k.feed(c));
    expect(hits.slice(0, -1).every((h) => !h)).toBe(true);
    expect(hits[hits.length - 1]).toBe(true);
    // Direkt noch einmal — der Zustand ist sauber zurückgesetzt.
    const again = KONAMI_SEQUENCE.map((c) => k.feed(c));
    expect(again[again.length - 1]).toBe(true);
  });

  it('ein Fehltritt wirft auf null zurück', () => {
    const k = createKonami();
    for (const c of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'KeyX']) expect(k.feed(c)).toBe(false);
    // Nach dem Fehltritt braucht es wieder die GANZE Sequenz.
    const hits = KONAMI_SEQUENCE.map((c) => k.feed(c));
    expect(hits[hits.length - 1]).toBe(true);
  });

  it('gehaltener Anlauf: ↑↑↑ bricht nicht ab, der dritte Pfeil zählt als Neustart-Schritt', () => {
    const k = createKonami();
    k.feed('ArrowUp');
    k.feed('ArrowUp');
    k.feed('ArrowUp'); // Fehltritt für Position 2, aber selbst Sequenz-Anfang
    const rest = KONAMI_SEQUENCE.slice(1); // es fehlt noch: ↑ ↓ ↓ ← → ← → B A
    const hits = rest.map((c) => k.feed(c));
    expect(hits[hits.length - 1]).toBe(true);
  });

  it('zwischen zwei Zündungen bleibt nichts hängen (kein Halb-Fortschritt)', () => {
    const k = createKonami();
    KONAMI_SEQUENCE.forEach((c) => k.feed(c));
    expect(k.feed('KeyA')).toBe(false); // das A der letzten Zündung zählt nicht doppelt
  });
});

describe('konamiJackpot — der Einmal-Jackpot', () => {
  it('ist exakt 20 Boss-Drops der aktuellen Bühne', () => {
    for (const zone of [1, 7, 42, 120]) {
      expect(konamiJackpot(zone)).toBe(goldFor(zone, true) * KONAMI_BOSS_DROPS);
    }
  });

  it('wächst mit der Bühne und bleibt bis Bühne 300 endlich (Float-Guard)', () => {
    expect(konamiJackpot(50)).toBeGreaterThan(konamiJackpot(10));
    expect(Number.isFinite(konamiJackpot(300))).toBe(true);
  });

  it('kaputte Bühnen fallen auf Bühne 1 zurück', () => {
    expect(konamiJackpot(Number.NaN)).toBe(konamiJackpot(1));
    expect(konamiJackpot(-5)).toBe(konamiJackpot(1));
    expect(konamiJackpot(0.5)).toBe(konamiJackpot(1));
  });
});
