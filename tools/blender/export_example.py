"""Beispiel: headless Blender (bpy) → .glb für Three.js.

Baut einen kleinen Test-Peach (UV-Sphere + Subsurf, Blatt-Cube + Bevel) und
exportiert ihn als glTF-2.0-Binary. Verifiziert: der Output wird vom
Three.js-`GLTFLoader` des Spiels sauber geparst (2 Meshes, ~2k Verts).

    python3 tools/blender/export_example.py out/test-peach.glb

Materialien hier sind nur Platzhalter — im Spiel wird jede Mesh nach dem Laden
mit `toonMat` + `withOutline` re-skinnt (siehe tools/blender/README.md).
"""

import sys

import bpy


def build_peach() -> None:
    """Ein Peach-Körper + Blatt — bewusst low-poly (Subsurf Level 1)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1.0)
    body = bpy.context.active_object
    body.name = "PeachBody"
    body.scale = (1.0, 0.95, 0.9)
    sub = body.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    bpy.ops.object.shade_smooth()

    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(0.3, 0, 1.0))
    leaf = bpy.context.active_object
    leaf.name = "Leaf"
    leaf.scale = (1.0, 0.35, 0.25)
    bev = leaf.modifiers.new("bev", "BEVEL")
    bev.width = 0.06
    bev.segments = 2

    peach_mat = bpy.data.materials.new("PeachMat")
    peach_mat.diffuse_color = (1.0, 0.55, 0.37, 1.0)
    body.data.materials.append(peach_mat)
    leaf_mat = bpy.data.materials.new("LeafMat")
    leaf_mat.diffuse_color = (0.5, 0.75, 0.25, 1.0)
    leaf.data.materials.append(leaf_mat)


def export_glb(path: str) -> None:
    """glTF-2.0-Binary, Y-up (Three.js-Konvention), Modifier angewendet."""
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
    )


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "test-peach.glb"
    build_peach()
    export_glb(out)
    print(f"exported {out}")
