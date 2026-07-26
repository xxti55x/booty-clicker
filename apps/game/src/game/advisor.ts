/**
 * Wand-Telemetrie (ROADMAP-V2 P3) — pur, DOM-frei.
 *
 * Der Rückwurf-Loop sagt dem Spieler WOHIN (eine Bühne zurück, farmen, erneut
 * herausfordern), aber nicht WARUM er verloren hat. Dieses Modul rechnet die
 * beiden Zahlen aus, die das erklären — „so viel Schaden bringst du im
 * Boss-Fenster zusammen" gegen „so viel Ausdauer hat der Boss" — und nennt den
 * EINEN Kauf, der die Lücke am schnellsten schließt.
 *
 * **Die Annahmen des Burst-Modells** (bewusst konservativ, alle als Konstanten
 * hier, nie als Literale in der UI):
 *  · Fenster = `BOSS_TIME_S` (30 s). Chronilla/Gear verlängern es real — nicht
 *    eingerechnet, das ist Reserve.
 *  · `ADVISOR_CLICKS_PER_SEC` = 5 Klicks/s als realistische Dauerrate (der
 *    Balance-Bot rechnet mit 3/s; ein Spieler, der bewusst einen Boss angeht,
 *    klickt schneller, aber 30 s lang keine 10/s).
 *  · Combo-Mittel = `comboMult(COMBO_CAP/2)` = ×1.1. Bei 5 Klicks/s stünde man
 *    nach ~10 s am Cap (×1.2), aber Anlauf, Verschnaufen und Shop-Griffe drücken
 *    den Schnitt — die halbe Strecke ist die ehrliche Mitte.
 *  · Krit-EV = `1 + CRIT_CHANCE·(CRIT_MULT − 1)` = ×1.8 aus den BASIS-Konstanten,
 *    ohne Tier-/Gear-/Token-Boni (dieselbe Annahme, mit der §4.8 kalibriert ist).
 *  · Boss-Schadens-Multiplikatoren (Glutaeus, Tyrann/Krönung-Gear, `boss`-
 *    Specials) zählen VOLL — das ist Macht, die der Spieler sicher besitzt und
 *    die nur im Bosskampf zählt, also gehört sie genau in dieses Fenster.
 *  · NICHT eingerechnet: On-Beat ×1.5 (Können), Twerk-Ekstase ×10 (ein einzelnes
 *    Fenster), der Twerk-Coach. Alles davon macht den echten Burst nur GRÖSSER,
 *    die Schätzung bleibt also eine Untergrenze — der Tipp verspricht nie zu viel.
 */
import { ancientBossDmgMult } from './ancients';
import type { ChState } from './ch-state';
import { COMBO_CAP, CRIT_CHANCE, CRIT_MULT, comboMult } from './click';
import { BOSS_TIME_S, type CombatState, bossHp } from './combat';
import { bossDmgMult } from './gear';
import {
  CREW,
  type CrewBuy,
  abilityKind,
  abilityKindLabel,
  bestCrewBuy,
  crewSpecialBonuses,
} from './heroes';

/** Angenommene Dauer-Klickrate im Boss-Fenster. */
export const ADVISOR_CLICKS_PER_SEC = 5;
/** Angenommenes Combo-Mittel über das Fenster (halbe Strecke zum Cap ⇒ ×1.1). */
export const ADVISOR_COMBO_MULT = comboMult(COMBO_CAP / 2);
/** Krit-Erwartungswert aus den Basis-Konstanten (20 % / ×5 ⇒ ×1.8). */
export const ADVISOR_CRIT_EV = 1 + CRIT_CHANCE * (CRIT_MULT - 1);
/**
 * Ab welcher Lücke der Tipp erscheint: Burst < 80 % der Boss-Ausdauer, also die
 * „> 20 % Lücke" der Roadmap. Darüber schweigt die Telemetrie — knappe Kämpfe
 * sind der spannende Normalfall und brauchen keinen Ratschlag.
 */
export const HINT_GAP_MAX = 0.8;
/**
 * Wie weit über den Kontostand hinaus ein Tipp zeigen darf (×3). Genau an der
 * Wand ist oft NICHTS bezahlbar — ein „spar auf X" ist dort die nützlichere
 * Antwort als gar keine. Weiter als das Dreifache greift der Tipp nie, sonst
 * empfiehlt er Träume statt des nächsten Schritts.
 */
export const HINT_BUDGET_REACH = 3;

/** Die Felder, aus denen der Burst folgt (Boss-Schadens-Stack). */
type BurstInput = Pick<ChState, 'ancients' | 'gear' | 'crewUp'>;
/** Die Felder, aus denen der Kauf-Tipp folgt. */
type HintInput = Pick<ChState, 'gold' | 'crew' | 'crewUp' | 'gilds'>;

/** Gesamter Boss-Schadens-Multiplikator (Ahnen × Gear × Crew-Specials). */
function bossDamageMult(state: BurstInput): number {
  return (
    ancientBossDmgMult(state.ancients) *
    bossDmgMult(state.gear) *
    crewSpecialBonuses(state.crewUp).bossMult
  );
}

/**
 * Geschätzter Gesamtschaden in EINEM Boss-Fenster (Standard: 30 s): Crew-DPS
 * über die volle Zeit plus der Klick-Strom unter den oben dokumentierten
 * Annahmen, beides mit dem Boss-Schadens-Stack multipliziert. Negative/kaputte
 * Eingaben zählen als 0, das Ergebnis ist nie negativ.
 */
export function burstEstimate(
  state: BurstInput,
  dps: number,
  clickDmg: number,
  windowS: number = BOSS_TIME_S,
): number {
  const w = Math.max(0, windowS);
  const idle = Math.max(0, dps) * w;
  const clicks =
    ADVISOR_CLICKS_PER_SEC * w * Math.max(0, clickDmg) * ADVISOR_COMBO_MULT * ADVISOR_CRIT_EV;
  return (idle + clicks) * bossDamageMult(state);
}

/**
 * Verhältnis Burst zu Boss-Ausdauer auf der aktuellen Bühne: 1 = es reicht
 * exakt, 0.5 = die Hälfte fehlt, > 1 = Luft nach oben. Gedacht für die
 * Frontier-Boss-Bühne (dort steht der Herausfordern-Button); auf jeder anderen
 * Bühne rechnet es den hypothetischen Boss DIESER Bühne, was die Zahl ehrlich
 * hält, statt sie mit Sonderfällen zu würzen.
 */
export function bossGap(
  state: BurstInput,
  combat: Pick<CombatState, 'zone'>,
  dps: number,
  clickDmg: number,
): number {
  const hp = bossHp(combat.zone);
  if (!(hp > 0) || !Number.isFinite(hp)) return Number.POSITIVE_INFINITY;
  return burstEstimate(state, dps, clickDmg) / hp;
}

/** Der eine empfohlene Kauf, fertig für die HUD-Zeile. */
export interface PurchaseHint extends CrewBuy {
  /** Anzeigename des Crew-Mitglieds. */
  readonly name: string;
  /** Fertige deutsche Kurz-Beschriftung („Booty-Boss Lv 61", „DJ Wumms · +100% DPS"). */
  readonly label: string;
  /** Ist der Kauf JETZT bezahlbar (sonst: darauf sparen)? */
  readonly affordable: boolean;
}

/**
 * Der Kauf mit dem besten Grenznutzen pro BP — dieselbe Rangfolge, nach der der
 * Balance-Bot kauft (`heroes.bestCrewBuy`), nur mit einem auf `HINT_BUDGET_REACH`
 * geweiteten Budget, damit an der Wand auch ein Sparziel genannt werden kann.
 * `null`, wenn selbst dort nichts liegt (frischer Kontostand 0).
 */
export function bestPurchaseHint(state: HintInput): PurchaseHint | null {
  const gold = Math.max(0, state.gold);
  const buy = bestCrewBuy(state.crew, state.crewUp, state.gilds, gold * HINT_BUDGET_REACH);
  if (buy === null) return null;
  const cfg = CREW.find((c) => c.id === buy.id);
  if (!cfg) return null; // unbekanntes Mitglied ⇒ lieber schweigen als raten
  const level = state.crew[buy.id] ?? 0;
  const bought = state.crewUp[buy.id] ?? 0;
  const label =
    buy.kind === 'level'
      ? `${cfg.name} Lv ${level + 1}`
      : `${cfg.name} · ${abilityKindLabel(abilityKind(cfg, bought + 1), cfg.click ? 'Klick' : 'DPS')}`;
  return { ...buy, name: cfg.name, label, affordable: buy.cost <= gold };
}

/**
 * Cache-Signatur des Kauf-Tipps: Er kann sich nur ändern, wenn sich Kontostand,
 * Crew-Level oder gekaufte Fähigkeiten ändern. Die HUD-Schicht rechnet den Tipp
 * nur bei einer neuen Signatur neu (P3-Throttle) — Vergoldungen fehlen hier
 * bewusst: sie skalieren alle Optionen eines Mitglieds gleich und ändern die
 * Rangfolge nur zusammen mit einem Level-/Fähigkeits-Kauf, der schon in der
 * Signatur steckt.
 */
export function purchaseSignature(state: HintInput): string {
  let sig = `${state.gold}`;
  for (const cfg of CREW) sig += `|${state.crew[cfg.id] ?? 0}.${state.crewUp[cfg.id] ?? 0}`;
  return sig;
}
