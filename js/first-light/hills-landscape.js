import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { leafTexture } from "./hills-oak.js";
import { height, random } from "./hills.js";
import { surface } from "./surfaces.js";

// All dressings are outside the walled playable corridor. Field boundaries
// follow the same warped parcel grid as the ground shader.
export function dressLandscape({ T, sim, kit, quality }, group) {
  const rng = random(813),
    dummy = new T.Object3D(),
    colour = new T.Color();
  const hedgePoints = [],
    crowns = [],
    trunks = [],
    buildings = [];
  for (let row = -9; row < -2; row++)
    for (let col = -6; col < 7; col++) {
      if (col === 0) continue;
      const steps = quality === "low" ? 10 : 20;
      for (let k = 0; k < steps; k++) {
        const z = row * 68 + (k * 68) / steps,
          x = col * 52 - Math.sin(z * 0.006) * 15;
        if (Math.abs(x - 20) < 30) continue;
        hedgePoints.push([
          x,
          height(sim, x, z) + 0.7,
          z,
          1.2 + rng(),
          0.7 + rng() * 0.6,
          (68 / steps) * 0.72,
        ]);
      }
      for (let k = 0; k < steps * 0.7; k++) {
        const x = col * 52 + (k * 52) / (steps * 0.7),
          z = row * 68 - Math.sin(x * 0.01) * 12;
        if (Math.abs(x - 20) > 30)
          hedgePoints.push([
            x,
            height(sim, x, z) + 0.65,
            z,
            (52 / (steps * 0.7)) * 0.74,
            0.65 + rng() * 0.4,
            1.3,
          ]);
      }
      if (rng() < 0.4) {
        const x = col * 52 + 15,
          z = row * 68 + 20;
        for (let k = 0; k < 7; k++) {
          const xx = x + (rng() - 0.5) * 18,
            zz = z + (rng() - 0.5) * 18,
            y = height(sim, xx, zz);
          crowns.push([
            xx,
            y + 3 + rng() * 2,
            zz,
            2.4 + rng() * 2,
            2 + rng() * 2,
            2.7 + rng() * 2,
          ]);
          trunks.push([xx, y + 2, zz, 0.22, 4, 0.22]);
        }
      }
    }
  function instances(points, geo, mat, name, variance = 0.2) {
    const mesh = new T.InstancedMesh(geo, mat, points.length);
    mesh.name = name;
    points.forEach((p, i) => {
      dummy.position.set(p[0], p[1], p[2]);
      dummy.scale.set(p[3], p[4], p[5]);
      dummy.rotation.set(0, rng() * 0.4, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const shade = 0.8 + rng() * variance;
      colour.setRGB(shade, shade, shade * 0.9);
      mesh.setColorAt(i, colour);
    });
    mesh.userData.noReflect =
      name.includes("hedgerows") || name.includes("clumps");
    mesh.userData.noSkyVis =
      name.includes("hedgerows") || name.includes("clumps");
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const { texture, normalMap } = leafTexture(T);
  group.userData.foliageTextures = [texture, normalMap];
  const cluster = kit.material({
    color: 0xffffff,
    map: texture,
    normalMap,
    normalScale: new T.Vector2(0.1, 0.1),
    alphaTest: 0.42,
    side: T.DoubleSide,
    roughness: 0.93,
    alphaToCoverage: quality === "ultra",
  });
  const hedgeMaterial = kit.material({
    map: texture,
    color: 0x8c996c,
    alphaTest: 0.42,
    side: T.DoubleSide,
    roughness: 0.94,
  });
  const hedgeCards = new T.PlaneGeometry(2, 2);
  const hedgeUV = hedgeCards.attributes.uv;
  for (let i = 0; i < hedgeUV.count; i++)
    hedgeUV.setXY(i, hedgeUV.getX(i) * 0.5, hedgeUV.getY(i) * 0.5);
  // Four leaf faces around a dark, smooth core avoid either flat hedge strips
  // or exposed low-poly boulders. Still two instanced draws for the whole hedge.
  const cards = Array.from({ length: 4 }, (_, i) =>
    hedgeCards.clone().rotateY((i * Math.PI) / 4),
  );
  const hedge = instances(
    hedgePoints,
    mergeGeometries(cards),
    hedgeMaterial,
    "HILLS distant hedgerows",
  );
  cards.forEach((g) => g.dispose());
  hedgeCards.dispose();
  const core = new T.OctahedronGeometry(0.76, 0);
  const coreNormals = core.attributes.normal,
    positions = core.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const n = new T.Vector3().fromBufferAttribute(positions, i).normalize();
    coreNormals.setXYZ(i, n.x, n.y, n.z);
  }
  const cross = instances(
    hedgePoints,
    core,
    kit.material({ color: 0x34452a, roughness: 1 }),
    "HILLS distant hedgerows core",
  );
  hedge.userData.noSkyVis = cross.userData.noSkyVis = true;
  const base = cluster.onBeforeCompile;
  cluster.onBeforeCompile = (s, r) => {
    base.call(cluster, s, r);
    s.vertexShader =
      "attribute vec3 groveNormal;attribute float groveTile;\n" +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <defaultnormal_vertex>",
      "#include <defaultnormal_vertex>\ntransformedNormal=normalMatrix*groveNormal;",
    );
    s.vertexShader = s.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
vMapUv=(uv+vec2(mod(groveTile,2.),floor(groveTile/2.)))*.5;
vNormalMapUv=vMapUv;`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      T.ShaderChunk.normal_fragment_begin.replace(
        "normal *= faceDirection;",
        "",
      ),
    );
  };
  cluster.customProgramCacheKey = () => "hills-grove-clusters";
  const perCrown = quality === "low" ? 16 : 40,
    count = crowns.length * perCrown,
    geo = new T.PlaneGeometry(1, 1);
  const normals = new Float32Array(count * 3),
    tiles = new Float32Array(count);
  const grove = new T.InstancedMesh(geo, cluster, count),
    outward = new T.Vector3();
  grove.userData.noSkyVis = true;
  crowns.forEach((p, j) => {
    for (let k = 0; k < perCrown; k++) {
      const a = rng() * Math.PI * 2,
        v = rng() * 2 - 1,
        r = Math.cbrt(rng()),
        flat = Math.sqrt(1 - v * v);
      outward.set(Math.cos(a) * flat, v, Math.sin(a) * flat);
      dummy.position.set(
        p[0] + outward.x * r * p[3],
        p[1] + outward.y * r * p[4],
        p[2] + outward.z * r * p[5],
      );
      dummy.rotation.set(rng() * Math.PI, rng() * 6.28, rng() * Math.PI);
      dummy.scale.setScalar(quality === "low" ? 2.1 : 1.7);
      dummy.updateMatrix();
      const i = j * perCrown + k;
      grove.setMatrixAt(i, dummy.matrix);
      outward.y += 0.35;
      outward.normalize();
      normals.set(outward.toArray(), i * 3);
      tiles[i] = i % 4;
      colour.setScalar(0.58 + r * 0.42);
      grove.setColorAt(i, colour);
    }
  });
  geo.setAttribute("groveNormal", new T.InstancedBufferAttribute(normals, 3));
  geo.setAttribute("groveTile", new T.InstancedBufferAttribute(tiles, 1));
  grove.userData.noReflect = true;
  grove.receiveShadow = true;
  grove.name = "HILLS field tree clusters";
  group.add(grove);
  instances(
    trunks,
    new T.BoxGeometry(1, 1, 1),
    surface(kit, "bark", { scale: 1 }),
    "HILLS distant trunks",
  );
  for (const [x, z] of [
    [-83, -318],
    [175, -365],
    [118, -552],
  ]) {
    const y = height(sim, x, z);
    buildings.push([x, y + 1.9, z, 9, 3.8, 5.5]);
    // A pitched roof, deliberately a single merged primitive per farm.
    const roofGeo = new T.BufferGeometry();
    roofGeo.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        [-5, 0, -3, 5, 0, -3, 0, 2, -3, -5, 0, 3, 5, 0, 3, 0, 2, 3],
        3,
      ),
    );
    roofGeo.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 2, 5, 4, 2, 4, 1]);
    roofGeo.computeVertexNormals();
    const roof = new T.Mesh(
      roofGeo,
      surface(kit, "rock", { scale: 1.2, tint: 0x7c8589 }),
    );
    roof.position.set(x, y + 3.8, z);
    group.add(roof);
  }
  instances(
    buildings,
    new T.BoxGeometry(1, 1, 1),
    surface(kit, "plaster", { scale: 2, tint: 0xc3baa1 }),
    "HILLS farms",
  );
  const p = [],
    index = [];
  for (let i = 0; i <= 180; i++) {
    const z = -165 - i * 3,
      x = 88 + Math.sin(z * 0.013) * 22,
      y = -1 + (-z - 160) * 0.008 + 0.08;
    p.push(x - 1.3, y, z, x + 1.3, y, z);
    if (i < 180) {
      const n = i * 2;
      index.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  const streamGeo = new T.BufferGeometry();
  streamGeo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  streamGeo.setIndex(index);
  streamGeo.computeVertexNormals();
  const water = kit.material({
    color: 0x535f5c,
    metalness: 0.35,
    roughness: 0.08,
  });
  const stream = new T.Mesh(streamGeo, water);
  stream.name = "HILLS valley stream (sky probe reflection)";
  group.add(stream);
}
