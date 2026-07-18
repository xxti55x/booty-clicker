import { describe, expect, it } from 'vitest';

import { burstCount, PARTICLE_BASE, SHAKE_BOSS_KILL, SHAKE_FRENZY, shakeForTier } from './juice';

describe('juice tuning (spec §8.4/§8.5)', () => {
  it('maps combo tiers to shake magnitudes (T2 0.2 · T3 0.35 · T4 0.5)', () => {
    expect(shakeForTier(0)).toBe(0);
    expect(shakeForTier(1)).toBe(0);
    expect(shakeForTier(2)).toBe(0.2);
    expect(shakeForTier(3)).toBe(0.35);
    expect(shakeForTier(4)).toBe(0.5);
    expect(shakeForTier(99)).toBe(0);
    // The frenzy / boss-kill accents outrank the combo tiers.
    expect(SHAKE_FRENZY).toBe(0.5);
    expect(SHAKE_BOSS_KILL).toBe(0.6);
  });

  it('scales the particle burst as 8 + tier·6, staying within the pool', () => {
    expect(burstCount(0)).toBe(PARTICLE_BASE);
    expect(burstCount(1)).toBe(14);
    expect(burstCount(4)).toBe(32);
    expect(burstCount(4)).toBeLessThanOrEqual(200); // fits the ParticleSystem pool
  });
});
