import { describe, expect, it } from 'vitest';

import { createRngState, floatAt, hash32, Rng, type RngState } from './rng';

describe('rng — determinism & resumability', () => {
  it('the same {seed, cursor} always yields the same float', () => {
    const seed = 12345;
    for (const cursor of [0, 1, 7, 1000, 2_000_000]) {
      expect(floatAt(seed, cursor)).toBe(floatAt(seed, cursor));
    }
    // Two independent wrappers from the same state draw the same sequence.
    const a = new Rng({ seed, cursor: 0 });
    const b = new Rng({ seed, cursor: 0 });
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it('reproduces a known sequence (regression against the hash impl)', () => {
    const expected = [0.764439, 0.201715, 0.662591, 0.121511, 0.113085, 0.44779, 0.24635, 0.83297];
    const rng = new Rng({ seed: 12345, cursor: 0 });
    for (const e of expected) expect(rng.next()).toBeCloseTo(e, 5);
  });

  it('drawing N then serializing then continuing == drawing N+M straight (O(1) resume)', () => {
    const seed = 987654;
    const N = 5;
    const M = 6;

    const straight = new Rng({ seed, cursor: 0 });
    const all = Array.from({ length: N + M }, () => straight.next());

    const first = new Rng({ seed, cursor: 0 });
    const firstN = Array.from({ length: N }, () => first.next());
    // Serialize mid-stream, then resume from the persisted {seed, cursor}.
    const snapshot: RngState = first.toState();
    expect(snapshot).toEqual({ seed, cursor: N });
    const resumed = new Rng(snapshot);
    const nextM = Array.from({ length: M }, () => resumed.next());

    expect([...firstN, ...nextM]).toEqual(all);
  });

  it('is roughly uniform over 100k draws and stays in [0, 1)', () => {
    const rng = new Rng({ seed: 12345, cursor: 0 });
    let sum = 0;
    let min = 1;
    let max = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(sum / n).toBeCloseTo(0.5, 2); // within ±0.005
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
    expect(rng.cursor).toBe(n);
  });
});

describe('rng — construction', () => {
  it('hash32 maps 32-bit ints into [0, 1)', () => {
    for (const x of [0, 1, -1, 2_147_483_647, -2_147_483_648, 0x9e3779b9]) {
      const v = hash32(x);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('createRngState starts at cursor 0 with a 32-bit seed', () => {
    const s = createRngState(42);
    expect(s).toEqual({ seed: 42, cursor: 0 });
    const rnd = createRngState();
    expect(Number.isInteger(rnd.seed)).toBe(true);
    expect(rnd.cursor).toBe(0);
  });

  it('a fresh Rng (no state) gets a random seed and cursor 0', () => {
    const rng = new Rng();
    expect(Number.isInteger(rng.seed)).toBe(true);
    expect(rng.cursor).toBe(0);
  });
});
