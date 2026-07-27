/**
 * Boss-Gimmicks pro Theme (ROADMAP-V2 A2) — pur, DOM-frei, save-frei.
 *
 * Bisher unterschieden sich Bosse NUR in Ausdauer (`bossHp`). Jetzt trägt jedes
 * der vier Bühnen-Themen genau EINEN Mechanik-Twist, der an seinem Boss-Gate
 * greift — so scheitert man an einer MECHANIK und rüstet gezielt dagegen:
 *
 *  · **Club** „Spotlight-Phasen" — zweimal im Kampf (bei ⅔ und ⅓ Rest-Ausdauer)
 *    fällt für `SPOTLIGHT_S` Sekunden die Crew aus: nur Klick-Schaden zählt.
 *  · **Synth** „Schild-Takte" — der Boss ist immun, außer im Beat-Fenster.
 *  · **Beach** „Wellen-Heilung" — alle `WAVE_PERIOD_S` s heilt er
 *    `WAVE_HEAL_FRACTION` seiner Max-Ausdauer (nie über Max): der DPS-Check.
 *  · **Space** „Gravitations-Combo" — die Combo verfällt doppelt so schnell,
 *    zählt dafür anderthalbfach.
 *
 * Jeder Boss BEZAHLT seinen Trick in Ausdauer (`GIMMICK_HP_SCALE`): ein Gimmick
 * verteilt die Schwierigkeit um (welcher Build kommt durch?), statt sie stumpf
 * nach oben zu schrauben — sonst hätte ein 30-s-Gate mit weniger Wirkung die
 * ganze Progressions-Wand um Bühnen verschoben (gemessen, siehe DECISIONS.md).
 *
 * Alles hier ist REINE Rechnung: der Katalog ist Daten, die Helfer sind
 * seiteneffektfrei, und der Kampf-Zustand (`GimmickRuntime`) ist ein kleiner
 * transienter Laufzeit-Wert — er steht bewusst NICHT im `CombatState` und damit
 * auch nicht im Save (das Save trägt nur `zone`/`killsThisZone`, der Rest wird
 * beim Laden frisch gespawnt). Kein Schema-Bump, keine Migration, keine Fixture.
 *
 * Glue (main.ts) und Balance-Bot (sim.ts) rufen dieselben Funktionen — die
 * Mechanik kann zwischen Spiel und Anker-Lauf nicht auseinanderlaufen.
 */
import type { BackgroundKey } from '../types';
import { BEAT_PERIOD_PHASE, ON_BEAT_WINDOW_MS, PHASE_RATE_BASE, comboMult } from './click';
import { type ComboState, decay } from './combo';

// ---------------------------------------------------------------------------
// Bühnen-Theme (eine Quelle für Kulisse, Zonen-Strip und Gimmick)
// ---------------------------------------------------------------------------

/** Die Themen in Rotations-Reihenfolge. */
export const ZONE_THEMES: readonly BackgroundKey[] = ['club', 'synth', 'beach', 'space'];
/**
 * Bühnen je Theme. Deckungsgleich mit `combat.BOSS_EVERY` — jeder Theme-Wechsel
 * liegt hinter einem Boss-Gate. Der Wert steht hier bewusst LOKAL (statt aus
 * `combat.ts` importiert), damit `combat.ts` seinerseits `bossHpScale` importieren
 * kann, ohne einen Import-Zyklus zu bauen; ein Test pinnt die Gleichheit fest.
 */
export const ZONES_PER_THEME = 5;

/**
 * Das Theme einer Bühne. EINE Quelle für die Kulissen-Auto-Rotation (main.ts),
 * die Rivalen-Namen + Insel-Thumbnails (ch-hud.ts) und die Boss-Gimmicks hier —
 * vorher stand dieselbe Formel dreimal im Code.
 */
export function themeForZone(zone: number): BackgroundKey {
  const idx = Math.floor(Math.max(0, zone - 1) / ZONES_PER_THEME) % ZONE_THEMES.length;
  return ZONE_THEMES[idx];
}

// ---------------------------------------------------------------------------
// Katalog (Daten, keine Logik)
// ---------------------------------------------------------------------------

export type GimmickId = 'spotlight' | 'shield' | 'wave' | 'gravity';

export interface BossGimmick {
  readonly id: GimmickId;
  readonly theme: BackgroundKey;
  /** Kurz-Label: dauerhaft an der Boss-HP-Bar + als Zeile unter dem Auftritts-Banner. */
  readonly label: string;
  /** Ein Satz — was die Mechanik vom Spieler verlangt. */
  readonly description: string;
}

export const BOSS_GIMMICKS: Record<BackgroundKey, BossGimmick> = {
  club: {
    id: 'spotlight',
    theme: 'club',
    label: '🔦 Nur Klicks!',
    description: 'Spotlight-Phasen: zweimal im Kampf zählen 4 s lang NUR deine Klicks.',
  },
  synth: {
    id: 'shield',
    theme: 'synth',
    label: '🛡 Im Takt treffen!',
    description: 'Schild-Takte: außerhalb des Beat-Fensters prallt alles ab.',
  },
  beach: {
    id: 'wave',
    theme: 'beach',
    label: '🌊 Heilt alle 10 s!',
    description: 'Wellen-Heilung: alle 10 s holt er 5 % seiner Ausdauer zurück.',
  },
  space: {
    id: 'gravity',
    theme: 'space',
    label: '🌀 Combo zählt ×1.5!',
    description: 'Gravitations-Combo: sie verfällt doppelt so schnell, zählt aber ×1.5.',
  },
};

/** Das Gimmick eines Boss-Gates — `null` auf jeder Nicht-Boss-Bühne. */
export function gimmickForZone(zone: number): BossGimmick | null {
  if (!Number.isFinite(zone) || zone < 1 || zone % ZONES_PER_THEME !== 0) return null;
  return BOSS_GIMMICKS[themeForZone(zone)];
}

/**
 * **Ausdauer-Ausgleich je Gimmick** — der Grund, warum die Gimmicks die
 * Balance-Anker nicht sprengen.
 *
 * Ein Gimmick nimmt dem DURCHSCHNITTS-Build Wirkung weg (die Crew pausiert, das
 * Schild filtert, die Welle heilt zurück). Ohne Gegengewicht wäre jedes Gate
 * schlicht härter — und weil ein Boss-Gate eine 30-s-Zeitschranke ist, verschiebt
 * schon ein Zehntel weniger Wirkung die Wand um Bühnen (gemessen: das
 * ungedämpfte Paket sperrte die casual-Anker komplett aus, siehe DECISIONS).
 * Deshalb trägt ein Gimmick-Boss WENIGER Ausdauer, ziemlich genau um den Anteil,
 * den sein Trick dem Durchschnitts-Build kostet:
 *
 *   erforderliche Gesamt-Power ≈ unverändert · Verteilung = neu
 *
 * Das Gimmick verschiebt also, WIE man kämpft, nicht WIE VIEL Power die Wand
 * verlangt. Wer sich anpasst (im Takt klicken, im Spotlight klicken, gegen die
 * Welle bursten), kommt LEICHTER durch als vorher; wer stur am falschen Build
 * festhält, härter — genau die Lese-Tiefe, die A2 wollte. Die Faktoren sind
 * gemessen, nicht geschätzt (Kalibrier-Lauf in DECISIONS.md).
 */
export const GIMMICK_HP_SCALE: Record<GimmickId, number> = {
  // 2×4 s ohne Crew von der 30-s-Schranke ⇒ ~27 % des IDLE-Anteils. Für einen
  // reinen Idler (Idle ≈ 85 %) sind das ~23 % ⇒ 0.78 ist dort neutral; ein
  // Klick-Build (Idle ≈ 40 %) verliert nur ~11 % und kommt ~13 % LEICHTER durch.
  spotlight: 0.78,
  // Das Schild filtert Klick UND Idle mit demselben `SYNTH_IDLE_FACTOR` (0.554),
  // ist also build-unabhängig — 0.554 wäre exakt neutral. 0.57 lässt bewusst
  // ~3 % Biss stehen; wer im Takt trifft (Klicks voll) kommt ~30 % leichter durch.
  shield: 0.57,
  // 5 %/10 s ⇒ über die 30-s-Schranke ~15 % zusätzlich. 0.87 ist dort neutral;
  // ein Kampf, der LÄNGER dauert, wird echt teurer — genau der DPS-Check.
  wave: 0.87,
  // Das einzige Gimmick, das HILFT — aber nur MIT Combo. Ein Ausgleich > 1 würde
  // jeden Spieler ohne Combo (und jeden no-juice-Bot) stumpf bestrafen, also 1.0:
  // Gravitation ist reine Belohnung fürs Combo-Halten.
  gravity: 1.0,
};

/** Ausdauer-Faktor des Bosses dieser Bühne (1 ohne Gimmick). */
export function bossHpScale(zone: number): number {
  const g = gimmickForZone(zone);
  return g === null ? 1 : GIMMICK_HP_SCALE[g.id];
}

// ---------------------------------------------------------------------------
// Club „Spotlight-Phasen"
// ---------------------------------------------------------------------------

/**
 * Rest-Ausdauer-Anteile, bei deren Unterschreiten je eine Spotlight-Phase
 * zündet (absteigend). Zwei Phasen pro Kampf — je eine im zweiten und dritten
 * Drittel, damit der Twist den Kampf teilt statt ihn zu eröffnen.
 */
export const SPOTLIGHT_TRIGGERS: readonly number[] = [2 / 3, 1 / 3];
/**
 * Dauer einer Spotlight-Phase in Sekunden. ROADMAP-V2 skizzierte 5 s; der
 * Kalibrier-Lauf zeigte, dass 2×5 s selbst mit Ausdauer-Ausgleich den
 * Erste-Himmelfahrt-Anker über sein Fenster schiebt (19.7 h vs. 19.4 h Obergrenze),
 * 2×4 s dagegen alle Anker im Fenster hält (18.3 h). Gemessen, nicht geraten.
 */
export const SPOTLIGHT_S = 4;

/** Wie viele Spotlight-Phasen bei diesem Rest-HP-Anteil fällig sind (0…2). */
export function spotlightsDue(hpFraction: number): number {
  if (!Number.isFinite(hpFraction)) return 0;
  let n = 0;
  for (const t of SPOTLIGHT_TRIGGERS) if (hpFraction <= t) n++;
  return n;
}

/** Läuft gerade eine Spotlight-Phase? */
export function spotlightActive(state: GimmickRuntime): boolean {
  return state.spotlightT > 0;
}

// ---------------------------------------------------------------------------
// Synth „Schild-Takte"
// ---------------------------------------------------------------------------

/**
 * Halbe Fensterbreite des Schilds bei RUHENDER Choreo, in ms. Das ist die
 * bestehende On-Beat-Fensterbreite (`ON_BEAT_WINDOW_MS` = 100 ms) mal
 * `SHIELD_WINDOW_SCALE` — auf 1.4 gemessen, damit das Schild spürbar filtert,
 * ohne die Anker zu sprengen (siehe `GIMMICK_HP_SCALE`).
 */
export const SHIELD_WINDOW_SCALE = 1.4;

/**
 * Dieselbe halbe Fensterbreite in PHASEN-Einheiten (nicht in ms!) — und genau
 * DAS ist der Trick.
 *
 * `isOnBeat` misst den ZEIT-Abstand zum nächsten Beat, die Beats laufen aber mit
 * dem Klick-„drive" schneller (`phaseVelocity`): bei vollem Drive (6) liegt der
 * maximale Abstand zum nächsten Onset bei ~82 ms und damit KOMPLETT im
 * ±100-ms-Fenster — ein fest in ms gesetztes Schild stünde für jeden hart
 * klickenden Spieler dauerhaft offen. In Phasen-Einheiten festgehalten ist das
 * Fenster drive-invariant: relativ zum Takt immer gleich breit, egal wie schnell
 * getanzt wird.
 */
export const SHIELD_WINDOW_PHASE =
  (ON_BEAT_WINDOW_MS / 1000) * PHASE_RATE_BASE * SHIELD_WINDOW_SCALE;

/**
 * Anteil der Zeit, in dem das Schild offen steht: Fensterbreite ÷ Beat-Dauer
 * = 2 · 0.308 · 0.9 ≈ **0.554**. Damit rechnen (a) der Idle-Anteil im Spiel
 * (die Crew trommelt gleichverteilt, trifft also nur diesen Bruchteil) und
 * (b) der Bot in `sim.ts` — dort auch für die Klicks, weil der Bot NICHT
 * getaktet klickt (siehe `gimmickBossDamage`).
 */
export const SYNTH_IDLE_FACTOR = Math.min(1, (2 * SHIELD_WINDOW_PHASE) / BEAT_PERIOD_PHASE);

/** Der konstante Beat-Anteil, mit dem ungetakteter Schaden am Schild-Boss ankommt. */
export function synthIdleFactor(): number {
  return SYNTH_IDLE_FACTOR;
}

/**
 * Das Schild-Fenster in ms für die aktuelle Phasen-Geschwindigkeit — direkt in
 * `isOnBeat` einsetzbar. `bonusMs` (Beatrix, Neon-Gear, DJ-Fähigkeit) weitet es
 * wie beim normalen On-Beat-Fenster: genau der Hebel, mit dem man sich gegen
 * die Mechanik ausrüstet.
 */
export function shieldWindowMs(phasePerSecond: number, bonusMs = 0): number {
  const extra = Math.max(0, bonusMs);
  if (!(phasePerSecond > 0)) return ON_BEAT_WINDOW_MS + extra;
  return (SHIELD_WINDOW_PHASE / phasePerSecond) * 1000 + extra;
}

// ---------------------------------------------------------------------------
// Beach „Wellen-Heilung"
// ---------------------------------------------------------------------------

/** Sekunden zwischen zwei Wellen. */
export const WAVE_PERIOD_S = 10;
/** Anteil der MAX-Ausdauer, den eine Welle zurückholt. */
export const WAVE_HEAL_FRACTION = 0.05;

/** Geheilte Ausdauer für `heals` Wellen (nie negativ). */
export function waveHealAmount(hpMax: number, heals = 1): number {
  return Math.max(0, hpMax) * WAVE_HEAL_FRACTION * Math.max(0, heals);
}

/** Heilung auftragen — hart auf die Max-Ausdauer gedeckelt. */
export function applyWaveHeal(hp: number, hpMax: number, amount: number): number {
  return Math.min(hpMax, hp + Math.max(0, amount));
}

// ---------------------------------------------------------------------------
// Space „Gravitations-Combo"
// ---------------------------------------------------------------------------

/** Der Combo-ANTEIL des Schadens zählt am Space-Boss anderthalbfach. */
export const SPACE_COMBO_SCALE = 1.5;
/** …dafür verfällt die Combo doppelt so schnell. */
export const SPACE_DECAY_SCALE = 2;

/**
 * Effektiver Combo-Multiplikator am Space-Boss:
 * **`1 + (comboMult − 1) × 1.5`** — skaliert wird der BONUS-Anteil, nicht der
 * ganze Multiplikator (×1.5 auf `comboMult` selbst wäre ein flacher +50 %-
 * Schadensbonus, den man ganz ohne Combo bekäme; so zahlt sich die Combo aus).
 * Am Combo-Cap (`comboMult` = ×1.2) werden daraus ×1.3.
 */
export function spaceComboBonus(mult: number): number {
  return 1 + (Math.max(1, mult) - 1) * SPACE_COMBO_SCALE;
}

/**
 * Der Faktor, mit dem `effectiveClick`s eingebauter `comboMult(stacks)` auf den
 * Gravitations-Bonus gehoben wird — gehört in `extraMult`, damit die
 * Klick-Pipeline unangetastet bleibt.
 */
export function spaceComboExtra(stacks: number): number {
  const cm = comboMult(stacks);
  return cm > 0 ? spaceComboBonus(cm) / cm : 1;
}

/** Verfalls-Faktor: ×2 während eines Space-Boss-Kampfes, sonst ×1. */
export function spaceDecayFactor(active: boolean): number {
  return active ? SPACE_DECAY_SCALE : 1;
}

/**
 * Combo-Schritt unter Gravitation: das Gnaden-Fenster läuft normal ab (es ist
 * kein Verfall), die Zeit DANACH zählt doppelt. Gleiche Signatur/Semantik wie
 * `comboStep`, damit die Glue nur die Funktion tauscht.
 */
export function spaceComboStep(state: ComboState, dt: number, reduction = 0): ComboState {
  if (!(dt > 0)) return state;
  const window = state.window - dt;
  if (window >= 0) return { stacks: state.stacks, window };
  return { stacks: decay(state.stacks, -window * SPACE_DECAY_SCALE, reduction), window: 0 };
}

// ---------------------------------------------------------------------------
// Laufzeit-Zustand EINES Boss-Kampfes (transient, nie persistiert)
// ---------------------------------------------------------------------------

export interface GimmickRuntime {
  /** Bereits gezündete Spotlight-Phasen dieses Kampfes (0…2). */
  phases: number;
  /** Restlaufzeit der laufenden Spotlight-Phase in Sekunden (0 = keine). */
  spotlightT: number;
  /** Sekunden bis zur nächsten Welle. */
  healT: number;
}

/** Frischer Kampf: keine Phase gezündet, erste Welle in `WAVE_PERIOD_S`. */
export function createGimmickRuntime(): GimmickRuntime {
  return { phases: 0, spotlightT: 0, healT: WAVE_PERIOD_S };
}

export interface GimmickTick {
  state: GimmickRuntime;
  /** Anteil von `dt`, in dem die Spotlight-Phase lief (0…1) — der Idle-Ausfall. */
  spotlightShare: number;
  /** Läuft am ENDE des Schritts eine Phase? (nur für den UI-Look) */
  spotlight: boolean;
  /** Wie oft in diesem Schritt eine Welle geheilt hat. */
  heals: number;
  /** Zündete in diesem Schritt eine NEUE Phase? (Toast/FX genau einmal) */
  started: boolean;
}

/**
 * Einen Zeitschritt des laufenden Boss-Kampfes weiterdrehen. `hpFraction` ist
 * der Rest-Ausdauer-Anteil VOR dem Schaden dieses Schritts — im Spiel (dt ≈ 1/60 s)
 * ist das exakt genug, im Bot (dt = 1 s) zündet eine Phase entsprechend eine
 * Sekunde nach dem Unterschreiten. Rein: gibt IMMER einen neuen Zustand zurück.
 */
export function tickGimmick(
  state: GimmickRuntime,
  gimmick: BossGimmick | null,
  hpFraction: number,
  dt: number,
): GimmickTick {
  const idle: GimmickTick = {
    state,
    spotlightShare: 0,
    spotlight: state.spotlightT > 0,
    heals: 0,
    started: false,
  };
  if (gimmick === null || !(dt > 0)) return idle;

  if (gimmick.id === 'spotlight') {
    const due = spotlightsDue(hpFraction);
    let phases = state.phases;
    let spotlightT = state.spotlightT;
    let started = false;
    if (due > phases) {
      phases = due;
      spotlightT = SPOTLIGHT_S;
      started = true;
    }
    const activeT = Math.min(dt, spotlightT);
    spotlightT = Math.max(0, spotlightT - dt);
    return {
      state: { ...state, phases, spotlightT },
      spotlightShare: activeT / dt,
      spotlight: spotlightT > 0,
      heals: 0,
      started,
    };
  }

  if (gimmick.id === 'wave') {
    let healT = state.healT - dt;
    let heals = 0;
    let guard = 64; // ein absurd großer dt darf den Boss nicht vollheilen
    while (healT <= 0 && guard-- > 0) {
      heals++;
      healT += WAVE_PERIOD_S;
    }
    return {
      state: { ...state, healT },
      spotlightShare: 0,
      spotlight: false,
      heals,
      started: false,
    };
  }

  // Schild + Gravitation brauchen keinen Zeit-Zustand (sie rechnen pro Treffer).
  return { ...idle, spotlight: false };
}

// ---------------------------------------------------------------------------
// Der Sekunden-Schaden des Bots (sim.ts) — eine Formel je Gimmick
// ---------------------------------------------------------------------------

export interface BossSecond {
  /** Klick-Schaden dieses Schritts (roh, inkl. `comboMult`). */
  click: number;
  /** Idle-/Crew-Schaden dieses Schritts (roh). */
  idle: number;
  /** Anteil des Schritts in einer Spotlight-Phase (Club) — 0…1. */
  spotlightShare?: number;
  /** Der Combo-Multiplikator, den `click` bereits trägt (Space). */
  comboMult?: number;
}

/**
 * Wirksamer Boss-Schaden eines Zeitschritts unter dem Gimmick:
 *
 *  · **Club**: `click + idle · (1 − spotlightShare)` — die Crew fällt aus, der
 *    Klick-Anteil bleibt voll.
 *  · **Synth**: `(click + idle) · SYNTH_IDLE_FACTOR`. Der Idle-Anteil trifft
 *    naturgemäß nur im Beat-Fenster; für die KLICKS ist das die dokumentierte
 *    Bot-Annahme — **der Bot klickt ungetaktet** (er hat keine Choreo-Phase, er
 *    klickt mit fester Rate), trifft also mit derselben Fenster-Wahrscheinlichkeit.
 *    Ein Mensch, der bewusst auf den Takt klickt, trifft deutlich öfter: der Bot
 *    ist hier bewusst PESSIMISTISCH, damit die Anker untere Schranken bleiben.
 *  · **Beach**: unverändert — die Welle läuft als HP-Regen über `waveHealAmount`.
 *  · **Space**: der Klick-Anteil wird vom eingebauten `comboMult` auf
 *    `spaceComboBonus` gehoben; der doppelte Verfall greift beim Bot nicht
 *    (er klickt ≥ 1×/s und damit IMMER im 1.5-s-Gnadenfenster), was die einzige
 *    optimistische Stelle ist — gedeckelt auf +8.3 % Klick-Schaden am Cap.
 */
export function gimmickBossDamage(gimmick: BossGimmick | null, s: BossSecond): number {
  const click = Math.max(0, s.click);
  const idle = Math.max(0, s.idle);
  if (gimmick === null) return click + idle;
  switch (gimmick.id) {
    case 'spotlight': {
      const share = Math.min(1, Math.max(0, s.spotlightShare ?? 0));
      return click + idle * (1 - share);
    }
    case 'shield':
      return (click + idle) * SYNTH_IDLE_FACTOR;
    case 'gravity': {
      const cm = Math.max(1, s.comboMult ?? 1);
      return click * (spaceComboBonus(cm) / cm) + idle;
    }
    case 'wave':
      return click + idle;
  }
}
