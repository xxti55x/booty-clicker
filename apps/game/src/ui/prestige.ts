import {
  ASCEND_MIN_ZONE,
  canAscend,
  fameBreadth,
  nextSoulZone,
  pendingSouls,
} from '../game/ascension';
import { type ChState, breadthOf } from '../game/ch-state';
import { soulBonusEff } from '../game/heaven';
import { emptyState } from './empty';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

const ARM_MS = 4000;

export interface PrestigeDeps {
  state: ChState;
  /** Deepest zone this run (combat frontier). */
  getRunMaxZone: () => number;
  /** Perform the ascension (bank souls, reset run). */
  onAscend: () => void;
}

/** The Ruhm (ascension) tab: bank Ruhm-Seelen for a permanent damage bonus. */
export class Prestige {
  private readonly body = byId('tabPr');
  private armed = false;
  private armTimer: ReturnType<typeof window.setTimeout> | null = null;

  constructor(private readonly deps: PrestigeDeps) {
    this.body.innerHTML = `
      <div class="settings-section">
        <h3>Ruhm-Seelen ✨</h3>
        <div class="rebirth-info" id="prInfo"></div>
        <button class="btn danger" id="ascendBtn" type="button">Ruhm einheimsen</button>
      </div>
      <div class="settings-section">
        <h3>Gebietsherrschaft 🏆</h3>
        <!-- IDEEN-GAMEPLAY 1b: Die vier Ruf-Leisten (ui/territory-panel.ts)
             montieren sich hier hinein — direkt UNTER den Knopf, der die ganze
             Tour einkassiert: Was der Reset nimmt, steht oben; was er nie
             anfassen kann, darunter. Der Ruhm-Tab ist zugleich der kürzeste des
             Spiels (headless bei 390 px gemessen: 901 px inkl. der Leisten gegen
             2 665 px im Ziele-Tab), die vier Leisten fallen hier also nicht
             hinter zwei Bildschirmhöhen. -->
        <div id="prTerritory"></div>
      </div>
      <div class="settings-section">
        <h3>Statistik</h3>
        <div class="stat-grid" id="prStats"></div>
      </div>`;

    const btn = byId('ascendBtn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      const { state } = this.deps;
      if (
        !canAscend(
          this.deps.getRunMaxZone(),
          state.lifetimeMaxZone,
          state.rsLifetime,
          breadthOf(state),
        )
      )
        return;
      if (!this.armed) {
        this.armed = true;
        btn.classList.add('armed');
        btn.textContent = 'Sicher? Lauf wird zurückgesetzt';
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
      this.deps.onAscend();
      this.refresh();
    });

    this.refresh();
  }

  refresh(): void {
    const { state } = this.deps;
    const runMax = this.deps.getRunMaxZone();
    const pending = pendingSouls(runMax, state.lifetimeMaxZone, state.rsLifetime, breadthOf(state));
    const bonus = soulBonusEff(state.heaven.hpf); // HPF-amplified per-soul bonus
    // Der Bonus zählt seit dem Sparanreiz-Umbau den VERDIENST, nicht den Rest
    // im Beutel — die Anzeige muss dieselbe Zahl nennen wie die Rechnung.
    const verdient = Math.max(state.rsLifetime, state.souls);
    const bonusNow = Math.round(verdient * bonus * 100);
    const bonusAfter = Math.round((verdient + pending) * bonus * 100);
    // Die Breite ist eine unsichtbare Regel, solange man sie nicht sieht.
    const breite = fameBreadth(breadthOf(state));

    // ROADMAP-V2 G6: Solange nie aszendiert wurde, trägt der Tab nur Nullen —
    // und genau dann sieht man ihn zum ERSTEN Mal (er erscheint, sobald sich
    // eine Aszension lohnt). Ein Satz sagt, worum es hier überhaupt geht; die
    // Statistik darunter bleibt unverändert stehen.
    const fresh = state.souls <= 0 && state.rsLifetime <= 0;
    const empty = fresh
      ? emptyState(
          'fame',
          `Ab Bühne ${ASCEND_MIN_ZONE} tauscht eine Aszension die ganze Tour gegen Ruhm-Seelen — sie machen jeden neuen Anlauf dauerhaft stärker.`,
        )
      : '';

    byId('prInfo').innerHTML =
      empty +
      `Verdient <b>${fmt(verdient)}</b> Seelen (+${bonusNow}% Schaden) · ` +
      `<b>${fmt(state.souls)}</b> frei für Ahnen.<br>` +
      `Beim Neustart deiner Tournee gibt es <b>+${fmt(pending)}</b> Seelen ` +
      `(→ +${bonusAfter}% dauerhaft). Deine Crew, Bühne & BP werden zurückgesetzt; Ahnen bleiben.<br>` +
      `<span class="dim">Ruhm zählt nicht nur die Tiefe: Meisterschaft, Ruf und Truhen bringen gerade ` +
      `<b>×${breite.toFixed(2)}</b>${breite >= 1.99 ? ' (Maximum)' : ''}.</span><br>` +
      // Vor der ersten Aszension ist die Bühnen-Schwelle die einzige Frage, die
      // dieser Tab beantworten muss — derselbe Balken wie beim Transzendenz-Gate.
      (runMax < ASCEND_MIN_ZONE
        ? `<span class="gate-bar" role="img" aria-label="${Math.round((runMax / ASCEND_MIN_ZONE) * 100)} % bis zur ersten Aszension">` +
          `<i style="width:${Math.min(100, Math.round((runMax / ASCEND_MIN_ZONE) * 100))}%"></i>` +
          `<b>Bühne ${fmt(runMax)} / ${ASCEND_MIN_ZONE}</b></span>`
        : '') +
      `<span class="dim">Ruhm gibt es ab Bühne ${ASCEND_MIN_ZONE}, skaliert mit deiner tiefsten Bühne.</span>`;

    if (!this.armed) {
      const btn = byId('ascendBtn') as HTMLButtonElement;
      const ok = canAscend(runMax, state.lifetimeMaxZone, state.rsLifetime, breadthOf(state));
      btn.disabled = !ok;
      // M-08: Der gesperrte Zustand nennt den WEG statt nur das Nein — vor
      // Bühne 10 die Schwelle samt eigenem Stand, danach (PLAYTEST G-04) die
      // KONKRETE Zielbühne, ab der wieder neue Seelen fließen.
      btn.textContent = ok
        ? `Ruhm einheimsen (+${fmt(pending)} ✨)`
        : runMax < ASCEND_MIN_ZONE
          ? `Ruhm ab Bühne ${ASCEND_MIN_ZONE} — du: Bühne ${fmt(runMax)}`
          : `Noch kein neuer Ruhm — neue Seelen ab Bühne ${fmt(
              nextSoulZone(Math.max(runMax, state.lifetimeMaxZone), state.rsLifetime),
            )}`;
    }

    byId('prStats').innerHTML = [
      ['Aktuelle Bühne', fmt(runMax)],
      ['Tiefste Bühne', fmt(Math.max(state.lifetimeMaxZone, runMax))],
      ['Gehaltene Seelen', fmt(state.souls)],
      ['RS Lebenszeit', fmt(state.rsLifetime)],
      ['Himmelspfirsiche', fmt(state.heaven.hpf)],
      ['Shakes gesamt', fmt(state.totalClicks)],
    ]
      .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`)
      .join('');
  }
}
