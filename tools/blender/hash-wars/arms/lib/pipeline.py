"""From procedural model to game file: decals, UVs, bake, export, check, render.

Order for one weapon (see build.py):
    text_decal()          render text masks used by finish materials
    ...weapon module builds the model...
    layout_uvs()          one shared atlas for every baked object
    bake()                base colour, roughness, metal, normal, AO -> images
    apply_baked()         swap procedural materials for one tex:<name> material
    make_world_copy()     weapon alone, decimated, reusing the same atlas
    export() / check()    GLB with WebP textures, then re-import and verify
    render_views()        first-person, aimed, three-quarter, close-up stills
"""

import math
import json
import struct
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

from .geo import MM


# --- scene ---------------------------------------------------------------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.render.threads_mode = "FIXED"
    sc.render.threads = 2
    return sc


def empty(name, loc_m=(0, 0, 0), parent=None, size=0.02):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.empty_display_type = "ARROWS"
    e.location = loc_m
    bpy.context.scene.collection.objects.link(e)
    if parent:
        e.parent = parent
    return e


def set_origin(ob, pivot_mm, parent=None):
    """Put the object's origin at pivot (mm, weapon space) without moving its mesh."""
    p = Vector(pivot_mm) * MM
    ob.data.transform(Matrix.Translation(-p))
    ob.location = p
    if parent:
        ob.parent = parent
    return ob


# --- decals ----------------------------------------------------------------------

def text_decal(key, text, height_mm, out_dir, px_per_mm=24, bold=0.012):
    """Render white-on-black text and return (image, (width_mm, height_mm)).

    height_mm is the height of the whole decal box; the text fills ~80% of it.
    """
    sc = bpy.context.scene
    cu = bpy.data.curves.new(key, "FONT")
    cu.body = text
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.size = 1.0
    cu.offset = bold
    cu.space_character = 1.06
    ob = bpy.data.objects.new(key, cu)
    sc.collection.objects.link(ob)
    bpy.context.view_layer.update()
    dw, dh = max(ob.dimensions.x, 0.1), max(ob.dimensions.y, 0.1)
    aspect = (dw + 0.3) / (dh + 0.3)
    cam_d = bpy.data.cameras.new("decal_cam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = dw + 0.3
    cam = bpy.data.objects.new("decal_cam", cam_d)
    cam.location = (0, 0, 5)
    sc.collection.objects.link(cam)
    sc.camera = cam
    w_mm = height_mm * aspect
    r = sc.render
    old = (r.engine, r.resolution_x, r.resolution_y, r.filepath)
    r.engine = "BLENDER_WORKBENCH"
    r.resolution_x = max(64, int(w_mm * px_per_mm))
    r.resolution_y = max(16, int(height_mm * px_per_mm))
    r.resolution_percentage = 100
    sc.display.shading.light = "FLAT"
    sc.display.shading.color_type = "SINGLE"
    sc.display.shading.single_color = (1, 1, 1)
    sc.display.render_aa = "16"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("w")
    sc.world.color = (0, 0, 0)
    sc.view_settings.view_transform = "Standard"
    path = os.path.join(out_dir, f"decal_{key}.png")
    r.filepath = path
    r.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    r.engine, r.resolution_x, r.resolution_y, r.filepath = old
    bpy.data.objects.remove(ob)
    bpy.data.objects.remove(cam)
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"
    return img, (w_mm, height_mm)


# --- world copy ------------------------------------------------------------------

def make_world_copy(name, objs, ratio):
    """Join copies of the weapon's meshes into one decimated mesh (same UVs and materials)."""
    copies = []
    for o in objs:
        c = o.copy()
        c.data = o.data.copy()
        c.parent = None
        c.matrix_world = o.matrix_world.copy()
        bpy.context.scene.collection.objects.link(c)
        copies.append(c)
    for c in copies:
        c.data.transform(c.matrix_world)
        c.matrix_world = Matrix.Identity(4)
    with bpy.context.temp_override(active_object=copies[0], selected_editable_objects=copies, object=copies[0]):
        bpy.ops.object.join()
    w = copies[0]
    w.name = w.data.name = name
    m = w.modifiers.new("dec", "DECIMATE")
    m.ratio = ratio
    m.use_collapse_triangulate = True
    m.delimit = {"UV", "SEAM", "MATERIAL"}
    from .geo import apply_mods
    apply_mods(w)
    return w


# --- UVs ---------------------------------------------------------------------------

def layout_uvs(objs, density=None, margin=0.0025):
    """One atlas shared by all objs. density: {name: texel density factor}."""
    density = density or {}
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(52), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs:
        k = density.get(o.name, 1.0)
        if abs(k - 1.0) > 1e-3:
            uv = o.data.uv_layers.active.data
            arr = np.empty(len(uv) * 2, dtype=np.float32)
            uv.foreach_get("uv", arr)
            uv.foreach_set("uv", arr * k)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, shape_method="CONCAVE", scale=True)
    bpy.ops.object.mode_set(mode="OBJECT")


# --- bake ----------------------------------------------------------------------

def _target_nodes(objs, img):
    mats = {m for o in objs for m in o.data.materials if m}
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.get("_bake") or nt.nodes.new("ShaderNodeTexImage")
        n.name = "_bake"
        n.image = img
        nt.nodes.active = n
    return mats


def _emit_route(mat, sock):
    """Send `sock` (a material output) straight to the surface as emission."""
    nt = mat.node_tree
    em = nt.nodes.get("_emit") or nt.nodes.new("ShaderNodeEmission")
    em.name = "_emit"
    out = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial")
    for l in list(out.inputs["Surface"].links):
        nt.links.remove(l)
    for l in list(em.inputs["Color"].links):
        nt.links.remove(l)
    if sock.type == "VALUE":
        cmb = nt.nodes.get("_cmb") or nt.nodes.new("ShaderNodeCombineColor")
        cmb.name = "_cmb"
        for i in range(3):
            nt.links.new(sock, cmb.inputs[i])
        nt.links.new(cmb.outputs[0], em.inputs["Color"])
    else:
        nt.links.new(sock, em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])


def _restore(mat, outputs):
    nt = mat.node_tree
    out = outputs["out"]
    for l in list(out.inputs["Surface"].links):
        nt.links.remove(l)
    nt.links.new(outputs["bsdf"].outputs[0], out.inputs["Surface"])


def bake(objs, outputs, size, out_dir, key, samples=2, hide=()):
    """Bake every pass into numpy arrays (linear floats, HxWx4)."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    b = sc.render.bake
    b.margin = max(4, size // 128)
    b.margin_type = "EXTEND"
    b.use_clear = True
    b.target = "IMAGE_TEXTURES"
    for o in hide:
        o.hide_render = True
    if sc.world is None:
        sc.world = bpy.data.worlds.new("bake")
    for o in sc.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    mats = set()
    out = {}
    for pass_name in ("base", "rough", "metal", "normal", "ao"):
        img = bpy.data.images.new(f"{key}_{pass_name}", size, size, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        mats = _target_nodes(objs, img)
        if pass_name in ("base", "rough", "metal"):
            for m in mats:
                _emit_route(m, outputs[m.name][pass_name])
            bpy.ops.object.bake(type="EMIT")
        else:
            for m in mats:
                _restore(m, outputs[m.name])
            if pass_name == "normal":
                b.normal_space = "TANGENT"
                bpy.ops.object.bake(type="NORMAL")
            else:
                # The contact pass needs only the mesh, not the expensive
                # procedural normal/curvature network already baked above.
                for m in mats:
                    nt = m.node_tree
                    diffuse = nt.nodes.get("_ao_surface") or nt.nodes.new("ShaderNodeBsdfDiffuse")
                    diffuse.name = "_ao_surface"
                    nt.links.new(diffuse.outputs[0], outputs[m.name]["out"].inputs["Surface"])
                sc.cycles.samples = max(samples, 16)
                bpy.ops.object.bake(type="AO")
                sc.cycles.samples = samples
        a = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(a)
        out[pass_name] = a.reshape(size, size, 4)
        print(f"[bake] {key} {pass_name} done", flush=True)
        bpy.data.images.remove(img)
    for m in mats:
        _restore(m, outputs[m.name])
    for o in hide:
        o.hide_render = False
    return out


def _to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def _blur(a, r=1):
    """Small box blur (for noisy AO)."""
    out = a.copy()
    n = 1
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx or dy:
                out += np.roll(np.roll(a, dy, 0), dx, 1)
                n += 1
    return out / n


def save_maps(passes, out_dir, key):
    """Write base colour (sRGB), normal and ORM (AO, rough, metal) PNGs; return images."""
    size = passes["base"].shape[0]

    def write(name, rgb, colorspace):
        img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
        img.colorspace_settings.name = colorspace
        px = np.ones((size, size, 4), dtype=np.float32)
        px[..., :3] = np.clip(rgb, 0, 1)
        img.pixels.foreach_set(px.ravel())
        path = os.path.join(out_dir, f"{name}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        return img

    base = _to_srgb(passes["base"][..., :3])
    ao = _blur(passes["ao"][..., 0], 1)
    ao = 0.25 + 0.75 * ao  # keep it as a soft contact shadow, not soot
    orm = np.stack([ao, np.clip(passes["rough"][..., 0], 0.04, 1), np.clip(passes["metal"][..., 0], 0, 1)], -1)
    return {
        "base": write(f"{key}_base", base, "sRGB"),
        "normal": write(f"{key}_normal", passes["normal"][..., :3], "Non-Color"),
        "orm": write(f"{key}_orm", orm, "Non-Color"),
    }


def _gltf_output_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g:
        return g
    g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.interface.new_socket(name="Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    g.nodes.new("NodeGroupInput")
    return g


def baked_material(name, imgs):
    """The single tex:<name> material the engine uses as is."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tb = nt.nodes.new("ShaderNodeTexImage")
    tb.image = imgs["base"]
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = imgs["normal"]
    to = nt.nodes.new("ShaderNodeTexImage")
    to.image = imgs["orm"]
    nm = nt.nodes.new("ShaderNodeNormalMap")
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tb.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(to.outputs["Color"], sep.inputs[0])
    nt.links.new(sep.outputs[1], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs[2], bsdf.inputs["Metallic"])
    grp = nt.nodes.new("ShaderNodeGroup")
    grp.node_tree = _gltf_output_group()
    nt.links.new(sep.outputs[0], grp.inputs["Occlusion"])
    return mat


def apply_baked(objs, mat):
    """Replace every baked (procedural) material slot on objs with mat."""
    for o in objs:
        me = o.data
        keep = [m for m in me.materials if m and (m.name.startswith("emit:") or m.name == "tex:lens")]
        if keep:
            raise RuntimeError(f"{o.name} mixes baked and unbaked materials")
        me.materials.clear()
        me.materials.append(mat)
        for p in me.polygons:
            p.material_index = 0


# --- export and check -----------------------------------------------------------------

def to_gltf(v):
    """Blender (x, y, z) -> glTF (x, z, -y)."""
    return [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]


def tri_count(ob):
    me = ob.data
    return sum(len(p.vertices) - 2 for p in me.polygons)


def export(path, roots, quality=72):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for r in roots:
        r.select_set(True)
        for c in r.children_recursive:
            c.select_set(True)
    # Explicit triangles let Blender produce a tangent basis for the baked
    # normal map; its exporter cannot calculate tangents on receiver n-gons.
    for o in bpy.context.selected_objects:
        if o.type == "MESH":
            # Keep UV seams fixed while collapsing hidden/coplanar bevel triangles.
            # The baked normal atlas retains the high-detail surface shading.
            if any(m and m.name.startswith('tex:') and m.name != 'tex:lens' for m in o.data.materials):
                dec = o.modifiers.new('export_budget', 'DECIMATE')
                dec.ratio = 0.62
                dec.delimit = {'UV', 'MATERIAL'}
                dec.use_collapse_triangulate = True
            tri = o.modifiers.new("gltf_triangles", "TRIANGULATE")
            tri.quad_method = "FIXED"
            tri.ngon_method = "BEAUTY"
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_image_format="WEBP", export_image_quality=quality, export_tangents=True,
        export_materials="EXPORT", export_animations=False, export_skins=False, export_morph=False,
        export_cameras=False, export_lights=False, export_extras=False)
    _pack_attributes(path)
    return os.path.getsize(path)


def _pack_attributes(path):
    """Use core normalized UVs and KHR_mesh_quantization normals/tangents.

    Positions use signed normalized shorts within +/-1 metre, with no node transform.
    No mesh decoder is required; three's vendored GLTFLoader supports this extension.
    """
    raw = open(path, 'rb').read()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+size])
    binary = raw[28+size:]
    conversions = {}
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            for semantic, index in primitive['attributes'].items():
                if semantic in ('POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0'):
                    conversions[index] = semantic
    # Degenerate UV corners can export zero tangents. Repair before packing,
    # so direct builds are safe for every weapon without an artist-only adapter.
    tangent_normals = {
        p['attributes']['TANGENT']: p['attributes']['NORMAL']
        for mesh in doc['meshes'] for p in mesh['primitives']
        if 'TANGENT' in p['attributes'] and 'NORMAL' in p['attributes']
    }
    replacements = {}
    for index, semantic in conversions.items():
        accessor = doc['accessors'][index]
        view = doc['bufferViews'][accessor['bufferView']]
        # Blender writes one tight accessor per view. Leave other layouts alone.
        if accessor['componentType'] != 5126 or accessor.get('byteOffset', 0) or view.get('byteStride'):
            continue
        components = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
        start = view.get('byteOffset', 0)
        values = np.frombuffer(binary, dtype='<f4', count=accessor['count']*components, offset=start).reshape(-1,components)
        if semantic == 'TANGENT':
            bad = (~np.isfinite(values).all(axis=1)) | (np.linalg.norm(values[:,:3],axis=1)<.5) | (values[:,3]==0)
            if bad.any():
                normal_accessor = doc['accessors'][tangent_normals[index]]
                normal_view = doc['bufferViews'][normal_accessor['bufferView']]
                normals = np.frombuffer(binary, dtype='<f4', count=normal_accessor['count']*3,
                                        offset=normal_view.get('byteOffset',0)).reshape(-1,3)
                values = values.copy()
                for i in np.flatnonzero(bad):
                    normal = normals[i] / np.linalg.norm(normals[i])
                    axis = np.eye(3)[np.argmin(np.abs(normal))]
                    tangent = np.cross(axis, normal)
                    values[i,:3] = tangent / np.linalg.norm(tangent)
                    values[i,3] = -1 if values[i,3] < 0 else 1
                print(f'[tangents] repaired {bad.sum()} invalid corners', flush=True)
        if semantic == 'POSITION':
            # A metre-wide signed normalized range gives 0.031 mm precision,
            # with no extra transform and therefore no moved origins or pivots.
            if values.min() < -1 or values.max() > 1:
                continue
            encoded = np.rint(values*32767).astype('<i2')
            accessor['componentType'] = 5122
        elif semantic == 'TEXCOORD_0':
            if values.min() < 0 or values.max() > 1:
                continue
            encoded = np.rint(values*65535).astype('<u2')
            accessor['componentType'] = 5123
        else:
            encoded = np.rint(np.clip(values,-1,1)*127).astype('i1')
            accessor['componentType'] = 5120
        accessor['normalized'] = True
        if semantic == 'POSITION':
            accessor['min'] = encoded.min(axis=0).tolist()
            accessor['max'] = encoded.max(axis=0).tolist()
        else:
            accessor.pop('min',None); accessor.pop('max',None)
        # glTF requires each vertex attribute element to start on a 4-byte boundary.
        row_bytes = encoded.dtype.itemsize*components
        if row_bytes % 4:
            stride = (row_bytes+3)//4*4
            padded = np.zeros((len(encoded),stride),dtype='u1')
            padded[:,:row_bytes] = encoded.view('u1').reshape(-1,row_bytes)
            payload=padded.tobytes();view['byteStride']=stride
        else:
            payload=encoded.tobytes()
        replacements[accessor['bufferView']]=payload
    packed=bytearray()
    for i,view in enumerate(doc['bufferViews']):
        packed.extend(b'\0' * (-len(packed)%4))
        oldstart=view.get('byteOffset',0)
        payload=replacements.get(i,binary[oldstart:oldstart+view['byteLength']])
        view['byteOffset']=len(packed);view['byteLength']=len(payload)
        packed.extend(payload)
    doc['buffers'][0]['byteLength']=len(packed)
    for key in ('extensionsUsed','extensionsRequired'):
        if 'KHR_mesh_quantization' not in doc.setdefault(key,[]):
            doc[key].append('KHR_mesh_quantization')
    meta=json.dumps(doc,separators=(',',':')).encode()
    meta+=b' ' * (-len(meta)%4)
    packed.extend(b'\0' * (-len(packed)%4))
    data=struct.pack('<4sII',b'glTF',2,28+len(meta)+len(packed))
    data+=struct.pack('<I4s',len(meta),b'JSON')+meta
    data+=struct.pack('<I4s',len(packed),b'BIN\0')+packed
    with open(path,'wb') as f:
        f.write(data)


def check(path, required):
    """Import the GLB into the (freshly reset) scene and report node facts in glTF space.

    The imported objects stay in the scene so the stills show exactly what the
    engine loads (WebP textures, exported normals and tangents)."""
    bpy.ops.import_scene.gltf(filepath=path)
    new = list(bpy.context.scene.objects)
    nodes = {}
    for o in new:
        nodes[o.name] = dict(
            type=o.type.lower(),
            parent=o.parent.name if o.parent else None,
            pivot=to_gltf(o.matrix_world.to_translation()),
            tris=tri_count(o) if o.type == "MESH" else 0,
            materials=[m.name for m in o.data.materials] if o.type == "MESH" else [],
        )
    # Quantization can make sub-pixel world-copy slivers degenerate; Blender's
    # importer removes those faces. Report the actual shipped index counts.
    with open(path, 'rb') as f:
        raw = f.read()
    chunk_size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+chunk_size])
    for node in doc['nodes']:
        if 'mesh' in node and node['name'] in nodes:
            mesh = doc['meshes'][node['mesh']]
            nodes[node['name']]['tris'] = sum(doc['accessors'][p['indices']]['count']//3 for p in mesh['primitives'])
    problems = [f"missing node {n}" for n in required if n not in nodes]
    for o in new:
        if o.type == "MESH" and any(m is None for m in o.data.materials):
            problems.append(f"{o.name} has an empty material slot")
        if o.type == "MESH" and not o.data.uv_layers:
            textured = any(m and m.name.startswith("tex:") and m.name != "tex:lens"
                           for m in o.data.materials)
            if textured:
                problems.append(f"{o.name} has no UVs")
    return nodes, problems


# --- renders ----------------------------------------------------------------------

def setup_daylight(sc, ground_z=-1.58):
    """Noon-ish sky, a hard warm sun 40 degrees up, and a plain ground plane."""
    w = sc.world or bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "MULTIPLE_SCATTERING"
    except TypeError:
        sky.sky_type = "NISHITA"
    sky.sun_disc = False
    sky.sun_elevation = math.radians(40)
    sky.sun_rotation = math.radians(150)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.22
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])
    sun_d = bpy.data.lights.new("sun", "SUN")
    sun_d.energy = 5.5
    sun_d.angle = math.radians(0.6)
    sun_d.color = (1.0, 0.96, 0.9)
    sun = bpy.data.objects.new("sun", sun_d)
    # 40 degrees up, coming from behind-left of the player (so the gun top is lit).
    sun.rotation_euler = (math.radians(50), 0, math.radians(150 + 180 - 180))
    sc.collection.objects.link(sun)
    me = bpy.data.meshes.new("ground")
    s = 60
    me.from_pydata([(-s, -s, ground_z), (s, -s, ground_z), (s, s, ground_z), (-s, s, ground_z)], [], [(0, 1, 2, 3)])
    g = bpy.data.objects.new("_ground", me)
    gm = bpy.data.materials.new("_ground")
    gm.use_nodes = True
    gb = gm.node_tree.nodes["Principled BSDF"]
    gb.inputs["Base Color"].default_value = (0.06, 0.09, 0.03, 1)
    gb.inputs["Roughness"].default_value = 0.95
    me.materials.append(gm)
    sc.collection.objects.link(g)
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = 0.0
    return [sun, g]


def camera(name, loc_m, look_at_m=None, fov_v=58.0, dir_m=None):
    cd = bpy.data.cameras.new(name)
    cd.sensor_fit = "VERTICAL"
    cd.angle_y = math.radians(fov_v)
    cd.clip_start = 0.01
    cam = bpy.data.objects.new(name, cd)
    cam.location = loc_m
    d = (Vector(look_at_m) - Vector(loc_m)) if look_at_m is not None else Vector(dir_m)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(cam)
    return cam


def render(cam, path, w=640, h=360, samples=48, quick=False):
    """Cycles still; quick=True is a seconds-long Workbench look at the forms."""
    sc = bpy.context.scene
    sc.camera = cam
    if quick:
        sc.render.engine = "BLENDER_WORKBENCH"
        sh = sc.display.shading
        sh.light = "STUDIO"
        sh.color_type = "MATERIAL"
        sh.show_shadows = True
        sh.show_cavity = True
        sh.cavity_type = "BOTH"
        sc.display.render_aa = "8"
        sc.view_settings.view_transform = "Standard"
        sc.render.resolution_x, sc.render.resolution_y = w, h
        sc.render.resolution_percentage = 100
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        sc.view_settings.view_transform = "AgX"
        return
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
