"""Standard glTF attribute packing. Positions, topology and images are untouched.
8-bit unit normals and 16-bit UVs; no external decoder needed.
"""
import json
import struct
from pathlib import Path


def pack(file):
    file = Path(file)
    raw = file.read_bytes()
    n = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+n])
    blob = raw[28+n:]
    views = doc['bufferViews']
    payloads = [blob[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']] for v in views]
    targets = {}
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            for name, index in primitive['attributes'].items():
                if name in ('NORMAL', 'TANGENT') or name.startswith('TEXCOORD_'):
                    targets[index] = name
    changed = False
    for index, name in targets.items():
        a = doc['accessors'][index]
        if a['componentType'] not in (5126, 5122) or 'sparse' in a:
            continue
        width = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        view = views[a['bufferView']]
        source_short = a['componentType'] == 5122
        stride = view.get('byteStride', width*(2 if source_short else 4))
        start = a.get('byteOffset', 0)
        data = payloads[a['bufferView']]
        values = [v for i in range(a['count']) for v in struct.unpack_from('<'+('h' if source_short else 'f')*width, data, start+i*stride)]
        if source_short:
            values = [v/32767 for v in values]
        uv = name.startswith('TEXCOORD_')
        if uv and (min(values) < 0 or max(values) > 1):
            continue
        scale = 65535 if uv else 127
        fmt = 'H' if uv else 'b'
        # glTF vertex elements must be aligned to four bytes, including short VEC3.
        element = width*(2 if uv else 1)
        padded = (element+3)//4*4
        output = bytearray()
        for i in range(0, len(values), width):
            output.extend(struct.pack('<'+fmt*width, *[round(max(-1, min(1, v))*scale) for v in values[i:i+width]]))
            output.extend(b'\0'*(padded-element))
        a['bufferView'] = len(views)
        a.pop('byteOffset', None)
        a.pop('min', None)
        a.pop('max', None)
        a.update(componentType=5123 if uv else 5120, normalized=True)
        views.append({'buffer': 0, 'byteLength': len(output), 'byteStride': padded, 'target': 34962})
        payloads.append(bytes(output))
        changed = True
    if not changed:
        return
    for key in ('extensionsUsed', 'extensionsRequired'):
        doc[key] = sorted(set(doc.get(key, []) + ['KHR_mesh_quantization']))
    used = {a['bufferView'] for a in doc['accessors'] if 'bufferView' in a}
    used.update(i['bufferView'] for i in doc.get('images', []) if 'bufferView' in i)
    mapping = {}
    out = bytearray()
    newviews = []
    for old in sorted(used):
        out.extend(b'\0'*(-len(out)%4))
        v = dict(views[old], byteOffset=len(out))
        mapping[old] = len(newviews)
        newviews.append(v)
        out.extend(payloads[old])
    for item in doc['accessors']+doc.get('images', []):
        if 'bufferView' in item:
            item['bufferView'] = mapping[item['bufferView']]
    doc['bufferViews'] = newviews
    doc['buffers'][0]['byteLength'] = len(out)
    out.extend(b'\0'*(-len(out)%4))
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' '*(-len(encoded)%4)
    result = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(out))+struct.pack('<II', len(encoded), 0x4e4f534a)+encoded+struct.pack('<II', len(out), 0x004e4942)+out
    temporary = file.with_suffix('.packing')
    temporary.write_bytes(result)
    temporary.replace(file)


def pack_existing(directory):
    directory = Path(directory)
    sizes = {}
    for file in directory.glob('*.glb'):
        before = file.stat().st_size
        pack(file)
        sizes[file.name] = file.stat().st_size
        print(file.name, before, '->', sizes[file.name], flush=True)
    manifest = directory/'manifest.json'
    doc = json.loads(manifest.read_text())
    def update(value):
        if isinstance(value, dict):
            if value.get('file') in sizes and 'bytes' in value:
                value['bytes'] = sizes[value['file']]
            for child in value.values():
                update(child)
        elif isinstance(value, list):
            for child in value:
                update(child)
    update(doc)
    if 'total_bytes' in doc:
        doc['total_bytes'] = sum(sizes.values())
    manifest.write_text(json.dumps(doc, indent=2)+'\n')
