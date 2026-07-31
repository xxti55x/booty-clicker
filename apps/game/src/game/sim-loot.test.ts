/**
 * Die Anker der **Loot-Schicht** (IDEEN-GAMEPLAY 1c Relikte + 3a Skin-Schmiede).
 *
 * **Warum eine eigene Datei und nicht unten in `sim.test.ts`.** Gemessen: Der
 * Sim-Anker-Block lief mit diesen Tests am Ende auf 65 s CPU am Stück, und
 * Vitest bricht einen Worker, der so lange nicht auf `onTaskUpdate` antwortet,
 * mit einem RPC-Timeout ab — jeder Test grün, der Lauf trotzdem rot. Zwei
 * Dateien laufen in zwei Workern parallel; keiner reißt die Schranke, und die
 * Gesamtlaufzeit sinkt sogar. Die Bot-PROFILE bleiben dabei die geteilte
 * Quelle aus `sim.ts` (`SIM_ACTIVE`, `SIM_FORGE`, `SIM_RUN_S`,
 * `SIM_SEEDS_HEAVY`), damit hier nichts von den Ankern nebenan wegdriften kann.
 */
import { describe, expect, it } from 'vitest';

import { affixBossBudget, affixPowerBudget, affixSingleTermBudget } from './affixes';
import { constellationPowerBudget } from './constellation';
import { FORGE_BEST, forgeCost, forgeSlotsUnlocked } from './forge';
import { shardCost } from './gear';
import { RELIC_MIN_ZONE, RELIC_PITY } from './relics';
import { territoryPowerBudget } from './territory';
import {
  type EconSummary,
  SIM_ACTIVE,
  SIM_ACTIVE_CAL,
  SIM_CONSTELLATION,
  SIM_FORGE,
  SIM_RUN_S,
  SIM_SEEDS_HEAVY,
  simulateAscensionEra,
  simulateRunChain,
  simulateSingleRun,
} from './sim';

const ACTIVE = SIM_ACTIVE;
const RUN_S = SIM_RUN_S;

// ---------------------------------------------------------------------------
// IDEEN-GAMEPLAY 1c — Relikte: die Drop-Kurve, gemessen statt behauptet
// ---------------------------------------------------------------------------
// Relikte fallen PASSIV aus Boss-Gates ab Bühne 50, ohne jede Kauf-Entscheidung
// — wie der Ruf (1b) trägt sie also zwangsläufig jeder echte Spielstand, und der
// Bot faltet sie in JEDEM Profil (nicht nur in einem eigenen wie die Schmiede).
// Ein Gate würfelt genau EINMAL im Leben; die Kurve hängt damit an der TIEFE,
// nicht an der Spielzeit — genau das prüfen diese Anker.
describe('simulateEndless — 1c Relikte (Drop-Kurve + Pity im Bot)', () => {
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  // Die Ketten werden EINMAL gefahren und von allen Ankern gelesen — dieselbe
  // Disziplin wie im Balance-Ritual (Abschnitte 6/7/10 teilen sich ihre Läufe).
  // Naiv je Test neu gefahren lief allein dieser Block über 20 s und trieb den
  // Vitest-Worker in einen `onTaskUpdate`-Timeout.
  const cache = new Map<number, EconSummary[]>();
  const chain = (runs: number): EconSummary[] => {
    // LAZY: Würde die Kette im describe-Körper laufen, fiele sie in Vitests
    // Collect-Phase — der Worker antwortet dort nicht auf `onTaskUpdate` und
    // der Lauf endet mit einem RPC-Timeout, obwohl jeder Test grün ist.
    let v = cache.get(runs);
    if (!v) {
      v = SIM_SEEDS_HEAVY.map((seed) => simulateRunChain({ ...ACTIVE, seed }, runs, RUN_S).econ);
      cache.set(runs, v);
    }
    return v;
  };
  const short = (): EconSummary[] => chain(4); // 3 h
  const long = (): EconSummary[] => chain(16); // 12 h
  const gatesOf = (e: { deepestGate: number }): number =>
    e.deepestGate >= RELIC_MIN_ZONE ? (e.deepestGate - RELIC_MIN_ZONE) / 5 + 1 : 0;

  it('das erste Sitting sieht KEIN Relikt — die Wand steht bei Bühne ~25', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const r = simulateSingleRun({ ...ACTIVE, seed }, RUN_S);
      expect(r.bestZone).toBeLessThan(RELIC_MIN_ZONE);
      expect(r.econ.relicsFound).toBe(0);
      expect(r.econ.deepestGate).toBe(0);
    }
  });

  it('ab Bühne 50 tröpfeln sie — und die Zahl hängt an den GATES, nicht an der Zeit', () => {
    // Gemessen (Kette 3 h / 12 h / 24 h, Seeds 1/7/12345): tiefstes Gate 70/70/72,
    // also 5,0…5,3 berechtigte Gates ⇒ 1,3…1,7 Relikte. Zwischen Stunde 3 und
    // Stunde 12 bewegt sich fast nichts, weil der Kettenlauf an der M9-Wand
    // hängt — Relikte sind Vorstoß-Loot, kein Sitzfleisch-Loot.
    const three = mean(short().map((e) => e.relicsFound));
    const twelve = mean(long().map((e) => e.relicsFound));
    expect(three).toBeGreaterThan(0);
    expect(three).toBeLessThan(4);
    expect(twelve).toBeGreaterThanOrEqual(three);
    expect(twelve).toBeLessThan(6); // nie ein Regen
  });

  it('nie mehr Relikte als berechtigte Gates, nie weniger als das Pity erlaubt', () => {
    for (const e of long()) {
      const gates = gatesOf(e);
      expect(e.relicsFound).toBeLessThanOrEqual(gates);
      // Das Pity garantiert eines je RELIC_PITY Gates — abgerundet die Untergrenze.
      expect(e.relicsFound).toBeGreaterThanOrEqual(Math.floor(gates / RELIC_PITY));
    }
  });

  it('der Gate-Highwater wächst monoton und überlebt jede Aszension der Kette', () => {
    for (let i = 0; i < SIM_SEEDS_HEAVY.length; i++) {
      expect(long()[i].deepestGate).toBeGreaterThanOrEqual(short()[i].deepestGate);
      expect(long()[i].relicsFound).toBeGreaterThanOrEqual(short()[i].relicsFound);
    }
  });

  it('bleibt deterministisch (gleicher Seed ⇒ gleiche Sammlung)', () => {
    const a = simulateRunChain({ ...ACTIVE, seed: 7 }, 4, RUN_S);
    const b = simulateRunChain({ ...ACTIVE, seed: 7 }, 4, RUN_S);
    expect(a.econ.relicsFound).toBe(b.econ.relicsFound);
    expect(a.econ.deepestGate).toBe(b.econ.deepestGate);
    expect(a.econ.ember).toBe(b.econ.ember);
  });
}, 40_000);

// ---------------------------------------------------------------------------
// IDEEN-GAMEPLAY 3a — Skin-Schmiede: Best-Case als EIGENES Profil
// ---------------------------------------------------------------------------
// Der normale Bot schmiedet NIE (dokumentierte Untergrenze, siehe Modul-Kopf).
// `SIM_FORGE` misst dagegen den Deckel: drei makellose Slots gegen dieselbe
// Basis. Die Relikte laufen in BEIDEN Läufen mit — gemessen wird die Schmiede
// allein.
describe('simulateEndless — 3a Skin-Schmiede (Best-Case als eigenes Profil)', () => {
  it('das Profil beschleunigt spürbar, aber deutlich unter dem Budget', () => {
    // Gemessen (t25, Kalibrier-Bedingungen, Seeds 1/7/12345): ×1.18 / ×1.15 / ×1.18.
    for (const seed of SIM_SEEDS_HEAVY) {
      const base = simulateSingleRun({ ...SIM_ACTIVE_CAL, seed }, RUN_S);
      const forged = simulateSingleRun({ ...SIM_ACTIVE_CAL, forge: true, seed }, RUN_S);
      const t0 = base.timeToZone.get(25);
      const t1 = forged.timeToZone.get(25);
      expect(t0).toBeDefined();
      expect(t1).toBeDefined();
      const speedup = t0! / t1!;
      expect(speedup).toBeGreaterThan(1);
      expect(speedup).toBeLessThan(affixPowerBudget());
    }
  }, 20_000);

  it('auch auf dem empfindlichsten Anker (erste Himmelfahrt) bleibt es im Budget', () => {
    const era = (forge: boolean, seed: number) =>
      simulateAscensionEra(
        { clickRate: 0.7, juice: false, economy: false, forge, seed },
        {
          stallSeconds: 2700,
          maxSeconds: 80_000,
          maxAscensions: 100_000,
          stopAtFirstHimmelfahrt: true,
        },
      ).firstHimmelfahrtT;
    for (const seed of SIM_SEEDS_HEAVY) {
      const a = era(false, seed);
      const b = era(true, seed);
      expect(b).toBeGreaterThan(0);
      expect(a / b).toBeLessThan(affixPowerBudget());
    }
  }, 60_000);

  it('der NORMALE Bot schmiedet nie — das Profil ist die einzige Quelle', () => {
    expect(SIM_ACTIVE.forge).toBeUndefined();
    expect(SIM_ACTIVE_CAL.forge).toBeUndefined();
    expect(SIM_CONSTELLATION.forge).toBeUndefined();
    expect(SIM_FORGE.forge).toBe(true);
    // Und das Profil ist sonst identisch zum aktiven Anker-Bot.
    expect({ ...SIM_FORGE, forge: undefined }).toEqual({ ...SIM_ACTIVE, forge: undefined });
  });

  it('die Slot-Leiter ist ein echtes Sparziel (Splitter-Kosten je Slot)', () => {
    // Slot 1 bei Skin-Level 10, Slot 2 bei 25, Slot 3 bei 40 — kumulierte
    // `shardCost` 370 / 10 660 / 301 060 🧩. Bei den in 3b gemessenen ~140 🧩/h
    // heißt das 2,6 h / 76 h / 2 150 h.
    const cum = (lv: number) => {
      let n = 0;
      for (let i = 0; i < lv; i++) n += shardCost(i);
      return n;
    };
    expect(forgeSlotsUnlocked(10)).toBe(1);
    expect(cum(10)).toBeLessThan(140 * 4); // erster Slot am ersten Abend
    expect(cum(25)).toBeGreaterThan(140 * 40); // zweiter erst nach Tagen
    expect(cum(40)).toBeGreaterThan(cum(25) * 20); // dritter ist ein Lebenswerk
  });
});

// ---------------------------------------------------------------------------
// 1c + 3a — das gemeinsame Budget (die harte Leitplanke, eingefroren)
// ---------------------------------------------------------------------------
describe('simulateEndless — 1c + 3a Affix-Budget', () => {
  it('Einzel-Term ≤ ×2, Produkt ≤ ×1.5, Boss getrennt', () => {
    expect(affixSingleTermBudget()).toBeLessThanOrEqual(2);
    expect(affixPowerBudget()).toBeLessThanOrEqual(1.5);
    // A2: Boss-Schaden läuft gegen die 30-s-Gates, nicht gegen die Farm — er
    // steht deshalb NICHT im Produkt und hat sein eigenes, gleich hohes Budget.
    expect(affixBossBudget()).toBeLessThanOrEqual(2);
    expect(affixPowerBudget()).toBeLessThan(affixBossBudget());
  });

  it('das Budget bleibt unter dem der Konstellation × Gebietsherrschaft', () => {
    // Einordnung: 2a zahlt ×1.3041 global, 1b ×1.15 auf EINER Theme-Bühne.
    // Die Relikt-/Schmiede-Schicht liegt mit ×1.43 in derselben Größenordnung —
    // sie ist ein weiterer Baustein, keine neue Hauptquelle.
    expect(affixPowerBudget()).toBeLessThan(constellationPowerBudget() * territoryPowerBudget());
  });

  it('das Best-Case-Profil nutzt nur drei der neun möglichen Affixe', () => {
    // Der gemessene Profil-Effekt (×1.15…×1.18) liegt deshalb bewusst UNTER dem
    // rechnerischen Deckel: Drei Schmiede-Slots sind der Teil, den ein Spieler
    // steuern kann; die sechs Relikt-Affixe fallen ihm zu.
    expect(FORGE_BEST.length).toBe(3);
    expect(forgeCost(0)).toBeLessThan(forgeCost(2));
  });
});
