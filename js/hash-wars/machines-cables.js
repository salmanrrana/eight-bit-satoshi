/** Deforming rigid cable segments in one draw, sharing the ordinary kit shader. */
export function createCableBatch(T, source, material, count) {
  const vertices = source.attributes.position.count;
  const geometry = new T.BufferGeometry();
  const position = new T.BufferAttribute(
    new Float32Array(vertices * count * 3),
    3,
  );
  const normal = new T.BufferAttribute(
    new Float32Array(vertices * count * 3),
    3,
  );
  position.setUsage(T.DynamicDrawUsage);
  normal.setUsage(T.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("normal", normal);
  // Preserve UVs and indexing so this uses the existing non-instanced material program.
  const uv = new Float32Array(vertices * count * 2);
  const indices = new Uint16Array(source.index.count * count);
  for (let i = 0; i < count; i++) {
    uv.set(source.attributes.uv.array, i * vertices * 2);
    for (let j = 0; j < source.index.count; j++)
      indices[i * source.index.count + j] = source.index.getX(j) + i * vertices;
  }
  geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
  geometry.setIndex(new T.BufferAttribute(indices, 1));
  const mesh = new T.Mesh(geometry, material);
  mesh.name = "Cartel pulsing drain cables";
  mesh.frustumCulled = false;
  const p = new T.Vector3(),
    n = new T.Vector3(),
    normalMatrix = new T.Matrix3();
  return {
    mesh,
    update(segments) {
      let visible = false;
      for (let i = 0; i < count; i++) {
        const segment = segments[i];
        visible ||= segment.visible;
        segment.updateMatrix();
        normalMatrix.getNormalMatrix(segment.matrix);
        for (let j = 0; j < vertices; j++) {
          if (segment.visible) {
            p.fromBufferAttribute(source.attributes.position, j).applyMatrix4(
              segment.matrix,
            );
            n.fromBufferAttribute(
              source.attributes.normal,
              j,
            ).applyNormalMatrix(normalMatrix);
          } else {
            p.set(0, 0, 0);
            n.set(0, 1, 0);
          }
          position.setXYZ(i * vertices + j, p.x, p.y, p.z);
          normal.setXYZ(i * vertices + j, n.x, n.y, n.z);
        }
      }
      mesh.visible = visible;
      position.needsUpdate = normal.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
    },
  };
}
