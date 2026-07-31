import type { ChState } from '../game/ch-state';
import {
  CONSTELLATIONS,
  CONSTELLATION_FULL_COST,
  CONSTELLATION_NODE_COUNT,
  type ConstellationConfig,
  type ConstellationNodeConfig,
  DUST_GATE_MIN_ZONE,
  DUST_PER_ACHIEVEMENT,
  DUST_PER_GATE,
  DUST_PER_STAR_MILESTONE,
  canBuyNode,
  dustHeld,
  nextNodeCost,
  nodeCost,
  totalNodes,
  unlockedNodes,
} from '../game/constellation';
import { STAR_MILESTONE } from '../game/stars';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/** Wie lange der Freischalt-Knopf „scharf" bleibt, bevor er zurückfällt. */
const ARM_MS = 4000;

export interface ConstellationDeps {
  state: ChState;
  /** Den nächsten Knoten einer Linie freischalten (Glue bucht + persistiert). */
  onBuy: (constellationId: string) => void;
}

/**
 * **Die Legenden-Konstellation** (IDEEN-GAMEPLAY 2a) — die Sternbild-Karte im
 * 📋 Ziele-Tab.
 *
 * **Warum hier und kein zehnter Reiter.** Die Tab-Leiste trägt neun Reiter; auf
 * dem Telefon steht jeder auf 44 px Mindestbreite (X6), macht 396 px — schon
 * heute die Grenze eines 400-px-Blattes. Ein zehnter Reiter (440 px) schöbe
 * „Mehr" hinter ein Seitwärts-Scroll OHNE Balken, also genau in den Fehler
 * zurück, den X6 behoben hat. Und thematisch gehört die Konstellation ohnehin
 * hierher: Ihre Währung entsteht AUSSCHLIESSLICH aus dem, was dieser Tab schon
 * zeigt — Bühnen-Sterne-Meilensteine, Erfolge und tiefe Boss-Gates. Quelle und
 * Senke stehen damit auf einem Blatt, und der Kopf der Karte kann die Herkunft
 * jedes Staubkorns mit LIVE-Zahlen erklären, statt auf einen anderen Reiter zu
 * verweisen.
 *
 * **Die Karte.** Drei dunkle Himmelsausschnitte, je acht Sterne an einer
 * Linie. Alles ist Inline-SVG in der bestehenden Stroke-Sprache (keine neue
 * Grafik-Dependency, keine Bild-Assets): Verbindungslinien als `<line>`,
 * Sterne als vierzackige `<path>`-Blenden. Freigeschaltet leuchtet (Gold +
 * Glüh-Filter über `drop-shadow`), der NÄCHSTE Stern pulsiert dezent, der Rest
 * bleibt Kohle. Geklickt wird auf den Stern ODER die Karte — beides wählt die
 * Linie aus und öffnet die Detail-Zeile darunter.
 *
 * **Der Kauf-Flow** ist der Arm-Knopf des Himmels-Panels (arm → „Sicher?"):
 * Sternenstaub ist endlich und es gibt KEINEN Respec, also darf kein Fehlklick
 * einen Knoten kaufen.
 */
export class Constellation {
  private readonly body = byId('metaConst');
  private selected: string = CONSTELLATIONS[0].id;
  private armed = false;
  private armTimer: ReturnType<typeof window.setTimeout> | null = null;
  private sig = '';

  constructor(private readonly deps: ConstellationDeps) {
    this.body.innerHTML = `
      <div class="cs-head" id="csHead"></div>
      <div class="cs-maps" id="csMaps"></div>
      <div class="cs-detail" id="csDetail"></div>`;

    // Delegation: Karten UND Sterne werden bei jedem Kauf neu gezeichnet, ein
    // direkt gebundener Handler ginge dabei verloren.
    byId('csMaps').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cs]');
      if (!el) return;
      this.select(el.dataset.cs!);
    });
    byId('csDetail').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('#csBuy');
      if (!btn || btn.disabled) return;
      this.onBuyClick();
    });

    this.refresh(true);
  }

  /** Wechselt die ausgewählte Linie (und entschärft einen offenen Arm-Knopf). */
  private select(id: string): void {
    if (this.selected === id) return;
    this.selected = id;
    this.disarm();
    this.refresh(true);
  }

  private disarm(): void {
    if (this.armTimer !== null) window.clearTimeout(this.armTimer);
    this.armTimer = null;
    this.armed = false;
  }

  private onBuyClick(): void {
    const c = this.deps.state.constellation;
    if (!canBuyNode(c, this.selected)) return;
    if (!this.armed) {
      this.armed = true;
      this.armTimer = window.setTimeout(() => {
        this.armed = false;
        this.armTimer = null;
        this.refresh(true);
      }, ARM_MS);
      this.refresh(true);
      return;
    }
    this.disarm();
    this.deps.onBuy(this.selected);
    this.refresh(true);
  }

  private signature(): string {
    const c = this.deps.state.constellation;
    return [
      c.earned,
      c.spent,
      CONSTELLATIONS.map((cfg) => unlockedNodes(c, cfg.id)).join('|'),
      this.selected,
      this.armed ? 'a' : '',
    ].join('~');
  }

  /** Change-detected wie die anderen Panels — der 0.25-s-Tick baut nichts um. */
  refresh(force = false): void {
    const sig = this.signature();
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.renderHead();
    byId('csMaps').innerHTML = CONSTELLATIONS.map((cfg) => this.mapCard(cfg)).join('');
    this.renderDetail();
  }

  /** Kontostand + woher der Staub kommt (mit den LIVE-Zahlen des Spielstands). */
  private renderHead(): void {
    const c = this.deps.state.constellation;
    const held = dustHeld(c);
    const done = totalNodes(c);
    const all = CONSTELLATIONS.length * CONSTELLATION_NODE_COUNT;
    byId('csHead').innerHTML =
      `<div class="cs-bank"><span class="cs-dust">💫 ${fmt(held)}</span>` +
      `<span class="dim">verfügbar · ${fmt(c.spent)} von ${fmt(c.earned)} verbaut</span></div>` +
      `<div class="cs-prog">Sterne freigeschaltet: <b>${done}/${all}</b> ` +
      `<span class="dim">(voller Ausbau: ${CONSTELLATION_FULL_COST} 💫)</span></div>` +
      `<div class="cs-src dim">Sternenstaub kommt nur aus Dingen, die dir niemand nehmen kann: ` +
      `<b>+${DUST_PER_STAR_MILESTONE}</b> je ${STAR_MILESTONE} Bühnen-Sterne · ` +
      `<b>+${DUST_PER_ACHIEVEMENT}</b> je Erfolg · ` +
      `<b>+${DUST_PER_GATE}</b> je erstmals gefallenem Boss-Gate ab Bühne ${DUST_GATE_MIN_ZONE}. ` +
      `Kein Reset — auch keine Transzendenz — nimmt dir diesen Baum je weg.</div>`;
  }

  /** Ein Sternbild als klickbare Karte: Kopfzeile, SVG-Himmel, Fortschritt. */
  private mapCard(cfg: ConstellationConfig): string {
    const c = this.deps.state.constellation;
    const have = unlockedNodes(c, cfg.id);
    const active = this.selected === cfg.id;
    const full = have >= CONSTELLATION_NODE_COUNT;
    const cost = nextNodeCost(c, cfg.id);
    const afford = canBuyNode(c, cfg.id);
    const foot = full
      ? '<span class="cs-foot done">★ Sternbild vollendet</span>'
      : `<span class="cs-foot ${afford ? 'ok' : 'bad'}">Nächster Stern: ${fmt(cost ?? 0)} 💫</span>`;
    return `<div class="cs-card ${active ? 'sel' : ''}" data-cs="${cfg.id}">
        <div class="cs-card-head">
          <span class="cs-nm">${cfg.icon} ${cfg.name}</span>
          <span class="cs-cnt">${have}/${CONSTELLATION_NODE_COUNT}</span>
        </div>
        ${this.sky(cfg, have)}
        <div class="cs-card-foot">
          <span class="cs-ds dim">${cfg.desc}</span>
          ${foot}
        </div>
      </div>`;
  }

  /**
   * Der Himmel einer Linie. Die Linien-Segmente werden EINZELN gezeichnet, damit
   * ein Segment nur dann leuchtet, wenn BEIDE seiner Sterne stehen — so wächst
   * das Sternbild sichtbar Strich für Strich, statt fertig dazuliegen.
   */
  private sky(cfg: ConstellationConfig, have: number): string {
    const parts: string[] = [];
    for (let i = 1; i < cfg.nodes.length; i++) {
      const a = cfg.nodes[i - 1];
      const b = cfg.nodes[i];
      const on = i < have;
      parts.push(
        `<line class="cs-link ${on ? 'on' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`,
      );
    }
    for (let i = 0; i < cfg.nodes.length; i++) {
      const n = cfg.nodes[i];
      const on = i < have;
      const next = i === have;
      const identity = i === cfg.nodes.length - 1;
      const cls = ['cs-star', on ? 'on' : '', next ? 'next' : '', identity ? 'big' : '']
        .filter(Boolean)
        .join(' ');
      const r = identity ? 4.6 : 3.1;
      parts.push(`<path class="${cls}" d="${starPath(n.x, n.y, r)}" />`);
    }
    return `<svg class="cs-sky" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">${parts.join('')}</svg>`;
  }

  /** Die Detail-Zeile unter den Karten: was der nächste Stern bringt + Kauf. */
  private renderDetail(): void {
    const c = this.deps.state.constellation;
    const cfg = CONSTELLATIONS.find((x) => x.id === this.selected) ?? CONSTELLATIONS[0];
    const have = unlockedNodes(c, cfg.id);
    const el = byId('csDetail');
    if (have >= CONSTELLATION_NODE_COUNT) {
      const last = cfg.nodes[cfg.nodes.length - 1];
      el.innerHTML =
        `<div class="cs-det-nm">★ ${cfg.name} — vollendet</div>` +
        `<div class="cs-det-ds">${last.name}: ${last.desc}</div>` +
        `<button class="btn ghost" id="csBuy" type="button" disabled>Alle acht Sterne stehen</button>`;
      return;
    }
    const node = cfg.nodes[have];
    const cost = nodeCost(have) ?? 0;
    const afford = canBuyNode(c, cfg.id);
    const identity = have === CONSTELLATION_NODE_COUNT - 1;
    const label = this.armed
      ? 'Sicher? Sternenstaub gibt es nicht zurück'
      : afford
        ? `Freischalten (${fmt(cost)} 💫)`
        : `Noch ${fmt(cost - dustHeld(c))} 💫 fehlen`;
    el.innerHTML =
      `<div class="cs-det-nm">${identity ? '★ ' : ''}${node.name} ` +
      `<span class="dim">· Stern ${have + 1}/${CONSTELLATION_NODE_COUNT} in „${cfg.name}"</span></div>` +
      `<div class="cs-det-ds">${node.desc}</div>` +
      (identity
        ? `<div class="cs-det-id">Identitäts-Stern — er ändert, wie sich eine Tour anfühlt.</div>`
        : '') +
      `<button class="btn ${this.armed ? 'armed' : ''}" id="csBuy" type="button" ${afford ? '' : 'disabled'}>${label}</button>` +
      `<div class="cs-det-next dim">${this.nextHint(cfg, have)}</div>`;
  }

  /** „Danach: …" — ein Blick auf den übernächsten Stern, damit die Linie zieht. */
  private nextHint(cfg: ConstellationConfig, have: number): string {
    const after: ConstellationNodeConfig | undefined = cfg.nodes[have + 1];
    if (!after) return 'Danach ist dieses Sternbild vollendet.';
    return `Danach: ${after.name} (${fmt(nodeCost(have + 1) ?? 0)} 💫) — ${after.desc}`;
  }
}

/**
 * Ein vierzackiger Stern als SVG-Pfad um `(cx, cy)`. Vier Zacken statt fünf,
 * weil die Karte 100 × 44 Einheiten misst und eine 5-Zack-Silhouette bei 3 px
 * Radius zu Matsch wird — die Vier-Zack-Blende bleibt bis in die kleinste
 * Handy-Breite als Stern lesbar (und passt zur Stroke-Ikonensprache).
 */
function starPath(cx: number, cy: number, r: number): string {
  const w = r * 0.34; // Taillenbreite der Zacken
  const p = (x: number, y: number): string => `${round(x)} ${round(y)}`;
  return (
    `M${p(cx, cy - r)}L${p(cx + w, cy - w)}L${p(cx + r, cy)}L${p(cx + w, cy + w)}` +
    `L${p(cx, cy + r)}L${p(cx - w, cy + w)}L${p(cx - r, cy)}L${p(cx - w, cy - w)}Z`
  );
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
