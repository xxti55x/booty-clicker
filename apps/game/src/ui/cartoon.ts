/**
 * **Die Crew als Cartoon-Figuren.**
 *
 * Der Vorgänger dieses Moduls war ein Strich-Icon-Baukasten: EINE Schablone
 * (Kopfumriss, zwei Punktaugen, Lächeln, Schultern) für alle fünfzehn, variiert
 * über Kopfform, Frisur und ein kleines Accessoire. Groß gerendert und
 * nachgesehen war der Befund eindeutig — bei 32 px, der Größe in der
 * Fähigkeits-Kachel, waren die Portraits praktisch nicht zu unterscheiden. Das
 * Einzige, was trug, war der Rahmen.
 *
 * Hier gibt es deshalb keine Schablone mehr: **Jede Figur ist eine eigene
 * Zeichnung.** Was sie trotzdem zu einem Kader macht, sind vier feste Regeln —
 *
 * 1. **Die Platte trägt die Identität.** Jede Figur steht auf einer vollflächig
 *    gefüllten Kachel in ihrer eigenen Farbe. Das ist der einzige Kanal, der
 *    auch bei 32 px noch sicher funktioniert, wenn Gesichtszüge längst
 *    verschwimmen. Die fünfzehn Farben sind bewusst über den ganzen Kreis
 *    gestreut und in der Helligkeit gestaffelt — vier Figuren liegen im
 *    Blau-Violett-Feld und werden dort über Hell/Dunkel getrennt. Wie eng es
 *    dort wirklich wird, hat erst der Anker gezeigt: Die KI musste am Ende ganz
 *    aus dem Feld heraus ins Petrol ausweichen.
 * 2. **Die Silhouette trägt den Charakter.** Kopfhörer, Helm, Hut, Ring,
 *    Pompons: Jede Figur bricht die Kopfform anders auf. Zwei Portraits dürfen
 *    sich nie nur im Gesicht unterscheiden, denn das Gesicht ist genau das, was
 *    zuerst verloren geht.
 * 3. **Kräftige Outline, flache Füllung.** Cartoon heißt Fläche mit Kontur,
 *    nicht Kontur allein. Ein fester dunkler Strich ({@link INK}) hält die
 *    Figuren auf hellem Pergament wie auf dunklem Panel zusammen.
 * 4. **Zwei Posen.** `base` ist gelassen, `power` angespannt: gesenkte Brauen,
 *    offener Mund, breitere Schultern. Die Fähigkeits-Kachel zeigt damit weiter
 *    auf einen Blick, ob eine Power-Stufe ansteht.
 *
 * Der viewBox ist `0 0 32 32` statt der 24 des alten Baukastens — dieselbe
 * Anzeigegröße, aber genug Fläche, damit ein Gesicht ein Gesicht sein kann.
 * Ein `<symbol>` bringt seinen viewBox selbst mit, `<use>` skaliert korrekt;
 * die Crew-Symbole und die Ahnen-Symbole dürfen sich also unterscheiden.
 */

/** Die Kontur. Ein Ton für alle Figuren — er hält den Kader zusammen. */
export const INK = '#2f2036';

/** Die fünf Farben, aus denen eine Figur gebaut ist. */
export interface CartoonPalette {
  /** Die Kachelfüllung — der Kanal, der bei 32 px als Einziger überlebt. */
  readonly bg: string;
  readonly skin: string;
  readonly hair: string;
  /** Kleidung/Torso. */
  readonly fit: string;
  /** Requisit und Glanzlicht. */
  readonly acc: string;
}

const p = (bg: string, skin: string, hair: string, fit: string, acc: string): CartoonPalette => ({
  bg,
  skin,
  hair,
  fit,
  acc,
});

/**
 * Die Paletten.
 *
 * Die Reihenfolge ist die des Kaders, die Farbwahl folgt Regel 1: über den
 * Farbkreis gestreut, und wo zwei Figuren thematisch in dieselbe Ecke gehören
 * (Kosmos, KI, Orbit, Influencer sind alle blau-violett), trennt sie die
 * Helligkeit — hell-violett, indigo, sattes Blau, tiefes Violett.
 */
export const CARTOON_PALETTES: Record<string, CartoonPalette> = {
  boss: p('#f0a92c', '#f2c396', '#5a3213', '#7c3f9e', '#ffe9a8'),
  hype: p('#ff5ea8', '#e8b088', '#8a4a1e', '#ffd6e8', '#fff4fa'),
  dj: p('#2ec4e6', '#8a5c3a', '#231f2c', '#17414f', '#d6f4ff'),
  bouncer: p('#78859b', '#7a4f30', '#231a14', '#252b38', '#dde5f0'),
  influencer: p('#b06bff', '#efc9a4', '#d8a63c', '#ffffff', '#ff9ad4'),
  choreo: p('#9ede2a', '#c98a5c', '#20242e', '#2f3a26', '#f2ffd6'),
  producer: p('#2fbf9b', '#5c3a24', '#1a120c', '#123f36', '#c8fff0'),
  promi: p('#ffe4a8', '#f0cfae', '#e8d9a8', '#c94f7c', '#3a2b1a'),
  tycoon: p('#a8703a', '#d9a877', '#3a2a18', '#2c2119', '#f0c04a'),
  legend: p('#6f9b3f', '#c58a52', '#4a3116', '#20301a', '#e8f2c0'),
  viral: p('#f2571c', '#e0a878', '#8a3a1e', '#3a2018', '#ffe0c8'),
  hologram: p('#5ef0d0', '#7fd8e0', '#1d5866', '#0f3a44', '#ffffff'),
  aicluster: p('#1f6b7a', '#c8ccff', '#2a3550', '#20264a', '#e8ecff'),
  orbital: p('#1e5fd0', '#e8c9a8', '#26364f', '#dfe6f2', '#8fd0ff'),
  cosmic: p('#4c1d95', '#6d28d9', '#ffe9a3', '#1c0b38', '#ffe9a3'),
};

// ---------------------------------------------------------------------------
// Gemeinsame Bausteine
//
// Sie sind Werkzeug, nicht Schablone: Jede Figur greift sich, was sie braucht,
// und zeichnet den Rest selbst. Deshalb stehen hier nur Teile, die WIRKLICH bei
// vielen gleich aussehen dürfen (Platte, Hals) — kein Kopf, kein Gesicht.
// ---------------------------------------------------------------------------

type Pose = 'base' | 'power';

/** Die vollflächige Kachel in der Figurfarbe. */
function plate(c: CartoonPalette): string {
  return `<rect x="0" y="0" width="32" height="32" fill="${c.bg}"/>`;
}

/**
 * Schultern. `w` ist die halbe Breite an der Unterkante — schmal für die
 * Influencerin, breit für den Türsteher. Die Power-Pose legt ein Stück zu.
 */
function shoulders(c: CartoonPalette, pose: Pose, w = 9.6): string {
  const s = w + (pose === 'power' ? 1.9 : 0);
  const top = pose === 'power' ? 24.6 : 24;
  const l = (16 - s).toFixed(1);
  const r = (16 + s).toFixed(1);
  return (
    `<path d="M${l} 32C${l} ${(top + 1.6).toFixed(1)} ${(16 - s * 0.55).toFixed(1)} ${top} 16 ${top}` +
    `C${(16 + s * 0.55).toFixed(1)} ${top} ${r} ${(top + 1.6).toFixed(1)} ${r} 32Z" ` +
    `fill="${c.fit}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`
  );
}

/** Der Hals — kurz und breit in der Power-Pose. */
function neck(c: CartoonPalette, pose: Pose, y = 21.6): string {
  const half = pose === 'power' ? 3.2 : 2.6;
  const h = pose === 'power' ? 3.4 : 4.2;
  return `<rect x="${16 - half}" y="${y}" width="${half * 2}" height="${h}" fill="${c.skin}" stroke="${INK}" stroke-width="1.15"/>`;
}

/** Zwei runde Augen. */
function eyes(dx = 3.1, cy = 14.6, r = 1.2): string {
  return (
    `<circle cx="${16 - dx}" cy="${cy}" r="${r}" fill="${INK}"/>` +
    `<circle cx="${16 + dx}" cy="${cy}" r="${r}" fill="${INK}"/>`
  );
}

/** Gesenkte Brauen — der halbe Anteil der Power-Pose am Ausdruck. */
function brows(dx = 3.1, y = 12.1): string {
  return (
    `<path d="M${16 - dx - 1.7} ${y - 0.7}l3.2 1.2M${16 + dx + 1.7} ${y - 0.7}l-3.2 1.2" ` +
    `stroke="${INK}" stroke-width="1.3" stroke-linecap="round" fill="none"/>`
  );
}

/**
 * Der Mund. `base` lächelt als Bogen, `power` schreit als offene Fläche.
 *
 * Bewusst ein STRICH-Bogen und keine weiße Fläche: Ein weißes Oval mitten im
 * Gesicht liest sich bei kleinen Größen als Fremdkörper, nicht als Mund — so
 * war es im ersten Entwurf, und so sah es auch aus.
 */
function mouth(pose: Pose, cy = 18.4, w = 3.2): string {
  if (pose === 'power') {
    return (
      `<path d="M${16 - w * 0.72} ${cy - 0.6}h${(w * 1.44).toFixed(1)}a${(w * 0.72).toFixed(1)} ` +
      `${(w * 0.86).toFixed(1)} 0 0 1-${(w * 1.44).toFixed(1)} 0Z" fill="${INK}"/>`
    );
  }
  return (
    `<path d="M${16 - w} ${cy - 0.5}c${(w * 0.5).toFixed(1)} ${(w * 0.7).toFixed(1)} ` +
    `${(w * 1.5).toFixed(1)} ${(w * 0.7).toFixed(1)} ${(w * 2).toFixed(1)} 0" ` +
    `fill="none" stroke="${INK}" stroke-width="1.25" stroke-linecap="round"/>`
  );
}

/** Kurz für „Fläche mit Kontur" — das Grundmuster jeder Cartoon-Form. */
function fill(d: string, f: string, sw = 1.25): string {
  return `<path d="${d}" fill="${f}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------------------
// Die fünfzehn Figuren
//
// Je Id eine eigene Zeichnung. Die Reihenfolge im Markup ist überall dieselbe —
// hinter dem Kopf, Schultern, Hals, Kopf, Haar, Gesicht, Requisit — damit sich
// Überdeckungen vorhersagbar verhalten; alles andere darf abweichen.
// ---------------------------------------------------------------------------

type Figure = (c: CartoonPalette, pose: Pose) => string;

const FIGURES: Record<string, Figure> = {
  /** Der Spieler: Krone, Zahn-Grinsen, Goldkette. */
  boss: (c, pose) =>
    plate(c) +
    shoulders(c, pose, 10) +
    neck(c, pose) +
    fill('M16 6.6c4.6 0 7.7 3.3 7.7 8s-3.4 8.6-7.7 8.6-7.7-3.9-7.7-8.6 3.1-8 7.7-8Z', c.skin, 1.3) +
    fill(
      'M8.5 13.4C9 8.2 11.9 5.6 16 5.6s7 2.6 7.5 7.8c-1.7-1.9-3.2-2.9-4.7-3.1-1.9 1.7-5.3 2-10.3 3.1Z',
      c.hair,
      1.15,
    ) +
    fill('M9 8.6 7.4 2.2l4.4 2.9L16 1.2l4.2 3.9 4.4-2.9L23 8.6Z', c.acc, 1.25) +
    (pose === 'power' ? brows() : '') +
    eyes() +
    mouth(pose) +
    `<path d="M12.4 25.4c1.7 2.4 5.5 2.4 7.2 0" fill="none" stroke="${c.acc}" stroke-width="1.4" stroke-linecap="round"/>`,

  /** Hype-Girl: Pompons links und rechts, hohe Zöpfe, offener Jubel. */
  hype: (c, pose) =>
    plate(c) +
    `<circle cx="4.4" cy="12.4" r="4.1" fill="${c.acc}" stroke="${INK}" stroke-width="1.2"/>` +
    `<circle cx="27.6" cy="12.4" r="4.1" fill="${c.acc}" stroke="${INK}" stroke-width="1.2"/>` +
    shoulders(c, pose, 9.2) +
    neck(c, pose) +
    fill('M16 6.4c4.4 0 7.4 3.2 7.4 7.8S20 23 16 23s-7.4-4.2-7.4-8.8 3-7.8 7.4-7.8Z', c.skin, 1.3) +
    fill(
      'M8.6 14.2C7.8 7.6 11.2 4.2 16 4.2s8.2 3.4 7.4 10l-2-.7C22 8.9 19.5 6.6 16 6.6s-6 2.3-5.4 6.9Z',
      c.hair,
      1.15,
    ) +
    fill(
      'M10.4 5.4c-1.4-2-1.2-3.8.6-4.4 1.6-.5 2.8.5 3.4 2.6Zm11.2 0c1.4-2 1.2-3.8-.6-4.4-1.6-.5-2.8.5-3.4 2.6Z',
      c.hair,
      1.15,
    ) +
    (pose === 'power' ? brows(3.2, 12.4) : '') +
    eyes(3.2, 14.8) +
    (pose === 'power'
      ? mouth(pose, 18.6, 3.6)
      : `<path d="M13 18c1.5 2.6 4.5 2.6 6 0" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`),

  /** DJ Wumms: Over-Ear-Kopfhörer, Mohawk, Strichaugen. */
  dj: (c, pose) =>
    plate(c) +
    shoulders(c, pose, 9.8) +
    neck(c, pose, 21.2) +
    `<rect x="8.4" y="7.8" width="15.2" height="14.4" rx="4.6" fill="${c.skin}" stroke="${INK}" stroke-width="1.3"/>` +
    fill('M16 1.2c2.3 2.4 3.4 5.3 3.4 8.8h-6.8c0-3.5 1.1-6.4 3.4-8.8Z', c.hair, 1.15) +
    `<path d="M6.2 15.4a9.8 9.8 0 0 1 19.6 0" fill="none" stroke="${INK}" stroke-width="1.7"/>` +
    `<rect x="3" y="12.8" width="6" height="9.2" rx="3" fill="${c.acc}" stroke="${INK}" stroke-width="1.25"/>` +
    `<rect x="23" y="12.8" width="6" height="9.2" rx="3" fill="${c.acc}" stroke="${INK}" stroke-width="1.25"/>` +
    (pose === 'power'
      ? brows(3.2, 13.2) + eyes(3.2, 15.6, 1.15)
      : `<path d="M11.6 15.2h3.2M17.2 15.2h3.2" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`) +
    mouth(pose, 19, 2.8),

  /** Türsteher: Glatze, Sonnenbrille, Kinnbart, Ohrhörer, massive Schultern. */
  bouncer: (c, pose) =>
    plate(c) +
    shoulders(c, pose, 13.2) +
    neck(c, pose, 20.8) +
    fill(
      'M16 5.4c4.9 0 8.2 3.1 8.2 7.8S20.9 22.6 16 22.6 7.8 17.9 7.8 13.2 11.1 5.4 16 5.4Z',
      c.skin,
      1.3,
    ) +
    fill(
      'M11.8 18.4c1.3 1.5 2.6 2.3 4.2 2.3s2.9-.8 4.2-2.3c-.7 3.4-2.2 5.1-4.2 5.1s-3.5-1.7-4.2-5.1Z',
      c.hair,
      1.1,
    ) +
    `<path d="M7.4 12.2h17.2v2.9a2.5 2.5 0 0 1-2.5 2.5h-3.4a2 2 0 0 1-2-1.6l-.7-2.6-.7 2.6a2 2 0 0 1-2 1.6h-3.4a2.5 2.5 0 0 1-2.5-2.5Z" fill="${INK}"/>` +
    (pose === 'power'
      ? `<path d="M13.6 19.8h4.8" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`
      : '') +
    `<path d="M24 12.6c2.2 1.8 3 4.7 2.7 7.4" fill="none" stroke="${c.acc}" stroke-width="1.35" stroke-linecap="round"/>` +
    `<circle cx="26.8" cy="21.2" r="1.7" fill="${c.acc}" stroke="${INK}" stroke-width="1"/>`,

  /** Insta-Influencerin: langes Haar, Handy vor der Brust, Duckface. */
  influencer: (c, pose) =>
    plate(c) +
    fill(
      'M7.6 24.6c-1.4-5.6-1-11 .8-14.4l4 2.2-2.4 12.6Zm16.8 0c1.4-5.6 1-11-.8-14.4l-4 2.2 2.4 12.6Z',
      c.hair,
      1.15,
    ) +
    shoulders(c, pose, 8.8) +
    neck(c, pose, 21.4) +
    fill('M16 6c4.2 0 7 3.1 7 7.6S20.1 22.8 16 22.8 9 18.1 9 13.6 11.8 6 16 6Z', c.skin, 1.3) +
    fill(
      'M8.9 13.6C8.2 7.4 11.4 4 16 4s7.8 3.4 7.1 9.6l-2-.7C21.6 9 19.2 6.6 16 6.6s-5.6 2.4-5.1 6.3Z',
      c.hair,
      1.15,
    ) +
    (pose === 'power' ? brows(3, 12.4) : '') +
    eyes(3, 14.6, 1.15) +
    (pose === 'power'
      ? mouth(pose, 18.4, 3)
      : `<ellipse cx="16" cy="18.4" rx="1.5" ry="1.1" fill="${c.acc}" stroke="${INK}" stroke-width="1.05"/>`) +
    `<rect x="21.6" y="21.4" width="6.4" height="9.4" rx="1.5" fill="${c.fit}" stroke="${INK}" stroke-width="1.2" transform="rotate(14 24.8 26)"/>` +
    `<circle cx="23.4" cy="23.6" r="1" fill="${c.acc}"/>`,

  /** Star-Choreograph: Bandana, Dutt, Trillerpfeife. */
  choreo: (c, pose) =>
    plate(c) +
    fill(
      'M16 3.4c1.9 0 3.4 1.4 3.4 3.2s-1.5 3.2-3.4 3.2-3.4-1.4-3.4-3.2 1.5-3.2 3.4-3.2Z',
      c.hair,
      1.2,
    ) +
    shoulders(c, pose, 9.4) +
    neck(c, pose) +
    fill(
      'M16 7.6c4.1 0 6.9 3 6.9 7.4s-2.8 8.4-6.9 8.4-6.9-4-6.9-8.4 2.8-7.4 6.9-7.4Z',
      c.skin,
      1.3,
    ) +
    fill('M9.2 10.6h13.6l1.7 2.3-1.7 1.4H9.2l-1.7-1.4Z', c.fit, 1.2) +
    fill('M22.8 10.6 26.4 8.8l.9 2.4-3.4 1.8Z', c.fit, 1.1) +
    (pose === 'power' ? brows(2.9, 14.4) : '') +
    eyes(2.9, 16.2, 1.15) +
    mouth(pose, 19.4, 2.6) +
    `<circle cx="21.4" cy="26.4" r="2.5" fill="${c.acc}" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M18.9 26h-4.4" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>` +
    (pose === 'power' ? `<circle cx="21.4" cy="26.4" r="0.95" fill="${INK}"/>` : ''),

  /** Musik-Produzent: Afro, Nickelbrille, Fader-Regler an der Brust. */
  producer: (c, pose) =>
    plate(c) +
    fill(
      'M16 2.2c4.9 0 8.6 3.5 8.6 7.9 0 2.2-.9 4.1-2.4 5.5.8-5.7-2-9.1-6.2-9.1s-7 3.4-6.2 9.1C8.3 14.2 7.4 12.3 7.4 10.1c0-4.4 3.7-7.9 8.6-7.9Z',
      c.hair,
      1.2,
    ) +
    shoulders(c, pose, 9.8) +
    neck(c, pose) +
    fill(
      'M16 7.4c3.9 0 6.6 2.9 6.6 7.2s-2.7 8.2-6.6 8.2-6.6-3.9-6.6-8.2 2.7-7.2 6.6-7.2Z',
      c.skin,
      1.3,
    ) +
    `<circle cx="12.9" cy="14.6" r="2.3" fill="none" stroke="${INK}" stroke-width="1.2"/>` +
    `<circle cx="19.1" cy="14.6" r="2.3" fill="none" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M15.2 14.6h1.6" stroke="${INK}" stroke-width="1.1"/>` +
    (pose === 'power' ? brows(3.1, 11.6) : '') +
    mouth(pose, 18.8, 2.8) +
    `<path d="M11.4 26.6h9.2M11.4 29.4h9.2" stroke="${c.acc}" stroke-width="1.2" stroke-linecap="round"/>` +
    `<circle cx="14" cy="26.6" r="1.3" fill="${c.acc}" stroke="${INK}" stroke-width="1"/>` +
    `<circle cx="18.4" cy="29.4" r="1.3" fill="${c.acc}" stroke="${INK}" stroke-width="1"/>`,

  /** A-Promi: Bob, riesige Sonnenbrille, Sektglas. */
  promi: (c, pose) =>
    plate(c) +
    fill(
      'M7.8 22.4C6.4 15.2 9.4 4.6 16 4.6s9.6 10.6 8.2 17.8l-3-.6c1.2-6.2-.6-13.4-5.2-13.4S9.6 15.6 10.8 21.8Z',
      c.hair,
      1.2,
    ) +
    shoulders(c, pose, 9.2) +
    neck(c, pose) +
    fill('M16 6.8c4 0 6.8 3 6.8 7.4s-2.8 8.4-6.8 8.4-6.8-4-6.8-8.4 2.8-7.4 6.8-7.4Z', c.skin, 1.3) +
    `<path d="M8.2 12.4h15.6v3.5a3.1 3.1 0 0 1-3.1 3.1h-2.4a2.2 2.2 0 0 1-2.2-1.9l-.1-1-.1 1a2.2 2.2 0 0 1-2.2 1.9h-2.4a3.1 3.1 0 0 1-3.1-3.1Z" fill="${c.fit}" stroke="${INK}" stroke-width="1.15"/>` +
    mouth(pose, 20.6, 2.4) +
    fill('M22.4 24.4h5.2l-1.9 3.2v3.4h1.6v1.4h-4.6v-1.4h1.6v-3.4Z', c.acc, 1.1),

  /** Club-Tycoon: Fedora, Zigarre, Fliege. */
  tycoon: (c, pose) =>
    plate(c) +
    shoulders(c, pose, 11) +
    neck(c, pose, 21.8) +
    fill('M16 8c4.6 0 7.6 3 7.6 7.6s-3 8.2-7.6 8.2-7.6-3.6-7.6-8.2S11.4 8 16 8Z', c.skin, 1.3) +
    fill('M4.4 11.6h23.2v2H4.4Z', c.hair, 1.15) +
    fill('M9.6 11.6C9.6 6 12.2 3.4 16 3.4s6.4 2.6 6.4 8.2Z', c.hair, 1.2) +
    fill('M9.6 9.6h12.8v2H9.6Z', c.acc, 1.05) +
    (pose === 'power' ? brows(3.1, 14.4) : '') +
    eyes(3.1, 16, 1.15) +
    mouth(pose, 19.8, 2.6) +
    `<path d="M19.4 20.8h6.6" stroke="${c.acc}" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="26.6" cy="20.8" r="1.1" fill="#ff7a3c"/>` +
    fill('M12.4 25.4 15.4 27.6l-3 2.2Zm7.2 0L16.6 27.6l3 2.2Z', c.acc, 1.1) +
    `<circle cx="16" cy="27.6" r="1.1" fill="${c.acc}" stroke="${INK}" stroke-width="1"/>`,

  /** Twerk-Legende: Stirnband, langes Haar, Zen-Augen, Lorbeer. */
  legend: (c, pose) =>
    plate(c) +
    fill(
      'M8 25c-1.6-6-1.2-12 .6-15.6l3.8 2-2 13.6Zm16 0c1.6-6 1.2-12-.6-15.6l-3.8 2 2 13.6Z',
      c.hair,
      1.15,
    ) +
    fill(
      'M4.8 11.6c.6 3.4 2 5.6 4.2 6.6-2.4.3-4-1.9-4.2-6.6Zm22.4 0c-.6 3.4-2 5.6-4.2 6.6 2.4.3 4-1.9 4.2-6.6Z',
      c.acc,
      1.1,
    ) +
    shoulders(c, pose, 9.6) +
    neck(c, pose) +
    fill(
      'M16 6.4c4.1 0 6.9 3.1 6.9 7.6s-2.8 8.8-6.9 8.8-6.9-4.3-6.9-8.8 2.8-7.6 6.9-7.6Z',
      c.skin,
      1.3,
    ) +
    fill('M9 12.2C8.4 6.6 11.6 4 16 4s7.6 2.6 7 8.2Z', c.hair, 1.15) +
    fill('M8.6 12h14.8v2.4H8.6Z', c.fit, 1.15) +
    (pose === 'power'
      ? brows(3, 16.2) + eyes(3, 17.6, 1.1)
      : `<path d="M12 17.6c.7-1 1.9-1 2.6 0M17.4 17.6c.7-1 1.9-1 2.6 0" fill="none" stroke="${INK}" stroke-width="1.25" stroke-linecap="round"/>`) +
    mouth(pose, 20.4, 2.4),

  /** Viral-Video-Team: Cap verkehrt herum, Handy-Kamera, Blitz. */
  viral: (c, pose) =>
    plate(c) +
    shoulders(c, pose, 10.2) +
    neck(c, pose) +
    fill(
      'M16 6.8c4.2 0 7.1 3 7.1 7.5s-2.9 8.5-7.1 8.5-7.1-4-7.1-8.5S11.8 6.8 16 6.8Z',
      c.skin,
      1.3,
    ) +
    fill('M9 12.4C9 7.2 12 4.6 16 4.6s7 2.6 7 7.8Z', c.hair, 1.2) +
    fill('M9 12.4H4.6a1.6 1.6 0 0 1 0-3.2H9Z', c.hair, 1.15) +
    (pose === 'power' ? brows(3, 13.4) : '') +
    eyes(3, 15.4, 1.15) +
    mouth(pose, 19, 2.8) +
    `<rect x="20.4" y="22.6" width="9.2" height="7" rx="1.6" fill="${c.fit}" stroke="${INK}" stroke-width="1.2"/>` +
    `<circle cx="25" cy="26.1" r="2.1" fill="none" stroke="${c.acc}" stroke-width="1.3"/>` +
    fill('M4.4 20.6 8 20.6 6 24.2h2.6L3.8 29l1.4-4H3Z', c.acc, 1.05),

  /** Hologramm-Double: Scanlines, Glitch-Versatz, halbdurchsichtig. */
  hologram: (c, pose) =>
    plate(c) +
    shoulders(c, pose, 9.4) +
    neck(c, pose) +
    fill('M16 6.2c4.2 0 7 3.1 7 7.7s-2.8 8.9-7 8.9-7-4.3-7-8.9 2.8-7.7 7-7.7Z', c.skin, 1.3) +
    fill(
      'M9 13.8C8.3 7.4 11.6 4 16 4s7.7 3.4 7 9.8l-2-.7C21.6 9.1 19.2 6.7 16 6.7s-5.6 2.4-5 6.4Z',
      c.hair,
      1.15,
    ) +
    (pose === 'power' ? brows(3, 12.6) : '') +
    eyes(3, 14.8, 1.15) +
    mouth(pose, 18.4, 2.8) +
    `<g stroke="${c.acc}" stroke-width="0.75" opacity="0.55"><path d="M9.4 10.6h13.2M9.4 21.4h13.2"/></g>` +
    `<path d="M24.4 12.4h5M2.6 20h4.4" stroke="${c.acc}" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/>`,

  /** KI-Choreo-Cluster: Roboterkopf, LED-Balken, Antenne, Platinen-Spur. */
  aicluster: (c, pose) =>
    plate(c) +
    shoulders(c, pose, 10) +
    `<rect x="14.4" y="21" width="3.2" height="3.4" fill="${c.hair}" stroke="${INK}" stroke-width="1.1"/>` +
    `<path d="M16 1.6v3.4" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<circle cx="16" cy="1.6" r="1.6" fill="${c.acc}" stroke="${INK}" stroke-width="1.1"/>` +
    `<rect x="7.6" y="5.4" width="16.8" height="15.8" rx="4" fill="${c.skin}" stroke="${INK}" stroke-width="1.3"/>` +
    `<rect x="10" y="10.4" width="12" height="4.6" rx="1.6" fill="${c.hair}" stroke="${INK}" stroke-width="1.1"/>` +
    (pose === 'power'
      ? `<path d="M11.6 12.7h3.2M17.2 12.7h3.2" stroke="${c.acc}" stroke-width="1.8" stroke-linecap="round"/>`
      : `<circle cx="12.9" cy="12.7" r="1.25" fill="${c.acc}"/><circle cx="19.1" cy="12.7" r="1.25" fill="${c.acc}"/>`) +
    `<path d="M12.4 17.8h7.2" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>` +
    (pose === 'power'
      ? `<path d="M12.4 17.8v1.8h7.2v-1.8" fill="none" stroke="${INK}" stroke-width="1.2"/>`
      : '') +
    `<path d="M4.6 8.6h3v3M27.4 8.6h-3v3" fill="none" stroke="${c.acc}" stroke-width="1.2" stroke-linecap="round"/>` +
    `<path d="M4.6 18.4h3v-3M27.4 18.4h-3v-3" fill="none" stroke="${c.acc}" stroke-width="1.2" stroke-linecap="round"/>`,

  /** Orbitale Tanz-Station: Raumhelm mit Visier, Solarpanel-Flügel. */
  orbital: (c, pose) =>
    plate(c) +
    `<rect x="0.6" y="12" width="6.4" height="8.4" rx="1" fill="${c.acc}" stroke="${INK}" stroke-width="1.15"/>` +
    `<rect x="25" y="12" width="6.4" height="8.4" rx="1" fill="${c.acc}" stroke="${INK}" stroke-width="1.15"/>` +
    `<path d="M2.2 12v8.4M5.4 12v8.4M26.6 12v8.4M29.8 12v8.4" stroke="${INK}" stroke-width="0.85"/>` +
    `<path d="M7 16.2h1.4M23.6 16.2H25" stroke="${INK}" stroke-width="1.4"/>` +
    shoulders(c, pose, 9.6) +
    neck(c, pose, 21.4) +
    fill('M16 4.8c5 0 8.4 3.6 8.4 8.6s-3.4 9-8.4 9-8.4-4-8.4-9 3.4-8.6 8.4-8.6Z', c.fit, 1.3) +
    fill('M16 8c3.5 0 5.8 2.2 5.8 5.2S19.5 18 16 18s-5.8-1.8-5.8-4.8S12.5 8 16 8Z', c.hair, 1.2) +
    (pose === 'power'
      ? `<path d="M12.8 13h2.2M17 13h2.2" stroke="${c.acc}" stroke-width="1.5" stroke-linecap="round"/>`
      : `<path d="M11.4 11.6c1.6-1.4 4-2 6-1.6" fill="none" stroke="${c.acc}" stroke-width="1.3" stroke-linecap="round"/>`) +
    `<circle cx="16" cy="20.4" r="1.1" fill="${c.acc}"/>`,

  /** Kosmische Entität: Sternendiamant, Ring, glühende Augen. */
  cosmic: (c, pose) =>
    plate(c) +
    `<circle cx="6.4" cy="6" r="0.95" fill="${c.acc}"/><circle cx="26" cy="4.8" r="0.75" fill="${c.acc}"/>` +
    `<circle cx="28.4" cy="24.4" r="0.85" fill="${c.acc}"/><circle cx="4.2" cy="22" r="0.7" fill="${c.acc}"/>` +
    shoulders(c, pose, 9.8) +
    neck(c, pose, 21.4) +
    fill('M16 3.6 25.2 14.6 16 25.6 6.8 14.6Z', c.skin, 1.3) +
    `<ellipse cx="16" cy="15.4" rx="12.6" ry="3.5" fill="none" stroke="${c.hair}" stroke-width="1.6" transform="rotate(-17 16 15.4)"/>` +
    (pose === 'power'
      ? `<path d="M11.9 12.4l3.1 1.4M20.1 12.4l-3.1 1.4" stroke="${c.acc}" stroke-width="1.4" stroke-linecap="round"/>` +
        `<circle cx="13.1" cy="15" r="1.5" fill="${c.acc}"/><circle cx="18.9" cy="15" r="1.5" fill="${c.acc}"/>`
      : `<circle cx="13.1" cy="14.2" r="1.5" fill="${c.acc}"/><circle cx="18.9" cy="14.2" r="1.5" fill="${c.acc}"/>`) +
    (pose === 'power'
      ? `<path d="M13.6 19.2h4.8a2.4 2.4 0 0 1-4.8 0Z" fill="${c.acc}"/>`
      : `<path d="M13.6 18.6c1.4 1.7 3.4 1.7 4.8 0" fill="none" stroke="${c.acc}" stroke-width="1.35" stroke-linecap="round"/>`),
};

/** Trägt diese Id eine handgezeichnete Cartoon-Figur? */
export function hasCartoon(id: string): boolean {
  return FIGURES[id] !== undefined && CARTOON_PALETTES[id] !== undefined;
}

/** Alle Ids mit Cartoon-Figur, in Kader-Reihenfolge. */
export const CARTOON_IDS: readonly string[] = Object.keys(FIGURES);

/**
 * Die Zeichnung einer Figur (viewBox `0 0 32 32`) — leer für eine unbekannte
 * Id, damit ein neu erfundenes Mitglied hier nie wirft, sondern sichtbar
 * nichts liefert und auf das Strich-Portrait zurückfällt.
 */
export function cartoonBody(id: string, pose: Pose = 'base'): string {
  const f = FIGURES[id];
  const c = CARTOON_PALETTES[id];
  return f !== undefined && c !== undefined ? f(c, pose) : '';
}

/** Die Kachelfarbe einer Figur — auch der Vorgabewert ihres Rahmens. */
export function cartoonColor(id: string): string | undefined {
  return CARTOON_PALETTES[id]?.bg;
}

// ---------------------------------------------------------------------------
// Der Level-Rahmen
// ---------------------------------------------------------------------------

/**
 * Die Rahmenfarben der sechs Rangstufen (`levelTier` in `game/heroes`).
 *
 * Stufe 0 hat keine eigene Farbe — dort trägt das Portrait seine Figurfarbe,
 * so wie vorher. Erst ab der ersten Schwelle übernimmt das Metall, und ab der
 * letzten schimmert der Rahmen (die Animation steht im Stylesheet, weil eine
 * Inline-Farbe sie nicht ersetzen kann).
 *
 * **Warum der Rahmen dem Level gehört und nicht mehr der Meisterschaft.** Zwei
 * Fortschritte können nicht denselben Kanal belegen, und von beiden ist das
 * Level das, was man beim Kaufen steuert und was über den crew-weiten Faktor
 * entscheidet. Die Meisterschaft behält ihren Schein um die Kachel und ihre
 * Zeile unter dem Namen — sie verliert nur die Rahmenfarbe.
 */
export const LEVEL_FRAMES: readonly string[] = [
  '', // Stufe 0: die Figurfarbe bleibt stehen
  '#c87f43', // Bronze — ab Level 25
  '#c3ccd6', // Silber — ab 50
  '#f2c33c', // Gold — ab 100
  '#7fe3ff', // Diamant — ab 200
  '#ff6ab0', // Prisma — ab 250, im Stylesheet animiert
];

/** Die Rahmenfarbe zu einer Rangstufe, oder `undefined` unterhalb der ersten. */
export function levelFrame(tier: number): string | undefined {
  return LEVEL_FRAMES[Math.max(0, Math.min(LEVEL_FRAMES.length - 1, tier))] || undefined;
}
