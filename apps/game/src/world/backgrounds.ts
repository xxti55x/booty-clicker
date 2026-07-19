import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { INK, mk, outlineMaterial, toonMat, withOutline } from '../engine/materials';
import type { GlowSpriteFn } from '../engine/scene';
import { gridTex, plankTex, platesTex, repeated, speckleTex } from '../engine/textures';
import { buildIsland } from './island';
import type { BackgroundKey, WorldAnim } from '../types';

/**
 * Stage scenery — Wave 3 of the cartoon art pass. Every stage's hero props are
 * cel-shaded (`toonMat`) with inverted-hull ink outlines (`withOutline`) so the
 * scenery reads in the same cartoon world as the player rig (Wave 1) and the
 * rival entities (Wave 2). Purely-atmospheric elements keep their original
 * treatment where toon would look worse: the mirror-ball reflections, the
 * synthwave sun shader, the star Points, additive glow sprites/beams and the
 * animated sea.
 *
 * Staging: the boot camera sits at ~(-2.7, 3.8, -8.8) looking across the origin
 * toward +z, so the visible backdrop wedge is the +z hemisphere (+x = screen
 * left). Hero props live there — kept to the back/sides so they never occlude
 * the player (origin) or the rival (ENTITY_STAGE ≈ (3.5, -2.4, 4.4), screen
 * left) — with a sparser echo at −z so orbiting the camera still finds scenery.
 */

/** Hue-shift per recolour lap — matches the rival's `entityVariant` cadence. */
const LAP_HUE = 0.085;

interface BuildCtx {
  propGroup: THREE.Group;
  glowSprite: GlowSpriteFn;
  anims: WorldAnim[];
  /** Recolour lap 0,1,2… (endless depth); 0 = the stage's original palette. */
  variant: number;
  /** Lap-shifted palette colour — identity on lap 0. */
  hue: (hex: number) => THREE.Color;
}

interface BgConfig {
  icon: string;
  name: string;
  top: number;
  bot: number;
  fog: number;
  floor: number;
  /** floor roughness */
  fr: number;
  /** floor metalness */
  fm: number;
  /** BP milestone (highest-ever) before this appears in the shop (M2 content-gate). */
  revealAt?: number;
  /**
   * Insel-Deck-Texturierung (Goal „apply texture"): prozedurale Maps auf der
   * geteilten Oberseite — `map` multipliziert die Deckfarbe, `emissiveMap`
   * lässt Muster glühen (Synth-Grid), `scroll` schiebt die Emissive-Map (u/s).
   */
  deck?: {
    map?: () => THREE.Texture;
    emissiveMap?: () => THREE.Texture;
    emissive?: number;
    emissiveIntensity?: number;
    scroll?: number;
    /** Relief-Stärke (Roadmap T2): Map/Emissive-Map dient zugleich als Bump-Höhe. */
    bump?: number;
  };
  build: (ctx: BuildCtx) => void;
}

// ---------------------------------------------------------------------------
// Shared cartoon prop builders
// ---------------------------------------------------------------------------

/** Ink-outline a scenery mesh (cartoon default treatment for props). */
function O<T extends THREE.Mesh>(m: T, thickness = 0.03): T {
  return withOutline(m, { thickness });
}

interface Sway {
  g: THREE.Group;
  phase: number;
  amp: number;
}

/**
 * Chunky cartoon palm: toon trunk, six blob fronds (baked-scale spheres so the
 * ink hull keeps constant weight) and a pair of coconuts. Registered in
 * `sways` for the caller's shared sway anim.
 */
function palm(
  ctx: BuildCtx,
  x: number,
  z: number,
  s: number,
  trunkHex: number,
  leafHex: number,
  sways: Sway[],
): void {
  const { propGroup, hue } = ctx;
  const g = new THREE.Group();
  const trunk = O(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.13 * s, 0.24 * s, 3.3 * s, 8),
      toonMat({ color: hue(trunkHex) }),
    ),
  );
  trunk.position.y = 1.62 * s;
  trunk.rotation.z = -0.09;
  g.add(trunk);
  const leafGeo = new THREE.SphereGeometry(1, 10, 8);
  leafGeo.scale(1.12 * s, 0.22 * s, 0.44 * s);
  const leafMat = toonMat({ color: hue(leafHex) });
  const crown = new THREE.Group();
  crown.position.set(0.3 * s, 3.28 * s, 0);
  g.add(crown);
  for (let i = 0; i < 6; i++) {
    const hold = new THREE.Group();
    hold.rotation.y = (i / 6) * Math.PI * 2 + 0.35;
    crown.add(hold);
    const leaf = O(new THREE.Mesh(leafGeo, leafMat));
    leaf.position.x = 0.92 * s;
    leaf.rotation.z = -0.48;
    hold.add(leaf);
  }
  const nutGeo = new THREE.SphereGeometry(0.15 * s, 8, 8);
  const nutMat = toonMat({ color: hue(0x6b4a2a) });
  const nut1 = O(new THREE.Mesh(nutGeo, nutMat), 0.02);
  nut1.position.set(0.16 * s, 3.12 * s, 0.18 * s);
  const nut2 = O(new THREE.Mesh(nutGeo, nutMat), 0.02);
  nut2.position.set(0.48 * s, 3.08 * s, -0.12 * s);
  g.add(nut1, nut2);
  g.position.set(x, -2.4, z);
  propGroup.add(g);
  sways.push({ g, phase: x * 0.7 + z, amp: 0.02 + 0.012 * ((Math.abs(x) + s) % 1) });
}

/**
 * Chunky cartoon speaker stack facing the dance floor: rounded cabinets (soft
 * edges keep the ink hull crack-free), toon woofers and a beat-pulsed glowing
 * dome pushed into `pulses`.
 */
function speakerStack(
  ctx: BuildCtx,
  x: number,
  z: number,
  s: number,
  pulses: THREE.Object3D[],
): void {
  const { propGroup, hue } = ctx;
  const g = new THREE.Group();
  g.position.set(x, -2.4, z);
  g.rotation.y = Math.atan2(-x, -z); // face the stage centre
  const cabMat = toonMat({ color: hue(0x3a2b58) });
  const rimMat = toonMat({ color: 0x241c34 });
  const discMat = toonMat({ color: 0x171226 });
  const accent = hue(0xffd24d);
  const domeMat = toonMat({ color: accent, emissive: accent, emissiveIntensity: 0.9 });
  const cab = O(
    new THREE.Mesh(new RoundedBoxGeometry(1.9 * s, 2.5 * s, 1.4 * s, 2, 0.12 * s), cabMat),
    0.04,
  );
  cab.position.y = 1.25 * s;
  g.add(cab);
  const top = O(
    new THREE.Mesh(new RoundedBoxGeometry(1.45 * s, 1.05 * s, 1.15 * s, 2, 0.1 * s), cabMat),
    0.04,
  );
  top.position.y = 3.05 * s;
  top.rotation.y = 0.16; // jaunty cartoon stack
  g.add(top);
  const woofer = (y: number, r: number, parent: THREE.Object3D, zFront: number): void => {
    const ring = O(new THREE.Mesh(new THREE.TorusGeometry(r, 0.085 * s, 10, 22), rimMat), 0.02);
    ring.position.set(0, y, zFront);
    parent.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 20), discMat);
    disc.position.set(0, y, zFront + 0.01);
    parent.add(disc);
    const domeGeo = new THREE.SphereGeometry(r * 0.38, 12, 8);
    domeGeo.scale(1, 1, 0.6);
    const dome = O(new THREE.Mesh(domeGeo, domeMat), 0.02);
    dome.position.set(0, y, zFront + 0.04);
    parent.add(dome);
    pulses.push(dome);
  };
  woofer(1.05 * s, 0.55 * s, g, 0.72 * s);
  woofer(2.05 * s, 0.26 * s, g, 0.72 * s);
  woofer(0, 0.32 * s, top, 0.6 * s); // top cab front (local coords)
  propGroup.add(g);
}

/** One-draw-call cartoon confetti cloud (vertex-coloured quads, unlit). */
function confettiCloud(ctx: BuildCtx, count: number): THREE.Mesh {
  const { hue } = ctx;
  const palette = [0xff4fa0, 0xffd24d, 0x4dc9ff, 0xa8e831, 0xb35bf2];
  const pos = new Float32Array(count * 4 * 3);
  const col = new Float32Array(count * 4 * 3);
  const idx = new Uint16Array(count * 6);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 8.5;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = -1.4 + Math.random() * 5;
    const sSize = 0.09 + Math.random() * 0.08;
    const t1 = Math.random() * Math.PI * 2;
    const t2 = Math.random() * Math.PI;
    const ux = Math.cos(t1) * sSize;
    const uy = Math.sin(t1) * sSize;
    const uz = Math.cos(t2) * sSize * 0.5;
    const vx = Math.sin(t2) * Math.sin(t1) * sSize;
    const vy = Math.cos(t2) * sSize;
    const vz = Math.sin(t2) * Math.cos(t1) * sSize;
    const corners = [
      [cx - ux - vx, cy - uy - vy, cz - uz - vz],
      [cx + ux - vx, cy + uy - vy, cz + uz - vz],
      [cx + ux + vx, cy + uy + vy, cz + uz + vz],
      [cx - ux + vx, cy - uy + vy, cz - uz + vz],
    ];
    const c = hue(palette[i % palette.length]);
    for (let k = 0; k < 4; k++) {
      const o = (i * 4 + k) * 3;
      pos[o] = corners[k][0];
      pos[o + 1] = corners[k][1];
      pos[o + 2] = corners[k][2];
      col[o] = c.r;
      col[o + 1] = c.g;
      col[o + 2] = c.b;
    }
    const v0 = i * 4;
    const f = i * 6;
    idx[f] = v0;
    idx[f + 1] = v0 + 1;
    idx[f + 2] = v0 + 2;
    idx[f + 3] = v0;
    idx[f + 4] = v0 + 2;
    idx[f + 5] = v0 + 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
}

/** Little cartoon UFO: baked-squash saucer, glass dome, beat-pulsed rim lights. */
function ufo(
  ctx: BuildCtx,
  x: number,
  y: number,
  z: number,
  s: number,
  hovers: { g: THREE.Group; y0: number; ph: number }[],
  lightMats: THREE.MeshToonMaterial[],
  beam = false,
): void {
  const { propGroup, hue } = ctx;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const bodyGeo = new THREE.SphereGeometry(0.85 * s, 20, 12);
  bodyGeo.scale(1, 0.34, 1);
  g.add(O(new THREE.Mesh(bodyGeo, toonMat({ color: hue(0xb9aee0) })), 0.03));
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.4 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    toonMat({ color: hue(0x9ff2ff), transparent: true, opacity: 0.78 }),
  );
  dome.position.y = 0.16 * s;
  g.add(dome);
  const accent = hue(0x2ff5e8);
  const lightMat = toonMat({ color: accent, emissive: accent, emissiveIntensity: 0.8 });
  lightMats.push(lightMat);
  const bulbGeo = new THREE.SphereGeometry(0.09 * s, 8, 8);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(bulbGeo, lightMat);
    const a = (i / 4) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.62 * s, -0.06 * s, Math.sin(a) * 0.62 * s);
    g.add(b);
  }
  if (beam) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.55 * s, 1.8 * s, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    cone.position.y = -1.05 * s;
    g.add(cone);
  }
  propGroup.add(g);
  hovers.push({ g, y0: y, ph: x + z });
}

// ---------------------------------------------------------------------------
// The four stages
// ---------------------------------------------------------------------------

/** The four stages — cartoon-restyled (Wave 3), gameplay fields untouched. */
export const BGS: Record<BackgroundKey, BgConfig> = {
  club: {
    icon: '🪩',
    name: 'Neon-Club',
    top: 0x241830,
    bot: 0x050507,
    fog: 0x0a0a10,
    floor: 0x2a2532,
    fr: 0.3,
    fm: 0.55,
    revealAt: 0,
    deck: { map: () => repeated(plankTex(1), 5, 5), bump: 0.35 }, // dunkles Club-Parkett
    build(ctx) {
      const { propGroup, glowSprite, anims, hue } = ctx;
      // Mirror ball, hung low over the visible back floor — kept mirror-PBR for
      // the sparkle, but ink-outlined so it sits in the cartoon world.
      const ball = withOutline(
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.9, 2),
          mk({
            color: 0xffffff,
            roughness: 0.06,
            metalness: 1,
            envMapIntensity: 2,
            flatShading: true,
          }),
        ),
        { thickness: 0.05 },
      );
      ball.position.set(9, 1.6, 14.5);
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 6.6, 6),
        toonMat({ color: 0x241c34 }),
      );
      wire.position.set(9, 5.6, 14.5);
      propGroup.add(ball, wire);
      propGroup.add(glowSprite(0xffffff, 3.5, 9, 1.6, 14.5));
      // Sweeping club spotlights + additive beams (atmospheric — kept as-is).
      const cols = [hue(0xff3366), hue(0x33ff88), hue(0x3388ff), hue(0xffdd33)];
      const beams: { l: THREE.SpotLight; beam: THREE.Mesh; ph: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const l = new THREE.SpotLight(cols[i], 90, 45, 0.45, 0.55, 1.6);
        l.position.set(Math.cos(i * 1.57) * 8, 8.5, Math.sin(i * 1.57) * 8);
        l.target.position.set(0, -2, 0);
        propGroup.add(l, l.target);
        const beam = new THREE.Mesh(
          new THREE.ConeGeometry(1.6, 10, 20, 1, true),
          new THREE.MeshBasicMaterial({
            color: cols[i],
            transparent: true,
            opacity: 0.06,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        propGroup.add(beam);
        beams.push({ l, beam, ph: i * 1.57 });
      }
      // Beat-reactive dance tiles (already cartoon-graphic — kept).
      const tiles: THREE.Mesh[] = [];
      for (let ix = -4; ix < 4; ix++)
        for (let iz = -4; iz < 4; iz++) {
          const tx = ix * 2 + 1;
          const tz = iz * 2 + 1;
          // Insel-POV: Ecken-Tiles jenseits der Inselkante entfallen — die
          // Tanzfläche liegt als gerundetes Feld AUF der schwebenden Insel
          // (Insel-Zentrum = Duo-Mitte 1.4/1.7, siehe scene.ts ISLAND_C).
          if (Math.hypot(tx - 1.4, tz - 1.7) > 5.6) continue;
          const t = new THREE.Mesh(
            new THREE.PlaneGeometry(1.9, 1.9),
            mk({
              color: 0x111118,
              roughness: 0.3,
              metalness: 0.5,
              emissive: 0x8b5cf6,
              emissiveIntensity: 0,
            }),
          );
          t.rotation.x = -Math.PI / 2;
          t.position.set(tx, -2.39, tz);
          propGroup.add(t);
          tiles.push(t);
        }
      // Chunky cartoon speaker stacks flanking the floor + one echo at −z.
      const pulses: THREE.Object3D[] = [];
      speakerStack(ctx, 10.5, 10, 1.35, pulses);
      speakerStack(ctx, -6.5, 14, 1.15, pulses);
      speakerStack(ctx, -7, -11, 1.2, pulses);
      // Drifting confetti cloud (single vertex-coloured mesh).
      const confettiG = confettiCloud(ctx, 130);
      confettiG.position.set(1.5, 0.9, 7);
      propGroup.add(confettiG);
      anims.push((t, beatV) => {
        ball.rotation.y += 0.012;
        for (let i = 0; i < beams.length; i++) {
          const b = beams[i];
          b.ph += 0.008;
          const x = Math.cos(b.ph) * 8;
          const z = Math.sin(b.ph) * 8;
          b.l.position.set(x, 8.5, z);
          b.beam.position.set(x * 0.6, 3.2, z * 0.6);
          b.beam.lookAt(0, -2.4, 0);
          b.beam.rotateX(-Math.PI / 2);
        }
        for (let i = 0; i < tiles.length; i++) {
          const mat = tiles[i].material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = Math.max(0, Math.sin(t * 3 + i * 0.7)) * 0.8 * (0.4 + beatV);
          mat.emissive.setHSL((t * 0.05 + i * 0.03) % 1, 0.8, 0.5);
        }
        const pk = 1 + beatV * 0.3;
        for (let i = 0; i < pulses.length; i++) pulses[i].scale.setScalar(pk);
        confettiG.rotation.y = t * 0.07;
        confettiG.position.y = 0.9 + Math.sin(t * 0.5) * 0.35;
      });
    },
  },
  synth: {
    icon: '🌆',
    name: 'Synthwave',
    top: 0x3a1060,
    bot: 0x0a0518,
    fog: 0x140628,
    floor: 0x1c1230,
    fr: 0.2,
    fm: 0.7,
    revealAt: 800,
    // Das Neon-Grid ist jetzt das DECK selbst: glühende Grid-Textur über die
    // GANZE Inselfläche (der alte GridHelper deckte nur 9 von 12.8 Einheiten),
    // langsam scrollend wie der klassische Synthwave-Boden.
    deck: {
      emissiveMap: () => repeated(gridTex(8), 3, 3),
      emissive: 0xff3fb0,
      emissiveIntensity: 0.55,
      scroll: 0.045,
      bump: 0.15, // Grid-Linien als flache Grate
    },
    build(ctx) {
      const { propGroup, glowSprite, anims, hue } = ctx;
      // Striped retro sun (shader kept as-is), now setting into the VISIBLE
      // horizon (+z wedge) instead of behind the boot camera.
      const sunMat = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { t: { value: 0 } },
        vertexShader: `varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying vec2 u;uniform float t;
          void main(){vec2 c=u-0.5;float d=length(c)*2.0;if(d>1.0)discard;
            float stripes=step(0.0,sin((u.y+t*0.02)*60.0))*step(0.42,u.y);
            vec3 col=mix(vec3(1.0,0.85,0.3),vec3(1.0,0.25,0.55),u.y);
            float a=(1.0-smoothstep(0.95,1.0,d))*(1.0-stripes*smoothstep(1.0,0.42,u.y)*0.9);
            gl_FragColor=vec4(col,a);}`,
      });
      const sun = new THREE.Mesh(new THREE.CircleGeometry(7, 64), sunMat);
      sun.position.set(9, 0.6, 34);
      sun.rotation.y = Math.PI; // face the boot camera
      propGroup.add(sun);
      propGroup.add(glowSprite(hue(0xff4f90), 16, 9, 0.6, 33));
      // Toon mountain ring with neon wireframe ridges (all azimuths).
      const mtnMat = toonMat({ color: hue(0x1c1038) });
      const wireMat = new THREE.MeshBasicMaterial({
        color: hue(0xff3fb0),
        wireframe: true,
        transparent: true,
        opacity: 0.25,
      });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.26;
        const r = 27 + (i % 3) * 4;
        const h = 4.5 + ((i * 2.7) % 4);
        const geo = new THREE.ConeGeometry(3 + ((i * 1.3) % 2.5), h, 6);
        const m = O(new THREE.Mesh(geo, mtnMat), 0.07);
        m.position.set(Math.cos(a) * r, -2.4 + h / 2, Math.sin(a) * r);
        m.rotation.y = (i * 1.1) % 3;
        m.add(new THREE.Mesh(geo, wireMat));
        propGroup.add(m);
      }
      // Dark toon palms flanking the sun (classic synthwave silhouettes).
      const sways: Sway[] = [];
      palm(ctx, 13, 20, 1.35, 0x241244, 0x3d1868, sways);
      palm(ctx, 17.5, 26, 1.6, 0x241244, 0x3d1868, sways);
      palm(ctx, 5, 26, 1.15, 0x241244, 0x3d1868, sways);
      palm(ctx, -8, 19, 1.25, 0x241244, 0x3d1868, sways);
      palm(ctx, -4, -16, 1.3, 0x241244, 0x3d1868, sways);
      palm(ctx, 9, -18, 1.2, 0x241244, 0x3d1868, sways);
      // Floating vaporwave solids: neon donut + chrome-ish orb, slow spin.
      const donut = O(
        new THREE.Mesh(
          new THREE.TorusGeometry(0.8, 0.32, 14, 26),
          toonMat({ color: hue(0xff3fb0), emissive: hue(0xff3fb0), emissiveIntensity: 0.35 }),
        ),
        0.03,
      );
      donut.position.set(12, 1.1, 16);
      propGroup.add(donut);
      const orb = O(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.65, 18, 14),
          toonMat({ color: hue(0x2ff5e8), emissive: hue(0x2ff5e8), emissiveIntensity: 0.4 }),
        ),
        0.03,
      );
      orb.position.set(15.5, 2.2, 23);
      propGroup.add(orb);
      anims.push((t) => {
        sunMat.uniforms.t.value = t;
        for (let i = 0; i < sways.length; i++) {
          const s = sways[i];
          s.g.rotation.z = Math.sin(t * 0.8 + s.phase) * s.amp;
        }
        donut.rotation.y = t * 0.5;
        donut.rotation.x = 0.9 + Math.sin(t * 0.7) * 0.2;
        donut.position.y = 1.1 + Math.sin(t * 0.9) * 0.25;
        orb.position.y = 2.2 + Math.sin(t * 0.7 + 2) * 0.3;
      });
    },
  },
  beach: {
    icon: '🏖️',
    name: 'Sunset Beach',
    top: 0xff8a4d,
    bot: 0x2a1533,
    fog: 0x3a1a30,
    floor: 0xb08b52,
    fr: 0.85,
    fm: 0.05,
    revealAt: 6000,
    deck: { map: () => repeated(speckleTex(1, 1100), 4, 4), bump: 0.25 }, // körniger Sand
    build(ctx) {
      const { propGroup, glowSprite, anims, hue } = ctx;
      // Setting sun over the visible sea horizon (emissive disc + glow, kept).
      const sun = new THREE.Mesh(
        new THREE.CircleGeometry(4.5, 48),
        mk({ color: 0xffe08a, emissive: 0xffb84d, emissiveIntensity: 1.8, roughness: 1 }),
      );
      sun.position.set(10, 0.8, 38);
      sun.rotation.y = Math.PI;
      propGroup.add(sun);
      propGroup.add(glowSprite(hue(0xffa54d), 14, 10, 0.8, 37));
      // Animated sea (kept as-is per the art brief), shoreline behind the duo.
      const seaGeo = new THREE.PlaneGeometry(90, 45, 48, 24);
      const sea = new THREE.Mesh(
        seaGeo,
        mk({ color: hue(0x1a4a6a), roughness: 0.12, metalness: 0.35, envMapIntensity: 1.1 }),
      );
      sea.rotation.x = -Math.PI / 2;
      // Insel-POV: der Ozean liegt TIEF unter der schwebenden Insel.
      sea.position.set(0, -7.5, 30);
      propGroup.add(sea);
      // Toon palms — postcard framing on the visible side, echo behind.
      const sways: Sway[] = [];
      palm(ctx, 10.5, 9.5, 1.25, 0x8a5a30, 0x2fae4e, sways);
      palm(ctx, 15, 15, 1.5, 0x8a5a30, 0x2fae4e, sways);
      palm(ctx, -7.5, 12, 1.1, 0x7a4c28, 0x27994a, sways);
      palm(ctx, -12, -7, 1.35, 0x8a5a30, 0x2fae4e, sways);
      palm(ctx, 7, -13, 1.2, 0x7a4c28, 0x27994a, sways);
      // Striped umbrella (each wedge toon; one ink hull for the silhouette).
      {
        const g = new THREE.Group();
        const wedgeA = toonMat({ color: hue(0xff4d5a) });
        const wedgeB = toonMat({ color: 0xfff2dc });
        for (let i = 0; i < 8; i++) {
          const w = new THREE.Mesh(
            new THREE.ConeGeometry(1.85, 0.95, 3, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4),
            i % 2 ? wedgeA : wedgeB,
          );
          w.position.y = 2.15;
          g.add(w);
        }
        const hull = new THREE.Mesh(
          new THREE.ConeGeometry(1.85, 0.95, 24, 1, true),
          outlineMaterial(INK, 0.035),
        );
        hull.position.y = 2.15;
        g.add(hull);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), wedgeA);
        tip.position.y = 2.72;
        g.add(tip);
        const pole = O(
          new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.06, 2.7, 8),
            toonMat({ color: 0xc9a06a }),
          ),
          0.02,
        );
        pole.position.y = 1.35;
        g.add(pole);
        g.rotation.z = 0.24;
        g.position.set(8, -2.4, 7.2);
        propGroup.add(g);
      }
      // Beach ball (six toon wedges + one ink hull) — bounces on the beat.
      const ballG = new THREE.Group();
      {
        const r = 0.55;
        const wedgeCols = [0xfff6e8, 0xff4d5a, 0xfff6e8, 0x3fa8ff, 0xfff6e8, 0xffd24d];
        for (let i = 0; i < 6; i++) {
          ballG.add(
            new THREE.Mesh(
              new THREE.SphereGeometry(r, 6, 12, (i / 6) * Math.PI * 2, Math.PI / 3),
              toonMat({ color: hue(wedgeCols[i]) }),
            ),
          );
        }
        ballG.add(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), outlineMaterial(INK, 0.028)));
        ballG.position.set(9.5, -1.85, 5.5);
        propGroup.add(ballG);
      }
      // Starfish chilling on the sand.
      {
        const s = 1.1;
        const g = new THREE.Group();
        const starMat = toonMat({ color: hue(0xff7a8a) });
        const armGeo = new THREE.SphereGeometry(1, 8, 6);
        armGeo.scale(0.42 * s, 0.11 * s, 0.16 * s);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const arm = O(new THREE.Mesh(armGeo, starMat), 0.02);
          arm.position.set(Math.cos(a) * 0.3 * s, 0, Math.sin(a) * 0.3 * s);
          arm.rotation.y = -a;
          g.add(arm);
        }
        const coreGeo = new THREE.SphereGeometry(1, 10, 8);
        coreGeo.scale(0.24 * s, 0.13 * s, 0.24 * s);
        g.add(O(new THREE.Mesh(coreGeo, starMat), 0.02));
        g.position.set(7.2, -2.31, 6.1);
        g.rotation.y = 0.7;
        propGroup.add(g);
      }
      // Tiny island on the horizon, with its own mini palm.
      {
        const isle = new THREE.Group();
        const domeGeo = new THREE.SphereGeometry(2.6, 14, 10);
        domeGeo.scale(1, 0.42, 1);
        isle.add(O(new THREE.Mesh(domeGeo, toonMat({ color: hue(0x8a6a3a) })), 0.06));
        isle.position.set(20, -2.2, 36);
        propGroup.add(isle);
        palm(ctx, 20, 36, 0.9, 0x7a4c28, 0x27994a, sways);
      }
      const pos = seaGeo.attributes.position;
      anims.push((t, beatV) => {
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          pos.setZ(i, Math.sin(x * 0.35 + t * 1.4) * 0.18 + Math.cos(y * 0.3 + t * 1.1) * 0.14);
        }
        pos.needsUpdate = true;
        seaGeo.computeVertexNormals();
        for (let i = 0; i < sways.length; i++) {
          const s = sways[i];
          s.g.rotation.z = Math.sin(t * 0.8 + s.phase) * s.amp;
        }
        const bounce = Math.abs(Math.sin(t * 2.4)) * (0.22 + beatV * 0.45);
        ballG.position.y = -1.85 + bounce;
        ballG.rotation.z = Math.sin(t * 0.9) * 0.5;
      });
    },
  },
  space: {
    icon: '🌌',
    name: 'Deep Space',
    top: 0x0a0a2a,
    bot: 0x000004,
    fog: 0x02020a,
    floor: 0x39404f,
    fr: 0.45,
    fm: 0.85,
    revealAt: 30000,
    deck: { map: () => repeated(platesTex(1), 4, 4), bump: 0.3 }, // vernietetes Metall-Deck
    build(ctx) {
      const { propGroup, glowSprite, anims, hue } = ctx;
      // Star dome (Points — kept as-is).
      const n = 1600;
      const starPos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 28 + Math.random() * 30;
        const a = Math.random() * 7;
        const b = Math.acos(2 * Math.random() - 1);
        starPos[i * 3] = r * Math.sin(b) * Math.cos(a);
        starPos[i * 3 + 1] = Math.abs(r * Math.cos(b)) * 0.7 - 1;
        starPos[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const stars = new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, sizeAttenuation: true }),
      );
      propGroup.add(stars);
      // Hero cartoon planet on the visible horizon: cel sphere, chunky toon
      // ring (torus outlines cleanly, unlike a flat ring) and an orbiting moon.
      const planet = O(
        new THREE.Mesh(
          new THREE.SphereGeometry(2.6, 28, 20),
          toonMat({ color: hue(0x9d5cf6), emissive: hue(0x2a1060), emissiveIntensity: 0.35 }),
        ),
        0.06,
      );
      planet.position.set(12, 0.3, 24);
      propGroup.add(planet);
      const ring = O(
        new THREE.Mesh(
          new THREE.TorusGeometry(3.7, 0.17, 10, 40),
          toonMat({ color: hue(0xa8e831), emissive: hue(0xa8e831), emissiveIntensity: 0.25 }),
        ),
        0.04,
      );
      ring.position.copy(planet.position);
      ring.rotation.x = 1.25;
      ring.rotation.y = 0.3;
      propGroup.add(ring);
      propGroup.add(glowSprite(hue(0x8b5cf6), 10, 12, 0.3, 24));
      const moon = O(
        new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), toonMat({ color: 0xffe9c9 })),
        0.03,
      );
      propGroup.add(moon);
      // Far sibling planet for the orbiting camera (−z hemisphere).
      const far = O(
        new THREE.Mesh(
          new THREE.SphereGeometry(4, 28, 20),
          toonMat({ color: hue(0x3adfc0), emissive: hue(0x0a4038), emissiveIntensity: 0.3 }),
        ),
        0.08,
      );
      far.position.set(-12, 6, -28);
      propGroup.add(far);
      propGroup.add(glowSprite(hue(0x3adfc0), 12, -12, 6, -28));
      // Little UFOs, hover-bobbing with beat-pulsed rim lights.
      const hovers: { g: THREE.Group; y0: number; ph: number }[] = [];
      const lightMats: THREE.MeshToonMaterial[] = [];
      ufo(ctx, 14, 1.4, 20, 1, hovers, lightMats, true);
      ufo(ctx, 5.5, 2.1, 26, 0.8, hovers, lightMats);
      ufo(ctx, -8, 2, -18, 1.1, hovers, lightMats);
      // Slow asteroid belt drifting around the whole stage.
      const belt = new THREE.Group();
      const rockMat = toonMat({ color: hue(0x9184b0) });
      const rocks: { m: THREE.Mesh; sx: number; sy: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const geo = new THREE.SphereGeometry(1, 7, 5);
        geo.scale(0.35 + ((i * 1.7) % 0.5), 0.3 + ((i * 2.3) % 0.4), 0.35 + ((i * 1.1) % 0.45));
        const m = O(new THREE.Mesh(geo, rockMat), 0.03);
        const a = (i / 7) * Math.PI * 2;
        const r = 17 + ((i * 3.1) % 7);
        m.position.set(Math.cos(a) * r, -1.2 + ((i * 1.9) % 3.4), Math.sin(a) * r);
        belt.add(m);
        rocks.push({ m, sx: 0.004 + (i % 3) * 0.003, sy: 0.006 - (i % 2) * 0.003 });
      }
      propGroup.add(belt);
      // Coloured nebula glows (atmospheric — kept).
      const starCols = [0x8b5cf6, 0xa8e831, 0xff4d8d];
      for (let i = 0; i < 6; i++) {
        const s = glowSprite(
          hue(starCols[i % 3]),
          10 + Math.random() * 8,
          (Math.random() - 0.5) * 50,
          Math.random() * 14 - 2,
          -20 - Math.random() * 20,
        );
        s.material.opacity = 0.12;
        propGroup.add(s);
      }
      anims.push((t, beatV) => {
        stars.rotation.y = t * 0.008;
        planet.rotation.y = t * 0.05;
        far.rotation.y = t * 0.04;
        moon.position.set(
          12 + Math.cos(t * 0.35) * 4.6,
          0.3 + Math.sin(t * 0.7) * 0.5,
          24 + Math.sin(t * 0.35) * 4.6,
        );
        for (let i = 0; i < hovers.length; i++) {
          const h = hovers[i];
          h.g.position.y = h.y0 + Math.sin(t * 1.3 + h.ph) * 0.25;
          h.g.rotation.y = t * 0.7 + h.ph;
        }
        const glow = 0.55 + beatV * 0.7;
        for (let i = 0; i < lightMats.length; i++) lightMats[i].emissiveIntensity = glow;
        belt.rotation.y = t * 0.02;
        for (let i = 0; i < rocks.length; i++) {
          const r = rocks[i];
          r.m.rotation.x += r.sx;
          r.m.rotation.y += r.sy;
        }
      });
    },
  },
};

/**
 * Owns the swappable stage props and the sky/fog/floor tint. Replaces the
 * prototype's propGroup/anims globals + setBackground().
 */
export class World {
  private propGroup = new THREE.Group();
  private islandGroup = new THREE.Group();
  /** Per-frame animation callbacks for the active background. */
  readonly anims: WorldAnim[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly skyMat: THREE.ShaderMaterial,
    private readonly floorMat: THREE.MeshPhysicalMaterial,
    private readonly glowSprite: GlowSpriteFn,
  ) {
    this.scene.add(this.propGroup, this.islandGroup);
  }

  private disposeGroup(g: THREE.Group): void {
    this.scene.remove(g);
    g.traverse((o) => {
      const mesh = o as Partial<THREE.Mesh>;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  /**
   * Swap the stage. `variant` is the recolour lap (0 = original palette) —
   * deeper endless laps hue-shift the sky, fog, floor and prop palette so
   * lap 2+ of a tier reads visibly different (Wave-3 endless variety).
   * Seit dem Goal-Umbau wird auch die INSEL selbst pro Theme neu gebaut
   * (`world/island.ts`) und das Deck texturiert (`deck`-Config).
   */
  setBackground(key: BackgroundKey, variant = 0): void {
    this.disposeGroup(this.propGroup);
    this.disposeGroup(this.islandGroup);
    this.propGroup = new THREE.Group();
    this.islandGroup = new THREE.Group();
    // Benannt, damit der Modell-Exporter die Insel (Szenen-Fixture) von der
    // Prop-Szenerie unterscheiden kann.
    this.islandGroup.name = 'stage-island';
    this.scene.add(this.propGroup, this.islandGroup);
    this.anims.length = 0;

    const dh = (variant * LAP_HUE) % 1;
    const hue = (hex: number): THREE.Color => {
      const c = new THREE.Color(hex);
      if (dh !== 0) c.offsetHSL(dh, 0, 0);
      return c;
    };
    const b = BGS[key];
    // Goal „alle Bühnen heller": die Kulissen-Paletten werden beim Anwenden
    // Richtung Weiß geliftet (Sky am stärksten, Boden dezent) — die Stimmungen
    // bleiben unterscheidbar, aber nichts säuft mehr im Dunkel ab.
    const lift = (c: THREE.Color, f: number): THREE.Color => c.lerp(new THREE.Color(0xffffff), f);
    (this.skyMat.uniforms.top!.value as THREE.Color).copy(lift(hue(b.top), 0.22));
    (this.skyMat.uniforms.bot!.value as THREE.Color).copy(lift(hue(b.bot), 0.3));
    (this.scene.fog as THREE.FogExp2).color.copy(lift(hue(b.fog), 0.26));
    this.floorMat.color.copy(lift(hue(b.floor), 0.14));
    this.floorMat.roughness = b.fr;
    this.floorMat.metalness = b.fm;
    // Deck-Texturen (Goal „apply texture"): Map/Emissive-Map je Theme; ein
    // Map-Wechsel braucht einen Programm-Rebuild (needsUpdate).
    const d = b.deck ?? {};
    this.floorMat.map = d.map?.() ?? null;
    this.floorMat.emissiveMap = d.emissiveMap?.() ?? null;
    this.floorMat.emissive.copy(d.emissive !== undefined ? hue(d.emissive) : new THREE.Color(0));
    this.floorMat.emissiveIntensity = d.emissiveIntensity ?? 1;
    // T2-Relief: dieselbe Muster-Map trägt die Höhe (Fugen/Nieten/Grid-Grate).
    this.floorMat.bumpMap = d.bump ? (this.floorMat.map ?? this.floorMat.emissiveMap) : null;
    this.floorMat.bumpScale = d.bump ?? 1;
    this.floorMat.needsUpdate = true;
    if (d.scroll && this.floorMat.emissiveMap) {
      const tex = this.floorMat.emissiveMap;
      const speed = d.scroll;
      this.anims.push((t) => {
        tex.offset.y = (t * speed) % 1;
      });
    }
    buildIsland(this.islandGroup, key, hue, this.floorMat, this.anims);
    b.build({
      propGroup: this.propGroup,
      glowSprite: this.glowSprite,
      anims: this.anims,
      variant,
      hue,
    });
  }
}
