/**
 * **Die Legenden-Konstellation** (IDEEN-GAMEPLAY 2a) — der Baum, den KEINE der
 * drei Prestige-Schichten wipet.
 *
 * Der Himmelsbaum (`heaven.ts`) lebt pro Transzendenz-Ära und fällt mit ihr; der
 * Mythos-Shop hängt an TE. Dazwischen fehlte eine Progression, die einfach
 * BLEIBT. Genau die steht hier: drei Sternbilder à acht Knoten, bezahlt in einer
 * eigenen Währung, die **ausschließlich aus endlichen, unverlierbaren Quellen**
 * fließt — deshalb hat der Baum einen Boden, einen Deckel und einen Abschluss.
 *
 * ## Sternenstaub 💫 — die endliche Währung
 *
 * Drei Quellen, alle drei Lebenszeit-Highwater (nichts davon kann je schrumpfen):
 *
 *  · **Bühnen-Sterne-Meilensteine** (P1): je volle {@link STAR_MILESTONE} Sterne
 *    {@link DUST_PER_STAR_MILESTONE} 💫 — dieselbe Schwelle, an der auch die
 *    Meilenstein-Holztruhe fällt.
 *  · **Erfolge** (§7.3): je freigeschaltetem Achievement
 *    {@link DUST_PER_ACHIEVEMENT} 💫. Rückwirkend: Ein Save, der bei der
 *    Migration schon 20 Erfolge trägt, bekommt seine 60 💫 sofort.
 *  · **Erst-Kills tiefer Boss-Gates**: jedes Gate ab Bühne
 *    {@link DUST_GATE_MIN_ZONE} zahlt beim ERSTEN Fall
 *    {@link DUST_PER_GATE} 💫 — getrieben von der tiefsten je erreichten Bühne,
 *    also ein reiner Highwater ohne eigenen Zähler.
 *
 * **Saison-Abschlüsse** (die vierte Quelle aus der Ideen-Skizze) sind bewusst
 * NICHT dabei: Die X4-Saisons sind ein reiner Bestenlisten-Kalender
 * (`weekly.boardSeasonFor`) — der Client weiß, WELCHE Saison läuft, aber nie, ob
 * jemand sie „abgeschlossen" hat (Platzierung/Teilnahme leben serverseitig, und
 * das API ist optional). Eine Quelle, die ohne Server nicht existiert, darf keine
 * permanente Währung drucken.
 *
 * Der Kontostand ist bewusst ein PAAR: `earned` (Highwater, wächst nur) minus
 * `spent` (Σ aller gekauften Knoten). {@link syncDust} hebt `earned` auf den
 * Anspruch aus den drei Quellen — weil der Anspruch selbst monoton ist, kann ein
 * Reload nie doppelt zahlen und ein Reset nie etwas wegnehmen. Es gibt keinen
 * Respec: Ausgegebener Sternenstaub ist ausgegeben (deshalb bestätigt die UI
 * jeden Kauf).
 *
 * ## Die Form: 3 × 8, streng linear
 *
 * Jede Konstellation ist eine KETTE — Knoten n braucht Knoten n−1. Das ist die
 * Sternbild-Logik (man zieht eine Linie), es gibt nichts zu übersehen, und die
 * einzige Entscheidung ist: welche Linie zuerst. Knoten 1–7 sind klein und
 * additiv (+2 % / +0.5 pp / +0.2 s …), Knoten 8 ist der **Identitäts-Knoten**,
 * der die Konstellation zu einer Ansage macht:
 *
 *  · Aufbruch → **Warm-up-Start**: jede Tour beginnt mit {@link WARMUP_S} s
 *    Kobold-Buff (×2 Klick).
 *  · Tempo → **Zweiter Wind**: ein Boss-Timeout erstattet
 *    {@link SECOND_WIND_KILLS} von {@link MONSTERS_PER_ZONE} Rivalen der
 *    Rückfall-Bühne.
 *  · Ausdauer → **Sternenwanderer**: Offline-Cap +{@link STARWALKER_HOURS} h,
 *    additiv auf ALLES (Nachtschicht, Beach-Gear, Mythos-Nachtschwärmer).
 *
 * ## Das Budget (die Leitplanke des Ideen-Dokuments: ≤ ×1.5 global)
 *
 * Der volle Ausbau zahlt (aus DIESEM Katalog gerechnet, siehe
 * {@link constellationPowerBudget}):
 *
 * | Term          | Knoten            | Voll ausgebaut       |
 * | ------------- | ----------------- | -------------------- |
 * | Klick         | 4 × +2 %          | ×1.08                |
 * | Crew-DPS      | 3 × +2 %          | ×1.06                |
 * | BP            | 2 × +2 %          | ×1.04                |
 * | Krit-Chance   | 3 × +0.5 pp       | EV ×1.033            |
 * | Truhen-Luck   | 2 × +3 %          | Truhen-Chance ×1.06  |
 * | Combo-Fenster | 2 × +0.2 s        | ×1.00 (siehe unten)  |
 * | **Produkt**   |                   | **×1.304**           |
 *
 * Das Produkt ist die KONSERVATIVE Lesart — real trifft kein einziger Kill alle
 * Faktoren zugleich (Klick und Crew-DPS multiplizieren sich nie miteinander).
 * Das Combo-Fenster zählt bewusst ×1.00: Es hebt weder `COMBO_CAP` noch
 * `comboMult`, sondern nur die Gnadenfrist, in der man den Stand HÄLT — bei
 * durchgehendem Klicken (jeder Anker-Bot, jeder aktive Spieler) ist sein
 * gemessener Beitrag exakt 0. Der Offline-Pfad läuft in einem EIGENEN Budget
 * ({@link constellationOfflineBudget}: Rate ×1.08 × Cap ×1.25 = ×1.35), weil
 * Offline-Ertrag nichts an der Live-Rechnung multipliziert — und weil der
 * Himmelsbaum dort mit 8 h → 24 h längst ein Vielfaches davon vergibt.
 *
 * Nicht im Produkt, weil episodisch statt multiplikativ (und im Bot GEMESSEN,
 * siehe `sim.ts`): Startkapital (100 BP je Tour), Warm-up-Start (60 s ×2 Klick
 * je Tour) und Zweiter Wind (3/10 Rivalen nach einem Fail).
 *
 * Beim **Startkapital** ist die Zahl bewusst klein: 100 BP sind auf Bühne 1
 * etwa 15 Sekunden Ertrag — ein spürbarer Anschub, der einem den ersten
 * Crew-Kauf schenkt. Die erste Fassung stand bei 700 BP, und der Bot hat sofort
 * gezeigt, warum das falsch war: t10 fiel von 104 s auf 18 s (×5.8). Ein
 * FLACHER BP-Betrag ist am Anfang alles und später nichts; er gehört deshalb in
 * die Größenordnung „ein paar Kills", nicht „eine Bühne".
 *
 * ## Der Lebens-Vorrat (warum ein Lebenswerk MIT Abschluss)
 *
 * Voller Ausbau = {@link CONSTELLATION_FULL_COST} 💫. Dagegen der Vorrat, den
 * ein Spielstand über sein Leben schöpfen kann:
 *
 * | Stand              | Sterne             | Erfolge      | Gates ≥ 25 | Σ 💫 |
 * | ------------------ | ------------------ | ------------ | ---------- | ---- |
 * | Bühne 50           | 110 → 7 × 5 = 35   | ~20 × 3 = 60 | 5 × 2 = 10 | 105  |
 * | Bühne 100          | 220 → 14 × 5 = 70  | ~27 × 3 = 81 | 15 × 2 = 30| 181  |
 * | Bühne 150          | 330 → 22 × 5 = 110 | 28 × 3 = 84  | 25 × 2 = 50| 244  |
 * | Bühne 200          | 440 → 29 × 5 = 145 | 28 × 3 = 84  | 35 × 2 = 70| 299  |
 *
 * (Sterne-Schätzung: 2 je Bühne — „geclert" + „Combo" — plus der Timeout-Stern
 * je Boss-Gate; ein aktiver Spieler holt beide leicht, die Zahl ist also die
 * realistische, nicht die maximale.) Der Abschluss liegt damit irgendwo um
 * **Bühne 130–150** — tief genug, dass es ein Lebenswerk ist, nah genug, dass
 * es eines MIT Ende bleibt. Danach ist die Währung wertlos: genau der Boden, den
 * das Ideen-Dokument für permanente Schichten verlangt.
 *
 * Alles hier ist pur und DOM-frei; die Glue (`main.ts`) hält den Zustand, das
 * Panel (`ui/constellation-panel.ts`) zeichnet ihn, der Bot (`sim.ts`) faltet
 * dieselben Funktionen.
 */
import { CRIT_CHANCE, CRIT_MULT } from './click';
import { MONSTERS_PER_ZONE } from './combat';
import { STAR_MILESTONE } from './stars';

// ---------------------------------------------------------------------------
// Sternenstaub — die Währung
// ---------------------------------------------------------------------------

/**
 * Die Sterne-Schwelle, an der Staub fällt — re-exportiert, damit die eine
 * Meilenstein-Zahl auch für Panel und Balance-Ritual aus DIESEM Modul kommt
 * (sie ist dieselbe wie die der Meilenstein-Truhe, nicht eine zweite).
 */
export { STAR_MILESTONE };

/** 💫 je vollem Bühnen-Sterne-Meilenstein ({@link STAR_MILESTONE} Sterne). */
export const DUST_PER_STAR_MILESTONE = 5;
/** 💫 je freigeschaltetem Erfolg. */
export const DUST_PER_ACHIEVEMENT = 3;
/** 💫 je erstmals gefallenem Boss-Gate ab {@link DUST_GATE_MIN_ZONE}. */
export const DUST_PER_GATE = 2;
/** Ab dieser Bühne zahlt ein Boss-Gate-Erstkill Sternenstaub. */
export const DUST_GATE_MIN_ZONE = 25;
/** Der Bühnen-Abstand der Boss-Gates (spiegelt `combat.BOSS_EVERY`). */
const GATE_EVERY = 5;

/**
 * Die drei Quellen als Momentaufnahme. Alle drei Zahlen sind im Spiel
 * Lebenszeit-Highwater, also ist auch der daraus gerechnete Anspruch monoton —
 * darauf ruht die ganze Doppelzahlungs-Sicherheit von {@link syncDust}.
 */
export interface DustSources {
  /** Σ gesammelter Bühnen-Sterne (`stars.totalStars`). */
  readonly stars: number;
  /** Anzahl freigeschalteter Erfolge. */
  readonly achievements: number;
  /** Tiefste JE erreichte Bühne (Himmelfahrt-fest, `max(lifetimeMaxZone, gear.zoneEver)`). */
  readonly deepestZone: number;
}

/** Eine nicht-negative, endliche Ganzzahl (alles andere liest als 0). */
function nn(v: number): number {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Wie viele Boss-Gates ab {@link DUST_GATE_MIN_ZONE} bei dieser Tiefe schon
 * gefallen sind. Ein Gate Z gilt als erst-gekillt, sobald die tiefste je
 * erreichte Bühne ÜBER Z liegt (nur der Boss-Kill schiebt die Bühne weiter) —
 * dieselbe Regel wie `ch-state.bossFirstKillZones`, nur gezählt statt gesammelt.
 */
export function gatesCleared(deepestZone: number): number {
  const deepest = nn(deepestZone);
  if (deepest <= DUST_GATE_MIN_ZONE) return 0;
  return Math.floor((deepest - 1) / GATE_EVERY) - (DUST_GATE_MIN_ZONE / GATE_EVERY - 1);
}

/**
 * Der Sternenstaub-ANSPRUCH aus den drei Quellen — die eine Formel, aus der
 * `earned` immer neu abgeleitet wird. Weil jede Quelle monoton ist, ist auch
 * dieser Wert monoton; ein „schon ausgezahlt"-Zähler wird deshalb nirgends
 * gebraucht (im Gegensatz zu `stars.starsAwarded`, das echte Truhen bucht).
 */
export function dustEntitlement(src: DustSources): number {
  const milestones = Math.floor(nn(src.stars) / STAR_MILESTONE);
  return (
    milestones * DUST_PER_STAR_MILESTONE +
    nn(src.achievements) * DUST_PER_ACHIEVEMENT +
    gatesCleared(src.deepestZone) * DUST_PER_GATE
  );
}

// ---------------------------------------------------------------------------
// Der Katalog
// ---------------------------------------------------------------------------

/** Die drei Sternbilder. */
export type ConstellationId = 'aufbruch' | 'tempo' | 'ausdauer';

/** Was ein Knoten tut — ein Datum, kein Code (die Getter unten falten es). */
export type NodeEffect =
  /** +`pct` Klick-Schaden (additiv im Konstellations-Term). */
  | { readonly kind: 'click'; readonly pct: number }
  /** +`pct` Crew-DPS. */
  | { readonly kind: 'dps'; readonly pct: number }
  /** +`pct` auf jede BP-Quelle. */
  | { readonly kind: 'gold'; readonly pct: number }
  /** +`pp` Krit-Chance (läuft durch denselben 40-%-Deckel wie alles andere). */
  | { readonly kind: 'crit'; readonly pp: number }
  /** +`seconds` Combo-Gnadenfenster. */
  | { readonly kind: 'combo'; readonly seconds: number }
  /** +`pp` Offline-Effizienz (auf die 50-%-Basis, gedeckelt bei 100 %). */
  | { readonly kind: 'offlineRate'; readonly pp: number }
  /** +`pct` Truhen-Luck. */
  | { readonly kind: 'luck'; readonly pct: number }
  /** +`bp` Startkapital nach JEDEM Reset. */
  | { readonly kind: 'startGold'; readonly bp: number }
  /** ★ Identität: jede Tour startet mit dem Kobold-Buff. */
  | { readonly kind: 'warmup' }
  /** ★ Identität: ein Boss-Timeout erstattet `kills` Rivalen der Rückfall-Bühne. */
  | { readonly kind: 'secondWind'; readonly kills: number }
  /** ★ Identität: Offline-Cap +`hours` h. */
  | { readonly kind: 'offlineCap'; readonly hours: number };

export interface ConstellationNodeConfig {
  readonly id: string;
  readonly name: string;
  /** Ein Satz für die Karte — was der Knoten TUT. */
  readonly desc: string;
  readonly effect: NodeEffect;
  /** Position des Sterns auf der Karte (viewBox 0…100 × 0…44). */
  readonly x: number;
  readonly y: number;
}

export interface ConstellationConfig {
  readonly id: ConstellationId;
  readonly name: string;
  /** Ein Zeichen als Marke der Konstellation (wie überall Bedeutungsträger). */
  readonly icon: string;
  readonly desc: string;
  /** Genau {@link CONSTELLATION_NODE_COUNT} Knoten, streng linear freischaltend. */
  readonly nodes: readonly ConstellationNodeConfig[];
}

/** Knoten je Konstellation — Knoten 8 ist immer der Identitäts-Knoten. */
export const CONSTELLATION_NODE_COUNT = 8;

/**
 * Die Kostenleiter (Index = Knoten-Index). Gewählt gegen den gemessenen
 * Lebens-Vorrat (siehe Modul-Kopf): Der erste Knoten jeder Konstellation kostet
 * 2 💫, sodass die ersten beiden Erfolge sofort ALLE DREI Linien anreißen
 * („probier alles an"), und die Summe von 70 💫 je Linie stellt den vollen
 * Ausbau bei 210 💫 in die Gegend von Bühne 130–150.
 */
export const CONSTELLATION_COSTS: readonly number[] = [2, 3, 5, 7, 9, 12, 14, 18];

/** Kosten EINER Konstellation, voll ausgebaut. */
export const CONSTELLATION_LINE_COST = CONSTELLATION_COSTS.reduce((a, b) => a + b, 0);

/** Der Preis des Lebenswerks: alle drei Linien voll. */
export const CONSTELLATION_FULL_COST = CONSTELLATION_LINE_COST * 3;

/** Sekunden Kobold-Buff, mit denen „Warm-up-Start" jede Tour eröffnet. */
export const WARMUP_S = 60;
/** Rivalen, die „Zweiter Wind" nach einem Boss-Timeout erstattet (von 10). */
export const SECOND_WIND_KILLS = 3;
/** Stunden, die „Sternenwanderer" auf den Offline-Cap legt. */
export const STARWALKER_HOURS = 2;

/** Der Katalog: drei Linien à acht Sternen. */
export const CONSTELLATIONS: readonly ConstellationConfig[] = [
  {
    id: 'aufbruch',
    name: 'Der Aufbruch',
    icon: '✦',
    desc: 'Alles, was eine frische Tour schneller in Fahrt bringt.',
    nodes: [
      {
        id: 'aufbruch-funke',
        name: 'Erster Funke',
        desc: '+10 BP Startkapital nach jedem Reset',
        effect: { kind: 'startGold', bp: 10 },
        x: 8,
        y: 36,
      },
      {
        id: 'aufbruch-haende',
        name: 'Warme Hände',
        desc: '+2 % Klick-Schaden',
        effect: { kind: 'click', pct: 0.02 },
        x: 19,
        y: 26,
      },
      {
        id: 'aufbruch-vorschuss',
        name: 'Gagen-Vorschuss',
        desc: '+30 BP Startkapital nach jedem Reset',
        effect: { kind: 'startGold', bp: 30 },
        x: 30,
        y: 33,
      },
      {
        id: 'aufbruch-crew',
        name: 'Frühe Crew',
        desc: '+2 % Crew-DPS',
        effect: { kind: 'dps', pct: 0.02 },
        x: 42,
        y: 20,
      },
      {
        id: 'aufbruch-kasse',
        name: 'Volle Kasse',
        desc: '+60 BP Startkapital nach jedem Reset',
        effect: { kind: 'startGold', bp: 60 },
        x: 54,
        y: 27,
      },
      {
        id: 'aufbruch-glueck',
        name: 'Anfängerglück',
        desc: '+2 % BP auf alle Einnahmen',
        effect: { kind: 'gold', pct: 0.02 },
        x: 66,
        y: 15,
      },
      {
        id: 'aufbruch-zuender',
        name: 'Kalter Zünder',
        desc: '+0,5 Prozentpunkte Krit-Chance',
        effect: { kind: 'crit', pp: 0.005 },
        x: 78,
        y: 22,
      },
      {
        id: 'aufbruch-warmup',
        name: 'Warm-up-Start',
        desc: `Jede Tour beginnt mit ${WARMUP_S} s Kobold-Buff (×2 Klick-Schaden)`,
        effect: { kind: 'warmup' },
        x: 92,
        y: 9,
      },
    ],
  },
  {
    id: 'tempo',
    name: 'Das Tempo',
    icon: '✧',
    desc: 'Für die Hände: Klick, Combo, Krit — und ein Netz unter dem Boss-Gate.',
    nodes: [
      {
        id: 'tempo-schlag',
        name: 'Loser Schlag',
        desc: '+2 % Klick-Schaden',
        effect: { kind: 'click', pct: 0.02 },
        x: 7,
        y: 14,
      },
      {
        id: 'tempo-atem',
        name: 'Langer Atem',
        desc: '+0,2 s Combo-Fenster',
        effect: { kind: 'combo', seconds: 0.2 },
        x: 18,
        y: 30,
      },
      {
        id: 'tempo-schneide',
        name: 'Scharfe Schneide',
        desc: '+0,5 Prozentpunkte Krit-Chance',
        effect: { kind: 'crit', pp: 0.005 },
        x: 29,
        y: 13,
      },
      {
        id: 'tempo-doppel',
        name: 'Doppelschlag',
        desc: '+2 % Klick-Schaden',
        effect: { kind: 'click', pct: 0.02 },
        x: 41,
        y: 29,
      },
      {
        id: 'tempo-faden',
        name: 'Roter Faden',
        desc: '+0,2 s Combo-Fenster',
        effect: { kind: 'combo', seconds: 0.2 },
        x: 53,
        y: 12,
      },
      {
        id: 'tempo-blitz',
        name: 'Blitzschlag',
        desc: '+0,5 Prozentpunkte Krit-Chance',
        effect: { kind: 'crit', pp: 0.005 },
        x: 65,
        y: 28,
      },
      {
        id: 'tempo-sturm',
        name: 'Sturmlauf',
        desc: '+2 % Klick-Schaden',
        effect: { kind: 'click', pct: 0.02 },
        x: 77,
        y: 11,
      },
      {
        id: 'tempo-zweiterwind',
        name: 'Zweiter Wind',
        desc: `Boss-Timeout: die Rückfall-Bühne startet mit ${SECOND_WIND_KILLS}/${MONSTERS_PER_ZONE} erledigt`,
        effect: { kind: 'secondWind', kills: SECOND_WIND_KILLS },
        x: 91,
        y: 26,
      },
    ],
  },
  {
    id: 'ausdauer',
    name: 'Die Ausdauer',
    icon: '✩',
    desc: 'Für die Stunden, in denen du nicht klickst.',
    nodes: [
      {
        id: 'ausdauer-groove',
        name: 'Tiefer Groove',
        desc: '+2 % Crew-DPS',
        effect: { kind: 'dps', pct: 0.02 },
        x: 8,
        y: 22,
      },
      {
        id: 'ausdauer-nachtwache',
        name: 'Nachtwache',
        desc: '+2 Prozentpunkte Offline-Rate',
        effect: { kind: 'offlineRate', pp: 0.02 },
        x: 20,
        y: 15,
      },
      {
        id: 'ausdauer-spuersinn',
        name: 'Truhen-Spürsinn',
        desc: '+3 % Truhen-Luck',
        effect: { kind: 'luck', pct: 0.03 },
        x: 32,
        y: 13,
      },
      {
        id: 'ausdauer-puls',
        name: 'Stetiger Puls',
        desc: '+2 % Crew-DPS',
        effect: { kind: 'dps', pct: 0.02 },
        x: 45,
        y: 17,
      },
      {
        id: 'ausdauer-schlaf',
        name: 'Ruhiger Schlaf',
        desc: '+2 Prozentpunkte Offline-Rate',
        effect: { kind: 'offlineRate', pp: 0.02 },
        x: 57,
        y: 24,
      },
      {
        id: 'ausdauer-witterung',
        name: 'Feine Witterung',
        desc: '+3 % Truhen-Luck',
        effect: { kind: 'luck', pct: 0.03 },
        x: 69,
        y: 29,
      },
      {
        id: 'ausdauer-tantiemen',
        name: 'Tantiemen',
        desc: '+2 % BP auf alle Einnahmen',
        effect: { kind: 'gold', pct: 0.02 },
        x: 81,
        y: 26,
      },
      {
        id: 'ausdauer-wanderer',
        name: 'Sternenwanderer',
        desc: `Offline-Cap +${STARWALKER_HOURS} h — additiv auf alles andere`,
        effect: { kind: 'offlineCap', hours: STARWALKER_HOURS },
        x: 92,
        y: 18,
      },
    ],
  },
];

const BY_ID: Record<string, ConstellationConfig> = Object.fromEntries(
  CONSTELLATIONS.map((c) => [c.id, c]),
);

/** Die Konfiguration einer Konstellation (oder `undefined`). */
export function constellationConfig(id: string): ConstellationConfig | undefined {
  return BY_ID[id];
}

/** Kosten des Knotens mit Index `index` (null jenseits der Kette). */
export function nodeCost(index: number): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= CONSTELLATION_COSTS.length) return null;
  return CONSTELLATION_COSTS[index];
}

// ---------------------------------------------------------------------------
// Der Zustand
// ---------------------------------------------------------------------------

/**
 * Die persistierte Slice (CH-save v15). Winzig und flach: zwei Zahlen plus drei
 * Kettenlängen. Weil jede Linie streng linear ist, IST die Zahl der
 * freigeschalteten Knoten der ganze Baum — es gibt keine Lücke, die man
 * darstellen müsste, und ein hand-editierter Save kann keine unmögliche Form
 * behaupten.
 */
export interface ConstellationState {
  /** Je verdienter Sternenstaub (Highwater — sinkt NIE, auch nicht beim Reset). */
  earned: number;
  /** Ausgegebener Sternenstaub (= Σ Kosten aller freigeschalteten Knoten). */
  spent: number;
  /** Freigeschaltete Knoten je Konstellations-Id (0 … 8; fehlt = 0). */
  nodes: Record<string, number>;
}

/** Ein frischer (leerer) Konstellations-Zustand. */
export function createConstellation(): ConstellationState {
  return { earned: 0, spent: 0, nodes: {} };
}

/** Freigeschaltete Knoten einer Linie — bereinigt auf 0 … 8. */
export function unlockedNodes(c: ConstellationState, id: string): number {
  if (!BY_ID[id]) return 0;
  return Math.min(CONSTELLATION_NODE_COUNT, nn(c.nodes[id] ?? 0));
}

/** Σ freigeschalteter Knoten über alle drei Linien (0 … 24). */
export function totalNodes(c: ConstellationState): number {
  let n = 0;
  for (const cfg of CONSTELLATIONS) n += unlockedNodes(c, cfg.id);
  return n;
}

/** Was ein gegebener Ausbau gekostet HAT — die Wahrheit hinter `spent`. */
export function constellationSpend(nodes: Record<string, number>): number {
  let sum = 0;
  for (const cfg of CONSTELLATIONS) {
    const n = Math.min(CONSTELLATION_NODE_COUNT, nn(nodes[cfg.id] ?? 0));
    for (let i = 0; i < n; i++) sum += CONSTELLATION_COSTS[i];
  }
  return sum;
}

/** Verfügbarer (noch nicht ausgegebener) Sternenstaub. */
export function dustHeld(c: ConstellationState): number {
  return Math.max(0, nn(c.earned) - nn(c.spent));
}

/**
 * `earned` auf den Anspruch aus den drei Quellen heben. Gibt DIESELBE Referenz
 * zurück, wenn nichts dazukam — die Glue erkennt daran, ob ein Toast fällig ist,
 * ohne selbst zu vergleichen (dasselbe Muster wie `stars.addStar`).
 *
 * Doppelzahlung ist strukturell unmöglich: Es wird nichts „gutgeschrieben",
 * sondern ein Highwater an eine monotone Formel angeglichen. Ein Reload, ein
 * Import, ein Reset — alle drei rechnen dieselbe Zahl aus denselben Quellen.
 */
export function syncDust(c: ConstellationState, src: DustSources): ConstellationState {
  const want = dustEntitlement(src);
  const earned = nn(c.earned);
  if (want <= earned) return c;
  return { ...c, earned: want };
}

/** Der nächste kaufbare Knoten einer Linie (null, wenn sie voll ist). */
export function nextNode(c: ConstellationState, id: string): ConstellationNodeConfig | null {
  const cfg = BY_ID[id];
  if (!cfg) return null;
  const n = unlockedNodes(c, id);
  return n < CONSTELLATION_NODE_COUNT ? cfg.nodes[n] : null;
}

/** Kosten des nächsten Knotens einer Linie (null, wenn sie voll ist). */
export function nextNodeCost(c: ConstellationState, id: string): number | null {
  const cfg = BY_ID[id];
  if (!cfg) return null;
  return nodeCost(unlockedNodes(c, id));
}

/** Ist der nächste Knoten dieser Linie JETZT bezahlbar? */
export function canBuyNode(c: ConstellationState, id: string): boolean {
  const cost = nextNodeCost(c, id);
  return cost !== null && dustHeld(c) >= cost;
}

export interface BuyNodeResult {
  constellation: ConstellationState;
  bought: boolean;
  /** Der frisch freigeschaltete Knoten (null, wenn nichts gekauft wurde). */
  node: ConstellationNodeConfig | null;
}

/**
 * Den nächsten Knoten einer Linie freischalten. Rein; bei „geht nicht" kommt der
 * unveränderte Zustand zurück. `earned` bleibt unangetastet — ausgegeben wird
 * über `spent`, damit der Highwater seine Bedeutung behält („so viel hast du je
 * verdient", die Zahl im Panel-Kopf).
 */
export function buyNode(c: ConstellationState, id: string): BuyNodeResult {
  const node = nextNode(c, id);
  const cost = nextNodeCost(c, id);
  if (node === null || cost === null || dustHeld(c) < cost) {
    return { constellation: c, bought: false, node: null };
  }
  const n = unlockedNodes(c, id);
  return {
    constellation: {
      ...c,
      spent: nn(c.spent) + cost,
      nodes: { ...c.nodes, [id]: n + 1 },
    },
    bought: true,
    node,
  };
}

// ---------------------------------------------------------------------------
// Die Wirkung (jeder Getter hängt in einem echten Rechenpfad)
// ---------------------------------------------------------------------------

/** Alle freigeschalteten Knoten, in Katalog-Reihenfolge. */
export function activeNodes(c: ConstellationState): readonly ConstellationNodeConfig[] {
  const out: ConstellationNodeConfig[] = [];
  for (const cfg of CONSTELLATIONS) {
    const n = unlockedNodes(c, cfg.id);
    for (let i = 0; i < n; i++) out.push(cfg.nodes[i]);
  }
  return out;
}

/** Σ eines additiven Effekt-Werts über alle freigeschalteten Knoten. */
function sumEffect(c: ConstellationState, pick: (e: NodeEffect) => number): number {
  let sum = 0;
  for (const node of activeNodes(c)) sum += pick(node.effect);
  return sum;
}

/** Trägt der Baum diesen Identitäts-Knoten? */
function hasEffect(c: ConstellationState, kind: NodeEffect['kind']): boolean {
  return activeNodes(c).some((n) => n.effect.kind === kind);
}

/** Klick-Faktor: `1 + Σ` der Klick-Knoten (×1 ohne Baum) — fließt in `clickDamageOf`. */
export function constellationClickMult(c: ConstellationState): number {
  return 1 + sumEffect(c, (e) => (e.kind === 'click' ? e.pct : 0));
}

/** Crew-DPS-Faktor (×1 ohne Baum) — fließt in `dpsOf`, nie in den Klick-Term (P1). */
export function constellationDpsMult(c: ConstellationState): number {
  return 1 + sumEffect(c, (e) => (e.kind === 'dps' ? e.pct : 0));
}

/** BP-Faktor (×1 ohne Baum) — fließt in `goldMult`, also in JEDE BP-Quelle. */
export function constellationGoldMult(c: ConstellationState): number {
  return 1 + sumEffect(c, (e) => (e.kind === 'gold' ? e.pct : 0));
}

/** Additive Krit-Chance (0 ohne Baum) — läuft durch den 40-%-Deckel von `critChance`. */
export function constellationCritChanceBonus(c: ConstellationState): number {
  return sumEffect(c, (e) => (e.kind === 'crit' ? e.pp : 0));
}

/** Zusätzliche Sekunden Combo-Gnadenfenster (0 ohne Baum). */
export function constellationComboWindowBonus(c: ConstellationState): number {
  return sumEffect(c, (e) => (e.kind === 'combo' ? e.seconds : 0));
}

/** Additiver Offline-Effizienz-Bonus (0 ohne Baum) — `offlineGold` deckelt bei 100 %. */
export function constellationOfflineRateBonus(c: ConstellationState): number {
  return sumEffect(c, (e) => (e.kind === 'offlineRate' ? e.pp : 0));
}

/** Additiver Truhen-Luck-Anteil (0 ohne Baum) — im selben Stack wie Truhilda/Gear. */
export function constellationChestLuckBonus(c: ConstellationState): number {
  return sumEffect(c, (e) => (e.kind === 'luck' ? e.pct : 0));
}

/** Start-BP nach jedem Reset (0 ohne Baum). */
export function constellationStartGold(c: ConstellationState): number {
  return sumEffect(c, (e) => (e.kind === 'startGold' ? e.bp : 0));
}

/** ★ „Sternenwanderer": zusätzliche Offline-Cap-Sekunden (0 ohne Knoten). */
export function constellationOfflineCapBonusS(c: ConstellationState): number {
  return sumEffect(c, (e) => (e.kind === 'offlineCap' ? e.hours * 3600 : 0));
}

/** ★ „Warm-up-Start": beginnt jede Tour mit dem Kobold-Buff? */
export function hasWarmupStart(c: ConstellationState): boolean {
  return hasEffect(c, 'warmup');
}

/**
 * ★ „Zweiter Wind": Rivalen, die ein Boss-Timeout auf der Rückfall-Bühne
 * erstattet (0 ohne Knoten). Wird als `killsThisZone` an `combat.tickBoss`
 * gereicht — die Bühne startet dann sichtbar bei 3/10 statt 0/10.
 */
export function secondWindKills(c: ConstellationState): number {
  return sumEffect(c, (e) => (e.kind === 'secondWind' ? e.kills : 0));
}

// ---------------------------------------------------------------------------
// Das Budget (Leitplanke ≤ ×1.5 — als Rechnung, nicht als Behauptung)
// ---------------------------------------------------------------------------

/** Der voll ausgebaute Baum — Referenz für Budget-Tests und das Sim-Profil. */
export const CONSTELLATION_FULL: ConstellationState = {
  earned: CONSTELLATION_FULL_COST,
  spent: CONSTELLATION_FULL_COST,
  nodes: Object.fromEntries(CONSTELLATIONS.map((c) => [c.id, CONSTELLATION_NODE_COUNT])),
};

/**
 * Der Krit-EV-Faktor, den die Krit-Knoten beitragen: `(1 + p'·(m−1)) / (1 + p·(m−1))`
 * mit `p = CRIT_CHANCE`, `m = CRIT_MULT`. Aus den ECHTEN Klick-Konstanten
 * gerechnet, damit die Budget-Zahl mitwandert, wenn jemand am Krit dreht.
 */
export function constellationCritEvFactor(c: ConstellationState): number {
  const base = 1 + CRIT_CHANCE * (CRIT_MULT - 1);
  const with_ = 1 + (CRIT_CHANCE + constellationCritChanceBonus(c)) * (CRIT_MULT - 1);
  return with_ / base;
}

/**
 * **Das Leistungs-Budget**: das Produkt ALLER multiplikativen Live-Faktoren
 * (Klick × Crew-DPS × BP × Krit-EV × Truhen-Chance). Bewusst konservativ — kein
 * einziger Kill im Spiel bekommt alle fünf zugleich —, damit die Leitplanke
 * (≤ ×1.5) auch dann hält, wenn jemand später einen Knoten „nur ein bisschen"
 * stärker macht. Das Combo-Fenster fehlt mit Absicht (es hebt keinen Multiplikator,
 * siehe Modul-Kopf), der Offline-Pfad hat sein eigenes Budget.
 */
export function constellationPowerBudget(c: ConstellationState = CONSTELLATION_FULL): number {
  return (
    constellationClickMult(c) *
    constellationDpsMult(c) *
    constellationGoldMult(c) *
    constellationCritEvFactor(c) *
    (1 + constellationChestLuckBonus(c))
  );
}

/**
 * **Das Offline-Budget**: Rate-Faktor × Cap-Faktor, gegen die Basiswerte des
 * Spiels (50 % Effizienz, 8 h Cap). Getrennt vom Leistungs-Budget, weil
 * Offline-Ertrag nichts an der Live-Rechnung multipliziert.
 */
export function constellationOfflineBudget(
  c: ConstellationState = CONSTELLATION_FULL,
  baseRate = 0.5,
  baseCapS = 8 * 3600,
): number {
  const rate = (baseRate + constellationOfflineRateBonus(c)) / baseRate;
  const cap = (baseCapS + constellationOfflineCapBonusS(c)) / baseCapS;
  return rate * cap;
}
