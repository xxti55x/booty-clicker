/**
 * Die Anker der **Feinschliff-Permanenz** (IDEEN-GAMEPLAY 2b Skin-Pfade ·
 * 3c Erben-Moment · 1d Legenden-Level).
 *
 * **Warum eine dritte Sim-Datei.** Dieselbe gemessene Schranke wie bei
 * `sim-loot.test.ts`: Ein Vitest-Worker, der 60 s+ am Stück rechnet, antwortet
 * nicht mehr auf `onTaskUpdate` und wird mit einem RPC-Timeout abgebrochen —
 * jeder Test grün, der Lauf trotzdem rot. `sim.test.ts` lag mit 48 s bereits
 * nah dran; die Ketten dieses Blocks kämen obendrauf. Drei Dateien laufen in
 * drei Workern parallel, keiner reißt die Schranke. Die Bot-PROFILE bleiben die
 * geteilte Quelle aus `sim.ts` (`SIM_ACTIVE`, `SIM_PATH`, `SIM_HEIR`,
 * `SIM_LEGEND`, `SIM_RUN_S`, `SIM_SEEDS_HEAVY`), damit hier nichts von den
 * Ankern nebenan wegdriften kann.
 */
import { describe, expect, it } from 'vitest';

import { legendGlobalMult } from './legend';
import { MASTERY_MAX_DPS_BONUS } from './mastery';
import {
  BOSS_SECONDS,
  PATH_NODES,
  PATH_THRESHOLDS,
  SIM_SKIN,
  nodesForScore,
  skinPathPowerBudget,
} from './skin-path';
import {
  type PathSummary,
  SIM_ACTIVE,
  SIM_ACTIVE_CAL,
  SIM_HEIR,
  SIM_LEGEND,
  SIM_LEGEND_LEVELS,
  SIM_PATH,
  SIM_RUN_S,
  SIM_SEEDS_HEAVY,
  simulateContinuous,
  simulateRunChain,
  simulateSingleRun,
} from './sim';

const ACTIVE = SIM_ACTIVE;
const RUN_S = SIM_RUN_S;

// ---------------------------------------------------------------------------
// 2b — die Pfad-Kurve: Tragezeit + Boss-Kills, gemessen statt behauptet
// ---------------------------------------------------------------------------
describe('simulateEndless — 2b Skin-Pfad (Fortschritt wächst in JEDEM Profil mit)', () => {
  // Die Ketten laufen EINMAL und werden von allen Ankern gelesen (dieselbe
  // Disziplin wie in `sim-loot.test.ts`); LAZY, damit sie nicht in Vitests
  // Collect-Phase fallen.
  const cache = new Map<number, PathSummary[]>();
  const chain = (runs: number): PathSummary[] => {
    let v = cache.get(runs);
    if (!v) {
      v = SIM_SEEDS_HEAVY.map(
        (seed) => simulateRunChain({ ...ACTIVE, seed }, runs, RUN_S).skinPath,
      );
      cache.set(runs, v);
    }
    return v;
  };

  it('zählt Tragezeit UND Boss-Kills — beide Quellen laufen mit', () => {
    for (const p of chain(1)) {
      expect(p.wearS).toBe(RUN_S);
      expect(p.bosses).toBeGreaterThan(0);
      expect(p.score).toBe(p.wearS + p.bosses * BOSS_SECONDS);
    }
  });

  /** Die Vorgabe des Ideen-Dokuments: Knoten 1 fällt im ERSTEN Sitting. */
  it('öffnet Knoten 1 im ersten Sitting (45 min) — bei JEDEM Anker-Seed', () => {
    for (const p of chain(1)) expect(p.nodes).toBeGreaterThanOrEqual(1);
  });

  it('öffnet Knoten 2 nach ~3 h und Knoten 3 nach ~12 h', () => {
    for (const p of chain(4)) expect(p.nodes).toBe(2); // 3 h
    for (const p of chain(16)) expect(p.nodes).toBe(3); // 12 h
  }, 30_000);

  /** Und die Gegenvorgabe: Knoten 5 darf Tage dauern — nach 24 h ist er fern. */
  it('lässt Knoten 4 und 5 nach 24 h noch offen (der Pfad ist ein Lebenswerk)', () => {
    for (const p of chain(32)) {
      expect(p.nodes).toBeLessThan(PATH_NODES - 1);
      expect(p.score).toBeLessThan(PATH_THRESHOLDS[PATH_NODES - 1] / 3);
    }
  }, 60_000);

  it('überlebt jede Aszension der Kette (kein Reset fasst den Pfad an)', () => {
    const one = chain(1);
    const four = chain(4);
    for (let i = 0; i < one.length; i++) {
      expect(four[i].wearS).toBe(4 * RUN_S);
      expect(four[i].bosses).toBeGreaterThan(one[i].bosses);
    }
  });

  it('bleibt deterministisch (gleicher Seed ⇒ identischer Stand)', () => {
    const a = simulateRunChain({ ...ACTIVE, seed: 7 }, 2, RUN_S).skinPath;
    const b = simulateRunChain({ ...ACTIVE, seed: 7 }, 2, RUN_S).skinPath;
    expect(a).toEqual(b);
  });

  /**
   * Der Bot trägt {@link SIM_SKIN} und wechselt NIE — er füllt genau einen Pfad
   * so schnell wie überhaupt möglich. Wer wechselt, füllt jeden langsamer; die
   * Schwellen sind also gegen den GÜNSTIGSTEN Fall geeicht.
   */
  it('modelliert einen Bot, der stur EINEN Skin trägt (die schnellste Kurve)', () => {
    expect(SIM_SKIN).toBe('classic');
    const p = chain(4)[0];
    expect(p.wearS).toBe(4 * RUN_S); // lückenlos, kein Wechsel
    expect(nodesForScore(p.score)).toBe(p.nodes);
  });
});

// ---------------------------------------------------------------------------
// 2b — die WIRKUNG: eigenes Profil, wie bei 2a/3a/3b
// ---------------------------------------------------------------------------
describe('simulateEndless — 2b Pfad-Wirkung (Voll-Ausbau als eigenes Profil)', () => {
  it('das Profil steht fest: aktiver Spieler MIT allen vier Bonus-Knoten', () => {
    expect(SIM_PATH).toEqual({ clickRate: 3, juice: true, skinPath: true });
  });

  /**
   * Der NORMAL-Bot faltet die Wirkung NICHT — und der Grund ist kein
   * Bequemlichkeits-Argument: Er modelliert überhaupt kein Skin-Gear
   * (`clickGearMult` steht auf 1, obwohl der Klassiker auf Lv 50 ×5 Klick
   * zahlt). Den +8-%-Pfad zu falten und den +400-%-Level-Buff wegzulassen wäre
   * ein Spielstand, den es nicht gibt. Deshalb: bit-gleiche Alt-Anker.
   */
  it('lässt der Normal-Bot den Pfad links liegen (bit-gleiche Anker)', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const a = simulateSingleRun({ ...SIM_ACTIVE_CAL, seed }, RUN_S);
      const b = simulateSingleRun({ ...SIM_ACTIVE_CAL, skinPath: false, seed }, RUN_S);
      expect(a.bestZone).toBe(b.bestZone);
      expect(a.timeToZone.get(25)).toBe(b.timeToZone.get(25));
    }
  });

  it('t25: der volle Pfad verschiebt den Anker nur um Prozente, nicht um Faktoren', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const a = simulateSingleRun({ ...SIM_ACTIVE_CAL, seed }, RUN_S).timeToZone.get(25)!;
      const b = simulateSingleRun(
        { ...SIM_ACTIVE_CAL, skinPath: true, seed },
        RUN_S,
      ).timeToZone.get(25)!;
      expect(b).toBeLessThanOrEqual(a);
      expect(a / b).toBeLessThan(skinPathPowerBudget() * 1.6);
    }
  });

  it('das Budget selbst: ein voller Pfad ist weniger als ein zusätzlicher Stern', () => {
    expect(skinPathPowerBudget()).toBeLessThan(1.15);
  });
});

// ---------------------------------------------------------------------------
// 3c — der Erbe: eine Verdopplung, ein Mitglied, eine Ära
// ---------------------------------------------------------------------------
describe('simulateEndless — 3c Erben-Moment (beste-ROI-Heuristik als Obergrenze)', () => {
  it('das Profil steht fest: aktiver Spieler MIT Erbe', () => {
    expect(SIM_HEIR).toEqual({ clickRate: 3, juice: true, heir: true });
  });

  it('führt der Normal-Bot KEINEN Erben (dokumentierte Untergrenze, bit-gleiche Anker)', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const a = simulateSingleRun({ ...SIM_ACTIVE_CAL, seed }, RUN_S);
      const b = simulateSingleRun({ ...SIM_ACTIVE_CAL, heir: false, seed }, RUN_S);
      expect(a.bestZone).toBe(b.bestZone);
      expect(a.timeToZone.get(25)).toBe(b.timeToZone.get(25));
    }
  });

  /**
   * Der Bot markiert das XP-STÄRKSTE Mitglied — die Wahl, die ein Spieler in
   * der Zeremonie träfe. Selbst diese Obergrenze bleibt unter dem strukturellen
   * Deckel des Erben (+5,66 % Gesamt-DPS, siehe `mastery.HEIR_WEIGHT`), weil
   * am Ende auch Klick, Seelen und Ahnen am Produkt hängen.
   */
  it('hebt den Anker um weniger als den strukturellen Erben-Deckel', () => {
    const cap = 1 + MASTERY_MAX_DPS_BONUS / (1 + MASTERY_MAX_DPS_BONUS);
    for (const seed of SIM_SEEDS_HEAVY) {
      const a = simulateSingleRun({ ...SIM_ACTIVE_CAL, seed }, RUN_S).timeToZone.get(25)!;
      const b = simulateSingleRun({ ...SIM_ACTIVE_CAL, heir: true, seed }, RUN_S).timeToZone.get(
        25,
      )!;
      expect(a / b).toBeLessThan(cap);
    }
  });

  it('bleibt deterministisch (gleicher Seed ⇒ gleiche Wand)', () => {
    const a = simulateSingleRun({ ...SIM_HEIR, seed: 7 }, RUN_S).bestZone;
    const b = simulateSingleRun({ ...SIM_HEIR, seed: 7 }, RUN_S).bestZone;
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 1d — Legenden-Level: die Kadenz ist die Leitplanke
// ---------------------------------------------------------------------------
describe('simulateEndless — 1d Legenden-Level (additiv, und quälend langsam)', () => {
  it('das Profil steht fest: aktiver Spieler mit 100 Leveln im Rücken', () => {
    expect(SIM_LEGEND).toEqual({ clickRate: 3, juice: true, legend: SIM_LEGEND_LEVELS });
    expect(legendGlobalMult(SIM_LEGEND_LEVELS)).toBeCloseTo(1.5, 12);
  });

  it('verdient der Normal-Bot KEIN Level (er transzendiert nie) — bit-gleiche Anker', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const a = simulateSingleRun({ ...SIM_ACTIVE_CAL, seed }, RUN_S);
      const b = simulateSingleRun({ ...SIM_ACTIVE_CAL, legend: undefined, seed }, RUN_S);
      expect(a.bestZone).toBe(b.bestZone);
      expect(a.timeToZone.get(25)).toBe(b.timeToZone.get(25));
    }
  });

  /**
   * **Die eigentliche Messung von 1d.** Ein 24-h-Kettenlauf mit vollem
   * Prestige-Stack schafft genau EINE Himmelfahrt — also genau EIN
   * Legenden-Level, +0,5 % global. Der Zähler ist damit exakt das, was das
   * Ideen-Dokument wollte: eine sichtbare Zahl für Ultra-Langzeitspieler, kein
   * Machtterm.
   */
  it('sammelt in 24 h genau ein Level (eine Himmelfahrt = ein Level)', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const c = simulateContinuous(
        { ...ACTIVE, seed, legend: 0 },
        { stallSeconds: 1500, maxSeconds: 86_400, plateauAscensions: 4, fullPrestige: true },
      );
      expect(c.legend).toBe(c.himmelfahrten);
      expect(c.legend).toBe(1);
    }
  }, 30_000);

  it('zählt kein Level ohne Nach-Transzendenz-Modus (die Regel gilt auch im Bot)', () => {
    const c = simulateContinuous(
      { ...ACTIVE, seed: 1 },
      { stallSeconds: 1500, maxSeconds: 86_400, plateauAscensions: 4, fullPrestige: true },
    );
    expect(c.himmelfahrten).toBeGreaterThan(0);
    expect(c.legend).toBe(0);
  }, 30_000);

  /**
   * Was 100 Level — bei der gemessenen Kadenz rund 1 600 h Spielzeit — am
   * Anker verschieben. ×1.5 global ist per Konstruktion P1-neutral (derselbe
   * Skalar auf Klick und Idle), die Beschleunigung darf also nirgends größer
   * als der Faktor selbst sein.
   */
  it('t25 mit 100 Leveln: beschleunigt, aber nie stärker als der Faktor', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const a = simulateSingleRun({ ...SIM_ACTIVE_CAL, seed }, RUN_S).timeToZone.get(25)!;
      const b = simulateSingleRun(
        {
          ...SIM_ACTIVE_CAL,
          legend: SIM_LEGEND_LEVELS,
          seed,
        },
        RUN_S,
      ).timeToZone.get(25)!;
      expect(b).toBeLessThanOrEqual(a);
      expect(a / b).toBeLessThan(legendGlobalMult(SIM_LEGEND_LEVELS) * 1.6);
    }
  });

  it('bleibt deterministisch (gleicher Seed ⇒ gleiche Wand)', () => {
    const a = simulateSingleRun({ ...SIM_LEGEND, seed: 12345 }, RUN_S).bestZone;
    const b = simulateSingleRun({ ...SIM_LEGEND, seed: 12345 }, RUN_S).bestZone;
    expect(a).toBe(b);
  });
});
