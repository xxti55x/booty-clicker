import type { ChState } from '../game/ch-state';
import {
  TRANSCEND_MIN_HPF_LIFETIME,
  canTranscend,
  transcendGain,
  transcendGlobalMult,
} from '../game/transcend';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

const ARM_MS = 4000;

export interface TranscendDeps {
  state: ChState;
  /** Perform the Transzendenz (bank TE, reset ALL of L1 **and** L2). */
  onTranscend: () => void;
}

/**
 * The 🔮 Transzendenz tab (prestige layer 3, spec §4.5.3). Mirrors the 🌈 Himmel panel
 * in structure: a two-step arm → confirm „Transzendieren" button (it wipes the whole
 * tour, Ruhm-Seelen, Twerk-Ahnen **and** all of L2 — Himmelspfirsiche + Himmelsbaum)
 * for a permanent, compounding **×3^TE** global boost, plus the +TE gain preview and
 * the 100-lifetime-HPF gate progress before the first Transzendenz. Held TE / Mythos
 * survive every future reset. The Mythos content tree is an intentional M15 placeholder
 * (the catalog is empty per the scaffold — see the module note).
 */
export class Transcend {
  private readonly body = byId('tabTranscend');
  private armed = false;
  private armTimer: ReturnType<typeof window.setTimeout> | null = null;

  constructor(private readonly deps: TranscendDeps) {
    this.body.innerHTML = `
      <div class="settings-section">
        <h3>Transzendenz 🔮</h3>
        <div class="rebirth-info transcend-info" id="tcInfo"></div>
        <button class="btn danger" id="transcendBtn" type="button">Transzendieren</button>
      </div>
      <div class="settings-section">
        <h3>Mythos 🔮</h3>
        <div class="rebirth-info transcend-info" id="tcMythosInfo"></div>
        <div id="tcMythosList"></div>
      </div>`;

    const btn = byId('transcendBtn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      const { state } = this.deps;
      if (!canTranscend(state.transcend, state.heaven.hpfLifetime)) return;
      if (!this.armed) {
        this.armed = true;
        btn.classList.add('armed');
        btn.textContent = 'Sicher? Tour, Ruhm, Ahnen & Himmel fallen';
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
      this.deps.onTranscend();
      this.refresh();
    });

    this.refresh();
  }

  refresh(): void {
    const { state } = this.deps;
    const t = state.transcend;
    const hpfLife = state.heaven.hpfLifetime;
    const gain = transcendGain(t, hpfLife);
    const mult = transcendGlobalMult(t.te);
    const gateOk = canTranscend(t, hpfLife);

    const held =
      `Gehaltene <b>${fmt(t.te)}</b> Transzendente Essenz 🔮 ` +
      `(globaler Boost <b>×${fmt(mult)}</b> auf Klick <i>und</i> Idle — P1-neutral).<br>` +
      `Lebenszeit-TE <b>${fmt(t.teLifetime)}</b> · Transzendenzen <b>${fmt(t.transcendences)}</b>.<br>`;

    let preview: string;
    if (gateOk) {
      const nextMult = transcendGlobalMult(t.te + gain);
      preview =
        `Transzendenz jetzt: <b>+${fmt(gain)}</b> TE (→ Boost <b>×${fmt(nextMult)}</b>). ` +
        `<span class="dim">Setzt die ganze Tour, Ruhm-Seelen, Ahnen UND den kompletten Himmel ` +
        `(Himmelspfirsiche + Himmelsbaum) zurück. Vergoldungen, Gear/Skins, Truhen & TE bleiben.</span>`;
    } else {
      const pct = Math.min(100, Math.round((hpfLife / TRANSCEND_MIN_HPF_LIFETIME) * 100));
      preview =
        `<span class="tc-locked">🔒 Noch gesperrt.</span> ` +
        `Lebenszeit-HPF <b>${fmt(hpfLife)}</b> / ${TRANSCEND_MIN_HPF_LIFETIME} (${pct}%).<br>` +
        `<span class="dim">Die erste Transzendenz braucht 100 HPF Lebenszeit (mehrere Himmelfahrten tief). ` +
        `Sie wipet L1 <b>und</b> L2 für dauerhaft ×3^TE — Held-TE bleiben für immer.</span>`;
    }

    byId('tcInfo').innerHTML = held + preview;

    if (!this.armed) {
      const btn = byId('transcendBtn') as HTMLButtonElement;
      btn.disabled = !gateOk;
      btn.textContent = gateOk
        ? `Transzendieren (+${fmt(gain)} 🔮)`
        : 'Noch keine Transzendenz (100 HPF)';
    }

    byId('tcMythosInfo').innerHTML =
      `Ausgegebene TE schalten <b>Mythos-Skins</b> & -Inhalte frei — permanent über alle Transzendenzen.`;

    // The Mythos content tree is intentionally minimal in M15 (the scaffold ships an
    // empty catalog, spec §11 open question #5 „bewusst dünn"). A tasteful placeholder
    // stands in for the future spent-TE sink; no balance is invented here.
    byId('tcMythosList').innerHTML = `<div class="item locked mythos-soon">
        <div class="nm">Mythos-Skins <span class="lv">bald</span></div>
        <div class="ds">Kosmetische Mythos-Skins & Flavor-Inhalte für Transzendente Essenz — in Arbeit.</div>
      </div>`;
  }
}
