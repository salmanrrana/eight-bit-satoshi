"""Build the Level 10 first-person weapons (with gauntlets) as GLBs.

Run from the repo root:

    blender -b --factory-startup -t 2 -P tools/blender/hash-wars/arms/build.py -- [options]

Options:
    --only carbine         choose a module (default: completed models only)
    --size 2048            texture size (1024 for quick looks)
    --preview              skip bake and export; render the procedural model
    --no-render            skip the stills
    --inspect-existing     verify/render a previous export without rebaking
    --reexport-cached      repack the last baked blend (export fixes only)
    --tag NAME             suffix for still filenames (keep before/after images)
    --shots fp,aim,...     which stills (fp, aim, three, close, left, top)
    --quick                Workbench stills (seconds) for checking forms and poses

Writes assets/hash-wars/arms/<name>.glb and manifest.json, and stills plus a
debug .blend under .impeccable/review/level-10/art-arms/.

Each weapon module (weapons/<name>.py) builds its parts in millimetres and
returns a spec: which parts make which node, pivots, empties, hand poses,
camera views. Everything else is shared and lives in lib/.
"""

import importlib
import fcntl
import json
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import geo, hands, mats, pipeline  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets", "hash-wars", "arms")
WORK = os.environ.get("HW_ARMS_WORK", os.path.join(ROOT, ".impeccable", "review", "level-10", "art-arms"))
ORDER = ["carbine", "arc", "scatter", "rail"]  # Completed models; keep other artists' additions here.
REQUIRED = ["muzzle", "sight", "arm_r", "arm_l"]


class Ctx:
    """What a weapon module gets: materials, decals, emissive and glass materials."""

    def __init__(self, name, rubs=()):
        self.name = name
        self.rubs = list(rubs)
        self.outputs = {}
        self._emit = {}
        self._n = 0
        self.lens = mats.lens_material()
        self.tmp = os.path.join(WORK, "tmp")
        os.makedirs(self.tmp, exist_ok=True)

    def mat(self, finish, decals=(), tint=None, wear=1.0, rubs=True):
        self._n += 1
        m, outs = mats.finish_material(f"p:{finish}:{self._n}", finish, self.rubs if rubs else (), decals, tint, wear)
        self.outputs[m.name] = outs
        return m

    def decal(self, key, text, height, center, normal, rot=0, style="engrave", color=None, depth=6):
        img, size = pipeline.text_decal(f"{self.name}_{key}", text, height, self.tmp)
        return dict(image=img, size=size, center=center, normal=normal, rot=rot, style=style,
                    color=color or "#e8e2d4", depth=depth)

    def emit(self, channel, color=None, strength=8.0):
        if channel not in self._emit:
            hexc = color or {"reticle": mats.ORANGE, "charge": "#9fe8ff", "heat": mats.CYAN}.get(channel, mats.ORANGE)
            self._emit[channel] = mats.emit_material(f"emit:{channel}", hexc, strength)
        return self._emit[channel]


def arg(name, default=None, flag=False):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if name not in argv:
        return default
    return True if flag else argv[argv.index(name) + 1]


def build_one(name, size, preview, render, tag):
    t0 = time.time()
    mod = importlib.import_module(f"weapons.{name}")
    pipeline.reset()
    # RUBS: spheres (mm) where hands and holsters wear the finish.
    ctx = Ctx(name, getattr(mod, "RUBS", ()))
    spec = mod.build(ctx)
    if arg("--reexport-cached", flag=True):
        bpy.ops.wm.open_mainfile(filepath=os.path.join(ctx.tmp, f"{name}.blend"))
        pipeline.export(os.path.join(OUT, f"{name}.glb"),
                        [bpy.data.objects[name], bpy.data.objects[f"{name}_world"]])
        return inspect_export(name, spec, size, render, tag, t0)
    if arg("--inspect-existing", flag=True):
        return inspect_export(name, spec, size, render, tag, t0)
    all_parts = [o for objs in spec["parts"].values() for o in objs]
    all_parts += [o for objs in spec.get("emissive", {}).values() for o in objs]
    all_parts += [o for objs in spec.get("glass", {}).values() for o in objs]
    geo.finish(all_parts)

    hand_mats = {f: ctx.mat(f, rubs=False) for f in ("ceramic", "graphite", "frame", "fabric", "rubber", "orange",
                                                      "steel")}
    arm_r = hands.build("arm_r", spec["grips"]["r"], hand_mats)
    arm_l = hands.build("arm_l", spec["grips"]["l"], hand_mats)
    geo.finish([arm_r, arm_l])
    # Rounded finger pads retain their silhouette at this density. Spend the
    # saved triangles on the receiver and sight, nearest the player's eye.
    for arm in (arm_r, arm_l):
        dec = arm.modifiers.new("gauntlet_budget", "DECIMATE")
        dec.ratio = 0.82
        dec.use_collapse_triangulate = True
        geo.apply_mods(arm)


    root = pipeline.empty(name)
    nodes = {}
    for node, objs in list(spec["parts"].items()) + list(spec.get("emissive", {}).items()) + \
            list(spec.get("glass", {}).items()):
        ob = geo.join(objs, node)
        pipeline.set_origin(ob, spec["pivots"].get(node, (0, 0, 0)), root)
        nodes[node] = ob
    for ob in (arm_r, arm_l):
        ob.parent = root
        nodes[ob.name] = ob
    for en, p in spec["empties"].items():
        pipeline.empty(en, tuple(c * geo.MM for c in p), root)

    baked = [nodes[n] for n in spec["parts"]] + [arm_r, arm_l]
    unbaked = [nodes[n] for n in list(spec.get("emissive", {})) + list(spec.get("glass", {}))]

    print(f"[geometry] {name}: {sum(pipeline.tri_count(o) for o in baked + unbaked)} triangles", flush=True)
    if preview:
        if render:
            stills(name, spec, f"preview{tag}")
        print(f"[build] {name} preview in {time.time() - t0:.0f}s", flush=True)
        return None

    if sum(pipeline.tri_count(o) for o in baked + unbaked) > 70000:
        raise RuntimeError("First-person triangle budget exceeded")
    pipeline.layout_uvs(baked, density={"arm_r": 0.62, "arm_l": 0.62})
    passes = pipeline.bake(baked, ctx.outputs, size, ctx.tmp, name, hide=unbaked)
    imgs = pipeline.save_maps(passes, ctx.tmp, name)
    tex = pipeline.baked_material(f"tex:{name}", imgs)
    pipeline.apply_baked(baked, tex)
    weapon_objs = [nodes[n] for n in spec["parts"]] + unbaked
    world = pipeline.make_world_copy(f"{name}_world", weapon_objs, spec.get("world_ratio", 0.33))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ctx.tmp, f"{name}.blend"))

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.glb")
    nbytes = pipeline.export(path, [root, world])
    return inspect_export(name, spec, size, render, tag, t0)


def inspect_export(name, spec, size, render, tag, t0):
    """Verify a saved export and render its actual exported materials and pivots."""
    path = os.path.join(OUT, f"{name}.glb")
    nbytes = os.path.getsize(path)
    pipeline.reset()
    found, problems = pipeline.check(path, REQUIRED + list(spec["parts"]) + list(spec.get("emissive", {})) + [f"{name}_world"])
    if problems:
        raise RuntimeError(f"{name} re-import failed: {problems}")
    tris_fp = sum(info["tris"] for node, info in found.items() if node != f"{name}_world")
    entry = dict(
        file=f"{name}.glb", bytes=nbytes, texture=size,
        triangles=dict(first_person=tris_fp, world=found[f"{name}_world"]["tris"]),
        nodes=found,
        size_m=_size(name),
        view=_view(spec),
        aim=dict(position=found.get("sight", {}).get("pivot"), forward=[0, 0, -1]),
        review_views={k: dict(position=pipeline.to_gltf([c * geo.MM for c in spec[k]["eye"]]),
                             target=pipeline.to_gltf([c * geo.MM for c in spec[k]["look"]]),
                             fov=30 if k == "three" else 40) for k in ("three", "close")},
        problems=problems,
    )
    if render:
        stills(name, spec, tag or "final", imported=True)
    print(f"[build] {name}: {nbytes / 1e6:.2f} MB, {tris_fp} tris, problems={problems}, "
          f"{time.time() - t0:.0f}s", flush=True)
    return entry


def _size(name):
    """Length, height, width of the weapon alone (metres, glTF axes)."""
    ob = bpy.data.objects[f"{name}_world"]
    xs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    mn = [min(v[i] for v in xs) for i in range(3)]
    mx = [max(v[i] for v in xs) for i in range(3)]
    return dict(length=round(mx[1] - mn[1], 3), height=round(mx[2] - mn[2], 3), width=round(mx[0] - mn[0], 3))


def _view(spec):
    v = spec["view"]
    return dict(position=pipeline.to_gltf([c * geo.MM for c in v["eye"]]),
                target=pipeline.to_gltf([c * geo.MM for c in v["look"]]), fov=v["fov"],
                note="camera in weapon space; the weapon origin is the right-hand grip")


def stills(name, spec, tag, imported=False):
    """First-person, aimed, three-quarter and close-up stills under a noon sun."""
    sc = bpy.context.scene
    extra = pipeline.setup_daylight(sc)
    mm = geo.MM
    v = spec["view"]
    shots = {
        "fp": pipeline.camera("fp", [c * mm for c in v["eye"]], [c * mm for c in v["look"]], v["fov"]),
        "aim": pipeline.camera("aim", [c * mm for c in spec["empties"]["sight"]], None, 40,
                               dir_m=(0, 1, 0)),
        "three": pipeline.camera("three", [c * mm for c in spec["three"]["eye"]],
                                 [c * mm for c in spec["three"]["look"]], 30),
        "close": pipeline.camera("close", [c * mm for c in spec["close"]["eye"]],
                                 [c * mm for c in spec["close"]["look"]], 40),
    }
    if imported:
        # The world copy sits beside the first-person model; move it aside for the stills.
        w = bpy.data.objects.get(f"{name}_world")
        if w:
            w.hide_render = True
    os.makedirs(os.path.join(WORK, "stills"), exist_ok=True)
    shots["left"] = pipeline.camera("left", (-1.6, 0.05, 0.05), (0, 0.05, 0.05), 30)
    shots["top"] = pipeline.camera("top", (0, 0.05, 1.6), (0, 0.0501, 0), 30)
    shots["front"] = pipeline.camera("front", (0.4, 1.4, 0.3), (0, 0.1, 0.0), 30)
    only = arg("--shots", "fp,aim,three,close").split(",")
    for k, cam in shots.items():
        if k in only:
            pipeline.render(cam, os.path.join(WORK, "stills", f"{name}_{k}_{tag}.png"),
                            samples=int(arg("--samples", "48")), quick=arg("--quick", flag=True))
    for o in extra + list(shots.values()):
        bpy.data.objects.remove(o)


def main():
    names = (arg("--only") or ",".join(ORDER)).split(",")
    size = int(arg("--size", "2048"))
    preview = arg("--preview", flag=True)
    render = not arg("--no-render", flag=True)
    tag = arg("--tag", "")
    os.makedirs(WORK, exist_ok=True)
    mpath = os.path.join(OUT, "manifest.json")
    for name in names:
        entry = build_one(name, size, preview, render, tag)
        if entry:
            # Re-read after the long bake: another artist may have exported meanwhile.
            # Only replace this weapon's entry and leave all shared metadata intact.
            with open(mpath, "r+" if os.path.exists(mpath) else "w+") as f:
                fcntl.flock(f, fcntl.LOCK_EX)
                f.seek(0)
                text = f.read()
                manifest = json.loads(text) if text else {}
                manifest.setdefault("files", {})[name] = entry
                f.seek(0)
                json.dump(manifest, f, indent=1)
                f.truncate()
                f.flush()
                fcntl.flock(f, fcntl.LOCK_UN)


if __name__ == "__main__":
    main()
