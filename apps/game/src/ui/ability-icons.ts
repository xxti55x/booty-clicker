/**
 * Eigene Icons für JEDE Fähigkeit — Charakter × Sorte.
 *
 * **Was zweimal nicht gereicht hat.** Zuerst zeigte die Kachel das Portrait
 * ihres Trägers plus ein 15-px-Badge der Sorte: acht Mal dasselbe Gesicht je
 * Karte. Dann trug sie die Sorte als Grundform und den Träger als
 * Eck-Beizeichen — groß gerendert und nachgesehen war der Befund, dass die
 * Spalte „gegen Bosse" bei allen fünfzehn dasselbe Dreieck zeigte, nur
 * umgefärbt. Das Beizeichen war zu klein, um das zu drehen, und das Motiv
 * steckte in einem 15-px-Feld mitten auf einer 28-px-Kachel: über die Hälfte
 * der Fläche lag brach.
 *
 * **Was jetzt passiert.** Das Icon füllt die Kachel und trägt drei Aussagen in
 * drei getrennten Kanälen:
 *
 * - **Die Fläche sagt WER.** Die Platte hat die Farbe der Cartoon-Figur —
 *   derselbe Kanal, der schon das Portrait bei 32 px trägt. Fünfzehn Träger,
 *   fünfzehn Farben.
 * - **Die Form sagt WAS.** Die Sorte steht groß und mittig darauf, in einer
 *   Tinte, die aus der Helligkeit der Platte gerechnet wird — sonst
 *   verschwände sie auf der hellen Creme-Platte des A-Promis oder auf dem
 *   tiefen Violett der kosmischen Entität.
 * - **Die Ecke bestätigt WER.** Das Signatur-Element des Trägers sitzt unten
 *   rechts auf einer Scheibe in Gegenfarbe — klein, aber invertiert und
 *   deshalb auch dann noch sichtbar, wenn die Kachel im Umschul-Dialog aus
 *   ihrem Zusammenhang gerissen ist.
 *
 * Der Rahmen der Kachel bleibt derweil bei der Sorte (`.ab.ready.k-*` im
 * Stylesheet). Vier Kanäle, vier Aussagen, keine Dopplung.
 *
 * 15 Träger × 8 Sorten aus zwei kleinen Tabellen statt 120 gezeichneter Dateien.
 */
import type { AbilityKind } from '../game/heroes';
import { avatarSpec } from './avatars';
import { CARTOON_PALETTES, INK } from './cartoon';

/**
 * Die Grundform je Sorte — sie füllt die Kachel und trägt die Aussage.
 *
 * Bewusst kräftige, auf 34 px lesbare Silhouetten: Ein Icon, das man auf
 * Kachelgröße erraten muss, hat seinen Zweck verfehlt.
 */
const KIND_BASE: Record<AbilityKind, string> = {
  // Verstärkung: der Aufwärts-Blitz — schlicht „mehr".
  power: '<path d="M13.6 2.6 5.6 13.4h5L9.8 21.4 18 10.6h-5.2Z" fill="currentColor"/>',
  // Krit-Chance: der Würfel mit Auge — der Wurf, der sitzt.
  crit:
    '<rect x="4" y="4" width="16" height="16" rx="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
    '<circle cx="8.8" cy="8.8" r="1.8" fill="currentColor"/><circle cx="15.2" cy="15.2" r="1.8" fill="currentColor"/>' +
    '<circle cx="12" cy="12" r="1.8" fill="currentColor"/>',
  // Krit-Schaden: der Bruch — dieselbe Trefferzahl, härter.
  critdmg:
    '<path d="M12 2.2 6.2 11.2h4.4L9 17.4 17.8 8.2h-4.8Z" fill="currentColor"/>' +
    '<path d="M3.2 20.8 7 17M20.8 20.8 17 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  // Beat-Fenster: die Note im weiteren Rahmen.
  beat:
    '<path d="M10.2 3.8v10.3a3.1 3.1 0 1 0 1.9 2.8V8.4c2.2.4 3.5 1.4 4.3 2.9.6-3.4-1.4-5.6-4.3-6.2V3.8Z" fill="currentColor"/>' +
    '<path d="M2.8 8v8M21.2 8v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  // Rampenlicht: der Kegel auf die Bühne — wirkt gegen Bosse.
  boss:
    '<path d="M12 2.4 4.8 13.8h14.4Z" fill="currentColor"/>' +
    '<path d="M4 17.6h16M6.4 21h11.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  // Mitläufer: zwei Ringe, die ineinandergreifen — die stehende Combo.
  combo:
    '<circle cx="8.6" cy="12" r="5.8" fill="none" stroke="currentColor" stroke-width="2.6"/>' +
    '<circle cx="15.4" cy="12" r="5.8" fill="none" stroke="currentColor" stroke-width="2.6"/>',
  // Ekstase-Tänzer: die Flamme.
  ekstase:
    '<path d="M12 1.8c1.3 4 5.2 5.8 5.2 10.5a7.9 7.9 0 0 1-2.1 5.6c.2-2.8-.9-4.4-3.1-6-2.2 1.6-3.3 3.2-3.1 6a7.9 7.9 0 0 1-2.1-5.6C6.8 7.6 10.7 5.8 12 1.8Z" fill="currentColor"/>' +
    '<path d="M7.6 21.4h8.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  // Dauerläufer: der stetige Balken-Aufbau im Leerlauf.
  idle: '<path d="M3.2 21V11.6h4.2V21ZM9.9 21V3.4h4.2V21ZM16.6 21V7.6h4.2V21Z" fill="currentColor"/>',
};

/**
 * Das Signatur-Element des TRÄGERS, gezeichnet in einem 8er-Feld.
 *
 * Es sitzt auf einer Scheibe in Gegenfarbe unten rechts — invertiert und
 * deshalb auch bei 34 px noch als eigenes Zeichen lesbar, statt in der
 * Grundform unterzugehen.
 */
const OWNER_MARK: Record<string, string> = {
  boss: '<path d="M.4 6.4-.4 2.6l2.4 1.6L4 .8l1.6 3.4L8 2.6l-.8 3.8Z"/>', // Krone
  hype: '<circle cx="2.2" cy="3.4" r="2.1"/><circle cx="6.4" cy="3.4" r="2.1"/>', // Pompons
  dj: '<path d="M.6 4.4a3.4 3.4 0 0 1 6.8 0"/><rect x="-.2" y="4.2" width="2.1" height="3" rx="1"/><rect x="6.1" y="4.2" width="2.1" height="3" rx="1"/>', // Kopfhörer
  bouncer:
    '<rect x="-.2" y="2.6" width="3.6" height="2.8" rx=".9"/><rect x="4.6" y="2.6" width="3.6" height="2.8" rx=".9"/><path d="M3.4 3.8h1.2"/>', // Sonnenbrille
  influencer:
    '<rect x="1.8" y="-.2" width="4.4" height="7.6" rx="1.1"/><path d="M3 1.6h2M3 3.4h2"/>', // Handy
  choreo: '<circle cx="4" cy="4" r="2.6"/><path d="M1.4 3.4H-.4"/>', // Trillerpfeife
  producer:
    '<path d="M1.4 0v7.2M4 0v7.2M6.6 0v7.2"/><circle cx="1.4" cy="4.8" r="1"/><circle cx="4" cy="2.4" r="1"/><circle cx="6.6" cy="3.6" r="1"/>', // Fader
  promi: '<path d="M4 0 5 2.6 7.8 2.8 5.7 4.6l.6 2.8L4 5.9 1.7 7.4l.6-2.8L.2 2.8 3 2.6Z"/>', // Stern
  tycoon: '<path d="M-.4 1.8h8.8v1.6H-.4Z"/><path d="M.8 1.8C.8 0 2.2-.8 4-.8s3.2.8 3.2 2.6Z"/>', // Fedora
  legend: '<path d="M4 0C1.8 1.2.6 3 .8 5.2c1-.4 2.1-.6 3.2-.6s2.2.2 3.2.6C7.4 3 6.2 1.2 4 0Z"/>', // Lorbeer
  viral: '<path d="M.6 2.2C.6 0 2.2-1 4-1s3.4 1 3.4 3.2Z"/><path d="M.6 2.2h-1.4v-1.6H.6Z"/>', // Cap
  hologram: '<path d="M.4 1.4h7.2M.4 4h7.2M.4 6.6h7.2"/>', // Scanlines
  aicluster:
    '<rect x="1.2" y="1.2" width="5.6" height="5.6" rx="1"/><path d="M3 0v1.2M5 0v1.2M3 6.8V8M5 6.8V8M0 3h1.2M0 5h1.2M6.8 3H8M6.8 5H8"/>', // Chip
  orbital:
    '<rect x="-.2" y="1.8" width="3" height="4.2" rx=".6"/><rect x="5.2" y="1.8" width="3" height="4.2" rx=".6"/><path d="M2.8 3.8h2.4"/>', // Solarpanel
  cosmic:
    '<circle cx="4" cy="4" r="1.8"/><ellipse cx="4" cy="4" rx="4.6" ry="1.7" transform="rotate(-24 4 4)"/>', // Ringplanet
};

/**
 * Wahrgenommene Helligkeit eines `#rrggbb` — die Grundlage der Tintenwahl.
 *
 * Gerechnet statt gepflegt: Eine zweite Farbtabelle „hell oder dunkel?" wäre
 * eine Wahrheit, die still veralten kann, sobald jemand eine Figurfarbe
 * anfasst. So folgt der Kontrast der Palette automatisch.
 */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Die helle Tinte für dunkle Platten. */
const LIGHT_INK = '#fff4dc';

/** Tinte und Gegenfarbe zu einer Plattenfarbe. */
function contrast(bg: string): { ink: string; on: string } {
  return luminance(bg) > 0.55 ? { ink: INK, on: LIGHT_INK } : { ink: LIGHT_INK, on: INK };
}

/**
 * Das komplette Icon einer Fähigkeit.
 *
 * `owner` ohne Cartoon-Palette ⇒ das Motiv erbt die Kachelfarbe wie früher.
 * Das ist kein Fehlerfall, sondern der Weg für Zusammenhänge ohne Träger
 * (etwa eine Legende der Sorten).
 */
export function abilityIcon(owner: string, kind: AbilityKind): string {
  const pal = CARTOON_PALETTES[owner];
  const mark = OWNER_MARK[owner];
  const open = `<svg class="ab-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"`;

  if (!pal) {
    const tint = avatarSpec(owner).palette.accent;
    return (
      `${open} style="color:${tint}"><g fill="none" stroke="currentColor" stroke-width="1.9" ` +
      `stroke-linecap="round" stroke-linejoin="round">${KIND_BASE[kind]}</g></svg>`
    );
  }

  const { ink, on } = contrast(pal.bg);
  return (
    `${open} style="color:${ink}">` +
    `<rect width="24" height="24" fill="${pal.bg}"/>` +
    `<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ` +
    `stroke-linejoin="round">${KIND_BASE[kind]}</g>` +
    // Die Scheibe sitzt bewusst klein in der Ecke. Ein erster Entwurf gab ihr
    // Radius 5.4 — im Spiel gesehen fraß sie dann rund ein Drittel der Kachel
    // und zerschnitt genau die Sortenform, die die Hauptaussage trägt.
    (mark
      ? `<circle cx="18.8" cy="18.8" r="4.5" fill="${ink}"/>` +
        `<g transform="translate(16 16) scale(.7)" fill="${on}" stroke="${on}" ` +
        `stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${mark}</g>`
      : '') +
    `</svg>`
  );
}

/** Alle Träger, für die ein Beizeichen hinterlegt ist (für Tests). */
export const OWNER_MARK_IDS: readonly string[] = Object.keys(OWNER_MARK);
