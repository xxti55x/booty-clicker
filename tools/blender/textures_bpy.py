"""Textur-Vervollständigung IN Blender — der Senior-Pass über alle Materialien.

Zwei Lücken schließt dieser Pass für jedes models/-glb:

1. **Verlorenes Relief zurückholen.** Der Three.js-GLTFExporter exportiert
   `bumpMap` NICHT (glTF kennt nur Normal-Maps) — die In-Game-Reliefs (Planken-
   Fugen, Nieten, Sandkorn, Samt) kommen also flach in Blender an. Für jede
   Farb-Map wird hier per numpy-Sobel eine echte **Normal-Map abgeleitet**
   (Luminanz = Höhe, dunkle Fugen = Rillen) und im glTF-Exportmuster
   (`TexImage → Normal Map → Principled.Normal`) verdrahtet.

2. **Untexturierte Materialien vervollständigen.** Alle Principled-Materialien
   OHNE Farb-Map (Accessoires, Enrich-Props, Dioramen-Böden, Glow-Teile)
   bekommen eine near-white **Detail-Grain-Map** (multipliziert die Grundfarbe —
   der Exporter erkennt das Mix-MULTIPLY-Muster und schreibt Farbe als
   `baseColorFactor`) plus die zugehörige Grain-Normal-Map.

Bewusst übersprungen werden Unlit-Materialien (Ink-Linien, Augenweiß — dort ist
„flach" die Design-Absicht). Alle erzeugten Bilder werden gepackt (landen im
.glb); Normal-Maps sind Non-Color und klein gehalten (128–256 px), damit der
models/-Ordner nicht aufbläht.
"""

import bpy
import numpy as np

GRAIN_SIZE = 256
NRM_SIZE = 128
DERIVED_NRM_STRENGTH = 2.2
GRAIN_NRM_STRENGTH = 1.4
NORMAL_MAP_STRENGTH = 0.55


def _mk_image(name, px, non_color=False):
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    h, w = px.shape[0], px.shape[1]
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(px.astype(np.float32).ravel())
    img.pack()
    return img


def _soft_noise(size, seed):
    """Weiches Wolken-Rauschen 0..1 (mehrskalige Roll-Summen statt teurem Blur)."""
    rng = np.random.default_rng(seed)
    g = rng.random((size, size))
    acc = g.copy()
    for s in (1, 2, 4, 8):
        acc += np.roll(g, s, 0) + np.roll(g, s, 1) + np.roll(g, -s, 0) + np.roll(g, -s, 1)
    acc = (acc - acc.min()) / (np.ptp(acc) + 1e-9)
    return acc


def _normal_px(height, strength):
    """Höhenfeld → Tangent-Space-Normal-Pixel (RGBA, 0..1-gepackt)."""
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    nz = np.ones_like(height)
    ln = np.sqrt(dx * dx + dy * dy + nz * nz)
    return np.stack(
        [(-dx / ln + 1) / 2, (-dy / ln + 1) / 2, nz / ln * 0.5 + 0.5, np.ones_like(height)],
        axis=-1,
    )


def _lum_from_image(img, size):
    """Luminanz-Höhenfeld einer Farb-Map, auf ~size px heruntergetastet."""
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)
    sy = max(1, h // size)
    sx = max(1, w // size)
    a = a[::sy, ::sx]
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def _find_base_image(base_input):
    """Die Farb-Map eines Principled-Base-Color-Inputs (direkt oder hinter dem
    Faktor-Mix, den der glTF-Importer für baseColorFactor ≠ Weiß erzeugt)."""
    if not base_input.is_linked:
        return None
    fn = base_input.links[0].from_node
    if fn.type == "TEX_IMAGE":
        return fn.image
    if fn.type in ("MIX", "MIX_RGB"):
        for inp in fn.inputs:
            for link in inp.links:
                if link.from_node.type == "TEX_IMAGE":
                    return link.from_node.image
    return None


def _attach_normal(nt, principled, img):
    if principled.inputs["Normal"].is_linked:
        return
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.location = (-620, -420)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = NORMAL_MAP_STRENGTH
    nm.location = (-320, -420)
    nt.links.new(t.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], principled.inputs["Normal"])


def _attach_grain(nt, principled, img):
    """Near-white Grain multipliziert die Grundfarbe — Exportmuster
    Mix(MULTIPLY, TexImage, Farbe) ⇒ baseColorTexture × baseColorFactor."""
    base = principled.inputs["Base Color"]
    color = list(base.default_value)
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.location = (-620, 80)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.location = (-320, 80)
    nt.links.new(t.outputs["Color"], mix.inputs[6])  # A = Grain
    mix.inputs[7].default_value = color  # B = bisherige Grundfarbe
    nt.links.new(mix.outputs[2], base)


def complete_textures(stem):
    """Alle Materialien des geladenen Modells texturieren/verfeinern (s. Modul-Doc)."""
    used = set()
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            if slot.material is not None:
                used.add(slot.material)

    seed = (abs(hash(stem)) % 100_000) + 3
    grain_h = _soft_noise(GRAIN_SIZE, seed)
    v = 0.9 + 0.1 * grain_h
    grain_px = np.stack([v, v * 0.995, v * 0.985, np.ones_like(v)], axis=-1)
    grain_img = _mk_image(f"{stem}-grain", grain_px)
    grain_nrm = _mk_image(
        f"{stem}-grain-nrm", _normal_px(grain_h, GRAIN_NRM_STRENGTH), non_color=True
    )

    derived = {}
    n_derived = 0
    n_completed = 0
    n_unlit = 0
    for mat in used:
        if not mat.use_nodes:
            n_unlit += 1
            continue
        nt = mat.node_tree
        principled = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if principled is None:
            n_unlit += 1  # Unlit (Ink/Augen) — flach ist hier Absicht
            continue
        src = _find_base_image(principled.inputs["Base Color"])
        if src is not None:
            if src.name not in derived:
                h = _lum_from_image(src, NRM_SIZE)
                derived[src.name] = _mk_image(
                    f"{src.name[:40]}-nrm", _normal_px(h, DERIVED_NRM_STRENGTH), non_color=True
                )
            _attach_normal(nt, principled, derived[src.name])
            n_derived += 1
        else:
            _attach_grain(nt, principled, grain_img)
            _attach_normal(nt, principled, grain_nrm)
            n_completed += 1
    print(
        f"  Texturen: {n_derived} Farb-Maps → Normal abgeleitet, "
        f"{n_completed} Materialien vervollständigt (Grain+Normal), {n_unlit} unlit belassen"
    )
