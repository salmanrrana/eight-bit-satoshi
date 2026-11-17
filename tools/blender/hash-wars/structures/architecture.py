"""Shared architectural details. All coordinates here are Blender Z-up metres."""
import bpy
from mathutils import Vector
from kit import Part, fine, _font


def slab(p, size, at, mat='surf:cutStone', paint='bone', bevel=.06):
    """A dressed structural box and its matching local collision solid."""
    p.box(size, at=at, mat=mat, paint=paint, bevel=bevel, step=2 if fine() else 5)
    p.solid_box(tuple(a-s/2 for a,s in zip(at,size)),tuple(a+s/2 for a,s in zip(at,size)))


def engraving(p, body, size, at, width, height, depth=.035):
    """An actual cut into a ceramic tablet, with dark pigment at the cut's floor.
    `at` is the tablet front, facing -Y. Cutter and boolean objects are discarded.
    """
    # Keep the tablet separate so flat-face shading and indirect AO are stable.
    p=Part(p.name+"_inscription_"+str(len(p.children)),parent=p)
    x,y,z=at
    if not fine():
        p.box((width,.22,height),at=(x,y+.11,z),bevel=.025,step=3)
        p.text(body,size,at=(x,y-.06,z),font='sans',depth=0,paint='graphite')
        return
    panel=Part('temporary_tablet')
    panel.box((width,.22,height),at=(x,y+.11,z),bevel=.025,step=2)
    mesh=bpy.data.meshes.new('tablet');panel.bm.to_mesh(mesh);panel.bm.free()
    ob=bpy.data.objects.new('tablet',mesh);bpy.context.scene.collection.objects.link(ob)
    curve=bpy.data.curves.new('cut_letters','FONT');curve.body=body;curve.size=size
    curve.align_x='CENTER';curve.align_y='CENTER';curve.font=_font('sans');curve.resolution_u=2
    curve.extrude=depth;curve.space_line=1.18
    cut=bpy.data.objects.new('cut_letters',curve);bpy.context.scene.collection.objects.link(cut)
    cut.location=(x,y+depth*.7,z);cut.rotation_euler[0]=1.5707963267948966
    bpy.context.view_layer.objects.active=cut;cut.select_set(True);ob.select_set(False)
    bpy.ops.object.convert(target='MESH')
    mod=ob.modifiers.new('engraved','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut
    dg=bpy.context.evaluated_depsgraph_get();result=bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    before=set(p.bm.faces);p.bm.from_mesh(result)
    p._finish_faces([f for f in p.bm.faces if f not in before],'tex:keeper','bone')
    bpy.data.meshes.remove(result);bpy.data.objects.remove(ob,do_unlink=True);bpy.data.meshes.remove(mesh)
    cutmesh=cut.data;bpy.data.objects.remove(cut,do_unlink=True);bpy.data.meshes.remove(cutmesh)
    # Thin ink lies strictly behind the original face. The cut exposes this floor.
    p.text(body,size,at=(x,y+depth*.65,z),font='sans',depth=0,paint='graphite')


def bearing(p, x, y, z, w=1.4):
    p.box((w,1,.16),at=(x,y,z),paint='graphite',bevel=.025)
    p.box((w+.2,1.2,.1),at=(x,y,z+.13),mat='surf:galvanized',paint='iron',bevel=.02)
