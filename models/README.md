# models/ — alle Spielmodelle als glTF (.glb)

Der komplette 3D-Cast des Spiels als Standard-glTF-2.0-Binaries — direkt in
Blender, jedem DCC-Tool oder einem glTF-Viewer zu öffnen.

**Generierte Artefakte, keine Quelle.** Das Spiel baut alle Modelle prozedural
zur Laufzeit (Three.js); dieser Ordner ist der Export dieser Builder, danach in
**Blender verfeinert** (deterministischer Refine-Pass). Quelle bleibt der Code
(`apps/game/src/character/*`, `world/backgrounds.ts`) — nach Modell-Änderungen
die volle Kette neu laufen lassen:

```sh
node tools/blender/export_all.cjs        # 1. vite dev + headless Chromium → Roh-.glb
python3 tools/blender/refine_models.py   # 2. Blender: Refine + Dioramen + Renders
python3 tools/blender/verify_models.py   # 3. Blender-Import-Roundtrip (bpy)
node tools/blender/dump_poses.mjs /tmp/poses.json    # 4. Choreo-Moves → Pose-Frames
python3 tools/blender/render_anim.py /tmp/poses.json # 5. Blender: Animations-GIFs
```

**Blender-Refine (Schritt 2)** macht die Dateien fertig — keine Nacharbeit
nötig: Nähte verschweißt (Merge-by-Distance), Normals konsistent,
Shade-Smooth-by-Angle 60°, **Detail-Pass** (Bevel + selektiver Subsurf — alle
Modelle sichtbar feiner bei Cartoon-Silhouette), mattes Material-Finish, und
**jede Bühne wird ein detailliertes Diorama** (`tools/blender/enrich.py`,
radius-relativ skalierte Cartoon-Prop-Kits):
· **Beach**: große Sand-Insel im glänzenden Ozean — 5 gebogene Palmen mit
Kokosnüssen und Hänge-Wedeln, Sonnenschirm + Handtuch, Sandburg, Wasserball,
Seesterne, Muscheln, Felsen, Schaumkante, Pufferwolken, Horizont-Sonne.
· **Club**: DJ-Pult mit Decks + Neon-Front, zusätzliche Speaker-Stacks,
Laser-Fächer, Neon-Ring, Parkett-Disc.
· **Synth**: echtes emissives Grid (das In-Game-Grid ist Linien-Geometrie),
Synthwave-Sonnen-Slats, Sternenfeld, Violett-Boden.
· **Space**: Asteroidengürtel, Cartoon-Rakete mit Flamme, Satellit,
Sternenstaub (das 111-Einheiten-Sternfeld-Mesh entfernt — Himmel, kein
Diorama-Inhalt).
`renders/` enthält den Cycles-Render-Nachweis jedes Modells (Studio-Rig,
3-Punkt-Licht, OIDN-Denoise, Auto-Framing über die Prop-Kern-BBox).

**Animations-Renders (`renders/anim/`).** Alle acht Twerk-Moves der
Choreografie als in Blender gerenderte Loop-GIFs (Cycles, 12 fps, 4 s):
`dump_poses.mjs` samplet die ECHTEN Move-Funktionen (`choreo/moves.ts` — keine
Duplikation der Tanz-Mathematik), `render_anim.py` keyframet sie per
`applyPose`-Mapping auf die benannten Rig-Nodes des Charakter-glb, simuliert
die Po-Backen mit derselben Feder-Dämpfer-Physik wie das Spiel (k = 190,
c = 7, 120-Hz-Substeps) und rendert die Sequenz im Studio-Setup mit
Holzbühnen-Boden.

## Inhalt (22 Modelle)

| Ordner        | Inhalt                                                          |
| ------------- | --------------------------------------------------------------- |
| `characters/` | Die 10 Spieler-Skins (classic … diamond), Pose physik-gesettelt |
| `rivals/`     | Die 4 Bühnen-Rivalen (club/synth/beach/space) × normal + boss   |
| `stages/`     | Die 4 Bühnen-Szenerien (Props, Palette Lap 0)                   |

## Was beim Export bewusst fehlt

- **Ink-Outlines** — ein Laufzeit-Shadertrick (BackSide-Hüllen,
  `onBeforeCompile`); als Geometrie wären es nur schwarze Duplikat-Hüllen.
- **Glow-Sprites** — Billboards, die glTF/GLTFExporter nicht abbildet.
- **Cel-Band-Ramps** — `MeshToonMaterial`-Gradient-Maps haben keinen glTF-Slot;
  die Farben bleiben erhalten, das Cel-Shading entsteht im Spiel (oder in
  Blender per Shader-Nodes) neu.
- **Animation/Physik** — Rigs sind als eingefrorene Pose exportiert; die
  Twerk-Physik (`stepPhysics`/`renderCheeks`) lebt nur zur Laufzeit. Die
  Rig-Nodes tragen aber stabile Namen (`root`/`pelvis`/`spine`/`head`/
  `shoulderL`/…), sodass `render_anim.py` (und jedes DCC-Tool) sie animieren
  kann — die fertigen Choreo-Renders liegen in `renders/anim/`.

## In Blender öffnen

GUI: `File → Import → glTF 2.0`. Headless (bpy, siehe
`tools/blender/README.md`):

```python
import bpy
bpy.ops.import_scene.gltf(filepath="models/characters/character-classic.glb")
```

Verifiziert: alle 22 Dateien importieren fehlerfrei in Blender 5.0 (bpy) und
wurden dort per Cycles proberendert.
