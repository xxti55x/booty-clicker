/**
 * Der Schmiede-Dialog (IDEEN-GAMEPLAY 3a) — Geschwister des Umschul-Dialogs (3b),
 * mit denselben zwei Phasen und derselben Anti-Frust-Disziplin:
 *
 *  1. **Vorschau** — welcher Skin, welcher Slot, was steckt drin, was kostet ein
 *     Roll (mit oder ohne Affix-Lock) und wie weit die Qualitäts-Garantie noch
 *     weg ist. Nichts ist bezahlt, nichts gewürfelt; „Abbrechen" kostet nichts.
 *  2. **Angebot** — erst der Druck auf „Für X 🔥 schmieden" bucht die Glut ab
 *     UND zieht danach (`payForgeRoll`). Der Slot bleibt dabei unangetastet:
 *     Der Spieler sieht Alt und Neu nebeneinander und entscheidet. Bezahlt wurde
 *     der ROLL, nicht das Ergebnis — „Behalten" ist deshalb immer erlaubt und
 *     macht den Kauf nie schlechter als vorher.
 *
 * Die Ziehung sitzt bewusst HINTER der Bezahlung (die 3b-Lektion): Würde der
 * Dialog schon beim Aufklappen würfeln, könnte man das Angebot gratis ansehen,
 * schließen und neu würfeln — Save-Scumming ohne Save.
 *
 * Der Lock ist ein Schalter in Phase 1 und verschwindet in Phase 2 — nach dem
 * Wurf gibt es nichts mehr zu locken, und ein Schalter, der nichts tut, ist eine
 * Lüge. Er ist zudem nur anklickbar, wenn der Slot überhaupt etwas trägt.
 */
import type { ChState } from '../game/ch-state';
import { SKINS } from '../character/skins';
import type { SkinKey } from '../types';
import {
  type RolledAffix,
  affixConfig,
  affixValue,
  minQualityForDry,
  qualityConfig,
} from '../game/affixes';
import {
  acceptForgeRoll,
  forgeCost,
  forgeSlotsOf,
  emberHeld,
  payForgeRoll,
  rollsToNextPity,
} from '../game/forge';
import { skinLevel } from '../game/gear';
import { affixText } from './affix-text';
import { fmtInt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface ForgeDeps {
  state: ChState;
  /**
   * EIN Float aus dem persistierten Spiel-Strom (`rng.next()`) — dieselbe
   * Quelle wie Krits, Truhen und Vergoldungen, also ist auch dieser Wurf
   * save-scum-fest.
   */
  roll: () => number;
  /** Nach jeder Zustandsänderung: neu rechnen, HUD/Karten auffrischen, persistieren. */
  onChange: () => void;
  /** Der Toast-Kanal (ein Schmiede-Ergebnis ist ein Moment, kein stiller Zahlenwechsel). */
  toast: (icon: string, title: string, sub: string) => void;
}

/** Eine Affix-Karte im Dialog (groß, mit Qualitäts-Band). */
function card(a: RolledAffix | null, cls: string): string {
  if (!a) {
    return `<span class="fg-card ${cls} none"><span class="fg-g">·</span>
      <span class="fg-ct"><b>Leerer Slot</b><span class="fg-eff">noch nichts geschmiedet</span></span></span>`;
  }
  const cfg = affixConfig(a.id);
  if (!cfg) return '';
  const q = qualityConfig(a.q);
  return `<span class="fg-card ${cls} q${a.q}"><span class="fg-g">${cfg.glyph}</span>
    <span class="fg-ct"><b>${cfg.name}</b>
    <span class="fg-eff">${affixText(cfg.stat, affixValue(a))}</span>
    <span class="fg-q">${q.mark} ${q.name}</span></span></span>`;
}

export class ForgeDialog {
  private readonly overlay = byId('forgeOverlay');
  /** Der gerade bearbeitete Skin (null = Dialog zu). */
  private skin: SkinKey | null = null;
  private slot = 0;
  /** Der Affix-Lock für den NÄCHSTEN Roll (nur Phase 1 änderbar). */
  private locked = false;
  /** Das bezahlte Angebot (null = Phase 1, noch nichts gerollt). */
  private offer: RolledAffix | null = null;

  constructor(private readonly deps: ForgeDeps) {
    byId('fgRoll').addEventListener('click', () => this.pay());
    byId('fgTake').addEventListener('click', () => this.take());
    byId('fgKeep').addEventListener('click', () => this.keep());
    byId('fgClose').addEventListener('click', () => this.close());
    byId('fgLock').addEventListener('click', () => this.toggleLock());
    // Klick auf den abgedunkelten Rand schließt — aber nur in Phase 1, damit ein
    // BEZAHLTES Angebot nicht aus Versehen weggeklickt wird.
    this.overlay.addEventListener('click', (ev) => {
      if (ev.target === this.overlay && this.offer === null) this.close();
    });
  }

  /** Ist der Dialog offen? */
  get open(): boolean {
    return this.skin !== null;
  }

  /** Den Dialog für `slot` von `skin` öffnen (Phase 1, nichts bezahlt). */
  show(skin: SkinKey, slot: number): void {
    this.skin = skin;
    this.slot = slot;
    this.offer = null;
    this.locked = false;
    this.render();
    this.overlay.classList.remove('hidden');
  }

  close(): void {
    this.overlay.classList.add('hidden');
    this.skin = null;
    this.offer = null;
  }

  /** Das aktuell im Slot steckende Affix. */
  private current(): RolledAffix | null {
    if (!this.skin) return null;
    return forgeSlotsOf(this.deps.state.forge, this.skin)[this.slot].affix;
  }

  private dry(): number {
    if (!this.skin) return 0;
    return forgeSlotsOf(this.deps.state.forge, this.skin)[this.slot].dry;
  }

  private cost(): number {
    return forgeCost(this.slot, this.locked && this.current() !== null);
  }

  private toggleLock(): void {
    if (this.offer !== null || this.current() === null) return;
    this.locked = !this.locked;
    this.render();
  }

  /** Phase 1 → 2: bezahlen, Pity fortschreiben, EINEN Roll ziehen. */
  private pay(): void {
    const skin = this.skin;
    if (!skin || this.offer !== null) return;
    const s = this.deps.state;
    const res = payForgeRoll(s.forge, skin, this.slot, this.locked && this.current() !== null, {
      next: this.deps.roll,
    });
    if (!res) return;
    s.forge = res.forge;
    this.offer = res.offer;
    this.deps.onChange(); // Glut + Pity sind gewandert: sofort sichern
    this.render();
  }

  /** Das Angebot annehmen — ab jetzt trägt der Slot es. */
  private take(): void {
    const skin = this.skin;
    const offer = this.offer;
    if (!skin || !offer) return;
    const s = this.deps.state;
    s.forge = acceptForgeRoll(s.forge, skin, this.slot, offer);
    this.deps.onChange();
    const cfg = affixConfig(offer.id);
    this.deps.toast(
      '🔥',
      'Geschmiedet!',
      `${SKINS[skin].name} · Slot ${this.slot + 1}: ${cfg?.name ?? ''} (${qualityConfig(offer.q).name})`,
    );
    this.close();
  }

  /** Das Angebot ausschlagen — das Alte bleibt, der Roll war trotzdem bezahlt. */
  private keep(): void {
    const cur = this.current();
    this.deps.toast(
      '🔥',
      'Beim Alten geblieben',
      cur
        ? `${affixConfig(cur.id)?.name ?? ''} bleibt im Slot.`
        : 'Der Slot bleibt leer — der Wurf war es nicht wert.',
    );
    this.close();
  }

  private render(): void {
    const skin = this.skin;
    if (!skin) return;
    const s = this.deps.state;
    const cfg = SKINS[skin];
    (byId('fgAvatar') as HTMLImageElement).src = `./avatars/skin-${skin}.jpg`;
    byId('fgName').textContent = cfg.name;
    byId('fgSlot').textContent =
      `Schmiede-Slot ${this.slot + 1} · Skin-Level ${skinLevel(s.gear, skin)}`;
    byId('fgNow').innerHTML = `<span class="fg-k">Aktuell</span>${card(this.current(), 'now')}`;

    const offerEl = byId('fgOffer');
    const lock = byId('fgLock') as HTMLButtonElement;
    const roll = byId('fgRoll') as HTMLButtonElement;
    const take = byId('fgTake') as HTMLButtonElement;
    const keep = byId('fgKeep') as HTMLButtonElement;
    const close = byId('fgClose') as HTMLButtonElement;
    const msg = byId('fgMsg');
    const pity = byId('fgPity');

    // Das Qualitäts-Pity ist IMMER sichtbar — niemand soll raten müssen.
    const minQ = minQualityForDry(this.dry());
    const left = rollsToNextPity(this.dry());
    pity.textContent =
      `Mindest-Qualität: ${qualityConfig(minQ).name}` +
      (left === null
        ? ' — „Makellos" ist ab jetzt garantiert.'
        : ` · ${this.dry()} Roll(s) ohne Verbesserung, noch ${left} bis zur nächsten Stufe.`);

    if (this.offer === null) {
      // ---- Phase 1: Vorschau ----
      const cost = this.cost();
      const held = emberHeld(s.forge);
      const can = held >= cost;
      offerEl.classList.add('hidden');
      offerEl.innerHTML = '';
      lock.classList.remove('hidden');
      lock.disabled = this.current() === null;
      lock.className = `fg-lock ${this.locked ? 'on' : ''}`;
      lock.textContent = this.current()
        ? `${this.locked ? '🔒' : '🔓'} Sorte festhalten (×3 Kosten)`
        : '🔓 Nichts zu halten — der Slot ist leer';
      roll.classList.remove('hidden');
      roll.disabled = !can;
      roll.textContent = `Für ${fmtInt(cost)} 🔥 schmieden`;
      take.classList.add('hidden');
      keep.classList.add('hidden');
      close.classList.remove('hidden');
      close.textContent = 'Abbrechen';
      msg.className = `msg ${can ? '' : 'bad'}`;
      msg.textContent = can
        ? `Du hast ${fmtInt(held)} 🔥 · gewürfelt wird erst nach der Bezahlung, das Ergebnis ist danach deine Wahl.`
        : `Du hast nur ${fmtInt(held)} 🔥 — es fehlen ${fmtInt(cost - held)}.`;
      return;
    }

    // ---- Phase 2: das bezahlte Angebot ----
    offerEl.classList.remove('hidden');
    offerEl.innerHTML = `<span class="fg-k">Angebot</span>${card(this.offer, 'offer')}`;
    lock.classList.add('hidden');
    roll.classList.add('hidden');
    take.classList.remove('hidden');
    take.textContent = 'Übernehmen';
    keep.classList.remove('hidden');
    keep.textContent = this.current() ? 'Altes behalten' : 'Verwerfen';
    close.classList.add('hidden');
    msg.className = 'msg ok';
    msg.textContent = 'Bezahlt — übernimm den Wurf oder lass ihn liegen.';
  }
}
