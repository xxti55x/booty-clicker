import { describe, expect, it } from 'vitest';

import { CREW, GILD_DPS_MULT, gildMult, heroDps } from './heroes';
import {
  awardGildOnZone,
  createGilds,
  gildTargetFor,
  GILD_REASSIGN_RS,
  isGildZone,
  reassignGild,
  totalGilds,
} from './gild';
import { Rng } from '../util/rng';

describe('gild — targeting (deterministic)', () => {
  it('the same seed + cursor picks the same crew member', () => {
    const a = gildTargetFor(new Rng({ seed: 12345, cursor: 0 }));
    const b = gildTargetFor(new Rng({ seed: 12345, cursor: 0 }));
    expect(a).toBe(b);
    expect(CREW.some((c) => c.id === a)).toBe(true);
  });

  it('advancing the cursor draws a different sequence deterministically', () => {
    const rng = new Rng({ seed: 999, cursor: 0 });
    const first = gildTargetFor(rng); // cursor 0 → 1
    const second = gildTargetFor(rng); // cursor 1 → 2
    // Reproduce independently from the persisted cursors.
    expect(gildTargetFor(new Rng({ seed: 999, cursor: 0 }))).toBe(first);
    expect(gildTargetFor(new Rng({ seed: 999, cursor: 1 }))).toBe(second);
  });
});

describe('gild — awarding on 10-zones', () => {
  it('only 10-zones (10,20,30…) are gild milestones', () => {
    expect(isGildZone(10)).toBe(true);
    expect(isGildZone(20)).toBe(true);
    expect(isGildZone(9)).toBe(false);
    expect(isGildZone(11)).toBe(false);
    expect(isGildZone(5)).toBe(false);
    expect(isGildZone(0)).toBe(false);
  });

  it('grants exactly one gild to a valid member on a fresh 10-zone clear', () => {
    const rng = new Rng({ seed: 42, cursor: 0 });
    const gilds = awardGildOnZone(createGilds(), 20, false, rng);
    expect(totalGilds(gilds)).toBe(1);
    const [id, n] = Object.entries(gilds)[0];
    expect(CREW.some((c) => c.id === id)).toBe(true);
    expect(n).toBe(1);
  });

  it('never awards for an already-gilded 10-zone or a non-10-zone', () => {
    const rng = new Rng({ seed: 7, cursor: 0 });
    expect(awardGildOnZone({}, 20, true, rng)).toEqual({}); // already gilded
    expect(awardGildOnZone({}, 23, false, rng)).toEqual({}); // not a 10-zone
    expect(awardGildOnZone({}, 9, false, rng)).toEqual({}); // below the first
  });

  it('is deterministic: same seed ⇒ same awarded member', () => {
    const g1 = awardGildOnZone({}, 30, false, new Rng({ seed: 555, cursor: 3 }));
    const g2 = awardGildOnZone({}, 30, false, new Rng({ seed: 555, cursor: 3 }));
    expect(g1).toEqual(g2);
  });
});

describe('gild — reassignment', () => {
  it('moves one gild from a member to another', () => {
    const before = { boss: 2, dj: 1 };
    const after = reassignGild(before, 'boss', 'dj');
    expect(after).toEqual({ boss: 1, dj: 2 });
    expect(totalGilds(after)).toBe(totalGilds(before)); // count conserved
    expect(GILD_REASSIGN_RS).toBe(5);
  });

  it('prunes a member that reaches zero gilds', () => {
    expect(reassignGild({ boss: 1 }, 'boss', 'dj')).toEqual({ dj: 1 });
  });

  it('is a no-op when the source has no gild or from === to', () => {
    expect(reassignGild({ dj: 1 }, 'boss', 'dj')).toEqual({ dj: 1 });
    const g = { boss: 1 };
    expect(reassignGild(g, 'boss', 'boss')).toBe(g);
  });
});

describe('gild — DPS folding (×1.25^n)', () => {
  it('multiplies a member DPS by 1.25 per gild', () => {
    expect(GILD_DPS_MULT).toBe(1.25);
    expect(gildMult(0)).toBe(1);
    expect(gildMult(3)).toBeCloseTo(1.25 ** 3, 9);
    const cfg = CREW[0];
    expect(heroDps(cfg, 5, 2)).toBeCloseTo(heroDps(cfg, 5, 0) * 1.25 ** 2, 6);
  });
});
