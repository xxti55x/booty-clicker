import { describe, expect, it } from 'vitest';

import { CREW, type AbilityKind, allowedKinds } from '../game/heroes';
import { abilityIcon, OWNER_MARK_IDS } from './ability-icons';

const ALL_KINDS: AbilityKind[] = [
  'power',
  'crit',
  'critdmg',
  'beat',
  'boss',
  'combo',
  'ekstase',
  'idle',
];

/**
 * Goal: „custom icons für jede fähigkeit des charakters".
 *
 * Vorher trug jede Fähigkeits-Kachel das PORTRAIT ihres Trägers plus ein
 * 15-px-Sorten-Badge — auf einer Karte mit acht Kacheln also acht Mal dasselbe
 * Gesicht. Diese Anker halten fest, dass jede Kombination aus Träger und Sorte
 * jetzt wirklich ihr eigenes Bild hat.
 */
describe('Fähigkeits-Icons', () => {
  it('liefert für JEDE Sorte ein Motiv (keine Lücke im Katalog)', () => {
    for (const kind of ALL_KINDS) {
      const svg = abilityIcon('boss', kind);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      // Ein Icon ohne Geometrie wäre ein leerer Rahmen.
      expect(svg).toMatch(/<(path|circle|rect|ellipse)/);
    }
  });

  it('gibt jedem Crew-Mitglied ein eigenes Beizeichen', () => {
    for (const cfg of CREW) expect(OWNER_MARK_IDS).toContain(cfg.id);
    // Und keine zwei Mitglieder teilen sich eines.
    expect(new Set(OWNER_MARK_IDS).size).toBe(OWNER_MARK_IDS.length);
  });

  // Der eigentliche Punkt: Zwei Kacheln nebeneinander müssen VERSCHIEDEN
  // aussehen — sowohl bei gleicher Sorte auf verschiedenen Trägern als auch bei
  // verschiedenen Sorten auf demselben Träger.
  it('macht jede Kombination aus Träger und Sorte unterscheidbar', () => {
    const seen = new Map<string, string>();
    for (const cfg of CREW) {
      for (const kind of ALL_KINDS) {
        const svg = abilityIcon(cfg.id, kind);
        const wo = `${cfg.id}/${kind}`;
        const schon = seen.get(svg);
        expect(schon, `${wo} sieht aus wie ${schon}`).toBeUndefined();
        seen.set(svg, wo);
      }
    }
    expect(seen.size).toBe(CREW.length * ALL_KINDS.length);
  });

  // Die Zusicherung ist dieselbe wie vorher — die Kacheln zweier Mitglieder
  // müssen sich auf einen Blick unterscheiden. Nur der KANAL hat gewechselt:
  // Vorher trug eine Tönung (`style="color:…"`) die Trägerfarbe, jetzt die
  // vollflächige Platte. Eine Tönung reicht bei 34 px nicht, um fünfzehn
  // Träger zu trennen — die Fläche schon.
  it('gibt jedem Träger seine EIGENE Plattenfarbe', () => {
    const platten = CREW.map(
      (c) => /<rect width="24" height="24" fill="([^"]+)"\/>/.exec(abilityIcon(c.id, 'power'))?.[1],
    );
    for (const f of platten) expect(f).toMatch(/^#[0-9a-fA-F]{6}$/);
    // Keine zwei Mitglieder teilen sich eine Platte — sonst wäre der Kanal für
    // genau das Paar wertlos, das man auseinanderhalten will.
    expect(new Set(platten).size).toBe(CREW.length);
  });

  // Die Sortenform steht AUF der Platte und muss dort lesbar bleiben. Eine
  // feste Tinte ginge auf der hellen Creme-Platte des A-Promis unter, eine
  // helle auf keiner der dunklen.
  it('wählt die Tinte nach der Helligkeit der Platte', () => {
    for (const c of CREW) {
      const svg = abilityIcon(c.id, 'power');
      const bg = /<rect width="24" height="24" fill="(#[0-9a-fA-F]{6})"\/>/.exec(svg)?.[1];
      const ink = /style="color:(#[0-9a-fA-F]{6})"/.exec(svg)?.[1];
      expect(bg, c.id).toBeDefined();
      expect(ink, c.id).toBeDefined();
      const hell = (hex: string): number => {
        const v = (i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return 0.2126 * v(0) + 0.7152 * v(1) + 0.0722 * v(2);
      };
      // Der Abstand ist der Punkt: Tinte und Platte dürfen nie nah beieinander
      // liegen, egal in welche Richtung.
      expect(Math.abs(hell(bg!) - hell(ink!)), c.id).toBeGreaterThan(0.35);
    }
  });

  it('bleibt bei einem unbekannten Träger heil (nur die Grundform)', () => {
    const svg = abilityIcon('gibtsnicht', 'power');
    expect(svg).toContain('<svg');
    expect(svg).toMatch(/<path/);
  });

  it('deckt jede Sorte ab, die ein Mitglied überhaupt tragen kann', () => {
    // Die Zuordnung Sorte→Mitgliedstyp ist die Quelle; das Icon-Modul darf
    // dahinter keine Lücke haben, sonst zeigt eine gültige Fähigkeit nichts.
    for (const cfg of CREW) {
      for (const kind of allowedKinds(cfg)) {
        expect(abilityIcon(cfg.id, kind)).toMatch(/<(path|circle|rect|ellipse)/);
      }
    }
  });
});
