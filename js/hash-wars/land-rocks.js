import { spatialChunks } from "./spatial-chunks.js";
import { basaltMaterial } from "./land-rocks-material.js";
import { centreAt, random } from "./land-terrain.js";

const formations = [
  null,
  "lava_bank",
  "cut_gorge",
  "fins_bank",
  "summit_ridge",
  "summit_ridge",
];

/** Ease the lighting across worn drum edges. The welded groups change only
 * normals, so the cover geometry still matches the sim's sampled rock heights. */
function weatherBoulderNormals(T, geometry) {
  const { position, normal } = geometry.attributes;
  const vertices = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)]
      .map((n) => Math.round(n * 5000))
      .join(":");
    if (!vertices.has(key)) vertices.set(key, []);
    vertices.get(key).push(i);
  }
  const corner = new T.Vector3(),
    average = new T.Vector3();
  for (const copies of vertices.values()) {
    const authored = copies.map((i) =>
      new T.Vector3().fromBufferAttribute(normal, i),
    );
    // UV splits sometimes duplicate a face normal. Count each plane once.
    const planes = authored.filter(
      (n, i) => authored.findIndex((p) => p.dot(n) > 0.998) === i,
    );
    copies.forEach((i, j) => {
      corner.copy(authored[j]);
      average.set(0, 0, 0);
      for (const plane of planes) {
        const agreement = plane.dot(corner);
        // Keep the break where a crown meets its steep supporting face.
        if (agreement > 0.02 && Math.abs(plane.y - corner.y) < 0.72)
          average.addScaledVector(plane, 0.45 + agreement * 0.55);
      }
      corner.lerp(average.normalize(), 0.68).normalize();
      normal.setXYZ(i, corner.x, corner.y, corner.z);
    });
  }
}

/** Dress authoritative solids with shared Blender geometry. Each 48 m batch
 * has both LODs ready at build, so distance changes never compile or allocate. */
export async function buildRocks(ctx) {
  const { T, sim, assets, kit, quality, scene, zoneGroup } = ctx;
  const path = "/assets/hash-wars/rocks/basalt.glb";
  const root = await assets.load(path);
  const meshes = [],
    resources = [],
    batches = new Map(),
    sources = new Map();
  const dummy = new T.Object3D(),
    colour = new T.Color(),
    rng = random(7136);
  let material;
  if (!root)
    return { update() {}, dispose() {}, stats: { draws: 0, triangles: 0 } };
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!material) material = basaltMaterial(kit, o.material, sim.SEA_Y);
    const geometry = o.geometry.clone();
    o.updateWorldMatrix(true, false);
    geometry.applyMatrix4(o.matrixWorld);
    if (!geometry.attributes.color)
      geometry.setAttribute(
        "color",
        new T.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 3).fill(1),
          3,
        ),
      );
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const size = box.getSize(new T.Vector3());
    geometry.translate(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    );
    // Fracture beds dip across an outcrop. Warp the kit in its local frame,
    // then fit its measured extents back to the solid, including the coarse LOD.
    if (/^(escarpment|boulder)/.test(o.name)) {
      const positions = geometry.attributes.position;
      const normals = geometry.attributes.normal;
      const n = new T.Vector3();
      const relief = Math.min(0.1, 1.35 / size.y);
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          y = positions.getY(i),
          z = positions.getZ(i);
        const phase = x * 0.54 + z * 0.34;
        const wave = Math.sin(phase);
        const crest = 1 - relief * (1 - wave);
        // Shear the profile into a raked face; neighbouring columns retain
        // shared fracture edges. Inverse-transpose keeps their facets lit.
        const shear = 0.12;
        positions.setXYZ(i, x + shear * y, y * crest, z);
        n.fromBufferAttribute(normals, i);
        const dx = y * relief * 0.54 * Math.cos(phase);
        const dz = y * relief * 0.34 * Math.cos(phase);
        const ny = (n.y - shear * n.x) / (crest - shear * dx);
        n.set(n.x - dx * ny, ny, n.z - dz * ny).normalize();
        normals.setXYZ(i, n.x, n.y, n.z);
      }
      geometry.computeBoundingBox();
      const warped = geometry.boundingBox;
      const extent = warped.getSize(new T.Vector3());
      geometry.translate(
        -(warped.min.x + warped.max.x) / 2,
        -warped.min.y,
        -(warped.min.z + warped.max.z) / 2,
      );
      geometry.scale(size.x / extent.x, size.y / extent.y, size.z / extent.z);
    }
    const surface = o.name.startsWith("stair_tread")
      ? 1
      : o.name.startsWith("boulder")
        ? 2
        : formations.some((name) => name && o.name.startsWith(name))
          ? 3
          : 0;
    if (surface === 2) weatherBoulderNormals(T, geometry);
    const surfaces = new Float32Array(geometry.attributes.position.count);
    geometry.setAttribute(
      "rockSurface",
      new T.BufferAttribute(surfaces.fill(surface), 1),
    );
    if (geometry.attributes.uv && !geometry.attributes.uv1)
      geometry.setAttribute("uv1", geometry.attributes.uv);
    let radius = 0;
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i)));
    sources.set(o.name, { geometry, size, radius });
    resources.push(geometry);
  });
  function place(
    name,
    zone,
    x,
    y,
    z,
    width,
    height,
    depth,
    yaw,
    shade,
    casts,
    cylinder = false,
  ) {
    const source = sources.get(name);
    if (!source) return;
    const cell = Math.floor(-z / 48);
    // High/ultra also split batches east-west, so the long gorge walls pick
    // their level of detail by real distance, not only by route distance.
    const column = quality === "low" ? 0 : Math.floor(x / 40);
    const key = [name, zone, cell, column, casts].join(":");
    if (!batches.has(key))
      batches.set(key, { name, zone, casts, items: [], x: 0, z: 0 });
    const batch = batches.get(key);
    batch.items.push({ x, y, z, width, height, depth, yaw, shade, cylinder });
    batch.x += x;
    batch.z += z;
  }
  for (const solid of sim.layout.filter((b) => b.owner === "land")) {
    ctx.claimSolid?.(solid);
    if (solid.shape === "cyl") {
      place(
        solid.asset,
        solid.far ? -1 : solid.zone,
        solid.x,
        solid.y0,
        solid.z,
        solid.r,
        solid.y1 - solid.y0,
        solid.r,
        solid.yaw ?? 0,
        0.85 + rng() * 0.22,
        true,
        true,
      );
    } else {
      const size = solid.max.map((n, i) => n - solid.min[i]);
      const x = (solid.min[0] + solid.max[0]) / 2;
      const z = (solid.min[2] + solid.max[2]) / 2;
      const cliff = ["column-wall", "gorge-wall", "summit-wall"].includes(
        solid.landRole,
      );
      const variant = Math.sin(x * 0.63 + z * 1.29) > 0 ? 0 : 1;
      const family = formations[solid.zone];
      const formation = cliff && family ? family + "_" + variant : solid.asset;
      // Fit the turned mesh back into the same authoritative AABB. This breaks
      // repeated coplanar faces without moving the collision boundary.
      const turn =
        (solid.yaw ?? 0) + (cliff ? Math.sin(x * 1.73 + z * 0.97) * 0.035 : 0);
      // Alternate the splits so the walking stair has no continuous seam.
      // Both pieces fit the existing tread box; collision stays authoritative.
      const alternateTread =
        solid.landRole === "stair-tread" &&
        Math.abs(Math.round((-z - 24) / 0.75)) % 2 === 1 &&
        sources.has("stair_tread_b");
      place(
        alternateTread ? "stair_tread_b" : formation,
        solid.zone,
        x,
        solid.min[1],
        z,
        ...size,
        turn,
        cliff ? 0.92 + rng() * 0.16 : 0.83 + rng() * 0.3,
        // Far gorge masses and the chasm caps skip the shadow pass: their
        // shadows fall where the player never looks closely.
        !["step", "stair-tread", "boulder", "talus", "crown"].includes(
          solid.landRole,
        ) &&
          !(
            solid.landRole === "gorge-wall" &&
            Math.abs(x - centreAt(sim, z)) > 45
          ),
      );
    }
  }
  for (const [i, b] of sim.layout.filter((b) => b.kind === "cover").entries()) {
    const size = b.max.map((v, j) => v - b.min[j]);
    const cx = (b.min[0] + b.max[0]) / 2,
      cz = (b.min[2] + b.max[2]) / 2;
    // Causeway cover sits on its deck, not on the gorge floor below it.
    const supported = b.min[1] - sim.groundY(cx, cz) > 2;
    const base = b.landGrounded
      ? b.min[1]
      : supported
        ? b.min[1] - 0.18
        : Math.min(
            b.min[1] - 0.25,
            ...[b.min[0], b.max[0]].flatMap((x) =>
              [b.min[2], b.max[2]].map((z) => sim.groundY(x, z) - 0.25),
            ),
          );
    place(
      b.rockProfile ?? "boulder_" + (i % 4),
      b.zone,
      (b.min[0] + b.max[0]) / 2,
      base,
      (b.min[2] + b.max[2]) / 2,
      size[0],
      b.max[1] - base,
      size[2],
      0,
      0.92,
      true,
    );
    if (supported && b.zone === 2) {
      // Small spalls at the deck-facing toe expose a broken edge. These stay
      // below step height and on the lane-facing side of the collision hull.
      const side = -Math.sign(cx);
      for (const [offsetX, offsetZ, width, height, yaw] of [
        [1.13, 0.81, 0.54, 0.14, 0.18],
        [1.05, 1.07, 0.34, 0.08, -0.31],
        [0.74, 1.11, 0.26, 0.065, 0.44],
      ])
        place(
          "scree_" + (i % 2),
          b.zone,
          cx + side * offsetX,
          base - 0.016,
          cz + offsetZ,
          width,
          height,
          width * 0.56,
          yaw * side,
          0.99,
          false,
        );
      // The first cover's lane-side collision column reaches past the old
      // rock face. Dress that volume with a fractured rib and its fallen toe.
      // Their tops sit below the measured support along the whole footprint.
      if (b.rockProfile === "boulder_2")
        for (const [offsetX, offsetZ, w, d, h] of [
          [1.27, 0.77, 0.42, 0.47, 0.78],
          [0.9, 0.95, 0.61, 0.29, 0.4],
        ])
          place(
            "scree_1",
            b.zone,
            cx + side * offsetX,
            base - 0.018,
            cz + offsetZ,
            w,
            h,
            d,
            0.06 * side,
            1.05,
            false,
          );
    }
    ctx.claimSolid?.(b);
  }
  // Scree fans are below the legal step height, embedded rather than floating.
  const stones = quality === "ultra" ? 1700 : quality === "high" ? 900 : 320;
  const fans = sim.layout.filter(
    (b) => b.owner === "land" && b.landRole === "talus",
  );
  for (let i = 0; i < stones; i++) {
    if (!fans.length) break;
    const fan = fans[Math.floor(rng() * fans.length)];
    const z = (fan.min[2] + fan.max[2]) / 2 + (rng() + rng() - 1) * 5;
    const s = -z,
      cx = (fan.min[0] + fan.max[0]) / 2;
    const side = cx > centreAt(sim, z) ? 1 : -1;
    const x = cx - side * (rng() * 5 - 1),
      y = sim.groundY(x, z);
    const width = 0.15 + rng() * 0.65;
    const buried = Math.min(
      y,
      ...[-1, 1].flatMap((dx) =>
        [-1, 1].map((dz) =>
          sim.groundY(x + (dx * width) / 2, z + (dz * width) / 2),
        ),
      ),
    );
    place(
      "scree_" + (i % 2),
      sim.ZONES.findIndex((q) => s >= q.s0 && s < q.s1),
      x,
      buried - 0.08,
      z,
      width,
      0.1 + rng() * 0.12,
      width * 0.8,
      rng() * Math.PI * 2,
      0.65 + rng() * 0.5,
      false,
    );
  }
  const pairs = [];
  for (const b of batches.values()) {
    const pair = {
      x: b.x / b.items.length,
      z: b.z / b.items.length,
      far: b.zone < 0,
      zone: b.zone,
      cell: Math.floor(-b.z / b.items.length / 48),
      column: quality === "low" ? 0 : Math.floor(b.x / b.items.length / 40),
      small: b.name.startsWith("scree_"),
    };
    for (const lod of [0, 1]) {
      const source = sources.get(b.name + (lod ? "_lod1" : ""));
      if (!source) continue;
      const mesh = new T.InstancedMesh(
        source.geometry,
        material,
        b.items.length,
      );
      mesh.name = "LAND-ROCK " + b.name + (lod ? " LOD1" : " near");
      mesh.receiveShadow = true;
      mesh.castShadow = b.casts;
      mesh.userData.noSkyVis = !b.casts;
      b.items.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.yaw, 0);
        // Decimation moves extrema. Fit each LOD independently to the same
        // authoritative dimensions rather than reusing the near mesh's scale.
        const c = Math.abs(Math.cos(p.yaw)),
          s = Math.abs(Math.sin(p.yaw));
        const determinant = c * c - s * s;
        const localWidth = (p.width * c - p.depth * s) / determinant;
        const localDepth = (p.depth * c - p.width * s) / determinant;
        let sx, sz;
        if (p.cylinder) {
          sx = sz = p.width / source.radius;
        } else if (
          Math.abs(determinant) > 0.1 &&
          localWidth > 0 &&
          localDepth > 0
        ) {
          sx = localWidth / source.size.x;
          sz = localDepth / source.size.z;
        } else {
          // Small freely turned scree keeps its aspect and fits within the box.
          sx = sz = Math.min(
            p.width / (source.size.x * c + source.size.z * s),
            p.depth / (source.size.x * s + source.size.z * c),
          );
        }
        dummy.scale.set(sx, p.height / source.size.y, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        colour.setRGB(p.shade, p.shade, p.shade);
        mesh.setColorAt(i, colour);
      });
      mesh.computeBoundingSphere();
      mesh.visible = lod === 1;
      (b.zone < 0 ? scene : zoneGroup(b.zone)).add(mesh);
      meshes.push(mesh);
      pair[lod ? "farMesh" : "nearMesh"] = mesh;
    }
    pairs.push(pair);
  }
  // Bake every distant variant into one immutable mesh per zone/cell. Keeping
  // one instance also preserves the same shader as the near variant batches.
  const distant = new Map();
  for (const p of pairs) {
    // Low always draws LOD1, so scree and walls can share the same spatial
    // batch. Higher tiers keep scree separate from the switchable near walls.
    const key = [
      p.zone,
      p.cell,
      p.column,
      quality === "low" ? false : p.small,
    ].join(":");
    if (!distant.has(key))
      distant.set(key, {
        zone: p.zone,
        cell: p.cell,
        x: 0,
        z: 0,
        small: p.small,
        far: p.far,
        parts: [],
        members: [],
      });
    const batch = distant.get(key),
      mesh = p.farMesh;
    batch.members.push(p);
    batch.x += (p.x - batch.x) / batch.members.length;
    batch.z += (p.z - batch.z) / batch.members.length;
    for (let i = 0; i < mesh.count; i++) {
      const matrix = new T.Matrix4();
      mesh.getMatrixAt(i, matrix);
      const part = mesh.geometry.clone().applyMatrix4(matrix);
      mesh.getColorAt(i, colour);
      const colors = part.attributes.color;
      for (let j = 0; j < colors.count; j++)
        colors.setXYZ(j, colour.r, colour.g, colour.b);
      batch.parts.push(part);
    }
    mesh.removeFromParent();
    mesh.dispose();
    meshes.splice(meshes.indexOf(mesh), 1);
  }
  for (const batch of distant.values()) {
    if (quality === "low") {
      const chunks = batch.parts.flatMap((part) =>
        spatialChunks(T, part, 4, { vertical: true, compact: true }),
      );
      batch.parts.forEach((part) => part.dispose());
      const vertices = chunks.reduce(
        (n, g) => n + g.attributes.position.count,
        0,
      );
      const indices = chunks.reduce((n, g) => n + g.index.count, 0);
      const mesh = new T.BatchedMesh(
        chunks.length,
        vertices,
        indices,
        material,
      );
      mesh.name = "LAND-ROCK culled distant basalt";
      mesh.sortObjects = false;
      for (const part of chunks) {
        mesh.addInstance(mesh.addGeometry(part));
        part.dispose();
      }
      mesh.computeBoundingBox();
      mesh.receiveShadow = true;
      mesh.userData.noSkyVis = true;
      mesh.userData.rockZone = batch.zone;
      (batch.zone < 0 ? scene : zoneGroup(batch.zone)).add(mesh);
      batch.mesh = mesh;
      meshes.push(mesh);
      continue;
    }
    const merged = new T.BufferGeometry();
    for (const name of [
      "position",
      "normal",
      "uv",
      "uv1",
      "color",
      "rockSurface",
    ]) {
      const first = batch.parts[0].attributes[name];
      if (!first) continue;
      const data = new Float32Array(
        batch.parts.reduce((n, g) => n + g.attributes[name].array.length, 0),
      );
      let offset = 0;
      for (const g of batch.parts) {
        data.set(g.attributes[name].array, offset);
        offset += g.attributes[name].array.length;
      }
      merged.setAttribute(name, new T.BufferAttribute(data, first.itemSize));
    }
    const indices = [];
    let offset = 0;
    for (const g of batch.parts) {
      for (const i of g.index.array) indices.push(i + offset);
      offset += g.attributes.position.count;
      g.dispose();
    }
    merged.setIndex(indices);
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    resources.push(merged);
    const mesh = new T.InstancedMesh(merged, material, 1);
    mesh.name = "LAND-ROCK merged distant basalt";
    mesh.setMatrixAt(0, new T.Matrix4());
    mesh.setColorAt(0, new T.Color(1, 1, 1));
    mesh.receiveShadow = true;
    // The continuous terrain caster already supplies the bank silhouette.
    mesh.castShadow = false;
    mesh.userData.noSkyVis = true;
    mesh.userData.rockZone = batch.zone;
    (batch.zone < 0 ? scene : zoneGroup(batch.zone)).add(mesh);
    batch.mesh = mesh;
    meshes.push(mesh);
  }
  for (const p of pairs) p.nearMesh.userData.rockZone = p.zone;
  const count = (m) =>
    ((m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3) *
    (m.isBatchedMesh ? 1 : m.count);
  const stats = {
    quality,
    instances: [...batches.values()].reduce((n, b) => n + b.items.length, 0),
    draws: meshes.length,
    triangles: meshes.reduce((n, m) => n + count(m), 0),
    perZone: sim.ZONES.map((_, zone) => ({
      zone,
      draws: meshes.filter(
        (m) =>
          m.userData.rockZone < 0 || Math.abs(m.userData.rockZone - zone) <= 1,
      ).length,
    })),
  };
  const frustum = new T.Frustum(),
    projection = new T.Matrix4();
  return {
    stats,
    update({ camera }) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(
        projection.multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        ),
      );
      for (const batch of distant.values()) {
        const near =
          quality !== "low" &&
          !batch.far &&
          !batch.small &&
          Math.abs(camera.position.z + (batch.cell + 0.5) * 48) < 48 &&
          Math.hypot(camera.position.x - batch.x, camera.position.z - batch.z) <
            62;
        batch.mesh.visible =
          !near &&
          frustum.intersectsBox(
            batch.mesh.boundingBox ?? batch.mesh.geometry.boundingBox,
          );
        for (const p of batch.members) p.nearMesh.visible = near;
      }
    },
    dispose() {
      meshes.forEach((m) => {
        m.removeFromParent();
        m.dispose();
      });
      resources.forEach((g) => g.dispose());
      material.dispose();
    },
  };
}
