/**
 * **Skin-Meisterschafts-Pfade** (IDEEN-GAMEPLAY 2b) — Treue statt Min-Maxing.
 *
 * Jeder der zehn Skins bekommt einen eigenen **5-Knoten-Pfad**, gefüllt aus zwei
 * Quellen: **Tragezeit** (Sekunden aktiven Spiels, in denen dieser Skin
 * ausgerüstet war) und **Boss-Kills im Skin**. Beides läuft in EINE Zahl
 * zusammen (`pathScore`), gegen die fünf Schwellen stehen — dieselbe Disziplin
 * wie bei der Gebietsherrschaft (1b: eine Zahl je Theme, eine Gewinn-Regel, eine
 * Wirkung).
 *
 * ## Warum ein Boss-Kill in SEKUNDEN gerechnet wird
 *
 * Zwei Fortschritts-Quellen, aber nur EINE Leiste: Ein Boss-Kill zählt wie
 * {@link BOSS_SECONDS} Sekunden Tragezeit. Damit braucht der Pfad keine zweite
 * Schwellen-Reihe, keine „oder"-Logik und keine Anzeige, die zwei Balken
 * nebeneinanderstellt — und die Regel bleibt in einem Satz erklärbar. Der Wert
 * ist gemessen, nicht geraten (`npm run balance`, Abschnitt 12): Der Bot fällt
 * im ersten Sitting (45 min) etwa 8 Gates, ein Boss-Kill ist also mit 180 s rund
 * ein Drittel des Fortschritts einer aktiven Sitzung wert. Wer NUR idlet, kommt
 * trotzdem an — nur langsamer, und genau das meint „Tragezeit + Boss-Kills".
 *
 * ## Die Wirkung: ein Knoten ist ein FÜNFTEL Stern
 *
 * Die Knoten 1–4 zahlen auf den **`star.stat`** ihres Skins (Klassiker: Klick ·
 * Robo: Coach-cps · Pirat: Gold — das Muster aus dem Ideen-Dokument), und zwar
 * je {@link NODE_STARS} des katalogisierten Stern-Betrags. Der VOLLE Pfad ist
 * damit **0,8 Sterne wert — weniger als EIN zusätzlicher Stern**, den derselbe
 * Skin für einen einzigen Zuckerpfirsich bekäme.
 *
 * Das ist die Leitplanke, und sie gilt STRUKTURELL statt per Handrechnung: Die
 * Zahl kommt aus demselben `SKINS`-Katalog, gegen den auch `gearBonus` rechnet.
 * Der stärkste Fall ist der Klassiker (0,1 clickPct/⭐ ⇒ **+8 % Klick**) — exakt
 * der Richtwert „≤ +8 % auf den skin-typischen Term". Ein Test friert das für
 * JEDEN Skin ein, also kann kein künftiger Katalog-Eintrag die Leitplanke still
 * reißen.
 *
 * ## Knoten 5 ist kosmetisch — und bewusst KEIN Prozentpunkt
 *
 * Der fünfte Knoten gibt dem Skin einen **eigenen Sieges-Move** aus dem
 * bestehenden A4-Choreo-Satz ({@link SIGNATURE_MOVES}). Das ist dieselbe
 * Entscheidung wie beim Legenden-Rang der Crew-Meisterschaft (1a, Rang 4 zahlt
 * die Gratis-Erststufe statt weiterer Prozente): Der letzte, teuerste Knoten
 * einer permanenten Leiter soll etwas sein, das man SIEHT — nicht eine weitere
 * stille Zahl im Produkt.
 *
 * **Der Physik-Kontrakt bleibt unberührt.** Dieses Modul liefert einen
 * Move-NAMEN; `main.ts` schlägt ihn in `MOVES` nach und übergibt einen INDEX an
 * `Choreographer.setMove` — exakt wie der bisherige `VICTORY_MOVE`. Keine neue
 * Pose, kein neuer Bone, keine neue Animations-Grundform.
 */
import { SKINS } from '../character/skins';
import { type GearBonus, PERCENT_STATS, emptyGearBonus } from './gear';
import type { SkinKey } from '../types';

/** Der Fortschritt EINES Skins: getragene Sekunden + Boss-Kills in ihm. */
export interface SkinPathEntry {
  /** Sekunden aktiven Spiels, in denen dieser Skin ausgerüstet war. */
  s: number;
  /** Besiegte Bosse, während dieser Skin ausgerüstet war. */
  b: number;
}

/** Der Pfad-Fortschritt je Skin-Id (fehlt = nichts getragen). */
export type SkinPath = Record<string, SkinPathEntry>;

/** Eine frische (leere) Pfad-Tafel. */
export function createSkinPath(): SkinPath {
  return {};
}

/** Sekunden Tragezeit, die ein Boss-Kill im Skin wert ist (Begründung im Kopf). */
export const BOSS_SECONDS = 180;

/**
 * Der Skin, den der Sim-Bot trägt — der **Spiel-Standard** (`createGear().skin`).
 * Der Bot wechselt nie, und diese Konstante macht das explizit statt implizit:
 * Er füllt genau EINEN Pfad, und zwar den des Klick-Skins, dessen Bonus mit
 * +8 % der stärkste des Katalogs ist. Die Anker messen damit die schnellste
 * Pfad-Kurve UND den größten Machtterm — beides die richtige Seite für eine
 * Leitplanke.
 */
export const SIM_SKIN = 'classic';

/** Knoten pro Pfad (vier Boni + der Signature-Move). */
export const PATH_NODES = 5;

/**
 * Die fünf Schwellen in „Pfad-Sekunden" (Tragezeit + 180 s je Boss-Kill).
 * Gemessen gegen die Bot-Läufe (`npm run balance`, Abschnitt 12), nicht geraten:
 *
 * | Knoten | Schwelle | GEMESSEN (Bot 3 cps, MIT Loot) | Nur Tragezeit |
 * | ------ | -------- | ------------------------------ | ------------- |
 * | 1      |    3 000 | **~35 min** (erstes Sitting)    | 50 min        |
 * | 2      |   18 000 | ~2,8 h                         | 5,0 h         |
 * | 3      |   72 000 | ~10,5 h                        | 20 h          |
 * | 4      |  216 000 | ~31 h                          | 60 h          |
 * | 5      |  720 000 | **~103 h** (gut vier Tage)      | 200 h         |
 *
 * Die Messung: Der Bot fällt im ersten Sitting **6,3 Gates** (0,14 Boss/min) und
 * im Beharrungszustand **0,31 Boss/min** — ein 45-min-Lauf bringt also 2 700
 * Trage- plus ~1 100 Boss-Sekunden, eine Stunde im Beharrungszustand rund
 * 7 000. Daraus folgen die Schwellen direkt.
 *
 * Knoten 1 fällt im ERSTEN Sitting (gemessen 3 840 Pfad-Sekunden nach 45 min,
 * die Schwelle liegt mit 3 000 bewusst 28 % darunter — bei einem
 * boss-schwachen Seed soll er trotzdem fallen), Knoten 5 ist ein Lebenswerk von
 * mehreren Tagen. Beides sind Vorgaben des Ideen-Dokuments. Die Leiter ist
 * über-linear gespreizt (×6 / ×4 / ×3 / ×3,3), dieselbe Form wie die
 * Meisterschafts-Ränge der Crew (1a) — dort fiel dieselbe Entscheidung aus
 * demselben Grund: Eine lineare Leiter wäre nach dem zweiten Abend fertig.
 */
export const PATH_THRESHOLDS: readonly number[] = [3_000, 18_000, 72_000, 216_000, 720_000];

/** Wie viel STERN-Anteil ein Bonus-Knoten zahlt (vier Knoten ⇒ 0,8 ⭐). */
export const NODE_STARS = 0.2;

/** Der Stern-Anteil des VOLLEN Pfades — die Leitplanken-Konstante für Tests/UI. */
export const PATH_MAX_STARS = NODE_STARS * (PATH_NODES - 1);

/**
 * Der Sieges-Move, den Knoten 5 freischaltet — je Skin einer aus dem
 * BESTEHENDEN A4-Satz (`choreo/moves.ts`). Bewusst als NAME und nicht als
 * Index: Der Index ist eine Implementierungs-Eigenschaft von `MOVES`, der Name
 * ist der Vertrag (`sets.ts` löst `VICTORY_MOVE` genauso über den Namen auf).
 *
 * Keiner der zehn ist der **Diva-Turn** — der IST der Standard-Sieges-Move, und
 * ein „Signature-Move", der aussieht wie der Move aller anderen, wäre keiner.
 * Sieben Moves auf zehn Skins heißt drei Doppelungen; die sind nach Silhouette
 * gepaart (die beiden `boss`-Rigs teilen den Booty-Slam, die beiden `robot`-Rigs
 * die Welle), damit eine Doppelung nie zwei optisch fremde Skins trifft.
 */
export const SIGNATURE_MOVES: Record<SkinKey, string> = {
  classic: 'Twerk', // der Ur-Move für den Ur-Skin
  disco: 'Shimmy', // Glitzer-Schultern
  robo: 'Hip Circles', // servo-saubere Kreise
  host: 'Bounce', // Bühnen-Hopser des Showmasters
  boss: 'Booty-Slam', // der Tyrann lässt es krachen
  neon: 'Drop It Low', // der Ninja geht tief
  pirate: 'Welle', // Seegang
  lava: 'Booty-Slam', // Eruption (teilt das `boss`-Rig)
  gyrator: 'Welle', // Schwerelosigkeit (teilt das `robot`-Rig)
  diamond: 'Drop It Low', // Facetten-Fall
};

// ---------------------------------------------------------------------------
// Lesen (immer sanierend, nie werfend — alles hier hängt im Renderpfad)
// ---------------------------------------------------------------------------

function safeCount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Der (sanierte) Eintrag eines Skins — fehlend/kaputt ⇒ `{ s: 0, b: 0 }`. */
export function pathEntry(path: SkinPath, id: string): SkinPathEntry {
  const e = path[id];
  return e ? { s: safeCount(e.s), b: safeCount(e.b) } : { s: 0, b: 0 };
}

/** Die Fortschritts-Zahl eines Skins: Tragezeit + {@link BOSS_SECONDS} je Boss. */
export function pathScore(path: SkinPath, id: string): number {
  const e = pathEntry(path, id);
  return e.s + e.b * BOSS_SECONDS;
}

/** Wie viele Knoten `score` freischaltet (0 … {@link PATH_NODES}). */
export function nodesForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  let n = 0;
  for (const at of PATH_THRESHOLDS) if (score >= at) n++;
  return n;
}

/** Wie viele Knoten dieser Skin offen hat (0 … {@link PATH_NODES}). */
export function pathNodes(path: SkinPath, id: string): number {
  return nodesForScore(pathScore(path, id));
}

/** Ist der Pfad dieses Skins vollständig (Knoten 5 = Signature-Move)? */
export function pathComplete(path: SkinPath, id: string): boolean {
  return pathNodes(path, id) >= PATH_NODES;
}

/**
 * Der Sieges-Move-NAME dieses Skins, oder `null`, solange Knoten 5 fehlt.
 * `main.ts` schlägt ihn in `MOVES` nach; ein unbekannter Name fällt dort auf den
 * Standard-Sieges-Move zurück (nie werfend).
 */
export function signatureMove(path: SkinPath, id: string): string | null {
  if (!pathComplete(path, id)) return null;
  return SIGNATURE_MOVES[id as SkinKey] ?? null;
}

// ---------------------------------------------------------------------------
// Die Wirkung
// ---------------------------------------------------------------------------

/**
 * Der Bonus-Betrag EINES Skins aus `nodes` Bonus-Knoten: `star.perStar ·
 * NODE_STARS · min(nodes, 4)`. Knoten 5 zahlt bewusst 0 (er ist der Move).
 * Ein unbekannter Skin liefert 0.
 */
export function pathAmount(id: string, nodes: number): number {
  const cfg = SKINS[id as SkinKey];
  if (!cfg) return 0;
  const n = Math.max(0, Math.min(PATH_NODES - 1, Math.floor(nodes) || 0));
  return cfg.star.perStar * NODE_STARS * n;
}

/**
 * Der Pfad-Bonus des AKTIVEN Skins als `GearBonus` — dieselbe Form, die
 * `gearBonus` liefert, damit die abgeleitete Pipeline sie über dieselben
 * `1 + x`-Griffe liest und kein zweiter Rechenweg entsteht.
 *
 * Der `allPct`-Anteil (Diamant-Booty) wird wie im Gear-Fold auf alle
 * Prozent-Stats verteilt — eine Sonderregel weniger.
 */
export function skinPathBonus(path: SkinPath, id: string): GearBonus {
  const bonus = emptyGearBonus();
  const cfg = SKINS[id as SkinKey];
  if (!cfg) return bonus;
  const amount = pathAmount(id, pathNodes(path, id));
  if (amount === 0) return bonus;
  bonus[cfg.star.stat] += amount;
  if (bonus.allPct !== 0) {
    for (const s of PERCENT_STATS) bonus[s] += bonus.allPct;
  }
  return bonus;
}

// ---------------------------------------------------------------------------
// Schreiben (rein — jede Funktion liefert eine NEUE Tafel)
// ---------------------------------------------------------------------------

/**
 * `sec` Sekunden Tragezeit auf `id` buchen. Monoton: nicht-positive oder
 * nicht-endliche Werte lassen die Tafel unverändert. Gebrochene Sekunden werden
 * aufsummiert und erst beim Lesen abgeschnitten — sonst verlöre ein 0,25-s-Tick
 * jede Sekunde komplett.
 */
export function addWear(path: SkinPath, id: string, sec: number): SkinPath {
  if (!Number.isFinite(sec) || sec <= 0) return path;
  const e = path[id];
  const cur = e ? { s: e.s, b: e.b } : { s: 0, b: 0 };
  return { ...path, [id]: { s: cur.s + sec, b: cur.b } };
}

/** Einen Boss-Kill auf `id` buchen (rein, monoton). */
export function addPathBoss(path: SkinPath, id: string): SkinPath {
  const e = path[id];
  const cur = e ? { s: e.s, b: e.b } : { s: 0, b: 0 };
  return { ...path, [id]: { s: cur.s, b: cur.b + 1 } };
}

// ---------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------

/** Was die Skin-Karte über einen Pfad wissen muss. */
export interface PathProgress {
  /** Offene Knoten (0 … 5). */
  readonly nodes: number;
  /** Pfad-Sekunden (Tragezeit + Boss-Gewicht). */
  readonly score: number;
  /** Getragene Sekunden. */
  readonly wear: number;
  /** Boss-Kills im Skin. */
  readonly bosses: number;
  /** Schwelle des NÄCHSTEN Knotens (0, wenn der Pfad voll ist). */
  readonly next: number;
  /** Anteil 0…1 zum nächsten Knoten (1, wenn der Pfad voll ist). */
  readonly frac: number;
  /** Der aktuell gezahlte Bonus-Betrag (in der Einheit des `star.stat`). */
  readonly amount: number;
}

/** Fortschritt + Bonus eines Skins (rein, UI-freundlich). */
export function pathProgress(path: SkinPath, id: string): PathProgress {
  const e = pathEntry(path, id);
  const score = e.s + e.b * BOSS_SECONDS;
  const nodes = nodesForScore(score);
  const next = nodes < PATH_NODES ? PATH_THRESHOLDS[nodes] : 0;
  const prev = nodes > 0 ? PATH_THRESHOLDS[nodes - 1] : 0;
  const frac = next > 0 ? Math.min(1, Math.max(0, (score - prev) / (next - prev))) : 1;
  return { nodes, score, wear: e.s, bosses: e.b, next, frac, amount: pathAmount(id, nodes) };
}

/**
 * Das Leistungs-Budget eines VOLLEN Pfades als Produkt der Farm-Terme
 * (Klick × Crew-DPS × BP × Truhen-Luck) — dieselbe Rechnung wie
 * `affixPowerBudget` (1c/3a) und der Konstellations-Deckel (2a), damit die drei
 * permanenten Schichten in DERSELBEN Einheit vergleichbar sind.
 *
 * Es wird der stärkste Skin gesucht, nicht ein Durchschnitt: Die Leitplanke
 * misst den Extremfall. (Diamant-Booty ist der interessante Fall — sein
 * `allPct` zahlt auf jeden Prozent-Term gleichzeitig.)
 */
export function skinPathPowerBudget(): number {
  const full = createSkinPath();
  let worst = 1;
  for (const id of Object.keys(SKINS)) {
    const b = skinPathBonus({ ...full, [id]: { s: PATH_THRESHOLDS[PATH_NODES - 1], b: 0 } }, id);
    const p =
      (1 + b.clickPct) * (1 + b.dpsPct) * (1 + b.goldPct) * (1 + b.chestLuck) * (1 + b.critChance);
    if (p > worst) worst = p;
  }
  return worst;
}

/** Der größte Prozent-Betrag, den irgendein voller Pfad auf EINEN Term zahlt. */
export function skinPathMaxPercent(): number {
  let worst = 0;
  for (const id of Object.keys(SKINS)) {
    const cfg = SKINS[id as SkinKey];
    if (!PERCENT_STATS.includes(cfg.star.stat) && cfg.star.stat !== 'allPct') continue;
    const amount = pathAmount(id, PATH_NODES - 1);
    if (amount > worst) worst = amount;
  }
  return worst;
}
