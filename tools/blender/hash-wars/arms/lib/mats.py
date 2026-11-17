"""Procedural "finish" materials that get baked into each weapon's textures.

A finish is a recipe for a surface: base colour, roughness, metal, how its
edges wear (and what shows through), how much grime sits in its recesses,
and a fine surface grain. Every finish exposes the same named outputs so the
baker can route any of them into an emission shader:

    base, rough, metal   -> baked by emission
    the Principled BSDF  -> its Normal input carries the bevel and bump detail

Wear and grime are driven by the shader itself: a Bevel node compared with the
true normal finds edges, an AO node finds recesses, noise breaks both up.
`rubs` are spheres (mm, weapon space) where hands and holsters polish the
surface; `decals` are text or stripes projected onto a face.
"""

import math

import bpy

MM = 0.001


def srgb(hexstr):
    """'#f7931a' -> linear RGBA."""
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


ORANGE = "#f7931a"
CYAN = "#5ff4ff"

# name: base colour, roughness, metal, edge-wear amount, what wear reveals
# (colour, roughness, metal), grime amount, grain kind, grain strength
FINISHES = {
    "ceramic": dict(base="#cfc8b8", rough=0.46, metal=0.0, wear=0.9, under=("#3a3a3c", 0.5, 0.0),
                    grime=0.8, grain="cast", grain_k=0.25),
    "graphite": dict(base="#2a2c2f", rough=0.58, metal=0.0, wear=1.0, under=("#a9abae", 0.32, 1.0),
                     grime=0.6, grain="cast", grain_k=0.35),
    "frame": dict(base="#1c1d1f", rough=0.52, metal=0.0, wear=0.8, under=("#8e9092", 0.35, 1.0),
                  grime=0.7, grain="cast", grain_k=0.3),
    "steel": dict(base="#3a3b3d", rough=0.4, metal=1.0, wear=0.6, under=("#b6b8ba", 0.22, 1.0),
                  grime=0.7, grain="brushed", grain_k=0.25),
    "bright": dict(base="#9a9c9f", rough=0.28, metal=1.0, wear=0.3, under=("#c8cacc", 0.18, 1.0),
                   grime=0.6, grain="brushed", grain_k=0.2),
    "polymer": dict(base="#1a1b1c", rough=0.72, metal=0.0, wear=0.35, under=("#3c3d3f", 0.5, 0.0),
                    grime=0.5, grain="stipple", grain_k=0.6),
    "grip": dict(base="#1d1e1f", rough=0.8, metal=0.0, wear=0.25, under=("#3a3b3c", 0.55, 0.0),
                 grime=0.6, grain="knurl", grain_k=1.0),
    "rubber": dict(base="#121213", rough=0.88, metal=0.0, wear=0.15, under=("#2a2a2b", 0.7, 0.0),
                   grime=0.4, grain="stipple", grain_k=0.5),
    "fabric": dict(base="#24262a", rough=0.92, metal=0.0, wear=0.2, under=("#3d3f43", 0.9, 0.0),
                   grime=0.6, grain="weave", grain_k=0.8),
    "orange": dict(base=ORANGE, rough=0.42, metal=0.0, wear=1.0, under=("#2b2c2e", 0.5, 0.0),
                   grime=0.5, grain="cast", grain_k=0.2),
    "lensframe": dict(base="#0d0e0f", rough=0.35, metal=0.0, wear=0.4, under=("#5b5d60", 0.3, 1.0),
                      grime=0.3, grain="cast", grain_k=0.1),
    # Cartel: seamless pearl shell, dark chrome, bare carbon at the joints.
    "pearl": dict(base="#e4e6e9", rough=0.22, metal=0.0, wear=0.25, under=("#9aa1a8", 0.3, 1.0),
                  grime=0.35, grain="none", grain_k=0.0),
    "chrome": dict(base="#5a6068", rough=0.14, metal=1.0, wear=0.2, under=("#c9cdd2", 0.1, 1.0),
                   grime=0.35, grain="none", grain_k=0.0),
    "carbon": dict(base="#0c0d0e", rough=0.36, metal=0.0, wear=0.2, under=("#2a2c2e", 0.4, 0.0),
                   grime=0.4, grain="weave", grain_k=0.5),
    "copper": dict(base="#b36a3c", rough=0.3, metal=1.0, wear=0.2, under=("#d99a6c", 0.2, 1.0),
                   grime=0.5, grain="brushed", grain_k=0.3),
}


class NB:
    """Tiny node-builder: values may be floats, tuples or output sockets."""

    def __init__(self, tree):
        self.t = tree
        self.n = tree.nodes
        self.x = 0

    def node(self, kind, **props):
        nd = self.n.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        nd.location = (self.x, 0)
        self.x += 40
        return nd

    def set(self, sock, val):
        if hasattr(val, "is_output"):
            self.t.links.new(val, sock)
        else:
            sock.default_value = val

    def inp(self, nd, name, kind=None):
        for s in nd.inputs:
            if s.name == name and s.enabled and (kind is None or s.type == kind):
                return s
        raise KeyError(f"{nd.bl_idname}.{name}")

    def out(self, nd, name, kind=None):
        for s in nd.outputs:
            if s.name == name and s.enabled and (kind is None or s.type == kind):
                return s
        raise KeyError(f"{nd.bl_idname}.{name}")

    def math(self, op, a, b=0.0, clamp=False):
        nd = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.set(nd.inputs[0], a)
        self.set(nd.inputs[1], b)
        return nd.outputs[0]

    def mul(self, a, b):
        return self.math("MULTIPLY", a, b)

    def add(self, a, b, clamp=False):
        return self.math("ADD", a, b, clamp)

    def remap(self, x, a, b, c=0.0, d=1.0, smooth=True):
        nd = self.node("ShaderNodeMapRange", clamp=True, interpolation_type="SMOOTHSTEP" if smooth else "LINEAR")
        self.set(nd.inputs["Value"], x)
        for i, v in zip(("From Min", "From Max", "To Min", "To Max"), (a, b, c, d)):
            self.set(self.inp(nd, i, "VALUE"), v)
        return self.out(nd, "Result", "VALUE")

    def mix(self, fac, a, b, kind="RGBA"):
        nd = self.node("ShaderNodeMix", data_type=kind, clamp_factor=True)
        st = {"FLOAT": "VALUE"}.get(kind, kind)
        self.set(self.inp(nd, "Factor", "VALUE"), fac)
        self.set(self.inp(nd, "A", st), a)
        self.set(self.inp(nd, "B", st), b)
        return self.out(nd, "Result", st)

    def pos(self):
        return self.node("ShaderNodeNewGeometry").outputs["Position"]

    def noise(self, scale, detail=4.0, rough=0.55, vec=None, w=None):
        nd = self.node("ShaderNodeTexNoise", noise_dimensions="4D" if w is not None else "3D")
        self.set(nd.inputs["Vector"], vec if vec is not None else self.pos())
        self.set(nd.inputs["Scale"], scale)
        self.set(nd.inputs["Detail"], detail)
        self.set(nd.inputs["Roughness"], rough)
        if w is not None:
            self.set(nd.inputs["W"], w)
        return nd.outputs["Fac"]

    def voronoi(self, scale, vec=None, feature="F1", out="Distance"):
        nd = self.node("ShaderNodeTexVoronoi", feature=feature)
        self.set(nd.inputs["Vector"], vec if vec is not None else self.pos())
        self.set(nd.inputs["Scale"], scale)
        return nd.outputs[out]

    def vec(self, op, a, b=(0, 0, 0)):
        nd = self.node("ShaderNodeVectorMath", operation=op)
        self.set(nd.inputs[0], a)
        self.set(nd.inputs[1], b)
        return nd.outputs["Value"] if op in ("DOT_PRODUCT", "DISTANCE", "LENGTH") else nd.outputs["Vector"]

    def sep(self, v):
        nd = self.node("ShaderNodeSeparateXYZ")
        self.set(nd.inputs[0], v)
        return nd.outputs


def _grain(nb, kind, k):
    """A height field (around 0) for the finish's fine surface texture."""
    p = nb.pos()
    if kind == "cast":
        return nb.mul(nb.add(nb.noise(900, 3, 0.6, p), -0.5), 0.6 * k)
    if kind == "brushed":
        # Long streaks along the barrel axis (Y).
        sx = nb.vec("MULTIPLY", p, (2600, 60, 2600))
        return nb.mul(nb.add(nb.noise(1.0, 2, 0.5, sx), -0.5), 0.5 * k)
    if kind == "stipple":
        return nb.mul(nb.voronoi(1500, p, "F1", "Distance"), 0.8 * k)
    if kind == "knurl":
        # Diamond knurl: two crossed sharp stripe fields.
        s = nb.sep(p)
        a = nb.math("SINE", nb.mul(nb.add(nb.add(s[0], s[1]), s[2]), 2200))
        b = nb.math("SINE", nb.mul(nb.add(nb.math("SUBTRACT", s[1], s[0]), nb.mul(s[2], -1)), 2200))
        return nb.mul(nb.math("MINIMUM", nb.math("ABSOLUTE", a), nb.math("ABSOLUTE", b)), 1.2 * k)
    if kind == "weave":
        s = nb.sep(p)
        a = nb.math("SINE", nb.mul(nb.add(s[0], s[2]), 3000))
        b = nb.math("SINE", nb.mul(nb.add(s[1], nb.mul(s[2], -1)), 3000))
        return nb.mul(nb.mul(a, b), 0.5 * k)
    return 0.0


def finish_material(name, finish, rubs=(), decals=(), tint=None, wear_scale=1.0):
    """Build a bakeable material. Returns (material, outputs) where outputs maps
    'base' / 'rough' / 'metal' to sockets the baker can emit."""
    f = dict(FINISHES[finish])
    if tint:
        f["base"] = tint
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    t = mat.node_tree
    t.nodes.clear()
    nb = NB(t)
    out = nb.node("ShaderNodeOutputMaterial")
    bsdf = nb.node("ShaderNodeBsdfPrincipled")
    t.links.new(bsdf.outputs[0], out.inputs["Surface"])

    geo = nb.node("ShaderNodeNewGeometry")
    p = geo.outputs["Position"]
    n_true = geo.outputs["True Normal"]

    # Edge mask: where a 1.2 mm bevel-rounded normal leaves the true normal.
    bev = nb.node("ShaderNodeBevel", samples=4)
    bev.inputs["Radius"].default_value = 1.2 * MM
    edge_raw = nb.math("SUBTRACT", 1.0, nb.vec("DOT_PRODUCT", bev.outputs["Normal"], n_true))
    edge = nb.remap(edge_raw, 0.004, 0.06)

    # Openness: AO over 12 mm. Low in recesses and where parts meet.
    ao = nb.node("ShaderNodeAmbientOcclusion", samples=4, only_local=False)
    ao.inputs["Distance"].default_value = 0.012
    open_ = ao.outputs["AO"]
    cavity = nb.math("SUBTRACT", 1.0, open_)

    # Rubs: hand and holster contact polishes paint off broad areas.
    rub = 0.0
    for (cx, cy, cz, r) in rubs:
        d = nb.vec("DISTANCE", p, (cx * MM, cy * MM, cz * MM))
        rub = nb.math("MAXIMUM", rub, nb.remap(d, r * MM, 0.0, 0.0, 1.0)) if rub != 0.0 else \
            nb.remap(d, r * MM, 0.0, 0.0, 1.0)

    # Wear: convex, open edges, broken up by two scales of noise, plus rubs.
    big = nb.noise(60, 4, 0.6, p)
    fine = nb.noise(420, 6, 0.65, p)
    breakup = nb.add(nb.mul(big, 0.6), nb.mul(fine, 0.6))
    convex = nb.mul(edge, nb.remap(open_, 0.55, 0.95))
    wear_in = nb.add(nb.mul(convex, 1.25 * f["wear"] * wear_scale), nb.mul(rub, 0.55 * f["wear"] * wear_scale))
    # Chips are sparse patches on exposed edges, not a silver outline on
    # every panel. Rubs still affect the broader polish halo below.
    wear = nb.mul(nb.remap(wear_in, 0.85, 1.25), nb.remap(breakup, 0.64, 0.82))
    # Softer polish halo round the chips (paint thinned, not gone).
    polish = nb.remap(nb.add(wear_in, nb.mul(breakup, 0.4)), 0.55, 1.0)

    # Grime: recesses, more of it lower down and toward the back.
    grime = nb.remap(nb.add(nb.mul(cavity, 1.6 * f["grime"]), nb.mul(nb.noise(140, 3, 0.5, p), 0.35)), 0.45, 1.0)
    # Dust: fine pale volcanic dust settles on upward faces' recesses.
    up = nb.sep(n_true)[2]
    dust = nb.mul(nb.remap(up, 0.4, 0.95), nb.remap(nb.add(nb.mul(cavity, 1.4), nb.mul(nb.noise(220, 4, 0.6, p), 0.4)), 0.5, 1.0))

    base = f["base"] if isinstance(f["base"], tuple) else srgb(f["base"])
    under_c, under_r, under_m = f["under"]
    # Gentle colour variation so large panels are not a flat fill.
    var = nb.remap(nb.noise(25, 3, 0.5, p), 0.3, 0.7, 0.93, 1.05, smooth=False)
    col = nb.node("ShaderNodeVectorMath", operation="SCALE")
    nb.set(col.inputs[0], base[:3])
    nb.set(col.inputs["Scale"], var)
    col = col.outputs["Vector"]
    col = nb.mix(nb.mul(polish, 0.35), col, nb.mix(0.5, col, srgb(under_c)))
    col = nb.mix(wear, col, srgb(under_c))
    col = nb.mix(nb.mul(grime, 0.3), col, srgb("#17140f"))
    col = nb.mix(nb.mul(dust, 0.32), col, srgb("#8a8378"))

    rough = nb.mix(wear, f["rough"], under_r, "FLOAT")
    rough = nb.add(rough, nb.mul(polish, -0.12))
    rough = nb.add(rough, nb.mul(grime, 0.18))
    rough = nb.add(rough, nb.mul(dust, 0.2))
    rough = nb.add(rough, nb.mul(nb.add(fine, -0.5), 0.12))
    rough = nb.math("MAXIMUM", nb.math("MINIMUM", rough, 0.95), 0.06)
    metal = nb.mix(wear, f["metal"], under_m, "FLOAT")

    # Height detail: grain, chipped paint is a step down, decals engrave.
    height = _grain(nb, f["grain"], f["grain_k"])
    height = nb.add(height, nb.mul(wear, -0.18 if f["metal"] < 0.5 else -0.08))
    for d in decals:
        mask = decal_mask(nb, d, p, n_true)
        if d.get("style", "engrave") == "engrave":
            height = nb.add(height, nb.mul(mask, -1.2))
            col = nb.mix(nb.mul(mask, 0.85), col, nb.mix(0.6, srgb(under_c), col))
            rough = nb.add(rough, nb.mul(mask, -0.08))
        else:
            ink = srgb(d.get("color", "#e8e2d4"))
            inkmask = nb.mul(mask, nb.math("SUBTRACT", 1.0, nb.mul(wear, 0.9)))
            col = nb.mix(inkmask, col, ink)
            rough = nb.mix(inkmask, rough, 0.5, "FLOAT")
    bump = nb.node("ShaderNodeBump", invert=False)
    bump.inputs["Strength"].default_value = 1.0
    bump.inputs["Distance"].default_value = 0.00016
    nb.set(bump.inputs["Height"], height)
    nb.set(bump.inputs["Normal"], bev.outputs["Normal"])

    nb.set(bsdf.inputs["Base Color"], col)
    nb.set(bsdf.inputs["Roughness"], rough)
    nb.set(bsdf.inputs["Metallic"], metal)
    nb.set(bsdf.inputs["Normal"], bump.outputs["Normal"])

    mat["finish"] = finish
    mat.diffuse_color = base  # for quick Workbench previews
    mat.roughness = f["rough"]
    mat.metallic = f["metal"]
    return mat, {"base": col, "rough": rough, "metal": metal, "bsdf": bsdf, "out": out}


def decal_mask(nb, d, p, n_true):
    """Mask (0..1) for a decal image projected along an axis.

    d = {image, center (mm), normal ('+X' '-X' '+Z' ...), size (w, h mm), rot (deg)}.
    The decal only lands on faces turned toward its normal.
    """
    img = d["image"]
    axis = d["normal"]
    sign = -1.0 if axis[0] == "-" else 1.0
    ax = axis[1]
    cx, cy, cz = (c * MM for c in d["center"])
    w, h = d["size"][0] * MM, d["size"][1] * MM
    rel = nb.vec("SUBTRACT", p, (cx, cy, cz))
    s = nb.sep(rel)
    # (u, v) on the projection plane, u along the decal's width.
    if ax == "X":
        u, v = nb.mul(s[1], sign), s[2]
    elif ax == "Y":
        u, v = nb.mul(s[0], -sign), s[2]
    else:
        u, v = s[0], nb.mul(s[1], sign)
    r = math.radians(d.get("rot", 0))
    if r:
        u, v = (nb.add(nb.mul(u, math.cos(r)), nb.mul(v, math.sin(r))),
                nb.add(nb.mul(u, -math.sin(r)), nb.mul(v, math.cos(r))))
    uu = nb.add(nb.mul(u, 1 / w), 0.5)
    vv = nb.add(nb.mul(v, 1 / h), 0.5)
    comb = nb.node("ShaderNodeCombineXYZ")
    nb.set(comb.inputs[0], uu)
    nb.set(comb.inputs[1], vv)
    tex = nb.node("ShaderNodeTexImage", extension="CLIP", interpolation="Cubic")
    tex.image = img
    nb.set(tex.inputs["Vector"], comb.outputs[0])
    facing = nb.sep(n_true)["XYZ".index(ax)]
    facing = nb.remap(nb.mul(facing, sign), 0.5, 0.8)
    depth = nb.math("ABSOLUTE", s["XYZ".index(ax)])
    near = nb.remap(depth, d.get("depth", 6) * MM, d.get("depth", 6) * MM * 0.7)
    return nb.mul(nb.mul(nb.sep(tex.outputs["Color"])[0], facing), near)


def emit_material(name, color_hex, strength=6.0, base="#202224"):
    """A glowing part the engine drives (emit:team, emit:charge ...)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(base)
    b.inputs["Roughness"].default_value = 0.3
    b.inputs["Emission Color"].default_value = srgb(color_hex)
    b.inputs["Emission Strength"].default_value = strength
    mat.diffuse_color = srgb(color_hex)
    return mat


def lens_material(name="tex:lens"):
    """Thin tinted glass for sights: blended, no textures."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb("#6b8c86")
    b.inputs["Roughness"].default_value = 0.04
    b.inputs["Alpha"].default_value = 0.18
    b.inputs["Coat Weight"].default_value = 0.0
    mat.surface_render_method = "BLENDED"
    return mat
