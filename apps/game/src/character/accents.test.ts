import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  POP_BASE,
  POP_MAX,
  POP_ONBEAT,
  POP_PER_TIER,
  WIND_PULL,
  applyAccents,
  applyIdleLife,
  createAccents,
  stepAccents,
  triggerClickAccent,
} from './accents';
import type { Rig } from '../types';

/** Minimal rig double: real Object3Ds so rotations/positions behave like the game. */
function fakeRig(): Rig {
  const g = (): THREE.Group => new THREE.Group();
  const arm = (): { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Mesh } => ({
    shoulder: g(),
    elbow: g(),
    hand: new THREE.Mesh(),
  });
  const leg = (): { thigh: THREE.Group; knee: THREE.Group } => ({ thigh: g(), knee: g() });
  return {
    root: g(),
    pelvis: g(),
    spine: g(),
    head: g(),
    armL: arm(),
    armR: arm(),
    legL: leg(),
    legR: leg(),
  };
}

describe('click accents — Klick → Tanz', () => {
  it('a click kicks the pop, scaled by tier and on-beat, crits flare', () => {
    const a = createAccents();
    triggerClickAccent(a, 0, false, false);
    expect(a.pop).toBeCloseTo(POP_BASE, 6);
    expect(a.crit).toBe(0);

    const b = createAccents();
    triggerClickAccent(b, 4, true, true);
    expect(b.pop).toBeCloseTo(POP_BASE + 4 * POP_PER_TIER + POP_ONBEAT, 6);
    expect(b.crit).toBe(1);
  });

  it('mashing clamps at POP_MAX — the pose can never fold in half', () => {
    const a = createAccents();
    for (let i = 0; i < 50; i++) triggerClickAccent(a, 4, false, true);
    expect(a.pop).toBeLessThanOrEqual(POP_MAX);
  });

  it('impulses decay to silence', () => {
    const a = createAccents();
    triggerClickAccent(a, 4, true, true);
    for (let i = 0; i < 240; i++) stepAccents(a, 1 / 120); // 2 s
    expect(a.pop).toBe(0);
    expect(a.crit).toBe(0);
  });

  it('applyAccents writes additive offsets only while impulses are live', () => {
    const rig = fakeRig();
    const a = createAccents();
    applyAccents(rig, a, false, 0);
    expect(rig.pelvis.rotation.x).toBe(0); // silent accents leave the rig alone
    expect(rig.armL.shoulder.rotation.z).toBe(0);

    triggerClickAccent(a, 2, true, false);
    applyAccents(rig, a, false, 0);
    expect(rig.pelvis.rotation.x).toBeLessThan(0); // booty flick
    expect(rig.root.position.y).toBeLessThan(0); // body dip
    expect(rig.armL.shoulder.rotation.z).toBeGreaterThan(0); // crit flare (mirrored)
    expect(rig.armR.shoulder.rotation.z).toBeLessThan(0);
  });

  it('applyIdleLife is silent at calm 0 except for the beat nod (D-21)', () => {
    const rig = fakeRig();
    applyIdleLife(rig, 1.23, 0, 0);
    expect(rig.spine.rotation.x).toBe(0); // volle Choreografie ⇒ keine Ruhe-Ebene
    expect(rig.pelvis.rotation.z).toBe(0);
    expect(rig.root.position.y).toBe(0);
    expect(rig.head.rotation.x).toBe(0);
  });

  it('applyIdleLife breathes at calm 1 and is deterministic (D-21)', () => {
    const a = fakeRig();
    const b = fakeRig();
    applyIdleLife(a, 1.23, 1, 0.5);
    applyIdleLife(b, 1.23, 1, 0.5);
    expect(Math.abs(a.spine.rotation.x)).toBeGreaterThan(0);
    expect(Math.abs(a.pelvis.rotation.z)).toBeGreaterThan(0);
    expect(a.head.rotation.x).toBeLessThan(0); // Kopf-Nick auf den Beat
    // Gleiche Eingabe ⇒ gleiche Pose: kein Zustand, keine Zufallszahl.
    expect(b.spine.rotation.x).toBe(a.spine.rotation.x);
    expect(b.root.position.y).toBe(a.root.position.y);
  });

  it('Ekstase adds the shimmy oscillation even with no click impulses', () => {
    const rig = fakeRig();
    const a = createAccents();
    applyAccents(rig, a, true, 0.4);
    expect(Math.abs(rig.spine.rotation.y)).toBeGreaterThan(0);
    expect(Math.abs(rig.pelvis.rotation.z)).toBeGreaterThan(0);
  });

  it('D-22: windup zieht kurz GEGEN die Pop-Richtung, dann schlägt der Pop durch', () => {
    // Mit Windup: die Pelvis steht in den ersten Frames um WIND_PULL höher
    // (Aufladung) als ohne — dieselben Klick-Parameter, gleicher Pop.
    const withWind = createAccents();
    const noWind = createAccents();
    triggerClickAccent(withWind, 2, false, false, true);
    triggerClickAccent(noWind, 2, false, false, false);
    expect(noWind.wind).toBe(0);
    const rigA = fakeRig();
    const rigB = fakeRig();
    applyAccents(rigA, withWind, false, 0);
    applyAccents(rigB, noWind, false, 0);
    expect(rigA.pelvis.rotation.x - rigB.pelvis.rotation.x).toBeCloseTo(WIND_PULL, 6);
  });

  it('D-22: windup verfliegt in wenigen Frames (K-5-Mikro) und wird still', () => {
    const a = createAccents();
    triggerClickAccent(a, 0, false, false, true);
    expect(a.wind).toBe(1);
    for (let i = 0; i < 6; i++) stepAccents(a, 1 / 60); // 100 ms
    expect(a.wind).toBeLessThan(0.5); // Gegenzug vorbei — der Anschlag steht
    for (let i = 0; i < 120; i++) stepAccents(a, 1 / 60);
    expect(a.wind).toBe(0);
  });
});
