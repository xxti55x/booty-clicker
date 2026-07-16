import * as THREE from 'three';

import { mk, sh } from '../engine/materials';
import type { ArmRig, Cheek, LegRig, Rig, SkinConfig } from '../types';

/** Root sits at pelvis height; feet plant at y = -2.4 (~7-head proportions). */
export const BASE_ROOT_Y = -1.12;

export interface CharacterInstance {
  rig: Rig;
  cheeks: Cheek[];
}

/**
 * Build the articulated character for a skin. Ported 1:1 from the prototype's
 * ANATOMICAL RIG section. Pass the previous instance to detach it from the scene.
 */
export function buildCharacter(
  scene: THREE.Scene,
  cfg: SkinConfig,
  prev?: CharacterInstance | null,
): CharacterInstance {
  if (prev) {
    scene.remove(prev.rig.root);
    prev.cheeks.forEach((c) => scene.remove(c.g));
  }

  const robot = cfg.style === 'robot';
  const boss = cfg.style === 'boss';
  const host = cfg.style === 'host';
  const bulk = boss ? 1.22 : 1.0; // boss is broader & heavier

  const skinMat = mk({
    color: cfg.skin,
    roughness: robot ? 0.32 : 0.55,
    metalness: robot ? 0.9 : boss ? 0.75 : 0,
    clearcoat: boss ? 1 : 0.25,
    clearcoatRoughness: 0.4,
    envMapIntensity: robot || boss ? 1.3 : 0.6,
  });
  const shortsMat = mk({
    color: cfg.shorts,
    roughness: 0.3,
    metalness: robot ? 0.85 : boss ? 0.5 : 0.05,
    clearcoat: 0.85,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.0,
  });
  const suitMat = host
    ? mk({ color: 0x14141f, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0x30304a) })
    : skinMat;
  const darkMat = mk({ color: 0x15151c, roughness: 0.4, metalness: 0.5 });
  const jointMat = mk({ color: 0x3a4250, roughness: 0.3, metalness: 0.95 });

  const root = new THREE.Group();
  scene.add(root);
  root.position.y = BASE_ROOT_Y;
  root.scale.setScalar(boss ? 1.12 : 1);

  // ---------- PELVIS ----------
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.9;
  root.add(pelvis);
  if (robot) {
    pelvis.add(sh(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.38, 0.5), shortsMat)));
  } else {
    const hip = sh(new THREE.Mesh(new THREE.SphereGeometry(0.36 * bulk, 28, 28), shortsMat));
    hip.scale.set(1.15, 0.7, 0.95);
    pelvis.add(hip);
  }
  const anchorL = new THREE.Object3D();
  anchorL.position.set(0.19 * bulk, -0.02, -0.26);
  pelvis.add(anchorL);
  const anchorR = new THREE.Object3D();
  anchorR.position.set(-0.19 * bulk, -0.02, -0.26);
  pelvis.add(anchorR);

  // ---------- SPINE / TORSO ----------
  const spine = new THREE.Group();
  spine.position.y = 0.2;
  pelvis.add(spine);
  if (robot) {
    const abdomen = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 10), jointMat));
    abdomen.position.y = 0.3;
    spine.add(abdomen);
    const chest = sh(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.55), skinMat));
    chest.position.y = 0.95;
    spine.add(chest);
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 24),
      mk({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 3 }),
    );
    core.position.set(0, 0.98, 0.281);
    spine.add(core);
  } else {
    // tapered natural torso: abdomen narrower, chest broader
    const abdomen = sh(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.27 * bulk, 0.31 * bulk, 0.55, 26),
        host ? mk({ color: 0xf4f4f8, roughness: 0.7 }) : skinMat, // host: white shirt
      ),
    );
    abdomen.position.y = 0.28;
    spine.add(abdomen);
    const chest = sh(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.4 * bulk, 0.28 * bulk, 0.72, 26),
        host ? suitMat : skinMat,
      ),
    );
    chest.position.y = 0.92;
    spine.add(chest);
    if (boss) {
      // muscular pecs
      [-1, 1].forEach((s) => {
        const pec = sh(new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20), skinMat));
        pec.position.set(s * 0.18, 1.05, 0.3);
        pec.scale.set(1.1, 0.8, 0.6);
        spine.add(pec);
      });
    }
  }
  // shoulders
  const shW = (robot ? 0.56 : 0.5) * bulk;
  [-1, 1].forEach((s) => {
    const cap = sh(
      new THREE.Mesh(
        new THREE.SphereGeometry(robot ? 0.17 : 0.15 * bulk, 20, 20),
        robot ? jointMat : host ? suitMat : skinMat,
      ),
    );
    cap.position.set(s * shW, 1.24, 0);
    spine.add(cap);
  });
  // neck + head
  const neck = sh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.24, 16), robot ? jointMat : skinMat),
  );
  neck.position.y = 1.42;
  spine.add(neck);
  const head = new THREE.Group();
  head.position.y = 1.66;
  spine.add(head);
  if (robot) {
    head.add(sh(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), skinMat)));
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.14, 0.06),
      mk({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 2.5 }),
    );
    visor.position.set(0, 0.06, 0.26);
    head.add(visor);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), jointMat);
    ant.position.y = 0.42;
    head.add(ant);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      mk({ color: 0xff3355, emissive: 0xff3355, emissiveIntensity: 3 }),
    );
    bulb.position.y = 0.58;
    head.add(bulb);
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12), jointMat);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(s * 0.28, 0.05, 0);
      head.add(ear);
    });
  } else {
    const skull = sh(new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), skinMat));
    skull.scale.set(0.88, 1.08, 0.94);
    head.add(skull);
    const jaw = sh(new THREE.Mesh(new THREE.SphereGeometry(0.21, 24, 24), skinMat));
    jaw.position.set(0, -0.16, 0.05);
    jaw.scale.set(0.85, 0.75, 0.9);
    head.add(jaw);
    // hair
    if (cfg.style === 'disco') {
      const afro = sh(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 24, 24),
          mk({ color: cfg.hair, roughness: 0.95 }),
        ),
      );
      afro.position.y = 0.14;
      head.add(afro);
      const g = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 0.11, 0.05),
        mk({ color: 0x111111, roughness: 0.08, metalness: 0.9, clearcoat: 1 }),
      );
      g.position.set(0, 0.03, 0.27);
      head.add(g);
    } else if (!boss) {
      const hair = sh(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.31, 24, 24),
          mk({ color: cfg.hair, roughness: 0.92 }),
        ),
      );
      hair.position.set(0, 0.09, -0.03);
      hair.scale.set(0.92, 0.95, 0.95);
      head.add(hair);
    }
    if (boss) {
      [-1, 1].forEach((s) => {
        const e = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 12, 12),
          mk({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 4 }),
        );
        e.position.set(s * 0.11, 0.02, 0.26);
        head.add(e);
      });
      const crown = new THREE.Group();
      crown.add(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.26, 0.14, 20, 1, true),
          mk({
            color: 0xffd24d,
            roughness: 0.12,
            metalness: 1,
            clearcoat: 1,
            envMapIntensity: 1.8,
            side: THREE.DoubleSide,
          }),
        ),
      );
      for (let i = 0; i < 7; i++) {
        const sp = new THREE.Mesh(
          new THREE.ConeGeometry(0.05, 0.16, 8),
          mk({ color: 0xffd24d, roughness: 0.12, metalness: 1 }),
        );
        const a = (i / 7) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.26, 0.14, Math.sin(a) * 0.26);
        crown.add(sp);
      }
      crown.position.y = 0.32;
      head.add(crown);
    }
  }

  // ---------- ARMS (shoulder→elbow→hand) ----------
  function arm(s: number): ArmRig {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * shW, 1.24, 0);
    spine.add(shoulder);
    const upperMat = host ? suitMat : skinMat;
    const aw = robot ? 0.1 : 0.1 * bulk;
    const upper = sh(new THREE.Mesh(new THREE.CylinderGeometry(aw + 0.015, aw, 0.8, 18), upperMat));
    upper.position.y = -0.4;
    shoulder.add(upper);
    if (boss) {
      const delt = sh(new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 18), skinMat));
      delt.position.y = -0.05;
      shoulder.add(delt);
    }
    const elbow = new THREE.Group();
    elbow.position.y = -0.8;
    shoulder.add(elbow);
    if (robot) {
      const j = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 14), jointMat);
      elbow.add(j);
    }
    const fore = sh(
      new THREE.Mesh(new THREE.CylinderGeometry(aw, aw - 0.02, 0.72, 18), host ? suitMat : skinMat),
    );
    fore.position.y = -0.36;
    elbow.add(fore);
    const hand = sh(
      new THREE.Mesh(
        robot ? new THREE.BoxGeometry(0.16, 0.2, 0.12) : new THREE.SphereGeometry(0.11, 14, 14),
        skinMat,
      ),
    );
    hand.position.y = -0.76;
    elbow.add(hand);
    return { shoulder, elbow, hand };
  }
  const armL = arm(1);
  const armR = arm(-1);
  if (host) {
    // microphone in right hand
    const mic = new THREE.Group();
    mic.add(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10),
        mk({ color: 0x222222, roughness: 0.4, metalness: 0.6 }),
      ),
    );
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 14, 14),
      mk({ color: 0x3a3a3a, roughness: 0.7, metalness: 0.3 }),
    );
    ball.position.y = 0.2;
    mic.add(ball);
    mic.position.y = -0.76;
    mic.rotation.x = 1.1;
    armR.elbow.add(mic);
  }

  // ---------- LEGS (hip→knee→foot) ----------
  function leg(s: number): LegRig {
    const thigh = new THREE.Group();
    thigh.position.set(s * 0.22 * bulk, -0.02, 0);
    pelvis.add(thigh);
    const lw = robot ? 0.13 : 0.15 * bulk;
    const th = sh(
      new THREE.Mesh(
        new THREE.CylinderGeometry(lw + 0.04, lw, 1.02, 20),
        robot ? skinMat : shortsMat,
      ),
    ); // shorts cover upper thigh
    th.position.y = -0.51;
    thigh.add(th);
    if (!robot) {
      const lower = sh(
        new THREE.Mesh(new THREE.CylinderGeometry(lw + 0.005, lw - 0.01, 0.5, 18), skinMat),
      );
      lower.position.y = -0.85;
      thigh.add(lower);
    }
    const knee = new THREE.Group();
    knee.position.y = -1.02;
    thigh.add(knee);
    if (robot) {
      knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14), jointMat));
    }
    const shin = sh(
      new THREE.Mesh(
        new THREE.CylinderGeometry(lw - 0.01, lw - 0.05, 0.98, 18),
        robot ? skinMat : host ? suitMat : skinMat,
      ),
    );
    shin.position.y = -0.49;
    knee.add(shin);
    const foot = sh(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.12, 0.48),
        robot ? jointMat : host || boss ? darkMat : skinMat,
      ),
    );
    foot.position.set(0, -1.0, 0.12);
    knee.add(foot);
    return { thigh, knee };
  }
  const legL = leg(1);
  const legR = leg(-1);

  // ---------- STYLE EXTRAS ----------
  if (host) {
    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.42, 0.04),
      mk({ color: 0xa8e831, roughness: 0.4 }),
    );
    tie.position.set(0, 0.9, 0.3);
    tie.rotation.x = 0.08;
    spine.add(tie);
    [-1, 1].forEach((s) => {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.03), suitMat);
      lapel.position.set(s * 0.14, 0.95, 0.31);
      lapel.rotation.z = s * 0.25;
      spine.add(lapel);
    });
  }
  if (boss) {
    [-1, 1].forEach((s) => {
      const pauldron = sh(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 20, 20),
          mk({ color: 0xffd24d, roughness: 0.15, metalness: 1, clearcoat: 1 }),
        ),
      );
      pauldron.position.set(s * shW, 1.3, 0);
      pauldron.scale.set(1.1, 0.8, 1.1);
      spine.add(pauldron);
    });
    const belt = sh(
      new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.06, 12, 28),
        mk({ color: 0xffd24d, roughness: 0.15, metalness: 1 }),
      ),
    );
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.08;
    pelvis.add(belt);
    const cape = sh(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 1.1, 2.1, 28, 1, true),
        mk({ color: 0x5a0e0e, roughness: 0.65, side: THREE.DoubleSide }),
      ),
    );
    cape.position.set(0, 0.45, 0.22); // cape hangs at the back (+z = rear)
    spine.add(cape);
  }

  // ---------- CHEEKS (soft bodies, world space) ----------
  const cheekR = robot ? 0.3 : 0.4 * (boss ? 1.15 : 1);
  function mkCheek(anchor: THREE.Object3D, s: number): Cheek {
    const g = new THREE.Group();
    const m = sh(new THREE.Mesh(new THREE.SphereGeometry(cheekR, 40, 40), shortsMat));
    m.scale.set(1.06, 1.0, 0.94);
    g.add(m);
    scene.add(g);
    return { g, m, side: s, anchor, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  }
  const cheeks: Cheek[] = [mkCheek(anchorL, 1), mkCheek(anchorR, -1)];

  const rig: Rig = { root, pelvis, spine, head, armL, armR, legL, legR };
  root.updateMatrixWorld(true);
  const t = new THREE.Vector3();
  cheeks.forEach((c) => {
    c.anchor.getWorldPosition(t);
    c.x = t.x;
    c.y = t.y;
    c.z = t.z;
  });

  return { rig, cheeks };
}
