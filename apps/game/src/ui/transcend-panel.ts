import type { ChState } from '../game/ch-state';
import {
  MYTHOS_NODES,
  type MythosNodeConfig,
  TRANSCEND_MIN_HPF_LIFETIME,
  canBuyMythos,
  canTranscend,
  mythosOwned,
  mythosSpent,
  transcendGain,
  transcendGlobalMult,
} from '../game/transcend';
import { CREW } from '../game/heroes';
import {
  HEIR_WEIGHT,
  MASTERY_DPS_PER_RANK,
  MASTERY_DPS_RANKS,
  masteryProgress,
} from '../game/mastery';
import { legendGlobalMult } from '../game/legend';
import { portraitTile } from './avatars';
import { emptyState } from './empty';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

const ARM_MS = 4000;

export interface TranscendDeps {
  state: ChState;
  /** Perform the Transzendenz (bank TE, reset ALL of L1 **and** L2). */
  onTranscend: () => void;
  /** Buy one Mythos node with held TE (after a successful buy, refresh). */
  onBuyMythos: (id: string) => void;
}

/**
 * The 🔮 Transzendenz tab (prestige layer 3, spec §4.5.3). Mirrors the 🌈 Himmel panel
 * in structure: a two-step arm → confirm „Transzendieren" button (it wipes the whole
 * tour, Ruhm-Seelen, Twerk-Ahnen **and** all of L2 — Himmelspfirsiche + Himmelsbaum)
 * for a permanent, compounding **×3^TE** global boost, plus the +TE gain preview and
 * the 100-lifetime-HPF gate progress before the first Transzendenz. Held TE / Mythos
 * survive every future reset.
 *
 * Darunter der **Mythos-Shop** (ROADMAP-V2 P2): vier einmalige Wahl-Knoten gegen
 * gehaltenes TE. Weil `transcendGlobalMult` auf dem GEHALTENEN TE rechnet, kostet
 * jeder Kauf zusätzlich globalen Boost — die Card nennt deshalb vor dem Klick
 * beides, Kosten UND den Boost danach. Kein Respec: Käufe sind permanent.
 */
export class Transcend {
  private readonly body = byId('tabTranscend');
  private armed = false;
  private armTimer: ReturnType<typeof window.setTimeout> | null = null;

  constructor(private readonly deps: TranscendDeps) {
    this.body.innerHTML = `
      <div class="settings-section">
        <h3>Transzendenz 🔮</h3>
        <div class="rebirth-info transcend-info" id="tcInfo"></div>
        <button class="btn danger" id="transcendBtn" type="button">Transzendieren</button>
      </div>
      <div class="settings-section">
        <h3>Legenden-Level 🏅</h3>
        <div class="rebirth-info transcend-info" id="tcLegend"></div>
      </div>
      <div class="settings-section">
        <h3>Mythos-Shop 🔮</h3>
        <div class="rebirth-info transcend-info" id="tcMythosInfo"></div>
        <div id="tcMythosList"></div>
      </div>`;

    const btn = byId('transcendBtn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      const { state } = this.deps;
      if (!canTranscend(state.transcend, state.heaven.hpfLifetime)) return;
      if (!this.armed) {
        this.armed = true;
        btn.classList.add('armed');
        btn.textContent = 'Sicher? Tour, Ruhm, Ahnen & Himmel fallen';
        this.armTimer = window.setTimeout(() => {
          this.armed = false;
          btn.classList.remove('armed');
          this.armTimer = null;
          this.refresh();
        }, ARM_MS);
        return;
      }
      if (this.armTimer !== null) window.clearTimeout(this.armTimer);
      this.armed = false;
      btn.classList.remove('armed');
      this.deps.onTranscend();
      this.refresh();
    });

    this.refresh();
  }

  refresh(): void {
    const { state } = this.deps;
    const t = state.transcend;
    const hpfLife = state.heaven.hpfLifetime;
    const gain = transcendGain(t, hpfLife);
    const mult = transcendGlobalMult(t.te);
    const gateOk = canTranscend(t, hpfLife);

    const held =
      `Gehaltene <b>${fmt(t.te)}</b> Transzendente Essenz 🔮 ` +
      `(globaler Boost <b>×${fmt(mult)}</b> auf Klick <i>und</i> Idle — P1-neutral).<br>` +
      `Lebenszeit-TE <b>${fmt(t.teLifetime)}</b> · Transzendenzen <b>${fmt(t.transcendences)}</b>.<br>`;

    let preview: string;
    if (gateOk) {
      const nextMult = transcendGlobalMult(t.te + gain);
      preview =
        `Transzendenz jetzt: <b>+${fmt(gain)}</b> TE (→ Boost <b>×${fmt(nextMult)}</b>). ` +
        `<span class="dim">Setzt die ganze Tour, Ruhm-Seelen, Ahnen UND den kompletten Himmel ` +
        `(Himmelspfirsiche + Himmelsbaum) zurück. Vergoldungen, Gear/Skins, Truhen & TE bleiben.</span>`;
    } else {
      const pct = Math.min(100, Math.round((hpfLife / TRANSCEND_MIN_HPF_LIFETIME) * 100));
      preview =
        `<span class="tc-locked">🔒 Noch gesperrt.</span> ` +
        `Lebenszeit-HPF <b>${fmt(hpfLife)}</b> / ${TRANSCEND_MIN_HPF_LIFETIME} (${pct}%).<br>` +
        `<span class="dim">Die erste Transzendenz braucht 100 HPF Lebenszeit (mehrere Himmelfahrten tief). ` +
        `Sie wipet L1 <b>und</b> L2 für dauerhaft ×3^TE — Held-TE bleiben für immer.</span>`;
    }

    byId('tcInfo').innerHTML = held + preview;

    if (!this.armed) {
      const btn = byId('transcendBtn') as HTMLButtonElement;
      btn.disabled = !gateOk;
      btn.textContent = gateOk
        ? `Transzendieren (+${fmt(gain)} 🔮)`
        : 'Noch keine Transzendenz (100 HPF)';
    }

    this.renderLegend();

    byId('tcMythosInfo').innerHTML =
      `<span class="tc-bank">Verfügbar <b>${fmt(t.te)}</b> 🔮</span> · ausgegeben <b>${fmt(mythosSpent(t))}</b> 🔮 · Boost <b>×${fmt(mult)}</b>.<br>` +
      `Knoten sind <b>permanent</b> (überleben jede weitere Transzendenz) und es gibt <b>keinen Respec</b>. ` +
      `<span class="dim">Achtung: Ausgeben senkt den gehaltenen TE-Stand — und damit den ×3^TE-Boost. Genau das ist die Entscheidung.</span>`;

    // ROADMAP-V2 G6: Ohne TE ist der Mythos-Shop eine Auslage ohne Geld — ein
    // Satz sagt, woher es kommt.
    const shopEmpty =
      t.te <= 0 && MYTHOS_NODES.every((cfg) => !mythosOwned(t, cfg.id))
        ? emptyState(
            'transcend',
            'Transzendente Essenz gibt es nur bei einer Transzendenz — dann kaufst du hier permanente Mythos-Knoten.',
          )
        : '';

    const list = byId('tcMythosList');
    list.innerHTML = shopEmpty + MYTHOS_NODES.map((cfg) => this.nodeCard(cfg)).join('');
    for (const el of Array.from(list.querySelectorAll<HTMLElement>('.item'))) {
      const id = el.dataset.id;
      if (id && MYTHOS_NODES.some((n) => n.id === id)) {
        el.addEventListener('click', () => this.deps.onBuyMythos(id));
      }
    }
  }

  /**
   * **1d + 3c in einem Abschnitt** — und das ist Absicht: Beides sind Dinge,
   * die eine Himmelfahrt bzw. eine Transzendenz PERMANENT hinterlässt, und
   * beide gehören damit unter den Knopf, der sie auslöst. Der Legenden-Zähler
   * steht oben (er tickt bei jeder Himmelfahrt), der Erbe darunter (er wird
   * beim Transzendieren gewählt).
   */
  private renderLegend(): void {
    const { state } = this.deps;
    const L = state.legend;
    const pct = Math.round((legendGlobalMult(L) - 1) * 1000) / 10;
    const first = state.transcend.transcendences >= 1;
    const heir = CREW.find((c) => c.id === state.heir);

    const counter =
      `<div class="tc-legend"><span class="tl-n">${fmt(L)}</span>` +
      `<span class="tl-t">Legenden-Level 🏅<br><b>+${String(pct).replace('.', ',')} %</b> global, additiv</span></div>` +
      (first
        ? `<span class="dim">Jede weitere Himmelfahrt gibt +1 — unendlich, und kein Reset nimmt sie je zurück.</span>`
        : `<span class="tc-locked">🔒 Erst nach der ersten Transzendenz.</span> ` +
          `<span class="dim">Danach zahlt jede Himmelfahrt ein Level (+0,5 % global, additiv statt multiplikativ).</span>`);

    const p = heir ? masteryProgress(state.crewMastery[heir.id] ?? 0) : null;
    const gain = p
      ? Math.round(
          MASTERY_DPS_PER_RANK * Math.min(MASTERY_DPS_RANKS, p.rank) * (HEIR_WEIGHT - 1) * 100,
        )
      : 0;
    const heirRow = heir
      ? `<div class="tc-heir">${portraitTile(heir.id, 'base', `av-lg mr${p?.rank ?? 0}`)}` +
        `<span class="th-t"><b>Erbe dieser Ära: ${heir.name}</b><br>` +
        `${p && p.rank > 0 ? `${p.name}-Rang doppelt gewichtet — +${gain} Prozentpunkte Eigen-Output` : 'noch ohne Rang — die Verdopplung greift ab Bronze'}</span></div>`
      : `<div class="tc-heir none"><span class="th-t"><b>Kein Erbe</b><br>` +
        `${first ? 'Beim nächsten Transzendieren darfst du einen wählen.' : 'Beim Transzendieren darf ein Crew-Mitglied seine Meisterschaft doppelt gewichtet mitnehmen.'}</span></div>`;

    byId('tcLegend').innerHTML = counter + heirRow;
  }

  /** Eine Mythos-Knoten-Card: Name, Effekt, Kosten bzw. gekauft-Haken. */
  private nodeCard(cfg: MythosNodeConfig): string {
    const t = this.deps.state.transcend;
    const owned = mythosOwned(t, cfg.id);
    const affordable = canBuyMythos(t, cfg.id);
    const foot = owned
      ? `<span class="cost tc-owned">✔ Gekauft — für immer aktiv</span>`
      : `<span class="cost ${affordable ? '' : 'bad'}">${fmt(cfg.cost)} 🔮` +
        `${affordable ? ` · danach Boost ×${fmt(transcendGlobalMult(t.te - cfg.cost))}` : ' · nicht genug TE'}</span>`;
    return `<div class="item ${owned ? 'tc-node-owned' : affordable ? '' : 'locked'}" data-id="${cfg.id}">
        <div class="nm">${cfg.name}<span class="lv">${owned ? '✔' : `${fmt(cfg.cost)} 🔮`}</span></div>
        <div class="ds">${cfg.desc}</div>
        <div class="crew-foot">${foot}</div>
      </div>`;
  }
}
