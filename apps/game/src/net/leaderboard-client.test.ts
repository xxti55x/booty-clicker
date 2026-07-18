import { describe, expect, it } from 'vitest';

import {
  type LeaderboardOpts,
  type ScorePayload,
  fetchTop,
  isLeaderboardEnabled,
  submitScore,
  validateClientNickname,
} from './leaderboard-client';

interface ResLike {
  ok: boolean;
  json(): Promise<unknown>;
}
type FetchArgs = { url: string; init?: RequestInit };

/** A fake fetch that records calls and returns a canned response. */
function fakeFetch(res: ResLike | (() => Promise<ResLike>)): {
  fetchImpl: LeaderboardOpts['fetchImpl'];
  calls: FetchArgs[];
} {
  const calls: FetchArgs[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<ResLike> => {
    calls.push({ url, init });
    return typeof res === 'function' ? res() : res;
  };
  return { fetchImpl, calls };
}

const PAYLOAD: ScorePayload = { maxZone: 42, souls: 5, ascensions: 2 };
const BASE = 'https://api.test';

describe('validateClientNickname', () => {
  it('accepts trimmed 2–16 chars of [a-zA-Z0-9_ ]', () => {
    expect(validateClientNickname('Al')).toBe('Al');
    expect(validateClientNickname('  Twerk_Star 7 ')).toBe('Twerk_Star 7');
  });
  it('rejects too short/long and illegal characters', () => {
    expect(validateClientNickname('a')).toBeNull();
    expect(validateClientNickname('x'.repeat(17))).toBeNull();
    expect(validateClientNickname('nö!')).toBeNull();
    expect(validateClientNickname('🍑')).toBeNull();
  });
});

describe('default-OFF (VITE_API_BASE unset in tests)', () => {
  it('is reported disabled', () => {
    expect(isLeaderboardEnabled()).toBe(false);
  });
  it('submitScore/fetchTop resolve null without throwing', async () => {
    await expect(submitScore('Alice', PAYLOAD)).resolves.toBeNull();
    await expect(fetchTop()).resolves.toBeNull();
  });
  it('disabled (empty base) ⇒ null WITHOUT calling fetch', async () => {
    const { fetchImpl, calls } = fakeFetch({ ok: true, json: async () => ({ rank: 1 }) });
    await expect(submitScore('Alice', PAYLOAD, { base: '', fetchImpl })).resolves.toBeNull();
    await expect(fetchTop(50, { base: '', fetchImpl })).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('submitScore — v2 POST /api/v2/scores', () => {
  it('returns the rank on success and sends the v2 body', async () => {
    const { fetchImpl, calls } = fakeFetch({ ok: true, json: async () => ({ rank: 3 }) });
    const r = await submitScore('Alice', PAYLOAD, { base: BASE, fetchImpl });
    expect(r).toEqual({ rank: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/v2/scores`);
    expect(calls[0].init?.method).toBe('POST');
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body).toEqual({ nickname: 'Alice', maxZone: 42, souls: 5, ascensions: 2 });
  });

  it('trims the nickname client-side before sending', async () => {
    const { fetchImpl, calls } = fakeFetch({ ok: true, json: async () => ({ rank: 1 }) });
    await submitScore('  Bo b  ', PAYLOAD, { base: BASE, fetchImpl });
    expect(JSON.parse(calls[0].init?.body as string).nickname).toBe('Bo b');
  });

  it('rejects an invalid nickname WITHOUT calling fetch', async () => {
    const { fetchImpl, calls } = fakeFetch({ ok: true, json: async () => ({ rank: 1 }) });
    await expect(submitScore('!', PAYLOAD, { base: BASE, fetchImpl })).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('fail-silent on non-2xx, network error, and timeout', async () => {
    // Non-ok status.
    const bad = fakeFetch({ ok: false, json: async () => ({}) });
    await expect(
      submitScore('Alice', PAYLOAD, { base: BASE, fetchImpl: bad.fetchImpl }),
    ).resolves.toBeNull();
    // Thrown network error.
    const throwing: LeaderboardOpts['fetchImpl'] = async () => {
      throw new Error('network down');
    };
    await expect(
      submitScore('Alice', PAYLOAD, { base: BASE, fetchImpl: throwing }),
    ).resolves.toBeNull();
    // Timeout: a hanging fetch that only rejects when aborted.
    const hanging: LeaderboardOpts['fetchImpl'] = (_url, init) =>
      new Promise<ResLike>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expect(
      submitScore('Alice', PAYLOAD, { base: BASE, fetchImpl: hanging, timeoutMs: 5 }),
    ).resolves.toBeNull();
  });
});

describe('fetchTop — v2 GET /api/v2/scores/top', () => {
  it('returns the rows on success', async () => {
    const rows = [{ nickname: 'A', maxZone: 90, souls: 30, ascensions: 3, updatedAt: 't' }];
    const { fetchImpl, calls } = fakeFetch({ ok: true, json: async () => rows });
    const top = await fetchTop(10, { base: BASE, fetchImpl });
    expect(top).toEqual(rows);
    expect(calls[0].url).toBe(`${BASE}/api/v2/scores/top?limit=10`);
  });

  it('fail-silent on non-2xx and on a JSON parse error', async () => {
    const bad = fakeFetch({ ok: false, json: async () => [] });
    await expect(fetchTop(10, { base: BASE, fetchImpl: bad.fetchImpl })).resolves.toBeNull();
    const brokenJson = fakeFetch({
      ok: true,
      json: async () => {
        throw new Error('bad json');
      },
    });
    await expect(fetchTop(10, { base: BASE, fetchImpl: brokenJson.fetchImpl })).resolves.toBeNull();
  });
});
