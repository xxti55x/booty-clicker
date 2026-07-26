/**
 * Choreo-Set-Rotation (ROADMAP-V2 A4) — Determinismus der Set-Zuordnung und die
 * Auswahl-Ebene des `Choreographer`. Die Pose-Mathematik ist NICHT Gegenstand
 * dieser Datei (dafür `moves.test.ts`) — A4 fasst sie bewusst nicht an.
 */
import { describe, expect, it } from 'vitest';

import { Choreographer, MOVES } from './moves';
import {
  BOSS_SET_SIZE,
  MOVE_INTENSITY,
  SET_SIZE,
  VICTORY_MOVE,
  activeSet,
  bossSetForZone,
  moveIntensity,
  setForZone,
} from './sets';
import { REMIX_OFF, remixSeedFor } from '../game/stage-mods';

const SEED = remixSeedFor(2024, 0);

describe('sets — Katalog-Verankerung', () => {
  it('die Intensitäts-Tabelle deckt GENAU die vorhandenen Moves ab', () => {
    expect(MOVE_INTENSITY).toHaveLength(MOVES.length);
    // Paarweise verschieden ⇒ „die zwei intensivsten" sind ohne Gleichstands-Regel eindeutig.
    expect(new Set(MOVE_INTENSITY).size).toBe(MOVES.length);
    expect(MOVES.map((m) => m.name)).toEqual([
      'Twerk',
      'Hip Circles',
      'Drop It Low',
      'Shimmy',
      'Bounce',
      'Welle',
      'Booty-Slam',
      'Diva-Turn',
    ]);
    expect(moveIntensity(-1)).toBe(0);
    expect(moveIntensity(MOVES.length)).toBe(0);
  });

  it('der Sieges-Move ist der Diva-Turn', () => {
    expect(VICTORY_MOVE).toBeGreaterThanOrEqual(0);
    expect(MOVES[VICTORY_MOVE].name).toBe('Diva-Turn');
  });
});

describe('sets — Determinismus', () => {
  it('gleiche (Bühne, Remix) ⇒ dasselbe Set aus drei VERSCHIEDENEN Moves', () => {
    for (let z = 1; z <= 60; z++) {
      const a = setForZone(z, SEED);
      expect(a).toHaveLength(SET_SIZE);
      expect(new Set(a).size).toBe(SET_SIZE);
      for (const i of a) expect(i).toBeGreaterThanOrEqual(0);
      for (const i of a) expect(i).toBeLessThan(MOVES.length);
      expect([...a]).toEqual([...setForZone(z, SEED)]);
    }
  });

  it('verschiedene Bühnen sehen (meistens) verschieden aus', () => {
    let differs = 0;
    for (let z = 1; z < 40; z++) {
      const a = [...setForZone(z, SEED)].sort().join(',');
      const b = [...setForZone(z + 1, SEED)].sort().join(',');
      if (a !== b) differs++;
    }
    // Kein Zufall ohne Wiederholung — aber 39 Nachbarpaare dürfen fast nie gleich sein.
    expect(differs).toBeGreaterThanOrEqual(35);
  });

  it('ein anderer Remix (Aszension) mischt die Sets neu', () => {
    const a = remixSeedFor(2024, 0);
    const b = remixSeedFor(2024, 1);
    const mapA: string[] = [];
    const mapB: string[] = [];
    for (let z = 1; z < 40; z++) {
      mapA.push([...setForZone(z, a)].sort().join(','));
      mapB.push([...setForZone(z, b)].sort().join(','));
    }
    expect(mapA).not.toEqual(mapB);
  });

  it('ohne Remix bleibt es beim Standard-Trio (Verhalten wie vor A4)', () => {
    expect([...setForZone(17, REMIX_OFF)]).toEqual([0, 1, 2]);
    expect([...setForZone(42, REMIX_OFF)]).toEqual([0, 1, 2]);
  });
});

describe('sets — Boss erzwingt die zwei intensivsten', () => {
  it('nimmt genau die Top-2 des Sets, absteigend', () => {
    for (let z = 1; z <= 60; z++) {
      const set = setForZone(z, SEED);
      const boss = bossSetForZone(z, SEED);
      expect(boss).toHaveLength(BOSS_SET_SIZE);
      for (const i of boss) expect(set).toContain(i);
      expect(moveIntensity(boss[0])).toBeGreaterThan(moveIntensity(boss[1]));
      const dropped = set.filter((i) => !boss.includes(i));
      for (const d of dropped) {
        expect(moveIntensity(boss[1])).toBeGreaterThan(moveIntensity(d));
      }
    }
  });

  it('activeSet schaltet zwischen Farm-Set und Boss-Set', () => {
    expect([...activeSet(23, SEED, false)]).toEqual([...setForZone(23, SEED)]);
    expect([...activeSet(23, SEED, true)]).toEqual([...bossSetForZone(23, SEED)]);
  });
});

describe('Choreographer — Auswahl-Ebene', () => {
  it('ohne Set bleibt es der alte Rundlauf über alle Moves', () => {
    const c = new Choreographer();
    c.setMove(0);
    for (let i = 1; i <= MOVES.length; i++) {
      c.advance();
      expect(c.moveIdx).toBe(i % MOVES.length);
    }
  });

  it('mit Set kreist advance() nur im Vorrat', () => {
    const c = new Choreographer();
    const set = [5, 2, 7];
    c.useSet(set);
    expect(c.moveSet).toEqual(set);
    expect(c.moveIdx).toBe(5); // laufender Move gehörte nicht dazu ⇒ sofort umgestellt
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(c.moveIdx);
      c.advance();
    }
    expect(seen).toEqual([5, 2, 7, 5, 2, 7]);
  });

  it('ein Set, das den laufenden Move enthält, wechselt NICHT (kein Zucken)', () => {
    const c = new Choreographer();
    c.setMove(3);
    c.useSet([1, 3, 6]);
    expect(c.moveIdx).toBe(3);
  });

  it('der einmalige Sieges-Move fällt beim nächsten Wechsel ins Set zurück', () => {
    const c = new Choreographer();
    c.useSet([1, 4, 6]);
    c.setMove(VICTORY_MOVE); // Boss besiegt — Diva-Turn, einmalig
    expect(c.moveIdx).toBe(VICTORY_MOVE);
    c.advance();
    expect(c.moveIdx).toBe(1); // zurück an den Anfang des Vorrats
  });

  it('räumt Unsinn aus dem Set und schaltet bei leerem Set zurück', () => {
    const c = new Choreographer();
    c.useSet([1, 99, -2, 2.5, 4]);
    expect(c.moveSet).toEqual([1, 4]);
    c.useSet([]);
    expect(c.moveSet).toEqual([]);
    c.setMove(0);
    c.advance();
    expect(c.moveIdx).toBe(1); // wieder Rundlauf
  });

  it('meldet jeden Wechsel an den HUD-Hook', () => {
    const c = new Choreographer();
    c.setMove(2); // steht außerhalb des gleich gesetzten Vorrats
    const names: string[] = [];
    c.onMove = (n) => names.push(n);
    c.useSet([6, 0]); // ⇒ sofort auf 6 (Booty-Slam)
    c.advance(); // ⇒ 0 (Twerk)
    expect(names).toEqual([MOVES[6].name, MOVES[0].name]);
  });
});
