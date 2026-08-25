import { describe, expect, it } from 'vitest';

import { ascendState, createChState, himmelfahrtState } from './ch-state';
import { MONSTERS_PER_ZONE } from './combat';
import {
  NO_SETLIST,
  SETLIST_BASE_KILLS,
  SETLIST_CARDS,
  SETLIST_CHOICES,
  setlistCard,
  setlistEffect,
  setlistOffer,
  setlistOfferHas,
  setlistZoneKills,
} from './setlist';

/**
 * Goal: „Progression mit ruhm -> himmel -> transendenz zu eintönig. quazi 0
 * neues nur neue währungen."
 *
 * Die Setlist ist die Antwort für die zweite Stufe: Ab der ersten Himmelfahrt
 * ändert eine gewählte Karte die REGELN des Laufs, nicht nur eine Zahl.
 */
describe('Setlist — der Katalog', () => {
  it('spiegelt die Bühnen-Länge des Kampfes (keine zweite Wahrheit)', () => {
    expect(SETLIST_BASE_KILLS).toBe(MONSTERS_PER_ZONE);
    expect(NO_SETLIST.zoneKills).toBe(MONSTERS_PER_ZONE);
  });

  it('lässt den neutralen Effekt WIRKLICH neutral (jeder Lauf ohne Karte rechnet wie vorher)', () => {
    for (const v of [NO_SETLIST.dps, NO_SETLIST.click, NO_SETLIST.gold, NO_SETLIST.boss]) {
      expect(v).toBe(1);
    }
    expect(NO_SETLIST.bossLoot).toBe(1);
  });

  it('hat eindeutige Ids, Namen und Texte', () => {
    const ids = SETLIST_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of SETLIST_CARDS) {
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.text.length).toBeGreaterThan(20); // ein Satz, nicht ein Wort
      expect(setlistCard(c.id)).toBe(c);
    }
  });

  // Der Kern des Designs: Eine Karte, die nur gibt, ist keine Entscheidung —
  // sie verzögert nur den Klick auf „weiter".
  it('lässt JEDE Karte etwas geben UND etwas nehmen', () => {
    for (const c of SETLIST_CARDS) {
      const e = c.effect;
      const faktoren = [e.dps, e.click, e.gold, e.boss, e.bossLoot];
      const besser = faktoren.some((f) => f > 1) || e.zoneKills < NO_SETLIST.zoneKills;
      const schlechter = faktoren.some((f) => f < 1) || e.zoneKills > NO_SETLIST.zoneKills;
      expect(besser, `${c.id} gibt nichts`).toBe(true);
      expect(schlechter, `${c.id} nimmt nichts`).toBe(true);
    }
  });

  // Eine Karte, die man nicht spürt, ändert das Spiel nicht.
  it('macht jede Karte SPÜRBAR (kein 10-%-Geplänkel)', () => {
    for (const c of SETLIST_CARDS) {
      const e = c.effect;
      const groessteAenderung = Math.max(
        ...[e.dps, e.click, e.gold, e.boss, e.bossLoot].map((f) => Math.max(f, 1 / f)),
        Math.max(e.zoneKills / NO_SETLIST.zoneKills, NO_SETLIST.zoneKills / e.zoneKills),
      );
      expect(groessteAenderung, `${c.id} ist zu zahm`).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('hält die Bühnen-Länge in einem spielbaren Bereich', () => {
    for (const c of SETLIST_CARDS) {
      expect(c.effect.zoneKills).toBeGreaterThanOrEqual(1);
      expect(c.effect.zoneKills).toBeLessThanOrEqual(20);
    }
  });
});

describe('Setlist — Wirkung und Auswahl', () => {
  it('faltet ohne Karte und bei Müll exakt neutral', () => {
    for (const junk of [null, undefined, '', 'gibtsnicht', 'toString']) {
      expect(setlistEffect(junk)).toEqual(NO_SETLIST);
      expect(setlistZoneKills(junk)).toBe(SETLIST_BASE_KILLS);
    }
    expect(setlistCard('gibtsnicht')).toBeUndefined();
  });

  it('säubert die Rivalen-Zahl in jeden Fall auf einen spielbaren Wert', () => {
    for (const c of SETLIST_CARDS) {
      const n = setlistZoneKills(c.id);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(50);
    }
  });

  it('bietet genau drei verschiedene Karten an', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const offer = setlistOffer(seed);
      expect(offer).toHaveLength(SETLIST_CHOICES);
      expect(new Set(offer.map((c) => c.id)).size).toBe(SETLIST_CHOICES);
    }
  });

  // Das Angebot muss einen Reload überleben: Sonst wäre Wegklicken ein Reroll,
  // und die Wahl verlöre ihr Gewicht.
  it('ist rein über den Seed — derselbe Seed, dasselbe Angebot', () => {
    for (const seed of [1, 42, 4711, 999999]) {
      expect(setlistOffer(seed).map((c) => c.id)).toEqual(setlistOffer(seed).map((c) => c.id));
    }
  });

  it('bleibt bei kaputten Seeds ein gültiges Angebot', () => {
    for (const seed of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 1.7]) {
      const offer = setlistOffer(seed);
      expect(offer).toHaveLength(SETLIST_CHOICES);
      expect(new Set(offer.map((c) => c.id)).size).toBe(SETLIST_CHOICES);
    }
  });

  it('erreicht über die Seeds JEDE Karte des Katalogs', () => {
    const gesehen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      for (const c of setlistOffer(seed)) gesehen.add(c.id);
    }
    expect(gesehen.size).toBe(SETLIST_CARDS.length);
  });

  it('erkennt, ob eine Karte im Angebot steht (der Guard gegen gecraftete Saves)', () => {
    const offer = setlistOffer(7);
    for (const c of offer) expect(setlistOfferHas(7, c.id)).toBe(true);
    const draussen = SETLIST_CARDS.filter((c) => !offer.some((o) => o.id === c.id));
    for (const c of draussen) expect(setlistOfferHas(7, c.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Die Setlist im Spielstand
// ---------------------------------------------------------------------------
describe('Setlist — im Lauf', () => {
  it('startet ein frisches Profil ohne Karte und ohne Angebot', () => {
    const s = createChState();
    expect(s.setlist.card).toBe('');
    expect(s.setlist.seed).toBe(0);
    // Ohne Karte rechnet alles wie vor dem System.
    expect(setlistEffect(s.setlist.card)).toEqual(NO_SETLIST);
  });

  it('zieht bei jeder Aszension ein NEUES Angebot und wirft die alte Karte weg', () => {
    const s = { ...createChState(), runMaxZone: 40, setlist: { card: 'zugabe', seed: 5 } };
    const nach = ascendState(s);
    // Die Karte gehört zum Lauf und fällt mit ihm.
    expect(nach.setlist.card).toBe('');
    // Und der Seed ist ein anderer — sonst stünden immer dieselben drei Karten.
    expect(nach.setlist.seed).toBeGreaterThan(0);
    expect(nach.setlist.seed).not.toBe(5);
  });

  it('zieht nach unterschiedlich tiefen Läufen unterschiedliche Angebote', () => {
    const seeds = new Set<number>();
    for (const zone of [10, 25, 40, 80, 150]) {
      seeds.add(ascendState({ ...createChState(), runMaxZone: zone }).setlist.seed);
    }
    // Nicht jede Tiefe MUSS ein eigenes Angebot geben, aber ein einziger Seed
    // für alle wäre ein toter Zufall.
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('wirft die Karte auch bei der Himmelfahrt weg (die Ära beginnt neu)', () => {
    const s = {
      ...createChState(),
      rsLifetime: 1_000_000,
      setlist: { card: 'kollekte', seed: 9 },
    };
    expect(himmelfahrtState(s).setlist.card).toBe('');
  });
});
