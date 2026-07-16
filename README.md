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
- Shop (rechts oben): Upgrades, Skins, Kulissen

## Features

- Anatomisches Skelett-Rig (~7-Kopf-Proportionen) mit Ellbogen/Knien
- Choreografie-System: 5 Tanzmoves (Twerk, Hip Circles, Drop It Low, Shimmy, Bounce)
- Feder-Dämpfer-Soft-Body-Physik (120 Hz Fixed Timestep) mit Gravitation
- 5 Skins: Klassiker, Disco-King, Robo-Twerk 3000, Der Showmaster, Goldener Twerk-Tyrann
- 4 Kulissen: Neon-Club, Synthwave, Sunset Beach, Deep Space
- 7 Upgrades, Combo-System, ACES-Tonemapping, PBR-Materialien

## Roadmap (siehe Gameplan)

1. Boss-Fight + Balancing (Pflicht)
2. Save/Load via localStorage (Pflicht)
3. Audio (Beat-Klatschen, SFX, Musik)
4. Achievements, Partikel, Random Events
5. Mobile/UX, Settings
6. Testing + itch.io Release

## Lizenz-Hinweise

- Three.js: MIT License (https://threejs.org)
- Alle Modelle/Shader: selbst erstellt (prozedural)
