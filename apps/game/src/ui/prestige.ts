import { ASCEND_MIN_ZONE, canAscend, pendingSouls } from '../game/ascension';
import type { ChState } from '../game/ch-state';
import { soulBonusEff } from '../game/heaven';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

const ARM_MS = 4000;

export interface PrestigeDeps {
  state: ChState;
  /** Deepest zone this run (combat frontier). */
  getRunMaxZone: () => number;
  /** Perform the ascension (bank souls, reset run). */
  onAscend: () => void;
}

/** The Ruhm (ascension) tab: bank Ruhm-Seelen for a permanent damage bonus. */
export class Prestige {
  private readonly body = byId('tabPr');
  private armed = false;
  private armTimer: ReturnType<typeof window.setTimeout> | null = null;

  constructor(private readonly deps: PrestigeDeps) {
    this.body.innerHTML = `
      <div class="settings-section">
        <h3>Ruhm-Seelen ✨</h3>
        <div class="rebirth-info" id="prInfo"></div>
        <button class="btn danger" id="ascendBtn" type="button">Ruhm einheimsen</button>
      </div>
      <div class="settings-section">
        <h3>Statistik</h3>
        <div class="stat-grid" id="prStats"></div>
      </div>`;

    const btn = byId('ascendBtn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      const { state } = this.deps;
      if (!canAscend(this.deps.getRunMaxZone(), state.lifetimeMaxZone, state.rsLifetime)) return;
      if (!this.armed) {
        this.armed = true;
        btn.classList.add('armed');
        btn.textContent = 'Sicher? Lauf wird zurückgesetzt';
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
      this.deps.onAscend();
      this.refresh();
    });

    this.refresh();
  }

  refresh(): void {
    const { state } = this.deps;
    const runMax = this.deps.getRunMaxZone();
    const pending = pendingSouls(runMax, state.lifetimeMaxZone, state.rsLifetime);
    const bonus = soulBonusEff(state.heaven.hpf); // HPF-amplified per-soul bonus
    const bonusNow = Math.round(state.souls * bonus * 100);
    const bonusAfter = Math.round((state.souls + pending) * bonus * 100);

    byId('prInfo').innerHTML =
      `Aktuell <b>${fmt(state.souls)}</b> gehaltene Seelen (+${bonusNow}% Schaden).<br>` +
      `Beim Neustart deiner Tournee gibt es <b>+${fmt(pending)}</b> Seelen ` +
      `(→ +${bonusAfter}% dauerhaft). Deine Crew, Bühne & BP werden zurückgesetzt; Ahnen bleiben.<br>` +
      `<span class="dim">Ruhm gibt es ab Bühne ${ASCEND_MIN_ZONE}, skaliert mit deiner tiefsten Bühne.</span>`;

    if (!this.armed) {
      const btn = byId('ascendBtn') as HTMLButtonElement;
      const ok = canAscend(runMax, state.lifetimeMaxZone, state.rsLifetime);
      btn.disabled = !ok;
      btn.textContent = ok ? `Ruhm einheimsen (+${fmt(pending)} ✨)` : 'Noch kein neuer Ruhm';
    }

    byId('prStats').innerHTML = [
      ['Aktuelle Bühne', fmt(runMax)],
      ['Tiefste Bühne', fmt(Math.max(state.lifetimeMaxZone, runMax))],
      ['Gehaltene Seelen', fmt(state.souls)],
      ['RS Lebenszeit', fmt(state.rsLifetime)],
      ['Himmelspfirsiche', fmt(state.heaven.hpf)],
      ['Shakes gesamt', fmt(state.totalClicks)],
    ]
      .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`)
      .join('');
  }
}
