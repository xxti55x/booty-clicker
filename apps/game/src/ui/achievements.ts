import { ACHIEVEMENTS } from '../game/achievements';
import type { GameState } from '../game/state';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/** The 🏆 shop tab: the full 18-achievement grid with unlocked/locked state. */
export class AchievementsUI {
  private readonly tab = byId('tabAch');

  constructor(private readonly state: GameState) {
    this.render();
  }

  render(): void {
    const unlocked = new Set(this.state.achievements);
    const head = `<div class="ach-head">🏆 ${unlocked.size} / ${ACHIEVEMENTS.length} freigeschaltet</div>`;
    // ACHIEVEMENTS is static, authored config — safe to interpolate into innerHTML.
    const items = ACHIEVEMENTS.map((a) => {
      const on = unlocked.has(a.id);
      return (
        `<div class="ach${on ? '' : ' locked'}"><span class="ai">${a.icon}</span>` +
        `<div class="at"><div class="an">${a.name}</div><div class="ad">${a.desc}</div></div></div>`
      );
    }).join('');
    this.tab.innerHTML = head + items;
  }
}
