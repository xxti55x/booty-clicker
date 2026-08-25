import { describe, expect, it } from 'vitest';

import {
  ABILITY_COST_MULT,
  DPS_TUNE,
  SPECIAL_BEAT_CAP_MS,
  SPECIAL_CRIT_CHANCE,
  SPECIAL_CRIT_DMG,
  abilityCost,
  abilityKind,
  abilityKindLabel,
  abilityLevel,
  abilityMult,
  ABILITY_FIRST_LEVEL,
  allowedKinds,
  CLICK_KINDS,
  crewMilestoneMult,
  isClickKind,
  OWN_KINDS,
  CREW_MILESTONES,
  nextCrewMilestone,
  MAX_ABILITY_TIERS,
  MIN_ABILITY_TIERS,
  maxAbilityTiers,
  dpsLevelFactor,
  DPS_MILESTONES,
  LEVEL_SOFTCAP,
  milestoneMult,
  nextMilestone,
  SOFTCAP_COST_GROWTH,
  ABILITY_SPACING,
  abilityTiersUnlocked,
  levelsToNextAbility,
  bestCrewBuy,
  bulkCost,
  CLICK_BASE,
  CLICK_DPS_SHARE,
  clickDamageRaw,
  CREW,
  createCrew,
  crewSpecialBonuses,
  grantFreeMasteryTiers,
  heirWeightFor,
  heroClick,
  heroDps,
  HERO_COST_GROWTH,
  maxAffordable,
  nextAbility,
  nextLevelCost,
  powerTiers,
  retrainSlotOrdinal,
  specialTiers,
  totalRawDps,
} from './heroes';

import { HEIR_WEIGHT, MASTERY_MAX_DPS_BONUS, MASTERY_RANKS, masteryOwnMult } from './mastery';

const boss = CREW[0]; // Booty-Boss: click hero, baseCost 5, baseDps 2 (click/level)
const hype = CREW[1]; // Hype-Girl: first pure-DPS member, baseDps 5

describe('heroes — click line vs DPS lines (v10)', () => {
  it('un-recruited members contribute nothing', () => {
    expect(heroDps(hype, 0)).toBe(0);
    expect(heroClick(boss, 0)).toBe(0);
    expect(totalRawDps(createCrew())).toBe(0);
  });

  it('slot 1 is CLICK damage only — zero DPS at any level', () => {
    expect(heroDps(boss, 50)).toBe(0);
    expect(heroClick(boss, 5)).toBe(boss.baseDps * 5);
    expect(totalRawDps({ boss: 50 })).toBe(0);
  });

  it('every member after slot 1 is pure DPS — zero click line', () => {
    for (const cfg of CREW.slice(1)) {
      expect(cfg.click).toBeUndefined();
      expect(heroClick(cfg, 50)).toBe(0);
    }
    expect(heroDps(hype, 4)).toBe(hype.baseDps * DPS_TUNE * 4);
  });

  it('sums DPS across the crew (click hero excluded)', () => {
    const levels = { boss: 10, hype: 4, dj: 2 };
    expect(totalRawDps(levels)).toBe(heroDps(hype, 4) + heroDps(CREW[2], 2));
  });
});

describe('heroes — kaufbare Fähigkeiten (buyable abilities)', () => {
  it('tiers unlock at Lv 25, then every 50 levels (25, 75, 125, …)', () => {
    expect(abilityLevel(1)).toBe(25);
    expect(abilityLevel(2)).toBe(75);
    expect(abilityLevel(3)).toBe(125);
    expect(abilityTiersUnlocked(boss, 24)).toBe(0);
    expect(abilityTiersUnlocked(boss, 25)).toBe(1);
    expect(abilityTiersUnlocked(boss, 74)).toBe(1);
    expect(abilityTiersUnlocked(boss, 75)).toBe(2);
    expect(abilityTiersUnlocked(boss, 125)).toBe(3);
    // Seit dem Fähigkeiten-Deckel ist bei acht Schluss — ein Mitglied kann
    // fertig ausgebaut sein, statt endlos neue Stufen zu bekommen.
    expect(abilityTiersUnlocked(boss, 375)).toBe(MAX_ABILITY_TIERS);
    expect(abilityTiersUnlocked(boss, 1025)).toBe(MAX_ABILITY_TIERS);
  });

  it('only POWER tiers raise output — mult follows the member RHYTHM (v11.1)', () => {
    // boss = Rhythmus 0 (P S P S), hype = 1 (P P S S), dj = 2 (P S S P)
    const dj = CREW[2];
    expect(abilityMult(boss, 0)).toBe(1);
    expect(abilityMult(boss, 1)).toBe(2); // P
    expect(abilityMult(boss, 2)).toBe(2); // P S
    expect(abilityMult(boss, 3)).toBe(3); // P S P
    expect(abilityMult(hype, 2)).toBe(3); // Kraft-Rush: P P
    expect(abilityMult(hype, 4)).toBe(3); // P P S S
    expect(abilityMult(dj, 3)).toBe(2); // Klammer: P S S
    expect(abilityMult(dj, 4)).toBe(3); // P S S P
    // Langzeit-Parität: JEDER Rhythmus trägt 2 Power pro 4er-Zyklus.
    for (const cfg of [boss, hype, dj]) {
      expect(powerTiers(cfg, 8)).toBe(4);
      expect(specialTiers(cfg, 8)).toBe(4);
    }
    expect(powerTiers(boss, 7)).toBe(4);
    expect(specialTiers(boss, 7)).toBe(3);
    // Der Level-Anteil ist seit den DPS-Meilensteinen nicht mehr das blanke
    // Level, sondern `dpsLevelFactor` — auf Lv 100 sind drei Meilensteine
    // erreicht (25/50/100), also 100 × 2³ = 800.
    expect(dpsLevelFactor(100)).toBe(800);
    expect(heroDps(hype, 100, 0, 0)).toBe(hype.baseDps * DPS_TUNE * 800);
    expect(heroDps(hype, 100, 0, 2)).toBe(hype.baseDps * DPS_TUNE * 800 * 3); // P P
    expect(heroClick(boss, 100, 0, 3)).toBe(boss.baseDps * 800 * 3); // P S P
  });

  it('abilityKind follows the member rhythm; tier 1 is ALWAYS power (v11.1)', () => {
    expect(abilityKind(hype, 1)).toBe('power');
    expect(abilityKind(hype, 2)).toBe('power'); // Kraft-Rush
    expect(abilityKind(hype, 3)).toBe('combo'); // Hype-Girl treibt die Combo
    expect(abilityKind(boss, 2)).toBe('critdmg');
    expect(abilityKind(CREW[2], 2)).toBe('idle'); // DJ (Klammer): P S S P
    expect(abilityKind(CREW[2], 4)).toBe('power');
    expect(abilityKind(CREW[2], 5)).toBe('power'); // Zyklus 2 beginnt wieder mit P
    // Every member declares a themed special, starts with power, and every
    // kind label resolves (incl. the v11.1 `idle` Groove kind).
    for (const cfg of CREW) {
      expect(cfg.special).not.toBe('power');
      expect(abilityKind(cfg, 1)).toBe('power');
      expect(abilityKindLabel(cfg.special, 'DPS').length).toBeGreaterThan(3);
    }
    // Die vier Eigen-Sorten sind über die vierzehn DPS-Mitglieder verteilt, und
    // jede kommt mehrfach vor — sonst hinge ein ganzer Spielstil an einem
    // einzigen Mitglied.
    for (const k of OWN_KINDS) {
      expect(CREW.filter((c) => c.special === k).length).toBeGreaterThanOrEqual(3);
    }
    // Die Klick-Sorten trägt genau EIN Mitglied: der Klick-Held.
    expect(CREW.filter((c) => isClickKind(c.special)).length).toBe(1);
    expect(CREW.find((c) => isClickKind(c.special))!.click).toBe(true);
  });

  // Nach dem Eigen-Boost-Umbau sammelt `crewSpecialBonuses` NUR noch die Sorten
  // des Klick-Helden: Krit-Chance, Krit-Schaden und Beat-Fenster wirken über die
  // Klick-Pipeline, und die ist der Ausstoß genau eines Mitglieds. Alles andere
  // hängt an seinem Träger (`heroOwnSpecialMult`).
  it('sammelt NUR die Klick-Sorten — und nur vom Klick-Helden', () => {
    const none = crewSpecialBonuses({});
    expect(none.critChance).toBe(0);
    expect(none.critDmg).toBe(0);
    expect(none.beatWindowMs).toBe(0);
    // Booty-Boss (Rhythmus P S P S, Stock-Sorte critdmg): 6 Stufen ⇒ 3 Specials.
    const boss6 = crewSpecialBonuses({ boss: 6 });
    expect(boss6.critDmg).toBeCloseTo(3 * SPECIAL_CRIT_DMG, 9);
    // Ein reines DPS-Mitglied speist diesen Topf NICHT — egal wie viel gekauft
    // ist. Genau das war der gemeldete Unsinn: „Krit" auf einem DPS-Mitglied.
    const dpsOnly = crewSpecialBonuses({ bouncer: 8, choreo: 8, producer: 8, hype: 8 });
    expect(dpsOnly.critChance).toBe(0);
    expect(dpsOnly.critDmg).toBe(0);
    expect(dpsOnly.beatWindowMs).toBe(0);
    // Das Beat-Fenster bleibt gedeckelt (der Takt muss eine Prüfung bleiben).
    const deep = crewSpecialBonuses(
      { boss: 400 },
      { boss: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [i + 1, 'beat'])) },
    );
    expect(deep.beatWindowMs).toBe(SPECIAL_BEAT_CAP_MS);
  });

  it('bindet jede Sorte an ihren Mitgliedstyp', () => {
    for (const cfg of CREW) {
      const allowed = allowedKinds(cfg);
      // Die Stock-Sorte eines Mitglieds ist immer eine, die es tragen DARF.
      expect(allowed).toContain(cfg.special);
      // Klick-Sorten gehören dem Klick-Helden, Eigen-Sorten den DPS-Mitgliedern.
      for (const k of allowed) expect(isClickKind(k)).toBe(cfg.click === true);
    }
    // Und beide Mengen sind disjunkt — keine Sorte gehört beiden.
    for (const k of CLICK_KINDS) expect(OWN_KINDS).not.toContain(k);
  });

  it('ability price = level-cost at the unlock level × ABILITY_COST_MULT', () => {
    expect(abilityCost(hype, 1)).toBe(
      Math.floor(hype.baseCost * Math.pow(HERO_COST_GROWTH, 25) * ABILITY_COST_MULT),
    );
    expect(abilityCost(hype, 2)).toBe(
      Math.floor(hype.baseCost * Math.pow(HERO_COST_GROWTH, 75) * ABILITY_COST_MULT),
    );
  });

  it('nextAbility reports the next tier in order with its gate', () => {
    expect(nextAbility(hype, 24, 0)!.unlocked).toBe(false);
    expect(nextAbility(hype, 25, 0)).toMatchObject({ tier: 1, level: 25, unlocked: true });
    expect(nextAbility(hype, 25, 1)).toMatchObject({ tier: 2, level: 75, unlocked: false });
    expect(nextAbility(hype, 80, 1)).toMatchObject({ tier: 2, level: 75, unlocked: true });
  });

  it('gilds stack multiplicatively on top of bought abilities', () => {
    expect(heroDps(hype, 10, 2, 1)).toBeCloseTo(hype.baseDps * DPS_TUNE * 10 * 2 * 1.25 ** 2, 6);
  });
});

describe('heroes — costs', () => {
  it('the first level costs baseCost, then grows by the growth rate', () => {
    expect(nextLevelCost(boss, 0)).toBe(5);
    expect(nextLevelCost(boss, 1)).toBe(Math.floor(5 * HERO_COST_GROWTH));
  });

  it('bulk cost equals the sum of the individual level costs', () => {
    let manual = 0;
    for (let l = 0; l < 10; l++) manual += boss.baseCost * Math.pow(HERO_COST_GROWTH, l);
    expect(bulkCost(boss, 0, 10)).toBe(Math.floor(manual));
    expect(bulkCost(boss, 3, 0)).toBe(0);
  });

  it('maxAffordable never over-spends and is consistent with bulkCost', () => {
    const gold = 1000;
    const n = maxAffordable(boss, 0, gold);
    expect(bulkCost(boss, 0, n)).toBeLessThanOrEqual(gold);
    expect(bulkCost(boss, 0, n + 1)).toBeGreaterThan(gold);
    expect(maxAffordable(boss, 0, 1)).toBe(0); // baseCost is 5
  });

  // The M9 crew tiers (large baseCost) must keep the closed-form bulk/max math
  // exact against an iterative sum (spec §4.3.3 / M9-AC2).
  it('bulkCost + maxAffordable stay exact for the endless tiers', () => {
    const newTiers = CREW.slice(10); // viral … cosmic
    expect(newTiers.length).toBe(5);
    for (const cfg of newTiers) {
      const from = 7;
      let manual = 0;
      for (let l = from; l < from + 12; l++) manual += cfg.baseCost * Math.pow(HERO_COST_GROWTH, l);
      expect(bulkCost(cfg, from, 12)).toBe(Math.floor(manual));

      const gold = cfg.baseCost * 5000;
      const n = maxAffordable(cfg, from, gold);
      expect(bulkCost(cfg, from, n)).toBeLessThanOrEqual(gold);
      expect(bulkCost(cfg, from, n + 1)).toBeGreaterThan(gold);
    }
  });
});

describe('heroes — click damage', () => {
  it('is at least the flat floor with no crew', () => {
    expect(clickDamageRaw(createCrew())).toBe(CLICK_BASE);
  });

  it('upgrade 1 IS click damage: the Boss line lands 1:1 in the shake', () => {
    const levels = { boss: 20 };
    expect(clickDamageRaw(levels)).toBeCloseTo(CLICK_BASE + heroClick(boss, 20), 6);
  });

  it('DPS members feed the click via the share — active play keeps scaling (P1)', () => {
    const levels = { boss: 10, hype: 30 };
    // Hype steht auf 30 und hat damit die erste crew-weite Schwelle (25) für
    // sich erreicht: 1 von 15 ⇒ Faktor ×1.067 auf den CREW-Anteil des Klicks.
    // `CLICK_BASE` bleibt als Sockel außen vor, der DPS-Anteil trägt den Faktor
    // schon aus `totalRawDps`.
    const expected =
      CLICK_BASE +
      heroClick(boss, 10) * crewMilestoneMult(levels) +
      CLICK_DPS_SHARE * totalRawDps(levels);
    expect(clickDamageRaw(levels)).toBeCloseTo(expected, 6);
    expect(clickDamageRaw(levels)).toBeGreaterThan(clickDamageRaw({ boss: 10 }));
  });

  it('bought Boss abilities double the click line (not the DPS share)', () => {
    const noUp = clickDamageRaw({ boss: 40 }, {}, {});
    const withUp = clickDamageRaw({ boss: 40 }, {}, { boss: 1 });
    expect(withUp - CLICK_BASE).toBeCloseTo((noUp - CLICK_BASE) * 2, 6);
  });
});

describe('heroes — Crew-Meisterschaft (IDEEN-GAMEPLAY 1a)', () => {
  const BRONZE = MASTERY_RANKS[0].at;
  const GOLD = MASTERY_RANKS[2].at;

  it('faltet den Eigen-Perk in die DPS eines Mitglieds — und NUR in seine', () => {
    const plain = heroDps(hype, 40);
    expect(heroDps(hype, 40, 0, 0, BRONZE)).toBeCloseTo(plain * 1.02, 9);
    expect(heroDps(hype, 40, 0, 0, GOLD)).toBeCloseTo(plain * 1.06, 9);
    // Die Meisterschaft des EINEN hebt die Crew-Summe nur um seinen Anteil.
    const levels = { hype: 40, dj: 40 };
    const soloBonus = heroDps(hype, 40, 0, 0, GOLD) - plain;
    // Der crew-weite Meilenstein liegt als Faktor auf der SUMME (hier steht die
    // ganze angeheuerte Crew auf Lv 40, also ist die 25er-Schwelle gerissen).
    // Der Eigen-Bonus muss ihn deshalb ebenfalls tragen — die Zusicherung ist
    // unverändert: Die Meisterschaft des EINEN hebt nur seinen Anteil.
    expect(totalRawDps(levels, {}, {}, { hype: GOLD })).toBeCloseTo(
      totalRawDps(levels) + soloBonus * crewMilestoneMult(levels),
      6,
    );
  });

  it('zahlt beim Klick-Mitglied auf den KLICK (dessen Level sind Klick-Schaden)', () => {
    const plain = heroClick(boss, 60);
    expect(heroClick(boss, 60, 0, 0, GOLD)).toBeCloseTo(plain * 1.06, 9);
    // In `clickDamageRaw` landet er über die Boss-Linie UND über den DPS-Anteil.
    const levels = { boss: 60, hype: 30 };
    const withMastery = clickDamageRaw(levels, {}, {}, { boss: GOLD, hype: GOLD });
    const expected =
      CLICK_BASE +
      // Nur der Crew-Anteil des Klicks skaliert mit dem crew-weiten
      // Meilenstein; `CLICK_BASE` ist der Sockel und bleibt außen vor.
      heroClick(boss, 60, 0, 0, GOLD) * crewMilestoneMult(levels) +
      CLICK_DPS_SHARE * totalRawDps(levels, {}, {}, { hype: GOLD });
    expect(withMastery).toBeCloseTo(expected, 6);
  });

  it('faltet ×1, solange keine Tafel übergeben wird (jeder Alt-Aufrufer bleibt zahlengleich)', () => {
    expect(heroDps(hype, 33)).toBe(heroDps(hype, 33, 0, 0, 0));
    expect(totalRawDps({ hype: 33 })).toBe(totalRawDps({ hype: 33 }, {}, {}, {}));
    expect(clickDamageRaw({ boss: 33 })).toBe(clickDamageRaw({ boss: 33 }, {}, {}, {}));
    // Auch ein Mitglied UNTER Bronze ändert nichts.
    expect(totalRawDps({ hype: 33 }, {}, {}, { hype: BRONZE - 1 })).toBeCloseTo(
      totalRawDps({ hype: 33 }),
      9,
    );
  });

  it('multipliziert sauber mit Vergoldungen und Fähigkeiten (alles ein Produkt)', () => {
    const full = heroDps(hype, 50, 2, 3, GOLD);
    expect(full).toBeCloseTo(heroDps(hype, 50, 2, 3) * masteryOwnMult(GOLD), 6);
  });

  it('hebt die ROI-Rangfolge eines gemeisterten Mitglieds um genau seinen Perk', () => {
    // Zwei Mitglieder, gleiche Ausgangslage: der Perk entscheidet die Reihenfolge.
    const levels = { hype: 30, dj: 30 };
    const plain = bestCrewBuy(levels, {}, {}, 1e9);
    const tilted = bestCrewBuy(levels, {}, {}, 1e9, {
      [plain!.id === 'hype' ? 'dj' : 'hype']: GOLD,
    });
    expect(plain).not.toBeNull();
    expect(tilted).not.toBeNull();
    // Der Grenznutzen des gemeisterten Mitglieds steigt um exakt 6 %.
    const same = bestCrewBuy(levels, {}, {}, 1e9, { [plain!.id]: GOLD });
    expect(same!.id).toBe(plain!.id);
    expect(same!.roi).toBeCloseTo(plain!.roi * 1.06, 9);
  });
});

describe('heroes — die Gratis-Erststufe des Legenden-Rangs (1a)', () => {
  const LEGENDE = MASTERY_RANKS[3].at;

  it('schenkt Stufe 1, sobald Level 25 erreicht ist', () => {
    const r = grantFreeMasteryTiers({ hype: 25 }, {}, { hype: LEGENDE });
    expect(r.granted).toEqual(['hype']);
    expect(r.ups).toEqual({ hype: 1 });
  });

  it('schweigt unterhalb von Lv 25, unterhalb von Legende und bei schon Gekauftem', () => {
    // Level zu niedrig — die Stufe existiert noch nicht.
    expect(grantFreeMasteryTiers({ hype: 24 }, {}, { hype: LEGENDE }).granted).toEqual([]);
    // Rang zu niedrig.
    expect(grantFreeMasteryTiers({ hype: 80 }, {}, { hype: LEGENDE - 1 }).granted).toEqual([]);
    // Schon eine Stufe im Ledger ⇒ nichts zu schenken (kein zweiter Gratis-Slot).
    expect(grantFreeMasteryTiers({ hype: 80 }, { hype: 1 }, { hype: LEGENDE }).granted).toEqual([]);
    expect(grantFreeMasteryTiers({ hype: 80 }, { hype: 3 }, { hype: LEGENDE }).granted).toEqual([]);
  });

  it('gibt den Ledger unverändert (identisch) zurück, wenn nichts zu tun ist', () => {
    const ups = { hype: 2 };
    expect(grantFreeMasteryTiers({ hype: 80 }, ups, {}).ups).toBe(ups);
  });

  it('ist idempotent — zweimal aufgerufen schenkt es kein zweites Mal', () => {
    const first = grantFreeMasteryTiers({ hype: 90, dj: 30 }, {}, { hype: LEGENDE, dj: LEGENDE });
    expect(first.granted).toEqual(['hype', 'dj']);
    const second = grantFreeMasteryTiers({ hype: 90, dj: 30 }, first.ups, {
      hype: LEGENDE,
      dj: LEGENDE,
    });
    expect(second.granted).toEqual([]);
    expect(second.ups).toEqual({ hype: 1, dj: 1 });
  });

  it('mutiert den übergebenen Ledger nie (die Glue entscheidet, ob sie bucht)', () => {
    const ups = { dj: 2 };
    const r = grantFreeMasteryTiers({ hype: 30, dj: 90 }, ups, { hype: LEGENDE });
    expect(ups).toEqual({ dj: 2 });
    expect(r.ups).toEqual({ dj: 2, hype: 1 });
  });
});

describe('heroes — Crew-Umschulung: die EINE Lesekette (IDEEN-GAMEPLAY 3b)', () => {
  const boss = CREW[0]; // Rhythmus 0: P S P S · Stock-Sorte critdmg
  const hype = CREW[1]; // Rhythmus 1: P P S S · Stock-Sorte combo
  const dj = CREW[2]; // Rhythmus 2: P S S P · Stock-Sorte beat

  it('liest den Override VOR der Stock-Sorte — ohne Map bleibt alles wie vor 3b', () => {
    expect(abilityKind(boss, 2)).toBe('critdmg');
    expect(abilityKind(boss, 2, {})).toBe('critdmg');
    expect(abilityKind(boss, 2, { boss: { '2': 'idle' } })).toBe('idle');
    // Der Override gilt genau für SEINEN Slot, nicht für die anderen des Mitglieds.
    expect(abilityKind(boss, 4, { boss: { '2': 'idle' } })).toBe('critdmg');
    // … und nicht für andere Mitglieder.
    expect(abilityKind(hype, 3, { boss: { '2': 'idle' } })).toBe('combo');
  });

  it('lässt POWER-Stufen unantastbar — der Rhythmus rollt nie mit', () => {
    const map = { boss: { '1': 'crit' as const, '3': 'beat' as const } };
    expect(abilityKind(boss, 1, map)).toBe('power');
    expect(abilityKind(boss, 3, map)).toBe('power');
    // Jedes Muster behält seine 2 P + 2 S je Zyklus, egal was die Map behauptet.
    for (const cfg of CREW) {
      const all = { [cfg.id]: { '1': 'boss', '2': 'boss', '3': 'boss', '4': 'boss' } } as never;
      const power = [1, 2, 3, 4].filter((t) => abilityKind(cfg, t, all) === 'power').length;
      expect(power).toBe(powerTiers(cfg, 4));
    }
  });

  it('nummeriert die Spezial-Slots rhythmus-bewusst (das treibt den Preis)', () => {
    // P S P S: Stufen 2/4/6 sind Slot 1/2/3, die ungeraden sind Power ⇒ 0.
    expect(retrainSlotOrdinal(boss, 1)).toBe(0);
    expect(retrainSlotOrdinal(boss, 2)).toBe(1);
    expect(retrainSlotOrdinal(boss, 4)).toBe(2);
    expect(retrainSlotOrdinal(boss, 6)).toBe(3);
    // P P S S: der ERSTE Spezial-Slot ist hier Stufe 3.
    expect(retrainSlotOrdinal(hype, 2)).toBe(0);
    expect(retrainSlotOrdinal(hype, 3)).toBe(1);
    expect(retrainSlotOrdinal(hype, 4)).toBe(2);
    // P S S P: zwei Specials in Folge.
    expect(retrainSlotOrdinal(dj, 2)).toBe(1);
    expect(retrainSlotOrdinal(dj, 3)).toBe(2);
    expect(retrainSlotOrdinal(dj, 4)).toBe(0);
    // Die Nummer wächst monoton und lückenlos über die Spezial-Stufen.
    let seen = 0;
    for (let t = 1; t <= 20; t++) {
      const n = retrainSlotOrdinal(dj, t);
      if (n > 0) expect(n).toBe(++seen);
    }
    expect(seen).toBe(specialTiers(dj, 20));
  });

  it('faltet umgeschulte Slots wie gekaufte — die Sorte wandert, die Anzahl nicht', () => {
    // Booty-Boss, 6 Stufen ⇒ 3 Specials (Stufen 2/4/6), Stock alle `critdmg`.
    const stock = crewSpecialBonuses({ boss: 6 });
    expect(stock.critDmg).toBeCloseTo(3 * SPECIAL_CRIT_DMG, 9);
    expect(stock.critChance).toBe(0);
    // Zwei davon auf `crit` umgeschult: 1 × critdmg + 2 × crit, Summe bleibt 3.
    const rolled = crewSpecialBonuses({ boss: 6 }, { boss: { '2': 'crit', '6': 'crit' } });
    expect(rolled.critDmg).toBeCloseTo(SPECIAL_CRIT_DMG, 9);
    expect(rolled.critChance).toBeCloseTo(2 * SPECIAL_CRIT_CHANCE, 9);
    // Ein Override auf einem NOCH NICHT gekauften Slot zahlt nichts (er ist nicht da).
    const unbought = crewSpecialBonuses({ boss: 2 }, { boss: { '4': 'crit' } });
    expect(unbought.critChance).toBe(0);
    expect(unbought.critDmg).toBeCloseTo(SPECIAL_CRIT_DMG, 9);
  });

  it('rechnet mit leerer Map exakt dieselben Zahlen wie ohne (der Bot-Pfad)', () => {
    const ups = { boss: 6, hype: 7, dj: 9, producer: 4, influencer: 5 };
    expect(crewSpecialBonuses(ups, {})).toEqual(crewSpecialBonuses(ups));
    // Auch ein Override, der die Stock-Sorte wiederholt, ändert keine Zahl.
    expect(crewSpecialBonuses(ups, { boss: { '2': 'critdmg' } })).toEqual(crewSpecialBonuses(ups));
  });

  it('respektiert die Fenster-Deckel auch für umgeschulte Sorten', () => {
    // Ein tiefer Stapel auf `beat` umgeschult läuft in denselben Deckel wie ein
    // von Haus aus beat-lastiger Save — die Umschulung öffnet keine Hintertür.
    // Geprüft am KLICK-Helden: Seit dem Eigen-Boost-Umbau ist er der Einzige,
    // der diesen Topf überhaupt speist.
    const deep = crewSpecialBonuses(
      { boss: 200 },
      { boss: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [i + 1, 'beat'])) },
    );
    expect(deep.beatWindowMs).toBe(SPECIAL_BEAT_CAP_MS);
    // Dieselbe Umschulung auf einem DPS-Mitglied zahlt hier GAR NICHTS — seine
    // Stufen gehören seiner eigenen Linie.
    const dps = crewSpecialBonuses(
      { influencer: 200 },
      { influencer: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [i + 1, 'beat'])) },
    );
    expect(dps.beatWindowMs).toBe(0);
  });
});

describe('Erbe (3c) — die doppelte Meisterschaft in der Crew-Faltung', () => {
  const gold = MASTERY_RANKS[2].at; // Gold-Rang: der Perk steht bei +6 %

  it('gewichtet genau EIN Mitglied doppelt', () => {
    expect(heirWeightFor('dj', 'dj')).toBe(HEIR_WEIGHT);
    expect(heirWeightFor('hype', 'dj')).toBe(1);
    // Ohne Erben zählt niemand doppelt — der Normalfall vor der 1. Transzendenz.
    expect(heirWeightFor('dj', '')).toBe(1);
  });

  it('hebt die Gesamt-DPS um exakt den Eigen-Anteil des Erben', () => {
    const levels = Object.fromEntries(CREW.map((c) => [c.id, 40]));
    const mastery = Object.fromEntries(CREW.map((c) => [c.id, gold]));
    const plain = totalRawDps(levels, {}, {}, mastery);
    const withHeir = totalRawDps(levels, {}, {}, mastery, 'dj');
    expect(withHeir).toBeGreaterThan(plain);
    // Der Zuwachs ist der EIGEN-Anteil dieses einen Mitglieds × 6 pp / 1.06.
    const own = heroDps(
      CREW.find((c) => c.id === 'dj')!,
      40,
      0,
      0,
      gold,
    );
    // `own` ist der Beitrag EINES Mitglieds vor der Summen-Skalierung; der
    // crew-weite Meilenstein (ganze Crew auf Lv 40) liegt auf der Summe.
    expect((withHeir - plain) / (own * (0.06 / 1.06) * crewMilestoneMult(levels))).toBeCloseTo(
      1,
      5,
    );
  });

  /**
   * **Die Leitplanke des Erben-Moments, strukturell.** Die Verdopplung wirkt nur
   * auf den EIGEN-Anteil eines Mitglieds. Selbst wenn ein einziges Mitglied die
   * KOMPLETTE Crew-DPS trüge, wäre der Zuwachs `0.06 / 1.06 = +5,66 %` — der
   * absolute Deckel, und er hängt allein an `MASTERY_MAX_DPS_BONUS`, nicht an
   * der Crew-Kurve. Gemessen an gleichmäßig gekauften Leveln bleibt er darunter,
   * weil das stärkste Mitglied zwar dominiert, aber nie allein ist.
   */
  it('bleibt strukturell unter +5,66 % Gesamt-DPS (der Eigen-Anteil-Deckel)', () => {
    const cap = MASTERY_MAX_DPS_BONUS / (1 + MASTERY_MAX_DPS_BONUS); // 0.0566…
    const levels = Object.fromEntries(CREW.map((c) => [c.id, 40]));
    const mastery = Object.fromEntries(CREW.map((c) => [c.id, gold]));
    const plain = totalRawDps(levels, {}, {}, mastery);
    let worst = 1;
    for (const cfg of CREW) {
      const r = totalRawDps(levels, {}, {}, mastery, cfg.id) / plain;
      if (r > worst) worst = r;
    }
    expect(worst - 1).toBeLessThan(cap);
    expect(worst).toBeLessThan(1.05); // gemessen: ×1.0490 im Extremfall „alle Lv 40"
  });

  it('wirkt beim Klick-Mitglied auf den KLICK (dort sitzt sein Eigen-Output)', () => {
    const levels = { boss: 50 };
    const mastery = { boss: gold };
    const plain = clickDamageRaw(levels, {}, {}, mastery);
    const withHeir = clickDamageRaw(levels, {}, {}, mastery, 'boss');
    expect(withHeir).toBeGreaterThan(plain);
  });

  it('tut ohne Rang nichts (doppelt null ist null)', () => {
    const levels = Object.fromEntries(CREW.map((c) => [c.id, 20]));
    expect(totalRawDps(levels, {}, {}, {}, 'dj')).toBe(totalRawDps(levels, {}, {}, {}));
  });

  it('lässt eine unbekannte Erben-Id die Rechnung unverändert', () => {
    const levels = Object.fromEntries(CREW.map((c) => [c.id, 30]));
    const mastery = Object.fromEntries(CREW.map((c) => [c.id, gold]));
    expect(totalRawDps(levels, {}, {}, mastery, 'niemand')).toBe(
      totalRawDps(levels, {}, {}, mastery),
    );
  });
});

// Kaufmenge „Fähigkeit": bis exakt auf den nächsten Freischalt-Meilenstein.
describe('levelsToNextAbility — die Kaufmenge bis zur nächsten Fähigkeit', () => {
  it('führt von Level 0 genau auf die erste Freischaltung', () => {
    expect(levelsToNextAbility(boss, 0)).toBe(ABILITY_FIRST_LEVEL);
    expect(levelsToNextAbility(boss, 10)).toBe(ABILITY_FIRST_LEVEL - 10);
    expect(levelsToNextAbility(boss, 24)).toBe(1);
  });

  it('landet immer EXAKT auf einer Freischaltung, solange es noch eine gibt', () => {
    for (let lv = 0; lv < 400; lv++) {
      if (abilityTiersUnlocked(boss, lv) >= MAX_ABILITY_TIERS) continue; // alles offen
      const target = lv + levelsToNextAbility(boss, lv);
      expect(abilityTiersUnlocked(boss, target)).toBeGreaterThan(abilityTiersUnlocked(boss, lv));
      expect(abilityTiersUnlocked(boss, target - 1)).toBe(abilityTiersUnlocked(boss, lv));
    }
  });

  // Ist alles freigeschaltet, zielt die Menge auf den nächsten DPS-Meilenstein
  // statt ins Leere — der Knopf bleibt sinnvoll.
  it('zielt nach der letzten Fähigkeit auf den nächsten DPS-Meilenstein', () => {
    const full = abilityLevel(MAX_ABILITY_TIERS); // Lv 375
    expect(abilityTiersUnlocked(boss, full)).toBe(MAX_ABILITY_TIERS);
    const target = full + levelsToNextAbility(boss, full);
    // 375 liegt über dem Soft-Cap: dort gibt es keinen Meilenstein mehr, also
    // kauft die Menge genau ein Level.
    expect(target).toBe(full + 1);
    // Unterhalb des Caps zeigt sie dagegen auf den Meilenstein.
    const below = 260;
    expect(nextMilestone(below)).toBe(null);
    expect(nextMilestone(180)).toBe(200);
  });

  it('zeigt auf einer Freischaltung auf die NÄCHSTE (kein No-Op-Knopf)', () => {
    expect(levelsToNextAbility(boss, ABILITY_FIRST_LEVEL)).toBe(ABILITY_SPACING);
    expect(levelsToNextAbility(boss, 75)).toBe(ABILITY_SPACING);
  });

  it('bleibt bei kaputten Eingaben eine sinnvolle Zahl', () => {
    expect(levelsToNextAbility(boss, -5)).toBe(ABILITY_FIRST_LEVEL);
    expect(levelsToNextAbility(boss, Number.NaN)).toBe(ABILITY_FIRST_LEVEL);
  });
});

// ---------------------------------------------------------------------------
// DPS-Meilensteine + Level-Soft-Cap
// ---------------------------------------------------------------------------
// Goal: „charaktere lassen sich zu weit upgraden. sie sollen alle x level einen
// dps +100 % passiv bekommen … und ab da nurnoch linear dps und exponentiell
// preis." Die Meilensteine machen das Leveln in Sprüngen lohnend, der Soft-Cap
// beendet es als Dauerstrategie — beides wird hier an den KANTEN geprüft, weil
// genau dort die Fehler sitzen (ein Level zu früh/zu spät verdoppelt).
describe('DPS-Meilensteine und Soft-Cap', () => {
  const cfg = CREW[0]!;

  it('verdoppelt GENAU auf dem Meilenstein, keinen Level früher', () => {
    for (const m of DPS_MILESTONES) {
      expect(milestoneMult(m)).toBe(milestoneMult(m - 1) * 2);
    }
    expect(milestoneMult(0)).toBe(1);
    expect(milestoneMult(24)).toBe(1);
    expect(milestoneMult(25)).toBe(2);
    // Auf dem Cap stehen alle fünf Verdopplungen: 2^5.
    expect(milestoneMult(LEVEL_SOFTCAP)).toBe(2 ** DPS_MILESTONES.length);
  });

  it('wächst über dem Soft-Cap nur noch LINEAR (keine Sprünge mehr)', () => {
    const cap = milestoneMult(LEVEL_SOFTCAP);
    for (const lv of [LEVEL_SOFTCAP, 300, 500, 1000, 5000]) {
      expect(milestoneMult(lv)).toBe(cap);
      expect(dpsLevelFactor(lv)).toBe(lv * cap);
    }
    // Der Zuwachs je Level ist über dem Cap konstant — das ist „linear".
    const step = dpsLevelFactor(1001) - dpsLevelFactor(1000);
    expect(dpsLevelFactor(5001) - dpsLevelFactor(5000)).toBe(step);
  });

  it('bleibt streng monoton und startet bei 0 (kein Gratis-Ausstoß auf Lv 0)', () => {
    expect(dpsLevelFactor(0)).toBe(0);
    expect(dpsLevelFactor(-5)).toBe(0);
    expect(dpsLevelFactor(Number.NaN)).toBe(0);
    let prev = 0;
    for (let lv = 1; lv <= 400; lv++) {
      const v = dpsLevelFactor(lv);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('lässt den Preis erst ÜBER dem Cap zusätzlich exponentiell steigen', () => {
    // Unter dem Cap ist das Verhältnis zweier Nachbarpreise exakt das normale
    // Leiter-Wachstum; darüber kommt SOFTCAP_COST_GROWTH obendrauf.
    const ratio = (lv: number): number => nextLevelCost(cfg, lv + 1) / nextLevelCost(cfg, lv);
    const under = ratio(100);
    const over = ratio(LEVEL_SOFTCAP + 50);
    expect(over / under).toBeCloseTo(SOFTCAP_COST_GROWTH, 2);
    // Und die Bremse ist spürbar: 100 Level über dem Cap kostet ein Level ein
    // Vielfaches dessen, was dieselbe Leiter ohne Cap verlangt hätte.
    expect(nextLevelCost(cfg, LEVEL_SOFTCAP + 100)).toBeGreaterThan(
      nextLevelCost(cfg, LEVEL_SOFTCAP) * SOFTCAP_COST_GROWTH ** 99,
    );
  });

  it('bulkCost summiert dieselben Preise, die nextLevelCost einzeln nennt', () => {
    // Die geschlossene Formel gilt nur UNTER dem Cap — über ihm muss `bulkCost`
    // Stück für Stück rechnen. Dieser Test läuft genau über die Kante.
    for (const from of [0, 10, LEVEL_SOFTCAP - 5, LEVEL_SOFTCAP, LEVEL_SOFTCAP + 30]) {
      for (const n of [1, 7, 25]) {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += nextLevelCost(cfg, from + i);
        // Rundung je Level ⇒ kleine Abweichung; relativ vergleichen.
        expect(bulkCost(cfg, from, n)).toBeGreaterThan(sum * 0.999);
        expect(bulkCost(cfg, from, n)).toBeLessThan(sum * 1.001 + n);
      }
    }
    expect(bulkCost(cfg, 0, 0)).toBe(0);
    expect(bulkCost(cfg, 0, -3)).toBe(0);
  });

  it('maxAffordable kauft nie über das Konto hinaus — auch über der Kante nicht', () => {
    for (const from of [0, 40, LEVEL_SOFTCAP - 3, LEVEL_SOFTCAP, LEVEL_SOFTCAP + 20]) {
      for (const mult of [1, 3.5, 40, 1e4]) {
        const gold = nextLevelCost(cfg, from) * mult;
        const n = maxAffordable(cfg, from, gold);
        // Was gekauft wird, ist bezahlbar …
        expect(bulkCost(cfg, from, n)).toBeLessThanOrEqual(gold);
        // … und ein Level mehr wäre es nicht (die Schätzung ist exakt, nicht scheu).
        expect(bulkCost(cfg, from, n + 1)).toBeGreaterThan(gold);
      }
    }
    expect(maxAffordable(cfg, 0, 0)).toBe(0);
  });

  it('deckelt die Fähigkeiten bei MAX_ABILITY_TIERS — erreichbar ÜBER dem Cap', () => {
    // Bewusstes Design: Die letzte Fähigkeit liegt jenseits des Soft-Caps. Damit
    // behält die teure Zone einen Grund — kein DPS-Sprung mehr, aber die
    // restlichen Fähigkeiten. Ohne das wäre alles über Lv 250 sinnlos.
    const last = abilityLevel(MAX_ABILITY_TIERS);
    expect(last).toBeGreaterThan(LEVEL_SOFTCAP);
    expect(abilityTiersUnlocked(boss, last)).toBe(MAX_ABILITY_TIERS);
    expect(abilityTiersUnlocked(boss, last - 1)).toBe(MAX_ABILITY_TIERS - 1);
    expect(abilityTiersUnlocked(boss, last + 5000)).toBe(MAX_ABILITY_TIERS);
  });
});

// ---------------------------------------------------------------------------
// Fähigkeiten-Spanne 4…8 je Mitglied
// ---------------------------------------------------------------------------
// Goal: „fähigkeiten soll es auch MAX 8 geben also für alle zwischen 4-8."
// Vorher lernten alle 15 Mitglieder dieselbe Zahl — sie unterschieden sich
// damit nur noch in Grundwerten. Die Spanne gibt jedem ein Profil.
describe('Fähigkeiten-Spanne je Mitglied', () => {
  it('gibt jedem Mitglied eine Zahl INNERHALB der Spanne', () => {
    for (const cfg of CREW) {
      expect(maxAbilityTiers(cfg)).toBeGreaterThanOrEqual(MIN_ABILITY_TIERS);
      expect(maxAbilityTiers(cfg)).toBeLessThanOrEqual(MAX_ABILITY_TIERS);
    }
  });

  it('nutzt die Spanne wirklich aus (nicht alle auf demselben Wert)', () => {
    const seen = new Set(CREW.map(maxAbilityTiers));
    // Beide Ränder kommen vor — sonst wäre die Spanne nur Dekoration.
    expect(seen.has(MIN_ABILITY_TIERS)).toBe(true);
    expect(seen.has(MAX_ABILITY_TIERS)).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('klemmt kaputte Tabellen-Werte, statt die Anzeige zu sprengen', () => {
    const bad = { ...CREW[0], tiers: 99 };
    const worse = { ...CREW[0], tiers: 0 };
    const nan = { ...CREW[0], tiers: Number.NaN };
    expect(maxAbilityTiers(bad)).toBe(MAX_ABILITY_TIERS);
    expect(maxAbilityTiers(worse)).toBe(MIN_ABILITY_TIERS);
    expect(maxAbilityTiers(nan)).toBe(MIN_ABILITY_TIERS);
  });

  it('schaltet nie mehr Stufen frei, als das Mitglied lernen kann', () => {
    for (const cfg of CREW) {
      const cap = maxAbilityTiers(cfg);
      // Weit über jedem denkbaren Level bleibt der Deckel stehen.
      expect(abilityTiersUnlocked(cfg, 10_000)).toBe(cap);
      // Und genau AUF seinem Level ist er erreicht, einen darunter nicht.
      expect(abilityTiersUnlocked(cfg, abilityLevel(cap))).toBe(cap);
      expect(abilityTiersUnlocked(cfg, abilityLevel(cap) - 1)).toBe(cap - 1);
    }
  });

  // Der gemeldete Fehler: „warum sieht man bei der crew mehr als 8 fähigkeiten
  // nachdem man alle 8 gekauft hat?" — `nextAbility` lieferte stur gekauft+1.
  it('meldet KEINE weitere Fähigkeit, wenn das Mitglied fertig ist', () => {
    for (const cfg of CREW) {
      const cap = maxAbilityTiers(cfg);
      // Eine Stufe vor Schluss gibt es noch etwas …
      expect(nextAbility(cfg, 10_000, cap - 1)).not.toBeNull();
      expect(nextAbility(cfg, 10_000, cap - 1)!.tier).toBe(cap);
      // … danach nichts mehr, egal wie hoch das Level steigt.
      expect(nextAbility(cfg, 10_000, cap)).toBeNull();
      expect(nextAbility(cfg, 99_999, cap + 5)).toBeNull();
    }
  });

  it('lässt die Kaufmenge „Fähigkeit" bei einem fertigen Mitglied nicht ins Leere zeigen', () => {
    for (const cfg of CREW) {
      const cap = maxAbilityTiers(cfg);
      const full = abilityLevel(cap);
      // Alles freigeschaltet ⇒ die Menge zielt auf den Meilenstein bzw. 1 Level,
      // niemals auf eine Fähigkeit, die es nicht gibt.
      const n = levelsToNextAbility(cfg, full);
      expect(n).toBeGreaterThanOrEqual(1);
      const m = nextMilestone(full);
      expect(n).toBe(m === null ? 1 : m - full);
    }
  });
});

// ---------------------------------------------------------------------------
// Crew-weite Meilensteine
// ---------------------------------------------------------------------------
// Goal: „wenn alle charaktere auf level x z.b. 25 oder 100 dps boost für ALLE."
// Der Kanal ersetzt die weggefallenen globalen Fähigkeits-Boni und ist der
// einzige Term, den ein einzelnes Mitglied nicht allein auslösen kann.
describe('Crew-weite Meilensteine', () => {
  const all = (lv: number): Record<string, number> =>
    Object.fromEntries(CREW.map((c) => [c.id, lv]));

  it('zahlt ×2 je Schwelle, sobald die GANZE Crew sie erreicht hat', () => {
    expect(crewMilestoneMult(all(24))).toBe(1);
    expect(crewMilestoneMult(all(25))).toBe(2);
    expect(crewMilestoneMult(all(50))).toBe(4);
    expect(crewMilestoneMult(all(100))).toBe(8);
    expect(crewMilestoneMult(all(200))).toBe(16);
    expect(crewMilestoneMult(all(250))).toBe(2 ** CREW_MILESTONES.length);
  });

  it('bleibt bei einer leeren Crew neutral', () => {
    expect(crewMilestoneMult({})).toBe(1);
    expect(crewMilestoneMult(createCrew())).toBe(1);
  });

  // Der Fehler, den erst die Messung zeigte: Mit „angeheuert" als Nenner fiel
  // der Faktor beim Anheuern des letzten Mitglieds von ×32 auf ×1 — das Spiel
  // bestrafte damit das Vervollständigen der Crew.
  it('wird durch ANHEUERN niemals kleiner', () => {
    for (const cfg of CREW) {
      const ohne = all(250);
      delete ohne[cfg.id];
      const frisch = { ...all(250), [cfg.id]: 1 };
      expect(crewMilestoneMult(frisch)).toBeGreaterThanOrEqual(crewMilestoneMult(ohne));
    }
  });

  it('gibt einem einzelnen hochgezogenen Mitglied NICHT den vollen Bonus', () => {
    const solo = crewMilestoneMult({ boss: 250 });
    expect(solo).toBeLessThan(2); // weit weg von ×32
    expect(solo).toBeGreaterThan(1); // aber nicht wirkungslos
  });

  it('wächst monoton mit jedem Level, das irgendwo dazukommt', () => {
    let prev = crewMilestoneMult({});
    for (const lv of [1, 24, 25, 49, 50, 99, 100, 199, 200, 249, 250, 400]) {
      const cur = crewMilestoneMult(all(lv));
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it('nennt als nächstes Ziel die erste NICHT vollständig erreichte Schwelle', () => {
    expect(nextCrewMilestone(all(0))).toBe(CREW_MILESTONES[0]);
    expect(nextCrewMilestone(all(25))).toBe(CREW_MILESTONES[1]);
    expect(nextCrewMilestone(all(250))).toBe(null);
    // Ein einziges Mitglied unter der Schwelle hält das Ziel dort fest.
    expect(nextCrewMilestone({ ...all(250), hype: 30 })).toBe(50);
  });

  it('liegt als Faktor auf der Summe — Klick wie Idle sehen dieselbe Zahl', () => {
    const levels = all(25); // Schwelle 25 gerissen ⇒ ×2
    const factor = crewMilestoneMult(levels);
    expect(factor).toBe(2);
    // Idle: die Summe trägt den Faktor …
    let raw = 0;
    for (const cfg of CREW) raw += heroDps(cfg, 25);
    expect(totalRawDps(levels)).toBeCloseTo(raw * factor, 6);
    // … Klick ebenso, aber der nackte Sockel CLICK_BASE bleibt außen vor.
    let rawClick = 0;
    for (const cfg of CREW) rawClick += heroClick(cfg, 25);
    expect(clickDamageRaw(levels)).toBeCloseTo(
      CLICK_BASE + rawClick * factor + CLICK_DPS_SHARE * totalRawDps(levels),
      6,
    );
  });
});
