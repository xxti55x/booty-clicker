# Booty Clicker — Test Plan (M6)

Manual + automated release checklist. Automated coverage lives in the unit tests
(`npm test`, 132 game + 9 API) and the headless smoke scripts; this document
covers the manual passes that can't be fully asserted in CI (real browsers,
touch input, performance).

## 1. Automated gates (run before every release)

- [ ] `npm run lint` — ESLint clean
- [ ] `npm run format:check` — Prettier clean
- [ ] `npm test` — all unit tests green (game + API workspaces)
- [ ] `npm run build` — type-checks and builds; bundle **< 5 MB** (currently ~578 KB JS / ~150 KB gzip)
- [ ] `npm run build:itch` — produces `apps/game/release/booty-clicker-itch.zip` with `index.html` at the archive root

## 2. Browser matrix (manual smoke)

Run `npm run preview` (or serve the itch ZIP) and verify on each target:

| Check                                                               | Chrome (desktop) | Firefox (desktop) | Android (Chrome) |
| ------------------------------------------------------------------- | ---------------- | ----------------- | ---------------- |
| Loads to first frame; loading screen fades out                      | ☐                | ☐                 | ☐                |
| Onboarding coach marks appear on first run, then never again        | ☐                | ☐                 | ☐                |
| Click / tap the figure shakes and grants BP                         | ☐                | ☐                 | ☐                |
| Spacebar shakes (desktop)                                           | ☐                | ☐                 | n/a              |
| Camera orbit (drag) does **not** register as a shake                | ☐                | ☐                 | ☐                |
| Shop opens/closes; upgrades/skins/backgrounds purchasable           | ☐                | ☐                 | ☐                |
| Audio starts after first gesture; mute button persists              | ☐                | ☐                 | ☐                |
| Autosave + reload restores progress; offline earnings dialog        | ☐                | ☐                 | ☐                |
| Boss fight (≥ 50 000 BP), win/lose, retry easing                    | ☐                | ☐                 | ☐                |
| Rebirth (≥ 100 000 BP) resets & grants NG+ multiplier               | ☐                | ☐                 | ☐                |
| Golden Peach spawns and grants ×3 boost                             | ☐                | ☐                 | ☐                |
| Achievements toast + 🏆 tab                                         | ☐                | ☐                 | ☐                |
| Settings: graphics quality (low/med/high) + FPS cap apply & persist | ☐                | ☐                 | ☐                |
| `document.title` shows live BP                                      | ☐                | ☐                 | ☐                |
| Export / Import / Reset save                                        | ☐                | ☐                 | ☐                |

## 3. Mobile / touch specifics

- [ ] Portrait & landscape: shop is full-width, HUD readable, buttons ≥ 44 px tap targets.
- [ ] One-finger drag orbits the camera (OrbitControls, `touch-action: none`), a quick tap shakes.
- [ ] No accidental page zoom / scroll (viewport `user-scalable=no`, `overflow: hidden`).
- [ ] Golden Peach reachable within the visible area on small screens.

## 4. Performance (Lighthouse)

Target: **Performance ≥ 85** (mobile preset) on the production build.

1. `npm run build && npm run preview`
2. Chrome DevTools → Lighthouse → Performance, Mobile → analyze the preview URL.
3. If below 85, try `Qualität: Niedrig` + `FPS-Limit: 30` in ⚙️ and re-measure; the
   low preset disables shadows and caps pixel ratio at 1.

Notes:

- No external requests (Three.js is bundled, audio is procedural, favicon is a
  data-URI) — first load is a single HTML + CSS + JS bundle.
- The leaderboard client is off unless `VITE_API_BASE` is set, so there are no
  blocking network calls on boot.

## 5. Playthrough timing (balancing)

The economy is tuned so an optimal player reaches the boss unlock (50 000 BP) in
**~40 minutes**. This is asserted deterministically by the pure `simulatePlaythrough`
bot in `apps/game/src/game/progression.test.ts` (target window 30–50 min at a
sustained 3 clicks/s). Re-run `npm test` after any `economy.ts` cost change and
confirm the playthrough test still passes.

Manual sanity: a fresh save, playing actively and reinvesting into upgrades,
should feel like a ~30–50 min climb to the boss, then endgame upgrades
(Reaktor / Mine / Singularität / Blackhole) for the post-boss curve.

## 6. itch.io release

- [ ] `npm run build:itch`
- [ ] Extract `booty-clicker-itch.zip` locally and serve the folder over any static
      HTTP server (e.g. `python3 -m http.server`) — the game must boot and play with
      **no failed requests** (all asset paths are relative, `base: './'`).
- [ ] Upload the ZIP to itch.io as an HTML project, tick “This file will be played
      in the browser”, set the viewport to ~960×640 (fullscreen enabled).

## 7. Cloudflare deploys

- [ ] Pages: on push to `main`, CI deploys `apps/game/dist` when
      `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets are present (skipped
      cleanly otherwise).
- [ ] Worker (leaderboard, optional): `cd apps/api && npx wrangler deploy` after
      provisioning the D1 database and KV namespace from `wrangler.toml`.
