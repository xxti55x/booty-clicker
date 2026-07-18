import { describe, expect, it } from 'vitest';

import { SOUL_BONUS, soulMult } from './ascension';
import {
  bankHimmelfahrt,
  buyTreeNode,
  canHimmelfahrt,
  coachCps,
  coachDps,
  createHeaven,
  ekstaseBonusMs,
  fruhstarterFraction,
  heavenGlobalMult,
  himmelfahrtGain,
  hpfForRsLifetime,
  offlineCapS,
  soulBonusEff,
  treeLevel,
} from './heaven';

describe('heaven — HPF formula (§4.5.2, M10-AC3)', () => {
  it('HPF = ⌊√(RS_lifetime / 1000)⌋', () => {
    expect(hpfForRsLifetime(0)).toBe(0);
    expect(hpfForRsLifetime(999)).toBe(0); // below the first-Himmelfahrt gate
    expect(hpfForRsLifetime(1000)).toBe(1); // first Himmelfahrt at 1 000 RS
    expect(hpfForRsLifetime(100_000)).toBe(10);
    expect(hpfForRsLifetime(1_000_000)).toBe(31);
  });
});

describe('heaven — double effect (compounding, not additive)', () => {
  it('global damage is +2 % per held HPF', () => {
    expect(heavenGlobalMult(0)).toBe(1);
    expect(heavenGlobalMult(10)).toBeCloseTo(1.2, 6);
  });

  it('soul amplifier raises the per-soul bonus: 0.10 + 0.002·HPF', () => {
    expect(soulBonusEff(0)).toBeCloseTo(SOUL_BONUS, 6);
    expect(soulBonusEff(50)).toBeCloseTo(0.2, 6); // 0.10 + 0.002·50
  });

  it('L1 (souls) and L2 (HPF) MULTIPLY the soul bonus, not add', () => {
    const souls = 100;
    const hpf = 50;
    // With the amplifier a soul is worth 0.20, not 0.10 — the effect compounds.
    const base = soulMult(souls, SOUL_BONUS); // 1 + 0.10·100 = 11
    const amplified = soulMult(souls, soulBonusEff(hpf)); // 1 + 0.20·100 = 21
    expect(amplified).toBeGreaterThan(base);
    expect(amplified).toBeCloseTo(21, 6);
  });
});

describe('heaven — Himmelfahrt banking (held-balance model)', () => {
  it('gates at 1 000 RS lifetime and banks the earned HPF', () => {
    const h0 = createHeaven();
    expect(canHimmelfahrt(h0, 999)).toBe(false);
    expect(canHimmelfahrt(h0, 1000)).toBe(true);
    expect(himmelfahrtGain(h0, 1_000_000)).toBe(31);

    const h1 = bankHimmelfahrt(h0, 1_000_000);
    expect(h1.hpf).toBe(31);
    expect(h1.hpfLifetime).toBe(31);
    expect(h1.ascensions2).toBe(1);
  });

  it('only banks NEW HPF beyond the lifetime total; spending is preserved', () => {
    const h1 = bankHimmelfahrt(createHeaven(), 1_000_000); // hpf 31
    const spent = buyTreeNode(h1, 'nachtschicht').heaven; // −10 ⇒ hpf 21
    expect(spent.hpf).toBe(21);
    // A second Himmelfahrt at the same RS earns nothing (no new lifetime HPF).
    expect(himmelfahrtGain(spent, 1_000_000)).toBe(0);
    // Deepen RS to 4e6 (√4000 ≈ 63) ⇒ +32 held, spending stays spent.
    const h2 = bankHimmelfahrt(spent, 4_000_000);
    expect(h2.hpfLifetime).toBe(hpfForRsLifetime(4_000_000));
    expect(h2.hpf).toBe(21 + (hpfForRsLifetime(4_000_000) - 31));
  });
});

describe('heaven — Himmelsbaum (spent HPF, permanent)', () => {
  it('buys node levels, spends HPF, enforces cost + max level', () => {
    const h = { ...createHeaven(), hpf: 60, hpfLifetime: 60 };
    const c1 = buyTreeNode(h, 'coach'); // costs 5
    expect(c1.bought).toBe(true);
    expect(c1.heaven.hpf).toBe(55);
    expect(treeLevel(c1.heaven, 'coach')).toBe(1);
    // Can't afford a node beyond held HPF.
    const broke = buyTreeNode({ ...createHeaven(), hpf: 4, hpfLifetime: 60 }, 'coach');
    expect(broke.bought).toBe(false);
  });

  it('coach cps 1→4, offline cap 8→16→24 h, Frühstarter 10 %, Ekstase +3 s', () => {
    const coach4 = { ...createHeaven(), tree: { coach: 4 } };
    expect(coachCps(coach4)).toBe(4);
    expect(offlineCapS({ ...createHeaven(), tree: { nachtschicht: 0 } })).toBe(8 * 3600);
    expect(offlineCapS({ ...createHeaven(), tree: { nachtschicht: 1 } })).toBe(16 * 3600);
    expect(offlineCapS({ ...createHeaven(), tree: { nachtschicht: 2 } })).toBe(24 * 3600);
    expect(fruhstarterFraction({ ...createHeaven(), tree: { fruhstarter: 1 } })).toBeCloseTo(
      0.1,
      6,
    );
    expect(ekstaseBonusMs({ ...createHeaven(), tree: { ekstaseausdauer: 3 } })).toBe(9000);
  });
});

// M10-AC5 (pure half): a Twerk-Coach clicks at 25 % of the click value.
describe('heaven — Twerk-Coach damage (§4.3.5)', () => {
  it('a coach deals cps · 25 % · clickDamage per second (no crit/beat)', () => {
    expect(coachDps(1000, 1)).toBe(250); // 1 cps × 25 % × 1000
    expect(coachDps(1000, 4)).toBe(1000); // 4 cps
    expect(coachDps(1000, 0)).toBe(0);
  });
});
