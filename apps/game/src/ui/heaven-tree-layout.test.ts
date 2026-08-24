import { describe, expect, it } from 'vitest';

import {
  branchLayout,
  clampZoom,
  TREE_VIEW,
  TRUNK_BOTTOM,
  TRUNK_TOP,
  treeLayout,
  ZOOM_MAX,
  ZOOM_MIN,
} from './heaven-tree-layout';

/**
 * Mindestabstand zweier Knoten in Baum-Einheiten. Hergeleitet, nicht geraten:
 * 62-px-Frucht auf einer ~880-px-Bühne ⇒ ~70 Einheiten, plus Reserve.
 */
const MIN_NODE_GAP = 80;

describe('Himmelsbaum-Geometrie', () => {
  const layouts = treeLayout();

  it('hat drei Äste mit je vier Knoten und einer Zweier-Gabel', () => {
    expect(layouts).toHaveLength(3);
    for (const b of layouts) {
      expect(b.slots).toHaveLength(4);
      expect(b.fork).toHaveLength(2);
      expect(b.forkPaths).toHaveLength(2);
    }
  });

  it('lässt jeden Ast am Stamm beginnen', () => {
    for (const b of layouts) {
      expect(b.path.startsWith(`M ${TRUNK_TOP.x} ${TRUNK_TOP.y}`)).toBe(true);
    }
  });

  it('hält alle 18 Knotenplätze im Zeichenraum', () => {
    for (const b of layouts) {
      for (const p of [...b.slots, ...b.fork]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(TREE_VIEW.w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(TREE_VIEW.h);
      }
    }
  });

  it('lässt den Baum nach OBEN wachsen (kleineres y = höher)', () => {
    expect(TRUNK_TOP.y).toBeLessThan(TRUNK_BOTTOM.y);
    for (const b of layouts) {
      // Jeder weiter außen liegende Knoten sitzt höher als der Stammansatz …
      for (const p of b.slots) expect(p.y).toBeLessThan(TRUNK_TOP.y);
      // … und die Gabel sitzt WEITER DRAUSSEN als der letzte Ast-Knoten. Nicht
      // zwingend höher: Ein stark seitlich wachsender Ast gabelt zur Seite,
      // genau wie ein echter. Gemessen wird deshalb der Abstand zum Stamm.
      const last = b.slots[b.slots.length - 1]!;
      const dist = (p: { x: number; y: number }): number =>
        Math.hypot(p.x - TRUNK_TOP.x, p.y - TRUNK_TOP.y);
      for (const f of b.fork) expect(dist(f)).toBeGreaterThan(dist(last));
    }
  });

  it('trennt die drei Äste sichtbar (linker, mittlerer, rechter Ast)', () => {
    const [left, mid, right] = layouts.map((b) => b.fork[0].x + b.fork[1].x);
    expect(left!).toBeLessThan(mid!);
    expect(mid!).toBeLessThan(right!);
  });

  it('setzt die Knoten eines Astes mit echtem Abstand', () => {
    for (const b of layouts) {
      for (let i = 1; i < b.slots.length; i++) {
        const a = b.slots[i - 1]!;
        const c = b.slots[i]!;
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        // Eine Frucht misst 62 px auf der ~880-px-Vollbildbühne, also ~70
        // Einheiten; 80 lässt Luft. Weniger heißt sichtbare Überlappung.
        expect(d).toBeGreaterThan(MIN_NODE_GAP);
      }
      // Die beiden Gabel-Knoten dürfen sich ebenfalls nicht berühren.
      const gap = Math.hypot(b.fork[0].x - b.fork[1].x, b.fork[0].y - b.fork[1].y);
      expect(gap).toBeGreaterThan(MIN_NODE_GAP);
    }
  });

  // Der Fehler, den erst das Vollbild zeigte: Innerhalb eines Astes stimmten die
  // Abstände, aber die INNERSTEN Knoten dreier Äste liefen am Stammansatz
  // zusammen und lagen sichtbar übereinander.
  it('hält auch Knoten VERSCHIEDENER Äste auseinander', () => {
    const all = layouts.flatMap((b) => [...b.slots, ...b.fork]);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i]!.x - all[j]!.x, all[i]!.y - all[j]!.y);
        expect(d).toBeGreaterThan(MIN_NODE_GAP);
      }
    }
  });

  it('liefert für jeden Ast-Index ein Layout und klemmt Ausreißer', () => {
    expect(branchLayout(0).slots).toHaveLength(4);
    // Außerhalb 0..2 wird geklemmt statt zu werfen (die UI ruft mit Indizes).
    expect(branchLayout(-5).path).toBe(branchLayout(0).path);
    expect(branchLayout(9).path).toBe(branchLayout(2).path);
  });

  it('klemmt den Zoom auf den erlaubten Bereich', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});
