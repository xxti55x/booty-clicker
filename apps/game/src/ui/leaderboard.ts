import {
  ALL_BOARD,
  type ScorePayload,
  fetchTop,
  isLeaderboardEnabled,
  submitScore,
  validateClientNickname,
} from '../net/leaderboard-client';
import type { BoardSeason, WeeklyStage } from '../game/weekly';

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

/** Ein Board im Wechsler: Schlüssel für die API + Beschriftung für den Knopf. */
interface BoardTab {
  readonly key: string;
  readonly label: string;
  /** Eine Zeile unter dem Wechsler: was dieses Board misst und wann es endet. */
  readonly note: string;
}

/**
 * Restlaufzeit als deutscher Kurztext: „12 T", „5 T 3 h", „48 min". Unter einer
 * Minute (oder abgelaufen) heißt es ehrlich „gleich" — eine Sekunden-Anzeige, die
 * niemand beobachtet, wäre nur Zappeln.
 */
export function untilText(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 60_000) return 'gleich';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d >= 7 ? `${d} T` : `${d} T ${h - d * 24} h`;
}

/** Was die Leaderboard-UI aus dem Spiel braucht (X4). */
export interface LeaderboardDeps {
  /** Toast-Kanal für den Fehlerpfad (X4) — der Grund, warum ein Submit scheitert. */
  toast?: (icon: string, title: string, sub: string) => void;
  /** Die laufende Wochen-Bühne (A5) — liefert das Wochen-Board. */
  weekly?: () => WeeklyStage | null;
  /** Die laufende Board-Saison (X4) — Anzeige + Countdown. */
  season?: () => BoardSeason | null;
  /** Der Board-Schlüssel des Wochen-Boards (`weekly-<Index>`). */
  weeklyBoardKey?: () => string | null;
  /** Die eigene Wochen-Bestzone — der Wert, der aufs Wochen-Board geht. */
  weekBest?: () => number;
}

/**
 * Leaderboard UI (spec §7.4 v2 + ROADMAP-V2 X4): Submit-Dialog, Top-50-Overlay,
 * Saison-Zeile, Board-Wechsler und der SICHTBARE Fehlerpfad.
 *
 * X4 dreht drei Dinge gerade:
 *
 *  1. **Zwei Boards statt einem.** „Bestzone" ist das historische Allzeit-Board
 *     (Request byte-gleich wie vorher), „Woche N" das Board der laufenden
 *     ISO-Woche (`weekly-<Index>`). Das Wochen-Board setzt sich von selbst
 *     zurück, weil sein Schlüssel montags wechselt — kein Server-Zustand nötig.
 *  2. **Saison + Countdown.** Beide Zahlen fallen aus demselben Kalender wie die
 *     Wochen-Bühne (`game/weekly`), sind also auf jedem Client identisch, ohne
 *     dass die API eine Saison kennen müsste.
 *  3. **Der Fehlerpfad ist nicht mehr stumm.** Ein gescheiterter Submit meldet
 *     sich als Toast UND lässt seinen Versuch im Dialog stehen: der Retry-Knopf
 *     schickt exakt dieselbe Eingabe noch einmal, ohne Neutippen. Dasselbe gilt
 *     für die Liste, die vorher nur „nicht erreichbar" dastehen ließ.
 */
export class Leaderboard {
  private readonly submitOverlay = byId('lbSubmit');
  private readonly submitText = byId('lbSubmitText');
  private readonly nick = byId('lbNick') as HTMLInputElement;
  private readonly submitMsg = byId('lbMsg');
  private readonly retryBtn = byId('lbRetryBtn') as HTMLButtonElement;
  private readonly topOverlay = byId('lbTop');
  private readonly list = byId('lbList');
  private readonly seasonEl = byId('lbSeason');
  private readonly boardsEl = byId('lbBoards');
  private readonly boardNote = byId('lbBoardNote');
  private readonly topRetry = byId('lbTopRetry') as HTMLButtonElement;
  private pending: ScorePayload = { maxZone: 1, souls: 0, ascensions: 0 };
  /** Das gerade angezeigte Board (Schlüssel), Default: Allzeit. */
  private board = ALL_BOARD;

  constructor(private readonly deps: LeaderboardDeps = {}) {
    (byId('lbSubmitBtn') as HTMLButtonElement).addEventListener(
      'click',
      () => void this.doSubmit(),
    );
    this.retryBtn.addEventListener('click', () => void this.doSubmit());
    byId('lbSkipBtn').addEventListener('click', () => this.submitOverlay.classList.add('hidden'));
    byId('lbClose').addEventListener('click', () => this.topOverlay.classList.add('hidden'));
    this.topRetry.addEventListener('click', () => void this.loadBoard());
    // Board-Wechsel per Delegation — der Wechsler wird bei jedem Öffnen neu gebaut.
    this.boardsEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-board]');
      if (!btn || btn.dataset.board === this.board) return;
      this.board = btn.dataset.board!;
      void this.loadBoard();
    });
  }

  get enabled(): boolean {
    return isLeaderboardEnabled();
  }

  /**
   * Auto-prompt to submit a best-zone score (skippable). No-op when no leaderboard
   * is configured, so a default-off (headless) build never pops a modal mid-climb.
   */
  promptSubmit(score: ScorePayload): void {
    if (!this.enabled) return;
    this.showSubmit(score);
  }

  /**
   * Manually open the submit dialog (📋 tab „Eintragen"). Always shows the overlay;
   * when no API is configured it pre-fills the offline note and disables the send
   * button, so the player gets clear feedback instead of a dead button (§7.4 AC4).
   */
  openSubmit(score: ScorePayload): void {
    this.showSubmit(score);
  }

  /** Populate + show the submit overlay; mark offline when disabled. */
  private showSubmit(score: ScorePayload): void {
    this.pending = score;
    const week = this.deps.weekBest?.() ?? 0;
    this.submitText.textContent =
      `Deine Bestzone: Bühne ${score.maxZone} (${score.souls} Seelen).` +
      (week > 0 ? ` Diese Woche: Bühne ${week}.` : '') +
      ' Trag dich in die Bestenliste ein!';
    this.nick.value = '';
    this.retryBtn.classList.add('hidden');
    const btn = document.getElementById('lbSubmitBtn') as HTMLButtonElement | null;
    if (this.enabled) {
      this.submitMsg.textContent = '';
      this.submitMsg.className = 'msg';
      if (btn) btn.disabled = false;
    } else {
      this.submitMsg.textContent = 'Bestenliste offline — keine API konfiguriert.';
      this.submitMsg.className = 'msg bad';
      if (btn) btn.disabled = true;
    }
    this.submitOverlay.classList.remove('hidden');
  }

  /**
   * Absenden — auf BEIDE Boards, sobald ein Wochen-Board existiert: die Allzeit-
   * Bestzone aufs Allzeit-Board, die Wochen-Bestzone aufs Wochen-Board. Ein
   * einziger Dialog, ein einziger Nickname; scheitert der Allzeit-Submit, gilt der
   * ganze Versuch als gescheitert und der Retry wiederholt genau ihn.
   */
  private async doSubmit(): Promise<void> {
    const nick = validateClientNickname(this.nick.value);
    if (!nick) {
      this.submitMsg.textContent = 'Nickname: 2–16 Zeichen (a–z, 0–9, _ , Leerzeichen).';
      this.submitMsg.className = 'msg bad';
      this.retryBtn.classList.add('hidden');
      return;
    }
    this.submitMsg.textContent = 'Senden…';
    this.submitMsg.className = 'msg';
    this.retryBtn.classList.add('hidden');

    const result = await submitScore(nick, this.pending);
    const weekKey = this.deps.weeklyBoardKey?.() ?? null;
    const weekBest = this.deps.weekBest?.() ?? 0;
    // Das Wochen-Board bekommt die Wochen-Bestzone — aber nur, wenn es diese
    // Woche überhaupt etwas zu melden gibt (sonst stünde jeder mit Bühne 0 drin).
    const weekOk =
      result !== null && weekKey !== null && weekBest > 0
        ? await submitScore(nick, { ...this.pending, maxZone: weekBest }, { board: weekKey })
        : null;

    if (result) {
      const wk = weekOk ? ` · Woche: #${weekOk.rank}` : '';
      this.submitMsg.textContent = `Platz #${result.rank}!${wk} 🎉`;
      this.submitMsg.className = 'msg ok';
      window.setTimeout(() => this.submitOverlay.classList.add('hidden'), 1800);
      return;
    }
    // X4: Der Fehlerpfad ist jetzt LAUT — Toast (auch wenn der Dialog verdeckt
    // ist) plus ein Retry-Knopf, der den Versuch unverändert wiederholt.
    this.submitMsg.textContent = 'Bestenliste nicht erreichbar — nicht gesendet.';
    this.submitMsg.className = 'msg bad';
    this.retryBtn.classList.remove('hidden');
    this.deps.toast?.('📡', 'Leaderboard nicht erreichbar', 'Erneut versuchen?');
  }

  /** Die Boards des Wechslers — das Wochen-Board nur, wenn es eine Woche gibt. */
  private boards(): BoardTab[] {
    const tabs: BoardTab[] = [
      {
        key: ALL_BOARD,
        label: '🏆 Bestzone',
        note: 'Tiefste je erreichte Bühne — läuft ohne Reset weiter.',
      },
    ];
    const wk = this.deps.weekly?.() ?? null;
    const key = this.deps.weeklyBoardKey?.() ?? null;
    if (wk && key) {
      tabs.push({
        key,
        label: `📅 Woche ${wk.isoWeek}`,
        note:
          `Tiefste Bühne dieser Woche (Bühne der Woche: ${wk.zone}) — ` +
          `neues Board in ${untilText(wk.endMs - Date.now())}.`,
      });
    }
    return tabs;
  }

  /** Saison-Zeile + Wechsler neu zeichnen (beides hängt nur an der Uhr). */
  private renderChrome(): void {
    const season = this.deps.season?.() ?? null;
    this.seasonEl.textContent = season
      ? `🏅 Saison ${season.number} · endet in ${untilText(season.endMs - Date.now())}`
      : '';
    this.seasonEl.classList.toggle('hidden', season === null);
    const tabs = this.boards();
    if (!tabs.some((t) => t.key === this.board)) this.board = ALL_BOARD;
    this.boardsEl.innerHTML = tabs
      .map(
        (t) =>
          `<button type="button" class="lb-board ${t.key === this.board ? 'on' : ''}" data-board="${t.key}">${t.label}</button>`,
      )
      .join('');
    this.boardNote.textContent = tabs.find((t) => t.key === this.board)?.note ?? '';
  }

  /** Das aktive Board laden (Fehler ⇒ sichtbare Meldung + Retry-Knopf). */
  private async loadBoard(): Promise<void> {
    this.renderChrome();
    this.topRetry.classList.add('hidden');
    this.list.textContent = 'Lade…';
    const rows = await fetchTop(50, this.board === ALL_BOARD ? undefined : { board: this.board });
    if (!rows) {
      this.list.textContent = 'Bestenliste nicht erreichbar.';
      this.topRetry.classList.remove('hidden');
      this.deps.toast?.('📡', 'Leaderboard nicht erreichbar', 'Erneut versuchen?');
      return;
    }
    if (rows.length === 0) {
      this.list.textContent =
        this.board === ALL_BOARD
          ? 'Noch keine Einträge — sei der Erste!'
          : 'Diese Woche noch leer — sei der Erste!';
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

  async openTop(): Promise<void> {
    this.topOverlay.classList.remove('hidden');
    await this.loadBoard();
  }
}
