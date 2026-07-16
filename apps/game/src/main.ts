import * as THREE from 'three';

import './style.css';

import { buildCharacter, type CharacterInstance } from './character/rig';
import { DT, renderCheeks, stepPhysics } from './character/physics';
import { SKINS } from './character/skins';
import { Choreographer } from './choreo/moves';
import { createControls } from './engine/camera';
import { createScene } from './engine/scene';
import { COMBO_WINDOW_S, clickGain, createUpgrades, passiveGain } from './game/economy';
import { createGameState, createRuntimeState } from './game/state';
import { fmt } from './ui/format';
import { Hud } from './ui/hud';
import { Shop } from './ui/shop';
import { World } from './world/backgrounds';

/**
 * Booty Clicker bootstrap. Wires the ported modules together and runs the loop.
 * Reference implementation: ../../../legacy/index.html (behaviour preserved).
 */

const canvas = document.getElementById('app') as HTMLCanvasElement;

const { renderer, scene, camera, beat, skyMat, floorMat, glowSprite } = createScene(canvas);
const controls = createControls(camera, renderer.domElement);

const state = createGameState();
const runtime = createRuntimeState();
const upgrades = createUpgrades();

const hud = new Hud();
const choreo = new Choreographer();
choreo.onMove = (name) => hud.setMoveName(name);

const world = new World(scene, skyMat, floorMat, glowSprite);

let char: CharacterInstance = buildCharacter(scene, SKINS[state.skin]);

const shop = new Shop({
  state,
  upgrades,
  onPurchase: () => hud.update(state),
  rebuildCharacter: (key) => {
    char = buildCharacter(scene, SKINS[key], char);
  },
  setBackground: (key) => world.setBackground(key),
});

world.setBackground(state.bg);
choreo.setMove(0);
hud.update(state);

// ---------- input ----------
function doShake(cx?: number, cy?: number): void {
  const gain = clickGain(state.perClick, state.mult, runtime.combo);
  state.bp += gain;
  runtime.combo++;
  runtime.comboTimer = COMBO_WINDOW_S;
  runtime.drive = Math.min(runtime.drive + 1.2, 6);
  char.cheeks.forEach((c) => {
    c.vy += (Math.random() * 2 - 1) * 2.6;
    c.vx += (Math.random() * 2 - 1) * 2.6;
  });
  if (++runtime.clicksSinceSwitch >= 18) {
    runtime.clicksSinceSwitch = 0;
    choreo.setMove(choreo.moveIdx + 1);
  }
  hud.spawnPop('+' + fmt(gain), cx, cy);
  shop.renderUpgrades();
}

// A pointer that moved past a small threshold is an orbit drag, not a shake.
let downX = 0;
let downY = 0;
let moved = false;
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
  moved = false;
});
window.addEventListener('pointermove', (e) => {
  if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 4) moved = true;
});
canvas.addEventListener('click', (e) => {
  if (moved) return;
  doShake(e.clientX, e.clientY);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    doShake();
  }
});

// ---------- resize ----------
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- loop ----------
const clock = new THREE.Clock();
let acc = 0;
let t0 = 0;
function loop(): void {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  t0 += dt;
  state.bp += passiveGain(state.perSec, state.mult, dt);
  if (runtime.comboTimer > 0) {
    runtime.comboTimer -= dt;
    if (runtime.comboTimer <= 0) runtime.combo = 0;
  }
  hud.setCombo(runtime.combo);
  acc += dt;
  while (acc >= DT) {
    runtime.drive = stepPhysics(DT, char.rig, char.cheeks, choreo, runtime.drive);
    acc -= DT;
  }
  renderCheeks(char.rig, char.cheeks);
  const beatV = Math.max(0, Math.sin(choreo.phase * 2.2));
  beat.intensity = beatV * runtime.drive * 4;
  world.anims.forEach((a) => a(t0, beatV));
  hud.update(state);
  controls.update();
  renderer.render(scene, camera);
}
loop();
