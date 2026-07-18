# Booty Clicker — Test Plan (CH loop, Release 2.0 / M14)

Manual + automated release checklist for the endless Clicker-Heroes-style loop.
Automated coverage lives in the unit tests (`npm test`) and the headless smoke
scripts; this document covers the manual passes that can't be fully asserted in
CI (real browsers, touch input, performance). The consolidated **M14 CH-loop
manual matrix** (Bühnen · Bosse · Aszension · Himmelfahrt · Truhen/Loot ·
Mobile-Sheet · Retention/Meta · Bestenliste) and the documented **AC3 playthrough**
are in **§11 (M14)** at the end of this file.

> **Note on scope (N5 — no ghost features).** The old M0–M6 game (upgrade shop,
> single 50k-BP boss, additive rebirth at 100k, Golden Peach, skin/background
> picker, achievements UI, leaderboard client) is **intentionally gone** in the
> CH loop. Do **not** test for it. Per the spec Gap-Checklist (§2.3) every feature
> has since returned in CH form: skin/background choice **with buffs** (M11),
> chests/Golden Peach (M12), achievements/quests/daily/stats + leaderboard v2 (M13).
>
> **N4 legacy cleanup (M14, §11 #7 — done).** Now that the one-time legacy import
> (below) has shipped, the dead M0–M6 archive modules superseded by the CH
> equivalents were removed: `game/events.ts`, `game/boss.ts` (+ its dead-only
> importer `ui/boss.ts`) and `game/achievements.ts` (+ `ui/achievements.ts`,
> superseded by `game/ch-achievements.ts`) — with their tests. All were provably
> unreachable from the `main.ts` entry and every test; the game suite drops
> **500 → 480** tests accordingly. The **live** legacy save layer (`save/store.ts`,
> `save/migrate.ts`, `game/state.ts`) stays — the Erbe-Import still reads it.

## 1. Automated gates (run before every release)

- [ ] `npm run lint` — ESLint clean
- [ ] `npm run format:check` — Prettier clean
- [ ] `npm test` — all unit tests green (game + API workspaces). Current counts: **480** game (40 files) + **20** API. (Was 500 before the M14 N4 cleanup removed 20 legacy tests.)
- [ ] `npm run build` — type-checks and builds; bundle **< 5 MB** — currently **652.3 KB JS** (gzip 174.5 KB) + 25.0 KB CSS + 6.1 KB HTML ≈ **0.68 MB** total `dist`
- [ ] `npm run test:sim` — the full `simulateEndless` gate (E1/E2/**E3**/E4 + **E4-with-gear** + §4.8 pacing + first-Himmelfahrt window + **Float-Guard to Bühne 300**, full loot economy in the bot) is green — **39 tests** (also runs inside `npm test` + CI)
- [ ] Feature-flag guard: `flags.test.ts` asserts `TRANSCEND_ENABLED === false` (the Transzendenz scaffold can never leak into a shipped build)
- [ ] `npm run build:itch` — produces `apps/game/release/booty-clicker-itch.zip` (~178 KB) with `index.html` at the archive root

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

## 5. Performance (M14 perf-pass — §9.6 budget)

Target: **Performance ≥ 85** (Lighthouse mobile preset) on the production build.

**On a machine with Chrome + a real GPU:**

1. `npm run build && npm run preview`
2. Chrome DevTools → Lighthouse → Performance, Mobile → analyze the preview URL.
3. If below 85, try `Qualität: Niedrig` + `FPS-Limit: 30` in ⚙️ and re-measure; the
   low preset disables shadows and caps pixel ratio at 1.

### 5.1 M14 measured numbers (headless, `scratchpad/perf.mjs`)

Measured against `vite preview` with the preinstalled Chromium via playwright-core
(`--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader --no-sandbox`).
SwiftShader is a **software** GL — GPU frame times are **not** a valid 60-fps-laptop
proxy, so we report the **hardware-independent** metrics (draw-call count, JS
scripting cost, DOM node budget) rather than fake a Lighthouse score:

| §9.6 budget                              | Result                                                                                                                                                                 | Verdict |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Draw Calls **< 150**                     | **114 / frame** (counted by wrapping `drawArrays`/`drawElements`)                                                                                                      | ✅      |
| Particles **< 1 ms/frame** (Mess-AC)     | **~0.002 ms/frame** at full 200-slot occupancy (flat float loop in `engine/particles.ts`)                                                                              | ✅      |
| Popup-Pool **≤ 24 Nodes**                | **capped at exactly 24** during a 60-click burst, never exceeded (`POP_POOL_MAX`)                                                                                      | ✅      |
| No `innerHTML` rebuild in click hot-path | **clean** — `ChHud.update` is change-detected (`setText`), `Pops` recycles pooled nodes via `textContent`/`style`; all `innerHTML` lives in on-demand tab renders only | ✅      |
| Bundle **< 5 MB**                        | **0.68 MB** dist (652.3 KB JS / gzip 174.5 KB + 25 KB CSS + 6.1 KB HTML)                                                                                               | ✅      |

**12-cps stress** (60 synthetic clicks over 5 s on `#app`): mean click hot-path time
**~1.6 ms**, p50 **~1.3 ms**, one **~9–13 ms** outlier (coincides with the throttled
0.25 s full-HUD tick) — all well inside both the ~83 ms inter-click and the 16.7 ms
frame budgets. Zero console errors; gold advances. **Conclusion: hot-path is clean,
no code change was needed** in the perf pass.

**On real hardware, still verify by feel:** hold ~12 clicks/s with crits + particles
on the reference laptop and confirm a steady 60 fps in DevTools Performance (§10 has
the manual matrix).

Notes:

- No external requests (Three.js is bundled, audio is procedural, favicon is a
  data-URI) — first load is a single HTML + CSS + JS bundle.
- The leaderboard client (v2, `maxZone`) is wired in M13 but **fail-silent & default-off**:
  with no `VITE_API_BASE` there are **no** network calls at all on boot, the submit dialog
  shows an offline note, and the game is fully playable. A submit is offered only on a new
  best zone (skippable/remembered).

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

### M11 — Skins als Gear

Automated (unit + `test:sim` + headless smoke `smoke-ch.mjs`, now v6):

- Gear fold (`gear.test.ts`): **AC1** — `gearBonus` is pure over `gear`; skin buff·level +
  star·stars + kulisse fold deterministically; Diamant `allPct` hits every percentage stat
  but no absolute stat. **AC2** — ≥ 2 set bonuses covered (Studio 54, Retrowelle, Endless
  Summer, Void-Funk, Krönung); 🍬 ripens 1×/24 h with a backwards-clock **clamp** (never a
  negative timer/count). Economy (`shardCost`/`sugarCostForStar`/`craftCost`).
- Provisional craft (`gear.test.ts`): `craftSkin` spends `craftCost` 🧩, latches the id, and
  reads back as unlocked; refuses on too-few-🧩 / already-crafted / non-craft skin (same ref).
- Unlock context (`ch-state.test.ts`): **AC3** — `bossFirstKillZones` derives boss kills from
  `lifetimeMaxZone`; the **legacy `bossDefeated` latch** (`legacyTyrann`) unions zone 10 so
  Tyrann unlocks even at a shallow CH zone; `gearUnlockCtx` threads `gear.crafted` into
  `skinUnlocked` (Neon-Ninja/Pfirsich-Pirat).
- Save v6 (`ch-store.test.ts`): v5→v6 lossless (fresh gear default); gear round-trips
  (skin/level/star/shards/sugar/**crafted**); corrupt sub-fields repair in isolation
  (`"toString"`/junk/dupe crafted dropped) without nuking valid progress.
- Sim (`sim.test.ts`): **AC5** — E4 holds **with gear**: an active twerker with best-in-slot
  **click** gear (Klassiker lv 50 + 5★ ⇒ ×5.5) stays ≥ 8 zones ahead of an idler with
  best-in-slot **idle** gear (Robo-Twerk lv 50 + Space ⇒ ×4.05 crew DPS); observed gap ≈ 22.
  Both multipliers are **derived from the live catalog** through the real `gearBonus` fold,
  and a catalog **P1 guard** asserts max click mult > max idle mult (the review-pass
  rebalance: Klassiker +8 %/lv, Robo +6 %/lv — see DECISIONS.md). E1/E2/E3 + pacing stay green.
- Unlock permanence (`ch-state.test.ts`): a Himmelfahrt (which resets `lifetimeMaxZone` to 1)
  never re-locks zone/boss skins — `gear.zoneEver` latches the deepest zone ever reached and
  the unlock context floors with it.
- Headless (`smoke-ch.mjs`): the 🎽 tab opens; a skin card shows **rarity + buff + level +
  cost** (AC4); equipping a leveled Robo raises the **DPS HUD** immediately (AC1) and marks
  the card equipped; a manual kulisse pick (Space) persists `bg` + `bgAuto:false` and shifts
  DPS (+5 %); a `legacyTyrann` v6 save shows the **Tyrann card unlocked + equippable** (AC3).
  Zero page errors.

Manual passes (real device / browser):

- [ ] **Equip changes numbers.** In the 🎽 tab, equipping a non-classic skin swaps the 3D
      figure **and** shifts the DPS/Klick HUD instantly (e.g. Robo → DPS up; leveled Klassiker
      → Klick up); the active card is highlighted.
- [ ] **Level & Star.** Level-up spends 🧩 (`10·⌈1.25^lv⌉`, disabled when broke / at Lv 50);
      Star-up spends 🍬 (`star+1`, disabled when broke / at ★5); a 🍬 ripens once per 24 h
      (toast on ripen), and setting the clock **back** never yields a negative timer/count.
- [ ] **Kulisse chooser.** Club/Synth/Beach/Space fix the background + its mini-buff (auto-
      rotation stops); **„Auto (Tour)"** resumes the zone-tier rotation (default). The chosen
      kulisse survives a reload.
- [ ] **Set bonus.** A matching Skin × Kulisse (e.g. Disco-King + Club = „Studio 54") lists the
      active set + effect; a non-matching combo shows the „kein Set aktiv" hint.
- [ ] **Locked / craft states.** Zone/boss/Himmelfahrt-gated skins show their unlock hint;
      Neon-Ninja / Pfirsich-Pirat show a **Craft (🧩)** button (spending shards unlocks them);
      Diamant-Booty stays „ab Transzendenz". Every card still shows rarity/buff/level/cost.

### M12 — Pfirsich-Truhen & Loot

Automated (unit + headless smoke `smoke-ch-m12.mjs` (glue) + `smoke-ch-m12ui.mjs` (UI), v7):

- Loot engine (`chests.test.ts`): **AC1** — `openChest` deterministic (same seed ⇒ same loot)
  - χ²-tolerance distribution over 10 000 draws; **AC2** — pity edge exact (11 misses ⇒ the
    12th Gold hits) + Luck monotonicity (row 0 strictly down, others up); duplicate protection
    (jackpot dupe → fixed 🧩, never „nothing").
- Peach (`peach.test.ts`): seeded `rollNextPeachAt` window, ×3 boost / 60 s, 25 % → 1 🔑.
- Save v7 (`ch-store.test.ts`): **AC4** — v6→v7 lossless (fresh loot/token/peach defaults);
  `chests {keys,inventory,pity,skins}` + `permTokens` + `peach` round-trip; corrupt loot
  sub-fields repair in isolation (never a fresh-start).
- Headless glue (`smoke-ch-m12.mjs`): loot glue exposed; a boss kill grants ≥ 1 🔑 + a
  tier-appropriate chest (persisted); `chLoot.open` returns a reward, consumes the chest,
  credits + persists; open with no key/chest is a no-op; catching a peach activates the ×3
  boost + reschedules. Zero page errors.
- Headless UI (`smoke-ch-m12ui.mjs`): **AC3** — the 🎁 tab shows the transparent loot tables
  (≥ 20 weighted rows, **all as %**); opening a chest plays the animation overlay and a **tap
  skips** straight to the reward cards (which carry captions); the chest is consumed. **No
  purchase/real-money words** anywhere in the tab (§6.3.3). **AC4/B13c** — at 390 px the 🍑
  **despawns** while the bottom-sheet is open and reappears when it closes; after a resize the
  peach position stays **clamped inside the viewport**; clicking the on-screen 🍑 activates the
  ×3 boost and shows the „×3 Boost" HUD badge. Zero page errors.
- **AC5 — no real-money / network loot path.** Verified: keys/chests are earned only (boss/
  rival/combo/peach faucets in `main.ts`); the 🎁 tab has open-only actions (no buy button, no
  price, no `€`/`$`); `openChest`/`peach` roll purely from the seeded RNG. The only network
  feature in the whole app is the optional, fail-silent leaderboard (maxZone) — it carries no
  loot. The UI smoke asserts the tab text contains no purchase words.

Manual passes (real device / browser):

- [ ] **Open a chest.** In the 🎁 tab, an **Öffnen** button is enabled only when the tier's
      count ≥ 1 **and** you hold enough 🔑 (cost shown: Holz gratis / Gold 1 / Diamant 3 /
      Mythos 10). Opening plays a ~1.2 s wackeln → aufspringen → reward-card animation.
- [ ] **Skip the animation.** A tap/click on the animation jumps straight to the reward cards;
      a second tap closes it. Keys/inventory/pity update afterwards.
- [ ] **Transparent odds.** Each tier has a collapsible drop-table listing every reward row
      with its **% weight** (Gold sums 30/25/22/10/8/3/2); the token pool is named per tier.
- [ ] **No purchase path.** Nothing in the tab buys 🔑/chests for money or implies it; the
      header states „ausschließlich erspielbar — kein Kauf".
- [ ] **Golden Peach.** A floating 🍑 appears every ~90–240 s (~8 s window); catching it grants
      ×3 income for 60 s (HUD „×3 Boost" badge) + a 25 % 🔑 chance.
- [ ] **Peach on mobile (B13c).** The 🍑 stays fully on-screen on spawn **and** after rotating /
      resizing (never under the notch); it **disappears** while the shop bottom-sheet is open on
      a narrow screen, and returns when the sheet closes.
- [ ] **Header & collection.** The 🎁 header shows the 🔑 balance, owned permanent tokens (with
      their +Krit/+Gold/+DPS effect) and the collected Truhen-Skins (n/11); a duplicate jackpot
      pays 🧩 instead.

### M13 — Meta, Retention & Leaderboard v2

Automated (unit + headless smoke `smoke-m13.mjs`, save v8):

- Quests/Daily (`quests.test.ts`): **AC1** — `dailyQuests(day)` deterministic (same date ⇒
  same 3 distinct quests), reroll shifts the seed, `reroll` refused past `MAX_REROLLS`;
  clock-manipulation neutral (backward day never re-rolls, re-grants a login, or re-claims a
  quest). **AC2** — streak-protect covers exactly a gap-2 day, once per calendar week; gap ≥ 3
  breaks; day-7 pays diamond + 2 🔑, then wraps to 1.
- Achievements (`ch-achievements.test.ts`): `newlyUnlocked` fires each predicate once;
  zone gate reads the Himmelfahrt-safe deepest zone (`gear.zoneEver`) so a Himmelfahrt never
  un-earns a milestone.
- Stats view (`stats-view.test.ts`): **AC5** — lifetime bucket monotonic across ascension +
  Himmelfahrt; run bucket resets with the tour; on-beat quote in [0, 1].
- Season (`season.test.ts`): October ⇒ Spooky Booty, December ⇒ Frost-Twerk, else null; total.
- Leaderboard client (`leaderboard-client.test.ts`): fail-silent (`null` on error/timeout/
  non-2xx/invalid nick/disabled); disabled ⇒ **no** fetch; upsert payload shape.
- Worker v2 (`apps/api/src/index.test.ts`): **AC3** — upsert per nickname replaces only on a
  larger `maxZone`; rate-limit enforced (in-memory fakes).
- Headless glue (`smoke-m13.mjs`): fresh boot rolls **3 quests**, grants the **daily login**
  (gold chest, streak 1/7), renders the achievement wall; a near-complete „clicks" quest
  **advances on one shake** and is **claimable** (claim credits the reward + records it); the
  ⚙️ **📊 Statistik** renders both lifetime and run rows (Bestzone, On-Beat-Quote, Spielzeit,
  Aktuelle Bühne); **all 8 tabs** are clickable and reveal their body; **AC4** — with no
  `VITE_API_BASE` the „Eintragen" dialog shows an **offline note** + disabled send, and Top-50
  shows an offline message. **Zero page errors.**

Manual passes (real device / browser):

- [ ] **📋 tab — Daily.** The streak shows n/7 with a day-7 💎 indicator; the first boot of a
      new (UTC) day grants a chest (💎 + 2 🔑 on day 7) via a toast; a missed single day is
      caught by the weekly Streak-Schutz (toast „Serie gerettet 🛡").
- [ ] **📋 tab — Quests.** Three quests each show a description, reward, and a progress bar;
      completing one reveals **Einlösen** (credits the reward, then „Eingelöst ✓"); **Neu
      würfeln** works once, then disables („Reroll heute verbraucht").
- [ ] **📋 tab — Erfolge.** The wall shows locked (🔒) / unlocked cards with a count; a new
      unlock toasts „Erfolg freigeschaltet!" and flips the card.
- [ ] **📊 Statistik (⚙️).** Lifetime totals (BP, Shakes, Krits, On-Beat-Quote, höchste Combo,
      Boss-Kills/-Timeouts, Bestzone, Aszensionen/Himmelfahrten, RS/HPF, Truhen, Spielzeit) are
      separate from the current-run rows and correct across a prestige.
- [ ] **8-tab layout.** All eight emoji tabs (🕺 🎽 🌀 ✨ 🌈 🎁 📋 ⚙️) stay reachable at 320 px
      (the row scrolls horizontally if needed); none shrinks out of reach.
- [ ] **Leaderboard (off).** With no `VITE_API_BASE`, „Eintragen" shows the offline note and a
      disabled send; „Top 50" shows the offline message; nothing throws; the game is fully
      playable.
- [ ] **Leaderboard (on).** With `VITE_API_BASE` set, reaching a **new best zone** offers a
      skippable submit (validated nickname → rank), only once per record; „Top 50" lists rows.
- [ ] **Season.** In October/December a banner + boot toast appears in the 📋 tab; no gameplay
      is gated behind the date.

## 11. M14 — Endless-QA, Transzendenz-Gerüst & Release 2.0

Automated (this milestone):

- **`simulateEndless` full suite (CI gate, `npm run test:sim` — 39 tests).** Runtime
  < 10 s, deterministic (same seed ⇒ identical run/economy). E1 no hard cap · E2
  bounded soft wall · **E3** ≤ 90 min per +50 % power over 20 ascensions · **E4**
  active ≥ 8 zones ahead of casual (and with best-in-slot **click** gear ≥ 8 ahead of
  best-in-slot **idle** gear, + a catalog P1 guard) · §4.8 pacing table (±25 %) · first
  Himmelfahrt in the 5–9 h ±25 % window · **Float-Guard to Bühne 300** (HP ~1e63; every
  tracked magnitude finite & < 1e300, AC4). The full M12 loot economy runs inside the
  bot (peach/keys/chests/tokens/shards→gear).
- **Transzendenz scaffold (`transcend.test.ts` 12 + `flags.test.ts` 3).** Pure formulas:
  `TE = ⌊log10 HPF_life⌋` (0 below the 100-HPF gate), `×3^TE` global mult (P1-neutral),
  held-vs-spent accounting, `bankTranscendence` never double-grants. The flag guard
  asserts `TRANSCEND_ENABLED === false` — the layer is **off** in every shipped build.
- **N4 cleanup:** the removed legacy modules (events/boss/achievements + dead UI) are
  gone; the remaining suite stays green at **480** game tests.

### 11.1 CH-loop manual matrix (Bühnen · Bosse · Aszension · Himmelfahrt · Truhen · Mobile-Sheet · Meta)

Run `npm run preview` (or serve the itch ZIP) and walk the full loop once end-to-end:

| Surface                       | Manual check                                                                                                                                                                                                                                                                                          | ☐   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| **Bühnen (zone progression)** | Kill 10 rivals → zone advances; HP scales up (`10·1.6^(z-1)`); zone/kill counter in HUD is correct; backdrop rotates every 10 zones (club→synth→beach→space)                                                                                                                                          | ☐   |
| **Bühnen — Farmen/Reisen**    | `◀ Bühne ▶` farms cleared zones, `⏫ Front` returns to the frontier; you can never travel past your deepest zone; HUD shows „🌾 Farmen · Front: Bühne N" below the frontier                                                                                                                           | ☐   |
| **Bosse (timer)**             | Every 5th zone is a boss with a 30 s timer; the timer bar turns **urgent** < ~34 %; a timeout does **not** soft-lock — farm the zone and re-challenge                                                                                                                                                 | ☐   |
| **Bosse (finale/reward)**     | A boss kill toasts „Boss besiegt!" with a tier chest + **≥ 1 🔑** + 🧩; boss-kill shake + jingle fire; `bossStreak`/`maxBossStreak` count (📊 stats)                                                                                                                                                  | ☐   |
| **Vergoldung 🏅**             | The **first** clear of each 10-zone gilds a seeded crew member (+25 % DPS, permanent); survives an ascension; fires the „Vergoldung" quest once                                                                                                                                                       | ☐   |
| **Aszension ✨**              | At ≥ Bühne 10 the ✨-tab previews „+X Seelen"; ascending resets the run (zone→1, crew empty, gold 0) and banks Ruhm-Seelen (+10 %/held soul); held souls carry, spent-on-Ahnen stays spent                                                                                                            | ☐   |
| **Ahnen 🌀**                  | Buying a Twerk-Ahne spends **held** souls and applies its perk; capped ancients show „Max erreicht"; % ancients are uncapped (the endless soul sink)                                                                                                                                                  | ☐   |
| **Himmelfahrt 🌈**            | At ≥ 1 000 RS lifetime the 🌈-tab previews „+X HPF"; arm→confirm banks HPF and resets RS/Ahnen/tour; **Vergoldungen, HPF & Himmelsbaum survive**; HUD shows „🍑 X HPF" and the soul-% + global damage rise with HPF (compounding)                                                                     | ☐   |
| **Himmelsbaum**               | Buying Twerk-Coach spawns an auto-clicker (1→4 cps @ 25 % click, idle **and** offline); Nachtschicht raises the offline cap (8→16→24 h)                                                                                                                                                               | ☐   |
| **Gear 🎽**                   | Equipping a non-classic skin swaps the 3D figure **and** shifts DPS/Klick instantly; level (🧩) / star (🍬) buttons gate on balance & cap; a 🍬 ripens 1×/24 h (backwards clock never yields a negative timer); set bonuses list on a matching Skin×Kulisse                                           | ☐   |
| **Truhen/Loot 🎁**            | Öffnen is enabled only with count ≥ 1 **and** enough 🔑 (Holz 0 / Gold 1 / Diamant 3 / Mythos 10); a skippable ~1.2 s animation → reward cards; keys/inventory/pity update; **drop tables show every weight as %**; header states „ausschließlich erspielbar — kein Kauf" (no `€`/`$`, no buy button) | ☐   |
| **Golden Peach 🍑**           | A floating 🍑 appears every ~90–240 s (~8 s window); catching it gives ×3 income/60 s (HUD „×3 Boost" badge) + 25 % 🔑; on a narrow screen it **despawns** under the open bottom-sheet and stays **clamped** in the viewport after a resize/rotate                                                    | ☐   |
| **Mobile-Sheet (B13a)**       | Under 640 px the shop is a bottom sheet (~55 vh) — figure + rival HP stay visible while shopping; the 🕺 toggle stays reachable above it; safe-area insets (B13b) leave nothing clipped by the notch                                                                                                  | ☐   |
| **Retention/Meta 📋**         | Daily login streak (1–7) grants a chest each day (💎 + 2 🔑 on day 7); weekly Streak-Schutz catches one missed day; 3 date-seeded quests with progress + **Einlösen**; 1×/day **Neu würfeln**; achievement wall (locked/unlocked) survives ascension + Himmelfahrt; clock-rollback grants nothing     | ☐   |
| **Bestenliste**               | With **no** `VITE_API_BASE`: „Eintragen" shows an offline note + disabled send, „Top 50" shows an offline message, nothing throws, the game is fully playable. With an API set: a **new best zone** offers a skippable submit once per record; „Top 50" lists rows                                    | ☐   |
| **Save/offline**              | Autosave + reload restores progress (CH-save **v8**); offline-earnings dialog on boot after being away; tab-return grant (B5); Export/Import/Reset base64 round-trips                                                                                                                                 | ☐   |
| **Transzendenz (flag OFF)**   | There is **no** Transzendenz tab/button/HUD in the shipped build — the layer is scaffold-only behind `TRANSCEND_ENABLED = false` (Diamant-Booty still reads „ab Transzendenz" as a locked hint only)                                                                                                  | ☐   |

### 11.2 AC3 — documented playthrough (fresh save → 3 Aszensionen → 1 Himmelfahrt)

Driven through the **real** economy (`simulateAscensionEra`) + the **real** prestige
formulas (`soulsForMaxZone`, `hpfForRsLifetime`), seed 7 — these are observed numbers,
not invented. (Repro: a throwaway vitest that calls `simulateAscensionEra` at
`maxAscensions` 1/2/3 and reads `maxBestZone`; souls = `soulsForMaxZone(zone)`,
HPF = `hpfForRsLifetime(RS)`.)

| Step              | Bühne (best) | RS lifetime |   HPF | Notes                                                                                                                  |
| ----------------- | -----------: | ----------: | ----: | ---------------------------------------------------------------------------------------------------------------------- |
| Fresh save        |            1 |           0 |     0 | zone 1, no souls, no HPF                                                                                               |
| **Aszension 1**   |           60 |         320 |     0 | first bank of Ruhm-Seelen                                                                                              |
| **Aszension 2**   |           75 |       1 295 |     0 | crosses the 1 000-RS Himmelfahrt gate (first Himmelfahrt now possible, ~t=1145 s sim time)                             |
| **Aszension 3**   |           80 |       2 074 |     0 | MaxPower ≈ 2.1e16 DPS — all magnitudes finite, far under the float ceiling                                             |
| **Himmelfahrt 1** |    reset → 1 |   reset → 0 | **1** | `hpfForRsLifetime(2074)=⌊√2.074⌋=1`; L1 resets, HPF (+2 % global + soul amplifier), Vergoldungen & Himmelsbaum persist |

Interpretation: souls compound with depth (`⌊z^1.6/40⌋+⌊1.10^z−1⌋`), each ascension
reaches a deeper frontier, and the first Himmelfahrt banks its first HPF — the full
Ascension → Himmelfahrt chain produces real, monotonic numbers. The counts are
sim-driven (not wall-clock hours); AC3 is a functional demonstration of the chain.
