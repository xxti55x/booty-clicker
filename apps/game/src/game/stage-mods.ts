/**
 * Bühnen-Modifikatoren (ROADMAP-V2 A1) — pur, DOM-frei, save-frei.
 *
 * Bis hierher spielte sich jede Bühne identisch: dieselbe Rivalen-Welle, dieselben
 * Zahlen, nur größer. A1 gibt jeder NICHT-Boss-Bühne ab `MOD_MIN_ZONE` **eine
 * Hausregel** aus einem Katalog von acht — sichtbar im Zonen-Strip und auf der
 * Bühnen-Card. Damit wird die Rückreise (die es seit dem Boss-Fallback-Loop
 * ohnehin gibt) zur ENTSCHEIDUNG: Man farmt auf „Goldrausch", nicht irgendwo.
 *
 * **Boss-Bühnen tragen NIE einen Modifikator.** Das ist keine Bequemlichkeit,
 * sondern Balance-Architektur: die Boss-Gates sind die Wände der Progression
 * (A2 hat gemessen, wie brutal schon 10 % Wirkungsverlust dort durchschlagen),
 * und sie tragen mit den Theme-Gimmicks bereits eine eigene Regel-Ebene. Ein
 * zweiter Würfel obendrauf würde beides unlesbar machen und die Anker gefährden.
 * Modifikatoren wirken deshalb ausschließlich auf der FARM-Strecke dazwischen.
 *
 * **Kein neues Save-Feld.** Die Zuordnung ist eine reine Funktion aus
 * `(zone, remix)`, und der Remix-Seed wird aus dem bereits persistierten
 * `state.rng.seed` plus `stats.ascensions` abgeleitet (`remixSeedFor`) — beides
 * existiert seit Langem und überlebt jede Prestige-Schicht. Eine Aszension
 * VERWÜRFELT damit die Karte (neuer Lauf, neue Farm-Route), ohne dass ein
 * einziges Byte mehr im Save steht: kein Schema-Bump, keine Migration, keine
 * Fixture. `REMIX_OFF` (0) schaltet die Modifikatoren komplett ab — der Default
 * jeder `spawnFor`-Signatur, damit Altbestand (und jeder Test, der ohne Remix
 * rechnet) byte-gleich weiterläuft.
 *
 * Glue (`main.ts`), HUD (`ch-hud.ts`) und Balance-Bot (`sim.ts`) lesen denselben
 * Katalog — die Regel kann zwischen Spiel und Anker-Lauf nicht auseinanderlaufen.
 */
import { ZONES_PER_THEME } from './boss-gimmicks';
import { type ComboState, decay } from './combo';
import { floatAt } from '../util/rng';

/**
 * Ab dieser Bühne tragen Nicht-Boss-Bühnen einen Modifikator. Die ersten zehn
 * Bühnen bleiben bewusst regelfrei: dort lernt man Klick, Combo, Beat und das
 * erste Boss-Gate — eine Hausregel obendrauf wäre Rauschen statt Würze.
 */
export const MOD_MIN_ZONE = 11;

export type StageModId =
  | 'goldrausch'
  | 'zaehe-menge'
  | 'beat-nacht'
  | 'nebel'
  | 'konfetti'
  | 'peach-party'
  | 'krit-funken'
  | 'marathon';

/**
 * Die Faktoren eines Modifikators — **Daten, keine Logik**, und jeder einzelne
 * hängt an einem ECHTEN Term des Spiels (der Kommentar nennt jeweils die Stelle).
 * Neutral heißt: Multiplikatoren 1, additive Boni 0.
 */
export interface StageModFactors {
  /** BP-Faktor je Kill auf dieser Bühne (`onKillProgress` bzw. `stepSecond`). */
  readonly gold: number;
  /** Ausdauer-Faktor der Rivalen (`combat.spawnFor` — Bosse nie betroffen). */
  readonly hp: number;
  /** Klick-Schadens-Faktor (`effectiveClick.extraMult`). */
  readonly click: number;
  /** Crew-/Idle-DPS-Faktor (`applyHit` für Nicht-Klick-Schaden). */
  readonly dps: number;
  /** Zusätzliche Krit-Chance in ANTEILEN (0.05 = +5 pp), additiv im `critChance`-Stack. */
  readonly crit: number;
  /** Zusatz auf den On-Beat-Multiplikator, additiv zu `ON_BEAT_MULT` (0.5 ⇒ ×2). */
  readonly beat: number;
  /** Combo-Verfall ×Faktor (1.25 = 25 % schneller), via `stageComboStep`. */
  readonly comboDecay: number;
  /** Ekstase lädt ×Faktor schneller (1.5 ⇒ Schwelle ×⅔, via `stageEkstaseChargeRed`). */
  readonly ekstase: number;
  /** Truhen-Chance der Rivalen ×Faktor (`rivalChestChance`). */
  readonly chest: number;
  /** Pfirsich-Pause ×Faktor (< 1 = öfter), multipliziert mit dem P2-Magnet. */
  readonly peachGap: number;
}

/** Der neutrale Faktor-Satz — was eine Bühne OHNE Modifikator rechnet. */
export const NEUTRAL_FACTORS: StageModFactors = {
  gold: 1,
  hp: 1,
  click: 1,
  dps: 1,
  crit: 0,
  beat: 0,
  comboDecay: 1,
  ekstase: 1,
  chest: 1,
  peachGap: 1,
};

/** Ein Katalog-Eintrag: Anzeige (Icon/Name/ein Satz) + seine Faktoren. */
export interface StageMod {
  readonly id: StageModId;
  /** Ein Emoji — im Strip-Slot klein, auf der Bühnen-Card groß. */
  readonly icon: string;
  readonly name: string;
  /** EIN Satz: was die Regel gibt und was sie kostet. */
  readonly description: string;
  readonly f: StageModFactors;
}

/** Kurzform: nur die abweichenden Felder nennen, der Rest ist neutral. */
function mod(
  id: StageModId,
  icon: string,
  name: string,
  description: string,
  f: Partial<StageModFactors>,
): StageMod {
  return { id, icon, name, description, f: { ...NEUTRAL_FACTORS, ...f } };
}

/**
 * Der Katalog. Vier Paare mit klarer Handschrift:
 *  · **Tausch-Regeln** (Goldrausch, Zähe Menge, Nebel, Marathon) geben etwas und
 *    nehmen etwas — sie machen die Bühnenwahl zur Build-Frage.
 *  · **Geschenk-Regeln** (Beat-Nacht, Konfetti-Regen, Peach-Party, Krit-Funken)
 *    belohnen eine Spielweise, ohne zu bestrafen — sie machen aus einer Farm-
 *    Bühne ein Ziel, statt nur aus einer anderen ein Hindernis.
 * Die Reihenfolge ist die Ziehungs-Reihenfolge (Index = Wurf) und deshalb stabil.
 */
export const STAGE_MODS: readonly StageMod[] = [
  mod(
    'goldrausch',
    '💰',
    'Goldrausch',
    'Jeder Kill zahlt +50 % BP — dafür verfällt deine Combo 25 % schneller.',
    { gold: 1.5, comboDecay: 1.25 },
  ),
  mod(
    'zaehe-menge',
    '🪨',
    'Zähe Menge',
    'Die Rivalen haben +20 % Ausdauer, lassen aber doppelt so oft eine Truhe fallen.',
    { hp: 1.2, chest: 2 },
  ),
  mod('beat-nacht', '🎵', 'Beat-Nacht', 'Klicks im Takt schlagen ×2 statt ×1.5.', { beat: 0.5 }),
  mod('nebel', '🌫', 'Nebel', 'Deine Crew tappt im Dunkeln (−15 % DPS), du triffst +30 % härter.', {
    dps: 0.85,
    click: 1.3,
  }),
  mod('konfetti', '🎉', 'Konfetti-Regen', 'Die Twerk-Ekstase lädt 50 % schneller auf.', {
    ekstase: 1.5,
  }),
  mod('peach-party', '🍑', 'Peach-Party', 'Der Goldene Pfirsich schaut 50 % öfter vorbei.', {
    peachGap: 1 / 1.5,
  }),
  mod('krit-funken', '⚡', 'Krit-Funken', 'Jeder Klick hat 5 Prozentpunkte mehr Krit-Chance.', {
    crit: 0.05,
  }),
  mod('marathon', '🏃', 'Marathon', 'Rivalen haben −20 % Ausdauer, zahlen aber auch −20 % BP.', {
    hp: 0.8,
    gold: 0.8,
  }),
];

/** Nachschlag nach Id (für Tests und die UI-Legende). */
export function stageModById(id: string): StageMod | null {
  return STAGE_MODS.find((m) => m.id === id) ?? null;
}

/**
 * Der Remix-Seed-Wert, der die Modifikatoren AUSSCHALTET. Bewusst 0, damit jede
 * Signatur ihn als Default tragen kann: wer keinen Remix übergibt (Alt-Tests,
 * `createCombat`, die Float-Guard-Sweeps), spielt exakt die Kurve von vorher.
 */
export const REMIX_OFF = 0;

/**
 * Der Remix-Seed eines Laufs aus `(rng.seed, stats.ascensions)` — beide seit
 * Langem im Save, beide überleben jede Prestige-Schicht.
 *
 * Der Aszensions-Zähler wird NICHT addiert, sondern durch einen splitmix-Mixer
 * gedreht: eine reine Addition würde die Karte nur um Bühnen VERSCHIEBEN (Bühne
 * 12 bekäme, was eben Bühne 11 hatte) — sie soll sich aber komplett neu würfeln.
 * Der (astronomisch unwahrscheinliche) Treffer auf `REMIX_OFF` wird auf eine
 * feste Konstante umgebogen, damit ein Lauf nie versehentlich modifikatorfrei ist.
 */
export function remixSeedFor(rngSeed: number, ascensions: number): number {
  const a = Math.max(0, Math.floor(Number.isFinite(ascensions) ? ascensions : 0));
  const seed = Number.isFinite(rngSeed) ? rngSeed | 0 : 0;
  let h = (seed ^ Math.imul(a + 1, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) | 0;
  h = (h ^ (h >>> 16)) | 0;
  return h === REMIX_OFF ? 0x5bf03635 : h;
}

/** Trägt diese Bühne überhaupt einen Modifikator? (≥ 11 und keine Boss-Bühne) */
export function modZone(zone: number): boolean {
  return (
    Number.isFinite(zone) &&
    Number.isInteger(zone) &&
    zone >= MOD_MIN_ZONE &&
    zone % ZONES_PER_THEME !== 0
  );
}

/**
 * Der Modifikator einer Bühne — `null` unter `MOD_MIN_ZONE`, auf jeder
 * Boss-Bühne und bei `REMIX_OFF`. Deterministisch über `(zone, remix)`: derselbe
 * Lauf zeigt nach einem Reload dieselbe Karte, ein Save-Scum kann sie nicht
 * neu würfeln (der Seed hängt am Save, nicht an der Uhr).
 */
export function modForZone(zone: number, remix: number): StageMod | null {
  if (remix === REMIX_OFF || !Number.isFinite(remix) || !modZone(zone)) return null;
  const roll = floatAt(remix | 0, Math.floor(zone));
  const idx = Math.min(STAGE_MODS.length - 1, Math.floor(roll * STAGE_MODS.length));
  return STAGE_MODS[idx];
}

/** Die Faktoren einer Bühne — der neutrale Satz, wo kein Modifikator liegt. */
export function factorsForZone(zone: number, remix: number): StageModFactors {
  return modForZone(zone, remix)?.f ?? NEUTRAL_FACTORS;
}

/**
 * Ausdauer-Faktor der RIVALEN dieser Bühne. Genau EIN Aufrufer: `combat.spawnFor`
 * — dort entsteht jedes Ziel, also gibt es die Zahl nur einmal (Spiel, HUD und
 * Bot lesen dieselbe `hpMax`). `bossHp` ruft das hier bewusst NICHT: Boss-Bühnen
 * tragen keinen Modifikator, und die Boss-Kurve bleibt damit byte-gleich zu A2.
 */
export function stageHpScale(zone: number, remix: number): number {
  return factorsForZone(zone, remix).hp;
}

/**
 * Ekstase-Ladungs-Reduktion aus dem `ekstase`-Faktor: „lädt ×1.5 schneller"
 * heißt „braucht ⅔ der Schwelle", also Reduktion `1 − 1/1.5`. So fügt sich der
 * Modifikator ohne Sonderweg in den bestehenden, gedeckelten Reduktions-Stack
 * (Ekstasius + Gyrator-Gear + Crew-Specials) ein.
 */
export function stageEkstaseChargeRed(f: StageModFactors): number {
  return f.ekstase > 0 ? Math.max(0, 1 - 1 / f.ekstase) : 0;
}

/**
 * Combo-Schritt unter einem Bühnen-Modifikator: gleiche Signatur/Semantik wie
 * `comboStep`, nur zählt die Zeit NACH dem Gnaden-Fenster `decayMult`-fach
 * (Goldrausch: ×1.25). Das Fenster selbst bleibt unangetastet — es ist kein
 * Verfall, sondern die Gnade, und die zu kürzen würde sich wie Input-Lag
 * anfühlen. Bei `decayMult = 1` ist das exakt `comboStep` (identische Zahlen).
 */
export function stageComboStep(
  state: ComboState,
  dt: number,
  reduction = 0,
  decayMult = 1,
): ComboState {
  if (!(dt > 0)) return state;
  const window = state.window - dt;
  if (window >= 0) return { stacks: state.stacks, window };
  const mult = Number.isFinite(decayMult) && decayMult > 0 ? decayMult : 1;
  return { stacks: decay(state.stacks, -window * mult, reduction), window: 0 };
}

/**
 * Der wirksame Schadens-Faktor einer Sekunde gegen einen RIVALEN dieser Bühne —
 * das Gegenstück zu `gimmickBossDamage` für die Farm-Strecke, und der einzige
 * Weg, wie der Bot (`sim.stepSecond`) Klick- und Idle-Modifikatoren auseinander
 * hält: er rechnet mit EINEM Sekunden-Betrag, die Faktoren treffen aber Klick
 * (`Nebel` +30 %) und Crew (`Nebel` −20 %) unterschiedlich. Zurück kommt das
 * Verhältnis wirksam ÷ roh, das über den ganzen Übertrag konstant bleibt.
 */
export function stageDamageFactor(f: StageModFactors, click: number, idle: number): number {
  const c = Math.max(0, click);
  const i = Math.max(0, idle);
  const raw = c + i;
  if (!(raw > 0)) return 1;
  return (c * f.click + i * f.dps) / raw;
}
