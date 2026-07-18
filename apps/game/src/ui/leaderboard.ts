import {
  type ScorePayload,
  fetchTop,
  isLeaderboardEnabled,
  submitScore,
  validateClientNickname,
} from '../net/leaderboard-client';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
/** Escape server-supplied nicknames before innerHTML (defense in depth). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

/**
 * Leaderboard UI (spec §7.4 v2): best-zone submit dialog + a top-50 overlay. The
 * v2 metric is the endless `maxZone` (= `lifetimeMaxZone`) with `souls`/`ascensions`
 * as display stats. Part 2 wires the prompt to the CH loop (submit only on a new
 * best zone); this file is the thin DOM glue over the fail-silent v2 client.
 */
export class Leaderboard {
  private readonly submitOverlay = byId('lbSubmit');
  private readonly submitText = byId('lbSubmitText');
  private readonly nick = byId('lbNick') as HTMLInputElement;
  private readonly submitMsg = byId('lbMsg');
  private readonly topOverlay = byId('lbTop');
  private readonly list = byId('lbList');
  private pending: ScorePayload = { maxZone: 1, souls: 0, ascensions: 0 };

  constructor() {
    (byId('lbSubmitBtn') as HTMLButtonElement).addEventListener(
      'click',
      () => void this.doSubmit(),
    );
    byId('lbSkipBtn').addEventListener('click', () => this.submitOverlay.classList.add('hidden'));
    byId('lbClose').addEventListener('click', () => this.topOverlay.classList.add('hidden'));
  }

  get enabled(): boolean {
    return isLeaderboardEnabled();
  }

  /** Offer to submit a best-zone score (skippable). No-op if no leaderboard is configured. */
  promptSubmit(score: ScorePayload): void {
    if (!this.enabled) return;
    this.pending = score;
    this.submitText.textContent = `Deine Bestzone: Bühne ${score.maxZone} (${score.souls} Seelen). Trag dich in die Bestenliste ein!`;
    this.submitMsg.textContent = '';
    this.submitMsg.className = 'msg';
    this.nick.value = '';
    this.submitOverlay.classList.remove('hidden');
  }

  private async doSubmit(): Promise<void> {
    const nick = validateClientNickname(this.nick.value);
    if (!nick) {
      this.submitMsg.textContent = 'Nickname: 2–16 Zeichen (a–z, 0–9, _ , Leerzeichen).';
      this.submitMsg.className = 'msg bad';
      return;
    }
    this.submitMsg.textContent = 'Senden…';
    this.submitMsg.className = 'msg';
    const result = await submitScore(nick, this.pending);
    if (result) {
      this.submitMsg.textContent = `Platz #${result.rank}! 🎉`;
      this.submitMsg.className = 'msg ok';
      window.setTimeout(() => this.submitOverlay.classList.add('hidden'), 1500);
    } else {
      this.submitMsg.textContent = 'Bestenliste offline — nicht gesendet.';
      this.submitMsg.className = 'msg bad';
    }
  }

  async openTop(): Promise<void> {
    this.topOverlay.classList.remove('hidden');
    this.list.textContent = 'Lade…';
    const rows = await fetchTop(50);
    if (!rows) {
      this.list.textContent = 'Bestenliste nicht erreichbar (offline).';
      return;
    }
    if (rows.length === 0) {
      this.list.textContent = 'Noch keine Einträge — sei der Erste!';
      return;
    }
    this.list.innerHTML = rows
      .map(
        (r, i) =>
          `<div class="lb-row"><span class="lb-rank">${i + 1}</span>` +
          `<span class="lb-nick">${escapeHtml(r.nickname)}</span>` +
          `<span class="lb-time">Bühne ${Number(r.maxZone)}</span></div>`,
      )
      .join('');
  }
}
