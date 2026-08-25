/**
 * Eigene Icons für JEDE Fähigkeit — Charakter × Sorte.
 *
 * **Was vorher fehlte.** Die Fähigkeits-Kachel zeigte das PORTRAIT ihres
 * Trägers plus ein 15-px-Badge der Sorte. Auf einer Karte mit acht Kacheln
 * standen damit acht Mal dasselbe Gesicht nebeneinander, und der einzige
 * Unterschied war ein Abzeichen, das kleiner war als die Ziffer daneben. Die
 * Kacheln waren also nicht unterscheidbar, obwohl sie verschiedene Dinge taten.
 *
 * **Was jetzt passiert.** Jede Fähigkeit bekommt ein VOLLFLÄCHIGES Motiv, das
 * beides trägt:
 *
 * - die **Sorte** als Grundform (Verstärkung, Rampenlicht, Mitläufer …) — sie
 *   ist die Information, nach der der Spieler sucht;
 * - das **Signatur-Element seines Trägers** als kleines Beizeichen — Krone,
 *   Kopfhörer, Klemmbrett … So bleibt erkennbar, wessen Fähigkeit das ist,
 *   ohne dass man dafür achtmal dasselbe Portrait sehen muss.
 *
 * Zusammen ergibt das 15 Träger × 8 Sorten Kombinationen, die alle aus zwei
 * kleinen Tabellen entstehen statt aus 120 handgezeichneten Dateien — dieselbe
 * Bauweise wie die Portraits (`avatars.ts`), dieselbe Stroke-Sprache wie die
 * Tab-Ikonen: `fill="none"`, `stroke="currentColor"`, runde Enden.
 */
import type { AbilityKind } from '../game/heroes';
import { avatarSpec } from './avatars';

/**
 * Die Grundform je Sorte — sie füllt die Kachel und trägt die Aussage.
 *
 * Bewusst kräftige, gut auf 34 px lesbare Silhouetten: Ein Icon, das man auf
 * Kachelgröße erraten muss, hat seinen Zweck verfehlt.
 */
const KIND_BASE: Record<AbilityKind, string> = {
  // Verstärkung: der Aufwärts-Blitz — schlicht „mehr".
  power:
    '<path d="M13.6 2.2 5.4 13.4h5.2L9.8 21.8 18.2 10.4h-5.4Z" fill="currentColor" opacity=".92"/>',
  // Krit-Chance: der Würfel mit Auge — der Wurf, der sitzt.
  crit:
    '<rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<circle cx="9" cy="9" r="1.7" fill="currentColor"/><circle cx="15" cy="15" r="1.7" fill="currentColor"/>' +
    '<circle cx="12" cy="12" r="1.7" fill="currentColor"/>',
  // Krit-Schaden: der Bruch — dieselbe Trefferzahl, härter.
  critdmg:
    '<path d="M12 2.4 6.6 11h4.2l-1.4 5.6L17.4 8h-4.6Z" fill="currentColor"/>' +
    '<path d="M3.4 20.6 7 17M20.6 20.6 17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // Beat-Fenster: die Note im weiteren Rahmen.
  beat:
    '<path d="M10.4 4.2v9.9a3 3 0 1 0 1.8 2.7V8.6c2.1.4 3.4 1.3 4.1 2.8.6-3.3-1.3-5.4-4.1-6V4.2Z" fill="currentColor"/>' +
    '<path d="M3 8.4v7.2M21 8.4v7.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // Rampenlicht: der Kegel auf die Bühne — wirkt gegen Bosse.
  boss:
    '<path d="M12 2.6 5.2 13.6h13.6Z" fill="currentColor" opacity=".9"/>' +
    '<path d="M4.4 17.4h15.2M6.6 20.6h10.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // Mitläufer: zwei Ringe, die ineinandergreifen — die stehende Combo.
  combo:
    '<circle cx="8.8" cy="12" r="5.4" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
    '<circle cx="15.2" cy="12" r="5.4" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  // Ekstase-Tänzer: die Flamme.
  ekstase:
    '<path d="M12 2.2c1.2 3.8 4.9 5.5 4.9 10a7.5 7.5 0 0 1-2 5.3c.2-2.6-.8-4.2-2.9-5.7-2.1 1.5-3.1 3.1-2.9 5.7a7.5 7.5 0 0 1-2-5.3c0-4.5 3.7-6.2 4.9-10Z" fill="currentColor"/>' +
    '<path d="M8 21.2h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // Dauerläufer: der stetige Balken-Aufbau im Leerlauf.
  idle: '<path d="M3.6 20.4V12h4v8.4ZM10 20.4V4h4v16.4ZM16.4 20.4V8h4v12.4Z" fill="currentColor" opacity=".92"/>',
};

/**
 * Das Beizeichen des TRÄGERS — dasselbe Signatur-Element wie in seinem
 * Portrait, auf Marken-Größe reduziert und in die untere rechte Ecke gesetzt.
 *
 * Es steht bewusst KLEIN: Die Sorte ist die Information, der Träger die
 * Herkunft. Wer die Karte liest, weiß ohnehin, wessen Karte es ist — das
 * Beizeichen hilft, wenn Kacheln aus dem Zusammenhang gerissen nebeneinander
 * stehen (Kauf-Tipp, Umschul-Dialog).
 */
const OWNER_MARK: Record<string, string> = {
  boss: '<path d="M0 5.2 -.7 2.4l2.1 1.5L3.6.6l2.2 3.3 2.1-1.5-.7 2.8Z"/>', // Krone
  hype: '<circle cx="1.6" cy="3" r="1.7"/><circle cx="6" cy="3" r="1.7"/>', // Pompons
  dj: '<path d="M.4 4.2a3.4 3.4 0 0 1 6.8 0"/><rect x="-.2" y="4" width="1.9" height="2.6" rx=".9"/><rect x="5.9" y="4" width="1.9" height="2.6" rx=".9"/>', // Kopfhörer
  bouncer:
    '<rect x="0" y="2.4" width="3.2" height="2.6" rx=".8"/><rect x="4" y="2.4" width="3.2" height="2.6" rx=".8"/><path d="M3.2 3.6h.8"/>', // Sonnenbrille
  influencer: '<rect x="1.6" y="0" width="4" height="6.6" rx="1"/><path d="M2.6 1.4h2M2.6 3h2"/>', // Handy
  choreo: '<rect x="1" y=".6" width="5" height="6.2" rx=".8"/><path d="M2.4 2.4h2.2M2.4 4h2.2"/>', // Klemmbrett
  producer:
    '<path d="M1.2 0v6.6M3.6 0v6.6M6 0v6.6"/><circle cx="1.2" cy="4.4" r=".9"/><circle cx="3.6" cy="2.2" r=".9"/><circle cx="6" cy="3.4" r=".9"/>', // Fader
  promi: '<path d="M1.8 0 2.6 2 4.6 2.2 3.1 3.6l.5 2-1.8-1.1L0 5.6l.5-2L-1 2.2 1 2Z"/>', // Stern
  tycoon: '<path d="M0 5.4h7.2"/><path d="M.8 1.6 3.6 5l2.8-3.4"/>', // Anzugkragen
  legend:
    '<path d="M3.6 0C1.6 1 .6 2.6.8 4.6c.9-.4 1.9-.6 2.8-.6s1.9.2 2.8.6C6.6 2.6 5.6 1 3.6 0Z"/>', // Lorbeer
  viral:
    '<path d="M3.6 6.6V2.6"/><path d="M1.2 1.4a3.4 3.4 0 0 1 4.8 0"/><circle cx="3.6" cy="2" r=".8"/>', // Antenne
  hologram: '<path d="M.4 1.6h6.4M.4 3.4h6.4M.4 5.2h6.4"/>', // Scanlines
  aicluster:
    '<rect x="1" y="1" width="4.8" height="4.8" rx=".8"/><path d="M2.6 0v1M4.2 0v1M2.6 5.8v1M4.2 5.8v1M0 2.6h1M0 4.2h1M5.8 2.6h1M5.8 4.2h1"/>', // Chip
  orbital:
    '<rect x="0" y="1.6" width="2.6" height="3.6" rx=".5"/><rect x="4.4" y="1.6" width="2.6" height="3.6" rx=".5"/><path d="M2.6 3.4h1.8"/>', // Solarpanel
  cosmic:
    '<circle cx="3.4" cy="3.4" r="1.6"/><ellipse cx="3.4" cy="3.4" rx="4.2" ry="1.6" transform="rotate(-24 3.4 3.4)" fill="none"/>', // Ringplanet
};

/**
 * Das komplette Icon einer Fähigkeit: Sorten-Grundform plus Träger-Beizeichen.
 *
 * `owner` unbekannt ⇒ nur die Grundform. Das ist kein Fehlerfall, sondern der
 * normale Weg für Zusammenhänge ohne Träger (etwa eine Legende der Sorten).
 */
export function abilityIcon(owner: string, kind: AbilityKind): string {
  const mark = OWNER_MARK[owner];
  // Die Akzentfarbe des Trägers — dieselbe, die auch sein Portrait-Rahmen
  // trägt. Ohne sie erbte jedes Icon die Kachelfarbe, und acht Kacheln
  // verschiedener Mitglieder sähen wieder gleich aus. Als Inline-Style, weil
  // die Palette aus einer Tabelle kommt und nicht als CSS-Klasse existiert.
  const tint = avatarSpec(owner).palette.accent;
  return (
    `<svg class="ab-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"` +
    ` style="color:${tint}">` +
    `<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
    KIND_BASE[kind] +
    (mark
      ? // Beizeichen unten rechts, auf ein Drittel geschrumpft und leicht
        // abgesetzt, damit es die Grundform nicht zerschneidet.
        `<g transform="translate(15.4 15.4) scale(.62)" stroke-width="2.6" opacity=".85">${mark}</g>`
      : '') +
    `</g></svg>`
  );
}

/** Alle Träger, für die ein Beizeichen hinterlegt ist (für Tests). */
export const OWNER_MARK_IDS: readonly string[] = Object.keys(OWNER_MARK);
