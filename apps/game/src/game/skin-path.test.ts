import { describe, expect, it } from 'vitest';

import { SKINS } from '../character/skins';
import { MOVES } from '../choreo/moves';
import { VICTORY_MOVE } from '../choreo/sets';
import { PERCENT_STATS } from './gear';
import {
  BOSS_SECONDS,
  NODE_STARS,
  PATH_MAX_STARS,
  PATH_NODES,
  PATH_THRESHOLDS,
  SIGNATURE_MOVES,
  SIM_SKIN,
  addPathBoss,
  addWear,
  createSkinPath,
  nodesForScore,
  pathAmount,
  pathComplete,
  pathEntry,
  pathNodes,
  pathProgress,
  pathScore,
  signatureMove,
  skinPathBonus,
  skinPathMaxPercent,
  skinPathPowerBudget,
} from './skin-path';
import type { SkinKey } from '../types';

const IDS = Object.keys(SKINS) as SkinKey[];

describe('skin-path — die Fortschritts-Zahl', () => {
  it('zählt Tragezeit und Boss-Kills in EINE Zahl (ein Boss = 180 s)', () => {
    let p = createSkinPath();
    p = addWear(p, 'classic', 600);
    p = addPathBoss(p, 'classic');
    p = addPathBoss(p, 'classic');
    expect(pathEntry(p, 'classic')).toEqual({ s: 600, b: 2 });
    expect(pathScore(p, 'classic')).toBe(600 + 2 * BOSS_SECONDS);
  });

  it('bucht Bruchteile einer Sekunde auf (der 0,25-s-Tick darf nichts verlieren)', () => {
    let p = createSkinPath();
    for (let i = 0; i < 8; i++) p = addWear(p, 'robo', 0.25);
    expect(pathScore(p, 'robo')).toBeCloseTo(2, 10);
  });

  it('ist monoton: nicht-positive/nicht-endliche Werte lassen die Tafel stehen', () => {
    const p = addWear(createSkinPath(), 'classic', 100);
    expect(addWear(p, 'classic', 0)).toBe(p);
    expect(addWear(p, 'classic', -50)).toBe(p);
    expect(addWear(p, 'classic', Number.NaN)).toBe(p);
  });

  it('bleibt rein — die alte Tafel wird nie verändert', () => {
    const a = addWear(createSkinPath(), 'classic', 100);
    const b = addPathBoss(a, 'classic');
    expect(pathEntry(a, 'classic')).toEqual({ s: 100, b: 0 });
    expect(pathEntry(b, 'classic')).toEqual({ s: 100, b: 1 });
  });

  it('liest kaputte/fehlende Einträge als 0 statt zu werfen', () => {
    const junk = { classic: { s: Number.NaN, b: -3 }, disco: null } as never;
    expect(pathEntry(junk, 'classic')).toEqual({ s: 0, b: 0 });
    expect(pathEntry(junk, 'disco')).toEqual({ s: 0, b: 0 });
    expect(pathScore(createSkinPath(), 'nixda')).toBe(0);
  });
});

describe('skin-path — die Knoten-Leiter', () => {
  it('hat genau fünf aufsteigende Schwellen', () => {
    expect(PATH_THRESHOLDS).toHaveLength(PATH_NODES);
    for (let i = 1; i < PATH_THRESHOLDS.length; i++) {
      expect(PATH_THRESHOLDS[i]).toBeGreaterThan(PATH_THRESHOLDS[i - 1]);
    }
  });

  it('schaltet exakt AN der Schwelle frei, nicht davor', () => {
    expect(nodesForScore(PATH_THRESHOLDS[0] - 1)).toBe(0);
    expect(nodesForScore(PATH_THRESHOLDS[0])).toBe(1);
    expect(nodesForScore(PATH_THRESHOLDS[4])).toBe(PATH_NODES);
    expect(nodesForScore(PATH_THRESHOLDS[4] * 1000)).toBe(PATH_NODES);
  });

  it('liest Müll als 0 Knoten', () => {
    expect(nodesForScore(Number.NaN)).toBe(0);
    expect(nodesForScore(-1)).toBe(0);
  });

  /**
   * Die GEMESSENE Vorgabe des Ideen-Dokuments: Knoten 1 fällt im ersten Sitting.
   * Der Bot schafft in 45 min 2 700 Trage- + ~6 Boss-Sekundenblöcke; selbst der
   * boss-schwächste Fall (4 Gates) muss reichen.
   */
  it('lässt Knoten 1 im ersten Sitting fallen (45 min + 4 Bosse)', () => {
    expect(nodesForScore(2700 + 4 * BOSS_SECONDS)).toBeGreaterThanOrEqual(1);
  });

  /** Und die Gegenvorgabe: Knoten 5 darf Tage dauern. */
  it('macht Knoten 5 zu einem Mehr-Tage-Ziel (> 48 h auch bei aktivem Spiel)', () => {
    // Beharrungszustand des Bots: 0,31 Boss/min ⇒ 3 600 + 0,31·60·180 Pfad-Sek./h.
    const perHour = 3600 + 0.31 * 60 * BOSS_SECONDS;
    expect(PATH_THRESHOLDS[PATH_NODES - 1] / perHour).toBeGreaterThan(48);
  });
});

describe('skin-path — die Wirkung', () => {
  it('zahlt auf den `star.stat` jedes Skins, ein Knoten = ein Fünftel Stern', () => {
    for (const id of IDS) {
      const cfg = SKINS[id];
      const b = skinPathBonus({ [id]: { s: PATH_THRESHOLDS[0], b: 0 } }, id);
      expect(b[cfg.star.stat]).toBeCloseTo(cfg.star.perStar * NODE_STARS, 10);
    }
  });

  it('zahlt für den fünften Knoten KEINEN weiteren Prozentpunkt (er ist der Move)', () => {
    for (const id of IDS) {
      expect(pathAmount(id, PATH_NODES)).toBeCloseTo(pathAmount(id, PATH_NODES - 1), 10);
    }
  });

  it('ist als VOLLER Pfad weniger wert als EIN zusätzlicher Stern', () => {
    expect(PATH_MAX_STARS).toBeLessThan(1);
    for (const id of IDS) {
      expect(pathAmount(id, PATH_NODES - 1)).toBeLessThan(SKINS[id].star.perStar);
    }
  });

  /**
   * DIE Leitplanke des Ideen-Dokuments („≤ +8 % auf den skin-typischen Term"),
   * strukturell gegen den LEBENDEN Katalog geprüft: Ein künftiger Skin mit einem
   * fetteren Stern reißt diesen Test, nicht erst die Balance.
   */
  it('bleibt auf jedem Prozent-Term unter +8 % (Leitplanke, gegen den Katalog)', () => {
    expect(skinPathMaxPercent()).toBeLessThanOrEqual(0.08 + 1e-9);
    for (const id of IDS) {
      const cfg = SKINS[id];
      if (!PERCENT_STATS.includes(cfg.star.stat) && cfg.star.stat !== 'allPct') continue;
      expect(pathAmount(id, PATH_NODES - 1)).toBeLessThanOrEqual(0.08 + 1e-9);
    }
  });

  it('verteilt Diamant-Booty `allPct` wie der Gear-Fold über alle Prozent-Stats', () => {
    const b = skinPathBonus({ diamond: { s: PATH_THRESHOLDS[3], b: 0 } }, 'diamond');
    const each = SKINS.diamond.star.perStar * NODE_STARS * 4;
    for (const st of PERCENT_STATS) expect(b[st]).toBeCloseTo(each, 10);
  });

  /** Dieselbe Einheit wie `affixPowerBudget` (1c/3a) und der 2a-Deckel. */
  it('hält das Leistungs-Produkt eines vollen Pfades klar unter ×1.15', () => {
    expect(skinPathPowerBudget()).toBeLessThan(1.15);
  });

  it('faltet ohne Fortschritt und für unbekannte Skins exakt ×1', () => {
    const empty = skinPathBonus(createSkinPath(), 'classic');
    for (const v of Object.values(empty)) expect(v).toBe(0);
    const nope = skinPathBonus({ nixda: { s: 1e9, b: 1e6 } }, 'nixda');
    for (const v of Object.values(nope)) expect(v).toBe(0);
    expect(pathAmount('nixda', 4)).toBe(0);
  });
});

describe('skin-path — Knoten 5: der Signature-Move', () => {
  it('gibt jedem der zehn Skins einen Move, den es in MOVES wirklich gibt', () => {
    for (const id of IDS) {
      const name = SIGNATURE_MOVES[id];
      expect(MOVES.some((m) => m.name === name)).toBe(true);
    }
  });

  it('vergibt NIE den Standard-Sieges-Move (sonst wäre es keine Signatur)', () => {
    const standard = MOVES[VICTORY_MOVE].name;
    for (const id of IDS) expect(SIGNATURE_MOVES[id]).not.toBe(standard);
  });

  it('liefert den Move erst mit Knoten 5', () => {
    const almost = { classic: { s: PATH_THRESHOLDS[3], b: 0 } };
    expect(pathNodes(almost, 'classic')).toBe(4);
    expect(signatureMove(almost, 'classic')).toBeNull();
    expect(pathComplete(almost, 'classic')).toBe(false);

    const full = { classic: { s: PATH_THRESHOLDS[4], b: 0 } };
    expect(pathComplete(full, 'classic')).toBe(true);
    expect(signatureMove(full, 'classic')).toBe(SIGNATURE_MOVES.classic);
  });

  it('liefert für einen unbekannten Skin null statt zu werfen', () => {
    expect(signatureMove({ nixda: { s: 1e9, b: 0 } }, 'nixda')).toBeNull();
  });
});

describe('skin-path — der Anzeige-Fortschritt', () => {
  it('rechnet den Anteil zum nächsten Knoten zwischen den Schwellen', () => {
    const mid = (PATH_THRESHOLDS[0] + PATH_THRESHOLDS[1]) / 2;
    const p = pathProgress({ classic: { s: mid, b: 0 } }, 'classic');
    expect(p.nodes).toBe(1);
    expect(p.next).toBe(PATH_THRESHOLDS[1]);
    expect(p.frac).toBeCloseTo(0.5, 2);
  });

  it('steht am vollen Pfad auf 100 % ohne nächste Schwelle', () => {
    const p = pathProgress({ classic: { s: PATH_THRESHOLDS[4], b: 0 } }, 'classic');
    expect(p.nodes).toBe(PATH_NODES);
    expect(p.next).toBe(0);
    expect(p.frac).toBe(1);
  });

  it('trennt Tragezeit und Bosse in der Anzeige', () => {
    const p = pathProgress({ disco: { s: 1200, b: 3 } }, 'disco');
    expect(p.wear).toBe(1200);
    expect(p.bosses).toBe(3);
    expect(p.score).toBe(1200 + 3 * BOSS_SECONDS);
  });
});

describe('skin-path — der Bot-Skin', () => {
  it('ist der Spiel-Standard und damit ein echter Katalog-Skin', () => {
    expect(Object.hasOwn(SKINS, SIM_SKIN)).toBe(true);
    expect(SIM_SKIN).toBe('classic');
  });

  it('trägt den stärksten Pfad-Bonus des Katalogs (die Anker messen den Extremfall)', () => {
    expect(pathAmount(SIM_SKIN, PATH_NODES - 1)).toBeCloseTo(skinPathMaxPercent(), 10);
  });
});
