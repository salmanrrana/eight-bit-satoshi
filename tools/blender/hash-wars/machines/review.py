"""Review renders: the machine on grass under a noon sun and sky, seen from a
player's eye (1.7 m) at 8 m and 30 m, a close-up, and beside a 1.7 m pole.

Used by build.py on the re-imported GLB (or with --geo on the raw build).
"""
import math
import os
import bpy
from mathutils import Vector

EYE = 1.7
VFOV = 68.0  # the game's vertical field of view


def setup_world(sun_az=145.0, sun_el=40.0):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 960, 540
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -0.3
    world = bpy.data.worlds.new('noon')
    scene.world = world
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_disc = False
    sky.sun_elevation = math.radians(sun_el)
    sky.sun_rotation = math.radians(sun_az)
    sky.altitude = 200
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 0.28
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 4.2
    sun.angle = math.radians(0.6)
    sun.color = (1.0, 0.96, 0.9)
    so = bpy.data.objects.new('sun', sun)
    scene.collection.objects.link(so)
    # sun direction: from azimuth/elevation (Blender sky convention: rotation about Z)
    so.rotation_euler = (math.radians(90 - sun_el), 0, math.radians(sun_az + 90))
    # grass ground
    bpy.ops.mesh.primitive_plane_add(size=600)
    ground = bpy.context.active_object
    ground.name = 'ground'
    m = bpy.data.materials.new('grass')
    g = m.node_tree
    bsdf = g.nodes['Principled BSDF']
    tc = g.nodes.new('ShaderNodeTexCoord')
    nz = g.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 0.6
    nz.inputs['Detail'].default_value = 8
    g.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = g.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.035, 0.085, 0.012, 1)
    ramp.color_ramp.elements[1].color = (0.10, 0.19, 0.03, 1)
    g.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    g.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.95
    bump = g.nodes.new('ShaderNodeBump')
    nz2 = g.nodes.new('ShaderNodeTexNoise')
    nz2.inputs['Scale'].default_value = 60
    g.links.new(tc.outputs['Object'], nz2.inputs['Vector'])
    g.links.new(nz2.outputs['Fac'], bump.inputs['Height'])
    bump.inputs['Strength'].default_value = 0.6
    g.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    ground.data.materials.append(m)
    return so


def scale_pole(x, y):
    """A 1.7 m striped survey pole (10 cm bands) for scale."""
    mats = []
    for name, col in (('pole_w', (0.8, 0.8, 0.8)), ('pole_o', (0.9, 0.3, 0.02))):
        m = bpy.data.materials.new(name)
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1)
        mats.append(m)
    for k in range(17):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.1, location=(x, y, 0.05 + k * 0.1), vertices=16)
        o = bpy.context.active_object
        o.data.materials.append(mats[k % 2])


def camera(target, az, dist, height=EYE, fov=VFOV, lens=None):
    """Camera at a horizontal distance and azimuth (0 = in front of the machine) looking at target."""
    cam = bpy.data.cameras.new('cam')
    cam.sensor_fit = 'VERTICAL'
    cam.angle_y = math.radians(fov)
    if lens:
        cam.lens = lens
    co = bpy.data.objects.new('cam', cam)
    bpy.context.scene.collection.objects.link(co)
    a = math.radians(az)
    # machine faces -Y, so "in front" is -Y
    pos = Vector((target.x + math.sin(a) * dist, target.y - math.cos(a) * dist, height))
    co.location = pos
    d = Vector(target) - pos
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = co
    return co


def render_set(name, out_dir, tag, info, views=('eye8', 'eye30', 'close', 'scale'), samples=24):
    """Render the standard review views of whatever machine is in the scene."""
    r = info['render']
    lift, focus, size = r['lift'], r['focus'], r['size']
    root = bpy.data.objects.get(name)
    lod = bpy.data.objects.get(name + '_lod1')
    if root is not None and lift:
        root.location.z += lift
        if lod:
            lod.location.z += lift
    setup_world()
    scene = bpy.context.scene
    scene.cycles.samples = samples
    paths = []
    tgt = Vector((0, 0, lift + focus))
    for v in views:
        show_lod = v == 'eye30'
        if lod is not None:
            for o in [lod] + list(lod.children_recursive):
                o.hide_render = not show_lod
            for o in [root] + list(root.children_recursive):
                o.hide_render = show_lod
        if v == 'eye8':
            camera(tgt, 35, 8.0)
        elif v == 'eye30':
            camera(tgt, 35, 30.0)
        elif v == 'close':
            d = r.get('close', 3.0)
            camera(Vector((0, 0, lift + r.get('close_focus', focus))), -35, d, height=r.get('close_eye', EYE), fov=50)
        elif v == 'scale':
            scale_pole(0.0, size * 0.55 + 0.7)
            camera(Vector((0, size * 0.25, lift + focus * 0.8)), 90, max(6.0, size * 2.4))
        elif v == 'rear':
            camera(tgt, 160, 8.0)
        elif v == 'tele30':
            camera(tgt, 35, 30.0, fov=20)
        scene.render.filepath = os.path.join(out_dir, f'{name}_{tag}_{v}.png')
        bpy.ops.render.render(write_still=True)
        paths.append(scene.render.filepath)
    return paths
