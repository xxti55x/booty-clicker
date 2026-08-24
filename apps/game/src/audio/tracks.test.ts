import { describe, expect, it } from 'vitest';

import { BOSS_TRACK, MUSIC_TRACKS, PATTERN_STEPS } from './tracks';
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

// Song-Umbau: jedes Theme trägt einen EIGENEN Hook statt eines Skalen-Durchlaufs.
describe('MUSIC_TRACKS — Hooks, Bass und Klangfarbe', () => {
  const keys: BackgroundKey[] = ['club', 'synth', 'beach', 'space'];
  const all = [...keys.map((k) => MUSIC_TRACKS[k]), BOSS_TRACK];

  it('gibt jedem Track ein volltaktiges Hook- und Bass-Muster', () => {
    for (const t of all) {
      expect(t.hook).toHaveLength(PATTERN_STEPS);
      expect(t.bass).toHaveLength(PATTERN_STEPS);
    }
  });

  it('hat in jedem Hook echte Töne UND echte Pausen (der Groove muss atmen)', () => {
    for (const t of all) {
      expect(t.hook.some((n) => n !== null)).toBe(true);
      expect(t.hook.some((n) => n === null)).toBe(true);
    }
  });

  it('macht die fünf Hooks paarweise unterscheidbar — kein Theme klingt wie das andere', () => {
    const sigs = all.map((t) => t.hook.join(','));
    expect(new Set(sigs).size).toBe(all.length);
  });

  it('hält jeden Ton in einer singbaren Lage (max. zwei Oktaven über dem Grundton)', () => {
    for (const t of all) {
      for (const n of [...t.hook, ...t.bass]) {
        if (n === null) continue;
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(24);
      }
    }
  });

  it('gibt jedem Track eine eigene Klangfarbe (Detune + Filter)', () => {
    for (const t of all) {
      expect(t.detune).toBeGreaterThan(0);
      expect(t.cutoff).toBeGreaterThan(400);
    }
    // Der Boss steht am dunklen Ende, Trance am offenen — das ist die Absicht.
    expect(BOSS_TRACK.cutoff).toBeLessThan(MUSIC_TRACKS.synth.cutoff);
    expect(BOSS_TRACK.detune).toBeGreaterThan(MUSIC_TRACKS.beach.detune);
  });
});
