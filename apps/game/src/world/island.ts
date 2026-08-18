import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { toonMat } from '../engine/materials';
import {
  craterTex,
  edgeShadeTex,
  platesTex,
  repeated,
  speckleTex,
  strataTex,
  velvetTex,
} from '../engine/textures';
import type { BackgroundKey, WorldAnim } from '../types';

/**
 * Die schwebende Bühnen-Insel — seit dem Goal-Umbau PRO THEME ein eigenes
 * Bauwerk (vorher trugen alle Bühnen dieselbe Erd-Insel): der Club steht auf
 * einer dunklen Stein-Plattform mit Neonkante und Kristallen, Synthwave auf
 * einem Chrom-Deck über einer Neon-Pyramide, der Strand auf einer Sandbank mit
 * Sandstein-Schichten, der Weltraum auf einem vernieteten Metall-Deck über
 * einem Krater-Asteroiden. Alle Oberflächen sind TEXTURIERT (prozedurale
 * Canvas-Maps, engine/textures.ts). Auch die Hintergrund-Füllung (Mini-Inseln/
 * Wolken/Asteroiden/Neon-Rahmen) ist Teil des Themes.
 *
 * Die SPIELFLÄCHE bleibt für alle Themes identisch (gleicher Radius, gleiches
 * Zentrum, Oberkante y = −2.4) — nur der Look wechselt; Physik/Kamera/Layout
 * sind unberührt. Die Oberseite ist das geteilte `floorMat` (World tönt +
 * texturiert es pro Bühne um).
 */
export const ISLAND_R = 6.4;
/** Insel-Zentrum = DUO-Mitte (Spieler 0/0, Rivale ~2.9/3.6). */
export const ISLAND_C = { x: 1.4, z: 1.7 };
/** Oberkante des Decks — für alles, was AUF der Insel steht (G3-Publikum). */
export const TOP_Y = -2.4;

type Hue = (hex: number) => THREE.Color;

interface IslandCtx {
  g: THREE.Group;
  hue: Hue;
  anims: WorldAnim[];
  /** D-10: G3-Dichtefaktor — low halbiert Ausläufer/Bruchstück-Zahlen. */
  density: number;
}

/**
 * D-10 — Insel-SILHOUETTE pro Theme (F1): Die Spielfläche (floorMat-Disc,
 * Tiles, AO, Lounge) bleibt für alle Themes kreisrund — aber KANTE und
 * Unterbau brechen die Kreiskontur wirklich: Synth = umschriebenes Hexagon
 * (die Ecken ragen ~1 Einheit über die Deckkante hinaus), Beach = Sandbank
 * mit Radius-Jitter + Ausläufern, Space = zersprengter 5er-Ring mit
 * abgesprengten Brocken. Club bleibt bewusst rund (Referenz-Silhouette).
 */
/** D-10 Synth: Umschriebenes Hexagon — Ecken bei R/cos(30°) ≈ 7.39. */
const HEX_R = ISLAND_R / Math.cos(Math.PI / 6);
/** D-10 Space: Umschriebenes Fünfeck des zersprengten Rings. */
const PENT_R = (ISLAND_R / Math.cos(Math.PI / 5)) * 0.98;

/** Deterministischer LCG (D-10-Jitter — gleiche Kontur bei jedem Rebuild). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * D-10: Radius-Jitter auf einem offenen Zylinder-Mantel — skaliert jede
 * Vertex-SPALTE radial (Naht-Spalte = Spalte 0, damit die Kante schließt).
 * `off[i]` in Welt-Einheiten, positiv = nach außen.
 */
function jitterRim(geo: THREE.CylinderGeometry, off: number[]): void {
  const segs = off.length - 1;
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const col = i % (segs + 1);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z) || 1;
    const f = (r + off[col === segs ? 0 : col]!) / r;
    pos.setX(i, x * f);
    pos.setZ(i, z * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function at(m: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  m.position.set(ISLAND_C.x + x, y, ISLAND_C.z + z);
  return m;
}

/** Deterministischer Winkel-Ring-Helper (Zapfen, Kristalle, Blöcke). */
function ring(n: number, f: (a: number, i: number) => void): void {
  for (let i = 0; i < n; i++) f((i / n) * Math.PI * 2 + (i % 3) * 0.11, i);
}

/**
 * Draw-Call-Budget (ROADMAP-V2 G3, < 250/Bühne): platzierte Meshes GLEICHEN
 * Materials zu EINEM Mesh backen. Die Meshes werden nur als Transform-Träger
 * gebaut und danach verworfen — Position/Rotation/Skalierung wandern in die
 * Vertices, das Bild bleibt identisch, aus 14 Zapfen wird ein Batch. Nur für
 * STATISCHE Deko: was sich einzeln bewegt (Shards, Kristall-Puls), bleibt ein
 * eigenes Objekt.
 */
export function bake(meshes: THREE.Mesh[], mat: THREE.Material): THREE.Mesh {
  const parts = meshes.map((m) => {
    m.updateMatrix();
    return m.geometry.clone().applyMatrix4(m.matrix);
  });
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  meshes.forEach((m) => m.geometry.dispose());
  return new THREE.Mesh(merged ?? new THREE.BufferGeometry(), mat);
}

// ---------------------------------------------------------------------------
// Club — dunkle Stein-Disco-Plattform mit Neonkante + Deckenkristallen
// ---------------------------------------------------------------------------
function clubIsland({ g, hue, anims }: IslandCtx): void {
  const stoneTex = repeated(speckleTex(3, 700), 3, 1.2);
  const stone = toonMat({
    color: hue(0x6a5a86),
    emissive: hue(0x2a2040),
    emissiveIntensity: 0.5,
    map: stoneTex,
    bumpMap: stoneTex,
    bumpScale: 0.4,
  });
  const stoneDarkTex = repeated(speckleTex(4, 700), 2, 1);
  const stoneDark = toonMat({
    color: hue(0x4a3f63),
    emissive: hue(0x1c1630),
    emissiveIntensity: 0.5,
    map: stoneDarkTex,
    bumpMap: stoneDarkTex,
    bumpScale: 0.4,
  });
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND_R, ISLAND_R * 0.86, 1.6, 48, 1, true),
    stone,
  );
  g.add(at(rim, 0, TOP_Y - 0.8, 0));
  const cap = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R * 0.88, 40), stoneDark);
  cap.rotation.x = Math.PI / 2;
  g.add(at(cap, 0, TOP_Y - 1.62, 0));
  // Neonkante: pulsierender Violett-Ring um die Plattformkante.
  const neon = toonMat({ color: hue(0xb35bf2), emissive: hue(0xb35bf2), emissiveIntensity: 0.9 });
  const edge = new THREE.Mesh(new THREE.TorusGeometry(ISLAND_R - 0.06, 0.09, 10, 64), neon);
  edge.rotation.x = Math.PI / 2;
  g.add(at(edge, 0, TOP_Y + 0.02, 0));
  // Hängende Amethyst-Kristalle statt Erd-Zapfen.
  const gem = toonMat({ color: hue(0x9d5cf6), emissive: hue(0x5b2fa8), emissiveIntensity: 0.7 });
  const gems: THREE.Mesh[] = [];
  const rocks: THREE.Mesh[] = [];
  ring(12, (a, i) => {
    const rr = ISLAND_R * (0.4 + 0.5 * (((i * 7) % 12) / 12));
    const s = 0.5 + 0.7 * (1 - rr / ISLAND_R) + ((i * 5) % 3) * 0.16;
    const glow = i % 3 === 0;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.8), glow ? gem : stoneDark);
    c.scale.y = 1.9;
    c.rotation.y = a * 2.1;
    at(c, Math.cos(a) * rr, TOP_Y - 1.9 - s * 0.8, Math.sin(a) * rr);
    // Nur die vier glühenden Kristalle drehen sich einzeln — der Rest ist
    // starre Deko und wandert in EINEN Batch (Draw-Call-Budget, G3).
    if (glow) {
      gems.push(c);
      g.add(c);
    } else rocks.push(c);
  });
  g.add(bake(rocks, stoneDark));
  anims.push((_t, beatV) => {
    neon.emissiveIntensity = 0.7 + beatV * 0.7;
    gem.emissiveIntensity = 0.5 + beatV * 0.5;
    for (let i = 0; i < gems.length; i++) gems[i].rotation.y += 0.004;
  });
  // Hintergrund: schwebende dunkle Blöcke mit Neon-Kanten + weiche Nachtwolken.
  const blockMatTex = repeated(speckleTex(5, 500), 2, 2);
  const blockMat = toonMat({
    color: hue(0x3d3356),
    emissive: hue(0x181226),
    emissiveIntensity: 0.55,
    map: blockMatTex,
    bumpMap: blockMatTex,
    bumpScale: 0.35,
  });
  const cloudMat = toonMat({
    color: 0xcfc6e6,
    emissive: 0x6a5c92,
    emissiveIntensity: 0.35,
    map: repeated(velvetTex(3), 1.5, 1.5),
  });
  const blocks: THREE.Mesh[] = [];
  const edges: THREE.Mesh[] = [];
  for (const [x, y, z, s] of [
    [-11, -4.2, 13, 1.9],
    [12.5, -6, 10, 1.4],
    [-13.5, -2, 3, 1.1],
    [10, -7.5, 19, 2.3],
  ] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s * 1.3, s * 2));
    b.rotation.y = x * 0.3;
    blocks.push(at(b, x, y, z) as THREE.Mesh);
    const e = new THREE.Mesh(new THREE.TorusGeometry(s * 1.15, 0.06, 8, 4));
    e.rotation.x = Math.PI / 2;
    e.rotation.z = Math.PI / 4 + x * 0.3;
    edges.push(at(e, x, y + s * 0.66, z) as THREE.Mesh);
  }
  g.add(bake(blocks, blockMat), bake(edges, neon));
  for (const [x, y, z, s] of [
    [-8, 2.6, 12, 1.1],
    [12, 4.2, 15, 1.4],
    [5, 6.4, 20, 1.7],
  ] as const)
    puffCloud(g, cloudMat, x, y, z, s);
}

// ---------------------------------------------------------------------------
// Synth — Chrom-Deck über invertierter Neon-Pyramide, schwebende Shards
// ---------------------------------------------------------------------------
function synthIsland({ g, hue, anims }: IslandCtx): void {
  const chromeTex = repeated(platesTex(2), 4, 1);
  const chrome = toonMat({
    color: hue(0x8a7fb0),
    emissive: hue(0x2c2348),
    emissiveIntensity: 0.5,
    map: chromeTex,
    bumpMap: chromeTex,
    bumpScale: 0.3,
  });
  // D-10: Das Deck sitzt auf einem UMSCHRIEBENEN Hexagon — die sechs Ecken
  // ragen ~1 Einheit über die runde Deckkante hinaus, der UMRISS ist das
  // Sechseck (F1-Auflage: die Kreiskontur wird wirklich gebrochen).
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(HEX_R, HEX_R * 0.93, 1.1, 6, 1, true),
    chrome,
  );
  g.add(at(rim, 0, TOP_Y - 0.55, 0));
  const cap = new THREE.Mesh(
    new THREE.CircleGeometry(HEX_R * 0.9, 6),
    toonMat({ color: hue(0x241c3e), emissive: hue(0x120e22), emissiveIntensity: 0.5 }),
  );
  cap.rotation.x = Math.PI / 2;
  g.add(at(cap, 0, TOP_Y - 1.12, 0));
  // Doppelte Neonkante (pink + cyan) — das Synthwave-Markenzeichen. D-10:
  // beide Tori auf 6 Segmente, rotations-gleich mit den Hexagon-Ecken.
  const pink = toonMat({ color: hue(0xff3fb0), emissive: hue(0xff3fb0), emissiveIntensity: 1.0 });
  const cyan = toonMat({ color: hue(0x2ff5e8), emissive: hue(0x2ff5e8), emissiveIntensity: 0.85 });
  const e1 = new THREE.Mesh(new THREE.TorusGeometry(HEX_R - 0.06, 0.085, 10, 6), pink);
  e1.rotation.x = Math.PI / 2;
  g.add(at(e1, 0, TOP_Y + 0.02, 0));
  const e2 = new THREE.Mesh(new THREE.TorusGeometry(HEX_R * 0.93, 0.05, 8, 6), cyan);
  e2.rotation.x = Math.PI / 2;
  g.add(at(e2, 0, TOP_Y - 1.05, 0));
  // Invertierte Pyramide als Kiel — dunkel mit Neon-Drahtgitter.
  const keelGeo = new THREE.ConeGeometry(ISLAND_R * 0.62, 4.6, 4);
  const keel = new THREE.Mesh(
    keelGeo,
    toonMat({ color: hue(0x2a2046), emissive: hue(0x161030), emissiveIntensity: 0.55 }),
  );
  keel.rotation.x = Math.PI;
  keel.rotation.y = Math.PI / 4;
  g.add(at(keel, 0, TOP_Y - 3.5, 0));
  const wire = new THREE.Mesh(
    keelGeo,
    new THREE.MeshBasicMaterial({
      color: hue(0xff3fb0),
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    }),
  );
  keel.add(wire);
  // Schwebende Neon-Shards, die langsam rotieren.
  const shardMat = toonMat({
    color: hue(0xff3fb0),
    emissive: hue(0xb02a7a),
    emissiveIntensity: 0.6,
  });
  const shards: THREE.Mesh[] = [];
  ring(6, (a, i) => {
    const rr = ISLAND_R * (0.75 + 0.25 * (i % 2));
    const s = 0.35 + (i % 3) * 0.18;
    const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(s), i % 2 ? shardMat : cyan);
    g.add(at(sh, Math.cos(a) * rr, TOP_Y - 2 - (i % 3) * 0.8, Math.sin(a) * rr));
    shards.push(sh);
  });
  anims.push((t, beatV) => {
    pink.emissiveIntensity = 0.8 + beatV * 0.7;
    for (let i = 0; i < shards.length; i++) {
      shards[i].rotation.x += 0.006;
      shards[i].rotation.y += 0.009;
      shards[i].position.y += Math.sin(t * 1.2 + i) * 0.0035;
    }
  });
  // Hintergrund: ferne Neon-Portale (Torus-Rahmen) + Chrom-Plattformen.
  for (const [x, y, z, s] of [
    [-11, -1.5, 14, 2.0],
    [13, 1.2, 17, 2.6],
    [-14, 3.5, 6, 1.5],
  ] as const) {
    const p = new THREE.Mesh(new THREE.TorusGeometry(s, 0.12, 10, 32), i2(x) ? pink : cyan);
    g.add(at(p, x, y, z));
  }
  for (const [x, y, z, s] of [
    [11, -5.5, 12, 1.6],
    [-9.5, -4.5, 15, 1.9],
  ] as const) {
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.9, s * 0.3, 18), chrome);
    g.add(at(deck, x, y, z));
  }
}
const i2 = (x: number): boolean => Math.abs(Math.round(x)) % 2 === 0;

// ---------------------------------------------------------------------------
// Beach — Sandbank mit Sandstein-Schichten, Muscheln + grünen Mini-Inseln
// ---------------------------------------------------------------------------
function beachIsland({ g, hue, anims, density }: IslandCtx): void {
  const sandstoneTex = repeated(strataTex(2), 2.5, 1);
  const sandstone = toonMat({
    color: hue(0xd9b273),
    emissive: hue(0x6a4f28),
    emissiveIntensity: 0.5,
    map: sandstoneTex,
    bumpMap: sandstoneTex,
    bumpScale: 0.5,
  });
  const earthDarkTex = repeated(speckleTex(6, 800), 2, 1);
  const earthDark = toonMat({
    color: hue(0x8a6a3e),
    emissive: hue(0x40301a),
    emissiveIntensity: 0.5,
    map: earthDarkTex,
    bumpMap: earthDarkTex,
    bumpScale: 0.35,
  });
  // D-10: UNREGELMÄSSIGE Sandbank statt Kreiszylinder — deterministischer
  // Radius-Jitter NACH AUSSEN (nie unter ISLAND_R − 0.1 nach innen), die
  // Kante wird eine gewachsene Küstenlinie, kein gedrehtes Werkstück.
  const rimGeo = new THREE.CylinderGeometry(ISLAND_R, ISLAND_R * 0.85, 1.7, 48, 1, true);
  {
    const rnd = lcg(4711);
    const off: number[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      // ABNAHME D-10: Der reine Zufalls-Jitter (±0.35) franste die Kante nur
      // aus — im Bild blieb ein Kreis mit Schaumband, und ein Ornamentband ist
      // laut Auflage KEINE Silhouette. Jetzt tragen drei tiefe Lappen (sin 3a)
      // plus eine zweite Welle (sin 5a) den Bruch: der Umriss bekommt Buchten
      // und Nasen. Alle Werte sind POSITIV — die Sandbank wächst nur nach
      // AUSSEN, die runde Spielfläche (F1) bleibt vollständig überdeckt.
      const lobe = 0.5 * Math.sin(a * 3 + 0.7) + 0.22 * Math.sin(a * 5 - 1.3);
      // Die Körnung bleibt klein: viel Rauschen auf 48 Segmenten facettiert die
      // Kante, statt sie zu formen — die Lappen tragen den Bruch.
      off.push(0.6 + lobe + rnd() * 0.05); // ≈ +0.1 … +1.4
    }
    jitterRim(rimGeo, off);
  }
  const rim = new THREE.Mesh(rimGeo, sandstone);
  g.add(at(rim, 0, TOP_Y - 0.85, 0));
  // D-10: Drei flache Sand-AUSLÄUFER, die 1.2–1.8 Einheiten über den Kreis
  // hinausragen — sie tragen den Kontur-Bruch (low: halbe Stückzahl).
  {
    const spits: THREE.Mesh[] = [];
    const spitCount = Math.max(1, Math.round(3 * density));
    const spitCfg: readonly [number, number, number][] = [
      [0.45, 1.8, 1.5], // Winkel, Reichweite über den Rand, Halbdisc-Radius
      [2.3, 1.2, 1.1],
      [4.4, 1.5, 1.3],
    ];
    for (let i = 0; i < spitCount; i++) {
      const [a, reach, r] = spitCfg[i]!;
      const geo = new THREE.CircleGeometry(r, 14, 0, Math.PI);
      geo.rotateX(-Math.PI / 2); // flach; die runde Seite zeigt lokal −z
      const d = new THREE.Mesh(geo);
      // Runde Seite nach AUSSEN drehen (−z → Richtung (cos a, sin a)).
      d.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      d.position.set(
        ISLAND_C.x + Math.cos(a) * (ISLAND_R + reach - r),
        TOP_Y - 0.06,
        ISLAND_C.z + Math.sin(a) * (ISLAND_R + reach - r),
      );
      spits.push(d);
    }
    g.add(bake(spits, sandstone));
  }
  const cap = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R * 0.87, 40), earthDark);
  cap.rotation.x = Math.PI / 2;
  g.add(at(cap, 0, TOP_Y - 1.72, 0));
  // Schaumkante: heller Ring wie eine auslaufende Welle auf dem Sanddeck.
  // D-10: bleibt bewusst RUND (dokumentierte Vereinfachung — er liest als
  // auslaufende Welle; den Kontur-Bruch tragen Jitter + Ausläufer).
  const foamMat = toonMat({ color: 0xfff8ea, emissive: 0xcfe8f0, emissiveIntensity: 0.35 });
  const foam = new THREE.Mesh(new THREE.TorusGeometry(ISLAND_R - 0.18, 0.1, 8, 64), foamMat);
  foam.rotation.x = Math.PI / 2;
  g.add(at(foam, 0, TOP_Y + 0.015, 0));
  // Erd-Zapfen (Sand-Töne) + eingelagerte Kiesel — je Material ein Batch.
  const spikesDark: THREE.Mesh[] = [];
  const spikesSand: THREE.Mesh[] = [];
  ring(14, (a, i) => {
    const rr = ISLAND_R * (0.35 + 0.58 * (((i * 7) % 14) / 14));
    const s = 0.7 + 1.0 * (1 - rr / ISLAND_R) + ((i * 5) % 4) * 0.2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(s * 0.72, s * 2.3, 6));
    spike.rotation.x = Math.PI;
    spike.rotation.y = a * 2.3;
    at(spike, Math.cos(a) * rr, TOP_Y - 1.7 - s * 0.72, Math.sin(a) * rr);
    (i % 3 === 0 ? spikesDark : spikesSand).push(spike);
  });
  g.add(bake(spikesDark, earthDark), bake(spikesSand, sandstone));
  // Deko am Sandrand: Muschel + Seestern (klein, außerhalb der Tanzfläche).
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    toonMat({ color: hue(0xffd9e0), emissive: 0x8a5a60, emissiveIntensity: 0.2 }),
  );
  shell.rotation.z = 0.4;
  g.add(at(shell, -4.9, TOP_Y + 0.08, -2.6));
  const starMat = toonMat({ color: hue(0xff7a8a) });
  const star = new THREE.Group();
  {
    const arms: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const armGeo = new THREE.SphereGeometry(1, 8, 6);
      armGeo.scale(0.34, 0.09, 0.13);
      const arm = new THREE.Mesh(armGeo);
      const a = (i / 5) * Math.PI * 2;
      arm.position.set(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24);
      arm.rotation.y = -a;
      arms.push(arm);
    }
    star.add(bake(arms, starMat));
  }
  g.add(at(star, 4.6, TOP_Y + 0.06, -3.4));
  // Hintergrund: die klassischen grünen Mini-Inseln + weiße Puffwolken.
  const grass = toonMat({
    color: hue(0x7fb64a),
    emissive: hue(0x2e4a16),
    emissiveIntensity: 0.35,
    map: repeated(speckleTex(11, 900), 2, 2),
  });
  const cloudMat = toonMat({
    color: 0xffffff,
    emissive: 0x9aa2c0,
    emissiveIntensity: 0.35,
    map: repeated(velvetTex(3), 1.5, 1.5),
  });
  const isleTops: THREE.Mesh[] = [];
  const isleUnders: THREE.Mesh[] = [];
  for (const [x, y, z, r] of [
    [-11, -3.6, 14, 2.1],
    [12, -5.2, 11, 1.5],
    [-14.5, -1.8, 4, 1.2],
    [8, -6.5, 18, 2.6],
  ] as const) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, r * 0.28, 22));
    isleTops.push(at(top, x, y, z) as THREE.Mesh);
    const under = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, r * 1.5, 8));
    under.rotation.x = Math.PI;
    isleUnders.push(at(under, x, y - r * 0.85, z) as THREE.Mesh);
  }
  g.add(bake(isleTops, grass), bake(isleUnders, sandstone));
  for (const [x, y, z, s] of [
    [-8, 2.6, 12, 1.2],
    [12, 4.2, 15, 1.5],
    [5, 6.4, 20, 1.8],
    [17, 0.8, 8, 1.1],
  ] as const)
    puffCloud(g, cloudMat, x, y, z, s);
  anims.push((t) => {
    star.rotation.y = Math.sin(t * 0.4) * 0.15;
    // ROADMAP-V2 G3: Schaum-Puls am Inselrand — die Welle läuft alle ~4 s aus
    // und zieht sich zurück. Kostet nichts: es ist die Ruhe-Anim des SCHON
    // vorhandenen Kantenrings (Emissive + minimale Radial-Skalierung), also
    // weder ein neuer Draw-Call noch ein neues Material.
    const wave = 0.5 + 0.5 * Math.sin(t * 1.55);
    foamMat.emissiveIntensity = 0.22 + wave * 0.5;
    const w = 1 + wave * 0.006;
    foam.scale.set(w, w, 1);
  });
}

// ---------------------------------------------------------------------------
// Space — vernietetes Metall-Deck auf Krater-Asteroid, Kristalle + Trümmer
// ---------------------------------------------------------------------------
function spaceIsland({ g, hue, anims, density }: IslandCtx): void {
  const rockTex = repeated(craterTex(3), 2, 1.2);
  const rock = toonMat({
    color: hue(0x8d87a6),
    emissive: hue(0x2e2a44),
    emissiveIntensity: 0.55,
    map: rockTex,
    bumpMap: rockTex,
    bumpScale: 0.6,
  });
  const deckTex = repeated(platesTex(5), 5, 1);
  const deck = toonMat({
    color: hue(0x707a92),
    emissive: hue(0x252c40),
    emissiveIntensity: 0.5,
    map: deckTex,
    bumpMap: deckTex,
    bumpScale: 0.3,
  });
  // Metall-Fassung unter der Deckkante, darunter der Asteroiden-Bauch.
  // D-10: Der Band-Zylinder wird ein ZERSPRENGTER Ring — fünf unregelmäßige
  // Radial-Segmente (umschriebenes Fünfeck + Ecken-Jitter): der Umriss ist
  // kein Kreis mehr, sondern eine geborstene Plattform.
  const bandGeo = new THREE.CylinderGeometry(PENT_R, PENT_R * 0.97, 0.55, 5, 1, true);
  {
    const rnd = lcg(9091);
    const off: number[] = [];
    for (let i = 0; i <= 5; i++) off.push(-0.15 + rnd() * 0.45);
    jitterRim(bandGeo, off);
  }
  const band = new THREE.Mesh(bandGeo, deck);
  g.add(at(band, 0, TOP_Y - 0.27, 0));
  // D-10: Abgesprengte Randstücke — Keile, die mit sichtbarem Spalt AUSSERHALB
  // der Deckkante schweben (statisch gebakt; low: halbe Stückzahl).
  {
    const chunks: THREE.Mesh[] = [];
    const cfg: readonly [number, number, number, number][] = [
      [0.7, 1.0, 0.62, -0.5], // Winkel, Abstand über den Rand, Größe, y-Versatz
      [2.0, 0.55, 0.42, -0.15],
      [3.5, 1.2, 0.78, -0.75],
      [5.2, 0.7, 0.5, -0.35],
    ];
    const n = Math.max(2, Math.round(cfg.length * density));
    for (let i = 0; i < n; i++) {
      const [a, gap, s, dy] = cfg[i]!;
      const c = new THREE.Mesh(new THREE.TetrahedronGeometry(s));
      c.rotation.set(a * 1.7, a * 0.9, a * 0.4);
      c.position.set(
        ISLAND_C.x + Math.cos(a) * (ISLAND_R + gap + s * 0.6),
        TOP_Y + dy,
        ISLAND_C.z + Math.sin(a) * (ISLAND_R + gap + s * 0.6),
      );
      chunks.push(c);
    }
    g.add(bake(chunks, rock));
  }
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(ISLAND_R * 0.96, 40, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    rock,
  );
  belly.scale.y = 0.62;
  g.add(at(belly, 0, TOP_Y - 0.5, 0));
  // Landelichter: kleine Cyan-Punkte rund um die Deckkante.
  const lightMat = toonMat({ color: hue(0x2ff5e8), emissive: hue(0x2ff5e8), emissiveIntensity: 1 });
  const lamps: THREE.Mesh[] = [];
  ring(10, (a) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8));
    lamps.push(
      at(
        b,
        Math.cos(a) * (ISLAND_R - 0.12),
        TOP_Y + 0.06,
        Math.sin(a) * (ISLAND_R - 0.12),
      ) as THREE.Mesh,
    );
  });
  g.add(bake(lamps, lightMat));
  // Kristall-Cluster wachsen aus dem Asteroiden-Bauch.
  const crystal = toonMat({
    color: hue(0x63e8ff),
    emissive: hue(0x2aa8c4),
    emissiveIntensity: 0.7,
  });
  const shards: THREE.Mesh[] = [];
  ring(7, (a, i) => {
    const rr = ISLAND_R * (0.45 + 0.35 * ((i % 3) / 3));
    const s = 0.4 + (i % 3) * 0.22;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.7));
    c.scale.y = 2.1;
    c.rotation.z = Math.cos(a) * 0.5;
    c.rotation.x = Math.sin(a) * 0.4;
    shards.push(
      at(c, Math.cos(a) * rr, TOP_Y - 2.6 - (i % 2) * 0.7, Math.sin(a) * rr) as THREE.Mesh,
    );
  });
  g.add(bake(shards, crystal));
  anims.push((t, beatV) => {
    lightMat.emissiveIntensity = 0.6 + beatV * 0.8;
    crystal.emissiveIntensity = 0.5 + Math.sin(t * 1.4) * 0.2 + beatV * 0.3;
  });
  // Hintergrund: kleine Krater-Asteroiden statt Mini-Inseln (keine Wolken im All).
  const debris: THREE.Mesh[] = [];
  for (const [x, y, z, s] of [
    [-11, -3.2, 13, 1.7],
    [12.5, -5.4, 10, 1.2],
    [-14, -1, 4, 0.9],
    [9, -6.8, 18, 2.1],
    [-7, 4.4, 16, 1.0],
    [15, 3, 12, 0.8],
  ] as const) {
    const geo = new THREE.SphereGeometry(s, 12, 9);
    geo.scale(1, 0.72 + (Math.abs(x) % 0.3), 0.85);
    const a = new THREE.Mesh(geo);
    a.rotation.set(x * 0.2, z * 0.3, 0);
    debris.push(at(a, x, y, z) as THREE.Mesh);
  }
  g.add(bake(debris, rock));
}

/** Weiche Toon-Puffwolke (3 gequetschte Kugeln, EIN Batch) — Club/Beach. */
function puffCloud(
  g: THREE.Group,
  mat: THREE.MeshToonMaterial,
  x: number,
  y: number,
  z: number,
  r: number,
): void {
  const blobs: THREE.Mesh[] = [];
  for (const [ox, oz, rr] of [
    [-1.15, 0, 0.75],
    [0, 0.32, 1.0],
    [1.2, 0, 0.7],
  ] as const) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r * rr, 14, 10));
    b.scale.set(1, 0.72, 0.66);
    b.position.set(ox * r, oz * r, 0);
    blobs.push(b);
  }
  g.add(at(bake(blobs, mat), x, y, z));
}

const BUILDERS: Record<BackgroundKey, (ctx: IslandCtx) => void> = {
  club: clubIsland,
  synth: synthIsland,
  beach: beachIsland,
  space: spaceIsland,
};

/**
 * Baut die Themen-Insel (Unterbau + Hintergrund-Füllung) in `g` und die
 * OBERSEITE als gemeinsame `floorMat`-Disc (World tönt/texturiert sie pro
 * Bühne). Anim-Callbacks (Neon-Puls, Shard-Rotation) landen in `anims`.
 */
export function buildIsland(
  g: THREE.Group,
  key: BackgroundKey,
  hue: Hue,
  floorMat: THREE.MeshPhysicalMaterial,
  anims: WorldAnim[],
  density = 1,
): void {
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R, 56), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(at(floor, 0, TOP_Y, 0));
  // T5 Fake-AO: weicher Grime-Ring am Deckrand erdet den Boden (unter den
  // Club-Tiles bei +0.01, über dem Deck selbst).
  const ao = new THREE.Mesh(
    new THREE.CircleGeometry(ISLAND_R, 56),
    new THREE.MeshBasicMaterial({ map: edgeShadeTex(), transparent: true, depthWrite: false }),
  );
  ao.rotation.x = -Math.PI / 2;
  g.add(at(ao, 0, TOP_Y + 0.004, 0));
  BUILDERS[key]({ g, hue, anims, density });
  underside(g, key, hue);
}

/**
 * D-05 — Der Abschluss UNTER der Insel. Die graue Leere unterm Deck stand in
 * jedem Theme gleich (shots/theme-z15.png, unteres Drittel); jetzt bekommt
 * sie je Theme einen Boden: Club = Nebelteppich-Discs, Synth = dunkles
 * Abgrund-Quad (das Neon-Grid darunter existiert schon in der Kulisse),
 * Beach = Wasserfläche, Space = dunkler Rand-Falloff (die Sterne dahinter
 * bleiben in der Mitte sichtbar). Alles statisch, je Theme ≤ 2 Draw-Calls;
 * hängt an der `islandGroup` und reist beim G1-Wechsel mit der Bühne.
 */
function underside(g: THREE.Group, key: BackgroundKey, hue: Hue): void {
  const disc = (r: number, mat: THREE.Material, drop: number): void => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat);
    d.rotation.x = -Math.PI / 2;
    g.add(at(d, 0, TOP_Y - drop, 0));
  };
  if (key === 'club') {
    // Nebelteppich: zwei weiche Velvet-Discs — bewusst KEIN Additiv (D-02-
    // Lektion: additive Flächen sind der Blowout, den wir gerade abgeschafft
    // haben), der dichte Club-Nebel (fogDensity 0.02) trägt die Tiefe dazu.
    const fogT = toonMat({ color: hue(0x2c2440), map: repeated(velvetTex(2), 3, 3) });
    disc(14, fogT, 8);
    disc(19, fogT, 10);
  } else if (key === 'synth') {
    // Dunkles Abgrund-Quad unter dem Gitter-Horizont — der Kiel endet in
    // Schwärze statt in grauer Leere. Bewusst `toonMat` (geteilte Toon-
    // Familie): ein map-loses MeshBasicMaterial wäre ein NEUER Programm-Typ
    // gewesen (+1 Kompilat, Hook-Messung) — K-7: kein Programm für ein Quad.
    disc(20, toonMat({ color: hue(0x140a26) }), 9);
  } else if (key === 'beach') {
    // Wasserfläche: die Sandbank schwebt jetzt ÜBER dem Meer, nicht im Nichts.
    disc(18, toonMat({ color: hue(0x175a68) }), 7.5);
  } else {
    // Space: dunkler Rand-Falloff — Mitte bleibt offen (Sterne), der Rand
    // vignettiert die Untersicht weich ab.
    disc(
      20,
      new THREE.MeshBasicMaterial({
        map: edgeShadeTex(),
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      }),
      8,
    );
  }
}
