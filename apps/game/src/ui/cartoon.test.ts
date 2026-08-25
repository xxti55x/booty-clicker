import { describe, expect, it } from 'vitest';

import { CREW, levelTier, CREW_MILESTONES } from '../game/heroes';
import {
  CARTOON_IDS,
  CARTOON_PALETTES,
  cartoonBody,
  cartoonColor,
  hasCartoon,
  levelFrame,
  LEVEL_FRAMES,
} from './cartoon';

/**
 * Goal: „Avatare der crew sollen cartoon look beibehalten … Unique design für
 * alle und deren fähigkeiten. Es sticht nicht genug Herraus!"
 *
 * Der Vorgänger scheiterte an einer Sache, die kein Test gesehen hat: EINE
 * Schablone für fünfzehn Figuren, variiert über Kopfform, Frisur und ein
 * kleines Accessoire. Bei 32 px — der Größe in der Fähigkeits-Kachel — blieb
 * davon nichts übrig. Diese Anker halten fest, was das verhindert.
 */
const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const abstand = (a: string, b: string): number => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

describe('Cartoon-Figuren — der Kader', () => {
  it('lässt KEIN Crew-Mitglied ohne eigene Figur', () => {
    for (const c of CREW) {
      expect(hasCartoon(c.id), c.id).toBe(true);
      expect(cartoonBody(c.id).length, c.id).toBeGreaterThan(200);
    }
    expect(CARTOON_IDS.length).toBe(CREW.length);
  });

  // Regel 1 des Moduls: Die Platte ist der einzige Kanal, der bei 32 px sicher
  // überlebt. Zwei Mitglieder mit derselben Farbe wären dort nicht mehr zu
  // trennen — egal wie verschieden ihre Gesichter sind.
  it('gibt jeder Figur eine EIGENE Plattenfarbe', () => {
    const farben = CREW.map((c) => CARTOON_PALETTES[c.id]!.bg);
    expect(new Set(farben).size).toBe(CREW.length);
    for (const f of farben) expect(f).toMatch(/^#[0-9a-f]{6}$/);
  });

  /**
   * Und zwar mit ABSTAND. Verschieden zu sein reicht nicht: `#4c1d95` und
   * `#4c1d96` sind zwei Farben und trotzdem dieselbe Fläche.
   *
   * Die Grenze ist eine Design-Grenze, keine Messung: Vier Figuren liegen
   * thematisch im Blau-Violett-Feld (Influencerin, KI, Orbit, Kosmos) und
   * werden dort über die Helligkeit getrennt. Wer eine Palette anfasst und
   * diesen Anker reißt, hat genau dieses Feld zu eng gemacht.
   */
  it('hält die Plattenfarben WAHRNEHMBAR auseinander', () => {
    let engste = Number.POSITIVE_INFINITY;
    let paar = '';
    for (let i = 0; i < CREW.length; i++) {
      for (let j = i + 1; j < CREW.length; j++) {
        const a = CREW[i]!.id;
        const b = CREW[j]!.id;
        const d = abstand(CARTOON_PALETTES[a]!.bg, CARTOON_PALETTES[b]!.bg);
        if (d < engste) {
          engste = d;
          paar = `${a}/${b}`;
        }
      }
    }
    expect(engste, `engstes Paar: ${paar}`).toBeGreaterThan(60);
  });

  it('stellt jede Figur auf eine vollflächige Platte', () => {
    for (const c of CREW) {
      const bg = CARTOON_PALETTES[c.id]!.bg;
      expect(cartoonBody(c.id), c.id).toContain(`width="32" height="32" fill="${bg}"`);
      expect(cartoonColor(c.id)).toBe(bg);
    }
  });

  it('unterscheidet die beiden Posen bei jeder Figur', () => {
    for (const c of CREW) {
      expect(cartoonBody(c.id, 'power'), c.id).not.toBe(cartoonBody(c.id, 'base'));
    }
  });

  it('macht keine zwei Figuren gleich', () => {
    const alle = CREW.map((c) => cartoonBody(c.id));
    expect(new Set(alle).size).toBe(CREW.length);
  });

  it('bleibt bei einer unbekannten Id heil (leer statt Wurf)', () => {
    expect(hasCartoon('gibtsnicht')).toBe(false);
    expect(cartoonBody('gibtsnicht')).toBe('');
    expect(cartoonColor('gibtsnicht')).toBeUndefined();
  });

  it('ist deterministisch — gleicher Input, byte-gleiche Zeichnung', () => {
    expect(cartoonBody('cosmic', 'power')).toBe(cartoonBody('cosmic', 'power'));
  });
});

// ---------------------------------------------------------------------------
// Der Level-Rahmen
// ---------------------------------------------------------------------------
describe('Level-Rahmen', () => {
  // Der Rahmen soll beim Kaufen die Frage beantworten „wer hängt zurück?".
  // Eigene Schwellen wären eine zweite Leiter neben der, die den crew-weiten
  // Faktor steuert — und würden genau dann nichts sagen, wenn es zählt.
  it('springt an denselben Schwellen wie der crew-weite Meilenstein', () => {
    expect(levelTier(0)).toBe(0);
    expect(levelTier(CREW_MILESTONES[0]! - 1)).toBe(0);
    for (let i = 0; i < CREW_MILESTONES.length; i++) {
      expect(levelTier(CREW_MILESTONES[i]!), `Schwelle ${CREW_MILESTONES[i]}`).toBe(i + 1);
    }
    expect(levelTier(999_999)).toBe(CREW_MILESTONES.length);
  });

  it('wächst monoton und bleibt bei kaputten Eingaben gültig', () => {
    let prev = 0;
    for (const lv of [0, 1, 24, 25, 49, 50, 99, 100, 199, 200, 249, 250, 400]) {
      const t = levelTier(lv);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -7]) {
      expect(levelTier(bad)).toBeGreaterThanOrEqual(0);
      expect(levelTier(bad)).toBeLessThanOrEqual(CREW_MILESTONES.length);
    }
  });

  it('lässt Stufe 0 ohne eigene Farbe (dort steht die Figurfarbe)', () => {
    expect(levelFrame(0)).toBeUndefined();
    for (let t = 1; t < LEVEL_FRAMES.length; t++) {
      expect(levelFrame(t), `Stufe ${t}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Eine Stufe je Schwelle, plus die Null — sonst fiele die oberste Schwelle
    // still auf die Farbe der vorletzten zurück.
    expect(LEVEL_FRAMES.length).toBe(CREW_MILESTONES.length + 1);
  });

  it('klemmt Stufen außerhalb der Leiter statt zu werfen', () => {
    expect(levelFrame(-3)).toBeUndefined();
    expect(levelFrame(99)).toBe(LEVEL_FRAMES[LEVEL_FRAMES.length - 1]);
  });
});
