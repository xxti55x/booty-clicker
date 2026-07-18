# models/ — alle Spielmodelle als glTF (.glb)

Der komplette 3D-Cast des Spiels als Standard-glTF-2.0-Binaries — direkt in
Blender, jedem DCC-Tool oder einem glTF-Viewer zu öffnen.

**Generierte Artefakte, keine Quelle.** Das Spiel baut alle Modelle prozedural
zur Laufzeit (Three.js); dieser Ordner ist der Export dieser Builder. Quelle
bleibt der Code (`apps/game/src/character/*`, `world/backgrounds.ts`) — nach
Modell-Änderungen neu exportieren:

```sh
node tools/blender/export_all.cjs   # vite dev + headless Chromium → models/*.glb
python3 tools/blender/verify_models.py   # Blender-Import-Roundtrip (bpy)
```

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
  Twerk-Physik (`stepPhysics`/`renderCheeks`) lebt nur zur Laufzeit.

## In Blender öffnen

GUI: `File → Import → glTF 2.0`. Headless (bpy, siehe
`tools/blender/README.md`):

```python
import bpy
bpy.ops.import_scene.gltf(filepath="models/characters/character-classic.glb")
```

Verifiziert: alle 22 Dateien importieren fehlerfrei in Blender 5.0 (bpy) und
wurden dort per Cycles proberendert.
