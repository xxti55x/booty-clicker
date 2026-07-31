/**
 * **Der Erben-Dialog** (IDEEN-GAMEPLAY 3c) — die Transzendenz-Zeremonie fragt
 * zuerst, wen man mitnimmt.
 *
 * Bis hierher war die Transzendenz ein Knopf mit Sicherheitsabfrage: Alles
 * fällt, TE kommt, weiter. Der Erbe macht daraus eine **Charakter-Entscheidung**
 * — genau eines der fünfzehn Crew-Mitglieder nimmt seine Meisterschafts-Ränge
 * doppelt gewichtet in die neue Ära mit (`heroes.heirWeightFor`).
 *
 * **Warum ein eigener Dialog und nicht die G4-Blende.** Die Blende
 * (`ui/ceremony.ts`) ist per Vertrag REIN OPTISCH: Wenn sie läuft, ist längst
 * alles gebucht, und jeder Tap darf sie abbrechen. Eine Wahl darin wäre eine
 * Entscheidung, die man wegklicken kann. Der Erbe wird deshalb DAVOR gewählt —
 * der Dialog ist der letzte Schritt vor dem Reset, die Blende feiert danach.
 *
 * **Warum Portraits.** Die Wahl ist die einzige Stelle im Spiel, an der 15
 * Mitglieder als PERSONEN nebeneinanderstehen und nicht als Kauf-Zeilen. Der
 * 4a-Baukasten (`ui/avatars.ts`) liefert sie in derselben Stroke-Sprache wie
 * die Crew-Card, mit dem Meisterschafts-Rahmen (1a) — man sieht auf einen
 * Blick, wer den Rang hat, der sich zu verdoppeln lohnt.
 *
 * **„Kein Erbe" ist eine gültige Antwort** und steht als eigene Kachel drin,
 * nicht nur als Abbrechen-Knopf: Wer noch keinen Rang hat, soll nicht das
 * Gefühl bekommen, etwas falsch zu machen. Abbrechen bricht dagegen die ganze
 * Transzendenz ab — der Dialog liegt VOR der Gutschrift, es ist also nichts
 * passiert.
 */
import type { ChState } from '../game/ch-state';
import { CREW } from '../game/heroes';
import {
  HEIR_WEIGHT,
  MASTERY_DPS_PER_RANK,
  MASTERY_DPS_RANKS,
  masteryProgress,
} from '../game/mastery';
import { portraitTile } from './avatars';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface HeirDeps {
  state: ChState;
}

/** Was die Verdopplung diesem Rang bringt, in Prozentpunkten Eigen-Output. */
function heirGainPct(rank: number): number {
  const base = MASTERY_DPS_PER_RANK * Math.min(MASTERY_DPS_RANKS, rank);
  return Math.round(base * (HEIR_WEIGHT - 1) * 100);
}

export class HeirDialog {
  private readonly overlay = byId('heirOverlay');
  /** Der Rückruf der laufenden Zeremonie (null = Dialog zu). */
  private done: ((heir: string) => void) | null = null;
  /** Die aktuell markierte Wahl ('' = kein Erbe). */
  private picked = '';

  constructor(private readonly deps: HeirDeps) {
    byId('heirConfirm').addEventListener('click', () => this.confirm());
    byId('heirCancel').addEventListener('click', () => this.close());
    byId('heirList').addEventListener('click', (ev) => {
      const card = (ev.target as HTMLElement).closest<HTMLElement>('.heir-card');
      if (!card) return;
      this.picked = card.dataset.id ?? '';
      this.render();
    });
    // Der abgedunkelte Rand schließt NICHT: Ein versehentlicher Rand-Klick
    // dürfte hier nicht zwischen „abbrechen" und „ohne Erben transzendieren"
    // stehen — beides sind echte Entscheidungen und brauchen ihren Knopf.
  }

  /** Ist der Dialog offen? (Der Headless-Beweis liest das.) */
  get open(): boolean {
    return this.done !== null;
  }

  /**
   * Öffnen. `then` bekommt die gewählte Crew-Id (oder `''` für „kein Erbe") und
   * führt die Transzendenz aus; Abbrechen ruft sie nie.
   */
  show(then: (heir: string) => void): void {
    this.done = then;
    // Vorschlag: das Mitglied mit den meisten Einsatz-XP — dieselbe Heuristik,
    // die der Sim-Bot fährt. Vorgeschlagen, nicht gesetzt: Ein Klick auf „Kein
    // Erbe" bleibt einen Klick weit weg.
    this.picked = this.bestId();
    this.render();
    this.overlay.classList.remove('hidden');
  }

  /** Schließen ohne zu transzendieren (die Zeremonie fällt aus). */
  close(): void {
    this.overlay.classList.add('hidden');
    this.done = null;
  }

  private confirm(): void {
    const then = this.done;
    if (!then) return;
    const heir = this.picked;
    this.close();
    then(heir);
  }

  /** Die Id mit den meisten Einsatz-XP ('' wenn niemand welche hat). */
  private bestId(): string {
    let id = '';
    let best = 0;
    for (const cfg of CREW) {
      const xp = this.deps.state.crewMastery[cfg.id] ?? 0;
      if (xp > best) {
        best = xp;
        id = cfg.id;
      }
    }
    return id;
  }

  private card(id: string): string {
    const cfg = CREW.find((c) => c.id === id);
    if (!cfg) return '';
    const p = masteryProgress(this.deps.state.crewMastery[id] ?? 0);
    const on = this.picked === id;
    const gain = heirGainPct(p.rank);
    const foot =
      p.rank > 0
        ? `<span class="heir-gain">${p.name} → +${gain} pp</span>`
        : `<span class="heir-gain dim">noch kein Rang</span>`;
    return (
      `<button class="heir-card${on ? ' on' : ''}" data-id="${id}" type="button">` +
      `${portraitTile(id, 'base', `av-lg mr${p.rank}`)}` +
      `<span class="heir-nm">${cfg.name}</span>` +
      `<span class="heir-xp">${fmt(p.xp)} XP</span>${foot}</button>`
    );
  }

  private render(): void {
    const none =
      `<button class="heir-card none${this.picked === '' ? ' on' : ''}" data-id="" type="button">` +
      `<span class="heir-x">∅</span><span class="heir-nm">Kein Erbe</span>` +
      `<span class="heir-xp">diese Ära ohne</span><span class="heir-gain dim">±0 pp</span></button>`;
    byId('heirList').innerHTML = none + CREW.map((c) => this.card(c.id)).join('');

    const cfg = CREW.find((c) => c.id === this.picked);
    const p = masteryProgress(this.deps.state.crewMastery[this.picked] ?? 0);
    byId('heirMsg').innerHTML = cfg
      ? `<b>${cfg.name}</b> nimmt seine Meisterschaft <b>doppelt gewichtet</b> in die neue Ära: ` +
        `${p.rank > 0 ? `${p.name}-Rang, +${heirGainPct(p.rank)} Prozentpunkte Eigen-Output` : 'noch ohne Rang — die Verdopplung greift, sobald Bronze fällt'}. ` +
        `<span class="dim">Ein Erbe je Ära; beim nächsten Transzendieren wählst du neu.</span>`
      : `Diese Ära ohne Erben. <span class="dim">Die Meisterschafts-Ränge bleiben trotzdem alle erhalten — sie zählen nur einfach.</span>`;
    (byId('heirConfirm') as HTMLButtonElement).textContent = cfg
      ? `Mit ${cfg.name} transzendieren 🔮`
      : 'Ohne Erben transzendieren 🔮';
  }
}
