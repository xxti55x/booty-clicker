import { describe, expect, it } from 'vitest';

import { createFpsGovernor, pickQuality, stepDown } from './auto-quality';

describe('pickQuality — Signal-Wahl beim Boot (V2-2)', () => {
  it('Software-Rasterizer landet IMMER auf low — auch mit vielen Kernen', () => {
    expect(pickQuality({ mobile: false, cores: 16, gpu: 'Google SwiftShader' })).toBe('low');
    expect(pickQuality({ mobile: false, cores: 8, gpu: 'llvmpipe (LLVM 15.0.7, 256 bits)' })).toBe(
      'low',
    );
    expect(pickQuality({ mobile: true, cores: 2, gpu: 'Software Rasterizer' })).toBe('low');
  });

  it('Mobil ⇒ medium (PixelRatio-Deckel + kein Bloom), unabhängig von Kernen', () => {
    expect(pickQuality({ mobile: true, cores: 8, gpu: 'Apple GPU' })).toBe('medium');
    expect(pickQuality({ mobile: true, cores: 0, gpu: '' })).toBe('medium');
  });

  it('wenige Kerne ⇒ medium, unbekannte Kerne (0) trauen wir high zu', () => {
    expect(pickQuality({ mobile: false, cores: 4, gpu: 'NVIDIA GeForce RTX 3060' })).toBe('medium');
    expect(pickQuality({ mobile: false, cores: 0, gpu: 'NVIDIA GeForce RTX 3060' })).toBe('high');
  });

  it('Desktop mit echter GPU und Kernen ⇒ high', () => {
    expect(pickQuality({ mobile: false, cores: 12, gpu: 'AMD Radeon RX 6700' })).toBe('high');
  });

  it('stepDown: high → medium → low, low bleibt low', () => {
    expect(stepDown('high')).toBe('medium');
    expect(stepDown('medium')).toBe('low');
    expect(stepDown('low')).toBe('low');
  });
});

describe('createFpsGovernor — Laufzeit-Herabstufung (V2-2)', () => {
  /** `n` Frames à `ms` einspeisen; Zeit läuft real mit. */
  function feed(
    gov: ReturnType<typeof createFpsGovernor>,
    n: number,
    ms: number,
    t0: number,
  ): { drop: string | null; t: number } {
    let t = t0;
    for (let i = 0; i < n; i++) {
      t += ms;
      const d = gov.sample(ms, t);
      if (d !== null) return { drop: d, t };
    }
    return { drop: null, t };
  }

  it('stuft nach einem vollen Jank-Fenster GENAU eine Stufe herab', () => {
    const gov = createFpsGovernor('high', { windowFrames: 60, warmupMs: 0, cooldownMs: 0 });
    const r = feed(gov, 61, 30, 0); // 33 FPS — klar unter der 42-FPS-Schwelle
    expect(r.drop).toBe('medium');
  });

  it('flüssige Frames stufen NIE herab', () => {
    const gov = createFpsGovernor('high', { windowFrames: 60, warmupMs: 0 });
    expect(feed(gov, 600, 16.7, 0).drop).toBeNull();
  });

  it('die Warm-up-Schonfrist schluckt den Lade-Jank', () => {
    const gov = createFpsGovernor('high', { windowFrames: 60, warmupMs: 5000 });
    // 100 Ruckel-Frames à 30 ms = 3 s — alle innerhalb der Schonfrist.
    expect(feed(gov, 100, 30, 0).drop).toBeNull();
  });

  it('der Median ist robust gegen einzelne Spikes (GC), Dauer-Jank trippt', () => {
    const gov = createFpsGovernor('high', { windowFrames: 61, warmupMs: 0 });
    let t = 0;
    // 60 gute Frames + 1 Monster-Spike: Median bleibt gut ⇒ kein Trip.
    for (let i = 0; i < 60; i++) {
      t += 16.7;
      expect(gov.sample(16.7, t)).toBeNull();
    }
    t += 400;
    expect(gov.sample(400, t)).toBeNull();
  });

  it('Tab-Throttling (Sekunden-Frames) verwirft das Fenster statt zu trippen', () => {
    const gov = createFpsGovernor('high', { windowFrames: 10, warmupMs: 0 });
    let t = 0;
    for (let i = 0; i < 9; i++) {
      t += 30;
      expect(gov.sample(30, t)).toBeNull();
    }
    // Frame 10 wäre der Fenster-Schluss — aber er ist ein Throttle-Frame.
    t += 5000;
    expect(gov.sample(5000, t)).toBeNull();
    // Danach braucht es wieder ein VOLLES Fenster.
    for (let i = 0; i < 9; i++) {
      t += 30;
      expect(gov.sample(30, t)).toBeNull();
    }
    t += 30;
    expect(gov.sample(30, t)).toBe('medium');
  });

  it('zwei Stufen brauchen zwei Fenster + Abklingzeit, low ist der Boden', () => {
    const gov = createFpsGovernor('high', { windowFrames: 30, warmupMs: 0, cooldownMs: 1000 });
    const r1 = feed(gov, 31, 40, 0);
    expect(r1.drop).toBe('medium');
    // Direkt weiter janken: erst nach der Abklingzeit zählt ein neues Fenster.
    const r2 = feed(gov, 31, 40, r1.t);
    expect(r2.drop).toBeNull();
    const r3 = feed(gov, 62, 40, r1.t + 1000);
    expect(r3.drop).toBe('low');
    // Boden erreicht — noch so viel Jank stuft nicht weiter.
    expect(feed(gov, 200, 40, r3.t).drop).toBeNull();
  });

  it('ein Spieler-FPS-Limit macht lange Frames zur Absicht', () => {
    // 30-FPS-Cap ⇒ 33-ms-Frames sind GEWOLLT: Schwelle 33.3 × 1.35 ≈ 45 ms.
    const gov = createFpsGovernor('high', { windowFrames: 30, warmupMs: 0, capMs: 1000 / 30 });
    expect(feed(gov, 120, 34, 0).drop).toBeNull();
    // Echtes Jank UNTER dem Limit (50 ms ≈ 20 FPS) trippt weiterhin.
    expect(feed(gov, 31, 50, 10_000).drop).toBe('medium');
  });
});
