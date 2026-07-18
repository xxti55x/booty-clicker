import type { ChState } from '../game/ch-state';
import {
  bulkCost,
  CREW,
  type HeroConfig,
  heroDps,
  maxAffordable,
  nextLevelCost,
  nextMilestone,
} from '../game/heroes';
import { soulMult } from '../game/ascension';
import { ancientDpsMult } from '../game/ancients';
import { heavenGlobalMult, soulBonusEff } from '../game/heaven';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

type BuyAmount = 1 | 10 | 'max';

export interface CrewDeps {
  state: ChState;
  /** Called after a successful purchase (refresh HUD, persist). */
  onBuy: () => void;
}

/** The Crew shop tab: recruit & level dancers for idle DPS + click power. */
export class Crew {
  private readonly body = byId('tabCrew');
  private amount: BuyAmount = 1;

  constructor(private readonly deps: CrewDeps) {
    this.body.innerHTML = `
      <div class="buyamt" id="buyAmt">
        <button class="amt active" data-a="1" type="button">×1</button>
        <button class="amt" data-a="10" type="button">×10</button>
        <button class="amt" data-a="max" type="button">Max</button>
      </div>
      <div id="crewList"></div>`;
    for (const b of Array.from(this.body.querySelectorAll<HTMLButtonElement>('.amt'))) {
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        this.amount = a === 'max' ? 'max' : a === '10' ? 10 : 1;
        for (const x of Array.from(this.body.querySelectorAll('.amt')))
          x.classList.remove('active');
        b.classList.add('active');
        this.render();
      });
    }
    this.render();
  }

  /** Levels to buy for a hero given the current amount + affordability. */
  private countFor(cfg: HeroConfig, level: number): number {
    if (this.amount === 'max') return maxAffordable(cfg, level, this.deps.state.gold);
    return this.amount;
  }

  private revealed(index: number): boolean {
    if (index === 0) return true;
    const prev = CREW[index - 1];
    const lvls = this.deps.state.crew;
    return (lvls[prev.id] ?? 0) > 0 || this.deps.state.gold >= CREW[index].baseCost;
  }

  private buy(cfg: HeroConfig): void {
    const level = this.deps.state.crew[cfg.id] ?? 0;
    const count = Math.max(0, this.countFor(cfg, level));
    if (count <= 0) return;
    const cost = bulkCost(cfg, level, count);
    if (cost > this.deps.state.gold) return;
    this.deps.state.gold -= cost;
    this.deps.state.crew[cfg.id] = level + count;
    this.deps.onBuy();
    this.render();
  }

  render(): void {
    const list = byId('crewList');
    const s = this.deps.state;
    const mult =
      soulMult(s.souls, soulBonusEff(s.heaven.hpf)) *
      ancientDpsMult(s.ancients) *
      heavenGlobalMult(s.heaven.hpf);
    const rows: string[] = [];
    CREW.forEach((cfg, i) => {
      if (!this.revealed(i)) return;
      const level = this.deps.state.crew[cfg.id] ?? 0;
      const count = this.countFor(cfg, level);
      const cost = count > 0 ? bulkCost(cfg, level, count) : nextLevelCost(cfg, level);
      const affordable = count > 0 && cost <= this.deps.state.gold;
      const gild = this.deps.state.gilds[cfg.id] ?? 0;
      const dps = heroDps(cfg, level, gild) * mult;
      const gildBadge =
        gild > 0 ? `<span class="gild" title="×1.25 pro Vergoldung">🏅${gild}</span>` : '';
      const label = level === 0 ? 'Anheuern' : `+${count === 0 ? 1 : count}`;
      // Milestone progress bar (§4.3.2): "noch n Level bis ×2" once recruited.
      // Milestones are endless (§4.3.3), so there is always a next bracket.
      const ms = level > 0 ? nextMilestone(level) : null;
      const msRow = ms
        ? `<div class="ms-bar" title="noch ${ms.remaining} bis ×2 DPS">
            <div class="ms-fill" style="width:${Math.round(((level - ms.prev) / (ms.next - ms.prev)) * 100)}%"></div>
          </div>
          <div class="ms-txt">noch ${ms.remaining} bis ×2 (Lv ${ms.next})</div>`
        : '';
      rows.push(
        `<div class="item ${affordable ? '' : 'locked'}" data-id="${cfg.id}">
          <div class="nm">${cfg.name}${gildBadge}<span class="lv">Lv ${level}</span></div>
          <div class="ds">${cfg.ds}</div>
          <div class="crew-foot">
            <span class="cost ${affordable ? '' : 'bad'}">${label} · ${fmt(cost)} BP</span>
            <span class="dps">${level > 0 ? `${fmt(dps)} DPS` : '—'}</span>
          </div>
          ${msRow}
        </div>`,
      );
    });
    list.innerHTML = rows.join('');
    for (const el of Array.from(list.querySelectorAll<HTMLElement>('.item'))) {
      const id = el.dataset.id;
      const cfg = CREW.find((c) => c.id === id);
      if (cfg) el.addEventListener('click', () => this.buy(cfg));
    }
  }
}
