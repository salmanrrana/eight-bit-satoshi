import { distantMaterial } from "./land-materials.js";
import { smooth } from "./land-terrain.js";

// Build-time erosion fields: broad, nonperiodic variation without texture assets.
function noise2(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    u = smooth(0, 1, x - ix),
    v = smooth(0, 1, z - iz);
  const hash = (a, b) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const a = hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u,
    b = hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u;
  return a * (1 - v) + b * v;
}
/** Fixed kilometre-scale land, lit by the same noon sun as the route.
 * No camera-following scenery: ridges retain their real separation and parallax. */
export function buildBackdrop({ T, scene, kit, quality }, air) {
  const group = new T.Group(),
    geometries = [];
  group.name = "LAND distant volcanic highland";
  group.userData.noSkyVis = true;
  const material = distantMaterial(kit, air);
  function sheet(name, x0, x1, z0, z1, nx, nz, height, colour) {
    const p = [],
      n = [],
      c = [],
      index = [];
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx,
          z = z0 + ((z1 - z0) * j) / nz,
          y = height(x, z);
        const d = Math.max((x1 - x0) / nx, (z1 - z0) / nz) * 0.55;
        const normal = new T.Vector3(
          -(height(x + d, z) - height(x - d, z)) / (2 * d),
          1,
          -(height(x, z + d) - height(x, z - d)) / (2 * d),
        ).normalize();
        p.push(
          ...(name === "Gullied snow volcano"
            ? [x * 0.55, y * 0.55, z * 0.55]
            : [x, y, z]),
        );
        n.push(...normal.toArray());
        c.push(...colour(x, y, z, normal));
        if (i < nx && j < nz) {
          const a = j * (nx + 1) + i;
          index.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
        }
      }
    // Bury every sheet edge below the sea so oblique views cannot see sky
    // through a clipped hillside. Shared top vertices keep the join closed.
    const edges = [];
    for (let i = 0; i <= nx; i++) edges.push(i);
    for (let j = 1; j <= nz; j++) edges.push(j * (nx + 1) + nx);
    for (let i = nx - 1; i >= 0; i--) edges.push(nz * (nx + 1) + i);
    for (let j = nz - 1; j > 0; j--) edges.push(j * (nx + 1));
    const start = p.length / 3;
    edges.forEach((a, k) => {
      p.push(p[a * 3], -120, p[a * 3 + 2]);
      n.push(n[a * 3], n[a * 3 + 1], n[a * 3 + 2]);
      c.push(c[a * 3], c[a * 3 + 1], c[a * 3 + 2]);
      const next = (k + 1) % edges.length;
      index.push(
        a,
        start + k,
        edges[next],
        edges[next],
        start + k,
        start + next,
      );
      index.push(
        a,
        edges[next],
        start + k,
        edges[next],
        start + next,
        start + k,
      );
    });
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(n, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(c, 3));
    g.setIndex(index);
    const mesh = new T.Mesh(g, material);
    mesh.name = name;
    mesh.userData.noSkyVis = true;
    group.add(mesh);
    geometries.push(g);
  }
  const density =
    quality === "low" || quality === "auto"
      ? 0.38
      : quality === "high"
        ? 0.7
        : 1;
  for (let layer = 0; layer < 3; layer++) {
    const zz = -800 - layer * 640;
    const ridge = (x, z) => {
      const cross = (z - zz) / (190 + layer * 70),
        envelope = Math.exp(-cross * cross),
        folds =
          0.5 +
          0.28 * Math.sin(x * 0.009 + layer * 3) +
          0.13 * Math.sin(x * 0.023 - z * 0.003) +
          0.09 * Math.cos(x * 0.047),
        saddle = 0.55 + 0.45 * Math.min(1, Math.abs(x + 250) / 550),
        gully =
          Math.abs(Math.sin(x * 0.037 + z * 0.011 + Math.sin(x * 0.006))) ** 8;
      return (
        -30 +
        envelope *
          ((210 + layer * 110) * folds * saddle - gully * (13 + layer * 6))
      );
    };
    sheet(
      "Highland ridge " + layer,
      -2300,
      2300,
      zz - 370,
      zz + 330,
      Math.ceil(190 * density),
      Math.ceil(45 * density),
      ridge,
      (x, y, z, normal) => {
        const mineral = 0.5 + 0.5 * Math.sin(x * 0.027 + z * 0.017),
          snow =
            Math.max(
              0,
              Math.min(1, (y - 165 - layer * 42 + mineral * 30) / 45),
            ) * Math.max(0, Math.min(1, (normal.y - 0.55) * 3));
        return [
          0.08 + mineral * 0.035 + snow * 0.62,
          0.105 + mineral * 0.035 + snow * 0.62,
          0.112 + mineral * 0.035 + snow * 0.62,
        ];
      },
    );
  }
  const vx = -440,
    vz = -2050;
  // Stratovolcano: radial ribs of old lava between deep ravines, a notched
  // crater, and snow that lies in the ravines and on gentle shoulders while
  // the sharp dark ribs stay bare.
  const ribs = (x, z) => {
    const dx = x - vx,
      dz = z - vz,
      r = Math.hypot(dx, dz * 1.05),
      angle = Math.atan2(dz, dx),
      warp =
        noise2(x * 0.004, z * 0.004) * 2.2 + noise2(x * 0.011, z * 0.011) * 0.8;
    const a = angle * 14 + warp * 1.2 + r * 0.0016;
    // Ridged: sharp crests (1) and broad rounded troughs (0).
    const crest = 1 - Math.abs(Math.sin(a * 0.5)),
      fine = 1 - Math.abs(Math.sin(angle * 29 + warp * 2 + r * 0.004));
    return { r, angle, crest: crest ** 1.3, fine: fine ** 3 };
  };
  const volcano = (x, z) => {
    const { r, angle, crest, fine } = ribs(x, z),
      warpedRadius =
        r * (0.94 + 0.055 * Math.sin(angle * 3) + 0.035 * Math.sin(angle * 7)),
      flank = Math.max(0, 1 - warpedRadius / 1100),
      // Ribs fade out on the low apron and inside the crater.
      relief = Math.sin(Math.min(1, r / 1050) * Math.PI) * smooth(70, 190, r),
      notch =
        Math.exp(-(((angle - 0.9) / 0.32) ** 2)) *
        Math.exp(-(((r - 80) / 60) ** 2));
    return (
      -22 +
      1050 * flank ** 1.35 +
      (crest * 65 + fine * 10 - 24) * relief +
      (noise2(x * 0.022, z * 0.022) - 0.5) * 26 * flank -
      78 * Math.exp(-((r / 78) ** 2)) +
      22 * Math.exp(-(((r - 95) / 22) ** 2)) -
      notch * 55
    );
  };
  sheet(
    "Gullied snow volcano",
    vx - 1180,
    vx + 1180,
    vz - 1170,
    vz + 1170,
    Math.ceil(190 * density),
    Math.ceil(180 * density),
    volcano,
    (x, y, z, normal) => {
      const { r, crest, fine } = ribs(x, z),
        snowline = 520 + noise2(x * 0.01, z * 0.01) * 160 - (1 - crest) * 90,
        snow =
          smooth(snowline, snowline + 60, y) *
          smooth(0.35, 0.7, normal.y) *
          (1 - smooth(0.14, 0.5, crest * 0.8 + fine * 0.4)),
        ash = smooth(60, 150, r),
        rock = 0.008 + crest * 0.012 + noise2(x * 0.03, z * 0.03) * 0.008,
        rust = smooth(0.55, 0.8, noise2(x * 0.006 + 3, z * 0.006)) * 0.008,
        s = snow * ash;
      return [
        rock + rust + s * 0.74,
        rock + rust * 0.6 + s * 0.76,
        rock + 0.006 + s * 0.79,
      ];
    },
  );
  // WATER's existing pooled vapour draws the moving crater plume. The outlet
  // comes from this exact summit, so the smoke remains seated after reshaping.
  group.userData.volcanoOutlet = {
    x: vx * 0.55,
    y: (volcano(vx, vz) + 5) * 0.55,
    z: vz * 0.55,
  };
  // All four distant land pieces share one material and one draw.
  const merged = new T.BufferGeometry();
  for (const name of ["position", "normal", "color"]) {
    const size = geometries.reduce(
      (n, g) => n + g.attributes[name].array.length,
      0,
    );
    const data = new Float32Array(size);
    let offset = 0;
    for (const g of geometries) {
      data.set(g.attributes[name].array, offset);
      offset += g.attributes[name].array.length;
    }
    merged.setAttribute(name, new T.BufferAttribute(data, 3));
  }
  const index = new Uint32Array(
    geometries.reduce((n, g) => n + g.index.count, 0),
  );
  let vertexOffset = 0,
    indexOffset = 0;
  for (const g of geometries) {
    for (const i of g.index.array) index[indexOffset++] = i + vertexOffset;
    vertexOffset += g.attributes.position.count;
    g.dispose();
  }
  merged.setIndex(new T.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  geometries.length = 0;
  geometries.push(merged);
  group.clear();
  const skyline = new T.Mesh(merged, material);
  skyline.name = "Highland ridges and volcano";
  skyline.userData.noSkyVis = true;
  group.add(skyline);
  scene.add(group);
  return {
    group,
    update() {},
    dispose() {
      geometries.forEach((g) => g.dispose());
      group.removeFromParent();
    },
  };
}
