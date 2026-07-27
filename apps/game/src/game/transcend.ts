/**
 * Transzendenz — prestige layer 3 (pure scaffold, spec §4.5.3). Ships behind a
 * feature flag in M14 (`flags.ts`, `TRANSCEND_ENABLED === false`): the math lands
 * now so M15 can flip the flag and wire state/save/UI **without reworking any
 * formula**. Nothing here touches `ChState`, the DOM, RNG or I/O — it is a set of
 * pure functions over a tiny state slice, exactly mirroring `ascension.ts` (souls)
 * and `heaven.ts` (HPF).
 *
 * **The layer.** Once you have banked enough **Himmelspfirsiche over your lifetime**
 * you may *transcend a third time*, banking **Transzendente Essenz (TE)** and
 * resetting all of L1 **and** L2 for a permanent, compounding global boost. It is
 * the endless-game escape hatch of §4.5: „Wenn Schicht n stagniert, lockt n+1."
 *
 *   `TE_earned(HPF_life) = ⌊log10(HPF_life)⌋`,  gated at `HPF_life ≥ 100`.
 *
 * The 100-HPF gate is deliberately deep — reaching it needs ≥ 10 M lifetime RS (HPF
 * = ⌊√(RS/1000)⌋ ⇒ 100 HPF ⇔ 10 M RS), i.e. **several Himmelfahrten of depth, on the
 * order of days** (spec §4.8 pacing table). At the gate the earned total is already
 * `⌊log10(100)⌋ = 2` TE, so the *first* Transzendenz is a meaningful ×9 boot rather
 * than a trivial ×3 — and every further **order of magnitude** of lifetime HPF adds
 * exactly +1 TE (×3). The function never rewards a partial magnitude, so TE is a
 * slow, chunky, log-scaled currency by design (§11 open question #5: „bewusst dünn").
 *
 * **Held-vs-spent accounting (mirrors souls M10 / HPF).** Three numbers:
 *   · `teLifetime`    = total TE ever EARNED (monotonic highwater = `teForHpfLifetime`).
 *   · `te`            = spendable **held** balance = `teLifetime − Σ(spent on Mythos)`.
 *   · `mythos`        = spent-TE ledger (der **Mythos-Shop**, ROADMAP-V2 P2 — vier
 *                       einmalige Wahl-Knoten, Katalog `MYTHOS_NODES` unten).
 * A Transzendenz earns only the *new* TE beyond `teLifetime`; held TE and whatever
 * was spent on Mythos carry across every future reset (nothing above L2 resets them).
 *
 * **Global multiplier (`transcendGlobalMult`) and the P1 invariant.** Held TE grant
 * a single global power multiplier `×3^te` that the M15 glue folds into **both**
 * `clickDamageOf` AND `dpsOf` — the same scalar on each. Because it is one global
 * factor applied identically to click and idle, it scales the click:idle *ratio* by
 * 1 (leaves it unchanged): it can never let idle DPS out-grow active clicking. That
 * is the P1 („aktiv bleibt König") invariant the whole game is tuned around (§4.8,
 * E4), and it holds for Transzendenz *by construction* — a global multiplier is
 * P1-neutral. (Contrast: a click-only or DPS-only buff would move the ratio.)
 *
 * **Reset / preserve contract for M15** (spec §4.5 table, L3 row — documented here so
 * the wiring agent has the exact scope; this module does NOT touch real state):
 *   · RESETS (back to a fresh tour): gold, crew, zone/kills (L1 run); Ruhm-Seelen
 *     (`souls` + `rsLifetime`) and Twerk-Ahnen (`ancients`, all of L1); **and all of
 *     L2** — Himmelspfirsiche (`heaven.hpf`/`hpfLifetime`/`ascensions2`) and the
 *     Himmelsbaum (`heaven.tree`). Effectively `createHeaven()` + a fresh L1 run.
 *   · PRESERVES: the Transzendenz slice itself (`te`/`teLifetime`/`transcendences`/
 *     `mythos`) and every „nie"-reset meta that already survives a Himmelfahrt —
 *     Vergoldungen (`gilds`), Gear/skins (`gear`), loot (`chests`/`permTokens`/
 *     `peach`), retention (`meta`/`achievements`), lifetime `stats`/`totalClicks`,
 *     `rng`, and the legacy latches — inklusive der gekauften Mythos-Knoten.
 * M15 implements that as a `transcendState(state: ChState)` glue (mirror of
 * `himmelfahrtState`) calling `bankTranscendence` for the TE slice; the currency
 * math here stays untouched.
 */

/**
 * Lifetime Himmelspfirsiche required before a first Transzendenz (spec §4.5 gate,
 * „100 HPF lifetime"). Below this the earned TE total is 0 and `canTranscend` is
 * false, regardless of the raw log — the gate keeps the first Transzendenz a real
 * milestone (≈ 10 M lifetime RS, several Himmelfahrten deep).
 */
export const TRANSCEND_MIN_HPF_LIFETIME = 100;

/** Global power multiplier base per held TE: `×3` each (spec §4.5.3, „×3^TE"). */
export const TRANSCEND_GLOBAL_BASE = 3;

/** The serializable L3 state slice (M15 will add this to `ChState`). */
export interface TranscendState {
  /** Held (spendable) Transzendente Essenz. */
  te: number;
  /** Lifetime-earned TE (monotonic highwater = `teForHpfLifetime(HPF_life)`). */
  teLifetime: number;
  /** Number of Transzendenzen performed. */
  transcendences: number;
  /**
   * Spent-TE ledger: gekaufte **Mythos-Knoten** keyed by id (absent/0 = ungekauft,
   * ≥ 1 = gekauft). Der Katalog steht in `MYTHOS_NODES` (ROADMAP-V2 P2); die Map
   * macht `teLifetime − te` (das Ausgegebene) prüfbar, exakt wie `heaven.tree`.
   */
  mythos: Record<string, number>;
}

/** A fresh (never-transcended) L3 state. */
export function createTranscend(): TranscendState {
  return { te: 0, teLifetime: 0, transcendences: 0, mythos: {} };
}

/**
 * Lifetime TE earned for a given lifetime-HPF total: `⌊log10(HPF_life)⌋`, but 0
 * below the `TRANSCEND_MIN_HPF_LIFETIME` (100) gate. Monotone non-decreasing; steps
 * up by exactly 1 per order of magnitude of lifetime HPF (100 ⇒ 2, 1 000 ⇒ 3, …).
 * Non-finite / negative input ⇒ 0.
 */
export function teForHpfLifetime(hpfLifetime: number): number {
  if (!Number.isFinite(hpfLifetime) || hpfLifetime < TRANSCEND_MIN_HPF_LIFETIME) return 0;
  return Math.floor(Math.log10(hpfLifetime));
}

/**
 * Global damage multiplier from held TE: `3^te`, applied EQUALLY to click power and
 * idle DPS by the M15 glue (the P1-neutral global factor — see the module header).
 * Guards negative / non-finite `te` to ×1. Pass held `te` to mirror souls/HPF (so
 * spending TE on Mythos trades global power for content); M15 may instead pass
 * `teLifetime` if it wants the factor immune to spending.
 */
export function transcendGlobalMult(te: number): number {
  const t = Number.isFinite(te) ? Math.max(0, te) : 0;
  return Math.pow(TRANSCEND_GLOBAL_BASE, t);
}

/** TE spent so far on Mythos content: the earned highwater minus the held balance. */
export function teSpent(state: TranscendState): number {
  return Math.max(0, state.teLifetime - state.te);
}

// ---- Transzendenz (bank TE; the L1+L2 reset scope is handled by the M15 caller) ----

/**
 * TE you would GAIN by transcending now: the earned total for the lifetime-HPF total
 * minus what has **already been earned** (`teLifetime`). Spending TE on Mythos lowers
 * held `te` but never `teLifetime`, so it can never be farmed back by re-transcending.
 */
export function transcendGain(state: TranscendState, hpfLifetime: number): number {
  return Math.max(0, teForHpfLifetime(hpfLifetime) - state.teLifetime);
}

/**
 * Whether a Transzendenz would bank at least one TE (the 100-HPF-lifetime gate on the
 * first time, then any new order-of-magnitude record thereafter).
 */
export function canTranscend(state: TranscendState, hpfLifetime: number): boolean {
  return transcendGain(state, hpfLifetime) >= 1;
}

/**
 * Bank a Transzendenz's TE (held += gain, lifetime lifted to the earned highwater,
 * count++). Pure — the M15 caller performs the L1+L2 reset around it per the
 * reset/preserve contract in the module header. The `Math.max` guard means a
 * `teLifetime` already above the formula value never shrinks and never double-grants.
 */
export function bankTranscendence(state: TranscendState, hpfLifetime: number): TranscendState {
  const earned = teForHpfLifetime(hpfLifetime);
  const gain = Math.max(0, earned - state.teLifetime);
  return {
    ...state,
    te: state.te + gain,
    teLifetime: Math.max(state.teLifetime, earned),
    transcendences: state.transcendences + 1,
  };
}

// ---- Mythos-Shop (der TE-Sink, ROADMAP-V2 P2) --------------------------------
/**
 * **Warum der Shop so klein und so teuer ist.** TE ist die knappste Währung des
 * Spiels: `teForHpfLifetime` steht bei `⌊log10(HPF_life)⌋` und beginnt am 100-HPF-Gate
 * bei **2**; jede weitere Größenordnung Lebenszeit-HPF gibt genau +1. Der realistische
 * Lebensvorrat eines sehr tiefen Spielers liegt also bei **2–4 TE** (100 HPF ⇒ 2,
 * 1 000 ⇒ 3, 10 000 ⇒ 4), nicht bei Dutzenden. Und weil `transcendGlobalMult` auf dem
 * **gehaltenen** TE rechnet, kostet jeder Kauf zusätzlich ×3 globalen Schaden.
 *
 * Daraus folgt die Kostenkurve **1 / 1 / 2 / 2** (Board-Summe 6 TE):
 *   · Die erste Transzendenz (2 TE) finanziert GENAU eine Entscheidung — einen
 *     1-TE-Knoten behalten und mit ×3 weiterspielen, ODER auf ×9 sitzen bleiben,
 *     ODER beide billigen Knoten nehmen und den Boost ganz aufgeben.
 *   · Das volle Board (6 TE ⇔ 10⁶ Lebenszeit-HPF) ist **absichtlich unerreichbar**:
 *     P2 will „Transzendieren wird Entscheidung, nicht nur Zahl", also eine Auswahl,
 *     keine Checkliste. Eine 1/2/3/5-Kurve (11 TE ⇔ 10¹¹ HPF) wäre schlicht Deko.
 * Ein Respec existiert bewusst nicht: Käufe sind **permanent** und überleben jede
 * weitere Transzendenz (der `mythos`-Ledger wird von `transcendState` mitgenommen,
 * genau wie ausgegebene HPF im Himmelsbaum). Deshalb ist jeder Knoten einstufig —
 * eine Kaufkurve, die nie zurückgedreht werden kann, soll klein und lesbar sein.
 *
 * **Sim-Ehrlichkeit.** Alle Anker-Läufe fahren mit `te = 0` (kein Knoten gekauft),
 * jeder Effekt-Getter unten liefert dann seinen neutralen Wert (×1 / +0) — die
 * Effekte hängen in den ECHTEN Rechenpfaden (Boss-Schaden, Offline-Cap, Pfirsich-
 * Takt, Reset-Flow), driften der Telemetrie gegenüber aber nie, weil sie ohne Kauf
 * identisch verschwinden.
 */
export interface MythosNodeConfig {
  readonly id: string;
  readonly name: string;
  /** Kurzbeschreibung des Effekts (deutsche UI-Zeile). */
  readonly desc: string;
  /** Einmalige Kosten in gehaltenem TE. */
  readonly cost: number;
}

/** Wie viele Crew-Plätze „Frühstart" nach einem Reset anhebt (die ersten drei). */
export const MYTHOS_FRUHSTART_SLOTS = 3;
/** Auf welches Level „Frühstart" diese Plätze mindestens hebt. */
export const MYTHOS_FRUHSTART_LEVEL = 5;
/** Anteil Boss-Ausdauer, den „Boss-Brecher" wegnimmt (10 %). */
export const MYTHOS_BOSS_CUT = 0.1;
/** Zusätzliche Offline-Cap-Stunden von „Nachtschwärmer". */
export const MYTHOS_OFFLINE_CAP_H = 4;
/** Um wie viel häufiger „Pfirsich-Magnet" den Goldenen Pfirsich bringt (+20 %). */
export const MYTHOS_PEACH_RATE = 0.2;

/** Der Mythos-Katalog: vier einmalige Wahl-Knoten (§4.5.3 / ROADMAP-V2 P2). */
export const MYTHOS_NODES: readonly MythosNodeConfig[] = [
  {
    id: 'fruhstart',
    name: 'Frühstart 🚀',
    desc: `Nach jedem Reset starten die ersten ${MYTHOS_FRUHSTART_SLOTS} Crew-Mitglieder auf Lv ${MYTHOS_FRUHSTART_LEVEL}`,
    cost: 1,
  },
  {
    id: 'pfirsichmagnet',
    name: 'Pfirsich-Magnet 🍑',
    desc: `Goldener Pfirsich erscheint ${Math.round(MYTHOS_PEACH_RATE * 100)} % öfter`,
    cost: 1,
  },
  {
    id: 'nachtschwarmer',
    name: 'Nachtschwärmer 🌙',
    desc: `Offline-Cap +${MYTHOS_OFFLINE_CAP_H} h (zusätzlich zur Nachtschicht)`,
    cost: 2,
  },
  {
    id: 'bossbrecher',
    name: 'Boss-Brecher 💥',
    desc: `Bosse verlieren ${Math.round(MYTHOS_BOSS_CUT * 100)} % ihrer effektiven Ausdauer`,
    cost: 2,
  },
];

const MYTHOS_BY_ID: Record<string, MythosNodeConfig> = Object.fromEntries(
  MYTHOS_NODES.map((n) => [n.id, n]),
);

/** Die Konfiguration eines Mythos-Knotens, oder `undefined`. */
export function mythosNodeConfig(id: string): MythosNodeConfig | undefined {
  return MYTHOS_BY_ID[id];
}

/**
 * Ist der Knoten gekauft? Robust gegen kaputte Ledger-Werte (nur eine endliche
 * Zahl ≥ 1 zählt als Kauf — `repairCountMap` lässt Nicht-Zahlen gar nicht erst
 * durch, aber dieser Getter ist die einzige Wahrheitsquelle für alle Effekte).
 */
export function mythosOwned(state: TranscendState, id: string): boolean {
  const v = state.mythos[id];
  return typeof v === 'number' && Number.isFinite(v) && v >= 1;
}

/** Kann der Knoten JETZT gekauft werden (existiert, ungekauft, genug gehaltenes TE)? */
export function canBuyMythos(state: TranscendState, id: string): boolean {
  const cfg = MYTHOS_BY_ID[id];
  return !!cfg && !mythosOwned(state, id) && state.te >= cfg.cost;
}

export interface BuyMythosResult {
  transcend: TranscendState;
  bought: boolean;
}

/**
 * Einen Mythos-Knoten kaufen: gehaltenes TE sinkt um die Kosten, der Ledger merkt
 * sich den Kauf. No-op, wenn er nicht bezahlbar/schon gekauft/unbekannt ist —
 * `teLifetime` bleibt IMMER unangetastet, damit `teSpent` konsistent bleibt und
 * die nächste Transzendenz nichts zurückerstattet.
 */
export function buyMythosNode(state: TranscendState, id: string): BuyMythosResult {
  if (!canBuyMythos(state, id)) return { transcend: state, bought: false };
  const cfg = MYTHOS_BY_ID[id]!;
  return {
    transcend: { ...state, te: state.te - cfg.cost, mythos: { ...state.mythos, [id]: 1 } },
    bought: true,
  };
}

/** Summe der Kosten aller gekauften Knoten (Anzeigewert; = `teSpent` bei sauberem Save). */
export function mythosSpent(state: TranscendState): number {
  let sum = 0;
  for (const cfg of MYTHOS_NODES) if (mythosOwned(state, cfg.id)) sum += cfg.cost;
  return sum;
}

// ---- Knoten-Effekte (in den echten Rechenpfaden verdrahtet) ----

/**
 * „Frühstart": jedes der ersten `MYTHOS_FRUHSTART_SLOTS` Crew-Mitglieder (in
 * Katalog-Reihenfolge) startet nach einem Reset auf mindestens Lv
 * `MYTHOS_FRUHSTART_LEVEL`. Pur über die übergebene Id-Reihenfolge, damit die
 * Crew-Daten nicht in diese Schicht lecken. Ohne Knoten identisch zur Eingabe
 * (gleiche Referenz), bestehende höhere Level werden NIE gesenkt.
 */
export function fruhstartCrew(
  crew: Record<string, number>,
  crewIds: readonly string[],
  state: TranscendState,
): Record<string, number> {
  if (!mythosOwned(state, 'fruhstart')) return crew;
  const out = { ...crew };
  for (const id of crewIds.slice(0, MYTHOS_FRUHSTART_SLOTS)) {
    out[id] = Math.max(out[id] ?? 0, MYTHOS_FRUHSTART_LEVEL);
  }
  return out;
}

/**
 * „Boss-Brecher": −10 % Boss-Ausdauer, umgesetzt als Schadens-Multiplikator
 * `1/(1 − 0.1)` im Boss-Schadens-Stack. Wirkungsgleich zum HP-Abzug (der Boss
 * fällt bei exakt 90 % der Ausdauer), aber ohne `bossHp` anzufassen — die Kurve
 * bleibt damit für Sim, Advisor und HUD dieselbe Zahl, und der Knoten wird an
 * genau EINER Stelle multipliziert (Spielpfad) bzw. gespiegelt (P3-Telemetrie).
 * Ohne Knoten exakt 1.
 */
export function bossBreakerDmgMult(state: TranscendState): number {
  return mythosOwned(state, 'bossbrecher') ? 1 / (1 - MYTHOS_BOSS_CUT) : 1;
}

/** „Nachtschwärmer": zusätzliche Offline-Cap-Sekunden (0 ohne Knoten). */
export function mythosOfflineCapBonusS(state: TranscendState): number {
  return mythosOwned(state, 'nachtschwarmer') ? MYTHOS_OFFLINE_CAP_H * 3600 : 0;
}

/**
 * „Pfirsich-Magnet": Faktor auf die gewürfelte Pfirsich-PAUSE. +20 % Frequenz ⇔
 * Pause ×1/1.2, also derselbe Zufallszug, nur früher fällig. Ohne Knoten exakt 1.
 */
export function mythosPeachGapMult(state: TranscendState): number {
  return mythosOwned(state, 'pfirsichmagnet') ? 1 / (1 + MYTHOS_PEACH_RATE) : 1;
}
