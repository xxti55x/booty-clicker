import * as THREE from 'three';

/**
 * Gemalte Fernkulissen (User-Auftrag „Stage-Modelle müssen nicht 3D sein —
 * so detailliert wie möglich, solange es im Browser rendert").
 *
 * DIE Idee: Die Diorama-Kamera ist FIX (`frameCamera` — sie bewegt sich nie).
 * Aus einem festen Blickwinkel ist eine bemalte Fläche von Geometrie nicht zu
 * unterscheiden — also malt dieses Modul pro Theme EIN detailreiches Panorama
 * (1024er-Canvas, einmal beim Bau gezeichnet) und hängt es als Cutout-Billboard
 * hinter die 3D-Mittelgrund-Props. Ein Panorama trägt hunderte Fenster, Grate,
 * Wolkenschichten oder Sterne für exakt EINEN Draw-Call — Detailtiefe, die als
 * Mesh das G3-Budget sprengen würde. Der Himmel bleibt transparent, damit der
 * bestehende Sky-Shader dahinter atmet (Cutout, kein Vollbild).
 *
 * Stil: dieselbe Ink-Sprache wie die Welt — Silhouetten mit dunkler
 * Outline-Kontur, flächige Cel-Füllungen, keine Foto-Verläufe außer Glows.
 * Der Recolour-Lap läuft über den `css`-Callback (die lap-gedrehte Palette
 * der Kulisse), der Cache hängt deshalb an (Maler, Lap).
 *
 * Rein additiv zur Szene: kein Physik-Kontrakt, kein Save, keine Anim-Pflicht.
 */

const cache = new Map<string, THREE.CanvasTexture>();

/** Lap-gedrehte Palette als CSS-Farbe (Canvas malt in Strings). */
export type CssHue = (hex: number) => string;

function paint(
  key: string,
  w: number,
  h: number,
  draw: (x: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  draw(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Deterministischer Mini-PRNG — Panoramen sind über Rebuilds stabil. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Die Ink-Farbe der Welt (materials.INK), als CSS. */
const INK_CSS = '#141021';

/**
 * Weiche Alpha-Ausblendung an den Rändern (destination-out): ein Cutout darf
 * nie als harte Rechteck-Kante im Himmel stehen — gemessen am Beach-Panorama,
 * dessen Wasserband sonst als dunkler Balken durchs Bild schnitt.
 */
function fadeEdges(
  x: CanvasRenderingContext2D,
  w: number,
  h: number,
  side: number,
  bottom: number,
): void {
  x.globalCompositeOperation = 'destination-out';
  const L = x.createLinearGradient(0, 0, side, 0);
  L.addColorStop(0, 'rgba(0,0,0,1)');
  L.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = L;
  x.fillRect(0, 0, side, h);
  const R = x.createLinearGradient(w, 0, w - side, 0);
  R.addColorStop(0, 'rgba(0,0,0,1)');
  R.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = R;
  x.fillRect(w - side, 0, side, h);
  if (bottom > 0) {
    const B = x.createLinearGradient(0, h, 0, h - bottom);
    B.addColorStop(0, 'rgba(0,0,0,1)');
    B.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = B;
    x.fillRect(0, h - bottom, w, bottom);
  }
  x.globalCompositeOperation = 'source-over';
}

/**
 * Cutout-Billboard aus einer Panorama-Textur. `depthWrite` bleibt AUS: das
 * Panorama ist das fernste Element seiner Schicht — Transparenz-Sortierung
 * zeichnet es zuerst, und die Alpha-Kante darf additive Glows davor nie
 * ausstanzen. `fog` aus (Skybox-Regel — Distanz-Nebel frisst sonst alles).
 */
export function paintingMesh(tex: THREE.CanvasTexture, w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  (m.material as THREE.MeshBasicMaterial).fog = false;
  return m;
}

/**
 * Die KALIBRIERTE Kamera-Position (siehe backgrounds.ts-Modulkopf, per
 * Unprojection gemessen). Panoramen werden einmalig auf sie ausgerichtet —
 * die Kamera bewegt sich nie, also reicht ein statisches `lookAt`.
 */
export const PANO_CAM = new THREE.Vector3(-9.6, 19.2, -33.9);

// ---------------------------------------------------------------------------
// Club — Nachtstadt-Panorama: drei Skyline-Reihen, hunderte Fenster, Neon
// ---------------------------------------------------------------------------

/** Ein Turm mit Dachdetails + Fensterraster in die Silhouette malen. */
function tower(
  x: CanvasRenderingContext2D,
  r: () => number,
  bx: number,
  bw: number,
  bh: number,
  H: number,
  fill: string,
  win: { lit: number; warm: string; cool: string; rows: number } | null,
  outline: boolean,
): void {
  const top = H - bh;
  x.fillStyle = fill;
  x.fillRect(bx, top, bw, bh);
  // Dach-Details: Antenne, Wassertank oder Staffelgeschoss — je Turm eines.
  const kind = r();
  x.strokeStyle = fill;
  x.lineWidth = 2;
  if (kind < 0.35) {
    x.beginPath();
    x.moveTo(bx + bw / 2, top);
    x.lineTo(bx + bw / 2, top - 10 - r() * 14);
    x.stroke();
    x.fillRect(bx + bw / 2 - 1.5, top - 4, 3, 4);
  } else if (kind < 0.6) {
    x.fillRect(bx + bw * 0.18, top - 6, bw * 0.3, 6);
  } else if (kind < 0.85) {
    x.fillRect(bx + bw * 0.25, top - 8, bw * 0.5, 8);
    x.fillRect(bx + bw * 0.375, top - 12, bw * 0.25, 4);
  }
  if (outline) {
    x.strokeStyle = INK_CSS;
    x.lineWidth = 2.5;
    x.strokeRect(bx + 1, top + 1, bw - 2, bh - 2);
  }
  if (win) {
    // Fensterraster: kleine Zellen, zufällig erleuchtet, warm/kühl gemischt —
    // einzelne Stockwerke bleiben dunkel (das macht eine Stadt glaubwürdig).
    const cw = 5;
    const ch = 7;
    const cols = Math.floor((bw - 8) / cw);
    const rows = Math.min(win.rows, Math.floor((bh - 10) / ch));
    for (let ry = 0; ry < rows; ry++) {
      const darkFloor = r() < 0.18;
      for (let cx = 0; cx < cols; cx++) {
        if (darkFloor || r() > win.lit) continue;
        x.fillStyle = r() < 0.75 ? win.warm : win.cool;
        x.fillRect(bx + 5 + cx * cw, top + 6 + ry * ch, cw - 2, ch - 3);
      }
    }
  }
}

export function paintClubCity(css: CssHue, variant: number): THREE.CanvasTexture {
  return paint(`club:${variant}`, 1024, 300, (x) => {
    const r = rng(4711);
    const H = 300;
    // Licht-Dunst der Stadt: ein warmer Dom hinter allem.
    const dome = x.createRadialGradient(560, H, 20, 560, H, 340);
    dome.addColorStop(0, 'rgba(255,122,74,0.34)');
    dome.addColorStop(1, 'rgba(255,122,74,0)');
    x.fillStyle = dome;
    x.fillRect(0, 0, 1024, H);
    // Reihe 1 (hinten): reine Silhouetten, kaum Fenster.
    x.globalAlpha = 0.85;
    for (let bx = -10; bx < 1024; bx += 30 + r() * 40) {
      tower(x, r, bx, 26 + r() * 44, 90 + r() * 120, H, css(0x241b3d), null, false);
    }
    x.globalAlpha = 1;
    // Riesenrad in der zweiten Tiefe — das eine erzählerische Wahrzeichen
    // (rechts im Canvas: dort liegt der sichtbare Keil neben der UI).
    const fx = 660 + r() * 200;
    const fy = H - 108;
    x.strokeStyle = css(0x4a3a78);
    x.lineWidth = 3;
    x.beginPath();
    x.arc(fx, fy, 52, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      x.beginPath();
      x.moveTo(fx, fy);
      x.lineTo(fx + Math.cos(a) * 52, fy + Math.sin(a) * 52);
      x.stroke();
      x.fillStyle = i % 2 ? css(0xffb84d) : css(0xff5fa4);
      x.fillRect(fx + Math.cos(a) * 52 - 3, fy + Math.sin(a) * 52 - 2, 6, 5);
    }
    x.beginPath();
    x.moveTo(fx - 30, H);
    x.lineTo(fx, fy);
    x.lineTo(fx + 30, H);
    x.stroke();
    // Reihe 2: dunkle Türme mit spärlichen Fenstern.
    for (let bx = -14; bx < 1024; bx += 44 + r() * 52) {
      tower(
        x,
        r,
        bx,
        34 + r() * 52,
        120 + r() * 130,
        H,
        css(0x322659),
        {
          lit: 0.3,
          warm: 'rgba(255,190,120,0.85)',
          cool: 'rgba(150,190,255,0.7)',
          rows: 24,
        },
        false,
      );
    }
    // Reihe 3 (vorn): satte Türme, dichte Fenster, Ink-Kontur, Neon-Schilder.
    for (let bx = -20; bx < 1024; bx += 64 + r() * 70) {
      const bw = 46 + r() * 60;
      const bh = 150 + r() * 120;
      tower(
        x,
        r,
        bx,
        bw,
        bh,
        H,
        css(0x3d2f6b),
        {
          lit: 0.42,
          warm: 'rgba(255,206,140,0.95)',
          cool: 'rgba(170,205,255,0.85)',
          rows: 30,
        },
        true,
      );
      // Neon: ein vertikales Schild ODER ein Dach-Schriftband, mit Glow.
      const neon = [css(0xff3fa4), css(0x3adfc0), css(0xffb84d), css(0xb45cf6)][
        Math.floor(r() * 4)
      ];
      x.save();
      x.shadowColor = neon;
      x.shadowBlur = 9;
      x.fillStyle = neon;
      if (r() < 0.5) {
        const sx = bx + bw - 8;
        const sy = H - bh + 16 + r() * 30;
        x.fillRect(sx, sy, 6, 34 + r() * 26);
        x.fillStyle = INK_CSS;
        x.shadowBlur = 0;
        for (let i = 0; i < 4; i++) x.fillRect(sx + 1, sy + 6 + i * 8, 4, 2);
      } else {
        x.fillRect(bx + 6, H - bh - 7, Math.min(bw - 12, 26 + r() * 20), 5);
      }
      x.restore();
    }
    fadeEdges(x, 1024, H, 70, 40);
  });
}

// ---------------------------------------------------------------------------
// Synth — Chrom-Gebirge: Facetten-Grate mit Neon-Kante, Palmen-Silhouetten
// ---------------------------------------------------------------------------

export function paintSynthRange(css: CssHue, variant: number): THREE.CanvasTexture {
  return paint(`synth:${variant}`, 1024, 260, (x) => {
    const r = rng(1337);
    const H = 260;
    /** Ein facettierter Berg: Dreiecks-Keil, Flanken in zwei Tönen, Neon-Grat. */
    const mount = (mx: number, mw: number, mh: number, dark: string, lit: string, rim: string) => {
      const top = H - mh;
      x.fillStyle = dark;
      x.beginPath();
      x.moveTo(mx - mw / 2, H);
      x.lineTo(mx, top);
      x.lineTo(mx + mw / 2, H);
      x.closePath();
      x.fill();
      // Lichtflanke (Sonnenseite = Screen-rechts, wo die Retro-Sonne hängt).
      x.fillStyle = lit;
      x.beginPath();
      x.moveTo(mx, top);
      x.lineTo(mx + mw / 2, H);
      x.lineTo(mx + mw * 0.14, H);
      x.closePath();
      x.fill();
      // Facetten-Linien den Hang hinab.
      x.strokeStyle = 'rgba(20,16,33,0.5)';
      x.lineWidth = 1.5;
      for (let i = 1; i <= 3; i++) {
        x.beginPath();
        x.moveTo(mx, top);
        x.lineTo(mx - mw * 0.5 * (i / 3.5), H);
        x.stroke();
      }
      // Neon-Grat mit Glow — DIE Synthwave-Signatur.
      x.save();
      x.shadowColor = rim;
      x.shadowBlur = 8;
      x.strokeStyle = rim;
      x.lineWidth = 2.5;
      x.beginPath();
      x.moveTo(mx - mw / 2, H);
      x.lineTo(mx, top);
      x.lineTo(mx + mw / 2, H);
      x.stroke();
      x.restore();
      // Ink-Außenkante darüber, dünn — verankert den Berg in der Toon-Welt.
      x.strokeStyle = INK_CSS;
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(mx - mw / 2, H);
      x.lineTo(mx, top);
      x.lineTo(mx + mw / 2, H);
      x.stroke();
    };
    // Hintere Kette: kühl, Cyan-Grat — bewusst heller als der Grid-Untergrund,
    // damit die Silhouetten sich VOR dem dunklen Backdrop absetzen (gemessen:
    // die erste Palette soff dark-on-dark ab).
    for (let mx = 30; mx < 1060; mx += 120 + r() * 90) {
      mount(mx, 200 + r() * 120, 90 + r() * 60, css(0x2c2254), css(0x3a2d6e), css(0x3adfc0));
    }
    // Vordere Kette: satter, Magenta-Grat, höher.
    for (let mx = -20; mx < 1080; mx += 170 + r() * 120) {
      mount(mx, 240 + r() * 140, 130 + r() * 80, css(0x38296a), css(0x4c3a8e), css(0xff3fa4));
    }
    // Palmen-Silhouetten am Fuß: gebogener Stamm + Wedel-Fächer.
    x.fillStyle = INK_CSS;
    x.strokeStyle = INK_CSS;
    for (let px = 40; px < 1024; px += 130 + r() * 160) {
      const ph = 34 + r() * 22;
      const lean = (r() - 0.5) * 14;
      x.lineWidth = 3.5;
      x.beginPath();
      x.moveTo(px, H);
      x.quadraticCurveTo(px + lean * 0.4, H - ph * 0.6, px + lean, H - ph);
      x.stroke();
      x.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9;
        const fl = 14 + r() * 8;
        x.beginPath();
        x.moveTo(px + lean, H - ph);
        x.quadraticCurveTo(
          px + lean + Math.cos(a) * fl * 0.7,
          H - ph + Math.sin(a) * fl * 0.7 - 4,
          px + lean + Math.cos(a) * fl,
          H - ph + Math.sin(a) * fl + 3,
        );
        x.stroke();
      }
    }
    // Retro-Vogelschwarm: flache Dreiecks-Chevrons Richtung Sonne.
    x.strokeStyle = css(0x1b1430);
    x.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const bx = 600 + r() * 300;
      const by = 30 + r() * 70;
      const s = 4 + r() * 4;
      x.beginPath();
      x.moveTo(bx - s, by);
      x.lineTo(bx, by - s * 0.6);
      x.lineTo(bx + s, by);
      x.stroke();
    }
    fadeEdges(x, 1024, H, 70, 30);
  });
}

// ---------------------------------------------------------------------------
// Beach — Bucht-Panorama: Inselketten, Segelboote, Wolkenbänke, Möwen
// ---------------------------------------------------------------------------

export function paintBeachBay(css: CssHue, variant: number): THREE.CanvasTexture {
  return paint(`beach:${variant}`, 1024, 260, (x) => {
    const r = rng(2024);
    const H = 260;
    const SEA = H - 56; // Horizontlinie des gemalten Wasserbands
    // Fernes Wasserband mit Glitzer-Strichen.
    const sea = x.createLinearGradient(0, SEA, 0, H);
    sea.addColorStop(0, css(0x2f9fd0));
    sea.addColorStop(1, css(0x1d6fa8));
    x.fillStyle = sea;
    x.fillRect(0, SEA, 1024, H - SEA);
    x.strokeStyle = 'rgba(255,245,220,0.55)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 90; i++) {
      const gy = SEA + 4 + r() * (H - SEA - 8);
      const gx = r() * 1024;
      x.beginPath();
      x.moveTo(gx, gy);
      x.lineTo(gx + 6 + r() * 16, gy);
      x.stroke();
    }
    x.strokeStyle = INK_CSS;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, SEA);
    x.lineTo(1024, SEA);
    x.stroke();
    // Inselketten: hinten dunstig, vorn satt mit Strandsaum + Palmengruppen.
    const isle = (ix: number, iw: number, ih: number, tone: string, front: boolean) => {
      x.fillStyle = tone;
      x.beginPath();
      x.moveTo(ix - iw / 2, SEA);
      x.quadraticCurveTo(ix - iw * 0.2, SEA - ih, ix, SEA - ih);
      x.quadraticCurveTo(ix + iw * 0.25, SEA - ih, ix + iw / 2, SEA);
      x.closePath();
      x.fill();
      if (!front) return;
      x.strokeStyle = INK_CSS;
      x.lineWidth = 2;
      x.stroke();
      // Strandsaum an der Wasserlinie.
      x.fillStyle = css(0xf2d9a0);
      x.fillRect(ix - iw / 2 + 4, SEA - 4, iw - 8, 4);
      // Palmengruppe auf dem Rücken.
      x.strokeStyle = css(0x1e5c38);
      for (let p = 0; p < 3; p++) {
        const px = ix - iw * 0.2 + p * iw * 0.18;
        const py = SEA - ih + 6;
        x.lineWidth = 2.5;
        x.beginPath();
        x.moveTo(px, py + 14);
        x.quadraticCurveTo(px + 3, py + 6, px + 6, py);
        x.stroke();
        x.fillStyle = css(0x2fae4e);
        for (let f = 0; f < 5; f++) {
          const a = -Math.PI + (f / 4) * Math.PI;
          x.beginPath();
          x.ellipse(px + 6 + Math.cos(a) * 6, py + Math.sin(a) * 4, 6, 2.4, a, 0, Math.PI * 2);
          x.fill();
        }
      }
    };
    isle(160, 220, 34, css(0x7ba6b8), false);
    isle(760, 260, 40, css(0x7ba6b8), false);
    isle(420, 300, 62, css(0x8a6a46), true);
    isle(950, 240, 52, css(0x8a6a46), true);
    // Segelboote in drei Größen — Rumpf, Mast, zwei Segel, Spiegelung.
    const boat = (bx2: number, by: number, s: number) => {
      x.fillStyle = css(0xc9472f);
      x.beginPath();
      x.moveTo(bx2 - 10 * s, by);
      x.lineTo(bx2 + 10 * s, by);
      x.lineTo(bx2 + 6 * s, by + 4 * s);
      x.lineTo(bx2 - 6 * s, by + 4 * s);
      x.closePath();
      x.fill();
      x.strokeStyle = INK_CSS;
      x.lineWidth = 1.5;
      x.stroke();
      x.beginPath();
      x.moveTo(bx2, by);
      x.lineTo(bx2, by - 16 * s);
      x.stroke();
      x.fillStyle = '#fff6e8';
      x.beginPath();
      x.moveTo(bx2 - 1, by - 16 * s);
      x.lineTo(bx2 - 9 * s, by - 2);
      x.lineTo(bx2 - 1, by - 2);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = css(0xffb84d);
      x.beginPath();
      x.moveTo(bx2 + 1, by - 13 * s);
      x.lineTo(bx2 + 7 * s, by - 2);
      x.lineTo(bx2 + 1, by - 2);
      x.closePath();
      x.fill();
      x.stroke();
      x.strokeStyle = 'rgba(255,246,232,0.4)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(bx2 - 8 * s, by + 6 * s);
      x.lineTo(bx2 + 8 * s, by + 6 * s);
      x.stroke();
    };
    boat(300, SEA + 16, 1.1);
    boat(600, SEA + 8, 0.7);
    boat(860, SEA + 26, 1.5);
    // Wolkenbänke: flache Böden, gewölbte Rücken, Sonnenrand oben.
    const cloud = (cx2: number, cy: number, s: number) => {
      x.fillStyle = '#fff2df';
      x.beginPath();
      x.ellipse(cx2, cy, 46 * s, 13 * s, 0, 0, Math.PI * 2);
      x.ellipse(cx2 - 24 * s, cy + 3 * s, 26 * s, 9 * s, 0, 0, Math.PI * 2);
      x.ellipse(cx2 + 26 * s, cy + 2 * s, 30 * s, 10 * s, 0, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(255,214,150,0.9)';
      x.lineWidth = 3;
      x.beginPath();
      x.arc(cx2, cy - 2 * s, 44 * s, Math.PI * 1.15, Math.PI * 1.85);
      x.stroke();
    };
    cloud(180, 60, 1);
    cloud(520, 40, 1.35);
    cloud(880, 78, 0.8);
    // Möwen: doppelte Flügelbögen.
    x.strokeStyle = INK_CSS;
    x.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const gx = 100 + r() * 800;
      const gy = 90 + r() * 60;
      const s = 5 + r() * 5;
      x.beginPath();
      x.arc(gx - s * 0.55, gy, s * 0.6, Math.PI * 1.1, Math.PI * 1.9);
      x.arc(gx + s * 0.55, gy, s * 0.6, Math.PI * 1.1, Math.PI * 1.9);
      x.stroke();
    }
    fadeEdges(x, 1024, H, 90, 50);
  });
}

// ---------------------------------------------------------------------------
// Space — Ringplanet + Nebelschwaden + Sternenfeld + Komet
// ---------------------------------------------------------------------------

export function paintSpaceVista(css: CssHue, variant: number): THREE.CanvasTexture {
  return paint(`space:${variant}`, 1024, 420, (x) => {
    const r = rng(9001);
    // Nebelschwaden: geschichtete, weiche Farbwolken.
    const nebula = (nx: number, ny: number, nr: number, col: string, a: number) => {
      const g = x.createRadialGradient(nx, ny, nr * 0.1, nx, ny, nr);
      g.addColorStop(0, col.replace('ALPHA', String(a)));
      g.addColorStop(1, col.replace('ALPHA', '0'));
      x.fillStyle = g;
      x.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    };
    nebula(240, 140, 190, 'rgba(180,92,246,ALPHA)', 0.34);
    nebula(360, 240, 150, 'rgba(58,223,192,ALPHA)', 0.2);
    nebula(840, 90, 170, 'rgba(255,95,164,ALPHA)', 0.24);
    // Sternenfeld: drei Größenklassen + wenige Kreuz-Funkler.
    for (let i = 0; i < 240; i++) {
      const sx = r() * 1024;
      const sy = r() * 420;
      const m = r();
      x.fillStyle = m < 0.75 ? 'rgba(255,255,255,0.75)' : css(m < 0.9 ? 0xbcd2ff : 0xffd9a0);
      const s = m < 0.75 ? 1 : m < 0.94 ? 1.8 : 2.6;
      x.fillRect(sx, sy, s, s);
    }
    x.strokeStyle = 'rgba(255,255,255,0.85)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const sx = r() * 1024;
      const sy = r() * 420;
      const s = 4 + r() * 5;
      x.beginPath();
      x.moveTo(sx - s, sy);
      x.lineTo(sx + s, sy);
      x.moveTo(sx, sy - s);
      x.lineTo(sx, sy + s);
      x.stroke();
    }
    // Ferne Spiralgalaxie: zwei gebogene Arme um einen hellen Kern.
    x.save();
    x.translate(150, 330);
    x.rotate(-0.5);
    const core = x.createRadialGradient(0, 0, 2, 0, 0, 26);
    core.addColorStop(0, 'rgba(255,246,220,0.9)');
    core.addColorStop(1, 'rgba(255,246,220,0)');
    x.fillStyle = core;
    x.fillRect(-30, -30, 60, 60);
    x.strokeStyle = 'rgba(200,210,255,0.5)';
    x.lineWidth = 5;
    for (const dir of [0, Math.PI]) {
      x.beginPath();
      for (let t = 0; t < 2.4; t += 0.15) {
        const rad = 5 + t * 14;
        const a = dir + t;
        if (t === 0) x.moveTo(Math.cos(a) * rad, Math.sin(a) * rad * 0.55);
        else x.lineTo(Math.cos(a) * rad, Math.sin(a) * rad * 0.55);
      }
      x.stroke();
    }
    x.restore();
    // DER Ringplanet — Banden, Sturm-Fleck, Terminator, Ring mit Verdeckung.
    const px = 700;
    const py = 210;
    const pr = 95;
    // Ring HINTER dem Planeten zuerst (obere Hälfte).
    x.save();
    x.translate(px, py);
    x.rotate(-0.32);
    x.strokeStyle = css(0xd8c9a0);
    x.lineWidth = 13;
    x.beginPath();
    x.ellipse(0, 0, pr * 1.75, pr * 0.5, 0, Math.PI, Math.PI * 2);
    x.stroke();
    x.strokeStyle = 'rgba(20,16,33,0.55)';
    x.lineWidth = 3;
    x.beginPath();
    x.ellipse(0, 0, pr * 1.62, pr * 0.46, 0, Math.PI, Math.PI * 2);
    x.stroke();
    x.restore();
    // Kugel mit Cel-Banden.
    x.save();
    x.beginPath();
    x.arc(px, py, pr, 0, Math.PI * 2);
    x.clip();
    x.fillStyle = css(0x8a6ad0);
    x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    const bands = [0x9a7ae0, 0x7a5ac0, 0xa98af0, 0x6a4ab0, 0x9a7ae0, 0x7a5ac0];
    bands.forEach((b, i) => {
      x.fillStyle = css(b);
      const by = py - pr + (i / bands.length) * pr * 2;
      x.beginPath();
      x.ellipse(px, by + pr / bands.length, pr * 1.1, pr / bands.length + 3, 0.06, 0, Math.PI * 2);
      x.fill();
    });
    // Sturm-Fleck + kleine Wirbel.
    x.fillStyle = css(0xffb84d);
    x.beginPath();
    x.ellipse(px - 30, py + 26, 17, 10, 0.2, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(20,16,33,0.4)';
    x.lineWidth = 2;
    x.beginPath();
    x.ellipse(px - 30, py + 26, 11, 6, 0.2, 0, Math.PI * 2);
    x.stroke();
    // Terminator: die Nachtseite Richtung Screen-rechts.
    const term = x.createLinearGradient(px, 0, px + pr, 0);
    term.addColorStop(0.15, 'rgba(10,8,20,0)');
    term.addColorStop(1, 'rgba(10,8,20,0.78)');
    x.fillStyle = term;
    x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    x.restore();
    // Ink-Kontur der Kugel + Ring VOR dem Planeten (untere Hälfte).
    x.strokeStyle = INK_CSS;
    x.lineWidth = 3;
    x.beginPath();
    x.arc(px, py, pr, 0, Math.PI * 2);
    x.stroke();
    x.save();
    x.translate(px, py);
    x.rotate(-0.32);
    x.strokeStyle = css(0xe8d9b0);
    x.lineWidth = 13;
    x.beginPath();
    x.ellipse(0, 0, pr * 1.75, pr * 0.5, 0, 0, Math.PI);
    x.stroke();
    x.strokeStyle = 'rgba(20,16,33,0.55)';
    x.lineWidth = 3;
    x.beginPath();
    x.ellipse(0, 0, pr * 1.62, pr * 0.46, 0, 0, Math.PI);
    x.stroke();
    x.strokeStyle = INK_CSS;
    x.lineWidth = 2;
    x.beginPath();
    x.ellipse(0, 6.5, pr * 1.75, pr * 0.5, 0, 0, Math.PI);
    x.stroke();
    x.restore();
    // Mond mit Kratern.
    x.fillStyle = css(0xb8b8d0);
    x.beginPath();
    x.arc(520, 90, 22, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = INK_CSS;
    x.lineWidth = 2;
    x.stroke();
    x.fillStyle = 'rgba(20,16,33,0.25)';
    for (const [mx, my, mr] of [
      [514, 84, 5],
      [528, 96, 3.5],
      [520, 78, 2.5],
    ] as const) {
      x.beginPath();
      x.arc(mx, my, mr, 0, Math.PI * 2);
      x.fill();
    }
    // Komet: heller Kopf, zweifarbiger Schweif nach Screen-rechts oben.
    x.save();
    x.translate(320, 60);
    x.rotate(0.35);
    const tail = x.createLinearGradient(0, 0, 150, 0);
    tail.addColorStop(0, 'rgba(58,223,192,0.75)');
    tail.addColorStop(1, 'rgba(58,223,192,0)');
    x.fillStyle = tail;
    x.beginPath();
    x.moveTo(0, -4);
    x.lineTo(150, -13);
    x.lineTo(150, 13);
    x.lineTo(0, 4);
    x.closePath();
    x.fill();
    x.fillStyle = '#fff6e8';
    x.beginPath();
    x.arc(0, 0, 6, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = INK_CSS;
    x.lineWidth = 2;
    x.stroke();
    x.restore();
    fadeEdges(x, 1024, 420, 60, 40);
  });
}
