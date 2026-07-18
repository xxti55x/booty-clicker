import type { ChState } from '../game/ch-state';
import { CH_ACHIEVEMENTS } from '../game/ch-achievements';
import { CHEST_TIERS, type ChestTier } from '../game/chests';
import {
  DAILY_QUEST_SLOTS,
  MAX_REROLLS,
  type MetaState,
  type QuestDef,
  type QuestReward,
  STREAK_MAX,
  activeQuests,
  dayNumber,
  isQuestComplete,
} from '../game/quests';
import type { Season } from '../game/season';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/** Chest-tier emoji lookup for quest/reward captions. */
const CHEST_EMOJI = Object.fromEntries(CHEST_TIERS.map((c) => [c.tier, c.emoji])) as Record<
  ChestTier,
  string
>;
const CHEST_NAME = Object.fromEntries(CHEST_TIERS.map((c) => [c.tier, c.name])) as Record<
  ChestTier,
  string
>;

/** A quest reward → a short German caption. */
function rewardText(r: QuestReward): string {
  switch (r.kind) {
    case 'keys':
      return `🔑 ${r.keys} Schlüssel`;
    case 'chest':
      return `${CHEST_EMOJI[r.tier]} ${CHEST_NAME[r.tier]}`;
    case 'shards':
      return `🧩 ${r.shards} Splitter`;
    case 'souls':
      return `✨ ${r.souls} Seelen`;
    default:
      return '🎁';
  }
}

export interface MetaDeps {
  state: ChState;
  /** Claim a completed quest by id (credits the reward + persists + refreshes). */
  claim: (questId: string) => void;
  /** Reroll today's quests (1×/day; refreshes). */
  reroll: () => void;
  /** Open the leaderboard Top-50 overlay. */
  openTop: () => void;
  /** Open the best-zone submit dialog (offline note when no API is configured). */
  openSubmit: () => void;
  /** The active season banner, or null. */
  season: () => Season | null;
}

/**
 * The 📋 „Ziele" tab (spec §7.1/§7.2/§7.3): the daily-login streak, today's three
 * rotating quests (progress bar + Einlösen + Neu würfeln), the CH achievement wall,
 * and the leaderboard entry points — plus the seasonal banner (§7.5).
 *
 * Change-detected like the other panels: a stable skeleton is built once; `render()`
 * (called on tab-open + the throttled 0.25 s tick) only rebuilds the dynamic
 * sections when a tracked value actually changed (a `sig` guard). NEVER called in
 * the click hot-path — quest progress advances on the state, the panel repaints on
 * the next tick. Claim clicks use event delegation so a rebuild never drops a handler.
 */
export class Meta {
  private readonly body = byId('tabMeta');
  private sig = '';

  constructor(private readonly deps: MetaDeps) {
    this.body.innerHTML = `
      <div class="meta-season hidden" id="metaSeason"></div>
      <div class="settings-section">
        <h3>Täglicher Login</h3>
        <div id="metaDaily"></div>
      </div>
      <div class="settings-section">
        <h3>Tages-Quests</h3>
        <div id="metaQuests"></div>
        <button class="btn ghost" id="metaReroll" type="button">Neu würfeln</button>
      </div>
      <div class="settings-section">
        <h3>Bestenliste</h3>
        <div class="meta-lb-btns">
          <button class="btn" id="metaLbTop" type="button">🏆 Top 50</button>
          <button class="btn ghost" id="metaLbSubmit" type="button">📤 Eintragen</button>
        </div>
      </div>
      <div class="settings-section">
        <h3>Erfolge <span class="dim" id="metaAchCount"></span></h3>
        <div class="ach-grid" id="metaAch"></div>
      </div>`;

    // Claim via delegation — a rebuild of #metaQuests never drops this handler.
    byId('metaQuests').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-claim]');
      if (btn && !btn.disabled) this.deps.claim(btn.dataset.claim!);
    });
    byId('metaReroll').addEventListener('click', () => this.deps.reroll());
    byId('metaLbTop').addEventListener('click', () => this.deps.openTop());
    byId('metaLbSubmit').addEventListener('click', () => this.deps.openSubmit());

    this.render(true);
  }

  private signature(): string {
    const m = this.deps.state.meta;
    const prog = m.questIds.map((id) => m.questProgress[id] ?? 0).join(',');
    const season = this.deps.season()?.id ?? '';
    return [
      season,
      m.day,
      m.streak,
      m.lastLoginDay,
      m.rerollsUsed,
      m.questIds.join('|'),
      prog,
      m.questsClaimed.join('|'),
      this.deps.state.achievements.length,
    ].join('~');
  }

  render(force = false): void {
    const sig = this.signature();
    if (!force && sig === this.sig) return; // change-detected: skip the rebuild
    this.sig = sig;
    this.renderSeason();
    this.renderDaily();
    this.renderQuests();
    this.renderAchievements();
  }

  private renderSeason(): void {
    const el = byId('metaSeason');
    const s = this.deps.season();
    if (!s) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `<span class="ms-emoji">${s.emoji}</span><span class="ms-body"><b>${s.name}</b><span class="dim">${s.hint}</span></span>`;
  }

  private renderDaily(): void {
    const m = this.deps.state.meta;
    const loggedToday = m.lastLoginDay >= 0 && m.lastLoginDay >= dayNumber(Date.now());
    const pips: string[] = [];
    for (let i = 1; i <= STREAK_MAX; i++) {
      const on = i <= m.streak;
      const day7 = i === STREAK_MAX;
      pips.push(
        `<span class="streak-pip ${on ? 'on' : ''} ${day7 ? 'gold' : ''}">${day7 ? '💎' : on ? '✓' : i}</span>`,
      );
    }
    const status = loggedToday
      ? '<span class="ok">Heute eingeloggt ✓ — Belohnung kassiert.</span>'
      : '<span class="dim">Beim nächsten Boot gibt es die Tagesbelohnung.</span>';
    const bonus =
      m.streak >= STREAK_MAX
        ? '<div class="meta-bonus">🔥 Tag 7 erreicht: 💎 Diamanttruhe + 2 🔑!</div>'
        : `<div class="dim">Tag 7 winkt mit 💎 Diamanttruhe + 2 🔑 (noch ${STREAK_MAX - m.streak} Tag(e)).</div>`;
    byId('metaDaily').innerHTML =
      `<div class="streak-row">${pips.join('')}</div>` +
      `<div class="streak-txt">Serie: <b>${m.streak}/${STREAK_MAX}</b></div>` +
      `<div class="meta-daily-status">${status}</div>` +
      bonus;
  }

  private questRow(q: QuestDef, m: MetaState): string {
    const prog = Math.min(q.target, m.questProgress[q.id] ?? 0);
    const pct = q.target > 0 ? Math.round((prog / q.target) * 100) : 0;
    const complete = isQuestComplete(q, m.questProgress);
    const claimed = m.questsClaimed.includes(q.id);
    let action: string;
    if (claimed) {
      action = `<button class="btn quest-claim done" type="button" disabled>Eingelöst ✓</button>`;
    } else if (complete) {
      action = `<button class="btn quest-claim" type="button" data-claim="${q.id}">Einlösen</button>`;
    } else {
      action = `<div class="quest-prog-txt">${fmt(prog)} / ${fmt(q.target)}</div>`;
    }
    return `<div class="quest ${complete ? 'complete' : ''} ${claimed ? 'claimed' : ''}">
      <div class="quest-desc">${q.desc}</div>
      <div class="quest-reward">Belohnung: ${rewardText(q.reward)}</div>
      <div class="quest-bar"><div class="quest-fill" style="width:${pct}%"></div></div>
      ${action}
    </div>`;
  }

  private renderQuests(): void {
    const m = this.deps.state.meta;
    const quests = activeQuests(m);
    const el = byId('metaQuests');
    el.innerHTML =
      quests.length > 0
        ? quests.map((q) => this.questRow(q, m)).join('')
        : `<div class="dim">Keine Quests — kehre morgen zurück (${DAILY_QUEST_SLOTS} pro Tag).</div>`;
    const reroll = byId('metaReroll') as HTMLButtonElement;
    const used = m.rerollsUsed >= MAX_REROLLS;
    reroll.disabled = used;
    reroll.textContent = used ? 'Reroll heute verbraucht' : 'Neu würfeln (1×/Tag)';
  }

  private renderAchievements(): void {
    const owned = new Set(this.deps.state.achievements);
    byId('metaAchCount').textContent = `${owned.size}/${CH_ACHIEVEMENTS.length}`;
    byId('metaAch').innerHTML = CH_ACHIEVEMENTS.map((a) => {
      const on = owned.has(a.id);
      return `<div class="ach ${on ? 'on' : 'off'}" title="${a.desc}">
        <span class="ach-icon">${on ? a.icon : '🔒'}</span>
        <span class="ach-name">${a.name}</span>
        <span class="ach-desc">${a.desc}</span>
      </div>`;
    }).join('');
  }
}
