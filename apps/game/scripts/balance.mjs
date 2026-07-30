#!/usr/bin/env node
/**
 * ROADMAP-V2 P5 — Das Balance-Ritual: `npm run balance`.
 *
 * Druckt die Kennlinien des Spiels als kompakte Tabelle — Pflichtlauf vor jedem
 * Balance-Commit, Output-Snapshot in DECISIONS.md. Die Sim-Anker in
 * `src/game/sim.test.ts` sind die HARTEN Gates (rot/grün); dieses Skript ist ihr
 * ehrlicher Kontostand: dieselben Zahlen, aber lesbar nebeneinander, damit man
 * eine Verschiebung SIEHT, bevor ein Anker reißt.
 *
 * **Keine Zweitimplementierung.** Jede Zahl kommt aus denselben exportierten
 * Funktionen wie die Anker (`simulateSingleRun`, `simulateRunChain`,
 * `simulateAscensionEra`, `simulateContinuous`) mit denselben Bot-Profilen
 * (`SIM_ACTIVE`, `SIM_ACTIVE_CAL`, `SIM_RUN_S`, `SIM_SEEDS_HEAVY`, die in
 * `sim.ts` stehen und von den Tests IMPORTIERT werden). Die Wochen-Kennwerte
 * liest es aus `game/weekly.ts` — derselbe Kalender, den Karte, Strip und Board
 * benutzen. Wenn diese Tabelle wandert, ist das Spiel gewandert.
 *
 * **Warum node + esbuild statt eines Test-Runners?** Genau das Muster von
 * `tools/blender/dump_poses.mjs`: esbuild (schon über Vite im Baum, keine neue
 * Dependency) bündelt die TS-Module nach ESM, node importiert sie und tastet
 * sie ab. Kein Test-Rahmen um eine Tabelle herum, keine Datei, die bei
 * `npm test` mitläuft und die Laufzeit verdoppelt.
 *
 *     npm run balance            # Seeds 1 / 7 / 12345 (die Anker-Seeds)
 *     npm run balance -- 1 7     # eigene Seed-Liste
 *
 * Laufzeit: ~15 s (Budget < 60 s).
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GAME = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const t0 = Date.now();

const tmp = mkdtempSync(join(tmpdir(), 'bc-balance-'));
await build({
  entryPoints: [
    join(GAME, 'src/game/sim.ts'),
    join(GAME, 'src/game/weekly.ts'),
    join(GAME, 'src/game/mastery.ts'),
    join(GAME, 'src/game/gear.ts'),
    join(GAME, 'src/game/retrain.ts'),
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: tmp,
  logLevel: 'warning',
});
const sim = await import(pathToFileURL(join(tmp, 'sim.js')).href);
const weekly = await import(pathToFileURL(join(tmp, 'weekly.js')).href);
const mastery = await import(pathToFileURL(join(tmp, 'mastery.js')).href);
const gear = await import(pathToFileURL(join(tmp, 'gear.js')).href);
const retrain = await import(pathToFileURL(join(tmp, 'retrain.js')).href);
const MASTERY_AT = mastery.MASTERY_RANKS.map((r) => r.at);

const {
  SIM_ACTIVE,
  SIM_ACTIVE_CAL,
  SIM_RUN_S,
  SIM_SEEDS_HEAVY,
  simulateAscensionEra,
  simulateContinuous,
  simulateRunChain,
  simulateSingleRun,
} = sim;

const seeds = process.argv.slice(2).map(Number).filter(Number.isFinite);
const SEEDS = seeds.length > 0 ? seeds : [...SIM_SEEDS_HEAVY];

// --- Tabellen-Handwerk (kein Framework, nur Spaltenbreiten) ----------------
const pad = (s, w, right = true) => (right ? String(s).padStart(w) : String(s).padEnd(w));
function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  console.log(head.map((h, i) => pad(h, w[i], i > 0)).join('   '));
  console.log('─'.repeat(w.reduce((a, b) => a + b + 3, 0) - 1));
  for (const r of rows) console.log(r.map((c, i) => pad(c, w[i], i > 0)).join('   '));
}
const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const min = (sec) => (Number.isFinite(sec) ? (sec / 60).toFixed(1) : '—');
const hrs = (sec) => (Number.isFinite(sec) ? (sec / 3600).toFixed(2) : '—');
const worstGap = (ts) => {
  let w = 0;
  for (let i = 1; i < ts.length; i++) w = Math.max(w, ts[i] - ts[i - 1]);
  return w;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

console.log('');
console.log('═══ BOOTY CLICKER · BALANCE-RITUAL (ROADMAP-V2 P5) ══════════════════════');
console.log(
  `Seeds ${SEEDS.join(' / ')} · Lauflänge ${SIM_RUN_S} s (45 min) · ${new Date().toISOString().slice(0, 10)}`,
);

// ---------------------------------------------------------------------------
// 1 · Pacing-Tabelle (§4.8, Kalibrier-Bedingungen: economy aus)
//     Anker: sim.test.ts „v12 pacing target table (±25 %)"
// ---------------------------------------------------------------------------
console.log('\n── 1 · Pacing im ersten Sitting · Bot 3 cps + Juice, OHNE Loot (§4.8-Kalibrierung)');
const pacing = SEEDS.map((seed) => {
  const r = simulateSingleRun({ ...SIM_ACTIVE_CAL, seed }, SIM_RUN_S);
  return {
    seed,
    t10: r.timeToZone.get(10),
    t20: r.timeToZone.get(20),
    t25: r.timeToZone.get(25),
    t30: r.timeToZone.get(30),
    wall: r.bestZone,
  };
});
table(
  ['Seed', 't10 [min]', 't20 [min]', 't25 [min]', 't30 [min]', 'Wand-Bühne'],
  pacing.map((p) => [
    p.seed,
    min(p.t10),
    min(p.t20),
    min(p.t25),
    p.t30 === undefined ? 'n. e.' : min(p.t30),
    p.wall,
  ]),
);
console.log(
  `   Anker: t10 ~1.75 min ±25 % · t25 ~30 min ±25 % (+5) · Bühne 30 NICHT im ersten Sitting` +
    `\n   Mittel: t10 ${n1(mean(pacing.map((p) => p.t10)) / 60)} min · t25 ${n1(mean(pacing.map((p) => p.t25)) / 60)} min` +
    ` · Wand ⌀ Bühne ${n1(mean(pacing.map((p) => p.wall)))}`,
);

// ---------------------------------------------------------------------------
// 2 · Kumuliert: Bühne 75 (realistischer Spieler, 1 cps, MIT Loot-Ökonomie)
//     Anker: sim.test.ts „Bühne 75 kumuliert in ~4–6 h"
// ---------------------------------------------------------------------------
console.log('\n── 2 · Kumulierter Marsch · Bot 1 cps ohne Juice, MIT Loot (14 × 45 min)');
const cumul = SEEDS.map((seed) => {
  const chain = simulateRunChain({ clickRate: 1, juice: false, seed }, 14, SIM_RUN_S);
  return {
    seed,
    t50: chain.timeToLifetime.get(50),
    t75: chain.timeToLifetime.get(75),
    best: chain.maxBestZone,
    bank: chain.finalBank,
  };
});
table(
  ['Seed', 't50 [h]', 't75 [h]', 'Beste Bühne', 'Seelen-Bank'],
  cumul.map((c) => [c.seed, hrs(c.t50), hrs(c.t75), c.best, Math.round(c.bank)]),
);
console.log(`   Anker: t75 in [3 h, 7.5 h] · Mittel t75 ${hrs(mean(cumul.map((c) => c.t75)))} h`);

// ---------------------------------------------------------------------------
// 3 · Erste Himmelfahrt + längste Power-Durststrecke
//     Anker: sim.test.ts „first Himmelfahrt pacing (M10-AC4)" — der
//     EMPFINDLICHSTE Anker (0.7-cps-Bot, idle-dominiert, lebt an der Gate-Kante)
// ---------------------------------------------------------------------------
console.log(
  '\n── 3 · Erste Himmelfahrt · Bot 0.7 cps ohne Juice, OHNE Loot (RS-Lebenszeit ≥ 1000)',
);
const hf = SEEDS.map((seed) => {
  const era = simulateAscensionEra(
    { clickRate: 0.7, juice: false, economy: false, seed },
    {
      stallSeconds: 2700,
      maxSeconds: 80_000,
      maxAscensions: 100_000,
      stopAtFirstHimmelfahrt: true,
    },
  );
  return {
    seed,
    t: era.firstHimmelfahrtT,
    durst: worstGap(era.powerMilestones),
    milestones: era.powerMilestones.length,
    asc: era.ascensions,
    zone: era.maxBestZone,
  };
});
table(
  ['Seed', 'Himmelfahrt [h]', 'Durststrecke [min]', '+50 %-Stufen', 'Aszensionen', 'Tiefste Bühne'],
  hf.map((h) => [h.seed, hrs(h.t), min(h.durst), h.milestones, h.asc, h.zone]),
);
console.log(
  `   Anker: Himmelfahrt in [11.6 h, 19.4 h] · Durststrecke ≤ 105 min` +
    `\n   Mittel: ${hrs(mean(hf.map((h) => h.t)))} h · längste Durststrecke ${min(Math.max(...hf.map((h) => h.durst)))} min`,
);

// ---------------------------------------------------------------------------
// 4 · E2 — weiche Wand über den vollen v2-Prestige-Stack
//     Anker: sim.test.ts „E2 (bounded soft wall, full v2 prestige stack)"
// ---------------------------------------------------------------------------
console.log('\n── 4 · E2 weiche Wand · adaptive Aszension + Ahnen + Himmelfahrt + Baum');
const e2 = SEEDS.map((seed) => {
  const c = simulateContinuous(
    { ...SIM_ACTIVE_CAL, seed },
    { stallSeconds: 1500, maxSeconds: 400_000, plateauAscensions: 4, fullPrestige: true },
  );
  const zones = [...c.timeToLifetime.keys()].sort((a, b) => a - b).filter((z) => z % 5 === 0);
  const times = zones.map((z) => c.timeToLifetime.get(z));
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  // Dieselbe Lesart wie der Anker: die strikte ×2-Schranke gilt ab Lücke 5.
  const WARMUP = 4;
  let runMax = Math.max(...gaps.slice(0, WARMUP + 1), 0);
  let worstRatio = 0;
  for (let i = WARMUP + 1; i < gaps.length; i++) {
    worstRatio = Math.max(worstRatio, gaps[i] / runMax);
    runMax = Math.max(runMax, gaps[i]);
  }
  return {
    seed,
    steps: zones.length,
    ratio: worstRatio,
    asc: c.ascensions,
    hf: c.himmelfahrten,
    hpf: c.hpfHeld,
    tree: c.treeLevels,
    best: c.maxBestZone,
  };
});
table(
  [
    'Seed',
    '+5-Stufen',
    'schlimmstes Verhältnis',
    'Aszensionen',
    'Himmelfahrten',
    'HPF',
    'Baum-Stufen',
    'Beste Bühne',
  ],
  e2.map((e) => [e.seed, e.steps, n2(e.ratio), e.asc, e.hf, e.hpf, e.tree, e.best]),
);
console.log('   Anker: ≥ 14 Stufen · Verhältnis ≤ 2.00 · ≥ 1 Himmelfahrt über ≥ 8 Aszensionen');

// ---------------------------------------------------------------------------
// 5 · E3 + E4 — Lebendigkeit und die Klick-Invariante
//     Anker: sim.test.ts „E3 (loop stays lively)" + „E4 (click is king)"
// ---------------------------------------------------------------------------
console.log('\n── 5 · E3 Lebendigkeit (20 Aszensionen) + E4 Klick-Vorsprung (45 min)');
const e34 = SEEDS.map((seed) => {
  const era = simulateAscensionEra(
    { ...SIM_ACTIVE, seed },
    { stallSeconds: 90, maxSeconds: 150_000, maxAscensions: 20 },
  );
  const active = simulateSingleRun({ clickRate: 3, juice: true, seed }, SIM_RUN_S);
  const casual = simulateSingleRun({ clickRate: 1, juice: false, seed }, SIM_RUN_S);
  return {
    seed,
    milestones: era.powerMilestones.length,
    gap: worstGap(era.powerMilestones),
    activeZone: active.bestZone,
    casualZone: casual.bestZone,
    lead: active.bestZone - casual.bestZone,
  };
});
table(
  ['Seed', 'E3 +50 %-Stufen', 'E3 größte Lücke [min]', 'aktiv', 'gemächlich', 'E4-Vorsprung'],
  e34.map((e) => [e.seed, e.milestones, min(e.gap), e.activeZone, e.casualZone, `+${e.lead}`]),
);
console.log(
  `   Anker: ≥ 10 Stufen · Lücke ≤ 90 min · E4-Vorsprung ≥ 4 Bühnen` +
    `\n   Mittel: E4-Vorsprung +${n1(mean(e34.map((e) => e.lead)))} Bühnen · kleinster ${Math.min(...e34.map((e) => e.lead))}`,
);

// ---------------------------------------------------------------------------
// 6 · Crew-Meisterschaft (IDEEN-GAMEPLAY 1a) — die Schwellen-Kalibrierung
//     Anker: sim.test.ts „Crew-Meisterschaft (1a) wächst im Bot mit"
// ---------------------------------------------------------------------------
// Einsatz-XP = Lebenszeit-Level je Mitglied. Der Bot zählt sie wie das Spiel und
// kennt (wie das Spiel) keinen Reset — die Tabelle zeigt deshalb, WANN welcher
// Rang fällt. Genau daraus sind die Schwellen in `game/mastery.ts` abgeleitet.
console.log(
  '\n── 6 · Meisterschaft · Einsatz-XP des stärksten Mitglieds (Bot 3 cps + Juice, MIT Loot)',
);
const rankOf = (xp) => {
  let r = 0;
  for (const at of MASTERY_AT) if (xp >= at) r++;
  return r;
};
const RANK_NAMES = ['—', 'Bronze', 'Silber', 'Gold', 'Legende'];
const masteryRows = [];
for (const runs of [1, 4, 16, 32]) {
  const per = SEEDS.map((seed) => {
    const c = simulateRunChain({ ...SIM_ACTIVE, seed }, runs, SIM_RUN_S);
    const vals = Object.values(c.mastery);
    return { best: Math.max(0, ...vals), sum: vals.reduce((a, b) => a + b, 0) };
  });
  const best = mean(per.map((p) => p.best));
  masteryRows.push([
    `${runs} × 45 min`,
    hrs(runs * SIM_RUN_S),
    Math.round(best),
    Math.round(mean(per.map((p) => p.sum))),
    RANK_NAMES[rankOf(best)],
  ]);
}
table(['Spielzeit', '[h]', 'bestes Mitglied', 'Σ ganze Crew', 'Rang'], masteryRows);
console.log(
  `   Schwellen: ${MASTERY_AT.map((at, i) => `${RANK_NAMES[i + 1]} ${at}`).join(' · ')}` +
    `\n   Anker: Bronze im ersten Sitting · Silber nach ~3 h · Gold ~13 h · Legende ~100 h (~450 Level/Lauf im Beharrungszustand)`,
);

// ---------------------------------------------------------------------------
// 7 · Splitter-Einkommen (IDEEN-GAMEPLAY 3b) — die Eichlatte der Umschul-Kosten
//     Anker: sim.test.ts „Splitter-Einkommen trägt die Umschul-Leiter (3b)"
// ---------------------------------------------------------------------------
// Zwei Quellen, beide echt: Die Sim-Ökonomie bankt die 🧩 aus TRUHEN (`econ.shards`),
// und das Spiel zahlt zusätzlich pro Boss-Kill `bossShardReward` — der Bot modelliert
// diesen zweiten Faucet nicht, also wird er hier aus der GEMESSENEN Bühnen-Kurve
// rekonstruiert (jeder Lauf clert die Boss-Bühnen 5, 10, … bis zu seiner Wand).
console.log('\n── 7 · Splitter-Einkommen · Bot 3 cps + Juice, MIT Loot (Truhen + Boss-Faucet)');
const bossShardsUpTo = (bestZone) => {
  let s = 0;
  for (let z = 5; z <= bestZone; z += 5) s += gear.bossShardReward(z);
  return s;
};
const shardRows = [];
for (const runs of [1, 4, 16, 32]) {
  const per = SEEDS.map((seed) => {
    const c = simulateRunChain({ ...SIM_ACTIVE, seed }, runs, SIM_RUN_S);
    return {
      chest: c.econ.shards,
      boss: c.runs.reduce((a, r) => a + bossShardsUpTo(r.bestZone), 0),
    };
  });
  const h = (runs * SIM_RUN_S) / 3600;
  const chest = mean(per.map((p) => p.chest));
  const boss = mean(per.map((p) => p.boss));
  shardRows.push([
    `${runs} × 45 min`,
    hrs(runs * SIM_RUN_S),
    Math.round(chest),
    Math.round(boss),
    Math.round(chest + boss),
    Math.round((chest + boss) / h),
  ]);
}
table(['Spielzeit', '[h]', '🧩 Truhen', '🧩 Bosse', 'Σ 🧩', '🧩/h'], shardRows);
console.log(
  `   Umschul-Leiter (3b): ` +
    [1, 2, 3, 4, 5].map((slot) => `Slot ${slot} ${retrain.retrainCost(slot, 0)}`).join(' · ') +
    `\n   … jeder weitere Roll am selben Mitglied in derselben Aszension ×${retrain.RETRAIN_ROLL_GROWTH}` +
    ` (Slot 1: ${[0, 1, 2, 3].map((r) => retrain.retrainCost(1, r)).join(' → ')})` +
    `\n   Gegenprobe (bestehender Sink): Skin-Level 10 = ${gear.shardCost(10)} 🧩 · Level 20 = ${gear.shardCost(20)} · Level 25 = ${gear.shardCost(25)}`,
);

// ---------------------------------------------------------------------------
// 8 · Wochen-Kalender (A5/X4) — serverlos deterministisch, also hier prüfbar
// ---------------------------------------------------------------------------
console.log('\n── 8 · Wochen-Anker · Bühne der Woche + Board-Saison (ISO-Kalender, A5/X4)');
const week0 = weekly.weekIndexOf(Date.now());
const weeks = [];
for (let i = 0; i < 5; i++) {
  const wk = week0 + i;
  const st = weekly.weeklyStageFor(wk);
  const season = weekly.boardSeasonFor(wk);
  const iso = weekly.isoWeekOf(wk);
  weeks.push([
    i === 0 ? `${wk} ◀ jetzt` : String(wk),
    `KW ${iso.isoWeek}/${iso.isoYear}`,
    st ? st.zone : '—',
    st ? st.mods.map((m) => m.name).join(' + ') : '—',
    `${season.number} (Woche ${wk - season.firstWeek + 1}/${weekly.SEASON_WEEKS})`,
    weekly.weeklyBoardKey(wk),
  ]);
}
table(['Woche', 'ISO', 'Bühne', 'Regeln', 'Saison', 'Board-Schlüssel'], weeks);
const zonesSeen = new Set();
for (let i = 0; i < 52; i++) zonesSeen.add(weekly.weeklyStageFor(week0 + i)?.zone);
console.log(
  `   Streuung über 52 Wochen: ${zonesSeen.size} verschiedene Bühnen` +
    ` (${Math.min(...zonesSeen)}…${Math.max(...zonesSeen)}), Schrittweite ${weekly.WEEKLY_STEP}`,
);

rmSync(tmp, { recursive: true, force: true });
const secs = (Date.now() - t0) / 1000;
console.log(
  `\n═══ fertig in ${secs.toFixed(1)} s (Budget < 60 s) ══════════════════════════════\n`,
);
if (secs > 60) {
  console.error('✗ Balance-Ritual über dem 60-s-Budget.');
  process.exit(1);
}
