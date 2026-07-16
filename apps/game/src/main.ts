import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { UPGRADES, upgradeCost } from './game/economy';

/**
 * M0 bootstrap placeholder.
 *
 * This proves the toolchain end-to-end: Three.js (npm, not CDN), OrbitControls
 * from `three/examples`, and the data-driven `economy` module all compile and
 * run under Vite + strict TypeScript. The full port of the legacy prototype
 * (rig, choreography, spring-damper physics, skins, backgrounds, shop, HUD)
 * replaces the scene below without touching the build pipeline.
 *
 * Reference implementation: ../../../legacy/index.html
 */

const canvas = document.getElementById('app') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b16);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 2, 8);

// Custom orbit rig from the prototype is replaced by OrbitControls (zoom 5–24).
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 5;
controls.maxDistance = 24;
controls.target.set(0, 1, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(4, 8, 6);
scene.add(key);

const placeholder = new THREE.Mesh(
  new THREE.SphereGeometry(1.2, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0xff8a5c, roughness: 0.5, metalness: 0.1 }),
);
placeholder.position.y = 1;
scene.add(placeholder);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function loop(): void {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  placeholder.rotation.y += dt * 0.6;
  controls.update();
  renderer.render(scene, camera);
}
loop();

// Smoke-check the economy module wiring (dev console only).
if (import.meta.env.DEV) {
  const first = UPGRADES[0];
  if (first) {
    console.info(`[economy] "${first.name}" base cost = ${upgradeCost(first)} BP`);
  }
}
