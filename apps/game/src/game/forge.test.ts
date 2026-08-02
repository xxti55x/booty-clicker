/**
 * Die Skin-Schmiede (3a): Slot-Freischaltung über den Skin-Level, die
 * Glut-Ökonomie, die Kostenleiter mit Affix-Lock — und vor allem die vier
 * Frust-Regeln (Angebot statt Überschreiben, Würfeln NACH der Bezahlung,
 * Qualitäts-Pity, Lock).
 */
import { describe, expect, it } from 'vitest';

import { FORGE_SLOTS, MAX_QUALITY, QUALITY_PITY_ROLLS, minQualityForDry } from './affixes';
import {
  DUP_EMBER,
  FORGE_BASE_COST,
  FORGE_BEST,
  FORGE_LOCK_FACTOR,
  FORGE_UNLOCK_LEVELS,
  SHARDS_PER_EMBER,
  type ForgeState,
  acceptForgeRoll,
  addEmber,
  createForge,
  emberForDuplicate,
  emberForShards,
  emberHeld,
  forgeAffixAt,
  forgeAffixes,
  forgeCost,
  forgeDryAt,
  forgeSlotsOf,
  forgeSlotsUnlocked,
  nextForgeUnlock,
  payForgeRoll,
  rollsToNextPity,
  shardsForEmber,
} from './forge';
import { Rng } from '../util/rng';

const rng = (seed = 1, cursor = 0): Rng => new Rng({ seed, cursor });

/** Eine Schmiede mit Glut und (optional) einem gesetzten Slot. */
function forgeWith(
  ember: number,
  skin = 'disco',
  slot0: ForgeState['slots'][string][0] | null = null,
) {
  const f = addEmber(createForge(), ember);
  if (!slot0) return f;
  const row = forgeSlotsOf(f, skin);
  row[0] = slot0;
  return { ...f, slots: { ...f.slots, [skin]: row } };
}

describe('forge — Freischaltung über den Skin-Level', () => {
  // V2-4: Slot 3 von Level 40 (Σ 301 060 🧩 ≈ 2 150 h — unerreichbar) auf 32
  // (Σ 50 580 🧩 ≈ 361 h) geeicht: die längste Jagd des Spiels, mit Ankunft.
  it('öffnet die drei Slots bei 10 / 25 / 32', () => {
    expect(FORGE_UNLOCK_LEVELS).toEqual([10, 25, 32]);
    expect(forgeSlotsUnlocked(0)).toBe(0);
    expect(forgeSlotsUnlocked(9)).toBe(0);
    expect(forgeSlotsUnlocked(10)).toBe(1);
    expect(forgeSlotsUnlocked(24)).toBe(1);
    expect(forgeSlotsUnlocked(25)).toBe(2);
    expect(forgeSlotsUnlocked(31)).toBe(2);
    expect(forgeSlotsUnlocked(32)).toBe(3);
    expect(forgeSlotsUnlocked(50)).toBe(FORGE_SLOTS); // nie mehr als drei
    expect(forgeSlotsUnlocked(Number.NaN)).toBe(0);
  });

  it('nennt das Level des nächsten Slots', () => {
    expect(nextForgeUnlock(0)).toBe(10);
    expect(nextForgeUnlock(10)).toBe(25);
    expect(nextForgeUnlock(30)).toBe(32);
    expect(nextForgeUnlock(32)).toBeNull();
  });

  it('nur die vom LEVEL freigeschalteten Slots wirken', () => {
    const f = {
      ember: 0,
      slots: {
        disco: [
          { affix: { id: 'click', q: 3 }, dry: 0 },
          { affix: { id: 'gold', q: 3 }, dry: 0 },
          { affix: { id: 'dps', q: 3 }, dry: 0 },
        ],
      },
    };
    expect(forgeAffixes(f, 'disco', 9)).toEqual([]); // noch kein Slot offen
    expect(forgeAffixes(f, 'disco', 10).length).toBe(1);
    expect(forgeAffixes(f, 'disco', 25).length).toBe(2);
    expect(forgeAffixes(f, 'disco', 40).length).toBe(3);
    // Ein ANDERER Skin sieht davon nichts — nur der getragene zählt.
    expect(forgeAffixes(f, 'classic', 50)).toEqual([]);
  });

  it('liest fehlende Skins/Slots als leer, statt zu werfen', () => {
    const f = createForge();
    expect(forgeSlotsOf(f, 'lava').length).toBe(FORGE_SLOTS);
    expect(forgeAffixAt(f, 'lava', 0)).toBeNull();
    expect(forgeDryAt(f, 'lava', 2)).toBe(0);
    expect(forgeAffixes(f, 'lava', 50)).toEqual([]);
  });
});

describe('forge — die Glut-Ökonomie', () => {
  it('Duplikate zahlen nach Truhen-Stufe', () => {
    expect(emberForDuplicate('wood')).toBe(DUP_EMBER.wood);
    expect(emberForDuplicate('mythic')).toBe(DUP_EMBER.mythic);
    // Streng steigend über die vier Stufen.
    expect(DUP_EMBER.wood).toBeLessThan(DUP_EMBER.gold);
    expect(DUP_EMBER.gold).toBeLessThan(DUP_EMBER.diamond);
    expect(DUP_EMBER.diamond).toBeLessThan(DUP_EMBER.mythic);
  });

  it('der Splitter-Kurs rundet ab und ist exakt umkehrbar', () => {
    expect(emberForShards(SHARDS_PER_EMBER * 3)).toBe(3);
    expect(emberForShards(SHARDS_PER_EMBER - 1)).toBe(0);
    expect(emberForShards(-5)).toBe(0);
    expect(shardsForEmber(3)).toBe(SHARDS_PER_EMBER * 3);
    expect(shardsForEmber(-1)).toBe(0);
  });

  it('der Kurs ist ein Überlauf-Ventil, kein Haupt-Faucet', () => {
    // Bei den in 3b gemessenen ~140 🧩/h ergibt ein VOLLSTÄNDIGER Umtausch
    // 7 🔥/h — nicht einmal ein Slot-2-Reforge je Stunde.
    expect(emberForShards(140)).toBe(7);
    expect(emberForShards(140)).toBeLessThan(forgeCost(1));
  });

  it('hält die gehaltene Glut sauber', () => {
    expect(emberHeld({ ember: -3, slots: {} })).toBe(0);
    expect(emberHeld({ ember: 4.9, slots: {} })).toBe(4);
    expect(emberHeld({ ember: Number.NaN, slots: {} })).toBe(0);
    expect(addEmber(createForge(), 0)).toEqual(createForge());
    expect(addEmber(createForge(), 12).ember).toBe(12);
  });
});

describe('forge — Kosten + Affix-Lock', () => {
  it('verdoppelt je Slot', () => {
    expect(forgeCost(0)).toBe(FORGE_BASE_COST);
    expect(forgeCost(1)).toBe(FORGE_BASE_COST * 2);
    expect(forgeCost(2)).toBe(FORGE_BASE_COST * 4);
    expect(forgeCost(3)).toBe(0); // gibt es nicht
    expect(forgeCost(-1)).toBe(0);
  });

  it('der Lock kostet exakt das Dreifache — die begründete Zahl', () => {
    expect(FORGE_LOCK_FACTOR).toBe(3);
    for (let s = 0; s < FORGE_SLOTS; s++) {
      expect(forgeCost(s, true)).toBe(forgeCost(s) * FORGE_LOCK_FACTOR);
    }
    // Der Lock ist billiger als die Verzehnfachung der Trefferquote, die er
    // liefert (10 Sorten im Schmiede-Pool) — sonst würde ihn niemand nehmen.
    expect(FORGE_LOCK_FACTOR).toBeLessThan(10);
  });
});

describe('forge — die vier Frust-Regeln', () => {
  it('ohne genug Glut passiert GAR NICHTS (kein Teil-Abzug)', () => {
    const f = forgeWith(forgeCost(0) - 1);
    expect(payForgeRoll(f, 'disco', 0, false, rng())).toBeNull();
    expect(f.ember).toBe(forgeCost(0) - 1);
  });

  it('bezahlt wird der ROLL — die Glut ist weg, bevor gewürfelt wird', () => {
    const f = forgeWith(100);
    const res = payForgeRoll(f, 'disco', 0, false, rng())!;
    expect(res.forge.ember).toBe(100 - forgeCost(0));
    // Der Slot trägt danach IMMER NOCH das Alte — das Angebot ist nur ein Angebot.
    expect(forgeAffixAt(res.forge, 'disco', 0)).toBeNull();
  });

  it('ein Angebot wird nie blind übernommen — erst „annehmen" schreibt es', () => {
    const f = forgeWith(100);
    const res = payForgeRoll(f, 'disco', 0, false, rng())!;
    // Verwerfen: der Slot bleibt, wie er war.
    expect(forgeAffixAt(res.forge, 'disco', 0)).toBeNull();
    // Annehmen: jetzt steht es drin.
    const after = acceptForgeRoll(res.forge, 'disco', 0, res.offer);
    expect(forgeAffixAt(after, 'disco', 0)).toEqual(res.offer);
  });

  it('der Lock hält die Sorte und würfelt nur die Qualität', () => {
    const cur = { affix: { id: 'gold', q: 0 }, dry: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const f = forgeWith(1000, 'disco', cur);
      const res = payForgeRoll(f, 'disco', 0, true, rng(seed))!;
      expect(res.offer.id).toBe('gold');
    }
    // Ohne Lock rollt auch die Sorte (über viele Seeds kommt Abwechslung).
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const f = forgeWith(1000, 'disco', cur);
      kinds.add(payForgeRoll(f, 'disco', 0, false, rng(seed))!.offer.id);
    }
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('ein Lock auf einem LEEREN Slot rollt wie ein freier Roll (nichts zu halten)', () => {
    const f = forgeWith(1000);
    const res = payForgeRoll(f, 'disco', 0, true, rng(3))!;
    expect(res.offer.id).toBeTruthy();
  });

  it('nur der Pool des eigenen Skins — „Glut-DoT" gibt es nur bei Lava', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const f = forgeWith(1000);
      seen.add(payForgeRoll(f, 'disco', 0, false, rng(seed))!.offer.id);
    }
    expect(seen.has('glut')).toBe(false);
    expect(seen.has('servo')).toBe(false);
    const lava = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const f = forgeWith(1000);
      lava.add(payForgeRoll(f, 'lava', 0, false, rng(seed))!.offer.id);
    }
    expect(lava.has('glut')).toBe(true);
    expect(lava.has('sequin')).toBe(false);
  });

  it('das Qualitäts-Pity zählt trockene Rolls und hebt die Mindest-Qualität', () => {
    // Ein Slot, der schon „Makellos" trägt: JEDER Roll ist trocken.
    let f = forgeWith(100_000, 'disco', { affix: { id: 'gold', q: MAX_QUALITY }, dry: 0 });
    const stream = rng(99);
    for (let i = 1; i <= QUALITY_PITY_ROLLS; i++) {
      const res = payForgeRoll(f, 'disco', 0, false, stream)!;
      f = res.forge;
      expect(forgeDryAt(f, 'disco', 0)).toBe(i);
    }
    // Nach fünf trockenen Rolls kann nichts mehr unter „Solide" fallen.
    expect(minQualityForDry(forgeDryAt(f, 'disco', 0))).toBe(1);
    const next = payForgeRoll(f, 'disco', 0, false, stream)!;
    expect(next.minQuality).toBe(1);
    expect(next.offer.q).toBeGreaterThanOrEqual(1);
  });

  it('ein besserer Wurf setzt das Pity zurück, auch wenn man ihn ablehnt', () => {
    const f = forgeWith(1000, 'disco', { affix: { id: 'gold', q: 0 }, dry: 4 });
    // Wir suchen einen Seed, der etwas Besseres als „Grob" anbietet.
    let seen = false;
    for (let seed = 1; seed <= 50 && !seen; seed++) {
      const res = payForgeRoll(f, 'disco', 0, false, rng(seed))!;
      if (res.offer.q > 0) {
        expect(forgeDryAt(res.forge, 'disco', 0)).toBe(0);
        seen = true;
      }
    }
    expect(seen).toBe(true);
  });

  it('zeigt an, wie weit die nächste Pity-Stufe weg ist', () => {
    expect(rollsToNextPity(0)).toBe(QUALITY_PITY_ROLLS);
    expect(rollsToNextPity(4)).toBe(1);
    expect(rollsToNextPity(5)).toBe(QUALITY_PITY_ROLLS);
    expect(rollsToNextPity(15)).toBeNull(); // „Makellos" ist garantiert
  });

  it('weist unmögliche Slots ab, statt still zu schreiben', () => {
    const f = forgeWith(1000);
    expect(payForgeRoll(f, 'disco', FORGE_SLOTS, false, rng())).toBeNull();
    expect(payForgeRoll(f, 'disco', -1, false, rng())).toBeNull();
    expect(acceptForgeRoll(f, 'disco', 9, { id: 'click', q: 1 })).toBe(f);
    expect(acceptForgeRoll(f, 'disco', 0, { id: 'vegas', q: 1 })).toBe(f);
  });
});

describe('forge — das Best-Case-Profil', () => {
  it('FORGE_BEST sind drei makellose, GETEILTE Sorten', () => {
    expect(FORGE_BEST.length).toBe(FORGE_SLOTS);
    for (const a of FORGE_BEST) expect(a.q).toBe(MAX_QUALITY);
    expect(new Set(FORGE_BEST.map((a) => a.id)).size).toBe(FORGE_SLOTS);
    for (const a of FORGE_BEST) expect(['sequin', 'glut', 'servo']).not.toContain(a.id);
  });
});
