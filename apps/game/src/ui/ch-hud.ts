import type { ChState } from '../game/ch-state';
import { type CombatState, bossTimeFraction, hpFraction, isBossZone } from '../game/combat';
import { MONSTERS_PER_ZONE } from '../game/combat';
import { comboTierName } from '../game/combo';
import { soulBonusEff } from '../game/heaven';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

const RIVALS = [
  'Groupie',
  'Möchtegern-Tänzer',
  'TikTok-Twerker',
  'Club-Rivalin',
  'Bühnen-Diva',
  'Konkurrenz-Crew',
  'Playback-Betrüger',
  'Steife Hüfte',
];
const BOSSES = [
  'Goldener Twerk-Tyrann',
  'Bass-Baron',
  'Diva Supreme',
  'Der Hüft-Hüne',
  'Königin der Kurven',
  'DJ Dämon',
];

function rivalName(zone: number, boss: boolean): string {
  if (boss) return '👑 ' + BOSSES[Math.floor(zone / 5) % BOSSES.length];
  return RIVALS[zone % RIVALS.length];
}

/**
 * Live HUD + rival/boss panel for the CH mode. HUD-throttle (spec §8.10, B7):
 * text/soul writes are cached and only touched on a real value change, so the
 * click hot-path and the per-frame loop never rebuild DOM needlessly. The moving
 * HP bar + boss timer are refreshed cheaply per frame via `frame()`.
 */
export class ChHud {
  private readonly zone = byId('zone');
  private readonly zoneKind = byId('zoneKind');
  private readonly gold = byId('gold');
  private readonly stats = byId('stats');
  private readonly comboEl = byId('combo');
  private readonly soulsEl = byId('souls');
  private readonly rivalNameEl = byId('rivalName');
  private readonly hpFill = byId('rivalHpFill');
  private readonly hpText = byId('rivalHpText');
  private readonly prog = byId('zoneProgress');
  private readonly timer = byId('rivalTimer');
  private readonly travelInfo = byId('travelInfo');
  private readonly travelPrev = byId('travelPrev') as HTMLButtonElement;
  private readonly travelNext = byId('travelNext') as HTMLButtonElement;
  private readonly travelFrontier = byId('travelFrontier') as HTMLButtonElement;

  // Cached last-written values (change-detection, no DOM churn).
  private cZone = '';
  private cKind = '';
  private cGold = '';
  private cStats = '';
  private cSouls = '';
  private cRival = '';
  private cHpText = '';
  private cHpPct = -1;
  private cProg = '';
  private cTimer = '';
  private cBoss: boolean | null = null;
  private cCombo = '';
  private cTravel = '';

  private setText(el: HTMLElement, next: string, cache: string): string {
    if (next !== cache) el.textContent = next;
    return next;
  }

  /** Full HUD refresh (call on discrete events + the 0.25 s tick). */
  update(state: ChState, combat: CombatState, dps: number, clickDmg: number): void {
    this.cZone = this.setText(this.zone, String(combat.zone), this.cZone);
    const kind = combat.boss ? '👑 BOSS' : isBossZone(combat.zone) ? '⚔️' : '';
    this.cKind = this.setText(this.zoneKind, kind, this.cKind);
    this.cGold = this.setText(this.gold, fmt(state.gold), this.cGold);
    this.cStats = this.setText(this.stats, `DPS ${fmt(dps)} · Klick ${fmt(clickDmg)}`, this.cStats);

    const hpf = state.heaven.hpf;
    const soulsTxt =
      state.souls > 0 || hpf > 0
        ? `✨ ${fmt(state.souls)} Seelen · +${Math.round(state.souls * soulBonusEff(hpf) * 100)}% Schaden` +
          (hpf > 0 ? ` · 🍑 ${fmt(hpf)} HPF` : '')
        : '';
    if (soulsTxt !== this.cSouls) {
      this.cSouls = soulsTxt;
      this.soulsEl.classList.toggle('hidden', soulsTxt === '');
      if (soulsTxt) this.soulsEl.textContent = soulsTxt;
    }

    this.cRival = this.setText(this.rivalNameEl, rivalName(combat.zone, combat.boss), this.cRival);
    this.updateTravel(combat);
    this.frame(combat);
  }

  /**
   * Reflect the farm/travel controls (§4.4): the frontier is `combat.maxZone`;
   * below it the player is farming a cleared zone. Buttons clamp to 1..frontier —
   * the pure `travelTo` guarantees the same, this only greys out dead ends.
   */
  private updateTravel(combat: CombatState): void {
    const frontier = combat.maxZone;
    const farming = combat.zone < frontier;
    const info = farming ? `🌾 Farmen · Front: Bühne ${frontier}` : 'An der Frontier';
    this.cTravel = this.setText(this.travelInfo, info, this.cTravel);
    this.travelPrev.disabled = combat.zone <= 1;
    this.travelNext.disabled = combat.zone >= frontier;
    this.travelFrontier.disabled = !farming;
  }

  /** Cheap per-frame refresh of the moving bits (HP bar + boss timer/progress). */
  frame(combat: CombatState): void {
    const pct = Math.round(hpFraction(combat) * 1000) / 10; // 0.1 % granularity
    if (pct !== this.cHpPct) {
      this.cHpPct = pct;
      this.hpFill.style.width = `${pct}%`;
    }
    this.cHpText = this.setText(
      this.hpText,
      `${fmt(combat.hp)} / ${fmt(combat.hpMax)}`,
      this.cHpText,
    );

    if (this.cBoss !== combat.boss) {
      this.cBoss = combat.boss;
      this.prog.classList.toggle('hidden', combat.boss);
      this.timer.classList.toggle('hidden', !combat.boss);
      this.hpFill.classList.toggle('boss', combat.boss);
    }
    if (combat.boss) {
      this.cTimer = this.setText(this.timer, `⏱ ${Math.ceil(combat.bossTimer)}s`, this.cTimer);
      this.timer.classList.toggle('urgent', bossTimeFraction(combat) < 0.34);
    } else {
      this.cProg = this.setText(
        this.prog,
        `${combat.killsThisZone} / ${MONSTERS_PER_ZONE}`,
        this.cProg,
      );
    }
  }

  /** Combo readout with the tier name (e.g. "Combo ×27 · Heiß"). */
  setCombo(stacks: number, tier: number): void {
    const n = Math.floor(stacks);
    const name = comboTierName(tier);
    const txt = n > 1 ? `Combo ×${n}${name ? ` · ${name}` : ''}` : '';
    if (txt !== this.cCombo) {
      this.cCombo = txt;
      this.comboEl.textContent = txt;
      this.comboEl.className = tier > 0 ? `combo tier${tier}` : 'combo';
    }
  }
}
