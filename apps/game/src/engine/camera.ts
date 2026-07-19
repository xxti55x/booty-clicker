import type * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Fixed diorama camera (goal: Insel-POV wie ein Casual-Idle, nicht die zentrierte
 * 3D-Nahansicht). Erhöhter Blick (~29° Elevation) auf die schwebende Insel. The
 * player cannot move it — no pan, no rotate, no zoom. Dragging on the canvas is
 * reserved entirely for clicking/twerking; only code (screen shake) drives it.
 */
const THETA = Math.PI + 0.3;
const PHI = 1.07;

/** Insel-Zentrum (scene.ts ISLAND_C) + Blickhöhe zwischen Fläche und Köpfen. */
const ISLE = { x: 1.4, y: -1.15, z: 1.7 };
/** Horizontale Halb-Ausdehnung, die sichtbar sein muss (Insel-R 6.4 + Rand). */
const FIT_R = 7.4;
/** Füllgrad der rechten Fensterhälfte (Rest = Luft zum Panel/Fensterrand). */
const FIT_FILL = 0.92;
/** Vertikale Halb-Ausdehnung (Fels-Zapfen unten … Charakter-Köpfe + Luft oben). */
const FIT_V = 6.2;

/**
 * Aspect-abhängiges Diorama-Framing (vom Resize-Handler aufgerufen):
 *
 * · Landscape/Desktop (50/50-Layout): Das Spiel belegt die RECHTE Fensterhälfte
 *   — die Insel wird in DEREN Mitte zentriert, nicht in der Fenstermitte. Dazu
 *   rendert `setViewOffset` eine 1.5×-breite virtuelle Ansicht, deren Zentrum
 *   bei 75 % der Fensterbreite liegt: die Kamera schaut GERADE auf die Insel
 *   (kein Aim-Offset-Skew), die Projektion verschiebt sie in die Halbraum-Mitte.
 *   Die Distanz wird so gewählt, dass die GANZE Insel (Ø 2·FIT_R) in die
 *   Halbbreite passt (und FIT_V in die Höhe).
 *
 * · Portrait/Mobil: kein Halbraum (der Shop ist ein Bottom-Sheet) — klassische
 *   zentrierte Nah-Einstellung auf das Duo.
 */
export function frameCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  aspect: number,
): void {
  const portrait = aspect < 1;
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  let radius: number;
  let target: { x: number; y: number; z: number };
  if (portrait) {
    camera.clearViewOffset();
    camera.aspect = aspect;
    radius = 19;
    target = { x: 1.4, y: -1.3, z: 1.5 };
  } else {
    // Virtuelle Ansicht = 1.5 Fensterbreiten, Fenster zeigt die linken 2/3 —
    // das virtuelle Zentrum (= Projektionsort der Insel) landet bei 0.75·w.
    camera.aspect = aspect * 1.5;
    camera.setViewOffset(aspect * 1.5, 1, 0, 0, aspect, 1);
    // Die rechte Fensterhälfte fasst bei Distanz D die Weltbreite D·tanV·aspect;
    // der Insel-Ø 2·FIT_R muss mit Füllgrad hineinpassen (Höhe analog FIT_V).
    radius = Math.max(FIT_V / tanV, (2 * FIT_R) / (FIT_FILL * tanV * aspect));
    target = ISLE;
  }
  camera.position.set(
    target.x + radius * Math.sin(PHI) * Math.sin(THETA),
    target.y + radius * Math.cos(PHI),
    target.z + radius * Math.sin(PHI) * Math.cos(THETA),
  );
  camera.updateProjectionMatrix();
  controls.target.set(target.x, target.y, target.z);
  controls.update();
}

export function createControls(camera: THREE.PerspectiveCamera, dom: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, dom);
  frameCamera(camera, controls, window.innerWidth / Math.max(1, window.innerHeight));
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableRotate = false;
  controls.enableZoom = false;
  controls.update();
  return controls;
}
