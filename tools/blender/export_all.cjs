#!/usr/bin/env node
/* Exportiert alle Spielmodelle als .glb nach models/ (Repo-Root).
 *
 * Fährt `vite dev` (das dev-only /export-models.html servt) headless an,
 * lässt src/dev/export-models.ts jedes Modell mit den echten Buildern bauen
 * und schreibt die Binärdaten auf Platte. Aufruf aus dem Repo-Root:
 *
 *     node tools/blender/export_all.cjs [--playwright <pfad-zu-playwright-core>]
 *
 * Voraussetzungen: ein Chromium (PLAYWRIGHT_CHROMIUM oder /opt/pw-browsers/…)
 * und playwright-core (Pfad via --playwright, wenn nicht auflösbar).
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'models');
const PORT = 4189;

function resolvePlaywright() {
  const flagIdx = process.argv.indexOf('--playwright');
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) return require(process.argv[flagIdx + 1]);
  return require('playwright-core'); // global/erreichbar installiert
}

function resolveChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const base = '/opt/pw-browsers';
  const hit = fs
    .readdirSync(base)
    .find(
      (d) => d.startsWith('chromium') && fs.existsSync(path.join(base, d, 'chrome-linux/chrome')),
    );
  if (!hit) throw new Error('kein Chromium gefunden — PLAYWRIGHT_CHROMIUM setzen');
  return path.join(base, hit, 'chrome-linux/chrome');
}

async function waitForHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* Server noch nicht oben */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server unter ${url} nicht erreichbar`);
}

(async () => {
  const { chromium } = resolvePlaywright();
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--host', '127.0.0.1'], {
    cwd: path.join(ROOT, 'apps', 'game'),
    stdio: 'ignore',
  });
  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/export-models.html`);
    const browser = await chromium.launch({
      executablePath: resolveChromium(),
      args: [
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--no-sandbox',
      ],
    });
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', (e) => console.error('pageerror:', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/export-models.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__done === true, null, { timeout: 120_000 });

    const models = await page.evaluate(() => window.__models ?? {});
    const errors = await page.evaluate(() => window.__errors ?? []);
    const dropped = await page.evaluate(() => window.__dropped ?? []);
    await browser.close();
    if (dropped.length) {
      console.log(`${dropped.length} Laufzeit-Knoten beim Export entfernt:`);
      for (const d of dropped) console.log('  ·', d);
    }

    let written = 0;
    for (const [name, b64] of Object.entries(models)) {
      const file = path.join(OUT, `${name}.glb`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      written++;
      console.log(`✓ models/${name}.glb (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
    }
    if (errors.length) {
      console.error(`\n${errors.length} Modell(e) fehlgeschlagen:`);
      for (const e of errors) console.error('  ✗', e);
      process.exitCode = 1;
    }
    console.log(`\n${written} Modelle → ${OUT}`);
  } finally {
    vite.kill();
  }
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
