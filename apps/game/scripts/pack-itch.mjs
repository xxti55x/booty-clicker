/**
 * Package the production build into an itch.io-ready ZIP (spec §5 M6).
 *
 * itch.io serves the uploaded ZIP with `index.html` at the archive root and no
 * server, so the game must load purely from relative paths — that's why
 * `vite.config.ts` pins `base: './'`. We zip the *contents* of `dist/` (not the
 * `dist/` folder itself) so `index.html` lands at the ZIP root.
 *
 * Requires the `zip` CLI (present on Linux/macOS and GitHub Actions runners).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameDir = resolve(here, '..');
const dist = resolve(gameDir, 'dist');
const outDir = resolve(gameDir, 'release');
const out = resolve(outDir, 'booty-clicker-itch.zip');

if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('✗ dist/index.html not found — run `npm run build` first.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
rmSync(out, { force: true });

try {
  // -r recurse, -q quiet, -X drop extra file attributes for a reproducible archive.
  execFileSync('zip', ['-r', '-q', '-X', out, '.'], { cwd: dist });
} catch (err) {
  console.error('✗ Failed to create ZIP. Is the `zip` CLI installed?');
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
}

const kb = Math.round(statSync(out).size / 1024);
console.log(`✅ itch.io bundle ready: ${out} (${kb} KB)`);
console.log('   Upload to itch.io as an HTML project and tick');
console.log('   “This file will be played in the browser”.');
