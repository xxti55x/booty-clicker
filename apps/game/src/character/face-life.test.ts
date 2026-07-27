import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  BLINK_MAX_S,
  BLINK_MIN_S,
  BLINK_S,
  GRIMACE_BROW,
  GRIMACE_S,
  PUPIL_HIDE_AT,
  PUPIL_MAX,
  REST_SCALE,
  aimPupils,
  applyFace,
  clampPupil,
  createFaceRig,
  createFaceState,
  faceView,
  forceBlink,
  lidClose,
  stepFace,
  triggerGrimace,
  type FaceRig,
} from './face-life';

/** Deterministischer „Zufall" — der Blinzel-Abstand liegt damit exakt fest. */
const fixed = (v: number) => (): number => v;

/** Handles wie `buildCharacter` sie registriert, nur ohne Material/Textur. */
function fakeFace(): FaceRig {
  const rig = createFaceRig();
  [-1, 1].forEach((s) => {
    const lid = new THREE.Mesh();
    lid.scale.y = REST_SCALE;
    rig.lids.push(lid);
    const pupil = new THREE.Mesh();
    pupil.position.set(s * 0.115, 0.035, 0.315);
    rig.pupils.push({ m: pupil, base: pupil.position.clone() });
    const brow = new THREE.Mesh();
    brow.rotation.z = s * -0.12;
    rig.brows.push({ m: brow, baseZ: brow.rotation.z, side: s });
  });
  const arc = new THREE.Mesh();
  arc.rotation.set(0.22, 0, Math.PI);
  arc.position.set(0, -0.095, 0.27);
  const o = new THREE.Mesh();
  o.scale.setScalar(REST_SCALE);
  rig.mouth = { arc, smileZ: Math.PI, frownZ: 0, smileY: -0.095, frownY: -0.19, o };
  return rig;
}

/** `n` Sekunden in 1/60-Schritten weiterdrehen (Blick geradeaus). */
function run(s: Parameters<typeof stepFace>[0], sec: number, rnd = fixed(0.5)): void {
  for (let i = 0; i < Math.round(sec * 60); i++) stepFace(s, 1 / 60, { x: 0, y: 0 }, rnd);
}

describe('G5 Blinzeln — der Takt', () => {
  it('blinzelt nicht vor der Mindestpause und dann im Fenster 3…6 s', () => {
    const s = createFaceState(fixed(0)); // kürzest möglicher Abstand
    expect(s.nextBlink).toBe(BLINK_MIN_S);
    run(s, BLINK_MIN_S - 0.2, fixed(0));
    expect(s.blinkLeft).toBe(0);
    run(s, 0.25, fixed(0));
    expect(s.blinkLeft).toBeGreaterThan(0);

    const late = createFaceState(fixed(1)); // längst möglicher Abstand
    expect(late.nextBlink).toBe(BLINK_MAX_S);
  });

  it('ein Blinzeln dauert 120 ms und läuft zu → auf → zu', () => {
    const s = createFaceState(fixed(0.5));
    forceBlink(s, fixed(0.5));
    expect(lidClose(s)).toBeCloseTo(0, 6); // Start: Augen offen
    stepFace(s, BLINK_S / 2, { x: 0, y: 0 }, fixed(0.5));
    expect(lidClose(s)).toBeCloseTo(1, 6); // Mitte: ganz zu
    stepFace(s, BLINK_S / 2, { x: 0, y: 0 }, fixed(0.5));
    expect(s.blinkLeft).toBe(0);
    expect(lidClose(s)).toBe(0); // Ende: wieder offen
  });

  it('forceBlink verlängert einen laufenden Blinzler nicht', () => {
    const s = createFaceState(fixed(0.5));
    forceBlink(s);
    stepFace(s, BLINK_S / 2, { x: 0, y: 0 });
    const left = s.blinkLeft;
    forceBlink(s);
    expect(s.blinkLeft).toBe(left);
  });

  it('bei geschlossenen Augen verschwinden die Pupillen (kein Glitch)', () => {
    const rig = fakeFace();
    const s = createFaceState(fixed(0.5));
    applyFace(rig, faceView(s, false));
    expect(rig.pupils[0]!.m.scale.x).toBe(1);
    expect(rig.lids[0]!.scale.y).toBe(REST_SCALE);

    forceBlink(s);
    stepFace(s, BLINK_S / 2, { x: 0, y: 0 });
    const v = faceView(s, false);
    expect(v.lid).toBeGreaterThan(PUPIL_HIDE_AT);
    applyFace(rig, v);
    expect(rig.lids[0]!.scale.y).toBeCloseTo(1, 6); // Lid unten
    expect(rig.pupils[0]!.m.scale.x).toBe(REST_SCALE); // Pupille weg
  });
});

describe('G5 Pupillen — Tracking', () => {
  it('der Versatz klemmt bei ±PUPIL_MAX', () => {
    expect(clampPupil(1)).toBe(PUPIL_MAX);
    expect(clampPupil(-1)).toBe(-PUPIL_MAX);
    expect(clampPupil(0)).toBe(0);
    expect(Math.abs(clampPupil(0.2))).toBeLessThan(PUPIL_MAX);
  });

  it('folgt träge (ein Lerp), erreicht aber das geklemmte Ziel', () => {
    const s = createFaceState(fixed(0.5));
    stepFace(s, 1 / 60, { x: 1, y: -1 });
    expect(s.px).toBeGreaterThan(0);
    expect(s.px).toBeLessThan(PUPIL_MAX * 0.5); // ein einzelner Frame springt nicht
    for (let i = 0; i < 120; i++) stepFace(s, 1 / 60, { x: 1, y: -1 });
    expect(s.px).toBeCloseTo(PUPIL_MAX, 4);
    expect(s.py).toBeCloseTo(-PUPIL_MAX, 4);
    // Gegenrichtung: der Blick wandert zurück, ohne je die Klemme zu verlassen.
    for (let i = 0; i < 240; i++) {
      stepFace(s, 1 / 60, { x: -1, y: 0 });
      expect(Math.abs(s.px)).toBeLessThanOrEqual(PUPIL_MAX + 1e-9);
    }
    expect(s.px).toBeCloseTo(-PUPIL_MAX, 4);
  });

  it('applyFace schreibt den Versatz absolut auf die Ruhelage', () => {
    const rig = fakeFace();
    const s = createFaceState(fixed(0.5));
    run(s, 2); // Ziel geradeaus ⇒ Versatz bleibt 0
    applyFace(rig, faceView(s, false));
    for (const p of rig.pupils) expect(p.m.position.x).toBeCloseTo(p.base.x, 9);

    for (let i = 0; i < 200; i++) stepFace(s, 1 / 60, { x: 1, y: 0 });
    applyFace(rig, faceView(s, false));
    for (const p of rig.pupils) {
      expect(p.m.position.x - p.base.x).toBeCloseTo(PUPIL_MAX, 4);
      expect(p.m.position.z).toBe(p.base.z); // Tiefe bleibt unangetastet
    }
  });

  it('aimPupils projiziert die Weltposition in die Kopf-Richtung', () => {
    const head = new THREE.Object3D();
    head.position.set(0, 1.6, 0);
    head.updateMatrixWorld(true);
    // Ziel rechts vom Kopf ⇒ positives x, Ziel links ⇒ negatives.
    expect(aimPupils(head, new THREE.Vector3(3, 1.6, 4)).x).toBeGreaterThan(0);
    expect(aimPupils(head, new THREE.Vector3(-3, 1.6, 4)).x).toBeLessThan(0);
    // Gedrehter Kopf: dasselbe Weltziel liegt jetzt auf der anderen Seite.
    head.rotation.y = Math.PI / 2;
    head.updateMatrixWorld(true);
    expect(aimPupils(head, new THREE.Vector3(3, 1.6, 4)).x).toBeLessThan(0);
    // Ziel im Kopf-Ursprung ⇒ Blick geradeaus statt NaN.
    head.rotation.y = 0;
    head.updateMatrixWorld(true);
    expect(aimPupils(head, new THREE.Vector3(0, 1.6, 0))).toEqual({ x: 0, y: 0 });
  });
});

describe('G5 Mund-Zustände + Grimasse', () => {
  it('Ekstase tauscht Lächel-Bogen gegen O-Mund und zurück', () => {
    const rig = fakeFace();
    const s = createFaceState(fixed(0.5));
    applyFace(rig, faceView(s, false));
    expect(rig.mouth!.arc.scale.x).toBe(1);
    expect(rig.mouth!.o.scale.x).toBe(REST_SCALE);

    applyFace(rig, faceView(s, true));
    expect(rig.mouth!.arc.scale.x).toBe(REST_SCALE);
    expect(rig.mouth!.o.scale.x).toBe(1);

    applyFace(rig, faceView(s, false));
    expect(rig.mouth!.arc.scale.x).toBe(1);
    expect(rig.mouth!.arc.rotation.z).toBe(rig.mouth!.smileZ);
  });

  it('der Boss-Timeout dreht den Mund 1.5 s um und stellt alles EXAKT zurück', () => {
    const rig = fakeFace();
    const s = createFaceState(fixed(0.5));
    const browBase = rig.brows.map((b) => b.m.rotation.z);

    triggerGrimace(s);
    expect(s.grimaceLeft).toBe(GRIMACE_S);
    applyFace(rig, faceView(s, false));
    expect(rig.mouth!.arc.rotation.z).toBe(rig.mouth!.frownZ); // Mundwinkel runter
    expect(rig.mouth!.arc.position.y).toBe(rig.mouth!.frownY); // und in die Mundzone
    rig.brows.forEach((b, i) => {
      expect(b.m.rotation.z).toBeCloseTo(browBase[i]! + b.side * GRIMACE_BROW, 9);
    });

    run(s, GRIMACE_S - 0.1);
    expect(faceView(s, false).mouth).toBe('frown'); // hält die volle Zeit
    run(s, 0.2);
    expect(s.grimaceLeft).toBe(0);
    applyFace(rig, faceView(s, false));
    expect(rig.mouth!.arc.rotation.z).toBe(rig.mouth!.smileZ);
    expect(rig.mouth!.arc.position.y).toBe(rig.mouth!.smileY);
    rig.brows.forEach((b, i) => expect(b.m.rotation.z).toBe(browBase[i])); // BYTE-gleich
  });

  it('die Grimasse schlägt die Ekstase (Verlust vor Party)', () => {
    const s = createFaceState(fixed(0.5));
    triggerGrimace(s);
    expect(faceView(s, true).mouth).toBe('frown');
    run(s, GRIMACE_S + 0.1);
    expect(faceView(s, true).mouth).toBe('o');
  });

  it('Blinzeln läuft während der Grimasse weiter (unabhängige Takte)', () => {
    const s = createFaceState(fixed(0));
    triggerGrimace(s);
    run(s, 1, fixed(0)); // 1 s in die Grimasse hinein
    forceBlink(s);
    stepFace(s, BLINK_S / 2, { x: 0, y: 0 });
    expect(s.blinkLeft).toBeGreaterThan(0);
    expect(lidClose(s)).toBeGreaterThan(0.9);
    expect(faceView(s, false).mouth).toBe('frown');
  });
});

describe('G5 Visor-/Masken-Stile', () => {
  it('ohne Gesicht (Ninja) ist applyFace ein No-op', () => {
    const rig = createFaceRig();
    const s = createFaceState(fixed(0.5));
    forceBlink(s);
    stepFace(s, BLINK_S / 2, { x: 0, y: 0 });
    expect(() => applyFace(rig, faceView(s, true))).not.toThrow();
    expect(rig.lids).toHaveLength(0);
    expect(rig.mouth).toBeNull();
  });

  it('der Robo blinkt mit den Visor-Pixeln und steht danach exakt auf 1', () => {
    const rig = createFaceRig();
    const px = [new THREE.Mesh(), new THREE.Mesh()];
    px.forEach((p) => rig.visorPixels.push(p));
    const s = createFaceState(fixed(0.5));

    applyFace(rig, faceView(s, false));
    expect(px[0]!.scale.y).toBe(1);
    forceBlink(s);
    stepFace(s, BLINK_S / 2, { x: 0, y: 0 });
    applyFace(rig, faceView(s, false));
    expect(px[0]!.scale.y).toBeLessThan(0.2); // Pixel fahren zusammen
    stepFace(s, BLINK_S / 2, { x: 0, y: 0 });
    applyFace(rig, faceView(s, false));
    expect(px[0]!.scale.y).toBe(1); // und exakt zurück
  });
});
