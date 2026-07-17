import { describe, expect, it } from 'vitest';

import {
  BOSS_TIME_S,
  bossHp,
  bossTimeFraction,
  createCombat,
  goldFor,
  hit,
  hpFraction,
  isBossZone,
  MONSTERS_PER_ZONE,
  monsterHp,
  spawnFor,
  tickBoss,
  travelTo,
} from './combat';

/** Kill the current target outright (one huge hit). */
function oneShot(state: ReturnType<typeof createCombat>) {
  return hit(state, state.hp);
}

describe('combat — zones & HP scaling', () => {
  it('zone-1 rival uses the base HP; HP grows exponentially by zone', () => {
    expect(monsterHp(1)).toBe(10);
    expect(monsterHp(2)).toBeCloseTo(16, 6);
    expect(monsterHp(5)).toBeGreaterThan(monsterHp(4));
    expect(bossHp(1)).toBe(monsterHp(1) * 10);
  });

  it('marks every 5th zone as a boss zone', () => {
    expect(isBossZone(5)).toBe(true);
    expect(isBossZone(10)).toBe(true);
    expect(isBossZone(4)).toBe(false);
    expect(isBossZone(1)).toBe(false);
  });

  it('boss gold dwarfs a normal kill', () => {
    expect(goldFor(3, true)).toBeGreaterThan(goldFor(3, false));
    expect(goldFor(1, false)).toBeGreaterThanOrEqual(1);
  });

  it('hp/boss-time fractions clamp to [0,1]', () => {
    const s = createCombat();
    expect(hpFraction(s)).toBe(1);
    expect(hpFraction({ ...s, hp: -5 })).toBe(0);
    expect(bossTimeFraction(s)).toBe(0); // not a boss
    const boss = spawnFor(5, MONSTERS_PER_ZONE, 5);
    expect(bossTimeFraction(boss)).toBe(1);
  });
});

describe('combat — progression reducer', () => {
  it('a non-lethal hit only reduces hp', () => {
    const s = createCombat();
    const r = hit(s, 3);
    expect(r.killed).toBe(false);
    expect(r.state.hp).toBe(s.hp - 3);
    expect(r.gold).toBe(0);
  });

  it('killing a rival awards gold and moves to the next rival in-zone', () => {
    const s = createCombat();
    const r = oneShot(s);
    expect(r.killed).toBe(true);
    expect(r.gold).toBe(goldFor(1, false));
    expect(r.advancedZone).toBe(false);
    expect(r.state.zone).toBe(1);
    expect(r.state.killsThisZone).toBe(1);
  });

  it('clearing a normal zone advances to the next zone', () => {
    let s = createCombat();
    for (let i = 0; i < MONSTERS_PER_ZONE - 1; i++) s = oneShot(s).state;
    expect(s.killsThisZone).toBe(MONSTERS_PER_ZONE - 1);
    const r = oneShot(s); // the 10th kill on zone 1 (normal) → advance
    expect(r.advancedZone).toBe(true);
    expect(r.state.zone).toBe(2);
    expect(r.state.killsThisZone).toBe(0);
    expect(r.state.maxZone).toBe(2);
  });

  it('a boss spawns after clearing the rivals on a boss zone, then gates the next zone', () => {
    // jump to zone 5 with 9 kills already done
    let s = spawnFor(5, MONSTERS_PER_ZONE - 1, 5);
    const spawn = oneShot(s); // 10th kill on a boss zone → boss appears
    expect(spawn.bossSpawned).toBe(true);
    expect(spawn.advancedZone).toBe(false);
    expect(spawn.state.boss).toBe(true);
    expect(spawn.state.hpMax).toBe(bossHp(5));
    expect(spawn.state.bossTimer).toBe(BOSS_TIME_S);

    s = spawn.state;
    const kill = oneShot(s); // boss down → advance
    expect(kill.advancedZone).toBe(true);
    expect(kill.gold).toBe(goldFor(5, true));
    expect(kill.state.zone).toBe(6);
    expect(kill.state.boss).toBe(false);
  });
});

describe('combat — boss timer', () => {
  it('counts down and expires, bouncing back to farming (no zone lost)', () => {
    const boss = spawnFor(5, MONSTERS_PER_ZONE, 5);
    const mid = tickBoss(boss, 10);
    expect(mid.failed).toBe(false);
    expect(mid.state.bossTimer).toBeCloseTo(BOSS_TIME_S - 10, 6);

    const dead = tickBoss(boss, BOSS_TIME_S + 1);
    expect(dead.failed).toBe(true);
    expect(dead.state.boss).toBe(false);
    expect(dead.state.zone).toBe(5); // still zone 5
    expect(dead.state.killsThisZone).toBe(0); // refarm the rivals
  });

  it('is a no-op for a non-boss target', () => {
    const s = createCombat();
    expect(tickBoss(s, 5).failed).toBe(false);
    expect(tickBoss(s, 5).state).toEqual(s);
  });
});

describe('combat — travel', () => {
  it('clamps to cleared zones and spawns a fresh rival', () => {
    const s = spawnFor(8, 3, 8);
    expect(travelTo(s, 3).zone).toBe(3);
    expect(travelTo(s, 999).zone).toBe(8); // clamp to maxZone
    expect(travelTo(s, 0).zone).toBe(1); // clamp to 1
    expect(travelTo(s, 3).killsThisZone).toBe(0);
  });
});
