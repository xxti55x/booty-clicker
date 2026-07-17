import type { UpgradeState } from '../game/economy';
import { REBIRTH_BP } from '../game/progression';
import type { GameState } from '../game/state';
import type { SaveDataV4 } from '../save/schema';
import { exportSave, importSave } from '../save/store';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface SettingsDeps {
  state: GameState;
  upgrades: UpgradeState[];
  /** Called with a freshly validated save after a successful import. */
  applyImported: (save: SaveDataV4) => void;
  /** Wipe the save and restart. */
  reset: () => void;
  /** Perform a Rebirth/prestige reset (gated on REBIRTH_BP). */
  rebirth: () => void;
}

const RESET_ARM_MS = 4000;

/** The 4th shop tab: Export/Import save codes, Rebirth + reset, plus the Welcome-Back dialog. */
export class Settings {
  private armTimer: ReturnType<typeof window.setTimeout> | null = null;
  private armed = false;
  private rebirthArmTimer: ReturnType<typeof window.setTimeout> | null = null;
  private rebirthArmed = false;

  constructor(private readonly deps: SettingsDeps) {
    const tab = byId('tabSet');
    tab.innerHTML = `
      <div class="settings-section">
        <h3>Save exportieren</h3>
        <textarea id="expOut" readonly placeholder="Klick auf Exportieren…"></textarea>
        <button class="btn" id="expBtn" type="button">Exportieren</button>
      </div>
      <div class="settings-section">
        <h3>Save importieren</h3>
        <textarea id="impIn" placeholder="Save-Code hier einfügen…"></textarea>
        <button class="btn" id="impBtn" type="button">Importieren</button>
        <div class="msg" id="impMsg"></div>
      </div>
      <div class="settings-section hidden" id="rebirthSection">
        <h3>Rebirth (NG+)</h3>
        <div class="rebirth-info" id="rebirthInfo"></div>
        <button class="btn danger" id="rebirthBtn" type="button">Rebirth</button>
      </div>
      <div class="settings-section">
        <h3>Zurücksetzen</h3>
        <button class="btn danger" id="resetBtn" type="button">Fortschritt löschen</button>
      </div>
    `;

    const expOut = byId('expOut') as HTMLTextAreaElement;
    byId('expBtn').addEventListener('click', () => {
      expOut.value = exportSave(this.deps.state, this.deps.upgrades);
      expOut.select();
    });

    const impIn = byId('impIn') as HTMLTextAreaElement;
    const impMsg = byId('impMsg');
    byId('impBtn').addEventListener('click', () => {
      const save = importSave(impIn.value);
      if (!save) {
        impMsg.textContent = 'Ungültiger Save-Code';
        impMsg.className = 'msg bad';
        return;
      }
      this.deps.applyImported(save);
      impMsg.textContent = 'Save geladen ✓';
      impMsg.className = 'msg ok';
    });

    const resetBtn = byId('resetBtn') as HTMLButtonElement;
    resetBtn.addEventListener('click', () => {
      if (!this.armed) {
        this.armed = true;
        resetBtn.classList.add('armed');
        resetBtn.textContent = 'Wirklich löschen? Nochmal klicken';
        this.armTimer = window.setTimeout(() => {
          this.armed = false;
          resetBtn.classList.remove('armed');
          resetBtn.textContent = 'Fortschritt löschen';
          this.armTimer = null;
        }, RESET_ARM_MS);
        return;
      }
      if (this.armTimer !== null) window.clearTimeout(this.armTimer);
      this.deps.reset();
    });

    const rebirthBtn = byId('rebirthBtn') as HTMLButtonElement;
    rebirthBtn.addEventListener('click', () => {
      if (this.deps.state.bp < REBIRTH_BP) return; // not eligible yet
      if (!this.rebirthArmed) {
        this.rebirthArmed = true;
        rebirthBtn.classList.add('armed');
        rebirthBtn.textContent = 'Sicher? Alles wird zurückgesetzt';
        this.rebirthArmTimer = window.setTimeout(() => {
          this.rebirthArmed = false;
          rebirthBtn.classList.remove('armed');
          this.rebirthArmTimer = null;
          this.refresh();
        }, RESET_ARM_MS);
        return;
      }
      if (this.rebirthArmTimer !== null) window.clearTimeout(this.rebirthArmTimer);
      this.rebirthArmed = false;
      rebirthBtn.classList.remove('armed');
      this.deps.rebirth();
      this.refresh();
    });

    byId('wbClose').addEventListener('click', () => {
      byId('welcomeBack').classList.add('hidden');
    });

    this.refresh();
  }

  /** Update the Rebirth section: visibility, NG+ info, and button eligibility. */
  refresh(): void {
    const { state } = this.deps;
    const section = byId('rebirthSection');
    const show = state.maxBp >= REBIRTH_BP || state.rebirths > 0;
    section.classList.toggle('hidden', !show);
    if (!show) return;
    byId('rebirthInfo').textContent =
      `NG+${state.rebirths} · dauerhaft ×${state.prestigeMult}. ` +
      `Rebirth ab ${fmt(REBIRTH_BP)} BP setzt BP & Upgrades zurück und schaltet dauerhaft ` +
      `×${1 + (state.rebirths + 1)} frei.`;
    if (this.rebirthArmed) return; // don't stomp the armed label
    const btn = byId('rebirthBtn') as HTMLButtonElement;
    const eligible = state.bp >= REBIRTH_BP;
    btn.disabled = !eligible;
    btn.textContent = eligible ? 'Rebirth (NG+)' : `Rebirth ab ${fmt(REBIRTH_BP)} BP`;
  }

  /** Show the Welcome-Back dialog with the offline-earnings summary. */
  showWelcomeBack(elapsedMs: number, earned: number): void {
    byId('wbText').textContent =
      `Du warst ${this.formatDuration(elapsedMs)} weg. Deine Crew hat weitergetwerkt: ` +
      `+${fmt(earned)} BP (Offline-Rate 50 %, max. 2 h).`;
    byId('welcomeBack').classList.remove('hidden');
  }

  private formatDuration(ms: number): string {
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 1) return '< 1 min';
    if (totalMin < 60) return `${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return `${h} h ${min} min`;
  }
}
