/**
 * Dev-only model exporter (`/export-models.html`, nur vite dev — nicht im
 * Build). Baut jedes Modell des Spiels mit den ECHTEN Buildern (Charakter-Rig
 * pro Skin, Rivalen pro Bühnen-Theme × normal/boss, Bühnen-Szenerie) und
 * exportiert es als glTF-2.0-Binary (.glb) — die Quelle des `models/`-Ordners
 * im Repo-Root (siehe models/README.md; Runner: tools/blender/export_all.cjs).
 *
 * Zwei Export-Anpassungen, damit die Dateien in Blender/DCC sauber sind:
 *  · Ink-Outline-Shells (BackSide-Hüllen, ein Laufzeit-Shadertrick) werden
 *    entfernt — glTF kennt kein onBeforeCompile; als Geometrie wären sie nur
 *    schwarze Duplikat-Hüllen über jedem Mesh.
 *  · Sprites (Glow-Billboards) fliegen raus — GLTFExporter exportiert sie nicht.
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { buildCharacter } from '../character/rig';
import { buildEntity } from '../character/entity';
import { DT, renderCheeks, stepPhysics } from '../character/physics';
import { Choreographer } from '../choreo/moves';
import { SKINS } from '../character/skins';
import { World } from '../world/backgrounds';
import type { BackgroundKey, SkinKey } from '../types';

const BG_KEYS: readonly BackgroundKey[] = ['club', 'synth', 'beach', 'space'];

declare global {
  interface Window {
    __models?: Record<string, string>;
    __done?: boolean;
    __errors?: string[];
    __dropped?: string[];
  }
}

/** Beim Export entfernte Laufzeit-Knoten (Diagnose, kein Fehler). */
const droppedLog: string[] = [];

function strip(root: THREE.Object3D, model: string): void {
  for (const d of stripRuntimeOnly(root)) droppedLog.push(`${model}: ${d}`);
}

/**
 * Laufzeit-Only-Objekte (Outline-Hüllen, Glow-Sprites) vor dem Export entfernen.
 * Knoten ohne Material (Laufzeit-Platzhalter) fliegen ebenfalls raus — mit
 * Namensnennung im Rückgabewert, damit nichts stillschweigend verschwindet.
 */
function stripRuntimeOnly(root: THREE.Object3D): string[] {
  const doomed: THREE.Object3D[] = [];
  const dropped: string[] = [];
  root.traverse((o) => {
    if ((o as THREE.Sprite).isSprite) {
      doomed.push(o);
      return;
    }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) {
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!mat) {
        doomed.push(o);
        dropped.push(`${o.type}:${o.name || '(unbenannt)'}@${o.parent?.name || '?'}`);
      } else if (mat.side === THREE.BackSide) {
        doomed.push(o);
      }
    }
  });
  for (const o of doomed) o.parent?.remove(o);
  return dropped;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function exportGlb(root: THREE.Object3D): Promise<string> {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      root,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(toBase64(result));
        else reject(new Error('expected binary glb'));
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true },
    );
  });
}

/** Charakter eines Skins: Rig bauen, Physik ~1 s einschwingen, Cheeks platzieren. */
function buildCharacterGroup(skinId: SkinKey): THREE.Object3D {
  const scene = new THREE.Scene();
  const char = buildCharacter(scene, SKINS[skinId]);
  const choreo = new Choreographer();
  choreo.setMove(0);
  let drive = 0;
  for (let i = 0; i < 120; i++) drive = stepPhysics(DT, char.rig, char.cheeks, choreo, drive);
  scene.updateMatrixWorld(true);
  renderCheeks(char.rig, char.cheeks);
  const group = new THREE.Group();
  group.name = `character-${skinId}`;
  group.add(char.rig.root);
  for (const c of char.cheeks) group.add(c.g);
  strip(group, group.name);
  return group;
}

function buildRivalGroup(theme: BackgroundKey, boss: boolean): THREE.Object3D {
  const scene = new THREE.Scene();
  const inst = buildEntity(scene, theme, { boss, variant: 0 });
  inst.update(0.5, 0, 0); // eine Pose stellen (idle groove, t=0.5)
  scene.updateMatrixWorld(true);
  inst.root.name = `rival-${theme}${boss ? '-boss' : ''}`;
  strip(inst.root, inst.root.name);
  return inst.root;
}

/** Bühnen-Szenerie: World mit Stub-Sky/-Floor — exportiert wird nur die Prop-Gruppe. */
function buildStageGroup(key: BackgroundKey): THREE.Object3D {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.02); // setBackground recolort scene.fog
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
  });
  const floorMat = new THREE.MeshPhysicalMaterial();
  const world = new World(scene, skyMat, floorMat, () => new THREE.Sprite());
  world.setBackground(key, 0);
  scene.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = `stage-${key}`;
  // Die Themen-Insel (`stage-island`) ist ein Szenen-Fixture des Spiels — die
  // Stage-Modelle bleiben die Prop-Kits, denen der Blender-Refine sein eigenes
  // Diorama-Fundament baut (add_stage_floor).
  for (const child of [...scene.children]) if (child.name !== 'stage-island') group.add(child);
  strip(group, group.name);
  return group;
}

async function main(): Promise<void> {
  const models: Record<string, string> = {};
  const errors: string[] = [];

  const jobs: Array<[string, () => THREE.Object3D]> = [];
  for (const skinId of Object.keys(SKINS) as SkinKey[]) {
    jobs.push([`characters/character-${skinId}`, () => buildCharacterGroup(skinId)]);
  }
  for (const theme of BG_KEYS) {
    jobs.push([`rivals/rival-${theme}`, () => buildRivalGroup(theme, false)]);
    jobs.push([`rivals/rival-${theme}-boss`, () => buildRivalGroup(theme, true)]);
  }
  for (const key of BG_KEYS) {
    jobs.push([`stages/stage-${key}`, () => buildStageGroup(key)]);
  }

  for (const [name, build] of jobs) {
    try {
      models[name] = await exportGlb(build());
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  window.__models = models;
  window.__errors = errors;
  window.__dropped = droppedLog;
  window.__done = true;
}

void main();
