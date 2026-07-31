import { describe, expect, it } from 'vitest';

import {
  ABILITY_COST_MULT,
  DPS_TUNE,
  SPECIAL_BEAT_CAP_MS,
  SPECIAL_BOSS,
  SPECIAL_COMBO_CAP_S,
  SPECIAL_CRIT_CHANCE,
  SPECIAL_CRIT_DMG,
  SPECIAL_GOLD,
  SPECIAL_IDLE,
  abilityCost,
  abilityKind,
  abilityKindLabel,
  abilityLevel,
  abilityMult,
  abilityTiersUnlocked,
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
    expect(abilityTiersUnlocked(24)).toBe(0);
    expect(abilityTiersUnlocked(25)).toBe(1);
    expect(abilityTiersUnlocked(74)).toBe(1);
    expect(abilityTiersUnlocked(75)).toBe(2);
    expect(abilityTiersUnlocked(125)).toBe(3);
    expect(abilityTiersUnlocked(1025)).toBe(21);
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
    // A Lv-100 member with nothing bought has NO milestone multiplier any more
    // (DPS_TUNE is the flat idle retune, not level-derived).
    expect(heroDps(hype, 100, 0, 0)).toBe(hype.baseDps * DPS_TUNE * 100);
    expect(heroDps(hype, 100, 0, 2)).toBe(hype.baseDps * DPS_TUNE * 100 * 3); // P P
    expect(heroClick(boss, 100, 0, 3)).toBe(boss.baseDps * 100 * 3); // P S P
  });

  it('abilityKind follows the member rhythm; tier 1 is ALWAYS power (v11.1)', () => {
    expect(abilityKind(hype, 1)).toBe('power');
    expect(abilityKind(hype, 2)).toBe('power'); // Kraft-Rush
    expect(abilityKind(hype, 3)).toBe('combo'); // Hype-Girl keeps the crowd going
    expect(abilityKind(boss, 2)).toBe('critdmg');
    expect(abilityKind(CREW[2], 2)).toBe('beat'); // DJ (Klammer): P S S P
    expect(abilityKind(CREW[2], 4)).toBe('power');
    expect(abilityKind(CREW[2], 5)).toBe('power'); // Zyklus 2 beginnt wieder mit P
    // Every member declares a themed special, starts with power, and every
    // kind label resolves (incl. the v11.1 `idle` Groove kind).
    for (const cfg of CREW) {
      expect(cfg.special).not.toBe('power');
      expect(abilityKind(cfg, 1)).toBe('power');
      expect(abilityKindLabel(cfg.special, 'DPS').length).toBeGreaterThan(3);
    }
    expect(CREW.filter((c) => c.special === 'idle').length).toBe(2); // Produzent + KI-Cluster
  });

  it('crewSpecialBonuses aggregates bought special tiers per theme, with caps', () => {
    const none = crewSpecialBonuses({});
    expect(none.goldMult).toBe(1);
    expect(none.critChance).toBe(0);
    expect(none.bossMult).toBe(1);
    expect(none.idleMult).toBe(1);
    // 4 bought tiers on the Insta-Influencerin (gold, Rhythmus P P S S) = 2 specials.
    const gold = crewSpecialBonuses({ influencer: 4 });
    expect(gold.goldMult).toBeCloseTo(1 + 2 * SPECIAL_GOLD, 9);
    // Türsteher (boss) + Choreograph (crit) + Booty-Boss (critdmg) mix cleanly.
    const mix = crewSpecialBonuses({ bouncer: 2, choreo: 2, boss: 6 });
    expect(mix.bossMult).toBeCloseTo(1 + SPECIAL_BOSS, 9);
    expect(mix.critChance).toBeCloseTo(SPECIAL_CRIT_CHANCE, 9);
    expect(mix.critDmg).toBeCloseTo(3 * SPECIAL_CRIT_DMG, 9);
    // v11.1 `idle` (Groove): Produzent (Rhythmus P S P S) mit 4 Tiers = 2 specials.
    const groove = crewSpecialBonuses({ producer: 4 });
    expect(groove.idleMult).toBeCloseTo(1 + 2 * SPECIAL_IDLE, 9);
    // Window caps: a silly-deep combo/beat stack clamps at the cap.
    const deep = crewSpecialBonuses({ hype: 200, dj: 200 });
    expect(deep.comboWindowS).toBe(SPECIAL_COMBO_CAP_S);
    expect(deep.beatWindowMs).toBe(SPECIAL_BEAT_CAP_MS);
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
    expect(nextAbility(hype, 24, 0).unlocked).toBe(false);
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
    const expected = CLICK_BASE + heroClick(boss, 10) + CLICK_DPS_SHARE * totalRawDps(levels);
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
    expect(totalRawDps(levels, {}, {}, { hype: GOLD })).toBeCloseTo(
      totalRawDps(levels) + soloBonus,
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
      heroClick(boss, 60, 0, 0, GOLD) +
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
    const map = { boss: { '1': 'gold' as const, '3': 'idle' as const } };
    expect(abilityKind(boss, 1, map)).toBe('power');
    expect(abilityKind(boss, 3, map)).toBe('power');
    // Jedes Muster behält seine 2 P + 2 S je Zyklus, egal was die Map behauptet.
    for (const cfg of CREW) {
      const all = { [cfg.id]: { '1': 'gold', '2': 'gold', '3': 'gold', '4': 'gold' } } as never;
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
    expect(stock.idleMult).toBe(1);
    // Zwei davon auf `idle` umgeschult: 1 × critdmg + 2 × idle, Summe unverändert 3.
    const rolled = crewSpecialBonuses({ boss: 6 }, { boss: { '2': 'idle', '6': 'idle' } });
    expect(rolled.critDmg).toBeCloseTo(SPECIAL_CRIT_DMG, 9);
    expect(rolled.idleMult).toBeCloseTo(1 + 2 * SPECIAL_IDLE, 9);
    // Ein Override auf einem NOCH NICHT gekauften Slot zahlt nichts (er ist nicht da).
    const unbought = crewSpecialBonuses({ boss: 2 }, { boss: { '4': 'gold' } });
    expect(unbought.goldMult).toBe(1);
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
    const deep = crewSpecialBonuses(
      { influencer: 200 },
      { influencer: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [i + 1, 'beat'])) },
    );
    expect(deep.beatWindowMs).toBe(SPECIAL_BEAT_CAP_MS);
    expect(deep.goldMult).toBe(1);
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
    expect((withHeir - plain) / (own * (0.06 / 1.06))).toBeCloseTo(1, 5);
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
