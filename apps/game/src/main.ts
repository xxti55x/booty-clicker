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
import { abilityOnClick, activate, canActivate, frenzyMult, isFrenzyActive } from './game/ability';
import { ascendState, clickDamageOf, createChState, dpsOf } from './game/ch-state';
import {
  beatBonus,
  beatWindowMs,
  critChance,
  effectiveClick,
  isOnBeat,
  phaseVelocity,
  rollCrit,
} from './game/click';
import {
  createCombo,
  comboOnClick,
  comboStep,
  comboTier,
  tierBeatWindowBonusMs,
  tierCritChanceBonus,
  tierCritMultBonus,
} from './game/combo';
import { type CombatState, hit, spawnFor, tickBoss, travelTo } from './game/combat';
import { awardGildOnZone, isGildZone } from './game/gild';
import { CREW } from './game/heroes';
import { shouldShakeOnKey } from './game/input';
import { burstCount, SHAKE_BOSS_KILL, SHAKE_CRIT, SHAKE_FRENZY, shakeForTier } from './game/juice';
import { applyLegacyInheritance } from './game/legacy-import';
import { loadSettings, type Quality, saveSettings } from './game/settings';
import { loadCh, offlineGold, resetCh, saveCh } from './save/ch-store';
import { loadGame } from './save/store';
import { Rng } from './util/rng';
import { AbilityBar } from './ui/ability-bar';
import { ChHud } from './ui/ch-hud';
import { ChSettings } from './ui/ch-settings';
import { Crew } from './ui/crew';
import { Haptics } from './ui/haptics';
import { Pops } from './ui/pops';
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
// Crit/combo math lives in the pure `game/click.ts` core (N2); only the
// choreography cadence stays here as glue.
const MOVE_SWITCH_CLICKS = 18;

const BG_BY_TIER = ['club', 'synth', 'beach', 'space'] as const;
const bgForZone = (zone: number): (typeof BG_BY_TIER)[number] =>
  BG_BY_TIER[Math.floor((zone - 1) / 10) % BG_BY_TIER.length];

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

// „Erbe der alten Tour" — one-time legacy-save inheritance (§9.2.3). Idempotent:
// the `legacyImported` flag (persisted below) guarantees no double bonus.
state = applyLegacyInheritance(state, loadGame());

// Seedable RNG for all gameplay rolls (crit now; loot/quests later). Resumes the
// persisted stream so save-scumming a crit is impossible.
let rng = new Rng(state.rng);

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
  state.stats.goldLifetime += offlineEarned;
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
const pops = new Pops();
const haptics = new Haptics();
const abilityBar = new AbilityBar({ onActivate: () => activateEkstase() });

// Combo-tier → music intensity 0..3 (spec §8.10): T2 percussion, T3 lead-arp,
// T4/Ekstase full + filter-sweep. Called each frame + per click.
function intensityFor(tier: number, frenzy: boolean): number {
  if (frenzy || tier >= 4) return 3;
  if (tier === 3) return 2;
  if (tier === 2) return 1;
  return 0;
}

// ---------- persistence ----------
let suppressSave = false;
function syncMaxZones(): void {
  state.zone = combat.zone;
  state.killsThisZone = combat.killsThisZone;
  state.runMaxZone = Math.max(state.runMaxZone, combat.maxZone);
  state.lifetimeMaxZone = Math.max(state.lifetimeMaxZone, state.runMaxZone);
  state.rsLifetime = Math.max(state.rsLifetime, state.souls); // lifetime-RS highwater (§4.5.2)
  state.rng = rng.toState(); // fold the live RNG cursor back into the save
  state.combo = { stacks: comboState.stacks }; // ability is mutated on state in place
}
const persist = (): void => {
  if (suppressSave) return;
  syncMaxZones();
  saveCh(state, Date.now());
};
window.setInterval(persist, 10_000);

// Tab-return grant (B5): while hidden the rAF loop is paused, so idle earnings
// stall. On return, credit `offlineGold` over the hidden interval (same pure
// accrual as boot-time offline) and show Welcome-Back only for > 60 s away.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    persist();
  } else if (document.visibilityState === 'visible' && hiddenAt > 0) {
    const elapsed = Math.max(0, Date.now() - hiddenAt);
    hiddenAt = 0;
    const grant = offlineGold(dps, combat.zone, elapsed);
    if (grant >= 1) {
      state.gold += grant;
      state.stats.goldLifetime += grant;
      hud.update(state, combat, dps, clickDmg);
      if (elapsed > 60_000) showWelcomeBack(grant, elapsed);
      persist();
    }
  }
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
    comboState = createCombo(state.combo.stacks); // run-scoped juice resets
    recompute();
    updateBackground(true);
    crew.render();
    hud.update(state, combat, dps, clickDmg);
    abilityBar.update(state.ability, Date.now());
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
    rng = new Rng(state.rng); // resume the imported save's RNG stream
    combat = spawnFor(state.zone, state.killsThisZone, state.runMaxZone);
    comboState = createCombo(state.combo.stacks);
    recompute();
    updateBackground(true);
    crew.render();
    prestige.refresh();
    hud.update(state, combat, dps, clickDmg);
    abilityBar.update(state.ability, Date.now());
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
function showWelcomeBack(earned: number, elapsedMs: number): void {
  const mins = Math.floor(elapsedMs / 60_000);
  const dur =
    mins < 1
      ? '< 1 min'
      : mins < 60
        ? `${mins} min`
        : `${Math.floor(mins / 60)} h ${mins % 60} min`;
  (document.getElementById('wbText') as HTMLElement).textContent =
    `Du warst ${dur} weg. Deine Crew hat weitergetwerkt: +${fmt(earned)} BP (Idle-Rate 50 %, max. 8 h).`;
  welcomeBack.classList.remove('hidden');
}
if (offlineEarned >= 1) showWelcomeBack(offlineEarned, offlineEarnedMs);

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

// ---------- farm / travel (G10, §4.4) ----------
// The zone stepper drives the pure `travelTo` (clamped to 1..maxZone). Travelling
// below the frontier lets you farm a cleared zone; the ⏫ button snaps back to it.
function travel(toZone: number): void {
  combat = travelTo(combat, toZone);
  updateBackground();
  syncMaxZones();
  hud.update(state, combat, dps, clickDmg);
  persist();
}
document.getElementById('travelPrev')?.addEventListener('click', () => travel(combat.zone - 1));
document.getElementById('travelNext')?.addEventListener('click', () => travel(combat.zone + 1));
document
  .getElementById('travelFrontier')
  ?.addEventListener('click', () => travel(Math.max(state.runMaxZone, combat.maxZone)));

// ---------- combat glue ----------
const particleTmp = new THREE.Vector3();
let shakeMag = 0;

function onKillProgress(
  r: ReturnType<typeof hit>,
  fromClick: boolean,
  wasBoss: boolean,
  x?: number,
  y?: number,
): void {
  state.gold += r.gold;
  state.stats.goldLifetime += r.gold;
  if (wasBoss) state.stats.bossKills += 1;
  if (r.bossSpawned) {
    toasts.show('👑', 'Boss!', 'Besiege ihn in 30 Sekunden!');
    audio.unlockJingle();
  }
  if (r.advancedZone) {
    // Vergoldung (§4.3.4): the first clear of each 10-zone (10, 20, 30, …) — i.e.
    // advancing past it as a NEW lifetime record — grants a permanent ×1.25 gild to
    // a seeded-random member. `lifetimeMaxZone` is the highwater, so a re-clear after
    // ascension never double-awards. Gilds survive ascension (anti-plateau, P3).
    const clearedZone = combat.zone - 1;
    if (combat.zone > state.lifetimeMaxZone && isGildZone(clearedZone)) {
      const before = state.gilds;
      state.gilds = awardGildOnZone(before, clearedZone, false, rng);
      if (state.gilds !== before) {
        recompute();
        const gildedId = Object.keys(state.gilds).find(
          (id) => (state.gilds[id] ?? 0) > (before[id] ?? 0),
        );
        const name = CREW.find((c) => c.id === gildedId)?.name ?? 'Crew';
        toasts.show('🏅', 'Vergoldung!', `${name} +25% DPS (Bühne ${clearedZone})`);
      }
    }
    if (combat.zone > state.runMaxZone) state.runMaxZone = combat.zone;
    if (fromClick && x !== undefined) pops.gold(r.gold, x, y ?? 0);
    // was the kill a boss? (advanced from a boss target)
    updateBackground();
    if (combat.zone % 5 === 1 && combat.zone > 1) {
      toasts.show('🏆', `Boss besiegt!`, `Bühne ${combat.zone} erreicht`);
      audio.bossWin();
      if (effects.screenShake) shakeMag = Math.max(shakeMag, SHAKE_BOSS_KILL);
      haptics.boss(effects.haptics);
    }
  }
  syncMaxZones();
}

function applyHit(dmg: number, fromClick: boolean, x?: number, y?: number): void {
  const wasBoss = combat.boss;
  const r = hit(combat, dmg);
  combat = r.state;
  if (r.killed) {
    onKillProgress(r, fromClick, wasBoss, x, y);
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
  const now = Date.now();

  // On-beat is judged against the CURRENT tier's (possibly widened) window,
  // before this click bumps the combo.
  const curTier = comboTier(comboState.stacks);
  const onBeat = isOnBeat(
    choreo.phase,
    phaseVelocity(drive),
    beatWindowMs(tierBeatWindowBonusMs(curTier)),
  );

  comboState = comboOnClick(comboState, onBeat);
  drive = Math.min(drive + 1.2, 6);

  const tier = comboTier(comboState.stacks);
  const crit = rollCrit(rng.next(), critChance(tierCritChanceBonus(tier)));
  if (crit) state.stats.crits += 1;
  if (onBeat) state.stats.onBeatClicks += 1;

  // Charge the Ekstase meter (+1, or +2 on-beat) and fold the ×10 frenzy + on-beat
  // ×1.5 into the pure click pipeline. Idle DPS never gets any of this (P1).
  state.ability = abilityOnClick(state.ability, onBeat);
  const dmg = effectiveClick({
    baseClick: clickDmg,
    combo: comboState.stacks,
    crit,
    critMultBonus: tierCritMultBonus(tier),
    extraMult: beatBonus(onBeat) * frenzyMult(state.ability, now),
  });
  const px = x ?? window.innerWidth / 2;
  const py = y ?? window.innerHeight / 2;

  applyHit(dmg, true, px, py);

  char.cheeks.forEach((c) => {
    c.vy += (Math.random() * 2 - 1) * 2.6;
    c.vx += (Math.random() * 2 - 1) * 2.6;
  });
  if (effects.particles) {
    char.rig.pelvis.getWorldPosition(particleTmp);
    particles.burst(particleTmp.x, particleTmp.y, particleTmp.z, burstCount(tier));
  }
  if (effects.screenShake) {
    let mag = shakeForTier(tier);
    if (crit) mag = Math.max(mag, SHAKE_CRIT);
    if (isFrenzyActive(state.ability, now)) mag = Math.max(mag, SHAKE_FRENZY);
    if (mag > 0) shakeMag = Math.max(shakeMag, mag);
  }
  haptics.pulse(now, effects.haptics, crit);
  if (++clicksSinceSwitch >= MOVE_SWITCH_CLICKS) {
    clicksSinceSwitch = 0;
    choreo.setMove(choreo.moveIdx + 1);
  }
  pops.damage({ value: dmg, crit, onBeat, x: px, y: py }, now);
  audio.click();
  const stacks = Math.floor(comboState.stacks);
  if (stacks > 2 && stacks % 5 === 0) audio.combo(stacks);
  audio.setIntensity(intensityFor(tier, isFrenzyActive(state.ability, now)));
  hud.update(state, combat, dps, clickDmg);
  hud.setCombo(comboState.stacks, tier);
  abilityBar.update(state.ability, now);
}

/** Fire Twerk-Ekstase (spec §4.2.4): 12 s of ×10 click damage when the meter's full. */
function activateEkstase(): void {
  audio.unlock();
  const now = Date.now();
  if (!canActivate(state.ability)) return;
  state.ability = activate(state.ability, now);
  audio.unlockJingle();
  audio.setIntensity(3);
  toasts.show('🍑', 'TWERK-EKSTASE!', '×10 Klick-Schaden für 12 Sekunden!');
  if (effects.screenShake) shakeMag = Math.max(shakeMag, SHAKE_FRENZY);
  haptics.boss(effects.haptics);
  abilityBar.update(state.ability, now);
  persist();
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
  if (e.code === 'Space') e.preventDefault();
  // shouldShakeOnKey guards B4: a held (auto-repeating) space is not an autoclicker.
  if (shouldShakeOnKey(e.code, e.repeat)) doShake();
  if (e.code === 'KeyF' && !e.repeat) activateEkstase();
});

// ---------- runtime signals ----------
let comboState = createCombo(state.combo.stacks);
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

// Persist once at boot so the legacy import (souls + legacyImported) and any
// offline grant are locked in even if the tab closes before the first autosave.
persist();

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
  state.stats.playTimeS += dt;

  // Idle DPS chips away at the current target; boss timer ticks down.
  if (dps > 0) applyHit(dps * dt, false);
  if (combat.boss) {
    const bt = tickBoss(combat, dt);
    combat = bt.state;
    if (bt.failed) {
      state.stats.bossTimeouts += 1;
      toasts.show('⏱', 'Zeit um!', 'Farm die Bühne & fordere den Boss erneut.');
      audio.bossLose();
    }
  }

  // Combo soft-decay (§4.2.2) + tier-driven juice (music/ability bar), each frame.
  comboState = comboStep(comboState, dt);
  const epochMs = Date.now();
  const tier = comboTier(comboState.stacks);
  const frenzy = isFrenzyActive(state.ability, epochMs);
  hud.setCombo(comboState.stacks, tier);
  audio.setIntensity(intensityFor(tier, frenzy));
  abilityBar.update(state.ability, epochMs);
  pops.frame(epochMs); // flush any trailing damage batch (B7)

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

  // HUD-throttle (B7): the moving HP bar / boss timer refresh cheaply per frame;
  // the full text HUD only rebuilds on the 0.25 s tick (or discrete events).
  hud.frame(combat);

  uiTimer -= dt;
  if (uiTimer <= 0) {
    uiTimer = 0.25;
    document.title = titleFor(state.gold);
    hud.update(state, combat, dps, clickDmg);
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
