/**
 * ROADMAP-V2 G6 — Der Zahlen-Tween des BP-Zählers (pur, damit ihn ein Test
 * festnageln kann).
 *
 * Das Konto springt heute in Stufen: ein Kill bucht, der Zähler steht sofort
 * auf der neuen Zahl. Ein kurzer Lerp über ~0.4 s macht daraus eine Bewegung,
 * ohne die ANZEIGE-Quelle zu wechseln — gerendert wird weiterhin `fmt(v)`, der
 * Tween liefert nur den Wert dazwischen. Und weil ein Idle-Spiel die Zahl
 * mehrmals pro Sekunde neu setzt, MUSS ein neuer Zielwert den laufenden Tween
 * abbrechen und beim aktuell gezeigten Wert weiterlaufen (`tweenFrom`) — sonst
 * ruckelt der Zähler zurück.
 */

/** Dauer eines Zähler-Tweens in ms. */
export const TWEEN_MS = 400;

/**
 * Ein Sprung unter dieser relativen Größe wird NICHT getweent, sondern sofort
 * geschrieben: die winzigen Idle-Ticks (Bruchteile eines Prozents) sähen als
 * Tween identisch aus und kosteten nur einen rAF pro Tick.
 */
export const TWEEN_MIN_REL = 0.001;

/** Ease-out (kubisch): schnell los, weich an. */
export function tweenEase(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return 1 - Math.pow(1 - t, 3);
}

/** Der angezeigte Wert nach `elapsedMs` eines Tweens von `from` nach `to`. */
export function tweenValue(from: number, to: number, elapsedMs: number, durMs = TWEEN_MS): number {
  if (!(durMs > 0)) return to;
  const k = tweenEase(elapsedMs / durMs);
  return k >= 1 ? to : from + (to - from) * k;
}

/**
 * Lohnt sich ein Tween überhaupt? Nein bei gleichem Wert, bei einem winzigen
 * relativen Sprung (Idle-Tick) und nie bei nicht-endlichen Zahlen — der Aufrufer
 * schreibt dann direkt, ohne einen rAF zu starten.
 */
export function shouldTween(from: number, to: number, minRel = TWEEN_MIN_REL): boolean {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  const scale = Math.max(Math.abs(from), Math.abs(to));
  if (scale <= 0) return false;
  return Math.abs(to - from) / scale > minRel;
}
