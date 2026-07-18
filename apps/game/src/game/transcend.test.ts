import { describe, expect, it } from 'vitest';

import {
  TRANSCEND_GLOBAL_BASE,
  TRANSCEND_MIN_HPF_LIFETIME,
  bankTranscendence,
  canTranscend,
  createTranscend,
  teForHpfLifetime,
  teSpent,
  transcendGain,
  transcendGlobalMult,
} from './transcend';

describe('transcend — TE earn formula (§4.5.3, gate 100 HPF lifetime)', () => {
  it('grants no TE below the 100-HPF-lifetime gate', () => {
    expect(TRANSCEND_MIN_HPF_LIFETIME).toBe(100);
    expect(teForHpfLifetime(0)).toBe(0);
    expect(teForHpfLifetime(99)).toBe(0);
    expect(teForHpfLifetime(TRANSCEND_MIN_HPF_LIFETIME - 1)).toBe(0);
    // Defensive: negative / NaN input ⇒ 0 (never NaN, never negative).
    expect(teForHpfLifetime(-5)).toBe(0);
    expect(teForHpfLifetime(Number.NaN)).toBe(0);
  });

  it('the first Transzendenz at the gate banks ⌊log10(100)⌋ = 2 TE (a ×9 boot)', () => {
    expect(teForHpfLifetime(100)).toBe(2);
    expect(transcendGlobalMult(teForHpfLifetime(100))).toBe(9);
  });

  it('adds exactly +1 TE per order of magnitude of lifetime HPF', () => {
    expect(teForHpfLifetime(100)).toBe(2); // 1e2
    expect(teForHpfLifetime(999)).toBe(2); // still 1e2 magnitude
    expect(teForHpfLifetime(1_000)).toBe(3); // 1e3
    expect(teForHpfLifetime(10_000)).toBe(4); // 1e4
    expect(teForHpfLifetime(100_000)).toBe(5); // 1e5
  });

  it('is monotone non-decreasing across the gate and beyond', () => {
    let prev = -1;
    for (const hpf of [0, 50, 99, 100, 250, 999, 1_000, 5_000, 10_000, 1_000_000]) {
      const te = teForHpfLifetime(hpf);
      expect(te).toBeGreaterThanOrEqual(prev);
      prev = te;
    }
  });
});

describe('transcend — ×3^TE global power multiplier', () => {
  it('is 3^te (spec §4.5.3)', () => {
    expect(TRANSCEND_GLOBAL_BASE).toBe(3);
    expect(transcendGlobalMult(0)).toBe(1);
    expect(transcendGlobalMult(1)).toBe(3);
    expect(transcendGlobalMult(2)).toBe(9);
    expect(transcendGlobalMult(3)).toBe(27);
  });

  it('guards negative / non-finite TE to ×1', () => {
    expect(transcendGlobalMult(-4)).toBe(1);
    expect(transcendGlobalMult(Number.NaN)).toBe(1);
    expect(transcendGlobalMult(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

// The key P1 property (spec §4.8, E4 „aktiv bleibt König"): a *global* multiplier
// scales click power and idle DPS by the SAME factor, so it leaves the click:idle
// ratio unchanged and can never let idle out-scale active clicking.
describe('transcend — P1-neutrality (global scales click and idle identically)', () => {
  it('applies the identical factor to click and idle, preserving their ratio', () => {
    const clickBase = 1234.5;
    const idleBase = 6789.0;
    for (const te of [0, 1, 2, 5]) {
      const mult = transcendGlobalMult(te);
      const clickAfter = clickBase * mult;
      const idleAfter = idleBase * mult;
      // Both scaled by exactly the same global factor …
      expect(clickAfter).toBeCloseTo(clickBase * TRANSCEND_GLOBAL_BASE ** te, 6);
      expect(idleAfter).toBeCloseTo(idleBase * TRANSCEND_GLOBAL_BASE ** te, 6);
      // … so the click:idle ratio is invariant (P1-neutral: idle never out-scales click).
      expect(clickAfter / idleAfter).toBeCloseTo(clickBase / idleBase, 9);
    }
  });
});

describe('transcend — held-vs-spent accounting (mirrors souls M10 / HPF)', () => {
  it('createTranscend is a zeroed slice', () => {
    expect(createTranscend()).toEqual({ te: 0, teLifetime: 0, transcendences: 0, mythos: {} });
  });

  it('gates at 100 HPF lifetime and banks the earned TE', () => {
    const t0 = createTranscend();
    expect(canTranscend(t0, 99)).toBe(false);
    expect(canTranscend(t0, 100)).toBe(true);
    expect(transcendGain(t0, 100_000)).toBe(5);

    const t1 = bankTranscendence(t0, 100_000);
    expect(t1.te).toBe(5);
    expect(t1.teLifetime).toBe(5);
    expect(t1.transcendences).toBe(1);
    expect(teSpent(t1)).toBe(0);
  });

  it('only banks NEW TE beyond the lifetime total; spending is preserved', () => {
    const t1 = bankTranscendence(createTranscend(), 100); // te 2, teLifetime 2
    expect(t1.te).toBe(2);
    // Spend 1 TE on a (future, M15) Mythos node — held drops, lifetime does not.
    const spent = { ...t1, te: t1.te - 1, mythos: { ...t1.mythos, diamantBooty: 1 } };
    expect(teSpent(spent)).toBe(1); // teLifetime 2 − held 1
    // A second Transzendenz at the same HPF earns nothing (no new magnitude).
    expect(transcendGain(spent, 100)).toBe(0);
    // Deepen HPF to 1 000 (⌊log10⌋ = 3) ⇒ +1 held, spending stays spent.
    const t2 = bankTranscendence(spent, 1_000);
    expect(t2.teLifetime).toBe(3);
    expect(t2.te).toBe(2); // held 1 + gain 1
    expect(teSpent(t2)).toBe(1); // still spent
    expect(t2.transcendences).toBe(2);
  });

  it('re-transcending without a new magnitude banks nothing extra (no exploit)', () => {
    const t1 = bankTranscendence(createTranscend(), 100_000); // te 5
    const t2 = bankTranscendence(t1, 100_000); // same HPF ⇒ no gain
    expect(t2.te).toBe(t1.te);
    expect(t2.teLifetime).toBe(t1.teLifetime);
    expect(t2.transcendences).toBe(t1.transcendences + 1);
  });

  it('never shrinks the earned highwater or double-grants', () => {
    // A teLifetime already above the formula value (e.g. a steeper prior tuning).
    const inflated = { ...createTranscend(), te: 10, teLifetime: 10 };
    const after = bankTranscendence(inflated, 100); // formula ⇒ 2, below 10
    expect(after.te).toBe(10); // no gain, held preserved
    expect(after.teLifetime).toBe(10); // highwater never shrinks
  });
});
