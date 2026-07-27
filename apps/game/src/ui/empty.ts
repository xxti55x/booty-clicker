/**
 * ROADMAP-V2 G6 — Gestaltete Leerzustände.
 *
 * Mehrere Tabs öffnen sich, bevor sie Inhalt haben: die Ahnen ohne Seelen, der
 * Ruhm vor der ersten Aszension, die Truhen ohne Schlüssel, der Himmelsbaum
 * ohne HPF, der Mythos-Shop ohne TE, die Erfolgs-Wand am Anfang. Bisher standen
 * dort entweder eine graue Wand unbezahlbarer Karten oder gar nichts — beides
 * sagt dem Spieler nicht, WIE er den Tab füllt.
 *
 * Die Icons kommen aus der bestehenden Icon-Sprache (dieselben Stroke-Pfade wie
 * die Tab-Leiste in `index.html`, 24er-Raster, `currentColor`) — bewusst KEINE
 * Emojis: die tragen im Spiel Bedeutung (Truhen-Stufen, Sterne, Währungen), ein
 * Leerzustand ist aber Chrome, kein Inhalt.
 */

export type EmptyIcon = 'ancients' | 'fame' | 'chest' | 'heaven' | 'transcend' | 'goals';

/** Ein Stroke-Icon je Leerzustand — identisch zu den Tab-Icons (eine Sprache). */
const ICONS: Record<EmptyIcon, string> = {
  ancients:
    '<path d="M12.4 13.3a1.5 1.5 0 0 1-2.2-1.9 3 3 0 0 1 4-.9 4.5 4.5 0 0 1 1.3 6 6.3 6.3 0 0 1-8.4 1.8A8.1 8.1 0 0 1 4.6 7.4a10 10 0 0 1 13-2.4"/>',
  fame: '<path d="M12 3.4 13.9 10l6.7 2-6.7 2L12 20.6 10.1 14l-6.7-2 6.7-2Z"/>',
  chest: '<path d="M4 11.4a8 6.6 0 0 1 16 0V19H4ZM4 11.4h16M12 11.4v3.4"/>',
  heaven:
    '<path d="M4 16.5a8 8 0 0 1 16 0M7.6 16.5a4.4 4.4 0 0 1 8.8 0"/><circle cx="4" cy="17.6" r="0.4"/><circle cx="20" cy="17.6" r="0.4"/>',
  transcend:
    '<path d="M7.5 4.5h9l3.8 4.6L12 19.8 3.7 9.1Z"/><path d="M3.7 9.1h16.6M12 19.8 8.8 9.1 12 4.5l3.2 4.6Z"/>',
  goals: '<path d="M6.2 3.5V21M6.2 4.8c3.6-2 6.8 1.8 11.6.2v8.2c-4.8 1.6-8-2.2-11.6-.2"/>',
};

/**
 * Die Karte eines Leerzustands: EIN Stroke-Icon, EIN Satz — der sagt, was den
 * Tab füllt. `text` ist immer ein festes Literal aus dem Panel-Code (nie
 * Spieler-Eingabe), landet aber trotzdem escaped im Markup.
 */
export function emptyState(icon: EmptyIcon, text: string): string {
  return (
    `<div class="empty">` +
    `<svg class="empty-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>` +
    `<span class="empty-tx">${escapeHtml(text)}</span>` +
    `</div>`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
