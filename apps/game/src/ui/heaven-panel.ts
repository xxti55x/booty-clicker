import type { ChState } from '../game/ch-state';
import {
  HPF_RS_DIVISOR,
  RESPEC_FEE,
  TREE_BRANCHES,
  TREE_NODES,
  type TreeBranchConfig,
  type TreeNodeConfig,
  canBuyTreeNode,
  canHimmelfahrt,
  canRespec,
  himmelfahrtGain,
  hpfForRsLifetime,
  treeLevel,
  treeNodeBlockedBy,
  treeNodeConfig,
  treeNodeCost,
  treeNodeMaxLevel,
  treeNodesOfBranch,
  treeRefund,
} from '../game/heaven';
import { emptyState } from './empty';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

const ARM_MS = 4000;

export interface HeavenDeps {
  state: ChState;
  /** Perform the Ruhmes-Himmelfahrt (bank HPF, reset all of L1). */
  onHimmelfahrt: () => void;
  /** Buy one level of a Himmelsbaum node (after a successful buy, refresh). */
  onBuyNode: (id: string) => void;
  /** Baum zurücksetzen: alle HPF zurück, 1 HPF Gebühr (ROADMAP-V2 P4). */
  onRespec: () => void;
}

/**
 * The 🌈 Himmel tab (spec §4.5.2): Ruhmes-Himmelfahrt (prestige L2) + the
 * Himmelsbaum. Shows the +HPF preview before the big reset (M10-AC3) and lets you
 * spend held HPF on the permanent grundknoten. The Himmelfahrt button arms then
 * confirms, since it wipes the whole tour, RS and Ancients.
 *
 * **ROADMAP-V2 P4 — der Baum als Baum.** Die Knoten stehen nicht mehr als eine
 * lange Liste da, sondern in **drei Ästen** (💰 Ökonomie · ⚔️ Kampf · 🕺 Ritual),
 * je als eigene Sektion mit Titel, Icon und einem Satz. Jeder Ast endet in einem
 * **Exklusiv-Paar**, das über einen „ODER"-Steg sichtbar verbunden ist: gekauft
 * wird genau EINER, der andere trägt danach „Doktrin gewählt" und ist ausgegraut.
 * Ganz unten der **Respec** — zwei-Klick-Bestätigung wie bei Himmelfahrt und
 * Transzendieren (arm → „Sicher?"), weil er den ganzen Baum leert.
 *
 * Gestapelte Sektionen statt echter Spalten: das Panel lebt im Bottom-Sheet, das
 * auf dem Handy ~50 % der Höhe misst — drei Spalten à sechs Karten wären dort
 * unlesbar schmal. Die Äste sind trotzdem klar getrennt (Kopfzeile + eigener
 * Rahmen), und die Exklusiv-Paare stehen als visuelle Einheit zusammen.
 */
export class Heaven {
  private readonly body = byId('tabHeaven');
  private armed = false;
  private armTimer: ReturnType<typeof window.setTimeout> | null = null;
  private respecArmed = false;
  private respecTimer: ReturnType<typeof window.setTimeout> | null = null;

  constructor(private readonly deps: HeavenDeps) {
    this.body.innerHTML = `
      <div class="settings-section">
        <h3>Ruhmes-Himmelfahrt 🌈</h3>
        <div class="rebirth-info" id="hvInfo"></div>
        <button class="btn danger" id="himmelfahrtBtn" type="button">Himmelfahrt</button>
      </div>
      <div class="settings-section">
        <h3>Himmelsbaum 🌳</h3>
        <div class="rebirth-info" id="hvTreeInfo"></div>
        <div id="hvTreeList"></div>
        <div class="rebirth-info hv-respec-info" id="hvRespecInfo"></div>
        <button class="btn" id="hvRespecBtn" type="button">Baum zurücksetzen</button>
      </div>
      <div class="settings-section" id="hvTeaserSection">
        <h3>Danach 🔮</h3>
        <div id="hvTeaser"></div>
      </div>`;

    const btn = byId('himmelfahrtBtn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      const { state } = this.deps;
      if (!canHimmelfahrt(state.heaven, state.rsLifetime)) return;
      if (!this.armed) {
        this.armed = true;
        btn.classList.add('armed');
        btn.textContent = 'Sicher? Ruhm, Ahnen & Tour fallen';
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
      this.deps.onHimmelfahrt();
      this.refresh();
    });

    const respec = byId('hvRespecBtn') as HTMLButtonElement;
    respec.addEventListener('click', () => {
      if (!canRespec(this.deps.state.heaven)) return;
      if (!this.respecArmed) {
        this.respecArmed = true;
        respec.classList.add('armed');
        respec.textContent = 'Sicher? Alle Knoten fallen';
        this.respecTimer = window.setTimeout(() => {
          this.respecArmed = false;
          respec.classList.remove('armed');
          this.respecTimer = null;
          this.refresh();
        }, ARM_MS);
        return;
      }
      if (this.respecTimer !== null) window.clearTimeout(this.respecTimer);
      this.respecArmed = false;
      respec.classList.remove('armed');
      this.deps.onRespec();
      this.refresh();
    });

    this.refresh();
  }

  refresh(): void {
    const { state } = this.deps;
    const h = state.heaven;
    const gain = himmelfahrtGain(h, state.rsLifetime);
    const globalPct = Math.round(h.hpf * 2);
    const soulBonusPct = Math.round((0.1 + 0.002 * h.hpf) * 100);

    const held =
      `Gehaltene <b>${fmt(h.hpf)}</b> Himmelspfirsiche 🍑 ` +
      `(+${globalPct}% globaler Schaden · jede Seele wirkt ${soulBonusPct}% statt 10%).<br>` +
      `Lebenszeit-RS <b>${fmt(state.rsLifetime)}</b> → gesamt <b>${fmt(hpfForRsLifetime(state.rsLifetime))}</b> HPF.<br>`;
    // Vor dem Gate zeigt die Card den FORTSCHRITT statt „+0 HPF" — der Tab öffnet seit
    // ROADMAP-V2 P2a schon mit der ersten Aszension, also braucht der gesperrte Zustand
    // eine Zahl, an der man wachsen sieht (gleiche Haltung wie im 🔮-Panel).
    byId('hvInfo').innerHTML =
      gain >= 1
        ? held +
          `Himmelfahrt jetzt: <b>+${fmt(gain)}</b> HPF. ` +
          `<span class="dim">Setzt Ruhm-Seelen, Ahnen und die ganze Tour zurück; Vergoldungen, HPF & Himmelsbaum bleiben.</span>`
        : held +
          `<span class="tc-locked">🔒 Noch gesperrt.</span> ` +
          `Lebenszeit-RS <b>${fmt(state.rsLifetime)}</b> / 1 000 ` +
          `(${Math.min(100, Math.round((state.rsLifetime / HPF_RS_DIVISOR) * 100))}%).<br>` +
          `<span class="dim">Die erste Himmelfahrt braucht 1 000 Ruhm-Seelen Lebenszeit. Sie wipet die Tour, ` +
          `den Ruhm und die Ahnen — Vergoldungen, HPF & Himmelsbaum bleiben für immer.</span>`;

    if (!this.armed) {
      const btn = byId('himmelfahrtBtn') as HTMLButtonElement;
      const ok = canHimmelfahrt(h, state.rsLifetime);
      btn.disabled = !ok;
      btn.textContent = ok ? `Himmelfahrt (+${fmt(gain)} 🍑)` : 'Noch keine Himmelfahrt (1 000 RS)';
    }

    const spent = treeRefund(h);
    byId('hvTreeInfo').innerHTML =
      `<span class="tc-bank">Verfügbar <b>${fmt(h.hpf)}</b> 🍑</span> · im Baum <b>${fmt(spent)}</b> 🍑.<br>` +
      `Ausgegebene HPF sind <b>permanent</b> — über alle Aszensionen und Himmelfahrten hinweg. ` +
      `<span class="dim">Achtung: Ausgeben senkt den gehaltenen Stand — und damit die +2 %/HPF und den Seelen-Verstärker. ` +
      `Pro Ast steht am Ende EINE Doktrin zur Wahl; gekauft wird genau eine.</span>`;

    // ROADMAP-V2 G6: Vor der ersten Himmelfahrt hat der Baum keinen einzigen
    // bezahlbaren Knoten — ein Satz erklärt, was ihn wachsen lässt.
    const treeEmpty =
      h.hpf <= 0 && TREE_NODES.every((cfg) => treeLevel(h, cfg.id) <= 0)
        ? emptyState(
            'heaven',
            'Deine erste Himmelfahrt bringt Himmelspfirsiche — erst damit wächst dieser Baum.',
          )
        : '';

    const list = byId('hvTreeList');
    list.innerHTML = treeEmpty + TREE_BRANCHES.map((b) => this.branchSection(b)).join('');
    for (const el of Array.from(list.querySelectorAll<HTMLElement>('.item'))) {
      const id = el.dataset.id;
      if (id && treeNodeConfig(id)) {
        el.addEventListener('click', () => this.deps.onBuyNode(id));
      }
    }

    this.refreshRespec(spent);
    this.refreshTeaser();
  }

  /** Der Respec-Fuß: Erstattung, Gebühr und der Zustand des Knopfes. */
  private refreshRespec(spent: number): void {
    const h = this.deps.state.heaven;
    const ok = canRespec(h);
    byId('hvRespecInfo').innerHTML = ok
      ? `Zurücksetzen erstattet <b>${fmt(spent)}</b> 🍑 und kostet <b>${RESPEC_FEE}</b> 🍑 Gebühr ` +
        `(netto <b>+${fmt(spent - RESPEC_FEE)}</b> 🍑). ` +
        `<span class="dim">Danach ist der Baum leer — auch die gewählten Doktrinen stehen wieder offen.</span>`
      : `<span class="dim">Ein Respec erstattet alle im Baum gebundenen HPF gegen ${RESPEC_FEE} 🍑 Gebühr — ` +
        `sobald etwas gekauft ist, wird jede Doktrin-Wahl damit umkehrbar.</span>`;
    if (!this.respecArmed) {
      const btn = byId('hvRespecBtn') as HTMLButtonElement;
      btn.disabled = !ok;
      btn.textContent = ok
        ? `Baum zurücksetzen (+${fmt(spent - RESPEC_FEE)} 🍑)`
        : 'Baum zurücksetzen';
    }
  }

  /**
   * ROADMAP-V2 P2a — der 🔮-Teaser. Die dritte Prestige-Schicht ist bis zur ersten
   * Himmelfahrt ein UNSICHTBARES Versprechen: der 🔮-Tab erscheint erst mit
   * `hpfLifetime > 0`. Hier steht deshalb ein gesperrter Knoten, der sagt, DASS es
   * weitergeht — und woran es hängt. Er verschwindet in derselben Sekunde, in der
   * der echte Tab auftaucht (`hpfLifetime > 0 || teLifetime > 0`), damit die Info
   * nie doppelt steht. Reine Anzeige: kein Klick-Handler, kein Gate wird bewegt.
   */
  private refreshTeaser(): void {
    const { state } = this.deps;
    const locked = state.heaven.hpfLifetime === 0 && state.transcend.teLifetime === 0;
    byId('hvTeaserSection').style.display = locked ? '' : 'none';
    if (!locked) return;
    byId('hvTeaser').innerHTML = `<div class="item tc-teaser">
        <div class="nm">🔮 ??? <span class="lv">🔒</span></div>
        <div class="ds">Erreiche deine erste Himmelfahrt, um die dritte Schicht zu enthüllen.</div>
      </div>`;
  }

  /** Ein Ast: Kopfzeile, seine normalen Knoten, dann das Exklusiv-Paar am „ODER"-Steg. */
  private branchSection(branch: TreeBranchConfig): string {
    const nodes = treeNodesOfBranch(branch.id);
    const plain = nodes.filter((n) => !n.exclusiveWith);
    const pair = nodes.filter((n) => n.exclusiveWith);
    const cards = plain.map((cfg) => this.nodeCard(cfg)).join('');
    const bridge =
      pair.length === 2
        ? `<div class="hv-pair">
             ${this.nodeCard(pair[0])}
             <div class="hv-or"><span>ODER</span></div>
             ${this.nodeCard(pair[1])}
           </div>`
        : '';
    return `<div class="hv-branch" data-branch="${branch.id}">
        <div class="hv-branch-head">
          <span class="hv-branch-nm">${branch.icon} ${branch.name}</span>
          <span class="hv-branch-ds">${branch.desc}</span>
        </div>
        ${cards}${bridge}
      </div>`;
  }

  private nodeCard(cfg: TreeNodeConfig): string {
    const { state } = this.deps;
    const level = treeLevel(state.heaven, cfg.id);
    const max = treeNodeMaxLevel(cfg.id);
    const maxed = level >= max;
    const cost = treeNodeCost(cfg.id, level);
    const blockedBy = treeNodeBlockedBy(state.heaven, cfg.id);
    const affordable = canBuyTreeNode(state.heaven, cfg.id);
    const chosen = cfg.exclusiveWith !== undefined && level > 0;
    let foot: string;
    if (blockedBy !== null) {
      // Der Partner ist gekauft — dieser Knoten ist für immer zu (bis zum Respec).
      foot = `<span class="cost bad">🚫 Doktrin gewählt: ${treeNodeConfig(blockedBy)?.name ?? blockedBy}</span>`;
    } else if (maxed) {
      foot = chosen
        ? `<span class="cost tc-owned">✔ Deine Doktrin</span>`
        : `<span class="cost">Voll ausgebaut (Lv ${level})</span>`;
    } else {
      foot = `<span class="cost ${affordable ? '' : 'bad'}">Lv ${level + 1}/${max} · ${fmt(cost ?? 0)} 🍑</span>`;
    }
    // Die GEWÄHLTE Doktrin trägt bewusst kein `locked`: sie ist zwar nicht mehr
    // klickbar, soll aber als Gewinn lesen (Goldrahmen), nicht als Grauschleier —
    // der gehört dem Verlierer des Paares (`hv-blocked`).
    const cls = [
      'item',
      cfg.exclusiveWith !== undefined ? 'hv-excl' : '',
      chosen ? 'tc-node-owned' : '',
      blockedBy !== null ? 'hv-blocked' : affordable || chosen ? '' : 'locked',
    ]
      .filter(Boolean)
      .join(' ');
    const lv = chosen
      ? '✔'
      : max > 1
        ? `Lv ${level}/${max}`
        : level > 0
          ? '✔'
          : `${fmt(cost ?? 0)} 🍑`;
    return `<div class="${cls}" data-id="${cfg.id}">
        <div class="nm">${cfg.name}<span class="lv">${lv}</span></div>
        <div class="ds">${cfg.desc}</div>
        <div class="crew-foot">${foot}</div>
      </div>`;
  }
}
