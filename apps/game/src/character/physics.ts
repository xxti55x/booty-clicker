import * as THREE from 'three';

import { POSE_KEYS, type Choreographer } from '../choreo/moves';
import type { Cheek, Pose, Rig } from '../types';
import { BASE_ROOT_Y } from './rig';

/** Fixed simulation timestep — 120 Hz, decoupled from render (spec §4.1). */
export const DT = 1 / 120;
/** Downward pull on the cheek soft-bodies. */
const GRAV = 3.2;

const tmp = new THREE.Vector3();
const pq = new THREE.Quaternion();

/** Drive the rig joints from a pose. Ported verbatim from the prototype. */
export function applyPose(R: Rig, p: Pose): void {
  R.root.position.y = BASE_ROOT_Y + p.rootY;
  R.root.rotation.y = p.rootRotY;
  R.pelvis.rotation.x = p.hipX;
  R.pelvis.rotation.z = p.hipZ;
  R.pelvis.position.x = p.hipPosX;
  R.pelvis.position.z = p.hipPosZ;
  R.spine.rotation.set(p.spineX, p.spineY, p.spineZ);
  R.head.rotation.set(p.headX, 0, p.headZ);
  R.armL.shoulder.rotation.set(p.armLX, 0, p.armLZ);
  R.armR.shoulder.rotation.set(p.armRX, 0, p.armRZ);
  R.armL.elbow.rotation.x = p.elbL;
  R.armR.elbow.rotation.x = p.elbR;
  R.legL.thigh.rotation.x = -p.kneeL * 0.55;
  R.legL.knee.rotation.x = p.kneeL * 1.15;
  R.legR.thigh.rotation.x = -p.kneeR * 0.55;
  R.legR.knee.rotation.x = p.kneeR * 1.15;
}

/**
 * Advance one fixed step: choreography phase, pose blend, and the spring-damper
 * cheek simulation. `drive` is consumed and decayed; the new value is returned.
 */
export function stepPhysics(
  dt: number,
  rig: Rig,
  cheeks: readonly Cheek[],
  choreo: Choreographer,
  drive: number,
): number {
  const tempo = 1 + drive * 0.35;
  const energy = 0.85 + drive * 0.12;
  choreo.phase += dt * 2.2 * tempo;
  choreo.moveTime += dt;
  if (choreo.moveTime > choreo.current.dur) choreo.setMove(choreo.moveIdx + 1);
  drive = Math.max(0, drive - dt * 0.9);
  const T = choreo.current.fn(choreo.phase, energy);
  const blend = 1 - Math.exp(-dt * 10);
  for (const k of POSE_KEYS) choreo.pose[k] += (T[k] - choreo.pose[k]) * blend;
  applyPose(rig, choreo.pose);
  rig.root.updateMatrixWorld(true);
  const k = 190;
  const c = 7.0;
  for (const ch of cheeks) {
    ch.anchor.getWorldPosition(tmp);
    ch.vx += (k * (tmp.x - ch.x) - c * ch.vx) * dt;
    ch.vy += (k * (tmp.y - ch.y) - c * ch.vy - GRAV) * dt;
    ch.vz += (k * (tmp.z - ch.z) - c * ch.vz) * dt;
    ch.x += ch.vx * dt;
    ch.y += ch.vy * dt;
    ch.z += ch.vz * dt;
  }
  return drive;
}

/** Place & squash-stretch the cheek meshes for the current frame. */
export function renderCheeks(rig: Rig, cheeks: readonly Cheek[]): void {
  rig.pelvis.getWorldQuaternion(pq);
  for (const ch of cheeks) {
    ch.g.position.set(ch.x, ch.y, ch.z);
    ch.g.quaternion.slerp(pq, 0.5); // orient with pelvis only (no fighting euler writes)
    const spd = Math.min(Math.hypot(ch.vx, ch.vy, ch.vz) * 0.085, 0.35);
    const sy = 1 + (ch.vy > 0 ? spd : -spd) * 0.8;
    ch.m.scale.set(1.06 / Math.sqrt(sy), 1.0 * sy, 0.94 / Math.sqrt(sy));
  }
}
