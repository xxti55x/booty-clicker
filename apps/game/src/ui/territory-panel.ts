import type { ChState } from '../game/ch-state';
import {
  THEMES,
  TERRITORY_MAX_RANK,
  TROPHY_MIN_RANK,
  repOf,
  territoryProgress,
  territoryTitle,
  themeForZone,
} from '../game/territory';
import { fmtInt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface TerritoryDeps {
  state: ChState;
  /** Die Bühne, auf der gerade gekämpft wird — sie markiert die aktive Leiste. */
  zone: () => number;
}

/**
 * **Gebietsherrschaft** (IDEEN-GAMEPLAY 1b) — die vier Ruf-Leisten im ✨ Ruhm-Tab.
 *
 * **Warum der Ruhm-Tab und kein zehnter Reiter.** Ein zehnter Reiter ist seit
 * Schritt 4 verboten, und die Messung dahinter ist mit 1b headless bestätigt
 * (390 × 844): neun Reiter à **44 px** = **396 px** Leisten-Breite gegen **387 px**
 * verfügbare Breite — die Leiste steht also schon HEUTE 9 px über der Kante, ein
 * zehnter machte 440 px und schöbe „Mehr" hinter ein Seitwärts-Scroll ohne Balken.
 *
 * Von den bestehenden Reitern kam nur einer in Frage. Ebenfalls bei 390 px
 * gemessen (`scrollHeight` des Tab-Bodys): Ziele **2 665 px** (Wochen-Karte,
 * Login, Quests, Bestenliste, Sternbild-Karte, Erfolgs-Wand) · Crew **1 877 px** ·
 * Ruhm **901 px** — inklusive der 513 px, die diese Sektion selbst misst, also
 * vorher ~390 px. Der Ruhm-Tab ist damit der kürzeste des Spiels; im Ziele-Tab
 * wären die vier Leisten auf ~3 180 px und damit in die vierte Bildschirmhöhe
 * gerutscht.
 *
 * Der Ruhm-Tab ist nicht nur der kürzeste, er ist auch der thematisch richtige:
 * Direkt über den Leisten steht der Knopf, der die ganze Tour einkassiert. „Was
 * du hier einheimst, kostet dich alles; was darunter steht, kann dir niemand
 * nehmen" — Reset und Permanenz auf einem Blatt, mit der Statistik als Fuß.
 *
 * **Die Leiste** ist bewusst in zehn Segmente geteilt statt in einen glatten
 * Balken: Die Ruf-STUFE ist die Zahl, auf die es ankommt (sie zahlt die
 * Prozente), und zehn Segmente kann man zählen, ohne die Beschriftung zu lesen.
 * Das laufende Segment füllt sich anteilig, damit auch zwischen zwei Stufen
 * sichtbar etwas passiert. Die Leiste des Themes, auf dem man GERADE steht,
 * trägt einen Rahmen — das ist die eigentliche Botschaft von 1b: WO man farmt,
 * zählt.
 *
 * Reine Anzeige: kein Klick, kein Kauf. Change-detected wie die anderen Panels,
 * damit der 0.25-s-Tick nichts umbaut.
 */
export class TerritoryPanel {
  private readonly body = byId('prTerritory');
  private sig = '';

  constructor(private readonly deps: TerritoryDeps) {
    this.refresh(true);
  }

  private signature(): string {
    const t = this.deps.state.territory;
    return THEMES.map((c) => repOf(t, c.id)).join('|') + '~' + themeForZone(this.deps.zone());
  }

  refresh(force = false): void {
    const sig = this.signature();
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const here = themeForZone(this.deps.zone());
    const t = this.deps.state.territory;
    this.body.innerHTML =
      `<div class="tr-head dim">Jeder Kill zahlt Ruf auf das Theme SEINER Bühne. Ruf-Stufen ` +
      `wirken nur dort — und überleben Aszension, Himmelfahrt und Transzendenz. ` +
      `Ab Stufe ${TROPHY_MIN_RANK} steht deine Trophäe am Inselrand.</div>` +
      THEMES.map((cfg) => this.row(cfg.id, repOf(t, cfg.id), cfg.id === here)).join('');
  }

  /** Eine Ruf-Leiste: Kopf (Icon/Name/Titel/Stufe), Segmente, Fuß (Bonus/Rest). */
  private row(id: string, rep: number, here: boolean): string {
    const cfg = THEMES.find((c) => c.id === id)!;
    const p = territoryProgress(rep);
    const title = territoryTitle(id, p.rank);
    // Deutsches Komma von Hand — `toLocaleString` hängt an ICU, auf das in
    // jsdom/Node kein Verlass ist (dieselbe Lehre wie bei `fmtInt`).
    const pct = String(Math.round((p.goldMult - 1) * 1000) / 10).replace('.', ',');
    const segs: string[] = [];
    for (let i = 1; i <= TERRITORY_MAX_RANK; i++) {
      const w = i <= p.rank ? 100 : i === p.rank + 1 ? Math.round(p.frac * 100) : 0;
      segs.push(
        `<span class="tr-seg${i <= p.rank ? ' on' : ''}"><i style="width:${w}%"></i></span>`,
      );
    }
    const next =
      p.rank >= TERRITORY_MAX_RANK
        ? '<span class="tr-max">★ Höchste Stufe</span>'
        : `<span class="dim">noch ${fmtInt(p.next - p.rep)} Ruf bis Stufe ${p.rank + 1}</span>`;
    return `<div class="tr-row${here ? ' here' : ''}${p.trophy > 0 ? ` t${p.trophy}` : ''}" title="${cfg.name} · ${cfg.zones}">
        <div class="tr-top">
          <span class="tr-ic">${cfg.icon}</span>
          <span class="tr-nm">${cfg.name}</span>
          ${title ? `<span class="tr-title">${title}</span>` : '<span class="tr-title none">ohne Rang</span>'}
          <span class="tr-rank">${p.rank}<i>/${TERRITORY_MAX_RANK}</i></span>
        </div>
        <div class="tr-bar">${segs.join('')}</div>
        <div class="tr-foot">
          <span class="tr-bonus${p.rank > 0 ? ' on' : ''}">+${pct} % BP auf ${cfg.zones}</span>
          ${next}
        </div>
        <div class="tr-rep dim">${fmtInt(p.rep)} Ruf${p.trophy > 0 ? ` · 🏆 Trophäe ${['', 'Bronze', 'Silber', 'Gold'][p.trophy]}` : ''}${here ? ' · du stehst hier' : ''}</div>
      </div>`;
  }
}
