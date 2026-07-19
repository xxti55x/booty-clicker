import { describe, expect, it } from 'vitest';

import { Choreographer, MOVES, POSE_KEYS, zeroPose } from './moves';

describe('choreo moves — the completed set', () => {
  it('ships eight distinct routines with positive durations', () => {
    expect(MOVES.length).toBe(8);
    expect(new Set(MOVES.map((m) => m.name)).size).toBe(MOVES.length);
    for (const m of MOVES) expect(m.dur).toBeGreaterThan(0);
  });

  it('every move yields finite, bounded values on every channel over a full sweep', () => {
    for (const m of MOVES) {
      for (let i = 0; i <= 64; i++) {
        const ph = (i / 64) * Math.PI * 8; // several loops, incl. awkward phases
        for (const e of [0.85, 0.97, 1.57]) {
          const p = m.fn(ph, e);
          for (const k of POSE_KEYS) {
            expect(Number.isFinite(p[k]), `${m.name}.${k} @ph=${ph}`).toBe(true);
            // joints stay in a sane articulation range (radians / units)
            expect(Math.abs(p[k]), `${m.name}.${k} @ph=${ph}`).toBeLessThanOrEqual(3.5);
          }
        }
      }
    }
  });

  it('every move animates hips AND arms AND head (no frozen limbs)', () => {
    for (const m of MOVES) {
      const min = zeroPose();
      const max = zeroPose();
      for (const k of POSE_KEYS) {
        min[k] = Infinity;
        max[k] = -Infinity;
      }
      for (let i = 0; i <= 96; i++) {
        const p = m.fn((i / 96) * Math.PI * 6, 1);
        for (const k of POSE_KEYS) {
          min[k] = Math.min(min[k], p[k]);
          max[k] = Math.max(max[k], p[k]);
        }
      }
      const moves = (k: (typeof POSE_KEYS)[number]): boolean => max[k] - min[k] > 0.02;
      // hips: any hip channel or the root bounces
      expect(
        moves('hipX') || moves('hipZ') || moves('hipPosX') || moves('hipPosZ') || moves('rootY'),
        `${m.name}: hips/root frozen`,
      ).toBe(true);
      // arms: at least one arm channel is alive
      expect(
        moves('armLZ') || moves('armRZ') || moves('armLX') || moves('armRX') || moves('elbL'),
        `${m.name}: arms frozen`,
      ).toBe(true);
      // head: nod or tilt
      expect(moves('headX') || moves('headZ'), `${m.name}: head frozen`).toBe(true);
    }
  });

  it('the Choreographer cycles through all moves and wraps', () => {
    const c = new Choreographer();
    const seen: string[] = [];
    c.onMove = (n) => seen.push(n);
    for (let i = 1; i <= MOVES.length; i++) c.setMove(i);
    expect(seen.length).toBe(MOVES.length);
    expect(c.moveIdx).toBe(0); // wrapped back to the first move
  });
});
