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
- [ ] `npm run build` — type-checks and builds; bundle **< 5 MB** (currently ~594 KB JS / ~156 KB gzip; +~11 KB for M10 Ahnen/Himmel)
- [ ] `npm run test:sim` — the `simulateEndless` gate (E1/E2/**E3**/E4 + §4.8 pacing + first-Himmelfahrt window) is green (also runs inside `npm test` + CI)
- [ ] `npm run build:itch` — produces `apps/game/release/booty-clicker-itch.zip` with `index.html` at the archive root

## 2. Browser matrix (manual smoke)

Run `npm run preview` (or serve the itch ZIP) and verify on each target:

| Check                                                                                                   | Chrome (desktop) | Firefox (desktop) | Android (Chrome) |
| ------------------------------------------------------------------------------------------------------- | ---------------- | ----------------- | ---------------- |
| Loads to first frame; loading screen fades out                                                          | ☐                | ☐                 | ☐                |
| Onboarding coach marks appear on first run, then never again                                            | ☐                | ☐                 | ☐                |
| Click / tap the figure = twerk → rival HP drops (damage popup)                                          | ☐                | ☐                 | ☐                |
| Spacebar twerks; **held** spacebar does NOT autofire (one shake)                                        | ☐                | ☐                 | n/a              |
| Camera orbit (drag) does **not** register as a shake                                                    | ☐                | ☐                 | ☐                |
| Crits (~20 %) show a bigger, golden, rotated "CRIT" popup + stronger shake                              | ☐                | ☐                 | ☐                |
| Combo climbs + names tiers (Warm/Heiß/Feuer/Inferno); **soft-decays** after ~1.5 s idle (no reset to 0) | ☐                | ☐                 | ☐                |
| Crew shop (🕺): recruit/level members ×1 / ×10 / Max; DPS ticks rivals                                  | ☐                | ☐                 | ☐                |
| Clearing 10 rivals advances the zone; HP scales up (endless)                                            | ☐                | ☐                 | ☐                |
| Every 5th zone = boss with a 30 s timer; timeout → farm & retry (no lock)                               | ☐                | ☐                 | ☐                |
| Backdrop rotates every 10 zones (club → synth → beach → space)                                          | ☐                | ☐                 | ☐                |
| Ascend (✨ Ruhm): resets the run, banks Ruhm-Seelen, +10 %/soul                                         | ☐                | ☐                 | ☐                |
| Ascension preview shows "+X Seelen" before the reset                                                    | ☐                | ☐                 | ☐                |
| Ahnen (🌀): buy a Twerk-Ahne → held souls drop, perk applies; capped ancients lock at cap               | ☐                | ☐                 | ☐                |
| Himmel (🌈): Himmelfahrt preview shows "+X HPF"; arm→confirm banks HPF, resets RS/Ahnen/tour            | ☐                | ☐                 | ☐                |
| Himmelsbaum: buy Twerk-Coach → an auto-clicker ticks rivals idle (1→4 cps)                              | ☐                | ☐                 | ☐                |
| Held HPF: HUD shows "🍑 X HPF"; soul-% and global damage rise with HPF (compounding)                    | ☐                | ☐                 | ☐                |
| Audio starts after first gesture; mute button persists                                                  | ☐                | ☐                 | ☐                |
| Autosave + reload restores progress                                                                     | ☐                | ☐                 | ☐                |
| Offline earnings dialog on boot after being away                                                        | ☐                | ☐                 | ☐                |
| Tab-return grant: switch tab ~1 min, return → BP credited (B5)                                          | ☐                | ☐                 | ☐                |
| Settings (⚙️): graphics quality + FPS cap apply & persist; effects toggles                              | ☐                | ☐                 | ☐                |
| `document.title` shows live BP                                                                          | ☐                | ☐                 | ☐                |
| Export / Import / Reset save (base64 code round-trips)                                                  | ☐                | ☐                 | ☐                |

## 3. Mobile / touch specifics

- [ ] Portrait & landscape: HUD readable, buttons ≥ 44 px tap targets.
- [ ] One-finger drag orbits the camera (`touch-action: none`), a quick tap twerks.
- [ ] No accidental page zoom / scroll (viewport `user-scalable=no`, `overflow: hidden`).
- [ ] **Safe area (B13b):** on a notched phone (or a simulated device with insets),
      the HUD, 🕺/🔊 buttons, hintbar, rival widget and shop panel are **not**
      clipped by the notch / rounded corners / home indicator (`viewport-fit=cover` + `env(safe-area-inset-*)`).
- [ ] **Bottom-sheet (B13a, M8):** under 640 px the shop is a bottom sheet (~55 vh) —
      the figure + rival HP widget stay visible while shopping (verified headlessly,
      see §8; screenshot `m8-bottomsheet.png`). The 🕺 toggle stays reachable above it.

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

## 9. M8 — Klick-Juice 2.0

Automated (unit): combo tiers + soft-decay (`combo.test.ts`: `decay(100,1)=80`,
never resets to 0), Tier-2 `+3 %` crit chance (seeded), on-beat window ±100 ms via
phase injection (`click.test.ts`), Ekstase charge/×10/12 s + v3 reload round-trip
(`ability.test.ts`, `ch-store.test.ts`), popup pool ≤ 24 nodes + 1-pop/80 ms batcher
(`pops.test.ts`), haptics ≤ 10×/s throttle (`haptics.test.ts`), shake/particle data
(`juice.test.ts`). Headless smoke: `scratchpad/smoke-m8.mjs` (fresh boot, no errors,
click earns BP, ability meter fills, combo reaches a tier, bottom-sheet layout).

Manual passes (real device / browser):

- [ ] **Combo tiers.** Fast clicking lights up Warm → Heiß → Feuer → Inferno with
      colour/pulse; stopping bleeds stacks down gradually (not instantly to 0).
- [ ] **On-beat.** Clicking on the clap (♪ popup + golden flash) hits harder; the
      tempo rises with the drive so the rhythm speeds up as you click faster.
- [ ] **Twerk-Ekstase.** The bottom meter fills with clicks (faster on-beat); `F` or
      the button at full fires 12 s of ×10 damage with its own music/shake; reload
      **mid-frenzy** keeps the remaining window.
- [ ] **Popup pool ≤ 24 nodes.** During a 12-cps burst, `document.querySelectorAll('.pop').length`
      never exceeds 24; damage pops batch into "-… ×n" instead of one-per-click.
- [ ] **12-cps stress @ 60 fps.** Hold ~12 clicks/s with crits + particles on the
      reference laptop; DevTools Performance shows a steady 60 fps and particle work
      < 1 ms/frame (burst = 8 + tier·6 ≤ 32, well inside the 200-particle pool; no
      pool growth needed). No `innerHTML` rebuild in the click hot-path (HUD is
      change-detected; the crew tab only re-renders on the 0.25 s tick).
- [ ] **Haptics toggle.** On a device with a vibration motor, clicks buzz (8 ms,
      throttled ≤ 10×/s), crits 35 ms, boss-kills the `[20,30,60]` pattern; the ⚙️
      "Vibration" toggle silences it; iOS is a silent no-op (no error).
- [ ] **Effects-off = MVP look.** Turning Screen-Shake / Partikel / Vibration off in
      ⚙️ removes each effect independently; music intensity follows mute.
- [ ] **Bottom-sheet (§3).** On a phone width the shop is a bottom sheet; the figure
      and rival stay visible while shopping.

## 10. M9 — Endless-Skalierung (Anti-Plateau)

Automated (unit): RS_v2 retune (`ascension.test.ts`: §4.5.1 table z40→53/z50→129/
z100→13818, +5 ⇒ ≥ ×1.3 for z ≥ 40, bank never shrinks); endless milestones
(`heroes.test.ts`: `milestoneMult(1600)=2⁸`, `(3200)=2⁹`; `bulkCost`/`maxAffordable`
exact for the 5 new tiers vs. an iterative sum); gilds (`gild.test.ts`: seeded target
determinism, award only on a fresh 10-zone, reassign 5 RS, ×1.25^n DPS fold); gild
survives ascension + `rsLifetime` highwater (`ch-state.test.ts`); CH-save **v4**
lossless v3→v4 + gild/rsLifetime repair (`ch-store.test.ts`); travel clamp
(`sim.test.ts`: `travelTo` never leaves 1..maxZone). The `simulateEndless` gate
(`sim.test.ts`, `npm run test:sim`): pacing (zone ≥ 75 & bank ≥ 500 RS in ≤ 6 runs),
E1 (deeper state reachable), E2 (bounded soft wall), E4 (active ≥ 8 zones ahead of
casual), determinism, self-runtime < 10 s. Headless smoke: `scratchpad/smoke-ch.mjs`
(gild toast + banked gild on the zone-10 first clear; ascension banks RS_v2(50)=129).

Manual passes (real device / browser):

- [ ] **Deeper crew.** The 🕺-tab reveals the 5 new tiers (Viral-Video-Team →
      Kosmische Twerk-Entität) as BP allows; milestone bars keep counting past Lv 800.
- [ ] **Gilds 🏅.** The first clear of a 10-zone (10, 20, 30, …) pops a „Vergoldung!"
      toast and a 🏅×n badge appears on a crew member (permanent ×1.25 DPS); the badge
      and the DPS survive an ascension.
- [ ] **Farming/travel.** The `◀ Bühne ▶` stepper farms cleared zones; `⏫ Front`
      returns to the frontier; you can never travel past your deepest zone; the HUD
      shows „🌾 Farmen · Front: Bühne N" while below the frontier.
- [ ] **RS_v2 feel.** Ascension previews a much larger „+X Seelen" at depth than the
      old curve (e.g. Bühne 50 → +129), and a new best zone visibly multiplies the bank.

### M10 — Ahnen & Ruhmes-Himmelfahrt (Schicht 2)

Automated (unit + `test:sim` + headless smoke `smoke-ch.mjs`, now v5):

- Souls held-balance/additive-earn refactor (`ascension.test.ts`): buying an Ancient
  spends held souls without ascension refunding them; `pendingSouls` gates on
  `rsLifetime`.
- Ancients (`ancients.test.ts`): **AC1** — a purchase lowers `soulMult` (spends souls)
  and raises the perk; caps enforced (buying past a cap is rejected/clamped).
- Heaven (`heaven.test.ts`): **AC3** — `HPF(1000)=1`, `HPF(1e6)=31`; the soul amplifier
  multiplies (not adds); tree costs/levels; coach damage. **AC5** (offline half) in
  `ch-store.test.ts`: a coach earns offline with zero crew DPS (injected clock).
- Himmelfahrt reset scope (`ch-state.test.ts`): **AC2** exact snapshot — RS + Ancients
  fall; gilds, HPF and the Himmelsbaum survive.
- Save v5 (`ch-store.test.ts`): v4→v5 lossless; corrupt ancients/heaven ⇒ defaults.
- Sim (`sim.test.ts`): **E3** ≤ 90 min per +50 % power over 20 ascensions; **AC4** first
  Himmelfahrt in the 5–9 h ±25 % window; E1/E2/E4 + pacing stay green.

Manual passes (real device / browser):

- [ ] **Ahnen 🌀.** Buying a Twerk-Ahne drops held Ruhm-Seelen and applies its perk
      (e.g. Twerkules → click damage rises); capped ancients show „Max erreicht".
- [ ] **Himmelfahrt 🌈.** At ≥ 1 000 RS lifetime the 🌈-tab previews „+X HPF"; arm→confirm
      banks the HPF and resets RS/Ahnen/tour, while gilds + HPF + Himmelsbaum persist.
- [ ] **Himmelsbaum.** Buying Twerk-Coach spawns an auto-clicker (1→4 cps at 25 % click);
      Nachtschicht raises the offline cap; the HUD shows held „🍑 X HPF".
