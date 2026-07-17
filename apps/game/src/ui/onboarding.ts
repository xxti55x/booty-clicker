/**
 * First-run onboarding (spec §5 M6): three non-blocking coach marks shown once.
 * The card floats above the HUD but only the card itself captures pointer events,
 * so the player can already shake / open the shop while it's up. Gated by the
 * persisted `settings.onboarded` flag by the caller.
 */

interface Step {
  text: string;
  /** Optional element id to highlight for this step. */
  target?: string;
}

const STEPS: readonly Step[] = [
  {
    text: '👆 Klick auf die Figur oder drück die Leertaste — jeder Twerk macht Schaden am Rivalen und bringt BP. Besiege 10 Rivalen pro Bühne!',
  },
  {
    text: '🕺 In der Crew (rechts) heuerst du Tänzer:innen an — sie machen Idle-DPS und pushen deinen Klick-Schaden. Alle 5 Bühnen wartet ein Boss mit Timer.',
    target: 'toggleShop',
  },
  {
    text: '✨ Im Ruhm-Tab startest du deine Tournee neu und sammelst Seelen für dauerhaft mehr Schaden. Es geht endlos weiter — viel Spaß!',
    target: 'toggleShop',
  },
];

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export class Onboarding {
  private readonly card = byId('coach');
  private readonly textEl = byId('coachText');
  private readonly dotsEl = byId('coachDots');
  private readonly nextBtn = byId('coachNext') as HTMLButtonElement;
  private i = 0;

  constructor(private readonly onDone: () => void) {
    this.nextBtn.addEventListener('click', () => this.advance());
  }

  /** Show the first coach mark. */
  start(): void {
    this.i = 0;
    this.card.classList.remove('hidden');
    this.paint();
  }

  private advance(): void {
    this.clearHighlight();
    this.i += 1;
    if (this.i >= STEPS.length) {
      this.finish();
      return;
    }
    this.paint();
  }

  private paint(): void {
    const step = STEPS[this.i];
    this.textEl.textContent = step.text;
    this.dotsEl.textContent = STEPS.map((_, k) => (k === this.i ? '●' : '○')).join(' ');
    this.nextBtn.textContent = this.i === STEPS.length - 1 ? "Los geht's!" : 'Weiter';
    if (step.target) {
      const t = document.getElementById(step.target);
      t?.classList.add('coach-hl');
    }
  }

  private clearHighlight(): void {
    for (const el of Array.from(document.querySelectorAll('.coach-hl'))) {
      el.classList.remove('coach-hl');
    }
  }

  private finish(): void {
    this.clearHighlight();
    this.card.classList.add('hidden');
    this.onDone();
  }
}
