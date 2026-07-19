import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Post-Processing (Roadmap L): selektives Bloom für die ECHTEN Emissives —
 * Neonkanten, Synth-Grid, Kristalle, Landelichter, Ekstase-Momente. Threshold
 * hoch angesetzt, damit nur Glüh-Materialien blühen und die Pergament-UI-Welt
 * dahinter knackig bleibt. Läuft NUR im `quality: high`-Preset (der Composer
 * kostet einen Fullscreen-Pass + Blur-Kette); `enabled === false` rendert der
 * Loop direkt über den Renderer — Mobile/Low zahlt nichts.
 */
export interface Post {
  /** Bloom-Pfad aktiv? Der Loop rendert sonst direkt (kein Composer-Overhead). */
  enabled: boolean;
  render(): void;
  /** Nach Resize ODER PixelRatio-Wechsel (Quality-Preset) aufrufen. */
  setSize(w: number, h: number): void;
}

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.4, // strength — dezent: Glühkanten, kein Nebel
    0.3, // radius
    0.82, // threshold — nur echte Emissives überschreiten das
  );
  composer.addPass(bloom);
  // OutputPass wendet Tone-Mapping + sRGB am Ende der Kette an (r150+-Kontrakt).
  composer.addPass(new OutputPass());

  return {
    enabled: false,
    render() {
      composer.render();
    },
    setSize(w: number, h: number) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
  };
}
