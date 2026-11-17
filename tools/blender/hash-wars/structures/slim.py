"""Drop vertex data the engine never reads from a structures GLB.

`surf:` materials are replaced by the engine's world-space (triplanar) surfaces
and `emit:` materials are flat glow, so their primitives' TEXCOORD sets are dead
weight. Only `tex:` primitives keep UVs. Positions, normals, colours, indices and
images are untouched. `tex:` UVs (2 m tiling, so well outside 0..1) become
normalized 16-bit at uv/UV_RANGE, and the material's textures carry the matching
KHR_texture_transform scale, so the rendered mapping is unchanged (0.4 mm
steps at 2 m per repeat). Called by pipeline.export; `build.py --slim-existing`
applies it to the current files without a rebuild.
"""
import json
import struct
from pathlib import Path

UV_RANGE = 64.0  # repeats; |uv| must stay below this


def slim(file):
    file = Path(file)
    raw = file.read_bytes()
    n = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+n])
    blob = raw[28+n:]
    views = doc['bufferViews']
    payloads = [blob[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']] for v in views]
    materials = doc.get('materials', [])
    changed = False
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            name = materials[primitive['material']]['name'] if 'material' in primitive else ''
            if not name.startswith(('surf:', 'emit:')):
                continue
            for key in [k for k in primitive['attributes'] if k.startswith('TEXCOORD_')]:
                del primitive['attributes'][key]
                changed = True
    # Quantize every tex: primitive's UVs (all or none per material, because the
    # texture transform belongs to the material).
    tex = {i for i, m in enumerate(materials) if m['name'].startswith('tex:')}
    done = {}
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            if primitive.get('material') not in tex or 'TEXCOORD_0' not in primitive['attributes']:
                continue
            index = primitive['attributes']['TEXCOORD_0']
            if index in done:
                continue
            a = doc['accessors'][index]
            if a['componentType'] != 5126 or 'sparse' in a:
                continue
            view = views[a['bufferView']]
            stride = view.get('byteStride', 8)
            data = payloads[a['bufferView']]
            out = bytearray()
            for i in range(a['count']):
                u, v = struct.unpack_from('<ff', data, a.get('byteOffset', 0) + i * stride)
                assert abs(u) < UV_RANGE and abs(v) < UV_RANGE, (u, v)
                out += struct.pack('<hh', round(u / UV_RANGE * 32767), round(v / UV_RANGE * 32767))
            a['bufferView'] = len(views)
            a.pop('byteOffset', None)
            a.pop('min', None)
            a.pop('max', None)
            a.update(componentType=5122, normalized=True)
            views.append({'buffer': 0, 'byteLength': len(out), 'byteStride': 4, 'target': 34962})
            payloads.append(bytes(out))
            done[index] = True
            changed = True
    if done:
        for i in tex:
            m = materials[i]
            infos = [m.get('normalTexture'), m.get('occlusionTexture'), m.get('emissiveTexture'),
                     m.get('pbrMetallicRoughness', {}).get('baseColorTexture'),
                     m.get('pbrMetallicRoughness', {}).get('metallicRoughnessTexture')]
            for info in infos:
                if info is not None:
                    info.setdefault('extensions', {})['KHR_texture_transform'] = {'scale': [UV_RANGE, UV_RANGE]}
        for key in ('extensionsUsed', 'extensionsRequired'):
            doc[key] = sorted(set(doc.get(key, []) + ['KHR_mesh_quantization']))
        doc['extensionsUsed'] = sorted(set(doc['extensionsUsed'] + ['KHR_texture_transform']))
    if not changed:
        return False
    # Rebuild accessors/bufferViews keeping only what is still referenced.
    live = {i for mesh in doc['meshes'] for p in mesh['primitives']
            for i in [*p['attributes'].values(), p.get('indices')] if i is not None}
    live.update(i for skin in doc.get('skins', []) for i in [skin.get('inverseBindMatrices')] if i is not None)
    amap, accessors = {}, []
    for i, a in enumerate(doc['accessors']):
        if i in live:
            amap[i] = len(accessors)
            accessors.append(a)
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = amap[p['indices']]
    doc['accessors'] = accessors
    used = {a['bufferView'] for a in accessors if 'bufferView' in a}
    used.update(i['bufferView'] for i in doc.get('images', []) if 'bufferView' in i)
    vmap, out, newviews = {}, bytearray(), []
    for old in sorted(used):
        out.extend(b'\0'*(-len(out) % 4))
        vmap[old] = len(newviews)
        newviews.append(dict(views[old], byteOffset=len(out)))
        out.extend(payloads[old])
    for item in accessors+doc.get('images', []):
        if 'bufferView' in item:
            item['bufferView'] = vmap[item['bufferView']]
    doc['bufferViews'] = newviews
    doc['buffers'][0]['byteLength'] = len(out)
    out.extend(b'\0'*(-len(out) % 4))
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' '*(-len(encoded) % 4)
    result = (struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(out)) +
              struct.pack('<II', len(encoded), 0x4e4f534a) + encoded +
              struct.pack('<II', len(out), 0x004e4942) + out)
    temporary = file.with_suffix('.slimming')
    temporary.write_bytes(result)
    temporary.replace(file)
    return True


if __name__ == '__main__':
    import sys
    for f in sys.argv[1:]:
        before = Path(f).stat().st_size
        slim(f)
        print(f, before, '->', Path(f).stat().st_size)
