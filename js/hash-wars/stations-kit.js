import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Batch authored roots by material while retaining per-part culling, preserving
 * the artist's origin, vertex AO and material groups (never bottom-align pipes). */
export function createStationKit(ctx, resources, materialFor) {
  const { T, assets, quality } = ctx;
  const sources = new Map(),
    batches = new Map(),
    roots = [];
  function source(file, node, lod) {
    const key = `${file}:${node}:${lod}`;
    if (sources.has(key)) return sources.get(key);
    const object = assets.instantiate(`/assets/hash-wars/structures/${file}`, {
      node,
      lod,
    });
    if (!object) return null;
    object.updateMatrixWorld(true);
    const groups = new Map();
    object.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.visible) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const geometry = mesh.geometry;
      for (const group of geometry.groups.length
        ? geometry.groups
        : [
            {
              start: 0,
              count:
                geometry.index?.count ?? geometry.attributes.position.count,
              materialIndex: 0,
            },
          ]) {
        const material = materials[group.materialIndex];
        const g = geometry.clone();
        // Decode transport attributes before baking transforms; writing metre
        // coordinates back into an integer array would truncate the geometry.
        const position = g.attributes.position;
        if (!(position.array instanceof Float32Array)) {
          const values = [];
          for (let i = 0; i < position.count; i++)
            values.push(position.getX(i), position.getY(i), position.getZ(i));
          g.setAttribute("position", new T.Float32BufferAttribute(values, 3));
        }
        g.clearGroups();
        if (g.index)
          g.setIndex(
            Array.from(
              g.index.array.slice(group.start, group.start + group.count),
            ),
          );
        g.applyMatrix4(mesh.matrixWorld);
        if (!groups.has(material)) groups.set(material, []);
        groups.get(material).push(g);
      }
    });
    const result = [];
    for (const [material, geometries] of groups) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      resources.push(geometry);
      result.push({ geometry, material });
    }
    sources.set(key, result);
    return result;
  }
  function place(part, zone, group, lod = quality === "low") {
    const pieces = source(part.file, part.node, lod);
    if (!pieces) return false;
    const transform = new T.Object3D();
    transform.position.set(part.x, part.y, part.z);
    transform.rotation.set(0, part.yaw || 0, 0);
    if (part.pitch) transform.rotateX(part.pitch);
    transform.scale.set(...(part.scale ?? [1, 1, part.length ?? 1]));
    transform.updateMatrix();
    for (const piece of pieces) {
      const material = materialFor(piece.material, part.station ?? -1);
      const key = `${piece.geometry.uuid}:${material.uuid}:${zone}:${group.uuid}`;
      if (!batches.has(key))
        batches.set(key, {
          ...piece,
          material,
          matrices: [],
          group,
          node: part.node,
          proxyShadow:
            quality !== "ultra" &&
            (part.file === "route.glb" ||
              part.node === "citadel_gate" ||
              (part.file === "station.glb" &&
                part.station >= 0 &&
                part.station < 3)),
        });
      batches.get(key).matrices.push(transform.matrix.clone());
    }
    return true;
  }
  function finish() {
    // Keep each authored part's bounds. A site-wide merged buffer draws every
    // fin and service run even when most of the site is outside the view.
    const groups = new Map();
    for (const batch of batches.values()) {
      const casts =
        !batch.proxyShadow &&
        !batch.node.startsWith("pipe_run") &&
        batch.node !== "lamp_mast";
      const key = `${batch.material.uuid}:${batch.group.uuid}:${casts}`;
      if (!groups.has(key)) groups.set(key, { ...batch, casts, parts: [] });
      groups.get(key).parts.push(batch);
    }
    for (const group of groups.values()) {
      const geometries = new Map(
        group.parts.map((part) => [part.geometry, -1]),
      );
      let vertices = 0,
        indices = 0,
        instances = 0;
      for (const geometry of geometries.keys()) {
        vertices += geometry.attributes.position.count;
        indices += geometry.index?.count ?? 0;
      }
      for (const part of group.parts) instances += part.matrices.length;
      const mesh = new T.BatchedMesh(
        instances,
        vertices,
        indices,
        group.material,
      );
      mesh.name = "STATIONS culled site furniture";
      mesh.castShadow = group.casts;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // BatchedMesh culls each part for both cameras.
      mesh.sortObjects = false; // All site finishes are opaque.
      for (const geometry of geometries.keys())
        geometries.set(geometry, mesh.addGeometry(geometry));
      for (const part of group.parts)
        for (const matrix of part.matrices)
          mesh.setMatrixAt(
            mesh.addInstance(geometries.get(part.geometry)),
            matrix,
          );
      group.group.add(mesh);
      roots.push(mesh);
    }
  }
  return {
    place,
    source,
    finish,
    dispose: () =>
      roots.forEach((m) => {
        m.dispose();
        m.removeFromParent();
      }),
  };
}
