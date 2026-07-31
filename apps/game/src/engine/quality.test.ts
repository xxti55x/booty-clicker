import { describe, expect, it } from 'vitest';

import { effectivePixelRatio, qualityPreset } from './quality';

describe('quality presets', () => {
  it('low disables shadows and caps pixel ratio + anisotropy at 1', () => {
    expect(qualityPreset('low')).toEqual({
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
    });
  });

  // AAA-Toon-Pass: low spart die Per-Pixel-ALU (Software-Rasterizer), sonst an.
  it('low skips the toon rim/glint pass, medium/high run it', () => {
    expect(qualityPreset('low').toonFx).toBe(false);
    expect(qualityPreset('medium').toonFx).toBe(true);
    expect(qualityPreset('high').toonFx).toBe(true);
  });

  // Roadmap L / V2-1: NUR high zahlt den Bloom-Overlay-Pass (Blit + Blur-Kette).
  it('only high runs the V2-1 bloom overlay', () => {
    expect(qualityPreset('low').bloom).toBe(false);
    expect(qualityPreset('medium').bloom).toBe(false);
    expect(qualityPreset('high').bloom).toBe(true);
  });

  it('medium/high keep shadows with higher pixel-ratio + anisotropy caps', () => {
    expect(qualityPreset('medium').shadows).toBe(true);
    expect(qualityPreset('high').shadows).toBe(true);
    expect(qualityPreset('high').pixelRatioCap).toBe(2);
    // Roadmap T1: Anisotropie skaliert mit dem Preset (GPU deckelt real).
    expect(qualityPreset('medium').anisotropy).toBe(4);
    expect(qualityPreset('high').anisotropy).toBe(8);
  });

  // ROADMAP-V2 G1/G2: jeder neue Effekt hängt am Preset (Preset-Pflicht).
  it('low skips the G1 stage transition and the G2 cinematics/confetti', () => {
    const low = qualityPreset('low');
    expect(low.stageTransition).toBe(false);
    expect(low.cinematics).toBe(false);
    expect(low.confetti).toBe(0);
  });

  it('medium/high run the stage transition + cinematics, high throws more confetti', () => {
    for (const q of ['medium', 'high'] as const) {
      expect(qualityPreset(q).stageTransition).toBe(true);
      expect(qualityPreset(q).cinematics).toBe(true);
      expect(qualityPreset(q).confetti).toBeGreaterThan(0);
    }
    expect(qualityPreset('high').confetti).toBeGreaterThan(qualityPreset('medium').confetti);
  });

  // ROADMAP-V2 X2: der Deck-Puls des Ekstase-Fensters hängt am Preset.
  it('low skips the X2 deck pulse, medium/high run it', () => {
    expect(qualityPreset('low').ekstaseDeck).toBe(false);
    expect(qualityPreset('medium').ekstaseDeck).toBe(true);
    expect(qualityPreset('high').ekstaseDeck).toBe(true);
  });

  // ROADMAP-V2 G3: low halbiert die Ambient-Dichte, medium/high fahren voll.
  it('low halves the G3 ambient density, medium/high run it fully', () => {
    expect(qualityPreset('low').ambientLife).toBe(0.5);
    expect(qualityPreset('medium').ambientLife).toBe(1);
    expect(qualityPreset('high').ambientLife).toBe(1);
    for (const q of ['low', 'medium', 'high'] as const) {
      expect(qualityPreset(q).ambientLife).toBeGreaterThan(0);
      expect(qualityPreset(q).ambientLife).toBeLessThanOrEqual(1);
    }
  });

  it('caps the device pixel ratio to the preset', () => {
    expect(effectivePixelRatio('low', 3)).toBe(1);
    expect(effectivePixelRatio('medium', 3)).toBe(1.5);
    expect(effectivePixelRatio('high', 3)).toBe(2);
  });

  it('passes through a low device ratio unchanged (floored at 0.5)', () => {
    expect(effectivePixelRatio('high', 1)).toBe(1);
    expect(effectivePixelRatio('high', 0.25)).toBe(0.5);
  });

  it('falls back to 1 for a bogus device ratio', () => {
    expect(effectivePixelRatio('high', Number.NaN)).toBe(1);
    expect(effectivePixelRatio('high', 0)).toBe(1);
    expect(effectivePixelRatio('high', -2)).toBe(1);
  });
});
