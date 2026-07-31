/**
 * Das Easter Egg — der **Cheat-Code der Ahnen** (pur, DOM-frei).
 *
 * ↑ ↑ ↓ ↓ ← → ← → B A, getippt irgendwo im Spiel, zündet GENAU EINMAL im
 * Leben eines Saves einen BP-Jackpot samt Erfolg — und jedes weitere Mal nur
 * noch den Pfirsich-Regen (die Zeremonie bleibt ein Spielzeug, die Belohnung
 * bleibt einmalig; der Lebenszeit-Zähler `stats.konami` ist der Latch).
 *
 * Balance-Vertrag: Der Jackpot ist {@link KONAMI_BOSS_DROPS} Boss-Drops der
 * AKTUELLEN Bühne wert ({@link konamiJackpot}) — er skaliert also mit dem
 * Spielstand statt die Kurve zu brechen, und als Einmal-Zahlung liegt er in
 * derselben Größenklasse wie ein Truhen-Jackpot. Der Bot tippt keine
 * Pfeiltasten: kein Sim-Term, kein Anker-Effekt (dokumentiert in DECISIONS).
 */
import { goldFor } from './combat';

/** Die klassische Sequenz, als `KeyboardEvent.code`-Folge. */
export const KONAMI_SEQUENCE: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

/** Wie viele Boss-Drops der aktuellen Bühne der Einmal-Jackpot wert ist. */
export const KONAMI_BOSS_DROPS = 20;

/**
 * Der Einmal-Jackpot: 20 Boss-Drops der Bühne `zone` — fühlbar „sehr viele
 * BP" (rund 40–60 min Farm-Ertrag), aber durch die Bühnen-Skalierung nie ein
 * Sprung über die eigene Kurve hinaus.
 */
export function konamiJackpot(zone: number): number {
  const z = Number.isFinite(zone) && zone >= 1 ? Math.floor(zone) : 1;
  return goldFor(z, true) * KONAMI_BOSS_DROPS;
}

export interface KonamiDetector {
  /**
   * Einen Tastendruck (`KeyboardEvent.code`) einspeisen. `true` genau dann,
   * wenn die Sequenz VOLLSTÄNDIG ist (der Zustand beginnt danach von vorn).
   */
  feed(code: string): boolean;
}

/**
 * Sequenz-Detektor. Bei einem Fehltritt fällt der Zustand auf 0 zurück — außer
 * die falsche Taste ist selbst der Sequenz-ANFANG (↑), dann zählt sie als
 * neuer erster Schritt: ↑↑↑↓↓←→←→BA muss zünden, der dritte Pfeil nach oben
 * ist kein Abbruch, sondern gehaltener Anlauf.
 */
export function createKonami(seq: readonly string[] = KONAMI_SEQUENCE): KonamiDetector {
  let i = 0;
  return {
    feed(code: string): boolean {
      if (code === seq[i]) {
        i += 1;
        if (i === seq.length) {
          i = 0;
          return true;
        }
        return false;
      }
      i = code === seq[0] ? 1 : 0;
      return false;
    },
  };
}
