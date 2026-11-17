"""Shared building kit for the Hash Wars structure pieces.

Every piece is built from `Part`s. A Part is one glTF node: a bmesh that the
primitives below append to, in the piece's own space (Blender: metres, Z up,
front of the piece faces -Y, which the exporter turns into glTF +Z).

Materials talk to the engine by name (see plans/level-10-hash-wars.md):
  surf:<surface>  the engine swaps in its tiling world surface and multiplies by
                  our vertex colour, which carries baked AO, grime and tint.
  tex:keeper      bone-white ceramic, tiling (2 m per repeat), textures baked in
                  the GLB. Vertex colour paints it (graphite, orange, soot...).
  emit:<channel>  glowing parts the engine drives (team, lamp, amber).

Detail level: DETAIL.q is 0 for the full piece and 1 for its `_lod1`. Primitives
read it to drop bevel segments, coarsen tessellation and skip `if fine():` parts.
"""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix, Euler


class _Detail:
    q = 0


DETAIL = _Detail()


def fine():
    """True when building the full-detail piece (not its LOD1)."""
    return DETAIL.q == 0


def tess():
    """Target edge length (m) for big faces, so vertex AO has room to vary."""
    return 0.75 if DETAIL.q == 0 else 2.2


# Vertex paint colours, multiplied onto the material's own colour.
PAINT = {
    "bone": (1.0, 1.0, 1.0),
    "ivory": (0.9, 0.87, 0.8),
    "graphite": (0.12, 0.122, 0.13),
    "iron": (0.34, 0.34, 0.35),
    "orange": (1.0, 0.33, 0.035),
    "amber": (1.0, 0.55, 0.12),
    "dark": (0.04, 0.04, 0.045),
    "soot": (0.07, 0.06, 0.055),
    "red": (0.7, 0.07, 0.05),
    "white": (1.0, 1.0, 1.0),
    "warm": (0.92, 0.86, 0.76),
    "stone": (0.82, 0.8, 0.76),
}

# Blender-only stand-ins for the engine surfaces (colour, roughness, metal),
# taken from js/first-light/surfaces.js so review renders read about right.
SURF_PREVIEW = {
    "concrete": ((0.30, 0.315, 0.32), 0.8, 0.0, 1.0),
    "cutStone": ((0.43, 0.405, 0.345), 0.72, 0.0, 2.0),
    "blockStone": ((0.035, 0.037, 0.042), 0.85, 0.0, 3.0),
    "rock": ((0.18, 0.185, 0.17), 0.88, 0.0, 3.0),
    "galvanized": ((0.46, 0.48, 0.49), 0.42, 0.96, 0.4),
    "rustedSteel": ((0.035, 0.034, 0.033), 0.6, 0.8, 0.8),
    "paintedMetal": ((0.032, 0.073, 0.054), 0.45, 0.2, 0.5),
    "glass": ((0.12, 0.16, 0.18), 0.07, 0.0, 0.1),
}

EMIT_PREVIEW = {
    "team": (1.0, 0.42, 0.06),
    "lamp": (1.0, 0.92, 0.8),
    "amber": (1.0, 0.55, 0.12),
}

TILE = 2.0  # metres per repeat of tex:keeper

_MATS = []  # global material order; face.material_index indexes this list


def mat_index(name):
    if name in _MATS:
        return _MATS.index(name)
    _MATS.append(name)
    return len(_MATS) - 1


# ---------------------------------------------------------------- textures

def _srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def tile_noise(res, cells, rng):
    """Periodic value noise, res x res, `cells` lattice cells per tile."""
    g = rng.random((cells, cells))
    x = np.arange(res) / res * cells
    i0 = np.floor(x).astype(int) % cells
    i1 = (i0 + 1) % cells
    f = x - np.floor(x)
    f = f * f * (3 - 2 * f)
    a = g[np.ix_(i0, i0)] * (1 - f)[None, :] + g[np.ix_(i0, i1)] * f[None, :]
    b = g[np.ix_(i1, i0)] * (1 - f)[None, :] + g[np.ix_(i1, i1)] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]


def fbm(res, cells, octaves, rng):
    out, amp, tot = np.zeros((res, res)), 1.0, 0.0
    for o in range(octaves):
        out += tile_noise(res, cells * 2 ** o, rng) * amp
        tot += amp
        amp *= 0.5
    return out / tot


def _smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _image(name, rgb, non_color):
    res = rgb.shape[0]
    img = bpy.data.images.new(name, res, res, alpha=False)
    rgba = np.ones((res, res, 4), np.float32)
    rgba[..., :3] = rgb
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def keeper_textures(res=1024, seed=7):
    """Bone-white ceramic plate: soft mottling, pores, fine scratches, rare chips
    down to a dark substrate. Tiles every 2 m. Returns (base, normal, orm) images."""
    rng = np.random.default_rng(seed)
    macro = fbm(res, 4, 3, rng)
    mid = fbm(res, 24, 3, rng)
    fine_n = tile_noise(res, 256, rng)
    pores = _smooth(0.86, 0.93, tile_noise(res, 384, rng))
    # Chips: rare blobs, only where a low-frequency mask allows them.
    chip_n = fbm(res, 48, 2, rng)
    mask = _smooth(0.55, 0.75, fbm(res, 6, 2, rng))
    chips = _smooth(0.72, 0.77, chip_n * 0.8 + mask * 0.25)
    chips *= .12  # Flat-face wear stays subtle; vertex curvature supplies chipped arrises.
    rim = np.clip(_smooth(0.70, 0.72, chip_n * 0.8 + mask * 0.25) - chips, 0, 1)
    # Scratches: long thin streaks in one direction, sparse.
    streak = _smooth(0.8, 0.9, np.repeat(tile_noise(res, 512, rng)[::16, :], 16, axis=0)[:res])
    scratch = streak * _smooth(0.5, 0.7, mid)

    bone = np.array([0.72, 0.71, 0.67])
    shade = 0.93 + 0.09 * macro + 0.04 * (mid - 0.5) + 0.015 * (fine_n - 0.5)
    base = bone[None, None, :] * shade[..., None]
    base *= (1 - 0.18 * pores)[..., None]
    base = base * (1 - 0.08 * scratch)[..., None]
    sub = np.array([0.045, 0.043, 0.04])
    base = base * (1 - chips[..., None]) + sub[None, None, :] * chips[..., None]
    base *= (1 + 0.05 * rim)[..., None]

    h = 0.35 * mid + 0.08 * fine_n - 0.25 * pores - 1.2 * chips - 0.15 * scratch + 0.1 * macro
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    k = 0.65
    n = np.stack([-dx * k, -dy * k, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    normal = n * 0.5 + 0.5

    rough = 0.55 + 0.09 * mid + 0.06 * (fine_n - 0.5) + 0.25 * chips - 0.1 * scratch
    occl = 1 - 0.35 * chips - 0.1 * pores
    orm = np.stack([occl, np.clip(rough, 0, 1), np.zeros_like(h)], -1)
    return (
        _image("keeper_base", _srgb(base), False),
        _image("keeper_normal", normal, True),
        _image("keeper_orm", orm, True),
    )


# ---------------------------------------------------------------- materials

_TEX = {}


def _sock(sockets, ident):
    """Mix nodes have one socket per data type under the same name; pick by identifier."""
    return next(s for s in sockets if s.identifier == ident)


def _principled(m):
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    return nt, bsdf


def material(name):
    """Get or create the Blender material for a contract name like 'surf:concrete'."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, bsdf = _principled(m)
    rule, key = name.split(":")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    if rule == "surf":
        col, rough, metal, bump = SURF_PREVIEW[key]
        # Preview only: colour x vertex colour, a little noise and bump. The
        # engine replaces all of this with its own tiling surface.
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.0
        noise.inputs["Detail"].default_value = 8.0
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.inputs["To Min"].default_value = 0.85
        ramp.inputs["To Max"].default_value = 1.12
        nt.links.new(noise.outputs["Fac"], ramp.inputs["Value"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        _sock(mix.inputs, "A_Color").default_value = (*col, 1)
        nt.links.new(vc.outputs["Color"], _sock(mix.inputs, "B_Color"))
        vm = nt.nodes.new("ShaderNodeVectorMath")
        vm.operation = "SCALE"
        nt.links.new(_sock(mix.outputs, "Result_Color"), vm.inputs[0])
        nt.links.new(ramp.outputs["Result"], vm.inputs["Scale"])
        nt.links.new(vm.outputs["Vector"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = 0.08 * bump
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 40.0
        nz.inputs["Detail"].default_value = 6.0
        nt.links.new(nz.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
        if key == "glass":
            bsdf.inputs["Roughness"].default_value = 0.05
    elif rule == "tex":
        if not _TEX:
            _TEX["base"], _TEX["normal"], _TEX["orm"] = keeper_textures()
        tb = nt.nodes.new("ShaderNodeTexImage")
        tb.image = _TEX["base"]
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(tb.outputs["Color"], _sock(mix.inputs, "A_Color"))
        nt.links.new(vc.outputs["Color"], _sock(mix.inputs, "B_Color"))
        nt.links.new(_sock(mix.outputs, "Result_Color"), bsdf.inputs["Base Color"])
        to = nt.nodes.new("ShaderNodeTexImage")
        to.image = _TEX["orm"]
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(to.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        group = bpy.data.node_groups.get('glTF Material Output')
        if group is None:
            group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
            group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        oc = nt.nodes.new('ShaderNodeGroup')
        oc.node_tree = group
        nt.links.new(sep.outputs['Red'], oc.inputs['Occlusion'])
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = _TEX["normal"]
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    elif rule == "emit":
        col = EMIT_PREVIEW[key]
        bsdf.inputs["Base Color"].default_value = (*col, 1)
        bsdf.inputs["Emission Color"].default_value = (*col, 1)
        bsdf.inputs["Emission Strength"].default_value = 6.0
        bsdf.inputs["Roughness"].default_value = 0.3
    return m


# ---------------------------------------------------------------- geometry

def _matrix(at=(0, 0, 0), rot=(0, 0, 0), scale=None):
    m = Matrix.Translation(Vector(at)) @ Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()
    if scale is not None:
        m = m @ Matrix.Diagonal((*scale, 1))
    return m


def _divisions(length, step):
    return max(1, int(math.ceil(length / step - 1e-6)))


class Part:
    """One glTF node. Coordinates are in piece space; `origin` is the node's pivot
    (for moving parts: the hinge), and the mesh is stored relative to it."""

    def __init__(self, name, origin=(0, 0, 0), parent=None):
        self.name = name
        self.origin = Vector(origin)
        self.parent = parent
        self.bm = bmesh.new()
        self.paint = self.bm.loops.layers.float_color.new("paint")
        self.empties = []  # (name, location in piece space)
        self.solids = []  # dicts in Blender piece space
        self.children = []
        if parent is not None:
            parent.children.append(self)

    # -- bookkeeping shared by every primitive
    def _finish_faces(self, faces, mat, paint, bevel=0.0, seg=None, angle=40.0):
        if bevel > 0 and DETAIL.q == 1:
            bevel = bevel if bevel >= 0.03 else 0.0
        if seg is None:
            seg = 2 if bevel < 0.05 else 1
        if DETAIL.q == 1:
            seg = 1
        # Paint before beveling so rebuilt coplanar faces inherit valid colours.
        mi = mat_index(mat)
        col = (*PAINT[paint], 1.0) if isinstance(paint, str) else (*paint, 1.0)
        for f in faces:
            f.material_index = mi
            for l in f.loops:
                l[self.paint] = col
        existing = set(self.bm.faces)
        if bevel > 0:
            edges = set()
            for f in faces:
                for e in f.edges:
                    if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(angle):
                        edges.add(e)
            if edges:
                verts = {v for e in edges for v in e.verts}
                res = bmesh.ops.bevel(
                    self.bm, geom=list(edges) + list(verts), offset=bevel, offset_type="OFFSET",
                    segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)
                faces = [f for f in faces if f.is_valid] + [f for f in self.bm.faces if f not in existing]
        mi = mat_index(mat)
        col = (*PAINT[paint], 1.0) if isinstance(paint, str) else (*paint, 1.0)
        for f in faces:
            f.material_index = mi
            for l in f.loops:
                l[self.paint] = col
        return faces

    def _grid(self, vmap, o, du, dv, nu, nv, M):
        bm, faces = self.bm, []
        rows = []
        for j in range(nv + 1):
            row = []
            for i in range(nu + 1):
                p = M @ (o + du * (i / nu) + dv * (j / nv))
                key = (round(p.x, 4), round(p.y, 4), round(p.z, 4))
                v = vmap.get(key)
                if v is None:
                    v = vmap[key] = bm.verts.new(p)
                row.append(v)
            rows.append(row)
        for j in range(nv):
            for i in range(nu):
                faces.append(bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])))
        return faces

    def box(self, size, at=(0, 0, 0), mat="tex:keeper", paint="bone", bevel=0.02, seg=None,
            rot=(0, 0, 0), step=None, open_bottom=False, taper=None):
        """Axis box centred on `at` (size x, y, z). Faces tessellated every `step` m.
        taper=(sx, sy) scales the top face, for battered walls and plinths."""
        sx, sy, sz = size
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        st = step or tess()
        nx, ny, nz = _divisions(sx, st), _divisions(sy, st), _divisions(sz, st)
        V = Vector
        specs = [
            (V((hx, -hy, -hz)), V((0, sy, 0)), V((0, 0, sz)), ny, nz),
            (V((-hx, hy, -hz)), V((0, -sy, 0)), V((0, 0, sz)), ny, nz),
            (V((hx, hy, -hz)), V((-sx, 0, 0)), V((0, 0, sz)), nx, nz),
            (V((-hx, -hy, -hz)), V((sx, 0, 0)), V((0, 0, sz)), nx, nz),
            (V((-hx, -hy, hz)), V((sx, 0, 0)), V((0, sy, 0)), nx, ny),
        ]
        if not open_bottom:
            specs.append((V((-hx, hy, -hz)), V((sx, 0, 0)), V((0, -sy, 0)), nx, ny))
        vmap, faces = {}, []
        for o, du, dv, nu, nv in specs:
            faces += self._grid(vmap, o, du, dv, nu, nv, Matrix.Identity(4))
        M = _matrix(at, rot)
        for v in {v for f in faces for v in f.verts}:
            if taper:
                t = (v.co.z + hz) / sz
                v.co.x *= 1 + (taper[0] - 1) * t
                v.co.y *= 1 + (taper[1] - 1) * t
            v.co = M @ v.co
        return self._finish_faces(faces, mat, paint, bevel, seg)

    def loft(self, rings, mat="tex:keeper", paint="bone", bevel=0.0, seg=None, caps=(True, True),
             closed=True, step=None, smooth_angle=40.0, M=None):
        """Skin a list of rings (lists of Vectors, same count, counter-clockwise seen
        from the ring's forward direction). Edges and gaps are tessellated by `step`."""
        st = step or tess()
        n = len(rings[0])
        ecount = n if closed else n - 1
        # Subdivide each ring edge by the longest version of that edge.
        cuts = []
        for j in range(ecount):
            L = max((r[(j + 1) % n] - r[j]).length for r in rings)
            cuts.append(_divisions(L, st))
        dense = []
        for r in rings:
            pts = []
            for j in range(ecount):
                a, b = r[j], r[(j + 1) % n]
                for k in range(cuts[j]):
                    pts.append(a.lerp(b, k / cuts[j]))
            if not closed:
                pts.append(r[-1])
            dense.append(pts)
        full = [dense[0]]
        for i in range(len(dense) - 1):
            a, b = dense[i], dense[i + 1]
            L = max((pb - pa).length for pa, pb in zip(a, b))
            m = _divisions(L, st)
            for k in range(1, m + 1):
                full.append([pa.lerp(pb, k / m) for pa, pb in zip(a, b)])
        M = M or Matrix.Identity(4)
        bm = self.bm
        vrows = [[bm.verts.new(M @ p) for p in row] for row in full]
        faces = []
        w = len(vrows[0])
        for i in range(len(vrows) - 1):
            for j in range(w if closed else w - 1):
                j2 = (j + 1) % w
                faces.append(bm.faces.new((vrows[i][j], vrows[i][j2], vrows[i + 1][j2], vrows[i + 1][j])))
        if closed and caps[0]:
            faces.append(bm.faces.new(list(reversed(vrows[0]))))
        if closed and caps[1]:
            faces.append(bm.faces.new(vrows[-1]))
        return self._finish_faces(faces, mat, paint, bevel, seg, smooth_angle)

    def prism(self, outline, z0, z1, at=(0, 0, 0), rot=(0, 0, 0), scale_top=1.0, **kw):
        """Extrude a 2D outline (counter-clockwise, XY) from z0 to z1."""
        a = [Vector((x, y, z0)) for x, y in outline]
        b = [Vector((x * scale_top, y * scale_top, z1)) for x, y in outline]
        return self.loft([a, b], M=_matrix(at, rot), **kw)

    def cyl(self, r, h, at=(0, 0, 0), rot=(0, 0, 0), n=None, r2=None, z0=0.0, **kw):
        """Cylinder (or cone, with r2) standing on z0 along local +Z, then rotated."""
        if n is None:
            n = max(8, min(48, int(r * 40))) if fine() else max(6, min(20, int(r * 14)))
        n = n - n % 2
        ring = [Vector((math.cos(2 * math.pi * k / n), math.sin(2 * math.pi * k / n), 0)) for k in range(n)]
        r2 = r if r2 is None else r2
        rings = [[p * r + Vector((0, 0, z0)) for p in ring], [p * r2 + Vector((0, 0, z0 + h)) for p in ring]]
        kw.setdefault("smooth_angle", 50.0)
        return self.loft(rings, M=_matrix(at, rot), **kw)

    def ring_profile(self, profile, at=(0, 0, 0), rot=(0, 0, 0), n=None, **kw):
        """Lathe: profile is [(radius, z), ...] bottom to top."""
        rmax = max(p[0] for p in profile)
        if n is None:
            n = max(10, min(48, int(rmax * 40))) if fine() else max(8, min(20, int(rmax * 14)))
        rings = []
        for rad, z in profile:
            rings.append([Vector((math.cos(2 * math.pi * k / n) * rad, math.sin(2 * math.pi * k / n) * rad, z)) for k in range(n)])
        kw.setdefault("smooth_angle", 50.0)
        return self.loft(rings, M=_matrix(at, rot), **kw)

    def pipe(self, points, r, bend=None, mat="surf:galvanized", paint="white", n=None, caps=(True, True), **kw):
        """Tube along a polyline with rounded elbows of radius `bend`."""
        pts = [Vector(p) for p in points]
        bend = bend if bend is not None else r * 2.0
        path = [pts[0]]
        for i in range(1, len(pts) - 1):
            a, b, c = pts[i - 1], pts[i], pts[i + 1]
            d1, d2 = (b - a).normalized(), (c - b).normalized()
            ang = d1.angle(d2, 0)
            if ang < 1e-3:
                path.append(b)
                continue
            t = min(bend * math.tan(ang / 2), (b - a).length * 0.49, (c - b).length * 0.49)
            p1, p2 = b - d1 * t, b + d2 * t
            steps = max(2, int(math.degrees(ang) / (15 if fine() else 30)))
            for k in range(steps + 1):
                s = k / steps
                q = p1.lerp(b, s).lerp(b.lerp(p2, s), s)  # quadratic Bezier corner
                path.append(q)
        path.append(pts[-1])
        if n is None:
            n = max(8, min(32, int(r * 60))) if fine() else max(6, min(12, int(r * 20)))
        rings, normal = [], None
        for i, p in enumerate(path):
            if i == 0:
                t = (path[1] - p).normalized()
            elif i == len(path) - 1:
                t = (p - path[i - 1]).normalized()
            else:
                t = ((path[i + 1] - p).normalized() + (p - path[i - 1]).normalized()).normalized()
            if normal is None:
                up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                normal = t.cross(up).normalized()
            else:
                normal = (normal - t * normal.dot(t)).normalized()
            bi = t.cross(normal)
            rings.append([p + (normal * math.cos(2 * math.pi * k / n) + bi * math.sin(2 * math.pi * k / n)) * r for k in range(n)])
        kw.setdefault("smooth_angle", 60.0)
        return self.loft(rings, mat=mat, paint=paint, caps=caps, **kw)

    def text(self, body, size, at=(0, 0, 0), rot=(90, 0, 0), depth=0.01, mat="tex:keeper", paint="graphite",
             align="CENTER", font=None, spacing=1.0):
        """Raised lettering (depth m), centred on `at`. Default rot stands it up facing -Y."""
        cu = bpy.data.curves.new("txt", "FONT")
        cu.body = body
        cu.size = size
        # Small labels are printed; large block numerals retain physical relief.
        if size < .3:
            depth = 0
        cu.extrude = depth / 2
        cu.align_x = align
        cu.align_y = "CENTER"
        cu.space_character = spacing
        cu.resolution_u = 3 if fine() else 1
        f = _font(font)
        if f:
            cu.font = f
        ob = bpy.data.objects.new("txt", cu)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(cu)
        M = _matrix(at, rot) @ Matrix.Translation((0, 0, depth / 2))
        me.transform(M)
        before = set(self.bm.faces)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        faces = [f for f in self.bm.faces if f not in before]
        return self._finish_faces(faces, mat, paint, 0.0)

    # -- non-geometry
    def empty(self, name, at):
        self.empties.append((name, Vector(at)))

    def solid_box(self, mn, mx):
        self.solids.append({"shape": "box", "min": list(mn), "max": list(mx)})

    def solid_cyl(self, x, y, r, z0, z1):
        self.solids.append({"shape": "cyl", "x": x, "y": y, "r": r, "z0": z0, "z1": z1})


_FONTS = {}
FONT_PATHS = {
    "narrow": "/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf",
    "sans": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "serif": "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
}


def _font(key):
    key = key or "narrow"
    if key in _FONTS:
        return _FONTS[key]
    path = FONT_PATHS.get(key)
    f = bpy.data.fonts.load(path) if path and os.path.exists(path) else None
    _FONTS[key] = f
    return f


# ---------------------------------------------------------------- detail helpers

def hazard(p, at, w, h, axis="-Y", stripe=0.12, depth=0.003, colours=("orange", "graphite")):
    """Diagonal hazard band as real thin geometry on a face whose normal is `axis`.
    `at` is the band centre on the surface."""
    rot = {"-Y": (90, 0, 0), "+Y": (90, 0, 180), "+X": (90, 0, 90), "-X": (90, 0, -90), "+Z": (0, 0, 0)}[axis]
    M = _matrix(at, rot)
    n = int(math.ceil((w + h) / stripe))
    for i in range(n):
        # stripe i occupies u in [x0, x0+stripe] at v=-h/2, slanted by h.
        x0 = -w / 2 - h + i * stripe
        quad = [(x0, -h / 2), (x0 + stripe, -h / 2), (x0 + stripe + h, h / 2), (x0 + h, h / 2)]
        poly = _clip_poly(quad, -w / 2, w / 2)
        if len(poly) < 3:
            continue
        verts = [p.bm.verts.new(M @ Vector((x, y, depth))) for x, y in poly]
        f = p.bm.faces.new(verts)
        p._finish_faces([f], "tex:keeper", colours[i % 2])


def _clip_poly(poly, xmin, xmax):
    def clip(pts, keep, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            ka, kb = keep(a), keep(b)
            if ka:
                out.append(a)
            if ka != kb:
                out.append(inter(a, b))
        return out

    def ix(x0):
        return lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))

    poly = clip(poly, lambda q: q[0] >= xmin, ix(xmin))
    if poly:
        poly = clip(poly, lambda q: q[0] <= xmax, ix(xmax))
    return poly


def bolt_row(p, start, end, count, axis="-Y", r=0.018, mat="surf:galvanized"):
    """Hex bolt heads evenly spaced from start to end, standing out along `axis`."""
    if not fine():
        return
    rot = {"-Y": (90, 0, 0), "+Y": (-90, 0, 0), "+X": (0, 90, 0), "-X": (0, -90, 0), "+Z": (0, 0, 0), "-Z": (180, 0, 0)}[axis]
    a, b = Vector(start), Vector(end)
    for i in range(count):
        q = a.lerp(b, i / max(1, count - 1)) if count > 1 else a
        p.cyl(r, r * 0.7, at=q, rot=rot, n=6, mat=mat, paint="white", step=1.0)


def railing(p, a, b, height=1.07, post_every=1.6, r=0.024, kick=True, mat="surf:galvanized"):
    """Guard rail from a to b (points on the walking surface): posts, top and mid
    rail, toe plate. Sized for a 1.8 m person."""
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    n = max(1, int(math.ceil(L / post_every)))
    d = (b - a).normalized()
    side = Vector((-d.y, d.x, 0))
    for i in range(n + 1):
        q = a.lerp(b, i / n)
        p.cyl(r * 1.1, height, at=q, n=8 if fine() else 6, mat=mat, paint="white", step=2.0)
    p.pipe([a + Vector((0, 0, height)), b + Vector((0, 0, height))], r, mat=mat, n=8 if fine() else 6, caps=(True, True))
    if fine():
        p.pipe([a + Vector((0, 0, height * 0.52)), b + Vector((0, 0, height * 0.52))], r * 0.8, mat=mat, n=8)
    if kick:
        mid = (a + b) / 2 + Vector((0, 0, 0.06))
        ang = math.degrees(math.atan2(d.y, d.x))
        p.box((L, 0.008, 0.12), at=mid, rot=(0, 0, ang), mat="tex:keeper", paint="orange", bevel=0.0, step=1.5)


def ladder(p, base, top_z, facing="-Y", width=0.46, cage_from=2.4, mat="surf:galvanized"):
    """Fixed ladder standing on `base` (x, y, z) against a wall behind it, with a
    safety cage above `cage_from` metres."""
    base = Vector(base)
    rot = {"-Y": 0, "+Y": 180, "+X": 90, "-X": -90}[facing]
    R = Euler((0, 0, math.radians(rot))).to_matrix()
    H = top_z - base.z
    for s in (-1, 1):
        q = base + R @ Vector((s * width / 2, 0, H / 2))
        p.box((0.06, 0.02, H), at=q, rot=(0, 0, rot), mat=mat, paint="white", bevel=0.004, step=2.0)
    n = int(H / 0.3)
    for i in range(1, n + 1):
        q = base + R @ Vector((0, 0, i * 0.3))
        p.cyl(0.014, width, at=q + R @ Vector((-width / 2, 0, 0)), rot=(0, 90, rot), n=6, mat=mat, step=2.0)
    if fine() and H > cage_from + 0.6:
        z = cage_from
        while z < H:
            hoop = []
            for k in range(13):
                ang = math.pi * k / 12
                hoop.append(base + R @ Vector((math.cos(ang) * 0.38, -0.36 - math.sin(ang) * 0.36, z)))
            p.pipe(hoop, 0.012, mat=mat, n=6, bend=0.05)
            z += 1.2
        for ang in (0.15, 0.5, 0.85):
            a = math.pi * ang
            q0 = base + R @ Vector((math.cos(a) * 0.38, -0.36 - math.sin(a) * 0.36, cage_from))
            q1 = base + R @ Vector((math.cos(a) * 0.38, -0.36 - math.sin(a) * 0.36, H))
            p.pipe([q0, q1], 0.012, mat=mat, n=6)


def cable_tray(p, a, b, w=0.3, mat="surf:galvanized", cables=3):
    """Open tray with a few cables, from a to b (tray floor points)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    ang = math.degrees(math.atan2(d.y, d.x))
    pitch = math.degrees(math.atan2(d.z, math.hypot(d.x, d.y)))
    mid = (a + b) / 2
    R = Euler((0, -math.radians(pitch), math.radians(ang)), "XYZ").to_matrix()
    p.box((L, w, 0.006), at=mid, rot=(0, -pitch, ang), mat=mat, bevel=0, step=2.0)
    for s in (-1, 1):
        p.box((L, 0.006, 0.08), at=mid + R @ Vector((0, s * w / 2, 0.04)), rot=(0, -pitch, ang), mat=mat, bevel=0, step=2.0)
    if fine():
        for i in range(cables):
            off = R @ Vector((0, (i - (cables - 1) / 2) * w / (cables + 0.5), 0.025))
            p.pipe([a + off, b + off], 0.018, mat="tex:keeper", paint="dark", n=6)


def fins(p, at, length, height, count, depth=0.5, thick=0.012, axis="X", mat="surf:galvanized", paint="white"):
    """A row of thin parallel plates (cooling fins / louvres) along `axis`."""
    at = Vector(at)
    for i in range(count):
        t = (i + 0.5) / count - 0.5
        if axis == "X":
            p.box((thick, depth, height), at=at + Vector((t * length, 0, 0)), mat=mat, paint=paint, bevel=0, step=4.0)
        else:
            p.box((depth, thick, height), at=at + Vector((0, t * length, 0)), mat=mat, paint=paint, bevel=0, step=4.0)
