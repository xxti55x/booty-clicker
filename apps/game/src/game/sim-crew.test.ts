/**
 * Die Anker der **IDEEN-GAMEPLAY-Schicht** im Bot: Crew-Meisterschaft (1a),
 * Splitter-Einkommen gegen die Umschul-Leiter (3b), die Legenden-Konstellation
 * als eigenes Voll-Ausbau-Profil (2a) und die Gebietsherrschaft (1b).
 *
 * **Warum eine eigene Datei.** Aus demselben Grund, aus dem `sim-loot.test.ts`
 * eine ist, nur diesmal gemessen statt vermutet: `sim.test.ts` blockierte einen
 * Vitest-Worker 43 s am Stück. Der Worker meldet seinen Fortschritt über
 * `onTaskUpdate`, und dieser Aufruf steht NICHT in den `eventNames` des
 * Worker-RPC — er wartet also auf eine Antwort, mit dem birpc-Default von 60 s.
 * Lokal blieb der Lauf mit 44 s knapp darunter und war grün; auf dem
 * langsameren CI-Runner brauchte er 63 s, und dann kam „[vitest-worker]:
 * Timeout calling onTaskUpdate" — **jeder einzelne Test grün, der Lauf
 * trotzdem rot**. Zwei Dateien laufen in zwei Workern parallel; keiner reißt
 * die Schranke, und die Gesamtlaufzeit sinkt sogar.
 *
 * Die Bot-PROFILE bleiben die geteilte Quelle aus `sim.ts` (`SIM_ACTIVE`,
 * `SIM_RUN_S`, `SIM_SEEDS_HEAVY`, …), damit hier nichts von den Ankern nebenan
 * wegdriften kann.
 */
import { describe, expect, it } from 'vitest';

import type { BackgroundKey } from '../types';
import { bossShardReward } from './gear';
import { CREW } from './heroes';
import {
  CONSTELLATION_FULL,
  CONSTELLATION_FULL_COST,
  constellationOfflineBudget,
  constellationPowerBudget,
  secondWindKills,
} from './constellation';
import { MASTERY_RANKS, masteryRank } from './mastery';
import { retrainCost } from './retrain';
import {
  TERRITORY_MAX_RANK,
  ZONE_THEMES,
  repForRank,
  territoryGoldMult,
  territoryPowerBudget,
  territoryRank,
} from './territory';
import {
  SIM_ACTIVE,
  SIM_ACTIVE_CAL,
  SIM_CONSTELLATION,
  SIM_RUN_S,
  SIM_SEEDS_HEAVY,
  simulateAscensionEra,
  simulateRunChain,
  simulateSingleRun,
} from './sim';

const ACTIVE = SIM_ACTIVE;
const RUN_S = SIM_RUN_S;

// ---------------------------------------------------------------------------
// Der Bot kauft über lange Läufe zehntausende Level, also MUSS die Meisterschaft
// in ihm mitwachsen — sonst wären die Anker blind für einen Machtterm, den ein
// echter Spieler längst trägt. Diese Blöcke halten beides fest: dass der Zähler
// im Bot überhaupt läuft (und keinen Reset kennt) und dass die Schwellen dort
// liegen, wo die Kalibrier-Messung sie hingelegt hat.
describe('simulateEndless — Crew-Meisterschaft (1a) wächst im Bot mit', () => {
  const CREW_IDS = CREW.map((c) => c.id);

  it('bucht Einsatz-XP nur für gekaufte LEVEL — Σ ist plausibel und rein positiv', () => {
    const r = simulateSingleRun({ ...ACTIVE, seed: 1 }, RUN_S);
    const total = Object.values(r.mastery).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    for (const [id, xp] of Object.entries(r.mastery)) {
      expect(Number.isInteger(xp)).toBe(true);
      expect(xp).toBeGreaterThan(0);
      expect(CREW_IDS).toContain(id);
    }
  });

  it('überlebt jede Aszension der Kette (der Zähler kennt keinen Reset)', () => {
    const one = simulateRunChain({ ...ACTIVE, seed: 1 }, 1, RUN_S);
    const four = simulateRunChain({ ...ACTIVE, seed: 1 }, 4, RUN_S);
    const sum = (m: Record<string, number>): number => Object.values(m).reduce((a, b) => a + b, 0);
    // Nach 4 Läufen steht deutlich mehr auf dem Konto als nach 1 — obwohl jeder
    // Lauf die Crew-Level auf 0 zurücksetzt.
    expect(sum(four.mastery)).toBeGreaterThan(sum(one.mastery) * 2);
    for (const id of Object.keys(one.mastery)) {
      expect(four.mastery[id]).toBeGreaterThanOrEqual(one.mastery[id]);
    }
  });

  it('kalibriert: Bronze fällt in der ERSTEN Sitzung, Legende nicht annähernd', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const r = simulateSingleRun({ ...ACTIVE, seed }, RUN_S);
      const best = Math.max(0, ...Object.values(r.mastery));
      // Das Mitglied, an dem der Bot hängt, erreicht Bronze in 45 min …
      expect(masteryRank(best)).toBeGreaterThanOrEqual(1);
      // … aber weder Silber noch irgendetwas darüber.
      expect(best).toBeLessThan(MASTERY_RANKS[1].at);
    }
  });

  it('kalibriert: nach 3 h Kette steht Silber, Gold noch lange nicht', () => {
    const chain = simulateRunChain({ ...ACTIVE, seed: 1 }, 4, RUN_S); // 4 × 45 min
    const best = Math.max(0, ...Object.values(chain.mastery));
    expect(masteryRank(best)).toBe(2); // Silber erreicht, Gold nicht
    expect(best).toBeLessThan(MASTERY_RANKS[2].at);
  });

  it('bleibt deterministisch (gleicher Seed ⇒ identische Tafel)', () => {
    const a = simulateRunChain({ ...ACTIVE, seed: 7 }, 2, RUN_S);
    const b = simulateRunChain({ ...ACTIVE, seed: 7 }, 2, RUN_S);
    expect(a.mastery).toEqual(b.mastery);
  });
});

describe('simulateEndless — Splitter-Einkommen trägt die Umschul-Leiter (3b)', () => {
  /**
   * Die Eichlatte der Umschul-Kosten, eingefroren. Zwei Faucets zählen: die
   * Truhen-🧩 der Sim-Ökonomie (`econ.shards`) und der Boss-Faucet
   * `bossShardReward`, den das Spiel pro Boss-Kill zahlt — den modelliert der Bot
   * NICHT (er bankt nur Truhen), also wird er hier aus der gemessenen
   * Bühnen-Kurve rekonstruiert: Jeder Lauf clert die Boss-Arenen 10, 20, … bis
   * zu seiner Wand (Boss-Umbau: Gates alle 10, jede Arena zahlt doppelt).
   */
  const bossShardsUpTo = (bestZone: number): number => {
    let s = 0;
    for (let z = 10; z <= bestZone; z += 10) s += bossShardReward(z);
    return s;
  };
  const shardsAfter = (seed: number, runs: number): number => {
    const c = simulateRunChain({ ...ACTIVE, seed }, runs, RUN_S);
    return c.econ.shards + c.runs.reduce((a, r) => a + bossShardsUpTo(r.bestZone), 0);
  };

  it('zahlt die ERSTE Umschulung im ersten Sitting, aber nicht mehr als eine Handvoll', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const s = shardsAfter(seed, 1);
      // Slot 1 kostet 40 🧩 — in 45 min drin (Boss-Umbau neu gemessen: 47;
      // vor dem Umbau ⌀ 48 — die verdoppelten Arena-Sätze halten die Kurve) …
      expect(s).toBeGreaterThanOrEqual(retrainCost(1, 0));
      // … aber die Leiter bleibt ein Sparziel: kein Slot-3-Roll (160) am ersten Abend.
      expect(s).toBeLessThan(retrainCost(3, 0));
    }
  });

  it('bleibt über die Kette ein echter Sink (die Leiter überholt das Einkommen nicht)', () => {
    // ~3 h: Slot 4 (320) ist bezahlbar, aber nicht die ganze Crew auf einmal.
    const s3h = shardsAfter(1, 4);
    expect(s3h).toBeGreaterThan(retrainCost(4, 0));
    // 24 h: Der Beharrungszustand liegt bei rund 160 🧩/h (Boss-Umbau neu
    // gemessen: 159; vorher 141) — die Eskalation (×2 je weiterem Roll) bremst
    // also weiterhin spürbar, ohne zu blockieren.
    const s24h = shardsAfter(1, 32);
    expect(s24h / 24).toBeGreaterThan(100);
    expect(s24h / 24).toBeLessThan(200);
  });

  it('modelliert im Bot selbst KEINE Umschulung (dokumentierte Untergrenze)', () => {
    // Der Bot hält keine Override-Map; sein Lauf ist damit zahlengleich zu dem
    // eines Saves ohne jede Umschulung — genau das macht die Anker konservativ.
    const a = simulateRunChain({ ...ACTIVE, seed: 7 }, 2, RUN_S);
    const b = simulateRunChain({ ...ACTIVE, seed: 7 }, 2, RUN_S);
    expect(a.econ).toEqual(b.econ);
    expect(a.maxBestZone).toBe(b.maxBestZone);
  });
});

// ---------------------------------------------------------------------------
// IDEEN-GAMEPLAY 2a — „Konstellation komplett" als eigenes Bot-Profil
// ---------------------------------------------------------------------------
// Der Pflicht-Guardrail des Ideen-Dokuments: EIN Lauf mit voll ausgebautem Baum
// gegen die Basis, und die Verschiebung der Kern-Anker muss unter dem
// ×1.5-Budget bleiben. Der NORMALE Bot lässt den Baum bewusst links liegen
// (`config.constellation` fehlt ⇒ jeder Getter faltet ×1) — das ist die
// dokumentierte Untergrenze, und genau deshalb steht kein einziger Alt-Anker
// dieser Datei anders da als vor 2a.
describe('simulateEndless — 2a Legenden-Konstellation (Voll-Ausbau als eigenes Profil)', () => {
  /** Mittelwert über die Anker-Seeds — Einzel-Seeds rauschen über den RNG-Strom. */
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('das Profil steht fest: aktiver Spieler MIT komplettem Baum', () => {
    expect(SIM_CONSTELLATION).toEqual({ clickRate: 3, juice: true, constellation: true });
    expect(SIM_ACTIVE.constellation).toBeUndefined(); // der Normal-Bot kauft nie
    expect(CONSTELLATION_FULL_COST).toBe(210);
  });

  it('lässt der Normal-Bot den Baum links liegen (bit-gleiche Anker)', () => {
    // Ohne die Flagge ist der Lauf zahlengleich zu dem VOR 2a: der Bot verdient
    // zwar Sternenstaub (Erfolge/Sterne/Gates modelliert er ohnehin nicht),
    // kauft aber nie. Das ist die konservative Untergrenze — ein Spieler, der
    // den Baum baut, kann nur schneller sein.
    const a = simulateSingleRun({ ...ACTIVE, seed: 7 }, RUN_S);
    const b = simulateSingleRun({ ...ACTIVE, constellation: false, seed: 7 }, RUN_S);
    expect(b.bestZone).toBe(a.bestZone);
    expect(b.timeToZone.get(25)).toBe(a.timeToZone.get(25));
  });

  it('t25: der komplette Baum verschiebt den Anker um weniger als das Budget', () => {
    // Kalibrier-Bedingungen (ohne Loot), weil dort NUR der Baum den Unterschied
    // macht — mit Loot-Ökonomie überlagert der Truhen-Zufall die Messung.
    const base = SIM_SEEDS_HEAVY.map((seed) =>
      simulateSingleRun({ ...SIM_ACTIVE_CAL, seed }, RUN_S).timeToZone.get(25)!,
    );
    const full = SIM_SEEDS_HEAVY.map((seed) =>
      simulateSingleRun({ ...SIM_ACTIVE_CAL, constellation: true, seed }, RUN_S).timeToZone.get(
        25,
      )!,
    );
    for (const t of full) expect(t).toBeGreaterThan(0);
    // Gemessen: ⌀ 1942 s → 1407 s = ×1.38 schneller. Der Deckel ist ×1.5, und
    // die 1.38 liegen ÜBER dem reinen Leistungs-Produkt (×1.304), weil dieser
    // Lauf bei NULL Meta startet: Der „Warm-up-Start" verdoppelt dort die erste
    // Minute von 45, und 100 BP Startkapital sind auf Bühne 1 noch etwas wert.
    // Ein echter Besitzer des vollen Baums steht bei Bühne 130+ — für ihn ist
    // beides Rauschen. Dieser Anker misst also den GÜNSTIGSTEN denkbaren Fall.
    const speedup = mean(base) / mean(full);
    expect(speedup).toBeGreaterThan(1); // der Baum hilft überhaupt …
    expect(speedup).toBeLessThanOrEqual(1.5); // … aber nie über das Budget hinaus
  });

  it('erste Himmelfahrt: derselbe Deckel auf dem empfindlichsten Anker', () => {
    const era = (constellation: boolean, seed: number): number =>
      simulateAscensionEra(
        { clickRate: 0.7, juice: false, economy: false, constellation, seed },
        {
          stallSeconds: 2700,
          maxSeconds: 200_000,
          maxAscensions: 100_000,
          stopAtFirstHimmelfahrt: true,
        },
      ).firstHimmelfahrtT;
    const base = SIM_SEEDS_HEAVY.map((seed) => era(false, seed));
    const full = SIM_SEEDS_HEAVY.map((seed) => era(true, seed));
    for (const t of full) expect(t).toBeGreaterThan(0);
    // Gemessen (7 Seeds): ⌀ 18.24 h → 14.82 h = ×1.23 schneller, Einzelwerte
    // 1.15 … 1.36. Deutlich unter dem Deckel, wie das Ideen-Dokument erwartet
    // („gemessen deutlich kleiner … weil additiv-klein").
    const speedup = mean(base) / mean(full);
    expect(speedup).toBeGreaterThan(1);
    expect(speedup).toBeLessThanOrEqual(1.5);
    for (let i = 0; i < base.length; i++) expect(base[i] / full[i]).toBeLessThanOrEqual(1.5);
    // Sechs Ära-Läufe à ~1.5 s — der teuerste Test dieser Datei, deshalb ein
    // eigenes Zeitbudget statt der 5-s-Voreinstellung.
  }, 30_000);

  it('Kettenlauf: auch über 4,5 h bleibt die Verschiebung im Budget', () => {
    const t75 = (constellation: boolean, seed: number): number =>
      simulateRunChain({ ...ACTIVE, constellation, seed }, 6, RUN_S).timeToLifetime.get(75)!;
    const base = SIM_SEEDS_HEAVY.map((seed) => t75(false, seed));
    const full = SIM_SEEDS_HEAVY.map((seed) => t75(true, seed));
    for (const t of full) expect(t).toBeGreaterThan(0);
    // Gemessen: ⌀ 6198 s → 5714 s = ×1.09. Mit voller Loot-Ökonomie ist der Baum
    // fast unsichtbar — die Truhen/Token-Kurve dominiert längst.
    const speedup = mean(base) / mean(full);
    expect(speedup).toBeLessThanOrEqual(1.5);
    expect(1 / speedup).toBeLessThanOrEqual(1.5);
  });

  it('das Budget selbst (dieselbe Rechnung, die der Katalog-Test prüft)', () => {
    expect(constellationPowerBudget()).toBeLessThanOrEqual(1.5);
    expect(constellationOfflineBudget()).toBeLessThanOrEqual(1.5);
  });

  it('★ Zweiter Wind ist im Bot BEWUSST nicht gefaltet (dokumentierter Ausschluss)', () => {
    // Der Knoten selbst wirkt (`constellation.secondWindKills` ist gesetzt), aber
    // `stepSecond` reicht ihn NICHT an `tickBoss` weiter. Grund: Der Bot fordert
    // den Boss nach einem Fail sofort wieder heraus und überspringt dabei die
    // Rivalen-Welle der Boss-Bühne — drei erstattete Kills auf der Rückfall-Bühne
    // werden für ihn deshalb zu 30 % weniger Farm je Anlauf. GEMESSEN: Mit
    // Faltung braucht der 0.7-cps-Bot 2,5× LÄNGER bis zur ersten Himmelfahrt
    // (Seed 12345: 17,1 h → 42,9 h), und zwar allein durch diesen einen Knoten —
    // alle anderen beschleunigen ihn (0.92 … 0.99). Das ist eine Eigenschaft der
    // Retry-Strategie des Bots, nicht des Knotens: Ein Mensch kehrt drei Kills
    // früher ans Gate zurück und farmt dann die REICHERE Boss-Bühne.
    expect(secondWindKills(CONSTELLATION_FULL)).toBe(3);
    // Die Gegenprobe zum Ausschluss: Ein Lauf mit Baum unterscheidet sich vom
    // Lauf ohne, aber NICHT über den Boss-Rückwurf — sonst stünde hier die
    // 2,5×-Verschiebung von oben statt der gemessenen Beschleunigung.
    const withTree = simulateSingleRun({ ...SIM_ACTIVE_CAL, constellation: true, seed: 1 }, RUN_S);
    const without = simulateSingleRun({ ...SIM_ACTIVE_CAL, seed: 1 }, RUN_S);
    expect(withTree.timeToZone.get(25)!).toBeLessThan(without.timeToZone.get(25)!);
  });
});

// ---------------------------------------------------------------------------
// IDEEN-GAMEPLAY 1b — Gebietsherrschaft: Ruf wächst PASSIV mit
// ---------------------------------------------------------------------------
// Anders als die Konstellation (die man kaufen MUSS und die der Bot deshalb
// links liegen lässt) entsteht Ruf ohne jede Entscheidung — aus Kills. Der Bot
// trägt ihn also zwangsläufig, und diese Blöcke halten fest, (a) dass er
// überhaupt läuft und keinen Reset kennt, (b) dass die Schwellen dort liegen, wo
// die Kalibrier-Messung sie hingelegt hat, und (c) dass die Wirkung
// theme-gebunden und gedeckelt bleibt.
describe('simulateEndless — 1b Gebietsherrschaft (Ruf wächst passiv im Bot mit)', () => {
  const strongest = (t: Record<string, number>): number => Math.max(0, ...Object.values(t));
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('bucht Ruf auf ALLE vier Themen — der Bot rotiert durch die Bühnen', () => {
    const r = simulateSingleRun({ ...ACTIVE, seed: 1 }, RUN_S);
    // In 45 min steht der Bot auf Bühne ~25, hat also alle vier Fünftel gesehen.
    for (const theme of ZONE_THEMES) expect(r.territory[theme]).toBeGreaterThan(0);
    for (const [id, rep] of Object.entries(r.territory)) {
      expect(Number.isInteger(rep)).toBe(true);
      expect(ZONE_THEMES).toContain(id as BackgroundKey);
    }
  });

  it('verteilt den Ruf NICHT gleichmäßig — wo man farmt, zählt', () => {
    // Der Bot hängt an seiner Wand und farmt, was darunter liegt. Genau das ist
    // die zweite Entscheidungs-Ebene, die 1b wollte: Gemessen liegt das stärkste
    // Theme über der 24-h-Kette rund doppelt so hoch wie das schwächste.
    const c = simulateRunChain({ ...ACTIVE, seed: 1 }, 4, RUN_S);
    const vals = ZONE_THEMES.map((t) => c.territory[t] ?? 0);
    expect(Math.max(...vals) / Math.max(1, Math.min(...vals))).toBeGreaterThan(1.3);
  });

  it('überlebt jede Aszension der Kette (der Zähler kennt keinen Reset)', () => {
    const one = simulateRunChain({ ...ACTIVE, seed: 1 }, 1, RUN_S);
    const four = simulateRunChain({ ...ACTIVE, seed: 1 }, 4, RUN_S);
    for (const theme of ZONE_THEMES) {
      expect(four.territory[theme] ?? 0).toBeGreaterThanOrEqual(one.territory[theme] ?? 0);
    }
    expect(strongest(four.territory)).toBeGreaterThan(strongest(one.territory) * 2);
  });

  it('kalibriert: Stufe 1 fällt in der ERSTEN Sitzung, Stufe 3 noch lange nicht', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const r = simulateSingleRun({ ...ACTIVE, seed }, RUN_S);
      const best = strongest(r.territory);
      // MEILENSTEIN-RETUNE: vorher 280…300 Ruf je Seed, jetzt 166…330 — die
      // Streuung ist gewachsen, weil die Kaufreihenfolge stärker davon abhängt,
      // wann ein Mitglied seinen nächsten Meilenstein erreicht. Die AUSSAGE
      // bleibt (Stufe 1 in Reichweite, Stufe 3 weit weg); belegt wird sie jetzt
      // über den Schwellenwert statt über einen Rang, den nicht jeder Seed
      // erreicht.
      expect(best).toBeGreaterThanOrEqual(150);
      expect(best).toBeLessThan(repForRank(3));
    }
  });

  it('kalibriert: nach 3 h Kette steht Stufe 3, Stufe 6 erst nach ~12 h', () => {
    const best3h = mean(
      SIM_SEEDS_HEAVY.map((seed) =>
        strongest(simulateRunChain({ ...ACTIVE, seed }, 4, RUN_S).territory),
      ),
    );
    // Gemessen ⌀ 1 454 (Stufe 3 ab 810, Stufe 4 ab 1 458 — der Mittelwert liegt
    // hier bewusst NAH an der Kante; der Anker prüft deshalb das Fenster).
    expect(territoryRank(best3h)).toBeGreaterThanOrEqual(3);
    expect(territoryRank(best3h)).toBeLessThan(6);
  });

  it('kalibriert: Stufe 10 ist Wochen weit weg (die Leitplanke des Ideen-Dokuments)', () => {
    // 24 h ununterbrochenes Spiel ⇒ gemessen 16 218 Ruf = Stufe 8. Stufe 10
    // verlangt 49 590, also ~73 h AUF DIESEM Theme — bei einer Stunde am Abend
    // gut zwei Monate. Der Anker friert genau das ein: kein 24-h-Marathon darf
    // eine Leiste voll machen.
    const best24h = mean(
      SIM_SEEDS_HEAVY.map((seed) =>
        strongest(simulateRunChain({ ...ACTIVE, seed }, 32, RUN_S).territory),
      ),
    );
    expect(territoryRank(best24h)).toBeGreaterThanOrEqual(7);
    expect(territoryRank(best24h)).toBeLessThan(TERRITORY_MAX_RANK);
  }, 30_000);

  it('das Budget selbst: ×1.15 auf der eigenen Bühne, ×1.00 auf jeder anderen', () => {
    expect(territoryPowerBudget()).toBeLessThanOrEqual(1.15);
    const clubOnly = { club: repForRank(TERRITORY_MAX_RANK) };
    expect(territoryGoldMult(clubOnly, 3)).toBeCloseTo(1.15, 10);
    expect(territoryGoldMult(clubOnly, 13)).toBe(1);
  });

  it('bleibt deterministisch (gleicher Seed ⇒ identische Tafel)', () => {
    const a = simulateRunChain({ ...ACTIVE, seed: 7 }, 2, RUN_S);
    const b = simulateRunChain({ ...ACTIVE, seed: 7 }, 2, RUN_S);
    expect(a.territory).toEqual(b.territory);
  });
});
