# Blender-Pipeline (headless) — authored 3D-Modelle fürs Web

Das Spiel rendert heute **alles prozedural** in Three.js (Primitives mit
`toonMat` und Ink-Outlines, siehe `apps/game/src/engine/materials.ts`). Das
bleibt der Default: 0 KB Assets, perfekt diffbar, und der Cartoon-Look lebt
ohnehin vom Cel-Shading im Engine-Code.

Diese Pipeline ergänzt den prozeduralen Weg, wenn eine Form zu organisch für
Primitives wird (skulptierte Charaktere, komplexe Props, Trophäen):

```
bpy (Blender headless, pip)  →  .glb (glTF 2.0)  →  GLTFLoader  →  toonMat re-skin
```

## Warum glTF (.glb)?

glTF 2.0 ist der Web-Standard für 3D-Assets: kompaktes Binärformat, PBR-Material,
Skinning/Animationen, und Three.js lädt es nativ (`three/examples/jsm/loaders/
GLTFLoader.js` — im Bundle bereits enthalten, kein neues Dependency). Bei
wachsenden Assets: Draco- oder Meshopt-Kompression via `gltf-transform`.

## Setup (einmalig pro Umgebung)

```sh
pip install bpy          # Blender als Python-Modul, headless (~350 MB, Py 3.11)
```

Kein GUI, kein GPU nötig. Export + Modifier-Stack laufen in Sekunden;
CPU-Preview-Renders (Cycles) sind möglich, aber langsam.

## Skripte in diesem Ordner

| Skript              | Zweck                                                           |
| ------------------- | --------------------------------------------------------------- |
| `export_all.cjs`    | Exportiert ALLE Spielmodelle → `models/*.glb` (vite + headless) |
| `refine_models.py`  | Blender-Refine: Weld/Normals/Smooth, Bühnen-Dioramen, Renders   |
| `verify_models.py`  | Blender-Import-Roundtrip über `models/**/*.glb` (bpy)           |
| `dump_poses.mjs`    | Samplet die echten Choreo-Moves (`moves.ts`) → Pose-Frame-JSON  |
| `render_anim.py`    | Keyframt + rendert die Moves in Blender → `renders/anim/*.gif`  |
| `export_example.py` | Minimalbeispiel: Modell in bpy bauen → .glb                     |

## Benutzung (Pipeline-Reihenfolge)

```sh
node tools/blender/export_all.cjs        # 1. Roh-Export aus den Spiel-Buildern
python3 tools/blender/refine_models.py   # 2. Blender-Veredelung + models/renders/*.jpg
python3 tools/blender/verify_models.py   # 3. in Blender gegenprüfen
node tools/blender/dump_poses.mjs /tmp/poses.json     # 4. Moves → Pose-Frames
python3 tools/blender/render_anim.py /tmp/poses.json  # 5. Choreo-GIFs (Cycles)
python3 tools/blender/export_example.py out/model.glb
```

`render_anim.py` braucht Pillow (`pip install pillow`) für die GIF-Montage und
setzt die **benannten Rig-Nodes** des Charakter-Exports voraus (`root`,
`pelvis`, `spine`, `head`, `shoulderL/R`, `elbowL/R`, `thighL/R`, `kneeL/R`,
`anchorL/R`, `cheekL/R` — seit dem Naming-Pass in `character/rig.ts`). Die
Po-Backen werden nicht gekeyframt-geraten, sondern mit der Spiel-Federphysik
(k = 190, c = 7, GRAV = 3.2, 120-Hz-Substeps) simuliert.

Regeln für Assets, die ins Spiel gehen:

1. **Low-Poly bleiben.** Subsurf Level ≤ 1–2, Ziel < 5 k Verts pro Modell —
   der Stil ist Cartoon, nicht Realismus, und das Bundle-Budget ist 5 MB.
2. **Material im Spiel zuweisen, nicht in Blender.** Exportierte PBR-Materials
   nur als Platzhalter; nach dem Laden jede Mesh mit `toonMat({...})` +
   `withOutline(...)` re-skinnen, damit authored Modelle exakt wie die
   prozeduralen aussehen (gleiche Cel-Bänder, gleiche Ink-Kante).
3. **Y-up exportieren** (`export_yup=True`, Default im Beispielskript) —
   entspricht der Three.js-Konvention.
4. **`.glb` nach `apps/game/src/assets/models/`**, Import via
   `new URL('./assets/models/x.glb', import.meta.url)` — Vite bündelt/hashed es.

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const gltf = await new GLTFLoader().loadAsync(modelUrl);
gltf.scene.traverse((o) => {
  if ((o as THREE.Mesh).isMesh) {
    (o as THREE.Mesh).material = toonMat({ color: 0xff8d5e });
    withOutline(o as THREE.Mesh);
  }
});
scene.add(gltf.scene);
```

## Wann prozedural, wann authored?

| Prozedural (Status quo)              | Authored (diese Pipeline)               |
| ------------------------------------ | --------------------------------------- |
| Rigs mit Physik-Kontrakt (Cheeks!)   | Statische Hero-Props, Trophäen          |
| Alles, was aus Primitives lesbar ist | Organische Silhouetten, Sculpt-Formen   |
| Per-Theme-Recolor via Code (`hue()`) | Einmalige Showpieces (Boss-Intro o. Ä.) |

Der Charakter-Rig bleibt prozedural: `stepPhysics`/`renderCheeks` schreiben
direkt auf benannte Bones — ein authored Rig müsste diesen Kontrakt exakt
nachbauen, ohne visuellen Gewinn für den Stil.
