import type { ChState } from '../game/ch-state';
import {
  abilityTiersUnlocked,
  bulkCost,
  CREW,
  type HeroConfig,
  heroClick,
  heroDps,
  maxAffordable,
  nextAbility,
  nextLevelCost,
} from '../game/heroes';
import { soulMult } from '../game/ascension';
import { ancientClickMult, ancientDpsMult } from '../game/ancients';
import { clickGearMult, dpsGearMult } from '../game/gear';
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

/**
 * The Crew shop tab. Slot 1 (Booty-Boss) levels CLICK damage, every later
 * member is pure idle DPS (§goal v10). Each member additionally has kaufbare
 * Fähigkeiten (Lv 25, 75, 125, …): +100 % base output, paid in BP — the row
 * shows a gold buy button once the level requirement is met.
 */
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

  /** Buy the next unlocked ability tier for a member (in order, BP-priced). */
  private buyAbility(cfg: HeroConfig): void {
    const s = this.deps.state;
    const level = s.crew[cfg.id] ?? 0;
    const ups = s.crewUp[cfg.id] ?? 0;
    const ab = nextAbility(cfg, level, ups);
    if (!ab.unlocked || ups >= abilityTiersUnlocked(level) || ab.cost > s.gold) return;
    s.gold -= ab.cost;
    s.crewUp[cfg.id] = ups + 1;
    this.deps.onBuy();
    this.render();
  }

  render(): void {
    const list = byId('crewList');
    const s = this.deps.state;
    const sm = soulMult(s.souls, soulBonusEff(s.heaven.hpf));
    const global = heavenGlobalMult(s.heaven.hpf);
    // keep the per-hero display in lockstep with dpsOf/clickDamageOf (§5)
    const dpsMult = sm * ancientDpsMult(s.ancients) * global * dpsGearMult(s.gear);
    const clickMult = sm * ancientClickMult(s.ancients) * global * clickGearMult(s.gear);
    const rows: string[] = [];
    CREW.forEach((cfg, i) => {
      if (!this.revealed(i)) return;
      const level = s.crew[cfg.id] ?? 0;
      const ups = s.crewUp[cfg.id] ?? 0;
      const count = this.countFor(cfg, level);
      const cost = count > 0 ? bulkCost(cfg, level, count) : nextLevelCost(cfg, level);
      const affordable = count > 0 && cost <= s.gold;
      const gild = s.gilds[cfg.id] ?? 0;
      const out = cfg.click
        ? heroClick(cfg, level, gild, ups) * clickMult
        : heroDps(cfg, level, gild, ups) * dpsMult;
      const outLabel = cfg.click ? 'Klick' : 'DPS';
      const gildBadge =
        gild > 0 ? `<span class="gild" title="×1.25 pro Vergoldung">🏅${gild}</span>` : '';
      const label = level === 0 ? 'Anheuern' : `+${count === 0 ? 1 : count}`;
      // Kaufbare Fähigkeiten als SLOT-REIHE (Goal: kein Riesen-Button — gekaufte
      // Tiers mit Haken, der nächste verfügbare leuchtet klickbar, kommende zeigen
      // ihr Level; Stil-Referenz: klassische Idle-Upgrade-Slots in der Heldenkarte).
      const ab = level > 0 ? nextAbility(cfg, level, ups) : null;
      let abRow = '';
      if (ab) {
        const CHECK =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const SPARK =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 13.9 10l6.7 2-6.7 2L12 20.6 10.1 14l-6.7-2 6.7-2Z" fill="currentColor"/></svg>';
        const slots: string[] = [];
        for (let t = 1; t <= ups; t++) {
          slots.push(
            `<span class="ab done" title="Fähigkeit ${t}: +100% ${outLabel} — gekauft">${CHECK}</span>`,
          );
        }
        if (ab.unlocked) {
          const can = ab.cost <= s.gold;
          slots.push(
            `<button class="ab ready ${can ? '' : 'poor'}" data-ab="${cfg.id}" type="button"
               title="Fähigkeit ${ab.tier}: +100% ${outLabel} kaufen">${SPARK}</button>`,
          );
          slots.push(
            `<span class="ab-cost ${can ? '' : 'bad'}">+100% ${outLabel} · ${fmt(ab.cost)} BP</span>`,
          );
        } else {
          slots.push(
            `<span class="ab lk" title="Fähigkeit ${ab.tier} (+100% ${outLabel}) ab Lv ${ab.level}">Lv${ab.level}</span>`,
          );
        }
        abRow = `<div class="ab-slots">${slots.join('')}</div>`;
      }
      rows.push(
        `<div class="item ${affordable ? '' : 'locked'}" data-id="${cfg.id}">
          <div class="nm">${cfg.name}${gildBadge}<span class="lv">Lv ${level}${ups > 0 ? ` · ×${ups + 1}` : ''}</span></div>
          <div class="ds">${cfg.ds}</div>
          <div class="crew-foot">
            <span class="cost ${affordable ? '' : 'bad'}">${label} · ${fmt(cost)} BP</span>
            <span class="dps">${level > 0 ? `${fmt(out)} ${outLabel}` : '—'}</span>
          </div>
          ${abRow}
        </div>`,
      );
    });
    list.innerHTML = rows.join('');
    for (const el of Array.from(list.querySelectorAll<HTMLElement>('.item'))) {
      const id = el.dataset.id;
      const cfg = CREW.find((c) => c.id === id);
      if (cfg) el.addEventListener('click', () => this.buy(cfg));
    }
    for (const el of Array.from(list.querySelectorAll<HTMLButtonElement>('.ab.ready'))) {
      const id = el.dataset.ab;
      const cfg = CREW.find((c) => c.id === id);
      if (cfg)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation(); // the row's level-buy handler must not also fire
          this.buyAbility(cfg);
        });
    }
  }
}
