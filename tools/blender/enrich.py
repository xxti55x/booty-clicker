"""Cartoon-Prop-Kits + Mesh-Detail-Pass (bpy) — die Anreicherungsstufe.

Von `refine_models.py` importiert. Zwei Aufgaben:

1. `detail_meshes()` — Charaktere/Rivalen deutlich detaillierter: Bevel rundet
   harte Primitive-Kanten (Segments 2), sehr grobe Meshes (< 900 Verts)
   bekommen zusätzlich Subsurf Level 1. Silhouette bleibt Cartoon — nur die
   Flächenqualität steigt sichtbar.

2. `enrich_stage(stem, center, radius, top)` — pro Bühne ein handgebautes
   Prop-Kit im Cartoon-Look (satte Flächenfarben, chunky Proportionen, alles
   smooth-shaded, deterministisch geseedet):
     · beach: große Insel — gebogene Palmen mit Kokosnüssen, gestreifter
       Sonnenschirm + Handtuch, Sandburg, Wasserball, Seesterne, Muscheln,
       Felsen, Schaumkante an der Wasserlinie, Pufferwolken am Himmel.
     · club:  DJ-Pult mit Decks, zusätzliche Speaker-Stacks, farbige
       Laser-Beams, Neon-Ring um die Tanzfläche.
     · synth: echtes Grid als emissive Geometrie (Ringe + Radialstreifen —
       das In-Game-Grid ist Linien-Geometrie und rendert unsichtbar),
       Sonnen-Slats (Synthwave-Streifen), Sternenfeld.
     · space: Asteroidengürtel, Cartoon-Rakete mit Flammen-Kegel, Satellit,
       Sternenstaub aus Mini-Emittern.
"""

import math
import random

import bpy
from mathutils import Vector


# ---------------------------------------------------------------- helpers


def _mat(name, color, rough=0.85, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


def _ob(mat, smooth=True):
    o = bpy.context.active_object
    o.data.materials.append(mat)
    if smooth:
        bpy.ops.object.shade_smooth()
    return o


def sphere(loc, r, mat, scale=(1, 1, 1), seg=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(8, seg // 2), radius=r, location=loc)
    o = _ob(mat)
    o.scale = scale
    return o


def ico(loc, r, mat, subdiv=1, scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = _ob(mat)
    o.scale = scale
    o.rotation_euler = rot
    return o


def cyl(loc, r, depth, mat, rot=(0, 0, 0), verts=16, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    return _ob(mat, smooth)


def cone(loc, r1, r2, depth, mat, rot=(0, 0, 0), verts=16, smooth=True):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot
    )
    return _ob(mat, smooth)


def box(loc, mat, scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = _ob(mat, smooth=False)
    o.scale = scale
    return o


def torus(loc, major, minor, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot)
    return _ob(mat)


# ------------------------------------------------- mesh detail (characters)


def detail_meshes():
    """Bevel + selektiver Subsurf über alle importierten Meshes — sichtbar
    feinere Flächen bei erhaltener Cartoon-Silhouette."""
    for o in [x for x in bpy.data.objects if x.type == "MESH"]:
        if len(o.data.vertices) < 3:
            continue
        if o.data.users > 1:
            o.data = o.data.copy()  # Instanzen: Modifier brauchen Single-User-Mesh
        bpy.context.view_layer.objects.active = o
        bev = o.modifiers.new("detail-bevel", "BEVEL")
        bev.width = 0.012
        bev.segments = 2
        bev.angle_limit = math.radians(40)
        if len(o.data.vertices) < 900:
            sub = o.modifiers.new("detail-subsurf", "SUBSURF")
            sub.levels = 1
            sub.render_levels = 1
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)


# ---------------------------------------------------------------- palettes

INK = (0.07, 0.06, 0.10)
SAND = (0.93, 0.82, 0.58)
TRUNK = (0.45, 0.27, 0.12)
LEAF = (0.12, 0.52, 0.17)
LEAF_DARK = (0.07, 0.4, 0.12)
CORAL = (0.98, 0.45, 0.40)
CREAM = (0.99, 0.96, 0.88)
FOAM = (0.97, 0.99, 1.0)


# ------------------------------------------------------------------ beach


def _palm(base, height, lean_dir, rng, trunk_mat, leaf_mats, coco_mat):
    """Gebogene Cartoon-Palme: Trunk-Segmente entlang der Biegekurve orientiert
    (track_quat), Kokosnüsse und hängende Bananenblatt-Wedel aus gequetschten
    Kugeln — der Wave-1-Spiel-Look, nur größer. Alles skaliert mit height."""
    segs = 6
    lean = 0.0
    seg_len = height / segs
    r0 = height * 0.05
    top = Vector(base)
    for i in range(segs):
        lean += rng.uniform(0.06, 0.12)
        step = Vector(
            (
                math.cos(lean_dir) * math.sin(lean) * seg_len,
                math.sin(lean_dir) * math.sin(lean) * seg_len,
                math.cos(lean) * seg_len,
            )
        )
        nxt = top + step
        mid = (top + nxt) / 2
        r = r0 * (1.0 - 0.09 * i)
        c = cyl(tuple(mid), r, seg_len * 1.22, trunk_mat, verts=12)
        c.rotation_euler = step.to_track_quat("Z", "Y").to_euler()
        if i % 2 == 1:
            torus(tuple(mid), r * 1.16, r * 0.2, trunk_mat, rot=tuple(c.rotation_euler))
        top = nxt
    for k in range(3):
        a = rng.uniform(0, 2 * math.pi)
        sphere(
            (top.x + height * 0.06 * math.cos(a), top.y + height * 0.06 * math.sin(a), top.z - height * 0.02),
            height * 0.045,
            coco_mat,
            seg=12,
        )
    # hängende Wedel: lange flache Kugel-Blätter, außen leicht nach unten geneigt
    fronds = 7
    for k in range(fronds):
        a = 2 * math.pi * k / fronds + rng.uniform(-0.14, 0.14)
        ln = height * rng.uniform(0.34, 0.46)
        droop = rng.uniform(0.28, 0.42)
        f = sphere(
            (top.x + math.cos(a) * ln * 0.55, top.y + math.sin(a) * ln * 0.55, top.z + height * 0.02 - ln * droop * 0.35),
            1.0,
            leaf_mats[k % 2],
            seg=14,
        )
        f.scale = (ln * 0.62, ln * 0.2, ln * 0.1)
        f.rotation_euler = (0, droop, a)


def enrich_beach(center, radius, top, rng):
    """Alle Maße radius-relativ — die Props wachsen mit der Insel."""
    R = radius
    cx, cy = center
    # Sonnen-Billboard (flach in Y) hinter die Insel auf den Ozean setzen.
    for o in [x for x in bpy.data.objects if x.type == "MESH"]:
        d = o.dimensions
        if d.y < 0.06 * max(d.x, d.z, 0.001) and max(d.x, d.z) >= 3:
            o.scale = (o.scale[0] * 1.6, o.scale[1], o.scale[2] * 1.6)
            o.location = (cx - R * 0.12, cy + R * 1.38, top + R * 0.16)
            break
    trunk = _mat("bch-trunk", TRUNK)
    leaf_a = _mat("bch-leaf-a", LEAF)
    leaf_b = _mat("bch-leaf-b", LEAF_DARK)
    coco = _mat("bch-coco", (0.32, 0.19, 0.08))
    sandcastle = _mat("bch-castle", (0.88, 0.74, 0.47))
    foam = _mat("bch-foam", FOAM, rough=0.4)
    white = _mat("bch-white", CREAM, rough=0.7)
    red = _mat("bch-red", (0.92, 0.25, 0.24), rough=0.7)
    towel = _mat("bch-towel", (0.25, 0.75, 0.85), rough=0.9)
    star_m = _mat("bch-star", (1.0, 0.55, 0.35), rough=0.8)
    shell_m = _mat("bch-shell", (0.97, 0.85, 0.78), rough=0.6)
    rock_m = _mat("bch-rock", (0.55, 0.53, 0.5))
    ball_a = _mat("bch-ball-a", (0.95, 0.3, 0.3), rough=0.55)
    ball_b = _mat("bch-ball-b", (0.98, 0.95, 0.9), rough=0.55)
    cloud_m = _mat("bch-cloud", (1.0, 1.0, 1.0), rough=1.0)

    # große gebogene Palmen — Insel bewachsen statt leer
    for i in range(5):
        a = rng.uniform(0, 2 * math.pi)
        d = R * rng.uniform(0.4, 0.78)
        _palm(
            (cx + math.cos(a) * d, cy + math.sin(a) * d, top),
            R * rng.uniform(0.30, 0.42),
            a + math.pi,
            rng,
            trunk,
            (leaf_a, leaf_b),
            coco,
        )

    # Sonnenschirm + Handtuch
    ux, uy = cx + R * 0.30, cy - R * 0.28
    cyl((ux, uy, top + R * 0.085), R * 0.008, R * 0.17, trunk, verts=10)
    cone((ux, uy, top + R * 0.205), R * 0.105, 0.012, R * 0.115, red, verts=12)
    torus((ux, uy, top + R * 0.152), R * 0.098, R * 0.006, white)
    sphere((ux, uy, top + R * 0.268), R * 0.013, white, seg=10)
    box((ux + R * 0.1, uy - R * 0.07, top + 0.02), towel, scale=(R * 0.13, R * 0.07, 0.03), rot=(0, 0, 0.4))

    # Sandburg mit drei Türmen + Tor
    sx, sy = cx - R * 0.40, cy - R * 0.15
    for (ox, oy, r, h) in [
        (0, 0, R * 0.05, R * 0.13),
        (R * 0.075, R * 0.025, R * 0.036, R * 0.095),
        (-R * 0.055, R * 0.045, R * 0.032, R * 0.085),
    ]:
        cyl((sx + ox, sy + oy, top + h / 2), r, h, sandcastle, verts=14, smooth=False)
        cone((sx + ox, sy + oy, top + h + R * 0.018), r * 1.15, 0.02, R * 0.038, red, verts=12)
    box((sx + R * 0.01, sy - R * 0.045, top + R * 0.02), sandcastle, scale=(R * 0.05, R * 0.016, R * 0.04))

    # Wasserball mit Streifen
    bx, by = cx + R * 0.52, cy + R * 0.3
    br = R * 0.042
    sphere((bx, by, top + br), br, ball_a)
    torus((bx, by, top + br), br * 0.9, br * 0.22, ball_b, rot=(0, math.radians(28), 0.6))
    torus((bx, by, top + br), br * 0.9, br * 0.22, ball_b, rot=(0, math.radians(-35), -0.8))

    # Seesterne, Muscheln, Felsen
    for i in range(4):
        a = rng.uniform(0, 2 * math.pi)
        d = R * rng.uniform(0.3, 0.85)
        st = cone(
            (cx + math.cos(a) * d, cy + math.sin(a) * d, top + 0.04),
            R * 0.034,
            0.02,
            R * 0.012,
            star_m,
            verts=5,
            smooth=False,
        )
        st.rotation_euler = (0, 0, rng.uniform(0, 2))
    for i in range(8):
        a = rng.uniform(0, 2 * math.pi)
        d = R * rng.uniform(0.25, 0.9)
        sh = cone(
            (cx + math.cos(a) * d, cy + math.sin(a) * d, top + 0.03),
            R * 0.014,
            0.01,
            R * 0.012,
            shell_m,
            verts=8,
        )
        sh.scale = (1, 0.72, 1)
        sh.rotation_euler = (0, 0, rng.uniform(0, 6))
    for i in range(4):
        a = rng.uniform(0, 2 * math.pi)
        d = R * rng.uniform(0.55, 0.92)
        ico(
            (cx + math.cos(a) * d, cy + math.sin(a) * d, top + R * 0.014),
            R * rng.uniform(0.022, 0.042),
            rock_m,
            subdiv=1,
            scale=(1, 0.85, 0.7),
            rot=(0, 0, rng.uniform(0, 3)),
        )

    # Schaumkante an der Wasserlinie + Wellen-Akzent
    torus((cx, cy, top - 0.06), R * 1.005, R * 0.009, foam)
    torus((cx, cy, top - 0.1), R * 1.1, R * 0.005, foam)

    # Pufferwolken
    for i in range(4):
        a = rng.uniform(0, 2 * math.pi)
        d = R * rng.uniform(0.55, 1.1)
        hz = top + R * rng.uniform(0.36, 0.5)
        base = (cx + math.cos(a) * d, cy + math.sin(a) * d, hz)
        cr = R * rng.uniform(0.045, 0.06)
        for (ox, oz, rr) in [(-1.2, 0, 0.78), (0, 0.3, 1.0), (1.25, 0, 0.72)]:
            sphere((base[0] + ox * cr, base[1], base[2] + oz * cr), cr * rr, cloud_m, scale=(1, 0.8, 0.62), seg=14)


# ------------------------------------------------------------------- club


def enrich_club(center, radius, top, rng):
    R = radius
    cx, cy = center
    dark = _mat("clb-dark", (0.09, 0.07, 0.12), rough=0.5)
    deck = _mat("clb-deck", (0.16, 0.13, 0.2), rough=0.4)
    neon_p = _mat("clb-neon-p", (1.0, 0.2, 0.55), emit=(1.0, 0.2, 0.55), emit_strength=4.0)
    neon_c = _mat("clb-neon-c", (0.2, 0.9, 1.0), emit=(0.2, 0.9, 1.0), emit_strength=4.0)
    gold = _mat("clb-gold", (1.0, 0.78, 0.3), rough=0.3, metal=0.7)
    laser_cols = [(1.0, 0.25, 0.5), (0.3, 0.9, 1.0), (0.6, 1.0, 0.3), (1.0, 0.8, 0.25)]

    # DJ-Pult mit zwei Decks + Neon-Front (Front zeigt zur Kamera / −y)
    u = R / 8.0
    dx, dy = cx - R * 0.05, cy + R * 0.6
    box((dx, dy, top + 0.62 * u), dark, scale=(2.6 * u, 0.95 * u, 1.24 * u))
    box((dx, dy - 0.5 * u, top + 0.55 * u), neon_p, scale=(2.62 * u, 0.03 * u, 0.5 * u))
    for ox in (-0.7, 0.7):
        cyl((dx + ox * u, dy, top + 1.28 * u), 0.36 * u, 0.07 * u, deck, verts=24)
        cyl((dx + ox * u, dy, top + 1.33 * u), 0.11 * u, 0.05 * u, gold, verts=16)

    # zwei zusätzliche Speaker-Stacks mit Neon-Woofern zur Kamera
    for sx in (cx - R * 0.74, cx + R * 0.74):
        box((sx, cy + R * 0.28, top + 0.9 * u), dark, scale=(0.9 * u, 0.75 * u, 1.8 * u))
        for hz in (0.5, 1.25):
            torus((sx, cy + R * 0.28 - 0.4 * u, top + hz * u), 0.27 * u, 0.08 * u, neon_p, rot=(math.radians(90), 0, 0))

    # Laser-Fächer vom Pult über die Tanzfläche
    for i, col in enumerate(laser_cols):
        m = _mat(f"clb-laser-{i}", col, emit=col, emit_strength=7.0)
        a = -0.85 + i * 0.55
        beam = cyl(
            (dx + math.sin(a) * R * 0.4, dy - R * 0.45, top + 1.9 * u),
            0.05 * u,
            R * 1.05,
            m,
            verts=6,
        )
        beam.rotation_euler = (math.radians(62), 0, a)

    # Neon-Ring um die Tanzfläche
    torus((cx, cy, top + 0.03), R * 0.55, 0.05 * u, neon_p)


# ------------------------------------------------------------------ synth


def enrich_synth(center, radius, top, rng):
    R = radius
    cx, cy = center
    grid = _mat("syn-grid", (1.0, 0.2, 0.7), emit=(1.0, 0.15, 0.65), emit_strength=2.2)
    star = _mat("syn-star", (1.0, 1.0, 1.0), emit=(0.9, 0.9, 1.0), emit_strength=5.0)
    slat = _mat("syn-slat", (0.1, 0.04, 0.2), rough=1.0)

    # ECHTES Grid: konzentrische Ringe + Radialstreifen als emissive Geometrie
    for r in (0.3, 0.55, 0.8):
        torus((cx, cy, top + 0.02), R * r, 0.022, grid)
    for k in range(10):
        a = 2 * math.pi * k / 10
        ln = R * 0.82
        box(
            (cx + math.cos(a) * ln / 2, cy + math.sin(a) * ln / 2, top + 0.02),
            grid,
            scale=(ln, 0.04, 0.02),
            rot=(0, 0, a),
        )

    # Synthwave-Sonnen-Slats: dunkle Streifen über der unteren Sonnenhälfte
    sun = None
    for o in bpy.data.objects:
        if o.type == "MESH" and o.active_material and "sun" in o.active_material.name:
            sun = o
            break
    if sun is not None:
        sun.location.z += max(sun.dimensions.x, sun.dimensions.z) * 0.1
        sl = sun.location
        sdim = max(sun.dimensions.x, sun.dimensions.z)
        for i in range(3):
            z = sl.z - sdim * (0.06 + 0.15 * i)
            box((sl.x, sl.y - 0.05, z), slat, scale=(sdim * 1.05, 0.05, sdim * (0.045 + 0.02 * i)))

    # Sternenfeld hinter der Bergkette
    for i in range(36):
        a = rng.uniform(0, math.pi)
        d = R * rng.uniform(1.0, 1.5)
        hz = top + R * rng.uniform(0.15, 0.6)
        ico((cx + math.cos(a) * d, cy + abs(math.sin(a)) * d, hz), R * rng.uniform(0.004, 0.007), star, subdiv=1)


# ------------------------------------------------------------------ space


def enrich_space(center, radius, top, rng):
    R = radius
    u = R / 9.0
    cx, cy = center
    rock = _mat("spc-rock", (0.45, 0.42, 0.48))
    star = _mat("spc-star", (1.0, 1.0, 1.0), emit=(1.0, 1.0, 0.95), emit_strength=6.0)
    hull = _mat("spc-hull", (0.92, 0.93, 0.97), rough=0.5)
    fin = _mat("spc-fin", (0.95, 0.35, 0.3), rough=0.6)
    flame = _mat("spc-flame", (1.0, 0.6, 0.15), emit=(1.0, 0.55, 0.1), emit_strength=7.0)
    panel = _mat("spc-panel", (0.15, 0.3, 0.75), rough=0.35, metal=0.4)

    # Asteroidengürtel
    for i in range(16):
        a = rng.uniform(0, 2 * math.pi)
        d = R * rng.uniform(0.75, 1.05)
        hz = top + u * rng.uniform(0.4, 2.6)
        ico(
            (cx + math.cos(a) * d, cy + math.sin(a) * d, hz),
            u * rng.uniform(0.14, 0.42),
            rock,
            subdiv=1,
            scale=(1, rng.uniform(0.7, 1.0), rng.uniform(0.6, 0.95)),
            rot=(rng.uniform(0, 3), rng.uniform(0, 3), 0),
        )

    # Cartoon-Rakete (geneigt, mit Flamme)
    rx, ry = cx - R * 0.45, cy + R * 0.35
    rot = (math.radians(18), math.radians(-12), 0)
    cyl((rx, ry, top + 2.6 * u), 0.42 * u, 2.1 * u, hull, rot=rot, verts=18)
    cone((rx + 0.35 * u, ry - 0.22 * u, top + 4.0 * u), 0.42 * u, 0.02, 0.95 * u, fin, rot=rot, verts=18)
    sphere((rx + 0.02 * u, ry - 0.35 * u, top + 2.9 * u), 0.2 * u, panel, seg=14)
    for k in range(3):
        a = 2 * math.pi * k / 3
        box(
            (rx - 0.4 * u * math.cos(a) - 0.1 * u, ry - 0.4 * u * math.sin(a) + 0.08 * u, top + 1.65 * u),
            fin,
            scale=(0.11 * u, 0.6 * u, 0.8 * u),
            rot=(rot[0], rot[1], a),
        )
    cone((rx - 0.4 * u, ry + 0.28 * u, top + 1.15 * u), 0.32 * u, 0.02, 1.0 * u, flame, rot=(rot[0] + math.pi, rot[1], 0), verts=12)

    # Satellit
    sx, sy = cx + R * 0.62, cy - R * 0.3
    box((sx, sy, top + 3.6 * u), hull, scale=(0.5 * u, 0.5 * u, 0.6 * u), rot=(0.4, 0.3, 0.2))
    for side in (-1, 1):
        box((sx + side * 0.95 * u, sy, top + 3.6 * u), panel, scale=(1.05 * u, 0.5 * u, 0.06 * u), rot=(0.4, 0.3, 0.2))

    # Sternenstaub
    for i in range(44):
        a = rng.uniform(0, 2 * math.pi)
        d = R * rng.uniform(0.9, 1.6)
        hz = top + u * rng.uniform(1.0, 8.0)
        ico((cx + math.cos(a) * d, cy + math.sin(a) * d, hz), u * rng.uniform(0.035, 0.08), star, subdiv=1)


STAGE_KITS = {
    "stage-beach": enrich_beach,
    "stage-club": enrich_club,
    "stage-synth": enrich_synth,
    "stage-space": enrich_space,
}


def enrich_stage(stem, center, radius, top):
    kit = STAGE_KITS.get(stem)
    if kit is None:
        return
    kit(center, radius, top, random.Random(stem))
