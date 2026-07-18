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
- **Crew = Idle-DPS.** Heuere im 🕺-Tab Tänzer:innen an (Booty-Boss → Twerk-Legende
  → … → Kosmische Twerk-Entität — 15 Tiers) und level sie (×1 / ×10 / Max). Ihre DPS
  ticken die Rivalen-HP auch ohne Klicken herunter — und pushen zusätzlich deinen
  Klick-Schaden. Meilenstein-Verdopplungen gehen **endlos** weiter (…, 800, 1600, 3200, …).
- **Vergoldungen (Gilds) 🏅.** Der **Erst-Clear jeder 10er-Bühne** (10, 20, 30, …)
  vergoldet ein zufälliges Crew-Mitglied dauerhaft mit **×1,25 DPS**. Vergoldungen
  überleben die Ascension — auch ein Lauf **ohne** neue Seelen, der eine neue 10er-Bühne
  erreicht, hinterlässt bleibende Macht.
- **Farmen & Reisen.** Der Bühnen-Stepper im HUD (`◀ Bühne ▶`, `⏫ Front`) lässt dich
  tiefer geräumte Bühnen farmen und jederzeit zur Frontier zurückspringen (nie über deine
  tiefste Bühne hinaus).
- **Bosse.** Jede 5. Bühne ist ein Boss mit **30-Sekunden-Timer**. Schaffst du ihn
  nicht, farmst du die Bühne weiter und forderst ihn erneut heraus (kein Soft-Lock).
- **Ruhm-Seelen (Ascension).** Starte deine Tournee im ✨-Tab neu und sammle Seelen —
  **+10 % Schaden pro gehaltener Seele, dauerhaft**. Der Seelen-Ertrag `⌊z^1.6/40⌋ + ⌊1.10^z−1⌋`
  wächst mit der Tiefe **exponentiell**, sodass jede neue Bestzone die Bank vervielfacht.
  Seelen hängen an deiner tiefsten je erreichten Bühne (kein Farm-Exploit): tiefer → mehr
  Seelen → mehr Schaden → tiefer.
- **Twerk-Ahnen (🌀).** Gib **gehaltene** Ruhm-Seelen für 10 **Ahnen** aus (Twerkules
  +5 % Klick, Poposeidon +15 % Crew-DPS, Cheeksana +Krit, Glutaeus +Boss-Schaden,
  Peachiel +Gold, …). Ausgegebene Seelen buffen nicht mehr über `soulMult` — dafür
  geben die Ahnen dauerhafte, über Runs **compoundende** Perks (der klassische
  Souls-vs-Perk-Tradeoff). Die Prozent-Ahnen sind uncapped: der endlose Seelen-Sink.
- **Ruhmes-Himmelfahrt (🌈).** Ab **1 000 RS Lebenszeit** kannst du ein zweites Mal
  prestige-n und **Himmelspfirsiche (HPF)** ernten. Jeder gehaltene HPF gibt **+2 %
  globalen Schaden** _und_ **verstärkt jede Seele** (`+0,2 %`/HPF) — L1 und L2
  multiplizieren sich. Die Himmelfahrt setzt Ruhm-Seelen, Ahnen und die ganze Tour
  zurück; **Vergoldungen, HPF und der Himmelsbaum bleiben.** Gib HPF im **Himmelsbaum**
  aus (permanent über alle Prestiges): **Twerk-Coach I–IV**, **Frühstarter**,
  **Nachtschicht** (Offline-Cap 8 → 16 → 24 h), **Ekstase-Ausdauer**.
- **Twerk-Coaches.** Ein per Himmelsbaum freigeschalteter Coach **klickt automatisch
  1×/s** mit 25 % deines Klickwerts (bis 4 cps) — idle **und** offline, sodass auch
  reine Klick-Builds ohne Crew über Nacht verdienen.
- **Idle & Offline.** Deine Crew (und deine Coaches) farmen weiter, während du weg bist
  (50 % Rate, Cap 8 h, per Nachtschicht bis 24 h) — beim Wiedereinstieg gibt's eine
  „Willkommen zurück"-Zusammenfassung.
- **Skins als Gear (🎽).** Deine Figur ist kein reines Kostüm mehr: der **ausgerüstete
  Skin** gibt einen echten Buff (die stärksten sind **Klick-Buffs**, P1). **Ausrüsten**
  tauscht Figur _und_ Werte sofort (DPS/Klick im HUD ändern sich sichtbar). **Levele**
  einen Skin mit **Pfirsich-Splittern 🧩** (Level 1–50, lineare Buff-Skalierung; 🧩 fallen
  vorläufig aus Boss-Kills, bis M12 die Truhen bringt) und setze **Sterne ★** mit
  **Zuckerpfirsichen 🍬** (0–5; ein 🍬 reift **1×/24 h** Echtzeit — der tägliche
  Login-Grund). **Kulissen** kehren als Wahl zurück (**Club** +Combo-Fenster · **Synth**
  +Beat-Fenster · **Beach** +Offline-Cap · **Space** +Crew-DPS) plus **„Auto (Tour)"**
  (rotiert mit der Bühne, Default). Passende **Skin × Kulisse**-Kombis schalten **Set-Boni**
  frei (z. B. Disco-King + Club = „Studio 54"). Neon-Ninja & Pfirsich-Pirat lassen sich
  mit 🧩 **craften**; der Goldene Twerk-Tyrann wird per Boss-Erst-Kill (Bühne 10) **oder
  Erbe der alten Tour** frei, Diamant-Booty erst ab Transzendenz.

## Steuerung

- Klick auf Figur / Leertaste = Twerken (Schaden)
- **Taste `F`** / Ekstase-Balken = Twerk-Ekstase zünden (wenn voll geladen)
- Maus ziehen = Kamera drehen, Scrollen = Zoom
- 🕺-Button (links oben) blendet das Panel ein/aus · 🔊 = Ton an/aus
- Auf dem Handy ist der Shop ein **Bottom-Sheet** — Figur & Rivale bleiben sichtbar
- Tabs (jetzt Emoji-only, Titel per Hover, damit alle **sechs** passen): **🕺 Crew** ·
  **🎽 Gear** (Skins/Kulisse/Set-Boni) · **🌀 Ahnen** (Seelen-Sink) · **✨ Ruhm**
  (Ascension + Statistik) · **🌈 Himmel** (Himmelfahrt + Himmelsbaum) · **⚙️** (Grafik,
  Effekte, Save-Export/Import/Reset)

## Architektur

npm-Workspaces-Monorepo:

- `apps/game` — der Spiel-Client (Vite + TS, strict). Reine, unit-getestete Kern-Logik
  vs. dünne DOM/Three/Audio-Glue:
  - `game/combat.ts` — Zonen-/Rivalen-Loop: `monsterHp(zone)=10·1.6^(zone-1)`, 10 Rivalen/Zone,
    Boss alle 5 Zonen (HP ×10) mit 30 s-Timer, Gold `ceil(HP/15)` (Boss ×12), reine Reducer.
  - `game/heroes.ts` — 15er-Crew, `1.07`-Kostenwachstum, **endlose** ×2-Meilensteine
    (fix bis 800, danach jede Verdopplung), Klick-Schaden = Basis + Anteil der Gesamt-DPS.
  - `game/ascension.ts` — `soulsForMaxZone(z)=⌊z^1.6/40⌋+⌊1.10^z−1⌋` (RS_v2), +10 %/Seele;
    **held-balance**: `rsLifetime`=verdiente, `souls`=gehaltener Saldo (Ahnen geben aus).
  - `game/gild.ts` — Vergoldungen: seeded Ziel-Wahl, Award pro 10er-Erst-Clear, Umhängen (5 RS).
  - `game/ancients.ts` — 10 Twerk-Ahnen (Daten), `ancientCost`=level+1, cap-gegateter
    `buyAncient`, Aggregat-Modifikatoren (der Seelen-Sink, §4.6).
  - `game/heaven.ts` — Ruhmes-Himmelfahrt: `hpfForRsLifetime=⌊√(RS/1000)⌋`, Doppelwirkung
    (+2 %/HPF global + Seelen-Verstärker), `bankHimmelfahrt`, Himmelsbaum-Grundknoten.
  - `game/gear.ts` — **Skins als Gear**: faltet aktiven Skin (Buff·Level + Stern·Sterne) +
    Kulissen-Mini-Buff + Set-Boni zu einem puren `GearBonus`; Ökonomie (`shardCost`,
    `sugarCostForStar`, `craftCost`/`craftSkin`), 🍬-Reifung (rückwärts-Uhr-sicher) und
    Unlock-Gating (`skinUnlocked`). Konsumiert von `effectiveClick`/`dpsOf` (die stärksten
    Buffs sind Klick-Buffs, P1).
  - `game/sim.ts` — `simulateEndless`: deterministischer Balancing-Bot über die echten
    Module; Endlos-Kriterien E1/E2/**E3**/E4 (inkl. **E4-mit-Gear**: Best-in-Slot-Klick-Gear
    schlägt Best-in-Slot-Idle-Gear ≥ 8 Zonen) + Pacing + erste-Himmelfahrt als CI-Gate
    (`npm run test:sim`).
  - `game/ch-state.ts` + `save/ch-store.ts` — CH-State (Save **v6**: `gear` + `legacyTyrann`),
    eigener versionierter Save-Key (`bootyclicker.ch`), Offline-Gold (inkl. Coach + Gear-Bonus),
    Base64-Export/Import (never-throw, injizierbar).
  - `ui/*` — HUD/Rival + Travel-Stepper, Crew, **Gear/Skins**, **Ahnen**, Prestige,
    **Himmel**, Settings; `main.ts` verdrahtet alles (Skin-Wechsel baut die 3D-Figur neu,
    Kulissen-Wahl gated die Auto-Rotation).
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
