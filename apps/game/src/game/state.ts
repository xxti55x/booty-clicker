import type { BackgroundKey, SkinKey } from '../types';

/** The serializable game state (spec §4.2 — versioned in the save schema). */
export interface GameState {
  bp: number;
  perClick: number;
  perSec: number;
  mult: number;
  skin: SkinKey;
  bg: BackgroundKey;
  unlocked: Record<SkinKey, boolean>;
  /** Highest BP ever reached — drives sticky content-gate reveals (M2). */
  maxBp: number;
  /** Permanent Rebirth multiplier: 1 + number of rebirths (M2 prestige). */
  prestigeMult: number;
  /** How many times the player has rebirthed (NG+ badge). */
  rebirths: number;
  /** Whether the boss has ever been defeated (permanent skin unlock). */
  bossDefeated: boolean;
  /** Unlocked achievement ids (M4). */
  achievements: string[];
  /** Lifetime shake count (M4 achievements). */
  totalClicks: number;
  /** Highest combo ever reached (M4 achievements). */
  maxCombo: number;
  /** Golden peaches clicked (M4 achievements). */
  peachesClicked: number;
  /** Epoch ms when the next Golden Peach appears (M4 event, persisted). */
  nextPeachAt: number;
  /** Epoch ms until which the ×3 income boost is active (M4 event, persisted). */
  boostUntil: number;
}

/** A fresh game. */
export function createGameState(): GameState {
  return {
    bp: 0,
    perClick: 1,
    perSec: 0,
    mult: 1,
    skin: 'classic',
    bg: 'club',
    unlocked: { classic: true, disco: true, robo: false, host: false, boss: false },
    maxBp: 0,
    prestigeMult: 1,
    rebirths: 0,
    bossDefeated: false,
    achievements: [],
    totalClicks: 0,
    maxCombo: 0,
    peachesClicked: 0,
    nextPeachAt: 0,
    boostUntil: 0,
  };
}

/** Transient, non-persisted runtime signals (combo streak + click "drive"). */
export interface RuntimeState {
  combo: number;
  comboTimer: number;
  drive: number;
  clicksSinceSwitch: number;
}

export function createRuntimeState(): RuntimeState {
  return { combo: 0, comboTimer: 0, drive: 0, clicksSinceSwitch: 0 };
}
