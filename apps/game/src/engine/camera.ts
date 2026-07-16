import type * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Replace the prototype's hand-rolled orbit with Three's OrbitControls, keeping
 * the same framing and limits (spec §5 M0):
 *  - initial view behind the character (theta = π + 0.3, phi = 1.32, radius = 9.5)
 *  - zoom clamp 5..24, polar clamp 0.4..2.3.
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
  controls.minDistance = 5;
  controls.maxDistance = 24;
  controls.minPolarAngle = 0.4;
  controls.maxPolarAngle = 2.3;
  controls.update();
  return controls;
}
