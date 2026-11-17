
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pack import pack as pack_attributes
"""Turns Part trees into Blender objects, bakes AO into vertex colours, exports
GLBs and describes them in manifest.json.

Pieces are laid out side by side along X while baking (so they do not shade
each other) and moved back to the origin only for export.
"""
import bpy, bmesh, math, json, os
import numpy as np
from mathutils import Vector
from kit import DETAIL, _MATS, TILE, material

GAP = 24.0


class Registry:
    """Collects the pieces of one GLB file."""

    def __init__(self, file):
        self.file = file
        self.pieces = []
        self.cursor = 0.0

    def add(self, name, fn, lod=False, ao=2.5, note="", grime=1.0, lod_ratio=None):
        """fn() builds and returns the root Part. lod=True also builds `<name>_lod1`
        by calling fn again at detail level 1."""
        DETAIL.q = 0
        root = fn()
        assert root.name == name, (root.name, name)
        rec = {"name": name, "note": note, "ao": ao, "grime": grime, "solids": root.solids,
               "parts": _collect(root)}
        objs = _realize(root, None, "")
        rec["root"] = objs[0]
        rec["objs"] = objs
        if lod:
            DETAIL.q = 1
            low = fn()
            lobjs = _realize(low, None, "_lod1")
            if lod_ratio:
                # Keep thin luminous strips and lettering intact. Collapse only
                # the bulk; merging those features into it can erase them entirely.
                lobjs += _separate_lod_lights(lobjs)
                protected=[o for o in lobjs if '_inscription_' in o.name or o.name.endswith('_lights')]
                bulk=[o for o in lobjs if o not in protected and o.type=='MESH' and len(o.data.polygons)]
                target=max(0,_tris(objs)*lod_ratio-_tris(protected))
                ratio=min(1.0,max(.18,target/max(1,_tris(bulk))))
                if ratio<.98:
                    for o in bulk:
                        mod=o.modifiers.new('distant_silhouette','DECIMATE');mod.ratio=ratio
                        bpy.context.view_layer.objects.active=o
                        bpy.ops.object.modifier_apply(modifier=mod.name)
            rec["lod_root"] = lobjs[0]
            rec["lod_objs"] = lobjs
            DETAIL.q = 0
        # Place side by side for baking and review renders.
        w = _width(objs)
        x = self.cursor + w / 2
        rec["offset"] = Vector((x, 0, 0))
        rec["root"].location = rec["offset"]
        if lod:
            rec["lod_root"].location = rec["offset"] + Vector((0, 120, 0))
        self.cursor += w + GAP
        self.pieces.append(rec)
        return rec


def _separate_lod_lights(objs):
    """Keep glowing faces as rigid children in the LOD, immune to edge collapse."""
    extra=[]
    for o in objs:
        if o.type!='MESH':continue
        indices={i for i,m in enumerate(o.data.materials) if m.name.startswith('emit:')}
        if not indices:continue
        bm=bmesh.new();bm.from_mesh(o.data);light=bm.copy()
        bmesh.ops.delete(light,geom=[f for f in light.faces if f.material_index not in indices],context='FACES')
        bmesh.ops.delete(light,geom=[v for v in light.verts if not v.link_faces],context='VERTS')
        mesh=bpy.data.meshes.new(o.name+'_lights');light.to_mesh(mesh);light.free()
        for m in o.data.materials:mesh.materials.append(m)
        child=bpy.data.objects.new(o.name+'_lights',mesh);bpy.context.scene.collection.objects.link(child)
        child.parent=o;extra.append(child)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in indices],context='FACES')
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
        bm.to_mesh(o.data);bm.free()
        # An all-emissive parent keeps an empty mesh and its named rigid pivot.
        # Keep its object alive; glTF exports the transform with the light child.
    return extra


def _collect(part, out=None):
    out = out if out is not None else []
    out.append(part)
    for c in part.children:
        _collect(c, out)
    return out


def _width(objs):
    xs = []
    for o in objs:
        if o.type == "MESH":
            for v in o.data.vertices:
                xs.append(v.co.x + (o.matrix_local.translation.x if o.parent else 0))
    return (max(xs) - min(xs)) if xs else 2.0


def _mesh_from_part(part, name):
    bm = part.bm
    bm.normal_update()
    # Imported font meshes carry an empty UV layer; replace it rather than
    # exporting a dummy first UV set and putting the authored UVs in set 1.
    for layer in list(bm.loops.layers.uv.values()):
        bm.loops.layers.uv.remove(layer)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        a = max(range(3), key=lambda i: abs(n[i]))
        i, j = [(1, 2), (0, 2), (0, 1)][a]
        flip = -1 if n[a] < 0 else 1
        for l in f.loops:
            co = l.vert.co
            if a == 2:
                l[uv].uv = (co[i] / TILE, co[j] * flip / TILE)
            else:
                l[uv].uv = (co[i] * (flip if a == 0 else -flip) / TILE, co[j] / TILE)
    bmesh.ops.translate(bm, vec=-part.origin, verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    # Compact material slots to the ones this mesh uses.
    idx = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("material_index", idx)
    used = sorted(set(idx.tolist()))
    remap = np.zeros(max(used) + 1 if used else 1, np.int32)
    for k, u in enumerate(used):
        remap[u] = k
        me.materials.append(material(_MATS[u]))
    if len(idx):
        me.polygons.foreach_set("material_index", remap[idx])
    me.shade_smooth()
    if "_inscription_" in part.name:
        me.shade_flat()
    me.set_sharp_from_angle(angle=math.radians(40))
    return me


def _realize(part, parent_obj, suffix):
    """Create objects for a Part tree; returns [root, ...descendants]."""
    coll = bpy.context.scene.collection
    name = part.name + suffix
    out = []
    if len(part.bm.faces):
        me = _mesh_from_part(part, name)
        obj = bpy.data.objects.new(name, me)
        coll.objects.link(obj)
        mod = obj.modifiers.new("wn", "WEIGHTED_NORMAL")
        mod.keep_sharp = True
        mod.weight = 50
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        obj.modifiers.clear()
        obj.data = me2
        bpy.data.meshes.remove(me)
        me2.name = name
    else:
        obj = bpy.data.objects.new(name, None)
        coll.objects.link(obj)
    if parent_obj is not None:
        obj.parent = parent_obj
        obj.location = part.origin - part.parent.origin
    out.append(obj)
    for nm, loc in part.empties:
        e = bpy.data.objects.new(nm + suffix, None)
        e.empty_display_size = 0.2
        coll.objects.link(e)
        e.parent = obj
        e.location = loc - part.origin
        out.append(e)
    for c in part.children:
        out += _realize(c, obj, suffix)
    return out


# ---------------------------------------------------------------- AO + grime

def ground(size=600):
    me = bpy.data.meshes.new("ground")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("ground", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def bake_ao(registry, samples=20):
    """Bake ambient occlusion (with a ground plane occluding) into each mesh's
    'ao' point attribute, grouped by AO distance."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.render.bake.target = "VERTEX_COLORS"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("world")
    groups = {}
    for rec in registry.pieces:
        objs = rec["objs"] + rec.get("lod_objs", [])
        groups.setdefault(rec["ao"], []).extend(o for o in objs if o.type == "MESH" and len(o.data.polygons))
    for dist, objs in groups.items():
        sc.world.light_settings.distance = dist
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            ca = o.data.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
            o.data.color_attributes.active_color = ca
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")


def _hash(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = h & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 1274126177) & 0xFFFFFFFF
    h ^= h >> 16
    return h.astype(np.float64) / 4294967295.0


def vnoise(P, seed=0):
    """3D value noise in [0, 1] for an (N, 3) array."""
    i = np.floor(P).astype(np.int64)
    f = P - i
    f = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + w * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def combine_colours(registry):
    """Col (corner) = paint x AO x grime. Grime: dust splash near the ground,
    rain streaks on walls, dust on ledges, slow mottling."""
    for rec in registry.pieces:
        for objs, off in ((rec["objs"], rec["offset"]), (rec.get("lod_objs", []), rec["offset"] + Vector((0, 120, 0)))):
            for o in objs:
                if o.type != "MESH" or not len(o.data.polygons):
                    continue
                _combine(o, off, rec["grime"])


def _combine(o, off, grime):
    me = o.data
    nl, nv = len(me.loops), len(me.vertices)
    if "_inscription_" in o.name:
        grime=0  # Text cut-outs need an even stone field; texture supplies fine wear.
    paint = np.empty(nl * 4, np.float32)
    me.color_attributes["paint"].data.foreach_get("color", paint)
    paint = paint.reshape(-1, 4)[:, :3]
    ao = np.empty(nv * 4, np.float32)
    me.color_attributes["ao"].data.foreach_get("color", ao)
    ao = ao.reshape(-1, 4)[:, 0]
    lv = np.empty(nl, np.int64)
    me.loops.foreach_get("vertex_index", lv)
    co = np.empty(nv * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    M = np.array(o.matrix_world)
    co = co @ M[:3, :3].T + M[:3, 3] - np.array(off)
    nrm = np.empty(nl * 3)
    me.corner_normals.foreach_get("vector", nrm)
    nrm = nrm.reshape(-1, 3) @ M[:3, :3].T
    ls = np.empty(len(me.polygons), np.int64)
    lt = np.empty(len(me.polygons), np.int64)
    pm = np.empty(len(me.polygons), np.int64)
    me.polygons.foreach_get("loop_start", ls)
    me.polygons.foreach_get("loop_total", lt)
    me.polygons.foreach_get("material_index", pm)
    lmat = np.repeat(pm, lt)
    emit = np.array([m.name.startswith("emit:") for m in me.materials])[lmat]
    P = co[lv]
    a = ao[lv]
    occ = 0.30 + 0.70 * np.clip(a, 0, 1) ** 1.15
    if "_inscription_" in o.name:
        # Boolean glyphs create long planar triangles. Uniform indirect AO
        # avoids interpolated diagonal bands; real cut geometry casts shadows.
        occ = np.full_like(occ, .92)
    z = P[:, 2]
    n1 = vnoise(P * 1.3, 1)
    n2 = vnoise(P * np.array([5.0, 5.0, 0.35]), 2)
    n3 = vnoise(P * 0.25, 3)
    dust = np.clip(1 - z / 0.8, 0, 1) ** 2 * (0.55 + 0.45 * n1)
    vert = np.clip(1 - np.abs(nrm[:, 2]) * 2.5, 0, 1)
    streak = vert * np.clip(n2 * 1.6 - 0.75, 0, 1) * (0.5 + 0.5 * n3)
    up = np.clip((nrm[:, 2] - 0.6) * 2.5, 0, 1) * (0.4 + 0.6 * n1)
    col = paint * occ[:, None]
    col *= (0.9 + 0.1 * n3)[:, None] ** grime
    soil = np.array([0.62, 0.55, 0.46])
    col = col * (1 - 0.4 * grime * dust[:, None]) + col * soil * (0.4 * grime * dust[:, None])
    col *= (1 - 0.28 * grime * streak)[:, None]
    col = col * (1 - 0.25 * grime * up[:, None]) + col * np.array([0.9, 0.84, 0.74]) * (0.25 * grime * up[:, None])
    # Sparse substrate marks on machined arrises. The sharp-edge mask keeps
    # wear off the middle of large flat panels; AO still supplies recess grime.
    edge = np.zeros(nv, np.float32)
    for e in me.edges:
        if e.use_edge_sharp:
            edge[e.vertices[0]] = 1
            edge[e.vertices[1]] = 1
    speckle = np.clip((vnoise(P * 83, 17) - .62) * 5, 0, 1)
    coated = np.array([m.name.startswith('tex:') for m in me.materials])[lmat]
    wear = edge[lv] * speckle * coated * .22
    substrate = np.array([.23, .225, .21]) * occ[:,None]
    col = col * (1-wear[:,None]) + substrate * wear[:,None]
    col[emit] = 1.0
    out = np.ones((nl, 4), np.float32)
    out[:, :3] = np.clip(col, 0, 1)
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    ca.data.foreach_set("color", out.ravel())
    for nm in ("paint", "ao"):
        me.color_attributes.remove(me.color_attributes[nm])
    me.color_attributes.active_color = me.color_attributes["Col"]
    me.color_attributes.render_color_index = me.color_attributes.find("Col")


# ---------------------------------------------------------------- export + manifest

def _descendants(o):
    out = [o]
    for c in o.children:
        out += _descendants(c)
    return out


def export(registry, out_dir):
    path = os.path.join(out_dir, registry.file + ".glb")
    bpy.ops.object.select_all(action="DESELECT")
    saved = []
    for rec in registry.pieces:
        for key in ("root", "lod_root"):
            r = rec.get(key)
            if r is None:
                continue
            saved.append((r, r.location.copy()))
            r.location = (0, 0, 0)
            for o in _descendants(r):
                o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path+".staging.glb", export_format="GLB", use_selection=True, export_apply=False,
        export_yup=True, export_vertex_color="ACTIVE", export_all_vertex_colors=False,
        export_image_format="WEBP", export_image_quality=82, export_normals=True,
        export_tangents=False, export_cameras=False, export_lights=False, export_extras=False,
        export_animations=False, export_skins=False, export_morph=False)
    import compact, slim
    compact.pack(path+".staging.glb")
    slim.slim(path+".staging.glb")  # surf:/emit: never read UVs
    pack_attributes(path+".staging.glb")
    os.replace(path+".staging.glb",path)
    for r, loc in saved:
        r.location = loc
    bpy.context.view_layer.update()
    return path


def _tris(objs):
    t = 0
    for o in objs:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            t += len(o.data.loop_triangles)
    return t


def _bbox(objs, off):
    pts = []
    for o in objs:
        if o.type != "MESH":
            continue
        M = o.matrix_world
        for v in o.data.vertices:
            pts.append(M @ v.co - off)
    a = np.array(pts, dtype=np.float64)
    mn, mx = a.min(0), a.max(0)
    # Blender (x, y, z) -> glTF (x, z, -y)
    return {"min": [round(mn[0], 3), round(mn[2], 3), round(-mx[1], 3)],
            "max": [round(mx[0], 3), round(mx[2], 3), round(-mn[1], 3)],
            "size": [round(mx[0] - mn[0], 3), round(mx[2] - mn[2], 3), round(mx[1] - mn[1], 3)]}


def _solid_gltf(s):
    if s["shape"] == "box":
        mn, mx = s["min"], s["max"]
        return {"shape": "box", "min": [round(mn[0], 3), round(mn[2], 3), round(-mx[1], 3)],
                "max": [round(mx[0], 3), round(mx[2], 3), round(-mn[1], 3)]}
    return {"shape": "cyl", "x": round(s["x"], 3), "z": round(-s["y"], 3), "r": s["r"],
            "y0": round(s["z0"], 3), "y1": round(s["z1"], 3)}


def describe(registry, path):
    pieces = []
    for rec in registry.pieces:
        objs = rec["objs"]
        mats = sorted({m.name for o in objs if o.type == "MESH" for m in o.data.materials})
        entry = {
            "name": rec["name"], "note": rec["note"], **_bbox(objs, rec["offset"]),
            "triangles": _tris(objs), "materials": mats,
            "nodes": [o.name for o in objs[1:]],
            "rigidNodes": [{"name": o.name, "parent": o.parent.name,
                            "pivot": [round(float(o.location.x),4), round(float(o.location.z),4), round(float(-o.location.y),4)]}
                           for o in objs[1:] if o.parent and o.type == 'MESH'],
            "solids": [_solid_gltf(s) for s in rec["solids"]],
        }
        if "lod_root" in rec:
            entry["lod1"] = {"name": rec["lod_root"].name, "triangles": _tris(rec["lod_objs"])}
        pieces.append(entry)
    return {"file": os.path.basename(path), "bytes": os.path.getsize(path), "pieces": pieces}


def write_manifest(out_dir, entries):
    mpath = os.path.join(out_dir, "manifest.json")
    data = {}
    if os.path.exists(mpath):
        try:
            with open(mpath) as f:
                data = json.load(f)
        except json.JSONDecodeError:
            data = {}
    files = {e["file"]: e for e in data.get("files", [])}
    for e in entries:
        files[e["file"]] = e
    data = {
        "package": "structures",
        "axes": "metres, +Y up; each piece's origin is on the ground at its centre; front faces +Z",
        "materials": {
            "surf:<name>": "engine tiling surface x COLOR_0 (baked AO, grime, tint)",
            "tex:keeper": "baked tiling ceramic textures in the GLB (2 m repeat) x COLOR_0 paint and AO",
            "emit:team": "Keeper station/causeway/gate/beacon lines and screens; engine drives cold red-white -> orange",
            "emit:lamp": "steady warm-white lamp heads",
            "emit:amber": "small steady amber readouts",
        },
        "solids": "collision shapes in each piece's own space: box {min,max} or upright cylinder {x,z,r,y0,y1}",
        "stateContract": {
            "weapon_rack": {"node": "rack_door", "axis": "X", "openDegrees": -110, "openRoot": "weapon_rack_open"},
            "weapon_case": {"node": "case_lid", "axis": "X", "openDegrees": -105, "openRoot": "weapon_case_open"},
            "pylon": {"node": "pylon_screen", "channel": "team"},
            "dam_sluice": {"node": "sluice_gate", "axis": "Y", "raiseMetres": 9},
            "summit_beacon": {"node": "beacon_emitter", "axis": "Y", "raiseMetres": .8, "turnDegrees": 360, "core": "beacon_core", "beam": "beacon_beam", "channel": "team"}
        },
        "files": [files[k] for k in sorted(files)],
    }
    with open(mpath + ".tmp", "w") as f:
        json.dump(data, f, indent=1, default=lambda value: value.item())
    os.replace(mpath + ".tmp", mpath)
    return mpath
