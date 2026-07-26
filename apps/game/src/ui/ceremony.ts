import {
  type CeremonyConfig,
  type CeremonyKind,
  ceremonyCountAt,
  ceremonyFor,
  ceremonySpriteCount,
} from '../game/ceremony';
import { fmt } from './format';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  return el;
}

/**
 * ROADMAP-V2 G4 — Die Vollbild-Blende der drei Prestige-Schichten.
 *
 * Bewusst DOM statt Canvas: die Zeremonie läuft in genau der Sekunde, in der die
 * Bühne ohnehin komplett neu gebaut wird (frischer Rivale, frische Kulisse,
 * frische Crew-Liste) — ein paar Dutzend absolut positionierte Spans mit einer
 * CSS-Animation kosten dort nichts, während zusätzliche Three-Sprites genau im
 * teuersten Frame des Spiels neue Geometrie bräuchten. Der Zähler ist der
 * einzige rAF hier, und auch er läuft nur für die Dauer der Blende.
 *
 * Vertrag mit den Reset-Handlern: **die Gutschrift ist längst gebucht**, wenn
 * `play` gerufen wird. Das Overlay ist reine Optik, es gewährt nichts und nimmt
 * nichts — deshalb darf jeder Tap es sofort beenden, ohne dass etwas verloren
 * geht. Es fängt seine Klicks selbst ab (`pointer-events: auto`), also kann
 * während der Blende auch kein Klick auf die Bühne durchrutschen.
 */
export class Ceremony {
  private readonly el = byId('ceremony');
  private readonly spritesEl = byId('cerSprites');
  private readonly titleEl = byId('cerTitle');
  private readonly countEl = byId('cerCount');
  private readonly subEl = byId('cerSub');
  private readonly sweepEl = byId('cerSweep');
  private raf = 0;
  private timer = 0;
  private startMs = 0;
  private cfg: CeremonyConfig | null = null;
  private total = 0;

  constructor() {
    // Skip-Tap: ein Zeiger irgendwo auf der Blende beendet sie sofort.
    this.el.addEventListener('pointerdown', () => this.finish());
  }

  /** Läuft gerade eine Zeremonie? (Der Headless-Beweis liest das.) */
  get active(): boolean {
    return !this.el.classList.contains('hidden');
  }

  /**
   * Die Blende einer Schicht spielen. `total` ist der bereits gutgeschriebene
   * Betrag (Seelen / HPF / TE), `confetti` die Preset-Dichte — 0 ⇒ gar keine
   * Sprites (das low-Preset kommt hier ohnehin nicht an, `main.ts` prüft
   * `preset.cinematics` davor).
   */
  play(kind: CeremonyKind, total: number, confetti: number): void {
    const cfg = ceremonyFor(kind);
    this.finish(); // eine laufende Blende sauber abräumen (Doppelklick-Fall)
    this.cfg = cfg;
    this.total = Math.max(0, Math.floor(total));
    this.startMs = performance.now();

    this.el.className = `ceremony k-${cfg.kind}`;
    this.el.style.setProperty('--cer-ms', `${cfg.durationMs}ms`);
    this.titleEl.textContent = cfg.title;
    this.subEl.textContent = cfg.sub;
    this.countEl.textContent = `+0 ${cfg.glyph}`;
    // Der „Neustart"-Sweep liegt am Ende der Blende — er fährt einmal über die
    // Bühne, während das Overlay ausblendet, und markiert so den frischen Lauf.
    this.sweepEl.style.animationDelay = `${Math.max(0, cfg.durationMs - 430)}ms`;
    this.buildSprites(cfg, ceremonySpriteCount(cfg, confetti));

    this.timer = window.setTimeout(() => this.finish(), cfg.durationMs);
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Ein Frame Zahlen-Aufzähler (die Sprites laufen rein in CSS). */
  private tick = (now: number): void => {
    const cfg = this.cfg;
    if (!cfg) return;
    const v = ceremonyCountAt(this.total, now - this.startMs, cfg.durationMs);
    const txt = `+${fmt(v)} ${cfg.glyph}`;
    if (this.countEl.textContent !== txt) this.countEl.textContent = txt;
    this.raf = requestAnimationFrame(this.tick);
  };

  /**
   * Die Sprites einmal aufbauen. Jeder bekommt seine Bahn über Inline-Variablen
   * (Startpunkt, Ziel, Verzögerung, Dauer) — die Keyframes selbst stehen im
   * Stylesheet, also gibt es pro Zeremonie genau EINE Layout-Runde.
   */
  private buildSprites(cfg: CeremonyConfig, n: number): void {
    if (n <= 0) {
      this.spritesEl.replaceChildren();
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.textContent = cfg.glyph;
      const dur = 0.9 + Math.random() * 0.7;
      // Regen: ein Teil der Sprites startet mit NEGATIVER Verzögerung, ist im
      // ersten Frame also schon in der Luft — sonst wäre die halbe Blende
      // vorbei, bevor der erste Tropfen die Bildmitte erreicht. Die Implosion
      // startet dagegen sauber am Rand (nur positive Verzögerungen), sonst
      // säßen Sterne schon im Zentrum, bevor sie losgeflogen sind.
      const span = cfg.durationMs / 1000;
      const delay =
        cfg.motion === 'rain'
          ? Math.random() * span * 0.9 - span * 0.4
          : Math.random() * span * 0.3;
      s.style.animationDuration = `${dur.toFixed(2)}s`;
      s.style.animationDelay = `${delay.toFixed(2)}s`;
      s.style.fontSize = `${(16 + Math.random() * 22).toFixed(0)}px`;
      if (cfg.motion === 'implode') {
        // Start irgendwo am Rand, Ziel exakt die Mitte: die Sterne fallen in
        // einen Punkt (Transzendenz zieht alles zusammen, statt es zu streuen).
        const a = Math.random() * Math.PI * 2;
        const r = 34 + Math.random() * 22; // in % der halben Viewport-Diagonale
        const x = 50 + Math.cos(a) * r;
        const y = 50 + Math.sin(a) * r * 0.85;
        s.style.left = `${x.toFixed(1)}%`;
        s.style.top = `${y.toFixed(1)}%`;
        s.style.setProperty('--tx', `${(50 - x).toFixed(1)}vw`);
        s.style.setProperty('--ty', `${(50 - y).toFixed(1)}vh`);
      } else {
        s.style.left = `${(Math.random() * 96).toFixed(1)}%`;
        s.style.top = '0%';
        s.style.setProperty('--rot', `${(Math.random() * 60 - 30).toFixed(0)}deg`);
      }
      frag.appendChild(s);
    }
    this.spritesEl.replaceChildren(frag);
  }

  /**
   * Blende beenden — per Skip-Tap oder Timer. Idempotent: räumt rAF, Timer und
   * alle Sprites ab und lässt das Overlay als `hidden` zurück.
   */
  finish(): void {
    if (this.raf !== 0) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (this.timer !== 0) {
      window.clearTimeout(this.timer);
      this.timer = 0;
    }
    this.cfg = null;
    this.spritesEl.replaceChildren();
    this.el.className = 'ceremony hidden';
  }
}
