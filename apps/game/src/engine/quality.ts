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
  /**
   * ROADMAP-V2 X2: Deck-Emissive-Puls im Ekstase-Fenster. `false` = das Deck
   * bleibt ruhig (low-Preset) — der CSS-Rand-Glow, der Countdown-Ring am Button
   * und der Shimmy tragen das Fenster dann allein, sie kosten nichts.
   */
  ekstaseDeck: boolean;
  /**
   * ROADMAP-V2 G3: Dichte-Faktor der Ambient-Elemente je Bühne (Glühwürmchen,
   * Sternschnuppen, Möwen, Kometen, Publikum-Silhouetten). 1 = volle Dichte,
   * 0.5 = halbe (low-Preset), 0 = gar keins. Wirkt als Multiplikator auf die
   * Stückzahlen, nicht auf die Zahl der Materialien — ein Element mehr oder
   * weniger kostet keinen zusätzlichen Draw-Call.
   */
  ambientLife: number;
  /**
   * V2-1: Bloom als DISPLAY-SPACE-Overlay (Begründung + Messung im Kopf von
   * `engine/post.ts`) — nur `high` zahlt den Blit + die Blur-Kette samt
   * Grade/Vignette-Abschluss.
   */
  bloom: boolean;
  /**
   * AAA-Toon-Pass (Rim-Licht + Spekular-Glint in `materials.toonMat`): reine
   * Per-Pixel-ALU, aber auf einem Software-Rasterizer (low) ist genau die
   * teuer — low schaltet den globalen Uniform auf 0.
   */
  toonFx: boolean;
}

const PRESETS: Record<Quality, QualityPreset> = {
  low: {
    pixelRatioCap: 1,
    shadows: false,
    anisotropy: 1,
    stageTransition: false,
    cinematics: false,
    confetti: 0,
    ekstaseDeck: false,
    ambientLife: 0.5,
    bloom: false,
    toonFx: false,
  },
  medium: {
    pixelRatioCap: 1.5,
    shadows: true,
    anisotropy: 4,
    stageTransition: true,
    cinematics: true,
    confetti: 70,
    ekstaseDeck: true,
    ambientLife: 1,
    bloom: false,
    toonFx: true,
  },
  high: {
    pixelRatioCap: 2,
    shadows: true,
    anisotropy: 8,
    stageTransition: true,
    cinematics: true,
    confetti: 130,
    ekstaseDeck: true,
    ambientLife: 1,
    bloom: true,
    toonFx: true,
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
