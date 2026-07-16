import type { SkinConfig, SkinKey } from '../types';

/** The five character skins, values identical to the prototype (spec §4.3, §4.5: no real people). */
export const SKINS: Record<SkinKey, SkinConfig> = {
  classic: {
    icon: '🕺',
    name: 'Klassiker',
    cost: 0,
    style: 'human',
    skin: 0xc98e63,
    shorts: 0xa8e831,
    hair: 0x241608,
  },
  disco: {
    icon: '🪩',
    name: 'Disco-King',
    cost: 0,
    style: 'disco',
    skin: 0x8d5a3c,
    shorts: 0xffd24d,
    hair: 0x120c06,
  },
  robo: {
    icon: '🤖',
    name: 'Robo-Twerk 3000',
    cost: 250,
    style: 'robot',
    skin: 0x8f98a6,
    shorts: 0x38bdf8,
    hair: 0x333333,
  },
  host: {
    icon: '🎤',
    name: 'Der Showmaster',
    cost: 1500,
    style: 'host',
    skin: 0xe0ac7e,
    shorts: 0x14141f,
    hair: 0x1a1208,
  },
  boss: {
    icon: '👑',
    name: 'Goldener Twerk-Tyrann',
    cost: 50000,
    style: 'boss',
    skin: 0xc9a227,
    shorts: 0x30180a,
    hair: 0x000000,
  },
};
