import { describe, expect, it } from 'vitest';

import type { BuffStat, SkinKey, SkinRarity, SkinStyle } from '../types';
import { SKINS } from './skins';

const ALL_KEYS: SkinKey[] = [
  'classic',
  'disco',
  'robo',
  'host',
  'boss',
  'neon',
  'pirate',
  'lava',
  'gyrator',
  'diamond',
];

const RIG_STYLES: ReadonlySet<SkinStyle> = new Set(['human', 'disco', 'robot', 'host', 'boss']);
const RARITIES: ReadonlySet<SkinRarity> = new Set([
  'common',
  'rare',
  'epic',
  'legendary',
  'mythic',
]);
const BUFF_STATS: ReadonlySet<BuffStat> = new Set([
  'clickPct',
  'dpsPct',
  'critChance',
  'critMult',
  'comboWindow',
  'comboDecay',
  'goldPct',
  'bossDmg',
  'bossTimer',
  'beatWindow',
  'chestLuck',
  'keyDrop',
  'offlineCap',
  'frenzyDur',
  'allPct',
  'coachCps',
  'onBeatMult',
  'frenzyDurSec',
  'frenzyCharge',
  'offlineRate',
]);

describe('SKINS — catalog completeness (spec §5.3)', () => {
  it('has all ten skins', () => {
    expect(Object.keys(SKINS).sort()).toEqual([...ALL_KEYS].sort());
  });

  it('every skin carries valid rarity + buff + star gear metadata', () => {
    for (const key of ALL_KEYS) {
      const s = SKINS[key];
      expect(RARITIES.has(s.rarity)).toBe(true);
      expect(BUFF_STATS.has(s.buff.stat)).toBe(true);
      expect(BUFF_STATS.has(s.star.stat)).toBe(true);
      expect(Number.isFinite(s.buff.perLevel)).toBe(true);
      expect(Number.isFinite(s.star.perStar)).toBe(true);
      expect(s.buff.perLevel).toBeGreaterThan(0);
      expect(s.star.perStar).toBeGreaterThan(0);
    }
  });
});

describe('SKINS — rig can build all ten (visual shape)', () => {
  it('every skin uses a style the rig branches on, with numeric colours', () => {
    for (const key of ALL_KEYS) {
      const s = SKINS[key];
      expect(RIG_STYLES.has(s.style)).toBe(true);
      for (const c of [s.skin, s.shorts, s.hair]) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(0xffffff);
      }
      expect(typeof s.icon).toBe('string');
      expect(s.icon.length).toBeGreaterThan(0);
    }
  });
});

describe('SKINS — §5.3 catalog values (exact)', () => {
  it('maps buff/star per the catalog table for all ten', () => {
    const expected: Record<
      SkinKey,
      { rarity: SkinRarity; buff: [BuffStat, number]; star: [BuffStat, number] }
    > = {
      classic: { rarity: 'common', buff: ['clickPct', 0.04], star: ['clickPct', 0.1] },
      disco: { rarity: 'rare', buff: ['critChance', 0.004], star: ['critMult', 0.05] },
      robo: { rarity: 'rare', buff: ['dpsPct', 0.08], star: ['coachCps', 0.2] },
      host: { rarity: 'epic', buff: ['comboWindow', 0.06], star: ['comboDecay', 0.04] },
      boss: { rarity: 'legendary', buff: ['bossDmg', 0.12], star: ['chestLuck', 0.02] },
      neon: { rarity: 'epic', buff: ['beatWindow', 8], star: ['onBeatMult', 0.1] },
      pirate: { rarity: 'rare', buff: ['keyDrop', 0.06], star: ['goldPct', 0.05] },
      lava: { rarity: 'epic', buff: ['critMult', 0.06], star: ['frenzyDurSec', 1] },
      gyrator: { rarity: 'legendary', buff: ['frenzyDur', 0.1], star: ['frenzyCharge', 0.08] },
      diamond: { rarity: 'mythic', buff: ['allPct', 0.02], star: ['allPct', 0.03] },
    };
    for (const key of ALL_KEYS) {
      const s = SKINS[key];
      const e = expected[key];
      expect(s.rarity).toBe(e.rarity);
      expect([s.buff.stat, s.buff.perLevel]).toEqual(e.buff);
      expect([s.star.stat, s.star.perStar]).toEqual(e.star);
    }
  });
});
