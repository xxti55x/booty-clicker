# DECISIONS.md

Log of non-obvious engineering decisions, newest first. Each milestone appends
here (spec §7).

## CH-MVP — Umbau auf Clicker-Heroes-Loop (endlos)

- **2026-07-17 — Produkt-Pivot auf einen Clicker-Heroes-Kern.** Auf Wunsch
  („komplette MVP für Clicker Heroes, auf Booty Clicker umgestellt") wurde das
  flache AdCap-artige Klickspiel zu einem endlosen Zonen-/DPS-Loop umgebaut:
  Twerk-Klick = Schaden am Rivalen, Crew = Idle-DPS, 10 Rivalen/Zone, Boss alle 5
  Zonen mit Timer, Ascension → Ruhm-Seelen. „Hauptinhalt = Klicken" wird durch
  Crits (×5 @ 20 %) + Combo-Multiplikator und die Kopplung Klick-Schaden ∝ DPS
  umgesetzt; „nie durchspielbar" durch exponentielle Zonen-HP + seelenbasierte,
  an die Lifetime-Zone gepinnte Prestige-Skalierung.

- **2026-07-17 — Eigener Save-Key statt Migration der v4-Kette.** Der CH-Modus
  persistiert unter `bootyclicker.ch` (eigenes v1-Schema, never-throw, injizierbar),
  statt das alte `SCHEMA_VERSION`/`migrate`-Layer (62 Tests) umzubauen. So bleibt
  die Legacy-Save-Schicht grün und der neue Loop entkoppelt.

- **2026-07-17 — Reiner, testbarer Kern für die neue Ökonomie.** `combat.ts`,
  `heroes.ts`, `ascension.ts`, `ch-state.ts`, `ch-store.ts` sind DOM-frei und
  deterministisch (40 neue Unit-Tests): HP/Gold-Formeln, Reducer `hit/tickBoss`,
  Kostenreihen (`bulkCost`/`maxAffordable`), Seelen-Formel + Exploit-Schutz
  (`Math.max`-Boden, Pinning an Lifetime-Zone), Offline-Gold (8 h/50 %).

- **2026-07-17 — Idle-Schaden: ein Treffer pro Frame.** Der Loop wendet
  `dps·dt` als einen `hit()` pro Frame an (kein Damage-Carry-over). Am Frontier-Wall
  (DPS < Rivalen-HP) irrelevant; nur beim Über-Farmen weit unter Level würde Schaden
  „verpuffen" — dort ist Clearing ohnehin trivial. Hält die Boss-Timer-Logik simpel.
  (Offline nutzt die geschlossene Formel `dps/HP·Gold`, also frameraten-unabhängig.)

- **2026-07-17 — Legacy-Module bleiben liegen, tree-shaken aber raus.** Die
  M0–M6-UI/Ökonomie (shop/hud/boss/settings/leaderboard/economy/progression/…)
  wird von `main.ts` nicht mehr importiert; ihre Tests bleiben grün, der Bundle
  fällt auf ~566 KB. Aufräumen/Entfernen ist eine spätere Aufgabe.

- **2026-07-17 — Bug B4 (v2-Spec) mitgefixt:** `keydown` mit `e.repeat` twerkt nicht
  mehr — gehaltene Leertaste ist kein Gratis-Autoclicker mehr.

## M6 — UX, Polish & Release

- **2026-07-17 — Settings extended in place, not a new schema.** `quality`
  (low/medium/high), `fpsCap` (0/30/60) and `onboarded` join screen-shake/particles
  in the same `bootyclicker.settings` key — still pure, injectable and never-throw,
  with per-field validation (`asQuality`/`asFpsCap`) so a corrupt value falls back
  to its default. No game-save migration is involved (client settings ≠ progress).

- **2026-07-17 — Graphics knobs are a pure preset + a thin renderer apply.**
  `engine/quality.ts` maps a preset to `{ pixelRatioCap, shadows }` and clamps the
  effective pixel ratio (unit-tested, no THREE import); `main.applyQuality` is the
  only place that touches `renderer.setPixelRatio` / `shadowMap.enabled` and forces
  a one-shot material recompile when shadows toggle. FPS-cap pacing is the pure
  `frameDue(now,last,cap)` gate (0 = uncapped) at the top of the render loop, so
  frame-skips never corrupt the fixed-timestep physics (dt still comes from the clock).

- **2026-07-17 — Mobile input unified on pointer events + a pure tap test.**
  Replaced the desktop `click` handler with `pointerdown`/`pointerup` and
  `isTap(distancePx, durationMs)` (≤10 px, ≤500 ms) so a quick touch/click shakes
  while an OrbitControls drag does not — one code path for mouse and touch. Verified
  by the M6 smoke test (tap increases BP, drag does not).

- **2026-07-17 — Onboarding is three non-blocking coach marks, shown once.**
  The card floats above the HUD but only it captures pointer events, so the player
  can already shake / open the shop underneath. It highlights the target control per
  step and, on finish, sets the persisted `onboarded` flag — never shown again.

- **2026-07-17 — itch export = `base:'./'` + zip the dist _contents_.** `build:itch`
  builds then runs `scripts/pack-itch.mjs`, which zips the contents of `dist/` (so
  `index.html` is at the archive root, an itch requirement) via the `zip` CLI into
  `release/booty-clicker-itch.zip` (git-ignored). Verified end-to-end: extracted and
  served over a plain static server with zero failed requests and working gameplay.

- **2026-07-17 — Cloudflare Pages deploy is opt-in, never breaks CI.** A `main`-only
  `deploy-pages` job checks for `CLOUDFLARE_API_TOKEN` and _skips_ (green `::notice::`)
  when secrets are absent, so forks and unconfigured repos still pass CI. Release QA
  and the ~40 min playthrough timing are documented in `TESTPLAN.md`.

## M5 — Leaderboard (Worker + D1)

- **2026-07-17 — Storage + rate-limit behind interfaces → testable without
  wrangler.** The Hono app is built by `createApp(makeRepo, makeLimiter)`; D1 and
  KV are thin adapters, and tests drive the real request logic via `app.request()`
  with in-memory fakes (9 tests: nickname filter, 1-based rank, 5/min rate-limit,
  top ordering + limit clamp). This satisfies "lokal testbar" more robustly than a
  manual `wrangler dev`, which stays available via `npx wrangler dev`.

- **2026-07-17 — The client is fail-silent and off by default.** Every call
  returns `null` on timeout (3 s), network error, or when `VITE_API_BASE` is unset,
  so the game is fully playable with no reachable API (spec §4.4, AC). The
  post-boss submit dialog only appears when a leaderboard is configured; the ⚙️-tab
  "Top 50" view shows an offline message otherwise.

- **2026-07-17 — Nickname is the only stored field, validated on both ends.**
  `[a-zA-Z0-9_ ]{2,16}` (trimmed) client-side and server-side, plus a D1 `CHECK`
  constraint — no PII (spec §2, §4.5). Server-returned nicknames are additionally
  HTML-escaped before rendering the top list (defense in depth).

- **2026-07-17 — Rank = "how many stored times beat you, + 1".** Lower boss-kill
  time is better; `SELECT COUNT(*) WHERE best_time_s < ?` keeps it a single indexed
  query. `wrangler.toml` + `schema.sql` are deploy-ready with placeholder ids.

## M4 — Game Feel & Content

- **2026-07-17 — Achievements are data-driven pure predicates.** 18 achievements
  each carry a `check(ctx)` over an `AchievementCtx` snapshot (maxBp, totalClicks,
  maxCombo, levels, rebirths, …), so the whole set is unit-testable without a DOM.
  `checkAchievements()` runs on every shake and on discrete events (buy, boss win,
  rebirth, peach), plus a throttled loop pass — unlocking is immediate and
  persistence-backed rather than relying on the render loop.

- **2026-07-17 — Schema v4** adds `achievements`, `totalClicks`, `maxCombo`,
  `peachesClicked`, `nextPeachAt`, `boostUntil`; `migrate v3→v4` defaults them.
  Event timing persists as epoch ms so the peach schedule and the ×3 boost survive
  a reload (spec AC). Same never-throw validation discipline.

- **2026-07-17 — Golden-Peach timing is pure; the DOM peach is glue.** `events.ts`
  exposes `rollNextPeachAt`/`activateBoost`/`incomeMultiplier` (unit-tested); the
  clickable 🍑 button + 8 s visibility window live in `main.ts`. The ×3 boost is a
  multiplier applied to both click and passive income, gated on `boostUntil`.

- **2026-07-17 — Particles: one THREE.Points + fade shader, 200-slot pool.**
  Round-robin reuse, CPU integration is a flat 200-iteration loop (≪ 1 ms/frame by
  construction — a few thousand float ops); dead slots have life 0 and are
  `discard`ed in the fragment shader. Toggleable via effect settings.

- **2026-07-17 — Effect toggles in their own localStorage key.** Screen-shake and
  particles persist under `bootyclicker.settings` (pure + injectable, like audio
  prefs) — no save-schema coupling. Screen-shake offsets the camera only for the
  render call and restores it, so OrbitControls' internal state never drifts.

- **2026-07-17 — 4 endgame upgrades keep the M2 curve intact.** All four have base
  cost > `REBIRTH_BP` (100k), so the optimal-buy simulator never affords them
  before the boss/rebirth gates — the balancing acceptance test is unchanged.
  Effect values (`val`) are new ids, so the `deriveStats` economy tests still pass.

## M3 — Audio

- **2026-07-17 — All audio is synthesised, not sourced files.** The spec asks for
  "1 CC0 Loop-Track pro Kulisse". Instead of downloading audio (network-policy
  dependent, and 4 tracks + SFX would eat into the < 5 MB budget), every sound is
  generated at runtime via the Web Audio API — oscillators + filtered noise for
  SFX, and a per-background generative bass/arp/hi-hat loop. It is original code,
  so it is licence-free (effectively CC0); documented in `public/CREDITS.md`.

- **2026-07-17 — Audio prefs live in a separate localStorage key.** Mute/volume
  settings persist under `bootyclicker.audio`, not in the game save, so audio
  settings never force a save-schema migration. Same never-throw + injectable-
  storage discipline as the save layer, so `prefs.ts` is unit-tested in node.

- **2026-07-17 — Lazy AudioContext on first gesture (no autoplay).** The context
  is created and resumed only in `unlock()`, called from the first pointerdown /
  keydown / mute click — so browsers never raise an autoplay warning (spec AC).
  Music (re)starts only when the context is running and not muted.

- **2026-07-17 — Testable core vs. audio glue.** Beat detection (`beat.ts`),
  prefs (`prefs.ts`) and track configs (`tracks.ts`) are pure and unit-tested;
  the AudioContext-touching `engine.ts` is thin glue verified by the headless
  smoke test (no autoplay error, mute toggles + persists). `BeatTracker` turns
  the choreography `phase` into discrete clap onsets that speed up with drive.

## M2 — Progression & Boss-Finale

- **2026-07-17 — Balancing = base-cost scale, not new mechanics.** Optimal play
  raced to 50k BP in ~14 min with the ported economy. The upgrade **effect** values
  (`val`/`type`) are the prototype's originals (shop text unchanged); only the
  **costs** (`base` ×3) are the tuning knob. `economy.test.ts` asserts effect values
  and the cost _formula_ (with literals), so retuning `base` breaks nothing. `gr`
  barely moves the ROI-greedy curve — base scale dominates — so growth rates stay
  as-is. Canonical cadence for the AC is ~3 clicks/s → boss at ~40 min.

- **2026-07-17 — Pure optimal-buy simulator backs the balancing AC.**
  `simulatePlaythrough` (game/progression.ts) is a deterministic, DOM-free
  ROI-greedy playthrough; the test asserts the 50k-BP boss unlock lands in the
  30–50 min window at clickRate 3 and 4. An optional `upgrades` override let me
  calibrate tunings without editing `economy.ts` iteratively.

- **2026-07-17 — Boss HP is fixed (75k), not scaled to the player.** Click damage
  scales with `perClick·mult` (spec), so a fixed pool makes perClick investment
  matter: at the expected unlock build (perClick·mult ≈ 260) it's a close fight at a
  brisk cadence; a click-neglecting or slow player loses. Each loss eases the next
  attempt's HP by 25% (`0.75^attempt`), so it is always eventually winnable.

- **2026-07-17 — Rebirth = additive +100% folded into the multiplier.**
  `prestigeMult = 1 + rebirths`; on load and after each rebirth, derived stats are
  rebuilt via `deriveStats(upgrades, { mult: prestigeMult })`, so the running
  incremental `state.mult *= val` on purchases keeps prestige baked in. Cosmetic
  unlocks, `bossDefeated` and `maxBp` survive a rebirth; BP and levels reset.

- **2026-07-17 — Schema v3.** Added `maxBp`, `prestigeMult`, `rebirths`,
  `bossDefeated`; `migrate v2→v3` defaults them (maxBp seeded from bp). Kept the M1
  never-throw + `Object.hasOwn` validation discipline; the migration loop still
  can't infinite-loop and rejects future/invalid versions to a clean fresh start.

- **2026-07-17 — Content-gates are sticky via persisted `maxBp`.** Skins/backgrounds
  reveal once the _highest-ever_ BP passes `revealAt`, so spending BP never re-hides
  an item. `Shop.syncReveals()` recomputes a reveal signature each throttled tick and
  re-renders only when a milestone is crossed.

- **2026-07-17 — Boss/rebirth UI placement.** Boss fight is a top HP-bar/timer banner
  plus a win/lose result dialog (reusing the M1 `.overlay`/`.dialog` language);
  clicks route to boss damage while engaged and passive income pauses. Rebirth lives
  in the ⚙️ tab with the same armed double-confirm as Reset; NG+ badge in the HUD.

- **2026-07-17 — Shop/boss buttons moved to top-left.** A headless end-to-end smoke
  test surfaced that the 🛒 and 👑 buttons overlapped the shop tab row (real click
  interception). Both moved to the left edge, clear of the right-hand shop panel.

## M1 — Persistenz

- **2026-07-16 — `suppressSave` guard on reset.** `reset()` wipes the save and
  reloads the page; without a guard, the 10 s autosave interval or a
  `visibilitychange`/`beforeunload` firing between the wipe and the reload
  could resurrect the just-deleted save. `suppressSave` is flipped before
  `resetSave()` runs so `persist()` becomes a no-op for the remainder of that
  page's lifetime.

- **2026-07-16 — Armed-button double-confirm instead of `window.confirm`.**
  The reset button arms on first click (visual state + 4 s auto-revert) and
  only fires on a second click while armed. Keeps the destructive action
  in-page and stylable, matching the game's UI language, rather than a native
  browser dialog.

- **2026-07-16 — Settings folded into the shop as a 4th tab.** No new panel
  chrome, no extra toggle — reuses `Shop`'s existing tab/tabbody plumbing
  (generalized from a hard-coded 3-way switch to a `data-t` → element map) so
  Export/Import/Reset live where players already look for game controls.

- **2026-07-16 — UTF-8-safe base64 via `TextEncoder`/`TextDecoder`.** Plain
  `btoa(JSON.stringify(...))` breaks on multi-byte characters (skin/BG names
  contain emoji). Encoding routes bytes through `TextEncoder` before `btoa`
  and reverses via `atob` + `TextDecoder`, so export/import codes survive
  round-tripping any save content.

- **2026-07-16 — `SaveStorage` injected behind a 3-method interface.** Vitest
  runs in the `node` environment (no jsdom, per project convention) with no
  `localStorage`. Every persistence function takes an optional `SaveStorage`
  (defaulting to `globalThis.localStorage` wrapped in a try/catch) so tests
  inject an in-memory `Map`-backed fake and the whole save layer is
  unit-testable without a DOM.

- **2026-07-16 — Derived stats (`perClick`/`perSec`/`mult`) are never
  persisted or trusted from disk.** The save stores only `bp` and upgrade
  _levels_ keyed by id; on load, levels are applied to a fresh
  `createUpgrades()` and stats are rebuilt via the existing pure
  `deriveStats`. A tampered or stale stored multiplier can never leak into a
  loaded game — it's simply never read.

- **2026-07-16 — v1 schema defined retroactively.** M0 never shipped a save
  format, so `SaveDataV1` (positional upgrade array, derived stats stored
  directly, no `lastSeen`) is a reconstruction of "what the naive M0
  serialization would have looked like," giving the migration registry
  (`MIGRATIONS[1] = migrateV1toV2`) a real predecessor to prove the upgrade
  path against instead of starting the chain at v2 only.

## M0 — Scaffold & Port

- **2026-07-16 — Spec kept as `booty-clicker-spec.md`, `AGENTS.md` is a pointer.**
  Spec §3 lists `AGENTS.md` as "dieses Dokument". Rather than rename the file the
  task explicitly references, we keep the full spec under its original name and add
  a short `AGENTS.md` operating guide that links to it. Both requirements satisfied,
  nothing the user pointed at disappears.

- **2026-07-16 — npm workspaces monorepo (`apps/game`, `apps/api`).**
  Matches spec §3 layout. Shared dev tooling (ESLint, Prettier, TypeScript) is
  hoisted to the root; runtime deps (Three.js, Vite) live in `apps/game`.

- **2026-07-16 — Three.js via npm, `OrbitControls` from `three/examples`.**
  The prototype loaded Three r128 from cdnjs and hand-rolled an orbit camera. Per
  spec §5 M0 we depend on the `three` npm package (`^0.180`) and replace the custom
  camera with `OrbitControls` (zoom limits 5–24). No CDN dependency remains.

- **2026-07-16 — Vite `base: './'` (relative paths).**
  Required so the production build runs from a file path / itch.io ZIP (spec §5 M6),
  set up early to avoid a late-stage path rewrite.

- **2026-07-16 — `economy.ts` extracted as pure, data-driven module first.**
  The cost formula `floor(base·gr^lv)`, combo bonus (+5%/stack) and multiplicative
  mult-stacking are ported verbatim from the prototype into pure functions with a
  typed `UPGRADES` config array, covered by 3+ Vitest unit tests. `deriveStats`
  folds upgrade levels so stats can be reconstructed from a save (needed for M1).

- **2026-07-16 — M0 delivered in two commits:** (1) scaffold + toolchain + economy
  tests, (2) full behavioural port of the prototype into modules.
  Keeps each commit independently green and reviewable.

- **2026-07-16 — `noUncheckedIndexedAccess` disabled.** It is not part of `strict`
  and added heavy friction across the ported Three.js code (palette lookups, pose
  channels, geometry attributes). `strict` plus `noUnusedLocals/Parameters`,
  `noImplicitReturns` and `noFallthroughCasesInSwitch` stay on.

- **2026-07-16 — Port structure.** The 646-line prototype was split by spec §3
  directory: `engine/` (scene, renderer, lights, env, OrbitControls camera,
  material helpers), `character/` (rig, physics, skins), `choreo/` (moves +
  `Choreographer`), `world/` (backgrounds + `World`), `game/` (economy, state),
  `ui/` (hud, shop, format), wired in `main.ts`. Transient runtime signals
  (combo, drive) live outside the serializable `GameState`. Three r128 deprecations
  updated: `outputEncoding`→`outputColorSpace`, texture `.encoding`→`.colorSpace`,
  `physicallyCorrectLights` dropped (physical lighting is the r0.180 default).

- **2026-07-16 — M0 verified.** Headless Chromium smoke test: no page/console
  errors, WebGL context created, HUD/shop render (7 upgrades), clicking increments
  BP with the combo bonus. `npm run build` → dist 552 KB (< 5 MB budget); `npm test`
  9 green; lint + format clean.
