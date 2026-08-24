import * as THREE from 'three';

import { mk } from './materials';

/** Factory that spawns an additive glow sprite (shared by the world backgrounds). */
export type GlowSpriteFn = (
  color: THREE.ColorRepresentation,
  size: number,
  x: number,
  y: number,
  z: number,
) => THREE.Sprite;

/** Das umstimmbare Licht-Rig (Roadmap L: pro Theme ein eigenes Licht-Delta). */
export interface SceneLights {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  rimA: THREE.PointLight;
  rimB: THREE.PointLight;
}

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Beat-reactive point light (pulsed from the render loop). */
  beat: THREE.PointLight;
  /** Sky gradient shader — top/bot uniforms are re-coloured per background. */
  skyMat: THREE.ShaderMaterial;
  /** Floor material — colour/roughness/metalness re-tuned per background. */
  floorMat: THREE.MeshPhysicalMaterial;
  glowSprite: GlowSpriteFn;
  /** Umstimmbares Licht-Rig — die World färbt es mit der Kulisse um. */
  lights: SceneLights;
  /**
   * Weicher Kontaktschatten unter dem Tänzer. Liegt auf der Deckhöhe der Insel
   * — beim G1-Bühnenwechsel fährt die Insel darunter weg, also wird er (wie das
   * Duo selbst) für die Dauer des Wechsels ausgeblendet.
   */
  contactShadow: THREE.Mesh;
}

/** Procedural equirectangular environment map (studio-ish gradient + blobs). */
function makeEnv(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3a3550');
  g.addColorStop(0.5, '#181820');
  g.addColorStop(1, '#050507');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 256);
  const blob = (cx: number, cy: number, r: number, col: string): void => {
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, col);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg;
    x.beginPath();
    x.arc(cx, cy, r, 0, 7);
    x.fill();
  };
  blob(140, 70, 90, 'rgba(255,255,255,.95)');
  blob(390, 90, 80, 'rgba(139,92,246,.75)');
  blob(260, 40, 70, 'rgba(168,232,49,.55)');
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Maße des Spieler-Schattens (D-03) — an den Füßen, nicht als Teppich. */
const PLAYER_SHADOW_W = 3.4;
const PLAYER_SHADOW_H = 2.4;

let blobTex: THREE.CanvasTexture | null = null;

/**
 * D-03 — Weicher elliptischer Kontaktschatten als Decal.
 *
 * EINE gecachte Radial-Gradient-Textur für die ganze Bühne, aber ein Material
 * PRO Instanz: Deckkraft und Größe reagieren je Akteur auf Sprunghöhe und
 * Deckhelligkeit des Themes. Der Programm-TYP existiert ohnehin schon
 * (Basic + Map + transparent), es kommt also kein Shader dazu (K-7).
 *
 * Liegt flach auf dem Deck (`rotation.x = −π/2`), schreibt keine Tiefe und
 * kostet damit weder Sortier- noch Schattenkarten-Arbeit.
 */
export function blobShadow(w: number, h: number, opacity: number): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.45, 'rgba(0,0,0,.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

let glowTexCache: THREE.CanvasTexture | null = null;
/**
 * D-14/D-18: Der geteilte weiche Glow-Punkt — EINE gecachte Textur für alle
 * Glow-Sprites (Kulisse UND Skin-Signaturen/Rarity-Funken), damit kein zweiter
 * Kanal entsteht. Wer sie nutzt, klont nur das MATERIAL, nie die Textur.
 */
export function glowTexture(): THREE.CanvasTexture {
  return (glowTexCache ??= makeGlowTexture());
}

/**
 * Build the renderer, scene, camera, lighting and static stage.
 * Ported 1:1 from the prototype's RENDERER section (behaviour preserved).
 */
export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // D-01 (Belichtungs-Disziplin): Die Bühnenmitte brannte bei 1.45 aus — die
  // Spielfigur las als weißer Klecks (shots/theme-z45.png), das low-Preset sah
  // BESSER aus als high. Grundhelligkeit runter; das verlorene „hell" kommt aus
  // sattereren Theme-Paletten zurück (kleinerer Weiß-Lift in `paletteFor`),
  // nicht aus mehr Belichtung. Beide Presets erben denselben Wert — die
  // Belichtung ist Grundwahrheit, kein high-Extra (K-9).
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  // Dichte auf die Halbraum-Kamera abgestimmt (Distanz ~45–50): die Insel bleibt
  // klar, nur der Hintergrund staffelt in den Dunst.
  scene.fog = new THREE.FogExp2(0x0a0a10, 0.012);
  // Enges FOV = Tele-Kompression: die Insel liest als flaches Diorama
  // (Casual-Idle-Look), nicht als 3D-Raum mit gewölbter Nahkante.
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 220);

  scene.environment = makeEnv();

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x2a2740) },
      bot: { value: new THREE.Color(0x070709) },
    },
    vertexShader: `varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 p;uniform vec3 top;uniform vec3 bot;
      void main(){float h=clamp((normalize(p).y+0.35)/1.15,0.0,1.0);gl_FragColor=vec4(mix(bot,top,h),1.0);}`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(70, 32, 32), skyMat));

  // Cartoon lighting (Wave 1): one strong frontal-ish key so the cel bands cut
  // cleanly across the toon materials, a lifted hemisphere + soft cool fill so
  // the shadow band stays colourful (never muddy), and the club rim lights for
  // pop. The beat PointLight still pulses the whole cast on the beat.
  const hemi = new THREE.HemisphereLight(0xd6daff, 0x4a3a40, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e0, 2.3);
  key.position.set(4.5, 8.5, 7);
  // Roadmap L: Schatten-Frustum exakt auf die INSEL zentrieren (Zentrum 1.4/1.7,
  // R 6.4) statt auf den Welt-Ursprung — kein abgeschnittener Inselrand mehr.
  key.target.position.set(1.4, -2.4, 1.7);
  scene.add(key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 34;
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 5;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xa9c4ff, 0.75);
  fill.position.set(-6, 3, 6);
  scene.add(fill);
  const rimA = new THREE.PointLight(0x8b5cf6, 48, 55, 2);
  rimA.position.set(-6, 4, -5);
  scene.add(rimA);
  const rimB = new THREE.PointLight(0xa8e831, 30, 55, 2);
  rimB.position.set(6, 2, 4);
  scene.add(rimB);
  const beat = new THREE.PointLight(0xffffff, 0, 25, 2);
  beat.position.set(0, 3, -3);
  scene.add(beat);
  const lights: SceneLights = { hemi, key, fill, rimA, rimB };

  const GLOW = glowTexture();
  const glowSprite: GlowSpriteFn = (color, size, x, y, z) => {
    const m = new THREE.SpriteMaterial({
      map: GLOW,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    s.position.set(x, y, z);
    return s;
  };
  scene.add(glowSprite(0x8b5cf6, 5, -6, 4, -5));
  scene.add(glowSprite(0xa8e831, 4, 6, 2, 4));

  // Insel-Oberseite (das „Deck"): geteiltes Material — die World tönt UND
  // texturiert es pro Bühne um. Die Insel selbst (Unterbau, Kante, Zapfen/
  // Kristalle, Hintergrund-Füllung) ist seit dem Goal-Umbau PRO THEME ein
  // eigenes Bauwerk und wird von der World mit der Kulisse gebaut
  // (`world/island.ts`) — hier lebt nur noch das geteilte Material.
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c0c12,
    roughness: 0.2,
    metalness: 0.65,
    envMapIntensity: 0.9,
  });

  // D-03: Der Kontaktschatten des Spielers kommt jetzt aus derselben Fabrik wie
  // der des Rivalen — ein Decal-Typ für die ganze Bühne. Der alte Fleck war mit
  // 4.5 × 3.2 deutlich zu groß und las auf dunklem Deck als Schmutz
  // (shots/theme-z35.png); die kleinere Ellipse sitzt AN den Füßen.
  const contactShadow = blobShadow(PLAYER_SHADOW_W, PLAYER_SHADOW_H, 0.5);
  contactShadow.position.y = -2.385;
  scene.add(contactShadow);

  return { renderer, scene, camera, beat, skyMat, floorMat, glowSprite, lights, contactShadow };
}

// Re-export so consumers can build props with the same material helper.
export { mk };
