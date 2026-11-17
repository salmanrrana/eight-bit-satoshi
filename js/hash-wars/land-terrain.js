export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export function random(seed = 1741) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Route data drives the material track and keeps placements off the fighting lane. */
export function centreAt(sim, z) {
  const points = sim.route;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (z >= b[1])
      return a[0] + (b[0] - a[0]) * clamp((z - a[1]) / (b[1] - a[1]));
  }
  return points[points.length - 1][0];
}

/** The dry terrain follows the sim everywhere. Kilometre-scale relief belongs
 * to the separate backdrop meshes; only the unreachable offshore bed extends
 * the mathematical headlands below WATER's horizon. */
export function landscapeY(sim, x, z) {
  const y = sim.groundY(x, z),
    offshore = smooth(30, 120, z);
  return y * (1 - offshore) + (sim.SEA_Y - 12) * offshore;
}

function coordinates(a, b, step, farA, farB) {
  const values = [];
  let d = step,
    v = a;
  while (v > farA) {
    v = Math.max(farA, v - d);
    values.push(v);
    d *= 1.18;
  }
  values.reverse();
  for (v = a; v < b - 0.0001; v += step) values.push(v);
  values.push(b);
  d = step;
  v = b;
  while (v < farB) {
    v = Math.min(farB, v + d);
    values.push(v);
    d *= 1.18;
  }
  return values;
}

/** A smooth, bounded render-only skin. Built footprints keep their exact footing. */
export function fineRelief(x, z, lane, up) {
  const rough =
    Math.sin(x * 2.13 + Math.sin(z * 1.71)) *
      Math.sin(z * 2.67 - x * 0.73) *
      0.056 +
    Math.sin(x * 0.81 + z * 1.19) * 0.044;
  const track = (1 - smooth(1.35, 2.8, Math.abs(lane))) * smooth(24, 62, -z);
  const rut = Math.exp(-(((Math.abs(lane) - 0.85) / 0.29) ** 2)) * track;
  const crown = Math.exp(-((lane / 0.43) ** 2)) * track;
  return clamp(
    (rough * (1 - track * 0.45) - rut * 0.052 + crown * 0.034) *
      smooth(0.35, 0.75, up),
    -0.145,
    0.145,
  );
}

const renderGrids = new WeakMap();

function cellAt(values, v) {
  let lo = 0,
    hi = values.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** WATER's wet film samples the actual built skin, including its triangle
 * interpolation and protected footprints. Embedded pebbles remain above the
 * film. With LAND disabled there is no skin: fall back to bare scenic ground. */
export function renderGroundY(sim, x, z) {
  const grid = renderGrids.get(sim);
  if (!grid) return landscapeY(sim, x, z);
  const { xs, zs, heights } = grid;
  if (x < xs[0] || x > xs.at(-1) || z < zs[0] || z > zs.at(-1))
    return landscapeY(sim, x, z);
  const i = cellAt(xs, x),
    j = cellAt(zs, z),
    nx = xs.length,
    tx = (x - xs[i]) / (xs[i + 1] - xs[i]),
    tz = (z - zs[j]) / (zs[j + 1] - zs[j]),
    a = heights[j * nx + i],
    b = heights[j * nx + i + 1],
    c = heights[(j + 1) * nx + i],
    d = heights[(j + 1) * nx + i + 1];
  return tx + tz <= 1
    ? a + tx * (b - a) + tz * (c - a)
    : d + (1 - tx) * (c - d) + (1 - tz) * (b - d);
}

/** One shared grid: fine around the walking lane, coarser on banks and far land.
 * Pebbles join the same draw and stay below the 15 cm cosmetic-relief limit. */
export function terrainGeometry(T, sim, quality) {
  const low = quality !== "ultra" && quality !== "high";
  const step = low ? 2.4 : quality === "high" ? 1.3 : 0.8;
  const xs = [
      ...coordinates(-65, 65, step * 1.5, -1250, 1250).filter(
        (x) => Math.abs(x) > 15,
      ),
      ...coordinates(
        -15,
        15,
        low ? 1.4 : quality === "high" ? 0.8 : 0.45,
        -15,
        15,
      ),
    ]
      .sort((a, b) => a - b)
      .map(Math.fround),
    zs = coordinates(-450, 32, step, -1500, 450).map(Math.fround);
  const nx = xs.length,
    nz = zs.length,
    p = [],
    n = [],
    place = [],
    uv = [],
    soil = [],
    indices = [];
  // The margin also covers triangles crossing a built footprint boundary.
  const protection = step * 1.6;
  // Spatial bins keep exclusion of station paving/steps cheap at build time.
  const built = new Map();
  for (const b of sim.layout) {
    if (
      b.shape !== "box" ||
      (b.owner === "land" &&
        b.landRole !== "step" &&
        b.landRole !== "stair-tread")
    )
      continue;
    for (
      let x = Math.floor((b.min[0] - protection) / 8);
      x <= Math.floor((b.max[0] + protection) / 8);
      x++
    )
      for (
        let z = Math.floor((b.min[2] - protection) / 8);
        z <= Math.floor((b.max[2] + protection) / 8);
        z++
      ) {
        const key = x + ":" + z;
        if (!built.has(key)) built.set(key, []);
        built.get(key).push(b);
      }
  }
  function protectedAt(x, z) {
    return (built.get(Math.floor(x / 8) + ":" + Math.floor(z / 8)) ?? []).some(
      (b) =>
        x >= b.min[0] - protection &&
        x <= b.max[0] + protection &&
        z >= b.min[2] - protection &&
        z <= b.max[2] + protection,
    );
  }
  function skinRelief(x, z, up) {
    const lane = x - centreAt(sim, z) + Math.sin(z * 0.14) * 0.25;
    let relief = fineRelief(x, z, lane, up);
    const pod = sim.entities.pod,
      r = Math.hypot(x - pod.x, z - pod.z);
    if (r < 9) {
      const rim =
        0.14 * Math.exp(-(((r - 4.6) / 0.65) ** 2)) -
        0.04 * Math.exp(-((r / 2.6) ** 2));
      relief += rim;
    }
    return clamp(relief, -0.145, 0.145);
  }
  const heights = new Float32Array(nx * nz),
    slopes = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = xs[i],
        z = zs[j],
        dx = (sim.groundY(x + 0.4, z) - sim.groundY(x - 0.4, z)) / 0.8,
        dz = (sim.groundY(x, z + 0.4) - sim.groundY(x, z - 0.4)) / 0.8,
        up = 1 / Math.hypot(dx, 1, dz);
      slopes[j * nx + i] = up;
      const relief = protectedAt(x, z) ? 0 : skinRelief(x, z, up);
      heights[j * nx + i] = landscapeY(sim, x, z) + relief;
    }
  for (let j = 0; j < nz; j++) {
    const centre = centreAt(sim, zs[j]);
    for (let i = 0; i < nx; i++) {
      const x = xs[i],
        z = zs[j],
        left = Math.max(0, i - 1),
        right = Math.min(nx - 1, i + 1),
        back = Math.max(0, j - 1),
        front = Math.min(nz - 1, j + 1);
      // Shared neighbour heights give smooth normals at this cell's own scale;
      // the height field is evaluated only once per vertex during loading.
      const dx =
        -(heights[j * nx + right] - heights[j * nx + left]) /
        (xs[right] - xs[left]);
      const dz =
        -(heights[front * nx + i] - heights[back * nx + i]) /
        (zs[front] - zs[back]);
      const inv = 1 / Math.hypot(dx, 1, dz);
      p.push(x, heights[j * nx + i], z);
      n.push(dx * inv, inv, dz * inv);
      place.push(x - centre, -z);
      // Equal-distance interpolation avoids bias where the grid spacing changes.
      // Concave hollows retain moisture; convex hummocks dry first.
      const dl = x - xs[left],
        dr = xs[right] - x,
        db = z - zs[back],
        df = zs[front] - z,
        hx =
          (heights[j * nx + left] * dr + heights[j * nx + right] * dl) /
          (dl + dr),
        hz =
          (heights[back * nx + i] * df + heights[front * nx + i] * db) /
          (db + df),
        damp = clamp(0.5 + ((hx + hz) * 0.5 - heights[j * nx + i]) * 2);
      soil.push(slopes[j * nx + i], 0, damp);
      uv.push(x - sim.entities.pod.x, z - sim.entities.pod.z);
      if (i < nx - 1 && j < nz - 1) {
        const a = j * nx + i;
        indices.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    }
  }
  const edges = [];
  for (let i = 0; i < nx; i++) edges.push(i);
  for (let j = 1; j < nz; j++) edges.push(j * nx + nx - 1);
  for (let i = nx - 2; i >= 0; i--) edges.push((nz - 1) * nx + i);
  for (let j = nz - 2; j > 0; j--) edges.push(j * nx);
  const start = p.length / 3;
  edges.forEach((a, k) => {
    p.push(p[a * 3], p[a * 3 + 1] - 120, p[a * 3 + 2]);
    n.push(n[a * 3], n[a * 3 + 1], n[a * 3 + 2]);
    place.push(place[a * 2], place[a * 2 + 1]);
    uv.push(0, 0);
    soil.push(soil[a * 3], 0, soil[a * 3 + 2]);
    const next = (k + 1) % edges.length;
    indices.push(
      a,
      start + k,
      edges[next],
      edges[next],
      start + k,
      start + next,
    );
  });
  renderGrids.set(sim, { xs, zs, heights });
  const rng = random(94173);
  let pebbleCount = 0;
  for (let k = 0; k < (low ? 1800 : quality === "high" ? 4200 : 6500); k++) {
    const shorePocket = k % 6 === 0,
      z = shorePocket ? 10 - rng() * 24 : 14 - rng() * 447,
      centre = centreAt(sim, z),
      x = centre + (rng() - 0.5) * (shorePocket ? 38 : 48),
      y = sim.groundY(x, z);
    if (protectedAt(x, z) || (z < -150 && z > -230) || y < sim.SEA_Y + 0.15)
      continue;
    const dx = (sim.groundY(x + 0.2, z) - sim.groundY(x - 0.2, z)) / 0.4,
      dz = (sim.groundY(x, z + 0.2) - sim.groundY(x, z - 0.2)) / 0.4,
      up = 1 / Math.hypot(dx, 1, dz);
    if (up < 0.85) continue;
    const lane = x - centre,
      beach = y < sim.SEA_Y + 4;
    // Most stones collect at the track shoulders and in irregular washed
    // pockets. Open meadow gets almost none; no even field of black dots.
    const cluster =
      (Math.sin(x * 0.77 + Math.sin(z * 0.42) * 2) *
        Math.sin(z * 0.59 - x * 0.21) +
        1) /
      2;
    const edge = Math.exp(-(((Math.abs(lane) - 2.05) / 0.65) ** 2));
    const tide = Math.exp(-(((y - sim.SEA_Y - 0.65) / 0.7) ** 2));
    if (
      rng() >
      (beach ? 0.12 + tide * 0.75 : 0.012 + edge * 0.75) *
        smooth(0.35, 0.8, cluster)
    )
      continue;
    const radius = 0.045 + rng() ** 1.7 * 0.22,
      h = radius * (0.16 + rng() * 0.23),
      base = p.length / 3,
      turn = rng() * Math.PI * 2;
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 6; i++) {
        const a = turn + (i * Math.PI) / 3,
          r = radius * (j ? 0.48 : 1) * (0.72 + rng() * 0.5),
          xx = x + Math.cos(a) * r,
          zz = z + Math.sin(a) * r;
        const bed = renderGroundY(sim, xx, zz);
        p.push(
          xx,
          clamp(
            y + (j ? h : -0.022) + skinRelief(x, z, up),
            bed - 0.145,
            bed + 0.145,
          ),
          zz,
        );
        n.push(Math.cos(a) * 0.65, j ? 0.8 : 0.4, Math.sin(a) * 0.65);
        uv.push(0, 0);
        place.push(xx - centre, -zz);
        soil.push(up, 1, 0.18 + rng() * 0.7);
        if (!j) {
          const next = (i + 1) % 6;
          indices.push(
            base + i,
            base + next + 6,
            base + next,
            base + i,
            base + i + 6,
            base + next + 6,
          );
        }
      }
    for (let i = 1; i < 5; i++)
      indices.push(base + 6, base + 7 + i, base + 6 + i);
    pebbleCount++;
  }
  // Washed shell fragments and low folded weed strands share the ground draw.
  let debrisCount = 0;
  for (let k = 0; k < (low ? 450 : quality === "high" ? 950 : 1500); k++) {
    const x = (rng() - 0.5) * 36,
      z = 9 - rng() * 34,
      y = renderGroundY(sim, x, z);
    if (protectedAt(x, z) || y < sim.SEA_Y + 0.22 || y > sim.SEA_Y + 1.8)
      continue;
    const tide = Math.exp(-(((y - sim.SEA_Y - 0.95) / 0.45) ** 2));
    if (rng() > tide * 0.75) continue;
    const weed = rng() < 0.68,
      angle = rng() * Math.PI * 2;
    const size = weed ? 0.09 + rng() * 0.23 : 0.025 + rng() * 0.06;
    const colour = rng();
    function debrisVertex(along, across, rise) {
      const xx = x + Math.cos(angle) * along - Math.sin(angle) * across;
      const zz = z + Math.sin(angle) * along + Math.cos(angle) * across;
      p.push(xx, renderGroundY(sim, xx, zz) + 0.006 + rise, zz);
      n.push(0, 1, 0);
      uv.push(xx - sim.entities.pod.x, zz - sim.entities.pod.z);
      place.push(xx - centreAt(sim, zz), -zz);
      soil.push(1, weed ? 3 : 2, colour);
    }
    if (weed) {
      // Narrow, broken kelp ribbons curve and fold on the sand, never tall cards.
      for (let strand = 0; strand < 3; strand++) {
        const start = p.length / 3,
          shift = (strand - 1) * size * 0.15;
        for (let j = 0; j <= 3; j++) {
          const along = (j / 3 - 0.5) * size * (0.7 + rng() * 0.3);
          const across = Math.sin(j * 1.5 + strand) * size * 0.13 + shift;
          const width = size * (0.025 + rng() * 0.035) * (j === 3 ? 0.3 : 1);
          const rise = j === 1 ? 0.009 : 0;
          debrisVertex(along, across - width, rise);
          debrisVertex(along, across + width, rise);
        }
        for (let j = 0; j < 3; j++) {
          const v = start + j * 2;
          indices.push(v, v + 3, v + 1, v, v + 2, v + 3);
        }
      }
    } else {
      const start = p.length / 3;
      debrisVertex(0, 0, 0.012);
      for (let j = 0; j < 6; j++) {
        const a = (j * Math.PI) / 3,
          r = size * (0.7 + rng() * 0.3);
        debrisVertex(Math.cos(a) * r, Math.sin(a) * r * 0.65, 0);
      }
      for (let j = 0; j < 6; j++)
        indices.push(start, start + 1 + ((j + 1) % 6), start + 1 + j);
    }
    debrisCount++;
  }
  const landingStart = p.length / 3,
    landingSegments = low ? 40 : 64;
  for (let k = 0; k <= landingSegments; k++) {
    const angle = (k / landingSegments) * Math.PI * 2;
    const ragged =
      Math.sin(angle * 7 + 0.4) * 0.14 + Math.sin(angle * 13) * 0.09;
    for (let ring = 0; ring < 3; ring++) {
      const r = 3.3 + ring * 0.7 + ragged * (ring === 1 ? 1 : 0.6);
      const x = sim.entities.pod.x + Math.cos(angle) * r,
        z = sim.entities.pod.z + Math.sin(angle) * r;
      p.push(x, renderGroundY(sim, x, z) + 0.012 + (ring === 1 ? 0.045 : 0), z);
      n.push(0, 1, 0);
      uv.push(x - sim.entities.pod.x, z - sim.entities.pod.z);
      place.push(x - centreAt(sim, z), -z);
      soil.push(1, 4, ring === 1 ? 0.1 : 0.7);
      if (k < landingSegments && ring < 2) {
        const v = landingStart + k * 3 + ring;
        indices.push(v, v + 3, v + 1, v + 1, v + 3, v + 4);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.userData.debris = debrisCount;
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(n, 3));
  g.setAttribute("place", new T.Float32BufferAttribute(place, 2));
  g.setAttribute("soil", new T.Float32BufferAttribute(soil, 3));
  g.userData.pebbles = pebbleCount;
  g.userData.skinVertices = nx * nz;
  renderGrids.set(sim, { xs, zs, heights });
  g.addEventListener("dispose", () => {
    if (renderGrids.get(sim)?.heights === heights) renderGrids.delete(sim);
  });
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/** A sunk, coarse caster gives the banks sun shadows without sending the full
 * visible terrain through the shadow pass. Its camera material writes no colour or depth. */
export function shadowGeometry(T, sim) {
  const xs = sim.route.map(([x]) => x),
    x0 = Math.min(...xs) - 68,
    x1 = Math.max(...xs) + 68,
    z0 = sim.route[sim.route.length - 1][1] - 16,
    z1 = sim.route[0][1] + 24;
  const g = new T.PlaneGeometry(
    x1 - x0,
    z1 - z0,
    Math.ceil((x1 - x0) / 5),
    Math.ceil((z1 - z0) / 5),
  );
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position,
    place = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    p.setY(i, sim.groundY(x, z) - 0.55);
    place[i * 2] = x - centreAt(sim, z);
    place[i * 2 + 1] = -z;
  }
  // A coarse triangle can bridge above a concave bank or the incised river.
  // Sink its shared vertices by the worst sampled protrusion. Without this,
  // the hidden caster paints regular black spots onto the visible rock skin.
  const sink = new Float32Array(p.count),
    index = g.index;
  for (let k = 0; k < index.count; k += 3) {
    const a = index.getX(k),
      b = index.getX(k + 1),
      c = index.getX(k + 2);
    let correction = 0;
    for (let u = 0; u <= 5; u++)
      for (let v = 0; v <= 5 - u; v++) {
        const wb = u / 5,
          wc = v / 5,
          wa = 1 - wb - wc,
          x = p.getX(a) * wa + p.getX(b) * wb + p.getX(c) * wc,
          z = p.getZ(a) * wa + p.getZ(b) * wb + p.getZ(c) * wc,
          y = p.getY(a) * wa + p.getY(b) * wb + p.getY(c) * wc;
        correction = Math.max(correction, y - sim.groundY(x, z) + 0.2);
      }
    sink[a] = Math.max(sink[a], correction);
    sink[b] = Math.max(sink[b], correction);
    sink[c] = Math.max(sink[c], correction);
  }
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - sink[i]);
  g.setAttribute("place", new T.BufferAttribute(place, 2));
  g.computeVertexNormals();
  return g;
}
