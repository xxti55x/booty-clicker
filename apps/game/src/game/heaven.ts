/**
 * Ruhmes-Himmelfahrt — prestige layer 2 (pure, spec §4.5.2). Once you have earned
 * enough Ruhm-Seelen over your lifetime you can *ascend a second time* into the
 * heavens, banking **Himmelspfirsiche (HPF)** and resetting all of L1 (souls,
 * Ancients, the whole tour) for a permanent, compounding boost.
 *
 * **Held-balance model** (mirrors souls, §ascension): `hpfLifetime` is the earned
 * total (`⌊√(RS_lifetime/1000)⌋`, monotonic); `hpf` is the spendable **held**
 * balance = `hpfLifetime − Σ(spent in the Himmelsbaum)`. Held HPF has a double,
 * *multiplying* effect (the anti-plateau core, N1):
 *
 *   1. +2 % global damage per held HPF (`heavenGlobalMult`);
 *   2. a **soul amplifier** `SOUL_BONUS_eff = 0.10 + 0.002·HPF` (`soulBonusEff`) so
 *      every held soul is itself worth more — L1 and L2 multiply, they don't add.
 *
 * Spent HPF buys **Himmelsbaum** nodes: permanent across all ascensions AND
 * Himmelfahrten. Seit ROADMAP-V2 P4 ist der Baum in **drei Äste** geteilt
 * (Ökonomie 💰 / Kampf ⚔️ / Ritual 🕺) mit je vier normalen Knoten plus EINEM
 * Exklusiv-Paar — siehe `TREE_BRANCHES` / `TREE_NODES` unten.
 *
 * All pure; the glue only calls in and folds the modifiers through.
 */
import { SOUL_BONUS } from './ascension';
import { COMBO_CAP, COMBO_STEP } from './click';

/** Held HPF each add +2 % global damage. */
export const HPF_GLOBAL_PER = 0.02;
/** Each held HPF raises the per-soul bonus by this (the soul amplifier, §4.5.2). */
export const SOUL_AMP_PER_HPF = 0.002;
/** RS-lifetime needed per HPF² — first Himmelfahrt at 1 000 RS lifetime. */
export const HPF_RS_DIVISOR = 1000;
/** A coach auto-click deals this share of the effective click value (§4.3.5). */
export const COACH_CLICK_SHARE = 0.25;

/** The serializable L2 state (CH-save v5, §9.2.1). */
export interface HeavenState {
  /** Held (spendable) Himmelspfirsiche. */
  hpf: number;
  /** Lifetime-earned HPF (monotonic highwater — drives the Transzendenz gate). */
  hpfLifetime: number;
  /** Number of Himmelfahrten performed. */
  ascensions2: number;
  /** Bought Himmelsbaum node levels keyed by node id (absent = 0). */
  tree: Record<string, number>;
}

/** A fresh (never-ascended-to-heaven) L2 state. */
export function createHeaven(): HeavenState {
  return { hpf: 0, hpfLifetime: 0, ascensions2: 0, tree: {} };
}

/** Lifetime HPF earned for a given lifetime-RS total: `⌊√(RS/1000)⌋`. */
export function hpfForRsLifetime(rsLifetime: number): number {
  if (!(rsLifetime > 0)) return 0;
  return Math.floor(Math.sqrt(rsLifetime / HPF_RS_DIVISOR));
}

/** Global damage multiplier from held HPF: 1 + 2 %·HPF. */
export function heavenGlobalMult(hpf: number): number {
  return 1 + HPF_GLOBAL_PER * Math.max(0, hpf);
}

/** Effective per-soul bonus given held HPF: 0.10 + 0.002·HPF (the amplifier). */
export function soulBonusEff(hpf: number): number {
  return SOUL_BONUS + SOUL_AMP_PER_HPF * Math.max(0, hpf);
}

// ---- Himmelfahrt (bank HPF + reset scope handled by the caller) ----

/** HPF you would GAIN by a Himmelfahrt now: earned-for-RS minus already-earned. */
export function himmelfahrtGain(heaven: HeavenState, rsLifetime: number): number {
  return Math.max(0, hpfForRsLifetime(rsLifetime) - heaven.hpfLifetime);
}

/** Whether a Himmelfahrt would bank at least one HPF (the 1 000-RS gate first time). */
export function canHimmelfahrt(heaven: HeavenState, rsLifetime: number): boolean {
  return himmelfahrtGain(heaven, rsLifetime) >= 1;
}

/**
 * Bank the Himmelfahrt's HPF (held += gain, lifetime lifted, count++). Pure — the
 * caller resets the L1 state (souls/rsLifetime/Ancients/gold/crew/zone) around it.
 */
export function bankHimmelfahrt(heaven: HeavenState, rsLifetime: number): HeavenState {
  const earned = hpfForRsLifetime(rsLifetime);
  const gain = Math.max(0, earned - heaven.hpfLifetime);
  return {
    ...heaven,
    hpf: heaven.hpf + gain,
    hpfLifetime: Math.max(heaven.hpfLifetime, earned),
    ascensions2: heaven.ascensions2 + 1,
  };
}

// ---- Himmelsbaum (spent HPF, permanent) ----

/** Die drei Äste des Himmelsbaums (ROADMAP-V2 P4). */
export type TreeBranchId = 'eco' | 'kampf' | 'ritual';

export interface TreeBranchConfig {
  readonly id: TreeBranchId;
  /** Deutscher Ast-Titel für die UI. */
  readonly name: string;
  /** Ast-Icon (ein Emoji, wie überall im Spiel als Bedeutungsträger). */
  readonly icon: string;
  /** Ein Satz, was dieser Ast tut. */
  readonly desc: string;
}

/** Die Ast-Reihenfolge der UI (Spalten links → rechts bzw. Sektionen oben → unten). */
export const TREE_BRANCHES: readonly TreeBranchConfig[] = [
  {
    id: 'eco',
    name: 'Ökonomie',
    icon: '💰',
    desc: 'BP, Loot und die Stunden, in denen du nicht spielst.',
  },
  {
    id: 'kampf',
    name: 'Kampf',
    icon: '⚔️',
    desc: 'Roher Schaden — Klick, Crew und die Boss-Gates.',
  },
  {
    id: 'ritual',
    name: 'Ritual',
    icon: '🕺',
    desc: 'Ekstase, Combo, Beat — alles, was am Rhythmus hängt.',
  },
];

export interface TreeNodeConfig {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  /** HPF cost per level: `costs[level]` buys `level → level+1`. */
  readonly costs: readonly number[];
  /** Ast, in dem der Knoten hängt (ROADMAP-V2 P4). */
  readonly branch: TreeBranchId;
  /**
   * Id des Knotens, der diesen AUSSCHLIESST (Exklusiv-Paar, P4). Immer beidseitig
   * gesetzt: wer den einen kauft, kann den anderen nie mehr kaufen — bis zum
   * Respec (`respecTree`). Genau EIN Paar pro Ast; die Wahl ist die Build-Ansage
   * des Astes.
   */
  readonly exclusiveWith?: string;
}

/** Key-drop bonus fraction the Truhen-Magnet node grants (spec §4.5.2: +25 %). */
export const TRUHEN_MAGNET_KEYDROP = 0.25;
/** BP-Bonus je „Goldene Hände"-Stufe (+10 %, additiv über die Stufen). */
export const GOLDENE_HANDE_PER = 0.1;
/** Zusätzliche Boost-Dauer des Goldenen Pfirsichs durch „Pfirsich-Reife" (ms). */
export const PFIRSICH_REIFE_MS = 15_000;
/** „Truhen-Fokus": Faktor auf die Rivalen-Truhen-Chance. */
export const TRUHEN_FOKUS_MULT = 1.5;
/** „Pfirsich-Fokus": um diesen Anteil erscheint der Goldene Pfirsich öfter. */
export const PFIRSICH_FOKUS_RATE = 0.35;
/** Crew-DPS-Bonus je „Schwerer Bass"-Stufe (+8 %, additiv über die Stufen). */
export const SCHWERER_BASS_PER = 0.08;
/** „Präzisions-Shake": Faktor auf den GESAMTEN Krit-Multiplikator (+25 %). */
export const PRAEZISIONS_SHAKE_MULT = 1.25;
/** „Gate-Crasher": zusätzliche Sekunden auf der Boss-Uhr. */
export const GATE_CRASHER_S = 5;
/** „Klick-Doktrin": Faktor auf den Klick-Schaden. */
export const KLICK_DOKTRIN_MULT = 1.25;
/** „Crew-Doktrin": Faktor auf die Crew-DPS. */
export const CREW_DOKTRIN_MULT = 1.25;
/** „Ekstase-Doktrin": Klick-Multiplikator der Twerk-Ekstase (statt ×10). */
export const EKSTASE_DOKTRIN_MULT = 12;
/** „Combo-Doktrin": Combo-Multiplikator am Cap (statt ×1.2). */
export const COMBO_DOKTRIN_CAP_MULT = 1.3;
/** „Beat-Gefühl": zusätzliche Millisekunden im On-Beat-Fenster. */
export const BEAT_GEFUHL_MS = 40;
/** „Combo-Gedächtnis": Anteil, um den der Combo-Verfall langsamer läuft. */
export const COMBO_GEDACHTNIS_RED = 0.2;

/**
 * **Der Himmelsbaum (ROADMAP-V2 P4).** Drei Äste à vier normalen Knoten plus je
 * EINEM Exklusiv-Paar. Die fünf Grundknoten aus M10–M12 (Twerk-Coach, Frühstarter,
 * Nachtschicht, Ekstase-Ausdauer, Truhen-Magnet) behalten Id, Kosten und Wirkung
 * **byte-gleich** und wurden nur einem Ast zugeordnet — ein Alt-Save verliert also
 * keinen einzigen gekauften Level (und braucht keinen Schema-Bump, siehe
 * `ch-store.repairHeaven`: `tree` ist ein offenes Record).
 *
 * **Kostenkurve.** Sie setzt die bestehende fort (×2.5 je Stufe: 5/15/40/100,
 * 12/30/75, 10/25) und ordnet die Einzel-Knoten zwischen 8 und 25 HPF ein. Die
 * sechs **Exklusiv-Knoten kosten einheitlich 35 HPF** — teurer als jeder normale
 * Einzel-Knoten, aber unter den tiefen Stufen (75/100), damit die Entscheidung in
 * der Strecke zwischen erster Himmelfahrt und Transzendenz (100 HPF Lebenszeit)
 * wirklich fällt und nicht bloß theoretisch existiert.
 *
 * **Warum jeder Kauf WEHTUT.** Gehaltene HPF geben +2 % globalen Schaden UND
 * verstärken jede Seele (`soulBonusEff`) — Ausgeben kostet also beides. Ein
 * 35-HPF-Doktrin-Knoten nimmt 70 % globalen Schaden mit; genau deshalb ist der Baum
 * eine Reihe echter Entscheidungen und keine Einkaufsliste. Der **Respec**
 * (`respecTree`) macht sie umkehrbar, aber nicht gratis (1 HPF Gebühr).
 *
 * Jeder Knoten ist REAL verdrahtet — die Getter unten hängen ausnahmslos in einem
 * echten Rechenpfad (Klick-Pipeline, `dpsOf`, `goldMult`, Truhen-/Pfirsich-Rolls,
 * Boss-Uhr, Combo-Verfall, On-Beat-Fenster). Es gibt keinen toten Knoten.
 */
export const TREE_NODES: readonly TreeNodeConfig[] = [
  // ---- 💰 Ökonomie ----
  {
    id: 'goldenehande',
    name: 'Goldene Hände I–III',
    desc: '+10 % BP je Stufe (auf alle Einnahmen)',
    costs: [12, 30, 75],
    branch: 'eco',
  },
  {
    id: 'nachtschicht',
    name: 'Nachtschicht I–II',
    desc: 'Offline-Cap 8 h → 16 h → 24 h',
    costs: [10, 25],
    branch: 'eco',
  },
  {
    id: 'truhenmagnet',
    name: 'Truhen-Magnet',
    desc: '+25 % Schlüssel-Drops',
    costs: [15],
    branch: 'eco',
  },
  {
    id: 'pfirsichreife',
    name: 'Pfirsich-Reife',
    desc: 'Goldener Pfirsich: Boost hält 15 s länger',
    costs: [20],
    branch: 'eco',
  },
  {
    id: 'truhenfokus',
    name: 'Truhen-Fokus',
    desc: 'Rivalen lassen 50 % öfter eine Truhe fallen',
    costs: [35],
    branch: 'eco',
    exclusiveWith: 'pfirsichfokus',
  },
  {
    id: 'pfirsichfokus',
    name: 'Pfirsich-Fokus',
    desc: 'Der Goldene Pfirsich erscheint 35 % öfter',
    costs: [35],
    branch: 'eco',
    exclusiveWith: 'truhenfokus',
  },
  // ---- ⚔️ Kampf ----
  {
    id: 'schwererbass',
    name: 'Schwerer Bass I–III',
    desc: '+8 % Crew-DPS je Stufe',
    costs: [12, 30, 75],
    branch: 'kampf',
  },
  {
    id: 'fruhstarter',
    name: 'Frühstarter',
    desc: 'Nach Aszension: Crew-Level = 10 % der vorherigen',
    costs: [8],
    branch: 'kampf',
  },
  {
    id: 'gatecrasher',
    name: 'Gate-Crasher',
    desc: 'Boss-Uhr läuft 5 s länger',
    costs: [20],
    branch: 'kampf',
  },
  {
    id: 'praezisionsshake',
    name: 'Präzisions-Shake',
    desc: '+25 % Krit-Schaden (auf den ganzen Krit-Multiplikator)',
    costs: [25],
    branch: 'kampf',
  },
  {
    id: 'klickdoktrin',
    name: 'Klick-Doktrin',
    desc: '+25 % Klick-Schaden',
    costs: [35],
    branch: 'kampf',
    exclusiveWith: 'crewdoktrin',
  },
  {
    id: 'crewdoktrin',
    name: 'Crew-Doktrin',
    desc: '+25 % Crew-DPS',
    costs: [35],
    branch: 'kampf',
    exclusiveWith: 'klickdoktrin',
  },
  // ---- 🕺 Ritual ----
  {
    id: 'coach',
    name: 'Twerk-Coach I–IV',
    desc: 'Auto-Klicker 1 → 4 cps (25 % Klickwert)',
    costs: [5, 15, 40, 100],
    branch: 'ritual',
  },
  {
    id: 'ekstaseausdauer',
    name: 'Ekstase-Ausdauer I–III',
    desc: 'Ekstase +3 s je Stufe',
    costs: [12, 30, 75],
    branch: 'ritual',
  },
  {
    id: 'beatgefuhl',
    name: 'Beat-Gefühl',
    desc: `On-Beat-Fenster +${BEAT_GEFUHL_MS} ms`,
    costs: [18],
    branch: 'ritual',
  },
  {
    id: 'combogedachtnis',
    name: 'Combo-Gedächtnis',
    desc: `Combo verfällt ${Math.round(COMBO_GEDACHTNIS_RED * 100)} % langsamer`,
    costs: [22],
    branch: 'ritual',
  },
  {
    id: 'ekstasedoktrin',
    name: 'Ekstase-Doktrin',
    desc: `Twerk-Ekstase ×${EKSTASE_DOKTRIN_MULT} statt ×10`,
    costs: [35],
    branch: 'ritual',
    exclusiveWith: 'combodoktrin',
  },
  {
    id: 'combodoktrin',
    name: 'Combo-Doktrin',
    desc: `Combo am Cap ×${COMBO_DOKTRIN_CAP_MULT} statt ×1.2`,
    costs: [35],
    branch: 'ritual',
    exclusiveWith: 'ekstasedoktrin',
  },
];

const NODE_BY_ID: Record<string, TreeNodeConfig> = Object.fromEntries(
  TREE_NODES.map((n) => [n.id, n]),
);

/** The config for a tree-node id, or undefined. */
export function treeNodeConfig(id: string): TreeNodeConfig | undefined {
  return NODE_BY_ID[id];
}

/** Alle Knoten eines Astes, in Katalog-Reihenfolge. */
export function treeNodesOfBranch(branch: TreeBranchId): readonly TreeNodeConfig[] {
  return TREE_NODES.filter((n) => n.branch === branch);
}

/** Max level of a tree node (its cost-list length). */
export function treeNodeMaxLevel(id: string): number {
  return NODE_BY_ID[id]?.costs.length ?? 0;
}

/**
 * Current (sanitised) level of a tree node — die EINZIGE Wahrheitsquelle für jeden
 * Effekt-Getter. Nicht-Zahlen/negative Werte ⇒ 0, und der Wert wird zusätzlich auf
 * die Maximalstufe des Knotens GEDECKELT: ein hand-editierter Save mit
 * `coach: 999` bekommt damit exakt 4 cps, und eine **unbekannte** Id (aus einem
 * neueren Build, siehe `ch-store.repairHeaven`) hat Max-Level 0 und ist damit von
 * Natur aus wirkungslos, statt irgendwo als Zahl durchzuschlagen.
 */
export function treeLevel(heaven: HeavenState, id: string): number {
  const v = heaven.tree[id];
  if (!(typeof v === 'number' && Number.isFinite(v) && v > 0)) return 0;
  return Math.min(Math.floor(v), treeNodeMaxLevel(id));
}

/** HPF cost to buy the next level of `id`, or null when already maxed. */
export function treeNodeCost(id: string, level: number): number | null {
  const cfg = NODE_BY_ID[id];
  if (!cfg || level >= cfg.costs.length) return null;
  return cfg.costs[level];
}

/**
 * Der Exklusiv-Partner, der diesen Knoten SPERRT — oder null. Ein Exklusiv-Paar
 * ist die Build-Entscheidung eines Astes: sobald einer der beiden Knoten gekauft
 * ist, bleibt der andere für immer verschlossen (bis zu einem `respecTree`).
 */
export function treeNodeBlockedBy(heaven: HeavenState, id: string): string | null {
  const other = NODE_BY_ID[id]?.exclusiveWith;
  return other && treeLevel(heaven, other) > 0 ? other : null;
}

/** Whether the next level of a tree node can be bought (HPF available, not maxed, not blocked). */
export function canBuyTreeNode(heaven: HeavenState, id: string): boolean {
  if (treeNodeBlockedBy(heaven, id) !== null) return false;
  const cost = treeNodeCost(id, treeLevel(heaven, id));
  return cost !== null && heaven.hpf >= cost;
}

export interface BuyTreeResult {
  heaven: HeavenState;
  bought: boolean;
}

/** Buy one level of a Himmelsbaum node, spending held HPF. No-op when it can't. */
export function buyTreeNode(heaven: HeavenState, id: string): BuyTreeResult {
  if (!canBuyTreeNode(heaven, id)) return { heaven, bought: false };
  const level = treeLevel(heaven, id);
  const cost = treeNodeCost(id, level)!;
  return {
    heaven: { ...heaven, hpf: heaven.hpf - cost, tree: { ...heaven.tree, [id]: level + 1 } },
    bought: true,
  };
}

/**
 * Die günstigste JETZT kaufbare Stufe unter `ids` (Exklusiv-Sperren beachtet), oder
 * `null`. Gleichstand entscheidet die REIHENFOLGE von `ids` — der Aufrufer legt
 * damit deterministisch fest, welche Seite eines gleich teuren Exklusiv-Paares er
 * bevorzugt (die Sim nutzt genau das, siehe `sim.SIM_TREE_PRIORITY`). Pur, kein
 * Zufall: derselbe Zustand ergibt immer dieselbe Empfehlung.
 */
export function cheapestTreeBuy(heaven: HeavenState, ids: readonly string[]): string | null {
  let best: string | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    if (!canBuyTreeNode(heaven, id)) continue;
    const cost = treeNodeCost(id, treeLevel(heaven, id));
    if (cost === null) continue;
    if (cost < bestCost) {
      best = id;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Greedy so lange die günstigste kaufbare Stufe aus `ids` kaufen, bis nichts mehr
 * bezahlbar ist. Pur + deterministisch (die Reihenfolge von `ids` bricht
 * Preis-Gleichstände, siehe `cheapestTreeBuy`) — der Bot benutzt genau das als
 * Himmelsbaum-Strategie, und dieselbe Funktion ist damit auch testbar, ohne einen
 * ganzen Sim-Lauf fahren zu müssen. Beschränkt sich selbst über die endlichen
 * Kosten-Listen; der Zähler ist nur ein Gürtel zum Hosenträger.
 */
export function greedyTreeSpend(heaven: HeavenState, ids: readonly string[]): HeavenState {
  let out = heaven;
  let guard = 64;
  for (;;) {
    if (guard-- <= 0) break;
    const id = cheapestTreeBuy(out, ids);
    if (id === null) break;
    const r = buyTreeNode(out, id);
    if (!r.bought) break;
    out = r.heaven;
  }
  return out;
}

// ---- Respec (die Exklusiv-Wahl umkehrbar machen, ROADMAP-V2 P4) ----

/** Gebühr eines Respecs in HPF — der Preis dafür, dass die Wahl umkehrbar ist. */
export const RESPEC_FEE = 1;

/**
 * Was ein Respec erstatten würde: die Summe ALLER bezahlten Stufen (`costs[0..lvl-1]`)
 * über alle bekannten Knoten. Unbekannte Ids zählen bewusst nicht mit — für sie ist
 * kein Preis bekannt, also kann für sie auch nichts erstattet werden.
 */
export function treeRefund(heaven: HeavenState): number {
  let sum = 0;
  for (const cfg of TREE_NODES) {
    const lvl = treeLevel(heaven, cfg.id);
    for (let i = 0; i < lvl; i++) sum += cfg.costs[i];
  }
  return sum;
}

/**
 * Kann JETZT respect werden? Es muss (a) überhaupt etwas gekauft sein und (b) der
 * Bestand NACH der Erstattung die Gebühr tragen (`hpf + refund ≥ RESPEC_FEE`) —
 * der geforderte Mindestbestand. Weil der billigste Knoten 5 HPF kostet, ist (b)
 * bei sauberen Saves immer erfüllt; die Prüfung fängt den kaputten Rand ab.
 */
export function canRespec(heaven: HeavenState): boolean {
  const refund = treeRefund(heaven);
  return refund > 0 && heaven.hpf + refund >= RESPEC_FEE;
}

export interface RespecResult {
  heaven: HeavenState;
  /** Erstattete HPF (0 wenn nicht respect wurde). */
  refunded: number;
  /** Tatsächlich einbehaltene Gebühr (0 wenn nicht respect wurde). */
  fee: number;
  done: boolean;
}

/**
 * **Baum zurücksetzen.** Erstattet alle ausgegebenen HPF, behält `RESPEC_FEE` ein und
 * leert den Baum — damit ist die Exklusiv-Wahl umkehrbar, aber nicht gratis.
 *
 * Bewusst OHNE neues Save-Feld: `tree` leeren + `hpf` erhöhen ist der ganze Vorgang,
 * `hpfLifetime` bleibt unangetastet (die Lebenszeit-Zahl ist ein Highwater, kein
 * Konto). Der `Math.min(hpfLifetime, …)`-Deckel hält die Kern-Invariante
 * „gehalten ≤ jemals verdient" auch dann, wenn ein hand-editierter Save mehr Stufen
 * behauptet, als je bezahlt wurden. UNBEKANNTE Baum-Ids (aus einem neueren Build)
 * werden hier mit weggeräumt — sie sind ohnehin wirkungslos (`treeLevel` deckelt sie
 * auf 0) und ein Respec ist die eine Stelle, an der der Spieler bewusst „alles auf
 * Anfang" sagt.
 */
export function respecTree(heaven: HeavenState): RespecResult {
  if (!canRespec(heaven)) return { heaven, refunded: 0, fee: 0, done: false };
  const refunded = treeRefund(heaven);
  const hpf = Math.min(heaven.hpfLifetime, heaven.hpf + refunded - RESPEC_FEE);
  return {
    heaven: { ...heaven, hpf: Math.max(0, hpf), tree: {} },
    refunded,
    fee: RESPEC_FEE,
    done: true,
  };
}

// ---- Tree effects (folded into the loop) ----

/** Twerk-Coach clicks per second (0…4). */
export function coachCps(heaven: HeavenState): number {
  return treeLevel(heaven, 'coach');
}

/** Damage a coach deals per second: `cps · 25 % · clickDamage` (no crit/beat). */
export function coachDps(clickDmg: number, cps: number): number {
  return Math.max(0, cps) * COACH_CLICK_SHARE * Math.max(0, clickDmg);
}

/** Offline cap in seconds: 8 h + 8 h per Nachtschicht level (→ 16 h, 24 h). */
export function offlineCapS(heaven: HeavenState): number {
  return (8 + treeLevel(heaven, 'nachtschicht') * 8) * 3600;
}

/** Fraction of previous crew levels restored after an ascension (Frühstarter). */
export function fruhstarterFraction(heaven: HeavenState): number {
  return treeLevel(heaven, 'fruhstarter') > 0 ? 0.1 : 0;
}

/** Extra Ekstase duration in ms: +3 s per Ekstase-Ausdauer level. */
export function ekstaseBonusMs(heaven: HeavenState): number {
  return treeLevel(heaven, 'ekstaseausdauer') * 3000;
}

/**
 * Additive key-drop bonus fraction from the Truhen-Magnet node (spec §4.5.2/§6.1):
 * a single-level node worth +25 % key drops (0 when unbought). Fed into the loot
 * glue's `keyDropMult` so boss/peach/quest key drops scale up.
 */
export function truhenMagnetBonus(heaven: HeavenState): number {
  return treeLevel(heaven, 'truhenmagnet') > 0 ? TRUHEN_MAGNET_KEYDROP : 0;
}

// ---- P4-Knoten (jeder hängt in einem echten Rechenpfad) ----

/** 💰 „Goldene Hände": BP-Faktor `1 + 10 %·Stufe` (×1 ohne Knoten) — fließt in `goldMult`. */
export function goldeneHandeMult(heaven: HeavenState): number {
  return 1 + GOLDENE_HANDE_PER * treeLevel(heaven, 'goldenehande');
}

/** 💰 „Pfirsich-Reife": zusätzliche Boost-Dauer in ms (0 ohne Knoten). */
export function pfirsichReifeBonusMs(heaven: HeavenState): number {
  return treeLevel(heaven, 'pfirsichreife') > 0 ? PFIRSICH_REIFE_MS : 0;
}

/** 💰 EXKL „Truhen-Fokus": Faktor auf die Rivalen-Truhen-Chance (×1 ohne Knoten). */
export function truhenFokusChestMult(heaven: HeavenState): number {
  return treeLevel(heaven, 'truhenfokus') > 0 ? TRUHEN_FOKUS_MULT : 1;
}

/**
 * 💰 EXKL „Pfirsich-Fokus": Faktor auf die gewürfelte Pfirsich-PAUSE. +35 % Frequenz
 * ⇔ Pause ×1/1.35 — derselbe Zufallszug, nur früher fällig (gleiche Mechanik wie der
 * Mythos-Knoten „Pfirsich-Magnet", mit dem er sich multipliziert). ×1 ohne Knoten.
 */
export function pfirsichFokusGapMult(heaven: HeavenState): number {
  return treeLevel(heaven, 'pfirsichfokus') > 0 ? 1 / (1 + PFIRSICH_FOKUS_RATE) : 1;
}

/**
 * ⚔️ Crew-DPS-Faktor des Kampf-Astes: „Schwerer Bass" (+8 %/Stufe) MAL der
 * „Crew-Doktrin" (+25 %). Trifft NUR den Idle-Term (`dpsOf`) — die Klick-Seite hat
 * ihren eigenen Getter, sonst wäre P1 („aktiv bleibt König") verschoben.
 */
export function heavenDpsMult(heaven: HeavenState): number {
  const bass = 1 + SCHWERER_BASS_PER * treeLevel(heaven, 'schwererbass');
  return bass * (treeLevel(heaven, 'crewdoktrin') > 0 ? CREW_DOKTRIN_MULT : 1);
}

/** ⚔️ EXKL „Klick-Doktrin": Faktor auf den Klick-Schaden (×1 ohne Knoten). */
export function heavenClickMult(heaven: HeavenState): number {
  return treeLevel(heaven, 'klickdoktrin') > 0 ? KLICK_DOKTRIN_MULT : 1;
}

/** ⚔️ „Präzisions-Shake": Faktor auf den ganzen Krit-Multiplikator (×1 ohne Knoten). */
export function heavenCritMultFactor(heaven: HeavenState): number {
  return treeLevel(heaven, 'praezisionsshake') > 0 ? PRAEZISIONS_SHAKE_MULT : 1;
}

/** ⚔️ „Gate-Crasher": zusätzliche Sekunden auf der Boss-Uhr (0 ohne Knoten). */
export function gateCrasherTimerBonus(heaven: HeavenState): number {
  return treeLevel(heaven, 'gatecrasher') > 0 ? GATE_CRASHER_S : 0;
}

/** 🕺 „Beat-Gefühl": zusätzliche Millisekunden im On-Beat-Fenster (0 ohne Knoten). */
export function beatGefuhlWindowMs(heaven: HeavenState): number {
  return treeLevel(heaven, 'beatgefuhl') > 0 ? BEAT_GEFUHL_MS : 0;
}

/** 🕺 „Combo-Gedächtnis": Anteil, um den der Combo-Verfall langsamer läuft (0 ohne Knoten). */
export function comboGedachtnisReduction(heaven: HeavenState): number {
  return treeLevel(heaven, 'combogedachtnis') > 0 ? COMBO_GEDACHTNIS_RED : 0;
}

/** 🕺 EXKL „Ekstase-Doktrin": Klick-Multiplikator der Ekstase (×10, mit Knoten ×12). */
export function ekstaseDoktrinMult(heaven: HeavenState, base: number): number {
  return treeLevel(heaven, 'ekstasedoktrin') > 0 ? EKSTASE_DOKTRIN_MULT : base;
}

/**
 * 🕺 EXKL „Combo-Doktrin": der Combo-SCHRITT je Stack. Abgeleitet aus dem Ziel-Wert
 * am Cap (×1.3 statt ×1.2), damit Knoten und `COMBO_CAP` nie auseinanderdriften.
 * Ohne Knoten exakt `COMBO_STEP`.
 */
export function comboStepFor(heaven: HeavenState): number {
  return treeLevel(heaven, 'combodoktrin') > 0
    ? (COMBO_DOKTRIN_CAP_MULT - 1) / COMBO_CAP
    : COMBO_STEP;
}
