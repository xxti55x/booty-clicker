/**
 * Der Simulations-Lauf: jede Sim-Datei in ihrem EIGENEN Vitest-Prozess.
 *
 * **Warum getrennte Prozesse und nicht ein Lauf mit vier Dateien.** Der
 * Worker-RPC von Vitest gibt dem Hauptprozess 60 Sekunden, um eine Antwort auf
 * `onTaskUpdate` zu schicken. Rechnen mehrere Sim-Dateien gleichzeitig, ist
 * jeder Kern belegt, der Hauptprozess verhungert, die Frist reißt — und der
 * Lauf bricht mit „[vitest-worker]: Timeout calling \"onTaskUpdate\"" ab,
 * obwohl JEDER Test grün ist. Genau so ist die Pipeline gefallen.
 *
 * Gemessen wurde auch, was NICHT reicht: zwei Worker statt vier. Unter Last
 * riss die Frist weiterhin (106 Tests grün, Lauf trotzdem rot).
 *
 * Eine Datei je Prozess nimmt dem Fehler die Grundlage, statt auf Zeitverhalten
 * zu wetten: Der ganze Prozess ist kürzer als die Frist, die er reißen könnte,
 * und der Hauptprozess teilt sich die Maschine mit genau einem Worker. Die
 * Wanduhr ist dafür die Summe statt des Maximums — der Preis für einen Lauf,
 * dessen Ergebnis etwas bedeutet.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Vitest liegt im Workspace-Root, nicht neben diesem Paket — auflösen statt
// einen Pfad zu raten, der beim nächsten npm-Umbau still bricht.
const vitestBin = join(
  dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
  'vitest.mjs',
);

// Die Liste wird GELESEN, nicht gepflegt: Eine neue Sim-Datei läuft damit
// automatisch mit, statt still aus dem Gate zu fallen.
const files = readdirSync(join(gameRoot, 'src', 'game'))
  .filter((f) => /^sim.*\.test\.ts$/.test(f))
  .sort()
  .map((f) => `src/game/${f}`);

if (files.length === 0) {
  console.error('Keine Simulations-Tests gefunden — das Gate liefe ins Leere.');
  process.exit(1);
}

console.log(`Simulations-Gate: ${files.length} Dateien, je ein eigener Prozess.\n`);

for (const file of files) {
  const started = Date.now();
  const res = spawnSync(
    process.execPath,
    [vitestBin, 'run', '--config', 'vitest.sim.config.ts', file],
    { cwd: gameRoot, stdio: 'inherit' },
  );
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (res.status !== 0) {
    console.error(`\n${file} fehlgeschlagen nach ${secs}s (exit ${res.status}).`);
    process.exit(res.status ?? 1);
  }
  console.log(`${file} ✓ ${secs}s\n`);
}
