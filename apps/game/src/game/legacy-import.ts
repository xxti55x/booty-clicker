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
 * The §9.2.3 Tyrann-skin claim is redeemed here as of M11: a `bossDefeated`
 * old-save latches `legacyTyrann = true`, which `gearUnlockCtx` unions into the
 * boss-first-kill set so the Goldener Twerk-Tyrann unlocks even at a shallow CH
 * zone. (The gold-chest pre-mark still targets M12 and is intentionally NOT
 * modelled here — no speculative chest fields.)
 */
import type { ChState } from './ch-state';
import type { SaveDataV4 } from '../save/schema';

/** Ruhm-Seelen granted per legacy rebirth (spec §9.2.3 / §11 decision). */
export const LEGACY_RS_PER_REBIRTH = 7;

/**
 * Apply the one-time legacy inheritance. Returns `ch` unchanged if it has
 * already been imported (idempotent); otherwise grants RS for legacy rebirths
 * (0 if `legacy` is null or has no rebirths), latches the Tyrann-skin claim from
 * a `bossDefeated` old-save (§9.2.3), and marks it imported.
 */
export function applyLegacyInheritance(ch: ChState, legacy: SaveDataV4 | null): ChState {
  if (ch.legacyImported) return ch;
  const rebirths =
    legacy && Number.isFinite(legacy.rebirths) && legacy.rebirths > 0
      ? Math.floor(legacy.rebirths)
      : 0;
  const grant = LEGACY_RS_PER_REBIRTH * rebirths;
  const souls = ch.souls + grant;
  return {
    ...ch,
    souls,
    // Granted souls are "earned" — lift the lifetime-RS highwater so held ≤ earned
    // stays true (the M10 souls-accounting invariant) and the HPF gate counts them.
    rsLifetime: Math.max(ch.rsLifetime, souls),
    // §9.2.3: a bossDefeated legacy tour unlocks the Tyrann skin from M11 on.
    legacyTyrann: ch.legacyTyrann || legacy?.bossDefeated === true,
    legacyImported: true,
  };
}
