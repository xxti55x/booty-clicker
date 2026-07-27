/**
 * „Bühne der Woche" (ROADMAP-V2 A5) — pur, DOM-frei, save-frei, UHR-frei bis auf
 * das eine `now`-Argument.
 *
 * A1 gab jeder Bühne eine Hausregel, die pro LAUF gewürfelt wird (`remixSeedFor`
 * hängt am Spieler-Seed). A5 setzt EINE Bühne pro Woche dagegen, die für ALLE
 * Spieler weltweit dieselbe ist: gleiche Bühnen-Nummer, gleiche zwei
 * Modifikatoren, ohne Server, ohne Konfiguration — beides fällt aus der ISO-Woche.
 * Das ist der Retention-Anker („dienstags ist die neue Bühne da"), und weil er
 * rein aus dem Kalender kommt, kann er nicht driften, nicht ausfallen und nicht
 * manipuliert werden (ein Save-Scum ändert die Woche nicht, eine Uhr-Verstellung
 * verschiebt nur den eigenen Client).
 *
 * **Präzedenz (die eine Regel, die man kennen muss):** Auf der Wochen-Bühne
 * ERSETZEN die zwei Wochen-Modifikatoren den A1-Modifikator — sie stapeln NICHT
 * obendrauf. Drei gleichzeitige Hausregeln wären weder lesbar (die Bühnen-Card
 * hat Platz für zwei Zeilen) noch balancierbar (drei multiplikative Faktoren auf
 * einer Bühne sprengen jede Abschätzung). Auf jeder anderen Bühne bleibt A1
 * byte-gleich. Die Regel steht an genau EINER Stelle — {@link stageModsFor} —,
 * und Spiel (`main.ts`), HUD (`ch-hud.ts`) und Kampf (`combat.spawnFor`) lesen
 * ausschließlich sie.
 *
 * **Kein Spieler-Seed.** Die Modifikatoren kommen aus `weekSeedFor(week)`, nicht
 * aus `state.rng.seed` — sonst sähe jeder Spieler eine andere „Bühne der Woche"
 * und das gemeinsame Wochen-Board (X4) verglichen Äpfel mit Birnen.
 */
import { ZONES_PER_THEME } from './boss-gimmicks';
import { DAY_MS, type MetaState, dayNumber } from './quests';
import {
  NEUTRAL_FACTORS,
  STAGE_MODS,
  type StageMod,
  type StageModFactors,
  modForZone,
} from './stage-mods';
import { floatAt } from '../util/rng';

// ---------------------------------------------------------------------------
// Wochen-Nummerierung (ISO 8601, UTC)
// ---------------------------------------------------------------------------

/**
 * Der Wochen-Index: **fortlaufende Montags-Wochen seit der Epoch**, also
 * `floor((Tag + 3) / 7)` über der UTC-Tagesnummer aus {@link dayNumber}. Die `+ 3`
 * verschiebt den Epoch-Donnerstag (1970-01-01) auf den Montag davor — jeder Index
 * beginnt damit exakt an einem ISO-Wochen-Montag um 00:00 UTC.
 *
 * Warum ein INDEX und nicht die ISO-Wochennummer (1…53): der Index ist monoton
 * und für immer eindeutig. Er taugt deshalb als Seed (Woche 52 in zwei Jahren
 * gibt zwei verschiedene Bühnen), als Board-Schlüssel (X4: `weekly-2951`) und als
 * persistierter Vergleichswert. Die 1…53er-Nummer ist reine ANZEIGE
 * ({@link isoWeekOf}).
 *
 * Nicht zu verwechseln mit `quests.weekNumber` (= `floor(Tag / 7)`): das ist das
 * Donnerstags-Raster des Streak-Schutz-Budgets und bleibt unangetastet — es zählt
 * ein Kontingent, keine Kalenderwoche.
 */
export function weekIndexOf(nowMs: number): number {
  return Math.floor((dayNumber(nowMs) + 3) / 7);
}

/** Der Wochen-Index, der die Wochen-Bühne AUSSCHALTET (wie `REMIX_OFF` bei A1). */
export const WEEK_OFF = 0;

/** Beginn (UTC-Montag 00:00) der Woche `week` in ms. */
export function weekStartMs(week: number): number {
  return (7 * Math.max(0, Math.floor(week)) - 3) * DAY_MS;
}

/** Ende der Woche `week` in ms = Beginn der Folgewoche (exklusiv). */
export function weekEndMs(week: number): number {
  return weekStartMs(Math.max(0, Math.floor(week)) + 1);
}

/**
 * ISO-Jahr + ISO-Wochennummer (1…53) eines Wochen-Index — nur für die Anzeige
 * („KW 30"). Standard-Regel: die Woche gehört dem Jahr, in dem ihr DONNERSTAG
 * liegt; die Nummer ist der Abstand dieses Donnerstags zum 1. Januar desselben
 * Jahres in ganzen Wochen, plus eins.
 */
export function isoWeekOf(week: number): { isoYear: number; isoWeek: number } {
  const thursday = weekStartMs(week) + 3 * DAY_MS;
  const isoYear = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  return { isoYear, isoWeek: 1 + Math.floor((thursday - jan1) / (7 * DAY_MS)) };
}

// ---------------------------------------------------------------------------
// Die Bühne der Woche
// ---------------------------------------------------------------------------

/** Erste Bühne des Wochen-Fensters. */
export const WEEKLY_MIN_ZONE = 20;
/** Breite des Wochen-Fensters: Bühnen 20…79. */
export const WEEKLY_SPAN = 60;
/** Schrittweite pro Woche — teilerfremd zu {@link WEEKLY_SPAN}. */
export const WEEKLY_STEP = 7;

/**
 * Die Bühnen-Nummer der Woche:
 *
 * ```
 * zone = 20 + (week * 7 mod 60)          // Fenster 20…79
 * if (zone mod 5 === 0) zone += 1        // Boss-Gate ⇒ eine Bühne weiter
 * ```
 *
 * Warum so: `ggT(7, 60) = 1`, der Schritt läuft also über 60 Wochen durch JEDEN
 * Rest des Fensters, statt in einem kurzen Zyklus zu kreisen — zwei aufeinander
 * folgende Wochen liegen dabei sieben Bühnen (= ein ganzes Theme + zwei)
 * auseinander, sodass sich auch die Kulisse ändert. Das Fenster startet bei 20
 * (deutlich über `MOD_MIN_ZONE` = 11, damit die Bühne ein Ziel ist und kein
 * Startgebiet) und endet bei 79 (in Reichweite eines Spielers, der die zweite
 * Prestige-Schicht kennt).
 *
 * Die Korrektur `+1` auf Boss-Gates ist keine Kosmetik, sondern die A1-Architektur:
 * **Boss-Bühnen tragen NIE einen Modifikator** (sie sind die Wände der Progression
 * und tragen bereits die Theme-Gimmicks). Die Wochen-Bühne ist deshalb per
 * Konstruktion immer eine Nicht-Boss-Bühne ≥ 20 — nachgewiesen im Test über alle
 * 60 Restklassen.
 */
export function weeklyZoneFor(week: number): number {
  const w = Math.max(0, Math.floor(week));
  const zone = WEEKLY_MIN_ZONE + ((w * WEEKLY_STEP) % WEEKLY_SPAN);
  return zone % ZONES_PER_THEME === 0 ? zone + 1 : zone;
}

/**
 * Der Seed der Woche — ein splitmix-Mixer über dem Wochen-Index. Bewusst NICHT
 * der Index selbst: aufeinanderfolgende Wochen sollen keine benachbarten
 * Katalog-Indizes ziehen, sondern frisch würfeln.
 */
export function weekSeedFor(week: number): number {
  let h = (Math.max(0, Math.floor(week)) ^ 0x1f2e3d4c) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) | 0;
  return (h ^ (h >>> 16)) | 0;
}

/**
 * Die zwei Modifikatoren der Woche — garantiert VERSCHIEDEN: der zweite Wurf
 * zieht aus den verbleibenden sieben Katalog-Einträgen und wird anschließend um
 * den ersten herum aufgefaltet (`j >= i ⇒ j + 1`). Zwei gleiche Regeln wären
 * keine Kombination, sondern eine doppelte Zeile.
 */
export function weeklyModsFor(week: number): readonly [StageMod, StageMod] {
  const n = STAGE_MODS.length;
  const seed = weekSeedFor(week);
  const i = Math.min(n - 1, Math.floor(floatAt(seed, 1) * n));
  const j0 = Math.min(n - 2, Math.floor(floatAt(seed, 2) * (n - 1)));
  const j = j0 >= i ? j0 + 1 : j0;
  return [STAGE_MODS[i], STAGE_MODS[j]];
}

/** Die Wochen-Bühne: Nummer, Anzeige-Woche und die zwei gestapelten Regeln. */
export interface WeeklyStage {
  /** Der Wochen-Index (monoton, Seed + Board-Schlüssel + Persistenz). */
  readonly week: number;
  /** ISO-Wochennummer 1…53 (Anzeige: „KW 30"). */
  readonly isoWeek: number;
  /** ISO-Jahr der Woche (Anzeige/Board-Kontext). */
  readonly isoYear: number;
  /** Die Bühne dieser Woche — immer eine Nicht-Boss-Bühne ≥ {@link WEEKLY_MIN_ZONE}. */
  readonly zone: number;
  /** Genau zwei VERSCHIEDENE Modifikatoren aus dem A1-Katalog. */
  readonly mods: readonly [StageMod, StageMod];
  /** Beginn der Woche (UTC-Montag) in ms. */
  readonly startMs: number;
  /** Ende der Woche (= Beginn der Folgewoche) in ms. */
  readonly endMs: number;
}

/** Die Wochen-Bühne eines Wochen-Index (`WEEK_OFF` ⇒ `null`, wie `REMIX_OFF`). */
export function weeklyStageFor(week: number): WeeklyStage | null {
  if (!Number.isFinite(week) || week === WEEK_OFF || week < 0) return null;
  const w = Math.floor(week);
  const { isoWeek, isoYear } = isoWeekOf(w);
  return {
    week: w,
    isoWeek,
    isoYear,
    zone: weeklyZoneFor(w),
    mods: weeklyModsFor(w),
    startMs: weekStartMs(w),
    endMs: weekEndMs(w),
  };
}

/** Die Wochen-Bühne zu einer Wanduhr-Zeit. */
export function weeklyStage(nowMs: number): WeeklyStage | null {
  return weeklyStageFor(weekIndexOf(nowMs));
}

/** Liegt `zone` in der Woche `week` auf der Wochen-Bühne? */
export function isWeeklyZone(zone: number, week: number): boolean {
  if (!Number.isFinite(zone) || !Number.isFinite(week) || week === WEEK_OFF || week < 0) {
    return false;
  }
  return Math.floor(zone) === weeklyZoneFor(week);
}

// ---------------------------------------------------------------------------
// Präzedenz: welche Regeln gelten auf einer Bühne?
// ---------------------------------------------------------------------------

/**
 * **Die Präzedenz-Regel.** Auf der Wochen-Bühne gelten die ZWEI Wochen-Regeln und
 * sonst nichts; überall sonst gilt die EINE A1-Regel (oder keine). Nie beides.
 *
 * Rückgabe ist immer eine Liste (0, 1 oder 2 Einträge), damit die Aufrufer keinen
 * Sonderfall kennen müssen: der Strip rendert das erste Icon (bzw. sein
 * 📅-Badge), die Bühnen-Card rendert alle, {@link combineFactors} rechnet alle.
 */
export function stageModsFor(zone: number, remix: number, week: number): readonly StageMod[] {
  if (isWeeklyZone(zone, week)) return weeklyModsFor(week);
  const m = modForZone(zone, remix);
  return m ? [m] : [];
}

/**
 * Die Faktoren mehrerer gestapelter Modifikatoren. Multiplikativ, wo A1
 * multiplikativ rechnet (gold/hp/click/dps/comboDecay/ekstase/chest/peachGap),
 * additiv, wo A1 additiv rechnet (`crit` in Anteilen, `beat` als Zuschlag auf den
 * On-Beat-Multiplikator) — dieselbe Semantik wie ein einzelner Modifikator, nur
 * zweimal angewandt. Leere Liste ⇒ der neutrale Satz (identisch zu A1).
 */
export function combineFactors(mods: readonly StageMod[]): StageModFactors {
  if (mods.length === 0) return NEUTRAL_FACTORS;
  if (mods.length === 1) return mods[0].f;
  let out: StageModFactors = NEUTRAL_FACTORS;
  for (const m of mods) {
    out = {
      gold: out.gold * m.f.gold,
      hp: out.hp * m.f.hp,
      click: out.click * m.f.click,
      dps: out.dps * m.f.dps,
      crit: out.crit + m.f.crit,
      beat: out.beat + m.f.beat,
      comboDecay: out.comboDecay * m.f.comboDecay,
      ekstase: out.ekstase * m.f.ekstase,
      chest: out.chest * m.f.chest,
      peachGap: out.peachGap * m.f.peachGap,
    };
  }
  return out;
}

/**
 * Die wirksamen Faktoren einer Bühne unter der Präzedenz-Regel — der EINE
 * Ersatz für `factorsForZone`, sobald eine Woche im Spiel ist. Mit
 * `week = WEEK_OFF` ist das Ergebnis byte-gleich zu A1.
 */
export function stageFactorsFor(zone: number, remix: number, week: number): StageModFactors {
  return combineFactors(stageModsFor(zone, remix, week));
}

/** Ausdauer-Faktor der Rivalen unter der Präzedenz-Regel (`combat.spawnFor`). */
export function weeklyHpScale(zone: number, remix: number, week: number): number {
  return stageFactorsFor(zone, remix, week).hp;
}

// ---------------------------------------------------------------------------
// Wochen-Bestzone (persistiert im Meta-Slice)
// ---------------------------------------------------------------------------

/**
 * Die **Wochen-Bestzone**: der Highwater der Frontier (`runMaxZone`) INNERHALB
 * einer Woche. Bewusst nicht „tiefste Bühne, auf der du diese Woche auf der
 * Wochen-Bühne gefarmt hast" — das wäre eine Zahl, die nur zwischen 0 und der
 * einen Wochen-Bühne springt und nichts über die Woche aussagt. Der Frontier-
 * Highwater ist ehrlich (er misst genau das, was das Spiel misst), lässt sich
 * nicht durch Rückreisen senken und passt ohne Umrechnung auf das Wochen-Board.
 *
 * Rollt die Woche, startet die Zahl bei der aktuellen Zone neu — der Vergleich
 * `meta.weekIndex !== week` ist der einzige Reset-Trigger, es gibt keinen Timer.
 * Rückwärts gestellte Uhr: die Woche wechselt, der Wert startet neu — kein
 * Gewinn, kein Verlust an anderer Stelle (die Wochen-Bestzone ist rein
 * kosmetisch/Board-relevant, sie schaltet nichts frei).
 */
export function noteWeeklyBest(meta: MetaState, week: number, zone: number): MetaState {
  if (!Number.isFinite(week) || !Number.isFinite(zone)) return meta;
  const w = Math.floor(week);
  const z = Math.max(0, Math.floor(zone));
  if (meta.weekIndex === w) {
    return z > meta.weekBestZone ? { ...meta, weekBestZone: z } : meta;
  }
  return { ...meta, weekIndex: w, weekBestZone: z };
}

/** Die Wochen-Bestzone für die laufende Woche (0, sobald die Woche gerollt ist). */
export function weeklyBestZone(meta: MetaState, week: number): number {
  return meta.weekIndex === Math.floor(week) ? meta.weekBestZone : 0;
}

// ---------------------------------------------------------------------------
// Board-Saisons (X4) — derselbe Kalender, gröber
// ---------------------------------------------------------------------------

/**
 * Länge einer Saison in Wochen (ein Quartal). Die Saison ist die grobe Einteilung
 * über den Wochen-Boards: ein Etikett, das jeder Client aus demselben Kalender
 * ableitet — die API kennt (bewusst) keinen Saison-Zustand.
 */
export const SEASON_WEEKS = 13;

/**
 * Der Wochen-Index, mit dem Saison 1 beginnt: Montag, 30.12.2024 = ISO 2025-W01.
 * Konstante statt `Date`-Aufruf beim Laden — das Modul bleibt uhrfrei.
 */
export const SEASON_EPOCH_WEEK = 2870;

/** Eine Board-Saison (X4): Nummer + Fenster. */
export interface BoardSeason {
  /** 1-basierte Saison-Nummer. */
  readonly number: number;
  /** Erster Wochen-Index der Saison. */
  readonly firstWeek: number;
  /** Letzter Wochen-Index der Saison (inklusive). */
  readonly lastWeek: number;
  /** Ende der Saison in ms (= Beginn der Folge-Saison, exklusiv). */
  readonly endMs: number;
}

/**
 * Die Saison eines Wochen-Index. Vor {@link SEASON_EPOCH_WEEK} (kann nur eine
 * verstellte Uhr sein) liefert die Funktion Saison 1, damit die Anzeige nie
 * „Saison −3" zeigt.
 */
export function boardSeasonFor(week: number): BoardSeason {
  const w = Math.max(SEASON_EPOCH_WEEK, Math.floor(Number.isFinite(week) ? week : 0));
  const number = Math.floor((w - SEASON_EPOCH_WEEK) / SEASON_WEEKS) + 1;
  const firstWeek = SEASON_EPOCH_WEEK + (number - 1) * SEASON_WEEKS;
  return {
    number,
    firstWeek,
    lastWeek: firstWeek + SEASON_WEEKS - 1,
    endMs: weekStartMs(firstWeek + SEASON_WEEKS),
  };
}

/** Der Board-Schlüssel des Wochen-Boards einer Woche (X4, API-`board`-Param). */
export function weeklyBoardKey(week: number): string {
  return `weekly-${Math.max(0, Math.floor(week))}`;
}
