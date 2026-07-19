import type { ChState } from '../game/ch-state';
import {
  type AbilityKind,
  abilityKind,
  abilityKindLabel,
  abilityMult,
  abilityTiersUnlocked,
  bulkCost,
  CREW,
  crewSpecialBonuses,
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

/** Tiny inline glyph per ability kind (rendered ~14 px inside the slot). */
const KIND_ICON: Record<AbilityKind, string> = {
  power:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 13.9 10l6.7 2-6.7 2L12 20.6 10.1 14l-6.7-2 6.7-2Z" fill="currentColor"/></svg>',
  gold: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z" fill="currentColor" fill-rule="evenodd"/></svg>',
  crit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 2 5.8 13.2h4.4L9.4 22l7.8-11.2h-4.4L13.4 2Z" fill="currentColor"/></svg>',
  critdmg:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M13.2 6 9 12.6h2.7l-.9 5.4 4.2-6.6h-2.7l.9-5.4Z" fill="currentColor"/></svg>',
  boss: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.4 17.5h15.2l1.2-9.3-4.9 3.1L12 4.9 8.1 11.3 3.2 8.2l1.2 9.3Zm0 1.6h15.2v1.8H4.4v-1.8Z" fill="currentColor"/></svg>',
  combo:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.6" cy="12" r="4.8" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="15.4" cy="12" r="4.8" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  beat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3.5v11.9a3.4 3.4 0 1 0 2 3.1V8.3c2.4.4 3.9 1.5 4.7 3.2.7-3.8-1.5-6.2-4.7-6.9V3.5h-2Z" fill="currentColor"/></svg>',
  ekstase:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4c1 3.3 4.3 4.8 4.3 8.8a6.6 6.6 0 0 1-1.8 4.7c.2-2.3-.7-3.7-2.5-5-1.8 1.3-2.7 2.7-2.5 5a6.6 6.6 0 0 1-1.8-4.7c0-4 3.3-5.5 4.3-8.8Zm0 19.2a4.6 4.6 0 0 1-3.4-1.5c2.3.2 4.5.2 6.8 0A4.6 4.6 0 0 1 12 21.6Z" fill="currentColor"/></svg>',
  idle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V11h3.6v9H4Zm6.2 0V4h3.6v16h-3.6Zm6.2 0V8H20v12h-3.6Z" fill="currentColor"/></svg>',
};

export interface CrewDeps {
  state: ChState;
  /** Called after a successful purchase (refresh HUD, persist). */
  onBuy: () => void;
}

/**
 * The Crew shop tab. Slot 1 (Booty-Boss) levels CLICK damage, every later
 * member is pure idle DPS (§goal v10). Each member additionally has kaufbare
 * Fähigkeiten (Lv 25, 75, 125, …), paid in BP: odd tiers grant +100 % base
 * output, even tiers the member's THEMED SPECIAL (v11 — Gold, Krit, Boss,
 * Combo, Beat oder Ekstase). The slot row shows a pulsing kind-tinted buy
 * button once the level requirement is met.
 */
export class Crew {
  private readonly body = byId('tabCrew');
  private amount: BuyAmount = 1;
  /** Letztes gerendertes List-HTML — identische Rebuilds werden übersprungen. */
  private lastHtml = '';
  /**
   * Pointer-down-Guard (Bugfix „Fähigkeit kaufen braucht Doppelklick"): der
   * 0.25-s-Idle-Tick rendert den offenen Tab neu; ersetzte innerHTML zwischen
   * Mousedown und Mouseup lässt den Klick auf einem verwaisten Button
   * verpuffen. Solange ein Pointer in der Liste gedrückt ist, wird jeder
   * Re-Render aufgeschoben und erst nach dem Pointerup nachgeholt.
   */
  private pointerHeld = false;
  private renderPending = false;

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
    // Ein EINZIGER delegierter Klick-Handler auf dem persistenten Container —
    // überlebt jeden innerHTML-Rebuild (kein Re-Attach pro Zeile mehr).
    const list = byId('crewList');
    list.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const ab = t.closest<HTMLElement>('.ab.ready');
      if (ab?.dataset.ab) {
        const cfg = CREW.find((c) => c.id === ab.dataset.ab);
        if (cfg) this.buyAbility(cfg);
        return; // die Zeile darunter darf NICHT zusätzlich leveln
      }
      const row = t.closest<HTMLElement>('.item');
      if (row?.dataset.id) {
        const cfg = CREW.find((c) => c.id === row.dataset.id);
        if (cfg) this.buy(cfg);
      }
    });
    list.addEventListener('pointerdown', () => {
      this.pointerHeld = true;
    });
    for (const evName of ['pointerup', 'pointercancel'] as const) {
      window.addEventListener(evName, () => {
        this.pointerHeld = false;
        if (this.renderPending) {
          this.renderPending = false;
          // Nach dem Klick-Dispatch nachholen (click feuert synchron nach dem
          // Pointerup im selben Task — ein sofortiger Rebuild bräche ihn doch).
          window.setTimeout(() => this.render(), 0);
        }
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
    if (this.pointerHeld) {
      this.renderPending = true; // kein DOM-Swap unter einem gedrückten Finger
      return;
    }
    const list = byId('crewList');
    const s = this.deps.state;
    const sm = soulMult(s.souls, soulBonusEff(s.heaven.hpf));
    const global = heavenGlobalMult(s.heaven.hpf);
    // keep the per-hero display in lockstep with dpsOf/clickDamageOf (§5)
    const dpsMult =
      sm *
      ancientDpsMult(s.ancients) *
      global *
      dpsGearMult(s.gear) *
      crewSpecialBonuses(s.crewUp).idleMult;
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
      // ihr Level). v11: ungerade Tiers = +100 % Output, gerade Tiers = das
      // Themen-Special des Mitglieds — Icon, Label und Farbton folgen der Art.
      const ab = level > 0 ? nextAbility(cfg, level, ups) : null;
      let abRow = '';
      if (ab) {
        const CHECK =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const slots: string[] = [];
        for (let t = 1; t <= ups; t++) {
          const k = abilityKind(cfg, t);
          slots.push(
            `<span class="ab done" title="Fähigkeit ${t}: ${abilityKindLabel(k, outLabel)} — gekauft">${CHECK}</span>`,
          );
        }
        const k = abilityKind(cfg, ab.tier);
        const abLabel = abilityKindLabel(k, outLabel);
        if (ab.unlocked) {
          const can = ab.cost <= s.gold;
          slots.push(
            `<button class="ab ready k-${k} ${can ? '' : 'poor'}" data-ab="${cfg.id}" type="button"
               title="Fähigkeit ${ab.tier}: ${abLabel} kaufen">${KIND_ICON[k]}</button>`,
          );
          slots.push(
            `<span class="ab-cost ${can ? '' : 'bad'}">${abLabel} · ${fmt(ab.cost)} BP</span>`,
          );
        } else {
          slots.push(
            `<span class="ab lk" title="Fähigkeit ${ab.tier} (${abLabel}) ab Lv ${ab.level}">Lv${ab.level}</span>`,
          );
        }
        abRow = `<div class="ab-slots">${slots.join('')}</div>`;
      }
      rows.push(
        `<div class="item ${affordable ? '' : 'locked'}" data-id="${cfg.id}">
          <div class="nm">${cfg.name}${gildBadge}<span class="lv">Lv ${level}${ups > 0 ? ` · ×${abilityMult(cfg, ups)}` : ''}</span></div>
          <div class="ds">${cfg.ds}</div>
          <div class="crew-foot">
            <span class="cost ${affordable ? '' : 'bad'}">${label} · ${fmt(cost)} BP</span>
            <span class="dps">${level > 0 ? `${fmt(out)} ${outLabel}` : '—'}</span>
          </div>
          ${abRow}
        </div>`,
      );
    });
    // Klicks laufen delegiert über den Container (Konstruktor) — hier wird nur
    // noch HTML geschrieben, und auch das nur bei echter Änderung.
    const html = rows.join('');
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      list.innerHTML = html;
    }
  }
}
