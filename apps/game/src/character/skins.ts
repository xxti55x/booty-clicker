import type { SkinConfig, SkinKey } from '../types';

/**
 * The ten character skins — procedural visual configs (materials/colours for the
 * rig) plus **gear metadata** (rarity + per-level buff + per-star bonus, spec §5.3).
 *
 * Skins are gear, not cosmetics (M11): the active skin's buff feeds the pure
 * `game/gear.ts` fold. The visual fields were retuned for the Wave-1 cartoon art
 * direction (bold saturated cel colours + the optional `accent`/`outline`/
 * `bands`/`cape`/`flair` fields the toon rig reads); every skin still reuses one
 * of the five rig `style` silhouettes so `character/rig.ts` builds all ten.
 * `cost`/`revealAt` are the old M0–M6 BP-shop fields (kept for the archived
 * shop); M11 gating lives in `game/gear.ts` (`skinUnlocked`), never here. No
 * real people (spec §4.3/§4.5).
 *
 * P1 balance (review, DECISIONS.md): the strongest buff in the catalog MUST be a
 * click buff (§5.1) — Klassiker leads at +8 %/lv click (×5 at Lv 50, ×5.5 with 5★),
 * Robo-Twerk follows at +6 %/lv crew-DPS (×4 max). This deliberately deviates from
 * the §5.3 table (4 %/8 %), which contradicted §5.1 by letting the idle skin
 * out-scale the click skin; the sim gate (`sim.test.ts`, M11-AC5) derives its
 * best-in-slot multipliers from THIS data, so a future flip fails CI.
 */
export const SKINS: Record<SkinKey, SkinConfig> = {
  classic: {
    icon: '🕺',
    name: 'Klassiker',
    cost: 0,
    style: 'human',
    skin: 0xe3a06a, // warm cartoon tan
    shorts: 0xa8e831, // brand lime
    hair: 0x5a3213, // chocolate swoosh
    accent: 0xa8e831,
    outline: 0x1f130a,
    revealAt: 0,
    rarity: 'common',
    buff: { stat: 'clickPct', perLevel: 0.08 }, // strongest buff = click (P1, §5.1)
    star: { stat: 'clickPct', perStar: 0.1 },
  },
  disco: {
    icon: '🪩',
    name: 'Disco-King',
    cost: 0,
    style: 'disco',
    skin: 0xa06a45, // warm brown, bare-chested 70s king
    shorts: 0xffd24d, // gold flares
    hair: 0x1e1510, // giant afro
    accent: 0xffd24d, // gold glasses rim + medallion
    outline: 0x160e06,
    revealAt: 0,
    rarity: 'rare',
    buff: { stat: 'critChance', perLevel: 0.004 },
    star: { stat: 'critMult', perStar: 0.05 },
  },
  robo: {
    icon: '🤖',
    name: 'Robo-Twerk 3000',
    cost: 250,
    style: 'robot',
    skin: 0x8ba2c0, // friendly chrome blue-grey
    shorts: 0x2aa7e8, // sky-blue chassis
    hair: 0x333333,
    accent: 0x38bdf8, // visor pixels + core glow
    outline: 0x0d1420,
    revealAt: 300,
    rarity: 'rare',
    buff: { stat: 'dpsPct', perLevel: 0.06 }, // strictly below the click skin (P1)
    star: { stat: 'coachCps', perStar: 0.2 },
  },
  host: {
    icon: '🎤',
    name: 'Der Showmaster',
    cost: 1500,
    style: 'host',
    skin: 0xeab184, // stage-lit complexion
    shorts: 0x222338, // midnight suit
    hair: 0x33200e, // slick quiff
    accent: 0xa8e831, // lime showbiz tie
    outline: 0x11101c,
    revealAt: 4000,
    rarity: 'epic',
    buff: { stat: 'comboWindow', perLevel: 0.06 },
    star: { stat: 'comboDecay', perStar: 0.04 },
  },
  boss: {
    icon: '👑',
    name: 'Goldener Twerk-Tyrann',
    cost: 50000,
    style: 'boss',
    skin: 0xe8a428, // gleaming cartoon gold
    shorts: 0x3a1c0c, // dark bronze trunks
    hair: 0x000000,
    accent: 0xffc93a, // crown / pauldrons / belt
    cape: 0x8a1626, // big bold villain cape
    outline: 0x2a1504,
    revealAt: 40000,
    rarity: 'legendary',
    buff: { stat: 'bossDmg', perLevel: 0.12 },
    star: { stat: 'chestLuck', perStar: 0.02 },
  },
  // ---- M11 new skins (spec §5.3): each reuses an existing rig style. ----
  neon: {
    icon: '🥷',
    name: 'Neon-Ninja',
    cost: 0,
    style: 'human',
    skin: 0x232338, // shadow-blue bodysuit
    shorts: 0x39ff14, // radioactive green
    hair: 0x15151f, // hood
    accent: 0x39ff14, // glowing eyes / headband / wraps
    outline: 0x05070d,
    flair: 'ninja',
    revealAt: 0,
    rarity: 'epic',
    buff: { stat: 'beatWindow', perLevel: 8 },
    star: { stat: 'onBeatMult', perStar: 0.1 },
  },
  pirate: {
    icon: '🏴‍☠️',
    name: 'Pfirsich-Pirat',
    cost: 0,
    style: 'human',
    skin: 0xffb07c, // peachy
    shorts: 0xd83a3a, // corsair red
    hair: 0xc42828, // bandana
    accent: 0xffd24d, // gold earring
    outline: 0x241008,
    flair: 'pirate',
    revealAt: 0,
    rarity: 'rare',
    buff: { stat: 'keyDrop', perLevel: 0.06 },
    star: { stat: 'goldPct', perStar: 0.05 },
  },
  lava: {
    icon: '🌋',
    name: 'Lava-Twerker',
    cost: 0,
    style: 'human',
    skin: 0x3a221c, // cooled magma crust
    shorts: 0xff5714, // molten shorts
    hair: 0x140a08,
    accent: 0xff7a1a, // flame mohawk + glowing eyes + belt
    outline: 0x180502,
    bands: 3, // chunkier heat bands
    flair: 'lava',
    revealAt: 0,
    rarity: 'epic',
    buff: { stat: 'critMult', perLevel: 0.06 },
    star: { stat: 'frenzyDurSec', perStar: 1 },
  },
  gyrator: {
    icon: '🛸',
    name: 'Galaktischer Gyrator',
    cost: 0,
    style: 'robot',
    skin: 0x8b5cf6, // brand-purple saucer chrome
    shorts: 0x22d3ee, // plasma cyan
    hair: 0x1b1030,
    accent: 0x22d3ee, // visor pixels / halo studs / core
    outline: 0x150a28,
    flair: 'saucer',
    revealAt: 0,
    rarity: 'legendary',
    buff: { stat: 'frenzyDur', perLevel: 0.1 },
    star: { stat: 'frenzyCharge', perStar: 0.08 },
  },
  diamond: {
    icon: '💎',
    name: 'Diamant-Booty',
    cost: 0,
    style: 'boss',
    skin: 0xbfe4ff, // icy facet blue
    shorts: 0x67e8f9,
    hair: 0xe8f7ff,
    accent: 0x9ff2ff, // crystal crown + frost glow
    cape: 0xa9d9f7, // frosted cape
    outline: 0x2b5f8a, // blue ink — gem-like
    bands: 2, // graphic poster shading
    flair: 'ice',
    revealAt: 0,
    rarity: 'mythic',
    buff: { stat: 'allPct', perLevel: 0.02 },
    star: { stat: 'allPct', perStar: 0.03 },
  },
};
