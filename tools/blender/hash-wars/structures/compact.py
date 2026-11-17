"""Lossless layout compaction plus 8-bit normalized vertex colour (standard glTF).
No decoder or runtime extension. Positions, normals, UVs and nodes are untouched.
"""
import json, struct, os
import numpy as np


def pack(path):
    raw=open(path,'rb').read();n=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
    views=doc['bufferViews'];payloads=[binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for v in views]
    colours={p['attributes']['COLOR_0'] for m in doc['meshes'] for p in m['primitives']}
    for i in colours:
        a=doc['accessors'][i];v=views[a['bufferView']]
        assert not a.get('byteOffset') and not v.get('byteStride')
        if a['componentType']==5123:
            src=np.frombuffer(payloads[a['bufferView']],dtype='<u2')
            payloads[a['bufferView']]=np.round(src.astype(np.float64)/257).astype('uint8').tobytes()
            a['componentType']=5121
    chunks=[];offset=0
    for v,data in zip(views,payloads):
        pad=(-offset)%4
        if pad:chunks.append(b'\0'*pad);offset+=pad
        v['byteOffset']=offset;v['byteLength']=len(data);chunks.append(data);offset+=len(data)
    doc['buffers'][0]['byteLength']=offset
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    blob=b''.join(chunks);blob+=b'\0'*((-len(blob))%4)
    out=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(blob))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(blob),0x004e4942)+blob
    with open(path+'.tmp','wb') as f:f.write(out)
    os.replace(path+'.tmp',path)
