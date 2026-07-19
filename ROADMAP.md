# ROADMAP — Grafik-Vollausbau & Feinschliff

Wohin das Spiel als Nächstes wächst: **alle Texturen aufwerten** und das Spiel
**fertiger, runder und optisch gefälliger** machen. Jede Phase ist so
geschnitten, dass sie einzeln landen kann (bauen → headless screenshotten →
committen), die Reihenfolge ist die empfohlene Priorität.

## Ist-Stand (worauf wir aufbauen)

- **Look**: Cel-Shading (`toonMat`, 4 Bänder) + Ink-Outlines (Inverted Hull),
  warmes Holz/Pergament/Gold-UI, 50/50-Layout mit Insel-Diorama rechts.
- **Texturen**: prozedurale Canvas-Maps in `apps/game/src/engine/textures.ts`
  (Sand-Speckle, Strata, Planken, Neon-Grid, Metallplatten, Krater, Gewebe,
  Punkt-Raster) — near-white gezeichnet, Materialfarbe tintet. 256²-Canvases,
  gecacht inkl. Repeat-Klonen.
- **Bühnen**: vier Themen-Inseln (`world/island.ts`) + Prop-Kulissen
  (`world/backgrounds.ts`), Deck-Maps über die `deck`-Config.
- **Pipeline**: `tools/blender/` exportiert alles nach `models/` (Texturen
  werden in die glbs gebacken), rendert Stills + Choreo-GIFs.
- **Budget-Gates**: Bundle < 5 MB (aktuell ~700 KB), 512+ Tests, Sim-Envelope,
  headless Screenshot-Verifikation.

---

## Phase T — Textur-Upgrade (der Kern) · ✅ umgesetzt (T1–T6)

Ziel: Jede sichtbare Oberfläche hat eine bewusste Textur — nichts liest mehr
als „flaches Toon-Plastik". Alles bleibt **prozedural** (0 KB Assets, kein
Bundle-Wachstum) und **near-white** (Palette + Hue-Laps tinten weiter).

### T1 · Qualität der bestehenden Maps

- Auflösung der Haupt-Maps 256² → 512² (nur wo die Kamera nah ist: Insel-Deck,
  Rim); `anisotropy` von 4 auf `renderer.capabilities.getMaxAnisotropy()`
  (per Quality-Preset gedeckelt).
- Texel-Dichte-Audit: Repeat-Werte so setzen, dass Muster auf Deck, Rim und
  Props ähnlich groß lesen (heute variiert das sichtbar).
- Kanten-Härte: `NearestFilter`-Variante für Grid/Checker (crispe Neon-Linien),
  Mipmap-Bias prüfen (Grid flimmert in der Distanz → leichte Blur-Stufe).

### T2 · Relief: prozedurale Bump-/Normal-Maps

- Helper `bumpFrom(canvasTex)` in `textures.ts`: Height-Canvas → `bumpMap`
  (MeshToon und MeshPhysical unterstützen `bumpMap`/`normalMap`).
- Einsatz: Planken-Fugen (Club-Deck), Nieten + Panelkanten (Space-Deck),
  Sandrippel (Beach), Strata-Fugen (Insel-Rims), Krater (Asteroiden).
- Dezent halten (`bumpScale` ≈ 0.02–0.05) — das Cel-Banding muss dominant
  bleiben, Relief nur als Lichtkante.

### T3 · Charaktere & Rivalen komplett texturieren

Heute: Shorts (Gewebe) + Rivalen-Haut (Punkt-Raster). Ausbauen:

- **Pro Skin-Stil eigene Stoff-Map**: Robo = gebürstetes Metall (feine
  Linien), Boss = Samt (weiches Rauschen) + Gold-Brokat auf dem Cape, Disco =
  Pailletten-Glitzer (helle Sparkle-Punkte, `emissiveMap`!), Neon/Ninja =
  Carbon-Waffel, Pirat = grobes Leinen mit Streifen.
- **Haare**: Strähnen-Map (gekrümmte Linien, sehr subtil) statt Vollton.
- **Haut**: hauchzartes Poren-Rauschen (Kontrast < 5 %) — nur damit große
  Flächen (Torso, Cheeks!) im Licht nicht leer wirken.
- **Rivalen pro Theme**: Krabbe = Schalen-Buckel (Bump), Alien = Glow-Flecken
  (`emissiveMap`), Synth-Blob = Scanline-Schimmer, Club-Blob = Konfetti-Sprenkel.
- Alles über `toonMat({ map, bumpMap, emissiveMap })` — die Faktory kann alle
  drei bereits (map) bzw. bekommt die zwei neuen Slots.

### T4 · Kulissen-Props texturieren

- Speaker-Boxen: Tolex-Rauschen + Bespannungs-Gitter auf der Front.
- Palmen: Rinden-Ringe (Strata schmal), Wedel-Adern (Linien-Map).
- Synth-Berge: Fels-Speckle + Wireframe bleibt; Planeten: Bänder-Map
  (horizontale weiche Streifen) + Krater-Mond.
- Discokugel: Facetten-Map (Checker klein) statt nur Flat-Shading.
- Wolken/Mini-Inseln: weiches Wattierungs-Rauschen, Gras-Büschel-Speckle.

### T5 · Fake-AO & Verschattung

- Vertex-Color-AO im Insel-Builder: Unterseiten/Kontaktkanten dunkeln
  (`geometry`-Farben, kostenlos zur Laufzeit).
- Kontaktschatten-Decals unter Props (wie unter dem Charakter schon
  vorhanden) — Palmen, Speaker, DJ-Pult, Rivale.
- Insel-Kante: schmaler dunkler „Grime"-Ring auf dem Deck (Radial-Gradient-
  Map), damit der Boden am Rand nicht abrupt endet.

### T6 · Blender-Seite nachziehen

- Nach T1–T4 die Kette neu laufen lassen (`export_all` → `refine_models` →
  `verify` + `render_anim`) — Maps landen automatisch in den glbs.
- `refine_models.py`: Bump-Maps im Cycles-Material nachverdrahten (der
  glTF-Import bringt sie mit, Roughness-Floor darf sie nicht überschreiben).
- Neue Stills + 1–2 neue Choreo-GIFs als Vorher/Nachher in `models/renders/`.

**Definition of Done (T)**: Screenshot-Serie aller 4 Bühnen + 3 Skins + 4
Rivalen; keine Fläche > ~1/4 Bildschirmbreite ohne sichtbare Textur-Antwort
auf Licht; Bundle weiter < 1 MB; 60 fps im `quality: high` auf Desktop.

---

## Phase L — Licht & Post-Processing · ✅ umgesetzt

- **Per-Theme-Lichtsets**: heute ein globales Rig + Club-Rims. Je Theme ein
  kleines Delta (Beach: warme tiefe Sonne + kühles Fill; Synth: Pink/Cyan-Rims;
  Space: hartes Key + kaltes Ambient; Club: bleibt). Über `World.setBackground`
  mitwechseln (wie die Insel).
- **Bloom für Emissives** (`UnrealBloomPass`, three/examples — schon im
  Bundle-Baum): Neonkanten, Grid, Kristalle, Ekstase. Nur `quality: high`,
  Threshold hoch (nur echte Emissives glühen), Mobile aus.
- **Vignette/Grain** liegen als CSS-Overlays — auf WebGL-Pass heben, wenn
  Bloom kommt (ein Composer für alles), sonst lassen.
- **Farb-Grading light**: pro Theme ein `toneMappingExposure`-/Sättigungs-Delta
  statt LUTs (LUT-Texturen wären Assets — erst wenn nötig).
- **Schatten**: `shadow.camera`-Frustum exakt auf die Insel fitten (heute ±8 um
  den Ursprung — Insel-Zentrum ist 1.4/1.7), Radius pro Quality-Preset.

**DoD (L)**: Nachtbühnen (Club/Space) glühen ohne abzusaufen, Beach liest als
goldene Stunde; A/B-Screenshots; fps-Budget hält (Bloom nur high).

---

## Phase U — UI-Vollständigkeit · ⬜ offen

- **Zahlen-Leben**: BP-Zähler tickt weich hoch (Tween statt Sprung), Kauf
  löst einen kurzen „Coin-Fly" zum Zähler aus; DPS/Klick-Änderungen pulsen.
- **Kauf-Feedback**: Ability-Slot-Kauf feiert (Mini-Konfetti im Slot, Haken
  klappt ein); Level-Up-Reihe mit kleinem Stempel-Bounce.
- **Panel-Übergänge**: Tab-Wechsel mit 120-ms-Fade/Slide statt Hard-Swap;
  Bottom-Sheet (Mobil) mit Feder-Ease.
- **Leere Zustände**: jeder Tab braucht einen gestalteten Leerzustand (z. B.
  Ahnen vor erster Aszension: kleine Illustration + ein Satz), statt Text-Wüste.
- **Momente**: Boss-Banner (Name + Krone rollt ein), Bühnen-Wechsel-Card
  („Bühne 6 · Synthwave"), Aszensions-/Himmelfahrts-Zeremonie (Vollbild-Blende
  mit Seelen-/Pfirsich-Regen) — die Prestige-Klicks fühlen sich heute zu
  beiläufig an für ihre Bedeutung.
- **Konsistenz-Audit**: alle Reste-Emojis in HUD/Toasts gegen die
  Stroke-Icon-Sprache tauschen (Souls-Zeile, Truhen-Toasts, 🏅-Gild-Badge).

**DoD (U)**: Klick-durch-alle-Tabs-Screenshot-Serie ohne einen „unfertigen"
Screen; jede Kauf-/Prestige-Aktion hat sicht- und hörbares Feedback.

---

## Phase F — Weltgefühl & Übergänge · ⬜ offen

- **Bühnen-Wechsel als Moment**: Beim Theme-Wechsel (nach dem Boss) fliegt die
  alte Insel nach unten aus dem Bild und die neue schwebt ein (1–1.5 s,
  Kamera bleibt) statt Hard-Swap. Der `World.setBackground`-Rebuild bekommt
  dafür eine Ein-/Ausfahr-Animation der `islandGroup`.
- **Boss-Auftritt**: kurzer Kamera-Punch-In + Namens-Banner + Licht dimmt für
  eine Sekunde auf den Rivalen.
- **Ekstase-Fenster**: Screen-Rand glüht (CSS ist da: peach-Farbe), Musik-Layer
  kickt (existiert), Charakter-Shimmy (existiert) — plus Deck-Emissive pulst.
- **Idle-Leben**: Möwen/Glühwürmchen/Sternschnuppen je Theme (3–4 Sprites auf
  Kurven, extrem billig), Publikum-Silhouetten am Inselrand, die zum Beat
  wippen.
- **Sieg-Beat**: Zonen-Clear (10/10) mit Mini-Fanfare + Konfetti-Burst über
  dem Rivalen-Spawn.

**DoD (F)**: 30-Sekunden-Screencast eines Boss-Kills + Theme-Wechsels liest
sich wie ein fertiges Spiel; kein sichtbarer Hard-Cut mehr.

---

## Phase P — Performance & Verifikations-Ritual

Quer zu allem, vor jedem Merge:

- **Budget-Gates**: Bundle < 5 MB (Ziel: < 1.5 MB), Draw-Calls pro Bühne
  < 250 (`renderer.info` im chVs-Hook ausgeben), 60 fps Desktop / 30 fps
  Mobil-Preset.
- **Quality-Presets pflegen**: alles Neue (Bloom, Bump, Partikel-Dichte,
  Anisotropie) hängt am bestehenden `engine/quality.ts`-Preset.
- **Ritual**: `npm run lint` + Tests + Build, headless Screenshot-Serie
  (4 Themen × Desktop/Mobil) selbst ansehen, models/-Kette bei
  Material-Änderungen neu laufen lassen, DECISIONS.md-Eintrag, commit + push.

---

## Empfohlene Reihenfolge

| Schritt | Phase     | Warum zuerst                                        |
| ------- | --------- | --------------------------------------------------- |
| 1       | T1 + T2   | Größter sichtbarer Sprung pro Aufwand (Relief!)     |
| 2       | T3        | Spieler & Rivale sind immer im Bild                 |
| 3       | L (Licht) | Texturen brauchen Licht, das sie zeigt              |
| 4       | T4 + T5   | Kulisse zieht nach, AO erdet alles                  |
| 5       | U         | „Fertig-Gefühl" kommt aus dem UI-Feedback           |
| 6       | F         | Übergänge sind die Kür — zuletzt, wirken am meisten |
| 7       | T6        | models/-Ordner einmal am Ende konsistent nachziehen |

Grundsätze, die bleiben: **prozedural vor Assets** (Budget!), **near-white
Maps** (Palette/Hue-Laps tinten), **Cel-Look dominiert** (Textur ist Würze,
nicht Realismus), **Physik-Kontrakt unantastbar**, jede visuelle Änderung
**headless screenshotten und selbst ansehen**.
