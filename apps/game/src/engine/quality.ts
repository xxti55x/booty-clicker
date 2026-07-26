import type { Quality } from '../game/settings';

/** Renderer settings for a graphics preset (spec §5 M6). Pure — no THREE import. */
export interface QualityPreset {
  /** Upper bound applied to the device pixel ratio. */
  pixelRatioCap: number;
  /** Whether shadow mapping is enabled. */
  shadows: boolean;
  /** Textur-Anisotropie-Obergrenze (Roadmap T1) — real capped by the GPU. */
  anisotropy: number;
  /**
   * ROADMAP-V2 G1: Bühnen-Wechsel als animierte Aus-/Einfahrt der Insel-Gruppe.
   * `false` = Hard-Swap wie vor G1 (low-Preset: keine Bewegung, kein Kosten-Peak
   * durch den doppelt gehaltenen Szenen-Graph während der Ausfahrt).
   */
  stageTransition: boolean;
  /**
   * ROADMAP-V2 G2: Regie-Effekte des Boss-Auftritts (Licht-Dim + Kamera-Punch).
   * Das CSS-Banner und der Audio-Stinger hängen NICHT hieran — sie kosten nichts
   * und tragen die Information („welcher Boss?"), auch im low-Preset.
   */
  cinematics: boolean;
  /** ROADMAP-V2 G2: Partikel im Boss-Kill-Konfetti (0 = aus). */
  confetti: number;
}

const PRESETS: Record<Quality, QualityPreset> = {
  low: {
    pixelRatioCap: 1,
    shadows: false,
    anisotropy: 1,
    stageTransition: false,
    cinematics: false,
    confetti: 0,
  },
  medium: {
    pixelRatioCap: 1.5,
    shadows: true,
    anisotropy: 4,
    stageTransition: true,
    cinematics: true,
    confetti: 70,
  },
  high: {
    pixelRatioCap: 2,
    shadows: true,
    anisotropy: 8,
    stageTransition: true,
    cinematics: true,
    confetti: 130,
  },
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
