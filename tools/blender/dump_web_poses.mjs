#!/usr/bin/env node
/* Pose-Quelle für das Web-Asset (tools/blender/web_asset.py): samplet ZWEI
 * Actions aus den echten Choreo-Moves (apps/game/src/choreo/moves.ts) mit
 * EXAKT geschlossener Loop-Periode — die Frequenzen jedes Moves teilen einen
 * ganzzahligen Basis-GCD, also schließt der Loop nach P = 2π/f_base Phase.
 *
 *     node tools/blender/dump_web_poses.mjs <out.json>
 *
 * Actions: "Idle" = Hip Circles bei Energie 0.85 (das Idle-Level des Spiels),
 * "Twerk" = Twerk bei 1.15 (Klick-Show). 24 fps, letzter Frame == erster.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] ?? join(tmpdir(), 'web-poses.json');
const PHASE_RATE = 2.2; // click.ts PHASE_RATE_BASE
const FPS = 24;

const tmp = mkdtempSync(join(tmpdir(), 'webposes-'));
const bundle = join(tmp, 'moves.mjs');
await build({
  entryPoints: [join(ROOT, 'apps/game/src/choreo/moves.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
});
const { MOVES, POSE_KEYS } = await import(pathToFileURL(bundle).href);

/** [Action-Name, Move-Name, Energie, Basis-Frequenz des Moves] */
const ACTIONS = [
  ['Idle', 'Hip Circles', 0.85, 1.4],
  ['Twerk', 'Twerk', 1.15, 1.2],
];

const actions = {};
for (const [action, moveName, energy, fBase] of ACTIONS) {
  const move = MOVES.find((m) => m.name === moveName);
  if (!move) throw new Error(`Move ${moveName} nicht gefunden`);
  const period = (Math.PI * 2) / fBase; // Phase bis zum Loop-Schluss
  const n = Math.round((period / PHASE_RATE) * FPS); // Keys ohne den Schluss-Frame
  const rows = [];
  for (let i = 0; i < n; i++) {
    const p = move.fn((i / n) * period, energy);
    rows.push(Object.fromEntries(POSE_KEYS.map((k) => [k, p[k]])));
  }
  rows.push({ ...rows[0] }); // Loop hart schließen: letzter Key == erster
  actions[action] = rows;
}
writeFileSync(out, JSON.stringify({ fps: FPS, poseKeys: POSE_KEYS, actions }));
console.log(
  Object.entries(actions)
    .map(([k, v]) => `${k}: ${v.length} Keys`)
    .join(' · ') + ` → ${out}`,
);
