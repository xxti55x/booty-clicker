/**
 * Twerk-Ahnen (Ancients) — the Ruhm-Seelen sink (spec §4.6, Clicker-Heroes' Ancients).
 *
 * Held souls buff all damage via `soulMult` (§4.5); **spending** them on Ancients
 * trades that raw multiplier for a specialised, compounding perk — the classic CH
 * trade-off. The percent-output ancients (Twerkules/Poposeidon/Glutaeus/Peachiel)
 * are uncapped, so they are the *endless* soul sink: together with Vergoldungen
 * (§4.3.4) they are why even a "+0-soul run" is never worthless (anti-plateau, N1).
 * Caps exist only where unbounded growth degenerates (crit chance / windows / timer).
 *
 * Everything here is pure data + pure functions: the balancing lives in `ANCIENTS`
 * and the effect magnitudes flow out as plain modifiers (`ancientClickMult`,
 * `ancientDpsMult`, …) that the derived click/DPS/gold/boss/combo/beat/ability
 * pipelines fold in. Cost to raise level → level+1 is `level+1` RS (total for level
 * n = n(n+1)/2). Buying spends held souls and is guarded by both souls and the cap.
 */

/** Which downstream stat an ancient's perk feeds. */
export type AncientEffect =
  | 'clickPct'
  | 'dpsPct'
  | 'critChance'
  | 'bossDmg'
  | 'bossTimer'
  | 'goldPct'
  | 'comboWindow'
  | 'beatWindow'
  | 'chestLuck'
  | 'ekstaseCharge';

export interface AncientConfig {
  readonly id: string;
  readonly name: string;
  /** Short flavor line for the shop card. */
  readonly flavor: string;
  /** The downstream stat this ancient modifies. */
  readonly effect: AncientEffect;
  /** Perk magnitude added per level (effect units — fraction, seconds or ms). */
  readonly perLevel: number;
  /** Max level (null = uncapped, the endless soul sink). */
  readonly cap: number | null;
  /** Human-readable per-level effect for the card (e.g. "+5 % Klick-Schaden"). */
  readonly label: string;
}

export const ANCIENTS: readonly AncientConfig[] = [
  {
    id: 'twerkules',
    name: 'Twerkules',
    flavor: 'Held der 1000 Reps',
    effect: 'clickPct',
    perLevel: 0.05,
    cap: null,
    label: '+5 % Klick-Schaden',
  },
  {
    id: 'poposeidon',
    name: 'Poposeidon',
    flavor: 'Herr der Wellen',
    effect: 'dpsPct',
    perLevel: 0.15,
    cap: null,
    label: '+15 % Crew-DPS',
  },
  {
    id: 'cheeksana',
    name: 'Cheeksana',
    flavor: 'Auge des Sturms',
    effect: 'critChance',
    perLevel: 0.005,
    cap: 40,
    label: '+0,5 % Krit-Chance',
  },
  {
    id: 'glutaeus',
    name: 'Glutaeus Maximus',
    flavor: 'Gladiator',
    effect: 'bossDmg',
    perLevel: 0.1,
    cap: null,
    label: '+10 % Boss-Schaden',
  },
  {
    id: 'chronilla',
    name: 'Chronilla',
    flavor: 'Hüterin der Zeit',
    effect: 'bossTimer',
    perLevel: 1,
    cap: 15,
    label: '+1 s Boss-Timer',
  },
  {
    id: 'peachiel',
    name: 'Peachiel',
    flavor: 'Erzengel des Goldes',
    effect: 'goldPct',
    perLevel: 0.1,
    cap: null,
    label: '+10 % Gold',
  },
  {
    id: 'wackelias',
    name: 'Wackelias',
    flavor: 'Der Unerschütterliche',
    effect: 'comboWindow',
    perLevel: 0.05,
    cap: 10,
    label: '+0,05 s Combo-Fenster',
  },
  {
    id: 'beatrix',
    name: 'Beatrix',
    flavor: 'Taktgeberin',
    effect: 'beatWindow',
    perLevel: 10,
    cap: 8,
    label: '+10 ms On-Beat-Fenster',
  },
  {
    id: 'truhilda',
    name: 'Truhilda',
    flavor: 'Schatzmeisterin',
    effect: 'chestLuck',
    perLevel: 0.02,
    cap: 15,
    label: '+2 % Truhen-Luck',
  },
  {
    id: 'ekstasius',
    name: 'Ekstasius',
    flavor: 'Der Entfesselte',
    effect: 'ekstaseCharge',
    perLevel: 0.05,
    cap: 10,
    label: '−5 % Ekstase-Ladebedarf',
  },
];

const BY_ID: Record<string, AncientConfig> = Object.fromEntries(ANCIENTS.map((a) => [a.id, a]));

/** Ancient levels keyed by id (absent = level 0). */
export type AncientLevels = Record<string, number>;

/** A fresh (empty) ancients map. */
export function createAncients(): AncientLevels {
  return {};
}

/** The config for an ancient id, or undefined. */
export function ancientConfig(id: string): AncientConfig | undefined {
  return BY_ID[id];
}

/** Current (sanitised) level of an ancient. */
export function ancientLevel(ancients: AncientLevels, id: string): number {
  const v = ancients[id];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** RS cost to buy the NEXT level from `level` (spec §4.6): level + 1. */
export function ancientCost(level: number): number {
  return level + 1;
}

/** Total RS spent to reach `level` from 0: the triangular number n(n+1)/2. */
export function ancientTotalCost(level: number): number {
  return (level * (level + 1)) / 2;
}

/** The effective (cap-clamped, non-negative) level a config's perk uses. */
function cappedLevel(cfg: AncientConfig, level: number): number {
  const lo = Math.max(0, level);
  return cfg.cap === null ? lo : Math.min(lo, cfg.cap);
}

/** Whether an ancient has reached its level cap (uncapped ⇒ never). */
export function ancientAtCap(id: string, level: number): boolean {
  const cfg = BY_ID[id];
  return !!cfg && cfg.cap !== null && level >= cfg.cap;
}

/** The perk magnitude an ancient provides at `level`, respecting its cap. */
export function ancientBonus(id: string, level: number): number {
  const cfg = BY_ID[id];
  if (!cfg) return 0;
  return cfg.perLevel * cappedLevel(cfg, level);
}

/** Whether the next level of `id` can be bought (souls available and not capped). */
export function canBuyAncient(ancients: AncientLevels, souls: number, id: string): boolean {
  const cfg = BY_ID[id];
  if (!cfg) return false;
  const level = ancientLevel(ancients, id);
  if (cfg.cap !== null && level >= cfg.cap) return false;
  return souls >= ancientCost(level);
}

export interface BuyAncientResult {
  ancients: AncientLevels;
  /** Held souls after the purchase (unchanged when nothing was bought). */
  souls: number;
  bought: boolean;
}

/**
 * Buy one level of `id`, spending held souls. No-op (same refs, `bought:false`)
 * when unaffordable or already capped — the guard enforces both the soul cost and
 * the level cap purely, so a UI can call it optimistically.
 */
export function buyAncient(ancients: AncientLevels, souls: number, id: string): BuyAncientResult {
  if (!canBuyAncient(ancients, souls, id)) return { ancients, souls, bought: false };
  const level = ancientLevel(ancients, id);
  return {
    ancients: { ...ancients, [id]: level + 1 },
    souls: souls - ancientCost(level),
    bought: true,
  };
}

/** The perk magnitude currently active for `id` given a levels map. */
function bonusOf(ancients: AncientLevels, id: string): number {
  return ancientBonus(id, ancientLevel(ancients, id));
}

// ---- Aggregated modifiers (folded into the derived pipelines) ----

/** Click-damage multiplier from Twerkules (×(1 + 5 %·lv)). */
export function ancientClickMult(ancients: AncientLevels): number {
  return 1 + bonusOf(ancients, 'twerkules');
}
/** Crew-DPS multiplier from Poposeidon (×(1 + 15 %·lv)). */
export function ancientDpsMult(ancients: AncientLevels): number {
  return 1 + bonusOf(ancients, 'poposeidon');
}
/** Additive crit-chance from Cheeksana (+0.5 %·lv, capped by its level cap). */
export function ancientCritChanceBonus(ancients: AncientLevels): number {
  return bonusOf(ancients, 'cheeksana');
}
/** Boss-damage multiplier from Glutaeus Maximus (×(1 + 10 %·lv)). */
export function ancientBossDmgMult(ancients: AncientLevels): number {
  return 1 + bonusOf(ancients, 'glutaeus');
}
/** Extra boss-timer seconds from Chronilla (+1 s·lv, cap 15). */
export function ancientBossTimerBonus(ancients: AncientLevels): number {
  return bonusOf(ancients, 'chronilla');
}
/** Gold multiplier from Peachiel (×(1 + 10 %·lv)). */
export function ancientGoldMult(ancients: AncientLevels): number {
  return 1 + bonusOf(ancients, 'peachiel');
}
/** Extra combo-window seconds from Wackelias (+0.05 s·lv, cap 10). */
export function ancientComboWindowBonus(ancients: AncientLevels): number {
  return bonusOf(ancients, 'wackelias');
}
/** Extra on-beat window ms from Beatrix (+10 ms·lv, cap 8). */
export function ancientBeatWindowBonusMs(ancients: AncientLevels): number {
  return bonusOf(ancients, 'beatrix');
}
/** Additive chest-luck from Truhilda (+2 %·lv, cap 15 — effect lands with M12). */
export function ancientChestLuckBonus(ancients: AncientLevels): number {
  return bonusOf(ancients, 'truhilda');
}
/** Ekstase charge-need reduction from Ekstasius (−5 %·lv, cap 10 ⇒ ≤ 50 %). */
export function ancientEkstaseChargeReduction(ancients: AncientLevels): number {
  return bonusOf(ancients, 'ekstasius');
}
