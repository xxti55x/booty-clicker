import type * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Fixed stage camera. The view is authored (behind the character: theta = π + 0.3,
 * phi = 1.32, radius = 9.5) and the player cannot move it — no pan, no rotate, no
 * zoom. Dragging on the canvas is reserved entirely for clicking/twerking; only
 * code (screen shake, future cutscene moves) drives the camera.
 */
export function createControls(camera: THREE.PerspectiveCamera, dom: HTMLElement): OrbitControls {
  const theta = Math.PI + 0.3;
  const phi = 1.32;
  const radius = 9.5;
  camera.position.set(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi) + 1.4,
    radius * Math.sin(phi) * Math.cos(theta),
  );

  const controls = new OrbitControls(camera, dom);
  controls.target.set(0, 0.1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableRotate = false;
  controls.enableZoom = false;
  controls.update();
  return controls;
}
