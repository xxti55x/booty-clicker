import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { INK, mk, outlineMaterial, toonMat, withOutline } from '../engine/materials';
import type { GlowSpriteFn, SceneLights } from '../engine/scene';
import {
  bandsTex,
  craterTex,
  gridTex,
  plankTex,
  platesTex,
  repeated,
  sequinTex,
  speckleTex,
  strataTex,
} from '../engine/textures';
import { bake, buildIsland, ISLAND_C, ISLAND_R, TOP_Y } from './island';
import type { BackgroundKey, WorldAnim } from '../types';

/**
 * Stage scenery — Wave 3 of the cartoon art pass. Every stage's hero props are
 * cel-shaded (`toonMat`) with inverted-hull ink outlines (`withOutline`) so the
 * scenery reads in the same cartoon world as the player rig (Wave 1) and the
 * rival entities (Wave 2). Purely-atmospheric elements keep their original
 * treatment where toon would look worse: the mirror-ball reflections, the
 * synthwave sun shader, the star Points, additive glow sprites/beams and the
 * animated sea.
 *
 * Staging: the boot camera sits at ~(-2.7, 3.8, -8.8) looking across the origin
 * toward +z, so the visible backdrop wedge is the +z hemisphere (+x = screen
 * left). Hero props live there — kept to the back/sides so they never occlude
 * the player (origin) or the rival (ENTITY_STAGE ≈ (3.5, -2.4, 4.4), screen
 * left) — with a sparser echo at −z so orbiting the camera still finds scenery.
 */

/** Hue-shift per recolour lap — matches the rival's `entityVariant` cadence. */
const LAP_HUE = 0.085;

interface BuildCtx {
  propGroup: THREE.Group;
  /**
   * Die Insel-Gruppe (G1): alles hier drin fährt beim Bühnen-Wechsel 1:1 mit
   * der Insel aus und ein — im Gegensatz zu `propGroup`, die als ferne Kulisse
   * nur mit `PROP_PARALLAX` mitzieht. Das G3-Publikum sitzt auf der Insel.
   */
  islandGroup: THREE.Group;
  glowSprite: GlowSpriteFn;
  anims: WorldAnim[];
  /** Recolour lap 0,1,2… (endless depth); 0 = the stage's original palette. */
  variant: number;
  /** Lap-shifted palette colour — identity on lap 0. */
  hue: (hex: number) => THREE.Color;
  /** G3-Ambient-Dichte aus dem Quality-Preset (1 = voll, 0.5 = low, 0 = aus). */
  density: number;
}

interface BgConfig {
  icon: string;
  name: string;
  top: number;
  bot: number;
  fog: number;
  floor: number;
  /** floor roughness */
  fr: number;
  /** floor metalness */
  fm: number;
  /** BP milestone (highest-ever) before this appears in the shop (M2 content-gate). */
  revealAt?: number;
  /**
   * Insel-Deck-Texturierung (Goal „apply texture"): prozedurale Maps auf der
   * geteilten Oberseite — `map` multipliziert die Deckfarbe, `emissiveMap`
   * lässt Muster glühen (Synth-Grid), `scroll` schiebt die Emissive-Map (u/s).
   */
  deck?: {
    map?: () => THREE.Texture;
    emissiveMap?: () => THREE.Texture;
    emissive?: number;
    emissiveIntensity?: number;
    scroll?: number;
    /** Relief-Stärke (Roadmap T2): Map/Emissive-Map dient zugleich als Bump-Höhe. */
    bump?: number;
  };
  /** Per-Theme-Lichtset (Roadmap L): Key/Fill/Hemi/Rims wechseln mit der Kulisse. */
  light: {
    key: number;
    keyInt: number;
    fill: number;
    fillInt: number;
    sky: number;
    ground: number;
    rimA: number;
    rimB: number;
  };
  build: (ctx: BuildCtx) => void;
}

// ---------------------------------------------------------------------------
// Shared cartoon prop builders
// ---------------------------------------------------------------------------

/** Ink-outline a scenery mesh (cartoon default treatment for props). */
function O<T extends THREE.Mesh>(m: T, thickness = 0.03): T {
  return withOutline(m, { thickness });
}

interface Sway {
  g: THREE.Group;
  phase: number;
  amp: number;
}

/**
 * Kopien einer Geometrie an vorgegebenen Transforms zu EINER Geometrie backen.
 * Die Palme trug vorher 6 Wedel- und 2 Nuss-Meshes mit je eigener Ink-Hülle —
 * 18 Draw-Calls pro Baum, bei 6 Palmen (Synth/Beach) allein 108. Gebacken sind
 * es 6 pro Baum bei BYTE-GLEICHEM Bild: dieselbe Geometrie, dieselben
 * Transforms, dieselben Materialien — nur ein Batch statt vieler (G3-Budget).
 */
function baked(geo: THREE.BufferGeometry, mats: THREE.Matrix4[]): THREE.BufferGeometry {
  const parts = mats.map((m) => geo.clone().applyMatrix4(m));
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  geo.dispose();
  return merged ?? geo;
}

/**
 * Chunky cartoon palm: toon trunk, six blob fronds (baked-scale spheres so the
 * ink hull keeps constant weight) and a pair of coconuts. Registered in
 * `sways` for the caller's shared sway anim. Wedel und Nüsse sind in je EINE
 * Geometrie gebacken (siehe `baked`).
 */
function palm(
  ctx: BuildCtx,
  x: number,
  z: number,
  s: number,
  trunkHex: number,
  leafHex: number,
  sways: Sway[],
): void {
  const { propGroup, hue } = ctx;
  const g = new THREE.Group();
  const barkTex = repeated(strataTex(4), 1, 1.6);
  const trunk = O(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.13 * s, 0.24 * s, 3.3 * s, 8),
      toonMat({ color: hue(trunkHex), map: barkTex, bumpMap: barkTex, bumpScale: 0.25 }),
    ),
  );
  trunk.position.y = 1.62 * s;
  trunk.rotation.z = -0.09;
  g.add(trunk);
  const leafGeo = new THREE.SphereGeometry(1, 10, 8);
  leafGeo.scale(1.12 * s, 0.22 * s, 0.44 * s);
  const leafMat = toonMat({ color: hue(leafHex) });
  // hold(rotY) ∘ leaf(T · Rz) — exakt die Objekt-Hierarchie von vorher.
  const leafMats: THREE.Matrix4[] = [];
  for (let i = 0; i < 6; i++) {
    leafMats.push(
      new THREE.Matrix4()
        .makeRotationY((i / 6) * Math.PI * 2 + 0.35)
        .multiply(
          new THREE.Matrix4()
            .makeTranslation(0.92 * s, 0, 0)
            .multiply(new THREE.Matrix4().makeRotationZ(-0.48)),
        ),
    );
  }
  const crown = O(new THREE.Mesh(baked(leafGeo, leafMats), leafMat));
  crown.position.set(0.3 * s, 3.28 * s, 0);
  g.add(crown);
  const nutMat = toonMat({ color: hue(0x6b4a2a) });
  const nuts = O(
    new THREE.Mesh(
      baked(new THREE.SphereGeometry(0.15 * s, 8, 8), [
        new THREE.Matrix4().makeTranslation(0.16 * s, 3.12 * s, 0.18 * s),
        new THREE.Matrix4().makeTranslation(0.48 * s, 3.08 * s, -0.12 * s),
      ]),
      nutMat,
    ),
    0.02,
  );
  g.add(nuts);
  g.position.set(x, -2.4, z);
  propGroup.add(g);
  sways.push({ g, phase: x * 0.7 + z, amp: 0.02 + 0.012 * ((Math.abs(x) + s) % 1) });
}

/**
 * Chunky cartoon speaker stack facing the dance floor: rounded cabinets (soft
 * edges keep the ink hull crack-free), toon woofers and a beat-pulsed glowing
 * dome pushed into `pulses`.
 */
function speakerStack(
  ctx: BuildCtx,
  x: number,
  z: number,
  s: number,
  pulses: THREE.Object3D[],
): void {
  const { propGroup, hue } = ctx;
  const g = new THREE.Group();
  g.position.set(x, -2.4, z);
  g.rotation.y = Math.atan2(-x, -z); // face the stage centre
  const tolex = repeated(speckleTex(9, 1200), 2, 2);
  const cabMat = toonMat({ color: hue(0x3a2b58), map: tolex, bumpMap: tolex, bumpScale: 0.15 });
  const rimMat = toonMat({ color: 0x241c34 });
  const discMat = toonMat({ color: 0x171226 });
  const accent = hue(0xffd24d);
  const domeMat = toonMat({ color: accent, emissive: accent, emissiveIntensity: 0.9 });
  const cab = O(
    new THREE.Mesh(new RoundedBoxGeometry(1.9 * s, 2.5 * s, 1.4 * s, 2, 0.12 * s), cabMat),
    0.04,
  );
  cab.position.y = 1.25 * s;
  g.add(cab);
  const top = O(
    new THREE.Mesh(new RoundedBoxGeometry(1.45 * s, 1.05 * s, 1.15 * s, 2, 0.1 * s), cabMat),
    0.04,
  );
  top.position.y = 3.05 * s;
  top.rotation.y = 0.16; // jaunty cartoon stack
  g.add(top);
  const woofer = (y: number, r: number, parent: THREE.Object3D, zFront: number): void => {
    const ring = O(new THREE.Mesh(new THREE.TorusGeometry(r, 0.085 * s, 10, 22), rimMat), 0.02);
    ring.position.set(0, y, zFront);
    parent.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 20), discMat);
    disc.position.set(0, y, zFront + 0.01);
    parent.add(disc);
    const domeGeo = new THREE.SphereGeometry(r * 0.38, 12, 8);
    domeGeo.scale(1, 1, 0.6);
    const dome = O(new THREE.Mesh(domeGeo, domeMat), 0.02);
    dome.position.set(0, y, zFront + 0.04);
    parent.add(dome);
    pulses.push(dome);
  };
  woofer(1.05 * s, 0.55 * s, g, 0.72 * s);
  woofer(2.05 * s, 0.26 * s, g, 0.72 * s);
  woofer(0, 0.32 * s, top, 0.6 * s); // top cab front (local coords)
  propGroup.add(g);
}

/** One-draw-call cartoon confetti cloud (vertex-coloured quads, unlit). */
function confettiCloud(ctx: BuildCtx, count: number): THREE.Mesh {
  const { hue } = ctx;
  const palette = [0xff4fa0, 0xffd24d, 0x4dc9ff, 0xa8e831, 0xb35bf2];
  const pos = new Float32Array(count * 4 * 3);
  const col = new Float32Array(count * 4 * 3);
  const idx = new Uint16Array(count * 6);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 8.5;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = -1.4 + Math.random() * 5;
    const sSize = 0.09 + Math.random() * 0.08;
    const t1 = Math.random() * Math.PI * 2;
    const t2 = Math.random() * Math.PI;
    const ux = Math.cos(t1) * sSize;
    const uy = Math.sin(t1) * sSize;
    const uz = Math.cos(t2) * sSize * 0.5;
    const vx = Math.sin(t2) * Math.sin(t1) * sSize;
    const vy = Math.cos(t2) * sSize;
    const vz = Math.sin(t2) * Math.cos(t1) * sSize;
    const corners = [
      [cx - ux - vx, cy - uy - vy, cz - uz - vz],
      [cx + ux - vx, cy + uy - vy, cz + uz - vz],
      [cx + ux + vx, cy + uy + vy, cz + uz + vz],
      [cx - ux + vx, cy - uy + vy, cz - uz + vz],
    ];
    const c = hue(palette[i % palette.length]);
    for (let k = 0; k < 4; k++) {
      const o = (i * 4 + k) * 3;
      pos[o] = corners[k][0];
      pos[o + 1] = corners[k][1];
      pos[o + 2] = corners[k][2];
      col[o] = c.r;
      col[o + 1] = c.g;
      col[o + 2] = c.b;
    }
    const v0 = i * 4;
    const f = i * 6;
    idx[f] = v0;
    idx[f + 1] = v0 + 1;
    idx[f + 2] = v0 + 2;
    idx[f + 3] = v0;
    idx[f + 4] = v0 + 2;
    idx[f + 5] = v0 + 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
}

/** Little cartoon UFO: baked-squash saucer, glass dome, beat-pulsed rim lights. */
function ufo(
  ctx: BuildCtx,
  x: number,
  y: number,
  z: number,
  s: number,
  hovers: { g: THREE.Group; y0: number; ph: number }[],
  lightMats: THREE.MeshToonMaterial[],
  beam = false,
): void {
  const { propGroup, hue } = ctx;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const bodyGeo = new THREE.SphereGeometry(0.85 * s, 20, 12);
  bodyGeo.scale(1, 0.34, 1);
  g.add(O(new THREE.Mesh(bodyGeo, toonMat({ color: hue(0xb9aee0) })), 0.03));
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.4 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    toonMat({ color: hue(0x9ff2ff), transparent: true, opacity: 0.78 }),
  );
  dome.position.y = 0.16 * s;
  g.add(dome);
  const accent = hue(0x2ff5e8);
  const lightMat = toonMat({ color: accent, emissive: accent, emissiveIntensity: 0.8 });
  lightMats.push(lightMat);
  const bulbGeo = new THREE.SphereGeometry(0.09 * s, 8, 8);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(bulbGeo, lightMat);
    const a = (i / 4) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.62 * s, -0.06 * s, Math.sin(a) * 0.62 * s);
    g.add(b);
  }
  if (beam) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.55 * s, 1.8 * s, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    cone.position.y = -1.05 * s;
    g.add(cone);
  }
  propGroup.add(g);
  hovers.push({ g, y0: y, ph: x + z });
}

// ---------------------------------------------------------------------------
// G3 — Idle-Leben pro Theme (ROADMAP-V2)
//
// Regeln für ALLES hier drunter: EIN Material und EIN Draw-Call pro Sorte
// (`Points` bzw. `InstancedMesh`), kein Licht, keine Schatten, keine
// Per-Frame-Allokation. Die Stückzahlen skalieren mit `ctx.density` (Preset),
// die Zahl der Draw-Calls NICHT — low spart Füllrate, nicht Batches.
// ---------------------------------------------------------------------------

/** Stückzahl aus Basis × Preset-Dichte; 0 = das Element entfällt ganz. */
function amount(ctx: BuildCtx, base: number): number {
  if (ctx.density <= 0) return 0;
  return Math.max(1, Math.round(base * ctx.density));
}

/** Wiederverwendeter Schreib-Puffer für Instanz-Matrizen (keine Allokation im Loop). */
const M4 = new THREE.Matrix4();
const QUAT = new THREE.Quaternion();
const EUL = new THREE.Euler();
const VEC = new THREE.Vector3();
const SCL = new THREE.Vector3();

/** Instanz-Matrix aus Position/Y-Drehung/Skalierung schreiben. */
function put(
  mesh: THREE.InstancedMesh,
  i: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  sx: number,
  sy: number,
): void {
  VEC.set(x, y, z);
  EUL.set(0, rotY, 0);
  QUAT.setFromEuler(EUL);
  SCL.set(sx, sy, 1);
  mesh.setMatrixAt(i, M4.compose(VEC, QUAT, SCL));
}

/**
 * Club — träge kreisende Glühwürmchen über dem Deck. Ein `Points`-Objekt, ein
 * additives Material: 1 Draw-Call für den ganzen Schwarm. Jeder Punkt hat
 * seinen eigenen Radius/Winkelspeed/Höhen-Phasenversatz, damit der Schwarm
 * nicht wie ein starres Karussell wirkt.
 */
function fireflies(ctx: BuildCtx, base: number, colorHex: number): void {
  const count = amount(ctx, base);
  if (count === 0) return;
  const pos = new Float32Array(count * 3);
  const seeds: { r: number; a: number; w: number; y: number; ph: number }[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      r: 4.6 + ((i * 2.7) % 3.2),
      a: (i / count) * Math.PI * 2,
      w: 0.05 + ((i * 1.7) % 5) * 0.012,
      y: -1.9 + ((i * 3.1) % 3.4),
      ph: i * 1.13,
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: ctx.hue(colorHex),
      size: 0.42,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pts.frustumCulled = false;
  ctx.islandGroup.add(pts);
  const attr = geo.attributes.position as THREE.BufferAttribute;
  ctx.anims.push((t, beatV) => {
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      const a = s.a + t * s.w;
      attr.setXYZ(
        i,
        ISLAND_C.x + Math.cos(a) * s.r,
        s.y + Math.sin(t * 0.55 + s.ph) * 0.5,
        ISLAND_C.z + Math.sin(a) * s.r,
      );
    }
    attr.needsUpdate = true;
    // Auf dem Beat glimmen sie kurz auf — dieselbe Hüllkurve wie die Neonkante.
    (pts.material as THREE.PointsMaterial).opacity = 0.55 + beatV * 0.45;
  });
}

/**
 * Streifen-Geometrie: hell am Kopf (lokal 0/0/0), auslaufend zum Schweif bei
 * x = −1. Die Vertex-Farbe trägt den Verlauf, additiv gemischt — ein
 * Kometenschweif braucht so weder Textur noch zweites Material. Zwei um 90°
 * gekreuzte Dreiecke statt einem: der Streifen wird in die Flugrichtung gedreht
 * und dürfte sonst je nach Bahn haarfein kantenständig zur Kamera stehen (=
 * unsichtbar). Das Kreuz kostet ein zusätzliches Dreieck, keinen Draw-Call.
 */
function streakGeo(width: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // prettier-ignore
  const pos = new Float32Array([
    0, width, 0, 0, -width, 0, -1, 0, 0,
    0, 0, width, 0, 0, -width, -1, 0, 0,
  ]);
  // prettier-ignore
  const col = new Float32Array([
    1, 1, 1, 1, 1, 1, 0, 0, 0,
    1, 1, 1, 1, 1, 1, 0, 0, 0,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

interface StreakCfg {
  color: number;
  /** Länge des Schweifs in Welt-Einheiten. */
  len: number;
  /** Breite am Kopf. */
  width: number;
  /** Sekunden für einen kompletten Durchflug. */
  travelS: number;
  /** Sekunden Pause zwischen zwei Durchflügen desselben Streifens. */
  gapS: number;
  /** Startpunkt + Flugrichtung (Richtung wird normiert). */
  from: [number, number, number];
  dir: [number, number, number];
  /** Streuung der Startpunkte je Instanz. */
  spread: [number, number, number];
}

/**
 * Synth-Sternschnuppen / Space-Kometen: EIN `InstancedMesh` mit dem Streifen-
 * Dreieck, das in Intervallen durchs Bild zieht und dazwischen auf Skalierung 0
 * steht (kein Fragment, kein Pop — es taucht am Rand auf und verlässt ihn).
 */
function streaks(ctx: BuildCtx, base: number, cfg: StreakCfg): void {
  const count = amount(ctx, base);
  if (count === 0) return;
  const mesh = new THREE.InstancedMesh(
    streakGeo(cfg.width),
    new THREE.MeshBasicMaterial({
      color: ctx.hue(cfg.color),
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    count,
  );
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ctx.propGroup.add(mesh);
  const cycle = cfg.travelS + cfg.gapS;
  const d = new THREE.Vector3(...cfg.dir).normalize();
  // Der Kopf liegt lokal bei +x — diese Drehung legt ihn auf die Flugbahn,
  // Schräge inklusive (ein reiner Yaw ließe den Schweif waagerecht stehen,
  // während die Sternschnuppe schräg fällt).
  const aim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d);
  ctx.anims.push((t) => {
    for (let i = 0; i < count; i++) {
      const k = ((t + i * (cycle / count)) % cycle) / cfg.travelS;
      if (k > 1) {
        put(mesh, i, 0, 0, 0, 0, 0, 0); // Pause: unsichtbar
        continue;
      }
      const j = ((i * 7919) % 1000) / 1000; // deterministische Streuung
      const dist = k * (cfg.travelS * 9);
      // Ein-/Ausblenden über die Länge, damit nichts hart erscheint/verschwindet.
      const fade = Math.sin(Math.PI * k);
      VEC.set(
        cfg.from[0] + (j - 0.5) * cfg.spread[0] + d.x * dist,
        cfg.from[1] + (j - 0.5) * cfg.spread[1] + d.y * dist,
        cfg.from[2] + (j - 0.5) * cfg.spread[2] + d.z * dist,
      );
      SCL.set(cfg.len * fade, fade, fade);
      mesh.setMatrixAt(i, M4.compose(VEC, aim, SCL));
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/** V-Silhouette einer Möwe: zwei schmale Dreiecke, ein gemeinsames Material. */
function gullGeo(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // prettier-ignore
  const v = new Float32Array([
    0, 0, 0, -1, 0.5, 0, -0.86, -0.04, 0,
    0, 0, 0, 0.86, -0.04, 0, 1, 0.5, 0,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  return geo;
}

/**
 * Beach — Möwen auf Ellipsen über dem Meer. Ein `InstancedMesh`, ein dunkles
 * Basic-Material: die Silhouette braucht kein Licht. Das „Flügelschlagen" ist
 * eine Y-Skalierung (die V-Form klappt auf und zu) — pro Instanz eine Zahl,
 * kein Morph-Target, keine zweite Geometrie.
 */
function gulls(ctx: BuildCtx, base: number): void {
  const count = amount(ctx, base);
  if (count === 0) return;
  const mesh = new THREE.InstancedMesh(
    gullGeo(),
    new THREE.MeshBasicMaterial({ color: 0x2a1e2c, side: THREE.DoubleSide }),
    count,
  );
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ctx.propGroup.add(mesh);
  ctx.anims.push((t) => {
    for (let i = 0; i < count; i++) {
      const sp = 0.13 + i * 0.035;
      const a = t * sp + i * 2.4;
      const rx = 7 + i * 2.5;
      const rz = 5 + i * 2;
      const x = Math.cos(a) * rx;
      const z = 15 + Math.sin(a) * rz;
      const flap = 0.55 + Math.abs(Math.sin(t * 3.1 + i * 1.7)) * 0.7;
      const s = 1 + i * 0.35;
      // Kein Yaw: die Silhouette steht wie ein Sprite zur Diorama-Kamera —
      // mitgedreht stünde sie an den Ellipsen-Scheiteln kantenständig (= weg).
      put(mesh, i, x, 3.2 + i * 0.9 + Math.sin(t * 0.6 + i) * 0.5, z, 0, s, s * flap);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/**
 * Publikum-Silhouetten am hinteren Inselrand (G3). Ein `InstancedMesh` mit
 * einer Halbkörper-Silhouette (Kopf + Schultern als EINE `ShapeGeometry`), ein
 * unbeleuchtetes dunkles Material — 1 Draw-Call für die ganze Menge. Sie hängen
 * an der `islandGroup`, fahren beim G1-Wechsel also exakt mit der Bühne raus
 * und rein, und wippen mit `beatV` (Y-Bob + Stauchung).
 */
function audienceGeo(): THREE.ShapeGeometry {
  const head = new THREE.Shape();
  head.absarc(0, 0.6, 0.19, 0, Math.PI * 2, false);
  const torso = new THREE.Shape();
  torso.moveTo(-0.34, -0.55);
  torso.lineTo(-0.3, 0.16);
  torso.quadraticCurveTo(-0.26, 0.42, 0, 0.44);
  torso.quadraticCurveTo(0.26, 0.42, 0.3, 0.16);
  torso.lineTo(0.34, -0.55);
  torso.closePath();
  return new THREE.ShapeGeometry([head, torso], 8);
}

function audience(ctx: BuildCtx): void {
  const count = amount(ctx, 8);
  if (count === 0) return;
  const mesh = new THREE.InstancedMesh(
    audienceGeo(),
    new THREE.MeshBasicMaterial({ color: 0x140f22, side: THREE.DoubleSide }),
    count,
  );
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ctx.islandGroup.add(mesh);
  const R = ISLAND_R - 0.6;
  ctx.anims.push((t, beatV) => {
    for (let i = 0; i < count; i++) {
      // Der sichtbare Bogen liegt im +z-Halbraum — von der Diorama-Kamera aus
      // also HINTER dem Duo, nie davor.
      const a = 0.3 + (i / Math.max(1, count - 1)) * (Math.PI - 0.6);
      const r = R - ((i * 3) % 4) * 0.22;
      const x = ISLAND_C.x + Math.cos(a) * r;
      const z = ISLAND_C.z + Math.sin(a) * r;
      const ph = i * 0.9;
      const bob = beatV * 0.16 + Math.sin(t * 1.6 + ph) * 0.05;
      const s = 1.25 + ((i * 5) % 3) * 0.13;
      put(
        mesh,
        i,
        x,
        TOP_Y + s * 0.55 + bob,
        z,
        Math.atan2(ISLAND_C.x - x, ISLAND_C.z - z),
        s,
        s * (1 - beatV * 0.07),
      );
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/**
 * **Die Insel-Trophäe** (IDEEN-GAMEPLAY 1b) — der Pokal am Inselrand.
 *
 * Rein kosmetisch: Sie steht auf JEDER Bühne des Themes, dessen Ruf-Stufe sie
 * verdient hat, und auf keiner anderen. Gebaut wird sie im G3-Ambient-Slot —
 * also im selben Batch-Budget wie Publikum und Glühwürmchen —, und sie hält
 * dessen Regeln ein: EIN gebackenes Mesh (Sockel + Schaft + Kelch + Rand + zwei
 * Henkel in einer Geometrie, `island.bake`) plus dessen Ink-Hülle, kein Licht,
 * keine Per-Frame-Allokation. Sie hängt an der `islandGroup`, fährt beim
 * G1-Wechsel also mit der Bühne aus und ein.
 *
 * `tier` ist {@link import('../game/territory').trophyTier}: 1 = Bronze (ab
 * Ruf-Stufe 3), 2 = Silber (ab 6), 3 = Gold (Stufe 10). Drei Stufen statt zehn,
 * weil ein Pokal am Inselrand nur wenige Dutzend Pixel misst — Material und
 * Größe müssen den Unterschied auf einen Blick tragen.
 *
 * Der Standort ist der VORDERE linke Inselrand (aus Sicht der Diorama-Kamera):
 * außerhalb der Tanzfläche, vor dem Publikum-Bogen (der im +z-Halbraum sitzt)
 * und in der Bildhälfte, die auf dem Telefon NICHT von der HUD-Karte verdeckt
 * wird — headless nachgeprüft, der erste Standort lag genau dahinter.
 */
const TROPHY_METAL: readonly { readonly color: number; readonly emissive: number }[] = [
  { color: 0xc27b3a, emissive: 0x3a1d06 }, // Bronze
  { color: 0xd4dcea, emissive: 0x33405a }, // Silber
  { color: 0xffd24d, emissive: 0x6a4a05 }, // Gold
];

function trophy(ctx: BuildCtx, tier: number): void {
  const t = Math.max(1, Math.min(TROPHY_METAL.length, Math.floor(tier)));
  const metal = TROPHY_METAL[t - 1];
  // Der Pokal wächst mit der Stufe — Bronze ist ein Pokal, Gold eine Ansage.
  const s = 0.92 + t * 0.16;
  // Cel-Metall: kräftige Eigenfarbe + Eigenglut, damit der Pokal auch auf der
  // dunklen Club-Insel gegen den Boden steht (Toon kennt kein `metalness` — die
  // „Politur" macht hier die Emissive, wie bei den Neonkanten der Insel).
  const mat = toonMat({
    color: new THREE.Color(metal.color),
    emissive: new THREE.Color(metal.emissive),
    emissiveIntensity: 0.85,
    bands: 3,
  });
  const parts: THREE.Mesh[] = [];
  const push = (geo: THREE.BufferGeometry, y: number, x = 0, rz = 0): void => {
    // `mergeGeometries` verlangt EINE Sorte: RoundedBox kommt ohne Index,
    // Cylinder/Torus mit — ungefiltert scheitert der Merge still und der Pokal
    // wäre eine leere Geometrie (genau so ist es beim ersten Headless-Lauf
    // passiert). Alles wird deshalb vorher entindiziert.
    let g = geo;
    if (geo.index) {
      g = geo.toNonIndexed();
      geo.dispose();
    }
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, 0);
    m.rotation.z = rz;
    parts.push(m);
  };
  push(new RoundedBoxGeometry(0.52 * s, 0.2 * s, 0.52 * s, 2, 0.05 * s), 0.1 * s);
  push(new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 0.26 * s, 10), 0.33 * s);
  push(new THREE.CylinderGeometry(0.34 * s, 0.15 * s, 0.46 * s, 12, 1, true), 0.69 * s);
  push(new THREE.TorusGeometry(0.33 * s, 0.035 * s, 6, 16), 0.92 * s, 0, Math.PI / 2);
  // Zwei Henkel als halbe Ringe — sie machen aus dem Kelch einen POKAL.
  push(new THREE.TorusGeometry(0.13 * s, 0.032 * s, 5, 12, Math.PI), 0.74 * s, 0.34 * s, -1.57);
  push(new THREE.TorusGeometry(0.13 * s, 0.032 * s, 5, 12, Math.PI), 0.74 * s, -0.34 * s, 1.57);
  const cup = O(bake(parts, mat), 0.022);
  // Vorderer linker Inselrand (die Kamera schaut nach +z, +x ist screen LINKS):
  // dort liegt der einzige größere freie Sand-/Deck-Bogen — die Tanzfläche ist
  // Mitte, der Rivale steht hinten links, das Publikum im +z-Bogen, und die
  // rechte Bildhälfte gehört auf dem Telefon der HUD-Karte.
  const a = -1.25;
  const r = ISLAND_R - 1.15;
  cup.position.set(ISLAND_C.x + Math.cos(a) * r, TOP_Y, ISLAND_C.z + Math.sin(a) * r);
  cup.rotation.y = 0.5;
  ctx.islandGroup.add(cup);
  // Wie das Publikum atmet der Pokal im Takt — dieselbe `beatV`-Hüllkurve, aber
  // deutlich zarter (er steht still, er tanzt nicht). Keine Allokation im Loop.
  const y0 = cup.position.y;
  ctx.anims.push((_t, beatV) => {
    const k = 1 + beatV * 0.035;
    cup.scale.set(k, k, k);
    cup.position.y = y0 + beatV * 0.03;
  });
}

// ---------------------------------------------------------------------------
// The four stages
// ---------------------------------------------------------------------------

/** The four stages — cartoon-restyled (Wave 3), gameplay fields untouched. */
export const BGS: Record<BackgroundKey, BgConfig> = {
  club: {
    icon: '🪩',
    name: 'Neon-Club',
    top: 0x241830,
    bot: 0x050507,
    fog: 0x0a0a10,
    floor: 0x2a2532,
    fr: 0.3,
    fm: 0.55,
    revealAt: 0,
    deck: { map: () => repeated(plankTex(1), 5, 5), bump: 0.35 }, // dunkles Club-Parkett
    // Club: warmes Key, kühles Fill, Violett/Limette-Rims (der bisherige Look).
    light: {
      key: 0xfff4e0,
      keyInt: 2.3,
      fill: 0xa9c4ff,
      fillInt: 0.75,
      sky: 0xd6daff,
      ground: 0x4a3a40,
      rimA: 0x8b5cf6,
      rimB: 0xa8e831,
    },
    build(ctx) {
      const { propGroup, glowSprite, anims, hue } = ctx;
      // Mirror ball, hung low over the visible back floor — kept mirror-PBR for
      // the sparkle, but ink-outlined so it sits in the cartoon world.
      const ball = withOutline(
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.9, 2),
          mk({
            color: 0xffffff,
            roughness: 0.06,
            metalness: 1,
            envMapIntensity: 2,
            flatShading: true,
            map: repeated(sequinTex(7), 3, 3), // T4: Facetten-Raster
          }),
        ),
        { thickness: 0.05 },
      );
      ball.position.set(9, 1.6, 14.5);
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 6.6, 6),
        toonMat({ color: 0x241c34 }),
      );
      wire.position.set(9, 5.6, 14.5);
      propGroup.add(ball, wire);
      propGroup.add(glowSprite(0xffffff, 3.5, 9, 1.6, 14.5));
      // Sweeping club spotlights + additive beams (atmospheric — kept as-is).
      const cols = [hue(0xff3366), hue(0x33ff88), hue(0x3388ff), hue(0xffdd33)];
      const beams: { l: THREE.SpotLight; beam: THREE.Mesh; ph: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const l = new THREE.SpotLight(cols[i], 90, 45, 0.45, 0.55, 1.6);
        l.position.set(Math.cos(i * 1.57) * 8, 8.5, Math.sin(i * 1.57) * 8);
        l.target.position.set(0, -2, 0);
        propGroup.add(l, l.target);
        const beam = new THREE.Mesh(
          new THREE.ConeGeometry(1.6, 10, 20, 1, true),
          new THREE.MeshBasicMaterial({
            color: cols[i],
            transparent: true,
            opacity: 0.06,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        propGroup.add(beam);
        beams.push({ l, beam, ph: i * 1.57 });
      }
      // Beat-reactive dance tiles. G3-Budget: vorher trug JEDE Kachel ein
      // eigenes Mesh MIT eigenem Material (25 Draw-Calls für ein Feld, das sich
      // nur in der Farbe unterscheidet). Jetzt ein `InstancedMesh` mit
      // `instanceColor` — die Regenbogen-Welle läuft unverändert, kostet aber
      // einen Batch. Unbeleuchtet, weil der Look ohnehin aus dem Emissive kam.
      const tilePos: [number, number][] = [];
      for (let ix = -4; ix < 4; ix++)
        for (let iz = -4; iz < 4; iz++) {
          const tx = ix * 2 + 1;
          const tz = iz * 2 + 1;
          // Insel-POV: Ecken-Tiles jenseits der Inselkante entfallen — die
          // Tanzfläche liegt als gerundetes Feld AUF der schwebenden Insel
          // (Insel-Zentrum = Duo-Mitte 1.4/1.7, siehe scene.ts ISLAND_C).
          if (Math.hypot(tx - 1.4, tz - 1.7) > 5.6) continue;
          tilePos.push([tx, tz]);
        }
      const tileGeo = new THREE.PlaneGeometry(1.9, 1.9);
      tileGeo.rotateX(-Math.PI / 2);
      const tiles = new THREE.InstancedMesh(
        tileGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        tilePos.length,
      );
      const tileC = new THREE.Color();
      for (let i = 0; i < tilePos.length; i++) {
        put(tiles, i, tilePos[i][0], -2.39, tilePos[i][1], 0, 1, 1);
        tiles.setColorAt(i, tileC.setHex(0x111118));
      }
      tiles.instanceMatrix.needsUpdate = true;
      propGroup.add(tiles);
      // Chunky cartoon speaker stacks flanking the floor + one echo at −z.
      const pulses: THREE.Object3D[] = [];
      speakerStack(ctx, 10.5, 10, 1.35, pulses);
      speakerStack(ctx, -6.5, 14, 1.15, pulses);
      speakerStack(ctx, -7, -11, 1.2, pulses);
      // Drifting confetti cloud (single vertex-coloured mesh).
      const confettiG = confettiCloud(ctx, 130);
      confettiG.position.set(1.5, 0.9, 7);
      propGroup.add(confettiG);
      // G3: träge kreisende Glühwürmchen über dem Deck (1 Draw-Call).
      fireflies(ctx, 14, 0xbfff70);
      anims.push((t, beatV) => {
        ball.rotation.y += 0.012;
        for (let i = 0; i < beams.length; i++) {
          const b = beams[i];
          b.ph += 0.008;
          const x = Math.cos(b.ph) * 8;
          const z = Math.sin(b.ph) * 8;
          b.l.position.set(x, 8.5, z);
          b.beam.position.set(x * 0.6, 3.2, z * 0.6);
          b.beam.lookAt(0, -2.4, 0);
          b.beam.rotateX(-Math.PI / 2);
        }
        for (let i = 0; i < tilePos.length; i++) {
          // ×1.4 gleicht aus, was mit dem Standard-Material wegfiel: die vier
          // farbigen Club-Spots lieferten den Kacheln vorher zusätzlich einen
          // Diffus-/Specular-Anteil, das unbeleuchtete Material nicht.
          const k = Math.max(0, Math.sin(t * 3 + i * 0.7)) * 1.12 * (0.4 + beatV);
          tileC.setHSL((t * 0.05 + i * 0.03) % 1, 0.8, 0.5).multiplyScalar(k);
          // Grundton der dunklen Kachel (0x111118), damit sie im Aus-Zustand
          // nicht schwarz kippt — vorher trug den der `color` des Materials.
          tileC.r += 0.067;
          tileC.g += 0.067;
          tileC.b += 0.094;
          tiles.setColorAt(i, tileC);
        }
        if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
        const pk = 1 + beatV * 0.3;
        for (let i = 0; i < pulses.length; i++) pulses[i].scale.setScalar(pk);
        confettiG.rotation.y = t * 0.07;
        confettiG.position.y = 0.9 + Math.sin(t * 0.5) * 0.35;
      });
    },
  },
  synth: {
    icon: '🌆',
    name: 'Synthwave',
    top: 0x3a1060,
    bot: 0x0a0518,
    fog: 0x140628,
    floor: 0x1c1230,
    fr: 0.2,
    fm: 0.7,
    revealAt: 800,
    // Das Neon-Grid ist jetzt das DECK selbst: glühende Grid-Textur über die
    // GANZE Inselfläche (der alte GridHelper deckte nur 9 von 12.8 Einheiten),
    // langsam scrollend wie der klassische Synthwave-Boden.
    deck: {
      emissiveMap: () => repeated(gridTex(8), 3, 3),
      emissive: 0xff3fb0,
      emissiveIntensity: 0.55,
      scroll: 0.045,
      bump: 0.15, // Grid-Linien als flache Grate
    },
    // Synth: rosé Key, Cyan-Fill, Pink/Cyan-Rims — das Neon-Duo als Licht.
    light: {
      key: 0xffe0f2,
      keyInt: 2.2,
      fill: 0x7de8ff,
      fillInt: 0.9,
      sky: 0xe8c8ff,
      ground: 0x301848,
      rimA: 0xff3fb0,
      rimB: 0x2ff5e8,
    },
    build(ctx) {
      const { propGroup, glowSprite, anims, hue } = ctx;
      // Striped retro sun (shader kept as-is), now setting into the VISIBLE
      // horizon (+z wedge) instead of behind the boot camera.
      const sunMat = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { t: { value: 0 } },
        vertexShader: `varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying vec2 u;uniform float t;
          void main(){vec2 c=u-0.5;float d=length(c)*2.0;if(d>1.0)discard;
            float stripes=step(0.0,sin((u.y+t*0.02)*60.0))*step(0.42,u.y);
            vec3 col=mix(vec3(1.0,0.85,0.3),vec3(1.0,0.25,0.55),u.y);
            float a=(1.0-smoothstep(0.95,1.0,d))*(1.0-stripes*smoothstep(1.0,0.42,u.y)*0.9);
            gl_FragColor=vec4(col,a);}`,
      });
      const sun = new THREE.Mesh(new THREE.CircleGeometry(7, 64), sunMat);
      sun.position.set(9, 0.6, 34);
      sun.rotation.y = Math.PI; // face the boot camera
      propGroup.add(sun);
      propGroup.add(glowSprite(hue(0xff4f90), 16, 9, 0.6, 33));
      // Toon mountain ring with neon wireframe ridges (all azimuths).
      const mtnRock = repeated(speckleTex(10, 600), 2, 2);
      const mtnMat = toonMat({
        color: hue(0x1c1038),
        map: mtnRock,
        bumpMap: mtnRock,
        bumpScale: 0.4,
      });
      const wireMat = new THREE.MeshBasicMaterial({
        color: hue(0xff3fb0),
        wireframe: true,
        transparent: true,
        opacity: 0.25,
      });
      // G3-Budget: der 12er-Bergring war 36 Draw-Calls (Kegel + Ink-Hülle +
      // Neon-Drahtgitter je Berg). Gebacken sind es drei — gleiches Bild, denn
      // das Drahtgitter der zusammengefassten Geometrie zeigt dieselben Kanten.
      {
        const peaks: THREE.Mesh[] = [];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + 0.26;
          const r = 27 + (i % 3) * 4;
          const h = 4.5 + ((i * 2.7) % 4);
          const m = new THREE.Mesh(new THREE.ConeGeometry(3 + ((i * 1.3) % 2.5), h, 6));
          m.position.set(Math.cos(a) * r, -2.4 + h / 2, Math.sin(a) * r);
          m.rotation.y = (i * 1.1) % 3;
          peaks.push(m);
        }
        const ridge = O(bake(peaks, mtnMat), 0.07);
        ridge.add(new THREE.Mesh(ridge.geometry, wireMat));
        propGroup.add(ridge);
      }
      // Dark toon palms flanking the sun (classic synthwave silhouettes).
      const sways: Sway[] = [];
      palm(ctx, 13, 20, 1.35, 0x241244, 0x3d1868, sways);
      palm(ctx, 17.5, 26, 1.6, 0x241244, 0x3d1868, sways);
      palm(ctx, 5, 26, 1.15, 0x241244, 0x3d1868, sways);
      palm(ctx, -8, 19, 1.25, 0x241244, 0x3d1868, sways);
      palm(ctx, -4, -16, 1.3, 0x241244, 0x3d1868, sways);
      palm(ctx, 9, -18, 1.2, 0x241244, 0x3d1868, sways);
      // Floating vaporwave solids: neon donut + chrome-ish orb, slow spin.
      const donut = O(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.8, 0.32, 14, 26),
          toonMat({ color: hue(0xff3fb0), emissive: hue(0xff3fb0), emissiveIntensity: 0.35 }),
        ),
        0.03,
      );
      donut.position.set(12, 1.1, 16);
      propGroup.add(donut);
      const orb = O(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.65, 18, 14),
          toonMat({ color: hue(0x2ff5e8), emissive: hue(0x2ff5e8), emissiveIntensity: 0.4 }),
        ),
        0.03,
      );
      orb.position.set(15.5, 2.2, 23);
      propGroup.add(orb);
      // G3: Sternschnuppen-Streifen, die in Intervallen über den Horizont ziehen.
      streaks(ctx, 3, {
        color: 0xffe6ff,
        len: 4.2,
        width: 0.16,
        travelS: 1.7,
        gapS: 5,
        // Bild-Geometrie: +x liegt auf der Leinwand LINKS, +z hinten. Der
        // Streifen quert den offenen Himmel UNTER der schwebenden Insel: der
        // obere Bildrand gehört dem HUD-Streifen, die Bildmitte der Bühne.
        from: [6, 1.5, 15],
        dir: [-1, -0.25, 0],
        spread: [3, 2, 4],
      });
      anims.push((t) => {
        sunMat.uniforms.t.value = t;
        for (let i = 0; i < sways.length; i++) {
          const s = sways[i];
          s.g.rotation.z = Math.sin(t * 0.8 + s.phase) * s.amp;
        }
        donut.rotation.y = t * 0.5;
        donut.rotation.x = 0.9 + Math.sin(t * 0.7) * 0.2;
        donut.position.y = 1.1 + Math.sin(t * 0.9) * 0.25;
        orb.position.y = 2.2 + Math.sin(t * 0.7 + 2) * 0.3;
      });
    },
  },
  beach: {
    icon: '🏖️',
    name: 'Sunset Beach',
    top: 0xff8a4d,
    bot: 0x2a1533,
    fog: 0x3a1a30,
    floor: 0xb08b52,
    fr: 0.85,
    fm: 0.05,
    revealAt: 6000,
    deck: { map: () => repeated(speckleTex(1, 1100), 4, 4), bump: 0.25 }, // körniger Sand
    // Beach: goldene Stunde — warmes starkes Key, weiches Himmel-Fill.
    light: {
      key: 0xffd9a0,
      keyInt: 2.6,
      fill: 0x9ec8ff,
      fillInt: 0.6,
      sky: 0xffe4c8,
      ground: 0x6a4a30,
      rimA: 0xff8a4d,
      rimB: 0x3adfc0,
    },
    build(ctx) {
      const { propGroup, glowSprite, anims, hue } = ctx;
      // Setting sun over the visible sea horizon (emissive disc + glow, kept).
      const sun = new THREE.Mesh(
        new THREE.CircleGeometry(4.5, 48),
        mk({ color: 0xffe08a, emissive: 0xffb84d, emissiveIntensity: 1.8, roughness: 1 }),
      );
      sun.position.set(10, 0.8, 38);
      sun.rotation.y = Math.PI;
      propGroup.add(sun);
      propGroup.add(glowSprite(hue(0xffa54d), 14, 10, 0.8, 37));
      // Animated sea (kept as-is per the art brief), shoreline behind the duo.
      const seaGeo = new THREE.PlaneGeometry(90, 45, 48, 24);
      const sea = new THREE.Mesh(
        seaGeo,
        mk({ color: hue(0x1a4a6a), roughness: 0.12, metalness: 0.35, envMapIntensity: 1.1 }),
      );
      sea.rotation.x = -Math.PI / 2;
      // Insel-POV: der Ozean liegt TIEF unter der schwebenden Insel.
      sea.position.set(0, -7.5, 30);
      propGroup.add(sea);
      // Toon palms — postcard framing on the visible side, echo behind.
      const sways: Sway[] = [];
      palm(ctx, 10.5, 9.5, 1.25, 0x8a5a30, 0x2fae4e, sways);
      palm(ctx, 15, 15, 1.5, 0x8a5a30, 0x2fae4e, sways);
      palm(ctx, -7.5, 12, 1.1, 0x7a4c28, 0x27994a, sways);
      palm(ctx, -12, -7, 1.35, 0x8a5a30, 0x2fae4e, sways);
      palm(ctx, 7, -13, 1.2, 0x7a4c28, 0x27994a, sways);
      // Striped umbrella (each wedge toon; one ink hull for the silhouette).
      // G3-Budget: die 8 Keile sind zwei Batches (je Streifenfarbe einer).
      {
        const g = new THREE.Group();
        const wedgeA = toonMat({ color: hue(0xff4d5a) });
        const wedgeB = toonMat({ color: 0xfff2dc });
        const wedgesA: THREE.BufferGeometry[] = [];
        const wedgesB: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 8; i++) {
          const geo = new THREE.ConeGeometry(
            1.85,
            0.95,
            3,
            1,
            true,
            (i / 8) * Math.PI * 2,
            Math.PI / 4,
          );
          geo.translate(0, 2.15, 0);
          (i % 2 ? wedgesA : wedgesB).push(geo);
        }
        for (const [parts, mat] of [
          [wedgesA, wedgeA],
          [wedgesB, wedgeB],
        ] as const) {
          const merged = mergeGeometries(parts);
          parts.forEach((p) => p.dispose());
          if (merged) g.add(new THREE.Mesh(merged, mat));
        }
        const hull = new THREE.Mesh(
          new THREE.ConeGeometry(1.85, 0.95, 24, 1, true),
          outlineMaterial(INK, 0.035),
        );
        hull.position.y = 2.15;
        g.add(hull);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), wedgeA);
        tip.position.y = 2.72;
        g.add(tip);
        const pole = O(
          new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.06, 2.7, 8),
            toonMat({ color: 0xc9a06a }),
          ),
          0.02,
        );
        pole.position.y = 1.35;
        g.add(pole);
        g.rotation.z = 0.24;
        g.position.set(8, -2.4, 7.2);
        propGroup.add(g);
      }
      // Beach ball (six toon wedges + one ink hull) — bounces on the beat.
      const ballG = new THREE.Group();
      {
        const r = 0.55;
        const wedgeCols = [0xfff6e8, 0xff4d5a, 0xfff6e8, 0x3fa8ff, 0xfff6e8, 0xffd24d];
        for (let i = 0; i < 6; i++) {
          ballG.add(
            new THREE.Mesh(
              new THREE.SphereGeometry(r, 6, 12, (i / 6) * Math.PI * 2, Math.PI / 3),
              toonMat({ color: hue(wedgeCols[i]) }),
            ),
          );
        }
        ballG.add(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), outlineMaterial(INK, 0.028)));
        ballG.position.set(9.5, -1.85, 5.5);
        propGroup.add(ballG);
      }
      // Starfish chilling on the sand — 5 Arme + Kern in EINEM Batch (G3-Budget).
      {
        const s = 1.1;
        const starMat = toonMat({ color: hue(0xff7a8a) });
        const armGeo = new THREE.SphereGeometry(1, 8, 6);
        armGeo.scale(0.42 * s, 0.11 * s, 0.16 * s);
        const mats: THREE.Matrix4[] = [];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          mats.push(
            new THREE.Matrix4()
              .makeTranslation(Math.cos(a) * 0.3 * s, 0, Math.sin(a) * 0.3 * s)
              .multiply(new THREE.Matrix4().makeRotationY(-a)),
          );
        }
        const coreGeo = new THREE.SphereGeometry(1, 10, 8);
        coreGeo.scale(0.24 * s, 0.13 * s, 0.24 * s);
        const arms = baked(armGeo, mats);
        const whole = mergeGeometries([arms, coreGeo]);
        arms.dispose();
        coreGeo.dispose();
        const star = O(new THREE.Mesh(whole ?? arms, starMat), 0.02);
        star.position.set(7.2, -2.31, 6.1);
        star.rotation.y = 0.7;
        propGroup.add(star);
      }
      // Tiny island on the horizon, with its own mini palm.
      {
        const isle = new THREE.Group();
        const domeGeo = new THREE.SphereGeometry(2.6, 14, 10);
        domeGeo.scale(1, 0.42, 1);
        isle.add(O(new THREE.Mesh(domeGeo, toonMat({ color: hue(0x8a6a3a) })), 0.06));
        isle.position.set(20, -2.2, 36);
        propGroup.add(isle);
        palm(ctx, 20, 36, 0.9, 0x7a4c28, 0x27994a, sways);
      }
      // G3: zwei Möwen auf Ellipsen über dem Meer (1 Draw-Call, 1 Material).
      // Der Schaum-Puls am Inselrand sitzt bei seinem Ring in `world/island.ts`.
      gulls(ctx, 2);
      const pos = seaGeo.attributes.position;
      anims.push((t, beatV) => {
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          pos.setZ(i, Math.sin(x * 0.35 + t * 1.4) * 0.18 + Math.cos(y * 0.3 + t * 1.1) * 0.14);
        }
        pos.needsUpdate = true;
        seaGeo.computeVertexNormals();
        for (let i = 0; i < sways.length; i++) {
          const s = sways[i];
          s.g.rotation.z = Math.sin(t * 0.8 + s.phase) * s.amp;
        }
        const bounce = Math.abs(Math.sin(t * 2.4)) * (0.22 + beatV * 0.45);
        ballG.position.y = -1.85 + bounce;
        ballG.rotation.z = Math.sin(t * 0.9) * 0.5;
      });
    },
  },
  space: {
    icon: '🌌',
    name: 'Deep Space',
    top: 0x0a0a2a,
    bot: 0x000004,
    fog: 0x02020a,
    floor: 0x39404f,
    fr: 0.45,
    fm: 0.85,
    revealAt: 30000,
    deck: { map: () => repeated(platesTex(1), 4, 4), bump: 0.3 }, // vernietetes Metall-Deck
    // Space: hartes kaltes Key, gedämpftes Fill, Cyan/Violett-Rims.
    light: {
      key: 0xeef4ff,
      keyInt: 2.1,
      fill: 0x8898c8,
      fillInt: 0.55,
      sky: 0xb8c8e8,
      ground: 0x1c1c2e,
      rimA: 0x63e8ff,
      rimB: 0x9d5cf6,
    },
    build(ctx) {
      const { propGroup, glowSprite, anims, hue } = ctx;
      // Star dome (Points — kept as-is).
      const n = 1600;
      const starPos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 28 + Math.random() * 30;
        const a = Math.random() * 7;
        const b = Math.acos(2 * Math.random() - 1);
        starPos[i * 3] = r * Math.sin(b) * Math.cos(a);
        starPos[i * 3 + 1] = Math.abs(r * Math.cos(b)) * 0.7 - 1;
        starPos[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const stars = new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, sizeAttenuation: true }),
      );
      propGroup.add(stars);
      // Hero cartoon planet on the visible horizon: cel sphere, chunky toon
      // ring (torus outlines cleanly, unlike a flat ring) and an orbiting moon.
      const planet = O(
        new THREE.Mesh(
          new THREE.SphereGeometry(2.6, 28, 20),
          toonMat({
            color: hue(0x9d5cf6),
            emissive: hue(0x2a1060),
            emissiveIntensity: 0.35,
            map: repeated(bandsTex(1), 2, 1), // T4: Gasriesen-Bänder
          }),
        ),
        0.06,
      );
      planet.position.set(12, 0.3, 24);
      propGroup.add(planet);
      const ring = O(
        new THREE.Mesh(
          new THREE.TorusGeometry(3.7, 0.17, 10, 40),
          toonMat({ color: hue(0xa8e831), emissive: hue(0xa8e831), emissiveIntensity: 0.25 }),
        ),
        0.04,
      );
      ring.position.copy(planet.position);
      ring.rotation.x = 1.25;
      ring.rotation.y = 0.3;
      propGroup.add(ring);
      propGroup.add(glowSprite(hue(0x8b5cf6), 10, 12, 0.3, 24));
      const moon = O(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 14, 10),
          toonMat({ color: 0xffe9c9, map: repeated(craterTex(6), 1.5, 1.5) }),
        ),
        0.03,
      );
      propGroup.add(moon);
      // Far sibling planet for the orbiting camera (−z hemisphere).
      const far = O(
        new THREE.Mesh(
          new THREE.SphereGeometry(4, 28, 20),
          toonMat({
            color: hue(0x3adfc0),
            emissive: hue(0x0a4038),
            emissiveIntensity: 0.3,
            map: repeated(bandsTex(2), 2, 1),
          }),
        ),
        0.08,
      );
      far.position.set(-12, 6, -28);
      propGroup.add(far);
      propGroup.add(glowSprite(hue(0x3adfc0), 12, -12, 6, -28));
      // Little UFOs, hover-bobbing with beat-pulsed rim lights.
      const hovers: { g: THREE.Group; y0: number; ph: number }[] = [];
      const lightMats: THREE.MeshToonMaterial[] = [];
      ufo(ctx, 14, 1.4, 20, 1, hovers, lightMats, true);
      ufo(ctx, 5.5, 2.1, 26, 0.8, hovers, lightMats);
      ufo(ctx, -8, 2, -18, 1.1, hovers, lightMats);
      // Slow asteroid belt drifting around the whole stage.
      const belt = new THREE.Group();
      const rockMat = toonMat({ color: hue(0x9184b0) });
      const rocks: { m: THREE.Mesh; sx: number; sy: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const geo = new THREE.SphereGeometry(1, 7, 5);
        geo.scale(0.35 + ((i * 1.7) % 0.5), 0.3 + ((i * 2.3) % 0.4), 0.35 + ((i * 1.1) % 0.45));
        const m = O(new THREE.Mesh(geo, rockMat), 0.03);
        const a = (i / 7) * Math.PI * 2;
        const r = 17 + ((i * 3.1) % 7);
        m.position.set(Math.cos(a) * r, -1.2 + ((i * 1.9) % 3.4), Math.sin(a) * r);
        belt.add(m);
        rocks.push({ m, sx: 0.004 + (i % 3) * 0.003, sy: 0.006 - (i % 2) * 0.003 });
      }
      propGroup.add(belt);
      // Coloured nebula glows (atmospheric — kept).
      const starCols = [0x8b5cf6, 0xa8e831, 0xff4d8d];
      for (let i = 0; i < 6; i++) {
        const s = glowSprite(
          hue(starCols[i % 3]),
          10 + Math.random() * 8,
          (Math.random() - 0.5) * 50,
          Math.random() * 14 - 2,
          -20 - Math.random() * 20,
        );
        s.material.opacity = 0.12;
        propGroup.add(s);
      }
      // G3: ein bis zwei Kometen mit kurzem Schweif queren das Sternenfeld.
      streaks(ctx, 2, {
        color: 0x9ff2ff,
        len: 5,
        width: 0.2,
        travelS: 2,
        gapS: 6.5,
        // Von rechts (−x) quer durchs Sternenfeld, unter der Insel hindurch —
        // der obere Bildrand gehört dem HUD-Streifen.
        from: [-9, 2.5, 16],
        dir: [1, -0.22, 0],
        spread: [4, 3, 5],
      });
      anims.push((t, beatV) => {
        stars.rotation.y = t * 0.008;
        planet.rotation.y = t * 0.05;
        far.rotation.y = t * 0.04;
        moon.position.set(
          12 + Math.cos(t * 0.35) * 4.6,
          0.3 + Math.sin(t * 0.7) * 0.5,
          24 + Math.sin(t * 0.35) * 4.6,
        );
        for (let i = 0; i < hovers.length; i++) {
          const h = hovers[i];
          h.g.position.y = h.y0 + Math.sin(t * 1.3 + h.ph) * 0.25;
          h.g.rotation.y = t * 0.7 + h.ph;
        }
        const glow = 0.55 + beatV * 0.7;
        for (let i = 0; i < lightMats.length; i++) lightMats[i].emissiveIntensity = glow;
        belt.rotation.y = t * 0.02;
        for (let i = 0; i < rocks.length; i++) {
          const r = rocks[i];
          r.m.rotation.x += r.sx;
          r.m.rotation.y += r.sy;
        }
      });
    },
  },
};

// ---------------------------------------------------------------------------
// G1 — Bühnen-Wechsel als Moment (ROADMAP-V2)
// ---------------------------------------------------------------------------

/** Ausfahrt der ALTEN Bühne (s) — Cubic-Ease-In, sie fällt beschleunigt weg. */
const OUT_S = 0.5;
/** Einfahrt der NEUEN Bühne (s) — Ease-Out mit kleinem Überschwinger. */
const IN_S = 0.7;
/** Fallhöhe: weit genug, dass die Insel bei jedem Framing aus dem Bild ist. */
const DROP_Y = 17;
/** Leichter Kippwinkel, damit die Bühne fällt statt zu „faten". */
const TILT = 0.14;
/** Kulissen-Parallaxe: die ferne Szenerie zieht schwächer mit als die Insel. */
const PROP_PARALLAX = 0.55;

/**
 * ROADMAP-V2 X2 — Farbe, zu der das Deck-Emissive während der Twerk-Ekstase
 * pulst (das Peach-Pink der Ekstase-Leiste). Das Theme-Emissive bleibt der
 * Ausgangspunkt: Synthwave pulst also aus seinem Grid heraus, die Themes ohne
 * Deck-Emissive (Club/Beach/Space) glühen aus Schwarz auf.
 */
const EKSTASE_DECK = new THREE.Color(0xff4d8d);

const easeInCubic = (k: number): number => k * k * k;
/**
 * Ease-Out mit Überschwinger. `c = 0.75` federt ~2 % über die Ruhelage — bei
 * `DROP_Y` sind das gut 0.35 Einheiten, also spürbar als Landung, aber klein
 * genug, dass das Duo (das erst ab −0.35 wieder auftritt) nicht im Deck steht.
 */
const easeOutBack = (k: number): number => {
  const c = 0.75;
  const p = k - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
};

/** Alles, was beim Theme-Wechsel STETIG überblendet werden kann (G1). */
interface Palette {
  skyTop: THREE.Color;
  skyBot: THREE.Color;
  fog: THREE.Color;
  floor: THREE.Color;
  key: THREE.Color;
  keyInt: number;
  fill: THREE.Color;
  fillInt: number;
  sky: THREE.Color;
  ground: THREE.Color;
  rimA: THREE.Color;
  rimB: THREE.Color;
}

/**
 * Owns the swappable stage props and the sky/fog/floor tint. Replaces the
 * prototype's propGroup/anims globals + setBackground().
 *
 * G1: `setBackground(key, variant, { animate: true })` macht aus dem Cut einen
 * Moment — die alte `islandGroup` fährt nach unten aus dem Bild (Kulisse mit
 * Parallaxe hinterher), erst DANN wird sie entsorgt und die neue Bühne gebaut,
 * die von unten einschwebt. Sky/Fog/Deck-Farbe und das Licht-Rig blenden über
 * die GANZE Dauer stetig über, damit nirgends ein Hard-Cut sitzt. Getickt wird
 * im bestehenden Render-Loop (`update(dt)`), die Kamera bleibt unberührt.
 */
export class World {
  private propGroup = new THREE.Group();
  private islandGroup = new THREE.Group();
  /** Per-frame animation callbacks for the active background. */
  readonly anims: WorldAnim[] = [];

  /** X2: Deck-Emissive des aktuellen Themes — die Ruhelage des Ekstase-Pulses. */
  private deckEmissive0 = new THREE.Color(0x000000);
  private deckEmissiveI0 = 1;
  /** X2: Läuft der Deck-Puls gerade? (Nur dann muss zurückgestellt werden.) */
  private ekstaseOn = false;
  /** G3: Dichte-Faktor der Ambient-Elemente (aus dem Quality-Preset). */
  private ambientLife = 1;
  /**
   * 1b: Trophäen-Stufe der AKTUELLEN Bühne (0 = keine, 1–3 = Bronze/Silber/Gold).
   * Sie gehört dem THEME, nicht der Welt — die Glue setzt sie bei jedem
   * Bühnen-/Ruf-Wechsel, bevor sie die Kulisse wechselt.
   */
  private trophyTier = 0;
  /** Die zuletzt GEBAUTE Bühne — für einen Rebuild bei Dichte-Wechsel (G3). */
  private cur: { key: BackgroundKey; variant: number } | null = null;

  /** G1-Übergangs-Zustand: `null` = keine Bühne in Bewegung. */
  private trans: {
    key: BackgroundKey;
    variant: number;
    /** `false` = die alte Bühne fährt noch aus, `true` = die neue fährt ein. */
    entering: boolean;
    /** Sekunden in der laufenden Phase. */
    t: number;
    from: Palette;
    to: Palette;
  } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly skyMat: THREE.ShaderMaterial,
    private readonly floorMat: THREE.MeshPhysicalMaterial,
    private readonly glowSprite: GlowSpriteFn,
    /** Optionales Licht-Rig (Roadmap L) — der Modell-Exporter lässt es weg. */
    private readonly lights?: SceneLights,
  ) {
    this.scene.add(this.propGroup, this.islandGroup);
  }

  private disposeGroup(g: THREE.Group): void {
    this.scene.remove(g);
    g.traverse((o) => {
      const mesh = o as Partial<THREE.Mesh>;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  /** Lap-Hue-Funktion für einen Recolour-Lap (Identität auf Lap 0). */
  private static hueFn(variant: number): (hex: number) => THREE.Color {
    const dh = (variant * LAP_HUE) % 1;
    return (hex) => {
      const c = new THREE.Color(hex);
      if (dh !== 0) c.offsetHSL(dh, 0, 0);
      return c;
    };
  }

  /**
   * Die überblendbare Palette eines Themes. Goal „alle Bühnen heller": die
   * Kulissen-Paletten werden Richtung Weiß geliftet (Sky am stärksten, Boden
   * dezent) — die Stimmungen bleiben unterscheidbar, aber nichts säuft mehr im
   * Dunkel ab. Das Licht-Rig (Roadmap L) läuft bewusst OHNE Hue-Lap.
   */
  private static paletteFor(key: BackgroundKey, variant: number): Palette {
    const hue = World.hueFn(variant);
    const lift = (c: THREE.Color, f: number): THREE.Color => c.lerp(new THREE.Color(0xffffff), f);
    const b = BGS[key];
    const L = b.light;
    return {
      skyTop: lift(hue(b.top), 0.22),
      skyBot: lift(hue(b.bot), 0.3),
      fog: lift(hue(b.fog), 0.26),
      floor: lift(hue(b.floor), 0.14),
      key: new THREE.Color(L.key),
      keyInt: L.keyInt,
      fill: new THREE.Color(L.fill),
      fillInt: L.fillInt,
      sky: new THREE.Color(L.sky),
      ground: new THREE.Color(L.ground),
      rimA: new THREE.Color(L.rimA),
      rimB: new THREE.Color(L.rimB),
    };
  }

  /** Die AKTUELL gesetzte Palette (Startpunkt einer G1-Überblendung). */
  private snapshotPalette(): Palette {
    const l = this.lights;
    const base = World.paletteFor('club', 0); // Fallback-Werte ohne Licht-Rig
    return {
      skyTop: (this.skyMat.uniforms.top!.value as THREE.Color).clone(),
      skyBot: (this.skyMat.uniforms.bot!.value as THREE.Color).clone(),
      fog: (this.scene.fog as THREE.FogExp2).color.clone(),
      floor: this.floorMat.color.clone(),
      key: l ? l.key.color.clone() : base.key,
      keyInt: l ? l.key.intensity : base.keyInt,
      fill: l ? l.fill.color.clone() : base.fill,
      fillInt: l ? l.fill.intensity : base.fillInt,
      sky: l ? l.hemi.color.clone() : base.sky,
      ground: l ? l.hemi.groundColor.clone() : base.ground,
      rimA: l ? l.rimA.color.clone() : base.rimA,
      rimB: l ? l.rimB.color.clone() : base.rimB,
    };
  }

  /** Palette schreiben — `k < 1` blendet von `from` nach `to` (G1). */
  private applyPalette(from: Palette, to: Palette, k: number): void {
    const c = (a: THREE.Color, b: THREE.Color): THREE.Color =>
      k >= 1 ? b.clone() : a.clone().lerp(b, k);
    const n = (a: number, b: number): number => (k >= 1 ? b : a + (b - a) * k);
    (this.skyMat.uniforms.top!.value as THREE.Color).copy(c(from.skyTop, to.skyTop));
    (this.skyMat.uniforms.bot!.value as THREE.Color).copy(c(from.skyBot, to.skyBot));
    (this.scene.fog as THREE.FogExp2).color.copy(c(from.fog, to.fog));
    this.floorMat.color.copy(c(from.floor, to.floor));
    if (this.lights) {
      this.lights.key.color.copy(c(from.key, to.key));
      this.lights.key.intensity = n(from.keyInt, to.keyInt);
      this.lights.fill.color.copy(c(from.fill, to.fill));
      this.lights.fill.intensity = n(from.fillInt, to.fillInt);
      this.lights.hemi.color.copy(c(from.sky, to.sky));
      this.lights.hemi.groundColor.copy(c(from.ground, to.ground));
      this.lights.rimA.color.copy(c(from.rimA, to.rimA));
      this.lights.rimB.color.copy(c(from.rimB, to.rimB));
    }
  }

  /**
   * Die harte Hälfte des Wechsels: alte Gruppen entsorgen, Deck-Texturen +
   * Insel + Kulisse neu bauen. Alles hier ist DISKRET (Map-Wechsel brauchen
   * einen Programm-Rebuild) — im animierten Fall läuft es, während die Bühne
   * unter dem Bildrand steht.
   */
  private rebuild(key: BackgroundKey, variant: number): void {
    this.cur = { key, variant };
    this.disposeGroup(this.propGroup);
    this.disposeGroup(this.islandGroup);
    this.propGroup = new THREE.Group();
    this.islandGroup = new THREE.Group();
    // Benannt, damit der Modell-Exporter die Insel (Szenen-Fixture) von der
    // Prop-Szenerie unterscheiden kann.
    this.islandGroup.name = 'stage-island';
    this.scene.add(this.propGroup, this.islandGroup);
    this.anims.length = 0;

    const hue = World.hueFn(variant);
    const b = BGS[key];
    this.floorMat.roughness = b.fr;
    this.floorMat.metalness = b.fm;
    // Deck-Texturen (Goal „apply texture"): Map/Emissive-Map je Theme; ein
    // Map-Wechsel braucht einen Programm-Rebuild (needsUpdate).
    const d = b.deck ?? {};
    this.floorMat.map = d.map?.() ?? null;
    this.floorMat.emissiveMap = d.emissiveMap?.() ?? null;
    this.floorMat.emissive.copy(d.emissive !== undefined ? hue(d.emissive) : new THREE.Color(0));
    this.floorMat.emissiveIntensity = d.emissiveIntensity ?? 1;
    // T2-Relief: dieselbe Muster-Map trägt die Höhe (Fugen/Nieten/Grid-Grate).
    this.floorMat.bumpMap = d.bump ? (this.floorMat.map ?? this.floorMat.emissiveMap) : null;
    this.floorMat.bumpScale = d.bump ?? 1;
    this.floorMat.needsUpdate = true;
    // X2: die frische Deck-Emissive-Ruhelage merken. Läuft gerade eine Ekstase,
    // schreibt der nächste `setEkstase`-Tick den Puls wieder darüber — der
    // Bühnen-Wechsel MITTEN im Fenster reißt den Puls also nicht ab.
    this.deckEmissive0.copy(this.floorMat.emissive);
    this.deckEmissiveI0 = this.floorMat.emissiveIntensity;
    if (d.scroll && this.floorMat.emissiveMap) {
      const tex = this.floorMat.emissiveMap;
      const speed = d.scroll;
      this.anims.push((t) => {
        tex.offset.y = (t * speed) % 1;
      });
    }
    buildIsland(this.islandGroup, key, hue, this.floorMat, this.anims);
    const ctx: BuildCtx = {
      propGroup: this.propGroup,
      islandGroup: this.islandGroup,
      glowSprite: this.glowSprite,
      anims: this.anims,
      variant,
      hue,
      density: this.ambientLife,
    };
    b.build(ctx);
    // G3: Publikum-Silhouetten am hinteren Inselrand — für JEDE Bühne gleich
    // (das Publikum ist der Bühne eigen, nicht dem Theme), deshalb hier und
    // nicht in den vier `build`-Funktionen.
    audience(ctx);
    // 1b: …und daneben, im selben Ambient-Slot, die verdiente Insel-Trophäe.
    if (this.trophyTier > 0) trophy(ctx, this.trophyTier);
  }

  /** Bühnen-Versatz setzen (G1) — `y` in Welt-Einheiten, `tilt` in Radiant. */
  private setStageOffset(y: number, tilt: number): void {
    this.islandGroup.position.y = y;
    this.islandGroup.rotation.z = tilt;
    this.propGroup.position.y = y * PROP_PARALLAX;
    this.propGroup.rotation.z = tilt * PROP_PARALLAX;
  }

  /**
   * Swap the stage. `variant` is the recolour lap (0 = original palette) —
   * deeper endless laps hue-shift the sky, fog, floor and prop palette so
   * lap 2+ of a tier reads visibly different (Wave-3 endless variety).
   * Seit dem Goal-Umbau wird auch die INSEL selbst pro Theme neu gebaut
   * (`world/island.ts`) und das Deck texturiert (`deck`-Config).
   *
   * G1: mit `{ animate: true }` (medium/high) wird daraus die Aus-/Einfahrt —
   * siehe `update()`. Ohne die Option (und im low-Preset) bleibt es der
   * bisherige Hard-Swap in EINEM Frame.
   */
  setBackground(key: BackgroundKey, variant = 0, opts?: { animate?: boolean }): void {
    if (opts?.animate) {
      if (this.trans) {
        // Nachgereichter Wechsel MITTEN im laufenden: nur das Ziel austauschen,
        // damit nie zwei Übergänge übereinander liegen. Steht die neue Bühne
        // schon in der Einfahrt, wird sie neu gebaut und fährt erneut ein.
        this.trans.key = key;
        this.trans.variant = variant;
        this.trans.to = World.paletteFor(key, variant);
        if (this.trans.entering) {
          this.rebuild(key, variant);
          this.setStageOffset(-DROP_Y, -TILT);
          this.trans.t = 0;
        }
        return;
      }
      // Die alte Bühne bleibt vorerst stehen und fährt aus; entsorgt wird sie
      // erst, wenn sie unter dem Bildrand ist (siehe `update`).
      this.trans = {
        key,
        variant,
        entering: false,
        t: 0,
        from: this.snapshotPalette(),
        to: World.paletteFor(key, variant),
      };
      return;
    }
    // Hard-Swap: ein laufender Übergang wird verworfen (Prestige/Import setzen
    // die Bühne hart — dort darf keine halb ausgefahrene Insel hängenbleiben).
    this.trans = null;
    this.rebuild(key, variant);
    this.setStageOffset(0, 0);
    const p = World.paletteFor(key, variant);
    this.applyPalette(p, p, 1);
  }

  /** Läuft gerade ein Bühnen-Wechsel? (Der Loop pausiert dann Treffer/Klicks.) */
  get transitioning(): boolean {
    return this.trans !== null;
  }

  /**
   * ROADMAP-V2 X2 — Deck-Emissive-Puls im Ekstase-Fenster.
   *
   * Aufruf JEDEN Frame aus dem Render-Loop mit `(frenzy && preset.ekstaseDeck,
   * beatV)` — derselbe `beatV`, den auch die Kulissen-Anims bekommen, also
   * pulst das Deck exakt im Takt der Neonkanten und Lautsprecher-Dome. Kein
   * eigener Timer, kein Licht, keine zusätzliche Geometrie: es wird nur das
   * ohnehin vorhandene geteilte `floorMat` moduliert und beim Fenster-Ende
   * genau einmal auf die Theme-Ruhelage zurückgestellt.
   */
  setEkstase(active: boolean, beatV: number): void {
    if (!active) {
      if (this.ekstaseOn) {
        this.ekstaseOn = false;
        this.floorMat.emissive.copy(this.deckEmissive0);
        this.floorMat.emissiveIntensity = this.deckEmissiveI0;
      }
      return;
    }
    this.ekstaseOn = true;
    // Grundglut + Beat-Spitze: das Deck steht auch zwischen den Schlägen hell
    // (das Fenster ist ein Zustand, kein Stroboskop), schlägt aber sichtbar an.
    const k = 0.45 + 0.55 * Math.max(0, Math.min(1, beatV));
    this.floorMat.emissive.copy(this.deckEmissive0).lerp(EKSTASE_DECK, k);
    this.floorMat.emissiveIntensity = this.deckEmissiveI0 + 0.2 + k * 0.9;
  }

  /**
   * ROADMAP-V2 G3 — Dichte der Ambient-Elemente (Preset-Pflicht). Ändert sich
   * der Wert (Grafik-Einstellung im Spiel), wird die aktuelle Bühne einmal neu
   * gebaut, damit die Stückzahlen sofort stimmen; ein LAUFENDER G1-Wechsel wird
   * dabei bewusst nicht gestört — er baut die neue Bühne ohnehin gleich mit der
   * neuen Dichte.
   */
  setAmbientLife(density: number): void {
    const d = Math.max(0, density);
    if (d === this.ambientLife) return;
    this.ambientLife = d;
    if (this.cur && !this.trans) this.rebuild(this.cur.key, this.cur.variant);
  }

  /**
   * IDEEN-GAMEPLAY 1b — die Trophäen-Stufe der laufenden Bühne setzen (0 = keine).
   *
   * Dieselbe Mechanik wie {@link setAmbientLife}: Ändert sich der Wert, wird die
   * aktuelle Bühne einmal neu gebaut, damit der Pokal sofort steht (ein
   * Ruf-Aufstieg ist ein Moment, kein Wert für den nächsten Bühnen-Wechsel); ein
   * LAUFENDER G1-Wechsel wird nicht gestört — er baut die neue Bühne ohnehin
   * gleich mit der neuen Stufe. Rebuilds sind hier billig zu verantworten: Über
   * ein ganzes Spielerleben gibt es je Theme höchstens drei Stufen-Wechsel.
   *
   * `rebuild: false` schaltet genau diesen Sofort-Rebuild ab — die Glue nutzt es,
   * wenn sie im selben Atemzug ohnehin die Bühne wechselt (Theme-Grenze: neues
   * Theme ⇒ neue Trophäen-Stufe UND neue Kulisse). Sonst würde erst die ALTE
   * Bühne mit dem neuen Pokal gebaut und eine Zeile später die neue — zwei
   * Rebuilds für ein Bild.
   */
  setTrophy(tier: number, rebuild = true): void {
    const t = Math.max(0, Math.min(3, Math.floor(Number.isFinite(tier) ? tier : 0)));
    if (t === this.trophyTier) return;
    this.trophyTier = t;
    if (rebuild && this.cur && !this.trans) this.rebuild(this.cur.key, this.cur.variant);
  }

  /** Aktueller Höhen-Versatz der Bühne (0 = Ruhelage) — für den Headless-Beweis. */
  get stageY(): number {
    return this.islandGroup.position.y;
  }

  /** Die gesetzte Trophäen-Stufe (0…3) — für den Headless-Beweis. */
  get trophy(): number {
    return this.trophyTier;
  }

  /**
   * G1-Tick aus dem Render-Loop. Phase 1 (`OUT_S`): die alte Insel-Gruppe fällt
   * mit Cubic-Ease-In und leichtem Tilt aus dem Bild, die Kulisse mit
   * Parallaxe hinterher. Am Phasenende wird sie entsorgt und die neue Bühne
   * gebaut (unter dem Bildrand). Phase 2 (`IN_S`): die neue Gruppe schwebt mit
   * Ease-Out und kleinem Überschwinger in die Ruhelage. Über BEIDE Phasen
   * blendet die Palette stetig — kein Hard-Cut, auch nicht am Himmel.
   */
  update(dt: number): void {
    const tr = this.trans;
    if (!tr) return;
    tr.t += dt;
    if (!tr.entering) {
      const k = Math.min(1, tr.t / OUT_S);
      const e = easeInCubic(k);
      this.setStageOffset(-DROP_Y * e, TILT * e);
      this.applyPalette(tr.from, tr.to, (k * OUT_S) / (OUT_S + IN_S));
      if (k >= 1) {
        this.rebuild(tr.key, tr.variant);
        this.setStageOffset(-DROP_Y, -TILT);
        tr.entering = true;
        tr.t = 0;
      }
      return;
    }
    const k = Math.min(1, tr.t / IN_S);
    const e = easeOutBack(k);
    this.setStageOffset(-DROP_Y * (1 - e), -TILT * (1 - e));
    this.applyPalette(tr.from, tr.to, (OUT_S + k * IN_S) / (OUT_S + IN_S));
    if (k >= 1) {
      this.setStageOffset(0, 0);
      this.applyPalette(tr.to, tr.to, 1);
      this.trans = null;
    }
  }
}
