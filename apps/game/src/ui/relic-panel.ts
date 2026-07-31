import type { ChState } from '../game/ch-state';
import {
  MAX_QUALITY,
  RELIC_SLOTS,
  affixConfig,
  affixValue,
  qualityConfig,
  type RolledAffix,
} from '../game/affixes';
import {
  RELIC_MIN_ZONE,
  RELIC_PITY,
  type Relic,
  meltRelicEmber,
  relicDeepestGate,
  relicInSlot,
  relicPity,
  relicScore,
} from '../game/relics';
import { emberHeld } from '../game/forge';
import { emptyState } from './empty';
import { fmtInt } from './format';
import { affixText } from './affix-text';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface RelicDeps {
  state: ChState;
  /** Ein Relikt in einen Trage-Slot legen (oder mit id 0 den Slot leeren). */
  equip(slot: number, id: number): void;
  /** Die drei bestgerollten tragen. */
  equipBest(): void;
  /** Ein Relikt gegen Schmiede-Glut einschmelzen. */
  melt(id: number): void;
}

/**
 * **Relikte** (IDEEN-GAMEPLAY 1c) — die Sektion im 🎁 Truhen-Tab.
 *
 * **Warum der Truhen-Tab und kein zehnter Reiter.** Ein zehnter Reiter bleibt
 * verboten (X6, headless bei 390 × 844 nachgemessen: neun Reiter à 44 px =
 * 396 px gegen 387 px verfügbare Breite — schon heute 9 px drüber). Von den
 * bestehenden Reitern ist der Truhen-Tab nicht nur ein möglicher Ort, sondern
 * der einzig richtige: Er IST der Loot-Tab. Über den Relikten steht das
 * Schlüssel-/Truhen-Inventar, darunter die Drop-Tabellen — die Relikte setzen
 * die Leiter genau dort fort, wo die Mythos-Truhe aufhört, und der Spieler
 * findet Zufalls-Beute an EINER Stelle statt an zweien.
 *
 * **Die Form.** Oben die drei Trage-Slots (das, was WIRKT), darunter die
 * Sammlung (das, was man BESITZT). Jede Sammlungs-Zeile trägt drei kleine
 * Slot-Knöpfe statt eines Menüs: Bei drei Zielen ist ein Aufklapp-Menü mehr
 * Klicks als Knöpfe. Das Einschmelzen sitzt bewusst rechts außen und nennt
 * seinen Ertrag im Knopf — eine Sammlung zu zerstören darf nie ein Versehen sein.
 *
 * Change-detected wie die anderen Panels: `refresh()` läuft beim Tab-Öffnen und
 * im 0,25-s-Tick, baut aber nur um, wenn sich wirklich etwas geändert hat.
 */
export class RelicPanel {
  private readonly body = byId('relicSection');
  private sig = '';

  constructor(private readonly deps: RelicDeps) {
    this.body.addEventListener('click', (ev) => this.onClick(ev));
    this.refresh(true);
  }

  private onClick(ev: Event): void {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = Number(btn.dataset.id ?? '0');
    if (act === 'best') this.deps.equipBest();
    else if (act === 'equip') this.deps.equip(Number(btn.dataset.slot ?? '0'), id);
    else if (act === 'clear') this.deps.equip(Number(btn.dataset.slot ?? '0'), 0);
    else if (act === 'melt') this.deps.melt(id);
  }

  private signature(): string {
    const r = this.deps.state.relics;
    const owned = r.owned.map((x) => `${x.id}:${x.affixes.map((a) => a.id + a.q).join(',')}`);
    return `${owned.join('|')}~${r.slots.join(',')}~${r.pity}~${r.deepestGate}~${emberHeld(this.deps.state.forge)}`;
  }

  refresh(force = false): void {
    const sig = this.signature();
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const r = this.deps.state.relics;
    const gate = relicDeepestGate(r);
    const next = gate > 0 ? gate + 5 : RELIC_MIN_ZONE;
    const left = RELIC_PITY - relicPity(r);
    const head =
      `<div class="rl-head dim">Boss-Gates ab Bühne ${RELIC_MIN_ZONE} lassen selten ein Relikt fallen — ` +
      `jedes Gate genau <b>einmal im Leben</b>, kein Reset nimmt es dir. ` +
      `Nächstes Gate mit Chance: <b>Bühne ${next}</b> · Garantie spätestens in <b>${left}</b> Gate(n).</div>`;

    if (r.owned.length === 0) {
      this.body.innerHTML =
        head +
        emptyState(
          'chest',
          `Noch kein Relikt. Stoß über Bühne ${RELIC_MIN_ZONE} vor — jedes neue Boss-Gate würfelt.`,
        );
      return;
    }

    const slots = Array.from({ length: RELIC_SLOTS }, (_, i) => this.slotCard(i)).join('');
    const ranked = [...r.owned].sort((a, b) => relicScore(b) - relicScore(a) || a.id - b.id);
    this.body.innerHTML =
      head +
      `<div class="rl-slots">${slots}</div>` +
      `<div class="rl-bar"><button class="btn ghost rl-best" data-act="best" type="button">✨ Beste tragen</button>` +
      `<span class="dim">${r.owned.length} Relikt(e) · 🔥 ${fmtInt(emberHeld(this.deps.state.forge))} Glut</span></div>` +
      `<div class="rl-list">${ranked.map((rel) => this.row(rel)).join('')}</div>`;
  }

  /** Ein Trage-Slot: das getragene Relikt oder eine leere Fassung. */
  private slotCard(slot: number): string {
    const rel = relicInSlot(this.deps.state.relics, slot);
    if (!rel) {
      return `<div class="rl-slot empty"><span class="rl-sn">Slot ${slot + 1}</span>
        <span class="rl-none">leer</span></div>`;
    }
    // In den drei schmalen Trage-Slots steht die KOMPAKTE Kachel (Glyph + Wert):
    // Bei drei Spalten auf einem 390-px-Telefon bleiben je ~120 px, und ein
    // Name wie „Gate-Brecher" schöbe den Wert aus der Karte. Der volle Name
    // steht im `title` und — ausgeschrieben — in der Sammlung darunter.
    return `<div class="rl-slot q${topQuality(rel)}"><span class="rl-sn">Slot ${slot + 1}</span>
      <span class="rl-aff">${rel.affixes.map((a) => affixChip(a, true)).join('')}</span>
      <span class="rl-zone">Bühne ${rel.zone}</span>
      <button class="rl-x" data-act="clear" data-slot="${slot}" type="button" aria-label="Slot leeren">×</button>
    </div>`;
  }

  /** Eine Sammlungs-Zeile: Affixe, drei Slot-Knöpfe, Einschmelzen. */
  private row(rel: Relic): string {
    const r = this.deps.state.relics;
    const worn = r.slots.indexOf(rel.id);
    const slotBtns = Array.from({ length: RELIC_SLOTS }, (_, i) => {
      const on = worn === i;
      return `<button class="rl-sb ${on ? 'on' : ''}" data-act="equip" data-slot="${i}" data-id="${rel.id}" type="button">${i + 1}</button>`;
    }).join('');
    return `<div class="rl-row q${topQuality(rel)} ${worn >= 0 ? 'worn' : ''}">
      <span class="rl-aff">${rel.affixes.map((a) => affixChip(a)).join('')}</span>
      <span class="rl-meta dim">Bühne ${rel.zone}</span>
      <span class="rl-acts">${slotBtns}<button class="rl-melt" data-act="melt" data-id="${rel.id}" type="button">🔥 ${meltRelicEmber(rel)}</button></span>
    </div>`;
  }
}

/** Die beste Qualitätsstufe eines Relikts — färbt Rahmen und Kachel. */
function topQuality(rel: Relic): number {
  let q = 0;
  for (const a of rel.affixes) if (a.q > q) q = a.q;
  return Math.min(MAX_QUALITY, q);
}

/**
 * Ein Affix als Kachel: Glyph + Name + Wert, in der Farbe seiner Qualität.
 * `compact` lässt den Namen weg (er steht dann nur im `title`) — für die drei
 * schmalen Trage-Slots, in denen sonst nichts mehr Platz hätte.
 */
export function affixChip(a: RolledAffix, compact = false): string {
  const cfg = affixConfig(a.id);
  if (!cfg) return '';
  const q = qualityConfig(a.q);
  const name = compact ? '' : `<b class="af-n">${cfg.name}</b>`;
  return (
    `<span class="af q${a.q} ${compact ? 'mini' : ''}" title="${q.name} · ${cfg.name}">` +
    `<i class="af-g">${cfg.glyph}</i>${name}` +
    `<span class="af-v">${affixText(cfg.stat, affixValue(a))}</span></span>`
  );
}
