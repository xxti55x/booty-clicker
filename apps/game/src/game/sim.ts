/**
 * `simulateEndless` — a deterministic balancing bot over the REAL game modules
 * (combat / heroes / ascension / click / gild / ancients / heaven / gear / chests /
 * peach), the CI gate that replaces the old `simulatePlaythrough`. **M14 Vollausbau**
 * (§9.5): the bot now folds the crew/gild/soul/ancient/heaven/gear/loot terms; see
 * exclusions below. The asserted pacing (§4.8) and endless criteria (E1–E4) reflect
 * the real endgame economy.
 *
 * The bot plays in 1-second steps: it clicks at a fixed `clickRate` with the §4.8
 * juice assumptions (sustained combo ×2 + crit EV ×1.8 when `juice`), lets idle crew
 * DPS tick in parallel (never juiced — P1), buys crew ROI-greedy (milestone jumps
 * fall out of the marginal-DPS ranking), whittles bosses over their timer (a timeout
 * drops it to farming the zone's rivals, never a soft-lock), gilds each fresh 10-zone,
 * and ascends between fixed runs. On top of that it now runs the **loot economy**
 * (M12, §6): every boss kill drops a 🔑 + a tier-scaled Truhe, rivals rain the odd
 * Holztruhe, the Goldener Pfirsich returns as a periodic ×3-income event (+🔑 chance),
 * and the bot opens chests greedily — banking permanent tokens (§6.2 crit/gold/DPS %),
 * 🧩-shards (→ gear levels, §5) and BP lumps back into power. Everything is pure and
 * seeded, so the assertions are reproducible; kept fast (bounded runs, integer-second
 * steps, capped loot loops) to stay a CI gate.
 *
 * **Deliberate exclusions (no meaningful run-power impact, so left out of the model,
 * per §9.5 "alle Systeme im Bot" read as *all power-affecting* systems):**
 *  · 🍬 Zuckerpfirsiche → gear *stars* (§5.4): reify ~1×/24 h real-time — on the
 *    scale of a sim run their power contribution is negligible, so chest `sugar`
 *    rewards are counted as caught but never converted to star power.
 *  · Jackpot Truhen-Skins (§6.3.2), Saison-Banner (§7.5), Achievements-Anzeige &
 *    Leaderboard (§7.3/§7.4): purely cosmetic / display / server-side — zero DPS,
 *    click, gold or gate effect — so they are excluded on purpose.
 *  · Daily-Login / Quest faucets (§7.1/§7.2): they *do* drip 🔑/🧩, but only on a
 *    real-time daily cadence (≤ a handful per in-game day) — dwarfed by the per-boss
 *    faucet the bot already models, so they are omitted rather than approximated.
 *  · **The heaven layer (L2)** is inert in most drivers (`sim.heaven` stays at hpf 0,
 *    so `heavenGlobalMult`/`soulBonusEff`/`truhenMagnetBonus`/the Twerk-Coach idle tick
 *    all fold as ×1) — EXCEPT the E2 soft-wall driver (`simulateContinuous` with
 *    `fullPrestige`, M15), which greedily buys Twerk-Ahnen AND performs real
 *    Ruhmes-Himmelfahrten (`bankHimmelfahrt`) to lift the M9 wall, exercising the full
 *    v2 prestige stack. The Transzendenz layer (L3, §4.5.3) stays at te = 0 in every
 *    driver — its ×3^TE global mult is P1-neutral and never gated, so folding it would
 *    only scale both bots equally; no sim drives a Transzendenz.
 *    Likewise Twerk-Ekstase (§4.3), the boss-damage mults, the Chronilla timer and
 *    `travelTo` re-farming of cleared zones are not modeled. Every one of these can
 *    only ADD power / speed the bot, so leaving them out keeps E1–E4 honest *lower*
 *    bounds (the real game is at least this fast), never optimistic ones.
 *  · **v11 crew specials** (even ability tiers): the `gold` specials fold into
 *    `goldMultiplierNow` and the `crit`/`critdmg` specials into `critFactor` — real
 *    economy/EV effects the bot earns exactly as the game grants them. The
 *    `boss`/`combo`/`beat`/`ekstase` specials are utility the bot does NOT model
 *    (same lower-bound rationale as the boss-damage mults above); it still BUYS
 *    them, bundle-valued as gates to the next power tier (see `buyCrewGreedy`).
 */
import { applyAscension, soulMult, soulsForMaxZone } from './ascension';
import {
  ANCIENTS,
  type AncientLevels,
  ancientChestLuckBonus,
  ancientClickMult,
  ancientDpsMult,
  ancientGoldMult,
  buyAncient,
  canBuyAncient,
} from './ancients';
import {
  type ChestTier,
  type PermTokens,
  type PityState,
  type Reward,
  KEY_COST,
  addToken,
  chestTierForBoss,
  createPermTokens,
  createPity,
  openChest,
  permTokenCritChance,
  permTokenCritMult,
  permTokenDpsMult,
  permTokenGoldMult,
} from './chests';
import { keyDropAmount, rivalChestChance } from './ch-state';
import { CRIT_CHANCE, CRIT_CHANCE_CAP, CRIT_MULT, COMBO_CAP, comboMult } from './click';
import {
  type GimmickRuntime,
  applyWaveHeal,
  createGimmickRuntime,
  gimmickBossDamage,
  gimmickForZone,
  tickGimmick,
  waveHealAmount,
} from './boss-gimmicks';
import {
  type CombatState,
  MONSTERS_PER_ZONE,
  bossHp,
  challengeBoss,
  goldFor,
  hit,
  hpFraction,
  monsterHp,
  spawnFor,
  tickBoss,
  travelTo,
} from './combat';
import { MAX_SKIN_LEVEL, shardCost } from './gear';
import { GOBLIN_CHESTS, GOBLIN_SIM_CATCH, rollNextGoblinAt } from './goblin';
import {
  REMIX_OFF,
  type StageModFactors,
  factorsForZone,
  remixSeedFor,
  stageDamageFactor,
} from './stage-mods';
import { awardGildOnZone, type Gilds, isGildZone } from './gild';
import {
  type HeavenState,
  bankHimmelfahrt,
  canHimmelfahrt,
  createHeaven,
  heavenGlobalMult,
  hpfForRsLifetime,
  soulBonusEff,
  truhenMagnetBonus,
} from './heaven';
import { bestCrewBuy, clickDamageRaw, crewSpecialBonuses, totalRawDps } from './heroes';
import {
  activateBoost,
  clampBoostUntil,
  incomeMultiplier,
  peachKeyRoll,
  rollNextPeachAt,
} from './peach';
import { Rng } from '../util/rng';

/** A bot configuration. */
export interface SimConfig {
  /** Clicks per second the bot sustains. */
  clickRate: number;
  /** Whether the bot uses juice (sustained combo ×2 + crit EV ×1.8, §4.8). */
  juice: boolean;
  /** RNG seed (deterministic gild targets, chest loot, peach schedule). */
  seed?: number;
  /**
   * Whether the **loot economy** (M12, §6: Golden-Peach ×3 income, boss/rival Truhen,
   * 🔑, permanent tokens, 🧩-shards → gear) is modeled. **Defaults to `true`** — every
   * sim runs the full economy. Set `false` ONLY to reproduce the §4.8 pacing-table
   * *calibration conditions*, whose measurements are documented as excluding the
   * loot economy ("Annahmen: 3 Klicks/s, Combo ×2, Krit-EV ×1,8, ROI-greedy" — the
   * Golden Pfirsich and Truhen are a deliberate additional accelerant on top, so the
   * §4.8 table is the conservative no-loot baseline the loot-off bot validates against;
   * the full economy is exercised by E1–E4 and the dedicated economy test).
   */
  economy?: boolean;
  /**
   * Best-in-slot IDLE gear multiplier on crew DPS only (§5, M11-AC5): a max
   * `dpsPct` skin (Robo-Twerk lv 50 + Space kulisse ⇒ ×4.05) folded into the idle
   * term ALONE, never into the click term. Defaults to 1 (no gear). When supplied it
   * represents the fully-leveled skin, so the shard-driven leveling (§5.4) is
   * subsumed into it and NOT double-counted on top (see `shardIdleMultFor`).
   */
  idleGearMult?: number;
  /**
   * Best-in-slot CLICK gear multiplier on click damage only (§5): a max `clickPct`
   * skin (Klassiker lv 50 + 5★ ⇒ ×5.5) folded into the click term ALONE. The
   * active twerker's counterpart to `idleGearMult`; defaults to 1 (no gear).
   * P1 (§5.1): the catalog keeps this the strongest gear multiplier — asserted in
   * `sim.test.ts` by deriving both values from the live `SKINS` data.
   */
  clickGearMult?: number;
  /**
   * Whether the **Bühnen-Modifikatoren** (ROADMAP-V2 A1) are modeled. **Defaults to
   * `true`** — every anchor plays the same stage map a real save would roll. Set
   * `false` to run the pre-A1 baseline; that is the A/B knob the calibration used
   * (and the dedicated A1 test still uses) to prove the catalog stays net-neutral
   * over a run instead of quietly moving the walls.
   */
  stageMods?: boolean;
}

// ---------------------------------------------------------------------------
// Loot-economy balancing (named constants, spec §5/§6) — data, not logic
// ---------------------------------------------------------------------------

/**
 * Crew-DPS bonus per shard-bought skin level fed into the idle term (§5.3): the
 * Robo-Twerk 3000's +8 %/level Crew-DPS, the strongest *idle* skin buff — the honest
 * ceiling for what accumulated 🧩 can be worth to power. Level cost follows the real
 * `shardCost` curve (§5.4), which self-limits (×1.25/level) so this never runs away.
 */
const SHARD_SKIN_PER_LEVEL = 0.08;

/**
 * Chests opened per second cap — a realistic opening cadence that also bounds the
 * loot loop's cost during a deep frontier burst (which can drop thousands of chests
 * in one modeled second). Excess stays in the inventory backlog (as a real player's
 * would); it is never lost, just deferred.
 */
const MAX_OPENS_PER_STEP = 64;

/**
 * EMA smoothing weight for the "current income/sec" fed to chest BP rewards (§6.2:
 * a Goldtruhe BP row is worth *15 min of current income*). Smoothing the per-second
 * gold damps a single burst-second (a fresh crew tier clearing many zones at once)
 * from inflating a BP lump to an unrealistic value — the reward tracks steady-state
 * income, as the in-game HUD figure it reads from does.
 */
const INCOME_EMA_ALPHA = 0.25;

/** The float-ceiling the guard holds every tracked magnitude under (§9.3). */
export const FLOAT_CEIL = 1e300;

/** Whether the loot economy is modeled for this config (default on). */
function econOn(config: SimConfig): boolean {
  return config.economy !== false;
}

/** Whether the A1 stage modifiers are modeled for this config (default on). */
function modsOn(config: SimConfig): boolean {
  return config.stageMods !== false;
}

/** The mutable bot state that persists across ascensions within a chain. */
interface Sim {
  gold: number;
  crew: Record<string, number>;
  /** Bought crew abilities (v10 — paid milestone tiers, reset with `crew`). */
  crewUp: Record<string, number>;
  gilds: Gilds;
  souls: number;
  lifetimeMaxZone: number;
  /** Lifetime-earned RS highwater (held-balance model, §ascension). */
  rsLifetime: number;
  /** Bought Twerk-Ahnen (the M10 soul sink). */
  ancients: AncientLevels;
  /** Prestige layer 2 (HPF + Himmelsbaum). */
  heaven: HeavenState;
  // ---- Loot economy (M12, §6) — meta: survives ascension AND Himmelfahrt ----
  /** Held 🔑 (spent opening chests). */
  keys: number;
  /** Unopened chests per tier (the loot backlog). */
  chestInv: Record<ChestTier, number>;
  /** Held permanent tokens — the endless crit/gold/DPS % pool (§6.2). */
  permTokens: PermTokens;
  /** Per-tier pity counters (§6.3.1). */
  pity: PityState;
  /** 🧩-shards banked from chests → skin levels → gear power (§5.4). */
  shards: number;
  /** Epoch-ms until which the Golden-Peach ×3 income boost runs (§6.1). */
  boostUntilMs: number;
  /** Boss-Bühne eines gescheiterten Gates (0 = keins): der Bot nutzt dort den
   * „Boss herausfordern"-Button statt die Rivalen-Welle neu zu clearen. */
  retryBossZone: number;
  /** A2: Laufzeit-Zustand des AKTUELLEN Boss-Kampfes (Spotlight-Phasen, Wellen-Timer). */
  gimmick: GimmickRuntime;
  /** Boss-Bühne, zu der `gimmick` gehört (0 = gerade kein Boss) — erkennt den Kampf-Wechsel. */
  gimmickZone: number;
  /** Epoch-ms the next Golden-Peach spawns (0 = unseeded). */
  nextPeachAtMs: number;
  /** A3: Epoch-ms the next Truhen-Kobold hops across the stage (0 = unseeded). */
  nextGoblinAtMs: number;
  /**
   * A3: EIGENER seeded Strom für den Kobold-Faucet. Im Spiel zieht der Kobold aus
   * demselben persistierten `rng` wie alles andere; im Bot bekommt er bewusst einen
   * abgeleiteten Nebenstrom, damit ein NEUES Event nicht rückwirkend jede
   * Truhen-/Krit-/Gild-Ziehung aller Anker-Seeds verschiebt. Dieselbe Verteilung,
   * dieselbe Kadenz — nur ohne die Alt-Anker mit reinem Strom-Versatz zu brechen.
   */
  goblinRng: Rng;
  /**
   * A1: Remix-Seed der Bühnen-Modifikatoren dieses Laufs. Der Bot spielt damit
   * DIESELBE Karte, die ein Spieler mit diesem Save-Seed sähe — die Anker messen
   * also die Regel, nicht ihre Abwesenheit.
   */
  remix: number;
  /** L1-Aszensionen dieses Laufs — treibt (nur) den Remix der Modifikator-Karte. */
  ascensions: number;
  /** Smoothed gold/sec (EMA) feeding chest BP rewards (§6.2). */
  incomePerSec: number;
  // ---- Economy tallies (diagnostics for the "all systems in the bot" test) ----
  /** 🔑 earned lifetime (boss + peach + chest rewards). */
  keysEarned: number;
  /** Chests opened lifetime. */
  chestsOpened: number;
  /** Golden-Peaches caught lifetime. */
  peachesCaught: number;
  /** A3: Truhen-Kobolde gefangen (lifetime). */
  goblinsCaught: number;
  rng: Rng;
}

/** A snapshot of the banked loot economy — proves every faucet actually fires. */
export interface EconSummary {
  /** 🔑 earned (boss kills + peach + chest keys). */
  keysEarned: number;
  /** Chests opened. */
  chestsOpened: number;
  /** Golden-Peaches caught. */
  peachesCaught: number;
  /** Truhen-Kobolde caught (A3 faucet — each pays a Holztruhe). */
  goblinsCaught: number;
  /** Permanent tokens banked (Σ over the crit/gold/DPS pool, §6.2). */
  tokensBanked: number;
  /** 🧩-shards banked → gear levels (§5.4). */
  shards: number;
  /** Shard-bought skin level driving the idle-gear multiplier. */
  gearLevel: number;
}

/** Read the current loot-economy tallies off the sim. */
function econSummary(sim: Sim): EconSummary {
  let tokensBanked = 0;
  for (const v of Object.values(sim.permTokens)) if (v > 0) tokensBanked += Math.floor(v);
  return {
    keysEarned: sim.keysEarned,
    chestsOpened: sim.chestsOpened,
    peachesCaught: sim.peachesCaught,
    goblinsCaught: sim.goblinsCaught,
    tokensBanked,
    shards: sim.shards,
    gearLevel: shardSkinLevel(sim.shards),
  };
}

function newSim(seed: number, mods = true): Sim {
  return {
    gold: 0,
    crew: {},
    crewUp: {},
    gilds: {},
    souls: 0,
    lifetimeMaxZone: 1,
    rsLifetime: 0,
    ancients: {},
    heaven: createHeaven(),
    keys: 0,
    chestInv: { wood: 0, gold: 0, diamond: 0, mythic: 0 },
    permTokens: createPermTokens(),
    pity: createPity(),
    shards: 0,
    boostUntilMs: 0,
    retryBossZone: 0,
    gimmick: createGimmickRuntime(),
    gimmickZone: 0,
    nextPeachAtMs: 0,
    nextGoblinAtMs: 0,
    goblinRng: new Rng({ seed: (seed ^ 0x4b0b1e5d) | 0, cursor: 0 }),
    remix: mods ? remixSeedFor(seed, 0) : REMIX_OFF,
    ascensions: 0,
    incomePerSec: 0,
    keysEarned: 0,
    chestsOpened: 0,
    peachesCaught: 0,
    goblinsCaught: 0,
    rng: new Rng({ seed, cursor: 0 }),
  };
}

/**
 * A1: Eine Aszension VERWÜRFELT die Modifikator-Karte (`remixSeedFor`). Der Bot
 * zieht damit über eine Aszensions-Kette hinweg viele verschiedene Karten — die
 * Anker messen also den DURCHSCHNITT des Katalogs, nicht einen Glücksgriff.
 * Jeder Ascend-Pfad ruft das genau einmal, direkt bevor der neue Lauf spawnt.
 */
function remixOnAscend(sim: Sim): void {
  if (sim.remix === REMIX_OFF) return; // A/B-Lauf ohne Modifikatoren
  sim.ascensions += 1;
  sim.remix = remixSeedFor(sim.rng.seed, sim.ascensions);
}

/** The sustained combo multiplier for a config (×2 at cap when juiced, §4.8). */
function comboFactor(config: SimConfig): number {
  return config.juice ? comboMult(COMBO_CAP) : 1;
}

/**
 * The per-click crit-EV factor (§4.8 baseline ×1.8 = 20 %/×5), amplified by the
 * permanent crit tokens the bot has banked from chests (§6.2): held `critChance`
 * tokens raise the crit chance and `critDmg` tokens raise the crit multiplier, so a
 * fatter token pool lifts the EV exactly as the derived click pipeline does. Casual
 * (no-juice) configs assume no crit at all (crit = 1) — the §4.8 casual baseline.
 */
function critFactor(
  config: SimConfig,
  permTokens: PermTokens,
  crewUp: Record<string, number> = {},
  stageCrit = 0,
): number {
  if (!config.juice) return 1;
  const econ = econOn(config);
  // v11: the crew's `crit`/`critdmg` special ability tiers feed the same EV.
  const spec = crewSpecialBonuses(crewUp);
  // Crit chance is hard-capped at 40 % in the real click pipeline (`click.critChance`,
  // §4.2.1); mirror the cap here so a fat token pool can't lift the EV past the game.
  // `stageCrit` ist der A1-Modifikator „Krit-Funken" (+5 pp) der aktuellen Bühne —
  // er läuft durch DENSELBEN Deckel wie im Spiel.
  const chance = Math.min(
    CRIT_CHANCE_CAP,
    CRIT_CHANCE +
      spec.critChance +
      Math.max(0, stageCrit) +
      (econ ? permTokenCritChance(permTokens) : 0),
  );
  const mult = (CRIT_MULT + spec.critDmg) * (econ ? permTokenCritMult(permTokens) : 1);
  return 1 + chance * (mult - 1);
}

/** Skin levels affordable with `shards` (real `shardCost` curve, capped at lv 50). */
function shardSkinLevel(shards: number): number {
  let level = 0;
  let spent = 0;
  while (level < MAX_SKIN_LEVEL) {
    const cost = shardCost(level);
    if (spent + cost > shards) break;
    spent += cost;
    level++;
  }
  return level;
}

/** Idle-gear multiplier from banked 🧩 (§5.4): ×(1 + 8 %·shard-bought skin level). */
function shardGearIdleMult(shards: number): number {
  return 1 + SHARD_SKIN_PER_LEVEL * shardSkinLevel(shards);
}

/**
 * The idle-gear multiplier to fold this run. An explicit `idleGearMult` config (the
 * M11-AC5 best-in-slot measurement) already represents the fully-leveled skin, so the
 * shard-driven leveling is subsumed into it (returns 1 — never stacked on top).
 * Otherwise the run's banked shards drive the modeled skin level.
 */
function shardIdleMultFor(sim: Sim, config: SimConfig): number {
  if (!econOn(config) || config.idleGearMult != null) return 1;
  return shardGearIdleMult(sim.shards);
}

/** Die beiden Schadens-Quellen einer Sekunde, getrennt (A2 braucht den Split). */
interface DamageSplit {
  /** Aktiver Klick-Schaden dieser Sekunde (Rate × Klick × Combo × Krit-EV). */
  click: number;
  /** Passiver Crew-/Idle-Schaden dieser Sekunde (nie gejuiced, P1). */
  idle: number;
}

/**
 * Effective damage per second (= total power, click + idle at farm) for a given
 * crew/gilds/souls/ancients/heaven and the banked loot economy, **split into the
 * active and the passive term** (ROADMAP-V2 A2: die Boss-Gimmicks behandeln beide
 * unterschiedlich — Club pausiert nur den Idle-Anteil, Space hebt nur den
 * Klick-Anteil). Folds the held-soul mult (HPF-amplified), the Ancient click/DPS
 * mults, the +2 %/HPF global mult, the gear mults (§5 config + `shardIdle` from
 * banked 🧩) and the permanent crew-DPS token pool (§6.2) — the same derivation as
 * `ch-state.dpsOf`/`clickDamageOf`. Idle never draws juice (P1).
 */
function powerSplit(
  crew: Record<string, number>,
  crewUp: Record<string, number>,
  gilds: Gilds,
  souls: number,
  ancients: AncientLevels,
  heaven: HeavenState,
  config: SimConfig,
  combo: number,
  crit: number,
  permTokens: PermTokens,
  shardIdle: number,
): DamageSplit {
  const hpf = heaven.hpf;
  const sm = soulMult(souls, soulBonusEff(hpf));
  const global = heavenGlobalMult(hpf);
  // Click gear (§5) multiplies the click term only (P1: the strongest gear is click).
  const baseClick =
    clickDamageRaw(crew, gilds, crewUp) *
    sm *
    ancientClickMult(ancients) *
    global *
    (config.clickGearMult ?? 1);
  // Idle gear (§5) + the permanent DPS-token pool (§6.2) + the crew's
  // `idle`-special tiers (v11.1 Groove) multiply crew DPS only — never the
  // click term (P1, M11-AC5).
  const idle =
    totalRawDps(crew, gilds, crewUp) *
    sm *
    ancientDpsMult(ancients) *
    global *
    (config.idleGearMult ?? 1) *
    shardIdle *
    (econOn(config) ? permTokenDpsMult(permTokens) : 1) *
    crewSpecialBonuses(crewUp).idleMult;
  return { click: config.clickRate * baseClick * combo * crit, idle };
}

/** Total power (click + idle) — the ranking metric for `buyAncientsGreedy` + E3. */
function powerFor(
  crew: Record<string, number>,
  crewUp: Record<string, number>,
  gilds: Gilds,
  souls: number,
  ancients: AncientLevels,
  heaven: HeavenState,
  config: SimConfig,
  combo: number,
  crit: number,
  permTokens: PermTokens,
  shardIdle: number,
): number {
  const p = powerSplit(
    crew,
    crewUp,
    gilds,
    souls,
    ancients,
    heaven,
    config,
    combo,
    crit,
    permTokens,
    shardIdle,
  );
  return p.click + p.idle;
}

/** Effective damage the bot deals in one second at the current state (split, A2). */
function damageSplit(sim: Sim, config: SimConfig, combo: number, crit: number): DamageSplit {
  return powerSplit(
    sim.crew,
    sim.crewUp,
    sim.gilds,
    sim.souls,
    sim.ancients,
    sim.heaven,
    config,
    combo,
    crit,
    sim.permTokens,
    shardIdleMultFor(sim, config),
  );
}

/** Total effective damage per second (the E3 power metric). */
function damagePerSecond(sim: Sim, config: SimConfig, combo: number, crit: number): number {
  const p = damageSplit(sim, config, combo, crit);
  return p.click + p.idle;
}

// ---------------------------------------------------------------------------
// Loot economy (M12, §6) — peach schedule, chest awards, greedy opening
// ---------------------------------------------------------------------------

/**
 * Catch every Golden-Peach that has spawned by `nowMs` (the optimal bot never misses
 * one, §9.5): each catch (re)arms the ×3 income boost for 60 s (`activateBoost`,
 * duration extended if one is already active), rolls the 25 % → 1 🔑 drop, and
 * schedules the next spawn — all from the seeded `rng`, so the peach economy is
 * deterministic + save-scum-proof. Operates on the sim's integer-second clock
 * (`nowMs = t·1000`) via the real `peach` module.
 */
function tickPeach(sim: Sim, nowMs: number): void {
  if (sim.nextPeachAtMs <= 0) sim.nextPeachAtMs = rollNextPeachAt(nowMs, sim.rng);
  let guard = 64;
  while (nowMs >= sim.nextPeachAtMs && guard-- > 0) {
    const caughtAt = sim.nextPeachAtMs;
    const extended = Math.max(sim.boostUntilMs, activateBoost(caughtAt));
    sim.boostUntilMs = clampBoostUntil(extended, nowMs);
    const key = peachKeyRoll(sim.rng);
    sim.keys += key;
    sim.keysEarned += key;
    sim.peachesCaught += 1;
    sim.nextPeachAtMs = rollNextPeachAt(caughtAt, sim.rng);
  }
}

/**
 * **A3 Truhen-Kobold als kleiner Faucet.** Alle 4–7 min hoppelt einer über die
 * Bühne; der Bot fängt ihn mit `GOBLIN_SIM_CATCH` (80 %, dokumentierte Annahme in
 * `goblin.ts`) und bucht dann `GOBLIN_CHESTS` Holztruhe(n) in denselben
 * Truhen-Backlog, den `openChestsGreedy` leert.
 *
 * Der 10-s-Mini-Frenzy (×2 Klick) wird BEWUSST NICHT modelliert — dieselbe
 * Untergrenzen-Logik wie bei Twerk-Ekstase und den Boss-Schadens-Mults: er kann
 * den Bot nur schneller machen, sein Weglassen hält die Anker ehrlich niedrig.
 * (Größenordnung: ~10 s ×2 Klick alle ~5.5 min ⇒ ≈ +3 % Klick-Schaden im Mittel.)
 * Die Spawn-Sperren des Spiels (Hintergrund-Tab, Bosskampf, Bühnen-Wechsel)
 * stecken pauschal in der 80-%-Quote statt als eigene Zustandsmaschine.
 */
function tickGoblin(sim: Sim, nowMs: number): void {
  if (sim.nextGoblinAtMs <= 0) sim.nextGoblinAtMs = rollNextGoblinAt(nowMs, sim.goblinRng);
  let guard = 64;
  while (nowMs >= sim.nextGoblinAtMs && guard-- > 0) {
    const spawnedAt = sim.nextGoblinAtMs;
    if (sim.goblinRng.next() < GOBLIN_SIM_CATCH) {
      sim.chestInv.wood += GOBLIN_CHESTS;
      sim.goblinsCaught += 1;
    }
    sim.nextGoblinAtMs = rollNextGoblinAt(spawnedAt, sim.goblinRng);
  }
}

/**
 * Full BP (gold) multiplier this second: Peachiel × gold-tokens × live peach ×3 ×
 * the crew's `gold`-special ability tiers (v11 — part of the core crew layer, so
 * it folds even in the no-economy calibration configs, exactly as the game does).
 */
function goldMultiplierNow(sim: Sim, config: SimConfig, nowMs: number): number {
  const crewGold = crewSpecialBonuses(sim.crewUp).goldMult;
  if (!econOn(config)) return ancientGoldMult(sim.ancients) * crewGold;
  return (
    ancientGoldMult(sim.ancients) *
    permTokenGoldMult(sim.permTokens) *
    incomeMultiplier(sim.boostUntilMs, nowMs) *
    crewGold
  );
}

/** Fold one realized chest reward into the sim's banked economy (§6.2). */
function foldReward(sim: Sim, reward: Reward, nowMs: number): void {
  switch (reward.kind) {
    case 'bp':
      sim.gold += reward.bp;
      break;
    case 'shards':
      sim.shards += reward.shards;
      break;
    case 'keys':
      sim.keys += reward.keys;
      sim.keysEarned += reward.keys;
      break;
    case 'token':
      sim.permTokens = addToken(sim.permTokens, reward.token);
      break;
    case 'boost': {
      // Boost rewards stack DURATION onto the single ×3 income window (§6.2).
      const base = Math.max(sim.boostUntilMs, nowMs);
      sim.boostUntilMs = clampBoostUntil(base + reward.boost.durMs, nowMs);
      break;
    }
    // `sugar` (🍬 → gear stars, ~1×/24 h real-time) and `jackpot` (cosmetic
    // chest-skin) carry no meaningful run-power — caught but not converted (see the
    // module-header exclusions). No default action needed.
  }
}

/**
 * Open banked chests greedily (§6.4): repeatedly open the best tier the bot owns AND
 * can afford 🔑 for (mythic → wood; Holz costs 0 🔑 so it always drains), folding each
 * open's rewards back into the economy. Honours Luck (§6.3.4, Truhilda) and per-tier
 * Pity (§6.3.1). Bounded by `MAX_OPENS_PER_STEP` so a deep frontier burst can't stall
 * the step; the remainder stays as a backlog for later seconds.
 */
function openChestsGreedy(sim: Sim, incomePerSec: number, nowMs: number): void {
  const luck = ancientChestLuckBonus(sim.ancients); // Truhilda (0 unless bought)
  const order: readonly ChestTier[] = ['mythic', 'diamond', 'gold', 'wood'];
  let guard = MAX_OPENS_PER_STEP;
  for (;;) {
    if (guard-- <= 0) break;
    let tier: ChestTier | null = null;
    for (const t of order) {
      if (sim.chestInv[t] > 0 && sim.keys >= KEY_COST[t]) {
        tier = t;
        break;
      }
    }
    if (tier === null) break;
    sim.chestInv[tier] -= 1;
    sim.keys -= KEY_COST[tier];
    const res = openChest(
      tier,
      { incomePerSec: Math.max(0, incomePerSec), luck, pity: sim.pity },
      sim.rng,
    );
    sim.pity = res.pity;
    sim.chestsOpened += 1;
    for (const reward of res.rewards) foldReward(sim, reward, nowMs);
  }
}

/**
 * Apply one second of damage to the combat state, banking gold (×`goldMult`),
 * advancing zones, gilding fresh 10-zones, and dropping loot (§6.1): every boss kill
 * on the frontier yields a 🔑 (`keyMult`-scaled) + a tier-scaled Truhe, and a rival
 * advance onto a **new frontier zone** rolls the `luck`-scaled 3 % Holztruhe chance.
 * Loot is deliberately **frontier-gated** (~1 roll per new lifetime-deepest zone, not
 * one per rival kill) — see the drop block below for why the 1-second-step model makes
 * per-kill rolls unsound. Excess damage carries across targets (unlike the
 * in-game one-hit-per-frame model, which is fine at 60 fps but too coarse here). Boss
 * HP persists across seconds; the timer ticks once and a timeout drops to farming the
 * zone's rivals (never a soft-lock).
 *
 * **A2 Boss-Gimmicks**: gegen einen Boss zählt nicht der rohe Sekunden-Schaden,
 * sondern der vom Theme-Gimmick gefilterte Anteil (`gimmickBossDamage`) — als EIN
 * Faktor `k` über die Sekunde. Der Rest-Schaden nach einem Boss-Kill wird deshalb
 * zeit-proportional zurückgerechnet (`combat.hp / k` = der wirklich verbrauchte
 * Anteil der Sekunde), sodass der Übertrag auf die nächsten Rivalen ehrlich bleibt.
 * Die Wellen-Heilung (Beach) läuft als HP-Regen VOR dem Schaden.
 *
 * **A1 Bühnen-Modifikatoren**: gegen einen RIVALEN gilt analog `stageDamageFactor`
 * (Klick- und Crew-Anteil werden unterschiedlich skaliert — „Nebel" hebt den
 * einen und senkt den anderen), und sein BP-Ertrag trägt den `gold`-Faktor
 * derselben Bühne. Die Ausdauer-Seite (`hp`) rechnet `combat.spawnFor` über
 * `combat.remix` — eine Quelle für Spiel und Bot, hier ist nichts zu tun.
 */
function stepSecond(
  sim: Sim,
  combat: CombatState,
  dmg: DamageSplit & { combo: number },
  goldMult: number,
  luck: number,
  keyMult: number,
  dropLoot: boolean,
): CombatState {
  /**
   * Der Gimmick-Faktor des laufenden Boss-Kampfes: wirksamer ÷ roher Schaden.
   * Dreht zugleich den Kampf-Zustand weiter (Spotlight-Phasen, Wellen-Timer) und
   * heilt — deshalb genau EIN Aufruf je Boss und Sekunde.
   */
  const enterBoss = (c: CombatState): { combat: CombatState; k: number } => {
    if (c.zone !== sim.gimmickZone) {
      sim.gimmickZone = c.zone;
      sim.gimmick = createGimmickRuntime(); // neuer Kampf ⇒ frische Phasen/Wellen
    }
    const g = gimmickForZone(c.zone);
    const tick = tickGimmick(sim.gimmick, g, hpFraction(c), 1);
    sim.gimmick = tick.state;
    if (tick.heals > 0) {
      const hp = applyWaveHeal(c.hp, c.hpMax, waveHealAmount(c.hpMax, tick.heals));
      c = { ...c, hp };
    }
    const raw = dmg.click + dmg.idle;
    const eff = gimmickBossDamage(g, {
      click: dmg.click,
      idle: dmg.idle,
      spotlightShare: tick.spotlightShare,
      comboMult: dmg.combo,
    });
    return { combat: c, k: raw > 0 ? eff / raw : 1 };
  };

  if (!combat.boss) sim.gimmickZone = 0;
  let k = 1;
  if (combat.boss) {
    const entered = enterBoss(combat);
    combat = entered.combat;
    k = entered.k;
  }

  /** A1: Faktoren + Schadens-Verhältnis der Bühne, auf der gerade gekämpft wird. */
  const stageAt = (zone: number): { f: StageModFactors; factor: number } => {
    const f = factorsForZone(zone, combat.remix);
    return { f, factor: stageDamageFactor(f, dmg.click, dmg.idle) };
  };

  let remaining = dmg.click + dmg.idle;
  let guard = 50000; // bounds a runaway burst; ×1.6/zone means it always terminates
  while (remaining > 0 && guard-- > 0) {
    // Ein Boss, der MITTEN in dieser Sekunde spawnt (die Welle fiel gerade), ist
    // ein eigener Kampf mit eigenem Faktor — volle Ausdauer, keine Phase, keine Welle.
    if (combat.boss && combat.zone !== sim.gimmickZone) {
      const entered = enterBoss(combat);
      combat = entered.combat;
      k = entered.k;
    }
    const stage = combat.boss ? null : stageAt(combat.zone);
    const factor = combat.boss ? k : stage!.factor;
    if (factor <= 0) break; // Spotlight ohne Klick-Schaden: diese Sekunde kommt nichts an
    const eff = remaining * factor;
    if (eff >= combat.hp) {
      remaining -= combat.hp / factor;
      const wasBoss = combat.boss;
      const bossZone = combat.zone;
      const r = hit(combat, combat.hp);
      sim.gold += Math.floor(r.gold * goldMult * (stage?.f.gold ?? 1));
      combat = r.state;
      if (wasBoss && r.advancedZone) sim.retryBossZone = 0; // Gate besiegt
      let onFrontier = false;
      if (r.advancedZone && combat.zone > sim.lifetimeMaxZone) {
        const cleared = combat.zone - 1;
        if (isGildZone(cleared)) sim.gilds = awardGildOnZone(sim.gilds, cleared, false, sim.rng);
        sim.lifetimeMaxZone = combat.zone;
        onFrontier = true;
      }
      // Loot drops (§6.1): a boss guarantees a 🔑 + a tier-scaled Truhe; a rival has
      // the luck-scaled 3 % Holztruhe chance. Modeled only on **frontier progress**
      // (a new lifetime-deepest zone): the re-farming of already-cleared zones is a
      // minor secondary faucet whose inclusion, combined with the excess-damage burst
      // model, would drop thousands of chests in a single power-spike second and let
      // the BP (gold) rewards runaway through the exponential crew curve — an artifact
      // of the 1-second-step model, not the game. Frontier-gating keeps the faucet at
      // the game's honest ~1-chest-per-new-boss rate.
      if (dropLoot && onFrontier) {
        if (wasBoss) {
          const dropped = keyDropAmount(1, keyMult, sim.rng.next());
          sim.keys += dropped;
          sim.keysEarned += dropped;
          sim.chestInv[chestTierForBoss(bossZone)] += 1;
        } else if (sim.rng.next() < rivalChestChance(luck) * (stage?.f.chest ?? 1)) {
          // A1 „Zähe Menge": doppelte Truhen-Chance auf dieser Bühne.
          sim.chestInv.wood += 1;
        }
      }
    } else {
      combat = hit(combat, eff).state;
      remaining = 0;
    }
  }
  if (combat.boss) {
    const bossZone = combat.zone;
    const bt = tickBoss(combat, 1);
    if (bt.failed) sim.retryBossZone = bossZone; // Fallback auf die Vor-Bühne (Kern)
    combat = bt.state;
  }
  // Retry wie ein Spieler: nach einem Fail zurück an der Boss-Bühne angekommen,
  // den Boss per `challengeBoss` direkt herausfordern (Welle überspringen).
  if (sim.retryBossZone === combat.zone && !combat.boss) {
    combat = challengeBoss(combat);
    if (combat.boss) sim.retryBossZone = 0;
  }
  return combat;
}

/**
 * Spend gold ROI-greedy: repeatedly buy the best marginal-output-per-BP option
 * the current bank affords. The ranking itself (next LEVELS vs. unlocked-but-
 * unbought ABILITIES, with the v11 special tiers priced as the GATE to their
 * following power tier) lives as ONE pure function in `heroes.bestCrewBuy` —
 * the in-game Kauf-Tipp (ROADMAP-V2 P3, `game/advisor.ts`) reads the exact same
 * ranking, so bot and hint can never drift apart.
 */
function buyCrewGreedy(sim: Sim): void {
  let guard = 5000;
  for (;;) {
    if (guard-- <= 0) break;
    const buy = bestCrewBuy(sim.crew, sim.crewUp, sim.gilds, sim.gold);
    if (buy === null) break;
    sim.gold -= buy.cost;
    if (buy.kind === 'level') sim.crew[buy.id] = (sim.crew[buy.id] ?? 0) + 1;
    else sim.crewUp[buy.id] = (sim.crewUp[buy.id] ?? 0) + 1;
  }
}

/**
 * Run one modeled second of the full loop at global second `globalSec`: catch peaches,
 * fold the live gold multiplier, deal damage through the combat + loot layer, spend
 * gold ROI-greedy, and drain the chest backlog. Returns the new combat state. Shared
 * by every sim driver so they all reflect the same complete economy.
 */
function economyStep(
  sim: Sim,
  combat: CombatState,
  config: SimConfig,
  combo: number,
  globalSec: number,
): CombatState {
  const econ = econOn(config);
  const nowMs = globalSec * 1000;
  if (econ) {
    tickPeach(sim, nowMs);
    tickGoblin(sim, nowMs); // A3 — kleiner Truhen-Faucet (80 % Fangquote)
  }
  // A1: „Krit-Funken" der Bühne, auf der gerade gekämpft wird. Auf einer
  // Boss-Bühne (und für jeden no-juice-Anker) ist der Zusatz 0.
  const stageCrit = combat.boss ? 0 : factorsForZone(combat.zone, combat.remix).crit;
  const crit = critFactor(config, sim.permTokens, sim.crewUp, stageCrit);
  const dmg = damageSplit(sim, config, combo, crit);
  const goldMult = goldMultiplierNow(sim, config, nowMs);
  const luck = ancientChestLuckBonus(sim.ancients);
  const keyMult = 1 + truhenMagnetBonus(sim.heaven);
  const goldBefore = sim.gold;
  const next = stepSecond(sim, combat, { ...dmg, combo }, goldMult, luck, keyMult, econ);
  if (econ) {
    // Chest BP rewards read a steady income/sec (§6.2: "15 min of current income"),
    // so cap the per-second figure to one zone's rival gold — a single power-spike
    // second (a fresh crew tier clearing many zones at once) must not inflate the
    // steady rate the in-game HUD would show.
    const earned = Math.min(
      sim.gold - goldBefore,
      goldFor(next.maxZone, false) * MONSTERS_PER_ZONE,
    );
    sim.incomePerSec = INCOME_EMA_ALPHA * earned + (1 - INCOME_EMA_ALPHA) * sim.incomePerSec;
  }
  buyCrewGreedy(sim);
  if (econ) openChestsGreedy(sim, sim.incomePerSec, nowMs);
  return next;
}

/** The result of a single run (one ascension cycle). */
export interface RunResult {
  /** Deepest zone (frontier) reached this run. */
  bestZone: number;
  /** Second-of-run at which each frontier zone was first reached. */
  timeToZone: Map<number, number>;
  seconds: number;
  /** Snapshot of the (cumulative) loot economy after this run. */
  econ: EconSummary;
}

/**
 * Play one run from zone 1 for `seconds`, mutating `sim` (gold/crew/gilds/loot/
 * lifetimeMaxZone). `onFrontier(zone, globalSec)` fires the first time each new
 * frontier zone is reached (with the global clock offset by `tOffset`).
 */
function runOnce(
  sim: Sim,
  seconds: number,
  config: SimConfig,
  onFrontier?: (zone: number, globalSec: number) => void,
  tOffset = 0,
): RunResult {
  const combo = comboFactor(config);
  let combat = spawnFor(1, 0, 1, sim.remix);
  const timeToZone = new Map<number, number>([[1, 0]]);
  for (let t = 1; t <= seconds; t++) {
    const prevFrontier = combat.maxZone;
    combat = economyStep(sim, combat, config, combo, tOffset + t);
    if (combat.maxZone > prevFrontier) {
      for (let z = prevFrontier + 1; z <= combat.maxZone; z++) {
        if (!timeToZone.has(z)) timeToZone.set(z, t);
        onFrontier?.(z, tOffset + t);
      }
    }
  }
  return { bestZone: combat.maxZone, timeToZone, seconds, econ: econSummary(sim) };
}

/** One run's ascension summary within a chain. */
export interface RunSummary {
  run: number;
  bestZone: number;
  bankBefore: number;
  bank: number;
  gained: number;
}

/** The result of an ascension run-chain. */
export interface ChainResult {
  runs: RunSummary[];
  finalBank: number;
  maxBestZone: number;
  /** Global second at which each new lifetime-record zone was first reached. */
  timeToLifetime: Map<number, number>;
}

/**
 * Play `runs` fixed-length runs, ascending between each (crew/gold reset; souls,
 * gilds, the loot economy and the lifetime record carry over — all meta). Mirrors the
 * §4.8 "45-min run-chain" measurement. `timeToLifetime` records the global time to
 * each new best zone for the endless-wall criterion (E2) and the §4.8 Bühne-80 target.
 */
export function simulateRunChain(config: SimConfig, runs: number, runSeconds: number): ChainResult {
  const sim = newSim(config.seed ?? 1, modsOn(config));
  const summaries: RunSummary[] = [];
  const timeToLifetime = new Map<number, number>();
  let globalT = 0;
  let maxBestZone = 1;
  for (let r = 0; r < runs; r++) {
    sim.gold = 0;
    sim.crew = {};
    sim.crewUp = {};
    const res = runOnce(
      sim,
      runSeconds,
      config,
      (zone, globalSec) => {
        if (zone > maxBestZone && !timeToLifetime.has(zone)) timeToLifetime.set(zone, globalSec);
      },
      globalT,
    );
    globalT += runSeconds;
    maxBestZone = Math.max(maxBestZone, res.bestZone);
    const before = sim.souls;
    const asc = applyAscension(res.bestZone, sim.lifetimeMaxZone, sim.souls, sim.rsLifetime);
    sim.souls = asc.souls;
    sim.lifetimeMaxZone = asc.lifetimeMaxZone;
    sim.rsLifetime = asc.rsLifetime;
    remixOnAscend(sim); // A1: neue Aszension, neue Modifikator-Karte
    summaries.push({
      run: r + 1,
      bestZone: res.bestZone,
      bankBefore: before,
      bank: sim.souls,
      gained: sim.souls - before,
    });
  }
  return { runs: summaries, finalBank: sim.souls, maxBestZone, timeToLifetime };
}

/** Play a single fresh run (0 souls); the E4 active-vs-casual comparison unit. */
export function simulateSingleRun(config: SimConfig, seconds: number): RunResult {
  return runOnce(newSim(config.seed ?? 1, modsOn(config)), seconds, config);
}

/** Options for the adaptive-ascension continuous sim (the E2 measurement). */
export interface ContinuousOptions {
  /** Seconds without a frontier advance before the bot ascends (hits the wall). */
  stallSeconds: number;
  /** Global-second budget (bounds runtime). */
  maxSeconds: number;
  /** Stop after this many consecutive +0-soul ascensions (the honest M9 plateau). */
  plateauAscensions: number;
  /**
   * Fold the full v2 prestige stack into the adaptive loop (M15 — resolves the M14 F7
   * M15-TODO that E2 "buys no Ancients and never Himmelfahrts"). When on, the bot buys
   * Twerk-Ahnen greedily with freshly-earned souls after every ascension (§4.6) AND
   * performs a real Ruhmes-Himmelfahrt (`bankHimmelfahrt`, banking HPF + resetting the
   * L1 souls/rsLifetime/Ancients stack, §4.5.2) the instant the soul bank plateaus while
   * one is available — HPF's global mult + soul-amplifier then LIFT the M9 wall, so the
   * frontier keeps climbing past ~z80 into the spec's "first ~30 improvements" instead
   * of stalling. Off (default) preserves the original crew+gild+soul-only measurement.
   */
  fullPrestige?: boolean;
}

/** The result of a continuous (adaptive-ascension) progression. */
export interface ContinuousResult {
  /** Global second at which each new lifetime-record zone was first reached. */
  timeToLifetime: Map<number, number>;
  ascensions: number;
  /** Ruhmes-Himmelfahrten performed (0 unless `fullPrestige`). */
  himmelfahrten: number;
  maxBestZone: number;
  finalBank: number;
  /** Whether the run stopped because souls stopped growing (the M9 wall, N1). */
  plateaued: boolean;
}

/**
 * Play continuously, ascending **adaptively** the moment the frontier stalls for
 * `stallSeconds` (the player's "I'm stuck — retire" reflex) rather than on a fixed
 * clock. Souls/gilds/loot compound across ascensions, so re-climbs get faster; this is
 * the fair measurement for the endless soft-wall criterion E2 (§4.8).
 *
 * With `fullPrestige` (M15) the bot runs the **full v2 prestige stack**: it buys
 * Twerk-Ahnen greedily each ascension and performs real Ruhmes-Himmelfahrten to lift
 * the M9 souls plateau, so the frontier climbs deep into the spec's "first ~30
 * improvements" (the F7 resolution). Without it the bot stops at the M9 linear-mult
 * plateau (souls stop growing) — the honest crew+gild+soul-only ceiling.
 */
export function simulateContinuous(config: SimConfig, opts: ContinuousOptions): ContinuousResult {
  const sim = newSim(config.seed ?? 1, modsOn(config));
  const combo = comboFactor(config);
  let combat = spawnFor(1, 0, 1, sim.remix);
  const timeToLifetime = new Map<number, number>();
  let globalT = 0;
  let lastAdvanceT = 0;
  let maxBest = 1;
  let ascensions = 0;
  let himmelfahrten = 0;
  let plateauStreak = 0;
  let plateaued = false;

  while (globalT < opts.maxSeconds) {
    globalT++;
    const prevFrontier = combat.maxZone;
    combat = economyStep(sim, combat, config, combo, globalT);
    if (combat.maxZone > prevFrontier) {
      lastAdvanceT = globalT;
      for (let z = prevFrontier + 1; z <= combat.maxZone; z++) {
        if (z > maxBest && !timeToLifetime.has(z)) timeToLifetime.set(z, globalT);
      }
      maxBest = Math.max(maxBest, combat.maxZone);
    }

    if (globalT - lastAdvanceT >= opts.stallSeconds) {
      const asc = applyAscension(combat.maxZone, sim.lifetimeMaxZone, sim.souls, sim.rsLifetime);
      const gained = asc.souls - sim.souls;
      sim.souls = asc.souls;
      sim.lifetimeMaxZone = asc.lifetimeMaxZone;
      sim.rsLifetime = asc.rsLifetime;
      sim.gold = 0;
      sim.crew = {};
      sim.crewUp = {};
      remixOnAscend(sim); // A1: neue Aszension, neue Modifikator-Karte
      combat = spawnFor(1, 0, 1, sim.remix);
      lastAdvanceT = globalT;
      ascensions++;
      if (opts.fullPrestige) {
        const crit = critFactor(config, sim.permTokens, sim.crewUp);
        buyAncientsGreedy(sim, config, combo, crit); // §4.6 soul sink → deeper re-climbs
      }
      if (gained <= 0) {
        // Soul bank plateaued (the M9 linear-mult wall). With the full prestige stack,
        // a Himmelfahrt lifts it (§4.5.2): bank HPF, reset the L1 souls/rsLifetime/
        // Ancients stack, and keep climbing — HPF's +2 %/HPF global mult + soul-amp
        // re-open the frontier. Only a plateau with NO Himmelfahrt available is the
        // true endgame ceiling that stops the run.
        if (opts.fullPrestige && canHimmelfahrt(sim.heaven, sim.rsLifetime)) {
          sim.heaven = bankHimmelfahrt(sim.heaven, sim.rsLifetime);
          sim.souls = 0;
          sim.rsLifetime = 0;
          sim.ancients = {};
          sim.lifetimeMaxZone = 1;
          himmelfahrten++;
          plateauStreak = 0;
        } else {
          plateauStreak++;
          if (plateauStreak >= opts.plateauAscensions) {
            plateaued = true;
            break;
          }
        }
      } else {
        plateauStreak = 0;
      }
    }
  }

  return {
    timeToLifetime,
    ascensions,
    himmelfahrten,
    maxBestZone: maxBest,
    finalBank: sim.souls,
    plateaued,
  };
}

/**
 * The bot can also farm a cleared zone via the pure `travelTo` (clamped to
 * 1..maxZone). Exposed so tests can assert the travel clamp end-to-end over a real
 * combat state (spec §4.4-AC2 / M9-AC5).
 */
export function farmZone(combat: CombatState, zone: number): CombatState {
  return travelTo(combat, zone);
}

/**
 * Spend the freshly-earned souls on Ancients, greedily picking the purchase that
 * most increases total power (§4.6 soul sink; the fixed priority falls out of the
 * power ranking — Poposeidon/Twerkules/Cheeksana dominate the farm metric). Only
 * ever buys when it *raises* power, so holding souls for `soulMult` wins once the
 * marginal ancient is worse — this keeps power monotone and never regresses E3.
 */
function buyAncientsGreedy(sim: Sim, config: SimConfig, combo: number, crit: number): void {
  const permTokens = sim.permTokens;
  const shardIdle = shardIdleMultFor(sim, config);
  let guard = 300;
  for (;;) {
    if (guard-- <= 0) break;
    const p0 = powerFor(
      sim.crew,
      sim.crewUp,
      sim.gilds,
      sim.souls,
      sim.ancients,
      sim.heaven,
      config,
      combo,
      crit,
      permTokens,
      shardIdle,
    );
    let bestId: string | null = null;
    let bestPower = p0;
    for (const cfg of ANCIENTS) {
      if (!canBuyAncient(sim.ancients, sim.souls, cfg.id)) continue;
      const r = buyAncient(sim.ancients, sim.souls, cfg.id);
      const p = powerFor(
        sim.crew,
        sim.crewUp,
        sim.gilds,
        r.souls,
        r.ancients,
        sim.heaven,
        config,
        combo,
        crit,
        permTokens,
        shardIdle,
      );
      if (p > bestPower) {
        bestPower = p;
        bestId = cfg.id;
      }
    }
    if (bestId === null) break;
    const r = buyAncient(sim.ancients, sim.souls, bestId);
    sim.ancients = r.ancients;
    sim.souls = r.souls;
  }
}

/** Options for the ascension-era sim (the E3 + first-Himmelfahrt measurement). */
export interface EraOptions {
  /** Seconds without a frontier advance before the bot ascends (hits the wall). */
  stallSeconds: number;
  /** Global-second budget (bounds runtime). */
  maxSeconds: number;
  /** Stop after this many ascensions (the E3 window: "first 20 ascensions"). */
  maxAscensions: number;
  /** End the run the moment the first Himmelfahrt becomes possible (keeps it fast). */
  stopAtFirstHimmelfahrt?: boolean;
}

/** The result of an ascension-era progression (E3 / first Himmelfahrt). */
export interface EraResult {
  ascensions: number;
  /** Global second at which each new +50 % total-power milestone was first hit. */
  powerMilestones: number[];
  /** Global second at which the first Himmelfahrt became possible (RS_life ≥ 1000), −1 if none. */
  firstHimmelfahrtT: number;
  maxPower: number;
  maxBestZone: number;
}

/**
 * Play a continuous ascension era: adaptive ascension on stall, ROI-greedy crew, the
 * full loot economy, and Ancient buying with the freshly-earned souls after each
 * ascension. Tracks every +50 % total-power milestone (E3) and the global time the
 * first Himmelfahrt becomes possible (RS lifetime ≥ 1000). Souls, gilds, Ancients and
 * loot compound across ascensions (held-balance), so power keeps climbing — the
 * anti-plateau of §4.6.
 */
export function simulateAscensionEra(config: SimConfig, opts: EraOptions): EraResult {
  const sim = newSim(config.seed ?? 1, modsOn(config));
  const combo = comboFactor(config);
  let combat = spawnFor(1, 0, 1, sim.remix);
  let globalT = 0;
  let lastAdvanceT = 0;
  let ascensions = 0;
  let firstHimmelfahrtT = -1;
  let maxPower = 0;
  let maxBestZone = 1;
  const powerMilestones: number[] = [];
  let milestonePower = 0;

  while (globalT < opts.maxSeconds && ascensions < opts.maxAscensions) {
    globalT++;
    const prevFrontier = combat.maxZone;
    combat = economyStep(sim, combat, config, combo, globalT);
    // Reset the stall timer whenever THIS run's frontier advances (incl. re-climbing
    // a cleared zone), not only on a new lifetime record — otherwise the bot ascends
    // mid-climb and never gets deep.
    if (combat.maxZone > prevFrontier) lastAdvanceT = globalT;
    if (combat.maxZone > maxBestZone) maxBestZone = combat.maxZone;

    const crit = critFactor(config, sim.permTokens, sim.crewUp);
    const power = damagePerSecond(sim, config, combo, crit);
    maxPower = Math.max(maxPower, power);
    if (milestonePower <= 0) {
      if (power > 0) milestonePower = power;
    } else if (power >= milestonePower * 1.5) {
      powerMilestones.push(globalT);
      milestonePower = power;
    }

    if (firstHimmelfahrtT < 0 && canHimmelfahrt(sim.heaven, sim.rsLifetime)) {
      firstHimmelfahrtT = globalT;
      if (opts.stopAtFirstHimmelfahrt) break;
    }

    if (globalT - lastAdvanceT >= opts.stallSeconds) {
      const asc = applyAscension(combat.maxZone, sim.lifetimeMaxZone, sim.souls, sim.rsLifetime);
      sim.souls = asc.souls;
      sim.lifetimeMaxZone = asc.lifetimeMaxZone;
      sim.rsLifetime = asc.rsLifetime;
      sim.gold = 0;
      sim.crew = {};
      sim.crewUp = {};
      buyAncientsGreedy(sim, config, combo, crit); // spend the freshly-earned souls
      remixOnAscend(sim); // A1: neue Aszension, neue Modifikator-Karte
      combat = spawnFor(1, 0, 1, sim.remix);
      lastAdvanceT = globalT;
      ascensions++;
    }
  }

  return { ascensions, powerMilestones, firstHimmelfahrtT, maxPower, maxBestZone };
}

/** Options for the float-guard sweep (AC4). */
export interface FloatGuardOptions {
  /** Frontier zone the sweep drives the real combat state to (≥ 300 for AC4). */
  targetZone: number;
  /** Iteration cap (bounds runtime). */
  maxSteps: number;
}

/** The result of the float-guard sweep. */
export interface FloatGuardResult {
  /** Deepest frontier zone the real combat state reached. */
  maxZone: number;
  /** The largest tracked magnitude seen across the whole sweep. */
  maxMagnitude: number;
  /** Whether every tracked magnitude stayed finite (no NaN/Infinity). */
  allFinite: boolean;
  /** Whether every tracked magnitude stayed under `FLOAT_CEIL`. */
  belowCeiling: boolean;
  /**
   * Smallest relevant additive gain ratio seen across the sweep — the min of
   * (gold earned / total gold) and (damage dealt / current target HP-max). §9.3
   * assert #3: this must stay above `wert · 2^-50` (≈ float epsilon) so the smallest
   * per-tick gain never underflows the accumulator it is added to (the stall guard).
   */
  minGainRatio: number;
}

/**
 * Drive the real combat frontier to `targetZone` (≥ 300 for AC4) and audit that every
 * tracked magnitude stays finite and under the float ceiling (§9.3, AC4). This is a
 * REAL per-second climb through the real combat module — each advance goes through
 * `hit`/`tickBoss`, gold banks via the real `goldFor`, and the loot economy runs — but
 * it uses an **honest analytic fast-forward of the meta grind** the spec permits
 * (§9.5): rather than re-earn the deep meta over thousands of ascensions, it supplies
 * the per-second damage a depth-`front` player would wield, sized from the REAL
 * `bossHp` curve, so the frontier marches forward a region at a time. At every new
 * frontier it audits the real magnitudes the spec names — monster/boss HP (`monsterHp`
 * /`bossHp`), gold, banked shards/keys, the souls a depth-`z` player would hold
 * (`soulsForMaxZone`) and the full `powerFor` at that depth (with the HPF a
 * `hpfForRsLifetime` player would have) — confirming the Prestige-Schichten hold
 * every value well under 1.8e308 to Bühne 300 (HP ~1e58+), the M9/M14 float-guard.
 */
export function simulateFloatGuard(config: SimConfig, opts: FloatGuardOptions): FloatGuardResult {
  const sim = newSim(config.seed ?? 1, modsOn(config));
  const combo = comboFactor(config);
  let combat = spawnFor(1, 0, 1);
  let maxMagnitude = 0;
  let allFinite = true;
  let belowCeiling = true;
  let minGainRatio = Number.POSITIVE_INFINITY;
  const audit = (v: number): void => {
    if (!Number.isFinite(v)) allFinite = false;
    const a = Math.abs(v);
    if (a >= FLOAT_CEIL) belowCeiling = false;
    if (a > maxMagnitude) maxMagnitude = a;
  };
  // Advance a small region per second (headroom ×2 clears the current region and
  // carries into the next), so the frontier marches to `targetZone` in bounded steps.
  const region = 3;
  let step = 0;
  while (combat.maxZone < opts.targetZone && step < opts.maxSteps) {
    step++;
    const nowMs = step * 1000;
    tickPeach(sim, nowMs);
    const front = combat.maxZone;
    const dmg = bossHp(front + region) * 2;
    audit(dmg);
    const goldMult = goldMultiplierNow(sim, config, nowMs);
    const luck = ancientChestLuckBonus(sim.ancients);
    const keyMult = 1 + truhenMagnetBonus(sim.heaven);
    const goldBefore = sim.gold;
    // Der analytische Vorlauf zählt als KLICK-Schaden: er modelliert die Schlagkraft
    // eines Tiefe-`front`-Spielers, nicht die Crew — so filtert ihn nur das
    // Schild-Gimmick (Synth), Spotlight-Phasen greifen nicht ins Float-Audit ein.
    combat = stepSecond(
      sim,
      combat,
      { click: dmg, idle: 0, combo },
      goldMult,
      luck,
      keyMult,
      econOn(config),
    );
    const earned = sim.gold - goldBefore;
    // §9.3 stall guard: track the smallest relevant additive gain ratio — the gold
    // increment vs the gold total, and the per-second damage vs the current target's
    // HP-max. Both must stay well above float epsilon (2^-50) or an add would vanish.
    if (earned > 0 && sim.gold > 0) minGainRatio = Math.min(minGainRatio, earned / sim.gold);
    if (combat.hpMax > 0) minGainRatio = Math.min(minGainRatio, dmg / combat.hpMax);
    sim.incomePerSec = INCOME_EMA_ALPHA * earned + (1 - INCOME_EMA_ALPHA) * sim.incomePerSec;
    buyCrewGreedy(sim);
    openChestsGreedy(sim, sim.incomePerSec, nowMs);

    // Audit every tracked magnitude at the new frontier (§9.3).
    const z = combat.maxZone;
    audit(monsterHp(z));
    audit(bossHp(z));
    audit(combat.hp);
    audit(combat.hpMax);
    audit(sim.gold);
    audit(sim.shards);
    audit(sim.keys);
    // Souls + power a legitimate depth-`z` player would hold (real formulas).
    const rsLifetime = soulsForMaxZone(z);
    audit(rsLifetime);
    const hpf = hpfForRsLifetime(rsLifetime);
    const heaven: HeavenState = { ...createHeaven(), hpf, hpfLifetime: hpf };
    const crit = critFactor(config, sim.permTokens, sim.crewUp);
    const power = powerFor(
      sim.crew,
      sim.crewUp,
      sim.gilds,
      rsLifetime,
      sim.ancients,
      heaven,
      config,
      combo,
      crit,
      sim.permTokens,
      shardGearIdleMult(sim.shards),
    );
    audit(power);
  }

  return { maxZone: combat.maxZone, maxMagnitude, allFinite, belowCeiling, minGainRatio };
}
