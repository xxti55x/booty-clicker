/**
 * Bühnen-Sterne (ROADMAP-V2 P1) — pures, DOM-freies Sammel-Ziel über dem Kern-Loop.
 *
 * Jede Bühne trägt eine kleine Bitmaske (0…7). Die Sterne sind REIN KOSMETISCH:
 * sie schalten nichts frei, verändern keine Formel und tauchen in keinem
 * Sim-Anker auf — sie geben Rückreise und Boss-Retry (Schritt 2 der Roadmap) nur
 * ein Ziel jenseits von „farmen müssen".
 *
 * Die drei Bits:
 *  · `STAR_CLEARED` (1) — die Bühne wurde einmal abgeschlossen (Rivalen-Welle
 *    durch; auf einer Boss-Bühne heißt „abgeschlossen" **Boss besiegt**, denn nur
 *    der Boss-Kill schiebt die Bühne weiter).
 *  · `STAR_NO_TIMEOUT` (2) — **nur Boss-Bühnen.** Das Gate fiel, ohne dass
 *    zwischen dem ersten Boss-Spawn dieses Gates und dem Kill ein einziger
 *    Timeout lag. Nicht-Boss-Bühnen haben kein Gate und damit keinen Timeout, den
 *    man vermeiden könnte — sie tragen deshalb bewusst nur ZWEI Sterne (1 + 4)
 *    statt eines künstlichen Ersatzkriteriums (siehe `starBitsFor`).
 *  · `STAR_COMBO` (4) — auf dieser Bühne landete ein Kill, während der Combo-
 *    Multiplikator mindestens `STAR_COMBO_MULT` betrug.
 *
 * Alle Funktionen sind pur und arbeiten auf einer normalen `Record<zone, mask>`-
 * Map (Zonen-Nummer als String-Key, JSON-freundlich); `addStar` gibt bei „nichts
 * geändert" DIESELBE Referenz zurück, sodass die Glue-Schicht billig erkennt, ob
 * ein Stern wirklich neu ist.
 */
import { COMBO_CAP, comboMult } from './click';
import { isBossZone } from './combat';

/** Bit 0 — Bühne einmal abgeschlossen. */
export const STAR_CLEARED = 1;
/** Bit 1 — Boss-Gate ohne Timeout gefallen (nur Boss-Bühnen). */
export const STAR_NO_TIMEOUT = 2;
/** Bit 2 — ein Kill auf dieser Bühne mit heißer Combo (≥ `STAR_COMBO_MULT`). */
export const STAR_COMBO = 4;

/** Alle Stern-Bits (Anzeige-Reihenfolge = Bit-Reihenfolge). */
export const STAR_BITS = [STAR_CLEARED, STAR_NO_TIMEOUT, STAR_COMBO] as const;
/** Vollmaske aller drei Sterne (7) — die Obergrenze jeder gespeicherten Maske. */
export const STAR_ALL = STAR_CLEARED | STAR_NO_TIMEOUT | STAR_COMBO;

/**
 * Combo-Schwelle für Stern 3. Die Skala in `click.ts` ist seit dem v12-Nerf flach:
 * `comboMult = 1 + min(stacks, 50)·0,004`, also ×1.2 am Cap. ×1.1 ist damit exakt
 * die HALBE Strecke zum Cap (25 Stacks) und deckt sich mit dem Combo-Tier 2
 * („Heiß") — erreichbar in ~5 s Dauerklicken, aber nicht geschenkt: wer nur
 * gelegentlich tippt oder die Combo im Shop verfallen lässt, bleibt darunter.
 */
export const STAR_COMBO_MULT = 1.1;

/**
 * Die Stacks, ab denen `comboMult` die Schwelle erreicht (25 bei der aktuellen
 * Skala) — aus der ECHTEN Formel abgeleitet, nie als zweite Zahl gepflegt. Ändert
 * sich die Combo-Kurve, wandert diese Grenze automatisch mit.
 */
export const STAR_COMBO_STACKS = ((): number => {
  for (let s = 0; s <= COMBO_CAP; s++) if (comboMult(s) >= STAR_COMBO_MULT) return s;
  return COMBO_CAP;
})();

/** Erfüllt dieser Combo-Stand die Schwelle für Stern 3? */
export function comboStarQualifies(stacks: number): boolean {
  return comboMult(Math.max(0, stacks)) >= STAR_COMBO_MULT;
}

/** Sterne pro Bühne, Zone-Nummer als String-Key (JSON-freundlich, spärlich). */
export type StageStars = Record<string, number>;

/** Eine frische (leere) Sterne-Sammlung. */
export function createStageStars(): StageStars {
  return {};
}

/** Ist `zone` eine gültige Bühnen-Nummer (positive ganze Zahl)? */
function isZone(zone: number): boolean {
  return Number.isInteger(zone) && zone >= 1;
}

/**
 * Die Bits, die eine Bühne überhaupt tragen kann: Boss-Bühnen alle drei,
 * normale Bühnen „geclert" + „Combo" (kein Gate ⇒ kein Timeout-Stern).
 */
export function starBitsFor(zone: number): readonly number[] {
  return isBossZone(zone) ? STAR_BITS : [STAR_CLEARED, STAR_COMBO];
}

/** Maske der auf dieser Bühne erreichbaren Bits (3 bzw. 5). */
export function starMaskFor(zone: number): number {
  return isBossZone(zone) ? STAR_ALL : STAR_CLEARED | STAR_COMBO;
}

/** Maximal erreichbare Sterne einer Bühne (Boss 3, sonst 2). */
export function maxStarsFor(zone: number): number {
  return starBitsFor(zone).length;
}

/** Anzahl gesetzter Bits einer Maske (0…3). */
export function starCount(mask: number): number {
  let n = 0;
  for (const bit of STAR_BITS) if ((mask & bit) !== 0) n++;
  return n;
}

/** Die (bereinigte) Maske einer Bühne — unbekannte/unmögliche Bits fallen weg. */
export function starsAt(map: StageStars, zone: number): number {
  if (!isZone(zone)) return 0;
  const raw = map[String(zone)] ?? 0;
  return Number.isFinite(raw) ? Math.floor(raw) & starMaskFor(zone) : 0;
}

/** Trägt die Bühne diesen Stern schon? */
export function hasStar(map: StageStars, zone: number, bit: number): boolean {
  return (starsAt(map, zone) & bit) !== 0;
}

/**
 * Stern setzen. Gibt bei „schon da", ungültiger Bühne oder einem für diese Bühne
 * unmöglichen Bit (z. B. `STAR_NO_TIMEOUT` auf einer Nicht-Boss-Bühne) DIESELBE
 * Referenz zurück — die Glue-Schicht erkennt daran, ob wirklich etwas Neues
 * passiert ist (Toast/Meilenstein), ohne selbst vergleichen zu müssen.
 */
export function addStar(map: StageStars, zone: number, bit: number): StageStars {
  if (!isZone(zone)) return map;
  const allowed = bit & starMaskFor(zone);
  if (allowed === 0) return map;
  const cur = starsAt(map, zone);
  const next = cur | allowed;
  if (next === cur) return map;
  return { ...map, [String(zone)]: next };
}

/** Summe aller gesammelten Sterne (unbekannte Keys/Bits zählen nicht mit). */
export function totalStars(map: StageStars): number {
  let total = 0;
  for (const [key, value] of Object.entries(map)) {
    const zone = Number(key);
    if (!isZone(zone) || !Number.isFinite(value)) continue;
    total += starCount(Math.floor(value) & starMaskFor(zone));
  }
  return total;
}

/** Alle so viele Sterne gibt es EINE Holztruhe (der Sammel-Meilenstein). */
export const STAR_MILESTONE = 15;

/**
 * Wie viele Meilenstein-Truhen bei `total` Sternen noch offen sind, gemessen am
 * persistierten Highwater `awarded` (die Sterne, die schon eine Truhe gezahlt
 * haben). Rein arithmetisch, damit ein Reload nie doppelt auszahlt: der Highwater
 * wächst nur über `milestoneHighwater`.
 */
export function milestoneChests(total: number, awarded: number): number {
  const reached = Math.floor(Math.max(0, total) / STAR_MILESTONE) * STAR_MILESTONE;
  const paid = Math.max(0, Math.floor(awarded));
  return Math.max(0, Math.floor((reached - paid) / STAR_MILESTONE));
}

/** Der neue Highwater nach dem Auszahlen (immer ein Vielfaches von `STAR_MILESTONE`). */
export function milestoneHighwater(total: number, awarded: number): number {
  const reached = Math.floor(Math.max(0, total) / STAR_MILESTONE) * STAR_MILESTONE;
  return Math.max(Math.max(0, Math.floor(awarded)), reached);
}
