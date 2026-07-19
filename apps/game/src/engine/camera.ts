import type * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Fixed diorama camera (goal: Insel-POV wie ein Casual-Idle, nicht die zentrierte
 * 3D-Nahansicht). Erhöhter Blick (~32° Elevation) aus größerer Distanz auf die
 * schwebende Insel; das Ziel liegt ZWISCHEN Spieler (Ursprung) und Rivale
 * (ENTITY_STAGE ≈ x 3.5 / z 4.4), sodass beide im Bild stehen. The player cannot
 * move it — no pan, no rotate, no zoom. Dragging on the canvas is reserved
 * entirely for clicking/twerking; only code (screen shake) drives the camera.
 */
const THETA = Math.PI + 0.3;
const PHI = 1.07;

/**
 * Aspect-abhängiges Diorama-Framing (vom Resize-Handler aufgerufen):
 * · Landscape/Desktop: target.x nach +x versetzt — das schiebt die Insel in
 *   die RECHTE Fensterhälfte (der Upgrade-Shop belegt links 50 %).
 * · Portrait/Mobil: enges H-FOV — Duo zentrieren, weiter zurückziehen; die
 *   Insel füllt das untere Band, beide Akteure bleiben im Bild.
 */
export function frameCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  aspect: number,
): void {
  const portrait = aspect < 1;
  // Portrait: der sichtbare Streifen zwischen HUD und Bottom-Sheet ist klein —
  // hier gilt die NAHE Duo-Einstellung (Insel-Totale ist Landscape/Desktop).
  const radius = portrait ? 19 : 38;
  const target = portrait ? { x: 1.4, y: -1.3, z: 1.5 } : { x: 6.4, y: -1.5, z: 3.2 };
  camera.position.set(
    target.x + radius * Math.sin(PHI) * Math.sin(THETA),
    target.y + radius * Math.cos(PHI),
    target.z + radius * Math.sin(PHI) * Math.cos(THETA),
  );
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
