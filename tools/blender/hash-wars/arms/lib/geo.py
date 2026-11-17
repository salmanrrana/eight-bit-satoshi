"""Geometry helpers for the arms package.

Everything here takes millimetres and builds in metres. Blender axes:
X right, Y forward (the muzzle points +Y), Z up. The glTF exporter turns
that into the engine's +Y up, -Z forward.

The main shapes:
  prism(profile, axis, a0, a1, chamfer)  a 2D outline pushed along an axis,
                                         with a 45 degree chamfer round both
                                         faces (machined-plate look)
  lathe(profile, axis, segs)             a (radius, position) outline spun
                                         round an axis (barrels, coils, caps)
  loft(sections)                         rings of points joined into a skin
                                         (forearms, the arc caster shell)
Modifiers are added with bevel()/cut() and applied by finish().
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

MM = 0.001

AXES = {
    # axis -> (index of the push axis, indices the 2D (u, v) map onto)
    "X": (0, (1, 2)),  # side view: u = forward (Y), v = up (Z)
    "Y": (1, (0, 2)),  # front view: u = right (X), v = up (Z)
    "Z": (2, (0, 1)),  # top view: u = right (X), v = forward (Y)
}


def v3(axis, u, v, w):
    """Point from 2D profile coords (u, v) and push coordinate w, in metres."""
    push, (iu, iv) = AXES[axis]
    p = [0.0, 0.0, 0.0]
    p[iu], p[iv], p[push] = u * MM, v * MM, w * MM
    return Vector(p)


def _area(pts):
    return 0.5 * sum(
        pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
        for i in range(len(pts))
    )


def offset_polygon(pts, d):
    """Move every edge of a closed 2D polygon inward by d (miter joins)."""
    if _area(pts) < 0:
        pts = list(reversed(pts))
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        e1 = (p1 - p0).normalized()
        e2 = (p2 - p1).normalized()
        n1 = Vector((-e1.y, e1.x))  # inward for a CCW polygon
        n2 = Vector((-e2.y, e2.x))
        m = n1 + n2
        if m.length < 1e-6:
            m = n1
        m.normalize()
        k = d / max(0.35, m.dot(n1))
        q = p1 + m * k
        out.append((q.x, q.y))
    return out


def rrect(w, h, r, n=4, cx=0.0, cy=0.0, chamfer=False):
    """Rounded (or chamfered) rectangle outline, CCW, n points per corner."""
    r = min(r, w / 2 - 0.01, h / 2 - 0.01)
    pts = []
    corners = [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
               (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]
    for x, y, a0 in corners:
        steps = 1 if chamfer else n
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + x + r * math.cos(a), cy + y + r * math.sin(a)))
    return pts


def circle(r, n=24, cx=0.0, cy=0.0, a0=0.0):
    return [(cx + r * math.cos(a0 + 2 * math.pi * i / n), cy + r * math.sin(a0 + 2 * math.pi * i / n))
            for i in range(n)]


def _link(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat is not None:
        me.materials.append(mat)
    return ob


def _bridge_rings(bm, rings, cap0=True, cap1=True):
    """Join a list of equal-length vertex rings into a closed skin."""
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap0:
        bm.faces.new(list(reversed(rings[0])))
    if cap1:
        bm.faces.new(rings[-1])


def prism(name, profile, axis, a0, a1, chamfer=0.0, mat=None):
    """Outline `profile` (mm, CCW or CW) pushed along `axis` from a0 to a1 mm.

    chamfer > 0 cuts a 45 degree chamfer round both flat faces.
    """
    if _area(profile) < 0:
        profile = list(reversed(profile))
    bm = bmesh.new()
    # Keep the chamfer well inside the outline or the inset ring crosses itself.
    us, vs = [p[0] for p in profile], [p[1] for p in profile]
    c = min(chamfer, abs(a1 - a0) * 0.3, (max(us) - min(us)) * 0.3, (max(vs) - min(vs)) * 0.3)
    if c > 0:
        inner = offset_polygon(profile, c)
        layers = [(inner, a0), (profile, a0 + c), (profile, a1 - c), (inner, a1)]
    else:
        layers = [(profile, a0), (profile, a1)]
    rings = [[bm.verts.new(v3(axis, u, v, w)) for (u, v) in pts] for pts, w in layers]
    _bridge_rings(bm, rings)
    return _link(name, bm, mat)


def lathe(name, profile, axis="Y", segs=24, center=(0, 0), mat=None, a0=0.0, cap=True):
    """Spin a (radius, position) outline (mm) round `axis` through `center` (mm, the two other axes).

    Points with radius 0 close the shape at that end.
    """
    push, (iu, iv) = AXES[axis]
    bm = bmesh.new()
    rings = []
    tips = []
    for r, w in profile:
        if r <= 1e-6:
            p = [0.0, 0.0, 0.0]
            p[iu], p[iv], p[push] = center[0] * MM, center[1] * MM, w * MM
            tips.append((len(rings), bm.verts.new(p)))
            rings.append(None)
            continue
        ring = []
        for i in range(segs):
            a = a0 + 2 * math.pi * i / segs
            p = [0.0, 0.0, 0.0]
            p[iu] = (center[0] + r * math.cos(a)) * MM
            p[iv] = (center[1] + r * math.sin(a)) * MM
            p[push] = w * MM
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        if a is None and b is None:
            continue
        if a is None or b is None:
            ring = b if a is None else a
            tip = tips[[t[0] for t in tips].index(k if a is None else k + 1)][1]
            for i in range(segs):
                j = (i + 1) % segs
                if a is None:
                    bm.faces.new((tip, ring[j], ring[i]))
                else:
                    bm.faces.new((ring[i], ring[j], tip))
            continue
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        if rings[0] is not None:
            bm.faces.new(list(reversed(rings[0])))
        if rings[-1] is not None:
            bm.faces.new(rings[-1])
    return _link(name, bm, mat)


def tube(name, r, w0, w1, axis="Y", center=(0, 0), segs=24, r_in=0.0, mat=None):
    """Cylinder (or pipe when r_in > 0) along `axis` from w0 to w1 mm."""
    if r_in <= 0:
        return lathe(name, [(r, w0), (r, w1)], axis, segs, center, mat)
    return _pipe(name, r, r_in, w0, w1, axis, center, segs, mat)


def _pipe(name, r, r_in, w0, w1, axis, center, segs, mat):
    push, (iu, iv) = AXES[axis]
    bm = bmesh.new()

    def ring(rad, w):
        out = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            p = [0.0, 0.0, 0.0]
            p[iu] = (center[0] + rad * math.cos(a)) * MM
            p[iv] = (center[1] + rad * math.sin(a)) * MM
            p[push] = w * MM
            out.append(bm.verts.new(p))
        return out

    rings = [ring(r, w0), ring(r, w1), ring(r_in, w1), ring(r_in, w0)]
    for k in range(4):
        a, b = rings[k], rings[(k + 1) % 4]
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    return _link(name, bm, mat)


def loft(name, sections, mat=None, cap0=True, cap1=True):
    """Skin through rings of 3D points given in mm (each ring the same length)."""
    bm = bmesh.new()
    rings = [[bm.verts.new(Vector(p) * MM) for p in ring] for ring in sections]
    _bridge_rings(bm, rings, cap0, cap1)
    return _link(name, bm, mat)


def box(name, size, center=(0, 0, 0), chamfer=0.0, mat=None):
    """Axis-aligned box, size and centre in mm, optional chamfer on the X faces."""
    sx, sy, sz = size
    cx, cy, cz = center
    prof = [(cy - sy / 2, cz - sz / 2), (cy + sy / 2, cz - sz / 2), (cy + sy / 2, cz + sz / 2), (cy - sy / 2, cz + sz / 2)]
    return prism(name, prof, "X", cx - sx / 2, cx + sx / 2, chamfer, mat)


def cbox(name, size, center=(0, 0, 0), c=2.0, mat=None):
    """Box with every one of its 12 edges chamfered by c mm (a monolithic block)."""
    sx, sy, sz = size
    cx, cy, cz = center
    c = min(c, sx * 0.3, sy * 0.3, sz * 0.3)
    prof = rrect(sy, sz, c, chamfer=True, cx=cy, cy=cz)
    return prism(name, prof, "X", cx - sx / 2, cx + sx / 2, c, mat)


# --- modifiers -----------------------------------------------------------

def bevel(ob, width=0.8, segs=2, angle=30, profile=0.5, limit="ANGLE"):
    """Round every edge sharper than `angle` degrees (width in mm)."""
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = width * MM
    m.segments = segs
    m.limit_method = limit
    m.angle_limit = math.radians(angle)
    m.profile = profile
    m.harden_normals = True
    m.use_clamp_overlap = True
    m.miter_outer = "MITER_ARC"
    return m


def cut(ob, cutter, op="DIFFERENCE"):
    """Boolean `cutter` out of (or into) `ob`. The cutter is deleted on finish()."""
    m = ob.modifiers.new("cut", "BOOLEAN")
    m.object = cutter
    m.operation = op
    m.solver = "EXACT"
    cutter.hide_render = True
    cutter.hide_set(True)
    cutter["_cutter"] = True
    # A boolean must run before the bevel so the cut edges get rounded too.
    while ob.modifiers.find(m.name) > 0 and ob.modifiers[ob.modifiers.find(m.name) - 1].type != "BOOLEAN":
        bpy.context.view_layer.objects.active = ob
        with bpy.context.temp_override(object=ob):
            bpy.ops.object.modifier_move_up(modifier=m.name)
    return m


def array_cut(ob, make_cutter, positions):
    """Cut a row of identical slots: make_cutter(i, pos) -> object."""
    cutters = [make_cutter(i, p) for i, p in enumerate(positions)]
    head = cutters[0]
    if len(cutters) > 1:
        join(cutters, head.name)
    cut(ob, head)
    return head


def join(objs, name=None):
    """Join meshes into the first one (modifiers on all of them are applied first)."""
    objs = [o for o in objs if o is not None]
    for o in objs:
        apply_mods(o)
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, object=objs[0]):
            bpy.ops.object.join()
    if name:
        objs[0].name = name
        objs[0].data.name = name
    return objs[0]


def apply_mods(ob):
    if ob.type != "MESH" or not ob.modifiers:
        return ob
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    me.name = ob.name
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def weighted(ob):
    m = ob.modifiers.new("wn", "WEIGHTED_NORMAL")
    m.keep_sharp = True
    m.weight = 50
    m.mode = "FACE_AREA_WITH_ANGLE"
    return m


def finish(objs):
    """Apply every modifier and delete the boolean cutters."""
    for o in list(objs):
        apply_mods(o)
    for o in list(bpy.data.objects):
        if o.get("_cutter"):
            bpy.data.objects.remove(o)


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Move an object by loc (mm) and rotation (degrees XYZ) about the world origin, baked into the mesh."""
    m = Matrix.Translation(Vector(loc) * MM) @ Matrix.LocRotScale(None, euler(rot), None)
    ob.data.transform(m)
    return ob


def euler(rot):
    from mathutils import Euler
    return Euler([math.radians(a) for a in rot], "XYZ")


def mirror_x(ob, name):
    """Copy of `ob` mirrored across X = 0 (normals fixed)."""
    me = ob.data.copy()
    me.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
    me.flip_normals()
    cp = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(cp)
    return cp


def screw(name, pos, normal, r=2.2, h=0.9, mat=None, segs=10, socket="hex"):
    """A low cap-head screw (mm) sitting on a surface at `pos` facing `normal`.

    Real geometry, a few dozen triangles, so it catches light from any angle.
    """
    prof = [(0, -0.4), (r, -0.4), (r, h * 0.55), (r * 0.82, h), (r * 0.45, h), (r * 0.45, h * 0.35), (0, h * 0.35)]
    ob = lathe(name, prof, "Z", segs, (0, 0), mat)
    n = Vector(normal).normalized()
    q = Vector((0, 0, 1)).rotation_difference(n)
    ob.data.transform(Matrix.Translation(Vector(pos) * MM) @ q.to_matrix().to_4x4())
    return ob
