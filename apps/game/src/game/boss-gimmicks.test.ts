import { describe, expect, it } from 'vitest';

import {
  BOSS_GIMMICKS,
  GIMMICK_HP_SCALE,
  SPACE_COMBO_SCALE,
  SPACE_DECAY_SCALE,
  SPOTLIGHT_S,
  SPOTLIGHT_TRIGGERS,
  SHIELD_WINDOW_PHASE,
  SYNTH_IDLE_FACTOR,
  WAVE_HEAL_FRACTION,
  WAVE_PERIOD_S,
  ZONES_PER_THEME,
  ZONE_THEMES,
  applyWaveHeal,
  bossHpScale,
  createGimmickRuntime,
  gimmickBossDamage,
  gimmickForZone,
  shieldWindowMs,
  spaceComboBonus,
  spaceComboExtra,
  spaceComboStep,
  spaceDecayFactor,
  spotlightActive,
  spotlightsDue,
  synthIdleFactor,
  themeForZone,
  tickGimmick,
  waveHealAmount,
} from './boss-gimmicks';
import { BEAT_PERIOD_PHASE, COMBO_CAP, ON_BEAT_WINDOW_MS, comboMult, isOnBeat } from './click';
import { BOSS_EVERY, bossHp, isBossZone, monsterHp, spawnFor } from './combat';
import { COMBO_WINDOW_S, comboStep, createCombo, decay } from './combo';

// ---------------------------------------------------------------------------
// Katalog + Theme-Rotation
// ---------------------------------------------------------------------------

describe('boss-gimmicks — Katalog & Theme-Rotation', () => {
  it('mirrors the one true 5-Bühnen-Rotation (club → synth → beach → space)', () => {
    // Der lokale `ZONES_PER_THEME` MUSS `BOSS_EVERY` sein (er steht nur deshalb
    // lokal, damit `combat.ts` dieses Modul zyklusfrei importieren kann).
    expect(ZONES_PER_THEME).toBe(BOSS_EVERY);
    expect([...ZONE_THEMES]).toEqual(['club', 'synth', 'beach', 'space']);
    expect(themeForZone(1)).toBe('club');
    expect(themeForZone(5)).toBe('club');
    expect(themeForZone(6)).toBe('synth');
    expect(themeForZone(10)).toBe('synth');
    expect(themeForZone(15)).toBe('beach');
    expect(themeForZone(20)).toBe('space');
    expect(themeForZone(21)).toBe('club'); // Runde 2
    expect(themeForZone(0)).toBe('club'); // defensiv geklemmt
  });

  it('gives exactly one gimmick per theme, only on boss gates', () => {
    expect(gimmickForZone(5)?.id).toBe('spotlight');
    expect(gimmickForZone(10)?.id).toBe('shield');
    expect(gimmickForZone(15)?.id).toBe('wave');
    expect(gimmickForZone(20)?.id).toBe('gravity');
    expect(gimmickForZone(25)?.id).toBe('spotlight'); // Rotation läuft weiter
    for (const z of [1, 2, 4, 6, 9, 11, 14, 19, 24]) {
      expect(isBossZone(z)).toBe(false);
      expect(gimmickForZone(z)).toBeNull();
    }
    expect(gimmickForZone(0)).toBeNull();
    expect(gimmickForZone(-5)).toBeNull();
    expect(gimmickForZone(Number.NaN)).toBeNull();
  });

  it('every catalog entry carries a German label + one-sentence explanation', () => {
    const ids = new Set<string>();
    for (const theme of ZONE_THEMES) {
      const g = BOSS_GIMMICKS[theme];
      expect(g.theme).toBe(theme);
      expect(g.label.length).toBeGreaterThan(3);
      expect(g.description.length).toBeGreaterThan(20);
      ids.add(g.id);
    }
    expect(ids.size).toBe(4); // vier verschiedene Mechaniken, kein Doppel
  });
});

// ---------------------------------------------------------------------------
// Ausdauer-Ausgleich (der Grund, warum die Anker halten)
// ---------------------------------------------------------------------------

describe('boss-gimmicks — Ausdauer-Ausgleich', () => {
  it('scales boss HP per gimmick and leaves non-boss zones untouched', () => {
    expect(bossHpScale(5)).toBe(GIMMICK_HP_SCALE.spotlight);
    expect(bossHpScale(10)).toBe(GIMMICK_HP_SCALE.shield);
    expect(bossHpScale(15)).toBe(GIMMICK_HP_SCALE.wave);
    expect(bossHpScale(20)).toBe(GIMMICK_HP_SCALE.gravity);
    expect(bossHpScale(7)).toBe(1);
    expect(bossHp(1)).toBe(monsterHp(1) * 10); // keine Boss-Bühne ⇒ rohe Kurve
  });

  it('feeds through to the real spawned boss', () => {
    const club = spawnFor(5, 10, 5);
    expect(club.boss).toBe(true);
    expect(club.hpMax).toBeCloseTo(monsterHp(5) * 10 * GIMMICK_HP_SCALE.spotlight, 9);
    const synth = spawnFor(10, 10, 10);
    expect(synth.hpMax).toBeCloseTo(monsterHp(10) * 10 * GIMMICK_HP_SCALE.shield, 9);
  });

  it('keeps every scale in a sane band (a gimmick pays for itself, it never trivialises)', () => {
    for (const v of Object.values(GIMMICK_HP_SCALE)) {
      expect(v).toBeGreaterThanOrEqual(0.5);
      expect(v).toBeLessThanOrEqual(1.1);
    }
    // Das Schild filtert build-unabhängig ⇒ sein Ausgleich MUSS knapp über dem
    // Beat-Anteil liegen (sonst wäre das Gate netto leichter als vorher).
    expect(GIMMICK_HP_SCALE.shield).toBeGreaterThan(SYNTH_IDLE_FACTOR);
    // Gravitation hilft ⇒ kein Rabatt.
    expect(GIMMICK_HP_SCALE.gravity).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Club „Spotlight-Phasen"
// ---------------------------------------------------------------------------

describe('boss-gimmicks — Club „Spotlight-Phasen"', () => {
  it('is due at ⅔ and ⅓ remaining Ausdauer, never above', () => {
    expect(SPOTLIGHT_TRIGGERS.length).toBe(2);
    expect(spotlightsDue(1)).toBe(0);
    expect(spotlightsDue(0.7)).toBe(0);
    expect(spotlightsDue(2 / 3)).toBe(1); // exakt auf der Kante zählt sie
    expect(spotlightsDue(0.5)).toBe(1);
    expect(spotlightsDue(1 / 3)).toBe(2);
    expect(spotlightsDue(0)).toBe(2);
    expect(spotlightsDue(Number.NaN)).toBe(0);
  });

  it('fires twice per fight, each for SPOTLIGHT_S seconds, and never a third time', () => {
    const g = gimmickForZone(5)!;
    let s = createGimmickRuntime();
    expect(spotlightActive(s)).toBe(false);

    // Über 70 % Rest-HP passiert nichts.
    let t = tickGimmick(s, g, 0.9, 1);
    s = t.state;
    expect(t.started).toBe(false);
    expect(t.spotlightShare).toBe(0);

    // Erste Phase zündet und läuft SPOTLIGHT_S Sekunden voll durch.
    t = tickGimmick(s, g, 0.6, 1);
    s = t.state;
    expect(t.started).toBe(true);
    expect(t.spotlightShare).toBe(1);
    for (let i = 1; i < SPOTLIGHT_S; i++) {
      t = tickGimmick(s, g, 0.6, 1);
      s = t.state;
      expect(t.started).toBe(false);
      expect(t.spotlightShare).toBe(1);
    }
    // …und ist danach vorbei (die Crew arbeitet wieder).
    t = tickGimmick(s, g, 0.6, 1);
    s = t.state;
    expect(t.spotlightShare).toBe(0);
    expect(spotlightActive(s)).toBe(false);

    // Zweite Phase bei ⅓.
    t = tickGimmick(s, g, 0.3, 1);
    s = t.state;
    expect(t.started).toBe(true);
    expect(s.phases).toBe(2);

    // Kein dritter Trigger, egal wie tief die Ausdauer fällt.
    for (let i = 0; i < 20; i++) {
      t = tickGimmick(s, g, 0.01, 1);
      s = t.state;
      expect(t.started).toBe(false);
    }
    expect(s.phases).toBe(2);
  });

  it('reports a partial share for a sub-second frame (the 60-fps path)', () => {
    const g = gimmickForZone(5)!;
    // Phase mit 0.1 s Rest, Frame von 0.4 s ⇒ ein Viertel des Frames im Licht.
    const s = { phases: 2, spotlightT: 0.1, healT: WAVE_PERIOD_S };
    const t = tickGimmick(s, g, 0.2, 0.4);
    expect(t.spotlightShare).toBeCloseTo(0.25, 9);
    expect(t.state.spotlightT).toBe(0);
  });

  it('pauses ONLY the idle term while lit', () => {
    const g = gimmickForZone(5)!;
    expect(gimmickBossDamage(g, { click: 30, idle: 70, spotlightShare: 1 })).toBe(30);
    expect(gimmickBossDamage(g, { click: 30, idle: 70, spotlightShare: 0 })).toBe(100);
    expect(gimmickBossDamage(g, { click: 30, idle: 70, spotlightShare: 0.5 })).toBe(65);
    // Out-of-range shares are clamped, never negative damage.
    expect(gimmickBossDamage(g, { click: 30, idle: 70, spotlightShare: 9 })).toBe(30);
    expect(gimmickBossDamage(g, { click: 30, idle: 70, spotlightShare: -3 })).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Synth „Schild-Takte"
// ---------------------------------------------------------------------------

describe('boss-gimmicks — Synth „Schild-Takte"', () => {
  it('derives the open-share from the REAL beat geometry', () => {
    expect(synthIdleFactor()).toBe(SYNTH_IDLE_FACTOR);
    expect(SYNTH_IDLE_FACTOR).toBeCloseTo((2 * SHIELD_WINDOW_PHASE) / BEAT_PERIOD_PHASE, 12);
    // Ein spürbarer, aber fairer Anteil: klar unter „steht immer offen".
    expect(SYNTH_IDLE_FACTOR).toBeGreaterThan(0.4);
    expect(SYNTH_IDLE_FACTOR).toBeLessThan(0.7);
  });

  it('keeps the window drive-INVARIANT (the whole reason it is measured in phase units)', () => {
    // Bei ruhender Choreo entspricht es dem ×1.4-fachen On-Beat-Fenster …
    const rest = 2.2; // PHASE_RATE_BASE
    expect(shieldWindowMs(rest)).toBeCloseTo(ON_BEAT_WINDOW_MS * 1.4, 9);
    // … und der ANTEIL bleibt gleich, egal wie schnell getanzt wird.
    for (const pps of [2.2, 4.4, 6.82]) {
      const openPhase = (shieldWindowMs(pps) / 1000) * pps;
      expect((2 * openPhase) / BEAT_PERIOD_PHASE).toBeCloseTo(SYNTH_IDLE_FACTOR, 9);
    }
    // Gear/Ahnen-Bonus weitet es (der Hebel, mit dem man sich rüstet).
    expect(shieldWindowMs(rest, 60)).toBeCloseTo(ON_BEAT_WINDOW_MS * 1.4 + 60, 9);
    expect(shieldWindowMs(0)).toBe(ON_BEAT_WINDOW_MS); // degenerierte Phase ⇒ Rückfall
  });

  it('lets an on-beat click through and bounces an off-beat one', () => {
    const pps = 2.2;
    const win = shieldWindowMs(pps);
    // Direkt auf dem Onset (Phase 0) ⇒ offen; eine halbe Beat-Periode daneben ⇒ zu.
    expect(isOnBeat(0, pps, win)).toBe(true);
    expect(isOnBeat(BEAT_PERIOD_PHASE / 2, pps, win)).toBe(false);
  });

  it('filters click AND idle with the same factor (build-independent)', () => {
    const g = gimmickForZone(10)!;
    expect(gimmickBossDamage(g, { click: 60, idle: 40 })).toBeCloseTo(100 * SYNTH_IDLE_FACTOR, 9);
    expect(gimmickBossDamage(g, { click: 10, idle: 90 })).toBeCloseTo(100 * SYNTH_IDLE_FACTOR, 9);
  });
});

// ---------------------------------------------------------------------------
// Beach „Wellen-Heilung"
// ---------------------------------------------------------------------------

describe('boss-gimmicks — Beach „Wellen-Heilung"', () => {
  it('heals WAVE_HEAL_FRACTION of MAX Ausdauer per wave', () => {
    expect(WAVE_HEAL_FRACTION).toBe(0.05);
    expect(waveHealAmount(1000)).toBe(50);
    expect(waveHealAmount(1000, 3)).toBe(150);
    expect(waveHealAmount(1000, 0)).toBe(0);
    expect(waveHealAmount(-5)).toBe(0);
    expect(waveHealAmount(1000, -2)).toBe(0);
  });

  it('never heals above max', () => {
    expect(applyWaveHeal(900, 1000, 50)).toBe(950);
    expect(applyWaveHeal(980, 1000, 50)).toBe(1000); // hart gedeckelt
    expect(applyWaveHeal(1000, 1000, 50)).toBe(1000);
    expect(applyWaveHeal(500, 1000, -99)).toBe(500); // negative Heilung ist keine
  });

  it('rolls exactly one wave per WAVE_PERIOD_S and keeps the phase', () => {
    const g = gimmickForZone(15)!;
    let s = createGimmickRuntime();
    let heals = 0;
    for (let t = 0; t < WAVE_PERIOD_S * 3; t++) {
      const r = tickGimmick(s, g, 0.8, 1);
      s = r.state;
      heals += r.heals;
    }
    expect(heals).toBe(3);
    // Ein einzelner Riesen-Schritt heilt entsprechend oft — aber gebunden.
    const big = tickGimmick(createGimmickRuntime(), g, 0.8, 10_000);
    expect(big.heals).toBeGreaterThan(1);
    expect(big.heals).toBeLessThanOrEqual(64);
  });

  it('does not touch the damage formula (the wave is HP-regen, not a filter)', () => {
    const g = gimmickForZone(15)!;
    expect(gimmickBossDamage(g, { click: 30, idle: 70 })).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Space „Gravitations-Combo"
// ---------------------------------------------------------------------------

describe('boss-gimmicks — Space „Gravitations-Combo"', () => {
  it('scales the combo BONUS, not the whole multiplier: 1 + (m − 1) × 1.5', () => {
    expect(SPACE_COMBO_SCALE).toBe(1.5);
    expect(spaceComboBonus(1)).toBe(1); // ohne Combo kein Geschenk
    expect(spaceComboBonus(1.2)).toBeCloseTo(1.3, 9); // am Cap: ×1.2 → ×1.3
    expect(spaceComboBonus(2)).toBeCloseTo(2.5, 9);
    expect(spaceComboBonus(0.5)).toBe(1); // unter 1 geklemmt
  });

  it('spaceComboExtra lifts the click pipeline exactly onto that bonus', () => {
    for (const stacks of [0, 1, 10, COMBO_CAP, 500]) {
      const cm = comboMult(stacks);
      expect(cm * spaceComboExtra(stacks)).toBeCloseTo(spaceComboBonus(cm), 12);
    }
    expect(spaceComboExtra(0)).toBe(1); // ohne Stacks ändert sich nichts
  });

  it('decays twice as fast — but only AFTER the grace window', () => {
    expect(spaceDecayFactor(true)).toBe(SPACE_DECAY_SCALE);
    expect(spaceDecayFactor(false)).toBe(1);
    // Innerhalb des Fensters: identisch zu `comboStep` (das Fenster ist kein Verfall).
    const fresh = { ...createCombo(40), window: COMBO_WINDOW_S };
    expect(spaceComboStep(fresh, 1)).toEqual(comboStep(fresh, 1));
    // Danach: exakt der Verfall der doppelten Zeit.
    const stale = { stacks: 40, window: 0 };
    const grav = spaceComboStep(stale, 2);
    expect(grav.stacks).toBeCloseTo(decay(40, 4), 12);
    expect(grav.stacks).toBeLessThan(comboStep(stale, 2).stacks);
    expect(spaceComboStep(stale, 0)).toBe(stale); // kein Schritt, keine Kopie
  });

  it('raises only the click term in the bot formula', () => {
    const g = gimmickForZone(20)!;
    const cm = comboMult(COMBO_CAP);
    const out = gimmickBossDamage(g, { click: 60, idle: 40, comboMult: cm });
    expect(out).toBeCloseTo(60 * (spaceComboBonus(cm) / cm) + 40, 9);
    expect(out).toBeGreaterThan(100); // das einzige Gimmick, das HILFT
    // Ohne Combo (casual-Bot) ist es exakt neutral.
    expect(gimmickBossDamage(g, { click: 60, idle: 40, comboMult: 1 })).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Laufzeit-Zustand + Sekunden-Formel (die sim.ts-Schnittstelle)
// ---------------------------------------------------------------------------

describe('boss-gimmicks — Laufzeit-Zustand & Sekunden-Formel', () => {
  it('starts a fresh fight with no phase and a full wave clock', () => {
    const s = createGimmickRuntime();
    expect(s).toEqual({ phases: 0, spotlightT: 0, healT: WAVE_PERIOD_S });
    expect(spotlightActive(s)).toBe(false);
  });

  it('is a no-op without a gimmick or without elapsed time', () => {
    const s = createGimmickRuntime();
    const none = tickGimmick(s, null, 0.2, 1);
    expect(none.state).toBe(s);
    expect(none.heals).toBe(0);
    expect(none.spotlightShare).toBe(0);
    const still = tickGimmick(s, gimmickForZone(15), 0.2, 0);
    expect(still.state).toBe(s);
    expect(still.heals).toBe(0);
  });

  it('falls back to raw damage without a gimmick and never goes negative', () => {
    expect(gimmickBossDamage(null, { click: 30, idle: 70 })).toBe(100);
    expect(gimmickBossDamage(null, { click: -30, idle: -70 })).toBe(0);
  });

  it('shield/spotlight can only ever REDUCE, gravity only ever RAISE', () => {
    const raw = 100;
    for (const zone of [5, 10, 15]) {
      const g = gimmickForZone(zone)!;
      const out = gimmickBossDamage(g, { click: 45, idle: 55, spotlightShare: 1, comboMult: 1.2 });
      expect(out).toBeLessThanOrEqual(raw);
    }
    const grav = gimmickForZone(20)!;
    expect(gimmickBossDamage(grav, { click: 45, idle: 55, comboMult: 1.2 })).toBeGreaterThanOrEqual(
      raw,
    );
  });
});
