import * as THREE from 'three';

import { INK, sh, toonMat, withOutline } from '../engine/materials';
import type { BackgroundKey } from '../types';

/**
 * The ENTITY — the cartoon rival creature you out-twerk (Wave 2).
 *
 * Purely visual: it is the body of the EXISTING combat rival (HP/damage stay in
 * `game/combat.ts`), staged across the dance floor facing the player so the
 * twerk battle is finally visible. One charming species per stage tier
 * (club/synth/beach/space), a bigger & meaner boss variant on every 5th zone,
 * and a recolour lap every 40 zones so endless runs never look static.
 *
 * Independent of the player rig: `update(t, beatV, drive)` runs its own
 * beat-synced twerk/bob/taunt loop from absolute time (no per-frame
 * allocations), `flinch()` reacts to your hits, `defeat()` plays a cartoon
 * KO-pop that doubles as the next rival's spawn-in bounce. Everything is
 * procedural (Three primitives), cel-shaded (`toonMat`) and ink-outlined
 * (`withOutline`) to match the Wave-1 look.
 */

/**
 * Where the rival performs: across the floor, facing the player at the origin.
 * The default camera (behind the player, theta π+0.3) looks along a ray that
 * passes ~x +1.35 at this depth, and world −x lands under the shop panel — so
 * a LARGER +x stages the rival on the open screen-left floor, clear of both
 * the player's silhouette and the UI in the boot framing.
 */
export const ENTITY_STAGE = { x: 3.5, y: -2.4, z: 4.4 } as const;
/** Extra stage depth for the (larger) boss so it never crowds the player. */
const BOSS_EXTRA_Z = 0.7;
/** Boss variants are this much bigger (meaner silhouette, same floor plant). */
const BOSS_SCALE = 1.42;
/** Seconds per idle→taunt cycle (turn around & shake it at the player). */
const TAUNT_PERIOD = 12;

/** One tier-theme's rival species (Wave 3 themes the scenery to match these). */
export interface EntityThemeConfig {
  readonly name: string;
  readonly bossName: string;
  /** Main body colour. */
  readonly body: number;
  /** Belly/secondary colour. */
  readonly belly: number;
  /** Booty-cheek colour — it's a twerk-off, every rival brings one. */
  readonly booty: number;
  /** Emissive accent for glowing props. */
  readonly accent: number;
  /** Cheek-blush colour. */
  readonly blush: number;
}

/** The four rival species, keyed by the stage tier (`BG_BY_TIER` in main.ts). */
export const ENTITY_THEMES: Record<BackgroundKey, EntityThemeConfig> = {
  club: {
    name: 'Disco-Schleim',
    bossName: 'Spiegelkugel-Schleim',
    body: 0xb35bf2,
    belly: 0xdcb2ff,
    booty: 0xff4fa0,
    accent: 0xffd24d,
    blush: 0xff8fc8,
  },
  synth: {
    name: 'Neon-Gremlin',
    bossName: 'Mainframe-Gremlin',
    body: 0x5a50f0,
    belly: 0x9a94ff,
    booty: 0xff3fb0,
    accent: 0x2ff5e8,
    blush: 0xff7ad0,
  },
  beach: {
    name: 'Krabbo',
    bossName: 'König Krabbo',
    body: 0xff6a3d,
    belly: 0xffe0a8,
    booty: 0xff9052,
    accent: 0x3adfc0,
    blush: 0xffb08a,
  },
  space: {
    name: 'Blorb',
    bossName: 'Mega-Blorb',
    body: 0x86e83a,
    belly: 0xc9f79e,
    booty: 0x9d5cf6,
    accent: 0xd9f0ff,
    blush: 0xbcf57e,
  },
};

/** Recolour-lap index for endless depth: zones 1–40 lap 0, 41–80 lap 1, … */
export function entityVariant(zone: number): number {
  return Math.floor(Math.max(0, zone - 1) / 40);
}

export interface EntityBuildOpts {
  /** Boss variant: bigger, angrier, with a themed flourish. */
  boss?: boolean;
  /** Recolour lap (`entityVariant(zone)`); deeper laps hue-shift the palette. */
  variant?: number;
}

/** A live rival on stage. Build with `buildEntity`; drive from the render loop. */
export interface EntityInstance {
  readonly root: THREE.Group;
  readonly theme: BackgroundKey;
  readonly boss: boolean;
  readonly variant: number;
  /** Per-frame animation: absolute time, beat envelope 0..1, player click drive. */
  update(t: number, beatV: number, drive: number): void;
  /** Hit reaction: cartoon squash + knockback + pupil wince. */
  flinch(): void;
  /** KO pop (shrink–spin–boing back) — doubles as the next rival's spawn-in. */
  defeat(): void;
  /** Remove from the scene and dispose owned geometry/materials. */
  detach(scene: THREE.Scene): void;
}

/** Hue/sat/light-shifted copy of a palette colour (recolour laps, boss tint). */
function shifted(hex: number, dh: number, ds = 0, dl = 0): THREE.Color {
  const c = new THREE.Color(hex);
  if (dh !== 0 || ds !== 0 || dl !== 0) c.offsetHSL(dh, ds, dl);
  return c;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** Smoothstep on 0..1 (taunt turn easing). */
const smooth01 = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Cartoon elastic-out (KO-pop respawn boing). */
function elasticOut(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

type Axis = 'x' | 'y' | 'z';
interface Flapper {
  o: THREE.Object3D;
  axis: Axis;
  base: number;
  amp: number;
  freq: number;
  phase: number;
}
interface Spinner {
  o: THREE.Object3D;
  axis: Axis;
  speed: number;
}
interface CheekRef {
  m: THREE.Mesh;
  side: number;
}

/**
 * Build the themed rival creature and add it to the scene. Pass the previous
 * instance to detach + dispose it (same contract as `buildCharacter`).
 */
export function buildEntity(
  scene: THREE.Scene,
  theme: BackgroundKey,
  opts: EntityBuildOpts = {},
  prev?: EntityInstance | null,
): EntityInstance {
  prev?.detach(scene);

  const boss = opts.boss ?? false;
  const variant = opts.variant ?? 0;
  const cfg = ENTITY_THEMES[theme];

  // ---------- palette (recolour lap hue-shift; boss = darker & more saturated) ----------
  const dh = (variant * 0.085) % 1;
  const ds = boss ? 0.08 : 0;
  const dl = boss ? -0.055 : 0;
  const bodyT = toonMat({ color: shifted(cfg.body, dh, ds, dl) });
  const bellyT = toonMat({ color: shifted(cfg.belly, dh, 0, boss ? -0.03 : 0) });
  const bootyT = toonMat({ color: shifted(cfg.booty, dh, ds, dl) });
  const accent = shifted(cfg.accent, dh);
  const glowT = toonMat({ color: accent, emissive: accent, emissiveIntensity: 0.85 });
  const darkT = toonMat({ color: 0x221d2e });
  const inkFlat = new THREE.MeshBasicMaterial({ color: INK, toneMapped: false });
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  /** Shadow-cast + ink-outline a mesh (default treatment, same as the rig). */
  const O = <M extends THREE.Mesh>(m: M, thickness?: number): M =>
    withOutline(sh(m), { thickness });

  // ---------- staging: across the floor, angled 3/4 toward the player ----------
  const root = new THREE.Group();
  const baseScale = boss ? BOSS_SCALE : 1;
  const px = ENTITY_STAGE.x;
  const pz = ENTITY_STAGE.z + (boss ? BOSS_EXTRA_Z : 0);
  root.position.set(px, ENTITY_STAGE.y, pz);
  // Face the player, twisted slightly so the silhouette (incl. booty) reads.
  const baseRotY = Math.atan2(-px, -pz) - 0.3;
  root.rotation.y = baseRotY;
  root.scale.setScalar(baseScale);
  scene.add(root);

  const body = new THREE.Group();
  root.add(body);
  let head: THREE.Group | null = null;

  // ---------- animation registries (filled by the species builders) ----------
  const cheeks: CheekRef[] = [];
  const flappers: Flapper[] = [];
  const spinners: Spinner[] = [];
  const pupils: THREE.Mesh[] = [];
  const glowPulse: { m: THREE.MeshToonMaterial; base: number }[] = [];

  const flap = (o: THREE.Object3D, axis: Axis, amp: number, freq: number, phase = 0): void => {
    flappers.push({ o, axis, base: o.rotation[axis], amp, freq, phase });
  };
  const spin = (o: THREE.Object3D, axis: Axis, speed: number): void => {
    spinners.push({ o, axis, speed });
  };
  const pulse = (m: THREE.MeshToonMaterial, base: number): void => {
    glowPulse.push({ m, base });
  };
  pulse(glowT, 0.85);

  /** The rival's own booty: two soft cheeks at the rear, jiggled in `update`. */
  function addCheeks(parent: THREE.Object3D, r: number, y: number, z: number, sep: number): void {
    [-1, 1].forEach((s) => {
      const holder = new THREE.Group();
      holder.position.set(s * sep, y, z);
      holder.scale.set(1.06, 1, 0.9);
      parent.add(holder);
      const m = O(new THREE.Mesh(new THREE.SphereGeometry(r, 26, 26), bootyT), 0.018);
      holder.add(m);
      cheeks.push({ m, side: s });
    });
  }

  interface FaceOpts {
    parent: THREE.Object3D;
    y: number;
    z: number;
    spread: number;
    eyeR: number;
    angry?: boolean;
    /** Glowing pupil colour (default: ink). */
    glow?: THREE.ColorRepresentation;
    fangs?: boolean;
    grin?: number;
    /** Single huge center eye instead of a pair (space boss). */
    cyclops?: boolean;
    /** Extra small third eye above the pair (space normal). */
    thirdEye?: boolean;
    /** Mouth/brows/blush only — the species builds its own eyes (crab stalks). */
    noEyes?: boolean;
    blush?: boolean;
  }

  /** Googly cartoon face: eye whites + pupils, brows, mouth (grin or scowl). */
  function face(o: FaceOpts): void {
    const pupilMat =
      o.glow !== undefined
        ? toonMat({ color: o.glow, emissive: o.glow, emissiveIntensity: 1.4 })
        : inkFlat;
    const eye = (x: number, y: number, r: number, pr: number): void => {
      const w = withOutline(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 18), eyeWhite), {
        thickness: 0.012,
      });
      w.scale.set(1, 1.25, 0.6);
      w.position.set(x, y, o.z);
      o.parent.add(w);
      const p = new THREE.Mesh(new THREE.SphereGeometry(pr, 12, 12), pupilMat);
      p.position.set(x, y - 0.005, o.z + r * 0.62);
      o.parent.add(p);
      pupils.push(p);
    };
    if (o.noEyes) {
      // eyes are built by the species (stalks); only mouth + blush here
    } else if (o.cyclops) {
      eye(0, o.y + 0.05, o.eyeR * 1.9, o.eyeR * 0.85);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(o.eyeR * 3.4, 0.06, 0.05), inkFlat);
      brow.position.set(0, o.y + 0.05 + o.eyeR * 2.1, o.z + 0.05);
      brow.rotation.z = 0;
      o.parent.add(brow);
    } else {
      [-1, 1].forEach((s) => {
        eye(s * o.spread, o.y, o.eyeR, o.eyeR * 0.42);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(o.eyeR * 1.5, 0.045, 0.045), inkFlat);
        brow.position.set(s * o.spread, o.y + o.eyeR * 1.7, o.z + 0.04);
        brow.rotation.z = s * (o.angry ? 0.5 : -0.14);
        o.parent.add(brow);
      });
      if (o.thirdEye) eye(0, o.y + o.eyeR * 1.9, o.eyeR * 0.62, o.eyeR * 0.28);
    }
    const grin = o.grin ?? 0.12;
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(grin, 0.028, 8, 16, Math.PI), inkFlat);
    const mouthY = o.noEyes ? o.y : o.y - (o.cyclops ? o.eyeR * 2.6 : o.eyeR * 1.9);
    mouth.position.set(0, mouthY, o.z + 0.07); // proud of round bodies, never buried
    // Half-torus opens upward (smile) for the cheeky idle, downward (scowl) for bosses.
    mouth.rotation.set(0.2, 0, o.angry ? 0 : Math.PI);
    o.parent.add(mouth);
    if (o.fangs) {
      [-1, 1].forEach((s) => {
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 6), eyeWhite);
        fang.position.set(s * grin * 0.9, mouth.position.y - 0.02, o.z + 0.08);
        fang.rotation.x = Math.PI;
        o.parent.add(fang);
      });
    }
    if (o.blush) {
      const blushT = toonMat({ color: shifted(cfg.blush, dh) });
      [-1, 1].forEach((s) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), blushT);
        b.scale.set(1.2, 0.6, 0.4);
        b.position.set(s * (o.spread + o.eyeR * 1.35), o.y - o.eyeR * 1.15, o.z - 0.02);
        o.parent.add(b);
      });
    }
  }

  /** Stubby waving arm nub (slime/gremlin/blorb). */
  function nubArm(s: number, y: number, len: number, mat: THREE.Material): void {
    const g = new THREE.Group();
    g.position.set(s * 0.78, y, 0.1);
    g.rotation.z = s * -2.35; // raised — twerk-battle "hands up"
    body.add(g);
    const seg = O(new THREE.Mesh(new THREE.CapsuleGeometry(0.11, len, 6, 12), mat), 0.014);
    seg.position.y = len * 0.5;
    g.add(seg);
    flap(g, 'z', 0.38, 5.6, s > 0 ? 0 : Math.PI);
  }

  // =====================================================================
  // Species builders — one per stage tier.
  // =====================================================================
  let bodyY = 1.1;
  let lean0 = 0.08; // idle forward lean (toward the player)
  let hover = false;

  if (theme === 'club') {
    // ---- Disco-Schleim: a grinning gumdrop slime in a mirror-ball beret ----
    bodyY = 1.14;
    const blob = O(new THREE.Mesh(new THREE.SphereGeometry(0.95, 32, 32), bodyT));
    blob.scale.set(1.0, 1.14, 0.92);
    body.add(blob);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.66, 24, 24), bellyT);
    belly.position.set(0, -0.34, 0.42);
    belly.scale.set(0.85, 0.6, 0.55);
    body.add(belly);
    // goo drips pooling at the base
    (
      [
        [0.58, -0.98, 0.3, 0.16],
        [-0.52, -1.0, -0.12, 0.13],
        [0.08, -1.04, -0.5, 0.11],
      ] as const
    ).forEach(([x, y, z, r]) => {
      const d = O(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 14), bodyT), 0.012);
      d.position.set(x, y, z);
      d.scale.y = 0.55;
      body.add(d);
    });
    face({
      parent: body,
      y: 0.3,
      z: 0.8,
      spread: 0.3,
      eyeR: 0.13,
      angry: boss,
      fangs: boss,
      glow: boss ? 0xff3030 : undefined,
      grin: 0.15,
      blush: !boss,
    });
    // mirror-ball beret (flat-shaded facets), tilted & spinning
    const beretG = new THREE.Group();
    beretG.position.set(0.4, 1.05, 0.1);
    beretG.rotation.z = -0.35;
    body.add(beretG);
    const ballGeo = new THREE.IcosahedronGeometry(boss ? 0.42 : 0.32, 1);
    ballGeo.computeVertexNormals(); // non-indexed ⇒ flat facets (mirror tiles)
    const ball = O(new THREE.Mesh(ballGeo, toonMat({ color: 0xb9c6da })));
    beretG.add(ball);
    spin(ball, 'y', 2.4);
    // sequin studs that pulse on the beat
    (
      [
        [-0.55, 0.35, 0.62],
        [0.62, -0.1, 0.58],
        [-0.3, -0.55, 0.68],
      ] as const
    ).forEach(([x, y, z]) => {
      const stud = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), glowT);
      stud.position.set(x, y, z);
      body.add(stud);
    });
    nubArm(1, 0.15, 0.42, bodyT);
    nubArm(-1, 0.15, 0.42, bodyT);
    addCheeks(body, 0.5, -0.42, -0.62, 0.38);
    if (boss) {
      // boss flourish: jagged goo-crest + a fat gold chain
      [
        [0, 0.62, 0.5],
        [0.3, 0.52, 0.38],
        [-0.3, 0.52, 0.38],
      ].forEach(([x, h, hh]) => {
        const spike = O(new THREE.Mesh(new THREE.ConeGeometry(0.16, hh!, 8), bodyT), 0.014);
        spike.position.set(x!, 0.95 + h! * 0.4, -0.1);
        spike.rotation.z = -x! * 1.1;
        body.add(spike);
      });
      const chain = O(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.055, 10, 26), glowT), 0.012);
      chain.position.set(0, 0.1, 0.25);
      chain.rotation.x = 1.25;
      body.add(chain);
    }
  } else if (theme === 'synth') {
    // ---- Neon-Gremlin: big-eared grid gremlin with a glowing tail tip ----
    bodyY = 1.0;
    lean0 = 0.1;
    const torso = O(new THREE.Mesh(new THREE.SphereGeometry(0.72, 28, 28), bodyT));
    torso.scale.set(1, 1.1, 0.88);
    body.add(torso);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 22, 22), bellyT);
    belly.position.set(0, -0.18, 0.34);
    belly.scale.set(0.8, 0.72, 0.5);
    body.add(belly);
    // feet
    [-1, 1].forEach((s) => {
      const foot = O(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.42), darkT), 0.014);
      foot.position.set(s * 0.32, -bodyY + 0.09, 0.08);
      body.add(foot);
    });
    head = new THREE.Group();
    head.position.y = 1.06;
    body.add(head);
    const skull = O(new THREE.Mesh(new THREE.SphereGeometry(0.58, 30, 30), bodyT));
    skull.scale.set(1.05, 0.95, 0.92);
    head.add(skull);
    face({
      parent: head,
      y: 0.08,
      z: 0.48,
      spread: 0.22,
      eyeR: 0.11,
      angry: boss,
      glow: accent.getHex(),
      fangs: true,
      grin: 0.12,
    });
    // giant radar ears
    [-1, 1].forEach((s) => {
      const earG = new THREE.Group();
      earG.position.set(s * 0.48, 0.32, -0.02);
      earG.rotation.z = s * -0.75;
      head!.add(earG);
      const ear = O(
        new THREE.Mesh(new THREE.ConeGeometry(0.2, boss ? 0.95 : 0.72, 10), bodyT),
        0.014,
      );
      ear.position.y = (boss ? 0.95 : 0.72) * 0.5;
      earG.add(ear);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), glowT);
      tip.position.y = boss ? 0.98 : 0.75;
      earG.add(tip);
      flap(earG, 'z', 0.14, 4.6, s > 0 ? 0 : Math.PI);
    });
    // wagging neon tail
    const tailG = new THREE.Group();
    tailG.position.set(0, -0.35, -0.55);
    body.add(tailG);
    const seg1 = O(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), bodyT), 0.012);
    seg1.position.z = -0.25;
    seg1.rotation.x = -0.4;
    tailG.add(seg1);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), glowT);
    tip.position.set(0, 0.12, -0.52);
    tailG.add(tip);
    flap(tailG, 'y', 0.55, 6.8);
    nubArm(1, 0.12, 0.38, bodyT);
    nubArm(-1, 0.12, 0.38, bodyT);
    addCheeks(body, 0.42, -0.34, -0.5, 0.34);
    if (boss) {
      // boss flourish: glowing pixel mohawk marching over the skull
      for (let i = 0; i < 5; i++) {
        const px2 = new THREE.Mesh(
          new THREE.BoxGeometry(0.13, 0.3 - Math.abs(i - 2) * 0.05, 0.13),
          glowT,
        );
        px2.position.set(0, 0.52 + (0.3 - Math.abs(i - 2) * 0.05) * 0.5, 0.3 - i * 0.16);
        head.add(px2);
      }
    }
  } else if (theme === 'beach') {
    // ---- Krabbo: a wide sunset crab with raised claws and stalk eyes ----
    bodyY = 0.98;
    lean0 = 0.05;
    const shell = O(new THREE.Mesh(new THREE.SphereGeometry(0.82, 30, 30), bodyT));
    shell.scale.set(1.32, 0.82, 1.0);
    body.add(shell);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 24), bellyT);
    belly.position.set(0, -0.22, 0.42);
    belly.scale.set(1.1, 0.55, 0.55);
    body.add(belly);
    face({
      parent: body,
      y: -0.05,
      z: 0.88,
      spread: 0.3,
      eyeR: 0.1,
      noEyes: true, // eyes live on wobbling stalks (built below)
      angry: boss,
      grin: 0.14,
      blush: !boss,
    });
    // stalk eyes (googly, wobbling)
    [-1, 1].forEach((s) => {
      const stalkG = new THREE.Group();
      stalkG.position.set(s * 0.34, 0.55, 0.25);
      body.add(stalkG);
      const stalk = O(
        new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 10), bodyT),
        0.012,
      );
      stalk.position.y = 0.25;
      stalkG.add(stalk);
      const w = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), eyeWhite), {
        thickness: 0.012,
      });
      w.position.y = 0.58;
      stalkG.add(w);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), inkFlat);
      p.position.set(0, 0.58, 0.11);
      stalkG.add(p);
      pupils.push(p);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.045), inkFlat);
      brow.position.set(0, 0.78, 0.06);
      brow.rotation.z = s * (boss ? 0.5 : -0.14);
      stalkG.add(brow);
      flap(stalkG, 'x', 0.12, 3.8, s > 0 ? 0.6 : 2.8);
    });
    // big raised claws — snip-snip to the beat
    const clawScale = boss ? 1.5 : 1;
    [-1, 1].forEach((s) => {
      const shoulderG = new THREE.Group();
      shoulderG.position.set(s * 1.05, 0.18, 0.15);
      shoulderG.rotation.z = s * -0.85;
      body.add(shoulderG);
      const arm = O(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.42, 6, 12), bodyT), 0.014);
      arm.position.y = 0.24;
      shoulderG.add(arm);
      const claw = O(new THREE.Mesh(new THREE.SphereGeometry(0.32 * clawScale, 20, 20), bodyT));
      claw.scale.set(1.25, 0.95, 0.85);
      claw.position.y = 0.55 + 0.18 * clawScale;
      shoulderG.add(claw);
      const thumb = O(
        new THREE.Mesh(new THREE.ConeGeometry(0.12 * clawScale, 0.34 * clawScale, 10), bodyT),
        0.012,
      );
      thumb.position.set(s * 0.2 * clawScale, 0.78 + 0.3 * clawScale, 0);
      thumb.rotation.z = s * -0.5;
      shoulderG.add(thumb);
      flap(shoulderG, 'z', 0.3, 5.2, s > 0 ? 0 : Math.PI);
    });
    // scuttle legs
    [-1, 1].forEach((s) => {
      for (let i = 0; i < 3; i++) {
        const legG = new THREE.Group();
        legG.position.set(s * (0.75 + i * 0.12), -0.42, 0.3 - i * 0.32);
        legG.rotation.z = s * -0.9;
        body.add(legG);
        const leg = O(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.5, 8), bodyT), 0.01);
        leg.position.y = -0.22;
        legG.add(leg);
        flap(legG, 'x', 0.3, 8.4, i * 1.6 + (s > 0 ? 0 : Math.PI));
      }
    });
    addCheeks(body, 0.44, -0.28, -0.62, 0.4);
    if (boss) {
      // boss flourish: jagged shell spikes
      [
        [0, 0.6, 0.42],
        [0.5, 0.45, 0.32],
        [-0.5, 0.45, 0.32],
        [0.9, 0.25, 0.26],
        [-0.9, 0.25, 0.26],
      ].forEach(([x, y, h]) => {
        const spike = O(new THREE.Mesh(new THREE.ConeGeometry(0.12, h!, 8), darkT), 0.012);
        spike.position.set(x!, y! + h! * 0.3, -0.15);
        spike.rotation.z = -x! * 0.55;
        body.add(spike);
      });
    }
  } else {
    // ---- Blorb: a hovering three-eyed alien in a glowing saucer skirt ----
    bodyY = 1.42;
    lean0 = 0.06;
    hover = true;
    const blob = O(new THREE.Mesh(new THREE.SphereGeometry(0.78, 30, 30), bodyT));
    blob.scale.set(1, 1.2, 0.92);
    body.add(blob);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.55, 22, 22), bellyT);
    belly.position.set(0, -0.3, 0.36);
    belly.scale.set(0.85, 0.65, 0.5);
    body.add(belly);
    face({
      parent: body,
      y: 0.28,
      z: 0.66,
      spread: 0.26,
      eyeR: 0.11,
      angry: boss,
      cyclops: boss,
      thirdEye: !boss,
      glow: boss ? 0xff3030 : undefined,
      grin: 0.12,
      blush: !boss,
    });
    // saucer skirt — a spinning glow ring it rides on
    const ringG = new THREE.Group();
    ringG.position.y = -0.72;
    body.add(ringG);
    const ring = O(
      new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.14, 12, 30), toonMat({ color: 0xc9d4e4 })),
      0.014,
    );
    ring.rotation.x = Math.PI / 2;
    ringG.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), glowT);
      stud.position.set(Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85);
      ringG.add(stud);
    }
    spin(ringG, 'y', 1.6);
    // antennae with glowing bulbs
    [-1, 1].forEach((s) => {
      const antG = new THREE.Group();
      antG.position.set(s * 0.28, 0.85, -0.05);
      antG.rotation.z = s * -0.35;
      body.add(antG);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), darkT);
      stem.position.y = 0.25;
      antG.add(stem);
      const bulb = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), glowT), {
        thickness: 0.012,
      });
      bulb.position.y = 0.55;
      antG.add(bulb);
      flap(antG, 'z', 0.22, 4.2, s > 0 ? 0 : Math.PI);
    });
    nubArm(1, 0.05, 0.4, bodyT);
    nubArm(-1, 0.05, 0.4, bodyT);
    addCheeks(body, 0.44, -0.32, -0.55, 0.35);
    if (boss) {
      // boss flourish: spiked saucer ring
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const spike = O(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 8), darkT), 0.01);
        spike.position.set(Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0);
        spike.rotation.z = -Math.PI / 2;
        spike.lookAt(spike.position.x * 2, 0, spike.position.z * 2);
        spike.rotateX(Math.PI / 2);
        ringG.add(spike);
      }
    }
  }
  body.position.y = bodyY;
  body.rotation.x = lean0;

  // =====================================================================
  // Animation state + API
  // =====================================================================
  let lastT = 0;
  let flinchT = 0;
  let defeatT = 0.55; // spawn-in: play the tail (grow-boing) of the KO pop
  // Deterministic taunt phase (bosses slightly offset) — the face-off reads
  // face-on most of the time, with a booty-shake taunt once per cycle.
  const tauntSeed = boss ? 0.6 : 0;

  function update(t: number, beatV: number, drive: number): void {
    const dt = Math.min(Math.max(t - lastT, 0), 0.05);
    lastT = t;
    const tempo = 1 + Math.min(drive, 6) * 0.18;
    const wob = Math.sin(t * 6.4 * tempo);

    // Taunt cycle: every few seconds it whips around and shakes its booty AT you.
    const cyc = (t + tauntSeed) % TAUNT_PERIOD;
    const turn = smooth01((cyc - 5.0) / 0.6) * (1 - smooth01((cyc - 7.2) / 0.6));
    root.rotation.y = baseRotY + turn * Math.PI;

    // Body groove: beat bounce + squat pump, deeper while taunting.
    body.position.y =
      bodyY +
      beatV * 0.12 +
      Math.max(0, wob) * 0.05 -
      turn * 0.12 +
      (hover ? Math.sin(t * 2.3) * 0.1 : 0);
    body.rotation.x = lean0 + turn * 0.3 + wob * 0.045;
    body.scale.y = 1 + Math.max(0, wob) * 0.045 + beatV * 0.03;

    // The rival's twerk: cheeks alternate-bounce, harder mid-taunt.
    for (const c of cheeks) {
      const k = Math.sin(t * 7.4 * tempo + (c.side > 0 ? 0 : Math.PI));
      const pop2 = Math.max(0, k) * (0.16 + turn * 0.12) + beatV * 0.08;
      c.m.scale.set(1 - pop2 * 0.4, 1 + pop2, 1 - pop2 * 0.4);
      c.m.position.y = pop2 * 0.07;
    }

    for (const f of flappers) {
      f.o.rotation[f.axis] = f.base + Math.sin(t * f.freq * tempo + f.phase) * f.amp;
    }
    for (const s of spinners) s.o.rotation[s.axis] = t * s.speed;
    for (const g of glowPulse) g.m.emissiveIntensity = g.base + beatV * 0.7;
    if (head) {
      head.rotation.z = Math.sin(t * 3.4) * 0.07;
      head.rotation.x = turn * 0.18;
    }

    // Hit/KO overlays (KO wins; both decay via dt so they survive fps caps).
    if (defeatT > 0) {
      defeatT = Math.max(0, defeatT - dt * 2.2);
      const p = 1 - defeatT;
      root.rotation.y += p * Math.PI * 2; // full cartoon spin on top of the facing
      const s = p < 0.3 ? 1 - (p / 0.3) * 0.72 : 0.28 + 0.72 * elasticOut((p - 0.3) / 0.7);
      root.scale.setScalar(baseScale * Math.max(0.001, s));
      root.position.z = pz;
      root.rotation.x = 0;
    } else if (flinchT > 0) {
      flinchT = Math.max(0, flinchT - dt * 3.4);
      const f = flinchT;
      root.scale.set(
        baseScale * (1 + 0.17 * f),
        baseScale * (1 - 0.24 * f),
        baseScale * (1 + 0.17 * f),
      );
      root.position.z = pz + f * 0.3; // knocked back a step
      root.rotation.x = -0.2 * f; // reeling
      for (const p2 of pupils) p2.scale.setScalar(1 - 0.45 * f);
    } else {
      root.scale.setScalar(baseScale);
      root.position.z = pz;
      root.rotation.x = 0;
      for (const p2 of pupils) p2.scale.setScalar(1);
    }
  }

  function flinch(): void {
    if (defeatT <= 0) flinchT = 1;
  }

  function defeat(): void {
    defeatT = 1;
    flinchT = 0;
  }

  function detach(sceneRef: THREE.Scene): void {
    sceneRef.remove(root);
    root.traverse((o) => {
      const mesh = o as Partial<THREE.Mesh> & THREE.Object3D;
      mesh.geometry?.dispose();
      // The inverted-hull outline material is a shared module-level cache — keep it.
      if (o.name === 'ink-outline') return;
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  return { root, theme, boss, variant, update, flinch, defeat, detach };
}
