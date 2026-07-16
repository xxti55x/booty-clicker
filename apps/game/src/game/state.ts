import type { BackgroundKey, SkinKey } from '../types';

/** The serializable game state (spec §4.2 — becomes versioned in M1). */
export interface GameState {
  bp: number;
  perClick: number;
  perSec: number;
  mult: number;
  skin: SkinKey;
  bg: BackgroundKey;
  unlocked: Record<SkinKey, boolean>;
}

/** A fresh game, values identical to the prototype's `G`. */
export function createGameState(): GameState {
  return {
    bp: 0,
    perClick: 1,
    perSec: 0,
    mult: 1,
    skin: 'classic',
    bg: 'club',
    unlocked: { classic: true, disco: true, robo: false, host: false, boss: false },
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
