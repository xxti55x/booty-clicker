import { describe, expect, it } from 'vitest';

import {
  createCombat,
  hit,
  killsInSeconds,
  MONSTERS_PER_ZONE,
  RIVAL_MIN_SECONDS,
  tickKillCooldown,
} from './combat';

/**
 * Goal: „Bei zu hoher dps werden bühnen übersprungen, von bühne 13 direkt zu
 * 19. Man landet wieder zu schnell bei seinem alten highscore."
 *
 * Der Grund war keine Balance-Frage, sondern eine Kopplung an die Hardware:
 * Der Frame-Tick bringt EINEN Schadensschub, `hit` tötet daraufhin höchstens
 * einen Gegner. Bei 60 fps waren das 60 Rivalen je Sekunde — bei zehn je Bühne
 * also sechs Bühnen in einer Sekunde, genau der gemeldete Sprung. Und auf
 * einem 144-Hz-Gerät wäre derselbe Spielstand 2,4-mal schneller gewesen.
 *
 * Die Sperre bindet das Tempo an die Uhr. Diese Anker halten fest, dass es
 * dort bleibt.
 */

/** Einen Lauf über `sekunden` simulieren, mit `fps` Bildern je Sekunde. */
function laufe(sekunden: number, fps: number): number {
  let c = createCombat();
  const dt = 1 / fps;
  for (let i = 0; i < sekunden * fps; i++) {
    c = tickKillCooldown(c, dt);
    // Absurd viel Schaden — der Fall, um den es geht.
    c = hit(c, 1e12).state;
  }
  return c.zone;
}

describe('Bühnen-Tempo hängt an der Uhr, nicht an der Bildrate', () => {
  // Der eigentliche Fehler: Wer flüssiger rendert, kam schneller voran.
  it('kommt bei 30, 60 und 144 fps gleich weit', () => {
    const tiefen = [30, 60, 144, 240].map((fps) => laufe(10, fps));
    for (const z of tiefen) {
      expect(Math.abs(z - tiefen[0]!), `Tiefen: ${tiefen.join(', ')}`).toBeLessThanOrEqual(1);
    }
  });

  // Und der sichtbare Teil: Bühnen ziehen vorbei, statt zu verschwinden.
  it('überspringt keine Bühne mehr — sechs pro Sekunde sind vorbei', () => {
    const zehnSekunden = laufe(10, 60);
    const proSekunde = (zehnSekunden - 1) / 10;
    // Vorher: 60 Kills/s ÷ 10 je Bühne = 6 Bühnen/s.
    expect(proSekunde, `${proSekunde.toFixed(2)} Bühnen je Sekunde`).toBeLessThan(1.2);
    // Aber stehen bleibt es auch nicht — Überschuss-Schaden lohnt weiter.
    expect(proSekunde).toBeGreaterThan(0.3);
  });

  it('lässt überschüssigen Schaden NICHT verfallen', () => {
    // Der Rivale liegt im Minus und fällt, sobald die Sperre fällt — ohne dass
    // noch einmal zugeschlagen werden müsste.
    let c = createCombat();
    c = hit(c, 1e12).state; // Kill 1, setzt die Sperre
    const rGesperrt = hit(c, 1e12); // Schaden landet, Kill wartet
    expect(rGesperrt.killed).toBe(false);
    expect(rGesperrt.state.hp).toBeLessThan(0);
    const rFrei = hit(tickKillCooldown(rGesperrt.state, RIVAL_MIN_SECONDS), 0);
    expect(rFrei.killed, 'der aufgestaute Schaden schlägt durch').toBe(true);
  });

  it('nennt eine Bühnendauer, die man sehen kann', () => {
    const proBuehne = MONSTERS_PER_ZONE * RIVAL_MIN_SECONDS;
    expect(proBuehne, `${proBuehne.toFixed(2)} s je Bühne`).toBeGreaterThanOrEqual(1);
    // Und keine Zähigkeit: Eine Bühne bleibt unter drei Sekunden.
    expect(proBuehne).toBeLessThan(3);
  });

  it('rechnet die Sperre auch als reine Zahl (für Sim und Offline)', () => {
    expect(killsInSeconds(1)).toBeCloseTo(1 / RIVAL_MIN_SECONDS, 9);
    expect(killsInSeconds(0)).toBe(0);
    for (const bad of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      expect(Number.isFinite(killsInSeconds(bad)) || killsInSeconds(bad) === 0).toBe(true);
    }
  });
});
