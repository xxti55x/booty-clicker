import { describe, expect, it } from 'vitest';

import { isTap, TAP_MAX_DIST, TAP_MAX_MS } from './input';

describe('isTap', () => {
  it('accepts a quick, stationary press', () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(TAP_MAX_DIST, TAP_MAX_MS)).toBe(true);
  });

  it('rejects a drag (too much travel)', () => {
    expect(isTap(TAP_MAX_DIST + 1, 100)).toBe(false);
  });

  it('rejects a long hold', () => {
    expect(isTap(2, TAP_MAX_MS + 1)).toBe(false);
  });
});
