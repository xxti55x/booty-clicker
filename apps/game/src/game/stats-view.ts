/**
 * Statistik view (spec §7.5, M13) — a pure projection of a CH-state into the
 * display rows of the 📊 tab, split into **lifetime** vs **current-run** buckets.
 *
 * The split is the whole point (§7-AC5): lifetime counters are monotonic across
 * BOTH prestige layers (they live in `state.stats`, which `ascendState` and
 * `himmelfahrtState` carry forward untouched — plus `heaven`/`rsLifetime`
 * highwaters), while run-scoped values (current zone/gold/held souls/combo) come
 * from the live run state and reset with it. No DOM, no formatting — part 2 renders
 * the rows (numbers are formatted with `ui/format.ts`).
 */
import type { ChState } from './ch-state';
import { totalGilds } from './gild';

/** A single stats row: a stable key, a German label, and a raw numeric value. */
export interface StatRow {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

/** The stats page split into lifetime totals and current-run values. */
export interface StatsView {
  readonly lifetime: readonly StatRow[];
  readonly run: readonly StatRow[];
}

/** The deepest zone ever reached (Himmelfahrt-safe, mirrors the unlock gate). */
export function bestZoneEver(state: ChState): number {
  return Math.max(state.lifetimeMaxZone, state.gear?.zoneEver ?? 1);
}

/**
 * On-beat quote: on-beat clicks / total shakes, in [0, 1] (0 when no clicks yet).
 * A ratio so part 2 can render it as a percentage.
 */
export function onBeatQuote(state: ChState): number {
  const clicks = state.totalClicks;
  return clicks > 0 ? Math.min(1, state.stats.onBeatClicks / clicks) : 0;
}

/**
 * Project the state into the lifetime vs current-run stat rows (spec §7.5). The
 * lifetime bucket covers the §7.5 checklist (Gold lifetime, Klicks, Krits,
 * On-Beat-Quote, höchste Combo, Boss-Kills/-Timeouts, Bestzone, Aszensionen, RS
 * lifetime, Truhen, Spielzeit) plus Himmelfahrten/Vergoldungen/HPF; the run bucket
 * is the live tour (current zone, run-best zone, gold, held souls, combo stacks).
 */
export function statsView(state: ChState): StatsView {
  const s = state.stats;
  const lifetime: StatRow[] = [
    { key: 'bestZone', label: 'Bestzone', value: bestZoneEver(state) },
    { key: 'goldLifetime', label: 'Gold (gesamt)', value: s.goldLifetime },
    { key: 'totalClicks', label: 'Shakes', value: state.totalClicks },
    { key: 'crits', label: 'Krit-Klicks', value: s.crits },
    { key: 'onBeatClicks', label: 'On-Beat-Klicks', value: s.onBeatClicks },
    { key: 'onBeatQuote', label: 'On-Beat-Quote', value: onBeatQuote(state) },
    { key: 'maxCombo', label: 'Höchste Combo', value: s.maxCombo },
    { key: 'bossKills', label: 'Boss-Kills', value: s.bossKills },
    { key: 'bossTimeouts', label: 'Boss-Timeouts', value: s.bossTimeouts },
    { key: 'maxBossStreak', label: 'Beste Boss-Serie', value: s.maxBossStreak },
    { key: 'ascensions', label: 'Aszensionen', value: s.ascensions },
    { key: 'himmelfahrten', label: 'Himmelfahrten', value: state.heaven.ascensions2 },
    { key: 'rsLifetime', label: 'Ruhm-Seelen (gesamt)', value: state.rsLifetime },
    { key: 'hpfLifetime', label: 'Himmelspfirsiche (gesamt)', value: state.heaven.hpfLifetime },
    { key: 'gilds', label: 'Vergoldungen', value: totalGilds(state.gilds) },
    { key: 'chestsOpened', label: 'Truhen geöffnet', value: s.chestsOpened },
    { key: 'keysEarned', label: 'Schlüssel verdient', value: s.keysEarned },
    { key: 'playTimeS', label: 'Spielzeit (s)', value: s.playTimeS },
  ];
  const run: StatRow[] = [
    { key: 'zone', label: 'Aktuelle Bühne', value: state.zone },
    { key: 'runMaxZone', label: 'Run-Bestzone', value: state.runMaxZone },
    { key: 'gold', label: 'Gold', value: state.gold },
    { key: 'souls', label: 'Ruhm-Seelen (gehalten)', value: state.souls },
    { key: 'combo', label: 'Combo-Stacks', value: state.combo.stacks },
  ];
  return { lifetime, run };
}
