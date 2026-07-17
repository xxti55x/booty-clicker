import { describe, expect, it } from 'vitest';

import { createUpgrades, deriveStats } from './economy';
import { createGameState } from './state';
import {
  applyRebirth,
  BOSS_UNLOCK_BP,
  deriveWithPrestige,
  REBIRTH_BP,
  simulatePlaythrough,
} from './progression';

const MIN = 60_000;

describe('milestones', () => {
  it('match the spec (50k boss, 100k rebirth)', () => {
    expect(BOSS_UNLOCK_BP).toBe(50_000);
    expect(REBIRTH_BP).toBe(100_000);
  });
});

describe('simulatePlaythrough — balancing acceptance (spec §5 M2)', () => {
  it('optimal play reaches the boss in 30–50 min at a sustainable click cadence', () => {
    const r = simulatePlaythrough({ clickRate: 3 });
    expect(r.bossMs).not.toBeNull();
    if (r.bossMs === null) throw new Error('boss unreachable');
    expect(r.bossMs).toBeGreaterThanOrEqual(30 * MIN);
    expect(r.bossMs).toBeLessThanOrEqual(50 * MIN);
  });

  it('a brisker player still lands inside the window', () => {
    const r = simulatePlaythrough({ clickRate: 4 });
    expect(r.bossMs).not.toBeNull();
    if (r.bossMs === null) throw new Error('boss unreachable');
    expect(r.bossMs).toBeGreaterThanOrEqual(30 * MIN);
    expect(r.bossMs).toBeLessThanOrEqual(50 * MIN);
  });

  it('the rebirth gate is reachable a while after the boss unlock', () => {
    const r = simulatePlaythrough({ clickRate: 3 });
    expect(r.rebirthMs).not.toBeNull();
    if (r.rebirthMs === null || r.bossMs === null) throw new Error('gate unreachable');
    expect(r.rebirthMs).toBeGreaterThan(r.bossMs);
  });
});

describe('applyRebirth', () => {
  it('resets bp + levels, grants +100% permanent multiplier, and increments rebirths', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    state.bp = 120_000;
    upgrades[0]!.lv = 10;
    upgrades[1]!.lv = 5;
    state.unlocked.robo = true;
    state.bossDefeated = true;
    state.maxBp = 120_000;

    applyRebirth(state, upgrades);

    expect(state.bp).toBe(0);
    for (const u of upgrades) expect(u.lv).toBe(0);
    expect(state.rebirths).toBe(1);
    expect(state.prestigeMult).toBe(2);
    expect(state.perClick).toBe(1);
    expect(state.perSec).toBe(0);
    expect(state.mult).toBe(2); // prestige multiplier alone (no mult upgrades)

    // Cosmetic unlocks, the boss flag and maxBp survive a rebirth.
    expect(state.unlocked.robo).toBe(true);
    expect(state.bossDefeated).toBe(true);
    expect(state.maxBp).toBe(120_000);
  });

  it('stacks cumulatively: each rebirth adds another +100%', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    applyRebirth(state, upgrades);
    applyRebirth(state, upgrades);
    expect(state.rebirths).toBe(2);
    expect(state.prestigeMult).toBe(3);
    expect(state.mult).toBe(3);
  });

  it('prestige multiplies on top of mult upgrades', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    applyRebirth(state, upgrades); // prestigeMult 2
    // Buy a x1.25 mult upgrade (disco) — mult must become 2 * 1.25.
    const disco = upgrades.find((u) => u.id === 'disco');
    if (!disco) throw new Error('missing disco');
    disco.lv = 1;
    deriveWithPrestige(state, upgrades);
    expect(state.mult).toBeCloseTo(2 * 1.25, 10);
  });
});

describe('deriveWithPrestige', () => {
  it('equals plain deriveStats when prestigeMult is 1', () => {
    const state = createGameState();
    const upgrades = createUpgrades();
    const disco = upgrades.find((u) => u.id === 'disco');
    if (!disco) throw new Error('missing disco');
    disco.lv = 2;
    deriveWithPrestige(state, upgrades);
    const plain = deriveStats(upgrades);
    expect(state.mult).toBeCloseTo(plain.mult, 10);
  });
});
