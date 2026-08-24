import * as THREE from 'three';

/** Max live click particles (spec §5 M4: pool, ≤ 200, < 1 ms/frame). */
const MAX = 200;
/** Der klassische Gold-Funke — Farbe aller Aufrufe OHNE eigene Farbe. */
const SPARK_GOLD = 0xffc24d;

/**
 * GPU-drawn click-particle pool. A single THREE.Points with a fade shader;
 * integration is a flat CPU loop over 200 slots (round-robin reuse), so it costs
 * well under 1 ms/frame. Dead slots have life 0 and are discarded in the shader.
 */
export class ParticleSystem {
  private readonly positions = new Float32Array(MAX * 3);
  private readonly velocities = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  /**
   * D-02: Farbe PRO Splitter statt EINEM `uColor` — nur so können die
   * Klick-Splitter die Akzentfarbe der Bühne tragen (K-1), während das
   * Boss-Konfetti im selben Pool seine eigene Farbe behält. Ein
   * Instanz-Attribut, kein zweites Material: der Pool bleibt EIN Programm (K-7).
   */
  private readonly colors = new Float32Array(MAX * 3);
  private readonly posAttr: THREE.BufferAttribute;
  private readonly lifeAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly tmpColor = new THREE.Color();
  /** Farbe der Bestandsaufrufe ohne `color` (Konfetti) — der bisherige Funke. */
  private readonly defaultColor = new THREE.Color(SPARK_GOLD);
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.lifeAttr = new THREE.BufferAttribute(this.life, 1);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    // Der Gold-Ton steht im ATTRIBUT (nicht im Uniform): so trägt ein Splitter
    // mit eigener Farbe exakt DIESE Farbe — ein Gold-Multiplikator im Shader
    // hätte jeden Akzent gedreht (Türkis × Gold = Grün, in der Abnahme im Bild
    // nachgewiesen). Bestandsaufrufe ohne Farbe sehen unverändert aus.
    for (let i = 0; i < MAX; i++) {
      this.colors[i * 3] = this.defaultColor.r;
      this.colors[i * 3 + 1] = this.defaultColor.g;
      this.colors[i * 3 + 2] = this.defaultColor.b;
    }
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aLife', this.lifeAttr);
    geo.setAttribute('aColor', this.colorAttr);
    const mat = new THREE.ShaderMaterial({
      // `uColor` bleibt als globaler Helligkeits-/Tönungs-Regler — NEUTRAL, die
      // Farbe kommt jetzt vollständig aus dem Instanz-Attribut (K-1).
      uniforms: { uColor: { value: new THREE.Color(0xffffff) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      // D-02: Die Punktgröße schrumpft strukturell (3+22·life ⇒ 2+8·life). Der
      // alte Wert blies jeden frischen Splitter auf 25 px auf — additiv
      // übereinander ergab das den gelb-weißen Ball, der die Spielfigur
      // verschluckte (shots/SHEET-twerk.png). Kleiner + gerichtet = Splitter.
      vertexShader: `attribute float aLife; attribute vec3 aColor;
        varying float vLife; varying vec3 vColor;
        void main(){ vLife = aLife; vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.2 + 4.0 * aLife) * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vLife; varying vec3 vColor; uniform vec3 uColor;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
          if (r > 0.5 || vLife <= 0.0) discard;
          gl_FragColor = vec4(uColor * vColor, vLife * (1.0 - r * 2.0)); }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
  }

  /**
   * Spawn a burst of `count` particles at a world position. `power` skaliert die
   * Anfangsgeschwindigkeit (ROADMAP-V2 G2): 1 = der bisherige Klick-Funke,
   * > 1 = der weit auffächernde Konfetti-Wurf über der Bühne.
   *
   * D-02: `color` färbt den Schwarm (Default = der bisherige Gold-Funke),
   * `dir` gibt ihm eine RICHTUNG — 70 % Vorzugsrichtung, 30 % Streuung. Der
   * Klick schickt seine Splitter damit nach hinten-oben, weg von der Kamera und
   * weg von der Silhouette (K-3), statt symmetrisch um die Hüfte zu platzen.
   * Bestandsaufrufe ohne die neuen Argumente verhalten sich exakt wie vorher.
   */
  burst(
    x: number,
    y: number,
    z: number,
    count = 12,
    power = 1,
    color?: number,
    dir?: readonly [number, number, number],
  ): void {
    const c = color === undefined ? this.defaultColor : this.tmpColor.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      let vx = Math.cos(a) * sp * 0.6 * power;
      let vy = (2 + Math.random() * 3) * power;
      let vz = Math.sin(a) * sp * 0.6 * power;
      if (dir) {
        const m = 3 * power;
        vx = 0.3 * vx + 0.7 * dir[0] * m;
        vy = 0.3 * vy + 0.7 * dir[1] * m;
        vz = 0.3 * vz + 0.7 * dir[2] * m;
      }
      this.velocities[i * 3] = vx;
      this.velocities[i * 3 + 1] = vy;
      this.velocities[i * 3 + 2] = vz;
      this.colors[i * 3] = c.r;
      this.colors[i * 3 + 1] = c.g;
      this.colors[i * 3 + 2] = c.b;
      this.life[i] = 1;
    }
    this.colorAttr.needsUpdate = true;
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
