"""Blender-Roundtrip-Check: importiert jedes models/**/*.glb in bpy.

Meldet Objekt-/Mesh-/Vertex-Zahlen UND die Textur-Abdeckung pro Datei: jedes
lit (Principled-)Material muss nach dem Senior-Textur-Pass eine Farb- oder
Normal-Map tragen — untexturierte lit Materialien sind ein Befund (Exit 1),
Unlit-Materialien (Ink-Linien, Augenweiß) sind bewusst flach. Aufruf aus dem
Repo-Root:

    python3 tools/blender/verify_models.py
"""

import glob
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def texture_coverage():
    """(lit-Materialien, davon texturiert, unlit-Materialien) der offenen Szene."""
    used = set()
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            if slot.material is not None:
                used.add(slot.material)
    lit, textured, unlit = 0, 0, 0
    for mat in used:
        principled = (
            next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if mat.use_nodes
            else None
        )
        if principled is None:
            unlit += 1
            continue
        lit += 1
        if any(n.type == "TEX_IMAGE" and n.image is not None for n in mat.node_tree.nodes):
            textured += 1
    return lit, textured, unlit


def main() -> int:
    ok, bad = 0, 0
    tot_lit, tot_tex = 0, 0
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
        lit, textured, unlit = texture_coverage()
        tot_lit += lit
        tot_tex += textured
        rel = os.path.relpath(path, ROOT)
        gap = "" if textured == lit else f"  ⚠ {lit - textured} lit Materialien OHNE Textur"
        print(
            f"OK  {rel}  objects={len(bpy.data.objects)} meshes={len(meshes)} verts={verts} "
            f"tex={textured}/{lit} lit (+{unlit} unlit){gap}"
        )
        if textured < lit:
            bad += 1
        else:
            ok += 1
    pct = 100.0 * tot_tex / tot_lit if tot_lit else 0.0
    print(f"\n{ok} ok, {bad} fehlerhaft · Textur-Abdeckung {tot_tex}/{tot_lit} lit ({pct:.1f} %)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
