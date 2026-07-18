import { SKINS } from '../character/skins';
import type { ChState } from '../game/ch-state';
import { gearUnlockCtx } from '../game/ch-state';
import {
  KULISSE_BUFFS,
  MAX_SKIN_LEVEL,
  MAX_SKIN_STARS,
  type SetBonusConfig,
  activeSets,
  craftCost,
  craftSkin,
  shardCost,
  skinCrafted,
  skinLevel,
  skinStarCount,
  skinUnlocked,
  sugarCostForStar,
} from '../game/gear';
import { SKIN_UNLOCKS } from '../game/gear';
import type { BackgroundKey, BuffStat, SkinKey, SkinRarity } from '../types';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/** German rarity labels (§5.3). */
const RARITY_LABEL: Record<SkinRarity, string> = {
  common: 'Gewöhnlich',
  rare: 'Selten',
  epic: 'Episch',
  legendary: 'Legendär',
  mythic: 'Mythisch',
};

/** How each buff stat is worded + its display unit (§5.2/§5.5). */
interface StatMeta {
  label: string;
  unit: 'pct' | 's' | 'ms' | 'h' | 'cps' | 'x';
  /** A reduction stat (shown with a leading „−"). */
  neg?: boolean;
}
const STAT_META: Record<BuffStat, StatMeta> = {
  clickPct: { label: 'Klick', unit: 'pct' },
  dpsPct: { label: 'Crew-DPS', unit: 'pct' },
  critChance: { label: 'Krit-Chance', unit: 'pct' },
  critMult: { label: 'Krit-Schaden', unit: 'pct' },
  comboWindow: { label: 'Combo-Fenster', unit: 's' },
  comboDecay: { label: 'Combo-Decay', unit: 'pct', neg: true },
  goldPct: { label: 'Gold', unit: 'pct' },
  bossDmg: { label: 'Boss-Schaden', unit: 'pct' },
  bossTimer: { label: 'Boss-Zeit', unit: 's' },
  beatWindow: { label: 'Beat-Fenster', unit: 'ms' },
  chestLuck: { label: 'Truhen-Luck', unit: 'pct' },
  keyDrop: { label: 'Schlüssel-Drop', unit: 'pct' },
  offlineCap: { label: 'Offline-Cap', unit: 'h' },
  frenzyDur: { label: 'Ekstase-Dauer', unit: 'pct' },
  allPct: { label: 'ALLES', unit: 'pct' },
  coachCps: { label: 'Coach', unit: 'cps' },
  onBeatMult: { label: 'On-Beat ×', unit: 'x' },
  frenzyDurSec: { label: 'Ekstase', unit: 's' },
  frenzyCharge: { label: 'Ladebedarf', unit: 'pct', neg: true },
  offlineRate: { label: 'Offline-Rate', unit: 'pct' },
};

/** Trim to ≤ 2 decimals without trailing zeros (0.40 → „0.4", 4 → „4"). */
const trim = (n: number): string => Number(n.toFixed(2)).toString();

/** Format a raw stat amount into its signed, unit-aware German buff text. */
function fmtStat(stat: BuffStat, amount: number): string {
  const m = STAT_META[stat];
  const sign = m.neg ? '−' : '+';
  switch (m.unit) {
    case 'pct':
      return `${sign}${trim(amount * 100)} % ${m.label}`;
    case 's':
      return `${sign}${trim(amount)} s ${m.label}`;
    case 'ms':
      return `${sign}${trim(amount)} ms ${m.label}`;
    case 'h':
      return `${sign}${trim(amount / 3600)} h ${m.label}`;
    case 'cps':
      return `${sign}${trim(amount)} cps ${m.label}`;
    case 'x':
      return `${sign}${trim(amount)} ${m.label}`;
  }
}

/** Kulisse chooser buttons: id + label + a short mini-buff hint (§5.5). */
const KULISSE_UI: { key: BackgroundKey; label: string }[] = [
  { key: 'club', label: '🪩 Club' },
  { key: 'synth', label: '🌆 Synth' },
  { key: 'beach', label: '🏖 Beach' },
  { key: 'space', label: '🚀 Space' },
];

export interface GearDeps {
  state: ChState;
  /** Equip changed: rebuild the 3D character, recompute, refresh HUD, persist. */
  onEquip: () => void;
  /** Level/star/craft changed the gear buffs: recompute, refresh HUD, persist. */
  onProgress: () => void;
  /** Kulisse/Auto changed: apply the background (world + audio), recompute, persist. */
  onKulisse: () => void;
}

/**
 * The 🎽 Gear/Skins tab (spec §5): equip one skin for its buff, level it with 🧩,
 * star it with 🍬, pick a kulisse (or „Auto (Tour)"), and read the active set bonuses.
 * Change-detected the same way as the other panels — `render()` runs on gear events
 * and the throttled 0.25 s tick, never in the click hot-path.
 */
export class Gear {
  private readonly body = byId('tabGear');

  constructor(private readonly deps: GearDeps) {
    this.body.innerHTML = `
      <div class="gear-bal" id="gearBal"></div>
      <div class="settings-section">
        <h3>Kulisse</h3>
        <div class="kulisse-row" id="kulisseRow"></div>
        <div class="dim" id="kulisseHint"></div>
      </div>
      <div class="settings-section">
        <h3>Set-Boni</h3>
        <div id="gearSets"></div>
      </div>
      <div class="settings-section">
        <h3>Skins</h3>
        <div class="skingrid" id="skinGrid"></div>
      </div>`;
    this.render();
  }

  // ---- actions ----

  private equip(id: SkinKey): void {
    const { state } = this.deps;
    if (state.gear.skin === id || !this.unlocked(id)) return;
    state.gear.skin = id;
    this.deps.onEquip();
    this.render();
  }

  private levelUp(id: SkinKey): void {
    const { state } = this.deps;
    if (!this.unlocked(id)) return;
    const lv = skinLevel(state.gear, id);
    if (lv >= MAX_SKIN_LEVEL) return;
    const cost = shardCost(lv);
    if (state.gear.shards < cost) return;
    state.gear.shards -= cost;
    state.gear.skinLevels[id] = lv + 1;
    this.deps.onProgress();
    this.render();
  }

  private starUp(id: SkinKey): void {
    const { state } = this.deps;
    if (!this.unlocked(id)) return;
    const stars = skinStarCount(state.gear, id);
    const cost = sugarCostForStar(stars);
    if (cost === null || state.gear.sugarPeaches < cost) return;
    state.gear.sugarPeaches -= cost;
    state.gear.skinStars[id] = stars + 1;
    this.deps.onProgress();
    this.render();
  }

  private craft(id: SkinKey): void {
    const { state } = this.deps;
    const r = craftSkin(state.gear, id);
    if (!r.ok) return;
    state.gear = r.gear;
    this.deps.onProgress();
    this.render();
  }

  private setKulisse(key: BackgroundKey): void {
    const { state } = this.deps;
    state.gear.bgAuto = false;
    state.gear.bg = key;
    this.deps.onKulisse();
    this.render();
  }

  private setAuto(): void {
    const { state } = this.deps;
    if (state.gear.bgAuto) return;
    state.gear.bgAuto = true;
    this.deps.onKulisse();
    this.render();
  }

  private unlocked(id: SkinKey): boolean {
    return skinUnlocked(id, gearUnlockCtx(this.deps.state));
  }

  // ---- render ----

  render(): void {
    const { state } = this.deps;
    byId('gearBal').innerHTML =
      `<span class="gb-shard">🧩 ${fmt(state.gear.shards)} Splitter</span>` +
      `<span class="gb-sugar">🍬 ${fmt(state.gear.sugarPeaches)} Zuckerpfirsiche</span>`;

    this.renderKulisse();
    this.renderSets();
    this.renderGrid();
  }

  private renderKulisse(): void {
    const { state } = this.deps;
    const row = byId('kulisseRow');
    const btns = KULISSE_UI.map((k) => {
      const active = !state.gear.bgAuto && state.gear.bg === k.key;
      return `<button class="kbtn ${active ? 'active' : ''}" data-bg="${k.key}" type="button">${k.label}</button>`;
    });
    btns.push(
      `<button class="kbtn ${state.gear.bgAuto ? 'active' : ''}" data-bg="auto" type="button">🔄 Auto</button>`,
    );
    row.innerHTML = btns.join('');
    for (const b of Array.from(row.querySelectorAll<HTMLButtonElement>('.kbtn'))) {
      const bg = b.dataset.bg!;
      b.addEventListener('click', () =>
        bg === 'auto' ? this.setAuto() : this.setKulisse(bg as BackgroundKey),
      );
    }

    const kul = KULISSE_BUFFS[state.gear.bg];
    const kulTxt = fmtStat(kul.stat, kul.amount);
    byId('kulisseHint').textContent = state.gear.bgAuto
      ? `Tour-Modus: die Kulisse rotiert mit der Bühne. Aktiv: ${state.gear.bg} (${kulTxt}).`
      : `Feste Kulisse: ${kulTxt}.`;
  }

  private renderSets(): void {
    const sets = activeSets(this.deps.state.gear);
    const el = byId('gearSets');
    if (sets.length === 0) {
      el.innerHTML = `<div class="dim">Kein Set aktiv — kombiniere Skin × Kulisse (z. B. Disco-King + Club = „Studio 54").</div>`;
      return;
    }
    el.innerHTML = sets.map((s: SetBonusConfig) => this.setRow(s)).join('');
  }

  private setRow(s: SetBonusConfig): string {
    return `<div class="gear-set"><span class="gs-name">✨ ${s.name}</span><span class="gs-eff">${fmtStat(s.stat, s.amount)}</span></div>`;
  }

  private renderGrid(): void {
    const grid = byId('skinGrid');
    grid.innerHTML = (Object.keys(SKINS) as SkinKey[]).map((id) => this.card(id)).join('');
    for (const btn of Array.from(grid.querySelectorAll<HTMLButtonElement>('button[data-act]'))) {
      const card = btn.closest<HTMLElement>('.skincard');
      const id = card?.dataset.id as SkinKey | undefined;
      if (!id) continue;
      const act = btn.dataset.act;
      btn.addEventListener('click', () => {
        if (act === 'equip') this.equip(id);
        else if (act === 'level') this.levelUp(id);
        else if (act === 'star') this.starUp(id);
        else if (act === 'craft') this.craft(id);
      });
    }
  }

  private unlockHint(id: SkinKey): string {
    const rule = SKIN_UNLOCKS[id];
    switch (rule.kind) {
      case 'zone':
        return `🔒 ab Bühne ${rule.zone}`;
      case 'boss':
        return `🔒 Boss Bühne ${rule.zone} besiegen`;
      case 'himmelfahrt':
        return `🔒 nach 1. Himmelfahrt`;
      case 'craft':
        return `🔒 per Craft (${rule.craftCost} 🧩)`;
      case 'transcend':
        return `🔒 ab Transzendenz`;
      default:
        return `🔒 gesperrt`;
    }
  }

  private card(id: SkinKey): string {
    const { state } = this.deps;
    const cfg = SKINS[id];
    const unlocked = this.unlocked(id);
    const equipped = state.gear.skin === id;
    const lv = skinLevel(state.gear, id);
    const stars = skinStarCount(state.gear, id);

    // Buff descriptors (per-level buff + per-star bonus) — AC4: always shown.
    const buffTxt = `${fmtStat(cfg.buff.stat, cfg.buff.perLevel)}/Lv`;
    const starTxt = `${fmtStat(cfg.star.stat, cfg.star.perStar)}/⭐`;
    const nowTxt =
      lv > 0 || stars > 0
        ? `<div class="sc-now">jetzt ${fmtStat(cfg.buff.stat, cfg.buff.perLevel * lv)}` +
          (stars > 0 ? ` · ${fmtStat(cfg.star.stat, cfg.star.perStar * stars)}` : '') +
          `</div>`
        : '';

    // Level row (AC4: level + cost). Buttons disabled when locked/maxed/unaffordable.
    const atMaxLv = lv >= MAX_SKIN_LEVEL;
    const lvCost = shardCost(lv);
    const canLevel = unlocked && !atMaxLv && state.gear.shards >= lvCost;
    const lvBtn = atMaxLv
      ? `<button class="sc-btn" data-act="level" disabled>Max</button>`
      : `<button class="sc-btn ${canLevel ? '' : 'off'}" data-act="level" ${canLevel ? '' : 'disabled'}>⬆ ${fmt(lvCost)} 🧩</button>`;

    // Star row (AC4 continued: stars + cost).
    const atMaxStar = stars >= MAX_SKIN_STARS;
    const stCost = sugarCostForStar(stars);
    const canStar = unlocked && !atMaxStar && stCost !== null && state.gear.sugarPeaches >= stCost;
    const stBtn = atMaxStar
      ? `<button class="sc-btn" data-act="star" disabled>★ Max</button>`
      : `<button class="sc-btn ${canStar ? '' : 'off'}" data-act="star" ${canStar ? '' : 'disabled'}>⬆ ${stCost} 🍬</button>`;

    // Footer: equip (unlocked) · craft (craftable, not yet crafted) · lock hint.
    let footer: string;
    if (unlocked) {
      footer = `<button class="sc-equip ${equipped ? 'on' : ''}" data-act="equip">${equipped ? '✓ Ausgerüstet' : 'Ausrüsten'}</button>`;
    } else {
      const cc = craftCost(id);
      if (cc !== null && !skinCrafted(state.gear, id)) {
        const afford = state.gear.shards >= cc;
        footer =
          `<button class="sc-equip craft ${afford ? '' : 'off'}" data-act="craft" ${afford ? '' : 'disabled'}>Craften · ${cc} 🧩</button>` +
          `<div class="sc-lock">${this.unlockHint(id)}</div>`;
      } else {
        footer = `<div class="sc-lock">${this.unlockHint(id)}</div>`;
      }
    }

    const stars5 = '★★★★★'.slice(0, stars) + '☆☆☆☆☆'.slice(0, MAX_SKIN_STARS - stars);
    return `<div class="skincard rarity-${cfg.rarity} ${equipped ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-id="${id}">
      <div class="sc-head">
        <span class="sc-icon">${cfg.icon}</span>
        <span class="sc-rarity">${RARITY_LABEL[cfg.rarity]}</span>
      </div>
      <div class="sc-name">${cfg.name}</div>
      <div class="sc-buff">${buffTxt}<br>★ ${starTxt}</div>
      ${nowTxt}
      <div class="sc-row"><span class="sc-level">Lv ${lv}/${MAX_SKIN_LEVEL}</span>${lvBtn}</div>
      <div class="sc-row"><span class="sc-stars">${stars5} ${stars}/${MAX_SKIN_STARS}</span>${stBtn}</div>
      ${footer}
    </div>`;
  }
}
