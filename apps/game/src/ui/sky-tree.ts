/**
 * Der Himmelsbaum als eigener ORT (Vollbild), nicht als Panel-Abschnitt.
 *
 * Vorher lebte der Baum in einem 420-px-Kasten im Himmel-Tab, eingeklemmt
 * zwischen Fließtext und Respec-Knopf: zu klein zum Skillen, zu beiläufig für
 * die Schicht, die das halbe Endgame trägt. Hier bekommt er den ganzen
 * Bildschirm, einen eigenen Himmel (Sterne, Wolken, Lichtschein) und eine
 * Seitenspalte für die Details — der Baum selbst bleibt damit frei von Text.
 *
 * Die GEOMETRIE kommt unverändert aus `heaven-tree-layout` (pur, getestet);
 * dieses Modul ist reines Zeichnen und Bedienen.
 */
import type { ChState } from '../game/ch-state';
import {
  RESPEC_FEE,
  TREE_BRANCHES,
  type TreeNodeConfig,
  canBuyTreeNode,
  canRespec,
  treeLevel,
  treeNodeBlockedBy,
  treeNodeConfig,
  treeNodeCost,
  treeNodeMaxLevel,
  treeNodesOfBranch,
  treeRefund,
} from '../game/heaven';
import { fmt } from './format';
import {
  clampZoom,
  TREE_VIEW,
  TRUNK_BOTTOM,
  TRUNK_TOP,
  treeLayout,
  ZOOM_STEP,
} from './heaven-tree-layout';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface SkyTreeDeps {
  state: ChState;
  /** Eine Stufe des Knotens kaufen (die Glue prüft, bucht ab und persistiert). */
  onBuyNode: (id: string) => void;
  /** Baum zurücksetzen (Respec) — dieselbe Aktion wie im Himmel-Tab. */
  onRespec: () => void;
}

/** Wie viele Sterne der Hintergrund bekommt (einmal gebaut, dann statisch). */
const STAR_COUNT = 90;

export class SkyTree {
  private readonly overlay = byId('skyOverlay');
  private readonly canvas = byId('skyCanvas');
  private picked: string | null = null;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private dragId: number | null = null;
  private dragX = 0;
  private dragY = 0;
  private starsBuilt = false;
  /** Erst nach dem ersten Öffnen gezeichnet — ein zugeklappter Ort kostet nichts. */
  private everOpened = false;

  constructor(private readonly deps: SkyTreeDeps) {
    byId('skyClose').addEventListener('click', () => this.close());
    // Escape schließt — der Himmel ist ein Ort, kein Modus, aus dem man sich
    // heraussuchen muss.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) this.close();
    });
    this.wire();
  }

  get open(): boolean {
    return !this.overlay.classList.contains('hidden');
  }

  show(): void {
    this.everOpened = true;
    this.buildStars();
    this.overlay.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.overlay.classList.add('hidden');
  }

  /** Von außen (Kauf, Himmelfahrt, Respec) angestoßene Auffrischung. */
  refresh(): void {
    if (this.everOpened && this.open) this.render();
  }

  // ---------------------------------------------------------------- Bedienung

  private wire(): void {
    this.overlay.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const zoomBtn = t.closest<HTMLElement>('[data-z]');
      if (zoomBtn) {
        const k = zoomBtn.dataset.z;
        if (k === 'in') this.zoom = clampZoom(this.zoom * ZOOM_STEP);
        else if (k === 'out') this.zoom = clampZoom(this.zoom / ZOOM_STEP);
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
        this.render();
        return;
      }
      if (t.closest('[data-act="buy"]') && this.picked) {
        this.deps.onBuyNode(this.picked);
        this.render();
        return;
      }
      if (t.closest('[data-act="respec"]')) {
        this.deps.onRespec();
        this.render();
      }
    });

    byId('skyStage').addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        this.zoom = clampZoom(this.zoom * (ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
        this.applyView();
      },
      { passive: false },
    );
    const stage = byId('skyStage');
    stage.addEventListener('pointerdown', (ev) => {
      if (this.dragId !== null) return;
      this.dragId = ev.pointerId;
      this.dragX = ev.clientX - this.panX;
      this.dragY = ev.clientY - this.panY;
    });
    stage.addEventListener('pointermove', (ev) => {
      if (this.dragId !== ev.pointerId) return;
      this.panX = ev.clientX - this.dragX;
      this.panY = ev.clientY - this.dragY;
      this.applyView();
    });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      stage.addEventListener(name, (ev) => {
        if (this.dragId === ev.pointerId) this.dragId = null;
      });
    }
  }

  private applyView(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  // ---------------------------------------------------------------- Zeichnen

  /**
   * Sternenfeld: einmalig als ein Block Markup, danach nie wieder angefasst.
   * Bewusst deterministisch verteilt (goldener Winkel statt `Math.random`),
   * damit derselbe Himmel bei jedem Öffnen derselbe ist — ein Ort, den man
   * wiedererkennt, kein Rauschen.
   */
  private buildStars(): void {
    if (this.starsBuilt) return;
    this.starsBuilt = true;
    const parts: string[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = ((i * 137.508) % 100).toFixed(2);
      const y = (((i * 61.803) % 100) * 0.92).toFixed(2);
      const s = (0.9 + ((i * 7) % 5) * 0.32).toFixed(2);
      const d = ((i % 7) * 0.55).toFixed(2);
      parts.push(
        `<i style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-delay:${d}s"></i>`,
      );
    }
    byId('skyStars').innerHTML = parts.join('');
  }

  private render(): void {
    const h = this.deps.state.heaven;
    const spent = treeRefund(h);
    byId('skyBank').innerHTML = `<b>${fmt(h.hpf)}</b> 🍑 frei · <b>${fmt(spent)}</b> 🍑 im Baum`;

    this.renderTree();
    this.renderSide();
    this.renderFoot(spent);
  }

  private renderTree(): void {
    const layouts = treeLayout();
    const pct = (v: number, total: number): string => `${((v / total) * 100).toFixed(3)}%`;

    const branches = layouts
      .map(
        (b, i) =>
          `<path class="sky-branch b${i}" d="${b.path}"/>` +
          b.forkPaths.map((f) => `<path class="sky-branch sky-twig b${i}" d="${f}"/>`).join(''),
      )
      .join('');

    const svg =
      `<svg class="sky-svg" viewBox="0 0 ${TREE_VIEW.w} ${TREE_VIEW.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
      `<defs><radialGradient id="skyHalo" cx="50%" cy="42%" r="52%">` +
      `<stop offset="0" stop-color="#ffe9a8" stop-opacity="0.30"/>` +
      `<stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient></defs>` +
      `<circle cx="500" cy="430" r="470" fill="url(#skyHalo)"/>` +
      `<path class="sky-trunk" d="M ${TRUNK_BOTTOM.x - 52} ${TRUNK_BOTTOM.y} C ${TRUNK_BOTTOM.x - 34} ${TRUNK_BOTTOM.y - 170}, ${TRUNK_TOP.x - 24} ${TRUNK_TOP.y + 110}, ${TRUNK_TOP.x - 17} ${TRUNK_TOP.y} L ${TRUNK_TOP.x + 17} ${TRUNK_TOP.y} C ${TRUNK_TOP.x + 24} ${TRUNK_TOP.y + 110}, ${TRUNK_BOTTOM.x + 34} ${TRUNK_BOTTOM.y - 170}, ${TRUNK_BOTTOM.x + 52} ${TRUNK_BOTTOM.y} Z"/>` +
      branches +
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
        if (p) nodes.push(this.dot(node, p.x, p.y, pct, cfg.icon, false));
      });
      pair.forEach((node, n) => {
        const p = b.fork[n === 0 ? 0 : 1];
        nodes.push(this.dot(node, p.x, p.y, pct, cfg.icon, true));
      });
    });

    this.canvas.innerHTML = svg + nodes.join('');
    this.applyView();
  }

  /** Eine Frucht am Ast: Ast-Icon, Zustand, Stufenring. */
  private dot(
    cfg: TreeNodeConfig,
    x: number,
    y: number,
    pct: (v: number, t: number) => string,
    icon: string,
    exclusive: boolean,
  ): string {
    const h = this.deps.state.heaven;
    const level = treeLevel(h, cfg.id);
    const max = treeNodeMaxLevel(cfg.id);
    const maxed = level >= max;
    const blocked = treeNodeBlockedBy(h, cfg.id) !== null;
    const buyable = !blocked && !maxed && canBuyTreeNode(h, cfg.id);
    const cls = [
      'sky-node',
      exclusive ? 'excl' : '',
      level > 0 ? 'own' : '',
      maxed ? 'maxed' : '',
      blocked ? 'blocked' : '',
      buyable ? 'buyable' : '',
      this.picked === cfg.id ? 'sel' : '',
    ]
      .filter(Boolean)
      .join(' ');
    // Der Stufenring ist ein Conic-Gradient: Er zeigt den Ausbau, ohne dass
    // eine Zahl im Kreis Platz braucht (die Zahl steht in der Seitenspalte).
    const frac = max > 0 ? Math.min(1, level / max) : 0;
    return (
      `<button type="button" class="${cls}" data-node="${cfg.id}" ` +
      `title="${cfg.name} — Stufe ${level}/${max}" ` +
      `style="left:${pct(x, TREE_VIEW.w)};top:${pct(y, TREE_VIEW.h)};--fill:${(frac * 360).toFixed(1)}deg">` +
      `<span class="sky-ring" aria-hidden="true"></span>` +
      `<span class="sky-ic">${icon}</span>` +
      (level > 0 ? `<span class="sky-pip">${level}</span>` : '') +
      `</button>`
    );
  }

  /** Die Seitenspalte: alles zum gewählten Knoten samt Kauf-Knopf. */
  private renderSide(): void {
    const el = byId('skyDetail');
    const cfg = this.picked !== null ? treeNodeConfig(this.picked) : undefined;
    if (!cfg) {
      el.innerHTML =
        `<div class="sky-empty">` +
        `<b>Wähle eine Frucht.</b>` +
        `<p>Jeder Ast ist eine Richtung: Ökonomie, Kampf, Ritual. An der Spitze jedes Astes stehen zwei Früchte zur Wahl — du bekommst genau eine davon.</p>` +
        `</div>`;
      return;
    }
    const h = this.deps.state.heaven;
    const level = treeLevel(h, cfg.id);
    const max = treeNodeMaxLevel(cfg.id);
    const maxed = level >= max;
    const blockedBy = treeNodeBlockedBy(h, cfg.id);
    const cost = treeNodeCost(cfg.id, level);
    const can = canBuyTreeNode(h, cfg.id);
    const branch = TREE_BRANCHES.find((b) => b.id === cfg.branch);

    let action: string;
    if (blockedBy !== null) {
      action = `<div class="sky-act blocked">🚫 Du hast ${treeNodeConfig(blockedBy)?.name ?? blockedBy} gewählt — die Äste teilen sich hier.</div>`;
    } else if (maxed) {
      action = `<div class="sky-act done">✔ Voll ausgebaut</div>`;
    } else {
      action =
        `<button class="sky-buy${can ? '' : ' off'}" data-act="buy" type="button"${can ? '' : ' disabled'}>` +
        `Stufe ${level + 1}/${max} · ${fmt(cost ?? 0)} 🍑</button>` +
        (can ? '' : `<div class="sky-need">Dir fehlen ${fmt((cost ?? 0) - h.hpf)} 🍑</div>`);
    }

    el.innerHTML =
      `<div class="sky-card">` +
      `<div class="sky-branch-tag">${branch?.icon ?? '🌳'} ${branch?.name ?? ''}</div>` +
      `<h3>${cfg.name}</h3>` +
      `<div class="sky-lv">Stufe <b>${level}</b> von ${max}</div>` +
      `<p class="sky-desc">${cfg.desc}</p>` +
      action +
      `</div>`;
  }

  /** Der Fuß: Respec — die einzige Aktion, die den ganzen Baum betrifft. */
  private renderFoot(spent: number): void {
    const h = this.deps.state.heaven;
    const ok = canRespec(h);
    byId('skyFoot').innerHTML =
      `<button class="sky-respec${ok ? '' : ' off'}" data-act="respec" type="button"${ok ? '' : ' disabled'}>` +
      `Baum zurücksetzen${ok ? ` (+${fmt(spent - RESPEC_FEE)} 🍑)` : ''}</button>` +
      `<span class="sky-respec-note">Erstattet alle gebundenen 🍑 gegen ${RESPEC_FEE} 🍑 Gebühr — auch die Ast-Entscheidungen stehen danach wieder offen.</span>`;
  }
}
