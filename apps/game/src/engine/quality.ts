import type { Quality } from '../game/settings';

/** Renderer settings for a graphics preset (spec §5 M6). Pure — no THREE import. */
export interface QualityPreset {
  /** Upper bound applied to the device pixel ratio. */
  pixelRatioCap: number;
  /** Whether shadow mapping is enabled. */
  shadows: boolean;
}

const PRESETS: Record<Quality, QualityPreset> = {
  low: { pixelRatioCap: 1, shadows: false },
  medium: { pixelRatioCap: 1.5, shadows: true },
  high: { pixelRatioCap: 2, shadows: true },
};

export function qualityPreset(q: Quality): QualityPreset {
  return PRESETS[q];
}

/**
 * Effective renderer pixel ratio for a preset given the device's own ratio.
 * Clamped to a sane [0.5, cap] window so a bogus devicePixelRatio can't wreck it.
 */
export function effectivePixelRatio(q: Quality, devicePixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(Math.max(dpr, 0.5), qualityPreset(q).pixelRatioCap);
}
