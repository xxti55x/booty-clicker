import * as THREE from 'three';

/**
 * Procedural canvas textures (Goal „apply texture to all models, stages and
 * islands"). Everything is generated at runtime — no asset files, no bundle
 * cost — and drawn NEAR-WHITE with subtle value contrast: the material's
 * `color` (and the endless-lap `hue()` shifts) keep tinting exactly as before,
 * the map only adds surface interest. All maps repeat-wrap; callers set
 * `repeat` for scale. Cached per (maker, seedKey) so rebuilding a stage never
 * regenerates canvases.
 */

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Anisotropie-Deckel (Roadmap T1): das Quality-Preset setzt ihn beim Boot über
 * `setTextureAnisotropy` (real vom GPU-Maximum begrenzt); bereits erzeugte
 * Texturen werden retroaktiv nachgezogen.
 */
let TEX_ANISO = 4;
export function setTextureAnisotropy(n: number): void {
  TEX_ANISO = Math.max(1, Math.floor(n));
  for (const t of cache.values()) {
    t.anisotropy = TEX_ANISO;
    t.needsUpdate = true;
  }
  for (const t of repeatCache.values()) {
    t.anisotropy = TEX_ANISO;
    t.needsUpdate = true;
  }
}

/**
 * T1: Die Maler zeichnen in einem 256er-Koordinatenraum, gerendert wird mit
 * `SCALE` 2 auf 512² — schärfere Kanten in Kameranähe ohne neue Zeichenlogik.
 */
const SCALE = 2;

function make(key: string, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w * SCALE;
  c.height = h * SCALE;
  const x = c.getContext('2d')!;
  x.scale(SCALE, SCALE);
  draw(x);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = TEX_ANISO;
  cache.set(key, t);
  return t;
}

/** Deterministic tiny PRNG so textures are stable across rebuilds. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Sand/rock grain: light base + darker/lighter speckles (Beach-Deck, Fels). */
export function speckleTex(seed = 1, density = 900): THREE.CanvasTexture {
  return make(`speckle:${seed}:${density}`, 256, 256, (x) => {
    x.fillStyle = '#f2ede4';
    x.fillRect(0, 0, 256, 256);
    const r = rng(seed * 7919);
    for (let i = 0; i < density; i++) {
      const v = 200 + Math.floor(r() * 55);
      x.fillStyle = r() < 0.5 ? `rgb(${v - 45},${v - 50},${v - 58})` : `rgb(${v},${v},${v})`;
      const s = 1 + r() * 2.4;
      x.beginPath();
      x.arc(r() * 256, r() * 256, s, 0, 7);
      x.fill();
    }
  });
}

/** Horizontale Erd-/Sandstein-Schichten für Insel-Ränder (Strata). */
export function strataTex(seed = 1): THREE.CanvasTexture {
  return make(`strata:${seed}`, 256, 256, (x) => {
    const r = rng(seed * 104729);
    let y = 0;
    while (y < 256) {
      const h = 14 + r() * 26;
      const v = 205 + Math.floor(r() * 50);
      x.fillStyle = `rgb(${v},${Math.floor(v * 0.94)},${Math.floor(v * 0.85)})`;
      x.fillRect(0, y, 256, h);
      // dunkle Fugenlinie zwischen den Schichten
      x.fillStyle = 'rgba(70,50,30,0.35)';
      x.fillRect(0, y + h - 2, 256, 2);
      // ein paar eingelagerte Kiesel
      x.fillStyle = 'rgba(90,70,50,0.3)';
      for (let i = 0; i < 5; i++) {
        x.beginPath();
        x.arc(r() * 256, y + r() * h, 2 + r() * 3, 0, 7);
        x.fill();
      }
      y += h;
    }
  });
}

/** Parkett/Planken (Club-Boden, Holzbühnen). */
export function plankTex(seed = 1): THREE.CanvasTexture {
  return make(`plank:${seed}`, 256, 256, (x) => {
    const r = rng(seed * 31337);
    const rows = 6;
    const rh = 256 / rows;
    for (let ry = 0; ry < rows; ry++) {
      let px = ry % 2 === 0 ? 0 : -40;
      while (px < 256) {
        const w = 70 + r() * 60;
        const v = 215 + Math.floor(r() * 34);
        x.fillStyle = `rgb(${v},${Math.floor(v * 0.93)},${Math.floor(v * 0.82)})`;
        x.fillRect(px, ry * rh, w - 2, rh - 2);
        // Maserung
        x.strokeStyle = 'rgba(120,90,60,0.28)';
        x.lineWidth = 1;
        for (let g = 0; g < 3; g++) {
          x.beginPath();
          const gy = ry * rh + 4 + r() * (rh - 8);
          x.moveTo(px + 3, gy);
          x.bezierCurveTo(px + w * 0.3, gy + 3, px + w * 0.6, gy - 3, px + w - 5, gy + 1);
          x.stroke();
        }
        px += w;
      }
    }
  });
}

/** Neon-Grid auf Fast-Schwarz (Synth-Deck, als Emissive-Map: nur Linien glühen). */
export function gridTex(cells = 10): THREE.CanvasTexture {
  return make(`grid:${cells}`, 256, 256, (x) => {
    x.fillStyle = '#0f0c18';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#ffffff';
    x.lineWidth = 3;
    const step = 256 / cells;
    for (let i = 0; i <= cells; i++) {
      x.beginPath();
      x.moveTo(i * step, 0);
      x.lineTo(i * step, 256);
      x.stroke();
      x.beginPath();
      x.moveTo(0, i * step);
      x.lineTo(256, i * step);
      x.stroke();
    }
  });
}

/** Metall-Panele mit Nieten (Space-Deck). */
export function platesTex(seed = 1): THREE.CanvasTexture {
  return make(`plates:${seed}`, 256, 256, (x) => {
    const r = rng(seed * 48611);
    x.fillStyle = '#dfe3ea';
    x.fillRect(0, 0, 256, 256);
    const cells = 4;
    const s = 256 / cells;
    for (let ix = 0; ix < cells; ix++)
      for (let iy = 0; iy < cells; iy++) {
        const v = 205 + Math.floor(r() * 40);
        x.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
        x.fillRect(ix * s + 2, iy * s + 2, s - 4, s - 4);
        x.strokeStyle = 'rgba(40,45,60,0.5)';
        x.lineWidth = 2;
        x.strokeRect(ix * s + 2, iy * s + 2, s - 4, s - 4);
        // Nieten in den Ecken
        x.fillStyle = 'rgba(70,78,95,0.7)';
        for (const [ox, oy] of [
          [10, 10],
          [s - 10, 10],
          [10, s - 10],
          [s - 10, s - 10],
        ]) {
          x.beginPath();
          x.arc(ix * s + ox, iy * s + oy, 3, 0, 7);
          x.fill();
        }
      }
  });
}

/** Asteroiden-Krater (Space-Fels). */
export function craterTex(seed = 1): THREE.CanvasTexture {
  return make(`crater:${seed}`, 256, 256, (x) => {
    const r = rng(seed * 15485863);
    x.fillStyle = '#d8d5de';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      const v = 185 + Math.floor(r() * 55);
      x.fillStyle = `rgb(${v},${v - 3},${v + 4})`;
      x.beginPath();
      x.arc(r() * 256, r() * 256, 1 + r() * 3, 0, 7);
      x.fill();
    }
    for (let i = 0; i < 14; i++) {
      const cx = r() * 256;
      const cy = r() * 256;
      const cr = 8 + r() * 20;
      x.fillStyle = 'rgba(95,90,110,0.42)';
      x.beginPath();
      x.arc(cx, cy, cr, 0, 7);
      x.fill();
      x.fillStyle = 'rgba(230,228,238,0.5)';
      x.beginPath();
      x.arc(cx - cr * 0.18, cy - cr * 0.18, cr * 0.72, 0, 7);
      x.fill();
      x.fillStyle = 'rgba(120,115,138,0.35)';
      x.beginPath();
      x.arc(cx + cr * 0.1, cy + cr * 0.1, cr * 0.5, 0, 7);
      x.fill();
    }
  });
}

/** Punkt-Raster (Stoff/Pailletten) für Shorts & Rivalen-Körper — sehr subtil. */
export function dotsTex(seed = 1, gap = 22): THREE.CanvasTexture {
  return make(`dots:${seed}:${gap}`, 128, 128, (x) => {
    x.fillStyle = '#f4f2f6';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(120,110,140,0.22)';
    for (let iy = 0; iy * gap < 128 + gap; iy++)
      for (let ix = 0; ix * gap < 128 + gap; ix++) {
        const off = iy % 2 === 0 ? 0 : gap / 2;
        x.beginPath();
        x.arc(ix * gap + off, iy * gap, 2.4, 0, 7);
        x.fill();
      }
  });
}

/** Feines Kreuz-Gewebe (Stoff) — für Skins/Charakter-Shorts. */
export function weaveTex(): THREE.CanvasTexture {
  return make('weave', 64, 64, (x) => {
    x.fillStyle = '#f3f1f4';
    x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(105,95,125,0.16)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 64; i += 5) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, 64);
      x.stroke();
      x.beginPath();
      x.moveTo(0, i);
      x.lineTo(64, i);
      x.stroke();
    }
  });
}

// ---------------------------------------------------------------------------
// T3 · Charakter-/Rivalen-Stoffe — pro Skin-Stil eine eigene Material-Antwort
// ---------------------------------------------------------------------------

/** Gebürstetes Metall (Robo): feine horizontale Schleifspuren. */
export function brushedTex(seed = 1): THREE.CanvasTexture {
  return make(`brushed:${seed}`, 128, 128, (x) => {
    x.fillStyle = '#eceef2';
    x.fillRect(0, 0, 128, 128);
    const r = rng(seed * 7207);
    for (let i = 0; i < 90; i++) {
      const y = r() * 128;
      const v = 205 + Math.floor(r() * 50);
      x.strokeStyle = `rgba(${v},${v + 2},${v + 6},0.55)`;
      x.lineWidth = 0.6 + r() * 0.9;
      x.beginPath();
      x.moveTo(-4, y);
      x.lineTo(132, y + (r() - 0.5) * 2);
      x.stroke();
    }
  });
}

/** Samt (Boss-Cape/-Shorts): weiches, großflächiges Glanz-Wolken-Rauschen. */
export function velvetTex(seed = 1): THREE.CanvasTexture {
  return make(`velvet:${seed}`, 128, 128, (x) => {
    x.fillStyle = '#efeaf2';
    x.fillRect(0, 0, 128, 128);
    const r = rng(seed * 9091);
    for (let i = 0; i < 26; i++) {
      const cx = r() * 128;
      const cy = r() * 128;
      const cr = 14 + r() * 26;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, cr);
      const dark = r() < 0.5;
      g.addColorStop(0, dark ? 'rgba(120,100,140,0.10)' : 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
    }
  });
}

/** Pailletten (Disco): dichtes Glitzer-Punktraster — auch als Emissive-Map. */
export function sequinTex(gap = 9): THREE.CanvasTexture {
  return make(`sequin:${gap}`, 128, 128, (x) => {
    x.fillStyle = '#5a5462';
    x.fillRect(0, 0, 128, 128);
    for (let iy = 0; iy * gap < 128 + gap; iy++)
      for (let ix = 0; ix * gap < 128 + gap; ix++) {
        const off = iy % 2 === 0 ? 0 : gap / 2;
        const px = ix * gap + off;
        const py = iy * gap;
        const shine = 190 + Math.floor(((ix * 7 + iy * 13) % 8) * 8);
        x.fillStyle = `rgb(${shine},${shine},${shine + 4})`;
        x.beginPath();
        x.arc(px, py, gap * 0.34, 0, 7);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.85)';
        x.beginPath();
        x.arc(px - gap * 0.1, py - gap * 0.1, gap * 0.1, 0, 7);
        x.fill();
      }
  });
}

/** Carbon-Waffel (Neon/Ninja): diagonales Köper-Gewebe. */
export function carbonTex(): THREE.CanvasTexture {
  return make('carbon', 64, 64, (x) => {
    x.fillStyle = '#e9e9ee';
    x.fillRect(0, 0, 64, 64);
    const cell = 8;
    for (let iy = 0; iy < 64 / cell; iy++)
      for (let ix = 0; ix < 64 / cell; ix++) {
        const even = (ix + iy) % 2 === 0;
        x.fillStyle = even ? 'rgba(150,150,165,0.35)' : 'rgba(255,255,255,0.28)';
        x.fillRect(ix * cell, iy * cell, cell - 1, cell - 1);
      }
  });
}

/** Nadelstreifen (Showmaster-Anzug): feine helle Vertikalstreifen. */
export function pinstripeTex(gap = 12): THREE.CanvasTexture {
  return make(`pinstripe:${gap}`, 128, 128, (x) => {
    x.fillStyle = '#ecebef';
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,255,255,0.75)';
    x.lineWidth = 1.4;
    for (let i = 0; i * gap <= 128; i++) {
      x.beginPath();
      x.moveTo(i * gap, 0);
      x.lineTo(i * gap, 128);
      x.stroke();
    }
  });
}

/** Haar-Strähnen: leicht gebogene vertikale Linien (sehr subtil). */
export function strandTex(seed = 1): THREE.CanvasTexture {
  return make(`strand:${seed}`, 128, 128, (x) => {
    x.fillStyle = '#f0eef2';
    x.fillRect(0, 0, 128, 128);
    const r = rng(seed * 6373);
    for (let i = 0; i < 46; i++) {
      const sx = r() * 128;
      const bow = (r() - 0.5) * 18;
      const v = 195 + Math.floor(r() * 45);
      x.strokeStyle = `rgba(${v},${Math.floor(v * 0.96)},${Math.floor(v * 0.92)},0.5)`;
      x.lineWidth = 1 + r() * 1.6;
      x.beginPath();
      x.moveTo(sx, -6);
      x.bezierCurveTo(sx + bow, 40, sx - bow, 90, sx + bow * 0.4, 134);
      x.stroke();
    }
  });
}

/** Poren/Haut: ultra-subtiles Rauschen (< 5 % Kontrast) gegen leere Flächen. */
export function poreTex(seed = 1): THREE.CanvasTexture {
  return make(`pore:${seed}`, 128, 128, (x) => {
    x.fillStyle = '#f6f4f2';
    x.fillRect(0, 0, 128, 128);
    const r = rng(seed * 4241);
    for (let i = 0; i < 900; i++) {
      const v = 236 + Math.floor(r() * 14);
      x.fillStyle = `rgba(${v},${v - 2},${v - 4},0.5)`;
      x.beginPath();
      x.arc(r() * 128, r() * 128, 0.7 + r() * 1.1, 0, 7);
      x.fill();
    }
  });
}

/** Scanlines (Synth-Rivale): horizontale Bildschirmzeilen. */
export function scanlineTex(gap = 5): THREE.CanvasTexture {
  return make(`scanline:${gap}`, 64, 64, (x) => {
    x.fillStyle = '#f1eff4';
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = 'rgba(130,120,155,0.28)';
    for (let y = 0; y < 64; y += gap) x.fillRect(0, y, 64, 1.6);
  });
}

/** Weiche Blob-Flecken (Alien-Glow, Club-Konfetti-Sprenkel, Muschel-Buckel). */
export function spotsTex(seed = 1, n = 26): THREE.CanvasTexture {
  return make(`spots:${seed}:${n}`, 128, 128, (x) => {
    x.fillStyle = '#141018';
    x.fillRect(0, 0, 128, 128);
    const r = rng(seed * 3499);
    for (let i = 0; i < n; i++) {
      const cx = r() * 128;
      const cy = r() * 128;
      const cr = 4 + r() * 9;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, cr);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.4)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
    }
  });
}

const repeatCache = new Map<string, THREE.CanvasTexture>();

/**
 * Repeat-Klon einer gecachten Textur (Repeat ist Textur-Zustand, kein
 * Material-Zustand). Ebenfalls gecacht, damit Bühnen-Rebuilds keine
 * GPU-Texturen leaken — Material-`dispose()` fasst Texturen nie an.
 */
export function repeated(t: THREE.CanvasTexture, rx: number, ry: number): THREE.CanvasTexture {
  const key = `${t.uuid}|${rx}|${ry}`;
  const hit = repeatCache.get(key);
  if (hit) return hit;
  const c = t.clone();
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  repeatCache.set(key, c);
  return c;
}
