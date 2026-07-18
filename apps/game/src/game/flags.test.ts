import { describe, expect, it } from 'vitest';

import { FLAGS, TRANSCEND_ENABLED, isTranscendEnabled } from './flags';

describe('flags — Transzendenz scaffold ships OFF (M14 guard, §11 #5)', () => {
  // The scaffold (transcend.ts) must never leak into live play until M15 turns it
  // on: a shipped M14 build has the flag hard-false. This test is the tripwire.
  it('TRANSCEND_ENABLED is false', () => {
    expect(TRANSCEND_ENABLED).toBe(false);
  });

  it('the FLAGS registry mirrors the constant', () => {
    expect(FLAGS.transcend).toBe(false);
  });

  it('isTranscendEnabled() returns a boolean, off by default (no env override)', () => {
    const enabled = isTranscendEnabled();
    expect(typeof enabled).toBe('boolean');
    expect(enabled).toBe(false);
  });
});
