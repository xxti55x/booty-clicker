import { describe, expect, it } from 'vitest';

import { frameDue } from './frame-clock';

describe('frameDue', () => {
  it('is always due when uncapped', () => {
    expect(frameDue(0, 0, 0)).toBe(true);
    expect(frameDue(1, 1000, 0)).toBe(true);
  });

  it('throttles to the target interval', () => {
    // 30 fps -> ~33.3ms interval
    expect(frameDue(1000, 1000, 30)).toBe(false);
    expect(frameDue(1010, 1000, 30)).toBe(false);
    expect(frameDue(1034, 1000, 30)).toBe(true);
  });

  it('allows a 60 Hz frame under a 60 cap despite jitter', () => {
    // ~16.67ms; the 0.5ms slack lets a 16.6ms frame through.
    expect(frameDue(1016.6, 1000, 60)).toBe(true);
  });
});
