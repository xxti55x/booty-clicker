import type { ChState } from '../game/ch-state';
import {
  CHEST_SKINS,
  CHEST_TIERS,
  type ChestTier,
  type ChestTierConfig,
  KEY_COST,
  LOOT_TABLES,
  type LootRow,
  type LootTable,
  PITY_THRESHOLDS,
  type Reward,
  TOKENS,
  type TokenId,
  tokenCount,
} from '../game/chests';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/** Chest-skin display name by id (jackpot collectibles, §6.3.2). */
const SKIN_NAME: Record<string, string> = Object.fromEntries(
  CHEST_SKINS.map((s) => [s.id, s.name]),
);

/** Minutes → a compact German duration for boost rows (10 → „10 min", 160 → „2,7 h"). */
function durText(ms: number): string {
  const min = ms / 60000;
  if (min < 60) return `${Number(min.toFixed(1))} min`;
  return `${Number((min / 60).toFixed(1))} h`;
}

/** One weighted loot row → its human-readable reward description (§6.3.5 transparency). */
function lootRowText(table: LootTable, row: LootRow): string {
  switch (row.kind) {
    case 'bp':
      return `💰 BP · ${row.bpMinutes ?? 0} min Einkommen`;
    case 'boost':
      return `⚡ ×${row.boostMult ?? 1} Einkommen · ${durText(row.boostDurMs ?? 0)}`;
    case 'shards': {
      const a = row.min ?? 0;
      const b = row.max ?? 0;
      return `🧩 ${a === b ? a : `${a}–${b}`} Splitter`;
    }
    case 'keys': {
      const a = row.min ?? 1;
      const b = row.max ?? 1;
      return `🔑 ${a === b ? a : `${a}–${b}`} Schlüssel`;
    }
    case 'sugar':
      return `🍬 ${row.sugar ?? 1} Zuckerpfirsich`;
    case 'token': {
      const n = table.tokenPool.length;
      return n > 1 ? `🎖 Permanent-Token (${n} mögliche)` : '🎖 Permanent-Token';
    }
    case 'jackpot':
      return `🌌 Jackpot · Truhen-Skin`;
    default:
      return row.kind;
  }
}

/** One credited reward → a short card caption (open animation, §6.2). */
function rewardCaption(reward: Reward): string {
  switch (reward.kind) {
    case 'bp':
      return `💰 +${fmt(reward.bp)} BP`;
    case 'shards':
      return `🧩 +${reward.shards} Splitter`;
    case 'keys':
      return `🔑 +${reward.keys} Schlüssel`;
    case 'sugar':
      return `🍬 +${reward.sugar} Zuckerpfirsich`;
    case 'boost':
      return `⚡ ×${reward.boost.mult} · ${durText(reward.boost.durMs)}`;
    case 'token': {
      const t = TOKENS.find((x) => x.id === reward.token);
      return `🎖 ${t?.name ?? 'Token'}`;
    }
    case 'jackpot':
      return `🌌 Skin: ${SKIN_NAME[reward.jackpot.skin] ?? reward.jackpot.skin}`;
    default:
      return '🎁';
  }
}

export interface ChestsDeps {
  state: ChState;
  /** Open a chest via the pure glue (consumes keys+chest, credits, persists). */
  open(tier: ChestTier): readonly Reward[] | null;
}

/**
 * The 🎁 Truhen tab (spec §6): 🔑 balance + owned permanent tokens + the collected
 * jackpot chest-skins; a per-tier inventory with a skippable ~1.2 s **Öffnen**
 * animation; and the transparent, collapsible loot-table viewer (weights as %,
 * §6.3.5). NOTHING here buys keys or chests — they are earned only (§6.3.3/P5).
 *
 * Change-detected like the other panels: `render()` runs on tab-open and the
 * throttled 0.25 s tick but only rebuilds the header + inventory when a tracked
 * value actually changed (a `sig` guard), never in the click hot-path. The open
 * animation lives in a stable overlay child that `render()` never touches, so a
 * mid-animation tick can't tear it down.
 */
export class Chests {
  private readonly body = byId('tabChest');
  private sig = '';
  private lootBuilt = false;
  private opening = false;
  private animRevealed = false;
  private pendingRewards: readonly Reward[] = [];
  private animTimers: number[] = [];

  constructor(private readonly deps: ChestsDeps) {
    this.body.innerHTML = `
      <div class="chest-head" id="chestHead"></div>
      <div class="chest-inv" id="chestInv"></div>
      <div class="settings-section">
        <h3>Drop-Chancen (transparent)</h3>
        <div class="dim chest-note">Alle Gewichte als %. 🔑 &amp; Truhen sind ausschließlich
          erspielbar — kein Kauf, nie (§6.3).</div>
        <div class="loot-tables" id="lootTables"></div>
      </div>
      <div class="chest-anim hidden" id="chestAnim">
        <div class="ca-inner">
          <div class="ca-chest" id="caChest">🎁</div>
          <div class="ca-rewards hidden" id="caRewards"></div>
          <div class="ca-hint" id="caHint">Tippen zum Überspringen</div>
        </div>
      </div>`;
    byId('chestAnim').addEventListener('click', () => this.onAnimClick());
    this.render(true);
  }

  private clearTimers(): void {
    for (const t of this.animTimers) window.clearTimeout(t);
    this.animTimers = [];
  }

  // ---- open + animation (§6.2, AC3: skippable ~1.2 s) ----

  private openTier(tier: ChestTier): void {
    if (this.opening) return;
    const rewards = this.deps.open(tier);
    if (!rewards) return; // no chest / not enough keys — button was disabled anyway
    this.opening = true;
    this.playOpen(tier, rewards);
    this.render(true); // inventory + keys already decremented by the glue
  }

  private tierCfg(tier: ChestTier): ChestTierConfig {
    return CHEST_TIERS.find((c) => c.tier === tier) ?? CHEST_TIERS[0];
  }

  private playOpen(tier: ChestTier, rewards: readonly Reward[]): void {
    const anim = byId('chestAnim');
    const chest = byId('caChest');
    this.clearTimers();
    this.pendingRewards = rewards;
    this.animRevealed = false;
    chest.textContent = this.tierCfg(tier).emoji;
    chest.className = 'ca-chest shake';
    byId('caRewards').className = 'ca-rewards hidden';
    byId('caRewards').innerHTML = '';
    byId('caHint').textContent = 'Tippen zum Überspringen';
    anim.classList.remove('hidden');
    // wackeln (0.55 s) → aufspringen (pop) → reward cards (~1.2 s total).
    this.animTimers.push(window.setTimeout(() => (chest.className = 'ca-chest pop'), 550));
    this.animTimers.push(window.setTimeout(() => this.revealRewards(), 1200));
  }

  /** Reveal the reward cards immediately (skip target + timer target; idempotent). */
  private revealRewards(): void {
    if (this.animRevealed) return;
    this.animRevealed = true;
    this.clearTimers();
    byId('caChest').className = 'ca-chest pop done';
    byId('caRewards').innerHTML = this.pendingRewards
      .map((r) => `<div class="ca-card">${rewardCaption(r)}</div>`)
      .join('');
    byId('caRewards').className = 'ca-rewards';
    byId('caHint').textContent = 'Tippen zum Schließen';
  }

  private onAnimClick(): void {
    // First tap skips straight to the reward cards; a second tap dismisses (AC3).
    if (!this.animRevealed) this.revealRewards();
    else this.closeAnim();
  }

  private closeAnim(): void {
    this.clearTimers();
    byId('chestAnim').classList.add('hidden');
    this.opening = false;
    this.render(true);
  }

  // ---- render ----

  private signature(): string {
    const { state } = this.deps;
    const inv = CHEST_TIERS.map((c) => state.chests.inventory[c.tier]).join(',');
    const tok = TOKENS.map((t) => tokenCount(state.permTokens, t.id)).join(',');
    const pity = CHEST_TIERS.map((c) => state.chests.pity[c.tier]).join(',');
    return `${state.chests.keys}|${inv}|${tok}|${state.chests.skins.length}|${pity}`;
  }

  render(force = false): void {
    if (!this.lootBuilt) {
      this.renderLootTables();
      this.lootBuilt = true;
    }
    const sig = this.signature();
    if (!force && sig === this.sig) return; // change-detected: skip the rebuild
    this.sig = sig;
    this.renderHead();
    this.renderInventory();
  }

  private renderHead(): void {
    const { state } = this.deps;
    const ownedTokens = TOKENS.map((t) => ({ t, n: tokenCount(state.permTokens, t.id) })).filter(
      (x) => x.n > 0,
    );
    const tokenHtml = ownedTokens.length
      ? ownedTokens.map((x) => `<span class="ch-token">${x.t.name} <b>×${x.n}</b></span>`).join('')
      : `<span class="dim">Noch keine Permanent-Token.</span>`;

    const owned = CHEST_SKINS.filter((s) => state.chests.skins.includes(s.id));
    const skinHtml = owned.length
      ? owned.map((s) => `<span class="ch-skin">${s.name}</span>`).join('')
      : `<span class="dim">Noch keine Truhen-Skins.</span>`;

    byId('chestHead').innerHTML =
      `<div class="ch-keys">🔑 <b>${fmt(state.chests.keys)}</b> Schlüssel</div>` +
      `<div class="ch-sub"><span class="ch-lbl">🎖 Permanent-Token</span>${tokenHtml}</div>` +
      `<div class="ch-sub"><span class="ch-lbl">🌌 Truhen-Skins ${owned.length}/${CHEST_SKINS.length}</span>${skinHtml}</div>`;
  }

  private renderInventory(): void {
    const el = byId('chestInv');
    el.innerHTML = CHEST_TIERS.map((c) => this.invRow(c)).join('');
    for (const btn of Array.from(el.querySelectorAll<HTMLButtonElement>('button[data-tier]'))) {
      const tier = btn.dataset.tier as ChestTier;
      btn.addEventListener('click', () => this.openTier(tier));
    }
  }

  private invRow(c: ChestTierConfig): string {
    const { state } = this.deps;
    const count = state.chests.inventory[c.tier];
    const cost = KEY_COST[c.tier];
    const canOpen = count >= 1 && state.chests.keys >= cost;
    const costTxt = cost === 0 ? 'gratis' : `${cost} 🔑`;
    const threshold = PITY_THRESHOLDS[c.tier];
    const pityTxt =
      threshold > 0
        ? `<div class="ci-pity">Garantie in ${Math.max(0, threshold - state.chests.pity[c.tier])} Truhe(n)</div>`
        : '';
    const btn = canOpen
      ? `<button class="ci-open" data-tier="${c.tier}" type="button">Öffnen · ${costTxt}</button>`
      : `<button class="ci-open off" data-tier="${c.tier}" type="button" disabled>Öffnen · ${costTxt}</button>`;
    return `<div class="chest-item ${count > 0 ? '' : 'empty'}">
      <div class="ci-emoji">${c.emoji}</div>
      <div class="ci-mid">
        <div class="ci-name">${c.name}</div>
        <div class="ci-count">Besitz: <b>${count}</b></div>
        ${pityTxt}
      </div>
      ${btn}
    </div>`;
  }

  private renderLootTables(): void {
    const el = byId('lootTables');
    el.innerHTML = CHEST_TIERS.map((c) => this.lootDetails(c)).join('');
  }

  private lootDetails(c: ChestTierConfig): string {
    const table = LOOT_TABLES[c.tier];
    const total = table.rows.reduce((a, r) => a + r.weight, 0) || 1;
    const rows = table.rows
      .map((r) => {
        const pct = (r.weight / total) * 100;
        const pctTxt = pct >= 10 ? pct.toFixed(0) : Number(pct.toFixed(1)).toString();
        return `<div class="lt-row"><span class="lt-desc">${lootRowText(table, r)}</span><span class="lt-pct">${pctTxt} %</span></div>`;
      })
      .join('');
    const tokens =
      table.tokenPool.length > 0
        ? `<div class="lt-pool">Token-Pool: ${table.tokenPool
            .map((id: TokenId) => TOKENS.find((t) => t.id === id)?.name ?? id)
            .join(', ')}</div>`
        : '';
    return `<details class="loot-tier">
      <summary>${c.emoji} ${c.name} <span class="lt-cost">${KEY_COST[c.tier] === 0 ? 'gratis' : KEY_COST[c.tier] + ' 🔑'}</span></summary>
      <div class="lt-body">${rows}${tokens}</div>
    </details>`;
  }
}
