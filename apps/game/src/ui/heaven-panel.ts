import type { ChState } from '../game/ch-state';
import {
  HPF_RS_DIVISOR,
  RESPEC_FEE,
  TREE_BRANCHES,
  TREE_NODES,
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
import {
  clampZoom,
  TREE_VIEW,
  TRUNK_BOTTOM,
  TRUNK_TOP,
  treeLayout,
  ZOOM_STEP,
} from './heaven-tree-layout';
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
  /** Der angetippte Knoten — seine Karte steht unter dem Baum. */
  private picked: string | null = null;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  /** Läuft gerade ein Ziehen? (Pointer-Id, damit Multitouch nicht durcheinanderkommt.) */
  private dragId: number | null = null;
  private dragX = 0;
  private dragY = 0;

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
        <!-- Der Baum als BAUM (statt drei Listen): SVG-Geäst, darauf die
             Knoten als Früchte. Zoom-Knöpfe oben rechts, Mausrad und Ziehen
             tun dasselbe. Die Detail-Karte darunter gehört dem gewählten
             Knoten — so bleibt die Krone frei von Fließtext. -->
        <div class="hv-tree" id="hvTree">
          <div class="hv-zoom">
            <button type="button" data-z="out" title="Herauszoomen">−</button>
            <button type="button" data-z="fit" title="Ganzen Baum zeigen">⤢</button>
            <button type="button" data-z="in" title="Hineinzoomen">+</button>
          </div>
          <div class="hv-canvas" id="hvCanvas"></div>
        </div>
        <div class="hv-detail" id="hvDetail"></div>
        <div class="rebirth-info hv-respec-info" id="hvRespecInfo"></div>
        <button class="btn" id="hvRespecBtn" type="button">Baum zurücksetzen</button>
      </div>
      <div class="settings-section" id="hvTeaserSection">
        <h3>Danach 🔮</h3>
        <div id="hvTeaser"></div>
      </div>`;

    this.wireTree();

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

    byId('hvTreeInfo').insertAdjacentHTML('beforeend', treeEmpty);
    this.renderTree();
    this.renderDetail();

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

  /**
   * Bedienung des Baums: Knoten wählen, Zoom-Knöpfe, Mausrad, Ziehen. Alles
   * hängt an EINEM delegierten Handler auf dem Rahmen — die Knoten werden bei
   * jedem Refresh neu gebaut, ein Handler je Knoten müsste bei jedem Kauf neu
   * angeheftet werden.
   */
  private wireTree(): void {
    const frame = byId('hvTree');
    const canvas = byId('hvCanvas');

    frame.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const zoomBtn = t.closest<HTMLElement>('[data-z]');
      if (zoomBtn) {
        const kind = zoomBtn.dataset.z;
        if (kind === 'in') this.zoom = clampZoom(this.zoom * ZOOM_STEP);
        else if (kind === 'out') this.zoom = clampZoom(this.zoom / ZOOM_STEP);
        else {
          this.zoom = 1;
          this.panX = 0;
          this.panY = 0;
        }
        this.applyView();
        return;
      }
      const node = t.closest<HTMLElement>('[data-node]');
      if (node?.dataset.node) {
        this.picked = node.dataset.node;
        this.renderTree();
        this.renderDetail();
      }
    });

    // Mausrad zoomt — ohne die Seite darunter mitzuscrollen.
    frame.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        this.zoom = clampZoom(this.zoom * (ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
        this.applyView();
      },
      { passive: false },
    );

    // Ziehen verschiebt den Ausschnitt.
    canvas.addEventListener('pointerdown', (ev) => {
      if (this.dragId !== null) return;
      this.dragId = ev.pointerId;
      this.dragX = ev.clientX - this.panX;
      this.dragY = ev.clientY - this.panY;
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (this.dragId !== ev.pointerId) return;
      this.panX = ev.clientX - this.dragX;
      this.panY = ev.clientY - this.dragY;
      this.applyView();
    });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      canvas.addEventListener(name, (ev) => {
        if (this.dragId === ev.pointerId) this.dragId = null;
      });
    }
  }

  /**
   * Den Baum zeichnen: erst das Geäst als EIN SVG, dann die Knoten als
   * absolut gesetzte Knöpfe darüber. Die Knoten sind bewusst HTML und nicht
   * Teil des SVG — so tragen sie dieselben Zustandsklassen wie überall im
   * Spiel und bleiben ohne Sonderweg bedienbar.
   */
  private renderTree(): void {
    const canvas = byId('hvCanvas');
    const layouts = treeLayout();
    const pct = (v: number, total: number): string => `${((v / total) * 100).toFixed(3)}%`;

    const branchPaths = layouts
      .map(
        (b, i) =>
          `<path class="hv-branch b${i}" d="${b.path}"/>` +
          b.forkPaths.map((f) => `<path class="hv-branch hv-twig b${i}" d="${f}"/>`).join(''),
      )
      .join('');
    // Die Ast-Titel standen als SVG-Text an den Astspitzen und liefen dort aus
    // dem Bild, sobald man zoomte. Sie sind jetzt eine Legende im Rahmen: Die
    // Zuordnung tragen ohnehin die Icons auf den Früchten selbst.
    const legend =
      `<div class="hv-legend">` +
      TREE_BRANCHES.map((b) => `<span title="${b.desc}">${b.icon} ${b.name}</span>`).join('') +
      `</div>`;
    const svg =
      `<svg class="hv-svg" viewBox="0 0 ${TREE_VIEW.w} ${TREE_VIEW.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
      // Der Stamm: unten breit, oben schmal — zwei Kanten statt einer Linie.
      `<path class="hv-trunk" d="M ${TRUNK_BOTTOM.x - 46} ${TRUNK_BOTTOM.y} C ${TRUNK_BOTTOM.x - 30} ${TRUNK_BOTTOM.y - 190}, ${TRUNK_TOP.x - 22} ${TRUNK_TOP.y + 120}, ${TRUNK_TOP.x - 15} ${TRUNK_TOP.y} L ${TRUNK_TOP.x + 15} ${TRUNK_TOP.y} C ${TRUNK_TOP.x + 22} ${TRUNK_TOP.y + 120}, ${TRUNK_BOTTOM.x + 30} ${TRUNK_BOTTOM.y - 190}, ${TRUNK_BOTTOM.x + 46} ${TRUNK_BOTTOM.y} Z"/>` +
      branchPaths +
      `</svg>`;

    const nodes: string[] = [];
    layouts.forEach((b, i) => {
      const cfg = TREE_BRANCHES[i];
      if (!cfg) return;
      const all = treeNodesOfBranch(cfg.id);
      const plain = all.filter((n) => !n.exclusiveWith);
      const pair = all.filter((n) => n.exclusiveWith);
      plain.forEach((node, n) => {
        const p = b.slots[n];
        if (p) nodes.push(this.nodeDot(node, p.x, p.y, pct));
      });
      pair.forEach((node, n) => {
        const p = b.fork[n === 0 ? 0 : 1];
        nodes.push(this.nodeDot(node, p.x, p.y, pct, true));
      });
    });

    canvas.innerHTML = svg + nodes.join('');
    // Die Legende liegt NEBEN der Bühne (im Rahmen), nicht in ihr — sie darf
    // nicht mitzoomen und nicht mitwandern.
    const frame = byId('hvTree');
    frame.querySelector('.hv-legend')?.remove();
    frame.insertAdjacentHTML('beforeend', legend);
    this.applyView();
  }

  /** Ein Knoten als runde Frucht am Ast — Icon, Zustand, Level-Ring. */
  private nodeDot(
    cfg: TreeNodeConfig,
    x: number,
    y: number,
    pct: (v: number, t: number) => string,
    exclusive = false,
  ): string {
    const h = this.deps.state.heaven;
    const level = treeLevel(h, cfg.id);
    const max = treeNodeMaxLevel(cfg.id);
    const maxed = level >= max;
    const blockedBy = treeNodeBlockedBy(h, cfg.id);
    const affordable = canBuyTreeNode(h, cfg.id);
    const cls = [
      'hv-node',
      exclusive ? 'excl' : '',
      level > 0 ? 'own' : '',
      maxed ? 'maxed' : '',
      blockedBy !== null ? 'blocked' : '',
      blockedBy === null && !maxed && affordable ? 'buyable' : '',
      this.picked === cfg.id ? 'sel' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const branch = TREE_BRANCHES.find((b) => b.id === cfg.branch);
    const title =
      blockedBy !== null ? `${cfg.name} — gesperrt` : `${cfg.name} (Lv ${level}/${max})`;
    return (
      `<button type="button" class="${cls}" data-node="${cfg.id}" title="${title}" ` +
      `style="left:${pct(x, TREE_VIEW.w)};top:${pct(y, TREE_VIEW.h)}">` +
      `<span class="hv-ic">${branch?.icon ?? '🍑'}</span>` +
      (max > 1
        ? `<span class="hv-lv">${level}/${max}</span>`
        : level > 0
          ? `<span class="hv-lv">✔</span>`
          : '') +
      `</button>`
    );
  }

  /** Die Karte unter dem Baum: alles zum gewählten Knoten, samt Kauf-Knopf. */
  private renderDetail(): void {
    const el = byId('hvDetail');
    const cfg = this.picked !== null ? treeNodeConfig(this.picked) : undefined;
    if (!cfg) {
      el.innerHTML = `<div class="hv-hint">Tippe eine Frucht am Baum an, um sie zu prüfen und zu kaufen.</div>`;
      return;
    }
    el.innerHTML = this.nodeCard(cfg);
    const item = el.querySelector<HTMLElement>('.item');
    item?.addEventListener('click', () => {
      this.deps.onBuyNode(cfg.id);
    });
  }

  /** Zoom + Verschiebung auf den Baum-Container schreiben. */
  private applyView(): void {
    const c = byId('hvCanvas');
    c.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
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
