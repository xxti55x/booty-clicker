/**
 * Truhen-Kobold (ROADMAP-V2 A3) — Timing, Fang-/Verpass-Pfad, Spawn-Sperren.
 *
 * Die ganze Mechanik ist absichtlich als PURES Modul gebaut, damit genau das hier
 * ohne DOM prüfbar ist: das Fangfenster, der fünfte Klick, der Mini-Frenzy und
 * die Bedingung „kein Spawn im Hintergrund-Tab".
 */
import { describe, expect, it } from 'vitest';

import {
  GOBLIN_BUFF_MULT,
  GOBLIN_BUFF_S,
  GOBLIN_HITS,
  GOBLIN_MAX_S,
  GOBLIN_MIN_S,
  GOBLIN_SIM_CATCH,
  GOBLIN_VISIBLE_S,
  createGoblin,
  goblinBuffLeft,
  goblinBuffMult,
  goblinExpired,
  goblinHit,
  goblinPos,
  goblinProgress,
  goblinSpawnAllowed,
  goblinTimeLeft,
  goblinVisible,
  rollNextGoblinAt,
} from './goblin';
import { Rng } from '../util/rng';

const OPEN = { hidden: false, boss: false, transitioning: false };

/** Ein Kobold, der genau JETZT auf der Bühne steht. */
function spawned(now: number) {
  return { ...createGoblin(), nextAt: now };
}

describe('goblin — Spawn-Kurve', () => {
  it('würfelt die Pause im 4–7-min-Fenster aus dem seeded Strom', () => {
    const rng = new Rng({ seed: 1234, cursor: 0 });
    for (let i = 0; i < 200; i++) {
      const at = rollNextGoblinAt(0, rng);
      expect(at).toBeGreaterThanOrEqual(GOBLIN_MIN_S * 1000);
      expect(at).toBeLessThanOrEqual(GOBLIN_MAX_S * 1000);
    }
    expect(GOBLIN_MIN_S).toBe(4 * 60);
    expect(GOBLIN_MAX_S).toBe(7 * 60);
  });

  it('ist deterministisch über (seed, cursor) — save-scum-fest', () => {
    const a = rollNextGoblinAt(1000, new Rng({ seed: 99, cursor: 5 }));
    const b = rollNextGoblinAt(1000, new Rng({ seed: 99, cursor: 5 }));
    expect(a).toBe(b);
  });
});

describe('goblin — Sichtbarkeitsfenster', () => {
  it('ist genau GOBLIN_VISIBLE_S Sekunden lang fangbar', () => {
    const g = spawned(10_000);
    expect(goblinVisible(g, 9_999)).toBe(false); // noch nicht da
    expect(goblinVisible(g, 10_000)).toBe(true);
    expect(goblinVisible(g, 10_000 + GOBLIN_VISIBLE_S * 1000 - 1)).toBe(true);
    expect(goblinVisible(g, 10_000 + GOBLIN_VISIBLE_S * 1000)).toBe(false); // weg
    expect(goblinExpired(g, 10_000 + GOBLIN_VISIBLE_S * 1000)).toBe(true);
    expect(goblinExpired(g, 12_000)).toBe(false);
  });

  it('ein ungeseedeter Zustand zeigt nie einen Kobold', () => {
    const g = createGoblin();
    expect(goblinVisible(g, 0)).toBe(false);
    expect(goblinVisible(g, 1e12)).toBe(false);
    expect(goblinExpired(g, 1e12)).toBe(false);
  });

  it('die Restzeit läuft von GOBLIN_VISIBLE_S auf 0', () => {
    const g = spawned(1000);
    expect(goblinTimeLeft(g, 1000)).toBeCloseTo(GOBLIN_VISIBLE_S, 9);
    expect(goblinTimeLeft(g, 5000)).toBeCloseTo(GOBLIN_VISIBLE_S - 4, 9);
    expect(goblinTimeLeft(g, 1000 + GOBLIN_VISIBLE_S * 1000)).toBe(0);
    expect(goblinTimeLeft(createGoblin(), 1000)).toBe(0);
  });
});

describe('goblin — Spawn-Sperren (DoD: kein Spawn im Hintergrund-Tab)', () => {
  it('lässt ihn nur bei sichtbarem Tab, ohne Bosskampf und ohne Bühnen-Wechsel', () => {
    expect(goblinSpawnAllowed(OPEN)).toBe(true);
    expect(goblinSpawnAllowed({ ...OPEN, hidden: true })).toBe(false);
    expect(goblinSpawnAllowed({ ...OPEN, boss: true })).toBe(false);
    expect(goblinSpawnAllowed({ ...OPEN, transitioning: true })).toBe(false);
  });
});

describe('goblin — Fangen und Verpassen', () => {
  it('braucht genau GOBLIN_HITS Klicks; der letzte fängt ihn', () => {
    let g = spawned(500);
    for (let i = 1; i < GOBLIN_HITS; i++) {
      const r = goblinHit(g, 1000);
      expect(r.counted).toBe(true);
      expect(r.caught).toBe(false);
      expect(r.state.hits).toBe(i);
      expect(goblinProgress(r.state)).toBeCloseTo(i / GOBLIN_HITS, 9);
      g = r.state;
    }
    const last = goblinHit(g, 1000);
    expect(last.caught).toBe(true);
    expect(last.state.caught).toBe(1);
    expect(last.state.hits).toBe(0);
    // `nextAt` fällt auf 0 — die Glue würfelt danach die nächste Runde.
    expect(last.state.nextAt).toBe(0);
    expect(last.state.buffUntil).toBe(1000 + GOBLIN_BUFF_S * 1000);
  });

  it('Klicks außerhalb des Fensters zählen nicht (verpasst = weg)', () => {
    const g = spawned(500);
    const late = goblinHit(g, 500 + GOBLIN_VISIBLE_S * 1000 + 1);
    expect(late.counted).toBe(false);
    expect(late.caught).toBe(false);
    expect(late.state).toBe(g); // identische Referenz ⇒ nichts passiert
    const early = goblinHit(spawned(5000), 100);
    expect(early.counted).toBe(false);
    // Und ein gefangener Kobold nimmt keinen Nachklapper mehr an.
    const caught = goblinHit({ ...g, hits: GOBLIN_HITS - 1 }, 600).state;
    expect(goblinHit(caught, 700).counted).toBe(false);
  });

  it('der Mini-Frenzy läuft GOBLIN_BUFF_S lang mit ×2 Klick', () => {
    const caught = goblinHit({ ...spawned(500), hits: GOBLIN_HITS - 1 }, 1000).state;
    expect(goblinBuffMult(caught.buffUntil, 1000)).toBe(GOBLIN_BUFF_MULT);
    expect(goblinBuffLeft(caught.buffUntil, 1000)).toBeCloseTo(GOBLIN_BUFF_S, 9);
    expect(goblinBuffMult(caught.buffUntil, 1000 + GOBLIN_BUFF_S * 1000 - 1)).toBe(
      GOBLIN_BUFF_MULT,
    );
    expect(goblinBuffMult(caught.buffUntil, 1000 + GOBLIN_BUFF_S * 1000)).toBe(1);
    expect(goblinBuffLeft(caught.buffUntil, 1e12)).toBe(0);
    expect(goblinBuffMult(0, 0)).toBe(1); // nie gefangen ⇒ neutral
  });
});

describe('goblin — Hoppel-Bahn', () => {
  it('bleibt über das ganze Fenster im Bild (0…1 in beiden Achsen)', () => {
    for (const spawnAt of [1000, 2000]) {
      const g = spawned(spawnAt);
      for (let t = 0; t <= GOBLIN_VISIBLE_S * 1000; t += 50) {
        const p = goblinPos(g, spawnAt + t);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('quert die Bühne — und die Richtung hängt am Spawn-Zeitpunkt', () => {
    const ltr = spawned(2000); // gerade Sekunde ⇒ links → rechts
    const rtl = spawned(1000); // ungerade Sekunde ⇒ rechts → links
    expect(goblinPos(ltr, 2000).x).toBeCloseTo(0, 9);
    expect(goblinPos(ltr, 2000 + GOBLIN_VISIBLE_S * 1000).x).toBeCloseTo(1, 9);
    expect(goblinPos(rtl, 1000).x).toBeCloseTo(1, 9);
    expect(goblinPos(rtl, 1000 + GOBLIN_VISIBLE_S * 1000).x).toBeCloseTo(0, 9);
  });
});

describe('goblin — Bot-Annahme', () => {
  it('die Fangquote der Sim ist dokumentiert konservativ (< 100 %)', () => {
    expect(GOBLIN_SIM_CATCH).toBeGreaterThan(0.5);
    expect(GOBLIN_SIM_CATCH).toBeLessThan(1);
  });
});
