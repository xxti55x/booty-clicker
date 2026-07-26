import { OFFLINE_CAP_S, type OfflineOpts, offlineGold } from '../save/ch-store';

/**
 * ROADMAP-V2 X3 — der Offline-Rückkehr-Moment als reine Datenfunktion.
 *
 * `offlineGold` zahlte bisher still aufs Konto; die Rückkehr war ein
 * Kontostand, kein Moment. Diese Datei rechnet ALLES, was die Willkommen-
 * zurück-Card zeigt, an EINER Stelle — und zwar so, dass die angezeigte Zahl
 * per Konstruktion identisch mit der gutgeschriebenen ist: `welcomeBackData`
 * ruft `offlineGold` selbst auf, statt einen zweiten Rechenweg zu pflegen.
 * `main.ts` bekommt die Zahl aus der Card und schreibt genau sie gut.
 */

/** Abwesenheit, ab der die Card überhaupt erscheint (darunter: still buchen). */
export const WELCOME_BACK_MIN_MS = 10 * 60 * 1000;

export interface WelcomeBackData {
  /** Die gutzuschreibenden BP — per Konstruktion `offlineGold(…)`. */
  gold: number;
  /** Tatsächliche Abwesenheit in ms (ungekappt — der Cap trifft nur den Ertrag). */
  awayMs: number;
  /** Hübsche Abwesenheit, z. B. „2 h 14 min". */
  away: string;
  /** Wirksamer Offline-Cap in Sekunden (Nachtschicht/Gear heben ihn). */
  capS: number;
  /** Hat der Cap gegriffen? (Nur dann ist der Cap-Hinweis ehrlich.) */
  capped: boolean;
  /** Hübscher Cap, z. B. „8 h". */
  capLabel: string;
}

/** Dauer in Spielsprache: „< 1 min" · „45 min" · „2 h 14 min" · „1 T 3 h". */
export function formatAway(ms: number): string {
  const mins = Math.floor(Math.max(0, ms) / 60_000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rest = mins % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }
  const days = Math.floor(hours / 24);
  const restH = hours % 24;
  return restH === 0 ? `${days} T` : `${days} T ${restH} h`;
}

/** Cap in Stunden, deutsch (Dezimalkomma) und ohne überflüssige Nachkommastelle. */
export function formatCap(capS: number): string {
  const hours = Math.max(0, capS) / 3600;
  const rounded = Math.round(hours * 10) / 10;
  return `${String(rounded).replace('.', ',')} h`;
}

/**
 * Die Card-Daten für eine Abwesenheit — oder `null`, wenn keine Card gezeigt
 * werden soll (zu kurz weg oder nichts verdient). `null` heißt für den Aufrufer
 * NICHT „nichts gutschreiben": unter der Schwelle wird wie bisher still gebucht.
 */
export function welcomeBackData(
  dps: number,
  zone: number,
  elapsedMs: number,
  opts: OfflineOpts = {},
): WelcomeBackData | null {
  if (!(elapsedMs > WELCOME_BACK_MIN_MS)) return null;
  const gold = offlineGold(dps, zone, elapsedMs, opts);
  if (gold < 1) return null;
  const capS = opts.capS ?? OFFLINE_CAP_S;
  return {
    gold,
    awayMs: elapsedMs,
    away: formatAway(elapsedMs),
    capS,
    capped: elapsedMs / 1000 > capS,
    capLabel: formatCap(capS),
  };
}
