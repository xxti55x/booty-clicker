import type { ChState } from '../game/ch-state';
import { type CombatState, bossTimeFraction, hpFraction, isBossZone } from '../game/combat';
import { MONSTERS_PER_ZONE } from '../game/combat';
import { SOUL_BONUS } from '../game/ascension';
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

/** Live HUD + rival/boss panel for the CH mode. */
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

  update(state: ChState, combat: CombatState, dps: number, clickDmg: number): void {
    this.zone.textContent = String(combat.zone);
    this.zoneKind.textContent = combat.boss ? '👑 BOSS' : isBossZone(combat.zone) ? '⚔️' : '';
    this.gold.textContent = fmt(state.gold);
    this.stats.textContent = `DPS ${fmt(dps)} · Klick ${fmt(clickDmg)}`;

    if (state.souls > 0) {
      this.soulsEl.classList.remove('hidden');
      this.soulsEl.textContent = `✨ ${fmt(state.souls)} Seelen · +${Math.round(state.souls * SOUL_BONUS * 100)}% Schaden`;
    } else {
      this.soulsEl.classList.add('hidden');
    }

    this.rivalNameEl.textContent = rivalName(combat.zone, combat.boss);
    this.hpFill.style.width = `${hpFraction(combat) * 100}%`;
    this.hpText.textContent = `${fmt(combat.hp)} / ${fmt(combat.hpMax)}`;

    if (combat.boss) {
      this.prog.classList.add('hidden');
      this.timer.classList.remove('hidden');
      this.timer.textContent = `⏱ ${Math.ceil(combat.bossTimer)}s`;
      this.timer.classList.toggle('urgent', bossTimeFraction(combat) < 0.34);
      this.hpFill.classList.add('boss');
    } else {
      this.prog.classList.remove('hidden');
      this.timer.classList.add('hidden');
      this.prog.textContent = `${combat.killsThisZone} / ${MONSTERS_PER_ZONE}`;
      this.hpFill.classList.remove('boss');
    }
  }

  setCombo(combo: number): void {
    this.comboEl.textContent = combo > 1 ? `Combo ×${combo}` : '';
  }
}

/** Floating "+gold" / "-dmg" / "CRIT!" popup at a screen position. */
export function spawnPop(text: string, x: number, y: number, cls = ''): void {
  const el = document.createElement('div');
  el.className = `pop ${cls}`.trim();
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 900);
}
