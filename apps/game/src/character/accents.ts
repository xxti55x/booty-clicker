import type { Rig } from '../types';

/**
 * Click accents — the direct line between the player's finger and the dancer.
 *
 * Every shake (click) fires a short **Hip-Pop impulse**: the booty flicks up, the
 * body dips, the head snaps — scaled by the current combo tier, boosted on-beat,
 * and a crit adds a flashy arm flare. While Twerk-Ekstase runs, a continuous
 * high-frequency shimmy rides on top so the ×10 window is visible on the dancer
 * herself, not only in the UI.
 *
 * The layer is strictly ADDITIVE and applied AFTER `stepPhysics` each frame:
 * `applyPose` (inside the untouched physics contract) writes absolute joint
 * values every fixed step, so accents can never accumulate or drift — they decay
 * exponentially and vanish. Cheek soft-bodies get their own impulse in the click
 * handler already; their spring targets simply follow the accented anchors a
 * step later, which reads as extra jiggle.
 */

/** Pop impulse decay per second (≈ gone in ~0.35 s — a snap, not a wobble). */
export const POP_DECAY = 9;
/** Crit flare decay per second (a touch longer than the pop, ~0.6 s). */
export const CRIT_DECAY = 5;
/** Base pop strength of a tier-0 click. */
export const POP_BASE = 0.45;
/** Extra pop strength per combo tier (tiers 0…4). */
export const POP_PER_TIER = 0.12;
/** Extra pop strength for an on-beat click (rhythm made visible). */
export const POP_ONBEAT = 0.18;
/** Impulses clamp here so click-mashing can't fold the character in half. */
export const POP_MAX = 1.35;
/**
 * D-22: Windup-Abklingrate (1/s). `wind > 0.5` hält damit ~28 ms (2–3 Frames
 * bei 60 fps) — genau die winzige ANTICIPATION vor dem harten Anschlag, die
 * K-4 verlangt: die Pelvis zieht kurz GEGEN die Pop-Richtung, dann schlägt
 * der Pop durch. K-5-Mikro-Raster, kein eigener Timing-Wert.
 */
export const WIND_DECAY = 25;
/** D-22: Gegenzug der Anticipation (rad) — minimal, eine Aufladung, kein Move. */
export const WIND_PULL = 0.06;

/** Live accent impulses (transient, never serialized). */
export interface AccentState {
  /** Hip-pop impulse, 0…`POP_MAX`. */
  pop: number;
  /** Crit arm-flare impulse, 0…1. */
  crit: number;
  /** D-22: Anticipation-Impuls (0…1) — zieht kurz gegen die Pop-Richtung. */
  wind: number;
}

/** Fresh, silent accents. */
export function createAccents(): AccentState {
  return { pop: 0, crit: 0, wind: 0 };
}

/**
 * A shake landed: kick the pop (tier/beat-scaled), flare on crit. Mutates.
 * `windup` schaltet die D-22-Anticipation (low-Preset: aus — der Anschlag
 * bleibt, nur die Aufladung entfällt; K-9: Glanz weg, Aussage bleibt).
 */
export function triggerClickAccent(
  a: AccentState,
  tier: number,
  crit: boolean,
  onBeat: boolean,
  windup = true,
): void {
  const kick = POP_BASE + Math.max(0, tier) * POP_PER_TIER + (onBeat ? POP_ONBEAT : 0);
  a.pop = Math.min(POP_MAX, Math.max(a.pop * 0.55, 0) + kick);
  if (crit) a.crit = 1;
  if (windup) a.wind = 1;
}

/** Advance the exponential decays by `dt` seconds. Mutates. */
export function stepAccents(a: AccentState, dt: number): void {
  a.pop *= Math.exp(-dt * POP_DECAY);
  a.crit *= Math.exp(-dt * CRIT_DECAY);
  a.wind *= Math.exp(-dt * WIND_DECAY);
  if (a.pop < 1e-4) a.pop = 0;
  if (a.crit < 1e-4) a.crit = 0;
  if (a.wind < 1e-4) a.wind = 0;
}

/**
 * Write the additive accent offsets onto the rig for this frame (after the
 * physics step, before rendering). `t` drives the Ekstase shimmy oscillator;
 * `frenzy` switches it on. Safe to call every frame — offsets are re-derived
 * from the impulses each time and the next physics step resets the joints.
 */
export function applyAccents(rig: Rig, a: AccentState, frenzy: boolean, t: number): void {
  // D-22: Anticipation — für 2–3 Frames zieht die Pelvis MINIMAL gegen die
  // Pop-Richtung (Aufladung), dann übernimmt der Anschlag. Additiv wie alles
  // hier: der nächste Physik-Schritt schreibt absolute Werte, nichts driftet.
  if (a.wind > 0.5) rig.pelvis.rotation.x += WIND_PULL;
  const p = a.pop;
  if (p > 0) {
    rig.pelvis.rotation.x -= p * 0.3; // the booty flick
    rig.root.position.y -= p * 0.055; // body dips into the pop
    rig.spine.rotation.x += p * 0.1; // chest counters
    rig.head.rotation.x -= p * 0.12; // head snap
  }
  const c = a.crit;
  if (c > 0) {
    rig.armL.shoulder.rotation.z += c * 0.85; // crit: arms flare outward
    rig.armR.shoulder.rotation.z -= c * 0.85;
    rig.armL.elbow.rotation.x -= c * 0.3;
    rig.armR.elbow.rotation.x -= c * 0.3;
    rig.head.rotation.z += c * 0.14;
  }
  if (frenzy) {
    // Ekstase: a fast full-body shimmy rides every move for the whole window.
    rig.spine.rotation.y += Math.sin(t * 30) * 0.1;
    rig.pelvis.rotation.z += Math.sin(t * 26) * 0.05;
    rig.head.rotation.z += Math.sin(t * 30 + 1.2) * 0.05;
  }
}

/**
 * **D-21 „Die Bühne atmet"** — die Ruhe-Ebene der Spielfigur.
 *
 * Ohne Eingabe stand die Figur bisher praktisch still (shots/SHEET-idle.png):
 * die `MOVES`-Amplituden skalieren mit der Energie gegen null, und darunter kam
 * nichts. Diese Schicht legt darunter, was ein lebendiger Körper immer tut —
 * Atmung, Gewichtsverlagerung, ein Kopf-Nick auf den Beat.
 *
 * `calm` blendet sie AUS, sobald wirklich getanzt wird (`1 − min(1, drive)`):
 * die Ruhe-Ebene ist der Boden unter der Choreografie, nicht eine zweite
 * Bewegung obendrauf. Wie {@link applyAccents} ist sie strikt ADDITIV und läuft
 * im selben Slot NACH `stepPhysics` — `applyPose` schreibt jeden Fixschritt
 * absolute Werte, es kann also nichts akkumulieren.
 *
 * Pur und deterministisch: gleiche `(t, calm, beatV)` ⇒ gleiche Pose, kein
 * Zustand, keine Zufallszahl. Alle Frequenzen sind langsam (0.6–1.7 Hz) und
 * alle Amplituden klein — das Bild soll atmen, nicht wackeln.
 */
export function applyIdleLife(rig: Rig, t: number, calm: number, beatV: number): void {
  const c = Math.max(0, Math.min(1, calm));
  if (c > 0) {
    rig.spine.rotation.x += Math.sin(t * IDLE_BREATH_HZ) * 0.022 * c; // Atmung
    rig.pelvis.rotation.z += Math.sin(t * IDLE_SHIFT_HZ) * 0.03 * c; // Standbein-Wechsel
    rig.root.position.y += Math.sin(t * IDLE_BREATH_HZ) * 0.012 * c; // Brustkorb hebt
  }
  // Der Kopf-Nick hängt am BEAT, nicht an `calm` — die Musik läuft immer.
  rig.head.rotation.x -= beatV * 0.05;
}

/** Atem-Frequenz der Ruhe-Ebene (Hz·2π) — ruhiges Ein/Aus, ~1.7 rad/s. */
const IDLE_BREATH_HZ = 1.7;
/** Gewichtsverlagerung: noch langsamer, damit die Ebenen nie im Takt sind. */
const IDLE_SHIFT_HZ = 0.6;
