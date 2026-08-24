/**
 * Der Umschul-Dialog (IDEEN-GAMEPLAY 3b) — „der Charakter, an dem geschmiedet
 * wird, IST die Szene" (Feld 4 des Ideen-Dokuments).
 *
 * Zwei Phasen, bewusst getrennt:
 *
 *  1. **Vorschau** — großes Portrait, wer und welche Stufe, die AKTUELLE Sorte
 *     und der Preis. Nichts ist bezahlt; „Abbrechen" kostet nichts.
 *  2. **Auswahl** — der Druck auf „Sorten zeigen" listet ALLE Sorten des Pools
 *     außer der aktuellen. Der Spieler nimmt eine davon (dann wird bezahlt)
 *     oder behält die alte (kostenlos).
 *
 * **Kein Würfel mehr.** Früher zog dieser Schritt zwei Zufalls-Sorten aus acht
 * und buchte dabei ab: Wer eine bestimmte Fähigkeit wollte, musste so lange
 * zahlen, bis der Zufall sie anbot — bei einer Leiter, die pro Slot verdoppelt,
 * die teuerste Art von Glücksspiel. Jetzt ist die Sorte eine ENTSCHEIDUNG; der
 * Preis der Slot-Leiter bleibt die einzige Bremse. Damit entfällt auch der
 * Grund, die Ziehung hinter die Bezahlung zu legen — Save-Scumming braucht
 * einen Zufall, den es hier nicht mehr gibt.
 */
import type { ChState } from '../game/ch-state';
import {
  type AbilityKind,
  type HeroConfig,
  type SpecialKind,
  abilityKind,
  abilityKindLabel,
  abilityKindName,
  retrainSlotOrdinal,
} from '../game/heroes';
import {
  applyRetrain,
  noteRetrainRoll,
  retrainCost,
  retrainRollCount,
  retrainChoices,
} from '../game/retrain';
import { fmt } from './format';
import { portraitTile } from './avatars';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

export interface RetrainDeps {
  state: ChState;
  /** Nach jeder Zustandsänderung: neu rechnen, HUD/Card auffrischen, persistieren. */
  onChange: () => void;
  /** Der Toast-Kanal (Umschulung ist ein Moment, kein stiller Zahlenwechsel). */
  toast: (icon: string, title: string, sub: string) => void;
}

/** Das kleine Sorten-Icon einer Angebots-Karte (dieselbe Sprache wie die Slots). */
const KIND_GLYPH: Record<SpecialKind, string> = {
  gold: '◎',
  crit: '⚡',
  critdmg: '✸',
  boss: '♛',
  combo: '∞',
  beat: '♪',
  ekstase: '✦',
  idle: '≣',
};

export class RetrainDialog {
  private readonly overlay = byId('retrainOverlay');
  /** Das gerade bearbeitete Mitglied (null = Dialog zu). */
  private cfg: HeroConfig | null = null;
  private tier = 0;
  /** Die zur Wahl stehenden Sorten (null = Vorschau noch nicht geöffnet). */
  private offer: readonly SpecialKind[] | null = null;

  constructor(private readonly deps: RetrainDeps) {
    byId('rtRoll').addEventListener('click', () => this.preview());
    byId('rtKeep').addEventListener('click', () => this.keep());
    byId('rtClose').addEventListener('click', () => this.close());
    // Klick auf den abgedunkelten Rand schließt — aber nur in Phase 1, damit ein
    // BEZAHLTES Angebot nicht aus Versehen weggeklickt wird.
    this.overlay.addEventListener('click', (ev) => {
      if (ev.target === this.overlay && this.offer === null) this.close();
    });
    byId('rtOffers').addEventListener('click', (ev) => {
      const card = (ev.target as HTMLElement).closest<HTMLElement>('.rt-card');
      const kind = card?.dataset.kind;
      if (kind) this.choose(kind as SpecialKind);
    });
  }

  /** Ist der Dialog offen? (Die Glue pausiert nichts, aber der Tick fragt.) */
  get open(): boolean {
    return this.cfg !== null;
  }

  /** Den Dialog für Stufe `tier` von `cfg` öffnen (Phase 1, nichts bezahlt). */
  show(cfg: HeroConfig, tier: number): void {
    if (retrainSlotOrdinal(cfg, tier) <= 0) return; // Power-Stufen rollen nie
    this.cfg = cfg;
    this.tier = tier;
    this.offer = null;
    this.render();
    this.overlay.classList.remove('hidden');
  }

  /** Schließen und alles vergessen (ein bezahltes Angebot bleibt „behalten"). */
  close(): void {
    this.overlay.classList.add('hidden');
    this.cfg = null;
    this.offer = null;
  }

  /** Die aktuelle (ggf. schon umgeschulte) Sorte des offenen Slots. */
  private current(): SpecialKind {
    const cfg = this.cfg;
    if (!cfg) return 'gold';
    const k: AbilityKind = abilityKind(cfg, this.tier, this.deps.state.crewRetrain);
    return k === 'power' ? cfg.special : k;
  }

  /** Preis des NÄCHSTEN Rolls an diesem Mitglied (inkl. Eskalation). */
  private cost(): number {
    const cfg = this.cfg;
    if (!cfg) return 0;
    return retrainCost(
      retrainSlotOrdinal(cfg, this.tier),
      retrainRollCount(this.deps.state.retrainRolls, cfg.id),
    );
  }

  /** Phase 1 → 2: die Sorten-Auswahl ZEIGEN. Kostet nichts. */
  private preview(): void {
    const cfg = this.cfg;
    if (!cfg || this.offer !== null) return;
    // Die volle Auswahl statt zweier gewürfelter Sorten — Umschulen ist eine
    // Entscheidung, kein Wurf (siehe `retrainChoices`).
    this.offer = retrainChoices(this.current());
    this.render();
  }

  /** Ein Angebot annehmen: der Slot trägt ab jetzt (und nach jedem Reset) `kind`. */
  private choose(kind: SpecialKind): void {
    const cfg = this.cfg;
    if (!cfg || this.offer === null) return;
    if (!this.offer.includes(kind)) return; // nur echte Sorten des Pools
    const s = this.deps.state;
    // HIER wird bezahlt — und nur hier. Der Guard bleibt stehen, weil sich der
    // Splitter-Stand zwischen Öffnen und Zugreifen geändert haben kann.
    const cost = this.cost();
    if (s.gear.shards < cost) return;
    s.gear.shards -= cost;
    // Der Zähler läuft als reine Statistik weiter — Preis und Auswahl hängen
    // seit dem Umbau beide nicht mehr an ihm.
    s.retrainRolls = noteRetrainRoll(s.retrainRolls, cfg.id);
    s.crewRetrain = applyRetrain(s.crewRetrain, cfg.id, this.tier, kind);
    this.deps.onChange();
    this.deps.toast(
      '🔧',
      'Umgeschult!',
      `${cfg.name} · Stufe ${this.tier}: ${abilityKindName(kind)}`,
    );
    this.close();
  }

  /** Das Angebot ausschlagen — die alte Sorte bleibt, und es kostet NICHTS. */
  private keep(): void {
    const cfg = this.cfg;
    if (!cfg || this.offer === null) return;
    this.deps.toast(
      '🔧',
      'Beim Alten geblieben',
      `${cfg.name} behält ${abilityKindName(this.current())} — keine Splitter ausgegeben.`,
    );
    this.close();
  }

  /**
   * Eine Sorten-Karte. Die zwei ANGEBOTE sind Knöpfe (man wählt sie), die
   * „aktuell"-Zeile ist bewusst ein `span` — sie zeigt nur an, und ein Knopf,
   * der nichts tut, wäre ein Versprechen, das der Dialog nicht hält.
   */
  private card(kind: SpecialKind, cls: 'now' | 'offer', outLabel: string): string {
    const tag = cls === 'offer' ? 'button' : 'span';
    const attrs = cls === 'offer' ? ` data-kind="${kind}" type="button"` : '';
    return (
      `<${tag} class="rt-card ${cls} k-${kind}"${attrs}>` +
      `<span class="rt-glyph">${KIND_GLYPH[kind]}</span>` +
      `<span class="rt-ct"><b>${abilityKindName(kind)}</b>` +
      `<span class="rt-eff">${abilityKindLabel(kind, outLabel)}</span></span></${tag}>`
    );
  }

  private render(): void {
    const cfg = this.cfg;
    if (!cfg) return;
    const s = this.deps.state;
    const outLabel = cfg.click ? 'Klick' : 'DPS';
    const slot = retrainSlotOrdinal(cfg, this.tier);
    byId('rtPortrait').innerHTML = portraitTile(cfg.id, 'base', 'av-xl');
    byId('rtName').textContent = cfg.name;
    byId('rtSlot').textContent = `Fähigkeit ${this.tier} · Spezial-Slot ${slot}`;
    const now = byId('rtNow');
    now.innerHTML = `<span class="rt-k">Aktuell</span>${this.card(this.current(), 'now', outLabel)}`;

    const offers = byId('rtOffers');
    const roll = byId('rtRoll') as HTMLButtonElement;
    const keep = byId('rtKeep') as HTMLButtonElement;
    const close = byId('rtClose') as HTMLButtonElement;
    const msg = byId('rtMsg');

    if (this.offer === null) {
      // ---- Phase 1: Vorschau ----
      const cost = this.cost();
      const can = s.gear.shards >= cost;
      offers.classList.add('hidden');
      offers.innerHTML = '';
      roll.classList.remove('hidden');
      roll.disabled = !can;
      roll.textContent = `Sorten zeigen (${fmt(cost)} 🧩)`;
      keep.classList.add('hidden');
      close.classList.remove('hidden');
      close.textContent = 'Abbrechen';
      msg.className = `msg ${can ? '' : 'bad'}`;
      msg.textContent = can
        ? `Du hast ${fmt(s.gear.shards)} 🧩 · Du wählst die Sorte selbst — bezahlt wird erst beim Zugreifen.`
        : `Du hast nur ${fmt(s.gear.shards)} 🧩 — es fehlen ${fmt(cost - s.gear.shards)}.`;
      return;
    }

    // ---- Phase 2: das bezahlte Angebot ----
    offers.classList.remove('hidden');
    offers.innerHTML =
      '<span class="rt-k">Wähle die neue Sorte</span>' +
      this.offer.map((k) => this.card(k, 'offer', outLabel)).join('');
    roll.classList.add('hidden');
    keep.classList.remove('hidden');
    keep.textContent = `${abilityKindName(this.current())} behalten (gratis)`;
    close.classList.add('hidden');
    // Phase 2 zeigt den Preis noch einmal: Er fällt erst beim Zugreifen an.
    const cost = this.cost();
    const can = s.gear.shards >= cost;
    msg.className = `msg ${can ? 'ok' : 'bad'}`;
    msg.textContent = can
      ? `Jede Sorte kostet dasselbe: ${fmt(cost)} 🧩 — beim Alten bleiben ist kostenlos.`
      : `Es fehlen ${fmt(cost - s.gear.shards)} 🧩 — beim Alten bleiben ist kostenlos.`;
  }
}
