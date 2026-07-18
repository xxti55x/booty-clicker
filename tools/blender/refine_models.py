"""Blender-Refine-Pass über models/**/*.glb — deterministisch, reproduzierbar.

Der Export aus den Three.js-Buildern ist geometrisch roh: doppelte Vertices an
Primitive-Nähten, teils flache Normals, und die Bühnen-Szenerien sind lose
Prop-Wolken ohne Boden. Dieser Pass veredelt jedes Modell IN Blender (bpy) und
schreibt es an Ort und Stelle zurück, sodass die .glb danach ohne weitere
Nacharbeit nutzbar sind:

  · Mesh-Hygiene: Merge-by-Distance (Nähte verschweißen), Normals nach außen,
    Shade-Smooth-by-Angle (60°) — glatte Rundungen, harte Kanten bleiben hart.
  · Material-Politur: mattes Cartoon-Finish (Roughness angehoben), damit die
    PBR-Materialien nicht plastikglänzend rendern.
  · Szenerie-Dioramen (WICHTIG): jede Bühne bekommt einen thematischen Boden
    (Club-Parkett dunkel-glossy, Synth-Grid-Violett, Strand-Sand, Weltraum-
    Asphalt mit Sternstaub-Aufhellung), passend zur Prop-Ausdehnung skaliert —
    aus der Prop-Wolke wird ein in sich geschlossenes Diorama.
  · Render-Nachweis: jedes Modell wird mit einem Studio-Rig (3-Punkt-Licht,
    Auto-Framing über die Bounding-Box) in Cycles gerendert →
    models/renders/<name>.jpg. Das Studio-Rig wird NICHT exportiert.

Aufruf aus dem Repo-Root (Reihenfolge der Pipeline: erst export_all.cjs, dann
dieser Pass, dann verify_models.py):

    python3 tools/blender/refine_models.py            # refine + render
    python3 tools/blender/refine_models.py --no-render
"""

import glob
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "models")
RENDERS = os.path.join(MODELS, "renders")

SMOOTH_ANGLE = math.radians(60.0)
MERGE_DIST = 1e-4

# Thematischer Dioramen-Boden je Bühne: (Farbe RGBA, Roughness, Metallic, Emission-Stärke)
STAGE_FLOORS = {
    "stage-club": ((0.045, 0.035, 0.06, 1.0), 0.25, 0.0, 0.0),
    # synth: das In-Game-Grid ist LINIEN-Geometrie (renderlos dünn) — der Disc trägt.
    "stage-synth": ((0.16, 0.06, 0.28, 1.0), 0.35, 0.0, 0.08),
    "stage-beach": ((0.82, 0.68, 0.42, 1.0), 0.9, 0.0, 0.0),
    "stage-space": ((0.02, 0.02, 0.045, 1.0), 0.6, 0.0, 0.02),
}


def mesh_objects():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def obj_span(o):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for c in o.bound_box:
        p = o.matrix_world @ Vector(c)
        for i in range(3):
            lo[i] = min(lo[i], p[i])
            hi[i] = max(hi[i], p[i])
    return lo, hi


def core_objects():
    """Meshes ohne Backdrop-Riesen: Bühnen enthalten Kulissen-Megaplanes (Meer
    90×45, Synth-Grid 80×80, Sternfeld 111) fürs In-Game-Kamerafrustum. Fürs
    Diorama (Boden-Radius + Kamera-Framing) zählt der PROP-Kern — alles, dessen
    Einzelspann ≤ 55 % des Gesamtspanns bleibt."""
    objs = mesh_objects()
    if not objs:
        return objs
    lo, hi = scene_bbox(objs)
    total = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    core = []
    for o in objs:
        olo, ohi = obj_span(o)
        dims = ohi - olo
        span = max(dims.x, dims.y, dims.z)
        if span > total * 0.55:
            continue  # Backdrop-Megaplane
        if dims.y < 0.06 * max(dims.x, dims.z, 0.001) and max(dims.x, dims.z) >= 3:
            continue  # Sky-Billboard (Sonne/Mond) — Hintergrund, nicht Prop-Kern
        core.append(o)
    return core or objs


def scene_bbox(objs):
    """Weltraum-Bounding-Box über alle Meshes."""
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo.x, lo.y, lo.z = min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)
            hi.x, hi.y, hi.z = max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)
    return lo, hi


def refine_meshes():
    """Weld + Normals + Smooth-by-Angle über jede Mesh — der Kern-Refine."""
    for o in mesh_objects():
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=MERGE_DIST)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=SMOOTH_ANGLE)
        except AttributeError:
            bpy.ops.object.shade_smooth()


def polish_materials():
    """Mattes Cartoon-Finish: kein Plastik-Glanz aus glTF-Defaults."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        rough = bsdf.inputs.get("Roughness")
        if rough is not None and rough.default_value < 0.55:
            rough.default_value = 0.65


def add_stage_floor(stem):
    """Dioramen-Boden unter die Prop-Wolke einer Bühne (Teil des Assets)."""
    cfg = STAGE_FLOORS.get(stem)
    if cfg is None:
        return
    color, rough, metal, emit = cfg
    # Blender importiert glTF nach Z-up: Boden liegt in der XY-Ebene unter min-Z.
    lo, hi = scene_bbox(core_objects())
    center = (lo + hi) / 2
    radius = max(hi.x - lo.x, hi.y - lo.y) * 0.55 + 1.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64,
        radius=radius,
        depth=0.22,
        location=(center.x, center.y, lo.z - 0.11),
    )
    floor = bpy.context.active_object
    floor.name = f"{stem}-diorama-floor"
    mat = bpy.data.materials.new(f"{stem}-floor")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit > 0:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emit
    floor.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    if stem == "stage-beach":
        # Sand-Insel IM Ozean: größerer glossy Wasser-Disc knapp unter der Sandkante.
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=64,
            radius=radius * 1.55,
            depth=0.14,
            location=(center.x, center.y, lo.z - 0.19),
        )
        sea = bpy.context.active_object
        sea.name = f"{stem}-diorama-ocean"
        smat = bpy.data.materials.new(f"{stem}-ocean")
        smat.use_nodes = True
        sb = next(n for n in smat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        sb.inputs["Base Color"].default_value = (0.07, 0.32, 0.55, 1.0)
        sb.inputs["Roughness"].default_value = 0.12
        sea.data.materials.append(smat)
        bpy.ops.object.shade_smooth()


def stage_surgery(stem):
    """Kuratierte Bühnen-Eingriffe (deterministisch, per geometrischer Signatur):
    Sky-Billboards emissiv, Weltraum-Sternfeld raus, Beach-Meer als Wasserstreifen
    bündig hinter die Props gelegt."""
    objs = mesh_objects()
    lo, hi = scene_bbox(objs)
    total = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    core_lo, core_hi = scene_bbox(core_objects())

    def principled(o):
        mat = o.active_material
        if not mat or not mat.use_nodes:
            return None
        return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)

    for o in list(objs):
        olo, ohi = obj_span(o)
        dims = ohi - olo
        span = max(dims.x, dims.y, dims.z)

        # Sky-Billboards (Sonne/Mond): große, in Y flache Vertikal-Discs → leuchten.
        if dims.y < 0.06 * max(dims.x, dims.z, 0.001) and max(dims.x, dims.z) >= 3 and span < total * 0.55:
            b = principled(o)
            if b is None:
                mat = bpy.data.materials.new(f"{stem}-sun")
                mat.use_nodes = True
                b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
                b.inputs["Base Color"].default_value = (1.0, 0.5, 0.18, 1.0)
                o.data.materials.clear()
                o.data.materials.append(mat)
            col = tuple(b.inputs["Base Color"].default_value[:3])
            warm = col if max(col) > 0.3 else (1.0, 0.55, 0.2)
            b.inputs["Emission Color"].default_value = (*warm, 1.0)
            b.inputs["Emission Strength"].default_value = 2.5
            if stem == "stage-beach":
                # Sonne an den Horizont des Insel-Dioramas (hinter die Props).
                r = max(core_hi.x - core_lo.x, core_hi.y - core_lo.y) * 0.55 + 1.5
                o.location = (
                    (core_lo.x + core_hi.x) / 2 - 2.0,
                    core_hi.y + r * 0.55,
                    core_lo.z + 2.2,
                )
            continue

        if span <= total * 0.55:
            continue

        # Weltraum: das 111-Einheiten-Sternfeld ist Himmel, kein Diorama-Inhalt.
        if stem == "stage-space":
            bpy.data.objects.remove(o, do_unlink=True)
            continue

        # Beach: die 90×45-Meer-Plane fliegt raus — das Insel-Diorama bekommt
        # stattdessen einen glänzenden Ozean-Disc unter dem Sand (add_stage_floor).
        if stem == "stage-beach" and dims.z < 0.05 * span:
            bpy.data.objects.remove(o, do_unlink=True)


def studio_rig(wide):
    """3-Punkt-Licht + Auto-Framing-Kamera über die KERN-Bounding-Box (nur Render)."""
    sc = bpy.context.scene
    lo, hi = scene_bbox(core_objects())
    center = (lo + hi) / 2
    size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    dist = size * (1.3 if wide else 1.35) + 2.0

    cam_data = bpy.data.cameras.new("StudioCam")
    cam = bpy.data.objects.new("StudioCam", cam_data)
    sc.collection.objects.link(cam)
    # 3/4-Ansicht leicht von oben — Blender-Welt ist Z-up (Import konvertiert).
    az = math.radians(35)
    el = math.radians(18 if not wide else 26)
    cam.location = (
        center.x + dist * math.cos(el) * math.sin(az),
        center.y - dist * math.cos(el) * math.cos(az),
        center.z + dist * math.sin(el),
    )
    direction = Vector((center.x, center.y, center.z)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam

    def sun(name, energy, az_deg, el_deg, color=(1, 1, 1)):
        light = bpy.data.lights.new(name, "SUN")
        light.energy = energy
        light.color = color
        ob = bpy.data.objects.new(name, light)
        sc.collection.objects.link(ob)
        ob.rotation_euler = (
            math.radians(90 - el_deg),
            0,
            math.radians(az_deg),
        )
        return ob

    sun("Key", 4.5, 35, 50, (1.0, 0.96, 0.88))
    sun("Fill", 1.6, -50, 30, (0.82, 0.88, 1.0))
    sun("Rim", 2.4, 160, 40, (1.0, 0.85, 0.95))

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.055, 0.05, 0.085, 1)
    sc.world = world


def render_to(path, samples, res):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 88
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def process(path, do_render):
    stem = os.path.splitext(os.path.basename(path))[0]
    is_stage = stem.startswith("stage-")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)

    refine_meshes()
    polish_materials()
    if is_stage:
        stage_surgery(stem)
        add_stage_floor(stem)

    # Export ZUERST (nur Modell-Inhalt), dann das Studio-Rig fürs Render obendrauf.
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True)

    if do_render:
        studio_rig(wide=is_stage)
        os.makedirs(RENDERS, exist_ok=True)
        render_to(
            os.path.join(RENDERS, f"{stem}.jpg"),
            samples=48 if is_stage else 32,
            res=768 if is_stage else 576,
        )

    verts = sum(len(o.data.vertices) for o in mesh_objects())
    print(f"OK {stem}: verts={verts}{' + Diorama-Boden' if is_stage else ''}")


def main():
    do_render = "--no-render" not in sys.argv
    paths = sorted(glob.glob(os.path.join(MODELS, "**", "*.glb"), recursive=True))
    if not paths:
        print("keine Modelle gefunden — erst tools/blender/export_all.cjs laufen lassen")
        return 1
    for path in paths:
        process(path, do_render)
    print(f"\n{len(paths)} Modelle verfeinert{' + gerendert' if do_render else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
