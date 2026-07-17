# Booty Clicker — Test Plan (CH loop, M7)

Manual + automated release checklist for the endless Clicker-Heroes-style loop.
Automated coverage lives in the unit tests (`npm test`) and the headless smoke
scripts; this document covers the manual passes that can't be fully asserted in
CI (real browsers, touch input, performance).

> **Note on scope (N5 — no ghost features).** The old M0–M6 game (upgrade shop,
> single 50k-BP boss, additive rebirth at 100k, Golden Peach, skin/background
> picker, achievements UI, leaderboard client) is **intentionally gone** in the
> CH MVP. Do **not** test for it. Per the spec Gap-Checklist (§2.3) it returns
> later: skin/background choice **with buffs → M11**, chests/Golden Peach → M12,
> achievements/quests/daily/stats + leaderboard v2 → M13. The legacy modules stay
> in the repo as a frozen archive (their unit tests remain green) only until the
> one-time legacy import (below) has shipped.

## 1. Automated gates (run before every release)

- [ ] `npm run lint` — ESLint clean
- [ ] `npm run format:check` — Prettier clean
- [ ] `npm test` — all unit tests green (game + API workspaces)
- [ ] `npm run build` — type-checks and builds; bundle **< 5 MB** (currently ~566 KB JS / ~147 KB gzip)
- [ ] `npm run build:itch` — produces `apps/game/release/booty-clicker-itch.zip` with `index.html` at the archive root

## 2. Browser matrix (manual smoke)

Run `npm run preview` (or serve the itch ZIP) and verify on each target:

| Check                                                                      | Chrome (desktop) | Firefox (desktop) | Android (Chrome) |
| -------------------------------------------------------------------------- | ---------------- | ----------------- | ---------------- |
| Loads to first frame; loading screen fades out                             | ☐                | ☐                 | ☐                |
| Onboarding coach marks appear on first run, then never again               | ☐                | ☐                 | ☐                |
| Click / tap the figure = twerk → rival HP drops (damage popup)             | ☐                | ☐                 | ☐                |
| Spacebar twerks; **held** spacebar does NOT autofire (one shake)           | ☐                | ☐                 | n/a              |
| Camera orbit (drag) does **not** register as a shake                       | ☐                | ☐                 | ☐                |
| Crits (~20 %) show a bigger "CRIT" popup + stronger screen-shake           | ☐                | ☐                 | ☐                |
| Combo multiplier climbs while clicking fast, resets after ~1.5 s idle      | ☐                | ☐                 | ☐                |
| Crew shop (🕺): recruit/level members ×1 / ×10 / Max; DPS ticks rivals     | ☐                | ☐                 | ☐                |
| Clearing 10 rivals advances the zone; HP scales up (endless)               | ☐                | ☐                 | ☐                |
| Every 5th zone = boss with a 30 s timer; timeout → farm & retry (no lock)  | ☐                | ☐                 | ☐                |
| Backdrop rotates every 10 zones (club → synth → beach → space)             | ☐                | ☐                 | ☐                |
| Ascend (✨ Ruhm): resets the run, banks Ruhm-Seelen, +10 %/soul            | ☐                | ☐                 | ☐                |
| Ascension preview shows "+X Seelen" before the reset                       | ☐                | ☐                 | ☐                |
| Audio starts after first gesture; mute button persists                     | ☐                | ☐                 | ☐                |
| Autosave + reload restores progress                                        | ☐                | ☐                 | ☐                |
| Offline earnings dialog on boot after being away                           | ☐                | ☐                 | ☐                |
| Tab-return grant: switch tab ~1 min, return → BP credited (B5)             | ☐                | ☐                 | ☐                |
| Settings (⚙️): graphics quality + FPS cap apply & persist; effects toggles | ☐                | ☐                 | ☐                |
| `document.title` shows live BP                                             | ☐                | ☐                 | ☐                |
| Export / Import / Reset save (base64 code round-trips)                     | ☐                | ☐                 | ☐                |

## 3. Mobile / touch specifics

- [ ] Portrait & landscape: HUD readable, buttons ≥ 44 px tap targets.
- [ ] One-finger drag orbits the camera (`touch-action: none`), a quick tap twerks.
- [ ] No accidental page zoom / scroll (viewport `user-scalable=no`, `overflow: hidden`).
- [ ] **Safe area (B13b):** on a notched phone (or a simulated device with insets),
      the HUD, 🕺/🔊 buttons, hintbar, rival widget and shop panel are **not**
      clipped by the notch / rounded corners / home indicator (`viewport-fit=cover` + `env(safe-area-inset-*)`).
- [ ] Shop is full-width under 640 px (figure hidden while shopping is a known debt,
      B13a — bottom-sheet returns in M8).

## 4. Determinism / save integrity (spot checks)

- [ ] Crits are seeded (RNG in the save): export a save mid-run, reload, and the
      crit outcomes of the next clicks are identical to a fresh load of the same
      export (save-scumming a crit is impossible).
- [ ] An old v1 CH-save (pre-M7, no `rng`/`stats`/`legacyImported`) still loads —
      it migrates to v2 with a fresh seed, zeroed stats and no double legacy bonus.
- [ ] **Legacy inheritance (§9.2.3):** with an old `bootyclicker.save` present
      (`rebirths ≥ 1`), the first CH boot grants `7 · rebirths` Ruhm-Seelen once;
      a reload does **not** grant again.

## 5. Performance (Lighthouse)

Target: **Performance ≥ 85** (mobile preset) on the production build.

1. `npm run build && npm run preview`
2. Chrome DevTools → Lighthouse → Performance, Mobile → analyze the preview URL.
3. If below 85, try `Qualität: Niedrig` + `FPS-Limit: 30` in ⚙️ and re-measure; the
   low preset disables shadows and caps pixel ratio at 1.

Notes:

- No external requests (Three.js is bundled, audio is procedural, favicon is a
  data-URI) — first load is a single HTML + CSS + JS bundle.
- The leaderboard client is not wired in the CH MVP (returns in M13); there are no
  blocking network calls on boot.

## 6. Balancing / pacing (informal for M7)

The endless curve is data-driven and unit-tested (`combat.ts`, `heroes.ts`,
`ascension.ts`). Formal pacing targets (E1–E4, the §4.8 tables) become a CI gate
via `simulateEndless` from **M9**; until then, sanity-check by feel:

- Zone 10 (the "Goldener Twerk-Tyrann" boss) reachable in ~1–2 min of active play.
- Crew purchases (ROI-greedy) keep the frontier moving; a boss timeout should mean
  "farm the zone a bit", never a soft-lock.
- Active play (crits + combo) clearly out-paces pure idle — clicking is king (P1).

## 7. itch.io release

- [ ] `npm run build:itch`
- [ ] Extract `booty-clicker-itch.zip` locally and serve the folder over any static
      HTTP server (e.g. `python3 -m http.server`) — the game must boot and play with
      **no failed requests** (all asset paths are relative, `base: './'`).
- [ ] Upload the ZIP to itch.io as an HTML project, tick "This file will be played
      in the browser", set the viewport to ~960×640 (fullscreen enabled).

## 8. Cloudflare deploys

- [ ] Pages: on push to `main`, CI deploys `apps/game/dist` when
      `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets are present (skipped
      cleanly otherwise).
- [ ] Worker (leaderboard, optional, wired in M13): `cd apps/api && npx wrangler deploy`
      after provisioning the D1 database and KV namespace from `wrangler.toml`.
