import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

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
  // Roher Kopierer auf die Leinwand — bewusst KEIN OutputPass: der Puffer ist
  // schon display-referred, jede weitere Transferkurve wäre die Doppelung.
  composer.addPass(new ShaderPass(CopyShader));

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
