# AGENTS.md — Booty Clicker

Working guide for coding agents on this repo. The **authoritative product &
engineering spec** (milestones M0–M6, tech stack, architecture rules, API
contract, Definition of Done) lives in [`booty-clicker-spec.md`](./booty-clicker-spec.md).
Read it first. This file captures the operating rules; the spec captures the plan.

## Golden rules

1. **Milestones are strictly sequential** (M0 → M6). A milestone is done only when
   every acceptance criterion is met and `npm run build` + `npm test` are green.
2. **The prototype is ported, not rewritten.** `legacy/index.html` is the read-only
   reference. Preserve behaviour 1:1, then extend.
3. **Data, not code, for balancing** (spec §4.3): upgrades, skins, backgrounds,
   achievements and moves are typed config arrays.
4. **One versioned `GameState`** (spec §4.2): serializable, `schemaVersion`, every
   structural change ships a migration + test.
5. **Fail-silent netcode** (spec §4.4): the leaderboard must never block play.
6. **No real people** as skins/names/models — not even on request (spec §4.5).
7. Log every non-obvious decision in [`DECISIONS.md`](./DECISIONS.md).

## Repository layout

```
booty-clicker/
├─ apps/
│  ├─ game/          # Vite + TypeScript (strict) game client
│  │  ├─ index.html
│  │  └─ src/
│  │     ├─ main.ts        # bootstrap + loop
│  │     ├─ engine/        # renderer, camera (OrbitControls), lights, env
│  │     ├─ character/     # rig, skins, physics (cheek soft-body)
│  │     ├─ choreo/        # dance moves + blender
│  │     ├─ world/         # backgrounds (club, synth, beach, space)
│  │     ├─ game/          # economy, upgrades, achievements, boss, events
│  │     ├─ save/          # store, versioned schema, migrate
│  │     ├─ audio/         # engine, sfx, music
│  │     ├─ ui/            # hud, shop, settings, toasts, boss-ui
│  │     └─ net/           # leaderboard client (fail-silent)
│  └─ api/           # Cloudflare Worker (Hono) — leaderboard, built in M5
├─ legacy/index.html # prototype, read-only reference
├─ booty-clicker-spec.md
├─ DECISIONS.md
└─ .github/workflows/ci.yml
```

## Commands

| Command                           | What it does                                                     |
| --------------------------------- | ---------------------------------------------------------------- |
| `npm install`                     | Install workspace deps (root + apps/game).                       |
| `npm run dev`                     | Vite dev server for the game (HMR).                              |
| `npm run build`                   | Type-check + production build (`apps/game/dist`, budget < 5 MB). |
| `npm test`                        | Vitest unit tests.                                               |
| `npm run lint`                    | ESLint across the repo.                                          |
| `npm run format` / `format:check` | Prettier write / check.                                          |

## Conventions

- TypeScript **strict**; no `any` without an inline justification comment.
- ESLint + Prettier are **CI-enforced** — run `npm run format` before committing.
- Fixed-timestep simulation (120 Hz) stays decoupled from the render loop.
- Keep `main` playable at all times (trunk-based, small changes).
