import { describe, expect, it } from 'vitest';

import {
  ADVISOR_CLICKS_PER_SEC,
  ADVISOR_COMBO_MULT,
  ADVISOR_CRIT_EV,
  HINT_BUDGET_REACH,
  HINT_GAP_MAX,
  bestPurchaseHint,
  bossGap,
  burstEstimate,
  purchaseSignature,
} from './advisor';
import { type ChState, createChState } from './ch-state';
import { COMBO_CAP, comboMult } from './click';
import { BOSS_TIME_S, bossHp } from './combat';
import { CREW, type CrewLevels, heroClick, heroDps, nextAbility, nextLevelCost } from './heroes';
import { bossBreakerDmgMult } from './transcend';

/** Ein Zustand mit den Feldern, die Burst und Tipp lesen. */
function stateWith(over: Partial<ChState> = {}): ChState {
  return { ...createChState(), ...over };
}

describe('advisor — burstEstimate (P3)', () => {
  it('rechnet Idle + Klick-Strom über das 30-s-Fenster mit den dokumentierten Annahmen', () => {
    const s = stateWith();
    const dps = 100;
    const click = 40;
    const expected =
      dps * BOSS_TIME_S +
      ADVISOR_CLICKS_PER_SEC * BOSS_TIME_S * click * ADVISOR_COMBO_MULT * ADVISOR_CRIT_EV;
    expect(burstEstimate(s, dps, click)).toBeCloseTo(expected, 6);
    // Die Annahmen selbst: 5 Klicks/s, Combo-Mittel = halbe Strecke zum Cap, Krit-EV ×1.8.
    expect(ADVISOR_CLICKS_PER_SEC).toBe(5);
    expect(ADVISOR_COMBO_MULT).toBe(comboMult(COMBO_CAP / 2));
    expect(ADVISOR_COMBO_MULT).toBeLessThan(comboMult(COMBO_CAP)); // konservativ unter dem Cap
    expect(ADVISOR_CRIT_EV).toBeCloseTo(1.8, 10);
  });

  it('wächst monoton mit DPS, Klick-Schaden und Fensterlänge', () => {
    const s = stateWith();
    expect(burstEstimate(s, 200, 10)).toBeGreaterThan(burstEstimate(s, 100, 10));
    expect(burstEstimate(s, 100, 20)).toBeGreaterThan(burstEstimate(s, 100, 10));
    expect(burstEstimate(s, 100, 10, 60)).toBeCloseTo(2 * burstEstimate(s, 100, 10, 30), 6);
  });

  it('faltet den Boss-Schadens-Stack (Glutaeus + boss-Specials) ein', () => {
    const plain = stateWith();
    const glut = stateWith({ ancients: { glutaeus: 4 } });
    // bouncer (Rhythmus 0): Stufe 2 ist ein `boss`-Special ⇒ +25 % Boss-Schaden.
    const spec = stateWith({ crew: { bouncer: 80 }, crewUp: { bouncer: 2 } });
    expect(burstEstimate(glut, 100, 10)).toBeGreaterThan(burstEstimate(plain, 100, 10));
    expect(burstEstimate(spec, 100, 10)).toBeCloseTo(burstEstimate(plain, 100, 10) * 1.25, 6);
  });

  // ROADMAP-V2 P2: Spiel-Pfad (`applyHit`) und Telemetrie teilen den Boss-Stack —
  // sonst unterschätzt die Wand-Anzeige den Spieler nach dem Kauf systematisch.
  it('faltet den Mythos-Knoten „Boss-Brecher" ein und rechnet ohne L3-Slice neutral', () => {
    const plain = stateWith();
    const brecher = stateWith({
      transcend: { te: 0, teLifetime: 2, transcendences: 1, mythos: { bossbrecher: 1 } },
    });
    expect(burstEstimate(brecher, 100, 10)).toBeCloseTo(
      burstEstimate(plain, 100, 10) * bossBreakerDmgMult(brecher.transcend),
      6,
    );
    // Die Lücke schließt sich exakt um den Faktor — dieselbe Zahl, die den Boss killt.
    expect(bossGap(brecher, { zone: 25 }, 100, 10)).toBeCloseTo(
      bossGap(plain, { zone: 25 }, 100, 10) / (1 - 0.1),
      9,
    );
    // Ein Aufrufer ganz ohne `transcend` (ältere Fixtures) rechnet unverändert.
    const { ancients, gear, crewUp } = plain;
    expect(burstEstimate({ ancients, gear, crewUp }, 100, 10)).toBe(burstEstimate(plain, 100, 10));
  });

  it('bleibt bei Müll-Eingaben bei 0 statt negativ', () => {
    const s = stateWith();
    expect(burstEstimate(s, -50, -5)).toBe(0);
    expect(burstEstimate(s, 100, 10, -30)).toBe(0);
    expect(burstEstimate(s, 0, 0)).toBe(0);
  });
});

describe('advisor — bossGap (P3)', () => {
  it('ist das Verhältnis Burst zu Boss-Ausdauer', () => {
    const s = stateWith();
    const combat = { zone: 20 };
    expect(bossGap(s, combat, 500, 50)).toBeCloseTo(burstEstimate(s, 500, 50) / bossHp(20), 6);
  });

  it('schließt sich mit mehr Macht und reißt mit der Tiefe auf', () => {
    const s = stateWith();
    const weak = bossGap(s, { zone: 25 }, 100, 10);
    const strong = bossGap(s, { zone: 25 }, 100_000, 10_000);
    expect(strong).toBeGreaterThan(weak);
    // Dieselbe Macht eine Boss-Bühne tiefer: die HP-Kurve (×1.6/Bühne) zieht an.
    expect(bossGap(s, { zone: 30 }, 100, 10)).toBeLessThan(weak);
  });

  it('erkennt die > 20-%-Lücke, die den Tipp auslöst', () => {
    const s = stateWith();
    // Burst exakt auf die halbe Boss-Ausdauer eingestellt ⇒ Lücke 0.5 < 0.8.
    const hp = bossHp(15);
    const dps = hp / 2 / BOSS_TIME_S;
    expect(bossGap(s, { zone: 15 }, dps, 0)).toBeCloseTo(0.5, 6);
    expect(bossGap(s, { zone: 15 }, dps, 0)).toBeLessThan(HINT_GAP_MAX);
    // Doppelte Macht ⇒ Lücke zu, kein Tipp mehr.
    expect(bossGap(s, { zone: 15 }, dps * 2, 0)).toBeGreaterThanOrEqual(HINT_GAP_MAX);
  });
});

describe('advisor — bestPurchaseHint (P3)', () => {
  it('schweigt ohne Kontostand', () => {
    expect(bestPurchaseHint(stateWith({ gold: 0 }))).toBeNull();
    expect(bestPurchaseHint(stateWith({ gold: -100 }))).toBeNull();
  });

  it('empfiehlt am Anfang die Klick-Linie (bester Grenznutzen pro BP)', () => {
    const hint = bestPurchaseHint(stateWith({ gold: 100 }));
    expect(hint).not.toBeNull();
    expect(hint!.kind).toBe('level');
    expect(hint!.id).toBe('boss');
    expect(hint!.cost).toBe(nextLevelCost(CREW[0], 0));
    expect(hint!.affordable).toBe(true);
    expect(hint!.label).toBe('Booty-Boss (Du) Lv 1');
  });

  it('empfiehlt NIE etwas über dem 3-fachen Kontostand', () => {
    // Querschnitt durch Konto, Crew-Tiefe und Fähigkeits-Stand.
    for (const gold of [1, 37, 1_000, 250_000, 9e9, 1e15]) {
      const crews: CrewLevels[] = [
        {},
        { boss: 24 },
        { boss: 25 },
        { boss: 80, hype: 40 },
        { boss: 200, hype: 150, dj: 120, bouncer: 90, influencer: 60 },
      ];
      for (const crew of crews) {
        const s = stateWith({ gold, crew, crewUp: { boss: 1 } });
        const hint = bestPurchaseHint(s);
        if (!hint) continue;
        expect(hint.cost).toBeLessThanOrEqual(gold * HINT_BUDGET_REACH);
        expect(hint.cost).toBeGreaterThan(0);
        expect(CREW.some((c) => c.id === hint.id)).toBe(true);
        expect(hint.label.length).toBeGreaterThan(0);
        expect(hint.affordable).toBe(hint.cost <= gold);
      }
    }
  });

  it('nennt an der Wand ein Sparziel statt gar nichts', () => {
    // Gold reicht für kein einziges Level dieser Crew-Tiefe, aber innerhalb ×3.
    const cfg = CREW[0];
    const level = 40;
    const cost = nextLevelCost(cfg, level);
    const s = stateWith({ gold: Math.floor(cost / 2), crew: { boss: level } });
    const hint = bestPurchaseHint(s);
    expect(hint).not.toBeNull();
    expect(hint!.affordable).toBe(false);
    expect(hint!.cost).toBeLessThanOrEqual(s.gold * HINT_BUDGET_REACH);
  });

  it('schlägt eine freigeschaltete Fähigkeit vor, wenn sie das beste ROI hat', () => {
    // boss Lv 200 ⇒ vier Stufen frei, keine gekauft: die erste (power, +100 % Klick)
    // schlägt bei diesem Kontostand jedes weitere Level.
    const s = stateWith({ gold: 1e9, crew: { boss: 200 }, crewUp: {} });
    const hint = bestPurchaseHint(s);
    expect(hint).not.toBeNull();
    expect(hint!.kind).toBe('ability');
    expect(hint!.id).toBe('boss');
    expect(hint!.cost).toBe(nextAbility(CREW[0], 200, 0).cost);
    expect(hint!.label).toContain('+100% Klick');
  });

  it('schlägt nie schlechter als das beste bezahlbare Level (ROI-Rangfolge hält)', () => {
    const s = stateWith({ gold: 5_000_000, crew: { boss: 60, hype: 45, dj: 30 } });
    const hint = bestPurchaseHint(s);
    expect(hint).not.toBeNull();
    const budget = s.gold * HINT_BUDGET_REACH;
    for (const cfg of CREW) {
      const lvl = s.crew[cfg.id] ?? 0;
      const ups = s.crewUp[cfg.id] ?? 0;
      const cost = nextLevelCost(cfg, lvl);
      if (cost > budget) continue;
      // Unabhängig nachgerechneter Grenznutzen dieses Levels (Klick-Linie zählt
      // wie DPS, genau wie in der Rangfolge).
      const gain = cfg.click
        ? heroClick(cfg, lvl + 1, 0, ups) - heroClick(cfg, lvl, 0, ups)
        : heroDps(cfg, lvl + 1, 0, ups) - heroDps(cfg, lvl, 0, ups);
      expect(hint!.roi).toBeGreaterThanOrEqual(gain / cost - 1e-12);
    }
  });
});

describe('advisor — purchaseSignature (P3-Throttle)', () => {
  it('ändert sich mit Gold, Leveln und Fähigkeiten — sonst nicht', () => {
    const base = stateWith({ gold: 100, crew: { boss: 3 } });
    expect(purchaseSignature(base)).toBe(purchaseSignature(stateWith({ ...base })));
    expect(purchaseSignature({ ...base, gold: 101 })).not.toBe(purchaseSignature(base));
    expect(purchaseSignature({ ...base, crew: { boss: 4 } })).not.toBe(purchaseSignature(base));
    expect(purchaseSignature({ ...base, crewUp: { boss: 1 } })).not.toBe(purchaseSignature(base));
    // Kosmetik/Fortschritt ohne Einfluss auf die Rangfolge lässt sie unangetastet.
    const elsewhere: ChState = { ...base, zone: 99, totalClicks: 5000 };
    expect(purchaseSignature(elsewhere)).toBe(purchaseSignature(base));
  });
});

describe('advisor — liest die Umschulung mit (3b)', () => {
  it('zählt einen auf `boss` gerollten Slot im Burst wie einen Stock-Boss-Slot', () => {
    // Booty-Boss (Rhythmus P S P S, Stock `critdmg`) mit vier gekauften Stufen.
    const stock = stateWith({ crewUp: { boss: 4 } });
    const rolled = stateWith({ crewUp: { boss: 4 }, crewRetrain: { boss: { '2': 'boss' } } });
    // Ein `boss`-Special ist +25 % Boss-Schaden — genau das muss die Wand-Telemetrie
    // sehen, sonst unterschätzt sie den Spieler nach seiner Umschulung systematisch.
    expect(burstEstimate(rolled, 100, 40)).toBeCloseTo(burstEstimate(stock, 100, 40) * 1.25, 6);
    // Gegenprobe: eine Sorte ohne Boss-Bezug lässt den Burst unverändert.
    const idle = stateWith({ crewUp: { boss: 4 }, crewRetrain: { boss: { '2': 'idle' } } });
    expect(burstEstimate(idle, 100, 40)).toBeCloseTo(burstEstimate(stock, 100, 40), 6);
  });

  it('benennt im Kauf-Tipp die Sorte, die WIRKLICH kommt', () => {
    // Eine tiefe Crew, bei der bei JEDEM Mitglied als nächstes ein Spezial-Slot
    // ansteht (Muster 1 braucht dafür zwei gekaufte Stufen, die anderen eine) —
    // der Tipp muss also eine SORTE benennen, nicht die Verstärkung.
    const crew: CrewLevels = {};
    const ups: Record<string, number> = {};
    for (const c of CREW) {
      crew[c.id] = 400;
      ups[c.id] = c.rhythm === 1 ? 2 : 1;
    }
    const stock = stateWith({ gold: 1e12, crew, crewUp: ups });
    const hint = bestPurchaseHint(stock);
    expect(hint?.kind).toBe('ability');
    expect(hint!.id).toBe('boss'); // die Klick-Linie hat hier den besten Grenznutzen
    expect(hint!.label).toContain('Krit-Schaden'); // Stock-Sorte des Booty-Boss

    // Genau dieser Slot umgeschult ⇒ der Tipp nennt die neue Sorte.
    const rolled = stateWith({
      gold: 1e12,
      crew,
      crewUp: ups,
      crewRetrain: { boss: { '2': 'gold' } },
    });
    const after = bestPurchaseHint(rolled);
    expect(after!.id).toBe('boss');
    expect(after!.cost).toBe(hint!.cost); // derselbe Kauf, nur anders beschriftet
    expect(after!.label).toContain('BP');
  });
});
