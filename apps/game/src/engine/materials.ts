import * as THREE from 'three';

/** Shorthand for the physical material used throughout the rig and props. */
export const mk = (o: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial(o);

/** Flag an object as a shadow caster and return it (chainable, like the prototype's `sh`). */
export function sh<T extends THREE.Object3D>(m: T): T {
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Cartoon material system (Wave 1 art direction) — cel-banded toon materials
// plus an inverted-hull ink-outline helper. Waves 2–3 (entity opponent, stage
// scenery) reuse `toonMat` / `withOutline` so the whole game shares one look.
// Everything is procedural (canvas ramps, no external assets) and lazy, so
// importing this module in node tests never touches the DOM.
// ---------------------------------------------------------------------------

/** Default number of cel bands for toon shading. */
export const TOON_BANDS = 4;
/** Default ink-line colour (soft warm near-black, not pure black). */
export const INK = 0x14101c;
/** Default outline thickness in object units (constant along normals). */
export const OUTLINE_W = 0.02;

const rampCache = new Map<number, THREE.CanvasTexture>();

/**
 * Procedural grayscale gradient map for `MeshToonMaterial` — an n-band step
 * ramp on a tiny canvas (same spirit as scene.ts's procedural env map).
 * NearestFilter keeps the bands crisp. Cached per band count.
 */
export function toonRamp(bands: number = TOON_BANDS): THREE.CanvasTexture {
  const n = Math.max(2, Math.min(8, Math.round(bands)));
  const hit = rampCache.get(n);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = 1;
  const x = c.getContext('2d')!;
  for (let i = 0; i < n; i++) {
    // Shadow band stays readable (never crushed to black); the top band is
    // capped below 1 so stage lighting can't blow cel colours out to pastel.
    const v = Math.round(255 * (0.3 + 0.55 * Math.pow(i / (n - 1), 0.9)));
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(i, 0, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  rampCache.set(n, t);
  return t;
}

// ---------------------------------------------------------------------------
// AAA-Toon-Pass (Goal „Grafik nach AAA-Standard"): Rim-Licht + Spekular-Glint
// als Shader-Injektion in JEDES `toonMat` — eine Fabrik, ein Look, ein
// Shader-Programm. Beides ist reine Per-Pixel-ALU (keine Texturen, keine
// zusätzlichen Passes) und hängt an EINEM globalen Uniform, das das Preset
// schaltet (low ⇒ 0, kein Recompile beim Wechsel).
// ---------------------------------------------------------------------------

/**
 * Globaler Preset-Schalter des Toon-FX-Passes (0 = aus, 1 = an). Als GETEILTES
 * Uniform-Objekt exportiert: `applyQuality` schreibt EINEN Wert, alle
 * Materialien sehen ihn im selben Frame — kein Traversieren, kein Recompile.
 */
export const TOON_FX = { value: 1 };

/**
 * Welt-Richtung ZUM Key-Licht (scene.ts: Position (4.5, 8.5, 7) → Ziel
 * (1.4, −2.4, 1.7)) — der Glint ist ein KUNSTLICHT-Vektor wie in jedem
 * stilisierten AAA-Titel: er folgt der Bühnenbeleuchtung, nicht der Physik,
 * damit die Lichtkante immer da sitzt, wo die Kamera sie sehen kann.
 */
const KEY_LIGHT_DIR = new THREE.Vector3(3.1, 10.9, 5.3).normalize();

/** Kühles Mondlicht-Weiß — die klassische Rim-Farbe des Cartoon-Kinos. */
const RIM_COLOR = new THREE.Color(0xbcd2ff);
const GLINT_COLOR = new THREE.Color(0xfff6e2);

export interface ToonMatParams {
  color: THREE.ColorRepresentation;
  /** Cel band count (2 = graphic poster look, 4 = default rounded cel). */
  bands?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** Optional near-white detail texture (engine/textures.ts) — multiplies `color`. */
  map?: THREE.Texture;
  /**
   * Optional Relief-Map (Roadmap T2): dunkle Muster-Linien lesen als Rillen.
   * Meist dieselbe Textur wie `map` — die Luminanz trägt die Höhe.
   */
  bumpMap?: THREE.Texture;
  /** Relief-Stärke (dezent halten — das Cel-Banding bleibt dominant). */
  bumpScale?: number;
  /** Optional glow pattern (sequins, scanner spots) — multiplies `emissive`. */
  emissiveMap?: THREE.Texture;
  /** Rim-Licht-Stärke (0 = aus; Default dezent — Krümmung macht den Rest). */
  rim?: number;
  /** Spekular-Glint-Stärke (0 = aus). */
  glint?: number;
}

/**
 * Cel-shaded material factory — the cartoon counterpart of `mk()`.
 *
 * Der AAA-Pass injiziert zwei gestufte Terme vor `opaque_fragment`:
 *  · **Rim**: View-Space-Fresnel, hart per `smoothstep` gestuft — die
 *    Silhouetten-Lichtkante, die runde Formen vom Hintergrund löst. Kühl
 *    getönt (Gegenfarbe zum warmen Key), Stärke pro Material dosierbar.
 *  · **Glint**: Blinn-Halbvektor gegen den festen Bühnen-Key, hoch potenziert
 *    und gestuft — der kleine Lack-Tupfer auf Schultern/Wangen/Booty.
 * Beide multiplizieren mit dem globalen {@link TOON_FX}-Uniform (Preset) und
 * teilen sich EIN Shader-Programm über alle Materialien (uniform-getrieben,
 * `customProgramCacheKey` konstant).
 */
export function toonMat(p: ToonMatParams): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color: p.color,
    gradientMap: toonRamp(p.bands ?? TOON_BANDS),
    emissive: p.emissive ?? 0x000000,
    emissiveIntensity: p.emissiveIntensity ?? 1,
    transparent: p.transparent ?? false,
    opacity: p.opacity ?? 1,
    side: p.side ?? THREE.FrontSide,
    map: p.map ?? null,
    bumpMap: p.bumpMap ?? null,
    bumpScale: p.bumpScale ?? 1,
    emissiveMap: p.emissiveMap ?? null,
  });
  const rim = p.rim ?? 0.34;
  const glint = p.glint ?? 0.2;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uToonFx = TOON_FX; // geteiltes Objekt — Preset schreibt live
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uGlint = { value: glint };
    shader.uniforms.uRimColor = { value: RIM_COLOR };
    shader.uniforms.uGlintColor = { value: GLINT_COLOR };
    shader.uniforms.uKeyDir = { value: KEY_LIGHT_DIR };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        [
          'uniform float uToonFx;',
          'uniform float uRim;',
          'uniform float uGlint;',
          'uniform vec3 uRimColor;',
          'uniform vec3 uGlintColor;',
          'uniform vec3 uKeyDir;',
          'void main() {',
        ].join('\n'),
      )
      .replace(
        '#include <opaque_fragment>',
        [
          '\t// AAA-Toon-Pass: Rim (View-Fresnel, gestuft) + Glint (Blinn gegen den Bühnen-Key).',
          '\tvec3 fxN = normalize( normal );',
          '\tvec3 fxV = normalize( vViewPosition );',
          '\tfloat fxFres = 1.0 - saturate( dot( fxN, fxV ) );',
          '\tfloat fxRim = smoothstep( 0.62, 0.8, fxFres );',
          '\tvec3 fxL = normalize( ( viewMatrix * vec4( uKeyDir, 0.0 ) ).xyz );',
          '\tfloat fxSpec = pow( saturate( dot( fxN, normalize( fxL + fxV ) ) ), 42.0 );',
          '\tfloat fxGlint = smoothstep( 0.42, 0.58, fxSpec );',
          '\toutgoingLight += uToonFx * ( uRimColor * ( fxRim * uRim ) + uGlintColor * ( fxGlint * uGlint ) );',
          '\t#include <opaque_fragment>',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'toon-aaa-fx';
  return m;
}

const outlineCache = new Map<string, THREE.MeshBasicMaterial>();

/**
 * Ink-line material for inverted-hull outlines: back-face, unlit, with the
 * vertices pushed a constant distance along their normals in the vertex stage
 * (so thin limbs get the same line weight as the torso). Cached per
 * colour+thickness so the whole cast shares a handful of shader programs.
 */
export function outlineMaterial(
  color: THREE.ColorRepresentation = INK,
  thickness: number = OUTLINE_W,
): THREE.MeshBasicMaterial {
  const key = `${new THREE.Color(color).getHex()}|${thickness}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, toneMapped: false });
  // Politur-Paket: Der Hull wird im VIEW space entlang der Normalen gedrückt und
  // mit der Tiefe skaliert (−mv.z / 45 ≈ die feste Bühnen-Distanz der Kamera,
  // geklemmt) — die Linienbreite ist damit in PIXELN konstant: ein ×1.42-Boss
  // trägt dieselbe Ink-Linie wie ein dünner Arm, statt eine ×1.42-fette. Der
  // Objekt-Space-Push davor multiplizierte mit jeder Parent-Skalierung.
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      [
        'vec4 inkMv = modelViewMatrix * vec4( transformed, 1.0 );',
        'vec3 inkN = normalize( normalMatrix * normal );',
        `inkMv.xyz += inkN * ${thickness.toFixed(5)} * clamp( -inkMv.z / 45.0, 0.6, 1.6 );`,
        'gl_Position = projectionMatrix * inkMv;',
      ].join('\n\t'),
    );
  };
  m.customProgramCacheKey = () => `ink-hull-${thickness.toFixed(5)}`;
  outlineCache.set(key, m);
  return m;
}

export interface OutlineOpts {
  /** Line weight in object units (before parent scale). */
  thickness?: number;
  color?: THREE.ColorRepresentation;
}

/**
 * Wrap a mesh in a cartoon ink outline (inverted hull sharing the same
 * geometry, added as a child so it follows every bone write and squash the
 * physics applies). Returns the mesh for chaining: `withOutline(sh(mesh))`.
 */
export function withOutline<T extends THREE.Mesh>(mesh: T, opts: OutlineOpts = {}): T {
  const hull = new THREE.Mesh(mesh.geometry, outlineMaterial(opts.color ?? INK, opts.thickness));
  hull.name = 'ink-outline';
  mesh.add(hull);
  return mesh;
}
