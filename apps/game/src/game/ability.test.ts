import { describe, expect, it } from 'vitest';

import {
  ABILITY_CHARGE_MAX,
  abilityOnClick,
  activate,
  canActivate,
  chargeFraction,
  createAbility,
  createFrenzyWindow,
  FRENZY_DURATION_MS,
  FRENZY_MULT,
  frenzyFraction,
  frenzyMult,
  frenzyWindowFraction,
  isFrenzyActive,
  trackFrenzyWindow,
} from './ability';

describe('abilityOnClick (charge meter)', () => {
  it('gains +1 per click and +2 on the beat, clamped at the max', () => {
    let a = createAbility();
    expect(a.charge).toBe(0);
    a = abilityOnClick(a, false);
    expect(a.charge).toBe(1);
    a = abilityOnClick(a, true);
    expect(a.charge).toBe(3);
    a = { ...a, charge: 99 };
    a = abilityOnClick(a, true); // 99 + 2 clamps to 100
    expect(a.charge).toBe(ABILITY_CHARGE_MAX);
  });
});

describe('activate / frenzy (spec §4.2.4 — ×10 for 12 s)', () => {
  it('cannot activate until the meter is full', () => {
    const half = { ...createAbility(), charge: 50 };
    expect(canActivate(half)).toBe(false);
    expect(activate(half, 1000)).toBe(half); // no-op
    const full = { ...createAbility(), charge: ABILITY_CHARGE_MAX };
    expect(canActivate(full)).toBe(true);
  });

  it('activating resets the meter and opens a 12 s ×10 window', () => {
    const now = 1_000_000;
    const full = { ...createAbility(), charge: ABILITY_CHARGE_MAX };
    const fired = activate(full, now);
    expect(fired.charge).toBe(0);
    expect(fired.frenzyUntil).toBe(now + FRENZY_DURATION_MS);
    expect(isFrenzyActive(fired, now)).toBe(true);
    expect(frenzyMult(fired, now)).toBe(FRENZY_MULT);
    expect(frenzyMult(fired, now + FRENZY_DURATION_MS - 1)).toBe(FRENZY_MULT);
    // At/after the end the multiplier drops back to 1.
    expect(frenzyMult(fired, now + FRENZY_DURATION_MS)).toBe(1);
    expect(isFrenzyActive(fired, now + FRENZY_DURATION_MS)).toBe(false);
  });

  it('reports charge + frenzy fractions for the UI', () => {
    expect(chargeFraction({ ...createAbility(), charge: 25 })).toBeCloseTo(0.25, 9);
    expect(chargeFraction({ ...createAbility(), charge: 999 })).toBe(1);
    const now = 5000;
    const fired = activate({ ...createAbility(), charge: ABILITY_CHARGE_MAX }, now);
    expect(frenzyFraction(fired, now)).toBeCloseTo(1, 9);
    expect(frenzyFraction(fired, now + FRENZY_DURATION_MS / 2)).toBeCloseTo(0.5, 6);
    expect(frenzyFraction(fired, now + FRENZY_DURATION_MS)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ROADMAP-V2 X2 — Countdown-Ring: das laufende Fenster tracken
// ---------------------------------------------------------------------------
describe('trackFrenzyWindow / frenzyWindowFraction (X2 — HUD-Countdown-Ring)', () => {
  it('ist ohne Ekstase leer und liefert dieselbe Referenz zurück', () => {
    const idle = createFrenzyWindow();
    expect(idle).toEqual({ until: 0, totalMs: 0 });
    expect(trackFrenzyWindow(idle, createAbility(), 1000)).toBe(idle);
    expect(frenzyWindowFraction(idle, 1000)).toBe(0);
  });

  it('misst die Fensterlänge beim ersten Frame und läuft sauber auf 0', () => {
    const now = 1_000_000;
    const fired = activate({ ...createAbility(), charge: ABILITY_CHARGE_MAX }, now);
    const win = trackFrenzyWindow(createFrenzyWindow(), fired, now);
    expect(win.totalMs).toBe(FRENZY_DURATION_MS);
    expect(frenzyWindowFraction(win, now)).toBe(1);
    expect(frenzyWindowFraction(win, now + FRENZY_DURATION_MS / 4)).toBeCloseTo(0.75, 9);
    expect(frenzyWindowFraction(win, now + FRENZY_DURATION_MS)).toBe(0);
    // Dasselbe Fenster in Folge-Frames: keine Neumessung, gleiche Referenz.
    expect(trackFrenzyWindow(win, fired, now + 3000)).toBe(win);
  });

  it('zählt eine VERLÄNGERTE Ekstase über ihre echte Dauer herunter', () => {
    const now = 500;
    const long = 30_000; // Ekstase-Ausdauer + Lava-Gear
    const fired = activate(
      { ...createAbility(), charge: ABILITY_CHARGE_MAX },
      now,
      undefined,
      long,
    );
    const win = trackFrenzyWindow(createFrenzyWindow(), fired, now);
    expect(win.totalMs).toBe(long);
    // `frenzyFraction` klebt hier sekundenlang bei 1 (es misst gegen 12 s) —
    // genau die Schwäche, für die der Ring sein eigenes Fenster mitführt.
    expect(frenzyFraction(fired, now + 15_000)).toBe(1);
    expect(frenzyWindowFraction(win, now + 15_000)).toBeCloseTo(0.5, 9);
  });

  it('schließt das Fenster am Ende und öffnet ein neues bei Re-Aktivierung', () => {
    const now = 0;
    const first = activate({ ...createAbility(), charge: ABILITY_CHARGE_MAX }, now);
    let win = trackFrenzyWindow(createFrenzyWindow(), first, now);
    win = trackFrenzyWindow(win, first, now + FRENZY_DURATION_MS);
    expect(win).toEqual({ until: 0, totalMs: 0 });
    const again = activate({ ...first, charge: ABILITY_CHARGE_MAX }, 50_000);
    win = trackFrenzyWindow(win, again, 50_000);
    expect(win.until).toBe(50_000 + FRENZY_DURATION_MS);
    expect(frenzyWindowFraction(win, 50_000)).toBe(1);
  });

  it('startet nach einem Reload MITTEN im Fenster bei voller Rest-Zeit', () => {
    // Save-Stand: die Ekstase läuft noch 4 s. Der Ring kennt die Vorgeschichte
    // nicht — er zeigt 100 % der VERBLEIBENDEN Zeit und zählt korrekt ab.
    const loaded = { ...createAbility(), frenzyUntil: 10_000 };
    const win = trackFrenzyWindow(createFrenzyWindow(), loaded, 6000);
    expect(win.totalMs).toBe(4000);
    expect(frenzyWindowFraction(win, 6000)).toBe(1);
    expect(frenzyWindowFraction(win, 8000)).toBeCloseTo(0.5, 9);
    expect(frenzyWindowFraction(win, 10_000)).toBe(0);
  });
});
