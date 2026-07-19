import * as THREE from 'three';

import { INK, sh, toonMat, withOutline } from '../engine/materials';
import {
  brushedTex,
  carbonTex,
  pinstripeTex,
  poreTex,
  repeated,
  sequinTex,
  strandTex,
  velvetTex,
  weaveTex,
} from '../engine/textures';
import type { ArmRig, Cheek, LegRig, Rig, SkinConfig } from '../types';

/** Root sits at pelvis height; feet plant at y = -2.4 (~7-head proportions). */
export const BASE_ROOT_Y = -1.12;

export interface CharacterInstance {
  rig: Rig;
  cheeks: Cheek[];
}

/**
 * Build the articulated character for a skin — cartoon edition (Wave 1).
 *
 * The SKELETON is untouched from the prototype: every bone the physics
 * reads/writes (`root/pelvis/spine/head/armX.shoulder/elbow/hand/
 * legX.thigh/knee`, the cheek anchors and the world-space `Cheek` list) keeps
 * its name, hierarchy and pivot transform, so `stepPhysics`/`renderCheeks`
 * animate exactly as before. Only the MESHES hanging under those bones are
 * new: cel-shaded (`toonMat`), ink-outlined (`withOutline`), with big round
 * heads, simple cartoon faces, chunky tapered limbs and mitt hands.
 * Pass the previous instance to detach it from the scene.
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
  const disco = cfg.style === 'disco';
  const flair = cfg.flair;
  const ninja = flair === 'ninja';
  const bulk = boss ? 1.22 : 1.0; // boss is broader & heavier

  // ---------- cartoon palette ----------
  const bands = cfg.bands;
  const line = cfg.outline ?? INK;
  const accent = cfg.accent ?? (robot ? 0x38bdf8 : boss ? 0xffd24d : 0xa8e831);
  // Roadmap T3: Haut = hauchzartes Poren-Rauschen (Robo: gebürstetes Chassis-
  // Metall), Haare = Strähnen — near-white, der Skin-Farbton tintet weiter.
  const skinT = toonMat({
    color: cfg.skin,
    bands,
    map: robot ? repeated(brushedTex(2), 2, 2) : repeated(poreTex(1), 2, 2),
  });
  // Shorts (und Cheeks) tragen PRO STIL ihren eigenen Stoff (Goal „apply
  // texture to all models"): Robo bürstet Metall, Disco glitzert Pailletten
  // (mit Emissive-Funkeln), Ninja webt Carbon, der Showmaster trägt
  // Nadelstreifen, der Boss Samt — alle anderen das feine Gewebe.
  const shortsDetail = robot
    ? repeated(brushedTex(3), 2, 2)
    : disco
      ? repeated(sequinTex(9), 2.4, 2.4)
      : ninja
        ? repeated(carbonTex(), 3, 3)
        : host
          ? repeated(pinstripeTex(12), 2, 2)
          : boss
            ? repeated(velvetTex(1), 1.6, 1.6)
            : repeated(weaveTex(), 3, 3);
  const shortsT = toonMat({
    color: cfg.shorts,
    bands,
    map: shortsDetail,
    ...(disco
      ? { emissiveMap: repeated(sequinTex(9), 2.4, 2.4), emissive: accent, emissiveIntensity: 0.2 }
      : {}),
  });
  const hairT = toonMat({ color: cfg.hair, bands, map: repeated(strandTex(1), 2, 2) });
  // host: the `shorts` colour doubles as the suit fabric (trousers + jacket).
  const suitT = shortsT;
  const jointT = toonMat({ color: 0x525c6e, bands });
  const darkT = toonMat({ color: 0x1d1d26, bands });
  const shoeT = robot
    ? jointT
    : host || boss || ninja || flair === 'lava'
      ? darkT
      : toonMat({ color: 0xf2f3f6, bands });
  const glowT = toonMat({ color: accent, emissive: accent, emissiveIntensity: 0.9, bands });
  // Facial ink + eye whites are unlit so the face always reads.
  const inkFlat = new THREE.MeshBasicMaterial({ color: line, toneMapped: false });
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  /** Shadow-cast + ink-outline a mesh (the default treatment for body parts). */
  const O = <M extends THREE.Mesh>(m: M, thickness?: number): M =>
    withOutline(sh(m), { color: line, thickness });

  // Bones carry stable names so exported glbs stay animatable outside the game
  // (the Blender pipeline keyframes nodes by these names).
  const root = new THREE.Group();
  root.name = 'root';
  scene.add(root);
  root.position.y = BASE_ROOT_Y;
  root.scale.setScalar(boss ? 1.12 : 1);

  // ---------- PELVIS ----------
  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  pelvis.position.y = 0.9;
  root.add(pelvis);
  if (robot) {
    pelvis.add(O(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.4, 0.54), shortsT)));
  } else {
    const hip = O(new THREE.Mesh(new THREE.SphereGeometry(0.38 * bulk, 28, 28), shortsT));
    hip.scale.set(1.22, 0.72, 1.0);
    pelvis.add(hip);
  }
  if (ninja || flair === 'lava') {
    // glowing power-belt
    const belt = O(new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.055, 10, 26), glowT), 0.012);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.14;
    pelvis.add(belt);
  }
  const anchorL = new THREE.Object3D();
  anchorL.name = 'anchorL';
  anchorL.position.set(0.19 * bulk, -0.02, -0.26);
  pelvis.add(anchorL);
  const anchorR = new THREE.Object3D();
  anchorR.name = 'anchorR';
  anchorR.position.set(-0.19 * bulk, -0.02, -0.26);
  pelvis.add(anchorR);

  // ---------- SPINE / TORSO ----------
  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.y = 0.2;
  pelvis.add(spine);
  if (robot) {
    const abdomen = O(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 12), jointT));
    abdomen.position.y = 0.3;
    spine.add(abdomen);
    const chest = O(new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.8, 0.56), skinT));
    chest.position.y = 0.95;
    spine.add(chest);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), glowT);
    core.position.set(0, 0.98, 0.285);
    spine.add(core);
    const coreRim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 24), inkFlat);
    coreRim.position.copy(core.position);
    spine.add(coreRim);
  } else {
    // soft pear torso: belly wider at the hips, chest broader up top
    const abdomen = O(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.26 * bulk, 0.33 * bulk, 0.55, 24),
        host ? toonMat({ color: 0xf4f4f8, bands }) : skinT, // host: white shirt
      ),
    );
    abdomen.position.y = 0.28;
    spine.add(abdomen);
    const chest = O(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.38 * bulk, 0.27 * bulk, 0.72, 24),
        host ? suitT : skinT,
      ),
    );
    chest.position.y = 0.92;
    spine.add(chest);
    if (boss) {
      // muscular pecs
      [-1, 1].forEach((s) => {
        const pec = O(new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 20), skinT));
        pec.position.set(s * 0.19, 1.06, 0.3);
        pec.scale.set(1.12, 0.8, 0.62);
        spine.add(pec);
      });
    }
  }
  // shoulders
  const shW = (robot ? 0.58 : 0.52) * bulk;
  [-1, 1].forEach((s) => {
    const cap = O(
      new THREE.Mesh(
        new THREE.SphereGeometry(robot ? 0.18 : 0.16 * bulk, 20, 20),
        robot ? jointT : host ? suitT : skinT,
      ),
    );
    cap.position.set(s * shW, 1.24, 0);
    spine.add(cap);
  });
  // neck + head
  const neck = O(
    new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.24, 14), robot ? jointT : skinT),
  );
  neck.position.y = 1.42;
  spine.add(neck);
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.66;
  // Cartoon proportions: oversized head (physics only writes head.rotation,
  // so scaling the bone is silhouette-safe).
  head.scale.setScalar(robot ? 1.08 : 1.18);
  spine.add(head);

  /**
   * Simple cartoon face: googly white eyes + pupils, brows, button nose,
   * torus-arc smile and blush. Variants: angry V-brows with glowing pupils
   * (boss/lava), a pirate eyepatch, and grin width.
   */
  function face(opts: {
    angry?: boolean;
    glow?: number;
    patch?: boolean;
    grin?: number;
    blush?: number;
  }): void {
    const grin = opts.grin ?? 0.095;
    const eye = (s: number): void => {
      const w = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.08, 18, 18), eyeWhite), {
        color: line,
        thickness: 0.012,
      });
      w.scale.set(1, 1.28, 0.6);
      w.position.set(s * 0.12, 0.04, 0.26);
      head.add(w);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 12, 12),
        opts.glow !== undefined
          ? toonMat({ color: opts.glow, emissive: opts.glow, emissiveIntensity: 1.4, bands })
          : inkFlat,
      );
      pupil.position.set(s * 0.115, 0.035, 0.315);
      head.add(pupil);
    };
    eye(1);
    if (opts.patch) {
      // eyepatch over the (viewer-right) eye + strap around the head
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 16), inkFlat);
      patch.scale.set(1.05, 1.15, 0.45);
      patch.position.set(-0.12, 0.045, 0.27);
      head.add(patch);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.016, 8, 28), inkFlat);
      strap.position.set(0, 0.05, 0);
      strap.rotation.set(0.35, 0, -0.28);
      head.add(strap);
    } else {
      eye(-1);
    }
    [-1, 1].forEach((s) => {
      if (opts.patch && s === -1) return; // brow hidden under the patch strap
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.03, 0.03), inkFlat);
      brow.position.set(s * 0.12, opts.angry ? 0.14 : 0.17, 0.27);
      brow.rotation.z = s * (opts.angry ? 0.42 : -0.12);
      head.add(brow);
    });
    const nose = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), skinT), {
      color: line,
      thickness: 0.008,
    });
    nose.position.set(0, -0.045, 0.3);
    head.add(nose);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(grin, 0.02, 8, 16, Math.PI), inkFlat);
    smile.position.set(0, -0.095, 0.27);
    smile.rotation.set(0.22, 0, Math.PI); // arc opens upward ⇒ smile
    head.add(smile);
    if (opts.blush !== undefined) {
      [-1, 1].forEach((s) => {
        const b = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 12, 12),
          toonMat({ color: opts.blush!, bands }),
        );
        b.scale.set(1.1, 0.62, 0.4);
        b.position.set(s * 0.21, -0.055, 0.2);
        head.add(b);
      });
    }
  }

  if (robot) {
    head.add(O(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.52), skinT)));
    // big friendly visor with two glowing pixel-eyes
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.08), darkT);
    visor.position.set(0, 0.05, 0.26);
    head.add(withOutline(visor, { color: line, thickness: 0.012 }));
    [-1, 1].forEach((s) => {
      const px = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.03), glowT);
      px.position.set(s * 0.11, 0.05, 0.3);
      head.add(px);
    });
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), jointT);
    ant.position.y = 0.44;
    head.add(ant);
    const bulb = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), glowT), {
      color: line,
      thickness: 0.012,
    });
    bulb.position.y = 0.62;
    head.add(bulb);
    [-1, 1].forEach((s) => {
      const ear = O(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 12), jointT), 0.012);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(s * 0.31, 0.05, 0);
      head.add(ear);
    });
    if (flair === 'saucer') {
      // tilted flying-saucer halo with glow studs
      const ring = O(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.52, 0.05, 10, 30),
          toonMat({ color: 0xd7dee9, bands }),
        ),
        0.012,
      );
      ring.rotation.x = Math.PI / 2 - 0.28;
      ring.position.y = 0.08;
      head.add(ring);
      for (let i = 0; i < 3; i++) {
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), glowT);
        const a = (i / 3) * Math.PI * 2 + 0.6;
        stud.position.set(Math.cos(a) * 0.52, 0.08 + Math.sin(a) * 0.15, Math.sin(a) * 0.5);
        head.add(stud);
      }
    }
  } else {
    // big round cartoon head
    const skull = O(new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 32), ninja ? hairT : skinT));
    skull.scale.set(0.92, 1.02, 0.9);
    head.add(skull);
    const jaw = O(new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 24), ninja ? hairT : skinT));
    jaw.position.set(0, -0.17, 0.04);
    jaw.scale.set(0.9, 0.7, 0.88);
    head.add(jaw);

    if (ninja) {
      // hooded head: glowing almond eyes behind the mask slit + headband
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.05), darkT);
      slit.position.set(0, 0.05, 0.27);
      head.add(slit);
      [-1, 1].forEach((s) => {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), glowT);
        e.scale.set(1.5, 0.9, 0.5);
        e.position.set(s * 0.095, 0.05, 0.3);
        head.add(e);
      });
      const band = O(new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.035, 8, 28), glowT), 0.01);
      band.position.y = 0.12;
      band.rotation.x = Math.PI / 2 - 0.18;
      head.add(band);
      [-0.16, 0.02].forEach((dx, i) => {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.02), glowT);
        tail.position.set(dx, -0.02, -0.31);
        tail.rotation.z = i === 0 ? 0.45 : 0.15;
        head.add(tail);
      });
    } else if (flair === 'lava') {
      face({ angry: true, glow: accent, grin: 0.1 });
      // flame mohawk — emissive cones, hot core + orange rim
      const flames: [number, number, number, number][] = [
        [0, 0.42, 0.02, 0.44], // x, h offset base y computed below, z, height
        [0.12, 0.36, -0.04, 0.3],
        [-0.12, 0.36, -0.04, 0.3],
        [0.05, 0.32, 0.12, 0.24],
        [-0.06, 0.3, -0.16, 0.22],
      ];
      flames.forEach(([x, y, z, h], i) => {
        const f = O(
          new THREE.Mesh(
            new THREE.ConeGeometry(0.085, h, 10),
            i === 0
              ? toonMat({ color: 0xffd23e, emissive: 0xffb020, emissiveIntensity: 1.1, bands })
              : glowT,
          ),
          0.01,
        );
        f.position.set(x, y, z);
        f.rotation.z = -x * 1.2;
        head.add(f);
      });
    } else if (flair === 'pirate') {
      face({ patch: true, grin: 0.1, blush: 0xff9a80 });
      // bandana + knot + gold earring
      const bandana = O(new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 24), hairT));
      bandana.position.y = 0.11;
      bandana.scale.set(0.95, 0.78, 0.93);
      head.add(bandana);
      [-1, 1].forEach((s) => {
        const knot = O(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.03), hairT), 0.01);
        knot.position.set(0.22 + s * 0.05, -0.02, -0.28);
        knot.rotation.z = 0.5 + s * 0.25;
        head.add(knot);
      });
      const ring = O(
        new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 16), glowT), // gold accent
        0.008,
      );
      ring.position.set(0.3, -0.12, 0.02);
      head.add(ring);
    } else if (disco) {
      face({ grin: 0.1, blush: 0xd9765a });
      // giant afro + star glasses bar
      const afro = O(new THREE.Mesh(new THREE.SphereGeometry(0.5, 26, 26), hairT), 0.026);
      afro.position.y = 0.17;
      head.add(afro);
      const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.13, 0.06), darkT);
      glasses.position.set(0, 0.05, 0.28);
      head.add(withOutline(glasses, { color: accent, thickness: 0.014 })); // gold rims
    } else if (boss) {
      const ice = flair === 'ice';
      face({
        angry: !ice,
        glow: ice ? accent : 0xff2200,
        grin: 0.12,
        blush: ice ? 0x9fd8ff : undefined,
      });
      if (ice) {
        // crystal crown — jagged gem spikes
        const gem = toonMat({ color: accent, emissive: accent, emissiveIntensity: 0.35, bands });
        const spikes: [number, number][] = [
          [0, 0.36],
          [0.14, 0.24],
          [-0.14, 0.24],
          [0.24, 0.16],
          [-0.24, 0.16],
        ];
        spikes.forEach(([x, h]) => {
          const cSpike = O(new THREE.Mesh(new THREE.ConeGeometry(0.07, h, 6), gem), 0.01);
          cSpike.position.set(x, 0.3 + h * 0.3, -0.02);
          cSpike.rotation.z = -x * 0.9;
          head.add(cSpike);
        });
      } else {
        const crown = new THREE.Group();
        const goldT = toonMat({ color: accent, bands });
        crown.add(
          O(
            new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 20, 1, false), goldT),
            0.014,
          ),
        );
        for (let i = 0; i < 7; i++) {
          const sp = O(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 8), goldT), 0.01);
          const a = (i / 7) * Math.PI * 2;
          sp.position.set(Math.cos(a) * 0.28, 0.16, Math.sin(a) * 0.28);
          crown.add(sp);
        }
        crown.position.y = 0.34;
        head.add(crown);
      }
    } else if (host) {
      face({ grin: 0.11, blush: 0xe89a72 });
      // slick showbiz hair with a side part
      const hair = O(new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 24), hairT));
      hair.position.set(0, 0.1, -0.04);
      hair.scale.set(0.95, 0.82, 0.95);
      head.add(hair);
      const quiff = O(new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), hairT), 0.012);
      quiff.position.set(0.1, 0.3, 0.16);
      quiff.scale.set(1.4, 0.7, 1);
      head.add(quiff);
    } else {
      // classic human (Klassiker / recolours)
      face({ grin: 0.095, blush: 0xef8f74 });
      const hair = O(new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 24), hairT));
      hair.position.set(0, 0.1, -0.04);
      hair.scale.set(0.94, 0.88, 0.95);
      head.add(hair);
      const quiff = O(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), hairT), 0.012);
      quiff.position.set(-0.08, 0.31, 0.17);
      quiff.scale.set(1.5, 0.75, 1);
      head.add(quiff);
    }
  }

  // ---------- ARMS (shoulder→elbow→hand) ----------
  function arm(s: number): ArmRig {
    const shoulder = new THREE.Group();
    shoulder.name = s > 0 ? 'shoulderL' : 'shoulderR';
    shoulder.position.set(s * shW, 1.24, 0);
    spine.add(shoulder);
    const upperMat = host ? suitT : skinT;
    const aw = robot ? 0.11 : 0.105 * bulk;
    const upper = O(new THREE.Mesh(new THREE.CylinderGeometry(aw + 0.03, aw, 0.8, 16), upperMat));
    upper.position.y = -0.4;
    shoulder.add(upper);
    if (boss) {
      const delt = O(new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 18), skinT));
      delt.position.y = -0.03;
      shoulder.add(delt);
    }
    const elbow = new THREE.Group();
    elbow.name = s > 0 ? 'elbowL' : 'elbowR';
    elbow.position.y = -0.8;
    shoulder.add(elbow);
    if (robot) {
      elbow.add(O(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), jointT), 0.012));
    }
    const fore = O(
      new THREE.Mesh(new THREE.CylinderGeometry(aw, aw - 0.025, 0.72, 16), host ? suitT : skinT),
    );
    fore.position.y = -0.36;
    elbow.add(fore);
    if (ninja) {
      const wrap = O(
        new THREE.Mesh(new THREE.CylinderGeometry(aw + 0.015, aw + 0.015, 0.16, 12), glowT),
        0.008,
      );
      wrap.position.y = -0.52;
      elbow.add(wrap);
    }
    // chunky mitt hand
    const hand = O(
      new THREE.Mesh(
        robot ? new THREE.BoxGeometry(0.18, 0.22, 0.14) : new THREE.SphereGeometry(0.14, 16, 16),
        skinT,
      ),
    );
    hand.position.y = -0.76;
    elbow.add(hand);
    return { shoulder, elbow, hand };
  }
  const armL = arm(1);
  const armR = arm(-1);
  if (host) {
    // microphone in right hand — chunky cartoon mic
    const mic = new THREE.Group();
    mic.add(O(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.32, 10), darkT), 0.01));
    const ball = O(
      new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), toonMat({ color: 0x4a4a56, bands })),
      0.012,
    );
    ball.position.y = 0.22;
    mic.add(ball);
    mic.position.y = -0.76;
    mic.rotation.x = 1.1;
    armR.elbow.add(mic);
  }

  // ---------- LEGS (hip→knee→foot) ----------
  function leg(s: number): LegRig {
    const thigh = new THREE.Group();
    thigh.name = s > 0 ? 'thighL' : 'thighR';
    thigh.position.set(s * 0.22 * bulk, -0.02, 0);
    pelvis.add(thigh);
    const lw = robot ? 0.14 : 0.16 * bulk;
    const th = O(
      new THREE.Mesh(new THREE.CylinderGeometry(lw + 0.05, lw, 1.02, 18), robot ? skinT : shortsT),
    ); // shorts cover upper thigh
    th.position.y = -0.51;
    thigh.add(th);
    if (!robot) {
      const lower = O(
        new THREE.Mesh(
          new THREE.CylinderGeometry(lw + 0.01, lw - 0.015, 0.5, 16),
          host ? suitT : skinT,
        ),
      );
      lower.position.y = -0.85;
      thigh.add(lower);
    }
    const knee = new THREE.Group();
    knee.name = s > 0 ? 'kneeL' : 'kneeR';
    knee.position.y = -1.02;
    thigh.add(knee);
    if (robot) {
      knee.add(O(new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 14), jointT), 0.012));
    }
    const shin = O(
      new THREE.Mesh(
        new THREE.CylinderGeometry(lw - 0.015, lw - 0.055, 0.98, 16),
        robot ? skinT : host ? suitT : skinT,
      ),
    );
    shin.position.y = -0.49;
    knee.add(shin);
    if (ninja) {
      const wrap = O(new THREE.Mesh(new THREE.CylinderGeometry(lw, lw, 0.16, 12), glowT), 0.008);
      wrap.position.y = -0.78;
      knee.add(wrap);
    }
    // chunky cartoon shoe: box sole + round toe cap
    const foot = O(new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.15, 0.48), shoeT));
    foot.position.set(0, -1.0, 0.12);
    knee.add(foot);
    const toe = O(new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 16), shoeT), 0.014);
    toe.scale.set(0.95, 0.75, 1);
    toe.position.set(0, -1.0, 0.34);
    knee.add(toe);
    return { thigh, knee };
  }
  const legL = leg(1);
  const legR = leg(-1);

  // ---------- STYLE EXTRAS ----------
  if (host) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.05), glowT);
    tie.position.set(0, 0.86, 0.31);
    tie.rotation.x = 0.08;
    spine.add(withOutline(tie, { color: line, thickness: 0.012 }));
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.06), glowT);
    knot.position.set(0, 1.12, 0.3);
    spine.add(knot);
    [-1, 1].forEach((s) => {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.035), suitT);
      lapel.position.set(s * 0.15, 0.95, 0.315);
      lapel.rotation.z = s * 0.25;
      spine.add(lapel);
    });
  }
  if (disco) {
    // gold medallion on a chain
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.014, 8, 26), glowT);
    chain.position.set(0, 1.18, 0.16);
    chain.rotation.x = 1.15;
    spine.add(chain);
    const medal = O(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 18), glowT), 0.01);
    medal.position.set(0, 0.98, 0.31);
    medal.rotation.x = Math.PI / 2 - 0.12;
    spine.add(medal);
  }
  if (boss) {
    const ice = flair === 'ice';
    const metalT = toonMat({
      color: accent,
      emissive: ice ? accent : 0x000000,
      emissiveIntensity: ice ? 0.25 : 1,
      bands,
    });
    [-1, 1].forEach((s) => {
      const pauldron = O(new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 20), metalT));
      pauldron.position.set(s * shW, 1.3, 0);
      pauldron.scale.set(1.12, 0.8, 1.12);
      spine.add(pauldron);
    });
    const belt = O(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.065, 12, 28), metalT), 0.014);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.08;
    pelvis.add(belt);
    // half-shell cape — drapes over the BACK only (+z = rear), never wraps the
    // front like a dress; flattened in z so it hugs the silhouette
    const cape = sh(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 1.0, 1.95, 18, 1, true, -Math.PI / 2, Math.PI),
        toonMat({
          color: cfg.cape ?? 0x7a1424,
          bands,
          side: THREE.DoubleSide,
          map: repeated(velvetTex(2), 1.4, 1.4), // T3: königlicher Samt-Fall
        }),
      ),
    );
    cape.position.set(0, 0.48, 0.16);
    cape.scale.z = 0.72;
    spine.add(cape);
    if (ice) {
      // floating sparkle gems on the chest
      const gemT = toonMat({ color: 0xffffff, emissive: 0xdff6ff, emissiveIntensity: 0.8, bands });
      [
        [0.2, 1.05, 0.33],
        [-0.16, 0.75, 0.32],
        [0.05, 0.45, 0.34],
      ].forEach(([x, y, z]) => {
        const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), gemT);
        g.position.set(x!, y!, z!);
        g.rotation.z = x! * 2;
        spine.add(g);
      });
    }
  }

  // ---------- CHEEKS (soft bodies, world space) ----------
  const cheekR = robot ? 0.34 : boss ? 0.5 : 0.44;
  function mkCheek(anchor: THREE.Object3D, s: number): Cheek {
    const g = new THREE.Group();
    g.name = s > 0 ? 'cheekL' : 'cheekR';
    const m = O(new THREE.Mesh(new THREE.SphereGeometry(cheekR, 36, 36), shortsT), 0.022);
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
