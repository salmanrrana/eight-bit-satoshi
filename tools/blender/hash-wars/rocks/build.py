"""Columnar basalt kit for HASH WARS. Blender 5.3, metres, ground origin, glTF +Y.

Rebuild:  /snap/bin/blender -b --factory-startup -t 2 -P tools/blender/hash-wars/rocks/build.py
Repack:   python3 tools/blender/hash-wars/rocks/build.py --pack-existing

columns.py packs irregular basalt columns and fallen drums. formations.py
shapes weathered lava banks, gorge cuts, ribs, and worn tread crowns.
textures.py makes the shared 2048 atlas. Every piece has a coarser `_lod1`
from the same profile.
"""
import sys
import os
import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
ROOT = HERE.parents[3]
OUT = ROOT / 'assets/hash-wars/rocks'

if '--pack-existing' in sys.argv:
    from pack import pack_existing
    pack_existing(OUT)
    raise SystemExit(0)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from pack import pack as pack_attributes  # noqa: E402
import columns as C  # noqa: E402
import textures  # noqa: E402
import formations  # noqa: E402

S = C.smoothstep


# ---------------------------------------------------------------- pieces
def escarpment(seed, lod):
    """Bank tier, 18 x 16 m, 28 m tall. Front (-Y) meets the valley floor; the
    back sinks into the plateau lip as broken crowns. The game scales it to its
    solid, sunk 2 m below the valley floor."""
    ground = lambda x, y: 2 + 23 * S(0, 1, (y + 6.5) / 13)
    n1 = lambda x: C.vnoise(x * .28, seed * .1, seed)

    def height(x, y, rng):
        rib = n1(x)
        yy = y + (rib - .5) * 4.3
        tooth = 1. + 3.8 * C.vnoise(x * .29, y * .14, seed + 9)
        g = ground(x, y)
        if yy < -4.6:
            h = 5.0 + 5.3 * rib + tooth
        elif yy < .4:
            h = 12.0 + 4.2 * rib + tooth
        elif yy < 4.6:
            h = 19.0 + 3.7 * rib + tooth
        else:
            h = g + .25 + 1.4 * C.vnoise(x * .9, y * .9, seed) ** 2
        h += 2.4 * (C.vnoise(x * .7, y * .7, seed + 5) - .5)
        h = max(h, g + .25) + rng.uniform(-.45, .45)
        return min(h, 27.8)
    return C.field(seed, (-8.45, 8.45, -7.35, 7.35), 1.27, height, ground,
                   lod=lod, broken=.22, stepped=.20, tilt_max=.22, jitter=.23,
                   lean_amp=.055, joint_geometry=False, bevel=.015)


def heap(seed, lod, size):
    """Fallen drums and broken stumps filling a size=(x, y, z) box."""
    rng = random.Random(seed)
    sx, sy, sz = size
    m = C.Mesh()
    stumps = C.field(seed, (-sx * .3, sx * .3, -sy * .25, sy * .25), .85,
                     lambda x, y, r: sz * r.uniform(.45, 1.0), lod=lod, broken=0, stepped=.4, tilt_max=.3)
    m.extend(stumps)
    for i in range(int(3 + sx * sy / 3)):
        ang = rng.uniform(0, math.tau)
        axis = C.norm((math.cos(ang), math.sin(ang), rng.uniform(-.25, .25)))
        r = rng.uniform(.3, .48)
        length = rng.uniform(.5, 1.1)
        cx = rng.uniform(-sx / 2 + .6, sx / 2 - .6)
        cy = rng.uniform(-sy / 2 + .6, sy / 2 - .6)
        cz = r * .8 + (rng.uniform(0, sz * .4) if abs(cx) < sx * .3 and abs(cy) < sy * .25 else 0)
        C.drum(m, rng, (cx, cy, cz), axis, r, length, lod=lod, sv=rng.randrange(4), tv=rng.randrange(4))
    return m


def crowns(seed, lod):
    """Column tops breaking through turf: 5 m across, 0.6 m buried, crowns
    standing 0.25-0.6 m proud and sinking under the grass at the edge."""
    def height(x, y, rng):
        r = math.hypot(x, y) / 2.5
        return .6 + .15 + .45 * (1 - r * r) + .12 * C.vnoise(x * 1.3, y * 1.3, seed)
    return C.field(seed, (-2.5, 2.5, -2.5, 2.5), .85, height, lambda x, y: .6, lod=lod,
                   keep=lambda x, y: math.hypot(x, y) < 2.5, broken=0, quarry=0, stepped=.35,
                   tilt_max=.08, bury_margin=.6, spread=.06, joint_geometry=False)


def scree(seed, lod):
    rng = random.Random(seed)
    m = C.Mesh()
    C.drum(m, rng, (0, 0, .2), C.norm((1, .3, .15)), .26, .34, lod=True, sv=rng.randrange(4), tv=rng.randrange(4))
    return m


def stack(seed, lod):
    """Offshore stack, radius ~5.8 m, 34 m: a bundle of columns, taller inside."""
    def height(x, y, rng):
        r = math.hypot(x, y) / 5.8
        return 34 * (.72 + .28 * (1 - r * r)) + 3 * C.vnoise(x * .4, y * .4, seed) - rng.uniform(0, 2.5)
    return C.field(seed, (-6, 6, -6, 6), 1.3, height, lod=lod, keep=lambda x, y: math.hypot(x, y) < 5.6,
                   broken=.2, stepped=.25, tilt_max=.22, joint_geometry=False, bevel=0)


SPECS = [
    ('escarpment_0', lambda lod: escarpment(31, lod)),
    ('escarpment_1', lambda lod: escarpment(57, lod)),
    ('stair_tread', lambda lod: formations.tread(7, lod)),
    ('stair_tread_b', lambda lod: formations.tread(9, lod)),
    ('boulder_0', lambda lod: heap(201, lod, (1.7, 1.5, 1.0))),
    ('boulder_1', lambda lod: heap(211, lod, (2.6, 2.3, 1.5))),
    ('boulder_2', lambda lod: heap(221, lod, (3.4, 3.0, 1.7))),
    ('boulder_3', lambda lod: heap(231, lod, (4.4, 3.6, 2.0))),
    ('crown_field', lambda lod: crowns(601, lod)),
    ('scree_0', lambda lod: scree(301, lod)),
    ('scree_1', lambda lod: scree(311, lod)),
    ('sea_stack_0', lambda lod: stack(401, lod)),
    ('sea_stack_1', lambda lod: stack(419, lod)),
]

for kind, seeds in [
    ('lava_bank', (19, 26)),
    ('cut_gorge', (4, 15)),
    ('fins_bank', (33, 58)),
    ('summit_ridge', (18, 29)),
]:
    for variant, seed in enumerate(seeds):
        SPECS.append((f'{kind}_{variant}', lambda lod, k=kind, s=seed: formations.escarpment(k, s, lod)))


# ---------------------------------------------------------------- blender
def make_object(name, soup, material):
    """Weld identical vertices, keep per-corner normals and UVs."""
    index, verts, faces = {}, [], []
    for i in range(0, len(soup.p), 3):
        f = []
        for v in soup.p[i:i + 3]:
            key = (round(v[0], 5), round(v[1], 5), round(v[2], 5))
            if key not in index:
                index[key] = len(verts); verts.append(v)
            f.append(index[key])
        if len(set(f)) == 3:
            faces.append((f, i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [f for f, _ in faces])
    uv = mesh.uv_layers.new(name='UVMap')
    normals = []
    for poly, (_, i) in zip(mesh.polygons, faces):
        for corner, loop in enumerate(poly.loop_indices):
            uv.data[loop].uv = soup.uv[i + corner]
            normals.append(soup.n[i + corner])
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
    mesh.normals_split_custom_set(normals)
    mesh.update()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def image(name, rgb, colour):
    h, w, _ = rgb.shape
    im = bpy.data.images.new(name, width=w, height=h, alpha=False)
    if not colour:
        im.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = rgb
    im.pixels.foreach_set(px.ravel())
    im.pack()
    return im


def material(base, normal, orm):
    mat = bpy.data.materials.new('tex:weathered_basalt')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bs = nodes.get('Principled BSDF')
    bs.inputs['Metallic'].default_value = 0
    t_base = nodes.new('ShaderNodeTexImage'); t_base.image = base
    links.new(t_base.outputs['Color'], bs.inputs['Base Color'])
    t_n = nodes.new('ShaderNodeTexImage'); t_n.image = normal
    nm = nodes.new('ShaderNodeNormalMap')
    links.new(t_n.outputs['Color'], nm.inputs['Color']); links.new(nm.outputs[0], bs.inputs['Normal'])
    t_o = nodes.new('ShaderNodeTexImage'); t_o.image = orm
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(t_o.outputs['Color'], sep.inputs[0])
    links.new(sep.outputs['Green'], bs.inputs['Roughness'])
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    gn = nodes.new('ShaderNodeGroup'); gn.node_tree = group
    links.new(sep.outputs['Red'], gn.inputs['Occlusion'])
    return mat


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    print('TEXTURES', flush=True)
    base, normal, orm = textures.build()
    C.TEX_JOINTS = list(textures.JOINTS)
    mat = material(image('basalt_base', base, True), image('basalt_normal', normal, False),
                   image('basalt_orm', orm, False))
    entries = {}
    for name, make in SPECS:
        near = C.recentre(make(False))
        far = make(True)
        # LOD shares the near piece's origin: shift by the same offset.
        x0, x1, y0, y1, z0, z1 = C.bounds_of(make(False))
        far.p = [(p[0] - (x0 + x1) / 2, p[1] - (y0 + y1) / 2, p[2] - z0) for p in far.p]
        a = make_object(name, near, mat)
        b = make_object(name + '_lod1', far, mat)
        nb = C.bounds_of(near)
        dims = [round(nb[1] - nb[0], 3), round(nb[5] - nb[4], 3), round(nb[3] - nb[2], 3)]
        entries[name] = {'nodes': [name, name + '_lod1'], 'sizeMetres': dims,
                         'triangles': len(a.data.polygons), 'lod1Triangles': len(b.data.polygons),
                         'solids': [{'shape': 'box', 'min': [-dims[0] / 2, 0, -dims[2] / 2],
                                     'max': [dims[0] / 2, dims[1], dims[2] / 2]}]}
        print('PIECE', name, entries[name]['triangles'], entries[name]['lod1Triangles'], dims, flush=True)
    bpy.ops.object.select_all(action='SELECT')
    path = OUT / 'basalt.glb'
    temporary = OUT / 'basalt.build.glb'
    bpy.ops.export_scene.gltf(filepath=str(temporary), export_format='GLB', use_selection=True, export_yup=True,
                              export_image_format='WEBP', export_image_quality=68, export_materials='EXPORT',
                              export_normals=True, export_cameras=False, export_lights=False)
    pack_attributes(temporary)
    os.replace(temporary, path)
    with open(OUT / 'manifest.json', 'w') as f:
        json.dump({'files': [{'file': 'basalt.glb', 'bytes': os.path.getsize(path),
                              'triangles': sum(v['triangles'] for v in entries.values()),
                              'lod1Triangles': sum(v['lod1Triangles'] for v in entries.values()),
                              'nodes': entries,
                              'textures': {'atlas': 2048, 'channels': ['baseColor', 'normal', 'occlusion+roughness'],
                                           'format': 'WebP',
                                           'layout': 'u<.75: four 0.75 m column-face variants tiling every 4 m in v; '
                                                     'u>=.75: four 1 m crowns'},
                              'axis': '+Y up; metres; origin at ground centre'}]}, f, indent=2)
    print('EXPORTED', path, os.path.getsize(path), flush=True)


main()
