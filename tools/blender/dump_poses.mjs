#!/usr/bin/env node
/* Samplet die ECHTEN Choreo-Moves (apps/game/src/choreo/moves.ts — die einzige
 * Quelle der Tanz-Mathematik) zu einer Pose-Frame-Tabelle für den Blender-
 * Animations-Renderer (render_anim.py). Kein Python-Nachbau der Moves: esbuild
 * bündelt das TS-Modul, hier wird nur abgetastet.
 *
 *     node tools/blender/dump_poses.mjs <out.json> [fps=12] [seconds=4]
 *
 * Abtastung im Steady-State des Physik-Kontrakts: Phase läuft mit der
 * PHASE_RATE_BASE des Spiels (2.2 Einheiten/s, siehe game/click.ts), Energie
 * 1.0 (Show-Level zwischen Idle 0.85 und Klick-Maximum).
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] ?? join(tmpdir(), 'poses.json');
const FPS = Number(process.argv[3] ?? 12);
const SECONDS = Number(process.argv[4] ?? 4);
const PHASE_RATE = 2.2; // = click.PHASE_RATE_BASE (physics tempo at drive 0)
const ENERGY = 1.0;

const tmp = mkdtempSync(join(tmpdir(), 'poses-'));
const bundle = join(tmp, 'moves.mjs');
await build({
  entryPoints: [join(ROOT, 'apps/game/src/choreo/moves.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
});
const { MOVES, POSE_KEYS } = await import(pathToFileURL(bundle).href);

const frames = {};
const n = Math.round(FPS * SECONDS);
for (const m of MOVES) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const ph = (i / FPS) * PHASE_RATE;
    const p = m.fn(ph, ENERGY);
    rows.push(Object.fromEntries(POSE_KEYS.map((k) => [k, p[k]])));
  }
  frames[m.name] = rows;
}
writeFileSync(out, JSON.stringify({ fps: FPS, seconds: SECONDS, poseKeys: POSE_KEYS, frames }));
console.log(`${Object.keys(frames).length} moves × ${n} frames → ${out}`);
