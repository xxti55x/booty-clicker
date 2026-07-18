import { describe, expect, it } from 'vitest';

import { FLAGS, TRANSCEND_ENABLED, isTranscendEnabled } from './flags';

describe('flags — Transzendenz is LIVE (M15 guard, §4.5.3)', () => {
  // M15 turns the layer on: state/save/derived-power are wired and part 2 adds the
  // UI. This test is now the tripwire against a regression that switches the shipped
  // layer back OFF (which would strip TE power + hide the 🔮 tab from every player).
  it('TRANSCEND_ENABLED is true', () => {
    expect(TRANSCEND_ENABLED).toBe(true);
  });

  it('the FLAGS registry mirrors the constant', () => {
    expect(FLAGS.transcend).toBe(true);
  });

  it('isTranscendEnabled() returns a boolean, on by default (no env override)', () => {
    const enabled = isTranscendEnabled();
    expect(typeof enabled).toBe('boolean');
    expect(enabled).toBe(true);
  });
});
