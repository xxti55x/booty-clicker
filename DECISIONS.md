# DECISIONS.md

Log of non-obvious engineering decisions, newest first. Each milestone appends
here (spec §7).

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
