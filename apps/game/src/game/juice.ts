/**
 * Juice tuning as data (spec §8.4/§8.5) — screen-shake magnitudes and combo
 * particle-burst sizes. Kept out of the glue so the feel is balanced by editing
 * data, and the small derivations are unit-tested. These are render-only knobs;
 * they never touch gameplay math (P1) or OrbitControls state (M4 rule).
 */

/** Screen-shake magnitude by combo tier (index 0..4): 0, 0, T2, T3, T4/Inferno. */
export const SHAKE_BY_TIER: readonly number[] = [0, 0, 0.2, 0.35, 0.5];
/** Shake on a crit click. */
export const SHAKE_CRIT = 0.35;
/** Shake while Twerk-Ekstase is active. */
export const SHAKE_FRENZY = 0.5;
/** Shake on a boss kill (the biggest). */
export const SHAKE_BOSS_KILL = 0.6;

/** Base particles per click burst. */
export const PARTICLE_BASE = 8;
/** Extra particles per combo tier (burst = base + tier · this). */
export const PARTICLE_PER_TIER = 6;

/** Screen-shake magnitude for a combo tier (0 below Tier 2). */
export function shakeForTier(tier: number): number {
  return SHAKE_BY_TIER[tier] ?? 0;
}

/** Particle burst size scaling with combo tier (spec §8.5: 8 + tier·6). */
export function burstCount(tier: number): number {
  return PARTICLE_BASE + Math.max(0, tier) * PARTICLE_PER_TIER;
}
