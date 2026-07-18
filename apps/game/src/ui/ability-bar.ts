import {
  type AbilityState,
  canActivate,
  chargeFraction,
  frenzyFraction,
  isFrenzyActive,
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
 */
export class AbilityBar {
  private readonly btn = byId('ekstaseBtn') as HTMLButtonElement;
  private readonly fill = byId('ekstaseFill');
  private readonly label = byId('ekstaseLabel');
  private cWidth = -1;
  private cLabel = '';
  private cState = '';

  constructor(deps: AbilityBarDeps) {
    this.btn.addEventListener('click', () => deps.onActivate());
  }

  update(ability: AbilityState, now: number): void {
    const active = isFrenzyActive(ability, now);
    const ready = canActivate(ability);
    const frac = active ? frenzyFraction(ability, now) : chargeFraction(ability);
    const pct = Math.round(frac * 1000) / 10;
    if (pct !== this.cWidth) {
      this.cWidth = pct;
      this.fill.style.width = `${pct}%`;
    }

    const stateClass = active ? 'active' : ready ? 'ready' : 'idle';
    if (stateClass !== this.cState) {
      this.cState = stateClass;
      this.btn.classList.toggle('active', active);
      this.btn.classList.toggle('ready', ready && !active);
    }

    const label = active
      ? `×10  ${Math.ceil((frac * 12000) / 1000)}s`
      : ready
        ? '🍑 Ekstase! · F'
        : '🍑 Ekstase';
    if (label !== this.cLabel) {
      this.cLabel = label;
      this.label.textContent = label;
    }
  }
}
