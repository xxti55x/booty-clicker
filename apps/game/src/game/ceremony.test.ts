import { describe, expect, it } from 'vitest';

import {
  CEREMONIES,
  type CeremonyKind,
  ceremonyCountAt,
  ceremonyFor,
  ceremonySpriteCount,
} from './ceremony';

const KINDS: CeremonyKind[] = ['ascend', 'himmelfahrt', 'transcend'];

describe('ROADMAP-V2 G4 — Zeremonie-Katalog', () => {
  it('kennt genau die drei Prestige-Schichten', () => {
    expect(Object.keys(CEREMONIES).sort()).toEqual([...KINDS].sort());
    for (const k of KINDS) expect(ceremonyFor(k).kind).toBe(k);
  });

  it('macht die drei auf einen Blick unterscheidbar (Glyph, Bewegung/Dauer, Text)', () => {
    const glyphs = KINDS.map((k) => ceremonyFor(k).glyph);
    expect(new Set(glyphs).size).toBe(3);
    const titles = KINDS.map((k) => ceremonyFor(k).title);
    expect(new Set(titles).size).toBe(3);
    // Aszension ist die kürzeste (sie passiert am häufigsten), die beiden tiefen
    // Resets bekommen die längere Blende.
    expect(ceremonyFor('ascend').durationMs).toBeLessThan(ceremonyFor('himmelfahrt').durationMs);
    expect(ceremonyFor('transcend').motion).toBe('implode');
    expect(ceremonyFor('ascend').motion).toBe('rain');
  });

  it('bleibt im Roadmap-Fenster von 1.5–2 s und trägt je einen Satz', () => {
    for (const k of KINDS) {
      const c = ceremonyFor(k);
      expect(c.durationMs).toBeGreaterThanOrEqual(1500);
      expect(c.durationMs).toBeLessThanOrEqual(2000);
      expect(c.sub.length).toBeGreaterThan(10);
      expect(c.sprites).toBeGreaterThan(0);
    }
  });
});

describe('ceremonySpriteCount — Preset-Pflicht', () => {
  it('skaliert die Dichte am selben confetti-Wert wie der G2-Sieg-Wurf', () => {
    const c = ceremonyFor('ascend');
    expect(ceremonySpriteCount(c, 130)).toBe(c.sprites); // high
    expect(ceremonySpriteCount(c, 70)).toBeLessThan(c.sprites); // medium
    expect(ceremonySpriteCount(c, 70)).toBeGreaterThan(0);
  });

  it('gibt bei low (confetti 0) sauber 0 zurück und deckelt nach oben nie über die Basis', () => {
    for (const k of KINDS) {
      expect(ceremonySpriteCount(ceremonyFor(k), 0)).toBe(0);
      expect(ceremonySpriteCount(ceremonyFor(k), 999)).toBe(ceremonyFor(k).sprites);
    }
  });

  it('bleibt auch bei winziger Dichte über einer sichtbaren Untergrenze', () => {
    expect(ceremonySpriteCount(ceremonyFor('ascend'), 1)).toBeGreaterThanOrEqual(6);
  });
});

describe('ceremonyCountAt — Zahlen-Aufzähler', () => {
  it('startet bei 0, endet exakt auf dem Betrag und übersteigt ihn nie', () => {
    const total = 1234;
    expect(ceremonyCountAt(total, 0, 1500)).toBe(0);
    expect(ceremonyCountAt(total, 1500, 1500)).toBe(total);
    for (let t = 0; t <= 1600; t += 50) {
      const v = ceremonyCountAt(total, t, 1500);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(total);
    }
  });

  it('steht nach der Rampe still (die Zahl bleibt lesbar stehen)', () => {
    const total = 500;
    const rampEnd = 1500 * 0.62;
    expect(ceremonyCountAt(total, rampEnd, 1500)).toBe(total);
    expect(ceremonyCountAt(total, rampEnd + 300, 1500)).toBe(total);
  });

  it('läuft monoton', () => {
    let prev = -1;
    for (let t = 0; t <= 2000; t += 25) {
      const v = ceremonyCountAt(9999, t, 2000);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('ist gegen 0-Beträge und 0-Dauer robust', () => {
    expect(ceremonyCountAt(0, 400, 1500)).toBe(0);
    expect(ceremonyCountAt(42, 400, 0)).toBe(42);
  });
});
