/**
 * Relikte (1c): die Drop-Regel samt Pity, der Gate-Highwater (die eine Zahl
 * gegen Farm-Wiederholung und Prestige-Wäsche), Tragen/Tauschen und das
 * Einschmelzen.
 */
import { describe, expect, it } from 'vitest';

import { MAX_QUALITY, RELIC_SLOTS } from './affixes';
import {
  EMBER_PER_AFFIX,
  EMBER_PER_QUALITY,
  RELIC_DROP_CHANCE,
  RELIC_MIN_ZONE,
  RELIC_PITY,
  type RelicsState,
  createRelics,
  equipBestRelics,
  equipRelic,
  equippedRelicAffixes,
  gateRelicRoll,
  isRelicEquipped,
  isRolledAffix,
  meltRelic,
  meltRelicEmber,
  relicById,
  relicDropHits,
  relicGateEligible,
  relicInSlot,
  relicNextId,
  relicScore,
  rollRelic,
  twoAffixChance,
} from './relics';
import { Rng } from '../util/rng';

const rng = (seed = 1, cursor = 0): Rng => new Rng({ seed, cursor });

/** Eine Sammlung von Hand — kein Würfeln, damit die Erwartung exakt ist. */
function withOwned(...affixSets: { id: string; q: number }[][]): RelicsState {
  const owned = affixSets.map((affixes, i) => ({ id: i + 1, zone: 50 + i * 5, affixes }));
  return { ...createRelics(), owned, nextId: owned.length + 1 };
}

describe('relics — die Drop-Regel', () => {
  it('ein frischer Zustand ist leer und trägt drei leere Slots', () => {
    const r = createRelics();
    expect(r.owned).toEqual([]);
    expect(r.slots).toEqual([0, 0, 0]);
    expect(r.slots.length).toBe(RELIC_SLOTS);
    expect(r.deepestGate).toBe(0);
  });

  it('würfelt nur an Boss-Bühnen ab Bühne 50', () => {
    const r = createRelics();
    expect(relicGateEligible(r, 45)).toBe(false); // zu flach
    expect(relicGateEligible(r, 49)).toBe(false);
    expect(relicGateEligible(r, 50)).toBe(true);
    expect(relicGateEligible(r, 52)).toBe(false); // keine Boss-Bühne
    expect(relicGateEligible(r, 55)).toBe(true);
    expect(relicGateEligible(r, Number.NaN)).toBe(false);
  });

  it('jedes Gate würfelt genau EINMAL — der Highwater sperrt jede Wiederholung', () => {
    let r = createRelics();
    r = gateRelicRoll(r, 60, rng()).relics;
    expect(r.deepestGate).toBe(60);
    // Dasselbe Gate noch einmal: nichts passiert, dieselbe Referenz zurück.
    const again = gateRelicRoll(r, 60, rng());
    expect(again.relics).toBe(r);
    expect(again.relic).toBeNull();
    // Und auch jedes FLACHERE Gate ist damit erledigt (Rückweg nach Reset).
    expect(gateRelicRoll(r, 55, rng()).relics).toBe(r);
    expect(gateRelicRoll(r, 50, rng()).relics).toBe(r);
    // Erst tiefer geht es weiter.
    expect(relicGateEligible(r, 65)).toBe(true);
  });

  it('das Pity garantiert spätestens am RELIC_PITY-ten Gate', () => {
    expect(relicDropHits(RELIC_PITY - 1, 0.999)).toBe(true); // erzwungen
    expect(relicDropHits(0, 0.999)).toBe(false); // weit über der Chance
    expect(relicDropHits(0, RELIC_DROP_CHANCE - 0.001)).toBe(true); // regulärer Treffer
    expect(relicDropHits(0, RELIC_DROP_CHANCE + 0.001)).toBe(false);
  });

  it('über eine lange Kette von Gates gibt es nie eine Durststrecke > RELIC_PITY', () => {
    let r = createRelics();
    const stream = rng(12345);
    let sinceDrop = 0;
    let drops = 0;
    for (let zone = RELIC_MIN_ZONE; zone <= 400; zone += 5) {
      const res = gateRelicRoll(r, zone, stream);
      r = res.relics;
      if (res.relic) {
        drops++;
        sinceDrop = 0;
      } else {
        sinceDrop++;
        expect(sinceDrop).toBeLessThan(RELIC_PITY);
      }
    }
    // 71 Gates ⇒ die Erwartung liegt bei ~26 Relikten (ein Relikt je ~2,7 Gates).
    expect(drops).toBeGreaterThan(20);
    expect(drops).toBeLessThan(45);
    expect(r.deepestGate).toBe(400);
  });

  it('ein Treffer setzt den Pity zurück, ein Fehlschlag zählt hoch', () => {
    let r = createRelics();
    const stream = rng(7);
    let lastDrop = false;
    for (let zone = RELIC_MIN_ZONE; zone <= 200; zone += 5) {
      const res = gateRelicRoll(r, zone, stream);
      if (lastDrop) expect(r.pity).toBe(0);
      r = res.relics;
      lastDrop = res.relic !== null;
    }
  });
});

describe('relics — der Wurf', () => {
  it('rollt ein oder zwei Affixe, nie zwei derselben Sorte', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rel = rollRelic(1, 120, rng(seed));
      expect(rel.affixes.length).toBeGreaterThanOrEqual(1);
      expect(rel.affixes.length).toBeLessThanOrEqual(2);
      expect(new Set(rel.affixes.map((a) => a.id)).size).toBe(rel.affixes.length);
      for (const a of rel.affixes) expect(isRolledAffix(a)).toBe(true);
    }
  });

  it('zieht NIE eine skin-exklusive Sorte (die gehören der Schmiede)', () => {
    const exclusive = new Set(['sequin', 'glut', 'servo']);
    for (let seed = 1; seed <= 120; seed++) {
      for (const a of rollRelic(1, 90, rng(seed)).affixes) {
        expect(exclusive.has(a.id)).toBe(false);
      }
    }
  });

  it('die Zwei-Affix-Chance wächst mit der Tiefe und ist gedeckelt', () => {
    expect(twoAffixChance(50)).toBeCloseTo(0.3, 10);
    expect(twoAffixChance(100)).toBeCloseTo(0.4, 10);
    expect(twoAffixChance(200)).toBeCloseTo(0.6, 10);
    expect(twoAffixChance(9999)).toBeCloseTo(0.6, 10); // Deckel
    expect(twoAffixChance(10)).toBeCloseTo(0.3, 10); // nie unter die Basis
  });

  it('ist deterministisch über den Strom (save-scum-fest)', () => {
    expect(rollRelic(3, 75, rng(42, 9))).toEqual(rollRelic(3, 75, rng(42, 9)));
  });

  it('vergibt Ids monoton — auch wenn der Save eine zu kleine nextId behauptet', () => {
    const r = { ...withOwned([{ id: 'click', q: 1 }], [{ id: 'gold', q: 2 }]), nextId: 1 };
    expect(relicNextId(r)).toBe(3);
  });
});

describe('relics — tragen', () => {
  const base = withOwned(
    [{ id: 'click', q: 3 }],
    [
      { id: 'gold', q: 1 },
      { id: 'dps', q: 2 },
    ],
    [{ id: 'luck', q: 0 }],
  );

  it('legt ein Relikt in einen Slot und liest es zurück', () => {
    const r = equipRelic(base, 0, 2);
    expect(relicInSlot(r, 0)?.id).toBe(2);
    expect(isRelicEquipped(r, 2)).toBe(true);
    expect(relicInSlot(r, 1)).toBeNull();
  });

  it('ein Relikt kann NIE zweimal wirken — die Slots tauschen stattdessen', () => {
    let r = equipRelic(base, 0, 1);
    r = equipRelic(r, 1, 2);
    // Nummer 1 in den zweiten Slot: die beiden tauschen, statt sich zu doppeln.
    r = equipRelic(r, 1, 1);
    expect(r.slots).toEqual([2, 1, 0]);
    expect(r.slots.filter((s) => s === 1).length).toBe(1);
  });

  it('weist unbekannte Relikte und unmögliche Slots ab', () => {
    expect(equipRelic(base, 0, 404)).toBe(base);
    expect(equipRelic(base, 9, 1)).toBe(base);
    expect(equipRelic(base, -1, 1)).toBe(base);
    // 0 leert dagegen bewusst.
    expect(equipRelic(equipRelic(base, 0, 1), 0, 0).slots).toEqual([0, 0, 0]);
  });

  it('liefert die Affixe ALLER getragenen Relikte, in Slot-Reihenfolge', () => {
    let r = equipRelic(base, 0, 2); // zwei Affixe
    r = equipRelic(r, 2, 1); // eines
    expect(equippedRelicAffixes(r)).toEqual([
      { id: 'gold', q: 1 },
      { id: 'dps', q: 2 },
      { id: 'click', q: 3 },
    ]);
    // Höchstens 6 Affixe — die Grundlage der Budget-Rechnung.
    expect(equippedRelicAffixes(equipBestRelics(base)).length).toBeLessThanOrEqual(6);
  });

  it('„Beste tragen" nimmt die drei bestgerollten, deterministisch', () => {
    const r = equipBestRelics(base);
    expect(relicScore(relicById(r, 2)!)).toBeGreaterThan(relicScore(relicById(r, 3)!));
    expect(r.slots[0]).toBe(2); // zwei Affixe schlagen eines
    expect(new Set(r.slots).size).toBe(3); // nie dasselbe zweimal
    expect(equipBestRelics(base)).toEqual(r); // reproduzierbar
  });

  it('„Beste tragen" füllt bei weniger als drei Relikten mit leeren Slots auf', () => {
    const r = equipBestRelics(withOwned([{ id: 'click', q: 0 }]));
    expect(r.slots).toEqual([1, 0, 0]);
  });
});

describe('relics — einschmelzen (die Brücke zu 3a)', () => {
  it('zahlt je Affix Grundwert + Qualitäts-Aufschlag', () => {
    expect(meltRelicEmber({ id: 1, zone: 50, affixes: [{ id: 'click', q: 0 }] })).toBe(
      EMBER_PER_AFFIX,
    );
    expect(
      meltRelicEmber({
        id: 1,
        zone: 50,
        affixes: [
          { id: 'click', q: MAX_QUALITY },
          { id: 'gold', q: MAX_QUALITY },
        ],
      }),
    ).toBe(2 * (EMBER_PER_AFFIX + EMBER_PER_QUALITY * MAX_QUALITY));
  });

  it('nimmt das Relikt aus der Sammlung UND aus jedem Trage-Slot', () => {
    const worn = equipRelic(withOwned([{ id: 'click', q: 2 }], [{ id: 'gold', q: 1 }]), 1, 1);
    const res = meltRelic(worn, 1);
    expect(res.ember).toBeGreaterThan(0);
    expect(res.relics.owned.map((r) => r.id)).toEqual([2]);
    expect(res.relics.slots).toEqual([0, 0, 0]);
  });

  it('ein unbekanntes Relikt lässt alles unverändert', () => {
    const r = withOwned([{ id: 'click', q: 2 }]);
    const res = meltRelic(r, 404);
    expect(res.relics).toBe(r);
    expect(res.ember).toBe(0);
  });
});
