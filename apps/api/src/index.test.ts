import { describe, expect, it } from 'vitest';

import {
  createApp,
  RATE_LIMIT_PER_MIN,
  validateNickname,
  validateTime,
  type RateLimiter,
  type ScoreRepo,
  type ScoreRow,
} from './index';

function fakeRepo(): ScoreRepo {
  const rows: ScoreRow[] = [];
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
  return { post, top };
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
