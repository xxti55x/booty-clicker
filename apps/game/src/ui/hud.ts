import type { GameState } from '../game/state';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/** The top-of-screen readout: BP, rate, combo, current move + floating "+BP" pops. */
export class Hud {
  private readonly bpEl = byId('bp');
  private readonly rateEl = byId('rate');
  private readonly comboEl = byId('combo');
  private readonly moveEl = byId('moveName');
  private readonly ngEl = byId('ngPlus');

  update(g: GameState): void {
    this.bpEl.textContent = fmt(g.bp);
    this.rateEl.textContent = `${fmt(g.perSec * g.mult)} / Sek · +${fmt(g.perClick * g.mult)} pro Shake`;
    if (g.rebirths > 0) {
      this.ngEl.textContent = `NG+${g.rebirths} · ×${g.prestigeMult}`;
      this.ngEl.classList.remove('hidden');
    } else {
      this.ngEl.classList.add('hidden');
    }
  }

  setCombo(combo: number): void {
    this.comboEl.textContent = combo > 2 ? `🔥 Combo x${combo}` : '';
  }

  setMoveName(name: string): void {
    this.moveEl.textContent = name;
  }

  /** Floating "+N" text at the click position (falls back to screen centre). */
  spawnPop(text: string, cx?: number, cy?: number): void {
    const p = document.createElement('div');
    p.className = 'pop';
    p.textContent = text;
    p.style.left = `${cx ?? window.innerWidth / 2}px`;
    p.style.top = `${cy ?? window.innerHeight / 2}px`;
    document.body.appendChild(p);
    window.setTimeout(() => p.remove(), 900);
  }
}
