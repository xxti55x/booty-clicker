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
  renderer.toneMappingExposure = 1.45; // Goal: alle Bühnen deutlich heller

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
  scene.add(new THREE.HemisphereLight(0xd6daff, 0x4a3a40, 0.95));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.3);
  key.position.set(4.5, 8.5, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
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
  const rimV = new THREE.PointLight(0x8b5cf6, 48, 55, 2);
  rimV.position.set(-6, 4, -5);
  scene.add(rimV);
  const rimL = new THREE.PointLight(0xa8e831, 30, 55, 2);
  rimL.position.set(6, 2, 4);
  scene.add(rimL);
  const beat = new THREE.PointLight(0xffffff, 0, 25, 2);
  beat.position.set(0, 3, -3);
  scene.add(beat);

  const GLOW = makeGlowTexture();
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

  // Soft contact-shadow decal under the character.
  {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 3.2),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = -2.385;
    scene.add(m);
  }

  return { renderer, scene, camera, beat, skyMat, floorMat, glowSprite };
}

// Re-export so consumers can build props with the same material helper.
export { mk };
