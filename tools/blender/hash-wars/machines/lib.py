"""Shared toolkit for the Level 10 Cartel machines.

Coordinates while building (Blender): +Z up, machines face -Y, +X is the
machine's LEFT. The glTF exporter turns this into the contract: +Y up,
facing +Z, origin under the centre (flyers: at their centre).

Every machine module builds bmesh "parts" in world space with a paint per
face, then calls `node()` to turn a list of parts into one rigid object whose
origin sits on its joint pivot. All node rotations stay identity, so a
node's local axes are the model axes (knee axis = X).
"""
import math
import os
import bmesh
import bpy
from mathutils import Matrix, Vector

# --- paints -----------------------------------------------------------------
# Baked paints end up in one `tex:<machine>` material. Emit paints become
# `emit:<channel>` materials the engine drives (its glow colour = base colour).
PAINTS = {
    # name:      base colour (linear), rough, metal, wear colour, wear rough, wear metal, wear, grime, dust
    'pearl':    ((0.58, 0.59, 0.59), 0.30, 0.0, (0.16, 0.165, 0.17), 0.55, 0.0, 1.0, 1.0, 1.0),
    'pearl2':   ((0.40, 0.41, 0.42), 0.34, 0.0, (0.14, 0.145, 0.15), 0.55, 0.0, 0.9, 1.0, 1.0),
    'chrome':   ((0.30, 0.31, 0.33), 0.27, 1.0, (0.62, 0.62, 0.62), 0.28, 1.0, 0.7, 0.8, 0.8),
    'carbon':   ((0.030, 0.032, 0.035), 0.42, 0.0, (0.09, 0.09, 0.09), 0.5, 0.0, 0.35, 0.7, 0.8),
    'rubber':   ((0.022, 0.022, 0.022), 0.78, 0.0, (0.05, 0.05, 0.05), 0.85, 0.0, 0.2, 0.6, 1.4),
    'steel':    ((0.56, 0.56, 0.58), 0.24, 1.0, (0.80, 0.80, 0.80), 0.18, 1.0, 0.4, 0.9, 0.8),
    'rod':      ((0.80, 0.81, 0.82), 0.08, 1.0, (0.80, 0.80, 0.80), 0.08, 1.0, 0.0, 0.3, 0.4),
    'gunmetal': ((0.09, 0.095, 0.10), 0.38, 1.0, (0.40, 0.40, 0.42), 0.30, 1.0, 0.6, 1.0, 0.8),
    'glass':    ((0.006, 0.008, 0.010), 0.04, 0.0, (0.03, 0.03, 0.03), 0.3, 0.0, 0.1, 0.4, 0.5),
}
EMITS = {
    'sensor': (0.25, 0.92, 1.00),
    'charge': (0.45, 0.95, 1.00),
    'engine': (0.55, 0.90, 1.00),
    'heat':   (1.00, 0.28, 0.07),
}
ALL_PAINTS = list(PAINTS) + list(EMITS)
PI = {p: i for i, p in enumerate(ALL_PAINTS)}


def P(x, f, z):
    """Model point from (left, forward, up) to Blender coordinates."""
    return Vector((x, -f, z))


# --- bmesh primitives ---------------------------------------------------------
def _paint(bm, paint):
    for face in bm.faces:
        face.material_index = PI[paint]
    return bm


def xform(bm, mat):
    bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
    return bm


def bevel_sharp(bm, width, segments=2, angle=30.0):
    """Round every edge sharper than `angle` degrees (real geometry bevel)."""
    edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(angle)]
    if edges and width > 0:
        bmesh.ops.bevel(bm, geom=edges, offset=width, segments=segments, profile=0.5,
                        affect='EDGES', clamp_overlap=True, harden_normals=False)
    return bm


def box(size, center, paint, bevel=0.01, segments=2, rot=None):
    """Axis box of `size` (x, f, z) at model `center`; optional rotation matrix about its centre."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    xform(bm, Matrix.Diagonal((size[0], size[1], size[2], 1)))
    bevel_sharp(bm, min(bevel, min(size) * 0.45), segments)
    if rot is not None:
        xform(bm, rot.to_4x4())
    xform(bm, Matrix.Translation(P(*center)))
    return _paint(bm, paint)


def wedge(points8, paint, bevel=0.008):
    """Hexahedron from 8 model points (bottom quad then top quad, CCW seen from above)."""
    bm = bmesh.new()
    vs = [bm.verts.new(P(*p)) for p in points8]
    for idx in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([vs[i] for i in idx])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bevel_sharp(bm, bevel)
    return _paint(bm, paint)


def _axis_mat(axis):
    """Rotation taking +Z onto a model axis name or a Blender vector."""
    if isinstance(axis, str):
        axis = {'x': Vector((1, 0, 0)), 'f': Vector((0, -1, 0)), 'z': Vector((0, 0, 1))}[axis]
    return Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized()).to_matrix().to_4x4()


def cyl(r, depth, center, paint, axis='x', segs=24, bevel=0.004, r2=None, bseg=2):
    """Capped cylinder (or cone with r2) along a model axis, centred at `center`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=r if r2 is None else r2, depth=depth)
    bevel_sharp(bm, bevel, bseg, angle=40)
    xform(bm, _axis_mat(axis))
    xform(bm, Matrix.Translation(P(*center)))
    return _paint(bm, paint)


def annulus(outer, inner, depth, center, paint, segs=24, axis='z'):
    """Closed machined ring with a real bore; four walls, no open backing."""
    bm = bmesh.new()
    rings = [[bm.verts.new((r*math.cos(j*2*math.pi/segs), r*math.sin(j*2*math.pi/segs),z))
              for j in range(segs)] for r,z in
             ((outer,-depth/2),(outer,depth/2),(inner,depth/2),(inner,-depth/2))]
    for k in range(4):
        for j in range(segs):
            bm.faces.new((rings[k][j],rings[k][(j+1)%segs],rings[(k+1)%4][(j+1)%segs],rings[(k+1)%4][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for fc in bm.faces:
        fc.smooth = abs(fc.normal.z) < .5
    xform(bm, _axis_mat(axis))
    xform(bm, Matrix.Translation(P(*center)))
    return _paint(bm, paint)


def rod_between(a, b, r, paint, segs=12, bevel=0.002, r2=None):
    """Cylinder from model point a to b."""
    pa, pb = P(*a), P(*b)
    d = pb - pa
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=d.length)
    bevel_sharp(bm, bevel, 1, angle=40)
    xform(bm, _axis_mat(d))
    xform(bm, Matrix.Translation((pa + pb) / 2))
    return _paint(bm, paint)


def sphere(r, center, paint, segs=16, rings=10, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    xform(bm, Matrix.Diagonal((scale[0], scale[1], scale[2], 1)))
    xform(bm, Matrix.Translation(P(*center)))
    return _paint(bm, paint)


def _sp(c, e):
    return math.copysign(abs(c) ** e, c)


def loft(sections, paint, ring=None, segs=32, gaps=(), cap=True):
    """Smooth hull from superellipse cross-sections along the forward axis.

    sections: list of (f, zc, hw, h_top, h_bot, n[, xc]) from tail to nose.
    ring: optional explicit parameter list in [0, 1) around the section
          (0 = left side middle, 0.25 = top, 0.5 = right, 0.75 = bottom),
          so panel gaps can sit exactly on chosen lines.
    gaps: (i_section, j_ring) quads to delete -> open shell for `panels()`.
    """
    ts = ring if ring is not None else [j / segs for j in range(segs)]
    bm = bmesh.new()
    rings = []
    for s in sections:
        f, zc, hw, ht, hb, n = s[:6]
        xc = s[6] if len(s) > 6 else 0.0
        row = []
        for t in ts:
            a = t * 2 * math.pi
            c, si = math.cos(a), math.sin(a)
            x = xc + hw * _sp(c, 2 / n)
            z = zc + (ht if si >= 0 else hb) * _sp(si, 2 / n)
            row.append(bm.verts.new(P(x, f, z)))
        rings.append(row)
    m = len(ts)
    drop = set(gaps)
    for i in range(len(rings) - 1):
        for j in range(m):
            if (i, j) in drop:
                continue
            bm.faces.new((rings[i][j], rings[i][(j + 1) % m], rings[i + 1][(j + 1) % m], rings[i + 1][j]))
    if cap:
        for row, s in ((rings[0], sections[0]), (rings[-1], sections[-1])):
            c = bm.verts.new(sum((v.co for v in row), Vector()) / m)
            for j in range(m):
                bm.faces.new((row[j], row[(j + 1) % m], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for fc in bm.faces:
        fc.smooth = True
    return _paint(bm, paint)


def panels(bm, thick, rim_bevel=0.004):
    """Give an open shell real thickness and round its rims."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    boundary = [e for e in bm.edges if e.is_boundary]
    bverts = {v for e in boundary for v in e.verts}
    res = bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thick)
    for fc in bm.faces:
        fc.smooth = True
    # Rim faces join the outer boundary verts to their inner copies: flat-shade and bevel them.
    rim_edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(50)]
    if rim_edges and rim_bevel > 0:
        bmesh.ops.bevel(bm, geom=rim_edges, offset=min(rim_bevel, thick * 0.45), segments=2,
                        profile=0.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def tube(points, r, paint, segs=8, smooth=4, cap=True):
    """Cable / hose swept along model points (Catmull-Rom smoothed), capped."""
    pts = [P(*p) for p in points]
    if smooth and len(pts) > 2:
        ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
        out = []
        for i in range(1, len(ext) - 2):
            p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
            for k in range(smooth):
                t = k / smooth
                out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                  + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
        out.append(pts[-1])
        pts = out
    bm = bmesh.new()
    tang = [(pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(len(pts))]
    ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tang[0].cross(ref).normalized()
    rings = []
    for i, p in enumerate(pts):
        t = tang[i]
        nrm = (nrm - t * nrm.dot(t)).normalized()  # parallel transport
        bi = t.cross(nrm)
        rings.append([bm.verts.new(p + (nrm * math.cos(a) + bi * math.sin(a)) * r)
                      for a in (k * 2 * math.pi / segs for k in range(segs))])
    for i in range(len(rings) - 1):
        for j in range(segs):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % segs], rings[i + 1][(j + 1) % segs], rings[i + 1][j]))
    if cap:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for fc in bm.faces:
        fc.smooth = True
    return _paint(bm, paint)


def bolts(points, normal, r, paint='steel', h=0.006):
    """Hex bolt heads at model points, standing out along a model normal."""
    out = []
    n = P(*normal).normalized()
    for p in points:
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r * 0.85, depth=h)
        xform(bm, _axis_mat(n))
        xform(bm, Matrix.Translation(P(*p) + n * (h * 0.3)))
        out.append(_paint(bm, paint))
    return out


def ring_points(center, r, n, axis='x', start=0.0):
    """Points on a circle around a model axis (for bolt rings)."""
    c = Vector(center)
    out = []
    for k in range(n):
        a = start + k * 2 * math.pi / n
        if axis == 'x':
            out.append((c.x, c.y + r * math.cos(a), c.z + r * math.sin(a)))
        elif axis == 'z':
            out.append((c.x + r * math.cos(a), c.y + r * math.sin(a), c.z))
        else:
            out.append((c.x + r * math.cos(a), c.y, c.z + r * math.sin(a)))
    return out


def piston(a, b, r, paint_body='gunmetal', split=0.55):
    """Hydraulic actuator from model point a to b: barrel, polished rod, end eyes."""
    va, vb = Vector(a), Vector(b)
    mid = va.lerp(vb, split)
    parts = [rod_between(a, tuple(mid), r, paint_body, segs=12),
             rod_between(tuple(va.lerp(vb, split - 0.04)), b, r * 0.5, 'rod', segs=10),
             rod_between(tuple(va.lerp(vb, split - 0.02)), tuple(va.lerp(vb, split + 0.01)), r * 1.15, 'steel', segs=12)]
    for p in (va, vb):
        parts.append(cyl(r * 1.1, r * 1.3, tuple(p), 'steel', axis='x', segs=12, bevel=r * 0.2))
    return parts


def mirror_x(parts):
    """Mirror parts to the other side (flip X), keeping normals right."""
    out = []
    for bm in parts:
        c = bm.copy()
        xform(c, Matrix.Diagonal((-1, 1, 1, 1)))
        bmesh.ops.reverse_faces(c, faces=c.faces)
        out.append(c)
    return out


def rot(axis, deg):
    """Rotation matrix about a model axis ('x' left, 'f' forward, 'z' up)."""
    v = {'x': (1, 0, 0), 'f': (0, -1, 0), 'z': (0, 0, 1)}[axis]
    return Matrix.Rotation(math.radians(deg), 3, v)


def moved(parts, mat_or_vec, pivot=(0, 0, 0)):
    """Copy parts rotated (Matrix) about a model pivot, or translated (model vector)."""
    out = []
    for bm in parts:
        c = bm.copy()
        if isinstance(mat_or_vec, Matrix):
            pv = P(*pivot)
            xform(c, Matrix.Translation(pv) @ mat_or_vec.to_4x4() @ Matrix.Translation(-pv))
        else:
            xform(c, Matrix.Translation(P(*mat_or_vec)))
        out.append(c)
    return out


# --- nodes ----------------------------------------------------------------------
def node(name, parts, pivot, parent=None):
    """One rigid node: join parts, put the origin on the model pivot, parent with identity rotation."""
    bm = bmesh.new()
    tmp = bpy.data.meshes.new('tmp')
    for part in parts:
        part.to_mesh(tmp)
        bm.from_mesh(tmp)
        part.free()
    bpy.data.meshes.remove(tmp)
    pv = P(*pivot)
    xform(bm, Matrix.Translation(-pv))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for p in ALL_PAINTS:
        mesh.materials.append(paint_material(p))
    _place(obj, pv, parent)
    return obj


def empty(name, pivot, parent=None, size=0.05):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = size
    bpy.context.scene.collection.objects.link(obj)
    _place(obj, P(*pivot), parent)
    return obj


def _place(obj, world, parent):
    obj['pivot_world'] = list(world)
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.location = world - Vector(parent['pivot_world'])
    else:
        obj.location = world


def finish_meshes(objs):
    """Drop unused slots, weighted normals so big flat faces stay flat beside bevels."""
    for obj in objs:
        if obj.type != 'MESH':
            continue
        me = obj.data
        used = sorted({p.material_index for p in me.polygons})
        remap = {old: new for new, old in enumerate(used)}
        mats = [me.materials[i] for i in used]
        idx = [remap[p.material_index] for p in me.polygons]
        me.materials.clear()
        for m in mats:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', idx)
        me.update()
        mod = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        mod.weight = 50
        mod.mode = 'FACE_AREA'
        bpy.context.view_layer.objects.active = obj
        for o in bpy.context.selected_objects:
            o.select_set(False)
        obj.select_set(True)
        me.set_sharp_from_angle(angle=math.radians(35))
        bpy.ops.object.modifier_apply(modifier='wn')


# --- materials ---------------------------------------------------------------------
_MATS = {}


def paint_material(paint):
    """Placeholder material per paint used while building; replaced by bake materials."""
    key = 'paint_' + paint
    m = bpy.data.materials.get(key)
    if m is None:
        m = bpy.data.materials.new(key)
        m['paint'] = paint
    return m


def emit_material(ch):
    name = 'emit:' + ch
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    col = EMITS[ch]
    bsdf.inputs['Base Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Color'].default_value = (*col, 1)
    bsdf.inputs['Emission Strength'].default_value = 6.0
    bsdf.inputs['Roughness'].default_value = 0.3
    return m


def tri_count(obj):
    me = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data if obj.type == 'MESH' else None
    if not me:
        return 0
    return sum(len(p.vertices) - 2 for p in me.polygons)


def open_edges(obj):
    """Boundary (non-manifold) edge count: 0 means every shell is closed."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    n = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    return n


def walk(root):
    yield root
    for c in root.children:
        yield from walk(c)


def out_dirs():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, '..', '..', '..', '..'))
    return (repo,
            os.path.join(repo, 'assets', 'hash-wars', 'machines'),
            os.path.join(repo, '.impeccable', 'review', 'level-10', 'art-machines'))


def smooth_sections(keys, steps=3):
    """Catmull-Rom between key sections so silhouettes stay smooth (same tuple layout)."""
    if len(keys) < 3:
        return keys
    ext = [keys[0]] + list(keys) + [keys[-1]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(steps):
            t = k / steps
            out.append(tuple(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t
                                    + (-a + 3 * b - 3 * c + d) * t ** 3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(keys[-1])
    return out


def cut_gap(bm, co, no, gap, region=None):
    """Cut a panel gap: slab of width `gap` around model plane (co, no), optionally
    only where region(model_point) is true. Leaves an open shell for panels()."""
    c, n = P(*co), P(*no).normalized()
    for off in (-gap / 2, gap / 2):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=c + n * off, plane_no=n)
    kill = []
    for fc in bm.faces:
        ctr = fc.calc_center_median()
        if abs((ctr - c).dot(n)) < gap / 2:
            if region is None or region(Vector((ctr.x, -ctr.y, ctr.z))):
                kill.append(fc)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    return bm


def kill_faces(bm, pred):
    """Delete faces whose model-space centre satisfies pred (to open a hull)."""
    kill = [fc for fc in bm.faces if pred(Vector((fc.calc_center_median().x, -fc.calc_center_median().y,
                                                  fc.calc_center_median().z)))]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    return bm


def repaint(bm, paint, pred):
    """Give faces whose model-space centre satisfies pred another paint."""
    for fc in bm.faces:
        c = fc.calc_center_median()
        if pred(Vector((c.x, -c.y, c.z))):
            fc.material_index = PI[paint]
    return bm


def seg_frame(start, end):
    """Matrix mapping a local build frame (segment from origin down to (0,0,-L),
    local forward = perpendicular in the sagittal plane) onto the model segment."""
    a, b = P(*start), P(*end)
    d = (b - a).normalized()
    r = Vector((0, 0, -1)).rotation_difference(d).to_matrix().to_4x4()
    return Matrix.Translation(a) @ r


def framed(parts, mat):
    for bm in parts:
        xform(bm, mat)
    return parts


def length(a, b):
    return (Vector(a) - Vector(b)).length


def down_loft(sections, paint, **kw):
    """Loft whose 'forward' runs DOWN the local segment (f -> -z); its 'top' faces local forward."""
    bm = loft(sections, paint, **kw)
    xform(bm, Matrix.Rotation(math.radians(90), 4, 'X'))
    return bm
