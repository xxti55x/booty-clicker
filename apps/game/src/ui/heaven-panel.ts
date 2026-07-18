import type { ChState } from '../game/ch-state';
import {
  TREE_NODES,
  type TreeNodeConfig,
  canBuyTreeNode,
  canHimmelfahrt,
  himmelfahrtGain,
  hpfForRsLifetime,
  treeLevel,
  treeNodeCost,
  treeNodeMaxLevel,
} from '../game/heaven';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

const ARM_MS = 4000;

export interface HeavenDeps {
  state: ChState;
  /** Perform the Ruhmes-Himmelfahrt (bank HPF, reset all of L1). */
  onHimmelfahrt: () => void;
  /** Buy one level of a Himmelsbaum node (after a successful buy, refresh). */
  onBuyNode: (id: string) => void;
}

/**
 * The 🌈 Himmel tab (spec §4.5.2): Ruhmes-Himmelfahrt (prestige L2) + the
 * Himmelsbaum. Shows the +HPF preview before the big reset (M10-AC3) and lets you
 * spend held HPF on the permanent grundknoten. The Himmelfahrt button arms then
 * confirms, since it wipes the whole tour, RS and Ancients.
 */
export class Heaven {
  private readonly body = byId('tabHeaven');
  private armed = false;
  private armTimer: ReturnType<typeof window.setTimeout> | null = null;

  constructor(private readonly deps: HeavenDeps) {
    this.body.innerHTML = `
      <div class="settings-section">
        <h3>Ruhmes-Himmelfahrt 🌈</h3>
        <div class="rebirth-info" id="hvInfo"></div>
        <button class="btn danger" id="himmelfahrtBtn" type="button">Himmelfahrt</button>
      </div>
      <div class="settings-section">
        <h3>Himmelsbaum 🌳</h3>
        <div class="rebirth-info" id="hvTreeInfo"></div>
        <div id="hvTreeList"></div>
      </div>`;

    const btn = byId('himmelfahrtBtn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      const { state } = this.deps;
      if (!canHimmelfahrt(state.heaven, state.rsLifetime)) return;
      if (!this.armed) {
        this.armed = true;
        btn.classList.add('armed');
        btn.textContent = 'Sicher? Ruhm, Ahnen & Tour fallen';
        this.armTimer = window.setTimeout(() => {
          this.armed = false;
          btn.classList.remove('armed');
          this.armTimer = null;
          this.refresh();
        }, ARM_MS);
        return;
      }
      if (this.armTimer !== null) window.clearTimeout(this.armTimer);
      this.armed = false;
      btn.classList.remove('armed');
      this.deps.onHimmelfahrt();
      this.refresh();
    });

    this.refresh();
  }

  refresh(): void {
    const { state } = this.deps;
    const h = state.heaven;
    const gain = himmelfahrtGain(h, state.rsLifetime);
    const globalPct = Math.round(h.hpf * 2);
    const soulBonusPct = Math.round((0.1 + 0.002 * h.hpf) * 100);

    byId('hvInfo').innerHTML =
      `Gehaltene <b>${fmt(h.hpf)}</b> Himmelspfirsiche 🍑 ` +
      `(+${globalPct}% globaler Schaden · jede Seele wirkt ${soulBonusPct}% statt 10%).<br>` +
      `Lebenszeit-RS <b>${fmt(state.rsLifetime)}</b> → gesamt <b>${fmt(hpfForRsLifetime(state.rsLifetime))}</b> HPF.<br>` +
      `Himmelfahrt jetzt: <b>+${fmt(gain)}</b> HPF. ` +
      `<span class="dim">Setzt Ruhm-Seelen, Ahnen und die ganze Tour zurück; Vergoldungen, HPF & Himmelsbaum bleiben. Ab 1 000 RS Lebenszeit.</span>`;

    if (!this.armed) {
      const btn = byId('himmelfahrtBtn') as HTMLButtonElement;
      const ok = canHimmelfahrt(h, state.rsLifetime);
      btn.disabled = !ok;
      btn.textContent = ok ? `Himmelfahrt (+${fmt(gain)} 🍑)` : 'Noch keine Himmelfahrt (1 000 RS)';
    }

    byId('hvTreeInfo').innerHTML =
      `Ausgegebene HPF sind <b>permanent</b> — über alle Aszensionen und Himmelfahrten hinweg.`;

    const list = byId('hvTreeList');
    list.innerHTML = TREE_NODES.map((cfg) => this.nodeCard(cfg)).join('');
    for (const el of Array.from(list.querySelectorAll<HTMLElement>('.item'))) {
      const id = el.dataset.id;
      if (id && TREE_NODES.some((n) => n.id === id)) {
        el.addEventListener('click', () => this.deps.onBuyNode(id));
      }
    }
  }

  private nodeCard(cfg: TreeNodeConfig): string {
    const { state } = this.deps;
    const level = treeLevel(state.heaven, cfg.id);
    const max = treeNodeMaxLevel(cfg.id);
    const maxed = level >= max;
    const cost = treeNodeCost(cfg.id, level);
    const affordable = canBuyTreeNode(state.heaven, cfg.id);
    const foot = maxed
      ? `<span class="cost">Voll ausgebaut (Lv ${level})</span>`
      : `<span class="cost ${affordable ? '' : 'bad'}">Lv ${level + 1}/${max} · ${fmt(cost ?? 0)} 🍑</span>`;
    return `<div class="item ${affordable ? '' : 'locked'}" data-id="${cfg.id}">
        <div class="nm">${cfg.name}<span class="lv">Lv ${level}/${max}</span></div>
        <div class="ds">${cfg.desc}</div>
        <div class="crew-foot">${foot}</div>
      </div>`;
  }
}
