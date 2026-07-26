/**
 * ROADMAP-V2 G6 — Kauf-Feedback: Coin-Fly zum BP-Zähler, Zähler-Puls und die
 * kleine Feier im Fähigkeits-Slot.
 *
 * Alles landet in EINER fixen Overlay-Schicht (`#fxLayer`, `pointer-events:
 * none`) statt im Panel selbst. Grund ist der 0.25-s-Idle-Tick: der rendert den
 * offenen Tab neu, sobald sich Gold oder Level ändern — ein Partikel IM Panel
 * wäre also mitten in seiner Animation weg. In der Overlay-Schicht überlebt er
 * jeden Rebuild, und das Panel-HTML bleibt frei von Effekt-Markup.
 *
 * Die Bahnen selbst laufen in CSS (Keyframes + Inline-Variablen für Ziel und
 * Winkel), hier wird nur gerechnet und aufgeräumt. Ohne Overlay-Schicht (Tests,
 * kaputtes DOM) sind alle Funktionen stille No-ops.
 */

/** Flugdauer einer Münze in ms (deckungsgleich mit `@keyframes coinFly`). */
export const COIN_MS = 420;
/** Standzeit der Slot-Feier in ms (deckungsgleich mit den Slot-Keyframes). */
const BURST_MS = 620;
/** Münzen pro Kauf (Roadmap G6: 2–3 kleine Sprites). */
const COINS = 3;
/** Konfetti-Stücke im Fähigkeits-Slot. */
const BURST_BITS = 8;

function layer(): HTMLElement | null {
  return document.getElementById('fxLayer');
}

/** Mittelpunkt eines Elements in Viewport-Koordinaten (null = nicht da). */
function centerOf(id: string): { x: number; y: number } | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Ein Effekt-Element einhängen und nach `ms` wieder abräumen. */
function mount(el: HTMLElement, ms: number): void {
  const host = layer();
  if (!host) return;
  host.appendChild(el);
  window.setTimeout(() => el.remove(), ms + 60);
}

/**
 * Der BP-Zähler pulst einmal — der Ankunfts-Beat der Münzen. Die Animation wird
 * per Reflow neu angestoßen, damit auch der zweite Kauf in Folge sichtbar ist
 * (dasselbe Muster wie beim Boss-Banner und beim Wellen-Puls der HP-Bar).
 */
export function goldPulse(): void {
  const el = document.getElementById('gold');
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

/**
 * 2–3 Münzen fliegen vom geklickten Kauf-Knopf zum BP-Zähler; landet die
 * letzte, pulst der Zähler. Rein kosmetisch — gebucht hat der Kauf längst.
 */
export function coinFly(x: number, y: number): void {
  const target = centerOf('gold');
  if (!layer() || !target) {
    goldPulse(); // ohne Overlay-Schicht wenigstens der Puls
    return;
  }
  for (let i = 0; i < COINS; i++) {
    const c = document.createElement('i');
    c.className = 'fx-coin';
    // Leichter Streu-Versatz am Start, damit die Münzen nicht als EIN Punkt
    // losfliegen; das Ziel ist für alle exakt der Zähler.
    const ox = (Math.random() * 2 - 1) * 14;
    const oy = (Math.random() * 2 - 1) * 10;
    c.style.left = `${x + ox}px`;
    c.style.top = `${y + oy}px`;
    c.style.setProperty('--dx', `${target.x - x - ox}px`);
    c.style.setProperty('--dy', `${target.y - y - oy}px`);
    c.style.animationDelay = `${i * 55}ms`;
    mount(c, COIN_MS + i * 55);
  }
  window.setTimeout(goldPulse, COIN_MS);
}

/**
 * Die Feier im Fähigkeits-Slot: Mini-Konfetti aus dem Slot heraus plus ein
 * Stempel, der auf das frisch gekaufte Badge knallt. `rect` ist die Position
 * des Slots VOR dem Rebuild — die Feier liegt im Overlay, überlebt ihn also.
 */
export function abilityBurst(rect: DOMRect): void {
  if (!layer()) return;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < BURST_BITS; i++) {
    const b = document.createElement('i');
    b.className = 'fx-bit';
    const a = (Math.PI * 2 * i) / BURST_BITS + Math.random() * 0.5;
    const d = 22 + Math.random() * 20;
    b.style.left = `${cx}px`;
    b.style.top = `${cy}px`;
    b.style.setProperty('--tx', `${Math.cos(a) * d}px`);
    b.style.setProperty('--ty', `${Math.sin(a) * d}px`);
    b.style.animationDelay = `${Math.random() * 70}ms`;
    mount(b, BURST_MS);
  }
  const stamp = document.createElement('span');
  stamp.className = 'fx-stamp';
  stamp.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  stamp.style.left = `${cx}px`;
  stamp.style.top = `${cy}px`;
  mount(stamp, BURST_MS);
}
