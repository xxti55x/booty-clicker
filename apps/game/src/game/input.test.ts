import { describe, expect, it } from 'vitest';

import { isTap, shouldShakeOnKey, TAP_MAX_DIST, TAP_MAX_MS } from './input';

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

describe('shouldShakeOnKey (B4: held space is not an autoclicker)', () => {
  it('shakes on a fresh spacebar press', () => {
    expect(shouldShakeOnKey('Space', false)).toBe(true);
  });

  it('does NOT shake on an auto-repeat spacebar (held key)', () => {
    expect(shouldShakeOnKey('Space', true)).toBe(false);
  });

  it('a held spacebar produces exactly one shake across a repeat burst', () => {
    // The initial keydown (repeat:false) then a stream of repeat:true events.
    const events = [false, true, true, true, true, true, true];
    const shakes = events.filter((repeat) => shouldShakeOnKey('Space', repeat)).length;
    expect(shakes).toBe(1);
  });

  it('ignores other keys', () => {
    expect(shouldShakeOnKey('Enter', false)).toBe(false);
    expect(shouldShakeOnKey('KeyW', false)).toBe(false);
  });
});
