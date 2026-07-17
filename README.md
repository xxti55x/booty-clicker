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

1. Audio (Beat-Klatschen, SFX, Musik)
2. Achievements, Partikel, Random Events
3. Mobile/UX, Settings
4. Testing + itch.io Release

Save/Load (M1) und Boss-Fight + Balancing (M2) sind erledigt — siehe oben.

## Lizenz-Hinweise

- Three.js: MIT License (https://threejs.org)
- Alle Modelle/Shader: selbst erstellt (prozedural)
