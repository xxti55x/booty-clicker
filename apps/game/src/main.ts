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
import {
  ABILITY_CHARGE_MAX,
  FRENZY_DURATION_MS,
  abilityOnClick,
  activate,
  canActivate,
  frenzyMult,
  isFrenzyActive,
} from './game/ability';
import {
  ancientBeatWindowBonusMs,
  ancientBossDmgMult,
  ancientBossTimerBonus,
  ancientComboWindowBonus,
  ancientCritChanceBonus,
  ancientEkstaseChargeReduction,
} from './game/ancients';
import {
  ascendState,
  chestLuck,
  clickDamageOf,
  createChState,
  dpsOf,
  goldMult,
  himmelfahrtState,
  keyDropAmount,
  keyDropMult,
  peachIncomeMult,
  rivalChestChance,
} from './game/ch-state';
import {
  CHEST_TIERS,
  type ChestTier,
  type Reward,
  KEY_COST,
  addToken,
  chestTierForBoss,
  openChest,
  permTokenCritChance,
  permTokenCritMult,
  resolveDuplicate,
} from './game/chests';
import {
  PEACH_BOOST_S,
  PEACH_MAX_S,
  PEACH_VISIBLE_S,
  activateBoost,
  peachKeyRoll,
  rollNextPeachAt,
} from './game/peach';
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
  COMBO_WINDOW_S,
  createCombo,
  comboOnClick,
  comboStep,
  comboTier,
  tierBeatWindowBonusMs,
  tierCritChanceBonus,
  tierCritMultBonus,
} from './game/combo';
import {
  type CombatState,
  goldFor,
  hit,
  monsterHp,
  spawnFor,
  tickBoss,
  travelTo,
} from './game/combat';
import {
  accrueSugar,
  beatWindowBonus,
  bossDmgMult,
  bossShardReward,
  bossTimerBonus,
  coachCpsBonus,
  comboDecayReduction,
  comboWindowBonus,
  critChanceBonus,
  critMultBonus,
  frenzyChargeReduction,
  frenzyDurBonus,
  frenzyDurSecBonus,
  offlineCapBonus,
  offlineRateBonus,
  onBeatMultBonus,
  SUGAR_PERIOD_MS,
} from './game/gear';
import { awardGildOnZone, isGildZone } from './game/gild';
import {
  buyTreeNode,
  coachCps,
  coachDps,
  ekstaseBonusMs,
  fruhstarterFraction,
  offlineCapS,
} from './game/heaven';
import { CREW, type CrewLevels } from './game/heroes';
import { shouldShakeOnKey } from './game/input';
import { burstCount, SHAKE_BOSS_KILL, SHAKE_CRIT, SHAKE_FRENZY, shakeForTier } from './game/juice';
import { applyLegacyInheritance } from './game/legacy-import';
import { loadSettings, type Quality, saveSettings } from './game/settings';
import { loadCh, offlineGold, resetCh, saveCh } from './save/ch-store';
import { loadGame } from './save/store';
import { Rng } from './util/rng';
import { AbilityBar } from './ui/ability-bar';
import { Ancients } from './ui/ancients';
import { ChHud } from './ui/ch-hud';
import { ChSettings } from './ui/ch-settings';
import { Chests } from './ui/chest-panel';
import { Crew } from './ui/crew';
import { Gear } from './ui/gear-panel';
import { Heaven } from './ui/heaven-panel';
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
const legacySave = loadGame();
state = applyLegacyInheritance(state, legacySave);
// Redeem the Tyrann-skin claim even for players who already ran the one-time import
// during M7–M10 (their `legacyImported` is already true, so the line above no-ops):
// the archived legacy save is re-read every boot, so a `bossDefeated` tour latches
// the persisted flag here too. A boolean latch — idempotent, self-healing.
if (legacySave?.bossDefeated === true) state.legacyTyrann = true;

// Seed the first Zuckerpfirsich to ripen 24 h after first play (§5.4); a migrated
// or fresh gear slice arrives with `nextSugarAt: 0` (unseeded).
if (state.gear.nextSugarAt === 0) state.gear.nextSugarAt = Date.now() + SUGAR_PERIOD_MS;

// Seedable RNG for all gameplay rolls (crit, loot, peach schedule). Resumes the
// persisted stream so save-scumming a crit or a chest open is impossible.
let rng = new Rng(state.rng);

// Seed / repair the Golden-Peach schedule (§6.1). A fresh or migrated slice arrives
// unseeded (`nextPeachAt: 0`); an absurd-future timestamp (clock set forward, then
// back) is re-rolled — the same clamp spirit as the sugar timer (§9.2.2). A stale
// far-future boost is cleared. A recent-past `nextPeachAt` is left as-is: the loop's
// despawn check reschedules it on the first frame.
{
  const bootNow = Date.now();
  if (state.peach.nextPeachAt <= 0 || state.peach.nextPeachAt > bootNow + PEACH_MAX_S * 1000) {
    state.peach.nextPeachAt = rollNextPeachAt(bootNow, rng);
  }
  if (state.peach.boostUntil > bootNow + PEACH_BOOST_S * 1000) state.peach.boostUntil = 0;
}

let combat: CombatState = spawnFor(state.zone, state.killsThisZone, state.runMaxZone);

/** Extend a freshly-spawned boss timer by Chronilla + gear bossTimer (§4.6/§5). No-op off-boss. */
function withBossTimerBonus(c: CombatState): CombatState {
  const bonus = ancientBossTimerBonus(state.ancients) + bossTimerBonus(state.gear);
  return c.boss && bonus > 0 ? { ...c, bossTimer: c.bossTimer + bonus } : c;
}
combat = withBossTimerBonus(combat);

let dps = 0;
let clickDmg = 1;
function recompute(): void {
  dps = dpsOf(state);
  clickDmg = clickDamageOf(state);
}
recompute();

/**
 * Effective Ekstase charge threshold, lowered by Ekstasius (§4.6) + Gyrator gear
 * charge-reduction (§5). The combined reduction is clamped below 1 so a full
 * Diamant `allPct` fold can never drive the meter to zero (≥ 10 charge always).
 */
function ekstaseChargeMax(): number {
  const reduction = Math.min(
    0.9,
    ancientEkstaseChargeReduction(state.ancients) + frenzyChargeReduction(state.gear),
  );
  return ABILITY_CHARGE_MAX * (1 - reduction);
}

// Offline accrual folds in the Twerk-Coach (25 % of click value × cps) + Robo gear
// cps, the Nachtschicht-raised cap + Beach gear cap, Peachiel × gold-gear mult, and
// the Endless-Summer offline-rate bump (§4.3.5/§4.5.2/§5) — the same kills as live
// play, so click-heavy/crewless builds earn consistently too.
function offlineOpts(): {
  clickDmg: number;
  coachCps: number;
  capS: number;
  goldMult: number;
  rateBonus: number;
} {
  return {
    clickDmg,
    coachCps: coachCps(state.heaven) + coachCpsBonus(state.gear),
    capS: offlineCapS(state.heaven) + offlineCapBonus(state.gear),
    // Peachiel × gold-gear × permanent gold-tokens (§6.2). The transient peach ×3
    // boost is a 60-s live event — immaterial to multi-hour offline accrual and a
    // stale boostUntil would be wrong — so it is deliberately excluded here.
    goldMult: goldMult(state),
    rateBonus: offlineRateBonus(state.gear),
  };
}
if (loaded) {
  offlineEarned = offlineGold(dps, combat.zone, offlineEarnedMs, offlineOpts());
  state.gold += offlineEarned;
  state.stats.goldLifetime += offlineEarned;
}

// ---------- visuals ----------
const world = new World(scene, skyMat, floorMat, glowSprite);
const audio = new AudioEngine();
const beatTracker = new BeatTracker();
const choreo = new Choreographer();
// The equipped skin drives the 3D rig now (§5) — no longer always classic.
let char: CharacterInstance = buildCharacter(scene, SKINS[state.gear.skin]);
// Kulisse (§5.5): in Tour-Modus (`bgAuto`) the background rotates with the zone tier;
// otherwise the manually chosen `gear.bg` is fixed. Keep `gear.bg` in lockstep with
// what's on screen so the kulisse mini-buff + set detection match the view.
let currentBg = state.gear.bgAuto ? bgForZone(combat.zone) : state.gear.bg;
if (state.gear.bgAuto) state.gear.bg = currentBg;
world.setBackground(currentBg);
audio.setBackground(currentBg);
recompute(); // fold the (possibly view-synced) kulisse buff into the derived numbers
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
  // Never-resetting deepest-zone latch: keeps skin unlocks one-way across a
  // Himmelfahrt (which drops lifetimeMaxZone to 1, §4.5.2/§5.3).
  state.gear.zoneEver = Math.max(state.gear.zoneEver, state.lifetimeMaxZone);
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
    const grant = offlineGold(dps, combat.zone, elapsed, offlineOpts());
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

// 🎽 Gear/Skins (§5): equipping rebuilds the 3D rig for the new skin and re-folds
// the gear buff into click/DPS immediately (AC1); levelling/starring/crafting re-fold
// too; the kulisse chooser drives the background + auto-rotation toggle.
const gearPanel = new Gear({
  state,
  onEquip: () => {
    char = buildCharacter(scene, SKINS[state.gear.skin], char);
    recompute();
    audio.buy();
    hud.update(state, combat, dps, clickDmg);
    persist();
  },
  onProgress: () => {
    recompute();
    audio.buy();
    hud.update(state, combat, dps, clickDmg);
    persist();
  },
  onKulisse: () => {
    updateBackground(true);
    recompute();
    hud.update(state, combat, dps, clickDmg);
    persist();
  },
});

// Frühstarter (§4.5.2): after an ascension the Himmelsbaum can restore a fraction
// of the previous crew levels, so re-climbs start warmer.
function applyFruhstarter(prevCrew: CrewLevels): void {
  const frac = fruhstarterFraction(state.heaven);
  if (frac <= 0) return;
  const restored: CrewLevels = {};
  for (const [id, lv] of Object.entries(prevCrew)) {
    const n = Math.floor(lv * frac);
    if (n > 0) restored[id] = n;
  }
  state.crew = restored;
}

const prestige = new Prestige({
  state,
  getRunMaxZone: () => Math.max(state.runMaxZone, combat.maxZone),
  onAscend: () => {
    syncMaxZones();
    const prevCrew = { ...state.crew };
    Object.assign(state, ascendState(state)); // mutate in place — panels hold this ref
    applyFruhstarter(prevCrew);
    combat = withBossTimerBonus(spawnFor(1, 0, 1));
    comboState = createCombo(state.combo.stacks); // run-scoped juice resets
    comboT3KeyAwardedThisRun = false; // the combo-Tier-3 key is once per run (§6.1)
    recompute();
    updateBackground(true);
    crew.render();
    ancients.render();
    heaven.refresh();
    gearPanel.render();
    hud.update(state, combat, dps, clickDmg);
    abilityBar.update(state.ability, Date.now(), ekstaseChargeMax());
    toasts.show('✨', 'Ruhm eingeheimst!', `Jetzt ${fmt(state.souls)} Seelen`);
    audio.unlockJingle();
    persist();
  },
});

const ancients = new Ancients({
  state,
  onBuy: () => {
    recompute();
    audio.buy();
    hud.update(state, combat, dps, clickDmg);
    prestige.refresh();
    persist();
  },
});

const heaven = new Heaven({
  state,
  onHimmelfahrt: () => {
    syncMaxZones();
    Object.assign(state, himmelfahrtState(state)); // mutate in place
    combat = withBossTimerBonus(spawnFor(1, 0, 1));
    comboState = createCombo(state.combo.stacks);
    comboT3KeyAwardedThisRun = false; // once per run (§6.1)
    recompute();
    updateBackground(true);
    crew.render();
    ancients.render();
    prestige.refresh();
    gearPanel.render();
    hud.update(state, combat, dps, clickDmg);
    abilityBar.update(state.ability, Date.now(), ekstaseChargeMax());
    toasts.show('🌈', 'Himmelfahrt!', `${fmt(state.heaven.hpf)} Himmelspfirsiche`);
    audio.unlockJingle();
    persist();
  },
  onBuyNode: (id) => {
    const r = buyTreeNode(state.heaven, id);
    if (!r.bought) return;
    state.heaven = r.heaven;
    recompute();
    audio.buy();
    hud.update(state, combat, dps, clickDmg);
    heaven.refresh();
    persist();
  },
});

// 🎁 Truhen (§6): open chests via the pure loot glue (`openChestFromInventory`
// already consumes keys + chest, credits rewards, recomputes, refreshes the HUD and
// persists). The panel only reads the shared `state` ref and plays the skippable
// open animation. There is NO purchase path — keys/chests are earned only (§6.3.3).
const chestPanel = new Chests({
  state,
  open: (tier) => openChestFromInventory(tier),
});

new ChSettings({
  getState: () => {
    syncMaxZones();
    return state;
  },
  applyImported: (imported) => {
    Object.assign(state, imported); // mutate in place — panels hold this ref
    rng = new Rng(state.rng); // resume the imported save's RNG stream
    combat = withBossTimerBonus(spawnFor(state.zone, state.killsThisZone, state.runMaxZone));
    comboState = createCombo(state.combo.stacks);
    comboT3KeyAwardedThisRun = false; // fresh run context for the imported save (§6.1)
    char = buildCharacter(scene, SKINS[state.gear.skin], char); // rig follows the imported skin
    recompute();
    updateBackground(true);
    crew.render();
    ancients.render();
    prestige.refresh();
    heaven.refresh();
    gearPanel.render();
    hud.update(state, combat, dps, clickDmg);
    abilityBar.update(state.ability, Date.now(), ekstaseChargeMax());
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
const tabBodies: Record<string, string> = {
  crew: 'tabCrew',
  gear: 'tabGear',
  anc: 'tabAnc',
  pr: 'tabPr',
  heaven: 'tabHeaven',
  chest: 'tabChest',
  set: 'tabSet',
};
function renderActiveTab(key: string): void {
  if (key === 'crew') crew.render();
  else if (key === 'gear') gearPanel.render();
  else if (key === 'anc') ancients.render();
  else if (key === 'pr') prestige.refresh();
  else if (key === 'heaven') heaven.refresh();
  else if (key === 'chest') chestPanel.render();
}
for (const tab of Array.from(document.querySelectorAll<HTMLElement>('.tab'))) {
  tab.addEventListener('click', () => {
    const key = tab.dataset.t!;
    for (const t of Array.from(document.querySelectorAll('.tab'))) t.classList.remove('active');
    tab.classList.add('active');
    for (const [k, id] of Object.entries(tabBodies)) {
      (document.getElementById(id) as HTMLElement).style.display = k === key ? '' : 'none';
    }
    renderActiveTab(key);
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

// ---------- background: zone-tier auto-rotation, gated on the kulisse chooser ----------
// In Tour-Modus (`gear.bgAuto`) the tier rotation drives the kulisse and keeps
// `gear.bg` (⇒ its mini-buff/set) synced with the view; with a manual pick the
// chosen `gear.bg` is fixed and the loop never rotates away from it (§5.5).
function updateBackground(force = false): void {
  const bg = state.gear.bgAuto ? bgForZone(combat.zone) : state.gear.bg;
  if (!force && bg === currentBg) return;
  currentBg = bg;
  if (state.gear.bgAuto && state.gear.bg !== bg) {
    state.gear.bg = bg;
    recompute(); // Space +5 % dpsPct etc. follow the auto-rotation
  }
  world.setBackground(bg);
  audio.setBackground(bg);
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

// 🎁 chest-tier emoji lookup (from the pure catalog) for drop toasts.
const CHEST_EMOJI = Object.fromEntries(CHEST_TIERS.map((c) => [c.tier, c.emoji])) as Record<
  ChestTier,
  string
>;
const chestEmoji = (tier: ChestTier): string => CHEST_EMOJI[tier];

function onKillProgress(
  r: ReturnType<typeof hit>,
  fromClick: boolean,
  wasBoss: boolean,
  x?: number,
  y?: number,
): void {
  // Peachiel (§4.6) × gold-gear (§5) × permanent gold-tokens (§6.2) × the live
  // Golden-Peach ×3 income boost (§6.1) multiply kill gold — the boost thus lifts
  // ALL income (click + idle + coach kills) uniformly for its 60-s window.
  const now = Date.now();
  const gold = Math.floor(r.gold * goldMult(state) * peachIncomeMult(state, now));
  state.gold += gold;
  state.stats.goldLifetime += gold;
  if (wasBoss) {
    state.stats.bossKills += 1;
  } else if (r.killed) {
    // Rival kill (§6.1): a 3 % base chance — scaled by Truhen-Luck — drops a Holztruhe.
    if (rng.next() < rivalChestChance(chestLuck(state))) state.chests.inventory.wood += 1;
  }
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
    if (fromClick && x !== undefined) pops.gold(gold, x, y ?? 0);
    // was the kill a boss? (advanced from a boss target)
    updateBackground();
    if (combat.zone % 5 === 1 && combat.zone > 1) {
      const bossZone = combat.zone - 1;
      // §6.1: a boss kill guarantees 1 🔑 (whole part guaranteed, the Truhen-Magnet/
      // gear key-drop bonus adds a seeded probabilistic extra) + a tier-appropriate
      // chest (§6.2) into the inventory.
      const keys = keyDropAmount(1, keyDropMult(state), rng.next());
      state.chests.keys += keys;
      const tier = chestTierForBoss(bossZone);
      state.chests.inventory[tier] += 1;
      // Provisional pre-M12 🧩 faucet (§5.4): a boss kill still grants a few Splitter,
      // scaling gently with the cleared boss zone. M12's Truhen are the real 🧩 source
      // (opened chests); the direct trickle stays as a gentle early-game bridge.
      const shards = bossShardReward(bossZone);
      state.gear.shards += shards;
      toasts.show(
        '🏆',
        `Boss besiegt!`,
        `${chestEmoji(tier)} · +${keys} 🔑 · +${shards} 🧩 (Bühne ${combat.zone})`,
      );
      audio.bossWin();
      if (effects.screenShake) shakeMag = Math.max(shakeMag, SHAKE_BOSS_KILL);
      haptics.boss(effects.haptics);
    }
  }
  syncMaxZones();
}

function applyHit(dmg: number, fromClick: boolean, x?: number, y?: number): void {
  const wasBoss = combat.boss;
  // Glutaeus Maximus (§4.6) + Tyrann/Krönung gear (§5) boost damage dealt to a boss.
  const effDmg = wasBoss ? dmg * ancientBossDmgMult(state.ancients) * bossDmgMult(state.gear) : dmg;
  const r = hit(combat, effDmg);
  // A newly-spawned boss gets Chronilla's extra timer seconds.
  combat = r.bossSpawned ? withBossTimerBonus(r.state) : r.state;
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
    // Beatrix (§4.6) + Neon/Synth gear (§5) widen the on-beat window on top of the tier bonus.
    beatWindowMs(
      tierBeatWindowBonusMs(curTier) +
        ancientBeatWindowBonusMs(state.ancients) +
        beatWindowBonus(state.gear),
    ),
  );

  // Wackelias (§4.6) + Showmaster/Club gear (§5) widen the combo grace window.
  comboState = comboOnClick(
    comboState,
    onBeat,
    COMBO_WINDOW_S + ancientComboWindowBonus(state.ancients) + comboWindowBonus(state.gear),
  );
  drive = Math.min(drive + 1.2, 6);

  const tier = comboTier(comboState.stacks);
  // Cheeksana (§4.6) + Disco gear (§5) + permanent crit-chance tokens (§6.2) add crit
  // chance on top of the combo-tier bonus (still 40 % cap after summing them all).
  const crit = rollCrit(
    rng.next(),
    critChance(
      tierCritChanceBonus(tier) +
        ancientCritChanceBonus(state.ancients) +
        critChanceBonus(state.gear) +
        permTokenCritChance(state.permTokens),
    ),
  );
  if (crit) state.stats.crits += 1;
  if (onBeat) state.stats.onBeatClicks += 1;

  // Charge the Ekstase meter (+1, or +2 on-beat) and fold the ×10 frenzy + on-beat
  // ×1.5 into the pure click pipeline. Idle DPS never gets any of this (P1).
  state.ability = abilityOnClick(state.ability, onBeat);
  const dmg = effectiveClick({
    baseClick: clickDmg,
    combo: comboState.stacks,
    crit,
    // Combo-tier + Disco/Lava gear (§5) crit-mult; Neon-Ninja gear widens on-beat ×.
    critMultBonus: tierCritMultBonus(tier) + critMultBonus(state.gear),
    // Permanent „+1 % Krit-Schaden" tokens scale the whole crit multiplier (§6.2).
    critMultFactor: permTokenCritMult(state.permTokens),
    extraMult: beatBonus(onBeat, onBeatMultBonus(state.gear)) * frenzyMult(state.ability, now),
  });
  const px = x ?? window.innerWidth / 2;
  const py = y ?? window.innerHeight / 2;

  applyHit(dmg, true, px, py);
  lootFromClick(now);

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
  abilityBar.update(state.ability, now, ekstaseChargeMax());
}

/** Fire Twerk-Ekstase (spec §4.2.4): ×10 click damage when the meter's full. */
function activateEkstase(): void {
  audio.unlock();
  const now = Date.now();
  const chargeMax = ekstaseChargeMax();
  if (!canActivate(state.ability, chargeMax)) return;
  // Ekstase-Ausdauer (§4.5.2) + Lava gear flat seconds extend the base window, then
  // Gyrator gear scales the whole duration by (1 + frenzyDur) (§5).
  const durationMs =
    (FRENZY_DURATION_MS + ekstaseBonusMs(state.heaven) + frenzyDurSecBonus(state.gear) * 1000) *
    (1 + frenzyDurBonus(state.gear));
  state.ability = activate(state.ability, now, chargeMax, durationMs);
  audio.unlockJingle();
  audio.setIntensity(3);
  toasts.show(
    '🍑',
    'TWERK-EKSTASE!',
    `×10 Klick-Schaden für ${Math.round(durationMs / 1000)} Sekunden!`,
  );
  if (effects.screenShake) shakeMag = Math.max(shakeMag, SHAKE_FRENZY);
  haptics.boss(effects.haptics);
  abilityBar.update(state.ability, now, chargeMax);
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

// ---------- loot drip bookkeeping (runtime, §6.1) ----------
// The combo-Tier-3 key is once per run (reset on ascension/Himmelfahrt/import). The
// session drip caps at ~3 Holztruhen/day via a lightweight in-session day-stamp; a
// reload resets these — the full persistent Daily lands in M13 (spec §7.1).
const SESSION_DRIP_CLICKS = 500;
const SESSION_DRIP_CAP = 3;
const dayStamp = (ms: number): number => Math.floor(ms / 86_400_000);
let comboT3KeyAwardedThisRun = false;
let clicksSinceDrip = 0;
let sessionDripDay = dayStamp(Date.now());
let sessionDripsToday = 0;

/** Per-click loot drips (§6.1): the first combo-Tier-3 key of the run + the session drip. */
function lootFromClick(now: number): void {
  const tier = comboTier(comboState.stacks);
  if (tier >= 3 && !comboT3KeyAwardedThisRun) {
    comboT3KeyAwardedThisRun = true;
    state.chests.keys += 1;
    toasts.show('🔑', 'Combo-Feuer!', 'Combo-Tier 3 · +1 Schlüssel');
  }
  if (++clicksSinceDrip >= SESSION_DRIP_CLICKS) {
    clicksSinceDrip = 0;
    const day = dayStamp(now);
    if (day !== sessionDripDay) {
      sessionDripDay = day;
      sessionDripsToday = 0;
    }
    if (sessionDripsToday < SESSION_DRIP_CAP) {
      sessionDripsToday += 1;
      state.chests.inventory.wood += 1;
      toasts.show(
        '🪵',
        'Session-Bonus',
        `Holztruhe (${sessionDripsToday}/${SESSION_DRIP_CAP} heute)`,
      );
    }
  }
}

// ---------- Golden-Peach event glue (§6.1) ----------
/** Whether a spawned Golden Peach is currently on-screen (clickable) at `now`. */
function peachVisible(now: number): boolean {
  const at = state.peach.nextPeachAt;
  return at > 0 && now >= at && now < at + PEACH_VISIBLE_S * 1000;
}

/**
 * Each frame: (re)schedule the next peach when the schedule is unseeded (`≤ 0`, e.g.
 * an imported pre-v7 save) or the current peach has despawned uncaught. A caught
 * peach reschedules itself in `catchPeach`.
 */
function updatePeachSchedule(now: number): void {
  const at = state.peach.nextPeachAt;
  if (at <= 0 || now >= at + PEACH_VISIBLE_S * 1000) {
    state.peach.nextPeachAt = rollNextPeachAt(now, rng);
  }
}

/**
 * Catch the on-screen Golden Peach (spec §6.1): activates the ×3 income boost for
 * 60 s and rolls a 25 % → 1 🔑 drop, then schedules the next spawn. Part 3 renders
 * the button and calls this; returns the outcome (or null if no peach is catchable).
 * Persists the peach schedule + boost + the advanced RNG cursor.
 */
function catchPeach(): { keys: number; boostUntil: number } | null {
  const now = Date.now();
  if (!peachVisible(now)) return null;
  state.peach.boostUntil = activateBoost(now); // fresh ×3 60-s window
  const keys = peachKeyRoll(rng);
  state.chests.keys += keys;
  state.peach.nextPeachAt = rollNextPeachAt(now, rng);
  toasts.show(
    '🍑',
    'Goldener Pfirsich!',
    keys > 0 ? '×3 Einkommen 60 s · +1 🔑' : '×3 Einkommen 60 s',
  );
  hud.update(state, combat, dps, clickDmg);
  persist();
  return { keys, boostUntil: state.peach.boostUntil };
}

// ---------- chest-skin collectibles (§6.3.2) ----------
const ownedChestSkins = (): ReadonlySet<string> => new Set(state.chests.skins);
function ownChestSkin(id: string): void {
  if (id && !state.chests.skins.includes(id)) state.chests.skins.push(id);
}

/** Current idle income per second (BP/s) — drives chest BP rewards (§6.2, „15 min Einkommen"). */
function currentIncomePerSec(now: number): number {
  const hp = monsterHp(combat.zone);
  if (!(hp > 0) || !(dps > 0)) return 0;
  return (dps / hp) * goldFor(combat.zone, false) * goldMult(state) * peachIncomeMult(state, now);
}

/** Credit one resolved reward into the live state (§6.2 reward union). */
function creditReward(reward: Reward): void {
  switch (reward.kind) {
    case 'bp':
      state.gold += reward.bp;
      state.stats.goldLifetime += reward.bp;
      break;
    case 'shards':
      state.gear.shards += reward.shards;
      break;
    case 'keys':
      state.chests.keys += reward.keys;
      break;
    case 'sugar':
      state.gear.sugarPeaches += reward.sugar;
      break;
    case 'boost': {
      // Stack DURATION onto the active income-boost window (§6.2 „stackt Dauer, nicht
      // Faktor"): the single ×3 peach window is extended by the reward's duration.
      const base = Math.max(state.peach.boostUntil, Date.now());
      state.peach.boostUntil = base + reward.boost.durMs;
      break;
    }
    case 'token':
      state.permTokens = addToken(state.permTokens, reward.token);
      break;
    case 'jackpot':
      ownChestSkin(reward.jackpot.skin); // duplicates were already resolved to 🧩
      break;
  }
}

/**
 * Open a chest from the inventory (spec §6, the glue part 3 calls). Requires
 * `inventory[tier] ≥ 1` and `keys ≥ KEY_COST[tier]`; consumes both, opens via the
 * pure `openChest` (deterministic over the persisted RNG), duplicate-protects
 * jackpots against the owned chest-skin set, credits every reward, writes back the
 * advanced pity + RNG cursor, and persists. Returns the credited rewards (so part 3
 * can animate them) or null when it can't open.
 */
function openChestFromInventory(tier: ChestTier): readonly Reward[] | null {
  const cost = KEY_COST[tier];
  if (state.chests.inventory[tier] < 1 || state.chests.keys < cost) return null;
  state.chests.inventory[tier] -= 1;
  state.chests.keys -= cost;
  const now = Date.now();
  const res = openChest(
    tier,
    { incomePerSec: currentIncomePerSec(now), luck: chestLuck(state), pity: state.chests.pity },
    rng,
  );
  state.chests.pity = res.pity;
  const credited: Reward[] = [];
  for (const raw of res.rewards) {
    const reward = raw.kind === 'jackpot' ? resolveDuplicate(raw, ownedChestSkins()) : raw;
    creditReward(reward);
    credited.push(reward);
  }
  recompute(); // tokens/boost may have shifted dps/gold
  hud.update(state, combat, dps, clickDmg);
  persist(); // folds the advanced RNG cursor into the save (resumable, save-scum-proof)
  return credited;
}

// Expose the loot glue for part 3's 🎁 UI (and the headless smoke). A tiny surface:
// snapshot the loot state, open a chest, catch a peach, query peach visibility.
interface LootGlue {
  snapshot(): {
    keys: number;
    inventory: Record<ChestTier, number>;
    skins: string[];
    boostUntil: number;
    nextPeachAt: number;
  };
  open(tier: ChestTier): readonly Reward[] | null;
  catchPeach(): { keys: number; boostUntil: number } | null;
  peachVisible(): boolean;
}
(window as unknown as { chLoot: LootGlue }).chLoot = {
  snapshot: () => ({
    keys: state.chests.keys,
    inventory: { ...state.chests.inventory },
    skins: [...state.chests.skins],
    boostUntil: state.peach.boostUntil,
    nextPeachAt: state.peach.nextPeachAt,
  }),
  open: (tier) => openChestFromInventory(tier),
  catchPeach,
  peachVisible: () => peachVisible(Date.now()),
};

// ---------- Golden-Peach on-screen button + ×3-boost badge (§6.1, B13c) ----------
const peachBtn = document.getElementById('peachBtn') as HTMLButtonElement;
const boostBadge = document.getElementById('boostBadge') as HTMLElement;
// Peach footprint (matches `.peachBtn` in style.css) + safe margins so a spawn never
// lands off-screen or under the notch/HUD (B13c clamp).
const PEACH_SIZE = 72;
const PEACH_MARGIN = 16;
const PEACH_TOP_SAFE = 76;
let peachSpawnId = 0; // the `nextPeachAt` the current on-screen position belongs to
const peachPos = { x: PEACH_MARGIN, y: PEACH_TOP_SAFE };

/** Narrow (phone) layout — the shop is a full-width bottom sheet (B13a). */
const isNarrow = (): boolean => window.innerWidth <= 640;
const shopOpen = (): boolean => !shop.classList.contains('hidden');

/** Clamp bounds for the peach's top-left in the current viewport (B13c). */
function peachBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: PEACH_MARGIN,
    maxX: Math.max(PEACH_MARGIN, window.innerWidth - PEACH_SIZE - PEACH_MARGIN),
    minY: PEACH_TOP_SAFE,
    maxY: Math.max(PEACH_TOP_SAFE, window.innerHeight - PEACH_SIZE - PEACH_MARGIN),
  };
}

/** Pick a fresh random spawn position for a new peach, already clamped (B13c). */
function pickPeachPos(): void {
  const b = peachBounds();
  peachPos.x = b.minX + Math.random() * (b.maxX - b.minX);
  peachPos.y = b.minY + Math.random() * (b.maxY - b.minY);
}

/** Re-clamp the stored position into the (possibly resized) viewport (B13c). */
function clampPeachPos(): void {
  const b = peachBounds();
  peachPos.x = Math.min(Math.max(b.minX, peachPos.x), b.maxX);
  peachPos.y = Math.min(Math.max(b.minY, peachPos.y), b.maxY);
}

function applyPeachPos(): void {
  peachBtn.style.left = `${Math.round(peachPos.x)}px`;
  peachBtn.style.top = `${Math.round(peachPos.y)}px`;
}

/**
 * Per-frame peach/boost HUD sync (§6.1, B13c). Shows the floating 🍑 while a peach is
 * on-screen — but DESPAWNS it under the bottom-sheet on narrow screens so it can't sit
 * under the sheet. A fresh spawn (`nextPeachAt` changed) is repositioned once. The
 * „×3 Boost" badge shows while the boost window runs.
 */
function updatePeachButton(now: number): void {
  const spawned = peachVisible(now);
  const show = spawned && !(isNarrow() && shopOpen());
  if (spawned && state.peach.nextPeachAt !== peachSpawnId) {
    peachSpawnId = state.peach.nextPeachAt;
    pickPeachPos();
    applyPeachPos();
  }
  peachBtn.classList.toggle('hidden', !show);
  boostBadge.classList.toggle('hidden', !(state.peach.boostUntil > now));
}

peachBtn.addEventListener('click', () => {
  if (catchPeach()) {
    peachBtn.classList.add('hidden'); // caught — hide until the next spawn
    if (effects.screenShake) shakeMag = Math.max(shakeMag, SHAKE_CRIT);
    haptics.boss(effects.haptics);
  }
});

// ---------- resize ----------
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Keep the peach on-screen when the viewport changes (B13c: never off-screen).
  clampPeachPos();
  applyPeachPos();
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

  // Idle DPS chips away at the current target; the Twerk-Coach auto-clicks at
  // 25 % of the click value (no crit/beat, §4.3.5) — Robo gear stars add cps (§5),
  // the same sum the offline accrual uses; boss timer ticks down.
  if (dps > 0) applyHit(dps * dt, false);
  const cps = coachCps(state.heaven) + coachCpsBonus(state.gear);
  if (cps > 0) applyHit(coachDps(clickDmg, cps) * dt, false);
  if (combat.boss) {
    const bt = tickBoss(combat, dt);
    combat = bt.state;
    if (bt.failed) {
      state.stats.bossTimeouts += 1;
      toasts.show('⏱', 'Zeit um!', 'Farm die Bühne & fordere den Boss erneut.');
      audio.bossLose();
    }
  }

  // Combo soft-decay (§4.2.2, slowed by Showmaster gear §5) + tier-driven juice
  // (music/ability bar), each frame.
  comboState = comboStep(comboState, dt, comboDecayReduction(state.gear));
  const epochMs = Date.now();
  // Golden-Peach schedule (§6.1): despawn/reschedule the event, then sync the
  // on-screen 🍑 button + ×3-boost badge (clamped/despawned per B13c).
  updatePeachSchedule(epochMs);
  updatePeachButton(epochMs);
  const tier = comboTier(comboState.stacks);
  const frenzy = isFrenzyActive(state.ability, epochMs);
  hud.setCombo(comboState.stacks, tier);
  audio.setIntensity(intensityFor(tier, frenzy));
  abilityBar.update(state.ability, epochMs, ekstaseChargeMax());
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
    // 🍬 faucet (§5.4): fold any ripened Zuckerpfirsiche into the gear slice (one per
    // 24 h real-time; a backwards clock clamps, never a negative timer/count). Pure —
    // `accrueSugar` returns the same ref when nothing matured, so this is cheap.
    const sugarBefore = state.gear.sugarPeaches;
    state.gear = accrueSugar(state.gear, epochMs);
    const ripened = state.gear.sugarPeaches - sugarBefore;
    if (ripened > 0) {
      toasts.show(
        '🍬',
        'Zuckerpfirsich gereift!',
        `+${ripened} 🍬 (${fmt(state.gear.sugarPeaches)} gesamt)`,
      );
    }
    document.title = titleFor(state.gold);
    hud.update(state, combat, dps, clickDmg);
    // keep the open shop tab's affordability/previews fresh while idling
    const active = document.querySelector('.tab.active') as HTMLElement | null;
    if (active?.dataset.t) renderActiveTab(active.dataset.t);
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
