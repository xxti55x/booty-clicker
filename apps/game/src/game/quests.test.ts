import { describe, expect, it } from 'vitest';

import {
  DAILY_QUEST_SLOTS,
  DAY_MS,
  MAX_REROLLS,
  QUEST_IDS,
  activeQuests,
  advanceMeta,
  advanceQuests,
  claimInMeta,
  claimQuest,
  createMeta,
  dailyLogin,
  dailyQuests,
  dayNumber,
  isQuestComplete,
  isQuestId,
  questById,
  repairFutureDays,
  reroll,
  rollDay,
  weekNumber,
} from './quests';

describe('day/week numbering', () => {
  it('derives a stable UTC day number and never throws', () => {
    expect(dayNumber(0)).toBe(0);
    expect(dayNumber(DAY_MS * 5 + 123)).toBe(5);
    expect(dayNumber(DAY_MS * 5 + DAY_MS - 1)).toBe(5); // same day near midnight
    expect(() => dayNumber(-1e15)).not.toThrow();
    expect(() => dayNumber(Number.NaN)).not.toThrow();
  });
  it('groups days into 7-day weeks', () => {
    expect(weekNumber(0)).toBe(0);
    expect(weekNumber(6)).toBe(0);
    expect(weekNumber(7)).toBe(1);
  });
});

describe('dailyQuests — deterministic rotation (AC1/AC2)', () => {
  it('is a pure function of (day, reroll): same inputs ⇒ same quests', () => {
    for (const day of [0, 1, 100, 20289, 999_999]) {
      expect(dailyQuests(day)).toEqual(dailyQuests(day, 0));
      expect(dailyQuests(day, 1)).toEqual(dailyQuests(day, 1));
    }
  });
  it('draws exactly 3 DISTINCT catalog ids', () => {
    for (const day of [0, 3, 42, 100, 7777]) {
      const q = dailyQuests(day);
      expect(q).toHaveLength(DAILY_QUEST_SLOTS);
      expect(new Set(q).size).toBe(DAILY_QUEST_SLOTS);
      for (const id of q) expect(isQuestId(id)).toBe(true);
    }
  });
  it('a reroll (different count) generally changes the drawn set', () => {
    const base = dailyQuests(100, 0);
    const rerolled = dailyQuests(100, 1);
    expect(rerolled).toHaveLength(3);
    expect(rerolled).not.toEqual(base); // different seed ⇒ different draw
  });
});

describe('quest progress + claim reducers', () => {
  it('advances only active quests tracking the metric, clamped at target', () => {
    const active = [questById('boss-4')!, questById('crits-200')!];
    let p = advanceQuests({}, active, 'bossKills', 3);
    expect(p).toEqual({ 'boss-4': 3 });
    p = advanceQuests(p, active, 'bossKills', 5); // clamps at target 4
    expect(p['boss-4']).toBe(4);
    // A metric no active quest tracks is a no-op (same object).
    expect(advanceQuests(p, active, 'gild', 1)).toBe(p);
    expect(advanceQuests(p, active, 'bossKills', 0)).toBe(p);
  });

  it('is a true no-op (same object) once every matching quest is at its target', () => {
    const active = [questById('clicks-1500')!];
    const done = { 'clicks-1500': 1500 };
    // The per-click „Shakes" hook must not allocate after the clamp.
    expect(advanceQuests(done, active, 'clicks', 1)).toBe(done);
    const meta = { ...rollDay(createMeta(), 100).meta, questIds: ['clicks-1500'] };
    const clamped = advanceMeta(meta, 'clicks', 1500);
    expect(advanceMeta(clamped, 'clicks')).toBe(clamped);
  });

  it('isQuestComplete + claimQuest gate + are idempotent', () => {
    const q = questById('boss-4')!;
    expect(isQuestComplete(q, { 'boss-4': 3 })).toBe(false);
    expect(isQuestComplete(q, { 'boss-4': 4 })).toBe(true);
    // Incomplete ⇒ no reward.
    expect(claimQuest(q, { 'boss-4': 1 }, []).reward).toBeNull();
    // Complete ⇒ reward + claimed extended.
    const ok = claimQuest(q, { 'boss-4': 4 }, []);
    expect(ok.reward).toEqual({ kind: 'chest', tier: 'gold' });
    expect(ok.claimed).toEqual(['boss-4']);
    // Already claimed ⇒ no reward again.
    expect(claimQuest(q, { 'boss-4': 4 }, ['boss-4']).reward).toBeNull();
  });
});

describe('rollDay — clock-neutral quest rotation (AC1)', () => {
  it('rolls a fresh set forward, is a no-op on same/backward days', () => {
    const day = 20_289;
    const r1 = rollDay(createMeta(), day);
    expect(r1.changed).toBe(true);
    expect(r1.meta.questIds).toEqual(dailyQuests(day, 0));
    expect(r1.meta.day).toBe(day);
    // Same day again ⇒ no change.
    expect(rollDay(r1.meta, day).changed).toBe(false);
    // Backward clock ⇒ no change (high-water day preserved).
    const back = rollDay(r1.meta, day - 5);
    expect(back.changed).toBe(false);
    expect(back.meta.day).toBe(day);
    // Forward ⇒ new set, progress/claims reset.
    const fwd = rollDay({ ...r1.meta, questProgress: { x: 1 }, questsClaimed: ['x'] }, day + 1);
    expect(fwd.changed).toBe(true);
    expect(fwd.meta.questProgress).toEqual({});
    expect(fwd.meta.questsClaimed).toEqual([]);
  });

  it('setting the clock BACKWARD cannot re-claim an already-claimed quest (AC1)', () => {
    const day = 20_289;
    let meta = rollDay(createMeta(), day).meta;
    const q = activeQuests(meta)[0];
    // Complete + claim it.
    meta = advanceMeta(meta, q.metric, q.target);
    expect(isQuestComplete(q, meta.questProgress)).toBe(true);
    const claim = claimInMeta(meta, q.id);
    expect(claim.reward).not.toBeNull();
    meta = claim.meta;
    expect(meta.questsClaimed).toContain(q.id);
    // Turn the clock back a day, then forward to the same logical day — no reset.
    meta = rollDay(meta, day - 1).meta;
    meta = rollDay(meta, day).meta;
    expect(meta.questsClaimed).toContain(q.id);
    // Claiming the same quest again pays nothing.
    expect(claimInMeta(meta, q.id).reward).toBeNull();
  });
});

describe('reroll — 1×/day (AC1)', () => {
  it('allows exactly MAX_REROLLS per day, refreshed by a new day', () => {
    const day = 20_289;
    let meta = rollDay(createMeta(), day).meta;
    const first = reroll(meta, day);
    expect(first.ok).toBe(true);
    expect(first.meta.rerollsUsed).toBe(MAX_REROLLS);
    expect(first.meta.questIds).toEqual(dailyQuests(day, MAX_REROLLS));
    meta = first.meta;
    // Second reroll same day is refused.
    const second = reroll(meta, day);
    expect(second.ok).toBe(false);
    expect(second.meta).toBe(meta);
    // A new day resets the reroll budget.
    meta = rollDay(meta, day + 1).meta;
    expect(meta.rerollsUsed).toBe(0);
    expect(reroll(meta, day + 1).ok).toBe(true);
  });
});

describe('dailyLogin — streak, day-7 bonus, weekly protect (AC2)', () => {
  it('grants a Goldtruhe on the first login and once per day only', () => {
    let meta = createMeta();
    const r = dailyLogin(meta, 100);
    expect(r.reward).toEqual({ chest: 'gold', keys: 0, streak: 1, protectUsed: false });
    meta = r.meta;
    expect(meta.lastLoginDay).toBe(100);
    // Same day again ⇒ nothing.
    expect(dailyLogin(meta, 100).reward).toBeNull();
    // Backward clock ⇒ nothing (can't re-grant by rewinding).
    expect(dailyLogin(meta, 99).reward).toBeNull();
  });

  it('advances the streak on consecutive days and pays the day-7 bonus, then wraps', () => {
    let meta = createMeta();
    let reward = dailyLogin(meta, 100).reward!;
    meta = dailyLogin(meta, 100).meta;
    for (let d = 101; d <= 106; d++) {
      const res = dailyLogin(meta, d);
      meta = res.meta;
      reward = res.reward!;
    }
    // Day 7 of the streak (7th consecutive login) = Diamanttruhe + 2 🔑.
    expect(reward.streak).toBe(7);
    expect(reward.chest).toBe('diamond');
    expect(reward.keys).toBe(2);
    // Next consecutive day wraps back to 1 (Goldtruhe).
    const wrap = dailyLogin(meta, 107);
    expect(wrap.reward!.streak).toBe(1);
    expect(wrap.reward!.chest).toBe('gold');
  });

  it('the free weekly streak-protect survives one missed day, once per week', () => {
    let meta = dailyLogin(createMeta(), 100).meta; // streak 1, week 14
    // Gap of exactly one missed day ⇒ protect kicks in, streak survives.
    const a = dailyLogin(meta, 102);
    expect(a.reward!.protectUsed).toBe(true);
    expect(a.reward!.streak).toBe(2);
    meta = a.meta;
    // A second gap in the SAME week ⇒ protect spent ⇒ streak breaks.
    const b = dailyLogin(meta, 104);
    expect(b.reward!.protectUsed).toBe(false);
    expect(b.reward!.streak).toBe(1);
  });

  it('the protect refreshes in a new week', () => {
    let meta = dailyLogin(createMeta(), 100).meta; // week 14
    meta = dailyLogin(meta, 102).meta; // protect used (week 14)
    meta = dailyLogin(meta, 103).meta; // consecutive
    meta = dailyLogin(meta, 104).meta;
    meta = dailyLogin(meta, 105).meta; // day 105 is week 15
    const c = dailyLogin(meta, 107); // gap 2 in week 15 ⇒ protect available again
    expect(c.reward!.protectUsed).toBe(true);
    expect(c.reward!.streak).toBe(6);
  });

  it('a gap of two or more missed days breaks the streak (no protect for big gaps)', () => {
    const meta = dailyLogin(createMeta(), 100).meta;
    const r = dailyLogin(meta, 103); // gap 3
    expect(r.reward!.streak).toBe(1);
    expect(r.reward!.protectUsed).toBe(false);
  });
});

describe('repairFutureDays — forward-clock repair (§9.2.2)', () => {
  it('returns the same slice when nothing is in the future', () => {
    const meta = { ...rollDay(createMeta(), 100).meta, lastLoginDay: 100 };
    expect(repairFutureDays(meta, 100)).toBe(meta);
    expect(repairFutureDays(meta, 250)).toBe(meta);
    const fresh = createMeta();
    expect(repairFutureDays(fresh, 0)).toBe(fresh); // day/lastLoginDay -1 are fine
  });

  it('clamps future high-waters to today so dailies are not frozen for years', () => {
    // Save stamped under a clock set ~1 year ahead, then corrected.
    const warped = { ...rollDay(createMeta(), 465).meta, lastLoginDay: 465 };
    const today = 100;
    const fixed = repairFutureDays(warped, today);
    expect(fixed.day).toBe(today);
    expect(fixed.lastLoginDay).toBe(today);
    // Neutral today: no re-roll, no login re-grant …
    expect(rollDay(fixed, today).changed).toBe(false);
    expect(dailyLogin(fixed, today).reward).toBeNull();
    // … and everything resumes normally tomorrow.
    expect(rollDay(fixed, today + 1).changed).toBe(true);
    expect(dailyLogin(fixed, today + 1).reward).not.toBeNull();
  });

  it('clamps each high-water independently (quests kept, claims preserved)', () => {
    let meta = rollDay(createMeta(), 465).meta; // quests rolled "in the future"
    const q = activeQuests(meta)[0];
    meta = advanceMeta(meta, q.metric, q.target);
    meta = claimInMeta(meta, q.id).meta;
    const fixed = repairFutureDays({ ...meta, lastLoginDay: 465 }, 100);
    // The rolled quest set + claim stay (no progress nuked) — only the days clamp.
    expect(fixed.questIds).toEqual(meta.questIds);
    expect(fixed.questsClaimed).toContain(q.id);
    expect(claimInMeta(fixed, q.id).reward).toBeNull(); // still not re-claimable
  });
});

describe('catalog integrity', () => {
  it('exposes distinct ids and enough quests for 3 distinct slots', () => {
    expect(new Set(QUEST_IDS).size).toBe(QUEST_IDS.length);
    expect(QUEST_IDS.length).toBeGreaterThanOrEqual(DAILY_QUEST_SLOTS + 3);
    expect(isQuestId('boss-4')).toBe(true);
    expect(isQuestId('nope')).toBe(false);
  });
});
