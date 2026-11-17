# Repack existing exports without rebaking or changing their authored geometry.
import sys
from pathlib import Path
if '--pack-existing' in sys.argv:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from pack import pack_existing
    pack_existing(Path(__file__).resolve().parents[4] / 'assets/hash-wars/machines')
    raise SystemExit(0)
"""Build the Level 10 Cartel machines: geometry -> bake -> GLB -> manifest -> review renders.

  blender -b --factory-startup -t 2 -P tools/blender/hash-wars/machines/build.py -- [names] [flags]

names : strider gnat bulwark watcher siege hauler (default: all six machines)
flags : --geo        quick form check: flat paints, no bake/export, renders only
        --reuse-masks keep valid UV/AO, rebake normals and finish maps
        --reuse-bakes material-only iteration, keep the previous AO and normals
        --reuse-uv   material-only iteration using the previous UV checkpoint
        --tex N      override texture size (e.g. 512 for a fast trial)
        --no-render  skip the review renders
        --tag T      name suffix for review renders (default: final / geo)
        --views a,b  review views (eye8, eye30, close, scale, rear, tele30)

Outputs: assets/hash-wars/machines/<name>.glb and manifest.json; review renders and
baked PNGs in .impeccable/review/level-10/art-machines/.
"""
import importlib
import json
import os
import sys
import time

sys.stdout.reconfigure(line_buffering=True)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import lib  # noqa: E402
import pipeline  # noqa: E402
import review  # noqa: E402

ORDER = ['strider', 'gnat', 'bulwark', 'watcher', 'siege', 'hauler']
QUALITY = 82  # WebP quality for every texture


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = dict(names=[], geo=False, tex=None, render=True, tag=None, views=None, reuse_uv=False, reuse_bakes=False, reuse_masks=False)
    it = iter(argv)
    for a in it:
        if a == '--geo':
            opts['geo'] = True
        elif a == '--reuse-masks':
            opts['reuse_uv'] = True
            opts['reuse_masks'] = True
        elif a == '--reuse-bakes':
            opts['reuse_uv'] = True
            opts['reuse_bakes'] = True
        elif a == '--reuse-uv':
            opts['reuse_uv'] = True
        elif a == '--tex':
            opts['tex'] = int(next(it))
        elif a == '--no-render':
            opts['render'] = False
        elif a == '--tag':
            opts['tag'] = next(it)
        elif a == '--views':
            opts['views'] = next(it).split(',')
        else:
            opts['names'].append(a)
    opts['names'] = opts['names'] or ORDER
    return opts


def gl(v):
    """Blender point -> glTF point (+Y up, facing +Z)."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def model_gl(p):
    """Model (left, forward, up) -> glTF."""
    return [round(p[0], 4), round(p[2], 4), round(p[1], 4)]


def geo_preview_materials():
    for p, spec in lib.PAINTS.items():
        m = lib.paint_material(p)
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*spec[0], 1)
        b.inputs['Roughness'].default_value = spec[1]
        b.inputs['Metallic'].default_value = spec[2]
    for ch, col in lib.EMITS.items():
        m = lib.paint_material(ch)
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*col, 1)
        b.inputs['Emission Color'].default_value = (*col, 1)
        b.inputs['Emission Strength'].default_value = 6


def build_one(name, opts, repo, out_dir, work):
    t0 = time.time()
    mod = importlib.import_module(name)
    cfg = dict(mod.CONFIG)
    checkpoint = os.path.join(work, name + '-uv.blend')
    if opts['reuse_uv']:
        bpy.ops.wm.open_mainfile(filepath=checkpoint)
        info = json.loads(bpy.context.scene['machine_info'])
        info['root'] = bpy.data.objects[name]
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        info = mod.build()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    print(f'[{name}] geometry created', flush=True)
    root = info['root']
    objs = list(lib.walk(root))
    meshes = [o for o in objs if o.type == 'MESH']
    if not opts['reuse_uv']:
        lib.finish_meshes(meshes)
        pipeline.fit_budget(meshes, min(cfg['budget'], cfg.get('triangle_target', cfg['budget'])))
    bpy.context.view_layer.update()
    report = {'name': name, 'open_edges': {o.name: lib.open_edges(o) for o in meshes if lib.open_edges(o)}}
    tris = sum(lib.tri_count(o) for o in meshes)
    print(f'[{name}] built {len(objs)} nodes, {tris} tris, open edges: {report["open_edges"]}')
    print('   ' + ', '.join(f'{o.name}:{lib.tri_count(o)}' for o in meshes))
    if opts['geo']:
        geo_preview_materials()
        if opts['render']:
            review.render_set(name, work, opts['tag'] or 'geo', cfg, views=opts['views'] or
                              ('eye8', 'close', 'scale', 'eye30'), samples=24)
        return None

    size = opts['tex'] or cfg['tex']
    if not opts['reuse_uv']:
        pipeline.unwrap(meshes, margin=0.004 if size >= 2048 else 0.006)
        scene['machine_info'] = json.dumps({k:v for k,v in info.items() if k != 'root'})
        bpy.ops.wm.save_as_mainfile(filepath=checkpoint, check_existing=False)
    pipeline.bake_materials(meshes)
    imgs = {k: pipeline.new_image(f'{name}_{k}', size, color=(k == 'color')) for k in ('masks', 'normal', 'color', 'orm')}
    mats = {p: bpy.data.materials['bake_' + p] for p in lib.ALL_PAINTS}

    def setpass(fn, *a):
        for p, m in mats.items():
            fn(pipeline.G(m), *a, p) if fn is not pipeline.graph_masks else fn(pipeline.G(m), *a)

    target = pipeline.combined_bake_target(meshes)
    bake_meshes = [target]
    tb = time.time()
    if opts['reuse_bakes'] or opts['reuse_masks']:
        for key in (('masks', 'normal') if opts['reuse_bakes'] else ('masks',)):
            imgs[key] = bpy.data.images.load(os.path.join(work, 'tex', f'{name}_{key}.png'))
            imgs[key].colorspace_settings.name = 'Non-Color'
            if tuple(imgs[key].size) != (size, size):
                raise ValueError('Cached bake resolution differs; rebuild without --reuse-bakes')
    else:
        setpass(pipeline.graph_masks, imgs['masks'], cfg)
        pipeline.run_bake(bake_meshes, 'EMIT', 6)
    if not opts['reuse_bakes']:
        setpass(pipeline.graph_normal, imgs['normal'], cfg)
        pipeline.run_bake(bake_meshes, 'NORMAL', 4)
    setpass(pipeline.graph_color, imgs['color'], imgs['masks'], cfg)
    pipeline.run_bake(bake_meshes, 'EMIT', 1)
    setpass(pipeline.graph_orm, imgs['orm'], imgs['masks'], cfg)
    pipeline.run_bake(bake_meshes, 'EMIT', 1)
    print(f'[{name}] baked {size}px in {time.time() - tb:.0f}s')
    tex_dir = os.path.join(work, 'tex')
    os.makedirs(tex_dir, exist_ok=True)
    pipeline.save_png(imgs['masks'], os.path.join(tex_dir, f'{name}_masks.png'), False)
    col = pipeline.save_png(imgs['color'], os.path.join(tex_dir, f'{name}_color.png'), True)
    orm = pipeline.save_png(imgs['orm'], os.path.join(tex_dir, f'{name}_orm.png'), False)
    nrm = pipeline.save_png(imgs['normal'], os.path.join(tex_dir, f'{name}_normal.png'), False)
    pipeline.discard_bake_target(target, meshes)
    tex_mat = pipeline.final_material(name, col, orm, nrm)
    pipeline.swap_to_final(meshes, tex_mat)

    lod_root = pipeline.make_lod(root, cfg['lod_ratio'])
    bpy.context.view_layer.update()
    lod_meshes = [o for o in lib.walk(lod_root) if o.type == 'MESH']
    lod_tris = sum(lib.tri_count(o) for o in lod_meshes)
    nodes = []
    for o in objs:
        nodes.append(dict(name=o.name, parent=o.parent.name if o.parent else None,
                          pivot=gl(o['pivot_world']), tris=lib.tri_count(o) if o.type == 'MESH' else 0,
                          materials=[m.name for m in o.data.materials] if o.type == 'MESH' else []))
    expect = {o.name: (o.parent.name if o.parent else None, tuple(o.matrix_world.translation))
              for o in lib.walk(root)}
    expect.update({o.name: (o.parent.name if o.parent else None, tuple(o.matrix_world.translation))
                   for o in lib.walk(lod_root)})
    # bounding box in glTF metres
    import mathutils
    pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    if tris > cfg['budget'] or report['open_edges']:
        raise RuntimeError('Geometry fails budget or closed-shell contract')
    path = os.path.join(out_dir, name + '.glb')
    staging = os.path.join(out_dir, '.' + name + '-staging.glb')
    pipeline.export(staging, cfg.get('webp_quality', QUALITY))
    nbytes = os.path.getsize(staging)
    problems, _ = pipeline.verify(staging, expect)
    print(f'[{name}] exported {nbytes / 1e6:.2f} MB, {tris} tris (lod1 {lod_tris}), verify: {problems or "ok"}')

    legs = {}
    for side, leg in info.get('legs', {}).items():
        legs[side] = dict(hip=model_gl(leg['hip']), knee=model_gl(leg['knee']), ankle=model_gl(leg['ankle']),
                          sole_y=leg.get('sole_z', 0.0), thigh=leg['thigh'], shin=leg['shin'],
                          axes=leg.get('axes', {'hip_yaw':[0,1,0], 'hip_roll':[0,0,1], 'thigh':[1,0,0],
                                'shin':[1,0,0], 'foot':[1,0,0]}))
    entry = dict(
        file=name + '.glb', bytes=nbytes, triangles=tris, budget=cfg['budget'], lod1=name + '_lod1',
        lod1_triangles=lod_tris, texture=size,
        size=[round(hi[0] - lo[0], 3), round(hi[2] - lo[2], 3), round(hi[1] - lo[1], 3)],
        bounds={'min': [round(lo[0],4),round(lo[2],4),round(-hi[1],4)],
                'max': [round(hi[0],4),round(hi[2],4),round(-lo[1],4)]},
        lod1_nodes=[{'name':n['name']+'_lod1', 'parent':n['parent']+'_lod1' if n['parent'] else None,
                     'pivot':n['pivot']} for n in nodes],
        origin=info.get('origin', 'flyer centre' if info.get('flyer') else 'ground under centre'),
        axes=info.get('axes'), knee=info.get('knee'), legs=legs, weak_points=info.get('weak', []),
        extra=info.get('extra', {}), nodes=nodes, verify=problems or 'ok', open_edges=report['open_edges'],
    )
    if problems:
        raise RuntimeError('Export verification failed: ' + '; '.join(problems))
    os.replace(staging, path)
    if opts['render']:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
        review.render_set(name, work, opts['tag'] or 'final', cfg, views=opts['views'] or
                          ('eye8', 'eye30', 'close', 'scale'))
    print(f'[{name}] done in {time.time() - t0:.0f}s')
    return entry


def main():
    opts = args()
    repo, out_dir, work = lib.out_dirs()
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(work, exist_ok=True)
    mpath = os.path.join(out_dir, 'manifest.json')
    manifest = {}
    if os.path.exists(mpath):
        with open(mpath) as fh:
            manifest = json.load(fh)
    manifest.setdefault('about', 'Level 10 Cartel machines. glTF, metres, +Y up, facing +Z, origin on the ground '
                        'under the centre (flyers: their centre). +X is the machine\'s left; _l legs are on +X. '
                        'Nodes are rigid, pivots at joints, identity rotation in the neutral pose. '
                        '<name>_lod1 is the same hierarchy at about a third of the triangles; its nodes end in _lod1.')
    manifest.setdefault('machines', {})
    manifest['pending'] = [n for n in ORDER if n not in manifest['machines']]
    for name in opts['names']:
        entry = build_one(name, opts, repo, out_dir, work)
        if entry:
            if os.path.exists(mpath):
                with open(mpath) as fh:
                    manifest = json.load(fh)
            manifest['pending'] = [n for n in ORDER if n not in manifest['machines']]
            manifest['machines'][name] = entry
            manifest['pending'] = [n for n in ORDER if n not in manifest['machines']]
            manifest['total_bytes'] = sum(m['bytes'] for m in manifest['machines'].values())
            with open(mpath + '.tmp', 'w') as fh:
                json.dump(manifest, fh, indent=1)
            os.replace(mpath + '.tmp', mpath)


main()
