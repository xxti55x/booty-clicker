import * as THREE from 'three';

/** Max live click particles (spec §5 M4: pool, ≤ 200, < 1 ms/frame). */
const MAX = 200;

/**
 * GPU-drawn click-particle pool. A single THREE.Points with a fade shader;
 * integration is a flat CPU loop over 200 slots (round-robin reuse), so it costs
 * well under 1 ms/frame. Dead slots have life 0 and are discarded in the shader.
 */
export class ParticleSystem {
  private readonly positions = new Float32Array(MAX * 3);
  private readonly velocities = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly posAttr: THREE.BufferAttribute;
  private readonly lifeAttr: THREE.BufferAttribute;
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.lifeAttr = new THREE.BufferAttribute(this.life, 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aLife', this.lifeAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffc24d) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aLife; varying float vLife;
        void main(){ vLife = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (3.0 + 22.0 * aLife) * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vLife; uniform vec3 uColor;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
          if (r > 0.5 || vLife <= 0.0) discard;
          gl_FragColor = vec4(uColor, vLife * (1.0 - r * 2.0)); }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
  }

  /** Spawn a burst of `count` particles at a world position. */
  burst(x: number, y: number, z: number, count = 12): void {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      this.velocities[i * 3] = Math.cos(a) * sp * 0.6;
      this.velocities[i * 3 + 1] = 2 + Math.random() * 3;
      this.velocities[i * 3 + 2] = Math.sin(a) * sp * 0.6;
      this.life[i] = 1;
    }
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.velocities[i * 3 + 1] -= 5 * dt; // gravity
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      this.life[i] -= dt * 1.5;
      if (this.life[i] < 0) this.life[i] = 0;
    }
    if (any) {
      this.posAttr.needsUpdate = true;
      this.lifeAttr.needsUpdate = true;
    }
  }
}
