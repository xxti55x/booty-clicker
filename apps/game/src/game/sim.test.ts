import { describe, expect, it } from 'vitest';

import { spawnFor } from './combat';
import { farmZone, simulateContinuous, simulateRunChain, simulateSingleRun } from './sim';

// The §4.8 "active player" bot: 3 clicks/s with juice (sustained combo ×2 + crit
// EV ×1.8). Fixed run length 45 min = 2700 one-second steps.
const ACTIVE = { clickRate: 3, juice: true } as const;
const RUN_S = 2700;
const SEEDS = [1, 7, 12345];

describe('simulateEndless — self-runtime (§9.5-AC4)', () => {
  it('a full 6×45-min run-chain simulates in well under 10 s', () => {
    const t0 = Date.now();
    simulateRunChain({ ...ACTIVE, seed: 1 }, 6, RUN_S);
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it('is deterministic (same seed ⇒ identical run summaries)', () => {
    const a = simulateRunChain({ ...ACTIVE, seed: 42 }, 4, RUN_S);
    const b = simulateRunChain({ ...ACTIVE, seed: 42 }, 4, RUN_S);
    expect(a.runs).toEqual(b.runs);
    expect(a.finalBank).toBe(b.finalBank);
  });
});

// M9-AC4 / §4.8 Messung 3: with RS_v2 + the 5 endless crew tiers + gilds, a
// 45-min run-chain reaches zone ≥ 75 and bank ≥ 500 RS within ≤ 6 runs (±25 %).
// Observed (all seeds): zone 80 by run 3, bank 810 by run 2.
describe('simulateEndless — pacing baseline (M9-AC4)', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: run-chain reaches zone ≥ 75 and bank ≥ 500 RS in ≤ 6 runs`, () => {
      const chain = simulateRunChain({ ...ACTIVE, seed }, 6, RUN_S);
      const maxBank = Math.max(...chain.runs.map((r) => r.bank));
      const runsToZone75 = chain.runs.findIndex((r) => r.bestZone >= 75) + 1;

      expect(chain.maxBestZone).toBeGreaterThanOrEqual(75);
      expect(maxBank).toBeGreaterThanOrEqual(500);
      expect(runsToZone75).toBeGreaterThan(0);
      expect(runsToZone75).toBeLessThanOrEqual(6);
      // §4.8 Messung 3 shape: bank multiplies each productive run (53→810→2074).
      expect(chain.runs[1].bank).toBeGreaterThan(chain.runs[0].bank * 3);
    });
  }
});

// E1 (no hard cap, §4.8): for a reached best-zone z there is a state reaching z+5.
describe('simulateEndless — E1 (no hard cap)', () => {
  it('a deeper state exists (final best zone ≥ first-run best + 5)', () => {
    const chain = simulateRunChain({ ...ACTIVE, seed: 1 }, 6, RUN_S);
    expect(chain.maxBestZone).toBeGreaterThanOrEqual(chain.runs[0].bestZone + 5);
    // Best zone improves run-over-run while productive (not an immediate plateau).
    expect(chain.runs[1].bestZone).toBeGreaterThan(chain.runs[0].bestZone);
    expect(chain.runs[2].bestZone).toBeGreaterThan(chain.runs[1].bestZone);
  });
});

// E2 (soft wall, §4.8): time to lifetimeMaxZone+5 stays bounded — no single
// improvement more than doubles the worst delay seen so far. Measured over the
// productive improvements with adaptive prestige (souls/gilds compound). The full
// "first 30" lands once M10's Ancients/HPF lift the M9 linear-mult plateau (~z80);
// until then the reachable improvements are the honest ceiling. Observed worst
// ratio ≈ 1.9 across seeds.
describe('simulateEndless — E2 (bounded soft wall)', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: no +5 improvement more than doubles the worst prior gap`, () => {
      const c = simulateContinuous(
        { ...ACTIVE, seed },
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

// E4 (click-invariant, §4.8): active (3 cps + juice) ≥ 8 zones ahead of casual
// (1 cps, no juice) in a 45-min window. Observed gap ≈ 15.
describe('simulateEndless — E4 (click is king, P1)', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: active is ≥ 8 zones ahead of casual over 45 min`, () => {
      const active = simulateSingleRun({ clickRate: 3, juice: true, seed }, RUN_S);
      const casual = simulateSingleRun({ clickRate: 1, juice: false, seed }, RUN_S);
      expect(active.bestZone - casual.bestZone).toBeGreaterThanOrEqual(8);
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
