/**
 * Prozeduraler Portrait-Baukasten (IDEEN-GAMEPLAY 4a).
 *
 * Jedes Crew-Mitglied und jeder Twerk-Ahne bekommt ein 24er-viewBox-Portrait in
 * DERSELBEN Stroke-Icon-Sprache wie die Tab-Ikonen in `index.html`: `fill="none"`,
 * `stroke="currentColor"`, runde Enden — plus wenige Füllflächen (Haar, EIN
 * Signatur-Accessoire) aus der Mitglieds-Palette. Keine Emojis, keine
 * Bild-Assets, alles im Bundle (die 10 Playermodel-Skins sind die Ausnahme: für
 * sie existieren echte Renders, siehe `gear-panel.ts`).
 *
 * Ein Portrait = Kopfform + Frisur + EIN Signatur-Accessoire + Palette,
 * deterministisch aus der Id: `AVATAR_TABLE` ist die handgesetzte Zuordnung,
 * unbekannte Ids fallen auf einen Hash der Id zurück (ein neu erfundenes
 * Mitglied hat damit sofort ein stabiles Gesicht, statt gar keins).
 *
 * **Sprite-Guardrail.** Die Crew-Liste baut sich im 0.25-s-Tick komplett neu auf.
 * Würde jede Zeile ihr Portrait als eigenes SVG-Geflecht tragen, entstünden pro
 * Rebuild hunderte Knoten. Deshalb wandert die GEOMETRIE genau einmal als
 * `<symbol>`-Sprite ins DOM (`mountAvatarSprite`) und jede Zeile referenziert sie
 * mit einem zwei Knoten großen `<svg><use/></svg>` (`portraitSvg`).
 *
 * Zwei Posen je Portrait: `base` (Standard) und `power` (angespannt — kurzer
 * Hals, breitere kantige Schultern, Trapez-Falten, Brustbogen, kräftigerer
 * Strich, gesenkte Brauen und Schrei-Mund). Die Fähigkeits-Slots zeigen damit
 * auf einen Blick, ob eine Power- oder eine Spezial-Stufe ansteht (4b).
 */
import { ANCIENTS } from '../game/ancients';
import { CREW } from '../game/heroes';

/** Standard- oder „Power"-Pose (Power = die angespannte Variante, 4a). */
export type AvatarPose = 'base' | 'power';

/** Die drei Farben, aus denen ein Portrait seine Identität zieht. */
export interface AvatarPalette {
  /** Haar-/Massen-Füllung. */
  readonly hair: string;
  /** Füllung des Signatur-Accessoires. */
  readonly accent: string;
  /** Rahmenfarbe der Portrait-Kachel (Mitglieds-Palette, 4b). */
  readonly frame: string;
}

type HeadShape = 'round' | 'oval' | 'wide' | 'tall' | 'square' | 'hex' | 'heart' | 'diamond';
type HairShape =
  'none' | 'crop' | 'bob' | 'afro' | 'mohawk' | 'bun' | 'tail' | 'long' | 'spike' | 'fringe';

/** Ein Signatur-Accessoire, aufgeteilt nach Zeichenreihenfolge. */
interface Signature {
  /** Hinter dem Kopf (Lorbeer, Pompons, Solarpanel …). */
  readonly behind?: string;
  /** Vor dem Kopf (Krone, Brille, Handy …). */
  readonly front?: string;
  /** Brillen verdecken die Augen — dann werden sie gar nicht erst gezeichnet. */
  readonly hideEyes?: boolean;
  /** Füllung der Kopfform (nur die kosmische Entität nutzt das). */
  readonly headFill?: string;
}

/** Der vollständige Bauplan eines Portraits. */
export interface AvatarSpec {
  readonly head: HeadShape;
  readonly hair: HairShape;
  readonly palette: AvatarPalette;
  readonly sig: Signature;
}

// ---------------------------------------------------------------------------
// Geometrie-Bausteine — alles im viewBox „0 0 24 24", Kopf um (12, 10), r ≈ 5.6
// ---------------------------------------------------------------------------

/** Fünfzackiger Stern als Pfad (für Sternbrille und Sternennebel). */
function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function headShape(kind: HeadShape, fill: string): string {
  const f = ` fill="${fill}"`;
  switch (kind) {
    case 'round':
      return `<circle cx="12" cy="10" r="5.6"${f}/>`;
    case 'oval':
      return `<ellipse cx="12" cy="10" rx="4.9" ry="6"${f}/>`;
    case 'wide':
      return `<ellipse cx="12" cy="10.2" rx="6.1" ry="5.2"${f}/>`;
    case 'tall':
      return `<ellipse cx="12" cy="9.8" rx="4.4" ry="6.4"${f}/>`;
    case 'square':
      return `<rect x="6.5" y="4.6" width="11" height="11" rx="3.2"${f}/>`;
    case 'hex':
      return `<path d="M12 4.2 17.4 7.2v6l-5.4 3-5.4-3v-6Z"${f}/>`;
    case 'heart':
      return `<path d="M6.4 8.6a5.6 5.6 0 0 1 11.2 0c0 3.8-3 5.8-5.6 7.4-2.6-1.6-5.6-3.6-5.6-7.4Z"${f}/>`;
    case 'diamond':
      return `<path d="M12 4 17.8 10 12 16 6.2 10Z"${f}/>`;
  }
}

function hairShape(kind: HairShape, c: string): string {
  const f = ` fill="${c}"`;
  switch (kind) {
    case 'none':
      return '';
    case 'crop':
      return `<path d="M6.6 9.2C6.6 5.4 9 3.4 12 3.4s5.4 2 5.4 5.8c-1-1.8-1.8-2.8-3-3.2-1.6 1.4-4.6 2-7.8 3.2Z"${f}/>`;
    case 'bob':
      return (
        `<path d="M6 10.6C5.2 5.8 8.2 3.2 12 3.2s6.8 2.6 6 7.4l-1.8-.4C16.8 6.8 14.8 5.2 12 5.2S7.2 6.8 7.8 10.2Z"${f}/>` +
        `<path d="M6 10.6c-.5 2.2-.2 3.9.5 5l1.7-1.4-.6-3.9Zm12 0c.5 2.2.2 3.9-.5 5l-1.7-1.4.6-3.9Z"${f}/>`
      );
    case 'afro':
      return `<path d="M12 1.4c3.9 0 6.9 2.9 6.9 6.5 0 1.8-.7 3.3-1.9 4.4.6-4.7-1.6-7.5-5-7.5S6.4 7.6 7 12.3C5.8 11.2 5.1 9.7 5.1 7.9c0-3.6 3-6.5 6.9-6.5Z"${f}/>`;
    case 'mohawk':
      return `<path d="M12 .8c1.8 1.7 2.6 4.1 2.6 7.4h-5.2C9.4 4.9 10.2 2.5 12 .8Z"${f}/>`;
    case 'bun':
      return (
        `<circle cx="12" cy="2.4" r="2"${f}/>` +
        `<path d="M6.8 8.8C7 5.2 9.2 3.6 12 3.6s5 1.6 5.2 5.2c-1.2-2-3-2.9-5.2-2.9s-4 .9-5.2 2.9Z"${f}/>`
      );
    case 'tail':
      return (
        `<path d="M6.8 9C6.9 5.3 9.2 3.4 12 3.4s5.1 1.9 5.2 5.6c-1.1-1.9-2-2.8-3.1-3.2-1.5 1.4-4.3 2-7.3 3.2Z"${f}/>` +
        `<path d="M17 6.6c2.6.4 4.2 2.4 4 5.4-.2 2.6-1.4 4-2.8 4.6.9-1.9 1.1-3.4.8-5-.3-1.7-1.1-3.2-2-5Z"${f}/>`
      );
    case 'long':
      return (
        `<path d="M6.1 9.5C6.1 5.4 8.7 3.1 12 3.1s5.9 2.3 5.9 6.4l-1.6-.5C16.3 6.4 14.4 5 12 5S7.7 6.4 7.7 9Z"${f}/>` +
        `<path d="M6.1 9.5c-.6 3.4-.6 6.5.2 9.2l2.3-.8-.9-8.4Zm11.8 0c.6 3.4.6 6.5-.2 9.2l-2.3-.8.9-8.4Z"${f}/>`
      );
    case 'spike':
      return `<path d="M6.4 9.4 6 5.2l2.5 2.3.8-4.1 2 3 1.9-3.4.9 4 2.2-2.3.3 4.5c-1.4-2-3-3-4.6-3s-3.2 1-4.6 3Z"${f}/>`;
    case 'fringe':
      return `<path d="M6.5 9.1c0-3.6 2.4-5.7 5.5-5.7s5.5 2.1 5.5 5.7l-11 .6Z"${f}/>`;
  }
}

/** Neutrales Gesicht (Augen + Lächeln) bzw. das angespannte Power-Gesicht. */
function face(pose: AvatarPose, hideEyes: boolean): string {
  const eyes = hideEyes
    ? ''
    : pose === 'power'
      ? `<path d="M9.1 10.2h1.7M13.2 10.2h1.7"/>` +
        `<path d="M8.6 7.9 10.9 8.9M15.4 7.9 13.1 8.9"/>`
      : `<circle cx="9.9" cy="9.9" r=".85" fill="currentColor" stroke="none"/>` +
        `<circle cx="14.1" cy="9.9" r=".85" fill="currentColor" stroke="none"/>`;
  const mouth =
    pose === 'power'
      ? `<ellipse cx="12" cy="13" rx="1.6" ry="1.2" fill="currentColor" stroke="none"/>`
      : `<path d="M10.2 12.6c1 .9 2.6.9 3.6 0"/>`;
  return eyes + mouth;
}

/**
 * Hals + Schultern. Die Power-Variante ist eine reine SILHOUETTEN-Anspannung:
 * kurzer Hals, deutlich breitere und kantigere Schultern, Trapez-Falten und ein
 * vorgewölbter Brustbogen — dazu (in `portraitBody`) eine kräftigere Strichdicke.
 *
 * Bewusst KEINE Fäuste/Funken vor der Brust und keine Ecken-Funken: an genau
 * diesen Stellen sitzen bei der Hälfte des Kaders die Signatur-Accessoires
 * (Klemmbrett, Dreizack, Solarpanel, Mischpult …). Ein früher Entwurf mit zwei
 * Fäusten links und rechts eines Brustbeins las sich im Beweis-Screenshot als
 * „oIo" statt als Muskel — die Silhouette allein trägt den Unterschied besser.
 */
function body(pose: AvatarPose): string {
  if (pose === 'power') {
    return (
      // kurzer Hals — der Kopf sitzt tief zwischen den Schultern
      `<path d="M10.6 15.3v1.5M13.4 15.3v1.5"/>` +
      // breite, kantige Schulterpartie bis an den Rahmen
      `<path d="M1.7 23.6c0-3 .9-5.1 2.7-6.2 1.7-1 3.5-1.6 5.2-2.1M22.3 23.6c0-3-.9-5.1-2.7-6.2-1.7-1-3.5-1.6-5.2-2.1"/>` +
      // Trapez-Falten
      `<path d="M4.4 17.4c1.8.4 3.4 0 4.8-1.1M19.6 17.4c-1.8.4-3.4 0-4.8-1.1"/>` +
      // vorgewölbter Brustbogen
      `<path d="M7.3 23.6c.5-2.8 2.1-4.3 4.7-4.3s4.2 1.5 4.7 4.3"/>`
    );
  }
  return (
    `<path d="M10.4 15.3v2.4M13.6 15.3v2.4"/>` +
    `<path d="M3.8 23.6c0-3.4 3.7-5.4 8.2-5.4s8.2 2 8.2 5.4"/>`
  );
}

// ---------------------------------------------------------------------------
// Die Signaturen — EIN Accessoire je Charakter (IDEEN-GAMEPLAY 4a)
// ---------------------------------------------------------------------------

type SigFn = (p: AvatarPalette) => Signature;

const SIGNATURES: Record<string, SigFn> = {
  // ---- Crew (15) ----
  /** Booty-Boss: Krone, schief aufgesetzt. */
  boss: (p) => ({
    front: `<g transform="rotate(-14 12 4.4)"><path d="M7.2 4.6 6.3 1 9.1 3 12 .4 14.9 3l2.8-2-.9 3.6Z" fill="${p.accent}"/><path d="M7.2 5.9h9.6"/></g>`,
  }),
  /** Hype-Girl: zwei Pompons. */
  hype: (p) => ({
    behind:
      `<circle cx="3.6" cy="11" r="2.6" fill="${p.accent}"/><circle cx="20.4" cy="11" r="2.6" fill="${p.accent}"/>` +
      `<path d="M3.6 8v-1.8M1 9.4 .1 8.2M6.2 9.4l.9-1.2M3.6 14v1.8M20.4 8v-1.8M23 9.4l.9-1.2M17.8 9.4l-.9-1.2M20.4 14v1.8"/>`,
  }),
  /** DJ Wumms: Kopfhörer. */
  dj: (p) => ({
    front:
      `<path d="M5.7 10.4V9.2a6.3 6.3 0 0 1 12.6 0v1.2"/>` +
      `<rect x="3.6" y="9.6" width="3.3" height="4.8" rx="1.5" fill="${p.accent}"/>` +
      `<rect x="17.1" y="9.6" width="3.3" height="4.8" rx="1.5" fill="${p.accent}"/>`,
  }),
  /** Türsteher: Sonnenbrille. */
  bouncer: (p) => ({
    hideEyes: true,
    front:
      `<path d="M6 8.7h12"/>` +
      `<rect x="6.2" y="8.7" width="4.7" height="3.3" rx="1.2" fill="${p.accent}"/>` +
      `<rect x="13.1" y="8.7" width="4.7" height="3.3" rx="1.2" fill="${p.accent}"/>` +
      `<path d="M10.9 10.1h2.2"/>`,
  }),
  /** Insta-Influencerin: Handy im Selfie-Arm + Blitz. */
  influencer: (p) => ({
    front:
      `<rect x="18.4" y="7.4" width="4.8" height="8" rx="1.2" fill="${p.accent}"/>` +
      `<path d="M19.7 9h2.2M19.7 11h2.2M19.7 13h1.4"/>` +
      `<path d="M18.6 5.6 17.2 6.9M17.6 4.2v1.5M20.4 5.3l-.7 1.3"/>` +
      `<path d="M18.4 15.4c-1.2 2.2-2.6 3.2-4.4 3.4"/>`,
  }),
  /** Star-Choreograph: Klemmbrett. */
  choreo: (p) => ({
    front:
      `<rect x="1.6" y="11.2" width="6" height="7.6" rx="1" fill="${p.accent}"/>` +
      `<path d="M3.2 11.2v-1h2.8v1"/>` +
      `<path d="M2.9 13.6h3.4M2.9 15.2h3.4M2.9 16.8h2.2"/>`,
  }),
  /** Musik-Produzent: Mischpult-Fader. */
  producer: (p) => ({
    front:
      `<rect x="16.6" y="12.4" width="6.8" height="6.6" rx="1.2" fill="${p.accent}"/>` +
      `<path d="M18.2 13.8v3.8M20 13.8v3.8M21.8 13.8v3.8"/>` +
      `<circle cx="18.2" cy="16.6" r=".95" fill="currentColor" stroke="none"/>` +
      `<circle cx="20" cy="14.9" r=".95" fill="currentColor" stroke="none"/>` +
      `<circle cx="21.8" cy="16" r=".95" fill="currentColor" stroke="none"/>`,
  }),
  /** A-Promi: Sternbrille. */
  promi: (p) => ({
    hideEyes: true,
    front:
      `<path d="M5.4 8.6h13.2"/>` +
      `<path d="${star(9.3, 10.2, 3.1)}" fill="${p.accent}"/>` +
      `<circle cx="15.4" cy="10.2" r="2.5" fill="${p.accent}"/>` +
      `<path d="M12.3 9.6h.6"/>`,
  }),
  /** Club-Tycoon: Anzugkragen + Zigarre. */
  tycoon: (p) => ({
    front:
      `<path d="M9.4 16 12 19.6 14.6 16"/>` +
      `<path d="M9.4 16 6 23.4M14.6 16 18 23.4"/>` +
      `<path d="M11.4 19.6v4"/>` +
      `<path d="M14.2 12.9h4" stroke="${p.accent}" stroke-width="2.6"/>` +
      `<circle cx="18.6" cy="12.9" r=".9" fill="#ff8d5e" stroke="none"/>` +
      `<path d="M19.9 11.5c1-.8.2-1.9 1.2-2.7"/>`,
  }),
  /** Twerk-Legende: Lorbeerkranz. */
  legend: (p) => ({
    behind:
      `<path d="M4.6 13.4C2.5 10.2 3.4 5.7 6.6 3.2M19.4 13.4c2.1-3.2 1.2-7.7-2-10.2"/>` +
      `<g fill="${p.accent}" stroke="none">` +
      `<ellipse cx="4.5" cy="11.4" rx="1.7" ry=".85" transform="rotate(-68 4.5 11.4)"/>` +
      `<ellipse cx="4.7" cy="8.2" rx="1.7" ry=".85" transform="rotate(-52 4.7 8.2)"/>` +
      `<ellipse cx="6" cy="5.4" rx="1.7" ry=".85" transform="rotate(-34 6 5.4)"/>` +
      `<ellipse cx="19.5" cy="11.4" rx="1.7" ry=".85" transform="rotate(68 19.5 11.4)"/>` +
      `<ellipse cx="19.3" cy="8.2" rx="1.7" ry=".85" transform="rotate(52 19.3 8.2)"/>` +
      `<ellipse cx="18" cy="5.4" rx="1.7" ry=".85" transform="rotate(34 18 5.4)"/>` +
      `</g>`,
  }),
  /** Viral-Video-Team: Antenne mit Sende-Wellen. */
  viral: (p) => ({
    behind:
      `<path d="M12 4.2V2.4"/><circle cx="12" cy="1.4" r="1.1" fill="${p.accent}"/>` +
      `<path d="M8.9 3A3.6 3.6 0 0 1 9.6 .6M15.1 3a3.6 3.6 0 0 0-.7-2.4"/>`,
  }),
  /** Hologramm-Double: Scanlines + versetztes Geist-Profil. */
  hologram: (p) => ({
    behind: `<circle cx="13.6" cy="10" r="5.6" stroke="${p.accent}" opacity=".55"/>`,
    front:
      `<g stroke="${p.accent}" stroke-width="1"><path d="M7.4 7.4h9.2M6.6 10.6h10.8M7.4 13.6h9.2"/></g>` +
      `<path d="M8.2 16.8h7.6"/>`,
  }),
  /** KI-Choreo-Cluster: Chip auf der Stirn. */
  aicluster: (p) => ({
    front:
      `<rect x="9.5" y="4.9" width="5" height="3.2" rx=".7" fill="${p.accent}"/>` +
      `<path d="M10.7 4.9V3.7M13.3 4.9V3.7M9.5 5.9H8.2M9.5 7.1H8.2M14.5 5.9h1.3M14.5 7.1h1.3"/>` +
      `<circle cx="12" cy="6.5" r=".75" fill="currentColor" stroke="none"/>`,
  }),
  /** Orbitale Tanz-Station: Solarpanel-Flügel. */
  orbital: (p) => ({
    behind:
      `<path d="M5.4 10.2H6.8M17.2 10.2h1.4"/>` +
      `<rect x="1" y="7.4" width="4.6" height="5.6" rx=".5" fill="${p.accent}"/>` +
      `<rect x="18.4" y="7.4" width="4.6" height="5.6" rx=".5" fill="${p.accent}"/>` +
      `<path d="M1 10.2h4.6M3.3 7.4V13M18.4 10.2H23M20.7 7.4V13"/>`,
  }),
  /** Kosmische Twerk-Entität: Sternennebel im Kopf (Sterne SIND das Gesicht). */
  cosmic: (p) => ({
    headFill: p.accent,
    hideEyes: true,
    front:
      `<g fill="${p.hair}" stroke="none">` +
      `<path d="${star(9.8, 9.4, 1.7)}"/><path d="${star(14.2, 9.4, 1.7)}"/>` +
      `<path d="${star(12, 5.9, 1)}"/><path d="${star(15.1, 12.9, 0.9)}"/>` +
      `</g>` +
      `<path d="M9.6 12.6c1.6 1 3.2 1 4.8 0" stroke="${p.hair}"/>` +
      `<ellipse cx="12" cy="10" rx="8.4" ry="2.8" transform="rotate(-22 12 10)" opacity=".85"/>`,
  }),

  // ---- Twerk-Ahnen (10) ----
  /** Twerkules: Lorbeer + Bart. */
  twerkules: (p) => ({
    behind:
      `<path d="M4.8 12.6C3.1 9.9 3.9 6 6.7 3.9M19.2 12.6c1.7-2.7.9-6.6-1.9-8.7"/>` +
      `<g fill="${p.accent}" stroke="none">` +
      `<ellipse cx="4.6" cy="10.6" rx="1.6" ry=".8" transform="rotate(-66 4.6 10.6)"/>` +
      `<ellipse cx="5" cy="7.6" rx="1.6" ry=".8" transform="rotate(-48 5 7.6)"/>` +
      `<ellipse cx="6.4" cy="5.2" rx="1.6" ry=".8" transform="rotate(-30 6.4 5.2)"/>` +
      `<ellipse cx="19.4" cy="10.6" rx="1.6" ry=".8" transform="rotate(66 19.4 10.6)"/>` +
      `<ellipse cx="19" cy="7.6" rx="1.6" ry=".8" transform="rotate(48 19 7.6)"/>` +
      `<ellipse cx="17.6" cy="5.2" rx="1.6" ry=".8" transform="rotate(30 17.6 5.2)"/>` +
      `</g>`,
    front: `<path d="M7.2 11.4c.4 4.6 2.2 7 4.8 7s4.4-2.4 4.8-7c-1.5 1.8-3.1 2.5-4.8 2.5s-3.3-.7-4.8-2.5Z" fill="${p.hair}"/>`,
  }),
  /** Poposeidon: Dreizack + Wellenbart. */
  poposeidon: (p) => ({
    behind:
      `<path d="M20.8 23V4.6"/>` +
      `<path d="M18.4 7.2V3.8M23.2 7.2V3.8M18.4 6.4h4.8M20.8 4.6V2.6" stroke="${p.accent}" stroke-width="1.6"/>`,
    front: `<path d="M7.6 12.4c1 1 1.4 2.6.8 3.6.9.4 1.6 1.4 1.4 2.4 1.4-.4 2.6.2 3 1.2.6-1 1.8-1.6 3-1.2-.2-1 .5-2 1.4-2.4-.6-1-.2-2.6.8-3.6-1.6 1.4-8.8 1.4-10.4 0Z" fill="${p.hair}"/>`,
  }),
  /** Cheeksana: das Auge des Sturms auf der Stirn. */
  cheeksana: (p) => ({
    front:
      `<g stroke="${p.accent}" stroke-width="1.5">` +
      `<circle cx="12" cy="6.4" r="1.3"/>` +
      `<path d="M13.3 6.4c0 2.3-2 3.6-4 3M10.7 6.4c0-2.3 2-3.6 4-3"/>` +
      `</g>`,
  }),
  /** Glutaeus Maximus: Gladiatoren-Helm mit Kamm. */
  glutaeus: (p) => ({
    front:
      `<path d="M6.3 9.6a5.7 5.7 0 0 1 11.4 0Z" fill="${p.accent}"/>` +
      `<path d="M12 4.1c1.6-2.4 4-3.2 7.2-2.4-1.2 2.6-3.6 3.9-7.2 3.9Z" fill="${p.accent}"/>` +
      `<path d="M12 8.4v6.6" stroke-width="1.7"/>`,
  }),
  /** Chronilla: Sanduhr + Zeiger auf der Stirn. */
  chronilla: (p) => ({
    front:
      `<path d="M18.2 4h4.8l-2.4 4.2 2.4 4.2h-4.8l2.4-4.2Z" fill="${p.accent}"/>` +
      `<path d="M18.2 4h4.8M18.2 12.4h4.8"/>` +
      `<circle cx="12" cy="6.6" r="1.9"/><path d="M12 5.4v1.2l1 .6"/>`,
  }),
  /** Peachiel: Heiligenschein + Engelsflügel. */
  peachiel: (p) => ({
    behind:
      `<ellipse cx="12" cy="2.6" rx="4.4" ry="1.5" fill="none" stroke="${p.accent}" stroke-width="1.6"/>` +
      `<path d="M16.4 11.4c3.6.2 6.2 2.6 6.8 6.6-1.4-1.2-2.8-1.8-4.2-1.8 1 1.6 1.2 3.4.6 5.2-1.4-2.6-3.4-4.4-6-5.4Z" fill="${p.accent}"/>` +
      `<path d="M18.6 13.6c1.2.6 2.2 1.6 2.8 3M17.6 17c.9.9 1.5 2 1.8 3.2"/>`,
  }),
  /** Wackelias: Anker — der Unerschütterliche. */
  wackelias: (p) => ({
    front:
      `<g stroke="${p.accent}" stroke-width="1.7"><path d="M20.4 7.4v10.8M17.4 10.2h6M16.9 14.4c.3 3 1.9 4.6 3.5 4.6s3.2-1.6 3.5-4.6"/></g>` +
      `<circle cx="20.4" cy="5.9" r="1.5" stroke="${p.accent}" stroke-width="1.7"/>`,
  }),
  /** Beatrix: Taktstock + Achtelnote. */
  beatrix: (p) => ({
    front:
      `<path d="M2.8 18.4 8.2 12.6" stroke="${p.accent}" stroke-width="1.7"/>` +
      `<circle cx="2.4" cy="19" r="1.2" fill="${p.accent}" stroke="none"/>` +
      `<path d="M18.2 12.4V4.8c2 .4 3.2 1.5 3.7 3.1" stroke="${p.accent}" stroke-width="1.5"/>` +
      `<ellipse cx="16.7" cy="12.7" rx="1.8" ry="1.4" transform="rotate(-18 16.7 12.7)" fill="${p.accent}" stroke="${p.accent}"/>`,
  }),
  /** Truhilda: der Schlüssel der Schatzmeisterin. */
  truhilda: (p) => ({
    front:
      `<circle cx="3.6" cy="10.4" r="2.4" fill="${p.accent}"/>` +
      `<circle cx="3.6" cy="10.4" r=".8" fill="none" stroke="currentColor"/>` +
      `<path d="M3.6 12.8v7.4M3.6 16.6h2.8M3.6 18.8h2.2" stroke-width="1.6"/>`,
  }),
  /** Ekstasius: entfesselte Flammenkrone. */
  ekstasius: (p) => ({
    behind: `<path d="M12 .6c1.6 2 1.4 3.6.6 5 1.6-.6 2.4-2 2.4-3.6 1.8 2 2.4 4.2 1.8 6.4 1.4-.8 2-2 2.2-3.4 1 2.6.6 5-1.2 7H6.2c-1.8-2-2.2-4.4-1.2-7 .2 1.4.8 2.6 2.2 3.4-.6-2.2 0-4.4 1.8-6.4 0 1.6.8 3 2.4 3.6-.8-1.4-1-3 .6-5Z" fill="${p.accent}"/>`,
  }),
};

/** Generische Signatur für unbekannte Ids — ein Funken-Trio. */
function fallbackSig(p: AvatarPalette): Signature {
  return {
    front: `<path d="${star(19.4, 5.4, 2.2)}" fill="${p.accent}"/><path d="M4.4 5.2v2.2M3.3 6.3h2.2"/>`,
  };
}

// ---------------------------------------------------------------------------
// Zuordnung Id → Bauplan
// ---------------------------------------------------------------------------

interface TableEntry {
  readonly head: HeadShape;
  readonly hair: HairShape;
  readonly palette: AvatarPalette;
}

const pal = (hair: string, accent: string, frame: string): AvatarPalette => ({
  hair,
  accent,
  frame,
});

/**
 * Die handgesetzte Zuordnung. Kopfform und Frisur variieren quer über den
 * Kader, damit sich zwei Portraits nie nur über ihr Accessoire unterscheiden.
 */
const AVATAR_TABLE: Record<string, TableEntry> = {
  // ---- Crew ----
  boss: { head: 'round', hair: 'crop', palette: pal('#5a3213', '#ffcf5e', '#ffcf5e') },
  hype: { head: 'heart', hair: 'tail', palette: pal('#8a4a1e', '#ff6ab0', '#ff6ab0') },
  dj: { head: 'square', hair: 'mohawk', palette: pal('#2c2f3a', '#6ec3e3', '#6ec3e3') },
  bouncer: { head: 'wide', hair: 'none', palette: pal('#3a2c1c', '#2b3242', '#8c98ac') },
  influencer: { head: 'oval', hair: 'long', palette: pal('#c8862c', '#c07bff', '#c07bff') },
  choreo: { head: 'tall', hair: 'bun', palette: pal('#20242e', '#a8e831', '#a8e831') },
  producer: { head: 'round', hair: 'afro', palette: pal('#241a12', '#5ecdb0', '#5ecdb0') },
  promi: { head: 'oval', hair: 'bob', palette: pal('#e0c27a', '#f7c948', '#ffe08a') },
  tycoon: { head: 'square', hair: 'fringe', palette: pal('#4a3a24', '#8a5a2c', '#c98a3c') },
  legend: { head: 'heart', hair: 'long', palette: pal('#6b3d16', '#b8d96a', '#b8d96a') },
  viral: { head: 'wide', hair: 'crop', palette: pal('#c0492b', '#ff8d5e', '#ff8d5e') },
  hologram: { head: 'oval', hair: 'bob', palette: pal('#1d5866', '#67e8f9', '#67e8f9') },
  aicluster: { head: 'hex', hair: 'none', palette: pal('#2a3550', '#8b9bff', '#8b9bff') },
  orbital: { head: 'square', hair: 'crop', palette: pal('#26364f', '#4d9fff', '#4d9fff') },
  cosmic: { head: 'diamond', hair: 'none', palette: pal('#ffe9a3', '#3b1f66', '#b06bff') },

  // ---- Twerk-Ahnen ----
  twerkules: { head: 'square', hair: 'crop', palette: pal('#7d5a2e', '#d8c06a', '#d8c06a') },
  poposeidon: { head: 'wide', hair: 'long', palette: pal('#4d7f96', '#7fd4e8', '#3fa9c8') },
  cheeksana: { head: 'oval', hair: 'bob', palette: pal('#3a4658', '#9fd8e8', '#9fd8e8') },
  glutaeus: { head: 'square', hair: 'none', palette: pal('#3d2415', '#c05a3a', '#c05a3a') },
  chronilla: { head: 'heart', hair: 'bun', palette: pal('#5a4270', '#c6a8f0', '#c6a8f0') },
  peachiel: { head: 'round', hair: 'fringe', palette: pal('#e8c66a', '#ffd24d', '#ffd24d') },
  wackelias: { head: 'hex', hair: 'crop', palette: pal('#4a4a52', '#9aa6b4', '#9aa6b4') },
  beatrix: { head: 'tall', hair: 'tail', palette: pal('#8a2c4c', '#ff7fb0', '#ff7fb0') },
  truhilda: { head: 'round', hair: 'bob', palette: pal('#8a5a1e', '#f0c04a', '#f0c04a') },
  ekstasius: { head: 'diamond', hair: 'none', palette: pal('#5a1030', '#ff5ea0', '#ff5ea0') },
};

const HEADS: readonly HeadShape[] = [
  'round',
  'oval',
  'wide',
  'tall',
  'square',
  'hex',
  'heart',
  'diamond',
];
const HAIRS: readonly HairShape[] = [
  'crop',
  'bob',
  'afro',
  'mohawk',
  'bun',
  'tail',
  'long',
  'spike',
  'fringe',
];
const FALLBACK_HUES: readonly string[] = [
  '#ff6ab0',
  '#6ec3e3',
  '#a8e831',
  '#ffcf5e',
  '#c07bff',
  '#5ecdb0',
];

/** Stabiler 32-Bit-Hash über die Id (FNV-1a) — die Deterministik-Quelle. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Der Bauplan zu einer Id: aus `AVATAR_TABLE`, sonst deterministisch aus dem
 * Id-Hash. Ein neu erfundenes Mitglied bekommt so sofort ein stabiles Gesicht.
 */
/**
 * `true`, wenn die Id einen HANDGESETZTEN Bauplan hat (Kopf/Frisur/Palette in
 * `AVATAR_TABLE` UND eine eigene Signatur-Zeile). `false` heißt: das Portrait
 * kommt aus dem Id-Hash — ein Test hält damit fest, dass kein Roster-Mitglied
 * still durch den Fallback rutscht.
 */
export function hasHandSetPortrait(id: string): boolean {
  return AVATAR_TABLE[id] !== undefined && SIGNATURES[id] !== undefined;
}

export function avatarSpec(id: string): AvatarSpec {
  const t = AVATAR_TABLE[id];
  if (t)
    return {
      head: t.head,
      hair: t.hair,
      palette: t.palette,
      sig: (SIGNATURES[id] ?? fallbackSig)(t.palette),
    };
  const h = hashId(id);
  const accent = FALLBACK_HUES[h % FALLBACK_HUES.length];
  const palette = pal('#4a3a24', accent, accent);
  return {
    head: HEADS[(h >>> 3) % HEADS.length],
    hair: HAIRS[(h >>> 7) % HAIRS.length],
    palette,
    sig: (SIGNATURES[id] ?? fallbackSig)(palette),
  };
}

/** Die Rahmenfarbe eines Mitglieds (Crew-Card + Kachel-Rand, 4b). */
export function avatarFrame(id: string): string {
  return avatarSpec(id).palette.frame;
}

/**
 * Tier-Rahmen-Klasse einer Fähigkeits-Kachel (4b): je zwei Stufen eine Stufe
 * wertvoller — `tr1` Kupfer, `tr2` Silber, `tr3` Gold, `tr4` Platin, ab Stufe 9
 * `tr5` Prisma. Der Rahmen sagt WIE TIEF, die Sorten-Tönung sagt WAS, das
 * Portrait sagt WER.
 */
export function tierClass(tier: number): string {
  return `tr${Math.min(5, Math.max(1, Math.ceil(Math.max(1, tier) / 2)))}`;
}

// ---------------------------------------------------------------------------
// Sprite + Referenzen
// ---------------------------------------------------------------------------

/** Symbol-Id im Sprite (`av-<id>` bzw. `av-<id>-power`). */
export function avatarSymbolId(id: string, pose: AvatarPose = 'base'): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '');
  return pose === 'power' ? `av-${safe}-power` : `av-${safe}`;
}

/** Die Portrait-Geometrie einer Id/Pose (nur für den Sprite-Aufbau). */
function portraitBody(id: string, pose: AvatarPose): string {
  const s = avatarSpec(id);
  return (
    `<g fill="none" stroke="currentColor" stroke-width="${pose === 'power' ? '1.75' : '1.4'}" ` +
    `stroke-linecap="round" stroke-linejoin="round">` +
    (s.sig.behind ?? '') +
    body(pose) +
    headShape(s.head, s.sig.headFill ?? 'none') +
    hairShape(s.hair, s.palette.hair) +
    face(pose, s.sig.hideEyes === true) +
    (s.sig.front ?? '') +
    `</g>`
  );
}

/** Alle Ids, für die das Sprite Symbole mitbringt: Crew + Twerk-Ahnen. */
export const AVATAR_IDS: readonly string[] = [
  ...CREW.map((c) => c.id),
  ...ANCIENTS.map((a) => a.id),
];

/**
 * Das komplette `<symbol>`-Sprite (beide Posen je Id). Genau EINMAL pro Seite
 * ins DOM — die Zeilen referenzieren es per `<use>` (Guardrail 4b: die
 * Crew-Liste rebuildet im 0.25-s-Tick).
 */
export function avatarSpriteSvg(ids: readonly string[] = AVATAR_IDS): string {
  const syms: string[] = [];
  for (const id of ids) {
    for (const pose of ['base', 'power'] as const) {
      syms.push(
        `<symbol id="${avatarSymbolId(id, pose)}" viewBox="0 0 24 24">${portraitBody(id, pose)}</symbol>`,
      );
    }
  }
  return (
    `<svg id="avatarSprite" aria-hidden="true" focusable="false" ` +
    `style="position:absolute;width:0;height:0;overflow:hidden">${syms.join('')}</svg>`
  );
}

/** Idempotent: das Sprite genau einmal in den Body hängen. */
export function mountAvatarSprite(doc: Document = document): void {
  if (doc.getElementById('avatarSprite')) return;
  const host = doc.createElement('div');
  host.innerHTML = avatarSpriteSvg();
  const svg = host.firstElementChild;
  if (svg) doc.body.appendChild(svg);
}

/**
 * Das 48-px-Portrait einer Id als Markup — zwei Knoten, die auf das Sprite
 * zeigen. Größe und Rahmen kommen aus CSS (`.av`/`.av-sm`), die Farbe erbt sich
 * aus dem Umfeld (Pergament-Tinte in der Crew-Card, Gold-Tinte auf der Kachel).
 */
export function portraitSvg(id: string, pose: AvatarPose = 'base', cls = ''): string {
  return (
    `<svg class="av-svg${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" ` +
    `focusable="false"><use href="#${avatarSymbolId(id, pose)}"/></svg>`
  );
}

/**
 * Portrait plus Rahmen in der Mitglieds-Palette. `cls` wählt die Größe
 * (`av-lg` = 48 px auf der Crew-Card, ohne = 32 px).
 *
 * `frame` übersteuert die Rahmenfarbe (IDEEN-GAMEPLAY 1a: der Meisterschafts-
 * Rang malt Kupfer/Silber/Gold um das Portrait). `--av-frame` war dafür schon in
 * Schritt 4b als PER-ZEILE-Variable angelegt — hier wird der Haken nur
 * eingehängt, es ändert sich kein einziger Selektor. Der Legenden-Rang bekommt
 * seinen Regenbogen NICHT von hier, sondern von der Klasse `mr4`: eine
 * CSS-Animation schlägt in der Kaskade auch die Inline-Deklaration, also darf
 * die Variable ruhig gesetzt bleiben (sie ist der Fallback ohne Animation).
 */
export function portraitTile(
  id: string,
  pose: AvatarPose = 'base',
  cls = '',
  frame?: string,
): string {
  return (
    `<span class="av${cls ? ` ${cls}` : ''}" style="--av-frame:${frame ?? avatarFrame(id)}">` +
    `${portraitSvg(id, pose)}</span>`
  );
}
