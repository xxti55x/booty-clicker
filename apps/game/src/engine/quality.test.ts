import { describe, expect, it } from 'vitest';

import { effectivePixelRatio, qualityPreset } from './quality';

describe('quality presets', () => {
  it('low disables shadows and caps pixel ratio at 1', () => {
    expect(qualityPreset('low')).toEqual({ pixelRatioCap: 1, shadows: false });
  });

  it('medium/high keep shadows with higher pixel-ratio caps', () => {
    expect(qualityPreset('medium').shadows).toBe(true);
    expect(qualityPreset('high').shadows).toBe(true);
    expect(qualityPreset('high').pixelRatioCap).toBe(2);
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
