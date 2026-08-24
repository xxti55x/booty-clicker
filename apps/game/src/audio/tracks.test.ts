import { describe, expect, it } from 'vitest';

import {
  BOSS_TRACK,
  MUSIC_TRACKS,
  PATTERN_STEPS,
  SONG_BARS,
  SONG_FORM,
  sectionAt,
  songSeconds,
} from './tracks';
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

// Song-Umbau: aus der Schleife ist ein STÜCK geworden — mehrere Melodie-
// Varianten, eine Form über 64 Takte, vier echte Subgenres.
describe('MUSIC_TRACKS — Hooks, Bass und Klangfarbe', () => {
  const keys: BackgroundKey[] = ['club', 'synth', 'beach', 'space'];
  const all = [...keys.map((k) => MUSIC_TRACKS[k]), BOSS_TRACK];

  it('gibt jedem Track drei Melodie-Varianten und zwei Bassfiguren', () => {
    for (const t of all) {
      expect(t.hooks).toHaveLength(3);
      expect(t.basses).toHaveLength(2);
      for (const h of t.hooks) expect(h).toHaveLength(PATTERN_STEPS);
      for (const b of t.basses) expect(b).toHaveLength(PATTERN_STEPS);
    }
  });

  it('macht die Varianten eines Tracks untereinander verschieden', () => {
    for (const t of all) {
      const sigs = t.hooks.map((h) => h.join(','));
      expect(new Set(sigs).size).toBe(t.hooks.length);
    }
  });

  it('macht auch die fünf Tracks paarweise unterscheidbar', () => {
    const sigs = all.map((t) => t.hooks.map((h) => h.join(',')).join('|'));
    expect(new Set(sigs).size).toBe(all.length);
  });

  it('hält jeden Ton in singbarer Lage (höchstens drei Oktaven über dem Grundton)', () => {
    for (const t of all) {
      for (const pat of [...t.hooks, ...t.basses]) {
        for (const x of pat) {
          if (x === null) continue;
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(36);
        }
      }
    }
  });

  it('ordnet jedem Theme sein eigenes Subgenre zu', () => {
    expect(MUSIC_TRACKS.club.genre).toBe('schranz');
    expect(MUSIC_TRACKS.synth.genre).toBe('bleep');
    expect(MUSIC_TRACKS.beach.genre).toBe('bounce');
    expect(MUSIC_TRACKS.space.genre).toBe('trance');
    expect(BOSS_TRACK.genre).toBe('hardcore');
    expect(new Set(all.map((t) => t.genre)).size).toBe(all.length);
  });

  it('gibt Bleep-Techno mehr Stille als Ton (die Lücken SIND das Genre)', () => {
    for (const h of MUSIC_TRACKS.synth.hooks) {
      const tones = h.filter((x) => x !== null).length;
      expect(tones).toBeLessThan(PATTERN_STEPS / 2);
    }
  });

  it('gibt jedem Track eine eigene Klangfarbe (Detune + Filter)', () => {
    for (const t of all) {
      expect(t.detune).toBeGreaterThan(0);
      expect(t.cutoff).toBeGreaterThan(400);
    }
    // Der Boss steht am dunkelsten Ende, Trance am offensten.
    expect(BOSS_TRACK.cutoff).toBeLessThan(MUSIC_TRACKS.space.cutoff);
    expect(BOSS_TRACK.detune).toBeGreaterThan(MUSIC_TRACKS.synth.detune);
  });
});

// Die Forderung war: mindestens ~1:30 je Stück, kein Copy-Paste von 24 Takten.
describe('SONG_FORM — die Länge und Dramaturgie eines Stücks', () => {
  const keys: BackgroundKey[] = ['club', 'synth', 'beach', 'space'];

  it('umfasst 64 Einheiten (= 128 Takte Musik) in acht Teilen', () => {
    expect(SONG_BARS).toBe(64);
    expect(SONG_FORM).toHaveLength(8);
  });

  // Die Forderung lautete: mindestens ~1:30 je Stück. Eine Einheit sind 16
  // Achtel — daran wird gerechnet, nicht an Vierteln (der erste Anlauf halbierte
  // die Länge und behauptete 1:41 statt der echten 3:22).
  it('dauert in JEDEM Tempo weit über 90 Sekunden', () => {
    for (const t of [...keys.map((k) => MUSIC_TRACKS[k]), BOSS_TRACK]) {
      expect(songSeconds(t.bpm)).toBeGreaterThanOrEqual(90);
    }
    // Konkret: der schnellste Track (Boss, 164 BPM) läuft gut drei Minuten.
    expect(Math.round(songSeconds(BOSS_TRACK.bpm))).toBe(187);
    expect(Math.round(songSeconds(MUSIC_TRACKS.synth.bpm))).toBe(244);
  });

  it('wiederholt sich nicht alle acht Takte: die Teile unterscheiden sich', () => {
    const sig = SONG_FORM.map((s) => `${s.hook}${s.bass}${s.drums}${s.octave}${s.open}`);
    // Mindestens sechs der acht Abschnitte sind zueinander verschieden.
    expect(new Set(sig).size).toBeGreaterThanOrEqual(6);
  });

  it('hat genau einen Breakdown und danach den Drop', () => {
    const i = SONG_FORM.findIndex((s) => s.drums === 'none');
    expect(i).toBeGreaterThan(0);
    expect(SONG_FORM.filter((s) => s.drums === 'none')).toHaveLength(1);
    // Direkt danach kommt der lauteste Teil: volle Drums, Oktave, offener Filter.
    const drop = SONG_FORM[i + 1]!;
    expect(drop.drums).toBe('full');
    expect(drop.octave).toBe(true);
    expect(drop.open).toBeGreaterThan(SONG_FORM[i]!.open);
    // Und der Breakdown kündigt ihn an.
    expect(SONG_FORM[i]!.riser).toBe(true);
  });

  it('findet zu jedem Takt den richtigen Abschnitt — auch zyklisch', () => {
    expect(sectionAt(0)).toBe(SONG_FORM[0]);
    expect(sectionAt(7)).toBe(SONG_FORM[0]);
    expect(sectionAt(8)).toBe(SONG_FORM[1]);
    expect(sectionAt(63)).toBe(SONG_FORM[7]);
    // Nach dem letzten Takt beginnt das Stück von vorn.
    expect(sectionAt(64)).toBe(SONG_FORM[0]);
    expect(sectionAt(-1)).toBe(SONG_FORM[7]);
  });
});
