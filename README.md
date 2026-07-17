# Booty Clicker · Anatomy Edition

Joke-Clicker-Game in Three.js + TypeScript, gebaut mit Vite.
(Der ursprüngliche Ein-Datei-Prototyp liegt read-only unter [`legacy/index.html`](./legacy/index.html).)

## Starten

```bash
npm install        # einmalig
npm run dev        # Dev-Server (Vite, HMR) → http://localhost:5173
```

Weitere Skripte: `npm run build` (Produktions-Build nach `apps/game/dist`, < 5 MB),
`npm test` (Vitest), `npm run lint`, `npm run format`.
Three.js kommt als npm-Paket (kein CDN). Projekt-Struktur & Milestones: siehe
[`AGENTS.md`](./AGENTS.md) und [`booty-clicker-spec.md`](./booty-clicker-spec.md).

## Steuerung

- Klick auf Figur / Leertaste = Shaken (BP verdienen)
- Maus ziehen = Kamera drehen, Scrollen = Zoom
- Shop (rechts): Upgrades, Skins, Kulissen, Einstellungen (⚙️)
- 🛒-Button (links oben) blendet den Shop ein/aus

## Progression & Boss-Finale (M2)

- **Balancing als Daten**: die Upgrade-Kosten in `economy.ts` folgen einer
  dokumentierten Ziel-Kurve — optimales Spiel erreicht den Boss-Unlock bei
  50 000 BP nach ~40 min (verifiziert durch einen reinen Bot-Playthrough-Test).
- **Content-Gates**: Skins & Kulissen erscheinen erst ab BP-Meilensteinen im Shop.
- **Boss-Fight** (👑 „Tyrann herausfordern", ab 50 000 BP): 90-Sekunden-Kampf gegen
  den Goldenen Twerk-Tyrann, Klick-Schaden skaliert mit `perClick`. Sieg schaltet
  den Tyrann-Skin frei; verloren gibt's einen Retry mit 25 % weniger Boss-HP.
- **Rebirth (NG+)**: ab 100 000 BP im ⚙️-Tab — setzt BP & Upgrades zurück und
  gewährt dauerhaft +100 % Multiplikator (kumulativ), NG+-Badge im HUD.

## UX, Mobile & Release (M6)

- **Onboarding**: drei nicht-blockierende Coach-Marks beim ersten Start (danach
  nie wieder), gespeichert im `bootyclicker.settings`-Key.
- **Grafik-Einstellungen** im ⚙️-Tab: Qualität (Niedrig/Mittel/Hoch → Pixel-Ratio
  & Schatten) und optionales FPS-Limit (0/30/60) — live angewendet & gespeichert.
- **Mobile**: Tippen = Shaken, Ziehen = Kamera drehen (Pointer-Events + Tap-Test),
  responsiver Vollbild-Shop und größere Touch-Targets unter 640 px.
- **Loading-Screen** bis zum ersten Frame; Tab-Titel zeigt die aktuellen BP;
  OpenGraph/Twitter-Meta.
- **itch.io-Export**: `npm run build:itch` erzeugt `apps/game/release/booty-clicker-itch.zip`
  (relative Pfade, läuft aus einem lokalen Ordner). Cloudflare-Pages-Deploy via CI
  auf `main` (übersprungen ohne Secrets). QA-Checkliste: [`TESTPLAN.md`](./TESTPLAN.md).

## Bestenliste (M5)

- **Optionaler** globaler Highscore (Boss-Kill-Zeit) über einen Cloudflare Worker
  (`apps/api`, Hono + D1 + KV). Endpunkte: `POST /api/scores`, `GET /api/scores/top`.
- **Komplett fail-silent** (Spec §4.4): ohne erreichbare/konfigurierte API ist das
  Spiel voll spielbar — der Client (`VITE_API_BASE`) ist standardmäßig aus.
- Nach einem Boss-Sieg optionaler (überspringbarer) Eintrag; Top-50 im ⚙️-Tab.
- Kein PII außer dem frei gewählten Nickname (`[a-zA-Z0-9_ ]`, 2–16).
- Worker lokal: `cd apps/api && npx wrangler dev` (siehe `apps/api/wrangler.toml`).

## Game Feel & Content (M4)

- **18 Achievements** mit Toast-Benachrichtigung und eigenem 🏆-Shop-Tab.
- **Klick-Partikel** (GPU-Points-Pool, max. 200) sprühen bei jedem Shake.
- **Screen-Shake** bei Combo-Meilensteinen — im ⚙️-Tab abschaltbar (wie die Partikel).
- **Random Event „Goldener Pfirsich"** 🍑: erscheint alle 90–240 s für 8 s; fangen
  gibt 60 s lang ×3 Einkommen. Timing überlebt Reload.
- **4 Endgame-Upgrades** (Pfirsich-Reaktor, Hüftgold-Mine, Twerk-Singularität,
  Booty-Blackhole) für die Kurve nach dem Boss.

## Audio (M3)

- Komplett **prozedural** per Web Audio API erzeugt — keine Audiodateien, winzige
  Bundle-Größe, lizenzfrei (Details in [`apps/game/public/CREDITS.md`](./apps/game/public/CREDITS.md)).
- **Musik**: pro Kulisse ein generativer Loop (Bass + Arpeggio + Hi-Hat).
- **SFX**: Shake/Klick, Kauf, Freischaltung, Combo, Beat-Klatschen (synchron zur
  Choreografie), Boss-Treffer/Sieg/Niederlage.
- **Kein Autoplay**: der AudioContext startet erst nach der ersten Nutzer-Geste.
- **Mute** (🔊-Button oben links) wirkt sofort und wird gespeichert.

## Persistenz (M1)

- **Autosave**: alle 10 Sekunden, beim Wechsel in den Hintergrund-Tab und beim
  Schließen/Verlassen der Seite (`localStorage`, Schema-Version 3, migriert v1/v2).
- **Offline-Ertrag**: beim Wiedereinstieg gibt's 50 % des passiven Ertrags für die
  Zeit, die man weg war (gedeckelt auf 2 Stunden) — angezeigt im
  "Willkommen zurück"-Dialog.
- **Export/Import/Reset**: im Shop-Tab ⚙️ lässt sich der Spielstand als
  Base64-Code exportieren/importieren (z. B. zum Umziehen auf ein anderes
  Gerät) oder komplett zurücksetzen.

## Features

- Anatomisches Skelett-Rig (~7-Kopf-Proportionen) mit Ellbogen/Knien
- Choreografie-System: 5 Tanzmoves (Twerk, Hip Circles, Drop It Low, Shimmy, Bounce)
- Feder-Dämpfer-Soft-Body-Physik (120 Hz Fixed Timestep) mit Gravitation
- 5 Skins: Klassiker, Disco-King, Robo-Twerk 3000, Der Showmaster, Goldener Twerk-Tyrann
- 4 Kulissen: Neon-Club, Synthwave, Sunset Beach, Deep Space
- 7 Upgrades, Combo-System, ACES-Tonemapping, PBR-Materialien
- Boss-Finale, Prestige/Rebirth, Content-Gates (M2)

## Roadmap (siehe Gameplan)

Alle Meilensteine **M0–M6** sind erledigt — Persistenz, Boss + Balancing, Audio,
Game Feel & Content, Bestenliste sowie UX/Mobile/Release (siehe oben). Release-QA
und Playthrough-Timing: [`TESTPLAN.md`](./TESTPLAN.md).

## Lizenz-Hinweise

- Three.js: MIT License (https://threejs.org)
- Alle Modelle/Shader: selbst erstellt (prozedural)
