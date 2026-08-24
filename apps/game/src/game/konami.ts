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

/**
 * Der Jackpot-Code: „bootyclicker", als `KeyboardEvent.code`-Folge.
 *
 * „In allen Schreibformen" fällt hier von selbst ab: `KeyboardEvent.code` nennt
 * die TASTE, nicht das Zeichen — `KeyB` kommt bei „b" wie bei „B". Trennzeichen
 * (Bindestrich, Leerzeichen, Unterstrich, Umschalt) überspringt
 * {@link createKonami} als Zierrat, also zünden auch „booty-clicker",
 * „Booty Clicker" und „BoOtY_ClIcKeR".
 */
export const BOOTY_SEQUENCE: readonly string[] = [
  'KeyB',
  'KeyO',
  'KeyO',
  'KeyT',
  'KeyY',
  'KeyC',
  'KeyL',
  'KeyI',
  'KeyC',
  'KeyK',
  'KeyE',
  'KeyR',
];

/**
 * Tasten, die in einem Buchstaben-Code als Zierrat gelten: Sie schieben den
 * Fortschritt weder weiter noch brechen sie ihn ab. Damit ist die Schreibweise
 * wirklich egal — nur die Buchstabenfolge zählt.
 */
export const CODE_SKIP_KEYS: ReadonlySet<string> = new Set([
  'Minus',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'CapsLock',
  'NumpadSubtract',
]);

/**
 * Der zweite Geheimcode: „pablokiwi", als `KeyboardEvent.code`-Folge. Anders
 * als die Ahnen-Sequenz ist er ein reiner Spaß-Schalter und darf beliebig oft
 * gezündet werden — er kennt keinen Einmal-Latch.
 */
export const PABLO_SEQUENCE: readonly string[] = [
  'KeyP',
  'KeyA',
  'KeyB',
  'KeyL',
  'KeyO',
  'KeyK',
  'KeyI',
  'KeyW',
  'KeyI',
];

/**
 * Der Betrag, den „pablokiwi" auf das Konto legt: `Number.MAX_SAFE_INTEGER` —
 * die größte ganze Zahl, mit der JavaScript noch exakt rechnet.
 *
 * Bewusst NICHT `Number.MAX_VALUE` oder `Infinity`: Oberhalb von 2^53 verliert
 * jede Addition Stellen (`x + 1 === x`), Kauf-Rechnungen würden still falsch,
 * und `Infinity` überlebt zwar den Save-Loader, macht aber jede Differenz zu
 * `NaN` — der Kontostand wäre danach unbrauchbar. MAX_SAFE_INTEGER ist das
 * Maximum, bei dem das Spiel noch korrekt bleibt.
 */
export const PABLO_GOLD = Number.MAX_SAFE_INTEGER;

/**
 * Der Faktor, um den „pablokiwi" ein Konto hebt, das die exakte Grenze BEREITS
 * überschritten hat. Nötig, weil das Spiel dort keineswegs stehenbleibt: Boosts
 * und Idle-Einkommen tragen den Stand weiter (gemessen: 9.01 Qa ⇒ 10.23 Qa) —
 * nur eben mit Rundung in den letzten Stellen. Ein Cheat, der in dieser Lage
 * „mehr geht nicht" meldet und nichts tut, sagt schlicht die Unwahrheit.
 */
export const PABLO_OVERFLOW_MULT = 1000;

/**
 * Die absolute Obergrenze des Cheats. Bewusst weit UNTER `Number.MAX_VALUE`
 * (~1.8e308): Ab dort kippt die nächste Multiplikation nach `Infinity`, und ab
 * `Infinity` liefert jede Differenz `NaN` — der Kontostand wäre unbrauchbar,
 * nicht bloß ungenau. 1e300 lässt selbst dem ×1000-Schritt noch Luft.
 */
export const PABLO_CEILING = 1e300;

/**
 * Was „pablokiwi" aus dem aktuellen Stand macht — pur, damit die Regel testbar
 * ist: unter der exakten Grenze wird auf sie aufgefüllt, darüber vertausendfacht
 * (bis zum Deckel). Gibt den NEUEN Stand zurück; ist er gleich dem alten, gibt
 * es tatsächlich nichts mehr zu holen.
 */
export function pabloNextGold(gold: number): number {
  const cur = Number.isFinite(gold) && gold > 0 ? gold : 0;
  if (cur < PABLO_GOLD) return PABLO_GOLD;
  return Math.min(PABLO_CEILING, cur * PABLO_OVERFLOW_MULT);
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
      // Zierrat (Bindestrich, Leerzeichen, Umschalt) ist weder Fortschritt noch
      // Abbruch — sonst könnte „booty-clicker" den Code nie zünden.
      if (i > 0 && CODE_SKIP_KEYS.has(code)) return false;
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
