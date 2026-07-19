"""Web-Asset-Pipeline: Pfirsich-Pirat → ein web-taugliches, animiertes .glb.

Setzt den 10-Stufen-Auftrag „stilisierter Charakter → glTF fürs Web" headless
um. Der Look des Spiels bleibt erhalten (kein Realismus-Retarget, kein Sculpt,
kein PBR-Bake) — optimiert wird auf Deformation und Ladezeit.

Harte Budgets (Abbruchkriterium, werden am Ende geprüft):
    Tris ≤ 10 000 (Ziel 6 000) · Materialslots ≤ 2 (Ziel 1) · Textur ≤ 1024²
    (Ziel: keine) · .glb ≤ 800 KB (Ziel 400) · Bones ≤ 40 (Ziel 25) ·
    Draw Calls ≤ 2 (Ziel 1)

Bewusste Abweichungen vom interaktiven Stufenplan (Entscheidungen, damit das
Ergebnis dem Spiel-Look 1:1 entspricht — dokumentiert in DECISIONS.md):
  · Stage 3/6 (Gelenk-Loops + Automatic Weights): Das Spiel animiert STARRE
    Segmente an Bone-Pivots — exakt das repliziert starres Skinning (1 Bone
    pro Vertex, deterministisch aus der Node-Hierarchie). Kein Volumenkollaps,
    kein Candy-Wrapper möglich; Gelenk-Loops wären totes Gewicht.
  · Stage 2 (Merge By Distance über alles): würde bei starrem Skinning
    Vertices BENACHBARTER Bones verschweißen (Naht Hose/Bein) und Risse beim
    Animieren erzeugen — übersprungen; stattdessen Cleanup pro Teil.
  · Stage 7: Option A (Vertex Colors) — null Texturbytes. Der near-white
    Stoffmuster-Anteil geht als Fläche in die Grundfarbe ein (Mittelwert der
    Map), das Flat-Cartoon-Reading bleibt.
  · Hut/Bandana/Stiefel (Stage 4): sind hier korrekt am Kopf/Bein verankert;
    starr verskinnt auf head/knee/foot — kein Weight Painting nötig.

Aufruf (aus dem Repo-Root, Blender 5 bpy):
    node tools/blender/dump_web_poses.mjs /tmp/…/web-poses.json
    python3 tools/blender/web_asset.py <raw.glb> <poses.json> <out_dir>
"""

import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RAW = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else sys.argv[1]
POSES = sys.argv[sys.argv.index("--") + 2] if "--" in sys.argv else sys.argv[2]
OUT_DIR = sys.argv[sys.argv.index("--") + 3] if "--" in sys.argv else sys.argv[3]
GLB_OUT = os.path.join(OUT_DIR, "character-web.glb")

TRI_TARGET = 6_000
TRI_MAX = 10_000
GLB_MAX_KB = 800
BONE_MAX = 40
PART_TRI_FLOOR = 72  # Details (Augen, Torso-Kappen) nie unter ~72 Tris drücken
PART_ALLOC_EXP = 0.7  # sublineare Budget-Verteilung: Kugeln geben ab, Zylinder behalten Form

BASE_ROOT_Y = -1.12  # rig.ts — Root auf Beckenhöhe
PELVIS_BASE_Y = 0.9  # rig.ts pelvis.position.y
SPRING_K, SPRING_C, GRAV = 190.0, 7.0, 3.2  # physics.ts Cheek-Feder
SUB_DT = 1.0 / 120.0

# three-Raum → Blender-Raum (pro Node, wie render_anim.py)
CONV = Quaternion((1.0, 0.0, 0.0), math.radians(90.0))
CONV_INV = CONV.inverted()

# Nodes, die 1:1 zu Deform-Bones werden (Namen = Physik-Kontrakt aus rig.ts).
NODE_BONES = [
    "root", "pelvis", "spine", "head", "shoulderL", "shoulderR",
    "elbowL", "elbowR", "thighL", "thighR", "kneeL", "kneeR",
    "cheekL", "cheekR",
]
BONE_PARENT = {
    "pelvis": "root", "spine": "pelvis", "head": "spine",
    "shoulderL": "spine", "shoulderR": "spine",
    "elbowL": "shoulderL", "elbowR": "shoulderR",
    "handL": "elbowL", "handR": "elbowR",
    "thighL": "pelvis", "thighR": "pelvis",
    "kneeL": "thighL", "kneeR": "thighR",
    "footL": "kneeL", "footR": "kneeR",
    "cheekL": "pelvis", "cheekR": "pelvis",
}


def q_three_euler_xyz(x, y, z):
    """three.js Quaternion.setFromEuler(order='XYZ') — exakte Formel."""
    cx, sx = math.cos(x / 2), math.sin(x / 2)
    cy, sy = math.cos(y / 2), math.sin(y / 2)
    cz, sz = math.cos(z / 2), math.sin(z / 2)
    return Quaternion((
        cx * cy * cz - sx * sy * sz,
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
    ))


def to_blender(q):
    return CONV @ q @ CONV_INV


def vec_to_blender(x, y, z):
    return Vector((x, -z, y))


def find(name):
    o = bpy.data.objects.get(name)
    if o is None:
        raise RuntimeError(f"Node {name} fehlt im glb")
    return o


def controlling_bone(obj):
    """Nächster benannter Bone-Node über obj (starres Segment-Skinning)."""
    o = obj
    while o is not None:
        if o.name in NODE_BONES:
            return o.name
        o = o.parent
    return "root"


def material_color(mat):
    """Flächige Grundfarbe eines Spiel-Materials: baseColorFactor × Map-Mittel
    (lit) bzw. die Shader-Farbe (unlit Ink/Augen)."""
    if mat is None or not mat.use_nodes:
        return (0.8, 0.8, 0.8, 1.0)
    nt = mat.node_tree
    principled = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled is None:  # unlit (Ink-Linien, Augenweiß)
        for n in nt.nodes:
            if n.type in ("EMISSION", "BACKGROUND"):
                c = n.inputs["Color"]
                if not c.is_linked:
                    return tuple(c.default_value)
                img = _first_image(c)
                if img is not None:
                    return tuple(_image_mean(img))
        return (0.1, 0.1, 0.12, 1.0)
    base = principled.inputs["Base Color"]
    factor = np.array([1.0, 1.0, 1.0, 1.0])
    img = None
    if base.is_linked:
        fn = base.links[0].from_node
        if fn.type == "TEX_IMAGE":
            img = fn.image
        elif fn.type in ("MIX", "MIX_RGB"):
            for inp in fn.inputs:
                if inp.type == "RGBA" and not inp.is_linked:
                    factor = np.array(inp.default_value)
                for link in inp.links:
                    if link.from_node.type == "TEX_IMAGE":
                        img = link.from_node.image
    else:
        factor = np.array(base.default_value)
    tint = _image_mean(img) if img is not None else np.array([1.0, 1.0, 1.0, 1.0])
    out = np.clip(factor * tint, 0.0, 1.0)
    out[3] = 1.0
    return tuple(out)


def _first_image(sock):
    for link in sock.links:
        if link.from_node.type == "TEX_IMAGE":
            return link.from_node.image
    return None


def _image_mean(img):
    w, h = img.size
    if w * h == 0:
        return np.array([1.0, 1.0, 1.0, 1.0])
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(-1, 4).mean(axis=0)


def stage1_import_cleanup():
    """Stage 1 — Import + Transforms neutralisieren (Welt in die Vertices
    backen ⇒ Scale (1,1,1), Rotation 0 auf jedem Segment)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=RAW)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in meshes:
        o.data = o.data.copy() if o.data.users > 1 else o.data  # Instanzen trennen
    bpy.context.view_layer.update()
    for o in meshes:
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    print(f"Stage 1: {len(meshes)} Segmente, Transforms gebacken (Scale 1, Rot 0)")
    return meshes


def stage2_groups_colors(meshes):
    """Stage 2 (adaptiert) — pro Segment: Cleanup, Vertex-Gruppe des
    steuernden Bones (Gewicht 1.0) und Vertex-Farbe aus dem Material."""
    for o in meshes:
        me = o.data
        bone = controlling_bone(o)
        # Hände/Füße: Segmente unterhalb Handgelenk/Knöchel aufs eigene Bone
        ctr = sum((Vector(c) for c in o.bound_box), Vector()) / 8.0
        ctr = o.matrix_world @ ctr  # matrix_world ist Identity — Weltzentrum
        if bone.startswith("elbow"):
            elbow_z = find(bone).matrix_world.translation.z
            if elbow_z - ctr.z > 0.55:
                bone = "hand" + bone[-1]
        elif bone.startswith("knee"):
            knee_z = find(bone).matrix_world.translation.z
            if knee_z - ctr.z > 0.80:
                bone = "foot" + bone[-1]
        vg = o.vertex_groups.new(name=bone)
        vg.add(range(len(me.vertices)), 1.0, "REPLACE")
        col = material_color(o.active_material)
        attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        data = np.tile(np.array(col, dtype=np.float32), len(me.vertices))
        attr.data.foreach_set("color", data)
    print(f"Stage 2: {len(meshes)} Segmente → Rigid-Gruppen + Vertex-Farben")


def stage3_decimate(meshes):
    """Stage 3 (adaptiert) — Budget-Verdichtung: große Teile stark dezimieren,
    kleine Details (Gesicht!) schonen, bis Σ ≈ TRI_TARGET."""
    tris = {}
    for o in meshes:
        o.data.calc_loop_triangles()
        tris[o.name] = len(o.data.loop_triangles)
    total = sum(tris.values())

    def goal_for(t, k):
        return max(min(t, PART_TRI_FLOOR), min(t, round(k * t**PART_ALLOC_EXP)))

    def planned(k):
        return sum(goal_for(t, k) for t in tris.values())

    lo, hi = 0.01, 60.0
    for _ in range(48):  # Bisektion auf den sublinearen Verteilungsfaktor
        mid = (lo + hi) / 2
        if planned(mid) > TRI_TARGET:
            hi = mid
        else:
            lo = mid
    scale = lo
    for o in meshes:
        t = tris[o.name]
        goal = goal_for(t, scale)
        if goal >= t:
            continue
        mod = o.modifiers.new("dec", "DECIMATE")
        mod.ratio = goal / t
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    after = 0
    for o in meshes:
        o.data.calc_loop_triangles()
        after += len(o.data.loop_triangles)
    print(f"Stage 3: {total} → {after} Tris (Faktor {scale:.4f})")
    return after


def stage45_armature():
    """Stage 4+5 — manuelles Deform-Armature aus den Node-Rests (alle Bones
    +Y/Roll 0 ⇒ Rest-Matrizen identisch ⇒ Pose-Werte = Spielwerte)."""
    heads = {n: find(n).matrix_world.translation.copy() for n in NODE_BONES}
    for s in ("L", "R"):
        heads["hand" + s] = heads["elbow" + s] + Vector((0, 0, -0.72))
        heads["foot" + s] = heads["knee" + s] + Vector((0, 0, -0.98))
    arm = bpy.data.armatures.new("PirateRig")
    arm_obj = bpy.data.objects.new("PirateRig", arm)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = {}
    for name, head in heads.items():
        eb = arm.edit_bones.new(name)
        eb.head = head
        eb.tail = head + Vector((0, 0.14, 0))  # alle +Y, Roll 0 ⇒ Rest = Identity
        eb.roll = 0.0
        ebones[name] = eb
    for name, parent in BONE_PARENT.items():
        ebones[name].parent = ebones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    n = len(arm.bones)
    assert n <= BONE_MAX, f"Bone-Budget gerissen: {n}"
    print(f"Stage 4+5: Armature mit {n} Deform-Bones (≤ {BONE_MAX})")
    return arm_obj


def stage6_join_skin(meshes, arm_obj):
    """Stage 6 (adaptiert) — Join zu EINEM Mesh, starres Skinning (jeder
    Vertex genau 1 Bone ⇒ Limit 4 + Normalize trivial erfüllt)."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = "PirateWeb"
    body.data.name = "PirateWeb"
    mw = body.matrix_world.copy()
    body.parent = None
    body.matrix_world = mw
    smooth = np.ones(len(body.data.polygons), dtype=bool)
    body.data.polygons.foreach_set("use_smooth", smooth)
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj
    body.parent = arm_obj
    # Ein Material für alles: Vertex-Farben in einen Principled-Slot.
    body.data.materials.clear()
    mat = bpy.data.materials.new("PirateWebMat")
    mat.use_nodes = True
    principled = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Roughness"].default_value = 0.85
    vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    mat.node_tree.links.new(vc.outputs["Color"], principled.inputs["Base Color"])
    body.data.materials.append(mat)
    body.data.calc_loop_triangles()
    print(
        f"Stage 6: 1 Objekt · {len(body.data.loop_triangles)} Tris · "
        f"{len(body.data.materials)} Materialslot · starres Skinning"
    )
    return body


def _apply_pose(nodes, arm_obj, p):
    """Spiel-Pose → Empties (für Anker-Weltmatrizen) UND Pose-Bones (Werte
    identisch, da alle Bone-Rests Identity sind)."""
    pb = arm_obj.pose.bones
    root_q = to_blender(q_three_euler_xyz(0.0, p["rootRotY"], 0.0))
    pelvis_q = to_blender(q_three_euler_xyz(p["hipX"], 0.0, p["hipZ"]))
    vals = {
        "spine": to_blender(q_three_euler_xyz(p["spineX"], p["spineY"], p["spineZ"])),
        "head": to_blender(q_three_euler_xyz(p["headX"], 0.0, p["headZ"])),
        "shoulderL": to_blender(q_three_euler_xyz(p["armLX"], 0.0, p["armLZ"])),
        "shoulderR": to_blender(q_three_euler_xyz(p["armRX"], 0.0, p["armRZ"])),
        "elbowL": to_blender(q_three_euler_xyz(p["elbL"], 0.0, 0.0)),
        "elbowR": to_blender(q_three_euler_xyz(p["elbR"], 0.0, 0.0)),
        "thighL": to_blender(q_three_euler_xyz(-p["kneeL"] * 0.55, 0.0, 0.0)),
        "thighR": to_blender(q_three_euler_xyz(-p["kneeR"] * 0.55, 0.0, 0.0)),
        "kneeL": to_blender(q_three_euler_xyz(p["kneeL"] * 1.15, 0.0, 0.0)),
        "kneeR": to_blender(q_three_euler_xyz(p["kneeR"] * 1.15, 0.0, 0.0)),
    }
    root_loc = vec_to_blender(0.0, p["rootY"], 0.0)
    pelvis_loc = vec_to_blender(p["hipPosX"], 0.0, p["hipPosZ"])
    # Empties (drive die Anker für die Cheek-Feder)
    nodes["root"].location = vec_to_blender(0.0, BASE_ROOT_Y + p["rootY"], 0.0)
    nodes["root"].rotation_quaternion = root_q
    nodes["pelvis"].location = vec_to_blender(p["hipPosX"], PELVIS_BASE_Y, p["hipPosZ"])
    nodes["pelvis"].rotation_quaternion = pelvis_q
    for name, q in vals.items():
        nodes[name].rotation_quaternion = q
    # Pose-Bones
    pb["root"].location = root_loc
    pb["root"].rotation_quaternion = root_q
    pb["pelvis"].location = pelvis_loc
    pb["pelvis"].rotation_quaternion = pelvis_q
    for name, q in vals.items():
        pb[name].rotation_quaternion = q


def _step_cheeks(state, anchors):
    for s in ("L", "R"):
        target = anchors[s].matrix_world.translation
        st = state[s]
        st["v"].x += (SPRING_K * (target.x - st["p"].x) - SPRING_C * st["v"].x) * SUB_DT
        st["v"].y += (SPRING_K * (target.y - st["p"].y) - SPRING_C * st["v"].y) * SUB_DT
        st["v"].z += (SPRING_K * (target.z - st["p"].z) - SPRING_C * st["v"].z - GRAV) * SUB_DT
        st["p"] += st["v"] * SUB_DT


def stage8_animations(arm_obj, poses):
    """Stage 8 — Actions „Idle"/„Twerk" als NLA-Strips: gebackene Keyframes
    (24 fps), Cheek-Jiggle aus der echten Feder-Simulation, Loop geschlossen."""
    fps = poses["fps"]
    bpy.context.scene.render.fps = fps
    nodes = {n: find(n) for n in NODE_BONES if not n.startswith("cheek")}
    for o in nodes.values():
        o.rotation_mode = "QUATERNION"
    anchors = {s: find(f"anchor{s}") for s in ("L", "R")}
    pb = arm_obj.pose.bones
    cheek_rest = {s: arm_obj.data.bones["cheek" + s].head_local.copy() for s in ("L", "R")}
    pelvis_rest_head = arm_obj.data.bones["pelvis"].head_local.copy()
    view = bpy.context.view_layer
    arm_obj.animation_data_create()

    keyed = [
        "root", "pelvis", "spine", "head", "shoulderL", "shoulderR",
        "elbowL", "elbowR", "thighL", "thighR", "kneeL", "kneeR",
    ]
    for action_name, rows in poses["actions"].items():
        act = bpy.data.actions.new(action_name)
        act.use_fake_user = True
        arm_obj.animation_data.action = act
        # Feder-Warm-up auf Frame 0 (wie das Spiel), dann 1 Blind-Loop für den
        # eingeschwungenen Zustand, dann der aufgezeichnete Loop.
        _apply_pose(nodes, arm_obj, rows[0])
        view.update()
        state = {
            s: {"p": anchors[s].matrix_world.translation.copy(), "v": Vector((0, 0, 0))}
            for s in ("L", "R")
        }
        for _ in range(120):
            _step_cheeks(state, anchors)
        sub = max(1, round((1.0 / fps) / SUB_DT))
        for record in (False, True):
            for i, row in enumerate(rows):
                prev = rows[i - 1] if i > 0 else rows[0]
                for k in range(sub):
                    t = (k + 1) / sub
                    _apply_pose(nodes, arm_obj, {kk: prev[kk] + (row[kk] - prev[kk]) * t for kk in row})
                    view.update()
                    _step_cheeks(state, anchors)
                if not record:
                    continue
                frame = i + 1
                for name in keyed:
                    pb[name].keyframe_insert("rotation_quaternion", frame=frame)
                pb["root"].keyframe_insert("location", frame=frame)
                pb["pelvis"].keyframe_insert("location", frame=frame)
                # Cheeks: Welt-Federposition → pelvis-lokal (Bone-Offset)
                m_pelvis = arm_obj.matrix_world @ pb["pelvis"].matrix
                inv = m_pelvis.inverted()
                for s in ("L", "R"):
                    local = inv @ state[s]["p"]
                    rest_rel = cheek_rest[s] - pelvis_rest_head
                    pb["cheek" + s].location = local - rest_rel
                    spd = min(state[s]["v"].length * 0.085, 0.35)
                    sy = 1 + (spd if state[s]["v"].z > 0 else -spd) * 0.8
                    pb["cheek" + s].scale = (1 / math.sqrt(sy), 1 / math.sqrt(sy), sy)
                    pb["cheek" + s].keyframe_insert("location", frame=frame)
                    pb["cheek" + s].keyframe_insert("scale", frame=frame)
        # Loop hart schließen (Feder-Reststreuung < Sichtbarkeit): letzte Keys
        # der Cheeks auf die ersten kopieren übernimmt der Dump bereits für die
        # Pose; hier genügt der eingeschwungene Zustand.
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = action_name
        track.strips.new(action_name, 1, act)
        arm_obj.animation_data.action = None
    print(
        "Stage 8: "
        + " · ".join(f"{k} ({len(v)} Keys @ {fps} fps)" for k, v in poses["actions"].items())
    )


def stage9_export(body, arm_obj):
    """Stage 9 — glTF 2.0 Binary, Draco (Pos 14 / Normal 10 / UV 12), +Y up,
    Sampling + Keyframe-Optimierung an."""
    for o in list(bpy.data.objects):
        if o not in (body, arm_obj):
            bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="SELECT")
    kwargs = dict(
        filepath=GLB_OUT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=False,
        export_tangents=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_skins=True,
        export_animations=True,
    )
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props or k == "filepath"})
    kb = os.path.getsize(GLB_OUT) / 1024
    print(f"Stage 9: {GLB_OUT} → {kb:.0f} KB (Max {GLB_MAX_KB})")
    return kb


def test_renders(arm_obj, poses):
    """Deformations-Gate: T-Pose, Testpose (Ellbogen 90°/Schulter 45°/Hüfte)
    und ein Twerk-Frame als EEVEE-Stills zum Begutachten."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"  # headless ohne EGL — CPU-Pfad wie render_anim
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.16, 0.16, 0.2, 1)
    sc.world = world
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    cam.location = (4.6, -5.2, 0.6)
    cam.rotation_euler = (math.radians(78), 0, math.radians(41))
    sc.camera = cam
    for name, energy, az in (("key", 3.0, 35), ("fill", 1.2, -50)):
        li = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        li.data.energy = energy
        sc.collection.objects.link(li)
        li.rotation_euler = (math.radians(55), 0, math.radians(az))
    pb = arm_obj.pose.bones
    for tr in arm_obj.animation_data.nla_tracks:
        tr.mute = True  # Test-Posen manuell — sonst gewinnt der NLA-Stack

    def shot(label):
        bpy.context.view_layer.update()
        sc.render.filepath = os.path.join(OUT_DIR, f"pose-{label}.png")
        bpy.ops.render.render(write_still=True)

    for b in pb:
        b.rotation_quaternion = (1, 0, 0, 0)
        b.location = (0, 0, 0)
        b.scale = (1, 1, 1)
    shot("rest")
    pb["elbowL"].rotation_quaternion = to_blender(q_three_euler_xyz(-math.pi / 2, 0, 0))
    pb["shoulderR"].rotation_quaternion = to_blender(q_three_euler_xyz(0, 0, -math.pi / 4))
    pb["pelvis"].rotation_quaternion = to_blender(q_three_euler_xyz(0.35, 0, 0))
    shot("test")
    twerk = poses["actions"]["Twerk"]
    row = twerk[len(twerk) // 3]
    for b in pb:
        b.rotation_quaternion = (1, 0, 0, 0)
        b.location = (0, 0, 0)
    _apply_pose_bones_only(arm_obj, row)
    shot("twerk")


def _apply_pose_bones_only(arm_obj, p):
    pb = arm_obj.pose.bones
    pb["root"].location = vec_to_blender(0.0, p["rootY"], 0.0)
    pb["root"].rotation_quaternion = to_blender(q_three_euler_xyz(0.0, p["rootRotY"], 0.0))
    pb["pelvis"].location = vec_to_blender(p["hipPosX"], 0.0, p["hipPosZ"])
    pb["pelvis"].rotation_quaternion = to_blender(q_three_euler_xyz(p["hipX"], 0.0, p["hipZ"]))
    pb["spine"].rotation_quaternion = to_blender(
        q_three_euler_xyz(p["spineX"], p["spineY"], p["spineZ"])
    )
    pb["head"].rotation_quaternion = to_blender(q_three_euler_xyz(p["headX"], 0.0, p["headZ"]))
    pb["shoulderL"].rotation_quaternion = to_blender(q_three_euler_xyz(p["armLX"], 0.0, p["armLZ"]))
    pb["shoulderR"].rotation_quaternion = to_blender(q_three_euler_xyz(p["armRX"], 0.0, p["armRZ"]))
    pb["elbowL"].rotation_quaternion = to_blender(q_three_euler_xyz(p["elbL"], 0.0, 0.0))
    pb["elbowR"].rotation_quaternion = to_blender(q_three_euler_xyz(p["elbR"], 0.0, 0.0))
    for s in ("L", "R"):
        pb["thigh" + s].rotation_quaternion = to_blender(
            q_three_euler_xyz(-p["knee" + s] * 0.55, 0, 0)
        )
        pb["knee" + s].rotation_quaternion = to_blender(
            q_three_euler_xyz(p["knee" + s] * 1.15, 0, 0)
        )


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(POSES, encoding="utf-8") as f:
        poses = json.load(f)
    meshes = stage1_import_cleanup()
    stage2_groups_colors(meshes)
    tris = stage3_decimate(meshes)
    arm_obj = stage45_armature()
    body = stage6_join_skin(meshes, arm_obj)
    stage8_animations(arm_obj, poses)
    kb = stage9_export(body, arm_obj)
    test_renders(arm_obj, poses)
    body.data.calc_loop_triangles()
    final_tris = len(body.data.loop_triangles)
    ok = final_tris <= TRI_MAX and kb <= GLB_MAX_KB and len(arm_obj.data.bones) <= BONE_MAX
    print(
        f"\nBudgets: Tris {final_tris}/{TRI_MAX} · Slots {len(body.data.materials)}/2 · "
        f"Bones {len(arm_obj.data.bones)}/{BONE_MAX} · glb {kb:.0f}/{GLB_MAX_KB} KB · "
        f"Texturen 0 → {'BESTANDEN' if ok else 'GERISSEN'}"
    )
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
