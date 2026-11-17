# Repack existing exports without rebaking or changing their authored geometry.
import sys
from pathlib import Path
if '--pack-existing' in sys.argv:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from pack import pack_existing
    pack_existing(Path(__file__).resolve().parents[4] / 'assets/hash-wars/structures')
    raise SystemExit(0)
if '--slim-existing' in sys.argv:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from slim import slim
    import json
    out = Path(__file__).resolve().parents[4] / 'assets/hash-wars/structures'
    manifest = json.loads((out / 'manifest.json').read_text())
    for entry in manifest['files']:
        slim(out / entry['file'])
        entry['bytes'] = (out / entry['file']).stat().st_size
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    raise SystemExit(0)
"""Builds the Hash Wars structure kit: station.glb, props.glb, route.glb, citadel.glb
and manifest.json in assets/hash-wars/structures/.

Run from the repo root:
  blender -b --factory-startup -t 2 -P tools/blender/hash-wars/structures/build.py -- [options]

Repack only (no Blender): python3 build.py --pack-existing | --slim-existing

Options:
  --files station,props     which GLBs to build (default: all)
  --only spire,pylon        build only these pieces (implies --no-export)
  --render near,close,far   review renders of each piece into --shots
  --shots DIR               where renders go (default .impeccable/review/level-10/art-structures/shots)
  --tag NAME                suffix for render file names (e.g. r1, r2 for look-fix rounds)
  --no-export               skip writing GLBs and the manifest
  --lod                     also render the lod1 roots
  --render-size 480         review image width (16:9); --samples 12 controls Cycles
"""
import sys, os, importlib, argparse, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))

import bpy  # noqa: E402
import kit, pipeline, review  # noqa: E402

FILES = ["station", "props", "route", "citadel"]


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", default=",".join(FILES))
    ap.add_argument("--only", default="")
    ap.add_argument("--render", default="")
    ap.add_argument("--shots", default=os.path.join(REPO, ".impeccable/review/level-10/art-structures/shots"))
    ap.add_argument("--tag", default="")
    ap.add_argument("--no-export", action="store_true")
    ap.add_argument("--lod", action="store_true")
    ap.add_argument("--samples", type=int, default=12)
    ap.add_argument("--render-size", type=int, default=480)
    return ap.parse_args(argv)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit._MATS.clear()
    kit._TEX.clear()
    kit._FONTS.clear()


def main():
    a = args()
    only = {s for s in a.only.split(",") if s}
    views = [v for v in a.render.split(",") if v]
    out_dir = os.path.join(REPO, "assets/hash-wars/structures")
    os.makedirs(out_dir, exist_ok=True)
    entries = []
    for file in [f for f in a.files.split(",") if f]:
        t0 = time.time()
        reset()
        mod = importlib.import_module(file)
        reg = pipeline.Registry(file)
        mod.build(reg, only)
        if not reg.pieces:
            continue
        print(f"[{file}] built {len(reg.pieces)} pieces in {time.time() - t0:.1f}s", flush=True)
        pipeline.ground()
        pipeline.bake_ao(reg)
        pipeline.combine_colours(reg)
        print(f"[{file}] baked in {time.time() - t0:.1f}s", flush=True)
        if not only and not a.no_export:
            path = pipeline.export(reg, out_dir)
            entries.append(pipeline.describe(reg, path))
            pipeline.write_manifest(out_dir, entries)
            print(f"[{file}] exported {os.path.getsize(path) / 1e6:.2f} MB", flush=True)
        if views:
            os.makedirs(a.shots, exist_ok=True)
            review.setup(a.samples)
            bpy.context.scene.render.resolution_x = a.render_size
            bpy.context.scene.render.resolution_y = round(a.render_size * 9 / 16)
            for rec in reg.pieces:
                for v in views:
                    tag = f"-{a.tag}" if a.tag else ""
                    review.shot(reg, rec, v, os.path.join(a.shots, f"{rec['name']}-{v}{tag}.png"))
                    if a.lod and "lod_root" in rec and v != "close":
                        review.shot(reg, rec, v, os.path.join(a.shots, f"{rec['name']}_lod1-{v}{tag}.png"), lod=True)
            print(f"[{file}] rendered in {time.time() - t0:.1f}s", flush=True)
    if entries:
        print("manifest:", pipeline.write_manifest(out_dir, entries))
        import validate
        validate.check(out_dir)


main()
