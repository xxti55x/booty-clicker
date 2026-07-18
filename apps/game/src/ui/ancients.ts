import { soulBonusEff } from '../game/heaven';
import {
  ANCIENTS,
  type AncientConfig,
  ancientAtCap,
  ancientBonus,
  ancientCost,
  ancientLevel,
  buyAncient,
  canBuyAncient,
} from '../game/ancients';
import type { ChState } from '../game/ch-state';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface AncientsDeps {
  state: ChState;
  /** Called after a successful purchase (recompute derived numbers, HUD, persist). */
  onBuy: () => void;
}

/**
 * The 🌀 Ahnen shop tab: spend held Ruhm-Seelen on Twerk-Ahnen (§4.6). Each card
 * shows the level, current perk, next-level cost (RS) and a buy button gated on
 * `souls ≥ cost` and the cap. Held souls buff damage via `soulMult`, so spending
 * trades raw multiplier for a specialised, compounding perk (the CH trade-off).
 */
export class Ancients {
  private readonly body = byId('tabAnc');

  constructor(private readonly deps: AncientsDeps) {
    this.body.innerHTML = `
      <div class="settings-section">
        <h3>Twerk-Ahnen 🌀</h3>
        <div class="rebirth-info" id="ancInfo"></div>
      </div>
      <div id="ancList"></div>`;
    this.render();
  }

  private buy(cfg: AncientConfig): void {
    const { state } = this.deps;
    if (!canBuyAncient(state.ancients, state.souls, cfg.id)) return;
    const r = buyAncient(state.ancients, state.souls, cfg.id);
    if (!r.bought) return;
    state.ancients = r.ancients;
    state.souls = r.souls;
    this.deps.onBuy();
    this.render();
  }

  render(): void {
    const { state } = this.deps;
    const bonusPct = Math.round(state.souls * soulBonusEff(state.heaven.hpf) * 100);
    byId('ancInfo').innerHTML =
      `Gehaltene <b>${fmt(state.souls)}</b> Ruhm-Seelen (+${bonusPct}% Schaden über <span class="dim">soulMult</span>).<br>` +
      `<span class="dim">Ausgegebene Seelen buffen nicht mehr über soulMult — sie kaufen dafür dauerhafte Ahnen-Perks (überleben jede Aszension; erst eine Himmelfahrt setzt sie zurück).</span>`;

    const rows = ANCIENTS.map((cfg) => {
      const level = ancientLevel(state.ancients, cfg.id);
      const capped = ancientAtCap(cfg.id, level);
      const cost = ancientCost(level);
      const affordable = canBuyAncient(state.ancients, state.souls, cfg.id);
      const cur = ancientBonus(cfg.id, level);
      const curTxt = fmtBonus(cfg, cur);
      const capTxt = cfg.cap === null ? '' : ` <span class="dim">(max Lv ${cfg.cap})</span>`;
      const foot = capped
        ? `<span class="cost">Max erreicht</span>`
        : `<span class="cost ${affordable ? '' : 'bad'}">Lv ${level + 1} · ${fmt(cost)} ✨</span>`;
      return `<div class="item ${affordable ? '' : 'locked'}" data-id="${cfg.id}">
          <div class="nm">${cfg.name}<span class="lv">Lv ${level}</span></div>
          <div class="ds">${cfg.flavor} · ${cfg.label}${capTxt}</div>
          <div class="crew-foot">
            ${foot}
            <span class="dps">${level > 0 ? curTxt : '—'}</span>
          </div>
        </div>`;
    });

    const list = byId('ancList');
    list.innerHTML = rows.join('');
    for (const el of Array.from(list.querySelectorAll<HTMLElement>('.item'))) {
      const cfg = ANCIENTS.find((a) => a.id === el.dataset.id);
      if (cfg) el.addEventListener('click', () => this.buy(cfg));
    }
  }
}

/** Format an ancient's *current total* perk for the card (matches its effect unit). */
function fmtBonus(cfg: AncientConfig, bonus: number): string {
  switch (cfg.effect) {
    case 'bossTimer':
      return `+${bonus.toFixed(0)} s`;
    case 'comboWindow':
      return `+${bonus.toFixed(2)} s`;
    case 'beatWindow':
      return `+${bonus.toFixed(0)} ms`;
    default:
      return `+${Math.round(bonus * 1000) / 10}%`;
  }
}
