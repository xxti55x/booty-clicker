/**
 * "Erbe der alten Tour" — one-time legacy-save inheritance (spec §9.2.3).
 *
 * On the first CH boot with an old `bootyclicker.save` present, a returning
 * player is thanked for their previous tour with a Ruhm-Seelen head start:
 * `souls += 7 · rebirths`. The grant is applied at most once — `legacyImported`
 * is ALWAYS set to true afterwards, so a player with no legacy save never
 * re-checks and a returning player never double-dips.
 *
 * Pure & idempotent; wired in `main.ts` at boot with `loadGame()`.
 *
 * The §9.2.3 Tyrann-skin / gold-chest pre-marks target the M11/M12 gear and
 * chest systems, which don't exist yet — those claims are intentionally NOT
 * modelled here (no speculative save fields). They will be wired when M11/M12
 * land. Only the RS grant + the idempotency flag are in M7 scope.
 */
import type { ChState } from './ch-state';
import type { SaveDataV4 } from '../save/schema';

/** Ruhm-Seelen granted per legacy rebirth (spec §9.2.3 / §11 decision). */
export const LEGACY_RS_PER_REBIRTH = 7;

/**
 * Apply the one-time legacy inheritance. Returns `ch` unchanged if it has
 * already been imported (idempotent); otherwise grants RS for legacy rebirths
 * (0 if `legacy` is null or has no rebirths) and marks it imported.
 */
export function applyLegacyInheritance(ch: ChState, legacy: SaveDataV4 | null): ChState {
  if (ch.legacyImported) return ch;
  const rebirths =
    legacy && Number.isFinite(legacy.rebirths) && legacy.rebirths > 0
      ? Math.floor(legacy.rebirths)
      : 0;
  return {
    ...ch,
    souls: ch.souls + LEGACY_RS_PER_REBIRTH * rebirths,
    legacyImported: true,
  };
}
