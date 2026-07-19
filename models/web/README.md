# models/web — web-taugliches Charakter-Asset (Pfirsich-Pirat)

Ein einzelnes, animiertes, Draco-komprimiertes glTF-Asset des Piraten-Skins
für Web-Einbettung — Look des Spiels, optimiert auf Deformation und Ladezeit.

## Inhalt

| Datei               | Zweck                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `character-web.glb` | Das Asset: 1 Mesh · 1 Material (Vertex-Colors) · 18 Bones · Actions `Idle` + `Twerk` (24 fps, geschlossene Loops) · Draco (Pos 14 / Normal 10)                |
| `index.html`        | Demo/Referenz-Integration: three.js `GLTFLoader` + `DRACOLoader` (lokaler Decoder-Pfad!), Hemisphäre + 2 Directionals statt HDRI, Klick wechselt Idle ⇄ Twerk |
| `vendor/`           | three.module (r180), Loader, Draco-Decoder — Demo läuft ohne Build-Step und ohne CDN                                                                          |
| `pose-*.png`        | Deformations-Gates aus der Pipeline (Rest, Ellbogen 90°/Schulter 45°/Hüfte, Twerk-Frame)                                                                      |

## Budgets (Stand: Pipeline-Gate, `web_asset.py` bricht bei Riss ab)

| Metrik        | Ziel   | Max    | Ist               |
| ------------- | ------ | ------ | ----------------- |
| Tris          | 6 000  | 10 000 | ~5 988            |
| Materialslots | 1      | 2      | 1                 |
| Texturgröße   | 512²   | 1024²  | 0 (Vertex-Colors) |
| .glb          | 400 KB | 800 KB | ~97 KB            |
| Bones         | 25     | 40     | 18                |
| Draw Calls    | 1      | 2      | 1 (Asset)         |

## Regenerieren

```bash
# 1) Roh-Export des Piraten aus den Spiel-Buildern (schreibt models/*.glb neu,
#    danach models/ per git zurücksetzen — nur die Kopie wird gebraucht)
node tools/blender/export_all.cjs
cp models/characters/character-pirate.glb /tmp/pirate-raw.glb
git checkout -- models/

# 2) Posen (Idle = Hip Circles @0.85, Twerk = Twerk @1.15, Loops exakt zu)
node tools/blender/dump_web_poses.mjs /tmp/web-poses.json

# 3) Pipeline: Cleanup → Rigid-Gruppen + Vertex-Farben → sublineare
#    Dezimierung → manuelles Armature → Join/Skin → Actions → Draco-Export
python3 tools/blender/web_asset.py /tmp/pirate-raw.glb /tmp/web-poses.json models/web
```

## Integrations-Hinweise

- `DRACOLoader.setDecoderPath()` MUSS gesetzt sein (sonst schlägt das Laden
  stumm fehl) — die Demo nutzt `./vendor/draco/`.
- Für rein statische Einbettung reicht `<model-viewer src="character-web.glb">`
  (Draco wird nativ unterstützt); die Demo zeigt den three.js-Weg, weil die
  Clips interaktiv umgeschaltet werden.
- Licht: Flat-Vertex-Colors brauchen kein HDRI — Hemisphere + 2 Directionals
  genügen und sparen die Environment-Datei.
