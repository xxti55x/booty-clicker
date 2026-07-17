import * as THREE from 'three';

import './style.css';

import { BeatTracker } from './audio/beat';
import { AudioEngine } from './audio/engine';
import { buildCharacter, type CharacterInstance } from './character/rig';
import { DT, renderCheeks, stepPhysics } from './character/physics';
import { SKINS } from './character/skins';
import { Choreographer } from './choreo/moves';
import { createControls } from './engine/camera';
import { ParticleSystem } from './engine/particles';
import { createScene } from './engine/scene';
import { buildAchievementCtx, newlyUnlocked } from './game/achievements';
import { COMBO_WINDOW_S, clickGain, createUpgrades, passiveGain } from './game/economy';
import { activateBoost, incomeMultiplier, PEACH_VISIBLE_S, rollNextPeachAt } from './game/events';
import { applyRebirth, BOSS_UNLOCK_BP } from './game/progression';
import { loadSettings } from './game/settings';
import { createGameState, createRuntimeState } from './game/state';
import { applySave, computeOfflineEarnings, loadGame, resetSave, saveGame } from './save/store';
import { AchievementsUI } from './ui/achievements';
import { BossFight } from './ui/boss';
import { Leaderboard } from './ui/leaderboard';
import { fmt } from './ui/format';
import { Hud } from './ui/hud';
import { Settings } from './ui/settings';
import { Shop } from './ui/shop';
import { Toasts } from './ui/toasts';
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

const loaded = loadGame();
let offlineEarnedMs = 0;
let offlineEarned = 0;
if (loaded) {
  applySave(loaded, state, upgrades);
  offlineEarnedMs = Math.max(0, Date.now() - loaded.lastSeen);
  offlineEarned = computeOfflineEarnings(offlineEarnedMs, state.perSec, state.mult);
  state.bp += offlineEarned;
}
if (state.nextPeachAt === 0) state.nextPeachAt = rollNextPeachAt(Date.now());
const effects = loadSettings();

const hud = new Hud();
const choreo = new Choreographer();
choreo.onMove = (name) => hud.setMoveName(name);

const world = new World(scene, skyMat, floorMat, glowSprite);
const audio = new AudioEngine();
const beatTracker = new BeatTracker();

let char: CharacterInstance = buildCharacter(scene, SKINS[state.skin]);

const shop = new Shop({
  state,
  upgrades,
  onPurchase: () => {
    hud.update(state);
    audio.buy();
    checkAchievements();
  },
  rebuildCharacter: (key) => {
    char = buildCharacter(scene, SKINS[key], char);
  },
  setBackground: (key) => {
    world.setBackground(key);
    audio.setBackground(key);
  },
});

world.setBackground(state.bg);
audio.setBackground(state.bg);
choreo.setMove(0);
hud.update(state);

const toasts = new Toasts();
const achUI = new AchievementsUI(state);
const particles = new ParticleSystem(scene);
const leaderboard = new Leaderboard();

// ---------- persistence ----------
let suppressSave = false;
const persist = (): void => {
  if (!suppressSave) saveGame(state, upgrades);
};
window.setInterval(persist, 10_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});
window.addEventListener('beforeunload', persist);

const settings = new Settings({
  state,
  upgrades,
  applyImported: (save) => {
    applySave(save, state, upgrades);
    char = buildCharacter(scene, SKINS[state.skin], char);
    world.setBackground(state.bg);
    audio.setBackground(state.bg);
    shop.renderUpgrades();
    shop.renderSkins();
    shop.renderBgs();
    hud.update(state);
    persist();
    syncEndgameUi();
  },
  reset: () => {
    suppressSave = true;
    resetSave();
    window.location.reload();
  },
  rebirth: () => {
    applyRebirth(state, upgrades);
    shop.renderUpgrades();
    shop.renderSkins();
    shop.renderBgs();
    hud.update(state);
    persist();
    syncEndgameUi();
    checkAchievements();
  },
  effects,
  showLeaderboard: () => void leaderboard.openTop(),
});
if (offlineEarned >= 1) settings.showWelcomeBack(offlineEarnedMs, offlineEarned);

// ---------- boss fight ----------
let bossInst: CharacterInstance | null = null;
function spawnBossRig(): void {
  if (bossInst) return;
  bossInst = buildCharacter(scene, SKINS.boss);
  const offX = 3.2;
  const offZ = 1.2;
  bossInst.rig.root.position.x += offX;
  bossInst.rig.root.position.z += offZ;
  bossInst.rig.root.rotation.y = -Math.PI * 0.72; // angle toward the player
  for (const c of bossInst.cheeks) {
    c.x += offX;
    c.z += offZ;
    c.g.position.set(c.x, c.y, c.z);
  }
}
function removeBossRig(): void {
  if (!bossInst) return;
  scene.remove(bossInst.rig.root);
  bossInst.cheeks.forEach((c) => scene.remove(c.g));
  bossInst = null;
}

const bossFight = new BossFight({
  getStats: () => ({ perClick: state.perClick, mult: state.mult }),
  onSpawn: spawnBossRig,
  onDespawn: removeBossRig,
  onHit: (dmg) => {
    hud.spawnPop(`-${fmt(dmg)}`);
    audio.bossHit();
  },
  onWin: (bestTimeS) => {
    state.bossDefeated = true;
    state.unlocked.boss = true;
    shop.renderSkins();
    hud.update(state);
    persist();
    syncEndgameUi();
    audio.bossWin();
    checkAchievements();
    leaderboard.promptSubmit(bestTimeS);
  },
  onLose: () => audio.bossLose(),
  onExit: () => {
    hud.update(state);
    syncEndgameUi();
  },
});

const bossStartBtn = document.getElementById('bossStart') as HTMLButtonElement;
bossStartBtn.addEventListener('click', () => {
  if (!bossFight.engaged) bossFight.start(0);
});

const muteBtn = document.getElementById('muteBtn') as HTMLButtonElement;
muteBtn.textContent = audio.muted ? '🔇' : '🔊';
muteBtn.addEventListener('click', () => {
  audio.unlock();
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊';
});

/** Refresh milestone-driven UI: content-gate reveals, rebirth eligibility, boss button. */
function syncEndgameUi(): void {
  if (shop.syncReveals()) audio.unlockJingle();
  settings.refresh();
  const canBoss = state.maxBp >= BOSS_UNLOCK_BP && !bossFight.engaged;
  bossStartBtn.classList.toggle('hidden', !canBoss);
}
syncEndgameUi();

// ---------- achievements, particles, peach event ----------
const particleTmp = new THREE.Vector3();
let shakeMag = 0;

function checkAchievements(): void {
  const ctx = buildAchievementCtx(state, upgrades);
  const already = new Set(state.achievements);
  const fresh = newlyUnlocked(ctx, already);
  if (fresh.length === 0) return;
  for (const a of fresh) {
    state.achievements.push(a.id);
    toasts.show(a.icon, a.name, a.desc);
  }
  achUI.render();
  persist();
}

const peachBtn = document.getElementById('peach') as HTMLButtonElement;
const boostBadge = document.getElementById('boostBadge') as HTMLElement;
let peachVisible = false;
let peachHideAt = 0;

function showPeach(now: number): void {
  peachVisible = true;
  peachHideAt = now + PEACH_VISIBLE_S * 1000;
  peachBtn.style.left = `${80 + Math.random() * Math.max(40, window.innerWidth - 200)}px`;
  peachBtn.style.top = `${120 + Math.random() * Math.max(40, window.innerHeight - 320)}px`;
  peachBtn.classList.remove('hidden');
}
function hidePeach(): void {
  peachVisible = false;
  peachBtn.classList.add('hidden');
}
function updatePeach(now: number): void {
  if (!peachVisible && now >= state.nextPeachAt && !bossFight.engaged) {
    showPeach(now);
  } else if (peachVisible && now >= peachHideAt) {
    hidePeach();
    state.nextPeachAt = rollNextPeachAt(now);
    persist();
  }
}
peachBtn.addEventListener('click', () => {
  const now = Date.now();
  state.boostUntil = activateBoost(now);
  state.peachesClicked += 1;
  hidePeach();
  state.nextPeachAt = rollNextPeachAt(now);
  audio.unlockJingle();
  persist();
  checkAchievements();
});

// ---------- input ----------
function doShake(cx?: number, cy?: number): void {
  if (bossFight.engaged) {
    bossFight.hit();
    return;
  }
  const gain =
    clickGain(state.perClick, state.mult, runtime.combo) *
    incomeMultiplier(state.boostUntil, Date.now());
  state.bp += gain;
  runtime.combo++;
  state.totalClicks += 1;
  if (runtime.combo > state.maxCombo) state.maxCombo = runtime.combo;
  runtime.comboTimer = COMBO_WINDOW_S;
  runtime.drive = Math.min(runtime.drive + 1.2, 6);
  char.cheeks.forEach((c) => {
    c.vy += (Math.random() * 2 - 1) * 2.6;
    c.vx += (Math.random() * 2 - 1) * 2.6;
  });
  if (effects.particles) {
    char.rig.pelvis.getWorldPosition(particleTmp);
    particles.burst(particleTmp.x, particleTmp.y, particleTmp.z);
  }
  if (effects.screenShake && runtime.combo > 0 && runtime.combo % 25 === 0) shakeMag = 0.35;
  if (++runtime.clicksSinceSwitch >= 18) {
    runtime.clicksSinceSwitch = 0;
    choreo.setMove(choreo.moveIdx + 1);
  }
  hud.spawnPop('+' + fmt(gain), cx, cy);
  shop.renderUpgrades();
  audio.click();
  if (runtime.combo > 2 && runtime.combo % 5 === 0) audio.combo(runtime.combo);
  checkAchievements();
}

// A pointer that moved past a small threshold is an orbit drag, not a shake.
let downX = 0;
let downY = 0;
let moved = false;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
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
  audio.unlock();
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
let uiTimer = 0;
function loop(): void {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  t0 += dt;
  if (!bossFight.engaged) {
    state.bp +=
      passiveGain(state.perSec, state.mult, dt) * incomeMultiplier(state.boostUntil, Date.now());
  }
  if (state.bp > state.maxBp) state.maxBp = state.bp;
  bossFight.update(dt);
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
  particles.update(dt);
  const beatV = Math.max(0, Math.sin(choreo.phase * 2.2));
  beat.intensity = beatV * runtime.drive * 4;
  if (beatTracker.update(choreo.phase)) audio.beat(0.5 + runtime.drive * 0.08);
  world.anims.forEach((a) => a(t0, beatV));
  hud.update(state);

  // Throttled UI: reveals, rebirth eligibility, boss button, achievements, peach.
  uiTimer -= dt;
  if (uiTimer <= 0) {
    uiTimer = 0.25;
    const now = Date.now();
    syncEndgameUi();
    checkAchievements();
    updatePeach(now);
    boostBadge.classList.toggle('hidden', incomeMultiplier(state.boostUntil, now) <= 1);
  }

  controls.update();
  if (shakeMag > 0.001) {
    shakeMag *= Math.pow(0.0009, dt); // fast decay
    const ox = (Math.random() * 2 - 1) * shakeMag;
    const oy = (Math.random() * 2 - 1) * shakeMag;
    camera.position.x += ox;
    camera.position.y += oy;
    renderer.render(scene, camera);
    camera.position.x -= ox;
    camera.position.y -= oy;
  } else {
    shakeMag = 0;
    renderer.render(scene, camera);
  }
}
loop();
