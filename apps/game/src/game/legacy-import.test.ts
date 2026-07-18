import { describe, expect, it } from 'vitest';

import { createChState, gearUnlockCtx } from './ch-state';
import { skinUnlocked } from './gear';
import { applyLegacyInheritance, LEGACY_RS_PER_REBIRTH } from './legacy-import';
import type { SaveDataV4 } from '../save/schema';

function legacySave(rebirths: number, extra: Partial<SaveDataV4> = {}): SaveDataV4 {
  return {
    schemaVersion: 4,
    bp: 0,
    upgrades: {},
    skin: 'classic',
    bg: 'club',
    unlocked: {
      classic: true,
      disco: false,
      robo: false,
      host: false,
      boss: false,
      neon: false,
      pirate: false,
      lava: false,
      gyrator: false,
      diamond: false,
    },
    lastSeen: 1,
    maxBp: 0,
    prestigeMult: 1,
    rebirths,
    bossDefeated: false,
    achievements: [],
    totalClicks: 0,
    maxCombo: 0,
    peachesClicked: 0,
    nextPeachAt: 0,
    boostUntil: 0,
    ...extra,
  };
}

describe('applyLegacyInheritance (Erbe der alten Tour)', () => {
  it('grants 7 RS per rebirth and marks imported (NG+3 ⇒ 21 RS)', () => {
    const ch = createChState();
    const after = applyLegacyInheritance(ch, legacySave(3));
    expect(after.souls).toBe(21);
    expect(after.souls).toBe(3 * LEGACY_RS_PER_REBIRTH);
    expect(after.legacyImported).toBe(true);
  });

  it('adds the bonus on top of existing souls', () => {
    const ch = { ...createChState(), souls: 5 };
    const after = applyLegacyInheritance(ch, legacySave(2));
    expect(after.souls).toBe(5 + 14);
  });

  it('is idempotent — a second boot never double-dips', () => {
    const once = applyLegacyInheritance(createChState(), legacySave(3));
    const twice = applyLegacyInheritance(once, legacySave(3));
    expect(twice).toBe(once); // unchanged reference
    expect(twice.souls).toBe(21);
  });

  it('with no legacy save, only sets the flag (souls unchanged)', () => {
    const ch = { ...createChState(), souls: 4 };
    const after = applyLegacyInheritance(ch, null);
    expect(after.souls).toBe(4);
    expect(after.legacyImported).toBe(true);
  });

  it('treats 0 / negative / non-finite rebirths as no bonus', () => {
    expect(applyLegacyInheritance(createChState(), legacySave(0)).souls).toBe(0);
    expect(applyLegacyInheritance(createChState(), legacySave(-3)).souls).toBe(0);
    expect(applyLegacyInheritance(createChState(), legacySave(Number.NaN)).souls).toBe(0);
  });

  // AC3 (§5, §9.2.3): a bossDefeated legacy tour ⇒ the Tyrann skin is unlocked from
  // M11 on, even at a shallow CH zone (the persisted latch feeds the unlock context).
  it('AC3: a bossDefeated legacy save latches legacyTyrann ⇒ Tyrann unlocked', () => {
    const after = applyLegacyInheritance(createChState(), legacySave(0, { bossDefeated: true }));
    expect(after.legacyTyrann).toBe(true);
    // Fresh CH run (lifetimeMaxZone 1) — normally no boss kills — yet Tyrann unlocks.
    expect(skinUnlocked('boss', gearUnlockCtx(after))).toBe(true);
  });

  it('a legacy save WITHOUT bossDefeated leaves Tyrann locked', () => {
    const after = applyLegacyInheritance(createChState(), legacySave(2, { bossDefeated: false }));
    expect(after.legacyTyrann).toBe(false);
    expect(skinUnlocked('boss', gearUnlockCtx(after))).toBe(false);
  });
});
