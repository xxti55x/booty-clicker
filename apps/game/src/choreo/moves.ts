import type { Move, Pose, PoseKey } from '../types';

/**
 * Character faces +z; booty at -z; camera starts behind.
 * Pose channels blended each physics step toward the current move's target.
 */
export const POSE_KEYS: readonly PoseKey[] = [
  'rootY',
  'rootRotY',
  'hipX',
  'hipZ',
  'hipPosX',
  'hipPosZ',
  'spineX',
  'spineZ',
  'spineY',
  'headX',
  'headZ',
  'armLZ',
  'armRZ',
  'armLX',
  'armRX',
  'elbL',
  'elbR',
  'kneeL',
  'kneeR',
];

/** A neutral pose with every channel at 0. */
export function zeroPose(): Pose {
  const p = {} as Pose;
  for (const k of POSE_KEYS) p[k] = 0;
  return p;
}

/** The five dance moves, ported verbatim from the prototype's CHOREOGRAPHY section. */
export const MOVES: readonly Move[] = [
  {
    name: 'Twerk',
    dur: 8,
    fn: (ph, e) => {
      const p = zeroPose();
      p.kneeL = p.kneeR = 0.8;
      p.spineX = 0.62;
      p.hipX = -0.25 + Math.sin(ph * 2.4) * 0.42 * e;
      p.rootY = -0.44 - Math.abs(Math.sin(ph * 2.4)) * 0.05 * e;
      p.armLX = p.armRX = -1.0;
      p.elbL = p.elbR = -0.5;
      p.armLZ = 0.25;
      p.armRZ = -0.25;
      p.headX = -0.3;
      return p;
    },
  },
  {
    name: 'Hip Circles',
    dur: 7,
    fn: (ph, e) => {
      const p = zeroPose();
      p.kneeL = p.kneeR = 0.22;
      p.hipPosX = Math.sin(ph * 1.4) * 0.3 * e;
      p.hipPosZ = Math.cos(ph * 1.4) * 0.3 * e;
      p.hipZ = Math.sin(ph * 1.4) * 0.16 * e;
      p.spineZ = -Math.sin(ph * 1.4) * 0.1 * e;
      p.armLZ = 2.3;
      p.armRZ = -2.3;
      p.elbL = p.elbR = -0.35;
      p.headZ = Math.sin(ph * 1.4) * 0.07;
      return p;
    },
  },
  {
    name: 'Drop It Low',
    dur: 8,
    fn: (ph, e) => {
      const p = zeroPose();
      const b = (1 - Math.cos(ph * 0.9)) / 2;
      p.kneeL = p.kneeR = 0.18 + b * 1.05;
      p.rootY = -b * 0.6;
      p.spineX = 0.12 + b * 0.22;
      p.hipX = Math.sin(ph * 3.2) * 0.14 * e * b;
      p.armLZ = 0.4 + b * 1.8;
      p.armRZ = -0.4 - b * 1.8;
      p.elbL = p.elbR = -0.3 * b;
      p.headX = -b * 0.12;
      return p;
    },
  },
  {
    name: 'Shimmy',
    dur: 6,
    fn: (ph, e) => {
      const p = zeroPose();
      p.kneeL = p.kneeR = 0.3;
      p.spineX = 0.24;
      p.spineY = Math.sin(ph * 3.2) * 0.2 * e;
      p.armLZ = 0.9;
      p.armRZ = -0.9;
      p.elbL = p.elbR = -1.5;
      p.armLX = -0.3 + Math.sin(ph * 3.2) * 0.25 * e;
      p.armRX = -0.3 - Math.sin(ph * 3.2) * 0.25 * e;
      p.rootY = -0.05 + Math.sin(ph * 6.4) * 0.03 * e;
      p.headZ = Math.sin(ph * 3.2) * 0.09;
      return p;
    },
  },
  {
    name: 'Bounce',
    dur: 6,
    fn: (ph, e) => {
      const p = zeroPose();
      const b = Math.abs(Math.sin(ph * 1.8));
      p.kneeL = p.kneeR = 0.18 + (1 - b) * 0.4;
      p.rootY = -0.22 + b * 0.28 * e;
      p.rootRotY = Math.sin(ph * 0.45) * 0.55;
      p.armLZ = 2.6;
      p.armRZ = -2.6;
      p.elbL = p.elbR = -0.25;
      p.hipZ = Math.sin(ph * 1.8) * 0.09 * e;
      p.headX = Math.sin(ph * 3.6) * 0.05;
      return p;
    },
  },
];

/**
 * Holds the live choreography state (current move, phase, blended pose) and
 * advances between moves. Replaces the prototype's moveIdx/moveTime/phase globals.
 */
export class Choreographer {
  moveIdx = 0;
  moveTime = 0;
  phase = 0;
  pose: Pose = zeroPose();
  /** Notified with the move name whenever the active move changes (HUD hook). */
  onMove?: (name: string) => void;

  get current(): Move {
    return MOVES[this.moveIdx];
  }

  setMove(i: number): void {
    this.moveIdx = i % MOVES.length;
    this.moveTime = 0;
    this.onMove?.(this.current.name);
  }
}
