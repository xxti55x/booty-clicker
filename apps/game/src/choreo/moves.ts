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

/**
 * The dance moves. The five prototype moves were COMPLETED (every limb now
 * dances — arm pumps, head bobs, knee pulses and counter-sways on channels the
 * prototype left static), plus three new routines (Welle, Booty-Slam,
 * Diva-Turn) so the set reads as a full choreography. Each `fn` stays a pure
 * (phase, energy) → Pose map — the blend/physics contract is untouched.
 */
export const MOVES: readonly Move[] = [
  {
    name: 'Twerk',
    dur: 8,
    fn: (ph, e) => {
      const p = zeroPose();
      const b = Math.sin(ph * 2.4); // the booty beat
      p.kneeL = 0.8 + Math.sin(ph * 2.4) * 0.06 * e;
      p.kneeR = 0.8 - Math.sin(ph * 2.4) * 0.06 * e;
      p.spineX = 0.62 + Math.sin(ph * 4.8) * 0.03 * e;
      p.hipX = -0.25 + b * 0.42 * e;
      p.hipZ = Math.sin(ph * 1.2) * 0.07 * e; // slow figure-8 sway under the bounce
      p.rootY = -0.44 - Math.abs(b) * 0.05 * e;
      // arms pump WITH the beat instead of hanging frozen
      p.armLX = -1.0 + b * 0.18 * e;
      p.armRX = -1.0 - b * 0.18 * e;
      p.elbL = p.elbR = -0.5 - Math.abs(b) * 0.25 * e;
      p.armLZ = 0.25;
      p.armRZ = -0.25;
      p.headX = -0.3 + Math.sin(ph * 2.4 + 0.6) * 0.06; // head bob trails the hips
      p.headZ = Math.sin(ph * 1.2) * 0.05;
      return p;
    },
  },
  {
    name: 'Hip Circles',
    dur: 7,
    fn: (ph, e) => {
      const p = zeroPose();
      const w = ph * 1.4;
      p.kneeL = 0.22 + Math.sin(w) * 0.07 * e; // knees ride the circle
      p.kneeR = 0.22 - Math.sin(w) * 0.07 * e;
      p.hipPosX = Math.sin(w) * 0.3 * e;
      p.hipPosZ = Math.cos(w) * 0.3 * e;
      p.hipZ = Math.sin(w) * 0.16 * e;
      p.spineZ = -Math.sin(w) * 0.1 * e;
      p.spineX = 0.08 + Math.cos(w) * 0.05 * e; // chest counter-circles
      p.rootY = -0.06 + Math.cos(w * 2) * 0.02 * e;
      p.armLZ = 2.3 + Math.sin(w) * 0.15 * e; // raised arms sway with the orbit
      p.armRZ = -2.3 + Math.sin(w) * 0.15 * e;
      p.elbL = -0.35 - Math.cos(w) * 0.15 * e;
      p.elbR = -0.35 + Math.cos(w) * 0.15 * e;
      p.headZ = Math.sin(w) * 0.07;
      p.headX = Math.cos(w) * 0.05;
      return p;
    },
  },
  {
    name: 'Drop It Low',
    dur: 8,
    fn: (ph, e) => {
      const p = zeroPose();
      const b = (1 - Math.cos(ph * 0.9)) / 2;
      p.kneeL = 0.18 + b * (1.05 + Math.sin(ph * 6.4) * 0.05 * e);
      p.kneeR = 0.18 + b * (1.05 - Math.sin(ph * 6.4) * 0.05 * e);
      p.rootY = -b * 0.6;
      p.spineX = 0.12 + b * 0.22;
      p.spineY = Math.sin(ph * 3.2) * 0.08 * e * b; // shoulder twist while low
      p.hipX = Math.sin(ph * 3.2) * 0.14 * e * b;
      p.armLZ = 0.4 + b * (1.8 + Math.sin(ph * 3.2) * 0.2 * e); // arms wave at the bottom
      p.armRZ = -0.4 - b * (1.8 - Math.sin(ph * 3.2) * 0.2 * e);
      p.elbL = p.elbR = -0.3 * b;
      p.headX = -b * 0.12;
      p.headZ = Math.sin(ph * 3.2) * 0.06 * b; // sassy head roll on the shake
      return p;
    },
  },
  {
    name: 'Shimmy',
    dur: 6,
    fn: (ph, e) => {
      const p = zeroPose();
      const s = Math.sin(ph * 3.2);
      p.kneeL = 0.3 + s * 0.08 * e; // alternating knee pulse carries the shimmy
      p.kneeR = 0.3 - s * 0.08 * e;
      p.spineX = 0.24;
      p.spineY = s * 0.2 * e;
      p.hipPosX = -s * 0.08 * e; // hips counter the shoulder line
      p.hipZ = -s * 0.06 * e;
      p.armLZ = 0.9;
      p.armRZ = -0.9;
      p.elbL = -1.5 - s * 0.15 * e;
      p.elbR = -1.5 + s * 0.15 * e;
      p.armLX = -0.3 + s * 0.25 * e;
      p.armRX = -0.3 - s * 0.25 * e;
      p.rootY = -0.05 + Math.sin(ph * 6.4) * 0.03 * e;
      p.headZ = s * 0.09;
      p.headX = Math.sin(ph * 6.4) * 0.04;
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
      p.armLZ = 2.6 - b * 0.35 * e; // raised arms wave with each hop
      p.armRZ = -2.6 + b * 0.35 * e;
      p.elbL = -0.25 - b * 0.3 * e;
      p.elbR = -0.25 - b * 0.3 * e;
      p.hipZ = Math.sin(ph * 1.8) * 0.09 * e;
      p.hipPosZ = Math.sin(ph * 0.9) * 0.06 * e;
      p.spineX = 0.06 + b * 0.05;
      p.headX = Math.sin(ph * 3.6) * 0.05;
      return p;
    },
  },
  {
    name: 'Welle',
    dur: 7,
    fn: (ph, e) => {
      // Body wave: one ripple travels hips → chest → head, arms flow behind.
      const p = zeroPose();
      const w = ph * 1.6;
      p.kneeL = p.kneeR = 0.3 + Math.sin(w + 0.6) * 0.12 * e;
      p.rootY = -0.1 + Math.sin(w) * 0.05 * e;
      p.hipX = Math.sin(w) * 0.3 * e;
      p.hipPosZ = Math.cos(w) * 0.1 * e;
      p.spineX = 0.2 + Math.sin(w - 0.9) * 0.28 * e; // the ripple, phase-delayed
      p.headX = Math.sin(w - 1.8) * 0.2;
      p.armLZ = 0.6 + Math.sin(w - 1.2) * 0.5 * e;
      p.armRZ = -0.6 - Math.sin(w - 1.2) * 0.5 * e;
      p.armLX = -0.4 + Math.cos(w - 1.2) * 0.2 * e;
      p.armRX = -0.4 + Math.cos(w - 1.2) * 0.2 * e;
      p.elbL = p.elbR = -0.4 - Math.sin(w - 1.5) * 0.25 * e;
      p.headZ = Math.sin(w - 2.1) * 0.06;
      return p;
    },
  },
  {
    name: 'Booty-Slam',
    dur: 7,
    fn: (ph, e) => {
      // Wind up tall, slam low with a fast shake, arms thrown to the sky.
      const p = zeroPose();
      const b = (1 - Math.cos(ph * 1.8)) / 2; // 0 = tall, 1 = slammed low
      p.kneeL = 0.25 + b * 0.7;
      p.kneeR = 0.25 + b * 0.7;
      p.rootY = -0.1 - b * 0.38;
      p.spineX = 0.3 + b * 0.25;
      p.hipX = -0.15 + Math.sin(ph * 7) * 0.18 * e * b; // rapid pop only while low
      p.hipZ = Math.sin(ph * 3.5) * 0.05 * e * b;
      p.armLZ = 0.5 + b * 2.0; // arms rise as the booty drops
      p.armRZ = -0.5 - b * 2.0;
      p.elbL = p.elbR = -0.2 - b * 0.4;
      p.armLX = -0.2 * (1 - b);
      p.armRX = -0.2 * (1 - b);
      p.headX = -0.15 * b + Math.sin(ph * 7) * 0.04 * b;
      return p;
    },
  },
  {
    name: 'Diva-Turn',
    dur: 6,
    fn: (ph, e) => {
      // Strutting half-turns with hip pops: one arm up, one hand on the hip.
      const p = zeroPose();
      const w = ph * 0.7;
      p.rootRotY = Math.sin(w) * 1.1; // sweeping look-at-me turns
      p.kneeL = 0.2 + Math.max(0, Math.sin(ph * 1.4)) * 0.15 * e;
      p.kneeR = 0.2 + Math.max(0, -Math.sin(ph * 1.4)) * 0.15 * e;
      p.hipPosX = Math.sin(ph * 1.4) * 0.18 * e;
      p.hipZ = Math.sin(ph * 1.4) * 0.18 * e; // the pop
      p.rootY = -0.08 + Math.abs(Math.sin(ph * 1.4)) * 0.04 * e;
      p.spineZ = -Math.sin(ph * 1.4) * 0.08 * e;
      p.armLZ = 2.4 + Math.sin(ph * 1.4) * 0.2 * e; // showhand up, waving
      p.elbL = -0.3;
      p.armRZ = -0.75; // hand parked on the hip
      p.elbR = -1.9;
      p.headZ = Math.sin(ph * 1.4) * 0.08;
      p.headX = -0.05;
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
