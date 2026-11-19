import { renderGroundY } from "./land-terrain.js";

// Shared planting rules. LAND can use this mask and the linear grass palette to
// match its distant sward. Roots follow LAND; exclusions use the live sim.
export const MEADOW_COLOURS = {
  lush: [0.085, 0.18, 0.025],
  pale: [0.23, 0.31, 0.067],
  dry: [0.34, 0.29, 0.12],
};
export function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function hash(x, z, seed = 0) {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
export function planting(sim, x, z, terrain) {
  const h = 0.25;
  const y = terrain?.y ?? sim.groundY(x, z);
  const dx =
    terrain?.dx ?? (sim.groundY(x + h, z) - sim.groundY(x - h, z)) / (2 * h);
  const dz =
    terrain?.dz ?? (sim.groundY(x, z + h) - sim.groundY(x, z - h)) / (2 * h);
  const s = -z,
    routeX = sim.at(s).x,
    pathDistance = Math.abs(x - routeX);
  const slope = Math.hypot(dx, dz);
  const coveEnd = sim.ZONES[0].s1,
    causeway = sim.ZONES[2];
  const summitEnd = sim.ZONES[sim.ZONES.length - 1].s1;
  let mask =
    smooth(coveEnd - 42, coveEnd - 18, s) *
    (1 - smooth(summitEnd + 2, summitEnd + 14, s));
  mask *= smooth(sim.SEA_Y + 2, sim.SEA_Y + 5, y);
  mask *= 1 - smooth(0.48, 0.88, slope);
  // Worn wheel ruts leave a narrow cropped centre and broken shoulder turf.
  mask *= Math.max(
    smooth(1.45, 2.8, pathDistance),
    (1 - smooth(0.2, 0.48, pathDistance)) * 0.32,
  );
  const service = smooth(60, 66, s) * (1 - smooth(125, 133, s));
  mask *= 1 - service * (1 - smooth(2, 4.2, Math.abs(x - routeX + 14)));
  if (pavedAt(x, z)) mask = 0;
  // A bridge spans bare gorge. Its deck is in layout, never in groundY.
  mask *=
    1 -
    smooth(causeway.s0 - 2, causeway.s0 + 8, s) *
      (1 - smooth(causeway.s1 - 15, causeway.s1 + 3, s));
  mask *= smooth(0.35, 1.8, riverMargin(sim, x, z));
  // Paths and fights are cropped, not a tall wall of cover hiding pickups.
  const crop = 0.4 + 0.6 * smooth(3, 13, pathDistance);
  return { y, dx, dz, mask, crop };
}

// Signed distance outside the exported full wet channel.
export function riverMargin(sim, x, z) {
  let margin = Infinity;
  for (let i = 1; i < sim.river.length; i++) {
    const a = sim.river[i - 1],
      b = sim.river[i];
    const vx = b.x - a.x,
      vz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)),
    );
    const d = Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
    margin = Math.min(margin, d - (a.width + (b.width - a.width) * t) / 2);
  }
  return margin;
}

// STATIONS' terrain-following apron extents (including the last 2 m tile).
// These render-only tiles currently have no layout solid. Keep vegetation off
// the whole apron, including skipped steep tiles, until layout publishes them.
const APRONS = [
  [-11, 13, -145, -123],
  [-23, 23, -304, -254],
  [-28, 28, -389, -353],
  [-8, 12, -436, -418],
];
export function pavedAt(x, z, pad = 0.55) {
  for (const [x0, x1, z0, z1] of APRONS)
    if (x >= x0 - pad && x <= x1 + pad && z >= z0 - pad && z <= z1 + pad)
      return true;
  return false;
}

export function occupied(sim, x, z, pad = 0.4) {
  const ground = sim.groundY(x, z) + 0.55;
  return (
    pavedAt(x, z, pad) ||
    sim.layout.some(
      (b) =>
        (b.shape === "cyl" ? b.y0 : b.min[1]) <= ground &&
        (b.shape === "cyl"
          ? Math.hypot(x - b.x, z - b.z) < b.r + pad
          : x > b.min[0] - pad &&
            x < b.max[0] + pad &&
            z > b.min[2] - pad &&
            z < b.max[2] + pad),
    )
  );
}

// Four channels: height, cover/cropping, terrain dx, terrain dz. The same field
// is used for both grass rings, so roots and exclusions cannot drift apart.
export function buildField(T, sim) {
  const width = 512,
    height = 1536,
    bounds = new T.Vector4(-90, -460, 180, 480);
  const data = new Float32Array(width * height * 4);
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const x = bounds.x + ((i + 0.5) / width) * bounds.z;
      const z = bounds.y + ((j + 0.5) / height) * bounds.w;
      data[(j * width + i) * 4] = renderGroundY(sim, x, z);
    }
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const x = bounds.x + ((i + 0.5) / width) * bounds.z;
      const z = bounds.y + ((j + 0.5) / height) * bounds.w,
        k = (j * width + i) * 4;
      const i0 = Math.max(0, i - 1),
        i1 = Math.min(width - 1, i + 1);
      const j0 = Math.max(0, j - 1),
        j1 = Math.min(height - 1, j + 1);
      const dx =
        (data[(j * width + i1) * 4] - data[(j * width + i0) * 4]) /
        (((i1 - i0) * bounds.z) / width);
      const dz =
        (data[(j1 * width + i) * 4] - data[(j0 * width + i) * 4]) /
        (((j1 - j0) * bounds.w) / height);
      const p = planting(sim, x, z, { y: data[k], dx, dz });
      data[k + 1] = p.mask * p.crop;
      data[k + 2] = dx;
      data[k + 3] = dz;
    }
  // Rasterize authoritative solid footprints, including anything added by the
  // structure worker, rather than copying its station/pipeline dimensions.
  for (const b of sim.layout) {
    const pad = 0.45;
    const x0 = b.shape === "cyl" ? b.x - b.r : b.min[0];
    const x1 = b.shape === "cyl" ? b.x + b.r : b.max[0];
    const z0 = b.shape === "cyl" ? b.z - b.r : b.min[2];
    const z1 = b.shape === "cyl" ? b.z + b.r : b.max[2];
    const i0 = Math.max(
      0,
      Math.floor(((x0 - pad - bounds.x) / bounds.z) * width),
    );
    const i1 = Math.min(
      width - 1,
      Math.ceil(((x1 + pad - bounds.x) / bounds.z) * width),
    );
    const j0 = Math.max(
      0,
      Math.floor(((z0 - pad - bounds.y) / bounds.w) * height),
    );
    const j1 = Math.min(
      height - 1,
      Math.ceil(((z1 + pad - bounds.y) / bounds.w) * height),
    );
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = bounds.x + ((i + 0.5) / width) * bounds.z;
        const z = bounds.y + ((j + 0.5) / height) * bounds.w;
        if (
          (b.shape === "cyl" ? b.y0 : b.min[1]) >
          data[(j * width + i) * 4] + 0.55
        )
          continue;
        if (b.shape !== "cyl" || Math.hypot(x - b.x, z - b.z) < b.r + pad)
          data[(j * width + i) * 4 + 1] = 0;
      }
  }
  const texture = new T.DataTexture(
    data,
    width,
    height,
    T.RGBAFormat,
    T.FloatType,
  );
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return {
    texture,
    bounds,
    sample(x, z) {
      const i = Math.floor(((x - bounds.x) / bounds.z) * width);
      const j = Math.floor(((z - bounds.y) / bounds.w) * height);
      return i < 0 || i >= width || j < 0 || j >= height
        ? 0
        : data[(j * width + i) * 4 + 1];
    },
  };
}
