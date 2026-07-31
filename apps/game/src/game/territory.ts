/**
 * **Gebietsherrschaft** (IDEEN-GAMEPLAY 1b) — vier permanente Ruf-Leisten.
 *
 * Jede der vier Bühnen-Themen (Club/Synth/Beach/Space) führt einen eigenen
 * **Ruf-Zähler**: einen reinen Lebenszeit-Highwater, der bei jedem Kill auf einer
 * Bühne DIESES Themas wächst und den KEINER der drei Resets anfasst (Aszension,
 * Himmelfahrt, Transzendenz). Aus dem Zähler fällt eine **Ruf-Stufe** (0…10), und
 * jede Stufe zahlt einen kleinen Bonus, der **ausschließlich auf Bühnen des
 * eigenen Themes** greift.
 *
 * Die Theme-Zuordnung wird NICHT hier erfunden — sie kommt aus der einen Quelle
 * des Spiels ({@link themeForZone} in `boss-gimmicks.ts`), die auch Kulisse,
 * Zonen-Strip und Boss-Gimmick liest.
 *
 * ## Warum BP und nichts anderes
 *
 * Der Bonus ist ein **BP-Faktor auf Kills der eigenen Theme-Bühnen** — genau das
 * Beispiel des Ideen-Dokuments („Club-Legende: +5 % BP auf Club-Bühnen"). Ein
 * SCHADENS-Term wäre hier die falsche Wahl: Boss-Gates sind 30-Sekunden-Schranken,
 * und die A2-Kalibrierung hat gemessen, wie empfindlich sie auf jeden Prozentpunkt
 * Wirkung reagieren (ein ungedämpftes Gimmick-Paket verschob die Wand um Bühnen).
 * Ein BP-Term dagegen läuft in die Kosten-Leiter der Crew (×1.075/Level), die jeden
 * Einkommens-Zuwachs logarithmisch wieder einebnet: mehr BP heißt „ein paar Level
 * früher", nie „ein Gate, das sonst zu wäre".
 *
 * ## Das Budget (Leitplanke: ≤ ×1.15 auf einer Theme-Bühne)
 *
 * {@link TERRITORY_GOLD_PER_RANK} × {@link TERRITORY_MAX_RANK} = **+15 %**, also
 * ×1.15 auf der eigenen Bühne — und das ist zugleich der Deckel für den
 * VOLL-Ausbau aller vier Themen, weil ein Kill immer auf genau EINER Bühne landet
 * und deren Theme allein zählt. Es gibt hier bewusst kein Produkt über vier
 * Leisten: Club-Ruf ist auf einer Space-Bühne exakt ×1.00. Das ist die konkrete
 * Lesart von „kein Global-Creep" — die Zahl steht in
 * {@link territoryPowerBudget} und ist als Test eingefroren.
 *
 * ## Die Kurve (logarithmisch, gemessen statt geraten)
 *
 * Die Schwellen wachsen geometrisch ({@link REP_GROWTH} je Stufe), die STUFE ist
 * damit der Logarithmus des Rufs. Geeicht ist die Leiter an der gemessenen
 * Ruf-Rate des Anker-Bots (`npm run balance`, Abschnitt 10 — der Bot rotiert wie
 * jeder Spieler durch alle vier Themen, weil `themeForZone` alle fünf Bühnen
 * wechselt). Gemessen (Profil `SIM_ACTIVE`, 3 Klicks/s + Juice, volle
 * Loot-Ökonomie, Seeds 1/7/12345, Ruf des STÄRKSTEN Themes):
 *
 * | Spielzeit          | Σ alle vier | stärkstes Theme | dessen Ruf/h | Stufe |
 * | ------------------ | ----------- | --------------- | ------------ | ----- |
 * | 1 Sitzung (45 min) | 732         | 273             | 364          | 1     |
 * | 3 h (4 Läufe)      | 4 270       | 1 454           | 485          | 3     |
 * | 12 h (16 Läufe)    | 19 308      | 7 716           | 643          | 6     |
 * | 24 h (32 Läufe)    | 39 613      | 16 218          | 676          | 8     |
 *
 * (Die Kurve wurde OHNE den BP-Bonus gemessen — dort steht der Beharrungszustand
 * bei ~530 Ruf/h — und danach MIT ihm nachgemessen: Die eigene Wirkung hebt die
 * Rate auf ~676 Ruf/h, weil mehr BP etwas tiefer tragen. Die Leiter ist gegen die
 * konservative Zahl gewählt und liest sich mit der Rückkopplung nur schneller.)
 *
 * Zwei Dinge stehen in dieser Tabelle. **Erstens**: Die Rate ist nach der ersten
 * Stunde praktisch KONSTANT (~530 Ruf/h auf dem stärksten Theme, ~1 570 Ruf/h
 * über alle vier) — der Bot klettert jede Tour dieselbe Strecke neu hoch, und
 * tiefere Bühnen zahlen keinen höheren Ruf (ein Kill ist ein Kill; alles andere
 * hätte jede Aszension den bisherigen Ruf entwertet). Bei konstanter Rate ist
 * eine geometrische Leiter das einzige, was „Stufe 10 braucht Wochen" erfüllt,
 * ohne die frühen Stufen unerreichbar zu machen: Jede Stufe kostet
 * ×{@link REP_GROWTH} der vorigen, die ZEIT bis Stufe n wächst also exponentiell,
 * während die gefühlte Belohnung (+1,5 pp BP) gleich bleibt.
 *
 * **Zweitens**: Der Ruf verteilt sich NICHT gleichmäßig (24 h: Club 7 676 ·
 * Synth 7 847 · Beach 16 218 · Space 7 872). Der Bot hängt an seiner Wand und
 * farmt dort, was gerade unter ihm liegt — in der langen Kette meist das
 * Beach-Fünftel (11–15 / 31–35). Genau das ist die zweite Entscheidungs-Ebene,
 * die 1b wollte: WO man farmt, zählt.
 *
 * Daraus die Leiter (Stufe 1 = {@link REP_BASE}, ×1.8 je Stufe): 250 · 450 · 810
 * · 1 458 · 2 624 · 4 724 · 8 503 · 15 306 · 27 550 · 49 590. Stufe 1 fällt in
 * der ERSTEN Sitzung (gemessen 280…300 je Seed), Stufe 3 nach ~3 h, Stufe 6 nach
 * ~12 h, Stufe 8 nach einem vollen Tag — und **Stufe 10 nach ~73 h ununterbrochen
 * aktivem Spiel AUF DIESEM THEME** (ohne die Rückkopplung gerechnet: ~94 h). Bei
 * einer Stunde am Abend sind das gut zwei Monate. Dieselbe Größenordnung wie der
 * Legenden-Rang der Crew-Meisterschaft (~100 h), und für alle vier Leisten
 * entsprechend mehr, weil man immer nur auf EINEM Theme steht.
 *
 * Alles hier ist pur und DOM-frei: die Glue (`main.ts`) bucht, das Panel
 * (`ui/territory-panel.ts`) zeichnet, der Bot (`sim.ts`) faltet dieselben
 * Funktionen, und die Insel-Trophäe (`world/backgrounds.ts`) liest nur
 * {@link trophyTier}.
 */
import type { BackgroundKey } from '../types';
import { ZONE_THEMES, themeForZone } from './boss-gimmicks';

// ---------------------------------------------------------------------------
// Der Zustand
// ---------------------------------------------------------------------------

/**
 * Ruf je Theme-Schlüssel (fehlt = 0) — dieselbe flache Form wie `CrewMastery`
 * und `Gilds`. Ein Record statt vier benannter Felder, damit die Reparatur und
 * die Migration über dieselbe Schleife laufen wie bei jeder anderen Zähler-Map.
 */
export type Territory = Record<string, number>;

/** Frische (leere) Ruf-Tafel — jedes Theme startet bei 0. */
export function createTerritory(): Territory {
  return {};
}

/** Die vier Themen in Rotations-Reihenfolge (re-exportiert, EINE Quelle). */
export { ZONE_THEMES, themeForZone };

/** Ist `key` eines der vier echten Bühnen-Themen? */
export function isThemeKey(key: unknown): key is BackgroundKey {
  return typeof key === 'string' && (ZONE_THEMES as readonly string[]).includes(key);
}

// ---------------------------------------------------------------------------
// Ruf-Gewinn (nur Kills — es gibt keine zweite Quelle)
// ---------------------------------------------------------------------------

/** Ruf für eine erledigte Rivalin. */
export const REP_PER_RIVAL = 1;
/**
 * Ruf für einen Boss-Sieg. Zehnfach, weil ein Gate zehn Rivalen wert ist (jede
 * Bühne trägt `MONSTERS_PER_ZONE` = 10) — ein Theme-Zyklus aus fünf Bühnen zahlt
 * damit 50 + 10 = 60 Ruf, wovon der Boss ein Sechstel trägt: spürbar, ohne dass
 * Ruf allein am Gate hängt (wer an einem Gate scheitert, sammelt trotzdem).
 */
export const REP_PER_BOSS = 10;

/** Ruf für EINEN Kill auf `zone` (Boss oder Rivalin) — die eine Gewinn-Regel. */
export function repForKill(boss: boolean): number {
  return boss ? REP_PER_BOSS : REP_PER_RIVAL;
}

/**
 * `n` Ruf auf das Konto von `theme` buchen — der EINZIGE Weg, wie Ruf entsteht.
 * Monoton (nicht-positive/krumme Werte lassen die Tafel unverändert), rein
 * (liefert eine NEUE Tafel) und blind gegen Müll-Schlüssel: Nur die vier echten
 * Themen bekommen ein Konto.
 */
export function addRep(t: Territory, theme: string, n: number): Territory {
  if (!isThemeKey(theme) || !Number.isFinite(n) || n <= 0) return t;
  const add = Math.floor(n);
  if (add <= 0) return t;
  return { ...t, [theme]: (t[theme] ?? 0) + add };
}

/** Der gebuchte Ruf eines Themes (0 für alles Unbekannte). */
export function repOf(t: Territory, theme: string): number {
  const v = t[theme];
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

// ---------------------------------------------------------------------------
// Die Kurve
// ---------------------------------------------------------------------------

/** Höchste Ruf-Stufe je Theme. */
export const TERRITORY_MAX_RANK = 10;
/**
 * Ruf für Stufe 1 — 250, also 25 Rivalen (zweieinhalb Bühnen) oder gut vier
 * Boss-Gates. Gemessen fällt die Stufe damit in der ERSTEN Sitzung (45 min:
 * 280…300 Ruf je Seed auf dem stärksten Theme): Die Leiste bewegt sich am ersten
 * Abend sichtbar, sonst wäre sie kein Ziel, sondern eine leere Zeile.
 */
export const REP_BASE = 250;
/**
 * Wachstum je Stufe — gegen die gemessene Rate gewählt, nicht geraten. Mit 1.8
 * kostet Stufe 10 `250 · 1.8⁹` = **49 590 Ruf**, bei den gemessenen ~530 Ruf/h
 * also ~94 h aktives Spiel auf diesem Theme (mit der eigenen Rückkopplung ~73 h;
 * eine Stunde am Abend ⇒ gut zwei Monate). Die Alternativen wurden mitgemessen:
 * 1.75 ⇒ 73 h (zu schnell, „Wochen" würde zu „ein langer Monat"), 1.85 ⇒ 120 h —
 * 1.8 sitzt in derselben
 * Größenordnung wie der Legenden-Rang der Crew-Meisterschaft (~100 h) und hält
 * die Leiter damit im Rahmen dessen, was das Spiel als „Lebenszeit" schon kennt.
 */
export const REP_GROWTH = 1.8;

/**
 * Die Ruf-Schwelle der Stufe `rank` (1…{@link TERRITORY_MAX_RANK}); 0 für Stufe
 * ≤ 0, `Infinity` jenseits der letzten Stufe (so bleibt jeder Vergleich in der
 * UI ohne Sonderfall lesbar).
 */
export function repForRank(rank: number): number {
  if (!Number.isFinite(rank) || rank <= 0) return 0;
  if (rank > TERRITORY_MAX_RANK) return Number.POSITIVE_INFINITY;
  return Math.round(REP_BASE * Math.pow(REP_GROWTH, Math.floor(rank) - 1));
}

/**
 * Die Ruf-Stufe zu `rep` (0…{@link TERRITORY_MAX_RANK}). Läuft im Renderpfad und
 * darf deshalb nie werfen: Nicht-endliche/negative Werte lesen als 0.
 */
export function territoryRank(rep: number): number {
  if (!Number.isFinite(rep) || rep <= 0) return 0;
  let rank = 0;
  for (let r = 1; r <= TERRITORY_MAX_RANK; r++) if (rep >= repForRank(r)) rank = r;
  return rank;
}

/** Die Ruf-Stufe eines Themes auf der Tafel. */
export function rankOf(t: Territory, theme: string): number {
  return territoryRank(repOf(t, theme));
}

// ---------------------------------------------------------------------------
// Die Wirkung (theme-gebunden, sonst nichts)
// ---------------------------------------------------------------------------

/** BP-Bonus je Ruf-Stufe (additiv) — 10 Stufen ⇒ +15 %. */
export const TERRITORY_GOLD_PER_RANK = 0.015;

/**
 * Der BP-Faktor eines Themes: `1 + 1,5 % · Stufe`. ×1.00 ohne Ruf, ×1.15 bei
 * Stufe 10 — und NUR auf Bühnen dieses Themes (siehe {@link territoryGoldMult}).
 */
export function territoryGoldMultForTheme(t: Territory, theme: string): number {
  return 1 + TERRITORY_GOLD_PER_RANK * rankOf(t, theme);
}

/**
 * Der BP-Faktor auf `zone` — die eine Funktion, die Spiel, Offline-Ertrag und Bot
 * lesen. Sie schlägt das Theme der Bühne über {@link themeForZone} nach; ein Ruf
 * auf einem ANDEREN Theme faltet hier per Konstruktion ×1.
 */
export function territoryGoldMult(t: Territory, zone: number): number {
  return territoryGoldMultForTheme(t, themeForZone(zone));
}

/**
 * **Das Leistungs-Budget**: der höchste wirksame Faktor, den eine einzelne Bühne
 * je sehen kann — Voll-Ausbau ALLER vier Leisten inklusive, weil ein Kill immer
 * genau einem Theme gehört. Ein Test friert die Zahl ein (Leitplanke ≤ ×1.15),
 * und `npm run balance` druckt sie in Abschnitt 10.
 */
export function territoryPowerBudget(): number {
  return 1 + TERRITORY_GOLD_PER_RANK * TERRITORY_MAX_RANK;
}

// ---------------------------------------------------------------------------
// Namen, Titel, Trophäe (Anzeige-Daten, keine Logik)
// ---------------------------------------------------------------------------

export interface ThemeConfig {
  readonly id: BackgroundKey;
  /** Kurzname für die Leiste („Club") — der Titel setzt ihn voran. */
  readonly short: string;
  /** Voller Kulissen-Name, wie ihn der Skins-Tab zeigt. */
  readonly name: string;
  readonly icon: string;
  /** Die fünf Bühnen dieses Themes je Runde, als Satz für den Tooltip. */
  readonly zones: string;
}

/**
 * Die vier Themen als Anzeige-Daten. Namen/Icons sind bewusst DIESELBEN wie in
 * `world/backgrounds.ts` (Neon-Club/Synthwave/Sunset Beach/Deep Space) — die
 * Leiste soll nach der Kulisse aussehen, auf der man farmt.
 */
export const THEMES: readonly ThemeConfig[] = [
  { id: 'club', short: 'Club', name: 'Neon-Club', icon: '🪩', zones: 'Bühnen 1–5, 21–25, …' },
  { id: 'synth', short: 'Synth', name: 'Synthwave', icon: '🌆', zones: 'Bühnen 6–10, 26–30, …' },
  {
    id: 'beach',
    short: 'Beach',
    name: 'Sunset Beach',
    icon: '🏖️',
    zones: 'Bühnen 11–15, 31–35, …',
  },
  { id: 'space', short: 'Space', name: 'Deep Space', icon: '🌌', zones: 'Bühnen 16–20, 36–40, …' },
];

const THEME_BY_ID: Record<string, ThemeConfig> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/** Die Anzeige-Daten eines Themes (`undefined` für alles Unbekannte). */
export function themeConfig(theme: string): ThemeConfig | undefined {
  return THEME_BY_ID[theme];
}

/**
 * Die Titel-Leiter. Sie hängt an der STUFE, nicht am Theme — davor steht der
 * Kurzname, sodass genau der Titel aus dem Ideen-Dokument entsteht:
 * Stufe 10 auf Club ⇒ „Club-Legende".
 */
export const TERRITORY_TITLES: readonly { readonly from: number; readonly title: string }[] = [
  { from: 1, title: 'Gast' },
  { from: 3, title: 'Stammgast' },
  { from: 5, title: 'Hausherr' },
  { from: 7, title: 'Ikone' },
  { from: 10, title: 'Legende' },
];

/** Der Titel zu einer Stufe (`''` bei Stufe 0). */
export function titleForRank(rank: number): string {
  let title = '';
  for (const t of TERRITORY_TITLES) if (rank >= t.from) title = t.title;
  return title;
}

/** „Club-Legende" — Kurzname + Titel (`''` bei Stufe 0 oder Müll-Theme). */
export function territoryTitle(theme: string, rank: number): string {
  const cfg = THEME_BY_ID[theme];
  const title = titleForRank(rank);
  return cfg && title ? `${cfg.short}-${title}` : '';
}

/**
 * Ab dieser Ruf-Stufe steht die **Insel-Trophäe** am Rand der Theme-Bühnen. Sie
 * ist rein kosmetisch und sitzt im G3-Ambient-Slot der Kulisse (`backgrounds.ts`),
 * also im selben Batch-Budget wie Publikum und Glühwürmchen.
 */
export const TROPHY_MIN_RANK = 3;

/**
 * Die Trophäen-Stufe einer Ruf-Stufe: 0 = keine, 1 = Bronze (ab Stufe
 * {@link TROPHY_MIN_RANK}), 2 = Silber (ab 6), 3 = Gold (Stufe 10). Drei sichtbare
 * Sprünge auf zehn Stufen — jede Stufe eine neue Trophäe wäre auf 30 px Insel-Rand
 * nicht unterscheidbar.
 */
export function trophyTier(rank: number): number {
  if (rank >= TERRITORY_MAX_RANK) return 3;
  if (rank >= 6) return 2;
  if (rank >= TROPHY_MIN_RANK) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Fortschritt (UI-freundlich, rein)
// ---------------------------------------------------------------------------

export interface TerritoryProgress {
  /** Stufe 0…10. */
  readonly rank: number;
  /** Gebuchter Ruf. */
  readonly rep: number;
  /** Titel dieser Stufe (`''` bei Stufe 0). */
  readonly title: string;
  /** Schwelle der aktuellen Stufe (0 bei Stufe 0). */
  readonly at: number;
  /** Schwelle der NÄCHSTEN Stufe (0, wenn Stufe 10 steht). */
  readonly next: number;
  /** Fortschritt in der laufenden Stufe, 0…1 (1 bei Stufe 10). */
  readonly frac: number;
  /** BP-Faktor auf den eigenen Bühnen. */
  readonly goldMult: number;
  /** Trophäen-Stufe (0…3). */
  readonly trophy: number;
}

/** Stufe + Fortschritt zur nächsten Stufe für einen Ruf-Stand. */
export function territoryProgress(rep: number): TerritoryProgress {
  const safe = Number.isFinite(rep) && rep > 0 ? Math.floor(rep) : 0;
  const rank = territoryRank(safe);
  const at = repForRank(rank);
  const next = rank >= TERRITORY_MAX_RANK ? 0 : repForRank(rank + 1);
  const span = next - at;
  const frac = next <= 0 ? 1 : Math.max(0, Math.min(1, (safe - at) / (span > 0 ? span : 1)));
  return {
    rank,
    rep: safe,
    title: titleForRank(rank),
    at,
    next,
    frac,
    goldMult: 1 + TERRITORY_GOLD_PER_RANK * rank,
    trophy: trophyTier(rank),
  };
}
