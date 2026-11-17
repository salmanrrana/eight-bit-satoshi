"""Render review views of an exported machine GLB without rebuilding it.

  blender -b --factory-startup -t 2 -P look.py -- <name> [--tag T] [--views eye8,close]
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import lib  # noqa: E402
import review  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
name, tag, views = argv[0], 'look', ('eye8', 'eye30', 'close', 'scale')
for i, a in enumerate(argv):
    if a == '--tag':
        tag = argv[i + 1]
    if a == '--views':
        views = argv[i + 1].split(',')
repo, out_dir, work = lib.out_dirs()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(out_dir, name + '.glb'))
review.render_set(name, work, tag, importlib.import_module(name).CONFIG, views=views)
