#!/usr/bin/env python3
"""Rendert die Twerk-Choreografie als Animationen IN Blender (bpy, Cycles).

Kette (aus dem Repo-Root):

    node tools/blender/dump_poses.mjs /tmp/poses.json      # Moves → Pose-Frames
    python3 tools/blender/render_anim.py /tmp/poses.json   # Frames → GIFs

Für jeden Move wird das benannte Charakter-Rig (models/characters/…) frisch
importiert, die Pose-Frames werden per `applyPose`-Mapping (character/physics.ts)
auf die glTF-Nodes gekeyframet, die Po-Backen laufen durch dieselbe
Feder-Dämpfer-Simulation wie im Spiel (k=190, c=7, GRAV=3.2, 120-Hz-Substeps)
und Cycles rendert die Sequenz; Pillow baut daraus Loop-GIFs nach
models/renders/anim/.

Koordinaten: der glTF-Importer konvertiert JEDEN Node nach Z-up —
Position (x,y,z)_three → (x,−z,y)_blender, Rotation per Konjugation mit
C = Rx(+90°). Three-Euler 'XYZ' wird mit der exakten three.js-Formel in ein
Quaternion übersetzt (keine Euler-Reihenfolge-Raterei).
"""

import json
import math
import os
import re
import sys

import bpy
from mathutils import Quaternion, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL = os.path.join(ROOT, "models", "characters", "character-classic.glb")
OUT_DIR = os.path.join(ROOT, "models", "renders", "anim")
FRAME_TMP = os.path.join(ROOT, "models", "renders", ".animframes")

BASE_ROOT_Y = -1.12  # character/rig.ts — Root sitzt auf Beckenhöhe
PELVIS_BASE_Y = 0.9  # rig.ts pelvis.position.y (applyPose schreibt nur x/z)
SPRING_K, SPRING_C, GRAV = 190.0, 7.0, 3.2  # physics.ts Cheek-Feder
SUB_DT = 1.0 / 120.0

RES_X, RES_Y, SAMPLES = 480, 600, 24

# C: three-Raum → Blender-Raum (pro Node, siehe Modul-Doc)
CONV = Quaternion((1.0, 0.0, 0.0), math.radians(90.0))
CONV_INV = CONV.inverted()


def q_three_euler_xyz(x, y, z):
    """three.js Quaternion.setFromEuler(order='XYZ') — exakte Formel."""
    c1, c2, c3 = math.cos(x / 2), math.cos(y / 2), math.cos(z / 2)
    s1, s2, s3 = math.sin(x / 2), math.sin(y / 2), math.sin(z / 2)
    return Quaternion((
        c1 * c2 * c3 - s1 * s2 * s3,
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
    ))


def to_blender(q):
    return CONV @ q @ CONV_INV


def vec_to_blender(x, y, z):
    return Vector((x, -z, y))


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def find(name):
    o = bpy.data.objects.get(name)
    if o is None:
        raise RuntimeError(f"Rig-Node '{name}' fehlt im glb — Export zu alt? "
                           "tools/blender/export_all.cjs neu laufen lassen.")
    return o


def pose_rig(nodes, p):
    """applyPose (physics.ts) 1:1 auf die glTF-Nodes — absolute lokale Werte."""
    nodes["root"].location = vec_to_blender(0.0, BASE_ROOT_Y + p["rootY"], 0.0)
    nodes["root"].rotation_quaternion = to_blender(q_three_euler_xyz(0.0, p["rootRotY"], 0.0))
    nodes["pelvis"].location = vec_to_blender(p["hipPosX"], PELVIS_BASE_Y, p["hipPosZ"])
    nodes["pelvis"].rotation_quaternion = to_blender(q_three_euler_xyz(p["hipX"], 0.0, p["hipZ"]))
    nodes["spine"].rotation_quaternion = to_blender(
        q_three_euler_xyz(p["spineX"], p["spineY"], p["spineZ"])
    )
    nodes["head"].rotation_quaternion = to_blender(q_three_euler_xyz(p["headX"], 0.0, p["headZ"]))
    nodes["shoulderL"].rotation_quaternion = to_blender(
        q_three_euler_xyz(p["armLX"], 0.0, p["armLZ"])
    )
    nodes["shoulderR"].rotation_quaternion = to_blender(
        q_three_euler_xyz(p["armRX"], 0.0, p["armRZ"])
    )
    nodes["elbowL"].rotation_quaternion = to_blender(q_three_euler_xyz(p["elbL"], 0.0, 0.0))
    nodes["elbowR"].rotation_quaternion = to_blender(q_three_euler_xyz(p["elbR"], 0.0, 0.0))
    nodes["thighL"].rotation_quaternion = to_blender(q_three_euler_xyz(-p["kneeL"] * 0.55, 0, 0))
    nodes["thighR"].rotation_quaternion = to_blender(q_three_euler_xyz(-p["kneeR"] * 0.55, 0, 0))
    nodes["kneeL"].rotation_quaternion = to_blender(q_three_euler_xyz(p["kneeL"] * 1.15, 0, 0))
    nodes["kneeR"].rotation_quaternion = to_blender(q_three_euler_xyz(p["kneeR"] * 1.15, 0, 0))


def lerp_pose(a, b, t):
    return {k: a[k] + (b[k] - a[k]) * t for k in a}


FLOOR_Z = -2.42  # rig.ts: „feet plant at y = −2.4" (three-y = Blender-z) + Sohle


def add_floor():
    """Warmer Studio-Boden unter den Füßen — erdet den Tanz + Kontaktschatten."""
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=7.0, fill_type="NGON",
                                      location=(0, 0, FLOOR_Z))
    floor = bpy.context.active_object
    floor.name = "StudioFloor"
    mat = bpy.data.materials.new("StudioFloorMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.42, 0.31, 0.19, 1)  # Holzbühne
    bsdf.inputs["Roughness"].default_value = 0.85
    floor.data.materials.append(mat)


def studio(center, size):
    """3-Punkt-Sonnen + Kamera, angelehnt an refine_models.studio_rig, mit
    extra Rand für die Tanz-Auslenkung (Hüft-Orbits ±0.3, Drops −0.6)."""
    sc = bpy.context.scene
    dist = size * 1.5 + 2.4
    az, el = math.radians(35), math.radians(14)
    cam_data = bpy.data.cameras.new("AnimCam")
    cam = bpy.data.objects.new("AnimCam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = (
        center.x + dist * math.cos(el) * math.sin(az),
        center.y - dist * math.cos(el) * math.cos(az),
        center.z + dist * math.sin(el),
    )
    cam.rotation_euler = (Vector(center) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam

    def sun(name, energy, az_deg, el_deg, color=(1, 1, 1)):
        light = bpy.data.lights.new(name, "SUN")
        light.energy = energy
        light.color = color
        ob = bpy.data.objects.new(name, light)
        sc.collection.objects.link(ob)
        ob.rotation_euler = (math.radians(90 - el_deg), 0, math.radians(az_deg))

    sun("Key", 4.5, 35, 50, (1.0, 0.96, 0.88))
    sun("Fill", 1.6, -50, 30, (0.82, 0.88, 1.0))
    sun("Rim", 2.4, 160, 40, (1.0, 0.85, 0.95))
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.055, 0.05, 0.085, 1)
    sc.world = world


def render_move(name, rows, fps):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=MODEL)
    node_names = [
        "root", "pelvis", "spine", "head", "shoulderL", "shoulderR",
        "elbowL", "elbowR", "thighL", "thighR", "kneeL", "kneeR",
    ]
    nodes = {n: find(n) for n in node_names}
    for o in nodes.values():
        o.rotation_mode = "QUATERNION"
    anchors = {s: find(f"anchor{s}") for s in ("L", "R")}
    cheeks = {s: find(f"cheek{s}") for s in ("L", "R")}
    for c in cheeks.values():
        c.rotation_mode = "QUATERNION"
    cheek_mesh = {s: cheeks[s].children[0] if cheeks[s].children else None for s in ("L", "R")}
    view = bpy.context.view_layer

    # Feder-Startzustand: 1 s Warm-up auf der Frame-0-Pose (wie das Spiel, das
    # die Cheeks am Anker initialisiert und sofort einschwingt).
    pose_rig(nodes, rows[0])
    view.update()
    state = {}
    for s in ("L", "R"):
        p = anchors[s].matrix_world.translation.copy()
        state[s] = {"p": p, "v": Vector((0, 0, 0))}
    for _ in range(120):
        step_cheeks(state, anchors)

    n = len(rows)
    sub = max(1, round((1.0 / fps) / SUB_DT))
    for i in range(n):
        prev = rows[i - 1] if i > 0 else rows[0]
        for k in range(sub):
            pose_rig(nodes, lerp_pose(prev, rows[i], (k + 1) / sub))
            view.update()
            step_cheeks(state, anchors)
        for o in nodes.values():
            o.keyframe_insert("rotation_quaternion", frame=i + 1)
        nodes["root"].keyframe_insert("location", frame=i + 1)
        nodes["pelvis"].keyframe_insert("location", frame=i + 1)
        pelvis_q = nodes["pelvis"].matrix_world.to_quaternion()
        for s in ("L", "R"):
            g = cheeks[s]
            g.matrix_parent_inverse.identity()
            g.location = state[s]["p"]
            g.rotation_quaternion = pelvis_q
            g.keyframe_insert("location", frame=i + 1)
            g.keyframe_insert("rotation_quaternion", frame=i + 1)
            m = cheek_mesh[s]
            if m is not None:
                spd = min(state[s]["v"].length * 0.085, 0.35)
                sy = 1 + (spd if state[s]["v"].z > 0 else -spd) * 0.8
                # three-Scale (x,y,z) → Blender (x,z,y): y (hoch) ist Blender-z
                m.scale = (1.06 / math.sqrt(sy), 0.94 / math.sqrt(sy), 1.0 * sy)
                m.keyframe_insert("scale", frame=i + 1)

    # Kamera auf die Gesamt-Ausdehnung des Tanzes framen (BBox über alle Frames).
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    sc = bpy.context.scene
    for i in (0, n // 4, n // 2, (3 * n) // 4, n - 1):
        sc.frame_set(i + 1)
        view.update()
        for o in bpy.data.objects:
            if o.type == "MESH":
                for corner in o.bound_box:
                    w = o.matrix_world @ Vector(corner)
                    lo = Vector(map(min, lo, w))
                    hi = Vector(map(max, hi, w))
    center = (lo + hi) / 2
    size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    add_floor()
    studio(center, size)

    sc.frame_start, sc.frame_end = 1, n
    sc.render.engine = "CYCLES"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.resolution_x = RES_X
    sc.render.resolution_y = RES_Y
    sc.render.fps = fps
    sc.render.image_settings.file_format = "PNG"
    frame_dir = os.path.join(FRAME_TMP, slug(name))
    os.makedirs(frame_dir, exist_ok=True)
    sc.render.filepath = os.path.join(frame_dir, "f")
    bpy.ops.render.render(animation=True)
    return frame_dir


def step_cheeks(state, anchors):
    for s in ("L", "R"):
        target = anchors[s].matrix_world.translation
        st = state[s]
        st["v"].x += (SPRING_K * (target.x - st["p"].x) - SPRING_C * st["v"].x) * SUB_DT
        st["v"].y += (SPRING_K * (target.y - st["p"].y) - SPRING_C * st["v"].y) * SUB_DT
        st["v"].z += (SPRING_K * (target.z - st["p"].z) - SPRING_C * st["v"].z - GRAV) * SUB_DT
        st["p"] += st["v"] * SUB_DT


def build_gif(frame_dir, out_path, fps):
    from PIL import Image

    files = sorted(
        os.path.join(frame_dir, f) for f in os.listdir(frame_dir) if f.endswith(".png")
    )
    imgs = [
        Image.open(f).convert("RGB").resize((420, 525), Image.LANCZOS)
        .quantize(colors=128, dither=Image.FLOYDSTEINBERG)
        for f in files
    ]
    imgs[0].save(
        out_path,
        save_all=True,
        append_images=imgs[1:],
        duration=round(1000 / fps),
        loop=0,
        optimize=True,
    )


def main():
    poses_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/poses.json"
    only = sys.argv[2].split(",") if len(sys.argv) > 2 else None
    with open(poses_path) as f:
        data = json.load(f)
    fps = data["fps"]
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, rows in data["frames"].items():
        if only and slug(name) not in [slug(o) for o in only]:
            continue
        frame_dir = render_move(name, rows, fps)
        gif = os.path.join(OUT_DIR, f"{slug(name)}.gif")
        build_gif(frame_dir, gif, fps)
        print(f"OK {name}: {gif} ({os.path.getsize(gif) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
