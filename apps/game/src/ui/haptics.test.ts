import { describe, expect, it } from 'vitest';

import {
  HAPTIC_BOSS_PATTERN,
  HAPTIC_CLICK_MS,
  HAPTIC_CRIT_MS,
  HAPTIC_MIN_GAP_MS,
  Haptics,
} from './haptics';

function spy() {
  const calls: (number | number[])[] = [];
  return { fn: (p: number | number[]) => void calls.push(p), calls };
}

describe('Haptics', () => {
  it('is a no-op when unsupported or disabled', () => {
    const off = new Haptics(null);
    expect(off.supported).toBe(false);
    off.pulse(0, true, false); // must not throw
    const s = spy();
    const h = new Haptics(s.fn);
    h.pulse(0, false, false); // disabled ⇒ nothing
    expect(s.calls).toEqual([]);
  });

  it('throttles click/crit pulses to ≤ 10×/s', () => {
    const s = spy();
    const h = new Haptics(s.fn);
    h.pulse(0, true, false); // fires
    h.pulse(50, true, false); // within 100 ms ⇒ suppressed
    h.pulse(99, true, false); // still within ⇒ suppressed
    h.pulse(HAPTIC_MIN_GAP_MS, true, false); // exactly 100 ms later ⇒ fires
    expect(s.calls).toEqual([HAPTIC_CLICK_MS, HAPTIC_CLICK_MS]);
    // Over any second, at most 10 pulses can fire.
    const h2 = new Haptics(spy().fn);
    let fired = 0;
    const s2 = spy();
    const h3 = new Haptics(s2.fn);
    for (let t = 0; t < 1000; t += 10) h3.pulse(t, true, false);
    fired = s2.calls.length;
    expect(fired).toBeLessThanOrEqual(10);
    void h2;
  });

  it('uses the crit length on a crit and the boss pattern (unthrottled)', () => {
    const s = spy();
    const h = new Haptics(s.fn);
    h.pulse(0, true, true);
    expect(s.calls[0]).toBe(HAPTIC_CRIT_MS);
    h.boss(true);
    expect(s.calls[1]).toEqual([...HAPTIC_BOSS_PATTERN]);
  });
});
