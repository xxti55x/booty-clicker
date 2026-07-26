import { describe, expect, it } from 'vitest';

import {
  MYTHOS_BOSS_CUT,
  MYTHOS_FRUHSTART_LEVEL,
  MYTHOS_FRUHSTART_SLOTS,
  MYTHOS_NODES,
  MYTHOS_OFFLINE_CAP_H,
  MYTHOS_PEACH_RATE,
  TRANSCEND_GLOBAL_BASE,
  TRANSCEND_MIN_HPF_LIFETIME,
  bankTranscendence,
  bossBreakerDmgMult,
  buyMythosNode,
  canBuyMythos,
  canTranscend,
  createTranscend,
  fruhstartCrew,
  mythosNodeConfig,
  mythosOfflineCapBonusS,
  mythosOwned,
  mythosPeachGapMult,
  mythosSpent,
  teForHpfLifetime,
  teSpent,
  transcendGain,
  transcendGlobalMult,
} from './transcend';

describe('transcend — TE earn formula (§4.5.3, gate 100 HPF lifetime)', () => {
  it('grants no TE below the 100-HPF-lifetime gate', () => {
    expect(TRANSCEND_MIN_HPF_LIFETIME).toBe(100);
    expect(teForHpfLifetime(0)).toBe(0);
    expect(teForHpfLifetime(99)).toBe(0);
    expect(teForHpfLifetime(TRANSCEND_MIN_HPF_LIFETIME - 1)).toBe(0);
    // Defensive: negative / non-finite input ⇒ 0 (never NaN, never Infinity).
    expect(teForHpfLifetime(-5)).toBe(0);
    expect(teForHpfLifetime(Number.NaN)).toBe(0);
    expect(teForHpfLifetime(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('the first Transzendenz at the gate banks ⌊log10(100)⌋ = 2 TE (a ×9 boot)', () => {
    expect(teForHpfLifetime(100)).toBe(2);
    expect(transcendGlobalMult(teForHpfLifetime(100))).toBe(9);
  });

  it('adds exactly +1 TE per order of magnitude of lifetime HPF', () => {
    expect(teForHpfLifetime(100)).toBe(2); // 1e2
    expect(teForHpfLifetime(999)).toBe(2); // still 1e2 magnitude
    expect(teForHpfLifetime(1_000)).toBe(3); // 1e3
    expect(teForHpfLifetime(10_000)).toBe(4); // 1e4
    expect(teForHpfLifetime(100_000)).toBe(5); // 1e5
  });

  it('is monotone non-decreasing across the gate and beyond', () => {
    let prev = -1;
    for (const hpf of [0, 50, 99, 100, 250, 999, 1_000, 5_000, 10_000, 1_000_000]) {
      const te = teForHpfLifetime(hpf);
      expect(te).toBeGreaterThanOrEqual(prev);
      prev = te;
    }
  });
});

describe('transcend — ×3^TE global power multiplier', () => {
  it('is 3^te (spec §4.5.3)', () => {
    expect(TRANSCEND_GLOBAL_BASE).toBe(3);
    expect(transcendGlobalMult(0)).toBe(1);
    expect(transcendGlobalMult(1)).toBe(3);
    expect(transcendGlobalMult(2)).toBe(9);
    expect(transcendGlobalMult(3)).toBe(27);
  });

  it('guards negative / non-finite TE to ×1', () => {
    expect(transcendGlobalMult(-4)).toBe(1);
    expect(transcendGlobalMult(Number.NaN)).toBe(1);
    expect(transcendGlobalMult(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

// The key P1 property (spec §4.8, E4 „aktiv bleibt König"): a *global* multiplier
// scales click power and idle DPS by the SAME factor, so it leaves the click:idle
// ratio unchanged and can never let idle out-scale active clicking.
describe('transcend — P1-neutrality (global scales click and idle identically)', () => {
  it('applies the identical factor to click and idle, preserving their ratio', () => {
    const clickBase = 1234.5;
    const idleBase = 6789.0;
    for (const te of [0, 1, 2, 5]) {
      const mult = transcendGlobalMult(te);
      const clickAfter = clickBase * mult;
      const idleAfter = idleBase * mult;
      // Both scaled by exactly the same global factor …
      expect(clickAfter).toBeCloseTo(clickBase * TRANSCEND_GLOBAL_BASE ** te, 6);
      expect(idleAfter).toBeCloseTo(idleBase * TRANSCEND_GLOBAL_BASE ** te, 6);
      // … so the click:idle ratio is invariant (P1-neutral: idle never out-scales click).
      expect(clickAfter / idleAfter).toBeCloseTo(clickBase / idleBase, 9);
    }
  });
});

describe('transcend — held-vs-spent accounting (mirrors souls M10 / HPF)', () => {
  it('createTranscend is a zeroed slice', () => {
    expect(createTranscend()).toEqual({ te: 0, teLifetime: 0, transcendences: 0, mythos: {} });
  });

  it('gates at 100 HPF lifetime and banks the earned TE', () => {
    const t0 = createTranscend();
    expect(canTranscend(t0, 99)).toBe(false);
    expect(canTranscend(t0, 100)).toBe(true);
    expect(transcendGain(t0, 100_000)).toBe(5);

    const t1 = bankTranscendence(t0, 100_000);
    expect(t1.te).toBe(5);
    expect(t1.teLifetime).toBe(5);
    expect(t1.transcendences).toBe(1);
    expect(teSpent(t1)).toBe(0);
  });

  it('only banks NEW TE beyond the lifetime total; spending is preserved', () => {
    const t1 = bankTranscendence(createTranscend(), 100); // te 2, teLifetime 2
    expect(t1.te).toBe(2);
    // Spend 1 TE on a (future, M15) Mythos node — held drops, lifetime does not.
    const spent = { ...t1, te: t1.te - 1, mythos: { ...t1.mythos, diamantBooty: 1 } };
    expect(teSpent(spent)).toBe(1); // teLifetime 2 − held 1
    // A second Transzendenz at the same HPF earns nothing (no new magnitude).
    expect(transcendGain(spent, 100)).toBe(0);
    // Deepen HPF to 1 000 (⌊log10⌋ = 3) ⇒ +1 held, spending stays spent.
    const t2 = bankTranscendence(spent, 1_000);
    expect(t2.teLifetime).toBe(3);
    expect(t2.te).toBe(2); // held 1 + gain 1
    expect(teSpent(t2)).toBe(1); // still spent
    expect(t2.transcendences).toBe(2);
  });

  it('re-transcending without a new magnitude banks nothing extra (no exploit)', () => {
    const t1 = bankTranscendence(createTranscend(), 100_000); // te 5
    const t2 = bankTranscendence(t1, 100_000); // same HPF ⇒ no gain
    expect(t2.te).toBe(t1.te);
    expect(t2.teLifetime).toBe(t1.teLifetime);
    expect(t2.transcendences).toBe(t1.transcendences + 1);
  });

  it('never shrinks the earned highwater or double-grants', () => {
    // A teLifetime already above the formula value (e.g. a steeper prior tuning).
    const inflated = { ...createTranscend(), te: 10, teLifetime: 10 };
    const after = bankTranscendence(inflated, 100); // formula ⇒ 2, below 10
    expect(after.te).toBe(10); // no gain, held preserved
    expect(after.teLifetime).toBe(10); // highwater never shrinks
  });
});

// ---- Mythos-Shop (ROADMAP-V2 P2): der TE-Sink -------------------------------
/** Ein Slice mit `n` gehaltenen TE (lifetime = held, nichts ausgegeben). */
function withTe(n: number): ReturnType<typeof createTranscend> {
  return { ...createTranscend(), te: n, teLifetime: n, transcendences: 1 };
}

describe('transcend — Mythos-Katalog (Kostenkurve gegen die TE-Einkommenskurve)', () => {
  it('hat vier einmalige Wahl-Knoten mit eindeutigen Ids', () => {
    expect(MYTHOS_NODES).toHaveLength(4);
    expect(new Set(MYTHOS_NODES.map((n) => n.id)).size).toBe(4);
    for (const cfg of MYTHOS_NODES) {
      expect(mythosNodeConfig(cfg.id)).toBe(cfg);
      expect(cfg.name.length).toBeGreaterThan(0);
      expect(cfg.desc.length).toBeGreaterThan(0);
    }
    expect(mythosNodeConfig('gibtsnicht')).toBeUndefined();
  });

  it('kostet 1/1/2/2 TE — die erste Transzendenz (2 TE) finanziert genau eine Entscheidung', () => {
    expect(MYTHOS_NODES.map((n) => n.cost)).toEqual([1, 1, 2, 2]);
    // Der Vorrat am Gate: ⌊log10(100)⌋ = 2 TE. Ein 1-TE-Knoten lässt ×3 stehen …
    const atGate = bankTranscendence(createTranscend(), TRANSCEND_MIN_HPF_LIFETIME);
    expect(atGate.te).toBe(2);
    expect(canBuyMythos(atGate, 'fruhstart')).toBe(true);
    expect(transcendGlobalMult(buyMythosNode(atGate, 'fruhstart').transcend.te)).toBe(3);
    // … ein 2-TE-Knoten kostet den kompletten Boost (×1). Beides bezahlbar, beides teuer.
    expect(transcendGlobalMult(buyMythosNode(atGate, 'bossbrecher').transcend.te)).toBe(1);
    // Das ganze Board ist bewusst unerreichbar: 6 TE ⇔ 10^6 Lebenszeit-HPF.
    const board = MYTHOS_NODES.reduce((s, n) => s + n.cost, 0);
    expect(board).toBe(6);
    expect(teForHpfLifetime(1e6)).toBe(board);
  });
});

describe('transcend — Mythos kaufen (permanent, kein Respec)', () => {
  it('bucht Kosten vom gehaltenen TE ab und lässt teLifetime unberührt', () => {
    const t = withTe(3);
    const r = buyMythosNode(t, 'nachtschwarmer'); // 2 TE
    expect(r.bought).toBe(true);
    expect(r.transcend.te).toBe(1);
    expect(r.transcend.teLifetime).toBe(3); // Highwater bleibt — nichts wird zurückerstattet
    expect(r.transcend.mythos).toEqual({ nachtschwarmer: 1 });
    expect(mythosOwned(r.transcend, 'nachtschwarmer')).toBe(true);
    // Das Ausgegebene bleibt über beide Wege konsistent auditierbar.
    expect(teSpent(r.transcend)).toBe(2);
    expect(mythosSpent(r.transcend)).toBe(2);
    expect(t.te).toBe(3); // pure: Eingabe unverändert
  });

  it('verweigert zu teure, doppelte und unbekannte Käufe (no-op, gleiche Referenz)', () => {
    const poor = withTe(1);
    expect(canBuyMythos(poor, 'bossbrecher')).toBe(false); // 2 TE, nur 1 gehalten
    expect(buyMythosNode(poor, 'bossbrecher')).toEqual({ transcend: poor, bought: false });

    const bought = buyMythosNode(withTe(3), 'fruhstart').transcend;
    expect(canBuyMythos(bought, 'fruhstart')).toBe(false); // schon gekauft
    expect(buyMythosNode(bought, 'fruhstart').bought).toBe(false);
    expect(buyMythosNode(bought, 'fruhstart').transcend.te).toBe(2); // kein zweiter Abzug

    expect(canBuyMythos(withTe(9), 'gibtsnicht')).toBe(false);
    expect(buyMythosNode(withTe(9), 'gibtsnicht').bought).toBe(false);
  });

  it('Käufe überleben jede weitere Transzendenz und werden nie zurückerstattet', () => {
    const t1 = bankTranscendence(createTranscend(), 100); // 2 TE
    const spent = buyMythosNode(t1, 'pfirsichmagnet').transcend; // −1 TE
    expect(spent.te).toBe(1);
    // Eine zweite Transzendenz eine Größenordnung tiefer: +1 TE, Knoten bleibt.
    const t2 = bankTranscendence(spent, 1_000);
    expect(t2.te).toBe(2); // gehalten 1 + Gewinn 1 — die ausgegebene TE kommt NICHT zurück
    expect(t2.teLifetime).toBe(3);
    expect(mythosOwned(t2, 'pfirsichmagnet')).toBe(true);
    expect(teSpent(t2)).toBe(1);
  });

  it('liest kaputte Ledger-Werte konservativ als ungekauft', () => {
    const junk = { ...withTe(2), mythos: { fruhstart: 0, bossbrecher: Number.NaN } };
    expect(mythosOwned(junk, 'fruhstart')).toBe(false);
    expect(mythosOwned(junk, 'bossbrecher')).toBe(false);
    expect(mythosOwned(junk, 'nachtschwarmer')).toBe(false); // gar nicht im Ledger
    expect(mythosSpent(junk)).toBe(0);
  });
});

describe('transcend — Mythos-Effekte (ohne Kauf strikt neutral ⇒ Sim sieht sie nie)', () => {
  const none = createTranscend(); // te = 0, nichts gekauft — der Zustand JEDES Sim-Ankers

  it('sind ohne Kauf exakt der Identitäts-Wert', () => {
    expect(bossBreakerDmgMult(none)).toBe(1);
    expect(mythosOfflineCapBonusS(none)).toBe(0);
    expect(mythosPeachGapMult(none)).toBe(1);
    expect(fruhstartCrew({ boss: 3 }, ['boss', 'hype', 'dj'], none)).toEqual({ boss: 3 });
  });

  it('Boss-Brecher: −10 % Boss-Ausdauer als wirkungsgleicher Schadens-Faktor', () => {
    const t = buyMythosNode(withTe(2), 'bossbrecher').transcend;
    expect(MYTHOS_BOSS_CUT).toBe(0.1);
    expect(bossBreakerDmgMult(t)).toBeCloseTo(1 / 0.9, 12);
    // Die Wirkungsgleichheit selbst: 10 000 HP fallen bei 90 % des alten Schadens.
    const hp = 10_000;
    expect(hp / bossBreakerDmgMult(t)).toBeCloseTo(hp * (1 - MYTHOS_BOSS_CUT), 9);
  });

  it('Nachtschwärmer: +4 h Offline-Cap in Sekunden', () => {
    const t = buyMythosNode(withTe(2), 'nachtschwarmer').transcend;
    expect(mythosOfflineCapBonusS(t)).toBe(MYTHOS_OFFLINE_CAP_H * 3600);
    expect(mythosOfflineCapBonusS(t)).toBe(14_400);
  });

  it('Pfirsich-Magnet: +20 % Frequenz ⇔ Pause ×1/1.2', () => {
    const t = buyMythosNode(withTe(1), 'pfirsichmagnet').transcend;
    expect(mythosPeachGapMult(t)).toBeCloseTo(1 / (1 + MYTHOS_PEACH_RATE), 12);
    // Frequenz = 1/Pause: der Kehrwert ist exakt +20 %.
    expect(1 / mythosPeachGapMult(t)).toBeCloseTo(1.2, 12);
  });

  it('Frühstart: hebt die ersten drei Plätze auf Lv 5, senkt aber nie', () => {
    const t = buyMythosNode(withTe(1), 'fruhstart').transcend;
    const ids = ['boss', 'hype', 'dj', 'bouncer'];
    expect(MYTHOS_FRUHSTART_SLOTS).toBe(3);
    expect(MYTHOS_FRUHSTART_LEVEL).toBe(5);
    // Frische Crew nach einem Reset: genau die ersten drei stehen auf 5, der vierte nicht.
    expect(fruhstartCrew({}, ids, t)).toEqual({ boss: 5, hype: 5, dj: 5 });
    // Ein bereits höherer Stand (Himmelsbaum-Frühstarter) wird nicht kassiert.
    expect(fruhstartCrew({ boss: 12, dj: 1, bouncer: 7 }, ids, t)).toEqual({
      boss: 12,
      hype: 5,
      dj: 5,
      bouncer: 7,
    });
    // Kürzere Id-Liste als Slots ⇒ kein Absturz, nur was da ist.
    expect(fruhstartCrew({}, ['boss'], t)).toEqual({ boss: 5 });
  });
});
