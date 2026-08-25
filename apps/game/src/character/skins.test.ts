import { describe, expect, it } from 'vitest';

import type { BuffStat, SkinKey, SkinRarity, SkinStyle } from '../types';
import { PERCENT_STATS } from '../game/gear';
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
      // SELTENHEITS-RETUNE (Goal: „Seltenheit hat keinen wirklichen Einfluss auf
      // die Stats"). Vorher trug jeder Skin eine eigene Nische, und die Rarität
      // sagte über die STÄRKE nichts aus — ein „legendary" konnte schwächer
      // wirken als ein „rare". Jetzt gibt es eine DPS-Leiter mit genau einem
      // Skin je Stufe, deren Wert mit der Seltenheit steigt, drei Spezialisten
      // (Boss/Gold/Truhe) und zwei End-Skins.
      //
      // Der Klassiker bleibt der Klick-Anker (P1, §5.1) und steht außerhalb der
      // Leiter — er ist die Klick-Achse, nicht die DPS-Achse.
      classic: { rarity: 'common', buff: ['clickPct', 0.18], star: ['clickPct', 0.2] },
      // Die DPS-Leiter: common → rare → epic → legendary.
      pirate: { rarity: 'common', buff: ['dpsPct', 0.03], star: ['dpsPct', 0.04] },
      disco: { rarity: 'rare', buff: ['dpsPct', 0.05], star: ['dpsPct', 0.06] },
      host: { rarity: 'epic', buff: ['dpsPct', 0.08], star: ['dpsPct', 0.09] },
      lava: { rarity: 'legendary', buff: ['dpsPct', 0.12], star: ['dpsPct', 0.14] },
      // Die drei Spezialisten.
      boss: { rarity: 'legendary', buff: ['bossDmg', 0.18], star: ['bossDmg', 0.2] },
      robo: { rarity: 'rare', buff: ['goldPct', 0.06], star: ['goldPct', 0.07] },
      neon: { rarity: 'epic', buff: ['chestLuck', 0.03], star: ['chestLuck', 0.035] },
      // Die beiden End-Skins zahlen auf ALLE Prozent-Stats; die Transzendenz
      // liegt bewusst deutlich über der Himmelfahrt.
      gyrator: { rarity: 'legendary', buff: ['allPct', 0.05], star: ['allPct', 0.06] },
      diamond: { rarity: 'mythic', buff: ['allPct', 0.12], star: ['allPct', 0.15] },
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

// ---------------------------------------------------------------------------
// Seltenheit = Stärke
// ---------------------------------------------------------------------------
// Goal: „Stats der skins nicht logisch. Seltenheit hat keinen wirklichen
// einfluss auf die stats." Vorher trug jeder Skin eine eigene Nische und die
// Rarität sagte über die Stärke nichts — ein „legendary" konnte schwächer
// wirken als ein „rare". Diese Anker halten fest, dass die Leiter jetzt trägt.
describe('SKINS — Seltenheit bedeutet Stärke', () => {
  const RANK: Record<SkinRarity, number> = {
    common: 0,
    rare: 1,
    epic: 2,
    legendary: 3,
    mythic: 4,
  };

  it('trägt eine DPS-Leiter mit genau EINEM Skin je Seltenheit', () => {
    const dps = ALL_KEYS.filter((k) => SKINS[k].buff.stat === 'dpsPct');
    expect(dps).toHaveLength(4);
    const stufen = dps.map((k) => SKINS[k].rarity);
    // Vier verschiedene Stufen — keine doppelt.
    expect(new Set(stufen).size).toBe(4);
    // Und je seltener, desto stärker. Das ist die eigentliche Zusicherung.
    const sorted = [...dps].sort((a, b) => RANK[SKINS[a].rarity] - RANK[SKINS[b].rarity]);
    for (let i = 1; i < sorted.length; i++) {
      expect(SKINS[sorted[i]!].buff.perLevel).toBeGreaterThan(SKINS[sorted[i - 1]!].buff.perLevel);
      expect(SKINS[sorted[i]!].star.perStar).toBeGreaterThan(SKINS[sorted[i - 1]!].star.perStar);
    }
  });

  it('gibt jedem Spezialisten genau eine Rolle — und nur einmal', () => {
    for (const stat of ['bossDmg', 'goldPct', 'chestLuck'] as const) {
      expect(ALL_KEYS.filter((k) => SKINS[k].buff.stat === stat)).toHaveLength(1);
    }
  });

  it('macht die beiden End-Skins zu den stärksten — Transzendenz klar an der Spitze', () => {
    const gyrator = SKINS.gyrator; // Himmelfahrt-gesperrt
    const diamond = SKINS.diamond; // Transzendenz-gesperrt
    // Beide zahlen auf ALLE Prozent-Stats, sind also breiter als jeder Spezialist.
    expect(gyrator.buff.stat).toBe('allPct');
    expect(diamond.buff.stat).toBe('allPct');
    // Der Transzendenz-Skin liegt deutlich über dem Himmels-Skin („soll op sein").
    expect(diamond.buff.perLevel).toBeGreaterThan(gyrator.buff.perLevel * 2);
    expect(diamond.star.perStar).toBeGreaterThan(gyrator.star.perStar * 2);
    // Und schon der Himmels-Skin schlägt die beste Stufe der DPS-Leiter, weil er
    // dieselbe Zahl auf JEDE Prozent-Achse legt statt nur auf eine.
    const bestDps = Math.max(
      ...ALL_KEYS.filter((k) => SKINS[k].buff.stat === 'dpsPct').map((k) => SKINS[k].buff.perLevel),
    );
    expect(gyrator.buff.perLevel * PERCENT_STATS.length).toBeGreaterThan(bestDps);
  });

  it('lässt den Klassiker den Klick-Anker bleiben (P1)', () => {
    // Er steht bewusst NEBEN der DPS-Leiter: Klick ist eine eigene Achse.
    expect(SKINS.classic.buff.stat).toBe('clickPct');
    const clickSkins = ALL_KEYS.filter((k) => SKINS[k].buff.stat === 'clickPct');
    expect(clickSkins).toEqual(['classic']);
  });
});
