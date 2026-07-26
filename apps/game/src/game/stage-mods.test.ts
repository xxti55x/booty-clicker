/**
 * Bühnen-Modifikatoren (ROADMAP-V2 A1) — Determinismus, Faktoren, Bühnen-Regeln.
 *
 * Der Katalog ist Daten, die Zuordnung ist eine reine Funktion, und BEIDES muss
 * hart festgenagelt sein: die Zuordnung, weil ein Spieler seine Farm-Route darauf
 * baut (und ein Reload sie nicht neu würfeln darf), die Faktoren, weil Spiel und
 * Balance-Bot dieselbe Zahl lesen müssen.
 */
import { describe, expect, it } from 'vitest';

import { ZONES_PER_THEME } from './boss-gimmicks';
import { BOSS_EVERY, monsterHp, spawnFor } from './combat';
import { createCombo } from './combo';
import {
  MOD_MIN_ZONE,
  NEUTRAL_FACTORS,
  REMIX_OFF,
  STAGE_MODS,
  factorsForZone,
  modForZone,
  modZone,
  remixSeedFor,
  stageComboStep,
  stageDamageFactor,
  stageEkstaseChargeRed,
  stageHpScale,
  stageModById,
} from './stage-mods';

const SEED = remixSeedFor(4711, 0);

describe('stage-mods — Katalog', () => {
  it('trägt acht Modifikatoren mit eindeutiger Id, Icon, Name und einem Satz', () => {
    expect(STAGE_MODS).toHaveLength(8);
    expect(new Set(STAGE_MODS.map((m) => m.id)).size).toBe(8);
    for (const m of STAGE_MODS) {
      expect(m.icon.length).toBeGreaterThan(0);
      expect(m.name.length).toBeGreaterThan(0);
      // Ein Satz — kurz genug für die Bühnen-Card, lang genug zum Verstehen.
      expect(m.description.length).toBeGreaterThan(20);
      expect(m.description.length).toBeLessThan(120);
      expect(stageModById(m.id)).toBe(m);
    }
    expect(stageModById('gibtsnicht')).toBeNull();
  });

  it('jeder Modifikator weicht in mindestens einem Faktor vom neutralen Satz ab', () => {
    for (const m of STAGE_MODS) {
      const keys = Object.keys(NEUTRAL_FACTORS) as (keyof typeof NEUTRAL_FACTORS)[];
      expect(keys.some((k) => m.f[k] !== NEUTRAL_FACTORS[k])).toBe(true);
    }
  });

  it('die konkreten Faktoren stehen fest (Spiel und Bot lesen dieselbe Zahl)', () => {
    expect(stageModById('goldrausch')!.f.gold).toBe(1.5);
    expect(stageModById('goldrausch')!.f.comboDecay).toBe(1.25);
    expect(stageModById('zaehe-menge')!.f.hp).toBe(1.2);
    expect(stageModById('zaehe-menge')!.f.chest).toBe(2);
    expect(stageModById('beat-nacht')!.f.beat).toBe(0.5); // ON_BEAT_MULT 1.5 ⇒ ×2
    expect(stageModById('nebel')!.f.dps).toBe(0.85);
    expect(stageModById('nebel')!.f.click).toBe(1.3);
    expect(stageModById('konfetti')!.f.ekstase).toBe(1.5);
    expect(stageModById('peach-party')!.f.peachGap).toBeCloseTo(1 / 1.5, 12);
    expect(stageModById('krit-funken')!.f.crit).toBe(0.05);
    expect(stageModById('marathon')!.f.hp).toBe(0.8);
    expect(stageModById('marathon')!.f.gold).toBe(0.8);
  });
});

describe('stage-mods — Bühnen-Regeln', () => {
  it('greift erst ab Bühne 11 und nie auf einer Boss-Bühne', () => {
    // Der lokale `ZONES_PER_THEME` muss mit `combat.BOSS_EVERY` deckungsgleich
    // bleiben (Import-Zyklus vermieden, Gleichheit hier festgenagelt).
    expect(ZONES_PER_THEME).toBe(BOSS_EVERY);
    for (let z = 1; z < MOD_MIN_ZONE; z++) {
      expect(modForZone(z, SEED)).toBeNull();
      expect(modZone(z)).toBe(false);
    }
    for (let z = MOD_MIN_ZONE; z < 200; z++) {
      const boss = z % BOSS_EVERY === 0;
      expect(modZone(z)).toBe(!boss);
      expect(modForZone(z, SEED) === null).toBe(boss);
    }
  });

  it('ungültige Bühnen und REMIX_OFF liefern keinen Modifikator', () => {
    for (const z of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(modForZone(z, SEED)).toBeNull();
    }
    expect(modForZone(11, REMIX_OFF)).toBeNull();
    expect(modForZone(11, Number.NaN)).toBeNull();
    expect(factorsForZone(11, REMIX_OFF)).toBe(NEUTRAL_FACTORS);
  });
});

describe('stage-mods — Determinismus', () => {
  it('gleiche (Bühne, Remix) ⇒ immer derselbe Modifikator', () => {
    for (let z = 11; z < 90; z++) {
      expect(modForZone(z, SEED)).toBe(modForZone(z, SEED));
    }
  });

  it('der Remix-Seed hängt an (rng.seed, Aszensionen) und ist nie REMIX_OFF', () => {
    expect(remixSeedFor(1234, 0)).toBe(remixSeedFor(1234, 0));
    expect(remixSeedFor(1234, 0)).not.toBe(remixSeedFor(1234, 1));
    expect(remixSeedFor(1234, 0)).not.toBe(remixSeedFor(5678, 0));
    for (let a = 0; a < 64; a++) expect(remixSeedFor(0, a)).not.toBe(REMIX_OFF);
    // Kaputte Eingaben fallen sauber zurück, statt NaN in die Karte zu tragen.
    expect(Number.isInteger(remixSeedFor(Number.NaN, Number.NaN))).toBe(true);
  });

  it('eine Aszension VERWÜRFELT die Karte, sie verschiebt sie nicht nur', () => {
    const a = remixSeedFor(99, 0);
    const b = remixSeedFor(99, 1);
    const mapA: string[] = [];
    const mapB: string[] = [];
    for (let z = 11; z < 60; z++) {
      if (!modZone(z)) continue;
      mapA.push(modForZone(z, a)!.id);
      mapB.push(modForZone(z, b)!.id);
    }
    expect(mapA).not.toEqual(mapB);
    // Kein reiner Versatz um eine Bühne (das wäre eine Addition statt eines Mixes).
    expect(mapA.slice(1)).not.toEqual(mapB.slice(0, mapA.length - 1));
  });

  it('der Katalog wird über viele Bühnen breit gestreut (kein toter Eintrag)', () => {
    const seen = new Set<string>();
    for (let z = 11; z < 500; z++) {
      const m = modForZone(z, SEED);
      if (m) seen.add(m.id);
    }
    expect(seen.size).toBe(STAGE_MODS.length);
  });
});

describe('stage-mods — Verdrahtung in die echten Terme', () => {
  it('die Ausdauer der Rivalen folgt dem hp-Faktor, Bosse bleiben unberührt', () => {
    for (let z = 11; z < 60; z++) {
      const c = spawnFor(z, 0, z, SEED);
      expect(c.hpMax).toBeCloseTo(monsterHp(z) * stageHpScale(z, SEED), 6);
      expect(c.remix).toBe(SEED);
    }
    // Boss-Bühne: `spawnFor` mit vollem Kill-Zähler ⇒ Boss, HP exakt wie ohne Remix.
    const bossWith = spawnFor(15, 10, 15, SEED);
    const bossWithout = spawnFor(15, 10, 15);
    expect(bossWith.boss).toBe(true);
    expect(bossWith.hpMax).toBe(bossWithout.hpMax);
  });

  it('ohne Remix ist die Ausdauer byte-gleich zur Kurve von vorher', () => {
    for (let z = 1; z < 60; z++) {
      expect(spawnFor(z, 0, z).hpMax).toBe(monsterHp(z));
      expect(stageHpScale(z, REMIX_OFF)).toBe(1);
    }
  });

  it('der Remix wandert durch jeden internen Re-Spawn (hit/travel/tickBoss)', () => {
    // Ein Kill spawnt das nächste Ziel selbst — der Seed darf dabei nie verloren gehen.
    let c = spawnFor(12, 0, 40, SEED);
    for (let i = 0; i < 24; i++) {
      c = spawnFor(c.zone, c.killsThisZone, c.maxZone, c.remix);
      expect(c.remix).toBe(SEED);
      expect(c.hpMax).toBeCloseTo(
        c.boss ? c.hpMax : monsterHp(c.zone) * stageHpScale(c.zone, SEED),
        6,
      );
    }
  });

  it('stageDamageFactor mischt Klick- und Crew-Anteil getrennt', () => {
    const nebel = stageModById('nebel')!.f;
    // Reiner Klick-Build sieht +30 %, reiner Idle-Build −15 %, gemischt dazwischen.
    expect(stageDamageFactor(nebel, 10, 0)).toBeCloseTo(1.3, 12);
    expect(stageDamageFactor(nebel, 0, 10)).toBeCloseTo(0.85, 12);
    expect(stageDamageFactor(nebel, 5, 5)).toBeCloseTo((1.3 + 0.85) / 2, 12);
    // Ohne Schaden (und ohne Modifikator) bleibt der Faktor neutral.
    expect(stageDamageFactor(nebel, 0, 0)).toBe(1);
    expect(stageDamageFactor(NEUTRAL_FACTORS, 3, 7)).toBe(1);
  });

  it('stageEkstaseChargeRed übersetzt „lädt ×1.5 schneller" in eine Reduktion', () => {
    expect(stageEkstaseChargeRed(NEUTRAL_FACTORS)).toBe(0);
    expect(stageEkstaseChargeRed(stageModById('konfetti')!.f)).toBeCloseTo(1 - 1 / 1.5, 12);
    // Reduktion × Schwelle = die neue Schwelle ⇒ 100 Ladung werden zu ~66.7.
    const red = stageEkstaseChargeRed(stageModById('konfetti')!.f);
    expect(100 * (1 - red)).toBeCloseTo(100 / 1.5, 9);
  });

  it('stageComboStep ist bei Faktor 1 identisch zu comboStep und sonst schneller', () => {
    const start = { ...createCombo(40), window: 0 };
    const normal = stageComboStep(start, 2);
    const fast = stageComboStep(start, 2, 0, 1.25);
    expect(fast.stacks).toBeLessThan(normal.stacks);
    // Das Gnaden-Fenster bleibt unangetastet — nur die Zeit DANACH zählt schneller.
    const inWindow = stageComboStep({ ...createCombo(40), window: 1.5 }, 0.5, 0, 1.25);
    expect(inWindow.stacks).toBe(40);
    expect(inWindow.window).toBeCloseTo(1, 12);
    expect(stageComboStep(start, 0, 0, 1.25)).toBe(start);
    expect(stageComboStep(start, 2, 0, 0).stacks).toBe(normal.stacks); // Unsinn ⇒ 1
  });
});
