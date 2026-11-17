"""Re-import checks for the exported structure contract. Called by build.py."""
import bpy,json,os,struct,math
import numpy as np
from mathutils import Vector


def check(directory):
    manifest=json.load(open(os.path.join(directory,'manifest.json')))
    total=0
    for entry in manifest['files']:
        path=os.path.join(directory,entry['file'])
        raw=open(path,'rb').read();length=struct.unpack_from('<I',raw,12)[0]
        document=json.loads(raw[20:20+length])
        assert not document.get('animations') and not document.get('skins')
        assert all(i['mimeType']=='image/webp' for i in document.get('images',[]))
        for mat in document['materials']:
            if mat['name'].startswith('tex:'):
                assert 'normalTexture' in mat and 'occlusionTexture' in mat,mat['name']
                assert 'baseColorTexture' in mat['pbrMetallicRoughness']
        for mesh in document['meshes']:
            for primitive in mesh['primitives']:
                assert 'COLOR_0' in primitive['attributes'],mesh['name']
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
        for image in bpy.data.images:
            if 'keeper_normal' in image.name:
                pixels=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4)
                assert float(pixels[:,2].mean())>.8,'normal map exported black'
            if 'keeper_orm' in image.name:
                pixels=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4)
                assert float(pixels[:,1].mean())>.1,'roughness map exported black'
        for p in entry['pieces']:
            root=bpy.data.objects.get(p['name']);assert root is not None,p['name']
            assert root.location.length<.001,(p['name'],root.location)
            todo=[root];points=[]
            while todo:
                o=todo.pop();todo.extend(o.children)
                if o.type=='MESH':points.extend(o.matrix_world@v.co for v in o.data.vertices)
            # Importer converts glTF Y-up back to Blender Z-up.
            mn=[min(v[i] for v in points) for i in range(3)]
            mx=[max(v[i] for v in points) for i in range(3)]
            size=[mx[0]-mn[0],mx[2]-mn[2],mx[1]-mn[1]]
            assert all(abs(a-b)<.015 for a,b in zip(size,p['size'])),(p['name'],size,p['size'])
            for solid in p['solids']:
                if solid['shape']=='box':assert all(a<b for a,b in zip(solid['min'],solid['max']))
                else:assert solid['r']>0 and solid['y0']<solid['y1']
            if p.get('lod1'):assert bpy.data.objects.get(p['lod1']['name']) is not None
            total+=1
        print('REIMPORT OK:',entry['file'],len(entry['pieces']),'pieces',flush=True)
    assert sum(f['bytes'] for f in manifest['files'])<=10_000_000
    print('VALIDATED',total,'pieces;',sum(f['bytes'] for f in manifest['files']),'bytes',flush=True)
