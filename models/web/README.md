# models/web — web-taugliche Charakter-Assets (alle 10 Playermodels)

Alle zehn Spieler-Skins als einzelne, animierte, Draco-komprimierte
glTF-Assets für Web-Einbettung — Look des Spiels, optimiert auf Deformation
und Ladezeit. Ein Asset = 1 Mesh · 1 Material (Vertex-Colors) · 18 Bones ·
Actions `Idle` + `Twerk` (24 fps, exakt geschlossene Loops, Cheek-Jiggle aus
der echten Feder-Simulation).

## Inhalt

| Datei               | Zweck                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `<skin>.glb`        | Die 10 Assets: `classic disco robo host boss neon pirate lava gyrator diamond` — je 86–99 KB, Draco (Pos 14 / Normal 10)                        |
| `index.html`        | Demo/Referenz-Integration: three.js `GLTFLoader` + `DRACOLoader` (lokaler Decoder-Pfad!), Skin-Leiste, Klick wechselt Idle ⇄ Twerk, `?m=<skin>` |
| `vendor/`           | three.module (r180), Loader, Draco-Decoder — Demo läuft ohne Build-Step und ohne CDN                                                            |
| `pose-<skin>-*.jpg` | Deformations-Gates der Pipeline (Ellbogen 90°/Schulter 45°/Hüfte + Twerk-Frame, je Skin)                                                        |

## Budgets (Pipeline-Gate, `web_asset.py` bricht bei Riss ab — gilt PRO Asset)

| Metrik        | Ziel   | Max    | Ist (alle 10)     |
| ------------- | ------ | ------ | ----------------- |
| Tris          | 6 000  | 10 000 | ~5 980–6 040      |
| Materialslots | 1      | 2      | 1                 |
| Texturgröße   | 512²   | 1024²  | 0 (Vertex-Colors) |
| .glb          | 400 KB | 800 KB | 86–99 KB          |
| Bones         | 25     | 40     | 18                |
| Draw Calls    | 1      | 2      | 1 (Asset)         |

## Regenerieren

```bash
# 1) Roh-Export aller Playermodels aus den Spiel-Buildern (schreibt
#    models/*.glb neu, danach models/ per git zurücksetzen)
node tools/blender/export_all.cjs
cp models/characters/*.glb /tmp/raw/
git checkout -- models/

# 2) Posen (Idle = Hip Circles @0.85, Twerk = Twerk @1.15, Loops exakt zu)
node tools/blender/dump_web_poses.mjs /tmp/web-poses.json

# 3) Pipeline pro Skin: Cleanup → Rigid-Gruppen + Vertex-Farben → sublineare
#    Dezimierung → manuelles Armature → Join/Skin → Actions → Draco-Export
for f in /tmp/raw/character-*.glb; do
  python3 tools/blender/web_asset.py "$f" /tmp/web-poses.json models/web
done
```

## Integrations-Hinweise

- `DRACOLoader.setDecoderPath()` MUSS gesetzt sein (sonst schlägt das Laden
  stumm fehl) — die Demo nutzt `./vendor/draco/`.
- Für rein statische Einbettung reicht `<model-viewer src="<skin>.glb">`
  (Draco wird nativ unterstützt); die Demo zeigt den three.js-Weg, weil die
  Clips interaktiv umgeschaltet werden.
- Licht: Flat-Vertex-Colors brauchen kein HDRI — Hemisphere + 2 Directionals
  genügen und sparen die Environment-Datei.
- Boss-Skins (`boss`, `diamond`) tragen root.scale 1.12 aus dem Spiel; die
  Pipeline zieht den Faktor auf Bone-Offsets nach (`ROOT_SCALE`).
