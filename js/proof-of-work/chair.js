import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// The complete swivel chair stays inside the simulation's shared footprint.
// Curved upholstery and bent tubing are important in the doorway silhouette.
export function buildChair(scene, m, shape) {
  const [left, right, north, south] = shape.bounds;
  const width = right - left,
    depth = south - north;
  const chair = new T.Group();
  chair.position.set((left + right) / 2, 0, (north + south) / 2);
  scene.add(chair);
  const cloth = new T.MeshPhysicalMaterial({
    color: 0x242d2a,
    map: m.rubber.map,
    normalMap: m.rubber.normalMap,
    normalScale: new T.Vector2(0.3, 0.3),
    roughness: 0.94,
    specularIntensity: 0.15,
    sheen: 0.2,
    sheenColor: new T.Color(0x64726b),
    sheenRoughness: 0.85,
  });
  const frame = m.paint.clone();
  frame.color.set(0x505b57);
  const tread = m.rubber.clone();
  tread.color.set(0x414743);
  function mesh(geometry, material, x, y, z) {
    const o = new T.Mesh(geometry, material);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    chair.add(o);
    return o;
  }
  function tube(points, radius, material = frame) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
    );
    return mesh(
      new T.TubeGeometry(curve, 16, radius, 8, false),
      material,
      0,
      0,
      0,
    );
  }
  const seatGeometry = new RoundedBoxGeometry(width, 0.13, depth, 4, 0.055);
  const seatPositions = seatGeometry.attributes.position;
  for (let i = 0; i < seatPositions.count; i++) {
    const x = seatPositions.getX(i),
      y = seatPositions.getY(i),
      z = seatPositions.getZ(i);
    const impression = Math.exp(-((x / 0.19) ** 2 + (z / 0.2) ** 2));
    if (y > 0) seatPositions.setY(i, y - impression * 0.017);
  }
  seatGeometry.computeVertexNormals();
  mesh(seatGeometry, cloth, 0, 0.48, 0);
  const backGeometry = new RoundedBoxGeometry(width, 0.73, 0.1, 4, 0.045);
  const backPositions = backGeometry.attributes.position;
  for (let i = 0; i < backPositions.count; i++) {
    const x = backPositions.getX(i),
      y = backPositions.getY(i),
      z = backPositions.getZ(i);
    backPositions.setX(i, x * (0.93 - y * 0.14));
    backPositions.setZ(i, z - Math.exp(-(((y + 0.14) / 0.18) ** 2)) * 0.027);
  }
  backGeometry.computeVertexNormals();
  mesh(backGeometry, cloth, 0, 0.95, depth / 2 - 0.05);
  // Piping along the seat and two stitched channels break up the broad pads.
  const seam = m.rubber.clone();
  seam.color.set(0x303a36);
  tube(
    [
      [-0.24, 0.484, -0.24],
      [-0.27, 0.484, -0.18],
      [-0.27, 0.484, 0.18],
      [-0.24, 0.484, 0.24],
      [0.24, 0.484, 0.24],
      [0.27, 0.484, 0.18],
      [0.27, 0.484, -0.18],
      [0.24, 0.484, -0.24],
      [-0.24, 0.484, -0.24],
    ],
    0.003,
    seam,
  );
  for (const x of [-0.16, 0.16])
    tube(
      [
        [x, 0.68, depth / 2 + 0.0001],
        [x, 1.01, depth / 2 + 0.0001],
        [x * 0.94, 1.25, depth / 2 - 0.004],
      ],
      0.0018,
      seam,
    );
  for (const side of [-1, 1]) {
    tube(
      [
        [side * 0.2, 0.43, 0.18],
        [side * 0.2, 0.62, 0.2],
        [side * 0.2, 1.07, 0.19],
      ],
      0.014,
      m.steel,
    );
    tube(
      [
        [side * 0.22, 0.48, -0.14],
        [side * 0.24, 0.69, -0.12],
        [side * 0.24, 0.74, 0.12],
        [side * 0.2, 0.51, 0.17],
      ],
      0.012,
      m.steel,
    );
    mesh(
      new RoundedBoxGeometry(0.065, 0.045, 0.29, 3, 0.018),
      cloth,
      side * 0.23,
      0.76,
      -0.01,
    );
  }
  mesh(new T.CylinderGeometry(0.026, 0.04, 0.31, 24), m.steel, 0, 0.26, 0);
  mesh(new T.CylinderGeometry(0.054, 0.045, 0.13, 24), frame, 0, 0.41, 0);
  const wheelGeometry = new T.CylinderGeometry(0.042, 0.042, 0.027, 24);
  const capGeometry = new T.CylinderGeometry(0.021, 0.021, 0.029, 16);
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5,
      x = Math.cos(a) * 0.225,
      z = Math.sin(a) * 0.225;
    tube(
      [
        [0, 0.16, 0],
        [x * 0.55, 0.12, z * 0.55],
        [x, 0.095, z],
      ],
      0.017,
      m.steel,
    );
    const wheel = mesh(wheelGeometry, tread, x, 0.047, z);
    wheel.rotation.set(0, -a, Math.PI / 2);
    const cap = mesh(capGeometry, frame, x, 0.047, z);
    cap.rotation.copy(wheel.rotation);
  }
}
