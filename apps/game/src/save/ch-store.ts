/**
 * Persistence for the Clicker-Heroes mode — self-contained, versioned, and
 * behind its own localStorage key so the legacy save layer (and its tests) stays
 * untouched. Never throws; injectable storage for node unit tests.
 */
import { type AbilityState, ABILITY_CHARGE_MAX, createAbility } from '../game/ability';
import { type AncientLevels, createAncients } from '../game/ancients';
import {
  CHEST_SKINS,
  type ChestTier,
  type PermTokens,
  createPermTokens,
  normalizePity,
} from '../game/chests';
import { goldFor, monsterHp } from '../game/combat';
import {
  type ChStats,
  type ChState,
  type ChestsState,
  type ComboSave,
  type PeachState,
  createChests,
  createComboSave,
  createPeach,
  createStats,
} from '../game/ch-state';
import { type GearState, KULISSE_BUFFS, createGear } from '../game/gear';
import { type Gilds, createGilds } from '../game/gild';
import { COACH_CLICK_SHARE, type HeavenState, createHeaven } from '../game/heaven';
import {
  type CrewLevels,
  type CrewUps,
  CREW,
  abilityTiersUnlocked,
  createCrewUps,
  retrainSlotOrdinal,
} from '../game/heroes';
import { type CrewMastery, createMastery } from '../game/mastery';
import {
  type CrewRetrain,
  type RetrainRolls,
  createRetrain,
  createRetrainRolls,
  isSpecialKind,
} from '../game/retrain';
import {
  DAILY_QUEST_SLOTS,
  MAX_REROLLS,
  STREAK_MAX,
  type MetaState,
  type QuestProgress,
  createMeta,
  isQuestId,
} from '../game/quests';
import { isAchievementId } from '../game/ch-achievements';
import {
  type ConstellationState,
  CONSTELLATION_NODE_COUNT,
  CONSTELLATIONS,
  constellationSpend,
  createConstellation,
  dustEntitlement,
} from '../game/constellation';
import {
  type StageStars,
  STAR_MILESTONE,
  createStageStars,
  starMaskFor,
  totalStars,
} from '../game/stars';
import { type Territory, ZONE_THEMES, createTerritory } from '../game/territory';
import { FORGE_SLOTS, RELIC_MAX_AFFIXES, RELIC_SLOTS, clampQuality } from '../game/affixes';
import {
  type Relic,
  type RelicsState,
  RELIC_MIN_ZONE,
  createRelics,
  isRolledAffix,
} from '../game/relics';
import { type ForgeSlot, type ForgeState, createForge } from '../game/forge';
import { type TranscendState, createTranscend } from '../game/transcend';
import { SKINS } from '../character/skins';
import type { BackgroundKey, SkinKey } from '../types';
import { createRngState, type RngState } from '../util/rng';

export const CH_SAVE_KEY = 'bootyclicker.ch';
export const CH_SCHEMA = 17;

/** Idle earnings: crew farms the current zone at reduced efficiency, hard-capped. */
export const OFFLINE_CAP_S = 8 * 3600;
export const OFFLINE_EFF = 0.5;

export interface ChStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The v1 persisted shape (MVP): the original ChState slice + envelope, defined
 * explicitly so the migration chain has a real predecessor even though the live
 * `ChState` has since grown (rng/stats/legacyImported).
 */
export interface ChSaveV1 {
  v: 1;
  lastSeen: number;
  gold: number;
  zone: number;
  killsThisZone: number;
  runMaxZone: number;
  crew: CrewLevels;
  souls: number;
  lifetimeMaxZone: number;
  totalClicks: number;
}

/** The current persisted shape (v17, Relikte & Skin-Schmiede): ChState + envelope. */
interface ChSaveLatest extends ChState {
  v: typeof CH_SCHEMA;
  lastSeen: number;
}

function defaultStorage(): ChStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Never-throw validation of a stored CH save (the v5 guard). The gameplay-
 * critical fields are checked strictly (a corrupt one ⇒ reject ⇒ fresh start).
 * The meta/juice fields (rng/stats/legacyImported/ability/combo/gilds/rsLifetime/
 * ancients/heaven/gear/chests/permTokens/peach/meta/achievements/transcend/
 * stageStars/crewMastery/crewRetrain/constellation/territory/relics/forge) are
 * deliberately NOT gated here: they are runtime bookkeeping and get repaired (fresh
 * seed / zeroed stats / false flag / default ability+combo / pruned gilds / clamped
 * highwater / sanitised ancients+heaven+gear / defaulted loot slices / defaulted
 * meta / pruned achievements / sanitised transcend / masked star bits) in `stateFromSave` — the same
 * "repair, don't nuke progress" spirit as
 * the runMaxZone invariant. Per-field type+range checks for them live in the `repair*`
 * helpers below.
 */
export function isChSave(raw: unknown): raw is ChSaveLatest {
  if (!isRecord(raw)) return false;
  if (raw.v !== CH_SCHEMA) return false;
  if (!isFiniteNumber(raw.gold) || raw.gold < 0) return false;
  if (!isNonNegInt(raw.zone) || raw.zone < 1) return false;
  if (!isNonNegInt(raw.killsThisZone)) return false;
  if (!isNonNegInt(raw.runMaxZone) || raw.runMaxZone < 1) return false;
  if (!isRecord(raw.crew)) return false;
  for (const v of Object.values(raw.crew)) if (!isNonNegInt(v)) return false;
  if (!isNonNegInt(raw.souls)) return false;
  if (!isNonNegInt(raw.lifetimeMaxZone) || raw.lifetimeMaxZone < 1) return false;
  if (!isNonNegInt(raw.totalClicks)) return false;
  if (!isFiniteNumber(raw.lastSeen) || raw.lastSeen <= 0) return false;
  return true;
}

/** Serialize state + timestamp to a JSON string. */
export function serializeCh(state: ChState, now: number): string {
  const save: ChSaveLatest = { v: CH_SCHEMA, lastSeen: now, ...state };
  return JSON.stringify(save);
}

/** Repair the persisted RNG slice: a corrupt/absent value ⇒ a fresh random seed. */
function repairRng(v: unknown): RngState {
  if (isRecord(v) && isFiniteNumber(v.seed) && Number.isInteger(v.seed) && isNonNegInt(v.cursor)) {
    return { seed: v.seed | 0, cursor: v.cursor };
  }
  return createRngState();
}

/** Repair the persisted stats slice: missing/negative/non-finite counters ⇒ 0. */
function repairStats(v: unknown): ChStats {
  const src = isRecord(v) ? v : {};
  const num = (x: unknown): number => (isFiniteNumber(x) && x >= 0 ? x : 0);
  return {
    crits: num(src.crits),
    onBeatClicks: num(src.onBeatClicks),
    bossKills: num(src.bossKills),
    bossTimeouts: num(src.bossTimeouts),
    goldLifetime: num(src.goldLifetime),
    playTimeS: num(src.playTimeS),
    // v8 counters — absent in older saves ⇒ 0 (§7.5).
    ascensions: num(src.ascensions),
    chestsOpened: num(src.chestsOpened),
    maxCombo: num(src.maxCombo),
    bossStreak: num(src.bossStreak),
    maxBossStreak: num(src.maxBossStreak),
    keysEarned: num(src.keysEarned),
  };
}

/** Repair the persisted ability slice: corrupt/absent ⇒ a fresh (empty) ability. */
function repairAbility(v: unknown): AbilityState {
  if (isRecord(v) && isFiniteNumber(v.charge) && isFiniteNumber(v.frenzyUntil)) {
    const cooldowns: Record<string, number> = {};
    if (isRecord(v.cooldowns)) {
      for (const [k, val] of Object.entries(v.cooldowns))
        if (isFiniteNumber(val)) cooldowns[k] = val;
    }
    return {
      charge: Math.max(0, Math.min(ABILITY_CHARGE_MAX, v.charge)),
      frenzyUntil: v.frenzyUntil >= 0 ? v.frenzyUntil : 0,
      cooldowns,
    };
  }
  return createAbility();
}

/** Repair the persisted combo slice: corrupt/absent/negative stacks ⇒ 0. */
function repairCombo(v: unknown): ComboSave {
  if (isRecord(v) && isFiniteNumber(v.stacks) && v.stacks >= 0) return { stacks: v.stacks };
  return createComboSave();
}

/** Repair the persisted gilds slice: keep only non-negative-int counts, else empty (v4). */
function repairGilds(v: unknown): Gilds {
  if (!isRecord(v)) return createGilds();
  const out: Gilds = {};
  for (const [id, n] of Object.entries(v)) if (isNonNegInt(n) && n > 0) out[id] = n;
  return out;
}

/** Repair the persisted lifetime-RS highwater: non-negative finite, else 0 (v4). */
function repairRsLifetime(v: unknown): number {
  return isFiniteNumber(v) && v >= 0 ? v : 0;
}

/** Repair the persisted Ancient levels: keep only positive-int levels, else empty (v5). */
function repairAncients(v: unknown): AncientLevels {
  if (!isRecord(v)) return createAncients();
  const out: AncientLevels = {};
  for (const [id, n] of Object.entries(v)) if (isNonNegInt(n) && n > 0) out[id] = n;
  return out;
}

/** Repair the persisted L2 (heaven) slice: sanitise each field, else defaults (v5). */
function repairHeaven(v: unknown): HeavenState {
  if (!isRecord(v)) return createHeaven();
  const nn = (x: unknown): number => (isFiniteNumber(x) && x >= 0 ? x : 0);
  const tree: Record<string, number> = {};
  if (isRecord(v.tree)) {
    for (const [id, n] of Object.entries(v.tree)) if (isNonNegInt(n) && n > 0) tree[id] = n;
  }
  const hpfLifetime = nn(v.hpfLifetime);
  // Held HPF can never exceed what was ever earned.
  const hpf = Math.min(nn(v.hpf), hpfLifetime);
  return { hpf, hpfLifetime, ascensions2: nn(v.ascensions2), tree };
}

/** Keep only non-negative-finite level/star counts (junk values dropped), else empty. */
function repairCountMap(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(v)) if (isFiniteNumber(n) && n >= 0) out[id] = Math.floor(n);
  return out;
}

/**
 * Repair the persisted gear slice (v6): each sub-field is validated with
 * `Object.hasOwn` discipline and, if corrupt/absent, falls to its `createGear`
 * default — a bad `skin`/`bg` key, non-boolean `bgAuto`, junk level/star maps,
 * negative shards/sugar or a NaN `nextSugarAt` are all repaired **in isolation**,
 * so real progress (valid levels/stars) is never nuked. A wholly non-object gear
 * (or missing gear) becomes a fresh `createGear()`. Never throws.
 */
function repairGear(v: unknown): GearState {
  const def = createGear();
  if (!isRecord(v)) return def;
  // `Object.hasOwn`, not `in` — a save with skin:"toString" must not sneak through.
  const skin: SkinKey =
    typeof v.skin === 'string' && Object.hasOwn(SKINS, v.skin) ? (v.skin as SkinKey) : def.skin;
  const bg: BackgroundKey =
    typeof v.bg === 'string' && Object.hasOwn(KULISSE_BUFFS, v.bg)
      ? (v.bg as BackgroundKey)
      : def.bg;
  const bgAuto = typeof v.bgAuto === 'boolean' ? v.bgAuto : def.bgAuto;
  const shards = isFiniteNumber(v.shards) && v.shards >= 0 ? Math.floor(v.shards) : def.shards;
  const sugarPeaches =
    isFiniteNumber(v.sugarPeaches) && v.sugarPeaches >= 0
      ? Math.floor(v.sugarPeaches)
      : def.sugarPeaches;
  const nextSugarAt =
    isFiniteNumber(v.nextSugarAt) && v.nextSugarAt >= 0 ? v.nextSugarAt : def.nextSugarAt;
  // Craft latch: keep only real skin keys (deduped); junk/absent ⇒ empty (§5.3).
  // `Object.hasOwn`, not `in` — a crafted:["toString"] must not sneak through.
  const crafted = Array.isArray(v.crafted)
    ? [
        ...new Set(
          v.crafted.filter(
            (id): id is string => typeof id === 'string' && Object.hasOwn(SKINS, id),
          ),
        ),
      ]
    : def.crafted;
  // Never-resetting deepest-zone latch (unlock gating, §5.3). Absent in older v6
  // saves ⇒ default 1; the unlock context also floors with `lifetimeMaxZone`, so
  // nothing is lost for pre-latch saves.
  const zoneEver =
    isFiniteNumber(v.zoneEver) && v.zoneEver >= 1 ? Math.floor(v.zoneEver) : def.zoneEver;
  return {
    skin,
    bg,
    bgAuto,
    skinLevels: repairCountMap(v.skinLevels),
    skinStars: repairCountMap(v.skinStars),
    shards,
    sugarPeaches,
    nextSugarAt,
    crafted,
    zoneEver,
  };
}

const CHEST_SKIN_IDS: ReadonlySet<string> = new Set(CHEST_SKINS.map((s) => s.id));

/** Sanitise one chest/key count: a non-negative integer, else 0. */
function repairCount(v: unknown): number {
  return isFiniteNumber(v) && v >= 0 ? Math.floor(v) : 0;
}

/**
 * Repair the persisted loot slice (v7, §6): 🔑 + per-tier chest counts are clamped
 * to non-negative ints, the pity map is normalised (all four tiers ≥ 0 via
 * `normalizePity`), and owned chest-skins are filtered to real catalog ids (deduped;
 * junk/prototype keys dropped, mirroring `repairGear.crafted`). A wholly non-object
 * (or absent) loot slice becomes a fresh `createChests()`. Never throws; a corrupt
 * loot slice repairs to defaults and never nukes real progress on other slices.
 */
function repairChests(v: unknown): ChestsState {
  const def = createChests();
  if (!isRecord(v)) return def;
  const invSrc = isRecord(v.inventory) ? v.inventory : {};
  const inventory = {
    wood: repairCount(invSrc.wood),
    gold: repairCount(invSrc.gold),
    diamond: repairCount(invSrc.diamond),
    mythic: repairCount(invSrc.mythic),
  } satisfies Record<ChestTier, number>;
  const skins = Array.isArray(v.skins)
    ? [
        ...new Set(
          v.skins.filter((id): id is string => typeof id === 'string' && CHEST_SKIN_IDS.has(id)),
        ),
      ]
    : def.skins;
  return {
    keys: repairCount(v.keys),
    inventory,
    pity: normalizePity(isRecord(v.pity) ? v.pity : null),
    skins,
  };
}

/** Repair the permanent-token slice (v7, §6.2): keep only positive-int counts, else empty. */
function repairPermTokens(v: unknown): PermTokens {
  if (!isRecord(v)) return createPermTokens();
  const out: PermTokens = {};
  for (const [id, n] of Object.entries(v)) if (isNonNegInt(n) && n > 0) out[id] = n;
  return out;
}

/**
 * Repair the Golden-Peach slice (v7, §6.1): `nextPeachAt`/`boostUntil` must be
 * finite and ≥ 0 (negative/NaN ⇒ 0). The absurd-future clamp (clock set forward,
 * then back) is deferred to the boot glue, which re-rolls `nextPeachAt` and clamps
 * `boostUntil` via `clampBoostUntil` (≤ 24 h ahead — chest boosts legitimately stack
 * the window far past 60 s, §6.2) — same spirit as the sugar timer (§9.2.2). Never throws.
 */
function repairPeach(v: unknown): PeachState {
  if (!isRecord(v)) return createPeach();
  const nn = (x: unknown): number => (isFiniteNumber(x) && x >= 0 ? x : 0);
  return { nextPeachAt: nn(v.nextPeachAt), boostUntil: nn(v.boostUntil) };
}

/**
 * Repair the persisted retention-meta slice (v8, §7.1/§7.2): each field is
 * validated in ISOLATION — a bad `questIds`/`questProgress`/`questsClaimed` (junk
 * ids, negative progress) is pruned to real catalog ids/non-negative ints, the day
 * high-waters and streak are range-clamped, and a wholly non-object meta becomes a
 * fresh `createMeta()`. Never throws; a corrupt meta slice repairs to defaults and
 * never nukes real progress on other slices.
 */
function repairMeta(v: unknown): MetaState {
  const def = createMeta();
  if (!isRecord(v)) return def;
  const int = (x: unknown, fallback: number): number =>
    isFiniteNumber(x) && Number.isInteger(x) ? x : fallback;
  const questIds = Array.isArray(v.questIds)
    ? [...new Set(v.questIds.filter(isQuestId))].slice(0, DAILY_QUEST_SLOTS)
    : def.questIds;
  const questProgress: QuestProgress = {};
  if (isRecord(v.questProgress)) {
    for (const [id, n] of Object.entries(v.questProgress)) {
      if (isQuestId(id) && isFiniteNumber(n) && n >= 0) questProgress[id] = Math.floor(n);
    }
  }
  const questsClaimed = Array.isArray(v.questsClaimed)
    ? [...new Set(v.questsClaimed.filter(isQuestId))]
    : def.questsClaimed;
  const rerollsUsed = Math.max(0, Math.min(MAX_REROLLS, int(v.rerollsUsed, 0)));
  const streak = Math.max(0, Math.min(STREAK_MAX, int(v.streak, 0)));
  return {
    day: int(v.day, def.day),
    questIds,
    questProgress,
    questsClaimed,
    rerollsUsed,
    streak,
    lastLoginDay: int(v.lastLoginDay, def.lastLoginDay),
    streakProtectWeek: int(v.streakProtectWeek, def.streakProtectWeek),
    // A5 (v12): das Wochen-Paar. Beide Felder werden hier nur auf „ganze Zahl"
    // repariert — ein Index aus der Zukunft (verstellte Uhr) ist harmlos, weil
    // `noteWeeklyBest` beim nächsten Vergleich schlicht die Woche wechselt.
    weekIndex: int(v.weekIndex, def.weekIndex),
    weekBestZone: Math.max(0, int(v.weekBestZone, def.weekBestZone)),
  };
}

/** Repair the persisted achievements slice (v8, §7.3): keep only real catalog ids (deduped). */
function repairAchievements(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(isAchievementId))];
}

/**
 * Repair the persisted L3 (transcend) slice (v9, §4.5.3): `te`/`teLifetime`/
 * `transcendences` are clamped to non-negative finite (junk/NaN/negative ⇒ 0), the
 * `mythos` spent-ledger runs through the shared count-map repair, and a wholly
 * non-object (or absent) slice becomes a fresh `createTranscend()`. The held-vs-earned
 * invariant `teLifetime ≥ te` is restored by LIFTING the earned highwater to at least
 * the held balance (`max(teLifetime, te)`) — the non-nuking direction: it never
 * discards held TE (a dropped/zeroed `teLifetime` field must not erase real power),
 * unlike `repairHeaven` which clamps held HPF DOWN because held HPF is spent in a tree
 * that can't exceed the earned total. Never throws; isolates corruption to this slice.
 */
function repairTranscend(v: unknown): TranscendState {
  if (!isRecord(v)) return createTranscend();
  const nn = (x: unknown): number => (isFiniteNumber(x) && x >= 0 ? x : 0);
  // Floor + cap all counters (defense-in-depth): a corrupt/crafted save with a
  // fractional te (×3^2.5) or an absurd te (1e300 ⇒ transcendGlobalMult = Infinity ⇒
  // dpsOf = Infinity) is neutralised. `teForHpfLifetime` can never legitimately exceed
  // ⌊log10(Number.MAX_VALUE)⌋ = 308, so cap held/earned TE there; the mult stays finite.
  const cap = 308;
  const te = Math.min(Math.floor(nn(v.te)), cap);
  // Held TE can never exceed what was ever earned; lift the highwater, don't nuke held.
  const teLifetime = Math.min(Math.max(Math.floor(nn(v.teLifetime)), te), cap);
  const transcendences = Math.floor(nn(v.transcendences));
  return { te, teLifetime, transcendences, mythos: repairCountMap(v.mythos) };
}

/**
 * Repair the bought-ability ledger (v10): non-negative integer counts, and each
 * hero's bought count clamped to what its LEVEL has actually unlocked
 * (`abilityTiersUnlocked`) — a crafted save cannot hold abilities its levels
 * never reached. Junk/absent ⇒ fresh empty ledger. Never throws.
 */
function repairCrewUps(v: unknown, crew: Record<string, number>): CrewUps {
  if (!isRecord(v)) return createCrewUps();
  const out: CrewUps = {};
  for (const cfg of CREW) {
    const raw = v[cfg.id];
    if (!isFiniteNumber(raw) || raw <= 0) continue;
    const unlocked = abilityTiersUnlocked(crew[cfg.id] ?? 0);
    const n = Math.min(Math.floor(raw), unlocked);
    if (n > 0) out[cfg.id] = n;
  }
  return out;
}

/**
 * Repair die Crew-Meisterschaft (v13, 1a): je Mitglied ein nicht-negativer
 * ganzzahliger Lebenszeit-Zähler; Müll-Ids (kein Crew-Mitglied), negative,
 * gebrochene und nicht-endliche Werte fallen raus, eine komplett kaputte Tafel
 * wird leer.
 *
 * Bewusst NICHT gegen den aktuellen `crew`-Stand geklemmt — anders als beim
 * Fähigkeits-Ledger (`repairCrewUps`, wo ein gebastelter Save sich sonst
 * ungekaufte Stufen erschwindeln könnte) gibt es hier keine Richtung, in der ein
 * Vergleich stimmt: Nach jedem Reset steht das Level auf 0, während die
 * Lebenszeit-Zahl hoch bleibt (das ist der ganze Sinn), und umgekehrt kann ein
 * Level aus GESCHENKTEN Quellen stammen (Himmelsbaum-„Frühstarter", Mythos-
 * „Frühstart"), die nie Einsatz-XP gezahlt haben. Ein Highwater darf ohnehin nur
 * wachsen; nach unten zu korrigieren hieße, echten Fortschritt zu nuken.
 */
function repairCrewMastery(v: unknown): CrewMastery {
  if (!isRecord(v)) return createMastery();
  const out: CrewMastery = {};
  for (const cfg of CREW) {
    const raw = v[cfg.id];
    if (!isFiniteNumber(raw) || raw <= 0) continue;
    const n = Math.floor(raw);
    if (n > 0) out[cfg.id] = n;
  }
  return out;
}

/**
 * Repair die Crew-Umschulung (v14, 3b): die Override-Map wird gegen die REGELN
 * gelesen, nicht nur gegen Typen — ein Eintrag überlebt nur, wenn
 *
 *  · die Mitglieds-Id ein echtes Crew-Mitglied ist,
 *  · der Stufen-Schlüssel eine positive ganze Zahl in Normalform ist („4", nicht
 *    „04"/„4.0" — sonst zeigten zwei Schlüssel auf denselben Slot),
 *  · diese Stufe im Rhythmus des Mitglieds WIRKLICH ein Spezial-Slot ist
 *    (`retrainSlotOrdinal > 0`) und
 *  · der Wert eine echte Spezial-Sorte ist (nie `power`).
 *
 * Der dritte Punkt ist der eigentliche Schutz: Ohne ihn könnte ein
 * handgeschriebener Save eine POWER-Stufe zur Spezial-Stufe erklären und damit
 * das 2P+2S-Verhältnis kippen — die eine Leitplanke, die 3b nicht anfassen darf.
 * Bewusst NICHT gegen `crewUp` geklemmt: Nach jedem Reset steht der Ledger auf 0,
 * während die erkaufte Sorte bleibt (genau ihr Sinn). Nie werfend; eine komplett
 * kaputte Map wird leer.
 */
function repairCrewRetrain(v: unknown): CrewRetrain {
  if (!isRecord(v)) return createRetrain();
  const out: CrewRetrain = {};
  for (const cfg of CREW) {
    const slots = v[cfg.id];
    if (!isRecord(slots)) continue;
    const clean: CrewRetrain[string] = {};
    let any = false;
    for (const [key, kind] of Object.entries(slots)) {
      const tier = Number(key);
      if (!Number.isInteger(tier) || tier < 1 || String(tier) !== key) continue;
      if (retrainSlotOrdinal(cfg, tier) <= 0) continue; // niemals auf eine Power-Stufe
      if (!isSpecialKind(kind)) continue;
      clean[key] = kind;
      any = true;
    }
    if (any) out[cfg.id] = clean;
  }
  return out;
}

/**
 * Repair den Umschul-Eskalator (v14, 3b): je Mitglied eine nicht-negative ganze
 * Zahl. Nur echte Crew-Ids, Müll fällt raus. Ein zu HOHER Zähler schadet nur
 * seinem Besitzer (teurere Rolls), deshalb wird er nicht gedeckelt — und ein zu
 * niedriger ist ohnehin nach der nächsten Aszension die Wahrheit.
 */
function repairRetrainRolls(v: unknown): RetrainRolls {
  if (!isRecord(v)) return createRetrainRolls();
  const out: RetrainRolls = {};
  for (const cfg of CREW) {
    const raw = v[cfg.id];
    if (!isFiniteNumber(raw) || raw <= 0) continue;
    const n = Math.floor(raw);
    if (n > 0) out[cfg.id] = n;
  }
  return out;
}

/**
 * Repair the Bühnen-Sterne slice (v11, P1): keep only entries whose KEY is a real
 * zone number (positive integer) and mask each value down to the bits that zone can
 * actually carry (`starMaskFor` — a Nicht-Boss-Bühne has no timeout star), dropping
 * empty/junk entries entirely. So a hand-edited „alle Bühnen 7 Sterne"-Blob keeps at
 * most what the rules allow, and a corrupt slice repairs to an empty collection
 * instead of nuking anything else. Never throws.
 */
function repairStageStars(v: unknown): StageStars {
  if (!isRecord(v)) return createStageStars();
  const out: StageStars = {};
  for (const [key, raw] of Object.entries(v)) {
    const zone = Number(key);
    if (!Number.isInteger(zone) || zone < 1 || String(zone) !== key) continue;
    if (!isFiniteNumber(raw) || raw <= 0) continue;
    const mask = Math.floor(raw) & starMaskFor(zone);
    if (mask > 0) out[key] = mask;
  }
  return out;
}

/**
 * Repair the milestone highwater (v11, P1): a non-negative integer, floored to a
 * whole `STAR_MILESTONE` block (the glue only ever writes multiples). Deliberately
 * NOT clamped down to what the stored stars justify — an inflated highwater only
 * costs its own owner chests, while clamping it would re-pay milestones a crafted
 * save already collected.
 */
function repairStarsAwarded(v: unknown): number {
  if (!isFiniteNumber(v) || v <= 0) return 0;
  return Math.floor(v / STAR_MILESTONE) * STAR_MILESTONE;
}

/**
 * Repair die Legenden-Konstellation (v15, 2a). Drei Regeln, jede an ihrem
 * eigenen Rand:
 *
 *  · **Die Ketten sind die Wahrheit.** Jede Linie wird auf 0 …
 *    {@link CONSTELLATION_NODE_COUNT} geklemmt, unbekannte Linien-Ids fallen
 *    weg — mehr Form gibt es nicht zu prüfen, weil eine streng lineare Kette
 *    keine Lücke darstellen kann.
 *  · **`spent` wird NEU GERECHNET** (`constellationSpend`) statt gelesen: Der
 *    Ausgabe-Stand ist eine Funktion der Ketten, und zwei Quellen für dieselbe
 *    Zahl driften irgendwann auseinander. Ein Save, der weniger behauptet, als
 *    seine Knoten kosten, kann sich damit keinen Rabatt erschwindeln.
 *  · **`earned` wird nach OBEN korrigiert** (`max(earned, spent)`) — dieselbe
 *    Richtung wie bei `repairTranscend`: Was gekauft ist, war offenbar bezahlt;
 *    die Knoten wegzunehmen wäre das Nuken echten Fortschritts. Nach unten
 *    korrigiert nie jemand: `earned` ist ein Highwater, und die Boot-Synchro
 *    (`syncDust`) hebt ihn ohnehin sofort wieder auf den Anspruch aus Sternen,
 *    Erfolgen und Boss-Gates.
 *
 * Nie werfend; ein komplett kaputter Slice wird ein frischer, leerer Baum.
 */
function repairConstellation(v: unknown): ConstellationState {
  if (!isRecord(v)) return createConstellation();
  const nodes: Record<string, number> = {};
  const src = isRecord(v.nodes) ? v.nodes : {};
  for (const cfg of CONSTELLATIONS) {
    const raw = src[cfg.id];
    if (!isFiniteNumber(raw) || raw <= 0) continue;
    const n = Math.min(CONSTELLATION_NODE_COUNT, Math.floor(raw));
    if (n > 0) nodes[cfg.id] = n;
  }
  const spent = constellationSpend(nodes);
  const earned = Math.max(
    isFiniteNumber(v.earned) && v.earned > 0 ? Math.floor(v.earned) : 0,
    spent,
  );
  return { earned, spent, nodes };
}

/**
 * Repair die Gebietsherrschaft (v16, 1b): je Theme ein nicht-negativer
 * ganzzahliger Lebenszeit-Zähler. Nur die VIER echten Bühnen-Themen
 * (`ZONE_THEMES`) bekommen ein Konto — ein erfundener Schlüssel („vegas") hätte
 * keine Bühne, auf der er je wirken könnte, und würde die Leiste nur verwässern.
 *
 * Bewusst in KEINE Richtung an den Spielstand geklemmt (wie `repairCrewMastery`,
 * anders als `repairCrewUps`): Ein Ruf-Zähler ist ein Highwater über ALLE Touren,
 * während `zone`/`lifetimeMaxZone` nach Himmelfahrt und Transzendenz auf 1
 * zurückfallen — es gibt schlicht keine Zahl im Save, gegen die ein Vergleich
 * stimmen würde. Ein zu hoher Zähler ist außerdem harmlos gedeckelt: Die Wirkung
 * endet bei Stufe 10 (+15 % BP auf den eigenen Bühnen), egal wie groß die Zahl
 * darunter ist. Nie werfend; eine komplett kaputte Tafel wird leer.
 */
function repairTerritory(v: unknown): Territory {
  if (!isRecord(v)) return createTerritory();
  const out: Territory = {};
  for (const theme of ZONE_THEMES) {
    const raw = v[theme];
    if (!isFiniteNumber(raw) || raw <= 0) continue;
    const n = Math.floor(raw);
    if (n > 0) out[theme] = n;
  }
  return out;
}

/**
 * Repair die **Relikte** (v17, 1c). Fünf Regeln, jede an ihrem eigenen Rand:
 *
 *  · **Ein Relikt überlebt nur vollständig.** Positive ganzzahlige Id, echte
 *    Katalog-Sorten, Qualität auf 0…3 geklemmt, höchstens
 *    {@link RELIC_MAX_AFFIXES} Affixe und keine Sorte doppelt (zwei gleiche
 *    Affixe auf einem Stück wären eine verdoppelte Zahl, die kein Wurf je
 *    erzeugen kann). Bleibt danach kein Affix übrig, fällt das ganze Relikt
 *    weg — ein leeres Relikt wäre eine Zeile ohne Wirkung.
 *  · **Ids sind eindeutig.** Ein handgeschriebener Save mit zweimal derselben
 *    Id hätte zwei Stücke, auf die ein Trage-Slot gleichzeitig zeigt; der
 *    zweite Treffer fliegt raus.
 *  · **Die Slots zeigen nur auf Vorhandenes** — und nie zweimal auf dasselbe
 *    Relikt (sonst zählte ein Stück doppelt, exakt der Fall, den
 *    `equipRelic` im Spiel ausschließt).
 *  · **`nextId` wird nach OBEN korrigiert** (über die größte vergebene Id) —
 *    dieselbe Richtung wie bei `repairTranscend`: Eine zu kleine Zahl würde
 *    Ids recyceln und einen Slot auf ein FREMDES Relikt zeigen lassen.
 *  · **`deepestGate` wird NICHT gedeckelt.** Ein zu hoher Wert schadet nur
 *    seinem Besitzer (er sperrt eigene Drops aus) — genau wie der Roll-Zähler
 *    in `repairRetrainRolls`. Ein zu niedriger ist nach dem nächsten Vorstoß
 *    ohnehin wieder die Wahrheit.
 *
 * Nie werfend; ein komplett kaputter Slice wird eine frische, leere Sammlung.
 */
function repairRelics(v: unknown): RelicsState {
  const def = createRelics();
  if (!isRecord(v)) return def;
  const owned: Relic[] = [];
  const seen = new Set<number>();
  if (Array.isArray(v.owned)) {
    for (const raw of v.owned) {
      if (!isRecord(raw)) continue;
      const id = isFiniteNumber(raw.id) && raw.id > 0 ? Math.floor(raw.id) : 0;
      if (id <= 0 || seen.has(id)) continue;
      if (!Array.isArray(raw.affixes)) continue;
      const affixes: { id: string; q: number }[] = [];
      const kinds = new Set<string>();
      for (const a of raw.affixes) {
        if (affixes.length >= RELIC_MAX_AFFIXES) break;
        if (!isRolledAffix(a) || kinds.has(a.id)) continue;
        kinds.add(a.id);
        affixes.push({ id: a.id, q: clampQuality(a.q) });
      }
      if (affixes.length === 0) continue;
      const zone = isFiniteNumber(raw.zone) && raw.zone > 0 ? Math.floor(raw.zone) : RELIC_MIN_ZONE;
      seen.add(id);
      owned.push({ id, zone, affixes });
    }
  }
  const ids = new Set(owned.map((r) => r.id));
  const slots = new Array<number>(RELIC_SLOTS).fill(0);
  if (Array.isArray(v.slots)) {
    const used = new Set<number>();
    for (let i = 0; i < RELIC_SLOTS; i++) {
      const raw = v.slots[i];
      const id = isFiniteNumber(raw) && raw > 0 ? Math.floor(raw) : 0;
      if (id > 0 && ids.has(id) && !used.has(id)) {
        used.add(id);
        slots[i] = id;
      }
    }
  }
  let maxId = 0;
  for (const r of owned) if (r.id > maxId) maxId = r.id;
  const nextId = Math.max(
    isFiniteNumber(v.nextId) && v.nextId > 0 ? Math.floor(v.nextId) : 1,
    maxId + 1,
  );
  return {
    owned,
    slots,
    nextId,
    pity: isFiniteNumber(v.pity) && v.pity > 0 ? Math.floor(v.pity) : 0,
    deepestGate: isFiniteNumber(v.deepestGate) && v.deepestGate > 0 ? Math.floor(v.deepestGate) : 0,
  };
}

/**
 * Repair die **Skin-Schmiede** (v17, 3a): gehaltene Glut als nicht-negative
 * ganze Zahl, und je Skin höchstens {@link FORGE_SLOTS} Slots. Ein Slot behält
 * sein Affix nur, wenn Sorte UND Qualität den Katalog überstehen; alles andere
 * wird ein leerer Slot (statt das ganze Skin-Fach zu verwerfen, denn Slot 2
 * darf nicht an Slot 1 sterben).
 *
 * Nur echte Skin-Ids bekommen ein Fach (`Object.hasOwn(SKINS, …)`, dieselbe
 * Disziplin wie `repairGear.crafted`) — ein erfundener Skin hätte keinen
 * Level, der seine Slots je freischalten könnte, und wäre stiller Ballast.
 *
 * Bewusst NICHT gegen `gear.skinLevels` geklemmt: `forgeAffixes` liest ohnehin
 * nur die Slots, die der aktuelle Level freigeschaltet hat, also WIRKT ein
 * verwaister Slot nicht — aber er bleibt erhalten, falls der Level später
 * wiederkommt. Wegzuwerfen hieße, bezahlte Glut zu nuken.
 */
function repairForge(v: unknown): ForgeState {
  const def = createForge();
  if (!isRecord(v)) return def;
  const slots: Record<string, ForgeSlot[]> = {};
  if (isRecord(v.slots)) {
    for (const [skin, raw] of Object.entries(v.slots)) {
      if (!Object.hasOwn(SKINS, skin) || !Array.isArray(raw)) continue;
      const row: ForgeSlot[] = [];
      let any = false;
      for (let i = 0; i < FORGE_SLOTS; i++) {
        const s = raw[i];
        if (!isRecord(s)) {
          row.push({ affix: null, dry: 0 });
          continue;
        }
        const affix = isRolledAffix(s.affix)
          ? { id: s.affix.id, q: clampQuality(s.affix.q) }
          : null;
        const dry = isFiniteNumber(s.dry) && s.dry > 0 ? Math.floor(s.dry) : 0;
        if (affix || dry > 0) any = true;
        row.push({ affix, dry });
      }
      if (any) slots[skin] = row;
    }
  }
  return { ember: isFiniteNumber(v.ember) && v.ember > 0 ? Math.floor(v.ember) : 0, slots };
}

/** Extract a clean `ChState` from a validated save (repairing any stale invariants). */
function stateFromSave(save: ChSaveLatest): ChState {
  const souls = save.souls;
  const lifetimeMaxZone = Math.max(save.lifetimeMaxZone, save.runMaxZone, save.zone);
  const stageStars = repairStageStars(save.stageStars);
  return {
    gold: save.gold,
    zone: save.zone,
    killsThisZone: save.killsThisZone,
    runMaxZone: Math.max(save.runMaxZone, save.zone),
    crew: { ...save.crew },
    crewUp: repairCrewUps(save.crewUp, save.crew),
    crewMastery: repairCrewMastery(save.crewMastery),
    crewRetrain: repairCrewRetrain(save.crewRetrain),
    retrainRolls: repairRetrainRolls(save.retrainRolls),
    souls,
    lifetimeMaxZone,
    totalClicks: save.totalClicks,
    rng: repairRng(save.rng),
    stats: repairStats(save.stats),
    legacyImported: save.legacyImported === true,
    ability: repairAbility(save.ability),
    combo: repairCombo(save.combo),
    gilds: repairGilds(save.gilds),
    // Held souls ≤ earned total; the highwater only grows via ascension/Himmelfahrt
    // (NOT lifted to soulsForMaxZone(lifetime) here — that would erase souls pending
    // from an un-ascended new best zone). The v4→v5 migration seeds it for old saves.
    rsLifetime: Math.max(repairRsLifetime(save.rsLifetime), souls),
    ancients: repairAncients(save.ancients),
    heaven: repairHeaven(save.heaven),
    gear: repairGear(save.gear),
    legacyTyrann: save.legacyTyrann === true,
    chests: repairChests(save.chests),
    permTokens: repairPermTokens(save.permTokens),
    peach: repairPeach(save.peach),
    meta: repairMeta(save.meta),
    achievements: repairAchievements(save.achievements),
    transcend: repairTranscend(save.transcend),
    stageStars,
    starsAwarded: repairStarsAwarded(save.starsAwarded),
    // Reiner Run-Zustand: eine gültige Bühnen-Nummer oder 0 (kein offener Fehlversuch).
    bossFoulZone: isNonNegInt(save.bossFoulZone) ? save.bossFoulZone : 0,
    constellation: repairConstellation(save.constellation),
    territory: repairTerritory(save.territory),
    relics: repairRelics(save.relics),
    forge: repairForge(save.forge),
  };
}

type ChMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** v1 → v2: fill the M7 defaults (fresh RNG seed, zeroed stats, no legacy import). */
function migrateChV1toV2(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 2,
    rng: createRngState(),
    stats: createStats(),
    legacyImported: false,
  };
}

/** v2 → v3: fill the M8 defaults (empty Ekstase ability + zeroed combo stacks). */
function migrateChV2toV3(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 3,
    ability: createAbility(),
    combo: createComboSave(),
  };
}

/**
 * v3 → v4: fill the M9 defaults — no gilds yet, and seed the lifetime-RS highwater
 * from the currently banked souls (a pre-M9 player keeps their earned RS as the
 * floor). Since M10, `stateFromSave` only keeps `rsLifetime ≥ souls` — it must
 * NEVER be lifted to `soulsForMaxZone(lifetimeMaxZone)` (see `migrateChV4toV5`).
 */
function migrateChV3toV4(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 4,
    gilds: createGilds(),
    rsLifetime: isNonNegInt(raw.souls) ? raw.souls : 0,
  };
}

/**
 * v4 → v5: fill the M10 defaults — no Ancients, a fresh (empty) heaven state. Set
 * the lifetime-RS earned total to the player's **banked souls**: pre-M10 nothing
 * spent souls, so earned == held == `souls`. (Deliberately NOT lifted to
 * `soulsForMaxZone(lifetimeMaxZone)` — a player who reached a deep zone but hasn't
 * ascended there has NOT earned those souls yet, and over-lifting would erase the
 * souls still pending on their next ascension.) A v4 save already carries an
 * `rsLifetime` (since v3→v4): keep the MAX of both — a lifetime highwater must
 * never shrink through the chain, whatever a hand-edited blob claims.
 */
function migrateChV4toV5(raw: Record<string, unknown>): Record<string, unknown> {
  const prior = isNonNegInt(raw.rsLifetime) ? raw.rsLifetime : 0;
  const banked = isNonNegInt(raw.souls) ? raw.souls : 0;
  const rsLifetime = Math.max(prior, banked);
  return {
    ...raw,
    v: 5,
    rsLifetime,
    ancients: {},
    heaven: { hpf: 0, hpfLifetime: 0, ascensions2: 0, tree: {} },
  };
}

/**
 * v5 → v6: fill the M11 default — a fresh gear slice (classic/club Tour-Modus, no
 * levels/stars, `nextSugarAt: 0`). The unseeded timer is seeded to `now + 24 h` by
 * the glue on the first boot. The legacy Tyrann latch (`legacyTyrann`) is a meta
 * field defaulted by `stateFromSave`, so it needs no explicit migration step.
 */
function migrateChV5toV6(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 6,
    gear: createGear(),
  };
}

/**
 * v6 → v7: fill the M12 defaults — an empty loot inventory (no 🔑/chests, zeroed
 * pity, no chest-skins), an empty permanent-token pool and an unseeded Golden-Peach
 * slice (the glue seeds `rollNextPeachAt` on the first boot). No existing field is
 * touched, so the migration is lossless.
 */
function migrateChV6toV7(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 7,
    chests: createChests(),
    permTokens: createPermTokens(),
    peach: createPeach(),
  };
}

/**
 * v7 → v8: fill the M13 defaults — a fresh retention-meta slice (no quests rolled
 * yet: `day: -1` forces the first quest roll + login on the next boot, streak 0) and
 * an empty achievements set. No existing field is touched, so the migration is
 * lossless; the new v8 stats counters (ascensions/chestsOpened/maxCombo/…) are
 * absent in the v7 `stats` and default to 0 via `repairStats`.
 */
function migrateChV7toV8(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 8,
    meta: createMeta(),
    achievements: [],
  };
}

/**
 * v8 → v9: fill the M15 default — a fresh (never-transcended) L3 slice. v8 saves have
 * no Transzendenz layer, so `transcend` defaults to `createTranscend()` (0 TE, empty
 * Mythos ledger). No existing field is touched, so the migration is lossless.
 */
function migrateChV8toV9(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 9,
    transcend: createTranscend(),
  };
}

/**
 * v9 → v10: fill the buyable-crew-abilities default — an empty bought ledger.
 * Pre-v10 saves earned their ×2 milestones free with levels; those multipliers
 * now cost BP, so an old save simply starts with nothing bought (its levels
 * already unlock the tiers for purchase). Lossless for every existing field.
 */
function migrateChV9toV10(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 10,
    crewUp: createCrewUps(),
  };
}

/**
 * v10 → v11: fill the Bühnen-Sterne defaults (ROADMAP-V2 P1) — eine leere
 * Sammlung, ein bei 0 stehender Meilenstein-Highwater und kein offener Boss-
 * Fehlversuch. Bewusst NICHT rückwirkend vergeben: `lifetimeMaxZone` würde zwar
 * verraten, welche Bühnen ein Alt-Save schon geclert hat, aber weder „ohne
 * Timeout" noch „mit heißer Combo" lassen sich rekonstruieren — eine halb
 * gefüllte Sammlung wäre irreführender als eine frische. Die Sterne sind rein
 * kosmetisch, es geht also keine Macht verloren. Für jedes bestehende Feld
 * verlustfrei.
 */
function migrateChV10toV11(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 11,
    stageStars: createStageStars(),
    starsAwarded: 0,
    bossFoulZone: 0,
  };
}

/**
 * v11 → v12: das Wochen-Paar der „Bühne der Woche" (ROADMAP-V2 A5) in den
 * bestehenden Meta-Slice — `weekIndex: -1` („noch keine Woche gezählt") und
 * `weekBestZone: 0`.
 *
 * Warum ins `meta` und nicht als eigene Slice: dort liegt bereits der einzige
 * andere Wochen-Zustand des Spiels (`streakProtectWeek`), und mehr als zwei
 * Zahlen wird die Wochen-Bestzone nie brauchen — eine eigene Slice wäre eine
 * Schachtel um zwei Ints. Warum trotzdem ein Bump, obwohl `repairMeta` fehlende
 * Felder ohnehin auf ihren Default zöge: die Versionsnummer ist das einzige
 * ehrliche Signal, dass sich die persistierte FORM geändert hat, und die
 * X7-Matrix hängt genau daran (sie erzwingt ein v11-Fixture-Paar, bevor der Bump
 * als fertig gilt). Ein Alt-Save startet die Wochen-Bestzone bewusst bei 0 statt
 * bei `lifetimeMaxZone`: die Zahl behauptet „diese Woche erreicht", und das
 * wüsste ein v11-Save nicht — sie füllt sich beim ersten Tick von selbst.
 * Für jedes bestehende Feld verlustfrei.
 */
function migrateChV11toV12(raw: Record<string, unknown>): Record<string, unknown> {
  const meta = isRecord(raw.meta) ? { ...raw.meta } : createMeta();
  return {
    ...raw,
    v: 12,
    meta: { ...meta, weekIndex: -1, weekBestZone: 0 },
  };
}

/**
 * v12 → v13: die **Crew-Meisterschaft** (IDEEN-GAMEPLAY 1a) — Lebenszeit-Level je
 * Mitglied als eigener, von keinem Reset berührter Highwater.
 *
 * Ein Alt-Save startet NICHT bei 0, sondern mit seinem AKTUELLEN `crew`-Stand:
 * Die Level, die ein Spieler gerade hält, hat er nachweislich einmal gekauft —
 * das ist die größzügige, aber ehrliche Untergrenze. (Alles davor ist
 * unrekonstruierbar: Wie oft jemand vor seinen Aszensionen dieselbe Leiter
 * hochgekauft hat, weiß der Save nicht. Bei 0 zu starten wäre die genauso
 * falsche Behauptung „du hast noch nie ein Level gekauft" und würde ausgerechnet
 * die treuesten Spielstände am härtesten treffen.) Ein frisch aszendierter
 * Alt-Save mit leerer Crew startet folgerichtig leer und sammelt ab dem nächsten
 * Kauf.
 *
 * Übernommen werden nur echte Crew-Ids mit positiven ganzen Zahlen — dieselbe
 * Disziplin, die `repairCrewMastery` danach dauerhaft hält. Für jedes bestehende
 * Feld verlustfrei.
 */
function migrateChV12toV13(raw: Record<string, unknown>): Record<string, unknown> {
  const crew = isRecord(raw.crew) ? raw.crew : {};
  const mastery: CrewMastery = {};
  for (const cfg of CREW) {
    const lv = crew[cfg.id];
    if (isNonNegInt(lv) && lv > 0) mastery[cfg.id] = lv;
  }
  return {
    ...raw,
    v: 13,
    crewMastery: mastery,
  };
}

/**
 * v13 → v14: die **Crew-Umschulung** (IDEEN-GAMEPLAY 3b) — eine leere Override-Map
 * und ein leerer Roll-Eskalator.
 *
 * Bewusst OHNE Rückwirkung: Ein Alt-Save hat nie Splitter für eine Umschulung
 * bezahlt, also trägt jeder seiner Slots die Stock-Sorte seines Mitglieds — genau
 * das sagt die leere Map (`abilityKind` fällt ohne Eintrag auf `cfg.special`
 * zurück). Der Bump ist trotzdem echt und nicht bloß ein `repair`-Default: Die
 * persistierte FORM hat sich geändert, und die X7-Matrix hängt an der
 * Versionsnummer — sie erzwingt das v13-Fixture-Paar, bevor die Migration als
 * fertig gilt. Für jedes bestehende Feld verlustfrei.
 */
function migrateChV13toV14(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 14,
    crewRetrain: createRetrain(),
    retrainRolls: createRetrainRolls(),
  };
}

/**
 * v14 → v15: die **Legenden-Konstellation** (IDEEN-GAMEPLAY 2a) — ein leerer
 * Baum mit einem RÜCKWIRKEND gefüllten Sternenstaub-Konto.
 *
 * Anders als bei den Bühnen-Sternen (v10→v11, die bewusst leer starten) ist die
 * Rückwirkung hier nicht nur möglich, sondern zwingend: Sternenstaub ist per
 * Definition der Lohn für Dinge, die der Save SCHON BEWEIST — freigeschaltete
 * Erfolge stehen als Liste drin, die Sterne-Summe ist aus `stageStars`
 * ausrechenbar, und die gefallenen Boss-Gates stecken in der tiefsten je
 * erreichten Bühne. Ein Spieler mit 20 Erfolgen und Bühne 60 bekommt beim
 * ersten Start nach dem Update also sofort sein Konto (hier: 60 + 5·… + …) und
 * darf sich damit die ersten Knoten kaufen — er hat sie längst verdient.
 *
 * Gerechnet wird mit derselben Formel, die danach jede Sekunde läuft
 * (`constellation.dustEntitlement`); die Boot-Synchro in der Glue wäre also
 * ohnehin dieselbe Zahl. Die Migration nimmt sie nur vorweg, damit der Anspruch
 * schon im Save steht und nicht erst durch einen Tick entsteht. Für jedes
 * bestehende Feld verlustfrei.
 */
function migrateChV14toV15(raw: Record<string, unknown>): Record<string, unknown> {
  const stars = totalStars(repairStageStars(raw.stageStars));
  const achievements = repairAchievements(raw.achievements).length;
  // Tiefste JE erreichte Bühne: `lifetimeMaxZone` fällt bei Himmelfahrt/Transzendenz
  // auf 1 zurück, der Gear-Latch `zoneEver` nicht — deshalb das Maximum aus allen
  // vier Zahlen (exakt die Regel aus `ch-state.unlockZone`, plus die Run-Werte).
  const gear = isRecord(raw.gear) ? raw.gear : {};
  const deepestZone = Math.max(
    isFiniteNumber(raw.lifetimeMaxZone) ? raw.lifetimeMaxZone : 1,
    isFiniteNumber(raw.runMaxZone) ? raw.runMaxZone : 1,
    isFiniteNumber(raw.zone) ? raw.zone : 1,
    isFiniteNumber(gear.zoneEver) ? gear.zoneEver : 1,
  );
  const constellation: ConstellationState = {
    ...createConstellation(),
    earned: dustEntitlement({ stars, achievements, deepestZone }),
  };
  return { ...raw, v: 15, constellation };
}

/**
 * v15 → v16: die **Gebietsherrschaft** (IDEEN-GAMEPLAY 1b) — vier Ruf-Zähler,
 * die bewusst bei **0** starten.
 *
 * Anders als bei der Konstellation (v14→v15, wo der Anspruch aus lauter im Save
 * vorhandenen Highwatern GERECHNET werden konnte) gibt es hier nichts zu
 * rekonstruieren: Ruf entsteht ausschließlich aus KILLS pro Theme, und eine
 * solche Zählung hat das Spiel nie geführt — weder `stats.bossKills` (kennt kein
 * Theme) noch `lifetimeMaxZone` (kennt keine Wiederholungen) noch `stageStars`
 * (kennt kein WIE OFT) tragen die Information. Jede Herleitung wäre eine
 * Erfindung, und eine erfundene Ruf-Zahl verschenkt echte Macht (BP-Prozente)
 * für einen Nachweis, den niemand erbracht hat.
 *
 * Das ist dieselbe Entscheidung wie bei den Bühnen-Sternen in v10→v11 („bewusst
 * leer"), nur mit dem zusätzlichen Argument der Balance: Die Leiste ist eine
 * Langzeit-Kurve über Wochen; ein rückwirkendes Startguthaben wäre nicht ein
 * paar Prozent, sondern die ersten Stufen geschenkt. Alle bestehenden Felder
 * bleiben unangetastet, die Migration ist verlustfrei.
 */
function migrateChV15toV16(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, v: 16, territory: createTerritory() };
}

/**
 * Das tiefste Boss-Gate, das ein Save nachweislich schon GECLERT hat. Ein Gate
 * `Z` gilt als gefallen, wenn die tiefste je erreichte Bühne ÜBER `Z` liegt
 * (man kommt nur an ihm vorbei, indem man es besiegt) — exakt die Regel aus
 * `ch-state.bossFirstKillZones`. Die Tiefe selbst ist das Maximum aus allen
 * vier Zahlen, die sie tragen können: `lifetimeMaxZone` und die Run-Werte
 * fallen bei Himmelfahrt/Transzendenz auf 1 zurück, der Gear-Latch `zoneEver`
 * nicht.
 */
function clearedGateFor(raw: Record<string, unknown>): number {
  const gear = isRecord(raw.gear) ? raw.gear : {};
  const deepest = Math.max(
    isFiniteNumber(raw.lifetimeMaxZone) ? raw.lifetimeMaxZone : 1,
    isFiniteNumber(raw.runMaxZone) ? raw.runMaxZone : 1,
    isFiniteNumber(raw.zone) ? raw.zone : 1,
    isFiniteNumber(gear.zoneEver) ? gear.zoneEver : 1,
  );
  const gate = Math.floor((deepest - 1) / 5) * 5;
  return gate >= RELIC_MIN_ZONE ? gate : 0;
}

/**
 * v16 → v17: **Relikte** (1c) + **Skin-Schmiede** (3a) — ein Loot-Paket, zwei
 * Slices, und zwei GEGENSÄTZLICHE Migrations-Entscheidungen im selben Schritt.
 *
 * **Die Schmiede startet komplett leer.** Weder Glut noch geschmiedete Affixe
 * lassen sich aus irgendetwas herleiten: Glut entsteht aus Duplikat-Jackpots
 * und getauschten Splittern, und beides hat das Spiel nie gezählt (der Save
 * kennt nur den AKTUELLEN Splitter-Stand, nicht die Historie). Ein
 * geschmiedetes Affix wäre vollends erfunden — es hätte eine gerollte Qualität,
 * die niemand gerollt hat. Dasselbe „bewusst leer" wie bei den Bühnen-Sternen
 * (v10→v11) und der Umschulung (v13→v14).
 *
 * **Der Relikt-Gate-Highwater wird dagegen ZWINGEND gesät** — und das ist der
 * interessante Fall. Die Sammlung selbst startet leer (aus demselben Grund wie
 * die Schmiede: gefallene Relikte, die nie gefallen sind, wären erfunden), aber
 * `deepestGate` MUSS auf das tiefste bereits geclerte Gate gesetzt werden. Ohne
 * das bekäme ein Alt-Save auf Bühne 200 beim nächsten Rückweg dreißig Gates
 * geschenkt, die er längst hinter sich hat — ein Regen von zehn Relikten für
 * Arbeit, die vor dem Update passiert ist. Die Zahl ist dabei nicht geraten,
 * sondern GERECHNET (`clearedGateFor`, dieselbe Regel wie
 * `bossFirstKillZones`), und sie ist die einzige Richtung, die niemandem etwas
 * wegnimmt: Sie verschenkt nichts und sperrt nichts, was noch aussteht.
 *
 * Ein Alt-Save rechnet nach dem Update also bit-gleich weiter (ein leeres
 * Loadout faltet überall ×1) und würfelt sein erstes Relikt an dem Gate, das
 * ihn ohnehin als Nächstes erwartet. Für jedes bestehende Feld verlustfrei.
 */
function migrateChV16toV17(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    v: 17,
    relics: { ...createRelics(), deepestGate: clearedGateFor(raw) },
    forge: createForge(),
  };
}

const CH_MIGRATIONS: Record<number, ChMigration> = {
  1: migrateChV1toV2,
  2: migrateChV2toV3,
  3: migrateChV3toV4,
  4: migrateChV4toV5,
  5: migrateChV5toV6,
  6: migrateChV6toV7,
  7: migrateChV7toV8,
  8: migrateChV8toV9,
  9: migrateChV9toV10,
  10: migrateChV10toV11,
  11: migrateChV11toV12,
  12: migrateChV12toV13,
  13: migrateChV13toV14,
  14: migrateChV14toV15,
  15: migrateChV15toV16,
  16: migrateChV16toV17,
};

/**
 * Migrate an unknown parsed value up to the current CH schema, then validate.
 * Never throws; unknown/future/corrupt data ⇒ null ⇒ clean fresh start.
 * (Registry pattern mirrors `save/migrate.ts`.)
 */
function migrateCh(raw: unknown): ChSaveLatest | null {
  if (!isRecord(raw)) return null;
  let version = raw.v;
  if (typeof version !== 'number' || !Number.isInteger(version)) return null;
  if (version < 1 || version > CH_SCHEMA) return null;

  let data: Record<string, unknown> = raw;
  while (version < CH_SCHEMA) {
    const step = CH_MIGRATIONS[version];
    if (!step) return null;
    data = step(data);
    if (data.v !== version + 1) return null;
    version += 1;
  }
  return isChSave(data) ? data : null;
}

/** Parse + migrate + validate a save JSON string into a clean state (null if invalid). */
export function deserializeCh(json: string): ChState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const migrated = migrateCh(parsed);
  return migrated ? stateFromSave(migrated) : null;
}

// UTF-8-safe base64 (mirrors the legacy store) so export codes survive emoji.
function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromB64(code: string): string {
  const bin = atob(code);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Portable save code (base64) for manual export. */
export function exportCh(state: ChState, now: number): string {
  return toB64(serializeCh(state, now));
}

/** Decode + validate a base64 save code back into a state (null if invalid). */
export function importCh(code: string): ChState | null {
  try {
    return deserializeCh(fromB64(code.trim()));
  } catch {
    return null;
  }
}

export function saveCh(
  state: ChState,
  now: number,
  storage: ChStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(CH_SAVE_KEY, serializeCh(state, now));
  } catch {
    // ignore quota/serialize errors
  }
}

export interface LoadedCh {
  state: ChState;
  lastSeen: number;
}

/** Load + validate. Returns null when nothing valid is stored. */
export function loadCh(storage: ChStorage | null = defaultStorage()): LoadedCh | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(CH_SAVE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const migrated = migrateCh(parsed);
  if (migrated === null) return null;
  return { state: stateFromSave(migrated), lastSeen: migrated.lastSeen };
}

/** Wipe the CH save (reset). */
export function resetCh(storage: ChStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(CH_SAVE_KEY);
  } catch {
    // ignore
  }
}

/** Offline accrual options: Twerk-Coach contribution + a Nachtschicht-raised cap. */
export interface OfflineOpts {
  /** Effective click damage (for the coach's 25 %-of-click contribution). */
  clickDmg?: number;
  /** Twerk-Coach clicks per second (§4.3.5). */
  coachCps?: number;
  /** Offline cap in seconds (Nachtschicht raises it; defaults to `OFFLINE_CAP_S`). */
  capS?: number;
  /**
   * Gold multiplier (Peachiel, §4.6 — defaults to 1). Offline models the same
   * rival kills as live play, so the +10 %/lv gold ancient applies here too.
   */
  goldMult?: number;
  /**
   * Offline-efficiency bonus added to the `OFFLINE_EFF` base (Endless Summer set,
   * §5.5 — defaults to 0). The effective rate is capped at 1 (full live rate).
   */
  rateBonus?: number;
}

/**
 * Idle gold earned while away: the crew farms the CURRENT zone's rivals (never
 * bosses — idle can't beat a timed boss) at `OFFLINE_EFF`, capped at `capS`
 * (default 8 h). Twerk-Coaches add `coachCps · 25 % · clickDmg` of throughput, so
 * even a crew-less click build earns offline (rest of B11, §4.3.5). Returns 0
 * without any effective throughput.
 */
export function offlineGold(
  dps: number,
  zone: number,
  elapsedMs: number,
  opts: OfflineOpts = {},
): number {
  const coachDps =
    Math.max(0, opts.coachCps ?? 0) * COACH_CLICK_SHARE * Math.max(0, opts.clickDmg ?? 0);
  const effectiveDps = Math.max(0, dps) + coachDps;
  const capS = opts.capS ?? OFFLINE_CAP_S;
  if (effectiveDps <= 0 || elapsedMs <= 0) return 0;
  const seconds = Math.min(elapsedMs / 1000, capS);
  const killsPerSec = effectiveDps / monsterHp(zone);
  const goldPerSec = killsPerSec * goldFor(zone, false) * Math.max(0, opts.goldMult ?? 1);
  // Idle efficiency: 50 % base, raised by gear (Endless Summer set), capped at 100 %.
  const eff = Math.min(1, OFFLINE_EFF + Math.max(0, opts.rateBonus ?? 0));
  return Math.floor(goldPerSec * seconds * eff);
}

/**
 * BP to grant when a hidden tab becomes visible again (B5): identical accrual to
 * boot-time offline gold over the interval the tab was hidden. A thin named seam
 * so `main.ts` reads clearly and the grant is unit-testable with injected times.
 */
export function visibilityGrant(
  dps: number,
  zone: number,
  hiddenMs: number,
  opts: OfflineOpts = {},
): number {
  return offlineGold(dps, zone, hiddenMs, opts);
}
