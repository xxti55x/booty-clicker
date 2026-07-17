import { describe, expect, it } from 'vitest';

import { MUSIC_TRACKS } from './tracks';
import type { BackgroundKey } from '../types';

describe('MUSIC_TRACKS', () => {
  const keys: BackgroundKey[] = ['club', 'synth', 'beach', 'space'];

  it('has a distinct track config for every background', () => {
    for (const k of keys) {
      const t = MUSIC_TRACKS[k];
      expect(t).toBeDefined();
      expect(t.bpm).toBeGreaterThan(0);
      expect(t.rootHz).toBeGreaterThan(0);
      expect(t.scale.length).toBeGreaterThan(0);
    }
  });

  it('scales contain only non-negative semitone offsets starting at the root', () => {
    for (const k of keys) {
      const s = MUSIC_TRACKS[k].scale;
      expect(s[0]).toBe(0);
      expect(s.every((n) => n >= 0)).toBe(true);
    }
  });
});
