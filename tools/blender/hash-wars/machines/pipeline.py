
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pack import pack as pack_attributes
"""UV, bake, final materials, LOD, export and re-import check for one machine.

Bake recipe (all Cycles, one texture set per machine):
  masks  : emit bake of AO nodes -> R big-scale occlusion, G convex edges, B small cavities
  normal : tangent normal bake of a Bevel-node shader (rounds remaining sharp edges)
  color  : emit bake of a procedural paint (chips on edges, grime in cavities,
           dust low down, soot near heat vents, streaks) driven by the masks
  orm    : emit bake of (occlusion, roughness, metal), packed the glTF way
"""
import json
import math
import os
import bpy
import bmesh
import numpy as np
from mathutils import Vector

import lib


# --- tiny node-graph helper -------------------------------------------------
class G:
    def __init__(self, mat):
        self.nt = mat.node_tree
        self.nt.nodes.clear()

    def n(self, kind, *ins, out=0, **props):
        node = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        for i, v in enumerate(ins):
            self.set(node.inputs[i], v)
        return node.outputs[out] if out is not None else node

    def set(self, sock, v):
        if v is None:
            return
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        elif isinstance(v, (tuple, list)) and len(v) == 3 and sock.type == 'RGBA':
            sock.default_value = (*v, 1)
        else:
            sock.default_value = v

    def math(self, op, a, b=0.0, clamp=False):
        return self.n('ShaderNodeMath', a, b, operation=op, use_clamp=clamp)

    def mix(self, a, b, f):
        node = self.nt.nodes.new('ShaderNodeMix')
        node.data_type = 'RGBA'
        self.set(node.inputs['Factor'], f)
        self.set(node.inputs['A'], a)
        self.set(node.inputs['B'], b)
        return node.outputs['Result']

    def lerp(self, a, b, f):
        node = self.nt.nodes.new('ShaderNodeMix')
        node.data_type = 'FLOAT'
        self.set(node.inputs['Factor'], f)
        self.set(node.inputs['A'], a)
        self.set(node.inputs['B'], b)
        return node.outputs['Result']

    def maprange(self, v, a, b, c=0.0, d=1.0, smooth=False):
        node = self.nt.nodes.new('ShaderNodeMapRange')
        node.interpolation_type = 'SMOOTHSTEP' if smooth else 'LINEAR'
        node.clamp = True
        for i, x in enumerate((v, a, b, c, d)):
            self.set(node.inputs[i], x)
        return node.outputs[0]

    def noise(self, vec, scale, detail=4.0, rough=0.55):
        node = self.nt.nodes.new('ShaderNodeTexNoise')
        self.set(node.inputs['Vector'], vec)
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = rough
        return node.outputs['Fac']

    def image(self, img):
        node = self.nt.nodes.new('ShaderNodeTexImage')
        node.image = img
        return node

    def out_emit(self, color):
        em = self.n('ShaderNodeEmission', color, 1.0)
        outn = self.nt.nodes.new('ShaderNodeOutputMaterial')
        self.nt.links.new(em, outn.inputs['Surface'])


def _target(g, img):
    """Image node the bake writes into (must be the active node)."""
    node = g.image(img)
    g.nt.nodes.active = node
    node.select = True


# --- pass graphs -----------------------------------------------------------------
def graph_masks(g, img, cfg):
    def ao(dist, inside=False, samples=8):
        node = g.nt.nodes.new('ShaderNodeAmbientOcclusion')
        node.inside = inside
        node.samples = samples
        node.inputs['Distance'].default_value = dist
        return node.outputs['AO']
    big = ao(cfg['ao_dist'])
    edge = g.math('SUBTRACT', 1.0, ao(cfg['edge_dist'], inside=True))
    cav = ao(cfg['cav_dist'])
    g.out_emit(g.n('ShaderNodeCombineColor', big, edge, cav))
    _target(g, img)


def graph_normal(g, img, cfg, paint):
    bev = g.n('ShaderNodeBevel', cfg['bevel_r'], samples=4)
    bsdf = g.n('ShaderNodeBsdfPrincipled', out=None)
    g.nt.links.new(bev, bsdf.inputs['Normal'])
    outn = g.nt.nodes.new('ShaderNodeOutputMaterial')
    g.nt.links.new(bsdf.outputs[0], outn.inputs['Surface'])
    _target(g, img)


def _surface_values(g, masks_img, cfg, paint):
    """Shared paint logic -> (base colour, roughness, metal, occlusion) sockets."""
    base, rough, metal, wcol, wrough, wmetal, wamt, gamt, damt = lib.PAINTS[paint]
    m = g.image(masks_img)
    m.interpolation = 'Linear'
    sep = g.n('ShaderNodeSeparateColor', m.outputs['Color'], out=None)
    ao, edge, cav = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    geo = g.n('ShaderNodeNewGeometry', out=None)
    pos = geo.outputs['Position']
    nrm = geo.outputs['Normal']
    n_s = g.noise(pos, 22.0, 6.0, 0.62)
    n_m = g.noise(pos, 4.5, 4.0, 0.5)
    n_b = g.noise(pos, 0.8, 2.0, 0.5)
    sepn = g.n('ShaderNodeSeparateXYZ', nrm, out=None)
    sepp = g.n('ShaderNodeSeparateXYZ', pos, out=None)

    # chips: convex edges broken up by fine noise
    e = g.math('MULTIPLY', edge, cfg['edge_gain'] * wamt)
    e = g.math('ADD', e, g.math('MULTIPLY', g.math('SUBTRACT', n_s, 0.5), 1.1))
    wear = g.maprange(e, 0.42, 0.62, smooth=True)
    # grime: cavities and occlusion, patchy
    gr = g.math('ADD', g.math('MULTIPLY', g.math('SUBTRACT', 1.0, cav), 1.4),
                g.math('MULTIPLY', g.math('SUBTRACT', 1.0, ao), 0.55))
    gr = g.math('MULTIPLY', gr, g.math('ADD', 0.45, g.math('MULTIPLY', n_m, 0.9)))
    grime = g.math('MULTIPLY', gr, gamt, clamp=True)
    # vertical streaks on walls (rain and coolant runs)
    mapping = g.n('ShaderNodeMapping', pos, out=0)
    mapping.node.inputs['Scale'].default_value = (26.0, 26.0, 1.6)
    st = g.maprange(g.noise(mapping, 1.0, 3.0, 0.5), 0.52, 0.72)
    wall = g.maprange(g.math('ABSOLUTE', sepn.outputs[2]), 0.6, 0.2)
    streak = g.math('MULTIPLY', g.math('MULTIPLY', st, wall), 0.08 * gamt)
    # dust: rises from the ground on legs and feet, settles on upward faces
    low = g.maprange(sepp.outputs[2], cfg['dust_h'], cfg['dust_h0'], smooth=True)
    low = g.math('MULTIPLY', low, g.math('ADD', 0.35, g.math('MULTIPLY', n_m, 1.1)))
    up = g.math('MULTIPLY', g.maprange(sepn.outputs[2], 0.6, 0.95), g.math('MULTIPLY', n_b, 0.35))
    dust = g.math('MULTIPLY', g.math('ADD', low, up), damt, clamp=True)
    # soot and heat tint around vents
    heat = 0.0
    for (hp, hr) in cfg.get('heat', []):
        d = g.n('ShaderNodeVectorMath', pos, tuple(lib.P(*hp)), operation='DISTANCE', out='Value')
        f = g.maprange(d, hr, 0.0)
        heat = f if heat == 0.0 else g.math('MAXIMUM', heat, f)
    if heat != 0.0:
        heat = g.math('MULTIPLY', g.math('POWER', heat, 1.6), g.math('ADD', 0.5, n_m), clamp=True)

    var = g.math('ADD', 0.93, g.math('MULTIPLY', n_b, 0.14))
    col = g.mix(base, wcol, wear)
    dark = g.math('SUBTRACT', 1.0, g.math('MULTIPLY', g.math('ADD', grime, streak), 0.6))
    mul = g.math('MULTIPLY', dark, var)
    col = g.n('ShaderNodeVectorMath', col, g.n('ShaderNodeCombineXYZ', mul, mul, mul), operation='MULTIPLY', out=0)
    col = g.mix(col, cfg['dust_col'], g.math('MULTIPLY', dust, 0.85))
    if heat != 0.0:
        col = g.mix(col, (0.035, 0.03, 0.028), g.math('MULTIPLY', heat, 0.8))

    r = g.math('ADD', rough, g.math('MULTIPLY', g.math('SUBTRACT', n_s, 0.5), 0.14))
    r = g.math('ADD', r, g.math('MULTIPLY', grime, 0.22))
    r = g.lerp(r, wrough, wear)
    r = g.lerp(r, 0.9, dust)
    if heat != 0.0:
        r = g.lerp(r, 0.75, heat)
    mt = g.lerp(metal, wmetal, wear)
    mt = g.math('MULTIPLY', mt, g.math('SUBTRACT', 1.0, g.math('MULTIPLY', dust, 0.9)))
    return col, g.math('MAXIMUM', g.math('MINIMUM', r, 1.0), 0.03), mt, ao


def graph_color(g, img, masks_img, cfg, paint):
    if paint in lib.EMITS:
        g.out_emit((0.04, 0.045, 0.05))  # emission uses its own driven material, not the atlas
    else:
        col, r, mt, ao = _surface_values(g, masks_img, cfg, paint)
        g.out_emit(col)
    _target(g, img)


def graph_orm(g, img, masks_img, cfg, paint):
    if paint in lib.EMITS:
        g.out_emit((1.0, 0.3, 0.0))
    else:
        col, r, mt, ao = _surface_values(g, masks_img, cfg, paint)
        ao2 = g.math('ADD', g.math('MULTIPLY', ao, 0.85), 0.15)  # keep occlusion gentle: the engine adds SSAO
        g.out_emit(g.n('ShaderNodeCombineColor', ao2, r, mt))
    _target(g, img)


# --- steps ---------------------------------------------------------------------
def select_only(objs, active=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def unwrap(meshes, margin):
    print('UV: projecting', flush=True)
    select_only(meshes)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    print('UV: packing', flush=True)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='FRACTION',
                            margin=margin, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')
    print('UV: done', flush=True)


def new_image(name, size, color=True):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Linear Rec.709' if color else 'Non-Color'
    return img


def fit_budget(meshes, budget):
    """Keep the authored forms, simplify enough to leave a small triangle budget margin."""
    total = sum(lib.tri_count(o) for o in meshes)
    if total <= budget:
        return
    ratio = (budget * 0.97) / total
    for o in meshes:
        if lib.tri_count(o) < 100:
            continue
        mod = o.modifiers.new('budget', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        select_only([o])
        bpy.ops.object.modifier_apply(modifier=mod.name)


def bake_materials(meshes):
    """One bake material per paint, assigned in place of the build placeholders."""
    mats = {}
    for p in lib.ALL_PAINTS:
        m = bpy.data.materials.get('bake_' + p) or bpy.data.materials.new('bake_' + p)
        mats[p] = m
    for o in meshes:
        for i, slot in enumerate(o.material_slots):
            paint = slot.material['paint']
            o.data.materials[i] = mats[paint]
    return mats


def combined_bake_target(meshes):
    """Bake the shared atlas once, with all original world-space occlusion preserved.

    The disposable joined copy avoids scanning a full 2048 atlas separately
    for every rigid node. All model nodes use identity rotation and scale.
    Originals are hidden only during baking, then restored unchanged.
    """
    copies=[]
    for o in meshes:
        c=o.copy()
        c.data=o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        world=o.matrix_world.copy()
        c.parent=None
        c.matrix_world=world
        copies.append(c)
        o.hide_render=True
    select_only(copies)
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def discard_bake_target(target, meshes):
    mesh=target.data
    bpy.data.objects.remove(target,do_unlink=True)
    bpy.data.meshes.remove(mesh)
    for o in meshes:
        o.hide_render=False


def run_bake(meshes, kind, samples):
    print(f'Bake: {kind}, {samples} samples', flush=True)
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.render.bake.margin = 2
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_clear = True
    scene.render.bake.target = 'IMAGE_TEXTURES'
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.normal_space = 'TANGENT'
    select_only(meshes)
    bpy.ops.object.bake(type=kind)


def save_png(img, path, srgb):
    """Float bake -> 8-bit PNG (sRGB-encoded for colour) that the exporter turns into WebP."""
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    rgb = np.clip(px[:, :3], 0, 1)
    if srgb:
        rgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - 0.055)
    px[:, :3] = rgb
    px[:, 3] = 1.0
    size = img.size[0]
    out = bpy.data.images.new(os.path.basename(path), size, size, alpha=False)
    out.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    out.pixels.foreach_set(px.ravel())
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    out.filepath = path
    return out


def gltf_output_group():
    grp = bpy.data.node_groups.get('glTF Material Output')
    if grp:
        return grp
    grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    grp.nodes.new('NodeGroupInput')
    return grp


def final_material(name, col_img, orm_img, nrm_img):
    m = bpy.data.materials.new('tex:' + name)
    g = G(m)
    bsdf = g.n('ShaderNodeBsdfPrincipled', out=None)
    outn = g.nt.nodes.new('ShaderNodeOutputMaterial')
    g.nt.links.new(bsdf.outputs[0], outn.inputs['Surface'])
    c = g.image(col_img)
    g.nt.links.new(c.outputs['Color'], bsdf.inputs['Base Color'])
    o = g.image(orm_img)
    sep = g.n('ShaderNodeSeparateColor', o.outputs['Color'], out=None)
    g.nt.links.new(sep.outputs[1], bsdf.inputs['Roughness'])
    g.nt.links.new(sep.outputs[2], bsdf.inputs['Metallic'])
    n = g.image(nrm_img)
    nm = g.n('ShaderNodeNormalMap', 1.0, n.outputs['Color'], out=None)
    g.nt.links.new(nm.outputs[0], bsdf.inputs['Normal'])
    grp = g.nt.nodes.new('ShaderNodeGroup')
    grp.node_tree = gltf_output_group()
    g.nt.links.new(sep.outputs[0], grp.inputs['Occlusion'])
    return m


def swap_to_final(meshes, tex_mat):
    """Collapse baked paints into tex:<name>; emit paints into emit:<channel>."""
    for o in meshes:
        me = o.data
        paints = [s.material.name[len('bake_'):] for s in o.material_slots]
        targets = []
        for p in paints:
            mat = lib.emit_material(p) if p in lib.EMITS else tex_mat
            if mat not in targets:
                targets.append(mat)
        remap = [targets.index(lib.emit_material(p) if p in lib.EMITS else tex_mat) for p in paints]
        idx = [remap[p.material_index] for p in me.polygons]
        me.materials.clear()
        for t in targets:
            me.materials.append(t)
        me.polygons.foreach_set('material_index', idx)
        me.update()


def remove_lod_fasteners(obj):
    """Distant models omit tiny disconnected fasteners instead of flattening them into slivers."""
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    todo=set(bm.verts)
    drop=[]
    while todo:
        seed=todo.pop()
        connected={seed}
        stack=[seed]
        while stack:
            v=stack.pop()
            for edge in v.link_edges:
                other=edge.other_vert(v)
                if other not in connected:
                    connected.add(other)
                    todo.discard(other)
                    stack.append(other)
        faces={f for v in connected for f in v.link_faces}
        if sum(f.calc_area() for f in faces) < .003:
            drop.extend(connected)
    bmesh.ops.delete(bm,geom=drop,context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()


def make_lod(root, ratio):
    """Copy the hierarchy as <name>_lod1 with decimated meshes (same UVs and materials)."""
    def copy(o, parent):
        c = o.copy()
        if o.type == 'MESH':
            c.data = o.data.copy()
            c.data.name = o.data.name + '_lod1'
        c.name = o.name + '_lod1'
        bpy.context.scene.collection.objects.link(c)
        c.parent = parent
        if parent is not None:
            c.matrix_parent_inverse = o.matrix_parent_inverse.copy()
            c.location = o.location.copy()
        if o.type == 'MESH':
            remove_lod_fasteners(c)
        if o.type == 'MESH' and len(c.data.polygons) > 60:
            mod = c.modifiers.new('dec', 'DECIMATE')
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
            select_only([c])
            bpy.ops.object.modifier_apply(modifier='dec')
        for ch in o.children:
            copy(ch, c)
        return c
    return copy(root, None)


def export(path, quality):
    for o in bpy.context.view_layer.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_image_format='WEBP', export_image_quality=quality,
                              export_tangents=False, export_cameras=False, export_lights=False,
                              export_extras=False, export_animations=False, export_skins=False,
                              export_morph=False, use_selection=False)
    pack_attributes(path)


def glb_info(path):
    """Read node list straight from the GLB JSON chunk (what the engine will see)."""
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen = int.from_bytes(data[12:16], 'little')
    js = json.loads(data[20:20 + jlen])
    return js


def verify(path, expect):
    """Re-import the GLB in an empty scene; check names, parents, pivots and closed shells."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    problems = []
    objs = {o.name: o for o in bpy.data.objects}
    for name, (parent, pivot) in expect.items():
        o = objs.get(name)
        if o is None:
            problems.append('missing ' + name)
            continue
        pn = o.parent.name if o.parent else None
        if pn != parent:
            problems.append(f'{name} parent {pn} != {parent}')
        w = o.matrix_world.translation
        if (w - Vector(pivot)).length > 1e-3:
            problems.append(f'{name} pivot {tuple(round(v, 3) for v in w)} != {pivot}')
    # glTF splits vertices at UV/normal seams. Weld coincident vertices before
    # checking watertightness; this never mutates the imported asset itself.
    for name, o in objs.items():
        if o.type != 'MESH':
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-8)
        boundary = sum(e.is_boundary for e in bm.edges)
        bm.free()
        if boundary:
            problems.append(f'{name}: {boundary} open re-imported edges')
    doc = glb_info(path)
    if any(i.get('mimeType') != 'image/webp' for i in doc.get('images', [])):
        problems.append('non-WebP texture')
    if doc.get('animations') or doc.get('skins'):
        problems.append('unexpected animation or skin')
    return problems, objs
