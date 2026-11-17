"""Inspect package bytes, GLB structure, hierarchy, texture embedding and LOD budgets.

Run with system Python after a build. Blender's build also re-imports every
file to check the joint pivots and closed shells.
"""
import json
import struct
from io import BytesIO
from PIL import Image
from pathlib import Path


def audit():
    repo = Path(__file__).resolve().parents[4]
    folder = repo / 'assets/hash-wars/machines'
    manifest = json.loads((folder / 'manifest.json').read_text())
    total = 0
    for name, entry in manifest['machines'].items():
        path = folder / entry['file']
        data = path.read_bytes()
        magic, version, length = struct.unpack_from('<III', data)
        assert magic == 0x46546C67 and version == 2 and length == len(data), path
        count = struct.unpack_from('<I', data, 12)[0]
        doc = json.loads(data[20:20+count])
        nodes = {n['name']: n for n in doc['nodes']}
        assert name in nodes and name + '_lod1' in nodes
        assert not doc.get('skins') and not doc.get('animations')
        assert len(nodes) == len(doc['nodes']), 'duplicate names'
        assert all(i.get('mimeType') == 'image/webp' and 'bufferView' in i for i in doc['images'])
        for image in doc['images']:
            view=doc['bufferViews'][image['bufferView']]
            start=28+count+view.get('byteOffset',0)
            decoded=Image.open(BytesIO(data[start:start+view['byteLength']]))
            assert decoded.size == (entry['texture'],entry['texture']), (name,decoded.size)
        assert all(m['name'].startswith(('tex:', 'emit:')) for m in doc['materials'])
        assert all(n['name'] in nodes for n in entry['nodes'])
        assert all(n in nodes for n in ('body','sensor','gun','muzzle'))
        required = {
            'watcher': ['head'] + [part+'_'+leg for leg in ('l','r','rear') for part in ('hip','thigh','shin','foot')],
            'hauler': ['bay','bay_release','bay_door_0','bay_door_1'] + ['thruster_'+str(i) for i in range(4)],
            'siege': [f'clamp_{i}{suffix}' for i in range(3) for suffix in ('','_jaw','_coupling')] +
                     [f'turret_{i}{suffix}' for i in range(2) for suffix in ('','_head','_muzzle')],
        }
        assert all(n in nodes for n in required.get(name, [])), name
        if name == 'siege':
            import subprocess
            sim = json.loads(subprocess.check_output(['node','-e',
                'const h=require("./js/hash-wars.js");console.log(JSON.stringify(h.entities))'], cwd=repo))
            origin=sim['stations'][2]['spire']
            for i,p in enumerate(sim['clamps']):
                expected=[p[k]-origin[k] for k in ('x','y','z')]
                pivot=next(n['pivot'] for n in entry['nodes'] if n['name']==f'clamp_{i}')
                assert max(abs(a-b) for a,b in zip(expected,pivot)) < .001, (i,expected,pivot)

        def triangles(node):
            n = nodes[node]
            count = 0
            if 'mesh' in n:
                count = sum(doc['accessors'][p['indices']]['count']//3 for p in doc['meshes'][n['mesh']]['primitives'])
            return count + sum(triangles(doc['nodes'][i]['name']) for i in n.get('children', []))
        high = triangles(name)
        low = triangles(name+'_lod1')
        assert high == entry['triangles'] and low == entry['lod1_triangles']
        assert high <= entry['budget']
        assert .28 < low/high < .4, (name, low/high)
        assert len(data) == entry['bytes'] and entry['verify'] == 'ok'
        assert not entry['open_edges']
        total += len(data)
        print(f"{name}: {entry['size']}m, {high:,} / {low:,} triangles, {len(nodes)} nodes, {len(data):,} bytes, embedded WebP")
    assert total < 10_000_000, f'package exceeds 10 MB: {total}'
    assert total == manifest['total_bytes']
    print(f'PASS: {len(manifest["machines"])} files, {total:,} bytes total')


if __name__ == '__main__':
    audit()
