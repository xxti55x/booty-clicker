/**
 * Truhen-Kobold (ROADMAP-V2 A3) — pur, DOM-frei, save-frei.
 *
 * Alle `GOBLIN_MIN_S`–`GOBLIN_MAX_S` Minuten hoppelt ein Kobold mit einer Truhe
 * für `GOBLIN_VISIBLE_S` Sekunden über die Insel. `GOBLIN_HITS` Klicks fangen
 * ihn (→ Holztruhe + ein kurzer Mini-Frenzy), verpasst ist verpasst.
 *
 * Gebaut auf der Golden-Peach-Infrastruktur (`rollNextPeachAt`-Muster:
 * gleichverteilte Pause aus dem seeded `Rng`, Sichtbarkeitsfenster ab dem
 * Spawn-Zeitpunkt), aber bewusst mit EIGENEM Zustand und EIGENEM Buff:
 *
 *  · **Nicht persistiert.** Der ganze Kobold-Zustand ist transient (wie der
 *    A2-`GimmickRuntime`): ein Reload würfelt seine nächste Runde neu. Damit
 *    kostet A3 keinen Schema-Bump, keine Migration, keine Fixture — und ein
 *    verpasstes Event kann per Reload nicht zurückgeholt werden.
 *  · **Nicht das Ekstase/Frenzy-System.** `ability.ts` trägt EIN ×10-Fenster mit
 *    Ladebalken, HUD-Ring und Ton; der Kobold-Buff ist ein separater, viel
 *    kleinerer Zeit-Buff (`GOBLIN_BUFF_MULT` für `GOBLIN_BUFF_S`). Beide zu
 *    mischen würde entweder den Ekstase-Ring falsch anzeigen oder die
 *    Ekstase-Dauer heimlich verlängern — zwei Buffs, zwei Zustände.
 *
 * Alles hier ist reine Rechnung; die Glue (`main.ts`) hält den Zustand, der Bot
 * (`sim.ts`) modelliert denselben Faucet mit einer dokumentierten Fangquote.
 */
import { Rng } from '../util/rng';

/** Kürzeste Pause zwischen zwei Kobolden (Sekunden) — Roadmap: „alle 4–7 min". */
export const GOBLIN_MIN_S = 240;
/** Längste Pause zwischen zwei Kobolden (Sekunden). */
export const GOBLIN_MAX_S = 420;
/** Wie lange ein Kobold sichtbar (und fangbar) über die Bühne hoppelt. */
export const GOBLIN_VISIBLE_S = 8;
/** So viele Klicks fangen ihn. */
export const GOBLIN_HITS = 5;
/** Dauer des Mini-Frenzy nach einem Fang (Sekunden). */
export const GOBLIN_BUFF_S = 10;
/** Klick-Schadens-Faktor während des Mini-Frenzy. */
export const GOBLIN_BUFF_MULT = 2;
/** Holztruhen für einen Fang. */
export const GOBLIN_CHESTS = 1;
/**
 * Um so viel wird ein fälliger Spawn verschoben, wenn er gerade NICHT auf die
 * Bühne darf (Tab im Hintergrund, Bosskampf, Bühnen-Wechsel). Bewusst ein
 * fester Aufschub statt eines neuen Wurfs: ein Neuwurf pro Frame würde den
 * seeded RNG-Cursor im Hintergrund-Tab leerlaufen lassen.
 */
export const GOBLIN_DEFER_S = 5;

/** Der transiente Laufzeit-Zustand des Events (nie im Save). */
export interface GoblinState {
  /** Epoch-ms des nächsten Spawns (0 = ungeseedet). */
  nextAt: number;
  /** Treffer auf den AKTUELLEN Kobold. */
  hits: number;
  /** Epoch-ms, bis zu der der Mini-Frenzy läuft (0 = keiner). */
  buffUntil: number;
  /** Kobolde, die in dieser Sitzung gefangen wurden (Statistik/Beweis-Lauf). */
  caught: number;
}

/** Ein frischer (ungeseedeter) Kobold-Zustand. */
export function createGoblin(): GoblinState {
  return { nextAt: 0, hits: 0, buffUntil: 0, caught: 0 };
}

/**
 * Epoch-ms des nächsten Kobolds: `now` + gleichverteilt `GOBLIN_MIN_S`…
 * `GOBLIN_MAX_S` Sekunden, gezogen aus dem injizierten `rng` (§9.4) — exakt das
 * Muster von `rollNextPeachAt`, damit beide Events denselben, save-scum-festen
 * Strom nutzen.
 */
export function rollNextGoblinAt(now: number, rng: Rng): number {
  const delayS = GOBLIN_MIN_S + rng.next() * (GOBLIN_MAX_S - GOBLIN_MIN_S);
  return now + delayS * 1000;
}

/** Hoppelt gerade ein Kobold über die Bühne? */
export function goblinVisible(state: GoblinState, now: number): boolean {
  return state.nextAt > 0 && now >= state.nextAt && now < state.nextAt + GOBLIN_VISIBLE_S * 1000;
}

/** Ist das Fenster des aktuellen Kobolds abgelaufen (und er nicht gefangen)? */
export function goblinExpired(state: GoblinState, now: number): boolean {
  return state.nextAt > 0 && now >= state.nextAt + GOBLIN_VISIBLE_S * 1000;
}

/** Verbleibende Sekunden im Fangfenster (0 außerhalb) — für den Ring am Button. */
export function goblinTimeLeft(state: GoblinState, now: number): number {
  if (!goblinVisible(state, now)) return 0;
  return Math.max(0, (state.nextAt + GOBLIN_VISIBLE_S * 1000 - now) / 1000);
}

/** Die Bedingungen, unter denen ein Kobold NICHT auf die Bühne darf. */
export interface GoblinGate {
  /** `document.hidden` — im Hintergrund-Tab spawnt nichts (Roadmap-DoD). */
  hidden: boolean;
  /** Läuft gerade ein Bosskampf? (der Kobold würde den Gate-Fokus zerreißen) */
  boss: boolean;
  /** Fährt die Bühne gerade ein/aus (G1)? */
  transitioning: boolean;
}

/** Darf jetzt ein Kobold erscheinen? */
export function goblinSpawnAllowed(gate: GoblinGate): boolean {
  return !gate.hidden && !gate.boss && !gate.transitioning;
}

/** Fang-Fortschritt 0…1 (für den Ring/die Zähler-Anzeige). */
export function goblinProgress(state: GoblinState): number {
  return Math.max(0, Math.min(1, state.hits / GOBLIN_HITS));
}

/** Klick-Multiplikator des Mini-Frenzy (×1 außerhalb des Fensters). */
export function goblinBuffMult(buffUntil: number, now: number): number {
  return buffUntil > now ? GOBLIN_BUFF_MULT : 1;
}

/** Restsekunden des Mini-Frenzy (0 = keiner) — für das HUD-Badge. */
export function goblinBuffLeft(buffUntil: number, now: number): number {
  return Math.max(0, (buffUntil - now) / 1000);
}

/** Das Ergebnis eines Klicks auf den Kobold. */
export interface GoblinHitResult {
  state: GoblinState;
  /** Zählte dieser Klick überhaupt (Kobold sichtbar und noch nicht gefangen)? */
  counted: boolean;
  /** Ist er mit DIESEM Klick gefangen? (genau einmal true je Kobold) */
  caught: boolean;
}

/**
 * Ein Klick auf den Kobold. Der `GOBLIN_HITS`-te Treffer fängt ihn: Buff-Fenster
 * öffnet, Fang-Zähler steigt, `nextAt` fällt auf 0 (die Glue würfelt daraufhin
 * die nächste Runde — der Wurf selbst gehört ihr, weil nur sie den `Rng` hält).
 * Rein: gibt bei einem wirkungslosen Klick DIESELBE Referenz zurück.
 */
export function goblinHit(state: GoblinState, now: number): GoblinHitResult {
  if (!goblinVisible(state, now)) return { state, counted: false, caught: false };
  const hits = state.hits + 1;
  if (hits < GOBLIN_HITS) {
    return { state: { ...state, hits }, counted: true, caught: false };
  }
  return {
    state: {
      ...state,
      hits: 0,
      nextAt: 0,
      buffUntil: now + GOBLIN_BUFF_S * 1000,
      caught: state.caught + 1,
    },
    counted: true,
    caught: true,
  };
}

/**
 * Hoppel-Position über die Bühne, normiert auf 0…1 (x = quer, y = hoch).
 *
 * Der Kobold läuft in `GOBLIN_HOPS` Sprüngen von einer Seite zur anderen; die
 * Richtung hängt am Spawn-Zeitpunkt, damit nicht jeder Kobold denselben Weg
 * nimmt. Pur über `(t, spawnAt)` — die Glue rechnet daraus nur noch Pixel, und
 * ein Test kann die Bahn prüfen, ohne ein DOM zu bauen.
 */
export const GOBLIN_HOPS = 4;

export function goblinPos(state: GoblinState, now: number): { x: number; y: number } {
  const span = GOBLIN_VISIBLE_S * 1000;
  const k = Math.max(0, Math.min(1, (now - state.nextAt) / span));
  // Ungerade Spawn-Millisekunde ⇒ von rechts nach links.
  const flip = Math.floor(state.nextAt / 1000) % 2 === 1;
  const x = flip ? 1 - k : k;
  // Sprung-Bögen: |sin| über `GOBLIN_HOPS` Halbwellen, plus eine leichte Neigung,
  // damit die Bahn nicht wie ein Lineal wirkt.
  const hop = Math.abs(Math.sin(k * Math.PI * GOBLIN_HOPS));
  const y = Math.max(0, Math.min(1, 0.72 - hop * 0.5 + Math.sin(k * Math.PI) * 0.08));
  return { x, y };
}

/**
 * **Bot-Annahme** (`sim.ts`): So oft fängt ein realistischer Spieler den Kobold.
 * 8 Sekunden für 5 Klicks sind für jeden, der gerade spielt, trivial — die
 * Quote bildet daher vor allem ab, dass man ihn ab und zu übersieht (Shop offen,
 * Blick woanders, gerade im Bosskampf). Bewusst KEINE 100 %: der Bot soll den
 * Faucet nicht überschätzen, die Anker bleiben untere Schranken.
 */
export const GOBLIN_SIM_CATCH = 0.8;
