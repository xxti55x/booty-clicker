/**
 * Geometrie des Himmelsbaums (pur, DOM-frei).
 *
 * Der Himmel-Tab hieß immer „Baum", sah aber aus wie drei Listen untereinander.
 * Dieses Modul liefert die KOORDINATEN eines echten Baumes: ein Stamm, drei
 * Äste, je Ast vier Knoten am Ast und ein Gabel-Paar an der Spitze (die
 * Exklusiv-Wahl ist damit auch räumlich eine Weggabelung).
 *
 * Warum pur und getrennt: So ist die Anordnung testbar, ohne einen Browser zu
 * starten — und die Panel-Seite bleibt reines Zeichnen. Alle Werte liegen im
 * Koordinatenraum {@link TREE_VIEW} (eine SVG-`viewBox`), die Bildschirmgröße
 * entsteht erst durch Zoom und Verschiebung im Panel.
 */

/** Der Zeichenraum des Baums — quadratisch, damit Zoom in beide Richtungen gleich wirkt. */
export const TREE_VIEW = { w: 1000, h: 1000 } as const;

/** Ein Punkt im Baum-Koordinatenraum. */
export interface TreePoint {
  x: number;
  y: number;
}

/** Ein Ast: Stamm-Anschluss, Verlauf und die Plätze seiner Knoten. */
export interface BranchLayout {
  /** Der gezeichnete Ast als SVG-Pfad (kubische Bézier vom Stamm nach außen). */
  path: string;
  /** Die vier Plätze der normalen Knoten, von innen nach außen. */
  slots: readonly TreePoint[];
  /** Die zwei Plätze der Exklusiv-Gabel (links/rechts der Astspitze). */
  fork: readonly [TreePoint, TreePoint];
  /** Die beiden Gabel-Zweige als Pfade — sie machen die Wahl sichtbar. */
  forkPaths: readonly [string, string];
  /** Wo der Ast-Titel steht (über der Gabel, außerhalb der Knoten). */
  label: TreePoint;
}

/** Fuß und Spitze des Stamms. */
export const TRUNK_BOTTOM: TreePoint = { x: 500, y: 945 };
export const TRUNK_TOP: TreePoint = { x: 500, y: 640 };

/**
 * Die drei Äste in der Reihenfolge von {@link TREE_BRANCHES}: links, Mitte,
 * rechts. Der Winkel ist die Richtung, in die der Ast wächst (0° = senkrecht
 * nach oben, negativ = nach links).
 */
const BRANCH_ANGLES = [-51, 0, 51] as const;

/** Punkt auf einer kubischen Bézier — die eine Rechnung, die alles platziert. */
function bezier(p0: TreePoint, p1: TreePoint, p2: TreePoint, p3: TreePoint, t: number): TreePoint {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Der Ast mit Index `i` (0..2). Er startet an der Stammspitze, biegt in seine
 * Richtung ab und trägt seine Knoten in gleichmäßigen Abständen — die
 * Krümmung kommt aus zwei Kontrollpunkten, damit kein Ast wie ein Strich
 * aussieht.
 */
export function branchLayout(i: number): BranchLayout {
  const angle = BRANCH_ANGLES[Math.max(0, Math.min(2, Math.floor(i)))]!;
  const dir = rad(angle);
  // Astlänge in Baum-Einheiten. Sie ist KEINE Geschmacksfrage: Der Baum wird in
  // einem QUADRAT von rund 420 px gezeigt, eine Einheit ist also ~0.42 px. Eine
  // 40-px-Frucht belegt damit ~95 Einheiten, und die Knotenabstände müssen
  // darüber liegen — die erste Fassung stapelte sie sichtbar übereinander.
  const LEN = 450;
  const start = TRUNK_TOP;
  // Der Ast verlässt den Stamm zunächst senkrecht und dreht dann erst in seine
  // Richtung — so wächst er aus dem Stamm heraus, statt an ihm zu kleben.
  const c1: TreePoint = { x: start.x, y: start.y - LEN * 0.32 };
  const c2: TreePoint = {
    x: start.x + Math.sin(dir) * LEN * 0.62,
    y: start.y - Math.cos(dir) * LEN * 0.58,
  };
  const end: TreePoint = {
    x: start.x + Math.sin(dir) * LEN,
    y: start.y - Math.cos(dir) * LEN,
  };
  const path = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;

  // Vier Knoten zwischen 22 % und 88 % der Astlänge: der erste sitzt frei vom
  // Stamm, der letzte lässt Platz für die Gabel.
  const slots: TreePoint[] = [];
  for (let n = 0; n < 4; n++) {
    slots.push(bezier(start, c1, c2, end, 0.22 + (0.76 * n) / 3));
  }

  // Die Gabel: zwei kurze Zweige, die sich an der Astspitze trennen.
  const FORK = 132;
  const spread = rad(30);
  const mk = (sign: number): TreePoint => ({
    x: end.x + Math.sin(dir + sign * spread) * FORK,
    y: end.y - Math.cos(dir + sign * spread) * FORK,
  });
  const left = mk(-1);
  const right = mk(1);
  const forkPath = (p: TreePoint): string =>
    `M ${end.x} ${end.y} Q ${end.x + (p.x - end.x) * 0.35} ${end.y - Math.cos(dir) * FORK * 0.5}, ${p.x} ${p.y}`;

  return {
    path,
    slots,
    fork: [left, right],
    forkPaths: [forkPath(left), forkPath(right)],
    // Der Titel steht JENSEITS der Gabel (Radius 1.75 × Gabellänge) — dort ist
    // freier Himmel. Vorher saß er auf halber Gabelhöhe und lag damit genau
    // über den beiden Exklusiv-Früchten.
    label: { x: end.x + Math.sin(dir) * FORK * 1.75, y: end.y - Math.cos(dir) * FORK * 1.75 },
  };
}

/** Alle drei Äste — die Reihenfolge entspricht `TREE_BRANCHES`. */
export function treeLayout(): readonly BranchLayout[] {
  return [0, 1, 2].map(branchLayout);
}

/** Zoom-Grenzen des Panels: ganzer Baum bis Knoten-Nahaufnahme. */
export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 2.6;
export const ZOOM_STEP = 1.28;

/** Zoom auf den erlaubten Bereich klemmen (eine Regel für Rad, Knöpfe und Start). */
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}
