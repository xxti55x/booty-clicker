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

  // ROADMAP-V2 X5: je Theme eine eigene zweite Instrumenten-Lage ab Ekstase.
  it('gibt jedem Theme eine EIGENE Ekstase-Lage (vier Themen, vier Lagen)', () => {
    const layers = keys.map((k) => MUSIC_TRACKS[k].ekstase);
    expect(new Set(layers).size).toBe(keys.length);
    expect(MUSIC_TRACKS.club.ekstase).toBe('stab');
    expect(MUSIC_TRACKS.synth.ekstase).toBe('arp');
    expect(MUSIC_TRACKS.beach.ekstase).toBe('steel');
    expect(MUSIC_TRACKS.space.ekstase).toBe('pad');
  });
});
