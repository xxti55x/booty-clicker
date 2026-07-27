import { describe, expect, it } from 'vitest';

import {
  ALL_BOARD,
  createApp,
  RATE_LIMIT_PER_MIN,
  validateBoard,
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

/**
 * In-memory repo. The v2 side is keyed by BOARD (X4) — a `Map` of board →
 * rows —, exactly like the D1 adapter's two tables: `all` is its own board and
 * every other key is isolated from it and from every other key.
 */
function fakeRepo(): ScoreRepo {
  const rows: ScoreRow[] = [];
  const boards = new Map<string, ScoreRowV2[]>();
  const of = (board: string): ScoreRowV2[] => {
    const b = boards.get(board) ?? [];
    boards.set(board, b);
    return b;
  };
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
    async upsertV2(r, board = ALL_BOARD) {
      const v2 = of(board);
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
    async rankForV2(r, board = ALL_BOARD) {
      return (
        of(board).filter(
          (x) =>
            x.maxZone > r.maxZone ||
            (x.maxZone === r.maxZone && x.souls > r.souls) ||
            (x.maxZone === r.maxZone && x.souls === r.souls && x.nickname < r.nickname),
        ).length + 1
      );
    },
    async topV2(limit, board = ALL_BOARD) {
      return [...of(board)]
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
  const topV2 = (limit?: number, board?: string) => {
    const q = [
      limit === undefined ? '' : `limit=${limit}`,
      board === undefined ? '' : `board=${board}`,
    ]
      .filter(Boolean)
      .join('&');
    return app.request(`/api/v2/scores/top${q ? `?${q}` : ''}`, {}, {});
  };
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

// ---------------------------------------------------------------------------
// X4: der optionale `board`-Schlüssel (rein additiv)
// ---------------------------------------------------------------------------

describe('validateBoard', () => {
  it('defaults a missing/empty board to the all-time board', () => {
    expect(validateBoard(undefined)).toBe(ALL_BOARD);
    expect(validateBoard(null)).toBe(ALL_BOARD);
    expect(validateBoard('')).toBe(ALL_BOARD);
    expect(validateBoard('all')).toBe(ALL_BOARD);
  });

  it('accepts lowercase keys of [a-z0-9-] up to 24 chars', () => {
    expect(validateBoard('weekly-2951')).toBe('weekly-2951');
    expect(validateBoard('0')).toBe('0');
    expect(validateBoard('a'.repeat(24))).toBe('a'.repeat(24));
  });

  it('rejects uppercase, punctuation, oversized keys and non-strings', () => {
    for (const bad of [
      'Weekly-1',
      'weekly_1',
      'weekly 1',
      '-weekly',
      'weekly/1',
      "a'; DROP TABLE scores_v2;--",
      'a'.repeat(25),
      42,
      {},
      [],
    ]) {
      expect(validateBoard(bad)).toBeNull();
    }
  });
});

describe('board-keyed leaderboards (X4)', () => {
  it('keeps every board isolated — same nickname, independent scores', async () => {
    const { postV2, topV2 } = appWith(fakeRepo(), fakeLimiter(100));
    await postV2({ nickname: 'Twerkia', maxZone: 90, souls: 5, ascensions: 2 });
    await postV2({
      nickname: 'Twerkia',
      maxZone: 12,
      souls: 5,
      ascensions: 2,
      board: 'weekly-2951',
    });
    await postV2({
      nickname: 'Bootyx',
      maxZone: 40,
      souls: 1,
      ascensions: 0,
      board: 'weekly-2951',
    });

    const all = (await (await topV2()).json()) as ScoreRowV2[];
    expect(all.map((r) => [r.nickname, r.maxZone])).toEqual([['Twerkia', 90]]);

    const weekly = (await (await topV2(50, 'weekly-2951')).json()) as ScoreRowV2[];
    expect(weekly.map((r) => [r.nickname, r.maxZone])).toEqual([
      ['Bootyx', 40],
      ['Twerkia', 12],
    ]);
  });

  it('starts the NEXT week empty — the key alone resets the board', async () => {
    const { postV2, topV2 } = appWith(fakeRepo(), fakeLimiter(100));
    await postV2({
      nickname: 'Twerkia',
      maxZone: 60,
      souls: 1,
      ascensions: 0,
      board: 'weekly-2951',
    });
    expect(((await (await topV2(50, 'weekly-2951')).json()) as ScoreRowV2[]).length).toBe(1);
    expect(((await (await topV2(50, 'weekly-2952')).json()) as ScoreRowV2[]).length).toBe(0);
  });

  it('ranks within the board, not across boards', async () => {
    const { postV2 } = appWith(fakeRepo(), fakeLimiter(100));
    // Drei tiefe Einträge auf dem Allzeit-Board …
    for (const n of ['AaA', 'BbB', 'CcC']) {
      await postV2({ nickname: n, maxZone: 500, souls: 9, ascensions: 3 });
    }
    // … drücken den ersten Wochen-Eintrag NICHT nach hinten.
    const res = await postV2({
      nickname: 'Neuling',
      maxZone: 11,
      souls: 0,
      ascensions: 0,
      board: 'weekly-2951',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ rank: 1 });
  });

  it('upserts per nickname WITHIN a board (only a greater maxZone wins)', async () => {
    const { postV2, topV2 } = appWith(fakeRepo(), fakeLimiter(100));
    const board = 'weekly-2951';
    await postV2({ nickname: 'Twerkia', maxZone: 30, souls: 1, ascensions: 0, board });
    await postV2({ nickname: 'Twerkia', maxZone: 12, souls: 9, ascensions: 9, board });
    const rows = (await (await topV2(50, board)).json()) as ScoreRowV2[];
    expect(rows).toHaveLength(1);
    expect(rows[0].maxZone).toBe(30);
    expect(rows[0].souls).toBe(1); // die unterdrückte Zeile ändert auch die Stats nicht
  });

  it('treats an explicit board=all exactly like no board at all', async () => {
    const { postV2, topV2 } = appWith(fakeRepo(), fakeLimiter(100));
    await postV2({ nickname: 'Twerkia', maxZone: 30, souls: 1, ascensions: 0 });
    await postV2({ nickname: 'Bootyx', maxZone: 44, souls: 1, ascensions: 0, board: 'all' });
    const rows = (await (await topV2(50, 'all')).json()) as ScoreRowV2[];
    expect(rows.map((r) => r.nickname)).toEqual(['Bootyx', 'Twerkia']);
  });

  it('rejects an invalid board with 400 on submit and on top', async () => {
    const { postV2, topV2 } = appWith(fakeRepo(), fakeLimiter(100));
    const bad = await postV2({
      nickname: 'Twerkia',
      maxZone: 30,
      souls: 1,
      ascensions: 0,
      board: 'Weekly 2951',
    });
    expect(bad.status).toBe(400);
    expect((await topV2(50, 'WEEKLY')).status).toBe(400);
  });
});
