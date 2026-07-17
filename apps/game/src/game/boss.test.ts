import { describe, expect, it } from 'vitest';

import {
  BOSS_MAX_HP,
  BOSS_RETRY_EASING,
  BOSS_TIME_S,
  bossHit,
  bossHpFraction,
  bossMaxHpForAttempt,
  bossTick,
  createBoss,
} from './boss';

describe('createBoss', () => {
  it('starts full, fighting, at the 90 s timer', () => {
    const b = createBoss();
    expect(b.hp).toBe(BOSS_MAX_HP);
    expect(b.maxHp).toBe(BOSS_MAX_HP);
    expect(b.timeLeft).toBe(BOSS_TIME_S);
    expect(b.status).toBe('fighting');
    expect(b.attempt).toBe(0);
  });

  it('eases HP by 25% per retry attempt', () => {
    expect(bossMaxHpForAttempt(0)).toBe(BOSS_MAX_HP);
    expect(bossMaxHpForAttempt(1)).toBeCloseTo(BOSS_MAX_HP * BOSS_RETRY_EASING, 6);
    expect(createBoss(2).maxHp).toBeCloseTo(BOSS_MAX_HP * BOSS_RETRY_EASING ** 2, 6);
  });
});

describe('bossHit — perClick-scaled damage', () => {
  it('subtracts perClick * mult and reports damage', () => {
    const b = createBoss();
    const dealt = bossHit(b, 100, 2);
    expect(dealt).toBe(200);
    expect(b.hp).toBe(BOSS_MAX_HP - 200);
  });

  it('is a no-op once the fight is resolved', () => {
    const b = createBoss(4); // small HP pool
    while (b.status === 'fighting') bossHit(b, 100000, 1);
    expect(b.status).toBe('won');
    const hpAfter = b.hp;
    expect(bossHit(b, 100000, 1)).toBe(0);
    expect(b.hp).toBe(hpAfter);
  });
});

describe('winnable and losable within 90 s', () => {
  it('WINNABLE: a strong clicker depletes HP before the timer', () => {
    const b = createBoss();
    // ~260 dmg/click (the expected build at unlock) at ~4 clicks/s for 90 s.
    for (let sec = 0; sec < BOSS_TIME_S && b.status === 'fighting'; sec++) {
      for (let c = 0; c < 4; c++) bossHit(b, 133, 1.95);
      bossTick(b, 1);
    }
    expect(b.status).toBe('won');
  });

  it('LOSABLE: a weak/slow clicker runs out the clock with HP to spare', () => {
    const b = createBoss();
    for (let sec = 0; sec < BOSS_TIME_S && b.status === 'fighting'; sec++) {
      for (let c = 0; c < 3; c++) bossHit(b, 1, 1); // neglected perClick build
      bossTick(b, 1);
    }
    expect(b.status).toBe('lost');
    expect(b.hp).toBeGreaterThan(0);
  });
});

describe('bossTick', () => {
  it('counts down and declares a loss at timeout with HP remaining', () => {
    const b = createBoss();
    bossTick(b, 89);
    expect(b.status).toBe('fighting');
    expect(b.timeLeft).toBeCloseTo(1, 6);
    bossTick(b, 5);
    expect(b.timeLeft).toBe(0);
    expect(b.status).toBe('lost');
  });

  it('does not flip a won fight to lost', () => {
    const b = createBoss(6);
    while (b.status === 'fighting') bossHit(b, 100000, 1);
    expect(b.status).toBe('won');
    bossTick(b, 100);
    expect(b.status).toBe('won');
  });
});

describe('bossHpFraction', () => {
  it('reports remaining HP as 0..1', () => {
    const b = createBoss();
    expect(bossHpFraction(b)).toBe(1);
    bossHit(b, b.maxHp / 2, 1);
    expect(bossHpFraction(b)).toBeCloseTo(0.5, 6);
  });
});
