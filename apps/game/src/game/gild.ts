/**
 * Vergoldungen (gilds) — pure core (spec §4.3.4, Clicker-Heroes' hero gilds).
 *
 * The **first clear of every 10-zone** (10, 20, 30, …) grants one gild: a
 * permanent ×1.25 DPS bump for a crew member chosen by the seedable RNG. Gilds
 * **survive ascension** (they never reset), so even a run that banks no new souls
 * but reaches a fresh 10-zone still leaves permanent power — the M9 anti-plateau
 * point (P3, against N1). Reassigning a gild costs `GILD_REASSIGN_RS` RS.
 *
 * This module owns only the gild *bookkeeping* (which member, award/reassign);
 * the ×1.25 DPS folding lives in `heroes.ts` (`gildMult`/`heroDps`) so there is a
 * single DPS source of truth and no circular dependency.
 */
import { CREW } from './heroes';
import type { Rng } from '../util/rng';

/** Per-hero gild counts keyed by crew id (absent = 0). */
export type Gilds = Record<string, number>;

/** Every multiple of this zone grants a gild on its first clear. */
export const GILD_ZONE_STEP = 10;
/** RS cost to reassign a gild from one member to another (spec §4.3.4). */
export const GILD_REASSIGN_RS = 5;

/** A fresh (empty) gild map. */
export function createGilds(): Gilds {
  return {};
}

/** Whether `zone` is a gild-granting milestone (a positive multiple of 10). */
export function isGildZone(zone: number): boolean {
  return zone >= GILD_ZONE_STEP && Number.isInteger(zone) && zone % GILD_ZONE_STEP === 0;
}

/** Total gilds held across the whole crew. */
export function totalGilds(gilds: Gilds): number {
  let n = 0;
  for (const v of Object.values(gilds)) if (v > 0) n += Math.floor(v);
  return n;
}

/**
 * Deterministic gild target: a crew member id from a single seeded draw. Same
 * `{ seed, cursor }` ⇒ same member, so gilds are reproducible and save-scum-proof.
 * Advances the RNG cursor by one.
 */
export function gildTargetFor(rng: Rng): string {
  const idx = Math.floor(rng.next() * CREW.length);
  return CREW[Math.min(Math.max(idx, 0), CREW.length - 1)].id;
}

/**
 * Award a gild for reaching `zone`, unless it isn't a 10-zone or that 10-zone was
 * already gilded (`alreadyGilded`). Returns a NEW gild map (or the same reference
 * when nothing is awarded). The caller derives `alreadyGilded` from a highwater
 * (here: the previous lifetime-deepest zone) so each 10-zone grants exactly once,
 * even across ascensions that re-clear it.
 */
export function awardGildOnZone(
  gilds: Gilds,
  zone: number,
  alreadyGilded: boolean,
  rng: Rng,
): Gilds {
  if (alreadyGilded || !isGildZone(zone)) return gilds;
  const id = gildTargetFor(rng);
  return { ...gilds, [id]: (gilds[id] ?? 0) + 1 };
}

/**
 * Move one gild from `from` to `to` (the CH "gild-move"). No-op when `from` has no
 * gild or equals `to`. Pure — the RS cost (`GILD_REASSIGN_RS`) is charged by the
 * caller. Empties are pruned so `totalGilds` stays exact.
 */
export function reassignGild(gilds: Gilds, from: string, to: string): Gilds {
  if (from === to || (gilds[from] ?? 0) <= 0) return gilds;
  const next = { ...gilds };
  next[from] -= 1;
  if (next[from] <= 0) delete next[from];
  next[to] = (next[to] ?? 0) + 1;
  return next;
}
