import * as THREE from 'three';

import { mk } from '../engine/materials';
import type { GlowSpriteFn } from '../engine/scene';
import type { BackgroundKey, WorldAnim } from '../types';

interface BuildCtx {
  propGroup: THREE.Group;
  glowSprite: GlowSpriteFn;
  anims: WorldAnim[];
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
  build: (ctx: BuildCtx) => void;
}

/** The four stages, ported verbatim from the prototype's BACKGROUNDS section. */
export const BGS: Record<BackgroundKey, BgConfig> = {
  club: {
    icon: '🪩',
    name: 'Neon-Club',
    top: 0x241830,
    bot: 0x050507,
    fog: 0x0a0a10,
    floor: 0x0c0c12,
    fr: 0.2,
    fm: 0.65,
    build({ propGroup, glowSprite, anims }) {
      const ball = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.65, 2),
        mk({
          color: 0xffffff,
          roughness: 0.06,
          metalness: 1,
          envMapIntensity: 2,
          flatShading: true,
        }),
      );
      ball.position.set(0, 6.2, 0);
      propGroup.add(ball);
      propGroup.add(glowSprite(0xffffff, 3, 0, 6.2, 0));
      const cols = [0xff3366, 0x33ff88, 0x3388ff, 0xffdd33];
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
      const tiles: THREE.Mesh[] = [];
      for (let ix = -4; ix < 4; ix++)
        for (let iz = -4; iz < 4; iz++) {
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
          t.position.set(ix * 2 + 1, -2.39, iz * 2 + 1);
          propGroup.add(t);
          tiles.push(t);
        }
      anims.push((t, beatV) => {
        ball.rotation.y += 0.01;
        beams.forEach((b) => {
          b.ph += 0.008;
          const x = Math.cos(b.ph) * 8;
          const z = Math.sin(b.ph) * 8;
          b.l.position.set(x, 8.5, z);
          b.beam.position.set(x * 0.6, 3.2, z * 0.6);
          b.beam.lookAt(0, -2.4, 0);
          b.beam.rotateX(-Math.PI / 2);
        });
        tiles.forEach((tl, i) => {
          const mat = tl.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = Math.max(0, Math.sin(t * 3 + i * 0.7)) * 0.8 * (0.4 + beatV);
          mat.emissive.setHSL((t * 0.05 + i * 0.03) % 1, 0.8, 0.5);
        });
      });
    },
  },
  synth: {
    icon: '🌆',
    name: 'Synthwave',
    top: 0x3a1060,
    bot: 0x0a0518,
    fog: 0x140628,
    floor: 0x160a26,
    fr: 0.15,
    fm: 0.7,
    build({ propGroup, glowSprite, anims }) {
      const grid = new THREE.GridHelper(80, 80, 0xff3fb0, 0x8b5cf6);
      grid.position.y = -2.39;
      const gm = grid.material as THREE.LineBasicMaterial;
      gm.transparent = true;
      gm.opacity = 0.5;
      propGroup.add(grid);
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
      sun.position.set(0, 4.5, -28);
      propGroup.add(sun);
      propGroup.add(glowSprite(0xff4f90, 16, 0, 4.5, -28));
      for (let i = 0; i < 9; i++) {
        const m = new THREE.Mesh(
          new THREE.ConeGeometry(3 + Math.random() * 3, 4 + Math.random() * 4, 4),
          mk({ color: 0x140a24, roughness: 1, flatShading: true }),
        );
        m.position.set((i - 4) * 7 + (Math.random() * 3 - 1.5), -1.5, -26 + Math.random() * 4);
        propGroup.add(m);
      }
      anims.push((t) => {
        grid.position.z = (t * 3) % 2;
        sunMat.uniforms.t!.value = t;
      });
    },
  },
  beach: {
    icon: '🏖️',
    name: 'Sunset Beach',
    top: 0xff8a4d,
    bot: 0x2a1533,
    fog: 0x3a1a30,
    floor: 0x33241a,
    fr: 0.55,
    fm: 0.15,
    build({ propGroup, glowSprite, anims }) {
      const sun = new THREE.Mesh(
        new THREE.CircleGeometry(4.5, 48),
        mk({ color: 0xffe08a, emissive: 0xffb84d, emissiveIntensity: 1.8, roughness: 1 }),
      );
      sun.position.set(-4, 2.5, -26);
      propGroup.add(sun);
      propGroup.add(glowSprite(0xffa54d, 14, -4, 2.5, -26));
      const seaGeo = new THREE.PlaneGeometry(90, 45, 48, 24);
      const sea = new THREE.Mesh(
        seaGeo,
        mk({ color: 0x1a4a6a, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.1 }),
      );
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, -2.38, -25);
      propGroup.add(sea);
      function palm(x: number, z: number, s: number): THREE.Group {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 3.4 * s, 10),
          mk({ color: 0x5a3a20, roughness: 0.95 }),
        );
        trunk.position.y = 1.7 * s;
        trunk.rotation.z = 0.12;
        g.add(trunk);
        for (let i = 0; i < 6; i++) {
          const leaf = new THREE.Mesh(
            new THREE.ConeGeometry(0.16 * s, 2.2 * s, 6),
            mk({ color: 0x1e6b2e, roughness: 0.9 }),
          );
          const a = (i / 6) * Math.PI * 2;
          leaf.position.set(0.4 * s + Math.cos(a) * 0.5 * s, 3.4 * s, Math.sin(a) * 0.5 * s);
          leaf.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25 - 0.2);
          g.add(leaf);
        }
        g.position.set(x, -2.4, z);
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        propGroup.add(g);
        return g;
      }
      const p1 = palm(-7, -6, 1.2);
      const p2 = palm(7.5, -8, 1.0);
      const p3 = palm(-10, -12, 1.4);
      const pos = seaGeo.attributes.position!;
      anims.push((t) => {
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          pos.setZ(i, Math.sin(x * 0.35 + t * 1.4) * 0.18 + Math.cos(y * 0.3 + t * 1.1) * 0.14);
        }
        pos.needsUpdate = true;
        seaGeo.computeVertexNormals();
        [p1, p2, p3].forEach((p, i) => (p.rotation.z = Math.sin(t * 0.8 + i) * 0.03));
      });
    },
  },
  space: {
    icon: '🌌',
    name: 'Deep Space',
    top: 0x0a0a2a,
    bot: 0x000004,
    fog: 0x02020a,
    floor: 0x08080f,
    fr: 0.12,
    fm: 0.8,
    build({ propGroup, glowSprite, anims }) {
      const n = 1600;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 28 + Math.random() * 30;
        const a = Math.random() * 7;
        const b = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(b) * Math.cos(a);
        pos[i * 3 + 1] = Math.abs(r * Math.cos(b)) * 0.7 - 1;
        pos[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, sizeAttenuation: true }),
      );
      propGroup.add(stars);
      const planet = new THREE.Mesh(
        new THREE.SphereGeometry(4, 40, 40),
        mk({ color: 0x8b5cf6, roughness: 0.7, emissive: 0x2a1060, emissiveIntensity: 0.4 }),
      );
      planet.position.set(-12, 6, -28);
      propGroup.add(planet);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(5, 7.5, 64),
        new THREE.MeshBasicMaterial({
          color: 0xa8e831,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.copy(planet.position);
      ring.rotation.x = 1.2;
      ring.rotation.y = 0.3;
      propGroup.add(ring);
      propGroup.add(glowSprite(0x8b5cf6, 12, -12, 6, -28));
      const starCols = [0x8b5cf6, 0xa8e831, 0xff4d8d];
      for (let i = 0; i < 6; i++) {
        const s = glowSprite(
          starCols[i % 3],
          10 + Math.random() * 8,
          (Math.random() - 0.5) * 50,
          Math.random() * 14 - 2,
          -20 - Math.random() * 20,
        );
        s.material.opacity = 0.12;
        propGroup.add(s);
      }
      anims.push((t) => {
        stars.rotation.y = t * 0.008;
        planet.rotation.y = t * 0.05;
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
  /** Per-frame animation callbacks for the active background. */
  readonly anims: WorldAnim[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly skyMat: THREE.ShaderMaterial,
    private readonly floorMat: THREE.MeshPhysicalMaterial,
    private readonly glowSprite: GlowSpriteFn,
  ) {
    this.scene.add(this.propGroup);
  }

  setBackground(key: BackgroundKey): void {
    this.scene.remove(this.propGroup);
    this.propGroup.traverse((o) => {
      const mesh = o as Partial<THREE.Mesh>;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.propGroup = new THREE.Group();
    this.scene.add(this.propGroup);
    this.anims.length = 0;

    const b = BGS[key];
    (this.skyMat.uniforms.top!.value as THREE.Color).setHex(b.top);
    (this.skyMat.uniforms.bot!.value as THREE.Color).setHex(b.bot);
    (this.scene.fog as THREE.FogExp2).color.setHex(b.fog);
    this.floorMat.color.setHex(b.floor);
    this.floorMat.roughness = b.fr;
    this.floorMat.metalness = b.fm;
    b.build({ propGroup: this.propGroup, glowSprite: this.glowSprite, anims: this.anims });
  }
}
