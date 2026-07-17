import type { UpgradeState } from './economy';
import type { GameState } from './state';

/**
 * Achievements (spec §5 M4) — 18 milestones, data-driven. Each `check` is a pure
 * predicate over an {@link AchievementCtx} snapshot, so the whole set is
 * unit-testable without a DOM. Unlocked ids persist in the save (schema v4).
 */

export interface AchievementCtx {
  maxBp: number;
  totalClicks: number;
  maxCombo: number;
  peachesClicked: number;
  /** Sum of all upgrade levels. */
  totalLevels: number;
  discoLv: number;
  /** Number of unlocked skins (2 are free at the start). */
  unlockedSkins: number;
  rebirths: number;
  bossDefeated: boolean;
}

export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly icon: string;
  readonly check: (c: AchievementCtx) => boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first',
    name: 'Erste Schritte',
    desc: 'Zum ersten Mal geshaked',
    icon: '👶',
    check: (c) => c.totalClicks >= 1,
  },
  {
    id: 'warm',
    name: 'Warmgetanzt',
    desc: '100 Shakes',
    icon: '🕺',
    check: (c) => c.totalClicks >= 100,
  },
  {
    id: 'machine',
    name: 'Klick-Maschine',
    desc: '1 000 Shakes',
    icon: '🦾',
    check: (c) => c.totalClicks >= 1000,
  },
  {
    id: 'marathon',
    name: 'Dauer-Twerker',
    desc: '10 000 Shakes',
    icon: '🏃',
    check: (c) => c.totalClicks >= 10000,
  },
  {
    id: 'coins',
    name: 'Kleingeld',
    desc: '1 000 BP erreicht',
    icon: '🪙',
    check: (c) => c.maxBp >= 1000,
  },
  {
    id: 'rich',
    name: 'Reich & schön',
    desc: '50 000 BP erreicht',
    icon: '💸',
    check: (c) => c.maxBp >= 50000,
  },
  {
    id: 'millionaire',
    name: 'Booty-Millionär',
    desc: '1 000 000 BP erreicht',
    icon: '🤑',
    check: (c) => c.maxBp >= 1_000_000,
  },
  {
    id: 'combo10',
    name: 'Combo-Starter',
    desc: 'Combo x10',
    icon: '🔥',
    check: (c) => c.maxCombo >= 10,
  },
  {
    id: 'combo50',
    name: 'Combo-König',
    desc: 'Combo x50',
    icon: '👑',
    check: (c) => c.maxCombo >= 50,
  },
  {
    id: 'combo100',
    name: 'Combo-Gott',
    desc: 'Combo x100',
    icon: '⚡',
    check: (c) => c.maxCombo >= 100,
  },
  {
    id: 'firstbuy',
    name: 'Erste Anschaffung',
    desc: 'Ein Upgrade gekauft',
    icon: '🛒',
    check: (c) => c.totalLevels >= 1,
  },
  {
    id: 'shopaholic',
    name: 'Shopaholic',
    desc: '50 Upgrade-Level gekauft',
    icon: '💳',
    check: (c) => c.totalLevels >= 50,
  },
  {
    id: 'stylist',
    name: 'Stil-Ikone',
    desc: 'Einen neuen Skin freigeschaltet',
    icon: '✨',
    check: (c) => c.unlockedSkins >= 3,
  },
  {
    id: 'tourist',
    name: 'Kulissen-Tourist',
    desc: 'Bis Deep Space vorgedrungen',
    icon: '🌌',
    check: (c) => c.maxBp >= 30000,
  },
  {
    id: 'disco',
    name: 'Discokugel',
    desc: 'Discokugel-Faktor gekauft',
    icon: '🪩',
    check: (c) => c.discoLv >= 1,
  },
  {
    id: 'slayer',
    name: 'Tyrannen-Bezwinger',
    desc: 'Den Boss besiegt',
    icon: '🏆',
    check: (c) => c.bossDefeated,
  },
  {
    id: 'reborn',
    name: 'Wiedergeboren',
    desc: 'Zum ersten Mal rebirthed',
    icon: '🌀',
    check: (c) => c.rebirths >= 1,
  },
  {
    id: 'goldrush',
    name: 'Goldrausch',
    desc: 'Einen Goldenen Pfirsich gefangen',
    icon: '🍑',
    check: (c) => c.peachesClicked >= 1,
  },
];

/** Build the evaluation snapshot from the live game state + upgrades. */
export function buildAchievementCtx(
  state: GameState,
  upgrades: readonly UpgradeState[],
): AchievementCtx {
  let totalLevels = 0;
  let discoLv = 0;
  for (const u of upgrades) {
    totalLevels += u.lv;
    if (u.id === 'disco') discoLv = u.lv;
  }
  let unlockedSkins = 0;
  for (const v of Object.values(state.unlocked)) if (v) unlockedSkins += 1;
  return {
    maxBp: state.maxBp,
    totalClicks: state.totalClicks,
    maxCombo: state.maxCombo,
    peachesClicked: state.peachesClicked,
    totalLevels,
    discoLv,
    unlockedSkins,
    rebirths: state.rebirths,
    bossDefeated: state.bossDefeated,
  };
}

/** Achievements whose predicate is now met but that are not yet in `already`. */
export function newlyUnlocked(ctx: AchievementCtx, already: ReadonlySet<string>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !already.has(a.id) && a.check(ctx));
}
