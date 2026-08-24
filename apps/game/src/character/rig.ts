import * as THREE from 'three';

import { INK, sh, toonMat, withOutline } from '../engine/materials';
import { glowTexture } from '../engine/scene';
import { RARITY_COLOR } from './skins';
import { REST_SCALE, createFaceRig, type FaceRig } from './face-life';
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
  /**
   * ROADMAP-V2 G5: die Gesichts-Handles unter dem `head`-Bone (Lider, Pupillen,
   * Brauen, Mund-Varianten). Leer bei Visor-/Masken-Stilen — `applyFace` ist
   * dort ein No-op.
   */
  face: FaceRig;
  /**
   * D-18/D-19: Die Dauer-Signatur des Skins (+ Rarity-Funken-Loop). `main`
   * ruft sie im Physik-Slot neben `applyIdleLife` — additive Bone-Anteile
   * (Gyrator-Schwebe-Bob) dürfen NUR dort schreiben. Gate: `preset.toonFx` —
   * das low-Preset zeigt die statische Emissive-Farbe ohne Animation (K-9).
   * `undefined` = der Skin ist bewusst clean (classic — der ruhige Anker).
   */
  signature?: (t: number, beatV: number) => void;
  /**
   * D-18/D-19: Träger aller Signatur-/Rarity-SPRITES (Glut, Funken, Aura) —
   * hängt unterm Rig-root (wird beim Skin-Wechsel mit entsorgt); `main`
   * blendet ihn im low-Preset aus (low: nur Emissive + Bodenring).
   */
  fx: THREE.Group;
}

/**
 * Build the articulated character for a skin — cartoon edition (Wave 1).
 *
 * The SKELETON is untouched from the prototype: every bone the physics
 * reads/writes (`root/pelvis/spine/head/armX.shoulder/elbow/hand/
 * legX.thigh/knee`, the cheek anchors and the world-space `Cheek` list) keeps
 * its name, hierarchy and pivot transform, so `stepPhysics`/`renderCheeks`
 * animate exactly as before. Only the MESHES hanging under those bones are
 * new: cel-shaded (`toonMat`), ink-outlined (`withOutline`), cartoon-real
 * proportions — ears, layered per-skin hair, deltoids/calves, real hands
 * (palm + curled fingers + thumb) and styled footwear with soles and laces.
 * Pass the previous instance to detach it from the scene.
 */
export function buildCharacter(
  scene: THREE.Scene,
  cfg: SkinConfig,
  prev?: CharacterInstance | null,
): CharacterInstance {
  if (prev) {
    // Vom ECHTEN Parent lösen, nicht von der Szene: `main.ts` hängt den Rig
    // nach dem Bau in die Show-Spin-Gruppe um — `scene.remove(root)` war dann
    // ein No-op und jeder Skin-Wechsel ließ den alten Körper stehen (der
    // „mehrere Charaktere auf der Bühne"-Bug).
    prev.rig.root.parent?.remove(prev.rig.root);
    prev.cheeks.forEach((c) => c.g.parent?.remove(c.g));
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
  // D-02: `flash: true` = dieses Material nimmt den Rim-Blitz beim Treffer an.
  // Nur die großen Flächen der Spielfigur (Haut, Hose, Haar) — Zubehör und
  // Kulisse blitzen nicht mit, sonst flackert das ganze Bild statt der Kante.
  // D-18 diamond: „harte Glanzkanten" — der Glint-Term der Hauptmaterialien
  // steigt 0.2 → 0.55 (reiner Uniform-WERT beim Bau, gleicher Programm-Cache).
  const gemGlint = flair === 'ice' ? { glint: 0.55 } : {};
  const skinT = toonMat({
    color: cfg.skin,
    bands,
    flash: true,
    ...gemGlint,
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
    flash: true,
    ...gemGlint,
    map: shortsDetail,
    ...(disco
      ? { emissiveMap: repeated(sequinTex(9), 2.4, 2.4), emissive: accent, emissiveIntensity: 0.2 }
      : {}),
  });
  const hairT = toonMat({
    color: cfg.hair,
    bands,
    flash: true,
    ...gemGlint,
    map: repeated(strandTex(1), 2, 2),
  });
  // host: the `shorts` colour doubles as the suit fabric (trousers + jacket).
  const suitT = shortsT;
  const jointT = toonMat({ color: 0x525c6e, bands, map: repeated(brushedTex(4), 2, 2) });
  const darkT = toonMat({ color: 0x1d1d26, bands });
  const shoeT = robot
    ? jointT
    : host || boss || ninja || flair === 'lava'
      ? darkT
      : toonMat({ color: 0xf2f3f6, bands, map: repeated(weaveTex(), 4, 4) });
  // real-footwear kit: rubber soles, woven laces/socks, leather boot hide
  const darkSole = host || boss || ninja || flair === 'lava' || flair === 'pirate';
  const soleT = toonMat({
    color: darkSole ? 0x14141c : 0xdfe2e8,
    bands,
    map: repeated(brushedTex(1), 2, 2),
  });
  const laceT = toonMat({ color: 0xf5f6f8, bands, map: repeated(weaveTex(), 6, 6) });
  const leatherT = toonMat({ color: 0x50331a, bands, map: repeated(poreTex(2), 3, 3) });
  const leatherLightT = toonMat({ color: 0x6b4522, bands, map: repeated(poreTex(2), 3, 3) });
  const goldTrimT = toonMat({ color: accent, bands, map: repeated(brushedTex(2), 2, 2) });
  const glowT = toonMat({ color: accent, emissive: accent, emissiveIntensity: 0.9, bands });
  // D-18 neon: „leuchtende Kantenlinien" — der dunkelste Skin des Katalogs
  // glüht endlich (Hood-Band, Wraps, Gürtel teilen alle dieses glowT). Ein
  // statischer Emissive-WERT: lesbar im Dunkeln, auch im low-Preset (K-9).
  if (ninja) glowT.emissiveIntensity = 1.2;
  // D-18/D-19: Signatur-Bausteine + Sprite-Träger (siehe CharacterInstance).
  const sigParts: ((t: number, beatV: number) => void)[] = [];
  const fx = new THREE.Group();
  const spriteMat = (color: number, opacity = 1): THREE.SpriteMaterial =>
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  /** D-18 pirate: Bandana-Zipfel, die im Wind flattern (Basis-Rotation cachen). */
  const flutterTails: { m: THREE.Object3D; base: number }[] = [];
  /** D-18 boss: das wehende Cape (Referenz aus dem Boss-Block unten). */
  let capeRef: THREE.Mesh | null = null;
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
  // Still cartoon-big, but closer to real proportions (~1:6 head-to-body).
  // Physics only writes head.rotation, so scaling the bone is silhouette-safe.
  head.scale.setScalar(robot ? 1.02 : 1.06);
  spine.add(head);
  // ROADMAP-V2 G5: Sammelstelle der Gesichts-Handles. Gefüllt wird sie NUR von
  // den Stilen, die ein Standard-Gesicht bauen (`face()`) — plus die zwei
  // Visor-Pixel des Robos als sein Blink-Ersatz. Der Ninja (Maske) bleibt leer.
  const faceLife = createFaceRig();

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
      faceLife.pupils.push({ m: pupil, base: pupil.position.clone() });
      // G5 Blinzeln: eine Haut-Kuppel vor dem Augapfel, deren GEOMETRIE nach
      // unten versetzt ist — der Pivot sitzt damit am oberen Lidrand und
      // `scale.y` fährt das Lid herunter wie ein echtes. z liegt vor der
      // Pupillen-Kuppe (0.349), damit im Schluss nichts durchsticht.
      const lidGeo = new THREE.SphereGeometry(0.092, 16, 12);
      lidGeo.scale(1, 1.34, 0.62);
      lidGeo.translate(0, -0.1233, 0);
      const lid = new THREE.Mesh(lidGeo, skinT);
      lid.name = s > 0 ? 'lidL' : 'lidR';
      lid.position.set(s * 0.12, 0.04 + 0.1233, 0.3);
      lid.scale.y = REST_SCALE; // Ruhelage: sub-pixel am oberen Lidrand
      head.add(lid);
      faceLife.lids.push(lid);
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
      faceLife.brows.push({ m: brow, baseZ: brow.rotation.z, side: s });
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
    // G5 Ekstase-Mund: derselbe Ink-Ton als geschlossener Ring, im Ruhezustand
    // auf REST_SCALE geschrumpft (NICHT `visible = false` — der glTF-Export
    // läuft mit `onlyVisible: true` und ließe ihn sonst aus den Modellen fallen).
    const oMouth = new THREE.Mesh(new THREE.TorusGeometry(grin * 0.62, 0.022, 8, 18), inkFlat);
    oMouth.name = 'mouth-o';
    // Mitte der Mundzone (das Lächeln spannt von -0.095 bis -0.095−grin).
    oMouth.position.set(0, -0.095 - grin * 0.45, 0.275);
    oMouth.scale.setScalar(REST_SCALE);
    head.add(oMouth);
    // Die Grimasse dreht DENSELBEN Bogen um 180° und senkt ihn um seinen
    // Radius — sonst wölbt er sich über die Nase statt in die Mundzone.
    faceLife.mouth = {
      arc: smile,
      smileZ: smile.rotation.z,
      frownZ: smile.rotation.z - Math.PI,
      smileY: smile.position.y,
      frownY: smile.position.y - grin,
      o: oMouth,
    };
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
      // G5: Der Robo hat kein Gesicht — statt Lidern fahren die Visor-Pixel im
      // Blinzel-Takt zusammen (`applyFace` schreibt nur ihr `scale.y`).
      faceLife.visorPixels.push(px);
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
      // D-17: +20 % Radius — der Halo ist das einzige Rücken-Merkmal dieses
      // Skins und muss auch von hinten über die Schulterlinie hinausragen.
      const ring = O(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.62, 0.055, 10, 30),
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
    if (!ninja) {
      // real ears (hidden only under the ninja hood)
      [-1, 1].forEach((s) => {
        const ear = O(new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 14), skinT), 0.008);
        ear.position.set(s * 0.3, 0.0, 0.03);
        ear.scale.set(0.55, 1, 0.8);
        head.add(ear);
      });
    }

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
      // D-17: „Neon" hatte bisher nur einen eingefärbten Schädel — von hinten
      // war er von `classic` nicht zu unterscheiden. Jetzt eine echte KAPUZE:
      // eine größere Schale um den Kopf plus ein Zipfel nach hinten.
      {
        const hood = O(new THREE.Mesh(new THREE.SphereGeometry(0.4, 22, 18), hairT), 0.02);
        hood.scale.set(1.08, 1.02, 1.12);
        hood.position.set(0, 0.06, -0.05);
        head.add(hood);
        const peak = O(new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.46, 10), hairT), 0.016);
        peak.position.set(0, 0.12, -0.36);
        peak.rotation.x = -1.15;
        head.add(peak);
      }
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
        // D-18 pirate: die Zipfel flattern — Signatur „flatterndes Tuch".
        flutterTails.push({ m: knot, base: knot.rotation.z });
      });
      // D-17: Dreispitz über dem Bandana — DER Kapitäns-Umriss. Drei
      // hochgeschlagene Krempen-Segmente auf einer flachen Kalotte; grob
      // gebaut, weil nur die Kontur zählt.
      {
        const hatT = toonMat({ color: 0x241a12, bands });
        const crown3 = O(new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), hatT), 0.016);
        crown3.scale.set(1, 0.62, 1);
        crown3.position.y = 0.3;
        head.add(crown3);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.5;
          const brim = O(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.055, 0.24), hatT), 0.014);
          brim.position.set(Math.cos(a) * 0.24, 0.3, Math.sin(a) * 0.24);
          brim.rotation.set(0, -a, 0.42);
          head.add(brim);
        }
      }
      const ring = O(
        new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 16), glowT), // gold accent
        0.008,
      );
      ring.position.set(0.31, -0.1, 0.03); // hangs from the real ear now
      head.add(ring);
      // real hair: a dark ponytail spilling out under the bandana knot
      const pirateHairT = toonMat({ color: 0x33210f, bands, map: repeated(strandTex(2), 2, 2) });
      (
        [
          [0.05, 2.9, 0.42],
          [-0.05, 2.75, 0.34],
          [0, 3.0, 0.3],
        ] as const
      ).forEach(([x, rx, len]) => {
        const strand = O(new THREE.Mesh(new THREE.ConeGeometry(0.05, len, 10), pirateHairT), 0.01);
        strand.position.set(x, -0.1 - len * 0.32, -0.3);
        strand.rotation.set(rx, 0, x * 2);
        head.add(strand);
      });
    } else if (disco) {
      face({ grin: 0.1, blush: 0xd9765a });
      // real afro: a core orb wrapped in a cloud of puffs (reads as actual hair,
      // not a helmet) + sideburns
      // D-17: Der Afro ist die SILHOUETTE dieses Skins — von hinten sieht die
      // Kamera nur Kopf und Hose, also muss der Kopf-Umriss allein tragen.
      const afro = O(new THREE.Mesh(new THREE.SphereGeometry(0.56, 26, 26), hairT), 0.024);
      afro.position.y = 0.18;
      head.add(afro);
      // Zweite Puff-Lage außen herum — der Umriss wird wolkig statt kugelig.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const puff = O(new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), hairT), 0.02);
        puff.position.set(Math.cos(a) * 0.52, 0.24 + Math.sin(a * 2) * 0.16, Math.sin(a) * 0.44);
        head.add(puff);
      }
      (
        [
          [0.3, 0.44, 0.08, 0.17],
          [-0.3, 0.44, 0.06, 0.17],
          [0, 0.54, -0.05, 0.19],
          [0.38, 0.2, 0, 0.16],
          [-0.38, 0.2, 0, 0.16],
          [0.2, 0.3, 0.3, 0.15],
          [-0.2, 0.3, 0.3, 0.15],
          [0.25, 0.37, -0.25, 0.16],
          [-0.25, 0.37, -0.25, 0.16],
          [0, 0.32, 0.37, 0.14],
          [0, 0.4, -0.35, 0.16],
        ] as const
      ).forEach(([x, y, z, r]) => {
        const puff = O(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), hairT), 0.016);
        puff.position.set(x, y, z);
        head.add(puff);
      });
      [-1, 1].forEach((s) => {
        const burn = sh(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.04), hairT));
        burn.position.set(s * 0.29, -0.08, 0.1);
        burn.rotation.z = s * 0.1;
        head.add(burn);
      });
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
        // D-17: +30 % Höhe — die Zacken sind die Kontur, nicht das Detail.
        const spikes: [number, number][] = [
          [0, 0.47],
          [0.14, 0.31],
          [-0.14, 0.31],
          [0.24, 0.21],
          [-0.24, 0.21],
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
        // real hair under the crown: slicked black cap + villain goatee
        const bossHair = O(new THREE.Mesh(new THREE.SphereGeometry(0.33, 22, 22), hairT));
        bossHair.position.set(0, 0.14, -0.06); // tucked under the crown, off the forehead
        bossHair.scale.set(0.93, 0.6, 0.9);
        head.add(bossHair);
        const goatee = O(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 12), hairT), 0.01);
        goatee.position.set(0, -0.36, 0.14);
        goatee.rotation.x = Math.PI - 0.3;
        head.add(goatee);
      }
    } else if (host) {
      face({ grin: 0.11, blush: 0xe89a72 });
      // real showbiz hair: slick base, flattened side panels over the ears,
      // a two-lobe pompadour wave up front and crisp sideburns
      const hair = O(new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 24), hairT));
      hair.position.set(0, 0.09, -0.05);
      hair.scale.set(0.95, 0.8, 0.94);
      head.add(hair);
      [-1, 1].forEach((s) => {
        const side = O(new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), hairT), 0.012);
        side.position.set(s * 0.27, 0.04, 0);
        side.scale.set(0.5, 1.0, 0.95);
        head.add(side);
        const burn = sh(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.03), hairT));
        burn.position.set(s * 0.295, -0.08, 0.1);
        head.add(burn);
      });
      const pomp = O(new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 18), hairT), 0.012);
      pomp.position.set(0.02, 0.31, 0.13);
      pomp.scale.set(1.35, 0.8, 1.0);
      pomp.rotation.z = -0.15;
      head.add(pomp);
      const wave = O(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), hairT), 0.012);
      wave.position.set(0.15, 0.26, 0.2);
      wave.scale.set(0.95, 0.68, 0.9);
      wave.rotation.z = -0.5;
      head.add(wave);
    } else {
      // classic human (Klassiker / recolours) — real layered hair: back
      // volume, side layers over the ears, a big swept fringe with a loose
      // strand tip, and sideburns
      face({ grin: 0.095, blush: 0xef8f74 });
      const hair = O(new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 24), hairT));
      hair.position.set(0, 0.08, -0.06);
      hair.scale.set(0.95, 0.9, 0.92);
      head.add(hair);
      [-1, 1].forEach((s) => {
        const side = O(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), hairT), 0.012);
        side.position.set(s * 0.26, 0.03, 0.02);
        side.scale.set(0.55, 1.1, 0.95);
        head.add(side);
        const burn = sh(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.03), hairT));
        burn.position.set(s * 0.29, -0.09, 0.11);
        burn.rotation.z = s * 0.08;
        head.add(burn);
      });
      const swoosh = O(new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 18), hairT), 0.012);
      swoosh.position.set(-0.06, 0.28, 0.16);
      swoosh.scale.set(1.5, 0.66, 0.95);
      swoosh.rotation.z = -0.2;
      head.add(swoosh);
      const strandTip = O(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 10), hairT), 0.01);
      strandTip.position.set(0.17, 0.25, 0.2);
      strandTip.rotation.z = -1.9;
      head.add(strandTip);
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
    if (!robot) {
      // real deltoid rounds the shoulder joint into the arm
      const delt = O(
        new THREE.Mesh(new THREE.SphereGeometry(boss ? 0.19 : 0.135, 18, 18), upperMat),
      );
      delt.position.y = -0.04;
      shoulder.add(delt);
    }
    const elbow = new THREE.Group();
    elbow.name = s > 0 ? 'elbowL' : 'elbowR';
    elbow.position.y = -0.8;
    shoulder.add(elbow);
    if (robot) {
      elbow.add(O(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), jointT), 0.012));
    } else {
      // Gelenk-Kugel (Politur-Paket): Ober- und Unterarm sind offene Zylinder —
      // beim Beugen klaffte der Ellbogen. Radius = Unterarm-Oberkante (aw),
      // Material wie der Unterarm, damit die Kugel im gestreckten Arm unsichtbar
      // in der Silhouette verschwindet und nur die Beuge füllt.
      elbow.add(O(new THREE.Mesh(new THREE.SphereGeometry(aw, 14, 14), host ? suitT : skinT)));
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
    // real hand: wrist, palm (scale baked into the geometry so child fingers
    // stay undistorted), four softly curled fingers + opposable thumb; the
    // robot gets segmented mech grippers instead
    const wrist = O(
      new THREE.Mesh(
        new THREE.CylinderGeometry(aw - 0.018, aw - 0.032, 0.1, 12),
        robot ? jointT : skinT,
      ),
    );
    wrist.position.y = -0.7;
    elbow.add(wrist);
    let hand: THREE.Mesh;
    if (robot) {
      hand = O(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.12), skinT));
      hand.position.y = -0.79;
      elbow.add(hand);
      [-0.05, 0.05].forEach((dx) => {
        const f = sh(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), jointT));
        f.position.set(dx, -0.12, 0.02);
        f.rotation.x = 0.2;
        hand.add(f);
      });
      const gripper = sh(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.06), jointT));
      gripper.position.set(0, -0.09, -0.06);
      gripper.rotation.x = -0.35;
      hand.add(gripper);
    } else {
      const palmGeo = new THREE.SphereGeometry(0.105 * bulk, 18, 18);
      palmGeo.scale(1.0, 1.18, 0.72);
      hand = O(new THREE.Mesh(palmGeo, skinT));
      hand.position.y = -0.8;
      elbow.add(hand);
      const fr = 0.031 * bulk;
      [-0.066, -0.022, 0.022, 0.066].forEach((dx, i) => {
        const len = (i === 0 || i === 3 ? 0.11 : 0.14) * bulk;
        const f = O(new THREE.Mesh(new THREE.CapsuleGeometry(fr, len, 4, 10), skinT), 0.006);
        f.position.set(dx * bulk, -0.1 * bulk - len / 2, 0.01);
        f.rotation.x = 0.24;
        f.rotation.z = -dx * 1.1;
        hand.add(f);
      });
      const thumb = O(
        new THREE.Mesh(new THREE.CapsuleGeometry(fr + 0.004, 0.085 * bulk, 4, 10), skinT),
        0.006,
      );
      thumb.position.set(s * 0.085 * bulk, -0.035, 0.035);
      thumb.rotation.set(0.35, 0, -s * 1.0);
      hand.add(thumb);
    }
    return { shoulder, elbow, hand };
  }
  // -------------------------------------------------------------------------
  // D-17 „Zehn Silhouetten, zehn Figuren" — Rücken-Merkmale.
  //
  // Die Kamera sieht die Figur fast nur von HINTEN (shots/SHEET-skins.png): Was
  // vorne am Gesicht sitzt (Visiere, Masken, Brillen), ist im Spiel nie zu
  // sehen. Was zählt, ist die RÜCKEN-Kontur — deshalb bekommt jeder der vier
  // Doppelgänger hier sein eigenes, grobes Umriss-Merkmal. Alles hängt unter
  // vorhandenen Bones; kein Bone wird umbenannt oder verschoben, die
  // Cheek-Physik bleibt unberührt (K-8).
  // -------------------------------------------------------------------------
  if (flair === 'pirate') {
    // Mantelschoß: kurze Halb-Schale hüfthoch — die Kapitäns-Kontur.
    const coat = sh(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.72, 0.55, 16, 1, true, -Math.PI / 2, Math.PI),
        toonMat({ color: 0x8f2222, bands, side: THREE.DoubleSide }),
      ),
    );
    coat.position.set(0, 0.06, 0.12);
    coat.scale.z = 0.68;
    spine.add(coat);
  } else if (flair === 'lava') {
    // Flammenkamm die ganze Rückenlinie hinunter — abnehmende Zacken.
    for (let i = 0; i < 5; i++) {
      const h = 0.34 - i * 0.05;
      const fin = O(new THREE.Mesh(new THREE.ConeGeometry(0.075, h, 6), glowT), 0.01);
      fin.position.set(0, 1.12 - i * 0.28, -0.24 - i * 0.012);
      fin.rotation.x = -0.42;
      spine.add(fin);
    }
  } else if (host) {
    // Frackschöße: zwei flache Keile, die nach hinten fallen.
    [-1, 1].forEach((s2) => {
      const tail = O(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.02), suitT), 0.012);
      tail.position.set(s2 * 0.13, 0.05, -0.28);
      tail.rotation.set(-0.22, 0, s2 * 0.08);
      spine.add(tail);
    });
  }
  if (boss && flair === 'ice') {
    // Diamant: zwei Rücken-Kristalle über der Cape-Kante.
    [-1, 1].forEach((s2) => {
      const shard = O(
        new THREE.Mesh(
          new THREE.OctahedronGeometry(0.14),
          toonMat({ color: accent, emissive: accent, emissiveIntensity: 0.35, bands }),
        ),
        0.01,
      );
      shard.position.set(s2 * 0.22, 1.18, -0.2);
      shard.rotation.set(0.3, 0, s2 * 0.5);
      spine.add(shard);
    });
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
    // D-18 host: „Mikrofon-Glanz" — ein Glint-Stud auf dem Mikro-Kopf. Das
    // Mikro selbst gab es schon; die Signatur ist der ruhige Lichtpunkt.
    const micStud = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), glowT);
    micStud.position.set(0.045, 0.185, 0.05);
    mic.add(micStud);
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
    } else {
      // Gelenk-Kugel (Politur-Paket): dieselbe Lücke am Knie — Radius =
      // Schienbein-Oberkante, Material wie das Schienbein darunter.
      knee.add(
        O(new THREE.Mesh(new THREE.SphereGeometry(lw - 0.015, 14, 14), host ? suitT : skinT)),
      );
    }
    const shin = O(
      new THREE.Mesh(
        new THREE.CylinderGeometry(lw - 0.015, lw - 0.055, 0.98, 16),
        robot ? skinT : host ? suitT : skinT,
      ),
    );
    shin.position.y = -0.49;
    knee.add(shin);
    if (!robot) {
      // real calf muscle bulging the upper shin
      const calfGeo = new THREE.SphereGeometry(lw * 0.92, 16, 16);
      calfGeo.scale(0.9, 1.35, 0.95);
      const calf = O(new THREE.Mesh(calfGeo, host ? suitT : skinT));
      calf.position.set(0, -0.3, -0.03);
      knee.add(calf);
    }
    if (ninja) {
      const wrap = O(new THREE.Mesh(new THREE.CylinderGeometry(lw, lw, 0.16, 12), glowT), 0.008);
      wrap.position.y = -0.78;
      knee.add(wrap);
    }
    if (disco) {
      // D-17: Schlaghosen — die BEINLINIE trägt diesen Skin. Ein Kegelstumpf am
      // Unterschenkel macht aus der geraden Silhouette eine Glocke.
      const cuff = O(
        new THREE.Mesh(
          new THREE.CylinderGeometry(lw + 0.02, lw + 0.13, 0.66, 16, 1, true),
          shortsT,
        ),
        0.014,
      );
      cuff.position.y = -0.66;
      knee.add(cuff);
    }
    if (flair === 'lava') {
      // D-17: zerklüftete Waden — zwei kleine Auswüchse pro Unterschenkel.
      [0, 1].forEach((i) => {
        const spur = O(new THREE.Mesh(new THREE.TetrahedronGeometry(0.11), darkT), 0.01);
        spur.position.set(0, -0.35 - i * 0.32, -0.14 - i * 0.02);
        spur.rotation.set(0.5 + i, i * 1.2, 0.4);
        knee.add(spur);
      });
    }
    // ---- real footwear per style; every sole bottom stays at knee-local
    // -1.075 so the feet keep planting on the floor exactly as before
    const k = bulk;
    if (robot) {
      // mech boot: dark sole, chassis body, coloured toe plate, heel thruster
      const sole = O(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.46), darkT));
      sole.position.set(0, -1.045, 0.1);
      knee.add(sole);
      const boot = O(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.4), jointT));
      boot.position.set(0, -0.945, 0.08);
      knee.add(boot);
      const toe = O(new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.11, 0.14), skinT), 0.012);
      toe.position.set(0, -0.96, 0.33);
      knee.add(toe);
      const jet = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), glowT);
      jet.position.set(0, -0.95, -0.125);
      jet.rotation.y = Math.PI;
      knee.add(jet);
    } else {
      const sole = O(
        new THREE.Mesh(new THREE.BoxGeometry(0.27 * k, host ? 0.05 : 0.075, 0.52 * k), soleT),
      );
      sole.position.set(0, host ? -1.05 : -1.038, 0.12);
      knee.add(sole);
      const upGeo = new THREE.SphereGeometry(0.125 * k, 18, 18);
      upGeo.scale(1, host ? 0.7 : 0.85, 1.5);
      const upper = O(new THREE.Mesh(upGeo, flair === 'pirate' ? leatherT : shoeT));
      upper.position.set(0, -0.96, 0.1);
      knee.add(upper);
      if (ninja) {
        // tabi: split toe + glowing ankle band
        [-1, 1].forEach((s2) => {
          const half = O(new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 14), shoeT), 0.01);
          half.scale.set(0.95, 0.78, 1.25);
          half.position.set(s2 * 0.062, -1.0, 0.37);
          knee.add(half);
        });
        const band = O(
          new THREE.Mesh(new THREE.CylinderGeometry(lw - 0.02, lw - 0.02, 0.07, 12), glowT),
          0.008,
        );
        band.position.y = -0.92;
        knee.add(band);
      } else {
        const toeGeo = new THREE.SphereGeometry(0.115 * k, 18, 18);
        toeGeo.scale(1.05, 0.72, 1.2);
        const toe = O(
          new THREE.Mesh(toeGeo, boss ? goldTrimT : flair === 'pirate' ? leatherT : soleT),
          0.012,
        );
        toe.position.set(0, -0.99, 0.36 * k);
        knee.add(toe);
      }
      if (flair === 'pirate') {
        // leather boot shaft with a folded lighter cuff
        const shaft = O(
          new THREE.Mesh(new THREE.CylinderGeometry(lw + 0.005, lw + 0.02, 0.3, 14), leatherT),
        );
        shaft.position.y = -0.84;
        knee.add(shaft);
        const fold = O(
          new THREE.Mesh(new THREE.CylinderGeometry(lw + 0.045, lw + 0.02, 0.1, 14), leatherLightT),
          0.012,
        );
        fold.position.y = -0.72;
        knee.add(fold);
      } else if (boss) {
        const cuffRing = O(
          new THREE.Mesh(new THREE.TorusGeometry(lw + 0.015, 0.032, 10, 20), goldTrimT),
          0.01,
        );
        cuffRing.position.y = -0.9;
        cuffRing.rotation.x = Math.PI / 2;
        knee.add(cuffRing);
      } else if (flair === 'lava') {
        // molten seam glowing between sole and crust upper
        const seam = sh(new THREE.Mesh(new THREE.BoxGeometry(0.275 * k, 0.022, 0.525 * k), glowT));
        seam.position.set(0, -0.999, 0.12);
        knee.add(seam);
      } else if (host) {
        // sleek derby: low profile + a proper heel block, no laces
        const heelBlock = O(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.12), darkT));
        heelBlock.position.set(0, -1.045, -0.1);
        knee.add(heelBlock);
      } else if (!ninja) {
        // sneakers: sock cuff, tongue and three laces across the instep
        const sock = O(
          new THREE.Mesh(
            new THREE.CylinderGeometry(lw - 0.025, lw - 0.038, 0.1, 12),
            disco ? goldTrimT : laceT,
          ),
          0.008,
        );
        sock.position.y = -0.925;
        knee.add(sock);
        const tongue = sh(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.03), shoeT));
        tongue.position.set(0, -0.88, 0.2);
        tongue.rotation.x = 0.5;
        knee.add(tongue);
        for (let i = 0; i < 3; i++) {
          const lace = sh(new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.02, 0.022), laceT));
          lace.position.set(0, -0.9 - i * 0.027, 0.225 - i * 0.05);
          lace.rotation.x = 0.5;
          knee.add(lace);
        }
      }
    }
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
    // D-17: +35 % Länge — der Boss-Skin liest von hinten als bodenlanger Mantel
    // statt als Schulterumhang. Boden-Clearance geprüft (Fuß-Unterkante liegt
    // bei Becken −2.12, die Cape-Unterkante bei −0.64).
    cape.scale.y = 1.35;
    spine.add(cape);
    capeRef = cape; // D-18 boss: Signatur „wehendes Cape" (Loop unten)
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

  // -------------------------------------------------------------------------
  // D-18 „Skin-Signatur-FX" — genau EINE Dauer-Signatur je Skin, so leise,
  // dass sie den Klick-Effekt nie überstimmt (F7: die Klick-Splitter bleiben
  // Theme-farbig). Statische Anteile (neon-Emissive, diamond-Glint, host-Stud)
  // stehen oben beim Bau; hier stehen die ANIMIERTEN Anteile.
  // + D-19 „Rarity sichtbar": Funken/Glanz/Aura nach Stufe (Ring hängt in
  // main am Ring-Pool). Sprites leben im `fx`-Träger (low blendet ihn aus).
  // -------------------------------------------------------------------------
  root.add(fx);
  if (flair === 'lava') {
    // Riss-Glühen pulst + vier kleine Glutfunken steigen die Rückenlinie
    // hinauf (klein und HINTER der Figur — K-3, und K-2-geprüft: die Glut
    // bleibt ein Detail, kein Dauer-Orange-Akzent).
    const embers: THREE.Sprite[] = [];
    for (let i = 0; i < 4; i++) {
      const e = new THREE.Sprite(spriteMat(0xff9a3d, 0.8));
      e.scale.setScalar(0.11);
      fx.add(e);
      embers.push(e);
    }
    sigParts.push((t) => {
      glowT.emissiveIntensity = 0.7 + 0.4 * Math.sin(t * 2.1);
      embers.forEach((e, i) => {
        const k = (t * 0.35 + i * 0.25) % 1;
        e.position.set(
          Math.sin(i * 2.1 + t * 0.7) * 0.3,
          -0.4 + k * 2.0,
          -0.25 + Math.cos(i * 1.7) * 0.1,
        );
        (e.material as THREE.SpriteMaterial).opacity = 0.75 * (1 - k);
      });
    });
  } else if (disco) {
    // Pailletten-Shimmer: die Sequin-Emissive der Shorts atmet 0.15–0.45.
    sigParts.push((t) => {
      shortsT.emissiveIntensity = 0.3 + 0.15 * Math.sin(t * 2.7);
    });
  } else if (robot && faceLife.visorPixels.length > 0) {
    // Visor-Scan: ein Lauflicht wandert über die Pixel — per SKALA, nicht per
    // Material (die Pixel teilen glowT; ein Material-Fork wäre K-7-Bruch).
    const px = faceLife.visorPixels;
    sigParts.push((t) => {
      px.forEach((p, i) => {
        p.scale.y = 1 + 0.7 * Math.max(0, Math.sin(t * 3.2 - i * 0.9));
      });
    });
  } else if (flair === 'ice') {
    // diamond: alle ~4 s ein kurzer Funkel-Blitz an wechselnder Kante.
    const spark = new THREE.Sprite(spriteMat(0xdff6ff, 0));
    spark.scale.setScalar(0.16);
    fx.add(spark);
    const edges: readonly [number, number, number][] = [
      [0.32, 1.35, 0.12],
      [-0.28, 0.9, 0.2],
      [0.16, 1.72, -0.05],
      [-0.2, 0.35, 0.26],
    ];
    sigParts.push((t) => {
      const cyc = t / 4;
      const e = edges[Math.floor(cyc) % edges.length]!;
      const k = cyc % 1;
      spark.position.set(e[0], e[1], e[2]);
      (spark.material as THREE.SpriteMaterial).opacity =
        k < 0.12 ? Math.sin((k / 0.12) * Math.PI) : 0;
    });
  } else if (boss && capeRef) {
    // boss: das Cape weht — langsam, schwer, königlich (Mesh, kein Bone).
    const c = capeRef;
    sigParts.push((t) => {
      c.rotation.x = 0.06 * Math.sin(t * 1.3);
    });
  } else if (flair === 'pirate' && flutterTails.length > 0) {
    // pirate: die Bandana-Zipfel flattern (absolute Writes um die Basis).
    sigParts.push((t) => {
      flutterTails.forEach((f, i) => {
        f.m.rotation.z = f.base + 0.28 * Math.sin(t * 3.1 + i * 1.9);
      });
    });
  } else if (flair === 'saucer') {
    // gyrator: Schwebe-Bob — ADDITIV auf dem root, deshalb darf die Signatur
    // nur im Physik-Slot laufen (applyPose resettet jeden Fixschritt).
    sigParts.push((t) => {
      root.position.y += Math.sin(t * 1.6) * 0.05;
    });
  }
  // D-19: Rarity-Ausstattung (aufsteigend; der Bodenring ab „rare" hängt in
  // `main` am geteilten Ring-Pool — Pool-Budget: Boss + Rarity = 2 Slots).
  const rarity = cfg.rarity;
  if (rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic') {
    const sparks: THREE.Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const s2 = new THREE.Sprite(spriteMat(RARITY_COLOR[rarity], 0.8));
      s2.scale.setScalar(0.09);
      fx.add(s2);
      sparks.push(s2);
    }
    // Langsam kreisende Funken — Radius außerhalb der Silhouette (K-3).
    sigParts.push((t) => {
      sparks.forEach((s2, i) => {
        const a = t * 0.9 + (i / 3) * Math.PI * 2;
        s2.position.set(
          Math.cos(a) * 0.62,
          0.15 + Math.sin(t * 1.3 + i * 2.1) * 0.35,
          Math.sin(a) * 0.62,
        );
      });
    });
  }
  if (rarity === 'legendary' || rarity === 'mythic') {
    // Kantenglanz: die Akzent-Materialien leuchten eine Stufe höher.
    goldTrimT.emissive.set(accent);
    goldTrimT.emissiveIntensity = 0.25;
    glowT.emissiveIntensity += 0.25;
  }
  if (rarity === 'mythic') {
    // Aura-Schleier: EIN großer, sehr leiser Glow HINTER der Figur (K-3).
    const aura = new THREE.Sprite(spriteMat(RARITY_COLOR.mythic, 0.1));
    aura.scale.setScalar(2.6);
    aura.position.set(0, 0.4, -0.55);
    fx.add(aura);
  }
  const signature =
    sigParts.length > 0
      ? (t: number, beatV: number): void => {
          for (const f of sigParts) f(t, beatV);
        }
      : undefined;

  const rig: Rig = { root, pelvis, spine, head, armL, armR, legL, legR };
  root.updateMatrixWorld(true);
  const t = new THREE.Vector3();
  cheeks.forEach((c) => {
    c.anchor.getWorldPosition(t);
    c.x = t.x;
    c.y = t.y;
    c.z = t.z;
  });

  return { rig, cheeks, face: faceLife, signature, fx };
}
