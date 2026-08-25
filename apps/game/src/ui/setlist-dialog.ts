/**
 * Der Setlist-Dialog — die Wahl, die den kommenden Lauf regiert (L2-Verb).
 *
 * Er öffnet sich nach jeder Aszension, sobald der Spieler mindestens einmal
 * himmelgefahren ist, und zeigt drei Karten aus {@link setlistOffer}. Erst die
 * Wahl schließt ihn: Es gibt bewusst kein „Abbrechen" und kein Wegklicken am
 * Rand — eine Karte gehört zu jedem Lauf, und ein leerer Lauf wäre schlicht der
 * alte Zustand, den dieses System gerade beseitigt.
 *
 * Der Dialog hält KEINEN eigenen Zustand über die Wahl hinaus: Was gilt, steht
 * im Spielstand (`state.setlist`), und das Angebot folgt aus dessen Seed. Wer
 * die App mit offenem Dialog schließt, findet dieselben drei Karten vor.
 */
import type { ChState } from '../game/ch-state';
import { type SetlistCard, setlistOffer } from '../game/setlist';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

/**
 * Das Motiv einer Karte. Bewusst dieselbe Stroke-Sprache wie die Tab-Ikonen und
 * die Fähigkeits-Icons — eine Karte ist keine fremde Insel im Spiel.
 */
const CARD_ART: Record<SetlistCard['art'], string> = {
  // Crew: drei Köpfe nebeneinander — die Mannschaft legt auf.
  crew: '<circle cx="7" cy="9" r="3.2"/><circle cx="17" cy="9" r="3.2"/><circle cx="12" cy="14.6" r="3.6"/>',
  // Boss: die Krone auf der Arena.
  boss: '<path d="M4.4 16.6 3 7l5 3.4L12 4l4 6.4L21 7l-1.4 9.6Z"/><path d="M4.4 19.8h15.2"/>',
  // Sprint: der Doppelpfeil — kurze Bühne.
  sprint: '<path d="M3 12h11M9.6 7 14.6 12l-5 5"/><path d="M18 6.4v11.2"/>',
  // Zugabe: die Hand, die klatscht.
  encore:
    '<path d="M8.4 20V9.6a1.6 1.6 0 0 1 3.2 0V4.8a1.6 1.6 0 0 1 3.2 0v5.2l2.6 1.4a3 3 0 0 1 1.4 3.4L18 20Z"/>',
  // Stromausfall: der durchgestrichene Blitz.
  dark: '<path d="M13.4 3 7 12.4h4.2L10.2 21l6.4-9.4h-4.4Z"/><path d="M3.6 3.6 20.4 20.4"/>',
  // Kollekte: der Münzstapel.
  coin: '<ellipse cx="12" cy="6.6" rx="7.6" ry="3"/><path d="M4.4 6.6v10.8c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3V6.6"/><path d="M4.4 12c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3"/>',
};

export interface SetlistDeps {
  state: ChState;
  /** Nach der Wahl: persistieren und die abgeleiteten Zahlen neu rechnen. */
  onChoose: () => void;
}

export class SetlistDialog {
  private readonly overlay = byId('setlistOverlay');
  private offer: readonly SetlistCard[] = [];

  constructor(private readonly deps: SetlistDeps) {
    byId('slCards').addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('.sl-card');
      const id = el?.dataset.card;
      if (id) this.choose(id);
    });
  }

  /** Ist der Dialog offen? */
  get open(): boolean {
    return !this.overlay.classList.contains('hidden');
  }

  /**
   * Öffnen — falls überhaupt fällig.
   *
   * Fällig ist er genau dann, wenn die Stufe freigeschaltet ist (mindestens eine
   * Himmelfahrt) und für diesen Lauf noch keine Karte steht. Beides zu prüfen
   * ist wichtig: Ohne das erste würde der Dialog Spieler behelligen, die das
   * System noch gar nicht kennen; ohne das zweite ginge er nach jedem Reload
   * wieder auf.
   */
  maybeShow(): void {
    const s = this.deps.state;
    if (s.heaven.ascensions2 < 1) return; // Stufe noch nicht erreicht
    if (s.setlist.card) return; // für diesen Lauf schon gewählt
    if (s.setlist.seed <= 0) return; // kein Angebot gezogen (Alt-Save mitten im Lauf)
    this.offer = setlistOffer(s.setlist.seed);
    this.render();
    this.overlay.classList.remove('hidden');
  }

  /** Schließen, ohne etwas zu ändern (nur für Prestige-Wechsel/Import). */
  close(): void {
    this.overlay.classList.add('hidden');
  }

  private choose(id: string): void {
    if (!this.offer.some((c) => c.id === id)) return; // nie etwas außerhalb des Angebots
    this.deps.state.setlist = { ...this.deps.state.setlist, card: id };
    this.close();
    this.deps.onChoose();
  }

  private render(): void {
    byId('slLead').textContent =
      'Eine Karte regiert den kommenden Lauf. Jede gibt etwas und nimmt etwas — die Wahl ist der Reiz.';
    byId('slCards').innerHTML = this.offer
      .map(
        (c) =>
          `<button class="sl-card" data-card="${c.id}" type="button">` +
          `<svg class="sl-art" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" ` +
          `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${CARD_ART[c.art]}</g></svg>` +
          `<span class="sl-name">${c.name}</span>` +
          `<span class="sl-text">${c.text}</span>` +
          `</button>`,
      )
      .join('');
    byId('slMsg').textContent = '';
  }
}
