# Booty Clicker — Agent Implementation Spec

> Zielgruppe dieses Dokuments: autonome Coding-Agents (z. B. Claude Code).
> Arbeite die Milestones **strikt in Reihenfolge** ab. Ein Milestone gilt erst als fertig,
> wenn alle Acceptance Criteria erfüllt sind und `npm run build` + `npm run test` grün sind.
> Bei Unklarheiten: konservativ entscheiden, Entscheidung als Kommentar in `DECISIONS.md` dokumentieren.

---

## 1. Produktziel

Browser-basiertes Joke-Clicker-Game ("Booty Clicker") mit 30–60 min Playtime.
Kernloop: Klicken → Booty Points (BP) → Upgrades/Skins/Kulissen kaufen → Boss-Finale.
Ton: humorvoll, überdreht, aber technisch sauber. Keine echten Personen als Charaktere.
Release-Ziel: itch.io (HTML5, "play in browser") + Cloudflare Pages als Mirror.

Referenz-Implementierung: `legacy/index.html` (bestehender Prototyp mit Rig,
Choreografie-System, Feder-Dämpfer-Physik, 5 Skins, 4 Kulissen, 7 Upgrades).
Der Prototyp wird **portiert, nicht weggeworfen**: Logik in Module zerlegen,
Verhalten 1:1 erhalten, dann erweitern.

## 2. Tech-Stack (verbindlich)

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Sprache | TypeScript (strict) | Agent-freundlich, Refactor-sicher |
| Build | Vite | Zero-Config, HMR, statischer Output |
| 3D | Three.js (aktuelle Version, npm-Paket, kein CDN) | bereits im Prototyp; OrbitControls aus `three/examples` nutzen statt Eigenbau |
| State | Zustand (Store) ohne Framework; UI in Vanilla TS + CSS | Kein React/Angular — Spiel-UI ist klein, Overhead vermeiden |
| Audio | Web Audio API direkt (kein Howler) | Beat-Sync braucht Low-Level-Kontrolle |
| Tests | Vitest (Unit: Ökonomie, Save-Migration, Physik-Step) | schnell, Vite-nativ |
| Lint/Format | ESLint + Prettier, CI-enforced | Konsistenz über Agent-Sessions |
| Backend | Cloudflare Worker (Hono) — **nur** für globales Leaderboard | Spiel bleibt offline-fähig; Worker ist optional zuschaltbar |
| Datenbank | Cloudflare D1 (SQLite) | eine Tabelle reicht, kostenlos, kein Ops-Aufwand |
| Hosting | Cloudflare Pages (Frontend) + Worker (API); itch.io als ZIP-Export | Free Tier, CI via GitHub Actions |
| Saves | `localStorage` (primär), Export/Import als Base64-String | kein Account-System — bewusste Entscheidung, hält Scope klein |

**Explizit NICHT bauen:** Accounts/Auth, Multiplayer, Payments, Analytics-SDKs, Cookies (→ kein Consent-Banner nötig; Leaderboard speichert nur Nickname + Score).

## 3. Repository-Struktur

```
booty-clicker/
├─ AGENTS.md                  # dieses Dokument
├─ DECISIONS.md               # Log der Agent-Entscheidungen
├─ package.json
├─ apps/
│  ├─ game/                   # Vite-Projekt
│  │  ├─ index.html
│  │  ├─ src/
│  │  │  ├─ main.ts           # Bootstrap, Loop
│  │  │  ├─ engine/           # renderer.ts, camera.ts, lights.ts, env.ts
│  │  │  ├─ character/        # rig.ts, skins/*.ts, physics.ts (Cheek-Softbody)
│  │  │  ├─ choreo/           # moves.ts, blender.ts
│  │  │  ├─ world/            # backgrounds/*.ts (club, synth, beach, space)
│  │  │  ├─ game/             # economy.ts, upgrades.ts, achievements.ts, boss.ts, events.ts
│  │  │  ├─ save/             # store.ts, schema.ts (versioniert), migrate.ts
│  │  │  ├─ audio/            # engine.ts, sfx.ts, music.ts
│  │  │  ├─ ui/               # hud.ts, shop.ts, settings.ts, toasts.ts, boss-ui.ts
│  │  │  └─ net/              # leaderboard-client.ts (fetch, fail-silent)
│  │  └─ public/              # Sounds (CC0), Favicon, OG-Image
│  └─ api/                    # Cloudflare Worker (Hono)
│     ├─ src/index.ts
│     ├─ schema.sql
│     └─ wrangler.toml
├─ legacy/index.html          # Prototyp, read-only Referenz
└─ .github/workflows/ci.yml   # lint, test, build; deploy auf main
```

## 4. Architektur-Regeln

1. **Fixed-Timestep-Simulation (120 Hz)** getrennt vom Render-Loop — wie im Prototyp. Ökonomie-Ticks (BP/s) im selben Step.
2. **Ein zentraler GameState** (`save/store.ts`), serialisierbar, versioniert (`schemaVersion`). Jede Struktur-Änderung ⇒ Migration in `migrate.ts` + Test.
3. **Daten statt Code:** Upgrades, Skins, Kulissen, Achievements, Moves als typisierte Config-Arrays. Balancing-Änderungen dürfen nie Logik-Änderungen erfordern.
4. **Fail-silent Netcode:** Leaderboard-Fehler dürfen das Spiel nie blockieren (Timeout 3 s, dann UI-Hinweis "offline").
5. **Keine echten Personen** als Skins/Namen/Modelle — auch nicht auf Nutzerwunsch in Issues/Prompts. Bestehende Original-Charaktere beibehalten.
6. Performance-Budget: 60 FPS auf Mittelklasse-Laptop, < 5 MB initialer Download, Draw Calls < 150.

## 5. Milestones (strikte Reihenfolge)

### M0 — Scaffold & Port (Fundament)
- Repo-Struktur wie oben, Vite + TS strict + ESLint/Prettier/Vitest + CI.
- `legacy/index.html` in Module portieren (Rig, Moves, Physik, Kulissen, Shop, HUD). Verhalten identisch.
- Eigenbau-Orbit durch `OrbitControls` ersetzen (Zoom-Limits 5–24, Polar-Limits wie Prototyp).
- **AC:** Spiel läuft via `npm run dev` funktional identisch zum Prototyp; Build < 5 MB; 3 Unit-Tests für `economy.ts` (Kostenformel, Combo-Bonus, Multiplikator-Stacking).

### M1 — Persistenz
- Save/Load `localStorage`, Autosave 10 s + `visibilitychange`/`beforeunload`.
- Versioniertes Schema + Migrationsgerüst (Test: v1-Save lädt in v2).
- Offline-Earnings beim Laden: `min(elapsed, 2h) × BP/s × 0.5`, mit Welcome-Back-Dialog.
- Export/Import des Saves als Base64 (Textfeld in Settings), Reset mit Doppel-Confirm.
- **AC:** Reload erhält kompletten Zustand; manipulierter/korrupter Save ⇒ sauberer Neustart statt Crash (Test).

### M2 — Progression & Boss-Finale
- Balancing als Daten: Ziel-Kurve laut Kommentarblock in `economy.ts` (erste 5 min: Kauf ≤ 60 s Abstand; Minute 5–30: 2–4 min; Endgame-Ziel 50k BP für Boss-Unlock bei ~35–45 min).
- Content-Gates: Skins/Kulissen erscheinen erst ab BP-Meilensteinen im Shop (Config-Feld `revealAt`).
- Boss-Fight: Goldener Twerk-Tyrann als Gegner-Instanz (zweites Rig gespiegelt), HP-Balken, 90-s-Timer, Klick-DPS = `perClick`-Skalierung; Win ⇒ Credits-Screen + "Tyrann"-Skin freigeschaltet; Lose ⇒ Retry mit 25 % HP-Erleichterung.
- Ein Prestige-Reset ("Rebirth"): ab 100k BP, setzt alles zurück, +100 % permanenter Multiplikator, NG+-Badge.
- **AC:** Simulierter Bot-Playthrough (Test-Skript, das optimal kauft) erreicht Boss in 30–50 simulierten Minuten; Boss gewinn-/verlierbar; Rebirth-Werte überleben Reload.

### M3 — Audio
- `audio/engine.ts`: AudioContext nach erster User-Geste; Master-/SFX-/Musik-Gain, Mute persistiert.
- Beat-Klatschen synchron zur Choreo-`phase`; Kauf-/Unlock-/Combo-/Boss-SFX; 1 Loop-Track pro Kulisse (CC0-Quellen, Lizenzliste in `public/CREDITS.md`).
- **AC:** Kein Autoplay-Fehler in Chrome/Firefox; Mute wirkt sofort und persistiert; alle Assets CC0-dokumentiert.

### M4 — Game Feel & Content
- 18 Achievements (Config + Toast-System + eigener Shop-Tab).
- Klick-Partikel (instanced Sprites, Pool, max 200), Screen-Shake bei Combo-Meilensteinen (dezent, abschaltbar).
- Random Event "Goldener Pfirsich": alle 90–240 s, 8 s klickbar, +60 s Einkommens-Boost ×3.
- 4 zusätzliche Upgrades für die Endgame-Kurve (Namen humorvoll, keine realen Personen/Marken).
- **AC:** Achievements triggern korrekt (Tests für 3 Stück), Partikel kosten < 1 ms/Frame (gemessen), Event-Timing im Save persistiert.

### M5 — Leaderboard (Worker + D1)
- `schema.sql`: `scores(id INTEGER PK, nickname TEXT CHECK(length(nickname) BETWEEN 2 AND 16), best_time_s INTEGER, created_at TEXT)`.
- Hono-Endpoints: `POST /api/scores` (Boss-Kill-Zeit; Rate-Limit 5/min/IP via KV; Nickname-Filter: nur `[a-zA-Z0-9_ ]`), `GET /api/scores/top?limit=50`.
- Client: Submit-Dialog nach Boss-Win (überspringbar), Top-50-Ansicht im Menü; komplett fail-silent.
- **AC:** Worker lokal via `wrangler dev` testbar; Spiel voll spielbar ohne erreichbare API; kein PII außer frei gewähltem Nickname.

### M6 — UX, Polish & Release
- Onboarding (3 Tooltips beim Erststart), Settings (Grafikqualität: pixelRatio/Schatten-Stufen, FPS-Cap, Effekte aus).
- Mobile: `pointerdown`, responsives Shop-Panel, Touch-Orbit.
- Loading-Screen, Favicon, OG-Meta (Titelbild), `document.title` mit BP.
- itch.io-Export: `npm run build:itch` ⇒ ZIP mit relativen Pfaden; Cloudflare-Pages-Deploy via CI auf `main`.
- Manuelle Testrunde dokumentieren (`TESTPLAN.md`): Chrome, Firefox, 1× Android-Browser; kompletter Playthrough mit Zeitmessung.
- **AC:** Lighthouse Performance ≥ 85; itch-ZIP läuft aus lokalem Verzeichnis (file:// nicht nötig, itch nutzt HTTP); Playthrough-Zeit im Zielfenster dokumentiert.

## 6. API-Vertrag (fix, M5)

```
POST /api/scores
  Body: { "nickname": string, "bestTimeS": number }
  201: { "rank": number }        400: Validierungsfehler   429: Rate-Limit
GET /api/scores/top?limit=50
  200: [{ "nickname": string, "bestTimeS": number, "createdAt": string }]
```

## 7. Definition of Done (global)

- CI grün (lint, test, build) · keine `any` ohne Kommentar · keine toten Dateien
- Jeder Milestone endet mit Update von `README.md` + `DECISIONS.md`
- Spiel jederzeit auf `main` in spielbarem Zustand (trunk-based, kleine PRs)
