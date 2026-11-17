/** Partition an indexed static mesh without changing a vertex or triangle.
 * Attributes stay shared; tight index-derived bounds allow normal frustum culling. */
export function spatialChunks(
  T,
  geometry,
  size = 48,
  { strips = false, vertical = false, compact = false } = {},
) {
  const cells = new Map(),
    position = geometry.attributes.position;
  const index = geometry.index;
  const vertex = (i) => (index ? index.getX(i) : i);
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const a = vertex(i),
      b = vertex(i + 1),
      c = vertex(i + 2);
    const x = Math.floor(
      (position.getX(a) + position.getX(b) + position.getX(c)) / (3 * size),
    );
    const z = Math.floor(
      (position.getZ(a) + position.getZ(b) + position.getZ(c)) / (3 * size),
    );
    const y = vertical
      ? Math.floor(
          (position.getY(a) + position.getY(b) + position.getY(c)) / (3 * size),
        )
      : 0;
    const key = strips
      ? `${Math.max(-2, Math.min(1, x))}:${Math.max(-5, Math.min(0, z))}`
      : `${x}:${y}:${z}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(a, b, c);
  }
  const point = new T.Vector3();
  return [...cells.values()].map((indices) => {
    const chunk = new T.BufferGeometry();
    if (compact) {
      const vertices = [...new Set(indices)],
        map = new Map(vertices.map((index, i) => [index, i]));
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const data = new Float32Array(vertices.length * attribute.itemSize);
        vertices.forEach((index, i) => {
          for (let axis = 0; axis < attribute.itemSize; axis++)
            data[i * attribute.itemSize + axis] = attribute.getComponent(
              index,
              axis,
            );
        });
        chunk.setAttribute(
          name,
          new T.BufferAttribute(data, attribute.itemSize),
        );
      }
      chunk.setIndex(indices.map((index) => map.get(index)));
    } else {
      for (const [name, attribute] of Object.entries(geometry.attributes))
        chunk.setAttribute(name, attribute);
      chunk.setIndex(indices);
    }
    chunk.boundingBox = new T.Box3();
    for (const i of indices)
      chunk.boundingBox.expandByPoint(point.fromBufferAttribute(position, i));
    chunk.boundingSphere = chunk.boundingBox.getBoundingSphere(new T.Sphere());
    return chunk;
  });
}
