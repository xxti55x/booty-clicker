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
 *    AND every ROADMAP-V2-P4-Baumknoten all fold as ×1) — EXCEPT the E2 soft-wall
 *    driver (`simulateContinuous` with `fullPrestige`, M15), which greedily buys
 *    Twerk-Ahnen, performs real Ruhmes-Himmelfahrten (`bankHimmelfahrt`) to lift the
 *    M9 wall AND gibt die gebankten HPF im **Himmelsbaum** aus (`buyTreeGreedy` +
 *    `SIM_TREE_PRIORITY`, P4) — der volle v2-Prestige-Stack. Gemessen reicht der Bot
 *    an der z75-Wand allerdings nur für 1 HPF, kauft dort also (noch) keinen Knoten;
 *    die Kauf-Strategie selbst ist separat getestet (siehe `SIM_TREE_PRIORITY`). The Transzendenz layer (L3, §4.5.3) stays at te = 0 in every
 *    driver — its ×3^TE global mult is P1-neutral and never gated, so folding it would
 *    only scale both bots equally; no sim drives a Transzendenz.
 *    Likewise Twerk-Ekstase (§4.3), the boss-damage mults, the Chronilla timer and
 *    `travelTo` re-farming of cleared zones are not modeled. Every one of these can
 *    only ADD power / speed the bot, so leaving them out keeps E1–E4 honest *lower*
 *    bounds (the real game is at least this fast), never optimistic ones.
 *  · **Crew-Meisterschaft (1a)** ist VOLL gefaltet, nicht ausgenommen: der Bot bucht
 *    jeden gekauften Level in `sim.crewMastery` (wie `ui/crew.ts` im Spiel), trägt
 *    den Zähler durch JEDEN Reset-Pfad (er ist Lebenszeit-Meta) und liest den
 *    Eigen-Perk über dieselbe eine Multiplikation in `heroDps`/`heroClick`. Auch
 *    die Gratis-Erststufe des Legenden-Rangs bucht er über dieselbe pure Funktion
 *    (`grantFreeMasteryTiers`) wie die Glue. Über lange Ketten kauft der Bot
 *    zehntausende Level — ohne die Faltung wären die Anker blind für einen
 *    Machtterm, den ein echter Spieler längst trägt.
 *  · **Gebietsherrschaft (1b)** ist ebenfalls VOLL gefaltet — und zwar zwingend:
 *    Ruf entsteht PASSIV aus Kills, ohne jede Kauf-Entscheidung, also trägt ihn
 *    jeder echte Spielstand zwangsläufig. Der Bot bucht pro Kill denselben Ruf auf
 *    dasselbe Theme wie die Glue (`territory.addRep` über `themeForZone`) und
 *    multipliziert den BP-Ertrag jedes Kills mit `territoryGoldMult` DER BÜHNE, auf
 *    der er landet — ein Ruf-Faktor eines fremden Themes faltet dabei per
 *    Konstruktion ×1. Ein Bot ohne diese Faltung hätte die Anker angelogen (sie
 *    lägen zu langsam), deshalb sind sie mit 1b neu vermessen (DECISIONS.md).
 *  · **v11 crew specials** (even ability tiers): the `gold` specials fold into
 *    `goldMultiplierNow` and the `crit`/`critdmg` specials into `critFactor` — real
 *    economy/EV effects the bot earns exactly as the game grants them. The
 *    `boss`/`combo`/`beat`/`ekstase` specials are utility the bot does NOT model
 *    (same lower-bound rationale as the boss-damage mults above); it still BUYS
 *    them, bundle-valued as gates to the next power tier (see `buyCrewGreedy`).
 *  · **Crew-Umschulung (3b)**: Der Bot schult NIE um — er hält keine Override-Map,
 *    also faltet `crewSpecialBonuses` für ihn exakt die Stock-Sorten wie vor 3b
 *    (die Anker bleiben dadurch zahlengleich). Das ist die bewusste, dokumentierte
 *    UNTERGRENZE: Umschulen kostet nur Splitter, die der Bot ohnehin bankt, und
 *    kann die Sorten-Verteilung im Zweifel nur VERBESSERN — ein Bot, der optimal
 *    umschult, wäre schneller als jeder Spieler, und die Anker müssen die
 *    langsamere Wahrheit messen. Die FALTUNG selbst kann es trotzdem: Sie liest
 *    dieselbe `abilityKind`-Kette wie das Spiel, ein Save mit Overrides rechnet
 *    also überall korrekt (`heroes.test.ts`, `ch-state.test.ts`).
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
import {
  CONSTELLATION_FULL,
  type ConstellationState,
  constellationChestLuckBonus,
  constellationClickMult,
  constellationCritChanceBonus,
  constellationDpsMult,
  constellationGoldMult,
  constellationStartGold,
  createConstellation,
  hasWarmupStart,
  WARMUP_S,
} from './constellation';
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
import { type GearBonus, MAX_SKIN_LEVEL, emptyGearBonus, shardCost } from './gear';
import { type RolledAffix, foldAffixes } from './affixes';
import {
  type RelicsState,
  createRelics,
  equipBestRelics,
  equippedRelicAffixes,
  gateRelicRoll,
} from './relics';
import { FORGE_BEST, emberForDuplicate } from './forge';
import { GOBLIN_BUFF_MULT, GOBLIN_CHESTS, GOBLIN_SIM_CATCH, rollNextGoblinAt } from './goblin';
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
  TREE_NODES,
  bankHimmelfahrt,
  canHimmelfahrt,
  comboStepFor,
  createHeaven,
  goldeneHandeMult,
  greedyTreeSpend,
  heavenClickMult,
  heavenCritMultFactor,
  heavenDpsMult,
  heavenGlobalMult,
  hpfForRsLifetime,
  pfirsichFokusGapMult,
  pfirsichReifeBonusMs,
  soulBonusEff,
  treeLevel,
  truhenFokusChestMult,
  truhenMagnetBonus,
} from './heaven';
import {
  CREW,
  bestCrewBuy,
  clickDamageRaw,
  crewSpecialBonuses,
  grantFreeMasteryTiers,
  totalRawDps,
} from './heroes';
import { type CrewMastery, addMastery, createMastery } from './mastery';
import { legendGlobalMult } from './legend';
import { BOSS_SECONDS, PATH_NODES, SIM_SKIN, nodesForScore, pathAmount } from './skin-path';
import {
  type Territory,
  addRep,
  createTerritory,
  repForKill,
  territoryGoldMult,
  themeForZone,
} from './territory';
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
  /**
   * **IDEEN-GAMEPLAY 2a — die Legenden-Konstellation.** Standard `false`: Der
   * normale Anker-Bot lässt den Baum links liegen und kauft NIE einen Stern,
   * obwohl er (wie jeder Spieler) Sternenstaub verdienen würde — Erfolge und
   * Bühnen-Sterne modelliert er ohnehin nicht, und Boss-Gates zählt er nur als
   * Fortschritt. Das ist die bewusste, dokumentierte **Untergrenze**: Alle
   * bestehenden Anker bleiben damit ZAHLENGLEICH (jeder Konstellations-Getter
   * faltet ×1), und ein Spieler, der den Baum baut, ist höchstens schneller.
   *
   * `true` schaltet den VOLL ausgebauten Baum ein (`CONSTELLATION_FULL`) — das
   * eigene Anker-Profil {@link SIM_CONSTELLATION}, an dem der Budget-Deckel
   * gemessen wird: Wie weit verschiebt der komplette Lebenswerk-Baum t25 und
   * die erste Himmelfahrt? (Antwort steht in `sim.test.ts` und in DECISIONS.md.)
   */
  constellation?: boolean;
  /**
   * **IDEEN-GAMEPLAY 3a — die Skin-Schmiede.** Standard `false`: Der normale
   * Anker-Bot schmiedet NIE. Das ist dieselbe dokumentierte **Untergrenze** wie
   * bei der Umschulung (3b) und der Konstellation (2a) — Schmieden kostet Glut,
   * die der Bot ohnehin nicht ausgibt, es setzt Skin-Level 10/25/40 voraus (die
   * er nicht gezielt kauft) und es kann die Affix-Verteilung im Zweifel nur
   * VERBESSERN. Ein optimal schmiedender Bot wäre schneller als jeder Spieler,
   * und die Anker müssen die langsamere Wahrheit messen.
   *
   * `true` schaltet die **Best-Case-Schmiede** ein ({@link FORGE_BEST}: drei
   * makellose Slots) — das eigene Anker-Profil {@link SIM_FORGE}, an dem der
   * Budget-Deckel gemessen wird.
   *
   * **Relikte (1c) sind davon NICHT betroffen** und stecken in JEDEM Profil:
   * Sie fallen passiv aus Boss-Gates ab Bühne 50, ohne jede Kauf-Entscheidung —
   * genau wie der Ruf (1b) trägt sie also zwangsläufig jeder echte Spielstand,
   * und ein Bot ohne sie würde einen Machtterm verschweigen.
   */
  forge?: boolean;
  /**
   * **IDEEN-GAMEPLAY 2b — der Skin-Meisterschafts-Pfad.** Standard `false`, und
   * der Grund ist ein anderer als bei 2a/3a: Der normale Anker-Bot modelliert
   * **gar kein Skin-Gear** (`clickGearMult`/`idleGearMult` stehen per Default
   * auf 1, obwohl der Klassiker auf Lv 50 allein ×5 Klick zahlt). Einen Bot,
   * der den +400-%-Level-Buff verschweigt, aber den +8-%-Pfad desselben Skins
   * mitrechnete, gäbe es im Spiel nicht — er fiele die Krume auf und ließe den
   * Laib liegen.
   *
   * Der Pfad-FORTSCHRITT wird trotzdem in JEDEM Profil mitgezählt (Tragezeit +
   * Boss-Kills, siehe {@link SIM_SKIN}) — das ist die Messgröße, an der die
   * Schwellen geeicht sind. Nur die WIRKUNG hängt an diesem Schalter, und der
   * schaltet sie in voller Höhe ein (alle vier Bonus-Knoten): das Profil
   * {@link SIM_PATH}, an dem der Budget-Deckel gemessen wird.
   */
  skinPath?: boolean;
  /**
   * **IDEEN-GAMEPLAY 3c — der Erbe.** Standard `false`: Der Bot transzendiert
   * nie (siehe Modul-Kopf), also hat er auch keinen Erben — dieselbe
   * dokumentierte **Untergrenze** wie bei 2a/3a/3b.
   *
   * `true` markiert das Mitglied mit den MEISTEN Einsatz-XP als Erben und
   * erneuert die Wahl nach jedem Kauf-Durchgang — die beste-ROI-Heuristik, die
   * ein Spieler in der Zeremonie träfe (wer am meisten investiert hat, holt aus
   * der Verdopplung am meisten heraus). Das Profil {@link SIM_HEIR} misst damit
   * die OBERGRENZE der Wirkung.
   */
  heir?: boolean;
  /**
   * **IDEEN-GAMEPLAY 1d — Legenden-Level.** Standard `undefined`: Der Bot hat
   * nie transzendiert, also verdient er auch kein Legenden-Level, und der
   * Faktor faltet überall exakt ×1 — jeder bestehende Anker bleibt
   * zahlengleich.
   *
   * Eine Zahl schaltet den Bot in den **Nach-Transzendenz-Modus**: Er startet
   * mit so vielen Leveln UND zählt jede weitere Himmelfahrt mit (der Treiber
   * `simulateContinuous` mit `fullPrestige` ist der einzige, der überhaupt
   * Himmelfahrten fährt). `0` ist damit ausdrücklich etwas anderes als
   * `undefined`: „frisch transzendiert, sammelt ab jetzt".
   */
  legend?: number;
}

// ---------------------------------------------------------------------------
// ROADMAP-V2 P5 — die Bot-Profile der Anker, EINMAL definiert
// ---------------------------------------------------------------------------
// Die Anker-Tests (`sim.test.ts`) und das Balance-Ritual (`npm run balance`,
// `scripts/balance.mjs`) müssen dieselben Kennlinien messen. Wären die Profile
// zweimal getippt, driftete das Ritual irgendwann still von den Ankern weg —
// also stehen sie hier, und beide Seiten importieren sie.

/** Der §4.8-„aktive Spieler": 3 Klicks/s mit Juice, volle Loot-Ökonomie. */
export const SIM_ACTIVE: SimConfig = { clickRate: 3, juice: true };

/**
 * Derselbe Bot unter den §4.8-KALIBRIER-Bedingungen: ohne Loot-Ökonomie. Die
 * Pacing-Tabelle wurde unter genau diesen Annahmen gemessen (der Goldene
 * Pfirsich und die Truhen sind ein bewusst zusätzlicher Beschleuniger).
 */
export const SIM_ACTIVE_CAL: SimConfig = { clickRate: 3, juice: true, economy: false };

/**
 * **„Konstellation komplett"** (IDEEN-GAMEPLAY 2a, Pflicht-Guardrail): derselbe
 * aktive Spieler wie {@link SIM_ACTIVE}, aber mit dem VOLL ausgebauten
 * Legenden-Baum. Der A/B-Partner von `SIM_ACTIVE` — die Differenz der Anker
 * (t25, erste Himmelfahrt) IST die gemessene Wirkung des Baums und muss unter
 * dem ×1.5-Budget bleiben.
 */
export const SIM_CONSTELLATION: SimConfig = { clickRate: 3, juice: true, constellation: true };

/**
 * **„Schmiede voll"** (IDEEN-GAMEPLAY 3a, Pflicht-Guardrail): derselbe aktive
 * Spieler wie {@link SIM_ACTIVE}, aber mit drei makellos geschmiedeten
 * Slots ({@link FORGE_BEST}). Der A/B-Partner von `SIM_ACTIVE` — die Differenz
 * der Anker IST die gemessene Wirkung der Schmiede und muss unter dem Budget
 * bleiben. Die Relikte laufen in BEIDEN Läufen mit, gemessen wird also die
 * Schmiede allein.
 */
export const SIM_FORGE: SimConfig = { clickRate: 3, juice: true, forge: true };

/**
 * **„Erbe gesetzt"** (IDEEN-GAMEPLAY 3c): derselbe aktive Spieler wie
 * {@link SIM_ACTIVE}, aber mit dem stärksten Mitglied als Erben (Perk-Wirkung
 * ×2). Der A/B-Partner von `SIM_ACTIVE` — die Differenz IST die gemessene
 * Wirkung des Erben-Moments.
 */
export const SIM_HEIR: SimConfig = { clickRate: 3, juice: true, heir: true };

/**
 * **„Pfad komplett"** (IDEEN-GAMEPLAY 2b): derselbe aktive Spieler wie
 * {@link SIM_ACTIVE}, aber mit den vier Bonus-Knoten des getragenen Skins
 * ({@link SIM_SKIN} = Klassiker, +8 % Klick — der stärkste Pfad des Katalogs).
 * Der A/B-Partner von `SIM_ACTIVE`.
 */
export const SIM_PATH: SimConfig = { clickRate: 3, juice: true, skinPath: true };

/**
 * **„Ultra-Langzeit"** (IDEEN-GAMEPLAY 1d): derselbe aktive Spieler, aber mit
 * {@link SIM_LEGEND_LEVELS} Legenden-Leveln im Rücken. Die Zahl ist absichtlich
 * groß gewählt (siehe dort) — bei den paar Leveln, die ein realistischer
 * Spielstand hält, wäre die Differenz im Rauschen, und dann misst man nichts.
 */
export const SIM_LEGEND_LEVELS = 100;
export const SIM_LEGEND: SimConfig = {
  clickRate: 3,
  juice: true,
  legend: SIM_LEGEND_LEVELS,
};

/** Die feste Lauflänge der Messungen: 45 min = 2700 Ein-Sekunden-Schritte. */
export const SIM_RUN_S = 2700;

/** Die Seeds der Langhorizont-Anker (E2/E3/erste Himmelfahrt). */
export const SIM_SEEDS_HEAVY: readonly number[] = [1, 7, 12345];

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
  /**
   * Crew-Meisterschaft (1a): Lebenszeit-Level je Mitglied. Der Bot kauft über
   * lange Läufe zehntausende Level, also wächst sie im Bot genauso mit wie im
   * Spiel — und wird von KEINEM Reset-Pfad angefasst (das ist der Kontrakt).
   */
  crewMastery: CrewMastery;
  /**
   * Gebietsherrschaft (1b): Ruf je Bühnen-Theme. Sie wächst im Bot GENAUSO
   * passiv mit wie im Spiel — jeder Kill bucht auf das Theme seiner Bühne —, und
   * kein Reset-Pfad fasst sie an. Sie MUSS gefaltet sein: Der Ruf entsteht ohne
   * jede Kauf-Entscheidung, ein Bot ohne sie würde also einen Machtterm
   * verschweigen, den ein echter Spielstand zwangsläufig trägt.
   */
  territory: Territory;
  /**
   * 1c: Die Relikt-Sammlung. Sie wächst im Bot GENAUSO passiv wie im Spiel —
   * jedes neue Boss-Gate ab Bühne 50 würfelt einmal — und kein Reset-Pfad fasst
   * sie an. Der Bot trägt automatisch die drei bestgerollten (`equipBestRelics`).
   */
  relics: RelicsState;
  /**
   * 3a: Die geschmiedeten Affixe des getragenen Skins. Leer im Normal-Bot
   * (dokumentierte Untergrenze), voll im Profil {@link SIM_FORGE}.
   */
  forgeAffixes: readonly RolledAffix[];
  /** 3a: Gebankte Schmiede-Glut aus Duplikat-Jackpots + Splitter-Umtausch. */
  ember: number;
  /**
   * Gemerkter Affix-Fold (1c + 3a). Er wird bis zu viermal PRO SEKUNDE gelesen
   * (Klick-, Idle-, BP- und Truhen-Term) und ändert sich nur, wenn ein Relikt
   * fällt — ohne diesen Cache lief `sim.test.ts` zehn Sekunden länger. `null`
   * heißt „neu rechnen"; jeder Schreibzugriff auf `relics`/`forgeAffixes` setzt
   * ihn zurück.
   */
  loadout: GearBonus | null;
  /** Die Truhen-Skins, die der Bot schon besitzt — ab dem zweiten gibt es Glut. */
  chestSkins: Set<string>;
  gilds: Gilds;
  souls: number;
  lifetimeMaxZone: number;
  /** Lifetime-earned RS highwater (held-balance model, §ascension). */
  rsLifetime: number;
  /** Bought Twerk-Ahnen (the M10 soul sink). */
  ancients: AncientLevels;
  /** Prestige layer 2 (HPF + Himmelsbaum). */
  heaven: HeavenState;
  /**
   * 2a: Die Legenden-Konstellation. Leer im Normal-Bot (jeder Getter ×1), voll
   * im Profil {@link SIM_CONSTELLATION}. Sie wird von KEINEM Reset-Pfad
   * angefasst — genau wie im Spiel.
   */
  constellation: ConstellationState;
  /**
   * 2a ★ „Warm-up-Start": Globale Sekunde, bis zu der der Kobold-Buff (×2 Klick)
   * dieser Tour läuft. Wird bei jedem Tour-Start neu gesetzt; 0 = kein Buff.
   */
  warmupUntilS: number;
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
  /** 1c: Gefundene Relikte (lifetime) — die Messgröße der Drop-Kurve. */
  relicsFound: number;
  /**
   * 2b: Sekunden, die der Bot seinen EINEN Skin getragen hat. Er wechselt nie
   * (siehe {@link SIM_SKIN}), das ist also zugleich seine Spielzeit — und exakt
   * die konservative Modellierung eines treuen Spielers.
   */
  wearS: number;
  /** 2b: Boss-Kills in diesem Skin (jeder Kill zählt, auch ein wiederholtes Gate). */
  pathBosses: number;
  /** 2b: Ob die WIRKUNG des Pfades gefaltet wird (nur im Profil {@link SIM_PATH}). */
  pathOn: boolean;
  /** 3c: Ob der Bot einen Erben führt (nur im Profil {@link SIM_HEIR}). */
  heirOn: boolean;
  /**
   * 3c: Die Erben-Id ('' = kein Erbe). Nur im Profil {@link SIM_HEIR} gesetzt;
   * sie wird nach jedem Kauf-Durchgang auf das XP-stärkste Mitglied nachgeführt.
   */
  heir: string;
  /** 1d: Legenden-Level. Bleibt 0, solange `config.legend` fehlt. */
  legend: number;
  /** 1d: Ob dieser Bot als NACH-Transzendenz-Spieler läuft (zählt Himmelfahrten). */
  postTranscend: boolean;
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
  /** 1c: Gefundene Relikte — die Drop-Kurve, gegen die Rate + Pity geeicht sind. */
  relicsFound: number;
  /** 3a: Gebankte Schmiede-Glut aus Duplikat-Jackpots. */
  ember: number;
  /** 1c: Das tiefste Boss-Gate, das schon gewürfelt hat (die Drop-Front). */
  deepestGate: number;
}

/**
 * 2b: Der Pfad-Stand des EINEN Skins, den der Bot trägt — die Messgröße, gegen
 * die {@link PATH_THRESHOLDS} geeicht sind (`npm run balance`, Abschnitt 12).
 */
export interface PathSummary {
  /** Getragene Sekunden (= Spielzeit, der Bot wechselt nie). */
  wearS: number;
  /** Boss-Kills im Skin. */
  bosses: number;
  /** Die Fortschritts-Zahl: `wearS + 180 · bosses`. */
  score: number;
  /** Freigeschaltete Knoten (0 … 5). */
  nodes: number;
}

/** Read the current skin-path tallies off the sim (2b). */
function pathSummary(sim: Sim): PathSummary {
  const score = sim.wearS + sim.pathBosses * BOSS_SECONDS;
  return { wearS: sim.wearS, bosses: sim.pathBosses, score, nodes: nodesForScore(score) };
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
    relicsFound: sim.relicsFound,
    ember: sim.ember,
    deepestGate: sim.relics.deepestGate,
  };
}

function newSim(
  seed: number,
  mods = true,
  constellation = false,
  forge = false,
  legend?: number,
  skinPath = false,
  heir = false,
): Sim {
  return {
    gold: 0,
    crew: {},
    crewUp: {},
    crewMastery: createMastery(),
    territory: createTerritory(),
    relics: createRelics(),
    forgeAffixes: forge ? FORGE_BEST : [],
    ember: 0,
    loadout: null,
    chestSkins: new Set<string>(),
    gilds: {},
    souls: 0,
    lifetimeMaxZone: 1,
    rsLifetime: 0,
    ancients: {},
    heaven: createHeaven(),
    constellation: constellation ? CONSTELLATION_FULL : createConstellation(),
    warmupUntilS: 0,
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
    relicsFound: 0,
    wearS: 0,
    pathBosses: 0,
    pathOn: skinPath,
    heir: '',
    heirOn: heir,
    legend: legend !== undefined && legend > 0 ? Math.floor(legend) : 0,
    postTranscend: legend !== undefined,
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

/**
 * The sustained combo multiplier for a config (×1.2 at cap when juiced, §4.8).
 * `heaven` trägt seit ROADMAP-V2 P4 die „Combo-Doktrin" (Cap ×1.3) — ohne den
 * Knoten ist der Wert zahlengleich zu vorher, deshalb bewegt sich kein Alt-Anker.
 */
function comboFactor(config: SimConfig, heaven: HeavenState = createHeaven()): number {
  return config.juice ? comboMult(COMBO_CAP, comboStepFor(heaven)) : 1;
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
  heaven: HeavenState = createHeaven(),
  constellation: ConstellationState = createConstellation(),
  loadout: GearBonus = emptyGearBonus(),
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
      // 2a: die drei Krit-Sterne der Konstellation (+0,5 pp je Stern) — durch
      // DENSELBEN 40-%-Deckel wie im Spiel.
      constellationCritChanceBonus(constellation) +
      // 1c + 3a: „Glückstreffer"/„Sequin-Crit" des Loadouts — durch DENSELBEN
      // 40-%-Deckel wie im Spiel.
      loadout.critChance +
      (econ ? permTokenCritChance(permTokens) : 0),
  );
  // P4 „Präzisions-Shake": derselbe multiplikative Griff wie die Krit-Token (×1
  // ohne Knoten), deshalb hängt er auch außerhalb der Loot-Ökonomie im Term.
  // 1c + 3a: „Wuchtschlag" des Loadouts wird wie jeder `critMultBonus` des
  // Spiels ADDITIV auf CRIT_MULT gelegt (`click.critMult`), nicht multiplikativ
  // darauf — dieselbe Semantik wie beim Lava-Skin und den Crew-Specials.
  const mult =
    (CRIT_MULT + spec.critDmg + loadout.critMult) *
    (econ ? permTokenCritMult(permTokens) : 1) *
    heavenCritMultFactor(heaven);
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

/**
 * **1c + 3a — der Affix-Fold des Bots.** Getragene Relikte (drei Slots, vom Bot
 * automatisch die bestgerollten) plus die Schmiede-Affixe des Profils. Läuft
 * durch dieselbe eine Funktion wie im Spiel (`affixes.foldAffixes`), inklusive
 * des strukturellen Deckels je Term — es gibt keinen zweiten Rechenweg.
 */
function simLoadout(sim: Sim): GearBonus {
  let v = sim.loadout;
  if (v === null) {
    v =
      sim.relics.owned.length === 0 && sim.forgeAffixes.length === 0
        ? emptyGearBonus()
        : foldAffixes([...equippedRelicAffixes(sim.relics), ...sim.forgeAffixes]);
    sim.loadout = v;
  }
  return v;
}

/**
 * **Die drei Meta-Terme der Schritte 2b/3c/1d**, in EINEM Bündel durch die
 * Power-Rechnung gereicht — drei weitere Positions-Parameter hätten
 * `powerSplit` endgültig unlesbar gemacht.
 */
interface SimMeta {
  /** 3c: Erben-Id ('' ⇒ jedes Mitglied zählt einfach). */
  readonly heir: string;
  /** 2b: Klick-Faktor des Skin-Pfades (1 ohne Pfad). */
  readonly pathClick: number;
  /** 1d: Legenden-Level (0 ⇒ Faktor exakt 1). */
  readonly legend: number;
}

/** Das neutrale Bündel — jeder Term faltet ×1. */
const NO_META: SimMeta = { heir: '', pathClick: 1, legend: 0 };

/**
 * **2b im Bot.** Der Bot trägt {@link SIM_SKIN} von Sekunde 0 bis zum Ende und
 * WECHSELT NIE — er ist damit der loyalste denkbare Spieler auf genau einem
 * Pfad und hat auf den neun anderen null Fortschritt. Das ist keine
 * Vereinfachung, sondern die konservative Wahrheit in beide Richtungen: Wer
 * wechselt, füllt jeden Pfad langsamer; wer wie der Bot bleibt, füllt genau
 * diesen einen so schnell wie überhaupt möglich. Gemessen wird also die
 * SCHNELLSTE Pfad-Kurve — die richtige Seite für die Schwellen-Eichung.
 */
function simMeta(sim: Sim): SimMeta {
  return {
    heir: sim.heir,
    // Der FORTSCHRITT läuft in jedem Profil mit (`sim.wearS`/`sim.pathBosses`),
    // die WIRKUNG nur im Profil `SIM_PATH` — Begründung an `SimConfig.skinPath`.
    pathClick: sim.pathOn ? 1 + pathAmount(SIM_SKIN, PATH_NODES - 1) : 1,
    legend: sim.legend,
  };
}

/**
 * 3c: Das Mitglied mit den meisten Einsatz-XP — die Erben-Wahl, die ein Spieler
 * in der Zeremonie treffen würde. Bei Gleichstand gewinnt die Katalog-Reihenfolge
 * (deterministisch; ein `Math.max` über eine Map wäre es nicht).
 */
function bestHeir(mastery: CrewMastery): string {
  let id = '';
  let best = 0;
  for (const cfg of CREW) {
    const xp = mastery[cfg.id] ?? 0;
    if (xp > best) {
      best = xp;
      id = cfg.id;
    }
  }
  return id;
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
  mastery: CrewMastery,
  gilds: Gilds,
  souls: number,
  ancients: AncientLevels,
  heaven: HeavenState,
  constellation: ConstellationState,
  config: SimConfig,
  combo: number,
  crit: number,
  permTokens: PermTokens,
  shardIdle: number,
  loadout: GearBonus,
  meta: SimMeta = NO_META,
): DamageSplit {
  const hpf = heaven.hpf;
  // 1d: `1 + 0.005·L`, ADDITIV, und auf BEIDE Seiten derselbe Skalar (P1-neutral).
  const legend = legendGlobalMult(meta.legend);
  const sm = soulMult(souls, soulBonusEff(hpf));
  const global = heavenGlobalMult(hpf);
  // Click gear (§5) multiplies the click term only (P1: the strongest gear is click).
  const baseClick =
    clickDamageRaw(crew, gilds, crewUp, mastery, meta.heir) *
    sm *
    ancientClickMult(ancients) *
    global *
    // P4 Kampf-Ast: „Klick-Doktrin" hebt NUR den Klick-Term (×1 ohne Knoten).
    heavenClickMult(heaven) *
    // 2a: die vier Klick-Sterne (+2 % je Stern, ×1 ohne Baum).
    constellationClickMult(constellation) *
    // 1c + 3a: die `clickPct`-Affixe des Loadouts (×1 ohne Relikte/Schmiede).
    (1 + loadout.clickPct) *
    // 2b: der Skin-Pfad des getragenen Skins (Klassiker ⇒ bis zu +8 % Klick).
    meta.pathClick *
    legend *
    (config.clickGearMult ?? 1);
  // Idle gear (§5) + the permanent DPS-token pool (§6.2) + the crew's
  // `idle`-special tiers (v11.1 Groove) multiply crew DPS only — never the
  // click term (P1, M11-AC5).
  const idle =
    totalRawDps(crew, gilds, crewUp, mastery, meta.heir) *
    sm *
    ancientDpsMult(ancients) *
    global *
    // P4 Kampf-Ast: „Schwerer Bass" × „Crew-Doktrin" — nur die Idle-Seite (×1 ohne).
    heavenDpsMult(heaven) *
    // 2a: die drei Ausdauer-Sterne (+2 % je Stern, ×1 ohne Baum) — nur Idle.
    constellationDpsMult(constellation) *
    // 1c + 3a: die `dpsPct`-Affixe des Loadouts (×1 ohne Relikte/Schmiede).
    (1 + loadout.dpsPct) *
    (config.idleGearMult ?? 1) *
    shardIdle *
    (econOn(config) ? permTokenDpsMult(permTokens) : 1) *
    legend *
    crewSpecialBonuses(crewUp).idleMult;
  return { click: config.clickRate * baseClick * combo * crit, idle };
}

/** Total power (click + idle) — the ranking metric for `buyAncientsGreedy` + E3. */
function powerFor(
  crew: Record<string, number>,
  crewUp: Record<string, number>,
  mastery: CrewMastery,
  gilds: Gilds,
  souls: number,
  ancients: AncientLevels,
  heaven: HeavenState,
  constellation: ConstellationState,
  config: SimConfig,
  combo: number,
  crit: number,
  permTokens: PermTokens,
  shardIdle: number,
  loadout: GearBonus,
  meta: SimMeta = NO_META,
): number {
  const p = powerSplit(
    crew,
    crewUp,
    mastery,
    gilds,
    souls,
    ancients,
    heaven,
    constellation,
    config,
    combo,
    crit,
    permTokens,
    shardIdle,
    loadout,
    meta,
  );
  return p.click + p.idle;
}

/** Effective damage the bot deals in one second at the current state (split, A2). */
function damageSplit(sim: Sim, config: SimConfig, combo: number, crit: number): DamageSplit {
  return powerSplit(
    sim.crew,
    sim.crewUp,
    sim.crewMastery,
    sim.gilds,
    sim.souls,
    sim.ancients,
    sim.heaven,
    sim.constellation,
    config,
    combo,
    crit,
    sim.permTokens,
    shardIdleMultFor(sim, config),
    simLoadout(sim),
    simMeta(sim),
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
  // P4 „Pfirsich-Fokus" verkürzt die Pause, „Pfirsich-Reife" verlängert das Fenster
  // — beide sind ×1 / +0 ohne Knoten, der Zufallsstrom bleibt also identisch.
  const gap = pfirsichFokusGapMult(sim.heaven);
  const extraMs = pfirsichReifeBonusMs(sim.heaven);
  if (sim.nextPeachAtMs <= 0) sim.nextPeachAtMs = rollNextPeachAt(nowMs, sim.rng, gap);
  let guard = 64;
  while (nowMs >= sim.nextPeachAtMs && guard-- > 0) {
    const caughtAt = sim.nextPeachAtMs;
    const extended = Math.max(sim.boostUntilMs, activateBoost(caughtAt, extraMs));
    sim.boostUntilMs = clampBoostUntil(extended, nowMs);
    const key = peachKeyRoll(sim.rng);
    sim.keys += key;
    sim.keysEarned += key;
    sim.peachesCaught += 1;
    sim.nextPeachAtMs = rollNextPeachAt(caughtAt, sim.rng, gap);
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
 * Truhen-Luck dieser Sekunde: Truhilda (0 ohne Kauf) + die beiden
 * „Spürsinn"/„Witterung"-Sterne der Konstellation (0 ohne Baum) — derselbe
 * additive Stack wie `ch-state.chestLuck` im Spiel.
 */
function chestLuckNow(sim: Sim): number {
  return (
    ancientChestLuckBonus(sim.ancients) +
    constellationChestLuckBonus(sim.constellation) +
    // 1c + 3a: die „Spürnase"-Affixe des Loadouts.
    simLoadout(sim).chestLuck
  );
}

/**
 * **2a — der Beginn einer Tour.** Startkapital der drei „Aufbruch"-Sterne aufs
 * Konto, und mit „Warm-up-Start" läuft der Kobold-Buff (×2 Klick) die ersten
 * {@link WARMUP_S} Sekunden. Beides ist EPISODISCH statt multiplikativ und
 * gehört deshalb nicht ins Budget-Produkt, sondern genau hierher: Der Bot misst
 * es, statt dass jemand es schätzt. Läuft an jeder Stelle, an der ein Treiber
 * eine frische Tour startet (Kettenlauf, Wand-Aszension, Ära-Aszension).
 */
function startTour(sim: Sim, globalSec: number): void {
  sim.gold += constellationStartGold(sim.constellation);
  sim.warmupUntilS = hasWarmupStart(sim.constellation) ? globalSec + WARMUP_S : 0;
}

/**
 * Full BP (gold) multiplier this second: Peachiel × gold-tokens × live peach ×3 ×
 * the crew's `gold`-special ability tiers (v11 — part of the core crew layer, so
 * it folds even in the no-economy calibration configs, exactly as the game does).
 */
function goldMultiplierNow(sim: Sim, config: SimConfig, nowMs: number): number {
  const crewGold = crewSpecialBonuses(sim.crewUp).goldMult;
  // P4 „Goldene Hände" (+10 %/Stufe) trifft JEDE BP-Quelle, also auch die
  // Kalibrier-Läufe ohne Loot-Ökonomie (×1 ohne Knoten).
  const hande = goldeneHandeMult(sim.heaven);
  // 2a „Anfängerglück" + „Tantiemen" (+2 % je Stern) treffen wie die „Goldenen
  // Hände" JEDE BP-Quelle, also auch die Kalibrier-Läufe ohne Loot-Ökonomie.
  const sterne = constellationGoldMult(sim.constellation);
  // 1c + 3a: „Trinkgeld" des Loadouts trifft wie die „Goldenen Hände" JEDE
  // BP-Quelle, also auch die Kalibrier-Läufe ohne Loot-Ökonomie.
  const affix = 1 + simLoadout(sim).goldPct;
  if (!econOn(config)) return ancientGoldMult(sim.ancients) * crewGold * hande * sterne * affix;
  return (
    affix *
    ancientGoldMult(sim.ancients) *
    permTokenGoldMult(sim.permTokens) *
    incomeMultiplier(sim.boostUntilMs, nowMs) *
    crewGold *
    hande *
    sterne
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
    case 'jackpot': {
      // 3a: Ein Jackpot-Skin, den der Bot schon besitzt, ist ein DUPLIKAT — und
      // Duplikate sind seit 3a der Glut-Faucet (`forge.emberForDuplicate`).
      // Der Skin selbst bleibt Kosmetik (dokumentierter Ausschluss); gezählt
      // wird nur, was die Schmiede daraus zieht. Die 🧩 aus `resolveDuplicate`
      // bucht der Bot bewusst NICHT — sie sind ein reiner Splitter-Zufluss, den
      // die 3b-Kurve schon misst, und würden die Anker sonst doppelt speisen.
      if (sim.chestSkins.has(reward.jackpot.skin)) {
        sim.ember += emberForDuplicate(reward.jackpot.tier);
      } else {
        sim.chestSkins.add(reward.jackpot.skin);
      }
      break;
    }
    // `sugar` (🍬 → gear stars, ~1×/24 h real-time) carries no meaningful
    // run-power — caught but not converted (see the module-header exclusions).
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
  const luck = chestLuckNow(sim); // Truhilda + die zwei Konstellations-Sterne
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
      // 1b: Die Bühne, auf der dieser Kill LANDET — sie bestimmt sowohl das
      // Theme, dem der Ruf gutgeschrieben wird, als auch den Ruf-BP-Faktor
      // (nach `hit` steht `combat.zone` womöglich schon eine Bühne weiter).
      const killZone = combat.zone;
      // 1c: Ein Boss-Gate ab Bühne 50 würfelt GENAU EINMAL im Leben auf ein
      // Relikt — der Highwater in `relics` gattert das selbst, deshalb steht
      // dieser Aufruf (anders als der Truhen-Drop unten) NICHT hinter
      // `onFrontier`: Der Bot liest hier exakt dieselbe Regel wie das Spiel.
      // 2b: Jeder Boss-Kill zählt auf den Pfad des getragenen Skins — auch ein
      // wiederholtes Gate, exakt wie im Spiel (der Pfad misst Einsatz, nicht
      // Vorstoß; der Vorstoß hat mit dem Relikt-Highwater seinen eigenen Zähler).
      if (wasBoss) sim.pathBosses += 1;
      if (wasBoss) {
        const drop = gateRelicRoll(sim.relics, bossZone, sim.rng);
        if (drop.relics !== sim.relics) {
          // Der Bot trägt immer die drei bestgerollten (`relicScore`) — die
          // dokumentierte, build-blinde Auto-Wahl, kein Macht-Optimierer.
          sim.relics = drop.relic ? equipBestRelics(drop.relics) : drop.relics;
          sim.loadout = null; // getragene Relikte geändert ⇒ Fold neu rechnen
          if (drop.relic) sim.relicsFound += 1;
        }
      }
      const r = hit(combat, combat.hp);
      sim.gold += Math.floor(
        r.gold * goldMult * (stage?.f.gold ?? 1) * territoryGoldMult(sim.territory, killZone),
      );
      // 1b: Ruf entsteht NUR hier — ein Kill, ein Eintrag, auf dem Theme der
      // Bühne. Dieselbe Buchung wie in der Glue (`main.ts:onKillProgress`).
      sim.territory = addRep(sim.territory, themeForZone(killZone), repForKill(wasBoss));
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
        } else if (
          sim.rng.next() <
          rivalChestChance(luck) * (stage?.f.chest ?? 1) * truhenFokusChestMult(sim.heaven)
        ) {
          // A1 „Zähe Menge": doppelte Truhen-Chance auf dieser Bühne. P4
          // „Truhen-Fokus": dauerhaft ×1.5 obendrauf (×1 ohne Knoten).
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
    // 2a ★ „Zweiter Wind" wird hier BEWUSST NICHT gefaltet (`refundKills` bleibt 0) —
    // die ausführliche Begründung samt Messung steht im Modul-Kopf unter den
    // Ausschlüssen. Kurz: Der Bot fordert den Boss nach einem Fail SOFORT wieder
    // heraus (`challengeBoss`, zwei Zeilen tiefer) und überspringt dabei die
    // Rivalen-Welle der Boss-Bühne; drei erstattete Kills auf der Rückfall-Bühne
    // werden für ihn deshalb zu 30 % weniger Farm je Anlauf statt zu einem
    // Vorsprung. Das ist eine Eigenschaft seiner Retry-Strategie, nicht des Knotens.
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
    const buy = bestCrewBuy(sim.crew, sim.crewUp, sim.gilds, sim.gold, sim.crewMastery);
    if (buy === null) break;
    sim.gold -= buy.cost;
    if (buy.kind === 'level') {
      sim.crew[buy.id] = (sim.crew[buy.id] ?? 0) + 1;
      // 1a: JEDER gekaufte Level zählt in die Einsatz-XP — dieselbe Buchung wie
      // im Spiel (`ui/crew.ts`), damit der Bot dieselben Ränge erlebt.
      sim.crewMastery = addMastery(sim.crewMastery, buy.id, 1);
    } else sim.crewUp[buy.id] = (sim.crewUp[buy.id] ?? 0) + 1;
  }
  // 1a Legenden-Perk: die Gratis-Erststufe wird gutgeschrieben, sobald das Level
  // die Tier-1-Schwelle erreicht — dieselbe pure Funktion, die die Glue fährt.
  sim.crewUp = grantFreeMasteryTiers(sim.crew, sim.crewUp, sim.crewMastery).ups;
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
  globalSec: number,
): CombatState {
  const econ = econOn(config);
  const nowMs = globalSec * 1000;
  // 2b: Eine Sekunde Tragezeit auf den EINEN Skin des Bots. Sie wird auch dann
  // gebucht, wenn gerade nichts stirbt — genau wie im Spiel, wo die Tragezeit am
  // Tick hängt und nicht am Kill.
  sim.wearS += 1;
  // P4: Der Combo-Faktor wird je Sekunde aus dem AKTUELLEN Himmelsbaum gelesen —
  // die „Combo-Doktrin" kann mitten in einem Lauf gekauft werden (nach einer
  // Himmelfahrt), und ein einmal vor der Schleife berechneter Wert wäre dann stale.
  const combo = comboFactor(config, sim.heaven);
  if (econ) {
    tickPeach(sim, nowMs);
    tickGoblin(sim, nowMs); // A3 — kleiner Truhen-Faucet (80 % Fangquote)
  }
  // A1: „Krit-Funken" der Bühne, auf der gerade gekämpft wird. Auf einer
  // Boss-Bühne (und für jeden no-juice-Anker) ist der Zusatz 0.
  const stageCrit = combat.boss ? 0 : factorsForZone(combat.zone, combat.remix).crit;
  const crit = critFactor(
    config,
    sim.permTokens,
    sim.crewUp,
    stageCrit,
    sim.heaven,
    sim.constellation,
    simLoadout(sim),
  );
  const base = damageSplit(sim, config, combo, crit);
  // 2a ★ „Warm-up-Start": die ersten 60 s jeder Tour zählt der Klick-Anteil ×2
  // (dasselbe Kobold-Fenster wie im Spiel). Nur der KLICK-Term — der Buff ist
  // ein Klick-Buff, die Crew merkt nichts davon (P1).
  const warm = globalSec < sim.warmupUntilS ? GOBLIN_BUFF_MULT : 1;
  const dmg: DamageSplit = warm > 1 ? { ...base, click: base.click * warm } : base;
  const goldMult = goldMultiplierNow(sim, config, nowMs);
  const luck = chestLuckNow(sim);
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
  // 3c: Die beste-ROI-Heuristik der Zeremonie — Erbe ist, wer die meisten
  // Einsatz-XP trägt. Sie wird nach dem Kauf-Durchgang nachgeführt, weil sich
  // die Rangfolge mit jedem gekauften Level verschieben kann; im Spiel wählt
  // man einmal je Ära, hier bekommt der Bot bewusst die OBERGRENZE.
  if (sim.heirOn) sim.heir = bestHeir(sim.crewMastery);
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
  /**
   * Snapshot der Crew-Meisterschaft (1a) nach diesem Lauf: Lebenszeit-Level je
   * Mitglied. Kumulativ über die ganze Kette (kein Reset fasst sie an) — die
   * Messgröße, an der die Rang-Schwellen kalibriert sind (`npm run balance`).
   */
  mastery: CrewMastery;
  /**
   * Snapshot der Gebietsherrschaft (1b): Ruf je Theme nach diesem Lauf.
   * Kumulativ über die ganze Kette (kein Reset fasst sie an) — die Messgröße,
   * an der die Ruf-Kurve geeicht ist (`npm run balance`, Abschnitt 10).
   */
  territory: Territory;
  /** 2b: Der Pfad-Stand des getragenen Skins nach diesem Lauf (kumulativ). */
  skinPath: PathSummary;
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
  let combat = spawnFor(1, 0, 1, sim.remix);
  const timeToZone = new Map<number, number>([[1, 0]]);
  for (let t = 1; t <= seconds; t++) {
    const prevFrontier = combat.maxZone;
    combat = economyStep(sim, combat, config, tOffset + t);
    if (combat.maxZone > prevFrontier) {
      for (let z = prevFrontier + 1; z <= combat.maxZone; z++) {
        if (!timeToZone.has(z)) timeToZone.set(z, t);
        onFrontier?.(z, tOffset + t);
      }
    }
  }
  return {
    bestZone: combat.maxZone,
    timeToZone,
    seconds,
    econ: econSummary(sim),
    mastery: { ...sim.crewMastery },
    territory: { ...sim.territory },
    skinPath: pathSummary(sim),
  };
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
  /** Crew-Meisterschaft (1a) am Ende der Kette — Lebenszeit-Level je Mitglied. */
  mastery: CrewMastery;
  /** Gebietsherrschaft (1b) am Ende der Kette — Ruf je Bühnen-Theme. */
  territory: Territory;
  /**
   * Die kumulierte Loot-Ökonomie am Ende der Kette (sie überlebt jede Aszension).
   * Die 🧩-Zahl darin ist die Einkommens-Kurve, gegen die Splitter-Preise geeicht
   * werden (3b: die Umschul-Kosten) — `npm run balance` druckt sie aus.
   */
  econ: EconSummary;
  /** 2b: Der Pfad-Stand am Ende der Kette (kein Reset fasst ihn an). */
  skinPath: PathSummary;
}

/**
 * Play `runs` fixed-length runs, ascending between each (crew/gold reset; souls,
 * gilds, the loot economy and the lifetime record carry over — all meta). Mirrors the
 * §4.8 "45-min run-chain" measurement. `timeToLifetime` records the global time to
 * each new best zone for the endless-wall criterion (E2) and the §4.8 Bühne-80 target.
 */
export function simulateRunChain(config: SimConfig, runs: number, runSeconds: number): ChainResult {
  const sim = newSim(
    config.seed ?? 1,
    modsOn(config),
    config.constellation === true,
    config.forge === true,
    config.legend,
    config.skinPath === true,
    config.heir === true,
  );
  const summaries: RunSummary[] = [];
  const timeToLifetime = new Map<number, number>();
  let globalT = 0;
  let maxBestZone = 1;
  for (let r = 0; r < runs; r++) {
    sim.gold = 0;
    sim.crew = {};
    sim.crewUp = {};
    startTour(sim, globalT); // 2a: jede Tour startet mit Kapital + Warm-up
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
  return {
    runs: summaries,
    finalBank: sim.souls,
    maxBestZone,
    timeToLifetime,
    mastery: { ...sim.crewMastery },
    territory: { ...sim.territory },
    econ: econSummary(sim),
    skinPath: pathSummary(sim),
  };
}

/** Play a single fresh run (0 souls); the E4 active-vs-casual comparison unit. */
export function simulateSingleRun(config: SimConfig, seconds: number): RunResult {
  const sim = newSim(
    config.seed ?? 1,
    modsOn(config),
    config.constellation === true,
    config.forge === true,
    config.legend,
    config.skinPath === true,
    config.heir === true,
  );
  startTour(sim, 0); // 2a: Startkapital + Warm-up-Fenster der ersten Tour
  return runOnce(sim, seconds, config);
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
  /** Gehaltene HPF am Ende — was der Himmelsbaum in diesem Lauf überhaupt zu sehen bekam (P4). */
  hpfHeld: number;
  /** Σ im Himmelsbaum gekaufter Stufen (P4) — 0, solange die HPF für keinen Knoten reichen. */
  treeLevels: number;
  maxBestZone: number;
  finalBank: number;
  /** Whether the run stopped because souls stopped growing (the M9 wall, N1). */
  plateaued: boolean;
  /** Crew-Meisterschaft (1a) am Ende des Laufs — Lebenszeit-Level je Mitglied. */
  mastery: CrewMastery;
  /** Gebietsherrschaft (1b) am Ende des Laufs — Ruf je Bühnen-Theme. */
  territory: Territory;
  /**
   * Die kumulierte Loot-Ökonomie am Ende des Laufs. Für 1c ist genau DIESER
   * Treiber die ehrliche Messung: Er fährt den vollen Prestige-Stack und stößt
   * damit über die M9-Wand hinaus, während der Kettenlauf bei Bühne ~73 hängen
   * bleibt — und Relikte hängen nun einmal an der TIEFE, nicht an der Spielzeit.
   */
  econ: EconSummary;
  /** 2b: Der Pfad-Stand am Ende des Laufs. */
  skinPath: PathSummary;
  /**
   * 1d: Erreichte Legenden-Level. Nur im Nach-Transzendenz-Modus (`config.legend`
   * gesetzt) ungleich 0 — sonst hat der Bot nie transzendiert und verdient keins.
   * Die Zahl ist per Konstruktion identisch mit `himmelfahrten`.
   */
  legend: number;
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
  const sim = newSim(
    config.seed ?? 1,
    modsOn(config),
    config.constellation === true,
    config.forge === true,
    config.legend,
    config.skinPath === true,
    config.heir === true,
  );
  startTour(sim, 0); // 2a
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
    combat = economyStep(sim, combat, config, globalT);
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
      startTour(sim, globalT); // 2a: frische Tour ⇒ Startkapital + Warm-up
      combat = spawnFor(1, 0, 1, sim.remix);
      lastAdvanceT = globalT;
      ascensions++;
      if (opts.fullPrestige) {
        const combo = comboFactor(config, sim.heaven);
        const crit = critFactor(
          config,
          sim.permTokens,
          sim.crewUp,
          0,
          sim.heaven,
          sim.constellation,
          simLoadout(sim),
        );
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
          // P4: frisch gebankte HPF wandern (greedy, deterministisch) in den
          // Himmelsbaum — solange sie für den billigsten gelisteten Knoten reichen.
          buyTreeGreedy(sim);
          sim.souls = 0;
          sim.rsLifetime = 0;
          sim.ancients = {};
          sim.lifetimeMaxZone = 1;
          // 1d: Jede Himmelfahrt NACH der ersten Transzendenz zahlt genau ein
          // Legenden-Level. Der Bot transzendiert nie, also gilt das nur im
          // Nach-Transzendenz-Modus (`config.legend` gesetzt) — dieselbe eine
          // Regel wie in `ch-state.himmelfahrtState`.
          if (sim.postTranscend) sim.legend += 1;
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
    mastery: { ...sim.crewMastery },
    territory: { ...sim.territory },
    hpfHeld: sim.heaven.hpf,
    treeLevels: TREE_NODES.reduce((n, cfg) => n + treeLevel(sim.heaven, cfg.id), 0),
    maxBestZone: maxBest,
    finalBank: sim.souls,
    plateaued,
    econ: econSummary(sim),
    skinPath: pathSummary(sim),
    legend: sim.legend,
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
  const loadout = simLoadout(sim);
  const meta = simMeta(sim);
  let guard = 300;
  for (;;) {
    if (guard-- <= 0) break;
    const p0 = powerFor(
      sim.crew,
      sim.crewUp,
      sim.crewMastery,
      sim.gilds,
      sim.souls,
      sim.ancients,
      sim.heaven,
      sim.constellation,
      config,
      combo,
      crit,
      permTokens,
      shardIdle,
      loadout,
      meta,
    );
    let bestId: string | null = null;
    let bestPower = p0;
    for (const cfg of ANCIENTS) {
      if (!canBuyAncient(sim.ancients, sim.souls, cfg.id)) continue;
      const r = buyAncient(sim.ancients, sim.souls, cfg.id);
      const p = powerFor(
        sim.crew,
        sim.crewUp,
        sim.crewMastery,
        sim.gilds,
        r.souls,
        r.ancients,
        sim.heaven,
        sim.constellation,
        config,
        combo,
        crit,
        permTokens,
        shardIdle,
        loadout,
        meta,
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

/**
 * **Der Himmelsbaum-Einkaufszettel des Bots (ROADMAP-V2 P4).** Nach jeder
 * Himmelfahrt kauft der `fullPrestige`-Treiber greedy die GÜNSTIGSTE gerade
 * verfügbare Stufe aus dieser Liste (`cheapestTreeBuy`), bis nichts mehr bezahlbar
 * ist. Zwei bewusste Entscheidungen stecken darin:
 *
 * 1. **Nur modellierte Knoten.** Gelistet ist genau, was der Bot auch RECHNET —
 *    Klick/Crew-Faktoren, Krit, Combo, BP, Truhen-/Pfirsich-Takt. Die Utility-Knoten
 *    (Nachtschicht/Offline-Cap, Ekstase-Ausdauer, Frühstarter, Gate-Crasher/Boss-Uhr,
 *    Beat-Gefühl, Combo-Gedächtnis, Twerk-Coach) fehlen absichtlich: ihre Wirkung ist
 *    im Bot ×1 (er geht nie offline, zündet keine Ekstase, klickt ungetaktet und
 *    modelliert die Boss-Uhr-Boni nirgends), ein Kauf würde also nur den
 *    +2 %/HPF-Globalmult wegnehmen und die Anker künstlich pessimistisch machen.
 *    Dieselbe Untergrenzen-Logik wie bei Twerk-Ekstase und den Boss-Schadens-Mults
 *    (siehe Modul-Kopf): weglassen darf nur, was den echten Spieler beschleunigt.
 * 2. **Deterministische Doktrin-Wahl.** Beide Seiten jedes Exklusiv-Paares stehen
 *    drin, aber die DPS-lastige zuerst — bei gleichem Preis (35/35) entscheidet die
 *    Reihenfolge in `cheapestTreeBuy`, also greift der Bot reproduzierbar zur
 *    Crew-Doktrin (+25 % Crew-DPS), zur Combo-Doktrin (Cap ×1.3, der einzige der
 *    beiden Ritual-Knoten, den er überhaupt spürt) und zum Truhen-Fokus (Truhen →
 *    Token → DPS, während der Pfirsich nur BP beschleunigt). Der jeweils andere
 *    Knoten ist danach durch die Exklusiv-Sperre ohnehin zu — der Bot fährt also
 *    einen echten Build, nicht das ganze Board.
 */
export const SIM_TREE_PRIORITY: readonly string[] = [
  'crewdoktrin',
  'klickdoktrin',
  'combodoktrin',
  'ekstasedoktrin',
  'truhenfokus',
  'pfirsichfokus',
  'schwererbass',
  'goldenehande',
  'praezisionsshake',
  'truhenmagnet',
  'pfirsichreife',
];

/**
 * Spend held HPF on the Himmelsbaum: cheapest affordable level first, exclusive
 * pairs resolved deterministically (see `SIM_TREE_PRIORITY`). Bounded; a no-op while
 * the bot holds too few HPF for the cheapest node — which is exactly what happens at
 * the E2 wall (1 HPF), so the anchors stay where they were until a run gets deep
 * enough to actually afford a node.
 */
function buyTreeGreedy(sim: Sim): void {
  sim.heaven = greedyTreeSpend(sim.heaven, SIM_TREE_PRIORITY);
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
  const sim = newSim(
    config.seed ?? 1,
    modsOn(config),
    config.constellation === true,
    config.forge === true,
    config.legend,
    config.skinPath === true,
    config.heir === true,
  );
  startTour(sim, 0); // 2a
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
    combat = economyStep(sim, combat, config, globalT);
    // Reset the stall timer whenever THIS run's frontier advances (incl. re-climbing
    // a cleared zone), not only on a new lifetime record — otherwise the bot ascends
    // mid-climb and never gets deep.
    if (combat.maxZone > prevFrontier) lastAdvanceT = globalT;
    if (combat.maxZone > maxBestZone) maxBestZone = combat.maxZone;

    const combo = comboFactor(config, sim.heaven);
    const crit = critFactor(
      config,
      sim.permTokens,
      sim.crewUp,
      0,
      sim.heaven,
      sim.constellation,
      simLoadout(sim),
    );
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
      startTour(sim, globalT); // 2a: frische Tour ⇒ Startkapital + Warm-up
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
      sim.crewMastery,
      sim.gilds,
      rsLifetime,
      sim.ancients,
      heaven,
      sim.constellation,
      config,
      combo,
      crit,
      sim.permTokens,
      shardGearIdleMult(sim.shards),
      simLoadout(sim),
    );
    audit(power);
  }

  return { maxZone: combat.maxZone, maxMagnitude, allFinite, belowCeiling, minGainRatio };
}
