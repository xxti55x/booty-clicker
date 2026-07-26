/**
 * Choreo-Set-Rotation (ROADMAP-V2 A4) — pur, DOM-frei, save-frei.
 *
 * Acht Moves gibt es seit Langem, aber die Auswahl war eine simple Rundlaufzahl
 * (`moveIdx + 1` alle 18 Klicks): jede Bühne zeigte über die Zeit exakt dieselbe
 * Abfolge. A4 gibt jeder Bühne ein deterministisches **Set aus drei Moves** —
 * damit sehen zwei Bühnen sofort unterschiedlich aus, ohne dass eine einzige
 * Zeile Pose-Mathematik angefasst wird.
 *
 * **Nur die Auswahl-Ebene.** `MOVES` (Dauer, `fn`, Pose-Kanäle) bleibt byte-gleich;
 * dieses Modul liefert ausschließlich INDIZES, und `Choreographer` bekommt einen
 * Vorrat, in dem er kreist. Der Physik-/Blend-Kontrakt ist damit unberührt.
 *
 * Drei Regeln:
 *  1. **Bühnen-Set** — drei verschiedene Moves, seeded aus `(zone, remix)`.
 *  2. **Boss-Kampf** — die zwei INTENSIVSTEN des Sets (`bossSetForZone`): das
 *     Gate soll körperlich lauter aussehen als die Farm-Strecke davor.
 *  3. **Sieges-Move** — nach einem Boss-Sieg einmalig der Diva-Turn; der nächste
 *     reguläre Wechsel fällt von selbst in den Vorrat zurück, weil `advance()`
 *     von einem Move AUSSERHALB des Sets auf dessen ersten Eintrag springt.
 *
 * Derselbe Remix-Seed wie die Bühnen-Modifikatoren (A1) — aber durch `CHOREO_SALT`
 * gedreht, damit „welcher Modifikator" und „welche Moves" nicht aneinander
 * kleben (sonst hieße Goldrausch immer Booty-Slam).
 */
import { MOVES } from './moves';
import { REMIX_OFF } from '../game/stage-mods';
import { floatAt } from '../util/rng';

/** Moves pro Bühnen-Set. */
export const SET_SIZE = 3;
/** Moves, die ein Boss-Kampf aus dem Set erzwingt (die intensivsten). */
export const BOSS_SET_SIZE = 2;

/**
 * Trennt den Choreo-Strom vom Modifikator-Strom desselben Laufs (siehe Kopf).
 * Eine beliebige ungerade 32-Bit-Konstante — nur ihre Verschiedenheit zählt.
 */
const CHOREO_SALT = 0x2545f491;

/**
 * **Intensität je Move** — Daten, keine Logik, und bewusst paarweise verschieden,
 * damit „die zwei intensivsten" ohne Gleichstands-Regel eindeutig sind. Die Skala
 * misst, wie viel Weg Hüfte und Root pro Takt zurücklegen: Booty-Slam wirft den
 * ganzen Körper, die Welle lässt eine Woge durchlaufen.
 *
 * Der Index ist der Index in `MOVES`; ein Test pinnt Länge UND Namen fest, damit
 * ein neuer Move nicht stillschweigend als Intensität 0 durchrutscht.
 */
export const MOVE_INTENSITY: readonly number[] = [
  7, // Twerk
  2, // Hip Circles
  6, // Drop It Low
  4, // Shimmy
  5, // Bounce
  1, // Welle
  8, // Booty-Slam
  3, // Diva-Turn
];

/** Der Sieges-Move nach einem Boss-Kill (Index des Diva-Turn in `MOVES`). */
export const VICTORY_MOVE = MOVES.findIndex((m) => m.name === 'Diva-Turn');

/** Intensität eines Move-Index (0 für unbekannte Indizes). */
export function moveIntensity(idx: number): number {
  return MOVE_INTENSITY[idx] ?? 0;
}

/**
 * Das Move-Set einer Bühne: `SET_SIZE` VERSCHIEDENE Indizes, deterministisch
 * über `(zone, remix)`. Gezogen wird per partiellem Fisher-Yates über einen
 * seeded Strom — so ist eine Dopplung strukturell ausgeschlossen (statt sie mit
 * Neuwürfeln zu bekämpfen). Bei `REMIX_OFF` (oder ungültiger Bühne) kommt das
 * Standard-Trio `[0, 1, 2]` zurück: identisch für jede Bühne, also exakt das
 * Verhalten von vor A4.
 */
export function setForZone(zone: number, remix: number): readonly number[] {
  const pool = MOVES.map((_, i) => i);
  if (remix === REMIX_OFF || !Number.isFinite(remix) || !Number.isFinite(zone)) {
    return pool.slice(0, SET_SIZE);
  }
  const seed = (remix ^ CHOREO_SALT) | 0;
  const base = Math.floor(zone) * SET_SIZE;
  for (let i = 0; i < SET_SIZE; i++) {
    const j = i + Math.floor(floatAt(seed, base + i) * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, SET_SIZE);
}

/**
 * Die zwei intensivsten Moves des Bühnen-Sets — was ein Boss-Kampf erzwingt.
 * Absteigend sortiert, damit der lauteste Move den Kampf eröffnet.
 */
export function bossSetForZone(zone: number, remix: number): readonly number[] {
  return [...setForZone(zone, remix)]
    .sort((a, b) => moveIntensity(b) - moveIntensity(a))
    .slice(0, BOSS_SET_SIZE);
}

/**
 * Der Vorrat, in dem die Choreo auf dieser Bühne kreist: im Bosskampf die zwei
 * intensivsten, sonst das volle Dreier-Set. EINE Funktion für die Glue, damit
 * „welches Set gilt gerade" nicht an zwei Stellen entschieden wird.
 */
export function activeSet(zone: number, remix: number, boss: boolean): readonly number[] {
  return boss ? bossSetForZone(zone, remix) : setForZone(zone, remix);
}
