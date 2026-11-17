"""Contact sheet of the exported game meshes, not the high sculpts."""
import bpy,os,math,json
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../../..'))
OUT=os.path.join(ROOT,'.impeccable/review/level-10/rock')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'assets/hash-wars/rocks/basalt.glb'))
models=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.name.endswith('_lod1')]
for o in list(bpy.context.scene.objects):
    if o.type=='MESH' and o.name.endswith('_lod1'):bpy.data.objects.remove(o,do_unlink=True)
models.sort(key=lambda o:o.name)
for i,obj in enumerate(models):
    # Blender's importer restores Z up. Each cell is deliberately framed alone.
    scale=6/max(obj.dimensions);obj.scale*=scale
    obj.location=((i%4)*9,(i//4)*11,0)
    obj.rotation_euler.z=-.35
    bpy.ops.object.text_add(location=(i%4*9-3.2,i//4*11-3.3,.03))
    label=bpy.context.object;label.data.body=obj.name;label.data.size=.43
    label.data.extrude=0
bpy.ops.mesh.primitive_plane_add(size=200,location=(13,15,-.07))
plane=bpy.context.object;mat=bpy.data.materials.new('neutral ground');mat.diffuse_color=(.22,.24,.25,1);plane.data.materials.append(mat)
bpy.ops.object.light_add(type='SUN',location=(0,0,20));sun=bpy.context.object;sun.data.energy=3;sun.rotation_euler=(.55,-.4,-.5);sun.data.angle=.03
world=bpy.data.worlds.new('summer fill');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.35,.48,.7,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.5
rows=math.ceil(len(models)/4);target=Vector((13.5,(rows-1)*5.5,0))
bpy.ops.object.camera_add(location=target+Vector((16.5,-53,65)));cam=bpy.context.object;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=66 if rows>4 else 55
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=1440;scene.render.resolution_y=1440;scene.render.resolution_percentage=100
scene.render.filepath=os.path.join(OUT,'kit-contact.png');bpy.ops.render.render(write_still=True)
