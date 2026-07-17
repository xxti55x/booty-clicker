import type { ChState } from '../game/ch-state';
import { FPS_CAPS, type GameSettings, type Quality, saveSettings } from '../game/settings';
import { exportCh, importCh } from '../save/ch-store';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

const QUALITY_LABEL: Record<Quality, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };
const QUALITY_CYCLE: readonly Quality[] = ['low', 'medium', 'high'];
const RESET_ARM_MS = 4000;

export interface ChSettingsDeps {
  getState: () => ChState;
  applyImported: (state: ChState) => void;
  reset: () => void;
  effects: GameSettings;
  onGraphicsChange: () => void;
}

/** The ⚙️ tab: save export/import/reset (CH save) + effect & graphics toggles. */
export class ChSettings {
  private armed = false;
  private armTimer: ReturnType<typeof window.setTimeout> | null = null;

  constructor(private readonly deps: ChSettingsDeps) {
    byId('tabSet').innerHTML = `
      <div class="settings-section">
        <h3>Grafik</h3>
        <button class="btn toggle" id="gfxQuality" type="button"></button>
        <button class="btn toggle" id="gfxFps" type="button"></button>
      </div>
      <div class="settings-section">
        <h3>Effekte</h3>
        <button class="btn toggle" id="fxShake" type="button"></button>
        <button class="btn toggle" id="fxParticles" type="button"></button>
      </div>
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
      <div class="settings-section">
        <h3>Zurücksetzen</h3>
        <button class="btn danger" id="resetBtn" type="button">Fortschritt löschen</button>
      </div>`;

    this.wireGraphics();
    this.wireEffects();
    this.wireSaveIo();
    this.wireReset();
  }

  private wireGraphics(): void {
    const q = byId('gfxQuality') as HTMLButtonElement;
    const f = byId('gfxFps') as HTMLButtonElement;
    const paint = (): void => {
      q.textContent = `Qualität: ${QUALITY_LABEL[this.deps.effects.quality]}`;
      const c = this.deps.effects.fpsCap;
      f.textContent = `FPS-Limit: ${c === 0 ? 'Aus' : c}`;
    };
    q.addEventListener('click', () => {
      const i = QUALITY_CYCLE.indexOf(this.deps.effects.quality);
      this.deps.effects.quality = QUALITY_CYCLE[(i + 1) % QUALITY_CYCLE.length];
      saveSettings(this.deps.effects);
      this.deps.onGraphicsChange();
      paint();
    });
    f.addEventListener('click', () => {
      const i = FPS_CAPS.indexOf(this.deps.effects.fpsCap);
      this.deps.effects.fpsCap = FPS_CAPS[(i + 1) % FPS_CAPS.length];
      saveSettings(this.deps.effects);
      paint();
    });
    paint();
  }

  private wireEffects(): void {
    const shake = byId('fxShake') as HTMLButtonElement;
    const parts = byId('fxParticles') as HTMLButtonElement;
    const paint = (): void => {
      shake.textContent = `Screen-Shake: ${this.deps.effects.screenShake ? 'An' : 'Aus'}`;
      parts.textContent = `Partikel: ${this.deps.effects.particles ? 'An' : 'Aus'}`;
    };
    shake.addEventListener('click', () => {
      this.deps.effects.screenShake = !this.deps.effects.screenShake;
      saveSettings(this.deps.effects);
      paint();
    });
    parts.addEventListener('click', () => {
      this.deps.effects.particles = !this.deps.effects.particles;
      saveSettings(this.deps.effects);
      paint();
    });
    paint();
  }

  private wireSaveIo(): void {
    const expOut = byId('expOut') as HTMLTextAreaElement;
    byId('expBtn').addEventListener('click', () => {
      expOut.value = exportCh(this.deps.getState(), Date.now());
      expOut.select();
    });

    const impIn = byId('impIn') as HTMLTextAreaElement;
    const impMsg = byId('impMsg');
    byId('impBtn').addEventListener('click', () => {
      const state = importCh(impIn.value);
      if (!state) {
        impMsg.textContent = 'Ungültiger Save-Code';
        impMsg.className = 'msg bad';
        return;
      }
      this.deps.applyImported(state);
      impMsg.textContent = 'Save geladen ✓';
      impMsg.className = 'msg ok';
    });
  }

  private wireReset(): void {
    const btn = byId('resetBtn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      if (!this.armed) {
        this.armed = true;
        btn.classList.add('armed');
        btn.textContent = 'Wirklich löschen? Nochmal klicken';
        this.armTimer = window.setTimeout(() => {
          this.armed = false;
          btn.classList.remove('armed');
          btn.textContent = 'Fortschritt löschen';
          this.armTimer = null;
        }, RESET_ARM_MS);
        return;
      }
      if (this.armTimer !== null) window.clearTimeout(this.armTimer);
      this.deps.reset();
    });
  }
}
