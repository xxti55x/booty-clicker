/**
 * **Eine Sprache für Buff-Zahlen.** Skin-Buffs (§5), Set-Boni, Kulissen-Mini-Buffs
 * und seit 1c/3a auch die Relikt-/Schmiede-Affixe zeigen dieselben
 * {@link BuffStat}-Terme — also müssen sie auch gleich AUSSEHEN. „+4 % Klick"
 * darf nicht an einer Stelle „+0.04 clickPct" heißen.
 *
 * Vorher lebte diese Tabelle privat im Gear-Panel; die Affix-Kacheln hätten sie
 * kopieren müssen (und wären beim nächsten neuen Stat auseinandergelaufen).
 * Jetzt liest sie jeder, der eine Buff-Zahl anschreibt.
 */
import type { BuffStat } from '../types';

/** Wie ein Term benannt wird + in welcher Einheit er zählt (§5.2/§5.5). */
export interface StatMeta {
  label: string;
  unit: 'pct' | 's' | 'ms' | 'h' | 'cps' | 'x';
  /** Ein Reduktions-Term (wird mit führendem „−" gezeigt). */
  neg?: boolean;
}

export const STAT_META: Record<BuffStat, StatMeta> = {
  clickPct: { label: 'Klick', unit: 'pct' },
  dpsPct: { label: 'Crew-DPS', unit: 'pct' },
  critChance: { label: 'Krit-Chance', unit: 'pct' },
  critMult: { label: 'Krit-Multiplikator', unit: 'x' },
  comboWindow: { label: 'Combo-Fenster', unit: 's' },
  comboDecay: { label: 'Combo-Decay', unit: 'pct', neg: true },
  goldPct: { label: 'Gold', unit: 'pct' },
  bossDmg: { label: 'Boss-Schaden', unit: 'pct' },
  bossTimer: { label: 'Boss-Zeit', unit: 's' },
  beatWindow: { label: 'Beat-Fenster', unit: 'ms' },
  chestLuck: { label: 'Truhen-Luck', unit: 'pct' },
  keyDrop: { label: 'Schlüssel-Drop', unit: 'pct' },
  offlineCap: { label: 'Offline-Cap', unit: 'h' },
  frenzyDur: { label: 'Ekstase-Dauer', unit: 'pct' },
  allPct: { label: 'ALLES', unit: 'pct' },
  coachCps: { label: 'Coach', unit: 'cps' },
  onBeatMult: { label: 'On-Beat ×', unit: 'x' },
  frenzyDurSec: { label: 'Ekstase', unit: 's' },
  frenzyCharge: { label: 'Ladebedarf', unit: 'pct', neg: true },
  offlineRate: { label: 'Offline-Rate', unit: 'pct' },
};

/** Auf ≤ 2 Nachkommastellen kürzen, ohne Null-Schwanz (0.40 → „0.4", 4 → „4"). */
const trim = (n: number): string => Number(n.toFixed(2)).toString();

/**
 * Eine rohe Buff-Zahl in ihren vorzeichen- und einheitenbewussten deutschen Text.
 *
 * `critMult` ist die eine Stelle, an der diese Zusammenführung die Anzeige
 * KORRIGIERT hat: Das Spiel ADDIERT diesen Wert auf `CRIT_MULT` (5), er zählt
 * also in MULTIPLIKATOR-PUNKTEN, nicht in Prozent. Das Gear-Panel schrieb ihn
 * bisher als „+6 % Krit-Schaden" an (für 0.06) — das las sich wie ein
 * Prozentsatz auf den Krit, war aber ×5 → ×5.06, also +1,2 %. Mit den Affixen
 * käme dieselbe Zahl ein zweites Mal ins Bild, und zwei Kacheln nebeneinander
 * („+4 % Klick" vs. „+20 % Krit-Schaden") hätten die Größenordnung glatt
 * verdreht. Deshalb heißt der Term jetzt überall „Krit-Multiplikator" und wird
 * als Punkt-Zahl gezeigt (+0.2 ⇒ ×5 wird ×5.2).
 */
export function affixText(stat: BuffStat, amount: number): string {
  const m = STAT_META[stat];
  const sign = m.neg ? '−' : '+';
  switch (m.unit) {
    case 'pct':
      return `${sign}${trim(amount * 100)} % ${m.label}`;
    case 's':
      return `${sign}${trim(amount)} s ${m.label}`;
    case 'ms':
      return `${sign}${trim(amount)} ms ${m.label}`;
    case 'h':
      return `${sign}${trim(amount / 3600)} h ${m.label}`;
    case 'cps':
      return `${sign}${trim(amount)} cps ${m.label}`;
    case 'x':
      return `${sign}${trim(amount)} ${m.label}`;
  }
}
