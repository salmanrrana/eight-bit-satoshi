"""Review renders: noon sun and sky, grass-and-basalt ground, a 1.8 m marker,
and a camera at the player's eye height (1.7 m). Cycles, 960x540, denoised.

Views per piece: 'near' (three-quarter, fills the frame), 'far' (three times
further), 'close' (hand-height detail, about 2.5 m from the front).
"""
import bpy, math, os
from mathutils import Vector
from pipeline import _descendants

EYE = 1.7


def setup(samples=20):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.render.resolution_x, sc.render.resolution_y = 960, 540
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = -0.9
    w = sc.world or bpy.data.worlds.new("world")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = False
    sky.sun_elevation = math.radians(40)
    sky.sun_rotation = math.radians(215)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.35
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 5.0
    sun.angle = math.radians(0.6)
    sun.color = (1.0, 0.96, 0.9)
    so = bpy.data.objects.new("sun", sun)
    sc.collection.objects.link(so)
    # Sun 40 degrees up, from the front-left of the pieces (pieces face -Y).
    so.rotation_euler = (math.radians(50), 0, math.radians(215))
    _ground_material()
    marker()
    cam = bpy.data.cameras.new("cam")
    cam.lens = 22
    cam.clip_end = 2000
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    sc.render.use_stamp = True
    sc.render.use_stamp_date = sc.render.use_stamp_time = sc.render.use_stamp_render_time = False
    sc.render.use_stamp_frame = sc.render.use_stamp_camera = sc.render.use_stamp_scene = False
    sc.render.use_stamp_filename = sc.render.use_stamp_memory = sc.render.use_stamp_lens = False
    sc.render.use_stamp_note = True
    sc.render.stamp_font_size = 14


def _ground_material():
    g = bpy.data.objects.get("ground")
    m = bpy.data.materials.new("ground")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n1 = nt.nodes.new("ShaderNodeTexNoise")
    n1.inputs["Scale"].default_value = 0.08
    n1.inputs["Detail"].default_value = 6
    nt.links.new(tc.outputs["Object"], n1.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (0.045, 0.11, 0.012, 1)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = (0.03, 0.03, 0.03, 1)
    nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    n2 = nt.nodes.new("ShaderNodeTexNoise")
    n2.inputs["Scale"].default_value = 30
    n2.inputs["Detail"].default_value = 8
    nt.links.new(tc.outputs["Object"], n2.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 0.6
    from kit import _sock
    nt.links.new(ramp.outputs["Color"], _sock(mix.inputs, "A_Color"))
    nt.links.new(n2.outputs["Color"], _sock(mix.inputs, "B_Color"))
    nt.links.new(_sock(mix.outputs, "Result_Color"), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.4
    nt.links.new(n2.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], bsdf.inputs["Normal"])
    g.data.materials.append(m)


def marker():
    """A plain 1.8 m figure for scale: legs, torso, head."""
    import bmesh
    me = bpy.data.meshes.new("marker")
    bm = bmesh.new()
    for x in (-0.11, 0.11):
        bmesh.ops.create_cone(bm, segments=10, radius1=0.08, radius2=0.09, depth=0.85,
                              matrix=__import__("mathutils").Matrix.Translation((x, 0, 0.425)))
    bmesh.ops.create_cone(bm, segments=12, radius1=0.17, radius2=0.22, depth=0.65,
                          matrix=__import__("mathutils").Matrix.Translation((0, 0, 1.2)))
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.115,
                              matrix=__import__("mathutils").Matrix.Translation((0, 0, 1.685)))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("marker", me)
    m = bpy.data.materials.new("marker")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.25, 0.27, 0.3, 1)
    me.materials.append(m)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _bounds(objs):
    pts = []
    for o in objs:
        if o.type == "MESH" and o.visible_get() is not None:
            M = o.matrix_world
            vs = o.data.vertices
            step = max(1, len(vs) // 4000)
            pts += [M @ vs[i].co for i in range(0, len(vs), step)]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def shot(registry, rec, view, path, note=None, yaw=None, lod=False):
    """Render one piece alone. yaw: degrees around the piece, 0 = straight at its front."""
    sc = bpy.context.scene
    root = rec["lod_root"] if lod else rec["root"]
    mine = set(_descendants(root))
    for r in registry.pieces:
        for key in ("root", "lod_root"):
            if key in r:
                for o in _descendants(r[key]):
                    o.hide_render = o not in mine
    mn, mx = _bounds(list(mine))
    c = (mn + mx) / 2
    size = mx - mn
    h = size.z
    w = max(size.x, size.y)
    mk = bpy.data.objects["marker"]
    mk.location = (mx.x + 0.8, mn.y - 0.6, 0)
    if yaw is None:
        yaw = {"near": -35, "far": -30, "close": -15, "back": 150}.get(view, -35)
    hfov = 2 * math.atan(18 / sc.camera.data.lens)
    if view == "close":
        dist = max(2.2, min(4.0, w * 0.45))
        target = Vector((c.x, c.y, min(1.3, h * 0.6)))
        eye = EYE
    else:
        need = max(w, h * 1.5) * 0.62 / math.tan(hfov / 2)
        dist = max(need, 3.0) * (3.0 if view == "far" else 1.0)
        target = Vector((c.x, c.y, min(h * 0.45, EYE + dist * 0.5)))
        eye = EYE
    a = math.radians(yaw)
    d = Vector((math.sin(a), -math.cos(a), 0))
    cam = sc.camera
    base = Vector((c.x, c.y, 0))
    # Step back from the piece's footprint edge, not its centre.
    reach = max(size.x, size.y) * 0.5
    cam.location = base + d * (reach + dist) + Vector((0, 0, eye))
    look = target - cam.location
    cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
    sc.render.stamp_note_text = note or f"{rec['name']}{' lod1' if lod else ''} · {view}"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def contact_sheet(paths, out, cols=3, cell=(480, 270)):
    """Tile PNGs into one image (numpy, no PIL)."""
    import numpy as np
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p)
        w, h = im.size
        a = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
        ys = (np.arange(cell[1]) * h / cell[1]).astype(int)
        xs = (np.arange(cell[0]) * w / cell[0]).astype(int)
        imgs.append(a[np.ix_(ys, xs)])
        bpy.data.images.remove(im)
    rows = (len(imgs) + cols - 1) // cols
    sheet = np.zeros((rows * cell[1], cols * cell[0], 4), np.float32)
    sheet[..., 3] = 1
    for i, a in enumerate(imgs):
        r, c = i // cols, i % cols
        y0 = (rows - 1 - r) * cell[1]
        sheet[y0:y0 + cell[1], c * cell[0]:(c + 1) * cell[0]] = a
    img = bpy.data.images.new("sheet", cols * cell[0], rows * cell[1])
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
    return out
