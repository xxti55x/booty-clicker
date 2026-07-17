import type * as THREE from 'three';

/** Skin visual style — drives which meshes the rig builds. */
export type SkinStyle = 'human' | 'disco' | 'robot' | 'host' | 'boss';

/** A selectable character skin (typed config, spec §4.3). */
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
}

export type SkinKey = 'classic' | 'disco' | 'robo' | 'host' | 'boss';
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
