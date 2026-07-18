import { describe, expect, it } from 'vitest';

import { NodePool, POP_INTERVAL_MS, POP_POOL_MAX, PopBatcher, popLabel } from './pops';

const hit = (value: number, extra: Partial<{ crit: boolean; onBeat: boolean }> = {}) => ({
  value,
  crit: extra.crit ?? false,
  onBeat: extra.onBeat ?? false,
  x: 0,
  y: 0,
});

describe('PopBatcher (spec §8.3 — max 1 pop / 80 ms, accumulate the rest)', () => {
  it('emits the first hit immediately, then batches within the window', () => {
    const b = new PopBatcher(POP_INTERVAL_MS);
    expect(b.push(hit(100), 0)).not.toBeNull(); // first ⇒ emit (count 1)
    // Six more within the 80 ms window are suppressed…
    for (let t = 10; t <= 60; t += 10) expect(b.push(hit(100), t)).toBeNull();
    // …and roll into the next emit at t = 80.
    const emit = b.push(hit(100), 80);
    expect(emit).not.toBeNull();
    expect(emit!.count).toBe(7); // the 6 suppressed + this one
    expect(emit!.value).toBe(700);
  });

  it('never emits two pops closer than the interval', () => {
    const b = new PopBatcher(80);
    const times = [0, 20, 40, 60, 79, 80, 120, 160, 200];
    const emitTimes: number[] = [];
    for (const t of times) if (b.push(hit(1), t)) emitTimes.push(t);
    for (let i = 1; i < emitTimes.length; i++) {
      expect(emitTimes[i] - emitTimes[i - 1]).toBeGreaterThanOrEqual(80);
    }
  });

  it('sticks crit/on-beat flags across the batch and flushes trailing hits', () => {
    const b = new PopBatcher(80);
    b.push(hit(5), 0); // emits count 1
    b.push(hit(5, { crit: true }), 10); // batched
    b.push(hit(5, { onBeat: true }), 20); // batched
    const flushed = b.flush(200);
    expect(flushed).not.toBeNull();
    expect(flushed!.count).toBe(2);
    expect(flushed!.crit).toBe(true);
    expect(flushed!.onBeat).toBe(true);
    // Nothing left to flush.
    expect(b.flush(400)).toBeNull();
  });
});

describe('NodePool (spec §8 AC2 — pool never exceeds 24 live nodes)', () => {
  it('creates at most POP_POOL_MAX nodes under a heavy burst', () => {
    let built = 0;
    const pool = new NodePool<{ id: number }>(POP_POOL_MAX, () => ({ id: built++ }));
    for (let i = 0; i < 5000; i++) pool.acquire();
    expect(pool.size).toBe(POP_POOL_MAX);
    expect(pool.size).toBeLessThanOrEqual(24);
    expect(built).toBe(POP_POOL_MAX);
  });

  it('recycles in round-robin order', () => {
    const pool = new NodePool<number>(
      3,
      (() => {
        let n = 0;
        return () => n++;
      })(),
    );
    const seen = [pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()];
    expect(seen).toEqual([0, 1, 2, 0]); // 4th reuses slot 0
  });
});

describe('popLabel', () => {
  it('formats prefixes, sign and the ×count aggregate', () => {
    expect(popLabel({ value: 100, count: 1, crit: false, onBeat: false, x: 0, y: 0 }, '-')).toBe(
      '-100',
    );
    expect(popLabel({ value: 12400, count: 7, crit: false, onBeat: false, x: 0, y: 0 }, '-')).toBe(
      '-12.40K ×7',
    );
    expect(popLabel({ value: 5, count: 1, crit: true, onBeat: true, x: 0, y: 0 }, '-')).toBe(
      'CRIT ♪ -5',
    );
    expect(popLabel({ value: 50, count: 1, crit: false, onBeat: false, x: 0, y: 0 }, '+')).toBe(
      '+50',
    );
  });
});
