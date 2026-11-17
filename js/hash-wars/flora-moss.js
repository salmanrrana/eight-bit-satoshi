import { sunDirectionAt } from "./sky.js";
import { hash } from "./flora-field.js";

// Project small cushions onto LAND's actual authored rock triangles. Layout
// boxes cannot describe a curved boulder face: using them would float decals.
// This is a build-time read of LAND, never a change to its meshes or materials.
export function rockMoss({ T, scene, quality, sim }) {
  const patches = new Map();
  const sun = sunDirectionAt(0.5),
    matrix = new T.Matrix4(),
    local = new T.Matrix4();
  const normalMatrix = new T.Matrix3(),
    normal = new T.Vector3();
  const ray = new T.Raycaster(),
    direction = new T.Vector3(1, 0, 0);
  const box = new T.Box3(),
    size = new T.Vector3(),
    center = new T.Vector3();
  const cap = quality === "low" ? 24 : quality === "high" ? 54 : 80;
  const chance = quality === "low" ? 0.12 : quality === "high" ? 0.24 : 0.36;
  const rocks = [];
  scene.traverse((mesh) => {
    if (
      mesh.isInstancedMesh &&
      mesh.name.startsWith("LAND ") &&
      /boulder|cliff|column/.test(mesh.name)
    )
      rocks.push(mesh);
  });
  let count = 0;
  for (const mesh of rocks) {
    if (count >= cap) break;
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const proxy = new T.Mesh(mesh.geometry, mesh.material);
    proxy.matrixAutoUpdate = proxy.matrixWorldAutoUpdate = false;
    for (let i = 0; i < mesh.count && count < cap; i++) {
      mesh.getMatrixAt(i, local);
      matrix.multiplyMatrices(mesh.matrixWorld, local);
      box.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
      box.getCenter(center);
      box.getSize(size);
      if (
        box.min.y < sim.SEA_Y + 2 ||
        center.z > -30 ||
        center.z < -440 ||
        Math.abs(center.x) > 64 ||
        size.y < 0.35 ||
        hash(center.x, center.z, i + 85) > chance
      )
        continue;
      proxy.matrixWorld.copy(matrix);
      normalMatrix.getNormalMatrix(matrix);
      const radius = 0.1 + hash(center.x, center.z, 13) * 0.22;
      const y =
        box.min.y +
        Math.min(size.y * 0.4, 0.2 + hash(center.x, center.z, 9) * 0.7);
      const z = center.z + (hash(center.x, center.z, 4) - 0.5) * size.z * 0.5;
      ray.far = size.x + 0.5;
      function project(yy, zz) {
        ray.set(new T.Vector3(box.min.x - 0.15, yy, zz), direction);
        const hit = ray.intersectObject(proxy, false)[0];
        if (!hit) return null;
        normal.copy(hit.face.normal).applyNormalMatrix(normalMatrix);
        if (normal.dot(sun) > 0.23) return null;
        return hit.point.addScaledVector(normal, 0.009).toArray();
      }
      const root = project(y, z);
      if (!root || root[0] < -64 || root[0] >= 64) continue;
      const ring = [];
      for (let k = 0; k < 9; k++) {
        const a = (k * Math.PI * 2) / 9;
        const r = radius * (0.72 + hash(center.x, center.z, k + 31) * 0.28);
        ring.push(project(y + Math.cos(a) * r, z + Math.sin(a) * r));
      }
      const triangles = [];
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k],
          b = ring[(k + 1) % ring.length];
        if (
          !a ||
          !b ||
          Math.hypot(a[0] - root[0], a[1] - root[1], a[2] - root[2]) >
            radius * 3 ||
          Math.hypot(b[0] - root[0], b[1] - root[1], b[2] - root[2]) >
            radius * 3
        )
          continue;
        triangles.push([root, b, a]);
      }
      if (!triangles.length) continue;
      const key = `${Math.floor((root[0] + 64) / 16) * 16 - 64},${Math.floor((root[2] + 448) / 16) * 16 - 448}`;
      if (!patches.has(key)) patches.set(key, []);
      patches.get(key).push({
        triangles,
        colour: [0.065, 0.115 + hash(center.x, center.z, 16) * 0.045, 0.018],
      });
      count++;
    }
  }
  return patches;
}
