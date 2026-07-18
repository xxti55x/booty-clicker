/**
 * Season events (spec §7.5, M13) — light, purely date-based flavor, no server.
 *
 * A tiny lookup from a wall-clock `Date` to an optional {@link Season} banner. The
 * spec keeps this deliberately minimal (§11.10 accepts clock-cheese): October is
 * „Spooky Booty", December is „Frost-Twerk". There is NO gameplay hardlock — a
 * season only tweaks a banner/title, so nothing is ever gated behind a date and a
 * player who never plays in October misses nothing but the flavor.
 *
 * Pure + DOM-free (P6): the glue reads {@link seasonFor} on boot and each day roll
 * and renders the banner. Month is read in LOCAL time so the flavor lines up with
 * the player's calendar (the quest/day clock is UTC; the mismatch is immaterial for
 * a cosmetic banner).
 */

/** A cosmetic seasonal banner (spec §7.5). */
export interface Season {
  /** Stable id (for a change-detected banner render). */
  readonly id: string;
  /** Display name shown in the banner. */
  readonly name: string;
  /** Leading emoji. */
  readonly emoji: string;
  /** One-line flavor hint. */
  readonly hint: string;
}

/** October: „Spooky Booty". */
const SPOOKY: Season = {
  id: 'spooky',
  name: 'Spooky Booty',
  emoji: '🎃',
  hint: 'Gruseliges Twerken den ganzen Oktober!',
};

/** December: „Frost-Twerk". */
const FROST: Season = {
  id: 'frost',
  name: 'Frost-Twerk',
  emoji: '❄️',
  hint: 'Eiskalte Hüftschwünge im Dezember!',
};

/**
 * The active season for a date, or `null` outside a season window. Uses the local
 * month (0 = January): October (9) ⇒ Spooky Booty, December (11) ⇒ Frost-Twerk.
 * Total function — every date maps to a season or `null`, never throws.
 */
export function seasonFor(date: Date): Season | null {
  switch (date.getMonth()) {
    case 9:
      return SPOOKY;
    case 11:
      return FROST;
    default:
      return null;
  }
}
