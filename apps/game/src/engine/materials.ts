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
}

/** Cel-shaded material factory — the cartoon counterpart of `mk()`. */
export function toonMat(p: ToonMatParams): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: p.color,
    gradientMap: toonRamp(p.bands ?? TOON_BANDS),
    emissive: p.emissive ?? 0x000000,
    emissiveIntensity: p.emissiveIntensity ?? 1,
    transparent: p.transparent ?? false,
    opacity: p.opacity ?? 1,
    side: p.side ?? THREE.FrontSide,
    map: p.map ?? null,
  });
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
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n\ttransformed += normalize(normal) * ${thickness.toFixed(5)};`,
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
