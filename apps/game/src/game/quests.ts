/**
 * Meta & Retention — Daily-Login, Streak & rotating Quests (spec §7.1/§7.2, M13).
 *
 * Everything here is pure, DOM-free and fully offline (§7-AC1): the only input is
 * a `dayNumber` derived from the wall clock (see {@link dayNumber}); there is no
 * server. The metric increments that drive quest progress arrive from part 2's
 * event hooks — this module provides the deterministic quest rotation, the pure
 * progress/claim reducers, the metric → quest mapping, and the streak logic.
 *
 * **Clock-manipulation neutral (§7-AC1).** The persisted `day`/`lastLoginDay`
 * fields are monotonic HIGH-WATER marks: a new day is only recognised when the
 * derived day number is *strictly greater* than the stored one. Setting the clock
 * BACKWARDS therefore never resets quests, never re-grants a login reward, and can
 * never re-claim an already-claimed quest for the same logical day. A forward jump
 * simply advances the day (accepted, spec §11.10). No clock value throws.
 */
import { type ChestTier } from './chests';
import { Rng } from '../util/rng';

// ---------------------------------------------------------------------------
// Day / week numbering (spec §7.1 — local `Date.now`, no server)
// ---------------------------------------------------------------------------

/** One real-time day in ms. */
export const DAY_MS = 86_400_000;

/**
 * The logical day number for a wall-clock ms value: **days since the Unix epoch
 * at the UTC midnight boundary** (`floor(nowMs / 86_400_000)`). UTC is chosen so
 * the boundary is stable and timezone-independent; a player near midnight may roll
 * over a few hours off local midnight, which is accepted (§11.10). Monotone in
 * time, so it feeds the high-water day logic directly.
 */
export function dayNumber(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS);
}

/** The (integer) week a day belongs to — 7-day blocks from the epoch. */
export function weekNumber(day: number): number {
  return Math.floor(day / 7);
}

// ---------------------------------------------------------------------------
// Quest catalog (spec §7.2) — data
// ---------------------------------------------------------------------------

/**
 * Quest progress metrics. Part 2's event hooks call {@link advanceMeta} with one
 * of these each time the relevant thing happens; the mapping metric → quest lives
 * in the {@link QUESTS} catalog (`metric` field), so adding a quest never touches
 * the wiring.
 */
export type QuestMetric =
  | 'comboTier3' // reached combo tier 3 (§4.2.2) this session
  | 'bossKills' // bosses defeated
  | 'onBeatClicks' // on-beat clicks (§4.2.3)
  | 'newBestZone' // reached a new lifetime best zone
  | 'ascend' // performed an L1 ascension
  | 'crits' // crit clicks landed
  | 'clicks' // shakes performed
  | 'chestsOpened' // Pfirsich-Truhen opened (§6)
  | 'gild'; // earned a Vergoldung (new 10-zone first-clear, §4.3.4)

/** A quest reward (spec §7.2/§4.7). Rewards are granted by part 2 on claim. */
export type QuestReward =
  | { readonly kind: 'keys'; readonly keys: number } // 🔑
  | { readonly kind: 'chest'; readonly tier: ChestTier } // a Truhe of a tier
  | { readonly kind: 'shards'; readonly shards: number } // 🧩
  | { readonly kind: 'souls'; readonly souls: number }; // RS

/** A single quest definition (data). */
export interface QuestDef {
  readonly id: string;
  readonly desc: string;
  readonly metric: QuestMetric;
  /** Progress needed to complete (`>= target` ⇒ complete). */
  readonly target: number;
  readonly reward: QuestReward;
}

/**
 * The quest pool (spec §7.2). More than {@link DAILY_QUEST_SLOTS} entries so the
 * daily draw has variety; the spec's five examples are the first five here.
 */
export const QUESTS: readonly QuestDef[] = [
  {
    id: 'combo-t3',
    desc: 'Erreiche Combo-Tier 3 (Feuer)',
    metric: 'comboTier3',
    target: 1,
    reward: { kind: 'keys', keys: 2 },
  },
  {
    id: 'boss-4',
    desc: 'Besiege 4 Bosse',
    metric: 'bossKills',
    target: 4,
    reward: { kind: 'chest', tier: 'gold' },
  },
  {
    id: 'onbeat-500',
    desc: '500 On-Beat-Klicks',
    metric: 'onBeatClicks',
    target: 500,
    reward: { kind: 'chest', tier: 'diamond' },
  },
  {
    id: 'new-best-zone',
    desc: 'Erreiche eine neue Bestzone',
    metric: 'newBestZone',
    target: 1,
    reward: { kind: 'souls', souls: 5 },
  },
  {
    id: 'ascend-1',
    desc: 'Aszendiere einmal',
    metric: 'ascend',
    target: 1,
    reward: { kind: 'shards', shards: 20 },
  },
  {
    id: 'crits-200',
    desc: 'Lande 200 Krit-Klicks',
    metric: 'crits',
    target: 200,
    reward: { kind: 'keys', keys: 1 },
  },
  {
    id: 'clicks-1500',
    desc: 'Führe 1 500 Shakes aus',
    metric: 'clicks',
    target: 1500,
    reward: { kind: 'chest', tier: 'gold' },
  },
  {
    id: 'chests-3',
    desc: 'Öffne 3 Truhen',
    metric: 'chestsOpened',
    target: 3,
    reward: { kind: 'shards', shards: 10 },
  },
  {
    id: 'gild-1',
    desc: 'Erobere eine neue 10er-Bühne (Vergoldung)',
    metric: 'gild',
    target: 1,
    reward: { kind: 'keys', keys: 1 },
  },
  {
    id: 'boss-10',
    desc: 'Besiege 10 Bosse',
    metric: 'bossKills',
    target: 10,
    reward: { kind: 'chest', tier: 'diamond' },
  },
];

const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/** All catalog quest ids (for the save-repair filter). */
export const QUEST_IDS: readonly string[] = QUESTS.map((q) => q.id);

/** Whether `id` is a real catalog quest id. */
export function isQuestId(id: unknown): id is string {
  return typeof id === 'string' && Object.hasOwn(QUEST_BY_ID, id);
}

/** Look up a quest definition by id (undefined for unknown ids). */
export function questById(id: string): QuestDef | undefined {
  return QUEST_BY_ID[id];
}

// ---------------------------------------------------------------------------
// Deterministic daily selection (spec §7.2 — seeded purely from date + reroll)
// ---------------------------------------------------------------------------

/** Distinct quest slots drawn per day. */
export const DAILY_QUEST_SLOTS = 3;
/** Free rerolls allowed per day (spec §7.2: 1×/day). */
export const MAX_REROLLS = 1;

/** Mix a `(day, reroll)` pair into a 32-bit seed (splitmix-style avalanche). */
function questSeed(day: number, reroll: number): number {
  let h = (Math.trunc(day) * 0x9e3779b1 + Math.trunc(reroll) * 0x85ebca77) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39) | 0;
  return (h ^ (h >>> 16)) | 0;
}

/**
 * The {@link DAILY_QUEST_SLOTS} distinct quest ids for a day + reroll count,
 * seeded purely from `(day, reroll)` via the seedable RNG (§9.4). Same inputs ⇒
 * same quests (§7-AC1/AC2), and the three ids are always distinct (partial
 * Fisher–Yates over the catalog). `reroll` shifts the seed so a reroll yields a
 * different, still-deterministic draw.
 */
export function dailyQuests(day: number, reroll = 0): string[] {
  const ids = QUESTS.map((q) => q.id);
  const rng = new Rng({ seed: questSeed(day, reroll), cursor: 0 });
  const slots = Math.min(DAILY_QUEST_SLOTS, ids.length);
  for (let i = 0; i < slots; i++) {
    const j = i + Math.floor(rng.next() * (ids.length - i));
    const tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  return ids.slice(0, slots);
}

// ---------------------------------------------------------------------------
// Persisted meta slice (CH-save v8, spec §9.2.1)
// ---------------------------------------------------------------------------

/** Quest progress by quest id (absent = 0). */
export type QuestProgress = Record<string, number>;

/**
 * The persisted Daily/Quests/Streak slice (CH-save v8). `day` and `lastLoginDay`
 * are monotone high-water marks (see the module note on clock neutrality).
 */
export interface MetaState {
  /** High-water logical day the quest slots were last rolled for (−1 = fresh). */
  day: number;
  /** The current day's quest ids (`dailyQuests(day, rerollsUsed)`). */
  questIds: string[];
  /** Progress per active quest id. */
  questProgress: QuestProgress;
  /** Quest ids already claimed today. */
  questsClaimed: string[];
  /** Rerolls used today (capped at {@link MAX_REROLLS}). */
  rerollsUsed: number;
  /** Daily-login streak, 1…7 (0 = never logged in). */
  streak: number;
  /** High-water logical day of the last login (−1 = never). */
  lastLoginDay: number;
  /** Week number the free streak-protect was last spent (−1 = available). */
  streakProtectWeek: number;
}

/** A fresh meta slice — forces a quest roll + first login on the first boot. */
export function createMeta(): MetaState {
  return {
    day: -1,
    questIds: [],
    questProgress: {},
    questsClaimed: [],
    rerollsUsed: 0,
    streak: 0,
    lastLoginDay: -1,
    streakProtectWeek: -1,
  };
}

// ---------------------------------------------------------------------------
// Quest progress + claim reducers (pure)
// ---------------------------------------------------------------------------

/** The active quest definitions for a meta slice (unknown ids dropped). */
export function activeQuests(meta: MetaState): QuestDef[] {
  const out: QuestDef[] = [];
  for (const id of meta.questIds) {
    const q = QUEST_BY_ID[id];
    if (q) out.push(q);
  }
  return out;
}

/**
 * Advance every active quest tracking `metric` by `amount` (clamped at its
 * target). Pure — returns the same object when nothing matches, `amount <= 0`,
 * or every matching quest is already at its target (so per-click callers like
 * the „Shakes"-quest hook stay allocation-free once the quest is complete).
 */
export function advanceQuests(
  progress: QuestProgress,
  active: readonly QuestDef[],
  metric: QuestMetric,
  amount: number,
): QuestProgress {
  if (!(amount > 0)) return progress;
  const matches = active.filter((q) => q.metric === metric);
  if (matches.length === 0) return progress;
  let next: QuestProgress | null = null;
  for (const q of matches) {
    const cur = progress[q.id] ?? 0;
    const val = Math.min(q.target, cur + amount);
    if (val !== cur) {
      next ??= { ...progress };
      next[q.id] = val;
    }
  }
  return next ?? progress;
}

/** Whether a quest's progress has reached its target. */
export function isQuestComplete(quest: QuestDef, progress: QuestProgress): boolean {
  return (progress[quest.id] ?? 0) >= quest.target;
}

/**
 * Claim a quest (pure): if it is complete and not already in `claimed`, return its
 * reward and the extended claimed set; otherwise `reward: null` and `claimed`
 * unchanged. An already-claimed or incomplete quest never pays out again.
 */
export function claimQuest(
  quest: QuestDef,
  progress: QuestProgress,
  claimed: readonly string[],
): { reward: QuestReward | null; claimed: string[] } {
  if (claimed.includes(quest.id) || !isQuestComplete(quest, progress)) {
    return { reward: null, claimed: [...claimed] };
  }
  return { reward: quest.reward, claimed: [...claimed, quest.id] };
}

// ---------------------------------------------------------------------------
// Meta-level convenience (what part 2 threads through the save)
// ---------------------------------------------------------------------------

/**
 * Advance the meta slice for a metric event (part 2's event hooks call this). Only
 * the currently active quests are touched; returns the same slice when unchanged.
 */
export function advanceMeta(meta: MetaState, metric: QuestMetric, amount = 1): MetaState {
  const questProgress = advanceQuests(meta.questProgress, activeQuests(meta), metric, amount);
  return questProgress === meta.questProgress ? meta : { ...meta, questProgress };
}

/**
 * Claim a quest by id within the meta slice. Returns the updated slice + the
 * reward to grant (or `null` when not claimable). Idempotent per quest per day.
 */
export function claimInMeta(
  meta: MetaState,
  questId: string,
): { meta: MetaState; reward: QuestReward | null } {
  const quest = QUEST_BY_ID[questId];
  if (!quest) return { meta, reward: null };
  const { reward, claimed } = claimQuest(quest, meta.questProgress, meta.questsClaimed);
  if (reward === null) return { meta, reward: null };
  return { meta: { ...meta, questsClaimed: claimed }, reward };
}

/**
 * Forward-clock repair (spec §9.2.2, same spirit as the sugar/peach timer clamps):
 * clamp high-water days that lie in the FUTURE back down to `day`. A save stamped
 * while the clock was set far ahead (then corrected) must not freeze dailies,
 * quests and logins until the wall clock catches up — without this, a single boot
 * under a wrong BIOS/system clock could silence the retention loop for years.
 * Clamping to TODAY stays neutral: nothing is re-granted today (the clamped
 * `lastLoginDay` still blocks today's login, the clamped `day` blocks a re-roll)
 * and everything resumes normally tomorrow. Returns the same slice when nothing
 * is in the future. The glue calls this before {@link rollDay}/{@link dailyLogin}.
 */
export function repairFutureDays(meta: MetaState, day: number): MetaState {
  if (meta.day <= day && meta.lastLoginDay <= day) return meta;
  return {
    ...meta,
    day: Math.min(meta.day, day),
    lastLoginDay: Math.min(meta.lastLoginDay, day),
  };
}

/**
 * Roll the quest slots for a (possibly new) day. A day is only recognised when it
 * is strictly greater than the stored high-water `day` (clock-neutral): a forward
 * day resets quests/progress/claims/rerolls to a fresh deterministic draw; a
 * backward or same day is a no-op (`changed: false`), so claimed quests can never
 * be re-claimed by turning the clock back (§7-AC1).
 */
export function rollDay(meta: MetaState, day: number): { meta: MetaState; changed: boolean } {
  if (!(day > meta.day)) return { meta, changed: false };
  return {
    meta: {
      ...meta,
      day,
      questIds: dailyQuests(day, 0),
      questProgress: {},
      questsClaimed: [],
      rerollsUsed: 0,
    },
    changed: true,
  };
}

/**
 * Reroll today's quests (spec §7.2: 1×/day). Draws a fresh deterministic set from
 * `dailyQuests(day, rerollsUsed + 1)` and resets progress/claims. Refused once the
 * daily reroll budget is spent (`ok: false`, slice unchanged). `rerollsUsed` is
 * reset each new day by {@link rollDay}, so this is naturally 1×/day.
 */
export function reroll(meta: MetaState, day: number): { meta: MetaState; ok: boolean } {
  if (meta.rerollsUsed >= MAX_REROLLS) return { meta, ok: false };
  const used = meta.rerollsUsed + 1;
  return {
    meta: {
      ...meta,
      questIds: dailyQuests(day, used),
      questProgress: {},
      questsClaimed: [],
      rerollsUsed: used,
    },
    ok: true,
  };
}

// ---------------------------------------------------------------------------
// Daily-login + streak (spec §7.1)
// ---------------------------------------------------------------------------

/** Streak cap (spec §7.1). Day 7 pays the bonus, then the streak wraps to 1. */
export const STREAK_MAX = 7;

/** The reward a daily login grants. `null` from {@link dailyLogin} = already today. */
export interface LoginReward {
  /** Truhe granted: `gold` on days 1–6, `diamond` on day 7 (spec §7.1). */
  readonly chest: ChestTier;
  /** Bonus 🔑 (2 on day 7, else 0). */
  readonly keys: number;
  /** The streak value after this login (1…7). */
  readonly streak: number;
  /** Whether this login consumed the weekly streak-protect. */
  readonly protectUsed: boolean;
}

/** Advance the streak by one, wrapping 7 → 1 (spec §7.1). */
function nextStreak(prev: number): number {
  const p = Math.max(0, Math.min(STREAK_MAX, Math.trunc(prev)));
  return p >= STREAK_MAX ? 1 : p + 1;
}

/**
 * Process a daily login (spec §7.1, §7-AC2). Pure over `(meta, day)`:
 *
 * - Already logged in today (or a backward clock, `day <= lastLoginDay`) ⇒ no
 *   reward, slice unchanged (can't re-grant by rewinding).
 * - First login or a consecutive day (gap 1) ⇒ streak advances (wrapping 7 → 1).
 * - A single missed day (gap 2) ⇒ the streak SURVIVES iff the free weekly
 *   streak-protect is available (not yet spent this week); the protect is then
 *   consumed for the week. Otherwise the streak resets to 1.
 * - Two or more missed days ⇒ streak resets to 1.
 *
 * Day 7 upgrades the reward to a Diamanttruhe + 2 🔑, then the streak wraps.
 */
export function dailyLogin(
  meta: MetaState,
  day: number,
): { meta: MetaState; reward: LoginReward | null } {
  if (day <= meta.lastLoginDay) return { meta, reward: null };

  const first = meta.lastLoginDay < 0;
  const gap = first ? 1 : day - meta.lastLoginDay;
  let protectUsed = false;
  let streakProtectWeek = meta.streakProtectWeek;
  let streak: number;

  if (first || gap === 1) {
    streak = nextStreak(meta.streak);
  } else if (gap === 2 && weekNumber(day) !== meta.streakProtectWeek) {
    // Free weekly streak-protect: covers exactly one missed day.
    streak = nextStreak(meta.streak);
    protectUsed = true;
    streakProtectWeek = weekNumber(day);
  } else {
    streak = 1; // gap ≥ 2 with no protect available ⇒ broken
  }

  const isDay7 = streak === STREAK_MAX;
  const reward: LoginReward = {
    chest: isDay7 ? 'diamond' : 'gold',
    keys: isDay7 ? 2 : 0,
    streak,
    protectUsed,
  };
  return {
    meta: { ...meta, lastLoginDay: day, streak, streakProtectWeek },
    reward,
  };
}
