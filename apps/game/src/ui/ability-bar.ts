import {
  ABILITY_CHARGE_MAX,
  type AbilityState,
  canActivate,
  chargeFraction,
  createFrenzyWindow,
  type FrenzyWindow,
  frenzyWindowFraction,
  isFrenzyActive,
  trackFrenzyWindow,
} from '../game/ability';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface AbilityBarDeps {
  /** Fire Twerk-Ekstase (button or key `F`). */
  onActivate: () => void;
}

/**
 * Bottom-centre Twerk-Ekstase bar (spec §8.9): a fill that visibly rises with the
 * charge meter, glows when ready, and shows the ×10 countdown while active. Key
 * `F` and the button both call `onActivate`. Change-detected so it's cheap to
 * poll every frame.
 *
 * ROADMAP-V2 X2: LADUNG und LAUFZEIT sind jetzt zwei getrennte Anzeigen. Der
 * Balken (`#ekstaseFill`) zeigt IMMER die Ladung — er läuft während der Ekstase
 * also schon wieder sichtbar voll —, der Countdown-Ring (`#ekstaseRing`, ein
 * Conic-Gradient mit den Rest-Sekunden im Kern) zeigt ausschließlich die
 * Rest-Laufzeit des offenen Fensters und ist außerhalb der Ekstase unsichtbar.
 * Vorher trug derselbe Balken beide Bedeutungen — im Fenster war damit nicht
 * mehr erkennbar, wie weit die nächste Ladung schon ist.
 */
export class AbilityBar {
  private readonly btn = byId('ekstaseBtn') as HTMLButtonElement;
  private readonly fill = byId('ekstaseFill');
  private readonly label = byId('ekstaseLabel');
  private readonly ring = byId('ekstaseRing');
  private readonly ringSec = byId('ekstaseRingSec');
  private cWidth = -1;
  private cLabel = '';
  private cState = '';
  private cRing = -1;
  private cSec = -1;
  /** Das laufende Ekstase-Fenster (X2) — Basis der Ring-Füllung. */
  private win: FrenzyWindow = createFrenzyWindow();

  constructor(deps: AbilityBarDeps) {
    this.btn.addEventListener('click', () => deps.onActivate());
  }

  update(ability: AbilityState, now: number, chargeMax: number = ABILITY_CHARGE_MAX): void {
    const active = isFrenzyActive(ability, now);
    const ready = canActivate(ability, chargeMax);
    const pct = Math.round(chargeFraction(ability, chargeMax) * 1000) / 10;
    if (pct !== this.cWidth) {
      this.cWidth = pct;
      this.fill.style.width = `${pct}%`;
    }

    const stateClass = active ? 'active' : ready ? 'ready' : 'idle';
    if (stateClass !== this.cState) {
      this.cState = stateClass;
      this.btn.classList.toggle('active', active);
      this.btn.classList.toggle('ready', ready && !active);
      this.ring.classList.toggle('on', active);
    }

    // X2-Countdown-Ring: Rest-Laufzeit gegen die beim Fenster-Start gemessene
    // Gesamtdauer, damit eine per Ekstase-Ausdauer verlängerte Ekstase (> 12 s)
    // sauber von 100 % herunterläuft statt am Anschlag zu kleben.
    this.win = trackFrenzyWindow(this.win, ability, now);
    const ringPct = Math.round(frenzyWindowFraction(this.win, now) * 100);
    if (ringPct !== this.cRing) {
      this.cRing = ringPct;
      this.ring.style.setProperty('--ek-left', `${ringPct}%`);
    }
    // Remaining seconds from the epoch-ms window directly, so an Ekstase-Ausdauer-
    // extended frenzy (> 12 s) counts down correctly instead of pegging at 12.
    const sec = active ? Math.max(0, Math.ceil((ability.frenzyUntil - now) / 1000)) : 0;
    if (sec !== this.cSec) {
      this.cSec = sec;
      this.ringSec.textContent = `${sec}`;
    }

    const label = active ? '×10 EKSTASE' : ready ? 'Ekstase! · F' : 'Ekstase';
    if (label !== this.cLabel) {
      this.cLabel = label;
      this.label.textContent = label;
    }
  }
}
