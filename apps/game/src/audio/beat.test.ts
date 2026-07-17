import { describe, expect, it } from 'vitest';

import { BeatTracker, CLAPS_PER_PHASE } from './beat';

describe('BeatTracker', () => {
  it('fires once per beat slot as phase advances monotonically', () => {
    const bt = new BeatTracker();
    let beats = 0;
    for (let i = 0; i <= 200; i++) {
      if (bt.update(i * 0.05)) beats++; // phase 0..10
    }
    // slots crossed = floor(10 * 0.9) = 9, plus the slot 0 at phase 0 => 10.
    expect(beats).toBe(Math.floor(10 * CLAPS_PER_PHASE) + 1);
  });

  it('does not re-fire for the same or a lower phase', () => {
    const bt = new BeatTracker();
    expect(bt.update(5)).toBe(true);
    expect(bt.update(5)).toBe(false);
    expect(bt.update(4)).toBe(false);
  });

  it('reset lets the next update fire again', () => {
    const bt = new BeatTracker();
    bt.update(3);
    expect(bt.update(3)).toBe(false);
    bt.reset();
    expect(bt.update(3)).toBe(true);
  });
});
