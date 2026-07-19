import type { ChState } from '../game/ch-state';
import { type CombatState, bossTimeFraction, hpFraction, isBossZone } from '../game/combat';
import { MONSTERS_PER_ZONE } from '../game/combat';
import { comboTierName } from '../game/combo';
import { soulBonusEff } from '../game/heaven';
import { transcendGlobalMult } from '../game/transcend';
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
/** Kulissen-Tier je Zone (5er-Blöcke = Boss-Gates) — Spiegel der main.ts-Rotation. */
const STRIP_THEMES = ['club', 'synth', 'beach', 'space'] as const;
function stripTheme(zone: number): (typeof STRIP_THEMES)[number] {
  return STRIP_THEMES[Math.floor((zone - 1) / 5) % STRIP_THEMES.length];
}
/** Insel-Thumbnail-Farben je Kulisse (Oberseite / Unterseite). */
const STRIP_COLORS: Record<(typeof STRIP_THEMES)[number], [string, string]> = {
  club: ['#8b5cf6', '#4c2f8a'],
  synth: ['#d65cd0', '#7a2f8a'],
  beach: ['#eed28a', '#3aa0c9'],
  space: ['#8a8ac9', '#3a3a6a'],
};
/** Mini-Insel-SVG für die Zonen-Bildleiste (Goal: Bühnen als Bild, nicht nur Text). */
function islandSvg(zone: number): string {
  const [top, side] = STRIP_COLORS[stripTheme(zone)];
  return (
    `<svg viewBox="0 0 44 30" aria-hidden="true">` +
    `<ellipse cx="22" cy="12" rx="19" ry="8.5" fill="${top}"/>` +
    `<path d="M4 13c3 5 10 8 18 8s15-3 18-8l-3 6-4 4-6-2-3 5-4-5-6 2-5-4z" fill="${side}"/>` +
    `<path d="M13 21l2 5 3-4zM26 22l3 5 3-6z" fill="#5e421f"/>` +
    `</svg>`
  );
}

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
  private readonly zoneStrip = byId('zoneStrip');

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
  private cStrip = '';

  private setText(el: HTMLElement, next: string, cache: string): string {
    if (next !== cache) el.textContent = next;
    return next;
  }

  /** Full HUD refresh (call on discrete events + the 0.25 s tick). */
  update(state: ChState, combat: CombatState, dps: number, clickDmg: number): void {
    this.cZone = this.setText(this.zone, String(combat.zone), this.cZone);
    // Rendered as a stamped gold chip (`.zone-kind`), so plain text reads best.
    const kind = combat.boss ? 'BOSS' : isBossZone(combat.zone) ? 'VS' : '';
    this.cKind = this.setText(this.zoneKind, kind, this.cKind);
    this.cGold = this.setText(this.gold, fmt(state.gold), this.cGold);
    this.cStats = this.setText(this.stats, `DPS ${fmt(dps)} · Klick ${fmt(clickDmg)}`, this.cStats);

    const hpf = state.heaven.hpf;
    // 🔮 Transzendenz global boost (×3^TE, §4.5.3): shown once transcended even at 0
    // souls/HPF (the mult persists a full L1+L2 wipe), mirroring the 🍑 HPF badge. This
    // is the change-detected souls line, never the per-click hot-path innerHTML.
    const transcended = state.transcend.transcendences > 0;
    const soulsTxt =
      state.souls > 0 || hpf > 0 || transcended
        ? `${fmt(state.souls)} Seelen · +${Math.round(state.souls * soulBonusEff(hpf) * 100)}%` +
          (hpf > 0 ? ` · ${fmt(hpf)} HPF` : '') +
          (transcended ? ` · TE ×${fmt(transcendGlobalMult(state.transcend.te))}` : '')
        : '';
    if (soulsTxt !== this.cSouls) {
      this.cSouls = soulsTxt;
      this.soulsEl.classList.toggle('hidden', soulsTxt === '');
      if (soulsTxt) this.soulsEl.textContent = soulsTxt;
    }

    this.cRival = this.setText(this.rivalNameEl, rivalName(combat.zone, combat.boss), this.cRival);
    this.updateZoneStrip(combat.zone, combat.maxZone);
    this.frame(combat);
  }

  /**
   * Bühnen-Bildleiste (Goal-Umbau: reine ANZEIGE, nicht klickbar — die Bühnen
   * wählt das Spiel selbst): fünf Insel-Thumbnails um die aktuelle Zone, die
   * aktive markiert, Boss-Gates (×5) mit Gold-Rand, kommende Zonen gedimmt.
   */
  private updateZoneStrip(zone: number, frontier: number): void {
    const start = Math.max(1, zone - 2);
    const sig = `${start}|${zone}|${frontier}`;
    if (sig === this.cStrip) return;
    this.cStrip = sig;
    const slots: string[] = [];
    for (let z = start; z < start + 5; z++) {
      const cls = [
        'zs',
        z === zone ? 'active' : '',
        z % 5 === 0 ? 'boss' : '',
        z > frontier ? 'lockd' : '',
      ]
        .filter(Boolean)
        .join(' ');
      slots.push(
        `<span class="${cls}"
           title="${z % 5 === 0 ? `Boss-Bühne ${z}` : `Bühne ${z}`}">${islandSvg(z)}<span>${z}</span></span>`,
      );
    }
    this.zoneStrip.innerHTML = slots.join('');
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
