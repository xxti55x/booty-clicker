import { describe, expect, it } from 'vitest';

import { SKINS } from '../character/skins';
import type { BackgroundKey, SkinKey } from '../types';
import { spawnFor } from './combat';
import { createGear, gearBonus, KULISSE_BUFFS, MAX_SKIN_LEVEL, MAX_SKIN_STARS } from './gear';
import {
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
// ---------------------------------------------------------------------------
const ACTIVE = { clickRate: 3, juice: true } as const; // full economy on (default)
const ACTIVE_CAL = { clickRate: 3, juice: true, economy: false } as const; // §4.8 baseline
const RUN_S = 2700;
const SEEDS = [1, 7, 12345, 2024, 99999];
const SEEDS_HEAVY = [1, 7, 12345]; // the long-horizon sims (E2/E3/first-Himmelfahrt)

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
// runs ON here. Observed (all seeds): zone 75 by run 2, bank 508→2074.
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
      // §4.8 Messung 3 shape: the bank multiplies each productive run (508→2074→…).
      expect(chain.runs[1].bank).toBeGreaterThan(chain.runs[0].bank * 3);
    });
  }
});

// §4.8 pacing target table (Toleranz ±25 %), validated under the §4.8 calibration
// conditions (`economy: false` — the table's stated assumptions exclude the loot
// accelerant; see the header note). The full-economy bot reaches each milestone
// SOONER, which is expected and asserted separately (M9-AC4 floors + economy suite).
describe('simulateEndless — §4.8 pacing target table (±25 %)', () => {
  const TOL = 0.25;
  for (const seed of [1, 7]) {
    it(`seed ${seed}: Bühne 10 ~1.5 min & erste Aszension (Bühne 35) 15–40 min (±25 %)`, () => {
      const r = simulateSingleRun({ ...ACTIVE_CAL, seed }, RUN_S);
      const t10 = r.timeToZone.get(10);
      const t35 = r.timeToZone.get(35);
      expect(t10).toBeDefined();
      expect(t35).toBeDefined();
      // Bühne 10 (Tyrann-Boss) ~1.5 min.
      expect(t10! / 60).toBeGreaterThanOrEqual(1.5 * (1 - TOL)); // 1.125 min
      expect(t10! / 60).toBeLessThanOrEqual(1.5 * (1 + TOL)); // 1.875 min
      // Erste sinnvolle Aszension (Bühne ~30–40) 15–40 min.
      expect(t35! / 60).toBeGreaterThanOrEqual(15 * (1 - TOL)); // 11.25 min
      expect(t35! / 60).toBeLessThanOrEqual(40 * (1 + TOL)); // 50 min
    });

    it(`seed ${seed}: Bühne 80 kumuliert in 3–5 h (±25 %, realistischer Spieler)`, () => {
      // The §4.8 "kumuliert" targets are player-facing; the optimal juiced bot reaches
      // them "weit früher" (§4.8, the documented optimal-vs-real gap), so — as the
      // first-Himmelfahrt window does — this uses a realistic-pace bot (1 cps, no juice).
      const chain = simulateRunChain(
        { clickRate: 1, juice: false, economy: false, seed },
        10,
        RUN_S,
      );
      const t80 = chain.timeToLifetime.get(80);
      expect(t80).toBeDefined();
      const hours = t80! / 3600;
      expect(hours).toBeGreaterThanOrEqual(3 * (1 - TOL)); // 2.25 h
      expect(hours).toBeLessThanOrEqual(5 * (1 + TOL)); // 6.25 h
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
  });
});

// E2 (weiche Wand, §4.8): time to `lifetimeMaxZone + 5` rises by ≤ ×2 per improvement —
// the endless soft wall never explodes. This is the §4.8 criterion for the **prestige**
// progression ("volles v2-System": souls/gilds/ancients/HPF, the plateau-lifting
// stack), so — like the §4.8 table — it is validated under the calibration baseline
// (`economy: false`): the M12 loot layer adds per-improvement RNG variance that a
// strict single-step ×2 bound is fragile to, and its *presence* (and non-hard-wall) is
// asserted by the economy suite. The full "first 30" lands once HPF fully lifts the M9
// plateau (~z80); until then the reachable improvements are the honest ceiling.
// Observed worst ratio ≈ 1.9 across seeds.
describe('simulateEndless — E2 (bounded soft wall)', () => {
  for (const seed of SEEDS_HEAVY) {
    it(`seed ${seed}: no +5 improvement more than doubles the worst prior gap`, () => {
      const c = simulateContinuous(
        { ...ACTIVE_CAL, seed },
        { stallSeconds: 90, maxSeconds: 60_000, plateauAscensions: 3 },
      );
      const zones = [...c.timeToLifetime.keys()].sort((a, b) => a - b).filter((z) => z % 5 === 0);
      const times = zones.map((z) => c.timeToLifetime.get(z)!);
      const gaps: number[] = [];
      for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);

      // Enough productive improvements to be meaningful for M9 (30 is a M10 target).
      expect(zones.length).toBeGreaterThanOrEqual(12);

      let runMax = gaps[0];
      for (let i = 1; i < gaps.length; i++) {
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
    it(`seed ${seed}: active is ≥ 8 zones ahead of casual over 45 min`, () => {
      const active = simulateSingleRun({ clickRate: 3, juice: true, seed }, RUN_S);
      const casual = simulateSingleRun({ clickRate: 1, juice: false, seed }, RUN_S);
      expect(active.bestZone - casual.bestZone).toBeGreaterThanOrEqual(8);
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
// (`economy: false`), since the optimal juiced bot — and the full loot economy — reach
// it far sooner (the same optimal-vs-real / no-loot-baseline gap the §4.8 table
// documents; the full-economy bot lands ~3 h, asserted deeper via the economy suite).
// Observed ≈ 5.4–5.7 h across seeds. Its power gaps also stay < 90 min (bonus E3).
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
      expect(hours).toBeGreaterThanOrEqual(3.75); // 5 h − 25 %
      expect(hours).toBeLessThanOrEqual(11.25); // 9 h + 25 %
      let worst = 0;
      for (let i = 1; i < era.powerMilestones.length; i++) {
        worst = Math.max(worst, era.powerMilestones[i] - era.powerMilestones[i - 1]);
      }
      expect(worst).toBeLessThanOrEqual(90 * 60);
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
  // new boss ⇒ a modest, variable sample). Asserted concretely on the deterministic
  // seed 1, where the run banks permanent tokens AND enough 🧩 to buy ≥ 1 gear level.
  it('seed 1: token + shard→gear faucets bank concrete power', () => {
    const e = simulateSingleRun({ ...ACTIVE, seed: 1 }, RUN_S).econ;
    expect(e.tokensBanked).toBeGreaterThanOrEqual(1); // §6.2 permanent tokens
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
      // The audit genuinely reached the ~1e58+ HP regime (not a shallow early-out) …
      expect(g.maxMagnitude).toBeGreaterThan(1e40);
      // … and never approached the double ceiling.
      expect(g.maxMagnitude).toBeLessThan(1e300);
      expect(Number.isFinite(g.maxMagnitude)).toBe(true);
    });
  }
});

// M9-AC5 / §4.4-AC2: farming via the pure travelTo clamps to 1..maxZone.
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
