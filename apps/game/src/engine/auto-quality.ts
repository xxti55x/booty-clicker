import type { Quality } from '../game/settings';

/**
 * V2-2 — Auto-Qualität (die X6-Restschuld): `quality: 'auto'` heißt, das GERÄT
 * entscheidet, in zwei Stufen:
 *
 *  1. **Signal-Wahl beim Boot** ({@link pickQuality}): grobe, sofort verfügbare
 *     Gerätesignale wählen das Start-Preset. Bewusst konservativ — ein zu hoch
 *     gewähltes Preset ruckelt sichtbar, ein zu niedriges korrigiert niemand.
 *  2. **FPS-Governor zur Laufzeit** ({@link createFpsGovernor}): misst ECHTE
 *     Frame-Zeiten und stuft herunter, wenn das Gerät das Preset nicht hält.
 *     Er stuft NIE hinauf (Aufwärts-Flattern wäre sichtbares Pumpen) und fasst
 *     nichts an, sobald der Spieler selbst gewählt hat (`qualityChosen`).
 *
 * Beides pur und DOM-frei — `main.ts` liest die Signale und füttert Frames.
 */

/** Grobe Gerätesignale — alle synchron und ohne Berechtigungen lesbar. */
export interface DeviceSignals {
  /** UA/Touch deutet auf Telefon/Tablet. */
  mobile: boolean;
  /** `navigator.hardwareConcurrency` (0/undefined ⇒ unbekannt). */
  cores: number;
  /** WebGL `UNMASKED_RENDERER_WEBGL` (leer ⇒ unbekannt). */
  gpu: string;
}

/** Software-Rasterizer: alles darüber ist GPU-los und gehört auf `low`. */
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software\s*rasterizer|mesa\s*offscreen/i;

/**
 * Signal-Wahl: Software-GPU ⇒ `low` (nichts rettet einen Rasterizer), Mobil
 * oder wenige Kerne ⇒ `medium` (Schatten + volle Dichte ja, aber PixelRatio-
 * Deckel 1.5 statt 2 und kein Bloom-Pass), sonst `high`.
 */
export function pickQuality(sig: DeviceSignals): Quality {
  if (SOFTWARE_GPU.test(sig.gpu)) return 'low';
  if (sig.mobile) return 'medium';
  if (sig.cores > 0 && sig.cores <= 4) return 'medium';
  return 'high';
}

/** Ein Herabstufungs-Schritt (high → medium → low; `low` bleibt `low`). */
export function stepDown(q: Quality): Quality {
  return q === 'high' ? 'medium' : 'low';
}

export interface FpsGovernorOptions {
  /** Frames je Mess-Fenster. */
  windowFrames?: number;
  /** Boot-Schonfrist in ms (Asset-Load + Shader-Compile ruckeln IMMER). */
  warmupMs?: number;
  /** Abklingzeit nach einer Herabstufung, bevor neu gemessen wird (ms). */
  cooldownMs?: number;
  /**
   * Median-Frame-Zeit (ms), ab der ein Preset als „hält es nicht" gilt.
   * 24 ms ≈ stabil unter 42 FPS — deutlich unterhalb von 60-FPS-Jitter.
   */
  tripMs?: number;
  /**
   * Aktives FPS-Limit des SPIELERS in ms je Frame (0 = keins). Ein Limit von
   * 30 FPS macht 33-ms-Frames zur Absicht — der Governor misst dann gegen das
   * Limit (×1.35 Toleranz), nicht gegen die 42-FPS-Schwelle.
   */
  capMs?: number;
}

export interface FpsGovernor {
  /**
   * Einen Frame melden. Liefert das neue, NIEDRIGERE Preset genau in dem
   * Moment, in dem der Governor herabstuft — sonst `null`.
   */
  sample(frameMs: number, nowMs: number): Quality | null;
}

/**
 * Laufzeit-Governor: pro Fenster ({@link FpsGovernorOptions.windowFrames})
 * wird der MEDIAN der Frame-Zeiten gebildet (robust gegen einzelne GC-/Lade-
 * Spikes, anders als ein Mittelwert). Liegt er über der Schwelle, fällt das
 * Preset EINE Stufe und die Abklingzeit beginnt. `low` ist der Boden.
 */
export function createFpsGovernor(start: Quality, opts: FpsGovernorOptions = {}): FpsGovernor {
  const windowFrames = opts.windowFrames ?? 180;
  const warmupMs = opts.warmupMs ?? 6000;
  const cooldownMs = opts.cooldownMs ?? 8000;
  const tripMs = opts.tripMs ?? 24;
  const capMs = opts.capMs ?? 0;
  // Spieler-Limit macht lange Frames zur Absicht: gegen das Limit messen.
  const threshold = capMs > 0 ? Math.max(tripMs, capMs * 1.35) : tripMs;

  let quality = start;
  let frames: number[] = [];
  let quietUntil = 0;
  let started = false;

  return {
    sample(frameMs: number, nowMs: number): Quality | null {
      if (quality === 'low') return null;
      if (!started) {
        // Schonfrist ab dem ERSTEN Frame, nicht ab Objektbau — der Governor
        // kann beliebig früh erzeugt werden.
        started = true;
        quietUntil = nowMs + warmupMs;
      }
      if (nowMs < quietUntil) return null;
      if (!Number.isFinite(frameMs) || frameMs <= 0) return null;
      // Tab-Wechsel/Throttling liefert Sekunden-Frames — das ist kein Jank.
      if (frameMs > 1000) {
        frames = [];
        return null;
      }
      frames.push(frameMs);
      if (frames.length < windowFrames) return null;
      const sorted = [...frames].sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1];
      frames = [];
      if (median <= threshold) return null;
      quality = stepDown(quality);
      quietUntil = nowMs + cooldownMs;
      return quality;
    },
  };
}
