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
 *   · `mythos`        = spent-TE ledger (M15's Mythos-Skins / -content perk tree; the
 *                       catalog is intentionally empty here — this is only the slot).
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
 *     `rng`, and the legacy latches — plus the new Mythos-Skins content.
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
   * Spent-TE ledger: Mythos-Skins / -content levels keyed by id (absent = 0). The
   * perk catalog + buy functions are M15's job (§4.5.3); this is only the slot that
   * makes `teLifetime − te` (the amount spent) auditable, mirroring `heaven.tree`.
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
  if (!(hpfLifetime >= TRANSCEND_MIN_HPF_LIFETIME)) return 0;
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
