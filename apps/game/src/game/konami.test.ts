import { describe, expect, it } from 'vitest';

import { goldFor } from './combat';
import {
  BOOTY_SEQUENCE,
  KONAMI_BOSS_DROPS,
  KONAMI_SEQUENCE,
  PABLO_CEILING,
  PABLO_GOLD,
  PABLO_OVERFLOW_MULT,
  PABLO_SEQUENCE,
  pabloNextGold,
  createKonami,
  konamiJackpot,
} from './konami';

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

// Der Jackpot hört jetzt auf „bootyclicker" — in JEDER Schreibweise.
describe('BOOTY_SEQUENCE — der Wort-Code', () => {
  it('buchstabiert bootyclicker', () => {
    expect(BOOTY_SEQUENCE.join(' ')).toBe(
      'KeyB KeyO KeyO KeyT KeyY KeyC KeyL KeyI KeyC KeyK KeyE KeyR',
    );
  });

  it('zündet auf die reine Buchstabenfolge', () => {
    const k = createKonami(BOOTY_SEQUENCE);
    const hits = BOOTY_SEQUENCE.map((c) => k.feed(c));
    expect(hits.slice(0, -1).every((h) => !h)).toBe(true);
    expect(hits[hits.length - 1]).toBe(true);
  });

  // Groß-/Kleinschreibung ist auf der `code`-Ebene gar keine Frage (KeyB ist
  // KeyB) — geprüft wird, dass Umschalt und Trennzeichen nicht ABBRECHEN.
  it('überlebt Umschalt, Bindestrich und Leerzeichen mittendrin', () => {
    for (const noise of ['ShiftLeft', 'Minus', 'Space', 'CapsLock']) {
      const k = createKonami(BOOTY_SEQUENCE);
      let fired = false;
      // „booty" + Zierrat + „clicker"
      for (const c of BOOTY_SEQUENCE.slice(0, 5)) k.feed(c);
      expect(k.feed(noise)).toBe(false);
      for (const c of BOOTY_SEQUENCE.slice(5)) fired = k.feed(c);
      expect(fired).toBe(true);
    }
  });

  it('bricht bei einem echten Fehlbuchstaben ab', () => {
    const k = createKonami(BOOTY_SEQUENCE);
    for (const c of BOOTY_SEQUENCE.slice(0, 5)) k.feed(c);
    k.feed('KeyZ');
    const rest = BOOTY_SEQUENCE.slice(5).map((c) => k.feed(c));
    expect(rest.every((h) => !h)).toBe(true);
  });
});

describe('PABLO — der Maximalgeld-Code', () => {
  it('buchstabiert pablokiwi', () => {
    expect(PABLO_SEQUENCE.join(' ')).toBe('KeyP KeyA KeyB KeyL KeyO KeyK KeyI KeyW KeyI');
  });

  it('zahlt die größte Zahl, mit der das Spiel noch exakt rechnet', () => {
    expect(PABLO_GOLD).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(PABLO_GOLD)).toBe(true);
    // Und der Beweis, warum nicht mehr: Schon zwei Schritte über die Grenze
    // hinaus verliert die Rechnung eine Stelle (2^53 + 2 − 2 ≠ 2^53 − 1).
    expect(PABLO_GOLD + 2 - 2).not.toBe(PABLO_GOLD);
  });

  it('läuft unabhängig vom Ahnen-Code (getrennte Detektoren)', () => {
    const p = createKonami(PABLO_SEQUENCE);
    for (const c of KONAMI_SEQUENCE) expect(p.feed(c)).toBe(false);
    const hits = PABLO_SEQUENCE.map((c) => p.feed(c));
    expect(hits[hits.length - 1]).toBe(true);
  });
});

// Gemeldeter Bug: Der Code sagte „mehr kann das Spiel nicht zählen" und tat
// nichts — während der Kontostand danach munter weiterwuchs (9.01 Qa ⇒ 10.23 Qa).
describe('pabloNextGold — der Cheat tut immer etwas Ehrliches', () => {
  it('füllt ein kleines Konto auf die exakte Grenze auf', () => {
    expect(pabloNextGold(0)).toBe(PABLO_GOLD);
    expect(pabloNextGold(1000)).toBe(PABLO_GOLD);
    expect(pabloNextGold(PABLO_GOLD - 1)).toBe(PABLO_GOLD);
  });

  it('hebt ein Konto, das die Grenze schon überschritten hat, weiter an', () => {
    const over = PABLO_GOLD * 2;
    expect(pabloNextGold(over)).toBe(over * PABLO_OVERFLOW_MULT);
    // Genau der Fall aus dem Bug-Bericht: Boosts hatten den Stand über die
    // Grenze getragen, und der Cheat verweigerte trotzdem die Arbeit.
    expect(pabloNextGold(1.023e16)).toBeGreaterThan(1.023e16);
  });

  it('bleibt endlich — nie Infinity, nie NaN', () => {
    for (const g of [0, 1e6, PABLO_GOLD, 1e100, 1e299, PABLO_CEILING, 1e308]) {
      const n = pabloNextGold(g);
      expect(Number.isFinite(n)).toBe(true);
      expect(Number.isNaN(n)).toBe(false);
      expect(n).toBeLessThanOrEqual(PABLO_CEILING);
      // Und die Differenz bleibt rechenbar (genau das bricht bei Infinity).
      expect(Number.isFinite(n - g)).toBe(true);
    }
  });

  it('meldet am Deckel ehrlich Stillstand (Rückgabe steigt nicht mehr)', () => {
    expect(pabloNextGold(PABLO_CEILING)).toBe(PABLO_CEILING);
  });

  it('verträgt kaputte Stände, statt sie weiterzureichen', () => {
    expect(pabloNextGold(Number.NaN)).toBe(PABLO_GOLD);
    expect(pabloNextGold(-5)).toBe(PABLO_GOLD);
    expect(pabloNextGold(Number.POSITIVE_INFINITY)).toBe(PABLO_GOLD);
  });
});
