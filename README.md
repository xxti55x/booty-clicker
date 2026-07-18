# Booty Clicker · Endless Twerk

Ein **endloser Idle-/Clicker im Clicker-Heroes-Stil**, thematisiert als Twerk-Show —
gebaut mit Three.js + TypeScript + Vite. Twerke dich durch unendlich viele Bühnen,
rekrutiere deine Crew und werde zur Twerk-Legende. (Der ursprüngliche Ein-Datei-Prototyp
liegt read-only unter [`legacy/index.html`](./legacy/index.html).)

## Starten

```bash
npm install        # einmalig
npm run dev        # Dev-Server (Vite, HMR) → http://localhost:5173
```

Weitere Skripte: `npm run build` (Produktions-Build nach `apps/game/dist`, < 5 MB),
`npm run build:itch` (itch.io-ZIP), `npm test` (Vitest), `npm run lint`, `npm run format`.

## So spielt es sich

- **Twerken = Schaden.** Klick auf die Figur oder drück die Leertaste — jeder Shake
  macht Schaden am aktuellen Rivalen. Aktives Klicken ist der Kern: **Crits** (×5) und
  ein **Combo-Multiplikator** belohnen schnelles Twerken.
- **Klick-Juice 2.0.** Combo baut **Tiers** auf (Warm → Heiß → Feuer → Inferno) mit
  Extra-Perks (mehr Crit, breiteres Beat-Fenster) und **zerfällt weich** statt hart auf 0.
  Triff **im Takt** (♪) für ×1,5-Klicks, und lade die **Twerk-Ekstase** auf — Taste `F`
  bzw. der Balken unten: **12 Sekunden ×10 Klick-Schaden**. Mehr Combo = mehr Partikel,
  Screen-Shake, Musik-Layer und Vibration (alles einzeln im ⚙️-Tab abschaltbar).
- **Bühnen (Zonen).** Besiege 10 Rivalen, um eine Bühne zu räumen. Die Ausdauer (HP)
  der Rivalen wächst exponentiell — es geht **endlos** weiter.
- **Crew = Idle-DPS.** Heuere im 🕺-Tab Tänzer:innen an (Booty-Boss → Twerk-Legende)
  und level sie (×1 / ×10 / Max). Ihre DPS ticken die Rivalen-HP auch ohne Klicken
  herunter — und pushen zusätzlich deinen Klick-Schaden.
- **Bosse.** Jede 5. Bühne ist ein Boss mit **30-Sekunden-Timer**. Schaffst du ihn
  nicht, farmst du die Bühne weiter und forderst ihn erneut heraus (kein Soft-Lock).
- **Ruhm-Seelen (Ascension).** Starte deine Tournee im ✨-Tab neu und sammle Seelen —
  **+10 % Schaden pro Seele, dauerhaft**. Seelen hängen an deiner tiefsten je erreichten
  Bühne (kein Farm-Exploit). Das ist der Motor, der das Spiel endlos macht:
  tiefer → mehr Seelen → mehr Schaden → tiefer.
- **Idle & Offline.** Deine Crew farmt weiter, während du weg bist (50 % Rate, max. 8 h)
  — beim Wiedereinstieg gibt's eine „Willkommen zurück"-Zusammenfassung.

## Steuerung

- Klick auf Figur / Leertaste = Twerken (Schaden)
- **Taste `F`** / Ekstase-Balken = Twerk-Ekstase zünden (wenn voll geladen)
- Maus ziehen = Kamera drehen, Scrollen = Zoom
- 🕺-Button (links oben) blendet das Panel ein/aus · 🔊 = Ton an/aus
- Auf dem Handy ist der Shop ein **Bottom-Sheet** — Figur & Rivale bleiben sichtbar
- Tabs: **🕺 Crew** · **✨ Ruhm** (Ascension + Statistik) · **⚙️** (Grafik, Effekte,
  Save-Export/Import/Reset)

## Architektur

npm-Workspaces-Monorepo:

- `apps/game` — der Spiel-Client (Vite + TS, strict). Reine, unit-getestete Kern-Logik
  vs. dünne DOM/Three/Audio-Glue:
  - `game/combat.ts` — Zonen-/Rivalen-Loop: `monsterHp(zone)=10·1.6^(zone-1)`, 10 Rivalen/Zone,
    Boss alle 5 Zonen (HP ×10) mit 30 s-Timer, Gold `ceil(HP/15)` (Boss ×12), reine Reducer.
  - `game/heroes.ts` — 10er-Crew, `1.07`-Kostenwachstum, ×2-Meilenstein-Verdopplungen,
    Klick-Schaden = Basis + Anteil der Gesamt-DPS.
  - `game/ascension.ts` — `soulsForMaxZone(z)=⌊z^1.6/40⌋`, +10 %/Seele, an Lifetime-Zone gepinnt.
  - `game/ch-state.ts` + `save/ch-store.ts` — CH-State, eigener versionierter Save-Key
    (`bootyclicker.ch`), Offline-Gold, Base64-Export/Import (never-throw, injizierbar).
  - `ui/*` — HUD/Rival, Crew, Prestige, Settings; `main.ts` verdrahtet alles + Render-Loop.
- `apps/api` — optionaler Cloudflare-Worker (Hono + D1 + KV) als Bestenlisten-Backend.

Audio ist komplett **prozedural** (Web Audio, keine Dateien). Three.js kommt als
npm-Paket (kein CDN). Zahlen werden bis Decillion + wissenschaftliche Notation formatiert,
damit die exponentielle Kurve endlos lesbar bleibt.

## Design-Dokumente

- [`booty-clicker-spec.md`](./booty-clicker-spec.md) — ursprüngliche Spec (M0–M6).
- [`booty-clicker-v2-spec.md`](./booty-clicker-v2-spec.md) — endlose, klick-zentrierte
  Neugestaltung mit ausführlicher Roadmap (Skins-als-Gear, Truhen, mehrschichtiges
  Prestige, Ancients, …). Dieser MVP ist die erste Stufe davon.
- [`DECISIONS.md`](./DECISIONS.md) — Log der Engineering-Entscheidungen.
- [`TESTPLAN.md`](./TESTPLAN.md) — QA-Checkliste.

## Lizenz-Hinweise

- Three.js: MIT License (https://threejs.org)
- Alle Modelle/Shader/Sounds: selbst erstellt (prozedural)
