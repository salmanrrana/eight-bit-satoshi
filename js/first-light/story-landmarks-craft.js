// Small modelling tools shared only by the landmarks. Static parts are merged
// per material so close-up detail does not turn into hundreds of draw calls.
import { mergeGeometries } from "../../vendor/three/addons/utils/BufferGeometryUtils.js";
export function craft({ T, kit }) {
  const owned = new Set();
  const own = (value) => (owned.add(value), value);
  function box(parent, size, pos, material, radius = 0.008, rotation) {
    const mesh = kit.box(...size, material, radius);
    mesh.position.set(...pos);
    if (rotation) mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }
  function cylinder(
    parent,
    radius,
    length,
    pos,
    material,
    top = radius,
    segments = 16,
  ) {
    const mesh = new T.Mesh(
      own(new T.CylinderGeometry(top, radius, length, segments)),
      material,
    );
    mesh.position.set(...pos);
    parent.add(mesh);
    return mesh;
  }
  function rod(parent, a, b, radius, material) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b);
    const mesh = cylinder(
      parent,
      radius,
      start.distanceTo(end),
      [0, 0, 0],
      material,
      radius,
      8,
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      end.sub(start).normalize(),
    );
    return mesh;
  }
  function cable(parent, points, radius, material) {
    const path = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
    const mesh = new T.Mesh(
      own(new T.TubeGeometry(path, 28, radius, 5, false)),
      material,
    );
    parent.add(mesh);
    return mesh;
  }
  function canvas(width, height, paint) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    paint(c.getContext("2d"), width, height);
    const texture = own(new T.CanvasTexture(c));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
  function face(parent, texture, w, h, pos, rotation = [0, 0, 0], glow = 0) {
    const material = kit.material({
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: glow,
      roughness: 0.65,
      side: T.DoubleSide,
    });
    const mesh = new T.Mesh(own(new T.PlaneGeometry(w, h)), material);
    mesh.position.set(...pos);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }
  function merge(parent, shadow = true) {
    const buckets = new Map();
    for (const mesh of [...parent.children]) {
      if (!mesh.isMesh) continue;
      mesh.updateMatrix();
      const g = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      g.applyMatrix4(mesh.matrix);
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      buckets.get(mesh.material).push(g);
      parent.remove(mesh);
    }
    for (const [material, parts] of buckets) {
      const geometry = own(mergeGeometries(parts));
      parts.forEach((p) => p.dispose());
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = shadow && !material.transparent;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
  function mug(parent, pos, ceramic, coffee) {
    const g = new T.Group();
    g.position.set(...pos);
    parent.add(g);
    // Lathed rim leaves a real open cup, with a dark coffee meniscus inside.
    const profile = [
      [0.025, 0],
      [0.034, 0.004],
      [0.038, 0.078],
      [0.035, 0.083],
      [0.03, 0.081],
      [0.029, 0.016],
    ];
    const cup = new T.Mesh(
      own(
        new T.LatheGeometry(
          profile.map((p) => new T.Vector2(...p)),
          24,
        ),
      ),
      ceramic,
    );
    g.add(cup);
    cylinder(g, 0.029, 0.002, [0, 0.065, 0], coffee);
    const handle = new T.Mesh(
      own(new T.TorusGeometry(0.024, 0.006, 7, 20, Math.PI * 1.7)),
      ceramic,
    );
    handle.position.set(0.04, 0.043, 0);
    handle.rotation.z = -Math.PI * 0.85;
    g.add(handle);
    merge(g);
    return g;
  }
  return {
    own,
    box,
    cylinder,
    rod,
    cable,
    canvas,
    face,
    merge,
    mug,
    dispose() {
      owned.forEach((r) => r.dispose());
      owned.clear();
    },
  };
}
