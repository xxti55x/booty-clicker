import { soulBonusEff } from '../game/heaven';
import {
  ANCIENTS,
  type AncientConfig,
  ancientAtCap,
  ancientBonus,
  ancientBulkCost,
  ancientCost,
  ancientLevel,
  ancientMaxAffordable,
  buyAncientBulk,
  canBuyAncient,
} from '../game/ancients';
import type { ChState } from '../game/ch-state';
import { emptyState } from './empty';
import { fmt } from './format';
import { portraitTile } from './avatars';

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
  /** Gewählte Kaufmenge der Leiste über der Liste. */
  private amount: 1 | 10 | 100 | 'max' = 1;

  constructor(private readonly deps: AncientsDeps) {
    this.body.innerHTML = `
      <div class="settings-section">
        <h3>Twerk-Ahnen 🌀</h3>
        <div class="rebirth-info" id="ancInfo"></div>
      </div>
      <!-- Dieselbe Kaufmengen-Leiste wie in der Crew: Wer sechsstellige Seelen
           hält, soll nicht hundertmal auf dieselbe Karte tippen müssen. -->
      <div class="buyamt" id="ancAmt">
        <button class="amt active" data-a="1" type="button">×1</button>
        <button class="amt" data-a="10" type="button">×10</button>
        <button class="amt" data-a="100" type="button">×100</button>
        <button class="amt" data-a="max" type="button">Max</button>
      </div>
      <div id="ancList"></div>`;
    for (const b of Array.from(this.body.querySelectorAll<HTMLButtonElement>('#ancAmt .amt'))) {
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        this.amount = a === 'max' ? 'max' : a === '100' ? 100 : a === '10' ? 10 : 1;
        for (const x of Array.from(this.body.querySelectorAll('#ancAmt .amt')))
          x.classList.remove('active');
        b.classList.add('active');
        this.render();
      });
    }
    this.render();
  }

  /**
   * Wie viele Level ein Klick auf `cfg` kauft — GENAU die gewählte Menge.
   *
   * Wie in der Crew richtet sich nur `max` nach dem Kontostand; ×10 und ×100
   * liefern ihre volle Menge, auch wenn sie unbezahlbar ist, und der Kauf
   * scheitert dann sichtbar. Eine Menge, die still auf das Leistbare
   * zurückfällt, kauft etwas anderes als draufsteht.
   */
  private countFor(cfg: AncientConfig): number {
    const { state } = this.deps;
    const level = ancientLevel(state.ancients, cfg.id);
    if (this.amount === 'max') return ancientMaxAffordable(cfg.id, level, state.souls);
    // Der Cap bleibt eine harte Grenze — über ihn hinaus gibt es keine Level.
    const room = ancientAtCap(cfg.id, level)
      ? 0
      : ancientMaxAffordable(cfg.id, level, Number.POSITIVE_INFINITY);
    return Math.min(this.amount, room);
  }

  private buy(cfg: AncientConfig): void {
    const { state } = this.deps;
    const n = this.countFor(cfg);
    if (n < 1) return;
    // Exakt-Regel: Reicht das Budget nicht für die GANZE Menge, passiert nichts
    // (nur „Max" kauft, was gerade geht).
    const level = ancientLevel(state.ancients, cfg.id);
    if (this.amount !== 'max' && ancientBulkCost(level, n) > state.souls) return;
    const r = buyAncientBulk(state.ancients, state.souls, cfg.id, n);
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
      const nWanted = this.countFor(cfg);
      // „Leistbar" heißt jetzt: die GANZE gewählte Menge ist bezahlbar — sonst
      // verspräche die Karte einen Kauf, den der Klick nicht ausführt.
      const affordable =
        canBuyAncient(state.ancients, state.souls, cfg.id) &&
        nWanted >= 1 &&
        ancientBulkCost(level, nWanted) <= state.souls;
      const cur = ancientBonus(cfg.id, level);
      const curTxt = fmtBonus(cfg, cur);
      const capTxt = cfg.cap === null ? '' : ` <span class="dim">(max Lv ${cfg.cap})</span>`;
      // Der Fuß zeigt die WIRKLICHE Kaufmenge und ihren Preis — bei „Max" also
      // nicht „Lv 1 · 1 ✨", sondern was der Klick tatsächlich tut.
      const n = nWanted;
      const bulk = n > 1 ? ancientBulkCost(level, n) : cost;
      const foot = capped
        ? `<span class="cost">Max erreicht</span>`
        : `<span class="cost ${affordable ? '' : 'bad'}">${
            n > 1 ? `+${fmt(n)} Lv · ${fmt(bulk)} ✨` : `Lv ${level + 1} · ${fmt(cost)} ✨`
          }</span>`;
      // Effekt-Vorschau: Der Ahne sagt nicht nur, was er JETZT bringt, sondern
      // auch, wo der Kauf ihn hinbringt.
      const after = ancientBonus(cfg.id, level + Math.max(1, n));
      const preview =
        !capped && affordable && after > cur
          ? `<span class="anc-next">→ ${fmtBonus(cfg, after)}</span>`
          : '';
      // IDEEN-GAMEPLAY 4b: Ahnen sind benannte Charaktere (Twerkules!) und
      // bekommen denselben Baukasten — Portrait vor dem Namen.
      return `<div class="item ${affordable ? '' : 'locked'}" data-id="${cfg.id}">
          <div class="nm"><span class="nm-who">${portraitTile(cfg.id)}${cfg.name}</span><span class="lv">Lv ${level}</span></div>
          <div class="ds">${cfg.flavor} · ${cfg.label}${capTxt}</div>
          <div class="crew-foot">
            ${foot}
            <span class="dps">${level > 0 ? curTxt : '—'}${preview}</span>
          </div>
        </div>`;
    });

    // ROADMAP-V2 G6: Ohne Seelen und ohne gekauften Ahnen ist der Tab eine Wand
    // aus unbezahlbaren Karten — davor steht jetzt der Satz, der sagt, woher die
    // Währung kommt.
    const broke = state.souls <= 0 && Object.keys(state.ancients).length === 0;
    const empty = broke
      ? emptyState(
          'ancients',
          'Ruhm-Seelen gibt es beim Aszendieren — hier werden sie zu dauerhaften Perks, die jede Aszension überleben.',
        )
      : '';

    const list = byId('ancList');
    list.innerHTML = empty + rows.join('');
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
