import * as THREE from 'three';

import './style.css';

import { BeatTracker } from './audio/beat';
import { AudioEngine } from './audio/engine';
import { buildCharacter, type CharacterInstance } from './character/rig';
import { DT, renderCheeks, stepPhysics } from './character/physics';
import { SKINS } from './character/skins';
import { Choreographer } from './choreo/moves';
import { createControls } from './engine/camera';
import { frameDue } from './engine/frame-clock';
import { ParticleSystem } from './engine/particles';
import { effectivePixelRatio, qualityPreset } from './engine/quality';
import { createScene } from './engine/scene';
import { ascendState, clickDamageOf, createChState, dpsOf } from './game/ch-state';
import { type CombatState, hit, spawnFor, tickBoss } from './game/combat';
import { loadSettings, type Quality, saveSettings } from './game/settings';
import { loadCh, offlineGold, resetCh, saveCh } from './save/ch-store';
import { ChHud, spawnPop } from './ui/ch-hud';
import { ChSettings } from './ui/ch-settings';
import { Crew } from './ui/crew';
import { fmt, titleFor } from './ui/format';
import { Onboarding } from './ui/onboarding';
import { Prestige } from './ui/prestige';
import { Toasts } from './ui/toasts';
import { World } from './world/backgrounds';

/**
 * Booty Clicker — endless (Clicker-Heroes-style) bootstrap.
 * Twerk (click) to damage the current rival; your Crew adds idle DPS; every 5th
 * zone is a timed boss; ascend for Ruhm-Seelen (permanent damage). Pure logic
 * lives in game/*; this file is the DOM/Three/Audio glue + the render loop.
 */

// ---------- click-juice tuning ----------
const CRIT_CHANCE = 0.2;
const CRIT_MULT = 5;
const COMBO_STEP = 0.02;
const COMBO_CAP = 50;
const COMBO_WINDOW_S = 1.5;
const MOVE_SWITCH_CLICKS = 18;

const BG_BY_TIER = ['club', 'synth', 'beach', 'space'] as const;
const bgForZone = (zone: number): (typeof BG_BY_TIER)[number] =>
  BG_BY_TIER[Math.floor((zone - 1) / 10) % BG_BY_TIER.length];

const comboMult = (combo: number): number => 1 + Math.min(combo, COMBO_CAP) * COMBO_STEP;

// ---------- scene / engine ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const { renderer, scene, camera, beat, skyMat, floorMat, glowSprite } = createScene(canvas);
const controls = createControls(camera, renderer.domElement);

const effects = loadSettings();
function applyQuality(q: Quality): void {
  const preset = qualityPreset(q);
  renderer.setPixelRatio(effectivePixelRatio(q, window.devicePixelRatio));
  if (renderer.shadowMap.enabled !== preset.shadows) {
    renderer.shadowMap.enabled = preset.shadows;
    renderer.shadowMap.needsUpdate = true;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mm) => (mm.needsUpdate = true));
      else if (m) (m as THREE.Material).needsUpdate = true;
    });
  }
}
applyQuality(effects.quality);

// ---------- state ----------
let state = createChState();
const loaded = loadCh();
let offlineEarnedMs = 0;
let offlineEarned = 0;
if (loaded) {
  state = loaded.state;
  offlineEarnedMs = Math.max(0, Date.now() - loaded.lastSeen);
}
let combat: CombatState = spawnFor(state.zone, state.killsThisZone, state.runMaxZone);

let dps = 0;
let clickDmg = 1;
function recompute(): void {
  dps = dpsOf(state);
  clickDmg = clickDamageOf(state);
}
recompute();

if (loaded) {
  offlineEarned = offlineGold(dps, combat.zone, offlineEarnedMs);
  state.gold += offlineEarned;
}

// ---------- visuals ----------
const world = new World(scene, skyMat, floorMat, glowSprite);
const audio = new AudioEngine();
const beatTracker = new BeatTracker();
const choreo = new Choreographer();
const char: CharacterInstance = buildCharacter(scene, SKINS.classic);
let currentBg = bgForZone(combat.zone);
world.setBackground(currentBg);
audio.setBackground(currentBg);
choreo.setMove(0);

const hud = new ChHud();
const toasts = new Toasts();
const particles = new ParticleSystem(scene);

// ---------- persistence ----------
let suppressSave = false;
function syncMaxZones(): void {
  state.zone = combat.zone;
  state.killsThisZone = combat.killsThisZone;
  state.runMaxZone = Math.max(state.runMaxZone, combat.maxZone);
  state.lifetimeMaxZone = Math.max(state.lifetimeMaxZone, state.runMaxZone);
}
const persist = (): void => {
  if (suppressSave) return;
  syncMaxZones();
  saveCh(state, Date.now());
};
window.setInterval(persist, 10_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});
window.addEventListener('beforeunload', persist);

// ---------- shop panels ----------
const crew = new Crew({
  state,
  onBuy: () => {
    recompute();
    audio.buy();
    hud.update(state, combat, dps, clickDmg);
    persist();
  },
});

const prestige = new Prestige({
  state,
  getRunMaxZone: () => Math.max(state.runMaxZone, combat.maxZone),
  onAscend: () => {
    syncMaxZones();
    Object.assign(state, ascendState(state)); // mutate in place — panels hold this ref
    combat = spawnFor(1, 0, 1);
    recompute();
    updateBackground(true);
    crew.render();
    hud.update(state, combat, dps, clickDmg);
    toasts.show('✨', 'Ruhm eingeheimst!', `Jetzt ${fmt(state.souls)} Seelen`);
    audio.unlockJingle();
    persist();
  },
});

new ChSettings({
  getState: () => {
    syncMaxZones();
    return state;
  },
  applyImported: (imported) => {
    Object.assign(state, imported); // mutate in place — panels hold this ref
    combat = spawnFor(state.zone, state.killsThisZone, state.runMaxZone);
    recompute();
    updateBackground(true);
    crew.render();
    prestige.refresh();
    hud.update(state, combat, dps, clickDmg);
    persist();
  },
  reset: () => {
    suppressSave = true;
    resetCh();
    window.location.reload();
  },
  effects,
  onGraphicsChange: () => applyQuality(effects.quality),
});

// ---------- welcome back ----------
const welcomeBack = document.getElementById('welcomeBack') as HTMLElement;
document.getElementById('wbClose')?.addEventListener('click', () => {
  welcomeBack.classList.add('hidden');
});
if (offlineEarned >= 1) {
  const mins = Math.floor(offlineEarnedMs / 60_000);
  const dur =
    mins < 1
      ? '< 1 min'
      : mins < 60
        ? `${mins} min`
        : `${Math.floor(mins / 60)} h ${mins % 60} min`;
  (document.getElementById('wbText') as HTMLElement).textContent =
    `Du warst ${dur} weg. Deine Crew hat weitergetwerkt: +${fmt(offlineEarned)} BP (Idle-Rate 50 %, max. 8 h).`;
  welcomeBack.classList.remove('hidden');
}

// ---------- tabs ----------
const tabBodies: Record<string, string> = { crew: 'tabCrew', pr: 'tabPr', set: 'tabSet' };
for (const tab of Array.from(document.querySelectorAll<HTMLElement>('.tab'))) {
  tab.addEventListener('click', () => {
    const key = tab.dataset.t!;
    for (const t of Array.from(document.querySelectorAll('.tab'))) t.classList.remove('active');
    tab.classList.add('active');
    for (const [k, id] of Object.entries(tabBodies)) {
      (document.getElementById(id) as HTMLElement).style.display = k === key ? '' : 'none';
    }
    if (key === 'crew') crew.render();
    if (key === 'pr') prestige.refresh();
  });
}

const shop = document.getElementById('shop') as HTMLElement;
document
  .getElementById('toggleShop')
  ?.addEventListener('click', () => shop.classList.toggle('hidden'));

const muteBtn = document.getElementById('muteBtn') as HTMLButtonElement;
muteBtn.textContent = audio.muted ? '🔇' : '🔊';
muteBtn.addEventListener('click', () => {
  audio.unlock();
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊';
});

// ---------- background follows zone tier ----------
function updateBackground(force = false): void {
  const bg = bgForZone(combat.zone);
  if (force || bg !== currentBg) {
    currentBg = bg;
    world.setBackground(bg);
    audio.setBackground(bg);
  }
}

// ---------- combat glue ----------
const particleTmp = new THREE.Vector3();
let shakeMag = 0;

function onKillProgress(
  r: ReturnType<typeof hit>,
  fromClick: boolean,
  x?: number,
  y?: number,
): void {
  state.gold += r.gold;
  if (r.bossSpawned) {
    toasts.show('👑', 'Boss!', 'Besiege ihn in 30 Sekunden!');
    audio.unlockJingle();
  }
  if (r.advancedZone) {
    if (combat.zone > state.runMaxZone) state.runMaxZone = combat.zone;
    if (fromClick && x !== undefined) spawnPop(`+${fmt(r.gold)}`, x, y ?? 0, 'gold');
    // was the kill a boss? (advanced from a boss target)
    updateBackground();
    if (combat.zone % 5 === 1 && combat.zone > 1) {
      toasts.show('🏆', `Boss besiegt!`, `Bühne ${combat.zone} erreicht`);
      audio.bossWin();
    }
  }
  syncMaxZones();
}

function applyHit(dmg: number, fromClick: boolean, x?: number, y?: number): void {
  const wasBoss = combat.boss;
  const r = hit(combat, dmg);
  combat = r.state;
  if (r.killed) {
    onKillProgress(r, fromClick, x, y);
  } else if (wasBoss && fromClick) {
    audio.bossHit();
  }
}

// ---------- input ----------
let downX = 0;
let downY = 0;
let downT = 0;

function doShake(x?: number, y?: number): void {
  state.totalClicks += 1;
  combo += 1;
  comboTimer = COMBO_WINDOW_S;
  drive = Math.min(drive + 1.2, 6);

  const crit = Math.random() < CRIT_CHANCE;
  const dmg = clickDmg * comboMult(combo) * (crit ? CRIT_MULT : 1);
  const px = x ?? window.innerWidth / 2;
  const py = y ?? window.innerHeight / 2;

  applyHit(dmg, true, px, py);

  char.cheeks.forEach((c) => {
    c.vy += (Math.random() * 2 - 1) * 2.6;
    c.vx += (Math.random() * 2 - 1) * 2.6;
  });
  if (effects.particles) {
    char.rig.pelvis.getWorldPosition(particleTmp);
    particles.burst(particleTmp.x, particleTmp.y, particleTmp.z);
  }
  if (effects.screenShake && (crit || (combo > 0 && combo % 25 === 0))) shakeMag = crit ? 0.5 : 0.3;
  if (++clicksSinceSwitch >= MOVE_SWITCH_CLICKS) {
    clicksSinceSwitch = 0;
    choreo.setMove(choreo.moveIdx + 1);
  }
  spawnPop(`${crit ? 'CRIT ' : ''}-${fmt(dmg)}`, px, py, crit ? 'crit' : '');
  audio.click();
  if (combo > 2 && combo % 5 === 0) audio.combo(combo);
  hud.update(state, combat, dps, clickDmg);
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  downX = e.clientX;
  downY = e.clientY;
  downT = performance.now();
});
canvas.addEventListener('pointerup', (e) => {
  const dist = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
  if (dist <= 10 && performance.now() - downT <= 500) doShake(e.clientX, e.clientY);
});
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return; // B4: no key-repeat autoclicker
    doShake();
  }
});

// ---------- runtime signals ----------
let combo = 0;
let comboTimer = 0;
let drive = 0;
let clicksSinceSwitch = 0;

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

// ---------- onboarding + loading ----------
const loadingEl = document.getElementById('loading');
const onboarding = new Onboarding(() => {
  effects.onboarded = true;
  saveSettings(effects);
});

hud.update(state, combat, dps, clickDmg);

// ---------- loop ----------
const clock = new THREE.Clock();
let acc = 0;
let t0 = 0;
let uiTimer = 0;
let lastRenderMs = 0;
let firstFrame = true;

function loop(nowMs: number): void {
  requestAnimationFrame(loop);
  if (!frameDue(nowMs, lastRenderMs, effects.fpsCap)) return;
  lastRenderMs = nowMs;
  const dt = Math.min(clock.getDelta(), 0.05);
  t0 += dt;

  // Idle DPS chips away at the current target; boss timer ticks down.
  if (dps > 0) applyHit(dps * dt, false);
  if (combat.boss) {
    const bt = tickBoss(combat, dt);
    combat = bt.state;
    if (bt.failed) {
      toasts.show('⏱', 'Zeit um!', 'Farm die Bühne & fordere den Boss erneut.');
      audio.bossLose();
    }
  }

  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
  }
  hud.setCombo(combo);

  // physics
  acc += dt;
  while (acc >= DT) {
    drive = stepPhysics(DT, char.rig, char.cheeks, choreo, drive);
    acc -= DT;
  }
  renderCheeks(char.rig, char.cheeks);
  particles.update(dt);

  const beatV = Math.max(0, Math.sin(choreo.phase * 2.2));
  beat.intensity = beatV * drive * 4;
  if (beatTracker.update(choreo.phase)) audio.beat(0.5 + drive * 0.08);
  world.anims.forEach((a) => a(t0, beatV));

  hud.update(state, combat, dps, clickDmg);

  uiTimer -= dt;
  if (uiTimer <= 0) {
    uiTimer = 0.4;
    document.title = titleFor(state.gold);
    // keep crew affordability + prestige fresh while idling
    const active = document.querySelector('.tab.active') as HTMLElement | null;
    if (active?.dataset.t === 'crew') crew.render();
    else if (active?.dataset.t === 'pr') prestige.refresh();
  }

  controls.update();
  if (shakeMag > 0.001) {
    shakeMag *= Math.pow(0.0009, dt);
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

  if (firstFrame) {
    firstFrame = false;
    loadingEl?.classList.add('hidden');
    if (!effects.onboarded) onboarding.start();
  }
}
requestAnimationFrame(loop);
