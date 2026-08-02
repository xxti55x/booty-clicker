/**
 * Die Zeremonie des Easter Eggs (V2/v19): **goldener Pfirsich-Regen** über dem
 * ganzen Bildschirm, ein Gold-Flash und das Jackpot-Banner. Reines DOM + CSS
 * (Keyframes in `style.css`, Präfix `kfx-`) — kein Canvas-Zugriff, kein
 * Preset-Gate: die Zeremonie ist ein Einmal-Wow bzw. ein bewusst gerufenes
 * Spielzeug, sie läuft auf jedem Gerät. `pointer-events: none` auf allem —
 * unter dem Regen wird weitergespielt.
 *
 * Wiederholte Zündungen ersetzen eine laufende Zeremonie (kein Stapeln von
 * Overlays), und ohne `amount` (Jackpot schon kassiert) fällt nur der Regen.
 */

/** Dauer, nach der das Overlay sich selbst aufräumt (ms). */
const KFX_TTL_MS = 4200;
const PEACHES = 36;

/**
 * Zeremonie abspielen. `amount` ist der formatierte Jackpot (z. B. „+12.4M
 * BP") — `null` heißt: nur Regen, kein Banner-Betrag (Latch schon gezogen).
 */
export function playKonamiCeremony(amount: string | null): void {
  document.getElementById('konamiFx')?.remove();
  const root = document.createElement('div');
  root.id = 'konamiFx';
  root.setAttribute('aria-hidden', 'true');

  const flash = document.createElement('div');
  flash.className = 'kfx-flash';
  root.appendChild(flash);

  for (let i = 0; i < PEACHES; i++) {
    const p = document.createElement('span');
    p.className = 'kfx-peach';
    p.textContent = '🍑';
    // Streuung als Custom Properties: Position, Verzögerung, Dauer, Drall,
    // Größe. Bewusst `Math.random` (reine Optik — der Spiel-RNG bleibt seed-rein).
    p.style.setProperty('--x', `${(Math.random() * 100).toFixed(2)}vw`);
    p.style.setProperty('--delay', `${(Math.random() * 0.9).toFixed(2)}s`);
    p.style.setProperty('--dur', `${(1.7 + Math.random() * 1.3).toFixed(2)}s`);
    p.style.setProperty('--spin', `${Math.round(Math.random() * 720 - 360)}deg`);
    p.style.setProperty('--size', `${(1.4 + Math.random() * 1.8).toFixed(2)}rem`);
    root.appendChild(p);
  }

  const banner = document.createElement('div');
  banner.className = 'kfx-banner';
  banner.innerHTML =
    `<div class="kfx-icon">🕹️</div>` +
    `<div class="kfx-title">Cheat-Code der Ahnen!</div>` +
    (amount !== null
      ? `<div class="kfx-amount">${amount}</div>`
      : `<div class="kfx-again">Die Ahnen nicken anerkennend.</div>`);
  root.appendChild(banner);

  document.body.appendChild(root);
  window.setTimeout(() => root.remove(), KFX_TTL_MS);
}
