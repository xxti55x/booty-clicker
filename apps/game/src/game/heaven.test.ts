import { describe, expect, it } from 'vitest';

import { SOUL_BONUS, soulMult } from './ascension';
import { COMBO_CAP, COMBO_STEP, comboMult } from './click';
import {
  BEAT_GEFUHL_MS,
  COMBO_DOKTRIN_CAP_MULT,
  COMBO_GEDACHTNIS_RED,
  CREW_DOKTRIN_MULT,
  GATE_CRASHER_S,
  GOLDENE_HANDE_PER,
  type HeavenState,
  KLICK_DOKTRIN_MULT,
  PFIRSICH_FOKUS_RATE,
  PFIRSICH_REIFE_MS,
  PRAEZISIONS_SHAKE_MULT,
  RESPEC_FEE,
  SCHWERER_BASS_PER,
  TREE_BRANCHES,
  TREE_NODES,
  TRUHEN_FOKUS_MULT,
  TRUHEN_MAGNET_KEYDROP,
  bankHimmelfahrt,
  beatGefuhlWindowMs,
  buyTreeNode,
  canBuyTreeNode,
  canHimmelfahrt,
  canRespec,
  cheapestTreeBuy,
  coachCps,
  coachDps,
  comboGedachtnisReduction,
  comboStepFor,
  createHeaven,
  ekstaseBonusMs,
  ekstaseDoktrinMult,
  fruhstarterFraction,
  gateCrasherTimerBonus,
  goldeneHandeMult,
  greedyTreeSpend,
  heavenClickMult,
  heavenCritMultFactor,
  heavenDpsMult,
  heavenGlobalMult,
  himmelfahrtGain,
  hpfForRsLifetime,
  offlineCapS,
  pfirsichFokusGapMult,
  pfirsichReifeBonusMs,
  respecTree,
  soulBonusEff,
  treeLevel,
  treeNodeBlockedBy,
  treeNodeConfig,
  treeNodeCost,
  treeNodeMaxLevel,
  treeNodesOfBranch,
  treeRefund,
  truhenFokusChestMult,
  truhenMagnetBonus,
} from './heaven';

/** Ein Himmel mit vollem Konto — die Basis fast aller P4-Tests. */
const rich = (hpf = 500, tree: Record<string, number> = {}): HeavenState => ({
  ...createHeaven(),
  hpf,
  hpfLifetime: 500,
  tree,
});

describe('heaven — HPF formula (§4.5.2, M10-AC3)', () => {
  it('HPF = ⌊√(RS_lifetime / 1000)⌋', () => {
    expect(hpfForRsLifetime(0)).toBe(0);
    expect(hpfForRsLifetime(999)).toBe(0); // below the first-Himmelfahrt gate
    expect(hpfForRsLifetime(1000)).toBe(1); // first Himmelfahrt at 1 000 RS
    expect(hpfForRsLifetime(100_000)).toBe(10);
    expect(hpfForRsLifetime(1_000_000)).toBe(31);
  });
});

describe('heaven — double effect (compounding, not additive)', () => {
  it('global damage is +2 % per held HPF', () => {
    expect(heavenGlobalMult(0)).toBe(1);
    expect(heavenGlobalMult(10)).toBeCloseTo(1.2, 6);
  });

  it('soul amplifier raises the per-soul bonus: 0.10 + 0.002·HPF', () => {
    expect(soulBonusEff(0)).toBeCloseTo(SOUL_BONUS, 6);
    expect(soulBonusEff(50)).toBeCloseTo(0.2, 6); // 0.10 + 0.002·50
  });

  it('L1 (souls) and L2 (HPF) MULTIPLY the soul bonus, not add', () => {
    const souls = 100;
    const hpf = 50;
    // With the amplifier a soul is worth 0.20, not 0.10 — the effect compounds.
    const base = soulMult(souls, SOUL_BONUS); // 1 + 0.10·100 = 11
    const amplified = soulMult(souls, soulBonusEff(hpf)); // 1 + 0.20·100 = 21
    expect(amplified).toBeGreaterThan(base);
    expect(amplified).toBeCloseTo(21, 6);
  });
});

describe('heaven — Himmelfahrt banking (held-balance model)', () => {
  it('gates at 1 000 RS lifetime and banks the earned HPF', () => {
    const h0 = createHeaven();
    expect(canHimmelfahrt(h0, 999)).toBe(false);
    expect(canHimmelfahrt(h0, 1000)).toBe(true);
    expect(himmelfahrtGain(h0, 1_000_000)).toBe(31);

    const h1 = bankHimmelfahrt(h0, 1_000_000);
    expect(h1.hpf).toBe(31);
    expect(h1.hpfLifetime).toBe(31);
    expect(h1.ascensions2).toBe(1);
  });

  it('only banks NEW HPF beyond the lifetime total; spending is preserved', () => {
    const h1 = bankHimmelfahrt(createHeaven(), 1_000_000); // hpf 31
    const spent = buyTreeNode(h1, 'nachtschicht').heaven; // −10 ⇒ hpf 21
    expect(spent.hpf).toBe(21);
    // A second Himmelfahrt at the same RS earns nothing (no new lifetime HPF).
    expect(himmelfahrtGain(spent, 1_000_000)).toBe(0);
    // Deepen RS to 4e6 (√4000 ≈ 63) ⇒ +32 held, spending stays spent.
    const h2 = bankHimmelfahrt(spent, 4_000_000);
    expect(h2.hpfLifetime).toBe(hpfForRsLifetime(4_000_000));
    expect(h2.hpf).toBe(21 + (hpfForRsLifetime(4_000_000) - 31));
  });
});

describe('heaven — Himmelsbaum (spent HPF, permanent)', () => {
  it('buys node levels, spends HPF, enforces cost + max level', () => {
    const h = { ...createHeaven(), hpf: 60, hpfLifetime: 60 };
    const c1 = buyTreeNode(h, 'coach'); // costs 5
    expect(c1.bought).toBe(true);
    expect(c1.heaven.hpf).toBe(55);
    expect(treeLevel(c1.heaven, 'coach')).toBe(1);
    // Can't afford a node beyond held HPF.
    const broke = buyTreeNode({ ...createHeaven(), hpf: 4, hpfLifetime: 60 }, 'coach');
    expect(broke.bought).toBe(false);
  });

  it('coach cps 1→4, offline cap 8→16→24 h, Frühstarter 10 %, Ekstase +3 s', () => {
    const coach4 = { ...createHeaven(), tree: { coach: 4 } };
    expect(coachCps(coach4)).toBe(4);
    expect(offlineCapS({ ...createHeaven(), tree: { nachtschicht: 0 } })).toBe(8 * 3600);
    expect(offlineCapS({ ...createHeaven(), tree: { nachtschicht: 1 } })).toBe(16 * 3600);
    expect(offlineCapS({ ...createHeaven(), tree: { nachtschicht: 2 } })).toBe(24 * 3600);
    expect(fruhstarterFraction({ ...createHeaven(), tree: { fruhstarter: 1 } })).toBeCloseTo(
      0.1,
      6,
    );
    expect(ekstaseBonusMs({ ...createHeaven(), tree: { ekstaseausdauer: 3 } })).toBe(9000);
  });
});

// M12 (§4.5.2/§6.1): the Truhen-Magnet Himmelsbaum node lands as a 15-HPF, +25 %
// key-drop node — data present, buyable, effect exposed via `truhenMagnetBonus`.
describe('heaven — Truhen-Magnet (§4.5.2/§6.1)', () => {
  it('is a single-level 15-HPF node in the catalog', () => {
    const node = TREE_NODES.find((n) => n.id === 'truhenmagnet');
    expect(node).toBeDefined();
    expect(node!.costs).toEqual([15]);
    expect(treeNodeCost('truhenmagnet', 0)).toBe(15);
    expect(treeNodeCost('truhenmagnet', 1)).toBeNull(); // capped at one level
  });

  it('grants +25 % key drops once bought (0 when unbought)', () => {
    expect(truhenMagnetBonus(createHeaven())).toBe(0);
    const h = { ...createHeaven(), hpf: 20, hpfLifetime: 20 };
    expect(canBuyTreeNode(h, 'truhenmagnet')).toBe(true);
    const bought = buyTreeNode(h, 'truhenmagnet');
    expect(bought.bought).toBe(true);
    expect(bought.heaven.hpf).toBe(5); // 20 − 15
    expect(treeLevel(bought.heaven, 'truhenmagnet')).toBe(1);
    expect(truhenMagnetBonus(bought.heaven)).toBeCloseTo(TRUHEN_MAGNET_KEYDROP, 6);
    expect(TRUHEN_MAGNET_KEYDROP).toBe(0.25);
  });
});

// M10-AC5 (pure half): a Twerk-Coach clicks at 25 % of the click value.
describe('heaven — Twerk-Coach damage (§4.3.5)', () => {
  it('a coach deals cps · 25 % · clickDamage per second (no crit/beat)', () => {
    expect(coachDps(1000, 1)).toBe(250); // 1 cps × 25 % × 1000
    expect(coachDps(1000, 4)).toBe(1000); // 4 cps
    expect(coachDps(1000, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ROADMAP-V2 P4 — Himmelsbaum-Ausbau: drei Äste, Exklusiv-Paare, Respec
// ---------------------------------------------------------------------------

describe('heaven P4 — die Ast-Struktur', () => {
  it('hat genau drei Äste mit je vier normalen Knoten + einem Exklusiv-Paar', () => {
    expect(TREE_BRANCHES.map((b) => b.id)).toEqual(['eco', 'kampf', 'ritual']);
    for (const branch of TREE_BRANCHES) {
      const nodes = treeNodesOfBranch(branch.id);
      const pair = nodes.filter((n) => n.exclusiveWith !== undefined);
      expect(nodes.filter((n) => n.exclusiveWith === undefined)).toHaveLength(4);
      expect(pair).toHaveLength(2);
      // Das Paar zeigt gegenseitig aufeinander (keine halb verdrahtete Exklusivität).
      expect(pair[0].exclusiveWith).toBe(pair[1].id);
      expect(pair[1].exclusiveWith).toBe(pair[0].id);
      expect(branch.name.length).toBeGreaterThan(0);
      expect(branch.icon.length).toBeGreaterThan(0);
    }
    expect(TREE_NODES).toHaveLength(18);
  });

  it('ordnet jeden Knoten genau einem echten Ast zu, Ids sind eindeutig', () => {
    const ids = new Set<string>();
    const branchIds = new Set(TREE_BRANCHES.map((b) => b.id));
    for (const n of TREE_NODES) {
      expect(ids.has(n.id)).toBe(false);
      ids.add(n.id);
      expect(branchIds.has(n.branch)).toBe(true);
      expect(n.costs.length).toBeGreaterThan(0);
      // Kostenkurve steigt streng (keine Stufe ist billiger als die vorherige).
      for (let i = 1; i < n.costs.length; i++) expect(n.costs[i]).toBeGreaterThan(n.costs[i - 1]);
    }
    // Die fünf Grundknoten aus M10–M12 leben unverändert weiter (Alt-Saves!).
    for (const id of ['coach', 'fruhstarter', 'nachtschicht', 'ekstaseausdauer', 'truhenmagnet']) {
      expect(treeNodeConfig(id)).toBeDefined();
    }
    expect(treeNodeConfig('coach')!.costs).toEqual([5, 15, 40, 100]);
    expect(treeNodeConfig('nachtschicht')!.costs).toEqual([10, 25]);
    expect(treeNodeConfig('ekstaseausdauer')!.costs).toEqual([12, 30, 75]);
    expect(treeNodeConfig('fruhstarter')!.costs).toEqual([8]);
    expect(treeNodeConfig('truhenmagnet')!.costs).toEqual([15]);
  });

  it('preist jeden Exklusiv-Knoten teurer als jeden normalen Einzel-Knoten', () => {
    const excl = TREE_NODES.filter((n) => n.exclusiveWith !== undefined);
    const single = TREE_NODES.filter((n) => n.exclusiveWith === undefined && n.costs.length === 1);
    const cheapestExcl = Math.min(...excl.map((n) => n.costs[0]));
    const dearestSingle = Math.max(...single.map((n) => n.costs[0]));
    expect(cheapestExcl).toBeGreaterThan(dearestSingle);
    // Alle sechs kosten gleich viel — sonst wäre die Wahl eine Preis-, keine Build-Frage.
    expect(new Set(excl.map((n) => n.costs[0])).size).toBe(1);
  });
});

describe('heaven P4 — Exklusiv-Logik', () => {
  it('sperrt den Partner, sobald einer der beiden gekauft ist', () => {
    const h = rich(200);
    expect(canBuyTreeNode(h, 'klickdoktrin')).toBe(true);
    expect(canBuyTreeNode(h, 'crewdoktrin')).toBe(true);
    expect(treeNodeBlockedBy(h, 'crewdoktrin')).toBeNull();

    const after = buyTreeNode(h, 'klickdoktrin').heaven;
    expect(treeLevel(after, 'klickdoktrin')).toBe(1);
    expect(treeNodeBlockedBy(after, 'crewdoktrin')).toBe('klickdoktrin');
    expect(canBuyTreeNode(after, 'crewdoktrin')).toBe(false);
    // …und der Kauf ist auch wirklich ein No-op (nicht nur die Anzeige).
    const blocked = buyTreeNode(after, 'crewdoktrin');
    expect(blocked.bought).toBe(false);
    expect(blocked.heaven).toBe(after);
    expect(blocked.heaven.hpf).toBe(after.hpf);
  });

  it('sperrt nur INNERHALB des Paares — die anderen Äste bleiben offen', () => {
    const h = buyTreeNode(rich(200), 'truhenfokus').heaven;
    expect(canBuyTreeNode(h, 'pfirsichfokus')).toBe(false);
    expect(canBuyTreeNode(h, 'klickdoktrin')).toBe(true);
    expect(canBuyTreeNode(h, 'crewdoktrin')).toBe(true);
    expect(canBuyTreeNode(h, 'ekstasedoktrin')).toBe(true);
    expect(canBuyTreeNode(h, 'combodoktrin')).toBe(true);
  });

  it('lässt in jedem Ast genau eine Doktrin zu (alle drei Paare)', () => {
    for (const branch of TREE_BRANCHES) {
      const [a, b] = treeNodesOfBranch(branch.id).filter((n) => n.exclusiveWith !== undefined);
      const boughtA = buyTreeNode(rich(200), a.id).heaven;
      const boughtB = buyTreeNode(rich(200), b.id).heaven;
      expect(canBuyTreeNode(boughtA, b.id)).toBe(false);
      expect(canBuyTreeNode(boughtB, a.id)).toBe(false);
    }
  });
});

describe('heaven P4 — Respec', () => {
  it('erstattet exakt die Summe aller bezahlten Stufen minus Gebühr', () => {
    let h = rich(500);
    for (const id of ['coach', 'coach', 'coach', 'nachtschicht', 'crewdoktrin']) {
      h = buyTreeNode(h, id).heaven;
    }
    const spent = 5 + 15 + 40 + 10 + 35;
    expect(treeRefund(h)).toBe(spent);
    expect(h.hpf).toBe(500 - spent);

    const r = respecTree(h);
    expect(r.done).toBe(true);
    expect(r.refunded).toBe(spent);
    expect(r.fee).toBe(RESPEC_FEE);
    expect(r.heaven.hpf).toBe(500 - RESPEC_FEE);
    expect(r.heaven.tree).toEqual({});
    // Lebenszeit + Zähler bleiben unangetastet (der Respec ist kein Prestige).
    expect(r.heaven.hpfLifetime).toBe(h.hpfLifetime);
    expect(r.heaven.ascensions2).toBe(h.ascensions2);
  });

  it('macht die Doktrin-Wahl umkehrbar — danach ist die andere Seite wieder offen', () => {
    const chosen = buyTreeNode(rich(200), 'ekstasedoktrin').heaven;
    expect(canBuyTreeNode(chosen, 'combodoktrin')).toBe(false);
    const after = respecTree(chosen).heaven;
    expect(treeLevel(after, 'ekstasedoktrin')).toBe(0);
    expect(canBuyTreeNode(after, 'combodoktrin')).toBe(true);
    expect(canBuyTreeNode(after, 'ekstasedoktrin')).toBe(true);
  });

  it('ist ein No-op ohne gekaufte Knoten (nichts zu erstatten, keine Gebühr)', () => {
    const h = rich(40);
    expect(canRespec(h)).toBe(false);
    const r = respecTree(h);
    expect(r.done).toBe(false);
    expect(r.refunded).toBe(0);
    expect(r.fee).toBe(0);
    expect(r.heaven).toBe(h);
  });

  it('hält „gehalten ≤ jemals verdient" auch bei einem frisierten Baum', () => {
    // Behauptet vier Coach-Stufen (160 HPF), obwohl lifetime nur 20 HPF kennt.
    const crafted: HeavenState = { hpf: 0, hpfLifetime: 20, ascensions2: 1, tree: { coach: 4 } };
    const r = respecTree(crafted);
    expect(r.done).toBe(true);
    expect(r.heaven.hpf).toBe(20); // gedeckelt, nicht 159
    expect(r.heaven.tree).toEqual({});
  });

  it('räumt unbekannte Baum-Ids mit weg und erstattet für sie nichts', () => {
    const h: HeavenState = {
      hpf: 3,
      hpfLifetime: 100,
      ascensions2: 2,
      tree: { coach: 1, ausZukunft: 3 },
    };
    expect(treeRefund(h)).toBe(5); // nur die eine echte Coach-Stufe
    const r = respecTree(h);
    expect(r.refunded).toBe(5);
    expect(r.heaven.hpf).toBe(3 + 5 - RESPEC_FEE);
    expect(r.heaven.tree).toEqual({});
  });
});

describe('heaven P4 — unbekannte Baum-Ids aus einem neueren Build', () => {
  it('sind wirkungslos: Max-Level 0 ⇒ treeLevel 0 ⇒ kein Effekt, kein Kauf', () => {
    const h: HeavenState = {
      hpf: 50,
      hpfLifetime: 50,
      ascensions2: 1,
      tree: { zukunftsknoten: 7 },
    };
    expect(treeNodeMaxLevel('zukunftsknoten')).toBe(0);
    expect(treeLevel(h, 'zukunftsknoten')).toBe(0);
    expect(treeNodeCost('zukunftsknoten', 0)).toBeNull();
    expect(canBuyTreeNode(h, 'zukunftsknoten')).toBe(false);
    expect(buyTreeNode(h, 'zukunftsknoten').bought).toBe(false);
    // Und sie färben auf keinen einzigen echten Effekt ab.
    expect(heavenDpsMult(h)).toBe(1);
    expect(heavenClickMult(h)).toBe(1);
    expect(goldeneHandeMult(h)).toBe(1);
  });

  it('deckelt auch eine frisierte Stufe auf das Maximum des Knotens', () => {
    const h: HeavenState = { hpf: 0, hpfLifetime: 9, ascensions2: 1, tree: { coach: 999 } };
    expect(treeLevel(h, 'coach')).toBe(4);
    expect(coachCps(h)).toBe(4); // nicht 999
  });
});

describe('heaven P4 — jeder neue Knoten hat einen echten Effekt', () => {
  it('💰 Goldene Hände: +10 % BP je Stufe', () => {
    expect(goldeneHandeMult(createHeaven())).toBe(1);
    expect(goldeneHandeMult(rich(0, { goldenehande: 2 }))).toBeCloseTo(
      1 + 2 * GOLDENE_HANDE_PER,
      6,
    );
    expect(goldeneHandeMult(rich(0, { goldenehande: 3 }))).toBeCloseTo(1.3, 6);
  });

  it('💰 Pfirsich-Reife: +15 s Boost-Dauer', () => {
    expect(pfirsichReifeBonusMs(createHeaven())).toBe(0);
    expect(pfirsichReifeBonusMs(rich(0, { pfirsichreife: 1 }))).toBe(PFIRSICH_REIFE_MS);
  });

  it('💰 EXKL Truhen-Fokus / Pfirsich-Fokus', () => {
    expect(truhenFokusChestMult(createHeaven())).toBe(1);
    expect(truhenFokusChestMult(rich(0, { truhenfokus: 1 }))).toBe(TRUHEN_FOKUS_MULT);
    expect(pfirsichFokusGapMult(createHeaven())).toBe(1);
    // +35 % Frequenz ⇔ Pause ×1/1.35
    expect(pfirsichFokusGapMult(rich(0, { pfirsichfokus: 1 }))).toBeCloseTo(
      1 / (1 + PFIRSICH_FOKUS_RATE),
      6,
    );
  });

  it('⚔️ Schwerer Bass × Crew-Doktrin heben NUR die Idle-Seite', () => {
    expect(heavenDpsMult(createHeaven())).toBe(1);
    expect(heavenDpsMult(rich(0, { schwererbass: 3 }))).toBeCloseTo(1 + 3 * SCHWERER_BASS_PER, 6);
    expect(heavenDpsMult(rich(0, { crewdoktrin: 1 }))).toBeCloseTo(CREW_DOKTRIN_MULT, 6);
    expect(heavenDpsMult(rich(0, { schwererbass: 3, crewdoktrin: 1 }))).toBeCloseTo(1.24 * 1.25, 6);
    // …und lassen den Klick-Term in Ruhe (P1-Trennung).
    expect(heavenClickMult(rich(0, { schwererbass: 3, crewdoktrin: 1 }))).toBe(1);
  });

  it('⚔️ Klick-Doktrin hebt NUR den Klick-Term', () => {
    expect(heavenClickMult(createHeaven())).toBe(1);
    expect(heavenClickMult(rich(0, { klickdoktrin: 1 }))).toBe(KLICK_DOKTRIN_MULT);
    expect(heavenDpsMult(rich(0, { klickdoktrin: 1 }))).toBe(1);
  });

  it('⚔️ Präzisions-Shake + Gate-Crasher', () => {
    expect(heavenCritMultFactor(createHeaven())).toBe(1);
    expect(heavenCritMultFactor(rich(0, { praezisionsshake: 1 }))).toBe(PRAEZISIONS_SHAKE_MULT);
    expect(gateCrasherTimerBonus(createHeaven())).toBe(0);
    expect(gateCrasherTimerBonus(rich(0, { gatecrasher: 1 }))).toBe(GATE_CRASHER_S);
  });

  it('🕺 Beat-Gefühl + Combo-Gedächtnis', () => {
    expect(beatGefuhlWindowMs(createHeaven())).toBe(0);
    expect(beatGefuhlWindowMs(rich(0, { beatgefuhl: 1 }))).toBe(BEAT_GEFUHL_MS);
    expect(comboGedachtnisReduction(createHeaven())).toBe(0);
    expect(comboGedachtnisReduction(rich(0, { combogedachtnis: 1 }))).toBe(COMBO_GEDACHTNIS_RED);
  });

  it('🕺 EXKL Ekstase-Doktrin (×12 statt ×10) / Combo-Doktrin (Cap ×1.3 statt ×1.2)', () => {
    expect(ekstaseDoktrinMult(createHeaven(), 10)).toBe(10);
    expect(ekstaseDoktrinMult(rich(0, { ekstasedoktrin: 1 }), 10)).toBe(12);
    expect(comboStepFor(createHeaven())).toBe(COMBO_STEP);
    expect(comboMult(COMBO_CAP, comboStepFor(createHeaven()))).toBeCloseTo(1.2, 6);
    expect(comboMult(COMBO_CAP, comboStepFor(rich(0, { combodoktrin: 1 })))).toBeCloseTo(
      COMBO_DOKTRIN_CAP_MULT,
      6,
    );
  });
});

describe('heaven P4 — greedy (die Sim-Strategie, pur getestet)', () => {
  const ALL = TREE_NODES.map((n) => n.id);

  it('cheapestTreeBuy nimmt die billigste kaufbare Stufe und respektiert Sperren', () => {
    expect(cheapestTreeBuy(rich(4), ALL)).toBeNull(); // 4 HPF: nichts ist bezahlbar
    expect(cheapestTreeBuy(rich(5), ALL)).toBe('coach'); // 5 HPF: nur der Coach
    const chosen = buyTreeNode(rich(500), 'crewdoktrin').heaven;
    // Der gesperrte Partner taucht in der Auswahl NIE auf, egal wie weit vorn er steht.
    expect(cheapestTreeBuy(chosen, ['klickdoktrin'])).toBeNull();
  });

  it('bricht Preis-Gleichstände deterministisch über die Reihenfolge der Liste', () => {
    const h = rich(35);
    expect(cheapestTreeBuy(h, ['crewdoktrin', 'klickdoktrin'])).toBe('crewdoktrin');
    expect(cheapestTreeBuy(h, ['klickdoktrin', 'crewdoktrin'])).toBe('klickdoktrin');
  });

  it('greedyTreeSpend kauft aufsteigend, bleibt zahlungsfähig und wählt EINE Doktrin', () => {
    const before = rich(120);
    const after = greedyTreeSpend(before, ['crewdoktrin', 'klickdoktrin', 'coach', 'goldenehande']);
    expect(after.hpf).toBeGreaterThanOrEqual(0);
    // Genau eine Seite des Paares steht im Baum.
    expect(treeLevel(after, 'crewdoktrin') > 0).toBe(true);
    expect(treeLevel(after, 'klickdoktrin')).toBe(0);
    // Ausgegeben wurde exakt, was der Baum ausweist.
    expect(before.hpf - after.hpf).toBe(treeRefund(after));
    // Deterministisch: derselbe Ausgangszustand ⇒ derselbe Baum.
    expect(
      greedyTreeSpend(before, ['crewdoktrin', 'klickdoktrin', 'coach', 'goldenehande']),
    ).toEqual(after);
  });

  it('kauft nichts, wenn der Bestand nicht einmal für den billigsten Knoten reicht', () => {
    const poor = { ...createHeaven(), hpf: 1, hpfLifetime: 1 };
    expect(greedyTreeSpend(poor, ALL)).toBe(poor);
  });
});
