import { describe, expect, it } from 'vitest';

import { bossHpScale } from './boss-gimmicks';
import {
  BOSS_EVERY,
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
    // Zone 1 ist kein Gate ⇒ kein Gimmick-Ausgleich, die rohe ×10-Kurve.
    expect(bossHp(1)).toBe(monsterHp(1) * 10);
  });

  // ROADMAP-V2 A2: An einem echten Gate zahlt der Boss sein Theme-Gimmick in
  // Ausdauer (`GIMMICK_HP_SCALE`) — die Kurve bleibt exponentiell, aber jedes
  // Theme sitzt an seiner eigenen Stufe. Der Faktor kommt aus der EINEN Quelle.
  it('a gated boss carries its gimmick’s Ausdauer scale', () => {
    for (const zone of [10, 20, 30, 40, 50]) {
      expect(bossHp(zone)).toBeCloseTo(monsterHp(zone) * 10 * bossHpScale(zone), 9);
    }
    expect(bossHpScale(10)).toBeLessThan(1); // Spotlight kostet den Boss Ausdauer
    expect(bossHpScale(40)).toBe(1); // Gravitation hilft dem Spieler ⇒ kein Rabatt
    expect(bossHp(20)).toBeGreaterThan(bossHp(10)); // Kurve bleibt monoton …
    expect(bossHp(30)).toBeGreaterThan(bossHp(20));
    expect(bossHp(40)).toBeGreaterThan(bossHp(30));
  });

  it(`marks every ${BOSS_EVERY}th zone as a boss zone`, () => {
    expect(BOSS_EVERY).toBe(10); // Boss-Umbau: alle 10 Bühnen, nicht mehr alle 5
    expect(isBossZone(10)).toBe(true);
    expect(isBossZone(20)).toBe(true);
    expect(isBossZone(5)).toBe(false); // die alten Halb-Gates sind normale Bühnen
    expect(isBossZone(9)).toBe(false);
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
    const boss = spawnFor(10, 0, 10);
    expect(bossTimeFraction(boss)).toBe(1);
  });
});

describe('combat — Boss-Arena (Boss-Umbau)', () => {
  it('spawning ON a gate stage IS the boss fight — no rival wave first', () => {
    const s = spawnFor(10, 0, 10);
    expect(s.boss).toBe(true);
    expect(s.hpMax).toBe(bossHp(10));
    expect(s.bossTimer).toBe(BOSS_TIME_S);
  });

  it('travelling to a cleared gate stage respawns its boss immediately', () => {
    const farming = spawnFor(13, 2, 13);
    const back = travelTo(farming, 10);
    expect(back.boss).toBe(true);
    expect(back.zone).toBe(10);
    expect(back.hpMax).toBe(bossHp(10));
    expect(back.bossTimer).toBe(BOSS_TIME_S);
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

  it('advancing onto a gate stage spawns its boss at once, then gates the next zone', () => {
    // Bühne 9 mit 9 erledigten Rivalen — der nächste Kill stößt auf das Gate vor.
    let s = spawnFor(9, MONSTERS_PER_ZONE - 1, 9);
    const spawn = oneShot(s); // 10th kill on zone 9 → advance INTO the arena
    expect(spawn.advancedZone).toBe(true);
    expect(spawn.bossSpawned).toBe(true); // der Betreten-Moment (Banner/Stinger)
    expect(spawn.state.zone).toBe(10);
    expect(spawn.state.boss).toBe(true);
    expect(spawn.state.hpMax).toBe(bossHp(10));
    expect(spawn.state.bossTimer).toBe(BOSS_TIME_S);

    s = spawn.state;
    const kill = oneShot(s); // boss down → advance
    expect(kill.advancedZone).toBe(true);
    expect(kill.gold).toBe(goldFor(10, true));
    expect(kill.state.zone).toBe(11);
    expect(kill.state.boss).toBe(false);
    expect(kill.bossSpawned).toBe(false); // Bühne 11 ist kein Gate
  });
});

describe('combat — boss timer', () => {
  it('counts down and expires, bouncing back to the PREVIOUS stage to farm', () => {
    const boss = spawnFor(10, 0, 10);
    const mid = tickBoss(boss, 10);
    expect(mid.failed).toBe(false);
    expect(mid.state.bossTimer).toBeCloseTo(BOSS_TIME_S - 10, 6);

    const dead = tickBoss(boss, BOSS_TIME_S + 1);
    expect(dead.failed).toBe(true);
    expect(dead.state.boss).toBe(false);
    expect(dead.state.zone).toBe(9); // one stage back — farm & upgrade
    expect(dead.state.maxZone).toBe(10); // frontier kept: boss stays reachable
    expect(dead.state.killsThisZone).toBe(0);
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

// Farm-Modus (Auto-Vorstoß aus): Der Reducer hält die Bühne, statt vorzurücken.
describe('combat — Farm-Modus (autoAdvance = false)', () => {
  it('rückt bei geräumtem Zähler NICHT vor, sondern beginnt die Runde neu', () => {
    const c = spawnFor(7, MONSTERS_PER_ZONE - 1, 7);
    const r = hit(c, c.hp, false);
    expect(r.killed).toBe(true);
    expect(r.advancedZone).toBe(false);
    expect(r.state.zone).toBe(7); // Bühne hält
    expect(r.state.killsThisZone).toBe(0); // Zähler läuft rund
    expect(r.gold).toBeGreaterThan(0); // Beute zahlt weiter
  });

  it('stellt einen geschlagenen Boss neu — mit frischer Uhr, gleiche Arena', () => {
    const c = spawnFor(20, 0, 20);
    expect(c.boss).toBe(true);
    const r = hit(c, c.hp, false);
    expect(r.killed).toBe(true);
    expect(r.advancedZone).toBe(false);
    expect(r.state.zone).toBe(20);
    expect(r.state.boss).toBe(true);
    expect(r.state.bossTimer).toBe(BOSS_TIME_S); // Uhr steht wieder voll
  });

  it('lässt normale Zwischen-Kills unverändert (nur der Übergang ändert sich)', () => {
    const c = spawnFor(7, 0, 7);
    const auto = hit(c, c.hp, true);
    const farm = hit(c, c.hp, false);
    expect(farm.state.killsThisZone).toBe(auto.state.killsThisZone);
    expect(farm.gold).toBe(auto.gold);
  });

  it('ist per Default an — der Vorstoß bleibt das Normalverhalten', () => {
    const c = spawnFor(7, MONSTERS_PER_ZONE - 1, 7);
    expect(hit(c, c.hp).advancedZone).toBe(true);
  });
});
