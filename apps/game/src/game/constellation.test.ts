import { describe, expect, it } from 'vitest';

import {
  type ChState,
  ascendState,
  chestLuck,
  clickDamageOf,
  createChState,
  dpsOf,
  goldMult,
  himmelfahrtState,
  transcendState,
} from './ch-state';
import { CRIT_CHANCE, CRIT_MULT } from './click';
import { MONSTERS_PER_ZONE, spawnFor, tickBoss } from './combat';
import {
  CONSTELLATIONS,
  CONSTELLATION_COSTS,
  CONSTELLATION_FULL,
  CONSTELLATION_FULL_COST,
  CONSTELLATION_LINE_COST,
  CONSTELLATION_NODE_COUNT,
  type ConstellationState,
  DUST_GATE_MIN_ZONE,
  DUST_PER_ACHIEVEMENT,
  DUST_PER_GATE,
  DUST_PER_STAR_MILESTONE,
  SECOND_WIND_KILLS,
  STARWALKER_HOURS,
  WARMUP_S,
  buyNode,
  canBuyNode,
  constellationChestLuckBonus,
  constellationClickMult,
  constellationComboWindowBonus,
  constellationCritChanceBonus,
  constellationCritEvFactor,
  constellationDpsMult,
  constellationGoldMult,
  constellationOfflineBudget,
  constellationOfflineCapBonusS,
  constellationOfflineRateBonus,
  constellationPowerBudget,
  constellationSpend,
  constellationStartGold,
  createConstellation,
  dustEntitlement,
  dustHeld,
  gatesCleared,
  hasWarmupStart,
  nextNode,
  nextNodeCost,
  nodeCost,
  secondWindKills,
  syncDust,
  totalNodes,
  unlockedNodes,
} from './constellation';
import { STAR_MILESTONE } from './stars';

/** Ein Zustand mit `dust` verfügbarem Sternenstaub und leerem Baum. */
function withDust(dust: number): ConstellationState {
  return { ...createConstellation(), earned: dust };
}

/** Eine Linie um `n` Knoten aufbauen (mit genug Staub im Rücken). */
function line(id: string, n: number): ConstellationState {
  let c = withDust(CONSTELLATION_FULL_COST);
  for (let i = 0; i < n; i++) c = buyNode(c, id).constellation;
  return c;
}

describe('constellation — der Katalog', () => {
  it('sind drei Linien à acht Sternen mit eindeutigen Ids', () => {
    expect(CONSTELLATIONS).toHaveLength(3);
    const ids = new Set<string>();
    for (const cfg of CONSTELLATIONS) {
      expect(cfg.nodes).toHaveLength(CONSTELLATION_NODE_COUNT);
      expect(cfg.name.length).toBeGreaterThan(0);
      ids.add(cfg.id);
      for (const n of cfg.nodes) {
        expect(ids.has(n.id)).toBe(false);
        ids.add(n.id);
        expect(n.desc.length).toBeGreaterThan(0);
        // Die Sternposition muss in der Karte liegen (viewBox 0…100 × 0…44).
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x).toBeLessThanOrEqual(100);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeLessThanOrEqual(44);
      }
    }
    // 3 Linien-Ids + 24 Knoten-Ids, alle verschieden.
    expect(ids.size).toBe(3 + 3 * CONSTELLATION_NODE_COUNT);
  });

  it('endet jede Linie in GENAU EINEM Identitäts-Knoten', () => {
    const identity = new Set(['warmup', 'secondWind', 'offlineCap']);
    for (const cfg of CONSTELLATIONS) {
      const kinds = cfg.nodes.map((n) => n.effect.kind);
      // Nur der letzte Knoten ist ein Identitäts-Knoten …
      expect(identity.has(kinds[kinds.length - 1])).toBe(true);
      // … und keiner der sieben davor.
      for (const k of kinds.slice(0, -1)) expect(identity.has(k)).toBe(false);
    }
    // Und jede Identität existiert genau einmal im ganzen Katalog.
    const last = CONSTELLATIONS.map((c) => c.nodes[CONSTELLATION_NODE_COUNT - 1].effect.kind);
    expect(new Set(last).size).toBe(3);
  });

  it('hat eine streng steigende Kostenleiter (70 je Linie, 210 gesamt)', () => {
    expect(CONSTELLATION_COSTS).toHaveLength(CONSTELLATION_NODE_COUNT);
    for (let i = 1; i < CONSTELLATION_COSTS.length; i++) {
      expect(CONSTELLATION_COSTS[i]).toBeGreaterThan(CONSTELLATION_COSTS[i - 1]);
    }
    expect(CONSTELLATION_LINE_COST).toBe(70);
    expect(CONSTELLATION_FULL_COST).toBe(210);
    expect(constellationSpend(CONSTELLATION_FULL.nodes)).toBe(CONSTELLATION_FULL_COST);
    expect(nodeCost(0)).toBe(2); // der erste Stern jeder Linie ist billig …
    expect(nodeCost(CONSTELLATION_NODE_COUNT - 1)).toBe(18); // … der Identitäts-Stern nicht
    expect(nodeCost(CONSTELLATION_NODE_COUNT)).toBeNull();
    expect(nodeCost(-1)).toBeNull();
  });
});

describe('constellation — Sternenstaub (endliche Währung, reiner Highwater)', () => {
  it('zählt Boss-Gates ab Bühne 25 und erst NACH ihrem Fall', () => {
    expect(gatesCleared(1)).toBe(0);
    expect(gatesCleared(DUST_GATE_MIN_ZONE)).toBe(0); // Gate 25 steht noch
    expect(gatesCleared(DUST_GATE_MIN_ZONE + 1)).toBe(1); // Bühne 26 ⇒ Gate 25 fiel
    expect(gatesCleared(30)).toBe(1); // Gate 30 steht noch
    expect(gatesCleared(31)).toBe(2);
    expect(gatesCleared(100)).toBe(15); // Gates 25 … 95
    expect(gatesCleared(200)).toBe(35); // Gates 25 … 195
    // Müll liest als „ganz am Anfang".
    expect(gatesCleared(Number.NaN)).toBe(0);
    expect(gatesCleared(-40)).toBe(0);
  });

  it('rechnet den Anspruch aus den drei Quellen (und nur aus ihnen)', () => {
    expect(dustEntitlement({ stars: 0, achievements: 0, deepestZone: 1 })).toBe(0);
    // Sterne zahlen erst am vollen Meilenstein.
    expect(dustEntitlement({ stars: STAR_MILESTONE - 1, achievements: 0, deepestZone: 1 })).toBe(0);
    expect(dustEntitlement({ stars: STAR_MILESTONE, achievements: 0, deepestZone: 1 })).toBe(
      DUST_PER_STAR_MILESTONE,
    );
    expect(
      dustEntitlement({ stars: 3 * STAR_MILESTONE + 7, achievements: 0, deepestZone: 1 }),
    ).toBe(3 * DUST_PER_STAR_MILESTONE);
    expect(dustEntitlement({ stars: 0, achievements: 9, deepestZone: 1 })).toBe(
      9 * DUST_PER_ACHIEVEMENT,
    );
    expect(dustEntitlement({ stars: 0, achievements: 0, deepestZone: 31 })).toBe(2 * DUST_PER_GATE);
    // Und alles zusammen ist genau die Summe.
    // Bühne 51 ⇒ die Gates 25/30/35/40/45/50 sind gefallen (6 Stück).
    expect(dustEntitlement({ stars: 30, achievements: 4, deepestZone: 51 })).toBe(
      2 * DUST_PER_STAR_MILESTONE + 4 * DUST_PER_ACHIEVEMENT + 6 * DUST_PER_GATE,
    );
  });

  it('hebt den Highwater nur, senkt ihn NIE — und zahlt nie doppelt', () => {
    const src = { stars: 45, achievements: 10, deepestZone: 60 };
    const want = dustEntitlement(src);
    let c = syncDust(createConstellation(), src);
    expect(c.earned).toBe(want);
    // Zweiter, dritter, hundertster Aufruf: derselbe Zustand, dieselbe REFERENZ
    // (die Glue erkennt daran, dass kein Toast fällig ist).
    const again = syncDust(c, src);
    expect(again).toBe(c);
    expect(again.earned).toBe(want);
    // Eine geschrumpfte Quelle (repariertes Save, Himmelfahrt-Reset von
    // `lifetimeMaxZone`) nimmt NICHTS weg.
    c = syncDust(c, { stars: 0, achievements: 0, deepestZone: 1 });
    expect(c.earned).toBe(want);
    // Und eine gewachsene zahlt genau die Differenz.
    c = syncDust(c, { ...src, achievements: 12 });
    expect(c.earned).toBe(want + 2 * DUST_PER_ACHIEVEMENT);
  });

  it('hält `dustHeld` = verdient − ausgegeben und nie negativ', () => {
    expect(dustHeld(createConstellation())).toBe(0);
    expect(dustHeld(withDust(30))).toBe(30);
    expect(dustHeld({ earned: 10, spent: 40, nodes: {} })).toBe(0);
    expect(dustHeld({ earned: Number.NaN, spent: 0, nodes: {} })).toBe(0);
  });
});

describe('constellation — lineare Freischaltung', () => {
  it('gibt immer den NÄCHSTEN Stern der Kette frei, nie einen späteren', () => {
    const id = CONSTELLATIONS[0].id;
    const nodes = CONSTELLATIONS[0].nodes;
    let c = withDust(CONSTELLATION_FULL_COST);
    for (let i = 0; i < CONSTELLATION_NODE_COUNT; i++) {
      expect(nextNode(c, id)?.id).toBe(nodes[i].id);
      expect(nextNodeCost(c, id)).toBe(CONSTELLATION_COSTS[i]);
      const r = buyNode(c, id);
      expect(r.bought).toBe(true);
      expect(r.node?.id).toBe(nodes[i].id);
      c = r.constellation;
      expect(unlockedNodes(c, id)).toBe(i + 1);
    }
    // Voll: kein nächster Stern, kein Kauf mehr.
    expect(nextNode(c, id)).toBeNull();
    expect(nextNodeCost(c, id)).toBeNull();
    expect(canBuyNode(c, id)).toBe(false);
    expect(buyNode(c, id).bought).toBe(false);
  });

  it('kauft nichts ohne Sternenstaub — und bucht die Kosten korrekt ab', () => {
    const id = CONSTELLATIONS[1].id;
    const poor = withDust(CONSTELLATION_COSTS[0] - 1);
    expect(canBuyNode(poor, id)).toBe(false);
    expect(buyNode(poor, id).constellation).toBe(poor); // unverändert, gleiche Referenz

    const c = buyNode(withDust(CONSTELLATION_COSTS[0]), id).constellation;
    expect(c.spent).toBe(CONSTELLATION_COSTS[0]);
    expect(dustHeld(c)).toBe(0);
    // `earned` ist ein Highwater und wird vom Kauf NICHT angefasst.
    expect(c.earned).toBe(CONSTELLATION_COSTS[0]);
    // Der zweite Stern ist teurer und jetzt unbezahlbar.
    expect(canBuyNode(c, id)).toBe(false);
  });

  it('kennt keine unbekannte Linie', () => {
    const c = withDust(500);
    expect(unlockedNodes(c, 'quatsch')).toBe(0);
    expect(nextNode(c, 'quatsch')).toBeNull();
    expect(canBuyNode(c, 'quatsch')).toBe(false);
    expect(buyNode(c, 'quatsch').bought).toBe(false);
  });

  it('deckelt einen hand-editierten Über-Stand auf acht Sterne', () => {
    const crafted: ConstellationState = {
      earned: 1e6,
      spent: 0,
      nodes: { [CONSTELLATIONS[0].id]: 999 },
    };
    expect(unlockedNodes(crafted, CONSTELLATIONS[0].id)).toBe(CONSTELLATION_NODE_COUNT);
    expect(totalNodes(crafted)).toBe(CONSTELLATION_NODE_COUNT);
    expect(nextNode(crafted, CONSTELLATIONS[0].id)).toBeNull();
  });
});

describe('constellation — die Wirkung der Sterne', () => {
  it('ist ohne Baum überall exakt neutral', () => {
    const c = createConstellation();
    expect(constellationClickMult(c)).toBe(1);
    expect(constellationDpsMult(c)).toBe(1);
    expect(constellationGoldMult(c)).toBe(1);
    expect(constellationCritChanceBonus(c)).toBe(0);
    expect(constellationComboWindowBonus(c)).toBe(0);
    expect(constellationOfflineRateBonus(c)).toBe(0);
    expect(constellationChestLuckBonus(c)).toBe(0);
    expect(constellationStartGold(c)).toBe(0);
    expect(constellationOfflineCapBonusS(c)).toBe(0);
    expect(hasWarmupStart(c)).toBe(false);
    expect(secondWindKills(c)).toBe(0);
  });

  it('summiert voll ausgebaut genau die dokumentierten Werte', () => {
    const c = CONSTELLATION_FULL;
    expect(constellationClickMult(c)).toBeCloseTo(1.08, 10); // 4 × +2 %
    expect(constellationDpsMult(c)).toBeCloseTo(1.06, 10); // 3 × +2 %
    expect(constellationGoldMult(c)).toBeCloseTo(1.04, 10); // 2 × +2 %
    expect(constellationCritChanceBonus(c)).toBeCloseTo(0.015, 10); // 3 × +0,5 pp
    expect(constellationComboWindowBonus(c)).toBeCloseTo(0.4, 10); // 2 × +0,2 s
    expect(constellationOfflineRateBonus(c)).toBeCloseTo(0.04, 10); // 2 × +2 pp
    expect(constellationChestLuckBonus(c)).toBeCloseTo(0.06, 10); // 2 × +3 %
    expect(constellationStartGold(c)).toBe(100); // 10 + 30 + 60
    expect(constellationOfflineCapBonusS(c)).toBe(STARWALKER_HOURS * 3600);
  });

  it('zahlt jeden Identitäts-Knoten ERST mit dem achten Stern seiner Linie', () => {
    for (const cfg of CONSTELLATIONS) {
      const seven = line(cfg.id, CONSTELLATION_NODE_COUNT - 1);
      const eight = line(cfg.id, CONSTELLATION_NODE_COUNT);
      const kind = cfg.nodes[CONSTELLATION_NODE_COUNT - 1].effect.kind;
      if (kind === 'warmup') {
        expect(hasWarmupStart(seven)).toBe(false);
        expect(hasWarmupStart(eight)).toBe(true);
      } else if (kind === 'secondWind') {
        expect(secondWindKills(seven)).toBe(0);
        expect(secondWindKills(eight)).toBe(SECOND_WIND_KILLS);
      } else {
        expect(constellationOfflineCapBonusS(seven)).toBe(0);
        expect(constellationOfflineCapBonusS(eight)).toBe(STARWALKER_HOURS * 3600);
      }
    }
    expect(WARMUP_S).toBe(60);
    expect(SECOND_WIND_KILLS).toBeLessThan(MONSTERS_PER_ZONE);
  });

  it('★ Zweiter Wind: der Boss-Rückwurf startet bei 3/10 statt 0/10', () => {
    // Boss-Gate auf Bühne 25, Uhr abgelaufen ⇒ Rückwurf auf Bühne 24.
    const boss = spawnFor(25, MONSTERS_PER_ZONE, 25);
    expect(boss.boss).toBe(true);
    const ohne = tickBoss(boss, 999);
    expect(ohne.failed).toBe(true);
    expect(ohne.state.zone).toBe(24);
    expect(ohne.state.killsThisZone).toBe(0);

    const mit = tickBoss(boss, 999, secondWindKills(CONSTELLATION_FULL));
    expect(mit.failed).toBe(true);
    expect(mit.state.zone).toBe(24);
    expect(mit.state.killsThisZone).toBe(SECOND_WIND_KILLS);
    // Die Frontier bleibt unangetastet — das Gate ist weiter erreichbar.
    expect(mit.state.maxZone).toBe(25);
    // Und ein absurder Aufrufer kann die Welle nie überspringen (kein Gratis-Boss).
    expect(tickBoss(boss, 999, 999).state.killsThisZone).toBe(MONSTERS_PER_ZONE - 1);
    expect(tickBoss(boss, 999, Number.NaN).state.killsThisZone).toBe(0);
  });
});

describe('constellation — das Budget (≤ ×1.5, gerechnet statt behauptet)', () => {
  it('bleibt das Leistungs-Produkt des vollen Ausbaus unter ×1.5', () => {
    const b = constellationPowerBudget();
    expect(b).toBeLessThanOrEqual(1.5);
    // Die Rechnung Faktor für Faktor: 1.08 × 1.06 × 1.04 × Krit-EV × 1.06.
    const evBase = 1 + CRIT_CHANCE * (CRIT_MULT - 1);
    const evFull = 1 + (CRIT_CHANCE + 0.015) * (CRIT_MULT - 1);
    expect(constellationCritEvFactor(CONSTELLATION_FULL)).toBeCloseTo(evFull / evBase, 10);
    expect(b).toBeCloseTo(1.08 * 1.06 * 1.04 * (evFull / evBase) * 1.06, 10);
    expect(b).toBeCloseTo(1.3041, 3);
    // Ein leerer Baum ist exakt neutral.
    expect(constellationPowerBudget(createConstellation())).toBe(1);
  });

  it('bleibt auch das Offline-Budget unter ×1.5', () => {
    const b = constellationOfflineBudget();
    expect(b).toBeLessThanOrEqual(1.5);
    // Rate (0.50 → 0.54) × Cap (8 h → 10 h).
    expect(b).toBeCloseTo((0.54 / 0.5) * (10 / 8), 10);
    expect(constellationOfflineBudget(createConstellation())).toBe(1);
  });

  it('deckt das Budget JEDEN multiplikativen Knoten ab (keine stille Erweiterung)', () => {
    // Wer einen neuen Effekt-Typ erfindet, muss hier vorbeikommen: die Liste ist
    // die vollständige Aufzählung dessen, was der Katalog tun DARF.
    const kinds = new Set(CONSTELLATIONS.flatMap((c) => c.nodes.map((n) => n.effect.kind)));
    expect([...kinds].sort()).toEqual([
      'click',
      'combo',
      'crit',
      'dps',
      'gold',
      'luck',
      'offlineCap',
      'offlineRate',
      'secondWind',
      'startGold',
      'warmup',
    ]);
  });
});

describe('constellation — Wipe-Immunität durch ALLE drei Prestige-Schichten', () => {
  const seeded = (): ChState => ({
    ...createChState(),
    zone: 60,
    runMaxZone: 60,
    lifetimeMaxZone: 60,
    souls: 900,
    rsLifetime: 4_000_000,
    heaven: { hpf: 40, hpfLifetime: 200, ascensions2: 3, tree: {} },
    constellation: { earned: 140, spent: 70, nodes: { aufbruch: 8, tempo: 3 } },
  });

  it('überlebt Aszension, Himmelfahrt UND Transzendenz unverändert', () => {
    const before = seeded().constellation;
    for (const reset of [ascendState, himmelfahrtState, transcendState]) {
      const after = reset(seeded()).constellation;
      expect(after).toEqual(before);
    }
  });

  it('überlebt auch die KETTE aller drei Resets hintereinander', () => {
    let s = seeded();
    s = ascendState(s);
    s = himmelfahrtState(s);
    s = transcendState(s);
    // Der tiefste Reset des Spiels hat HPF, Baum, Seelen und Ahnen kassiert …
    expect(s.heaven.hpf).toBe(0);
    expect(s.souls).toBe(0);
    // … die Konstellation steht unverändert.
    expect(s.constellation).toEqual(seeded().constellation);
  });
});

describe('constellation — die Getter hängen in echten Rechenpfaden', () => {
  const base: ChState = { ...createChState(), crew: { boss: 40, hype: 20 }, souls: 50 };
  const full: ChState = { ...base, constellation: CONSTELLATION_FULL };

  it('hebt `clickDamageOf` um genau den Klick-Faktor', () => {
    expect(clickDamageOf(full) / clickDamageOf(base)).toBeCloseTo(1.08, 10);
  });

  it('hebt `dpsOf` um genau den Crew-Faktor (nie den Klick-Faktor — P1)', () => {
    expect(dpsOf(full) / dpsOf(base)).toBeCloseTo(1.06, 10);
  });

  it('hebt `goldMult` und `chestLuck`', () => {
    expect(goldMult(full) / goldMult(base)).toBeCloseTo(1.04, 10);
    expect(chestLuck(full) - chestLuck(base)).toBeCloseTo(0.06, 10);
  });
});
