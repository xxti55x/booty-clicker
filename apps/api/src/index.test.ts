import { describe, expect, it } from 'vitest';

import {
  createApp,
  RATE_LIMIT_PER_MIN,
  validateNickname,
  validateStat,
  validateTime,
  validateZone,
  type RateLimiter,
  type ScoreRepo,
  type ScoreRow,
  type ScoreRowV2,
} from './index';

/** Binary-collation nickname compare, mirroring SQLite's default `<` / ORDER BY. */
function cmpNick(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function fakeRepo(): ScoreRepo {
  const rows: ScoreRow[] = [];
  const v2: ScoreRowV2[] = [];
  return {
    async insert(r) {
      rows.push(r);
    },
    async rankFor(t) {
      return rows.filter((x) => x.bestTimeS < t).length + 1;
    },
    async top(limit) {
      return [...rows].sort((a, b) => a.bestTimeS - b.bestTimeS).slice(0, limit);
    },
    async upsertV2(r) {
      const existing = v2.find((x) => x.nickname === r.nickname);
      if (!existing) {
        v2.push({ ...r });
        return { ...r };
      }
      if (r.maxZone > existing.maxZone) {
        existing.maxZone = r.maxZone;
        existing.souls = r.souls;
        existing.ascensions = r.ascensions;
        existing.updatedAt = r.updatedAt;
      }
      return { ...existing };
    },
    async rankForV2(r) {
      return (
        v2.filter(
          (x) =>
            x.maxZone > r.maxZone ||
            (x.maxZone === r.maxZone && x.souls > r.souls) ||
            (x.maxZone === r.maxZone && x.souls === r.souls && x.nickname < r.nickname),
        ).length + 1
      );
    },
    async topV2(limit) {
      return [...v2]
        .sort(
          (a, b) => b.maxZone - a.maxZone || b.souls - a.souls || cmpNick(a.nickname, b.nickname),
        )
        .slice(0, limit);
    },
  };
}

function fakeLimiter(max = RATE_LIMIT_PER_MIN): RateLimiter {
  let n = 0;
  return {
    async allow() {
      n += 1;
      return n <= max;
    },
  };
}

function appWith(repo: ScoreRepo, limiter: RateLimiter) {
  const app = createApp<Record<string, unknown>>(
    () => repo,
    () => limiter,
  );
  const post = (body: unknown) =>
    app.request(
      '/api/scores',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      {},
    );
  const top = (limit?: number) =>
    app.request(`/api/scores/top${limit === undefined ? '' : `?limit=${limit}`}`, {}, {});
  const postV2 = (body: unknown) =>
    app.request(
      '/api/v2/scores',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      {},
    );
  const topV2 = (limit?: number) =>
    app.request(`/api/v2/scores/top${limit === undefined ? '' : `?limit=${limit}`}`, {}, {});
  return { post, top, postV2, topV2 };
}

describe('validateNickname', () => {
  it('accepts 2–16 chars of [a-zA-Z0-9_ ] (trimmed)', () => {
    expect(validateNickname('Al')).toBe('Al');
    expect(validateNickname('  Cool_Dancer 99  ')).toBe('Cool_Dancer 99');
    expect(validateNickname('a'.repeat(16))).toBe('a'.repeat(16));
  });

  it('rejects too short/long, bad chars, and non-strings', () => {
    expect(validateNickname('a')).toBeNull();
    expect(validateNickname('a'.repeat(17))).toBeNull();
    expect(validateNickname('nope!')).toBeNull();
    expect(validateNickname('drop<table>')).toBeNull();
    expect(validateNickname('🍑🍑')).toBeNull();
    expect(validateNickname(42)).toBeNull();
    expect(validateNickname(null)).toBeNull();
  });
});

describe('validateTime', () => {
  it('accepts positive integers up to a day', () => {
    expect(validateTime(1)).toBe(1);
    expect(validateTime(2400)).toBe(2400);
    expect(validateTime(86_400)).toBe(86_400);
  });
  it('rejects 0, negatives, floats, oversized and non-numbers', () => {
    expect(validateTime(0)).toBeNull();
    expect(validateTime(-5)).toBeNull();
    expect(validateTime(1.5)).toBeNull();
    expect(validateTime(86_401)).toBeNull();
    expect(validateTime('30')).toBeNull();
    expect(validateTime(Number.NaN)).toBeNull();
  });
});

describe('POST /api/scores', () => {
  it('accepts a valid score and returns a 1-based rank', async () => {
    const { post } = appWith(fakeRepo(), fakeLimiter());
    const r1 = await post({ nickname: 'Alice', bestTimeS: 42 });
    expect(r1.status).toBe(201);
    expect(await r1.json()).toEqual({ rank: 1 });

    const r2 = await post({ nickname: 'Bob', bestTimeS: 30 }); // faster → rank 1
    expect(r2.status).toBe(201);
    expect(await r2.json()).toEqual({ rank: 1 });

    const r3 = await post({ nickname: 'Carol', bestTimeS: 100 }); // slowest → rank 3
    expect(await r3.json()).toEqual({ rank: 3 });
  });

  it('rejects a bad nickname or time with 400', async () => {
    const { post } = appWith(fakeRepo(), fakeLimiter());
    expect((await post({ nickname: '!', bestTimeS: 42 })).status).toBe(400);
    expect((await post({ nickname: 'Alice', bestTimeS: -1 })).status).toBe(400);
    expect((await post({ nickname: 'Alice' })).status).toBe(400);
  });

  it('rate-limits after the per-minute budget with 429', async () => {
    const { post } = appWith(fakeRepo(), fakeLimiter(RATE_LIMIT_PER_MIN));
    for (let i = 0; i < RATE_LIMIT_PER_MIN; i++) {
      expect((await post({ nickname: 'Spammer', bestTimeS: 50 })).status).toBe(201);
    }
    expect((await post({ nickname: 'Spammer', bestTimeS: 50 })).status).toBe(429);
  });
});

describe('GET /api/scores/top', () => {
  it('returns scores ascending by time and honours the limit', async () => {
    const repo = fakeRepo();
    const { post, top } = appWith(repo, fakeLimiter(100));
    await post({ nickname: 'Slow', bestTimeS: 90 });
    await post({ nickname: 'Fast', bestTimeS: 20 });
    await post({ nickname: 'Mid', bestTimeS: 55 });

    const res = await top();
    expect(res.status).toBe(200);
    const rows = (await res.json()) as ScoreRow[];
    expect(rows.map((r) => r.nickname)).toEqual(['Fast', 'Mid', 'Slow']);

    const limited = await top(2);
    expect(((await limited.json()) as ScoreRow[]).length).toBe(2);
  });

  it('clamps an out-of-range limit', async () => {
    const { top } = appWith(fakeRepo(), fakeLimiter());
    expect((await top(9999)).status).toBe(200);
    expect((await top(-3)).status).toBe(200);
  });
});

// ---------------- Leaderboard v2 (§9.7) ----------------

describe('validateZone', () => {
  it('accepts positive integers', () => {
    expect(validateZone(1)).toBe(1);
    expect(validateZone(9999)).toBe(9999);
  });
  it('rejects 0, negatives, floats and non-numbers', () => {
    expect(validateZone(0)).toBeNull();
    expect(validateZone(-2)).toBeNull();
    expect(validateZone(1.5)).toBeNull();
    expect(validateZone('40')).toBeNull();
    expect(validateZone(Number.NaN)).toBeNull();
    expect(validateZone(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('validateStat', () => {
  it('accepts non-negative finite numbers (souls/ascensions)', () => {
    expect(validateStat(0)).toBe(0);
    expect(validateStat(12.5)).toBe(12.5);
    expect(validateStat(1_000_000)).toBe(1_000_000);
  });
  it('rejects negatives, non-finite and non-numbers', () => {
    expect(validateStat(-1)).toBeNull();
    expect(validateStat(Number.NaN)).toBeNull();
    expect(validateStat(Number.POSITIVE_INFINITY)).toBeNull();
    expect(validateStat('5')).toBeNull();
    expect(validateStat(null)).toBeNull();
  });
});

describe('POST /api/v2/scores', () => {
  it('upserts per nickname, replacing only on a strictly greater maxZone', async () => {
    const repo = fakeRepo();
    const { postV2, topV2 } = appWith(repo, fakeLimiter(100));

    // 40 stored.
    let res = await postV2({ nickname: 'Zoe', maxZone: 40, souls: 5, ascensions: 1 });
    expect(res.status).toBe(201);

    // 30 < 40 → suppressed, still 40.
    res = await postV2({ nickname: 'Zoe', maxZone: 30, souls: 99, ascensions: 9 });
    expect(res.status).toBe(201);
    let rows = (await (await topV2()).json()) as ScoreRowV2[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nickname: 'Zoe', maxZone: 40, souls: 5, ascensions: 1 });

    // 55 > 40 → replaces (and its display stats come along).
    res = await postV2({ nickname: 'Zoe', maxZone: 55, souls: 7, ascensions: 2 });
    expect(res.status).toBe(201);
    rows = (await (await topV2()).json()) as ScoreRowV2[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nickname: 'Zoe', maxZone: 55, souls: 7, ascensions: 2 });
  });

  it('returns a correct 1-based rank (higher maxZone = better)', async () => {
    const { postV2 } = appWith(fakeRepo(), fakeLimiter(100));

    expect(
      await (await postV2({ nickname: 'Ann', maxZone: 40, souls: 1, ascensions: 0 })).json(),
    ).toEqual({ rank: 1 });
    // Higher zone → rank 1, pushing Ann to 2.
    expect(
      await (await postV2({ nickname: 'Ben', maxZone: 80, souls: 1, ascensions: 0 })).json(),
    ).toEqual({ rank: 1 });
    // Lowest zone → rank 3.
    expect(
      await (await postV2({ nickname: 'Cal', maxZone: 20, souls: 1, ascensions: 0 })).json(),
    ).toEqual({ rank: 3 });
    // A suppressed re-submit is ranked against the stored (higher) row, not the submission.
    expect(
      await (await postV2({ nickname: 'Ann', maxZone: 5, souls: 1, ascensions: 0 })).json(),
    ).toEqual({ rank: 2 });
  });

  it('breaks maxZone ties by souls DESC, then nickname ASC', async () => {
    const { postV2 } = appWith(fakeRepo(), fakeLimiter(100));
    // Bo is alone → rank 1.
    expect(
      await (await postV2({ nickname: 'Bo', maxZone: 50, souls: 10, ascensions: 0 })).json(),
    ).toEqual({ rank: 1 });
    // Same zone, more souls → ranks ahead of Bo (souls DESC dominates nickname).
    expect(
      await (await postV2({ nickname: 'Al', maxZone: 50, souls: 30, ascensions: 0 })).json(),
    ).toEqual({ rank: 1 });
    // Same zone AND same souls as Bo → nickname ASC breaks it ('Bo' < 'Cy'),
    // so Cy sits behind both Al (souls) and Bo (nickname) → rank 3.
    expect(
      await (await postV2({ nickname: 'Cy', maxZone: 50, souls: 10, ascensions: 0 })).json(),
    ).toEqual({ rank: 3 });
  });

  it('rejects bad nickname / maxZone / stats with 400', async () => {
    const { postV2 } = appWith(fakeRepo(), fakeLimiter(100));
    expect((await postV2({ nickname: '!', maxZone: 40, souls: 1, ascensions: 0 })).status).toBe(
      400,
    );
    expect((await postV2({ nickname: 'Ann', maxZone: 0, souls: 1, ascensions: 0 })).status).toBe(
      400,
    );
    expect((await postV2({ nickname: 'Ann', maxZone: 1.5, souls: 1, ascensions: 0 })).status).toBe(
      400,
    );
    expect((await postV2({ nickname: 'Ann', maxZone: 40, souls: -1, ascensions: 0 })).status).toBe(
      400,
    );
    expect((await postV2({ nickname: 'Ann', maxZone: 40, souls: 1 })).status).toBe(400);
  });

  it('rate-limits after the per-minute budget with 429', async () => {
    const { postV2 } = appWith(fakeRepo(), fakeLimiter(RATE_LIMIT_PER_MIN));
    for (let i = 0; i < RATE_LIMIT_PER_MIN; i++) {
      expect(
        (await postV2({ nickname: 'Spammer', maxZone: 50, souls: 1, ascensions: 0 })).status,
      ).toBe(201);
    }
    expect(
      (await postV2({ nickname: 'Spammer', maxZone: 50, souls: 1, ascensions: 0 })).status,
    ).toBe(429);
  });
});

describe('GET /api/v2/scores/top', () => {
  it('returns rows by maxZone descending and honours the limit', async () => {
    const { postV2, topV2 } = appWith(fakeRepo(), fakeLimiter(100));
    await postV2({ nickname: 'Low', maxZone: 20, souls: 1, ascensions: 0 });
    await postV2({ nickname: 'High', maxZone: 90, souls: 1, ascensions: 0 });
    await postV2({ nickname: 'Mid', maxZone: 55, souls: 1, ascensions: 0 });

    const res = await topV2();
    expect(res.status).toBe(200);
    const rows = (await res.json()) as ScoreRowV2[];
    expect(rows.map((r) => r.nickname)).toEqual(['High', 'Mid', 'Low']);

    const limited = await topV2(2);
    expect(((await limited.json()) as ScoreRowV2[]).length).toBe(2);
  });

  it('clamps an out-of-range limit', async () => {
    const { topV2 } = appWith(fakeRepo(), fakeLimiter());
    expect((await topV2(9999)).status).toBe(200);
    expect((await topV2(-3)).status).toBe(200);
  });
});
