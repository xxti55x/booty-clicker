import { describe, expect, it } from 'vitest';

import {
  fetchTop,
  isLeaderboardEnabled,
  submitScore,
  validateClientNickname,
} from './leaderboard-client';

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

describe('fail-silent when no API is configured (VITE_API_BASE unset in tests)', () => {
  it('is reported disabled', () => {
    expect(isLeaderboardEnabled()).toBe(false);
  });
  it('submitScore resolves to null without throwing', async () => {
    await expect(submitScore('Alice', 42)).resolves.toBeNull();
  });
  it('fetchTop resolves to null without throwing', async () => {
    await expect(fetchTop()).resolves.toBeNull();
  });
});
