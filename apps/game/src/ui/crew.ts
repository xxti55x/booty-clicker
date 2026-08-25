import type { ChState } from '../game/ch-state';
import {
  type AbilityKind,
  abilityKind,
  abilityKindLabel,
  abilityMult,
  abilityTiersUnlocked,
  bulkCost,
  CREW,
  DPS_MILESTONES,
  type HeroConfig,
  heroClick,
  heroDps,
  LEVEL_SOFTCAP,
  levelsToNextAbility,
  maxAbilityTiers,
  crewMilestoneMult,
  crewReachedFrac,
  CREW_MILESTONES,
  nextCrewMilestone,
  maxAffordable,
  milestoneMult,
  nextAbility,
  nextLevelCost,
  nextMilestone,
  retrainSlotOrdinal,
} from '../game/heroes';
import { retrainCost, retrainRollCount } from '../game/retrain';
import { type MasteryProgress, addMastery, masteryProgress, masteryRank } from '../game/mastery';
import { soulMult } from '../game/ascension';
import { ancientClickMult, ancientDpsMult } from '../game/ancients';
import { clickGearMult, dpsGearMult } from '../game/gear';
import { heavenGlobalMult, soulBonusEff } from '../game/heaven';
import { fmt, fmtInt } from './format';
import { abilityBurst, coinFly } from './fx';
import { portraitSvg, portraitTile, tierClass } from './avatars';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/**
 * Kaufmenge der Crew-Liste. `next` kauft bis exakt auf den nächsten
 * Fähigkeiten-Meilenstein (Lv 25/75/125…) — die Menge, die man beim Aufbauen
 * eines Mitglieds tatsächlich will.
 */
type BuyAmount = 1 | 10 | 100 | 'next' | 'max';

/** Tiny inline glyph per ability kind (rendered ~14 px inside the slot). */
const KIND_ICON: Record<AbilityKind, string> = {
  power:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 13.9 10l6.7 2-6.7 2L12 20.6 10.1 14l-6.7-2 6.7-2Z" fill="currentColor"/></svg>',
  crit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 2 5.8 13.2h4.4L9.4 22l7.8-11.2h-4.4L13.4 2Z" fill="currentColor"/></svg>',
  critdmg:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M13.2 6 9 12.6h2.7l-.9 5.4 4.2-6.6h-2.7l.9-5.4Z" fill="currentColor"/></svg>',
  boss: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.4 17.5h15.2l1.2-9.3-4.9 3.1L12 4.9 8.1 11.3 3.2 8.2l1.2 9.3Zm0 1.6h15.2v1.8H4.4v-1.8Z" fill="currentColor"/></svg>',
  combo:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.6" cy="12" r="4.8" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="15.4" cy="12" r="4.8" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  beat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3.5v11.9a3.4 3.4 0 1 0 2 3.1V8.3c2.4.4 3.9 1.5 4.7 3.2.7-3.8-1.5-6.2-4.7-6.9V3.5h-2Z" fill="currentColor"/></svg>',
  ekstase:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4c1 3.3 4.3 4.8 4.3 8.8a6.6 6.6 0 0 1-1.8 4.7c.2-2.3-.7-3.7-2.5-5-1.8 1.3-2.7 2.7-2.5 5a6.6 6.6 0 0 1-1.8-4.7c0-4 3.3-5.5 4.3-8.8Zm0 19.2a4.6 4.6 0 0 1-3.4-1.5c2.3.2 4.5.2 6.8 0A4.6 4.6 0 0 1 12 21.6Z" fill="currentColor"/></svg>',
  idle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V11h3.6v9H4Zm6.2 0V4h3.6v16h-3.6Zm6.2 0V8H20v12h-3.6Z" fill="currentColor"/></svg>',
};

/**
 * Die Rahmenfarbe je Meisterschafts-Rang (1a): Kupfer → Silber → Gold →
 * Legende. Der Legenden-Wert ist nur der FALLBACK — seinen Regenbogen-Schimmer
 * malt die CSS-Animation `.av.mr4` (Animationen schlagen die Inline-Variable).
 */
const MASTERY_FRAME: readonly string[] = ['', '#c47a3a', '#cfd8e0', '#ffcf5e', '#c79bf0'];

/** Die Meisterschafts-Zeile einer Crew-Card („Meisterschaft: Silber · 1.240/8.000"). */
function masteryLine(p: MasteryProgress): string {
  if (p.xp <= 0) return '';
  const body =
    p.rank === 0
      ? `${fmtInt(p.xp)}/${fmtInt(p.next)} → ${p.nextName}`
      : p.next > 0
        ? `${p.name} · ${fmtInt(p.xp)}/${fmtInt(p.next)}`
        : `${p.name} · ${fmtInt(p.xp)}`;
  const title =
    p.next > 0
      ? `Einsatz-XP: ${fmtInt(p.xp)} von ${fmtInt(p.next)} Lebenszeit-Leveln bis ${p.nextName}`
      : `Einsatz-XP: ${fmtInt(p.xp)} Lebenszeit-Level — höchster Rang erreicht`;
  return `<div class="mr-line mr${p.rank}" title="${title}">Meisterschaft: ${body}</div>`;
}

/**
 * Die Meilenstein-Zeile einer Crew-Card („⚡ ×4 · +100 % bei Lv 100").
 *
 * Ohne sie ist der wichtigste Grund, ein Mitglied WEITER zu leveln, unsichtbar:
 * Der Ausstoß verdoppelt sich sprunghaft bei {@link DPS_MILESTONES}, dazwischen
 * wächst er nur linear. Die Zeile zeigt beides — was schon verdient ist (×N)
 * und wie weit der nächste Sprung noch weg ist — plus einen Balken, der den Weg
 * vom letzten zum nächsten Meilenstein füllt. Das Ziel steht bewusst als „×N",
 * nicht als „+100 %": Die Fähigkeits-Zeile derselben Karte trägt schon ein
 * „+100 % DPS" für einen ganz anderen Kauf — zwei Systeme mit demselben
 * Wortlaut direkt untereinander liest niemand auseinander. „⚡ ×2 … ×4 bei
 * Lv 100" zeigt dagegen genau dieselbe Skala wie das Abzeichen davor. Jenseits des Soft-Caps sagt sie
 * offen, dass es keinen Sprung mehr gibt: Ausstoß linear, Preis exponentiell.
 */
function milestoneLine(level: number): string {
  if (level <= 0) return '';
  const mult = milestoneMult(level);
  const next = nextMilestone(level);
  const badge = mult > 1 ? `⚡ ×${mult}` : '⚡ ×1';
  if (next === null) {
    return (
      `<div class="ms-line cap" title="Soft-Cap ab Lv ${LEVEL_SOFTCAP}: keine Verdopplung mehr — ` +
      `der Ausstoß wächst nur noch linear, der Preis zusätzlich exponentiell. Weiterziehen ist ` +
      `erlaubt, lohnt aber meist weniger als der nächste Kauf woanders.">` +
      `${badge} · Soft-Cap — linear` +
      `</div>`
    );
  }
  // Der Balken misst den Weg vom ZULETZT erreichten Meilenstein zum nächsten,
  // nicht von 0 — sonst stünde er bei Lv 240 fast voll, obwohl nur 10 Level
  // seit dem letzten Sprung vergangen sind.
  const prev = DPS_MILESTONES.filter((m) => m <= level).pop() ?? 0;
  const pct = Math.max(0, Math.min(100, ((level - prev) / (next - prev)) * 100));
  return (
    `<div class="ms-line" title="Alle paar Level verdoppelt sich der Ausstoß dieses Mitglieds. ` +
    `Erreicht: ×${mult}. Nächster Sprung auf ×${mult * 2} bei Lv ${next} (noch ${next - level} Level).">` +
    `${badge}<span class="ms-bar"><i style="width:${pct.toFixed(1)}%"></i></span>` +
    `<span class="ms-goal">×${mult * 2} bei Lv ${next}</span>` +
    `</div>`
  );
}

/**
 * Das Werkzeug-Icon des Umschul-Knopfes (3b) — Schraubenschlüssel in derselben
 * Stroke-Sprache wie die Tab-Ikonen, kein Emoji.
 */
const TOOL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 3.6a5.4 5.4 0 0 0-5 8.9L4 18.2l1.8 1.8 5.7-5.7a5.4 5.4 0 0 0 7.4-6.6l-3 3-2.3-2.3 3-3a5.4 5.4 0 0 0-1.9-.8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

/** Portrait + Sorten-Badge einer Fähigkeits-Kachel (Power-Stufen flexen). */
function slotArt(id: string, kind: AbilityKind, badge: string): string {
  return (
    portraitSvg(id, kind === 'power' ? 'power' : 'base', 'ab-av') +
    `<span class="ab-badge">${badge}</span>`
  );
}

export interface CrewDeps {
  state: ChState;
  /** Called after a successful purchase (refresh HUD, persist). */
  onBuy: () => void;
  /**
   * Ein Mitglied hat mit DIESEM Kauf einen Meisterschafts-Rang erreicht (1a) —
   * die Glue feiert das mit einem Meilenstein-Toast. Optional, damit Tests die
   * Card ohne Toast-Stack bauen können.
   */
  onRankUp?: (cfg: HeroConfig, progress: MasteryProgress) => void;
  /**
   * Der Umschul-Knopf an einem GEKAUFTEN Spezial-Slot wurde gedrückt (3b) — die
   * Glue öffnet den Dialog (Portrait groß, zwei Angebote, Kosten). Optional,
   * damit Tests die Card ohne Dialog bauen können.
   */
  onRetrain?: (cfg: HeroConfig, tier: number) => void;
}

/**
 * The Crew shop tab. Slot 1 (Booty-Boss) levels CLICK damage, every later
 * member is pure idle DPS (§goal v10). Each member additionally has kaufbare
 * Fähigkeiten (Lv 25, 75, 125, …), paid in BP: odd tiers grant +100 % base
 * output, even tiers the member's THEMED SPECIAL (v11 — Gold, Krit, Boss,
 * Combo, Beat oder Ekstase). The slot row shows a pulsing kind-tinted buy
 * button once the level requirement is met.
 *
 * **1a — Crew-Meisterschaft.** Jeder gekaufte Level bucht Einsatz-XP
 * (`addMastery`); die Card zeigt Rang-Rahmen ums Portrait, die Fortschritts-
 * Zeile zum nächsten Rang und meldet einen Rang-Aufstieg über `onRankUp` an die
 * Glue (Toast). Der Legenden-Slot wird NICHT hier gebucht, sondern von der Glue
 * in `onBuy` — sie ist die einzige Stelle, die ihn auch nach einem Reset und
 * beim Boot vergibt.
 *
 * **3b — Crew-Umschulung.** Jede GEKAUFTE Spezial-Kachel trägt zusätzlich einen
 * Werkzeug-Knopf; er meldet nur (`onRetrain`), gekauft und gewürfelt wird im
 * Dialog. Welche SORTE eine Kachel zeigt, liest die Card über dieselbe
 * `abilityKind(cfg, tier, retrain)` wie Spiel und Sim — die Kachel eines
 * umgeschulten Slots wechselt damit ohne Sonderfall ihr Badge und ihr Label.
 */
export class Crew {
  private readonly body = byId('tabCrew');
  private amount: BuyAmount = 1;
  /** Letztes gerendertes List-HTML — identische Rebuilds werden übersprungen. */
  private lastHtml = '';
  /**
   * Pointer-down-Guard (Bugfix „Fähigkeit kaufen braucht Doppelklick"): der
   * 0.25-s-Idle-Tick rendert den offenen Tab neu; ersetzte innerHTML zwischen
   * Mousedown und Mouseup lässt den Klick auf einem verwaisten Button
   * verpuffen. Solange ein Pointer in der Liste gedrückt ist, wird jeder
   * Re-Render aufgeschoben und erst nach dem Pointerup nachgeholt.
   */
  private pointerHeld = false;
  private renderPending = false;

  constructor(private readonly deps: CrewDeps) {
    this.body.innerHTML = `
      <div class="buyamt" id="buyAmt">
        <button class="amt active" data-a="1" type="button">×1</button>
        <button class="amt" data-a="10" type="button">×10</button>
        <button class="amt" data-a="100" type="button">×100</button>
        <button class="amt" data-a="next" type="button" title="Bis zur nächsten Fähigkeit (Lv 25, 75, 125 …)">Fähigkeit</button>
        <button class="amt" data-a="max" type="button">Max</button>
      </div>
      <div id="crewMs"></div>
      <div id="crewList"></div>`;
    for (const b of Array.from(this.body.querySelectorAll<HTMLButtonElement>('.amt'))) {
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        this.amount =
          a === 'max' ? 'max' : a === 'next' ? 'next' : a === '100' ? 100 : a === '10' ? 10 : 1;
        for (const x of Array.from(this.body.querySelectorAll('.amt')))
          x.classList.remove('active');
        b.classList.add('active');
        this.render();
      });
    }
    // Ein EINZIGER delegierter Klick-Handler auf dem persistenten Container —
    // überlebt jeden innerHTML-Rebuild (kein Re-Attach pro Zeile mehr).
    const list = byId('crewList');
    list.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      // 3b: Der Umschul-Knopf sitzt IN einer gekauften Kachel, die wiederum in der
      // Zeile sitzt — er wird deshalb ZUERST geprüft und beendet den Handler, sonst
      // würde derselbe Klick zusätzlich die Level-Zeile darunter kaufen.
      const rt = t.closest<HTMLElement>('.ab-rt');
      if (rt?.dataset.rt) {
        const cfg = CREW.find((c) => c.id === rt.dataset.rt);
        const tier = Number(rt.dataset.rtTier);
        if (cfg && Number.isInteger(tier) && tier > 0) this.deps.onRetrain?.(cfg, tier);
        return;
      }
      const ab = t.closest<HTMLElement>('.ab.ready');
      if (ab?.dataset.ab) {
        const cfg = CREW.find((c) => c.id === ab.dataset.ab);
        // ROADMAP-V2 G6: Die Slot-Position VOR dem Kauf merken — `render()`
        // ersetzt die Zeile, das Element ist danach ein anderes. Gefeiert wird
        // nur ein Kauf, der auch stattgefunden hat.
        const rect = ab.getBoundingClientRect();
        if (cfg && this.buyAbility(cfg)) {
          coinFly(ev.clientX, ev.clientY);
          abilityBurst(rect);
        }
        return; // die Zeile darunter darf NICHT zusätzlich leveln
      }
      const row = t.closest<HTMLElement>('.item');
      if (row?.dataset.id) {
        const cfg = CREW.find((c) => c.id === row.dataset.id);
        if (cfg && this.buy(cfg)) coinFly(ev.clientX, ev.clientY);
      }
    });
    list.addEventListener('pointerdown', () => {
      this.pointerHeld = true;
    });
    for (const evName of ['pointerup', 'pointercancel'] as const) {
      window.addEventListener(evName, () => {
        this.pointerHeld = false;
        if (this.renderPending) {
          this.renderPending = false;
          // Nach dem Klick-Dispatch nachholen (click feuert synchron nach dem
          // Pointerup im selben Task — ein sofortiger Rebuild bräche ihn doch).
          window.setTimeout(() => this.render(), 0);
        }
      });
    }
    this.render();
  }

  /** Levels to buy for a hero given the current amount + affordability. */
  /**
   * Wie viele Level eine Menge kauft — GENAU so viele, wie sie verspricht.
   *
   * Nur `max` richtet sich nach dem Kontostand; ×10, ×100 und „Fähigkeit"
   * liefern ihre volle Menge, auch wenn sie unbezahlbar ist. Der Kauf scheitert
   * dann sauber (`buy` prüft den Preis) und die Karte zeigt sich als zu teuer.
   * Vorher fiel „Fähigkeit" auf das gerade Leistbare zurück und kaufte damit
   * heimlich etwas anderes als draufstand — genau dafür gibt es den Max-Knopf.
   */
  private countFor(cfg: HeroConfig, level: number): number {
    if (this.amount === 'max') return maxAffordable(cfg, level, this.deps.state.gold);
    if (this.amount === 'next') return levelsToNextAbility(cfg, level);
    return this.amount;
  }

  private revealed(index: number): boolean {
    if (index === 0) return true;
    const prev = CREW[index - 1];
    const lvls = this.deps.state.crew;
    return (lvls[prev.id] ?? 0) > 0 || this.deps.state.gold >= CREW[index].baseCost;
  }

  /** Level kaufen — `true`, wenn wirklich gekauft wurde (G6: Feedback-Gate). */
  private buy(cfg: HeroConfig): boolean {
    const s = this.deps.state;
    const level = s.crew[cfg.id] ?? 0;
    const count = Math.max(0, this.countFor(cfg, level));
    if (count <= 0) return false;
    const cost = bulkCost(cfg, level, count);
    if (cost > s.gold) return false;
    s.gold -= cost;
    s.crew[cfg.id] = level + count;
    // 1a: JEDER gekaufte Level zählt in die Einsatz-XP — auch ×10/Max, auch der
    // allererste („Anheuern"). Der Rang wird VOR und NACH der Buchung gelesen,
    // damit der Meilenstein-Toast genau einmal feuert.
    const before = masteryRank(s.crewMastery[cfg.id] ?? 0);
    s.crewMastery = addMastery(s.crewMastery, cfg.id, count);
    const after = masteryProgress(s.crewMastery[cfg.id] ?? 0);
    this.deps.onBuy();
    if (after.rank > before) this.deps.onRankUp?.(cfg, after);
    this.render();
    return true;
  }

  /**
   * Die Kopfzeile des crew-weiten Meilensteins.
   *
   * Ohne sie wäre der Bonus unsichtbar: Er hängt an keinem einzelnen Mitglied,
   * taucht also auf keiner Karte auf — und ein Faktor, den niemand sieht,
   * steuert auch niemanden. Die Zeile nennt drei Dinge: was gerade anliegt
   * (×N), welche Schwelle als Nächstes zählt und wie viele Mitglieder ihr noch
   * fehlen.
   */
  private renderMilestoneHead(): void {
    const s = this.deps.state;
    const el = byId('crewMs');
    const mult = crewMilestoneMult(s.crew);
    const next = nextCrewMilestone(s.crew);
    if (next === null) {
      el.className = 'crew-ms done';
      el.innerHTML =
        `<b>Crew-Bonus ×${fmt(mult)}</b>` +
        `<span>Die ganze Crew steht über Lv ${CREW_MILESTONES[CREW_MILESTONES.length - 1]} — mehr geht hier nicht.</span>`;
      return;
    }
    const fehlen = CREW.filter((c) => (s.crew[c.id] ?? 0) < next).length;
    const frac = crewReachedFrac(s.crew, next);
    el.className = 'crew-ms';
    el.title = `Sobald ALLE ${CREW.length} Mitglieder Lv ${next} erreicht haben, verdoppelt sich der Ausstoß der ganzen Crew. Aktuell fehlen ${fehlen}.`;
    el.innerHTML =
      `<b>Crew-Bonus ×${mult < 10 ? mult.toFixed(2) : fmt(mult)}</b>` +
      `<span class="crew-ms-bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></span>` +
      // Kurz halten: Das Crew-Panel ist schmal, und der lange Satz („… dann ×2
      // für ALLE") lief im Test rechts aus dem Band heraus und wurde
      // abgeschnitten. Der Titel trägt die ausführliche Fassung.
      `<span>noch ${fehlen} × Lv ${next}</span>`;
  }

  /** Buy the next unlocked ability tier for a member (in order, BP-priced). */
  private buyAbility(cfg: HeroConfig): boolean {
    const s = this.deps.state;
    const level = s.crew[cfg.id] ?? 0;
    const ups = s.crewUp[cfg.id] ?? 0;
    const ab = nextAbility(cfg, level, ups);
    if (!ab || !ab.unlocked || ups >= abilityTiersUnlocked(cfg, level) || ab.cost > s.gold)
      return false;
    s.gold -= ab.cost;
    s.crewUp[cfg.id] = ups + 1;
    this.deps.onBuy();
    this.render();
    return true;
  }

  render(): void {
    if (this.pointerHeld) {
      this.renderPending = true; // kein DOM-Swap unter einem gedrückten Finger
      return;
    }
    const list = byId('crewList');
    const s = this.deps.state;
    this.renderMilestoneHead();
    const sm = soulMult(s.souls, soulBonusEff(s.heaven.hpf));
    const global = heavenGlobalMult(s.heaven.hpf);
    // keep the per-hero display in lockstep with dpsOf/clickDamageOf (§5)
    const dpsMult =
      sm *
      ancientDpsMult(s.ancients) *
      global *
      // Der `idle`-Topf ist entfallen: „Groove" wirkt seit dem Eigen-Boost-Umbau
      // nur noch auf seinen Träger und steckt in dessen eigener Zeile.
      dpsGearMult(s.gear);
    const clickMult = sm * ancientClickMult(s.ancients) * global * clickGearMult(s.gear);
    const rows: string[] = [];
    CREW.forEach((cfg, i) => {
      if (!this.revealed(i)) return;
      const level = s.crew[cfg.id] ?? 0;
      const ups = s.crewUp[cfg.id] ?? 0;
      const count = this.countFor(cfg, level);
      const cost = count > 0 ? bulkCost(cfg, level, count) : nextLevelCost(cfg, level);
      const affordable = count > 0 && cost <= s.gold;
      const gild = s.gilds[cfg.id] ?? 0;
      const mp = masteryProgress(s.crewMastery[cfg.id] ?? 0);
      const out = cfg.click
        ? heroClick(cfg, level, gild, ups, mp.xp) * clickMult
        : heroDps(cfg, level, gild, ups, mp.xp) * dpsMult;
      const outLabel = cfg.click ? 'Klick' : 'DPS';
      const gildBadge =
        gild > 0 ? `<span class="gild" title="×1.25 pro Vergoldung">🏅${gild}</span>` : '';
      const label = level === 0 ? 'Anheuern' : `+${count === 0 ? 1 : count}`;
      // Kaufbare Fähigkeiten als SLOT-REIHE (Goal: kein Riesen-Button — gekaufte
      // Tiers mit Haken, der nächste verfügbare leuchtet klickbar, kommende zeigen
      // ihr Level). v11: ungerade Tiers = +100 % Output, gerade Tiers = das
      // Themen-Special des Mitglieds — Icon, Label und Farbton folgen der Art.
      // `ab` ist null, sobald dieses Mitglied ALLE seine Fähigkeiten gekauft hat
      // (die Grenze ist mitgliedsabhängig, 4…8). Die Zeile bleibt trotzdem
      // stehen — sie zeigt dann die gekauften Kacheln und die Schluss-Plakette.
      // Sie an `ab` zu hängen hätte bei einem fertigen Mitglied die komplette
      // Fähigkeits-Zeile verschwinden lassen, gekaufte Kacheln inklusive.
      const ab = level > 0 ? nextAbility(cfg, level, ups) : null;
      let abRow = '';
      if (level > 0) {
        const CHECK =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const slots: string[] = [];
        for (let t = 1; t <= ups; t++) {
          const k = abilityKind(cfg, t, s.crewRetrain);
          // 3b: Jeder GEKAUFTE Spezial-Slot trägt den Umschul-Knopf (Werkzeug-Icon
          // in der Stroke-Sprache) — Power-Slots nicht, deren Sorte ist der
          // Rhythmus selbst und rollt nie.
          const slot = retrainSlotOrdinal(cfg, t);
          const rt =
            slot > 0
              ? `<button class="ab-rt" data-rt="${cfg.id}" data-rt-tier="${t}" type="button"
                   title="Fähigkeit ${t} umschulen (${fmt(retrainCost(slot, retrainRollCount(s.retrainRolls, cfg.id)))} 🧩)"
                   aria-label="Fähigkeit ${t} von ${cfg.name} umschulen">${TOOL_ICON}</button>`
              : '';
          // 4b: auch die gekauften Kacheln zeigen WER und WAS — der Haken oben
          // rechts bleibt das „gekauft"-Signal.
          slots.push(
            `<span class="ab done ${tierClass(t)}" title="Fähigkeit ${t}: ${abilityKindLabel(k, outLabel)} — gekauft">` +
              `${slotArt(cfg.id, k, KIND_ICON[k])}<span class="ab-lv">${t}</span>` +
              `<span class="ab-check">${CHECK}</span>${rt}</span>`,
          );
        }
        if (ab) {
          const k = abilityKind(cfg, ab.tier, s.crewRetrain);
          const abLabel = abilityKindLabel(k, outLabel);
          if (ab.unlocked) {
            const can = ab.cost <= s.gold;
            slots.push(
              `<button class="ab ready k-${k} ${tierClass(ab.tier)} ${can ? '' : 'poor'}" data-ab="${cfg.id}" type="button"
               title="Fähigkeit ${ab.tier}: ${abLabel} kaufen">${slotArt(cfg.id, k, KIND_ICON[k])}` +
                `<span class="ab-lv">${ab.tier}</span></button>`,
            );
            slots.push(
              `<span class="ab-cost ${can ? '' : 'bad'}">${abLabel} · ${fmt(ab.cost)} BP</span>`,
            );
          } else {
            slots.push(
              `<span class="ab lk ${tierClass(ab.tier)}" title="Fähigkeit ${ab.tier} (${abLabel}) ab Lv ${ab.level}">` +
                `<span class="ab-lv">${ab.tier}</span>Lv${ab.level}</span>`,
            );
          }
        }
        // Der Zähler VOR den Kacheln beantwortet die Frage, die die Kacheln
        // allein nicht beantworten: „Wie weit bin ich?" — gekaufte Stufen und
        // die Entfernung zur nächsten Freischaltung.
        // GEKAUFT von FREIGESCHALTET trennen: Bei Lv 130 sind drei Stufen offen,
        // gekauft sein können null davon — „Fähigkeiten 0" allein hätte genau
        // diesen Unterschied verschluckt. Der Zusatz zeigt, was als Nächstes
        // dran ist: offene Käufe zuerst, sonst die Entfernung zur nächsten
        // Freischaltung.
        const unlocked = abilityTiersUnlocked(cfg, level);
        const open = Math.max(0, unlocked - ups);
        const cap = maxAbilityTiers(cfg);
        // Drei Zustände, drei Sätze. „Nächste in X Lv" wäre bei einem fertigen
        // Mitglied gelogen — es gibt keine nächste, und der Zähler steht am
        // Anschlag seiner eigenen Grenze (4…8, nicht für alle gleich).
        const done = ups >= cap;
        const toNext = done ? 0 : levelsToNextAbility(cfg, level);
        const tail = done
          ? `<i>komplett</i>`
          : open > 0
            ? `<i>${open} kaufbar</i>`
            : `<i>nächste in ${toNext} Lv</i>`;
        const head =
          `<span class="ab-head${open > 0 ? '' : ' calm'}" title="Gekaufte von freigeschalteten Fähigkeiten — ${cfg.name} lernt ${cap}">` +
          `Fähigkeiten ${ups}/${cap}` +
          tail +
          `</span>`;
        abRow = `<div class="ab-slots">${head}${slots.join('')}</div>`;
      }
      rows.push(
        `<div class="item ${affordable ? '' : 'locked'}" data-id="${cfg.id}">
          <div class="crew-head">
            ${portraitTile(
              cfg.id,
              'base',
              `av-lg${mp.rank > 0 ? ` mr mr${mp.rank}` : ''}`,
              mp.rank > 0 ? MASTERY_FRAME[mp.rank] : undefined,
            )}
            <div class="crew-id">
              <div class="nm" title="${cfg.ds}">${cfg.name}${gildBadge}<span class="lv">Lv ${level}${ups > 0 ? ` · ×${abilityMult(cfg, ups)}` : ''}</span></div>
              ${
                // Entrümpelung: Der Flavor-Text hilft bei der EINEN Entscheidung
                // „anheuern oder nicht". Danach kostet er auf jeder Karte eine
                // Zeile, ohne je wieder gelesen zu werden — ab Level 1 wandert
                // er in den Tooltip des Namens.
                level === 0 ? `<div class="ds">${cfg.ds}</div>` : ''
              }
              ${milestoneLine(level)}
              ${masteryLine(mp)}
            </div>
          </div>
          <div class="crew-foot">
            <span class="cost ${affordable ? '' : 'bad'}">${label} · ${fmt(cost)} BP</span>
            <span class="dps">${level > 0 ? `${fmt(out)} ${outLabel}` : '—'}</span>
          </div>
          ${abRow}
        </div>`,
      );
    });
    // Klicks laufen delegiert über den Container (Konstruktor) — hier wird nur
    // noch HTML geschrieben, und auch das nur bei echter Änderung.
    const html = rows.join('');
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      list.innerHTML = html;
    }
  }
}
