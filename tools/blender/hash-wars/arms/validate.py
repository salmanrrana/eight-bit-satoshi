"""Check the shipped binary files independently of Blender's scene state.

Run with system Python from the repository root after build.py completes.
Uses only Python's standard library. Blender also re-imports every export.
"""
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / 'assets/hash-wars/arms'


def webp_size(payload):
    """Read WebP dimensions without an imaging dependency."""
    assert payload[:4] == b'RIFF' and payload[8:12] == b'WEBP'
    offset=12
    while offset+8 <= len(payload):
        kind=payload[offset:offset+4]
        size=struct.unpack_from('<I',payload,offset+4)[0]
        data=payload[offset+8:offset+8+size]
        if kind == b'VP8X':
            return int.from_bytes(data[4:7],'little')+1,int.from_bytes(data[7:10],'little')+1
        if kind == b'VP8 ':
            assert data[3:6] == b'\x9d\x01\x2a'
            return struct.unpack_from('<H',data,6)[0]&0x3fff,struct.unpack_from('<H',data,8)[0]&0x3fff
        if kind == b'VP8L':
            bits=int.from_bytes(data[1:5],'little')
            return (bits&0x3fff)+1,((bits>>14)&0x3fff)+1
        offset+=8+size+(size%2)
    raise AssertionError('No WebP dimensions')


def validate(name, entry):
    path = OUT / entry['file']
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', raw)
    assert magic == b'glTF' and version == 2 and length == len(raw), path
    size, kind = struct.unpack_from('<I4s', raw, 12)
    assert kind == b'JSON'
    doc = json.loads(raw[20:20+size])
    assert len(raw) == entry['bytes'], 'Stale manifest bytes'
    assert not doc.get('skins') and not doc.get('animations'), 'Rigid nodes only'
    nodes = {n['name']: n for n in doc['nodes']}
    required = {'muzzle','sight','arm_r','arm_l',name,name+'_world'}
    required |= {
        'carbine': {'mag','bolt','eject','reticle'},
        'arc': {'vent','core','reticle'},
        'scatter': {'drum','bolt','eject','reticle'},
        'rail': {'mag','bolt','eject','coil','lens','reticle'},
    }[name]
    assert required <= nodes.keys(), required - nodes.keys()
    assert entry['problems'] == [], entry['problems']
    assert all(m['name'].startswith(('tex:', 'emit:')) for m in doc['materials'])
    assert len(doc.get('images',[])) == 3, 'One base, normal and ORM atlas'
    assert all(i.get('mimeType') == 'image/webp' and 'bufferView' in i for i in doc['images'])
    assert 'EXT_texture_webp' in doc.get('extensionsRequired',[])
    assert all(doc['bufferViews'][i['bufferView']]['byteLength'] > 0 for i in doc['images'])
    for accessor in doc['accessors']:
        view = doc['bufferViews'][accessor['bufferView']]
        width = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[accessor['componentType']]
        components = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
        stride = view.get('byteStride',width*components)
        assert accessor.get('byteOffset',0) + (accessor['count']-1)*stride + width*components <= view['byteLength']
    assert entry['texture'] == 2048
    binary = raw[28+size:]
    for image in doc['images']:
        view = doc['bufferViews'][image['bufferView']]
        offset = view.get('byteOffset',0)
        assert webp_size(binary[offset:offset+view['byteLength']]) == (2048,2048)
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            material = doc['materials'][primitive['material']]
            if 'normalTexture' in material:
                assert {'NORMAL','TANGENT','TEXCOORD_0'} <= primitive['attributes'].keys(), mesh['name']
            if 'TANGENT' in primitive['attributes']:
                a=doc['accessors'][primitive['attributes']['TANGENT']]
                v=doc['bufferViews'][a['bufferView']]
                fmt={5120:'4b',5126:'4f'}[a['componentType']]
                width=struct.calcsize(fmt)
                for i in range(a['count']):
                    t=struct.unpack_from('<'+fmt,binary,v.get('byteOffset',0)+a.get('byteOffset',0)+i*v.get('byteStride',width))
                    scale=127 if a.get('normalized') else 1
                    assert all(math.isfinite(c) for c in t) and sum((c/scale)**2 for c in t[:3]) > .25 and t[3] != 0, 'Invalid tangent poisons HDR'
    assert all(b.get('uri') is None for b in doc['buffers']), 'No external buffer' 

    def triangles(n):
        node = nodes[n]
        mesh = doc['meshes'][node['mesh']] if 'mesh' in node else {'primitives':[]}
        own = sum(doc['accessors'][p['indices']]['count']//3 for p in mesh['primitives'])
        return own + sum(triangles(doc['nodes'][i]['name']) for i in node.get('children',[]))

    fp, world = triangles(name), triangles(name+'_world')
    assert fp == entry['triangles']['first_person'], (fp, entry['triangles'])
    assert world == entry['triangles']['world']
    assert fp <= 70000
    assert not nodes[name+'_world'].get('children'), 'Pickup root must contain weapon only'
    weapon=fp-triangles('arm_l')-triangles('arm_r')
    assert .22 <= world/weapon <= .40, 'World mesh must stay near one third of weapon triangles'
    assert all(n in entry['nodes'] for n in required)
    assert nodes[name].get('translation',[0,0,0]) == [0,0,0], 'Grip origin must stay at zero'
    assert entry['nodes']['muzzle']['pivot'][2] < 0, 'Muzzle points down -Z'
    assert entry['nodes']['sight']['pivot'][2] > 0, 'Aimed eye behind grip'
    print(f'{name}: {fp:,} FP + {world:,} world triangles; {len(raw):,} bytes; '
          f'{len(nodes)} nodes; embedded WebP; rigid; OK')
    return len(raw)


def main():
    manifest = json.loads((OUT/'manifest.json').read_text())
    total = sum(validate(n,e) for n,e in manifest['files'].items())
    assert total <= 10_000_000, f'Arms package exceeds 10 MB: {total}'
    print(f'Package: {total:,} / 10,000,000 bytes')


if __name__ == '__main__':
    main()
