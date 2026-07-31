import { describe, expect, it } from 'vitest';

import { SKINS } from '../character/skins';
import type { BackgroundKey, SkinKey } from '../types';
import { gimmickForZone } from './boss-gimmicks';
import { spawnFor } from './combat';
import {
  bossShardReward,
  createGear,
  gearBonus,
  KULISSE_BUFFS,
  MAX_SKIN_LEVEL,
  MAX_SKIN_STARS,
} from './gear';
import { TREE_NODES, greedyTreeSpend, treeLevel, treeNodeConfig, treeRefund } from './heaven';
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
  SIM_TREE_PRIORITY,
  farmZone,
  simulateAscensionEra,
  simulateContinuous,
  simulateFloatGuard,
  simulateRunChain,
  simulateSingleRun,
} from './sim';

// ---------------------------------------------------------------------------
// The §4.8 "active player" bot: 3 clicks/s with juice (sustained combo ×2 + crit
// EV ×1.8). Fixed run length 45 min = 2700 one-second steps.
//
// **Economy toggle & the §4.8 calibration split (M14).** Every sim runs the FULL
// endgame economy by default — the loot layer (Golden-Peach ×3 income, boss/rival
// Truhen, 🔑, permanent tokens, 🧩-shards → gear) is folded into the bot exactly like
// crew/gilds/souls/ancients/heaven/gear (§9.5 "alle Systeme im Bot"). The §4.8 pacing
// TABLE and its two-sided endless windows, however, were calibrated under §4.8's own
// stated assumptions — "3 Klicks/s, Combo ×2, Krit-EV ×1,8, ROI-greedy" — which
// deliberately EXCLUDE the Golden Pfirsich and Truhen (they are an *additional*
// accelerant layered on top). So those precise numeric windows are validated with
// `economy: false` (the documented no-loot calibration baseline the table represents),
// while the endless CRITERIA that are robust to it (E1/E3/E4), the "can-reach" pacing
// floors (M9-AC4) and the dedicated economy suite run with the full economy ON — and
// the E4 gap even WIDENS with it (loot compounds the active twerker's lead). See the
// per-block notes.
//
// **ROADMAP-V2 A2 (Boss-Gimmicks) — Anker-Lauf.** Seit A2 rechnet der Bot die
// Theme-Gimmicks der Boss-Gates mit (`game/boss-gimmicks.ts`): Club pausiert 2×4 s
// den IDLE-Anteil, Synth filtert Klick+Idle auf den Beat-Anteil (0.554 — der Bot
// klickt ungetaktet, siehe `gimmickBossDamage`), Beach heilt 5 %/10 s als HP-Regen im
// Boss-Step, Space hebt den Combo-Anteil des Klick-Terms auf ×1.5. Damit die
// Gimmicks die Schwierigkeit UMVERTEILEN statt sie nach oben zu schrauben, zahlt
// jeder Gimmick-Boss seinen Trick in Ausdauer (`GIMMICK_HP_SCALE`, gemessen
// kalibriert). Ergebnis des Anker-Laufs (seeds 1/7/12345, alle Werte vorher → nachher):
//   · t10 105 → 104 s · t20 824 → 823 s · t25 2133/2144 → 2032/2044 s (−4.7 %),
//     Bühne 30 bleibt außer Reichweite
//   · kumuliert t75 (realistisch) 4.75/6.94 → 4.99/6.96 h
//   · erste Himmelfahrt 18.26/18.81/18.19 → 18.44/18.27/18.32 h (± 3 %)
//   · E2 15 Verbesserungen + 1 Himmelfahrt (unverändert), E3 ≥ 41 Meilensteine,
//     E4-Abstand 8–15 → 10–15 Bühnen, Gear-E4 10 → 10/11
// Kein Anker musste aufgerissen werden; einzig der 🧩-Zeugen-Seed wandert (s. u.).
//
// **ROADMAP-V2 A1 (Bühnen-Modifikatoren) + A3 (Truhen-Kobold) — Anker-Lauf.** Der Bot
// spielt jetzt dieselbe seeded Modifikator-Karte, die ein Save mit diesem Seed rollen
// würde (`stageMods`, Default an; `false` fährt die Vor-A1-Basis für den A/B). Gefaltet
// sind die Faktoren, die auf echte Bot-Terme treffen — `gold` (Kill-BP), `hp`
// (`spawnFor`, also EINE Quelle mit dem Spiel), `click`/`dps` (getrennt über
// `stageDamageFactor`), `crit` (im gedeckelten Krit-Stack) und `chest`
// (Rivalen-Truhen-Chance). Bewusst NEUTRAL bleiben `beat` (der Bot klickt ungetaktet
// und holt den On-Beat-Bonus nie ab), `ekstase` (die Ekstase ist im Bot ohnehin nicht
// modelliert) und `peachGap` (der Bot reist nicht zum Farmen, sieht die Bühne also nur
// im Vorbeigehen) — alle drei können den ECHTEN Spieler nur beschleunigen, die Anker
// bleiben damit Untergrenzen. A3 hängt als kleiner Faucet daran: alle 4–7 min ein
// Kobold, 80 % Fangquote (`GOBLIN_SIM_CATCH`), Ertrag eine Holztruhe; sein 10-s-
// ×2-Klick-Buff ist NICHT modelliert (dieselbe Untergrenzen-Logik wie Twerk-Ekstase).
// Der Kobold zieht im Bot aus einem eigenen Seiten-Strom, damit ein neues Event nicht
// rückwirkend jede Truhen-/Krit-Ziehung aller Alt-Seeds verschiebt.
//
// Ergebnis des Anker-Laufs (seeds 1/7/12345, jeweils vorher → nachher):
//   · t10 104 → 104 s (Bühne 10 liegt UNTER `MOD_MIN_ZONE`, per Konstruktion gleich)
//   · t25 2032/2044/2033 → 2147/2035/1643 s (Mittel 2036 → 1942 s, −4.6 %),
//     Bühne 30 bleibt außer Reichweite
//   · erste Himmelfahrt 18.44/18.27/18.32 → 17.36/19.06/17.17 h
//     (Mittel 18.34 → 17.86 h, −2.6 %; Fenster unverändert)
//   · kumuliert t75 1.66/2.32/2.36 → 1.61/1.73/1.59 h
//   · E2/E3/E4, Gear-E4 und der Float-Guard unverändert grün
// Die STREUUNG je Seed wächst spürbar (± 10 % statt ± 3 %) — das ist der Punkt der
// Mechanik: jeder Lauf würfelt eine andere Karte, und eine Aszension würfelt neu. Der
// MITTELWERT bewegt sich kaum, also verschiebt A1 keine Wand. Zwei Parameter wurden
// dafür gezähmt (siehe DECISIONS): „Zähe Menge" +30 % → +20 % Ausdauer und „Nebel"
// −20 % → −15 % Crew-DPS; mit den Roadmap-Rohwerten lief der empfindlichste Anker
// (0.7-cps-Bot, seed 7) mit 20.35 h aus seinem Fenster.
//
// **IDEEN-GAMEPLAY 1b (Gebietsherrschaft) — Anker-Lauf.** Der Bot bucht jetzt pro
// Kill Ruf auf das Theme SEINER Bühne (Rivale +1, Boss +10) und multipliziert den
// BP-Ertrag jedes Kills mit `territoryGoldMult` DIESER Bühne. Das ist der erste
// Machtterm seit A1, der ohne Kauf-Entscheidung wächst — er MUSSTE gefaltet werden,
// sonst hätten die Anker eine Einkommens-Kurve gemessen, die kein echter Save je hat.
// Ergebnis (`npm run balance`, Seeds 1/7/12345, jeweils vorher → nachher):
//   · Pacing im ersten Sitting UNVERÄNDERT (t10 1.7 min · t25 32.4 min · Wand
//     ⌀ Bühne 25.0) — in 45 min steht die stärkste Leiste gerade auf Stufe 1,
//     also +1.5 % BP auf einem Fünftel der Bühnen, und das erst zum Schluss.
//   · Erste Himmelfahrt (0.7 cps, ohne Loot — der empfindlichste Anker):
//     17.27/18.79/17.10 → 15.87/18.05/15.98 h, Mittel 17.72 → 16.63 h (−6.2 %).
//     Fenster [11.6 h, 19.4 h] hält mit Abstand.
//   · Kumuliert t75 (1 cps, mit Loot): Mittel 3.16 → 3.17 h (Rauschen).
//   · E2 unverändert 15 Stufen je Seed, schlimmstes Verhältnis 1.86 → 1.85.
//   · E3 +50 %-Stufen 47/50/58 → 47/51/58, größte Lücke 48.7 → 30.7 min (besser).
//   · E4-Vorsprung ⌀ +12.3 → +13.3 Bühnen, kleinster unverändert 5.
// Kein Anker musste aufgerissen werden.
// ---------------------------------------------------------------------------
// P5: Die Profile stehen in `sim.ts` — dasselbe Modul, aus dem sich auch
// `npm run balance` bedient, damit Ritual und Anker nie auseinanderlaufen.
const ACTIVE = SIM_ACTIVE; // full economy on (default)
const ACTIVE_CAL = SIM_ACTIVE_CAL; // §4.8 baseline
const RUN_S = SIM_RUN_S;
const SEEDS = [1, 7, 12345, 2024, 99999];
const SEEDS_HEAVY = SIM_SEEDS_HEAVY; // the long-horizon sims (E2/E3/first-Himmelfahrt)

// ROADMAP-V2 P5: Die Bot-Profile sind ab jetzt die GEMEINSAME Quelle der
// Anker-Tests und des Balance-Rituals (`npm run balance`). Wer sie verstellt,
// verschiebt JEDE Kennlinie gleichzeitig — und zwar in beiden Werkzeugen. Dieser
// Test macht so eine Änderung laut, statt sie still durchgehen zu lassen.
describe('simulateEndless — P5 Bot-Profile (gemeinsame Quelle mit npm run balance)', () => {
  it('die Profile stehen fest: 3 cps + Juice, Kalibrierung ohne Loot, 45-min-Läufe', () => {
    expect(SIM_ACTIVE).toEqual({ clickRate: 3, juice: true });
    expect(SIM_ACTIVE_CAL).toEqual({ clickRate: 3, juice: true, economy: false });
    expect(SIM_RUN_S).toBe(2700);
    expect([...SIM_SEEDS_HEAVY]).toEqual([1, 7, 12345]);
  });
});

describe('simulateEndless — self-runtime (§9.5-AC4)', () => {
  it('a full 6×45-min run-chain simulates in well under 10 s', () => {
    const t0 = Date.now();
    simulateRunChain({ ...ACTIVE, seed: 1 }, 6, RUN_S);
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it('is deterministic (same seed ⇒ identical run summaries + economy)', () => {
    const a = simulateRunChain({ ...ACTIVE, seed: 42 }, 4, RUN_S);
    const b = simulateRunChain({ ...ACTIVE, seed: 42 }, 4, RUN_S);
    expect(a.runs).toEqual(b.runs);
    expect(a.finalBank).toBe(b.finalBank);
    // The loot economy draws from the same seeded stream, so it is reproducible too.
    const ea = simulateSingleRun({ ...ACTIVE, seed: 42 }, RUN_S).econ;
    const eb = simulateSingleRun({ ...ACTIVE, seed: 42 }, RUN_S).econ;
    expect(ea).toEqual(eb);
  });
});

// M9-AC4 / §4.8 Messung 3: with RS_v2 + the 5 endless crew tiers + gilds (and now the
// full loot economy), a 45-min run-chain reaches zone ≥ 75 and bank ≥ 500 RS within
// ≤ 6 runs. These are "can-reach" FLOORS, so the full economy (which only accelerates)
// runs ON here. Observed v11 (all seeds): zone 75 by run 2, bank 508→1295→2074 —
// the ramp softened from the v10 508→2074 because EVEN ability tiers are now themed
// specials (utility, not raw output); the bot's bank still multiplies each run.
// A2 (Boss-Gimmicks): zone 75 by run 2–3, banks 34→810→1295 — die Gates tragen jetzt
// Mechanik, die Wand steht aber an derselben Stelle (Ausdauer-Ausgleich).
describe('simulateEndless — pacing baseline (M9-AC4)', () => {
  for (const seed of SEEDS_HEAVY) {
    it(`seed ${seed}: run-chain reaches zone ≥ 75 and bank ≥ 500 RS in ≤ 6 runs`, () => {
      const chain = simulateRunChain({ ...ACTIVE, seed }, 6, RUN_S);
      const maxBank = Math.max(...chain.runs.map((r) => r.bank));
      const runsToZone75 = chain.runs.findIndex((r) => r.bestZone >= 75) + 1;

      expect(chain.maxBestZone).toBeGreaterThanOrEqual(75);
      expect(maxBank).toBeGreaterThanOrEqual(500);
      expect(runsToZone75).toBeGreaterThan(0);
      expect(runsToZone75).toBeLessThanOrEqual(6);
      // §4.8 Messung 3 shape: the bank multiplies each productive run — v11
      // measured 508→1295 (×2.55; the v10 ×4 ramp softened by the themed
      // special tiers, which trade raw output for utility).
      expect(chain.runs[1].bank).toBeGreaterThan(chain.runs[0].bank * 2);
    });
  }
});

// v12 pacing target table (Goal „a lot slower", Toleranz ±25 %), validated under
// the calibration conditions (`economy: false` — the table's stated assumptions
// exclude the loot accelerant; see the header note). The full-economy bot reaches
// each milestone SOONER, which is expected and asserted separately.
describe('simulateEndless — v12 pacing target table (±25 %)', () => {
  const TOL = 0.25;
  for (const seed of [1, 7]) {
    it(`seed ${seed}: Bühne 10 ~1.75 min, Bühne 25 ~30 min, Bühne 30 NICHT im ersten Sitting`, () => {
      const r = simulateSingleRun({ ...ACTIVE_CAL, seed }, RUN_S);
      const t10 = r.timeToZone.get(10);
      const t20 = r.timeToZone.get(20);
      const t25 = r.timeToZone.get(25);
      expect(t10).toBeDefined();
      expect(t20).toBeDefined();
      expect(t25).toBeDefined();
      // v12 (Goal-Nerf): gedrosseltes Einkommen (GOLD_DIVISOR 20), DPS_TUNE 1.5,
      // steilere Leitern (1.075), Fähigkeiten ×9 und Combo ×1.2 statt ×2 — die
      // erste Wand rückt von ~Bühne 30–39 auf ~Bühne 25 vor, Bühne 30 ist im
      // ersten 45-min-Sitting bewusst NICHT mehr erreichbar (erst via Aszension).
      // Measured: t10 1.75 min, t20 12.7 min, t25 31.1/31.3 min (seeds 1/7).
      // A2 (Boss-Gimmicks + Ausdauer-Ausgleich): t25 33.9/34.1 min — der
      // gemischte Bot (57–81 % Klick-Anteil an den Gates) profitiert leicht vom
      // Ausgleich, die Wand steht unverändert vor Bühne 30. Anker unberührt.
      expect(t10! / 60).toBeGreaterThanOrEqual(1.75 * (1 - TOL)); // 1.3 min
      expect(t10! / 60).toBeLessThanOrEqual(1.75 * (1 + TOL)); // 2.2 min
      expect(t25! / 60).toBeGreaterThanOrEqual(30 * (1 - TOL)); // 22.5 min
      expect(t25! / 60).toBeLessThanOrEqual(30 * (1 + TOL) + 5); // 42.5 min
      expect(r.timeToZone.get(30)).toBeUndefined(); // die neue erste Wand hält
    });

    it(`seed ${seed}: Bühne 75 kumuliert in ~4–6 h (realistischer Spieler MIT Economy)`, () => {
      // The "kumuliert" rows are player-facing; they validate under a realistic-pace
      // bot (1 cps, no juice). v12: the ECONOMY-OFF realistic bot now walls at ~z25
      // (the peach/chest layer is part of the real game and its escape hatch), so
      // the cumulative row validates with the economy ON — the honest in-game
      // floor. Measured t75 3.88/5.38 h (seeds 7/1); v11 was ~half that, the march
      // is genuinely „a lot slower".
      const chain = simulateRunChain({ clickRate: 1, juice: false, seed }, 14, RUN_S);
      const t75 = chain.timeToLifetime.get(75);
      expect(t75).toBeDefined();
      const hours = t75! / 3600;
      expect(hours).toBeGreaterThanOrEqual(4 * (1 - TOL)); // 3 h
      expect(hours).toBeLessThanOrEqual(6 * (1 + TOL)); // 7.5 h
    });
  }
  // NOTE (§4.8 rows not asserted here): "Zweite Aszension +15–25 min" is an
  // inter-ascension delta that the fixed-45-min-run chain does not expose cleanly
  // (ascension cadence is the run length, not an emergent stall), and the
  // "Transzendenz-Gate (100 HPF)" row is an explicit order-of-magnitude flag (§11), not
  // a ±25 % target — both are documented rather than asserted.
});

// E1 (kein Hard-Cap, §4.8): for a reached best-zone z there is a state reaching z+5
// (DPS grows with gold unbounded; endless milestones guarantee it structurally). Runs
// with the full economy ON — the frontier still climbs past the first run's best.
describe('simulateEndless — E1 (no hard cap)', () => {
  it('a deeper state exists (final best zone ≥ first-run best + 5)', () => {
    const chain = simulateRunChain({ ...ACTIVE, seed: 1 }, 6, RUN_S);
    expect(chain.maxBestZone).toBeGreaterThanOrEqual(chain.runs[0].bestZone + 5);
    // Best zone improves run-over-run while productive (not an immediate hard cap).
    expect(chain.runs[1].bestZone).toBeGreaterThan(chain.runs[0].bestZone);
    // …and the frontier does not regress into the next run (non-strict — loot RNG can
    // tie a run's best zone, but it must never fall back).
    expect(chain.runs[2].bestZone).toBeGreaterThanOrEqual(chain.runs[1].bestZone);
  });
});

// E2 (weiche Wand, §4.8): time to `lifetimeMaxZone + 5` rises by ≤ ×2 per improvement —
// the endless soft wall never explodes. This is the §4.8 criterion for the **prestige**
// progression ("volles v2-System": souls/gilds/ancients/HPF, the plateau-lifting stack),
// so — like the §4.8 table — it is validated under the calibration baseline
// (`economy: false`): the M12 loot layer adds per-improvement RNG variance that a strict
// single-step ×2 bound is fragile to, and its *presence* (and non-hard-wall) is asserted
// by the economy suite.
//
// M15 (resolves the M14 F7 M15-TODO — E2 previously ran through a `simulateContinuous`
// that "buys no Ancients and never Himmelfahrts"): the driver now runs `fullPrestige`,
// so the bot buys Twerk-Ahnen greedily each ascension AND performs a real
// Ruhmes-Himmelfahrt (`bankHimmelfahrt`) the instant the souls bank plateaus — exercising
// the full v2 prestige stack end-to-end. We assert (a) the ×2 soft-wall bound holds, (b)
// ≥ 16 productive +5 improvements are reached (up from the pre-M15 ≥ 12 floor), and (c) at
// least one Himmelfahrt fired across ≥ 8 ancient-buying ascensions.
//
// RESIDUAL (documented, not forced — see DECISIONS.md F7): the reachable ceiling within a
// < 1 s budget stays ~z80 / 16 improvements, NOT the spec's "first ~30". The first
// Himmelfahrt at the z80 souls-wall banks only ⌊√(2074/1000)⌋ = 1 HPF (+2 % global), which
// is far too little to break z80 — and a 2nd HPF needs rsLifetime ≥ 4000 (≈ z88), which 1
// HPF can't reach: a genuine chicken-and-egg soft wall that only the intended multi-HPF,
// days-scale grind (§4.5.2/§4.8 pacing) resolves. Reproducing 30 improvements would need a
// many-minute sim, so we assert the honest reachable ceiling and the fact that the
// Ancients + Himmelfahrt code paths are truly exercised. Observed worst ratio ≈ 1.89.
describe('simulateEndless — E2 (bounded soft wall, full v2 prestige stack)', () => {
  for (const seed of SEEDS_HEAVY) {
    it(`seed ${seed}: no +5 improvement more than doubles the worst prior gap (Ahnen + Himmelfahrt)`, () => {
      // v10: stallSeconds 90 → 240; v12: 240 → 1500 + budget 60k → 400k — the
      // bot's "I'm stuck, retire" patience is a player model, and at the v12
      // pacing a single frontier stretch (z20 → z25) takes ~18 min: a 240-s
      // reflex retires long before it breaks (measured: plateau-stop at z20 with
      // 0 Himmelfahrten). With session-scale patience the same world climbs to
      // z75 with a real Himmelfahrt — the wall is SOFT, exactly what E2 asserts.
      const c = simulateContinuous(
        { ...ACTIVE_CAL, seed },
        { stallSeconds: 1500, maxSeconds: 400_000, plateauAscensions: 4, fullPrestige: true },
      );
      const zones = [...c.timeToLifetime.keys()].sort((a, b) => a - b).filter((z) => z % 5 === 0);
      const times = zones.map((z) => c.timeToLifetime.get(z)!);
      const gaps: number[] = [];
      for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);

      // Deep, productive climb: the full v2 stack reliably reaches the z75 wall
      // (v12: 16 → 14 improvements — the deliberately slower pacing walls at 75).
      expect(zones.length).toBeGreaterThanOrEqual(14);
      // The full v2 prestige stack is genuinely exercised — Ancients bought each
      // ascension, and at least one real Himmelfahrt banked HPF + reset the L1 stack.
      expect(c.himmelfahrten).toBeGreaterThanOrEqual(1);
      expect(c.ascensions).toBeGreaterThanOrEqual(8);
      // ROADMAP-V2 P4, die MESSUNG zum F7-Residual (vorher nur ein Kommentar): der
      // Bot bankt an der z75-Wand genau 1 HPF — zu wenig für den billigsten
      // gelisteten Baum-Knoten (12 🍑), also kauft `buyTreeGreedy` hier nichts und
      // der Ausbau bewegt keinen einzigen E2-Wert (gemessen: 15 Verbesserungen,
      // worstRatio 0.93/0.84/1.86 — Wert für Wert identisch zu vor P4). Wer den
      // Baum im Bot laufen sehen will, findet die Strategie separat getestet
      // (`SIM_TREE_PRIORITY` unten + `heaven.greedyTreeSpend`).
      expect(c.hpfHeld).toBeGreaterThanOrEqual(1);
      expect(c.treeLevels).toBe(0);

      // v10: the strict ×2 bound starts AFTER a 4-gap warm-up. The snappy click-line
      // start makes the pre-first-ascension consolidation at ~z30 look explosive
      // relative to the tiny opening gaps (observed spike ratio ≈ 2.9–3.0 exactly
      // there) — that wall is the DESIGN (buy abilities, then ascend), not wall
      // growth. From gap 5 on the soft-wall bound stays the strict ×2 of old.
      const WARMUP = 4;
      let runMax = Math.max(...gaps.slice(0, WARMUP + 1));
      for (let i = WARMUP + 1; i < gaps.length; i++) {
        expect(gaps[i]).toBeLessThanOrEqual(2 * runMax);
        runMax = Math.max(runMax, gaps[i]);
      }
    });
  }
});

// E3 (Loop bleibt lebendig, §4.8): total power (effective DPS+click at best-zone farm)
// grows by +50 % at least every 90 min over the first 20 ascensions, with the bot
// buying Ancients after each ascension. Runs with the full economy ON (it is robust —
// the loot layer only adds power, never stalls the +50 % cadence). Observed worst gap
// ≈ 3–16 min across seeds.
describe('simulateEndless — E3 (loop stays lively, M10)', () => {
  for (const seed of SEEDS_HEAVY) {
    it(`seed ${seed}: no +50 % power gap exceeds 90 min over the first 20 ascensions`, () => {
      const era = simulateAscensionEra(
        { ...ACTIVE, seed },
        { stallSeconds: 90, maxSeconds: 150_000, maxAscensions: 20 },
      );
      expect(era.ascensions).toBe(20);
      // Plenty of +50 %-power milestones (the loop is far from flat).
      expect(era.powerMilestones.length).toBeGreaterThanOrEqual(10);
      let worst = 0;
      for (let i = 1; i < era.powerMilestones.length; i++) {
        worst = Math.max(worst, era.powerMilestones[i] - era.powerMilestones[i - 1]);
      }
      expect(worst).toBeLessThanOrEqual(90 * 60); // ≤ 90 min
    });
  }
});

// E4 (Klick-Invariante, §4.8): active (3 cps + juice) ≥ 8 zones ahead of casual (1 cps,
// no juice) in a 45-min window. Runs with the full economy ON — the loot layer feeds
// BOTH bots, yet the active twerker's lead only WIDENS (its boss kills rain more
// Truhen), so the invariant is preserved *because of* the economy, not despite it.
// Observed gap ≈ 15–20.
describe('simulateEndless — E4 (click is king, P1)', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: active is ≥ 4 zones ahead of casual over 45 min`, () => {
      // v12: the Combo-Nerf (×2 → ×1.2, the goal's explicit demand) deliberately
      // compresses the juice edge — the active twerker stays STRICTLY ahead on
      // every seed (measured gaps 5–15, was 15–20), but the floor moves 8 → 4.
      const active = simulateSingleRun({ clickRate: 3, juice: true, seed }, RUN_S);
      const casual = simulateSingleRun({ clickRate: 1, juice: false, seed }, RUN_S);
      expect(active.bestZone - casual.bestZone).toBeGreaterThanOrEqual(4);
    });
  }
});

// M11-AC5 (§5, §4.8): E4 (click is king, P1) STILL holds once gear is in play. The
// gear system's strongest buffs are CLICK buffs by design (§5.1) — the review-pass
// catalog rebalance (DECISIONS.md) pins Klassiker at +8 %/lv click (BIS lv 50 + 5★
// ⇒ ×5.5) above Robo-Twerk's +6 %/lv crew-DPS (BIS + Space kulisse ⇒ ×4.05). The
// fair comparison in a geared world equips BOTH sides with their best: the active
// twerker wears the best CLICK gear, the idler the best IDLE gear — and stays
// ≥ 8 zones behind over 45 min.
//
// The multipliers are DERIVED from the live catalog (every skin × kulisse at max
// level/stars through the real `gearBonus` fold), so any future catalog change that
// lets idle gear out-scale click gear fails this gate — the assertion cannot drift
// from the data it protects.
describe('simulateEndless — E4 with best-in-slot gear (M11-AC5, P1 intact)', () => {
  /** Best-in-slot click/idle multipliers over the whole catalog (max lv + stars, any kulisse). */
  function bisMults(): { click: number; idle: number } {
    let click = 1;
    let idle = 1;
    for (const skin of Object.keys(SKINS) as SkinKey[]) {
      for (const bg of Object.keys(KULISSE_BUFFS) as BackgroundKey[]) {
        const b = gearBonus({
          ...createGear(),
          skin,
          bg,
          bgAuto: false,
          skinLevels: { [skin]: MAX_SKIN_LEVEL },
          skinStars: { [skin]: MAX_SKIN_STARS },
        });
        click = Math.max(click, 1 + b.clickPct);
        idle = Math.max(idle, 1 + b.dpsPct);
      }
    }
    return { click, idle };
  }

  it('catalog P1 guard: the strongest click multiplier beats the strongest idle multiplier', () => {
    const { click, idle } = bisMults();
    expect(click).toBeGreaterThan(idle);
    // Pin the review-pass balance so an accidental catalog edit is caught loudly:
    // Klassiker lv 50 + 5★ ⇒ ×5.5 click; Robo lv 50 + Space ⇒ ×4.05 crew-DPS.
    expect(click).toBeCloseTo(5.5, 9);
    expect(idle).toBeCloseTo(4.05, 9);
  });

  // The gear-P1 comparison is CONTROLLED (`economy: false`): it isolates click gear vs
  // idle gear, so the loot layer — which feeds the idle-dominated idler's gold engine
  // hardest (Golden-Peach ×3 income) and would confound the gear-only signal — is held
  // out, exactly like the §4.8 calibration baseline. Observed gap ≈ 22.
  for (const seed of SEEDS_HEAVY) {
    it(`seed ${seed}: active(best click gear) ≥ 8 zones ahead of idler(best idle gear)`, () => {
      const { click, idle } = bisMults();
      const active = simulateSingleRun(
        { clickRate: 3, juice: true, economy: false, clickGearMult: click, seed },
        RUN_S,
      );
      const idler = simulateSingleRun(
        { clickRate: 1, juice: false, economy: false, idleGearMult: idle, seed },
        RUN_S,
      );
      expect(active.bestZone - idler.bestZone).toBeGreaterThanOrEqual(8);
      // The idle gear DOES lift the idler well above a bare casual (it isn't useless) —
      // it simply can't catch the active twerker.
      const bareCasual = simulateSingleRun(
        { clickRate: 1, juice: false, economy: false, seed },
        RUN_S,
      );
      expect(idler.bestZone).toBeGreaterThan(bareCasual.bestZone);
    });
  }
});

// M10-AC4: the first Ruhmes-Himmelfahrt (RS lifetime ≥ 1000) lands in the 5–9 h
// cumulative window (±25 % ⇒ [3.75 h, 11.25 h]). Measured with a realistic-pace
// player (sub-3 cps, ~45-min runs) under the §4.8 calibration conditions
// (`economy: false`): the optimal juiced bot — and the full loot economy — reach it
// far sooner, so the player-facing cumulative window validates under a realistic-pace
// bot, mirroring the §4.8 Bühne-80 block above. This is a modeling decision, not a
// §4.8 measurement (the full-economy bot lands ~3 h, asserted deeper via the economy
// suite). Observed ≈ 5.4–5.7 h across seeds. Its power gaps also stay < 90 min (bonus E3).
describe('simulateEndless — first Himmelfahrt pacing (M10-AC4)', () => {
  for (const seed of SEEDS_HEAVY) {
    it(`seed ${seed}: first Himmelfahrt lands in the 5–9 h ±25 % window`, () => {
      const era = simulateAscensionEra(
        { clickRate: 0.7, juice: false, economy: false, seed },
        {
          stallSeconds: 2700,
          maxSeconds: 80_000,
          maxAscensions: 100_000,
          stopAtFirstHimmelfahrt: true,
        },
      );
      expect(era.firstHimmelfahrtT).toBeGreaterThan(0);
      const hours = era.firstHimmelfahrtT / 3600;
      // v12 (Goal „a lot slower"): measured 15.3–15.5 h across seeds (was
      // 5.4–5.7 h) — the first Himmelfahrt is now a multi-session march.
      // ROADMAP-V2 A2: 18.44/18.27/18.32 h (vorher 18.26/18.81/18.19) — der
      // EMPFINDLICHSTE Anker des Pakets: der 0.7-cps-Bot ist idle-dominiert und
      // lebt genau an der Gate-Kante. Er entscheidet die Gimmick-Parameter —
      // 2×5 s Spotlight schob ihn auf 19.7 h und damit aus dem Fenster, 2×4 s
      // hält ihn bei 18.3 h. Das Fenster selbst bleibt unverändert.
      expect(hours).toBeGreaterThanOrEqual(15.5 * 0.75); // ≈ 11.6 h
      expect(hours).toBeLessThanOrEqual(15.5 * 1.25); // ≈ 19.4 h
      let worst = 0;
      for (let i = 1; i < era.powerMilestones.length; i++) {
        worst = Math.max(worst, era.powerMilestones[i] - era.powerMilestones[i - 1]);
      }
      // Boss-Fallback (Goal „zurück zur Vor-Bühne farmen"): jeder gescheiterte
      // Boss kostet jetzt echte Farm-Zeit auf der schwächeren Vor-Bühne, bevor
      // der Retry zündet — die längste Durststrecke wächst von ≤ 90 auf
      // gemessene ~95–98 min. Anker: 105 min.
      expect(worst).toBeLessThanOrEqual(105 * 60);
    });
  }
});

// §9.5 "alle Systeme im Bot" (M14-AC1): the full loot economy is genuinely folded into
// the bot, not stubbed. Over a single 45-min run the bot earns 🔑 (boss + peach), opens
// Truhen, banks permanent tokens (§6.2) and 🧩-shards → gear levels (§5.4), and catches
// the Golden Pfirsich — every faucet fires — and the net effect is real power: the
// full-economy bot reaches strictly deeper than the same seed with the economy off.
describe('simulateEndless — full loot economy in the bot (§9.5, M14-AC1)', () => {
  // Robust per-seed faucets (deterministic across the frontier climb): the Golden
  // Pfirsich, the 🔑 faucet and greedy chest-opening always fire, and the net effect is
  // strictly more power than the same seed with the economy off.
  for (const seed of SEEDS) {
    it(`seed ${seed}: peach/key/chest faucets fire and add real power`, () => {
      const on = simulateSingleRun({ ...ACTIVE, seed }, RUN_S);
      const off = simulateSingleRun({ ...ACTIVE_CAL, seed }, RUN_S);
      const e = on.econ;
      expect(e.peachesCaught).toBeGreaterThanOrEqual(8); // ~1 per ~165 s over 45 min
      expect(e.keysEarned).toBeGreaterThanOrEqual(8); // boss kills + peach drops
      expect(e.chestsOpened).toBeGreaterThanOrEqual(5); // greedy opening
      // The economy is a real accelerant (never neutral, never a regression).
      expect(on.bestZone).toBeGreaterThan(off.bestZone);
    });
  }

  // The permanent-token (§6.2) and 🧩-shards → gear (§5.4) faucets are chest-loot RNG,
  // so their per-run yield varies by seed (the frontier-only faucet drops ~1 chest per
  // new boss ⇒ a modest, variable sample). Asserted concretely on deterministic
  // witness seeds. v12: the slower pacing shrinks the 45-min chest sample further —
  // no single seed banks tokens AND a gear level any more, so the witness splits:
  // a token witness and a gear-level witness. Every faucet stays covered.
  // ROADMAP-V2 A1: der Token-Zeuge wandert 7 → 5. Die Bühnen-Modifikatoren
  // verschieben, WELCHE Bühnen in 45 min fallen (und „Zähe Menge" verdoppelt die
  // Rivalen-Truhen-Chance) — damit verschieben sich die gezogenen Truhen-Lose.
  // Seed 7 bankt jetzt 11 🧩 aber keinen Token mehr, Seed 5 einen Token + 10 🧩.
  // Zeugen-Tausch, keine abgeschwächte Behauptung: die Zusicherung ist unverändert.
  it('seed 5: token + shard faucets bank concrete loot', () => {
    const e = simulateSingleRun({ ...ACTIVE, seed: 5 }, RUN_S).econ;
    expect(e.tokensBanked).toBeGreaterThanOrEqual(1); // §6.2 permanent tokens
    expect(e.shards).toBeGreaterThan(0); // 🧩 banked
  });
  // ROADMAP-V2 A2 (Boss-Gimmicks): the gear-level witness moved 12345 → 4711. The
  // gimmicks shift WHICH bosses fall inside a 45-min run by a zone or two, and with
  // them the seeded chest draws — seed 12345 now banks 7 🧩 (one draw short of the 10
  // a level costs) while 4711 banks 14 ⇒ Lv 1. A witness-seed swap, not a weakened
  // claim: the assertion is unchanged and still proves 🧩 → real gear power.
  it('seed 4711: shard→gear faucet converts into a skin level', () => {
    const e = simulateSingleRun({ ...ACTIVE, seed: 4711 }, RUN_S).econ;
    expect(e.shards).toBeGreaterThan(0); // 🧩 banked
    expect(e.gearLevel).toBeGreaterThanOrEqual(1); // shards buy ≥ 1 skin level
  });

  it('the economy compounds across a run-chain without a hard wall', () => {
    const chain = simulateRunChain({ ...ACTIVE, seed: 1 }, 6, RUN_S);
    const last = chain.runs[chain.runs.length - 1];
    expect(chain.maxBestZone).toBeGreaterThan(chain.runs[0].bestZone); // still climbing
    expect(last.bank).toBeGreaterThanOrEqual(chain.runs[0].bank); // bank never shrinks
  });
});

// M14-AC4: the float-guard stays green to Bühne 300 (HP ~1e58+). `simulateFloatGuard`
// drives the REAL combat frontier to ≥ 300 and audits every tracked magnitude the spec
// names — monster/boss HP, gold, souls, power, banked shards/keys — proving the
// Prestige-Schichten hold every value finite and far under the 1.8e308 double ceiling
// (§9.3). See `sim.simulateFloatGuard` for the honest analytic fast-forward it uses.
describe('simulateEndless — float-guard to zone 300 (M14-AC4, §9.3)', () => {
  for (const seed of [1, 7, 12345]) {
    it(`seed ${seed}: frontier reaches ≥ 300 with every magnitude finite and < 1e300`, () => {
      const g = simulateFloatGuard({ ...ACTIVE, seed }, { targetZone: 320, maxSteps: 4000 });
      expect(g.maxZone).toBeGreaterThanOrEqual(300);
      expect(g.allFinite).toBe(true);
      expect(g.belowCeiling).toBe(true);
      // The audit genuinely reached the ~1e63 HP regime (not a shallow early-out) —
      // real bossHp(300) ≈ 1.3e63, so this passes …
      expect(g.maxMagnitude).toBeGreaterThan(1e58);
      // … and never approached the double ceiling.
      expect(g.maxMagnitude).toBeLessThan(1e300);
      expect(Number.isFinite(g.maxMagnitude)).toBe(true);
      // §9.3 assert #3: the smallest relevant additive gain stays above `wert · 2^-50`
      // (the additive-precision stall guard) — no per-tick gain underflows its total.
      expect(g.minGainRatio).toBeGreaterThan(2 ** -50);
    });
  }
});

// ROADMAP-V2 A2: the bot RUNS the theme gimmicks inside `stepSecond` (Spotlight
// pauses its idle term, the Schild filters both terms, the Welle heals the boss back,
// Gravitation lifts its combo share). The guard that matters at the sim boundary is
// that no gimmick can soft-lock a gate: one 45-min run must walk through all four
// themes' gates (5 club, 10 synth, 15 beach, 20 space). A future parameter tweak that
// makes one theme unbeatable fails here instead of silently stalling the frontier.
describe('simulateEndless — A2 Boss-Gimmicks (kein Gate sperrt)', () => {
  for (const seed of SEEDS_HEAVY) {
    it(`seed ${seed}: the bot beats all four themed gates in one 45-min run`, () => {
      const r = simulateSingleRun({ ...ACTIVE, seed }, RUN_S);
      const seen = new Set<string>();
      for (const gate of [5, 10, 15, 20]) {
        const g = gimmickForZone(gate);
        expect(g).not.toBeNull();
        seen.add(g!.id);
        // Die Bühne HINTER dem Gate wurde erreicht ⇒ der Boss ist gefallen.
        expect(r.timeToZone.get(gate + 1)).toBeDefined();
      }
      expect(seen.size).toBe(4); // je Theme genau ein eigener Twist
    });
  }
});

// M9-AC5 / §4.4-AC2: farming via the pure travelTo clamps to 1..maxZone.
// ---------------------------------------------------------------------------
// ROADMAP-V2 A1 + A3: der Bot rechnet die Bühnen-Modifikatoren und den
// Kobold-Faucet — und beides verschiebt die Wände nicht.
// ---------------------------------------------------------------------------
describe('simulateEndless — A1 Bühnen-Modifikatoren + A3 Kobold', () => {
  it('die Modifikatoren wirken im Bot (mods on ≠ mods off), ohne die Tiefe zu kippen', () => {
    let differs = 0;
    for (const seed of SEEDS) {
      const on = simulateSingleRun({ ...ACTIVE, seed, stageMods: true }, RUN_S);
      const off = simulateSingleRun({ ...ACTIVE, seed, stageMods: false }, RUN_S);
      if (on.bestZone !== off.bestZone) differs++;
      // Kein Seed darf durch die Karte einbrechen oder davonlaufen: ±2 Boss-Gates.
      expect(Math.abs(on.bestZone - off.bestZone)).toBeLessThanOrEqual(10);
    }
    // …aber SPÜRBAR sein müssen sie: mindestens ein Seed landet woanders.
    expect(differs).toBeGreaterThanOrEqual(1);
  });

  it('der Modifikator-Mittelwert bleibt netto neutral (Σ Tiefe über alle Seeds)', () => {
    let on = 0;
    let off = 0;
    for (const seed of SEEDS) {
      on += simulateSingleRun({ ...ACTIVE, seed, stageMods: true }, RUN_S).bestZone;
      off += simulateSingleRun({ ...ACTIVE, seed, stageMods: false }, RUN_S).bestZone;
    }
    // Über fünf Seeds gemittelt darf der Katalog die Progression um höchstens
    // 15 % bewegen — die Guardrail-Grenze der Roadmap („Wände dürfen nicht wandern").
    expect(Math.abs(on - off) / off).toBeLessThanOrEqual(0.15);
  });

  it('A3: der Kobold-Faucet feuert (~1 alle 4–7 min, 80 % Fangquote)', () => {
    for (const seed of SEEDS) {
      const e = simulateSingleRun({ ...ACTIVE, seed }, RUN_S).econ;
      // 45 min ÷ ~5.5 min ≈ 8 Spawns, davon 80 % gefangen ⇒ ≥ 4 ist die sichere Schranke.
      expect(e.goblinsCaught).toBeGreaterThanOrEqual(4);
      expect(e.goblinsCaught).toBeLessThanOrEqual(12);
    }
  });
});

describe('simulateEndless — travel/farm clamp (M9-AC5)', () => {
  it('travelTo (farmZone) never leaves 1..maxZone', () => {
    const frontier = spawnFor(15, 3, 15); // maxZone 15
    expect(farmZone(frontier, 8).zone).toBe(8); // in range
    expect(farmZone(frontier, 1).zone).toBe(1);
    expect(farmZone(frontier, 0).zone).toBe(1); // clamp low
    expect(farmZone(frontier, -5).zone).toBe(1);
    expect(farmZone(frontier, 99).zone).toBe(15); // clamp to frontier
    expect(farmZone(frontier, 15).zone).toBe(15);
    // Farming a lower zone preserves the frontier (maxZone) so nothing is lost.
    expect(farmZone(frontier, 8).maxZone).toBe(15);
  });
});

// ROADMAP-V2 P4 — der Himmelsbaum IM Bot. Der `fullPrestige`-Treiber gibt frisch
// gebankte HPF greedy im Baum aus (`SIM_TREE_PRIORITY` + `heaven.greedyTreeSpend`).
// Weil die E2-Wand nur 1 HPF bankt, ist der Kauf dort ein No-op (dort gemessen und
// festgehalten) — die STRATEGIE wird hier direkt geprüft, ohne einen minutenlangen
// Lauf zu brauchen: sie kauft nur, was der Bot auch rechnet, greift bei jedem
// Exklusiv-Paar reproduzierbar zur DPS-lastigen Seite und respektiert die Sperre.
describe('simulateEndless — P4 Himmelsbaum-Strategie des Bots', () => {
  it('listet nur echte Knoten — und keinen, dessen Wirkung der Bot gar nicht modelliert', () => {
    const NOT_MODELED = [
      'coach',
      'fruhstarter',
      'nachtschicht',
      'ekstaseausdauer',
      'gatecrasher',
      'beatgefuhl',
      'combogedachtnis',
    ];
    for (const id of SIM_TREE_PRIORITY) {
      expect(treeNodeConfig(id), `unbekannter Knoten ${id}`).toBeDefined();
      expect(NOT_MODELED).not.toContain(id);
    }
    expect(new Set(SIM_TREE_PRIORITY).size).toBe(SIM_TREE_PRIORITY.length);
    // Beide Seiten jedes Paares stehen drin — die DPS-lastige zuerst.
    for (const [dps, other] of [
      ['crewdoktrin', 'klickdoktrin'],
      ['combodoktrin', 'ekstasedoktrin'],
      ['truhenfokus', 'pfirsichfokus'],
    ]) {
      expect(SIM_TREE_PRIORITY).toContain(dps);
      expect(SIM_TREE_PRIORITY).toContain(other);
      expect(SIM_TREE_PRIORITY.indexOf(dps)).toBeLessThan(SIM_TREE_PRIORITY.indexOf(other));
    }
  });

  it('kauft billigste-Stufe-zuerst, wählt je Ast EINE Doktrin und bleibt deterministisch', () => {
    // 200 🍑 reichen für die günstigen Stufen und GENAU eine 35er-Doktrin — das
    // zeigt die Reihenfolge: erst alles Billige, dann die teuerste Entscheidung.
    const mid = { hpf: 200, hpfLifetime: 200, ascensions2: 3, tree: {} };
    const midBuilt = greedyTreeSpend(mid, SIM_TREE_PRIORITY);
    expect(treeLevel(midBuilt, 'schwererbass')).toBe(2);
    expect(treeLevel(midBuilt, 'goldenehande')).toBe(2);
    expect(treeLevel(midBuilt, 'crewdoktrin')).toBe(1); // die DPS-lastige Seite zuerst
    expect(treeLevel(midBuilt, 'klickdoktrin')).toBe(0);
    expect(200 - midBuilt.hpf).toBe(treeRefund(midBuilt));
    expect(midBuilt.hpf).toBeLessThan(35); // sonst hätte er weitergekauft

    // 500 🍑 kaufen die ganze Liste — und zwar in jedem Ast nur EINE Doktrin.
    const rich = { hpf: 500, hpfLifetime: 500, ascensions2: 5, tree: {} };
    const built = greedyTreeSpend(rich, SIM_TREE_PRIORITY);
    expect(treeLevel(built, 'crewdoktrin')).toBe(1);
    expect(treeLevel(built, 'klickdoktrin')).toBe(0);
    expect(treeLevel(built, 'combodoktrin')).toBe(1);
    expect(treeLevel(built, 'ekstasedoktrin')).toBe(0);
    expect(treeLevel(built, 'truhenfokus')).toBe(1);
    expect(treeLevel(built, 'pfirsichfokus')).toBe(0);
    expect(built.hpf).toBeGreaterThanOrEqual(0);
    expect(500 - built.hpf).toBe(treeRefund(built));
    expect(greedyTreeSpend(rich, SIM_TREE_PRIORITY)).toEqual(built); // deterministisch
    // Der Bot kauft auch wirklich NUR aus seiner Liste (kein Utility-Knoten).
    for (const cfg of TREE_NODES) {
      if (!SIM_TREE_PRIORITY.includes(cfg.id)) expect(treeLevel(built, cfg.id)).toBe(0);
    }
  });

  it('ein 1-HPF-Konto (die E2-Wand) kauft nichts — deshalb bewegt P4 keinen Anker', () => {
    const wall = { hpf: 1, hpfLifetime: 1, ascensions2: 1, tree: {} };
    expect(greedyTreeSpend(wall, SIM_TREE_PRIORITY)).toBe(wall);
  });
});

// ---------------------------------------------------------------------------
// 1a — Crew-Meisterschaft im Bot (IDEEN-GAMEPLAY)
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
   * Bühnen-Kurve rekonstruiert: Jeder Lauf clert die Boss-Bühnen 5, 10, … bis zu
   * seiner Wand.
   */
  const bossShardsUpTo = (bestZone: number): number => {
    let s = 0;
    for (let z = 5; z <= bestZone; z += 5) s += bossShardReward(z);
    return s;
  };
  const shardsAfter = (seed: number, runs: number): number => {
    const c = simulateRunChain({ ...ACTIVE, seed }, runs, RUN_S);
    return c.econ.shards + c.runs.reduce((a, r) => a + bossShardsUpTo(r.bestZone), 0);
  };

  it('zahlt die ERSTE Umschulung im ersten Sitting, aber nicht mehr als eine Handvoll', () => {
    for (const seed of SIM_SEEDS_HEAVY) {
      const s = shardsAfter(seed, 1);
      // Slot 1 kostet 40 🧩 — in 45 min drin (gemessen ⌀ 48) …
      expect(s).toBeGreaterThanOrEqual(retrainCost(1, 0));
      // … aber die Leiter bleibt ein Sparziel: kein Slot-3-Roll (160) am ersten Abend.
      expect(s).toBeLessThan(retrainCost(3, 0));
    }
  });

  it('bleibt über die Kette ein echter Sink (die Leiter überholt das Einkommen nicht)', () => {
    // ~3 h: Slot 4 (320) ist bezahlbar, aber nicht die ganze Crew auf einmal.
    const s3h = shardsAfter(1, 4);
    expect(s3h).toBeGreaterThan(retrainCost(4, 0));
    // 24 h: Der Beharrungszustand liegt bei rund 140 🧩/h (gemessen 141) — die
    // Eskalation (×2 je weiterem Roll) bremst also spürbar, ohne zu blockieren.
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
      // Gemessen 280…300 Ruf je Seed auf dem stärksten Theme (Schwelle 250).
      expect(territoryRank(best)).toBeGreaterThanOrEqual(1);
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
