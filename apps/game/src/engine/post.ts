import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Post-Processing (Roadmap L, V2-1): selektives Bloom für die ECHTEN Emissives —
 * Neonkanten, Synth-Grid, Kristalle, Landelichter, Ekstase-Momente.
 *
 * ## Warum DISPLAY-SPACE-Overlay statt Linear-HDR-Kette (die V2-1-Lektion)
 *
 * Die kanonische Kette (RenderPass → Bloom → OutputPass) setzt voraus, dass
 * JEDES Material der Szene die konditionalen Farb-Chunks trägt. Diese Welt tut
 * das absichtlich nicht überall: die Kulissen-Himmel sind `ShaderMaterial`s
 * und die Ink-Kanten `toneMapped: false` — beide sind DISPLAY-REFERRED
 * geautored (ihre Farben meinen fertige Bildschirmwerte). Ein OutputPass legt
 * ACES + sRGB über den GESAMTEN Puffer und hebt genau diese Flächen milchig an
 * (gemessen: Median +42/255, Schatten +38, Lichter +8 — die Signatur einer
 * zusätzlichen konkaven Transferkurve; Beweisbilder in DECISIONS „V2-1").
 *
 * Deshalb rendert der Loop die Szene UNVERÄNDERT direkt auf die Leinwand (die
 * abgenommene Optik bleibt byte-identisch), blittet den fertigen Frame per
 * `copyFramebufferToTexture` in eine {@link THREE.FramebufferTexture} und
 * rechnet NUR den Glow darauf: Bright-Pass + Blur-Kette im Display-Raum,
 * additiv zurückkomponiert, roh kopiert — keine Farbraum-Konvertierung in der
 * ganzen Kette, eine Doppel-Anwendung ist strukturell unmöglich.
 *
 * Läuft NUR im `quality: high`-Preset (ein Blit + Fullscreen-Pass + Blur-Kette);
 * `enabled === false` ⇒ der Loop rendert direkt und zahlt exakt nichts.
 */
export interface Post {
  /** Bloom-Pfad aktiv? Der Loop ruft sonst `renderer.render` direkt. */
  enabled: boolean;
  render(): void;
  /** Nach Resize ODER PixelRatio-Wechsel (Quality-Preset) aufrufen. */
  setSize(w: number, h: number): void;
}

/**
 * Bright-Pass-Schwelle im DISPLAY-Raum (0..1 Leinwand-Luminanz). Die Neon-
 * Emissives liegen ≥ ~0.75; Pergament-UI-Karten leben im DOM und sind hier
 * strukturell außen vor.
 */
const BLOOM_THRESHOLD = 0.78;
/** Dezent: Glühkanten, kein Nebel. */
const BLOOM_STRENGTH = 0.4;
const BLOOM_RADIUS = 0.25;

/**
 * **Grade-Abschluss** (AAA-Pass): ersetzt den nackten CopyShader am Ende der
 * Kette durch Kopie + Feinschliff — sanfte Vignette (lenkt den Blick zur
 * Bühnenmitte), +5 % Sättigung um den Luma-Anker und ein Hauch warmes Licht
 * NUR in den Lichtern. Alles bewusst DISPLAY-SPACE und bewusst dezent: der
 * Grade ist ein künstlerischer Fingerabdruck, keine Farbraum-Konvertierung —
 * die V2-1-Regel „keine Transferkurve über den ganzen Puffer" bleibt
 * unangetastet (Vignette/Grade sind orts- bzw. luma-selektiv, gemessen in
 * DECISIONS „AAA-Grafik-Pass").
 */
const GradeShader = {
  name: 'BootyGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    /** Kanten-Abdunklung (0 = aus). */
    uVignette: { value: 0.2 },
    /** 1 = neutral. */
    uSaturation: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      float luma = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      c.rgb = mix( vec3( luma ), c.rgb, uSaturation );
      // Warme Lichter: nur oberhalb ~55 % Luma, Blau minimal raus — der
      // "goldene Bühnenglanz", ohne die Schatten zu kippen.
      c.rgb += vec3( 0.020, 0.008, -0.012 ) * smoothstep( 0.55, 1.0, luma );
      vec2 q = vUv - 0.5;
      float edge = smoothstep( 0.32, 0.85, length( q ) * 1.35 );
      c.rgb *= 1.0 - uVignette * edge;
      gl_FragColor = c;
    }`,
};

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): Post {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  let frameTex = new THREE.FramebufferTexture(size.x, size.y);

  const composer = new EffectComposer(renderer);
  const texPass = new TexturePass(frameTex);
  composer.addPass(texPass);
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloom);
  // Grade-Abschluss statt nacktem Kopierer — bewusst KEIN OutputPass: der
  // Puffer ist schon display-referred, jede Transferkurve wäre die Doppelung.
  composer.addPass(new ShaderPass(GradeShader));

  return {
    enabled: false,
    render() {
      renderer.render(scene, camera);
      renderer.copyFramebufferToTexture(frameTex);
      composer.render();
    },
    setSize(w: number, h: number) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom.setSize(w, h);
      // FramebufferTexture ist an die DRAWING-BUFFER-Größe gebunden (CSS-Pixel
      // × PixelRatio) — bei jeder Änderung neu anlegen, sonst blittet der Copy
      // nur eine Ecke.
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      frameTex.dispose();
      frameTex = new THREE.FramebufferTexture(s.x, s.y);
      texPass.map = frameTex;
    },
  };
}
