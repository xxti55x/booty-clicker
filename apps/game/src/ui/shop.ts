import { SKINS } from '../character/skins';
import { upgradeCost, type UpgradeState } from '../game/economy';
import type { GameState } from '../game/state';
import type { BackgroundKey, SkinKey } from '../types';
import { BGS } from '../world/backgrounds';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface ShopDeps {
  state: GameState;
  upgrades: UpgradeState[];
  /** Called after any BP-affecting change (re-renders the HUD). */
  onPurchase: () => void;
  /** Rebuild the character for a (possibly newly unlocked) skin. */
  rebuildCharacter: (key: SkinKey) => void;
  /** Swap the active stage background. */
  setBackground: (key: BackgroundKey) => void;
}

/** The right-hand shop panel: Upgrades / Skins / Backgrounds / Settings tabs. */
export class Shop {
  private readonly tabUp = byId('tabUp');
  private readonly tabSk = byId('tabSk');
  private readonly tabBg = byId('tabBg');
  /** data-t -> tab body element, so extra tabs (e.g. Settings) just work. */
  private readonly bodies: Record<string, HTMLElement> = {
    up: this.tabUp,
    sk: this.tabSk,
    bg: this.tabBg,
    set: byId('tabSet'),
  };

  constructor(private readonly deps: ShopDeps) {
    document.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        const m = t.dataset.t;
        for (const [key, el] of Object.entries(this.bodies)) {
          el.style.display = key === m ? 'block' : 'none';
        }
      };
    });
    const shop = byId('shop');
    byId('toggleShop').onclick = () => shop.classList.toggle('hidden');

    this.renderUpgrades();
    this.renderSkins();
    this.renderBgs();
    this.revealSig = this.computeRevealSig();
  }

  /** Signature of currently-revealed skins + backgrounds (content-gates). */
  private revealSig = '';

  private computeRevealSig(): string {
    const { state } = this.deps;
    const skins = (Object.keys(SKINS) as SkinKey[]).filter(
      (k) => state.unlocked[k] || state.skin === k || state.maxBp >= (SKINS[k].revealAt ?? 0),
    );
    const bgs = (Object.keys(BGS) as BackgroundKey[]).filter(
      (k) => state.bg === k || state.maxBp >= (BGS[k].revealAt ?? 0),
    );
    return `${skins.join(',')}|${bgs.join(',')}`;
  }

  /** Re-render skins/backgrounds if a new content-gate milestone was crossed. */
  syncReveals(): void {
    const sig = this.computeRevealSig();
    if (sig !== this.revealSig) {
      this.revealSig = sig;
      this.renderSkins();
      this.renderBgs();
    }
  }

  renderUpgrades(): void {
    const { state, upgrades } = this.deps;
    this.tabUp.innerHTML = '';
    for (const u of upgrades) {
      const c = upgradeCost(u);
      const aff = state.bp >= c;
      const el = document.createElement('div');
      el.className = 'item' + (aff ? '' : ' locked');
      el.innerHTML = `<div class="nm">${u.name}<span class="lv">Lv ${u.lv}</span></div>
      <div class="ds">${u.ds}</div><div class="cost ${aff ? '' : 'bad'}">🍑 ${fmt(c)} BP</div>`;
      el.onclick = () => {
        const cc = upgradeCost(u);
        if (state.bp < cc) return;
        state.bp -= cc;
        u.lv++;
        if (u.type === 'click') state.perClick += u.val;
        else if (u.type === 'sec') state.perSec += u.val;
        else state.mult *= u.val;
        this.renderUpgrades();
        this.deps.onPurchase();
      };
      this.tabUp.appendChild(el);
    }
  }

  renderSkins(): void {
    const { state } = this.deps;
    this.tabSk.innerHTML = '';
    for (const k of Object.keys(SKINS) as SkinKey[]) {
      const s = SKINS[k];
      const owned = state.unlocked[k];
      const active = state.skin === k;
      // Content-gate: hide until the BP milestone (unless already owned/active).
      if (!owned && !active && state.maxBp < (s.revealAt ?? 0)) continue;
      const el = document.createElement('div');
      el.className = 'card' + (active ? ' active' : '') + (owned ? '' : ' locked');
      el.innerHTML = `<div class="ci">${s.icon}</div><div class="cn">${s.name}</div>
      <div class="cc ${owned ? '' : 'lk'}">${owned ? (active ? 'aktiv' : 'wählen') : '🔒 ' + fmt(s.cost) + ' BP'}</div>`;
      el.onclick = () => {
        if (!owned) {
          if (state.bp < s.cost) return;
          state.bp -= s.cost;
          state.unlocked[k] = true;
        }
        state.skin = k;
        this.deps.rebuildCharacter(k);
        this.renderSkins();
        this.deps.onPurchase();
      };
      this.tabSk.appendChild(el);
    }
  }

  renderBgs(): void {
    const { state } = this.deps;
    this.tabBg.innerHTML = '';
    for (const k of Object.keys(BGS) as BackgroundKey[]) {
      const b = BGS[k];
      const active = state.bg === k;
      if (!active && state.maxBp < (b.revealAt ?? 0)) continue;
      const el = document.createElement('div');
      el.className = 'card' + (active ? ' active' : '');
      el.innerHTML = `<div class="ci">${b.icon}</div><div class="cn">${b.name}</div>
      <div class="cc">${active ? 'aktiv' : 'wählen'}</div>`;
      el.onclick = () => {
        state.bg = k;
        this.deps.setBackground(k);
        this.renderBgs();
      };
      this.tabBg.appendChild(el);
    }
  }
}
