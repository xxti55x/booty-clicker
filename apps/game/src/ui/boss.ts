import {
  bossHit,
  bossHpFraction,
  bossTick,
  createBoss,
  type BossState,
  type BossStatus,
} from '../game/boss';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface BossFightDeps {
  /** Current player click power. */
  getStats: () => { perClick: number; mult: number };
  /** Add the boss rig to the scene. */
  onSpawn: () => void;
  /** Remove the boss rig from the scene. */
  onDespawn: () => void;
  /** Feedback for a landed hit (damage dealt). */
  onHit: (dmg: number) => void;
  /** The boss was defeated — unlock the skin, persist, roll credits. */
  onWin: () => void;
  /** The fight is fully over (won or abandoned) — resume normal play. */
  onExit: () => void;
}

/**
 * Boss fight UI controller: owns the HP-bar/timer banner and the win/lose
 * dialog, and drives the pure boss state machine (game/boss.ts). While a fight
 * (or its result dialog) is on screen, `engaged` is true and the main loop
 * routes clicks here instead of to normal BP earning.
 */
export class BossFight {
  private boss: BossState | null = null;

  private readonly ui = byId('bossUi');
  private readonly hpFill = byId('bossHpFill');
  private readonly timerEl = byId('bossTimer');
  private readonly result = byId('bossResult');
  private readonly resTitle = byId('bossResultTitle');
  private readonly resText = byId('bossResultText');
  private readonly resPrimary = byId('bossResultPrimary') as HTMLButtonElement;
  private readonly resSecondary = byId('bossResultSecondary') as HTMLButtonElement;

  constructor(private readonly deps: BossFightDeps) {}

  /** True while the fight or its result dialog is on screen. */
  get engaged(): boolean {
    return this.boss !== null;
  }

  /** Begin (or retry) the fight; `attempt` > 0 eases HP by 25% each step. */
  start(attempt = 0): void {
    this.boss = createBoss(attempt);
    this.result.classList.add('hidden');
    this.ui.classList.remove('hidden');
    this.deps.onSpawn();
    this.render();
  }

  /** A click during the fight — deal damage. */
  hit(): void {
    const b = this.boss;
    if (!b || b.status !== 'fighting') return;
    const { perClick, mult } = this.deps.getStats();
    const dmg = bossHit(b, perClick, mult);
    this.deps.onHit(dmg);
    this.render();
    // bossHit may have mutated status to 'won' (widen past the guard narrowing).
    if ((b.status as BossStatus) === 'won') this.onResolved();
  }

  /** Advance the countdown by `dt` seconds. */
  update(dt: number): void {
    const b = this.boss;
    if (!b || b.status !== 'fighting') return;
    bossTick(b, dt);
    this.render();
    // bossTick may have mutated status to 'lost' (widen past the guard narrowing).
    if ((b.status as BossStatus) !== 'fighting') this.onResolved();
  }

  private render(): void {
    const b = this.boss;
    if (!b) return;
    this.hpFill.style.width = `${(bossHpFraction(b) * 100).toFixed(1)}%`;
    this.timerEl.textContent = Math.ceil(b.timeLeft).toString();
  }

  private onResolved(): void {
    const b = this.boss;
    if (!b) return;
    this.ui.classList.add('hidden');
    this.deps.onDespawn();
    if (b.status === 'won') {
      this.deps.onWin();
      this.showResult(
        '🏆 Sieg!',
        'Du hast den Goldenen Twerk-Tyrann besiegt! Der Tyrann-Skin ist jetzt freigeschaltet.',
        'Weiter',
        () => this.close(),
      );
    } else {
      const next = b.attempt + 1;
      this.showResult(
        '💀 Zu langsam!',
        `Die Zeit ist um. Neuer Versuch mit 25% weniger HP (Versuch ${next + 1}).`,
        'Nochmal',
        () => this.start(next),
        'Aufgeben',
        () => this.close(),
      );
    }
  }

  private showResult(
    title: string,
    text: string,
    primaryLabel: string,
    onPrimary: () => void,
    secondaryLabel?: string,
    onSecondary?: () => void,
  ): void {
    this.resTitle.textContent = title;
    this.resText.textContent = text;
    this.resPrimary.textContent = primaryLabel;
    this.resPrimary.onclick = onPrimary;
    if (secondaryLabel && onSecondary) {
      this.resSecondary.textContent = secondaryLabel;
      this.resSecondary.style.display = '';
      this.resSecondary.onclick = onSecondary;
    } else {
      this.resSecondary.style.display = 'none';
    }
    this.result.classList.remove('hidden');
  }

  private close(): void {
    this.result.classList.add('hidden');
    this.boss = null;
    this.deps.onExit();
  }
}
