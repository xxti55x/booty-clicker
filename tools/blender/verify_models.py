"""Blender-Roundtrip-Check: importiert jedes models/**/*.glb in bpy.

Meldet Objekt-/Mesh-/Vertex-Zahlen pro Datei und schlägt fehl (Exit 1), wenn
ein Import bricht. Aufruf aus dem Repo-Root:

    python3 tools/blender/verify_models.py
"""

import glob
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def main() -> int:
    ok, bad = 0, 0
    for path in sorted(glob.glob(os.path.join(ROOT, "models", "**", "*.glb"), recursive=True)):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        try:
            bpy.ops.import_scene.gltf(filepath=path)
        except Exception as e:  # noqa: BLE001 — jede Import-Panne ist ein Befund
            print(f"BAD {path}: {e}")
            bad += 1
            continue
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        verts = sum(len(o.data.vertices) for o in meshes)
        rel = os.path.relpath(path, ROOT)
        print(f"OK  {rel}  objects={len(bpy.data.objects)} meshes={len(meshes)} verts={verts}")
        ok += 1
    print(f"\n{ok} ok, {bad} fehlerhaft")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
