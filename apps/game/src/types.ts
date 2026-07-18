import type * as THREE from 'three';

/** Skin visual style — drives which meshes the rig builds. */
export type SkinStyle = 'human' | 'disco' | 'robot' | 'host' | 'boss';

/** Gear rarity tiers (spec §5.3). */
export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

/**
 * Which downstream stat a gear buff feeds (spec §5.2). The first block is the
 * "core 14" the `game/gear.ts` helpers expose 1:1. The remainder cover catalog
 * star bonuses and kulisse/set effects that need their own unit and cannot be
 * expressed by the core 14: `allPct` is Diamant-Booty's "+X % ALLES" (distributed
 * across every percentage stat by the fold), `coachCps` a coach cps bump,
 * `onBeatMult` an additive on-beat multiplier, `frenzyDurSec` flat Ekstase
 * seconds (distinct from the percentage `frenzyDur`), `frenzyCharge` a charge-need
 * reduction, and `offlineRate` an offline-efficiency bump (Endless Summer set).
 */
export type BuffStat =
  // ---- core 14 (1:1 gear helpers) ----
  | 'clickPct'
  | 'dpsPct'
  | 'critChance'
  | 'critMult'
  | 'comboWindow'
  | 'comboDecay'
  | 'goldPct'
  | 'bossDmg'
  | 'bossTimer'
  | 'beatWindow'
  | 'chestLuck'
  | 'keyDrop'
  | 'offlineCap'
  | 'frenzyDur'
  // ---- catalog/kulisse/set extras ----
  | 'allPct'
  | 'coachCps'
  | 'onBeatMult'
  | 'frenzyDurSec'
  | 'frenzyCharge'
  | 'offlineRate';

/** A skin's linear per-level buff (spec §5.2). */
export interface SkinBuff {
  readonly stat: BuffStat;
  readonly perLevel: number;
}

/** A skin's per-star bonus (stars 0–5, spec §5.2). */
export interface SkinStar {
  readonly stat: BuffStat;
  readonly perStar: number;
}

/** A selectable character skin (typed config, spec §4.3 + §5.2 gear metadata). */
export interface SkinConfig {
  readonly icon: string;
  readonly name: string;
  readonly cost: number;
  readonly style: SkinStyle;
  /** Skin/body colour. */
  readonly skin: number;
  /** Shorts/accent colour. */
  readonly shorts: number;
  /** Hair colour. */
  readonly hair: number;
  /** BP milestone (highest-ever) before this appears in the shop (M2 content-gate). */
  readonly revealAt?: number;
  // ---- gear metadata (M11, spec §5.2/§5.3): data, not code ----
  /** Gear rarity tier. */
  readonly rarity: SkinRarity;
  /** The buff applied linearly per skin level (1–50). */
  readonly buff: SkinBuff;
  /** The bonus applied per star (0–5). */
  readonly star: SkinStar;
}

export type SkinKey =
  | 'classic'
  | 'disco'
  | 'robo'
  | 'host'
  | 'boss'
  | 'neon'
  | 'pirate'
  | 'lava'
  | 'gyrator'
  | 'diamond';
export type BackgroundKey = 'club' | 'synth' | 'beach' | 'space';

/** All animatable joint channels of the rig. */
export type PoseKey =
  | 'rootY'
  | 'rootRotY'
  | 'hipX'
  | 'hipZ'
  | 'hipPosX'
  | 'hipPosZ'
  | 'spineX'
  | 'spineZ'
  | 'spineY'
  | 'headX'
  | 'headZ'
  | 'armLZ'
  | 'armRZ'
  | 'armLX'
  | 'armRX'
  | 'elbL'
  | 'elbR'
  | 'kneeL'
  | 'kneeR';

/** A full pose: every joint channel to a scalar (radians / metres). */
export type Pose = Record<PoseKey, number>;

/** One dance move: a name, loop duration (s), and a pose generator. */
export interface Move {
  readonly name: string;
  readonly dur: number;
  /** @param ph phase accumulator @param e energy (0.85..) */
  readonly fn: (ph: number, e: number) => Pose;
}

export interface ArmRig {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Mesh;
}

export interface LegRig {
  thigh: THREE.Group;
  knee: THREE.Group;
}

/** The articulated skeleton returned by buildCharacter. */
export interface Rig {
  root: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  armL: ArmRig;
  armR: ArmRig;
  legL: LegRig;
  legR: LegRig;
}

/** A spring-damper soft-body butt cheek simulated in world space. */
export interface Cheek {
  g: THREE.Group;
  m: THREE.Mesh;
  side: number;
  anchor: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** A per-frame background animation callback. */
export type WorldAnim = (t: number, beatV: number) => void;
