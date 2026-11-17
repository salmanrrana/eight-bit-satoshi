import { renderGroundY } from "./land-terrain.js";
import {
  waterMaterial,
  fallMaterial,
  vapourMaterial,
  rainbowMaterial,
} from "./water-shaders.js";

/** Water is visual only: surface heights, wet widths and beds belong to the sim.
 * Station steam reads snapshot.stations; no station-side callback is required.
 */
export async function build({
  T,
  kit,
  sim,
  scene,
  quality,
  zoneGroup,
  assets,
}) {
  const resources = [],
    objects = [];
  const own = (r) => {
    resources.push(r);
    return r;
  };
  const add = (mesh, group = scene) => {
    mesh.name ||= "HASH WARS water";
    mesh.userData.noSkyVis = true;
    mesh.userData.noReflect = true;
    group.add(mesh);
    objects.push(mesh);
    return mesh;
  };
  const low = quality === "low",
    ultra = quality === "ultra";
  const origin = sim.route?.[0] ?? [0, 0];
  const seaY = Number.isFinite(sim.SEA_Y) ? sim.SEA_Y : null;
  const ground = (x, z) => sim.groundY?.(x, z) ?? 0;
  const skinY =
    typeof sim.groundY === "function" && sim.route?.length > 1
      ? (x, z) => renderGroundY(sim, x, z)
      : ground;
  // Shore and playable bed use the sim. Offshore LAND ends the headlands;
  // sample that known submerged skin, not the sim's infinitely long banks.
  const seaBed = (x, z) => (z > origin[1] + 30 ? skinY(x, z) : ground(x, z));
  const north = Math.min(origin[1] - 60, -(sim.ZONES?.[2]?.s1 ?? 0) - 8);
  const bounds = new T.Vector4(
    origin[0] - 160,
    north,
    320,
    origin[1] + 240 - north,
  );
  const waterRocks = (sim.layout ?? []).filter((solid) => {
    if (solid.surface !== "rock") return false;
    const x = solid.x ?? (solid.min?.[0] + solid.max?.[0]) / 2;
    const z = solid.z ?? (solid.min?.[2] + solid.max?.[2]) / 2;
    const y = typeof sim.waterY === "function" ? sim.waterY(x, z) : seaY;
    return (
      Number.isFinite(y) &&
      (solid.y0 ?? solid.min?.[1] ?? Infinity) <= y + 0.3 &&
      (solid.y1 ?? solid.max?.[1] ?? -Infinity) >= y - 0.1
    );
  });
  const mapSize = low ? 256 : 512,
    last = mapSize - 1;
  // Byte maps need no float-filter extension. Two maps are static for the level.
  const terrain = new Uint8Array(mapSize * mapSize * 4),
    coastline = new Uint8Array(mapSize * 4);
  for (let x = 0; x < mapSize; x++) {
    const wx = bounds.x + (x / last) * bounds.z;
    let a = origin[1] - 60,
      b = origin[1] + 240;
    for (let i = 0; i < 18; i++) {
      const mid = (a + b) / 2;
      if (ground(wx, mid) > (seaY ?? -1)) a = mid;
      else b = mid;
    }
    const shore = (a + b) / 2;
    const sc = Math.round(((shore - bounds.y) / bounds.w) * 65535);
    coastline[x * 4] = sc >> 8;
    coastline[x * 4 + 1] = sc & 255;
    coastline[x * 4 + 3] = 255;
    for (let z = 0; z < mapSize; z++) {
      const h = seaBed(wx, bounds.y + (z / last) * bounds.w);
      const v = Math.round(T.MathUtils.clamp((h + 40) / 80, 0, 1) * 65535),
        i = (z * mapSize + x) * 4;
      terrain[i] = v >> 8;
      terrain[i + 1] = v & 255;
      // The spare blue channel is an obstacle-contact foam field. LAND's
      // authoritative rock footprints keep froth attached to stacks/columns.
      const wz = bounds.y + (z / last) * bounds.w;
      let contact = 0;
      for (const rock of waterRocks) {
        let distance;
        if (rock.shape === "cyl")
          distance = Math.hypot(wx - rock.x, wz - rock.z) - rock.r;
        else if (rock.min && rock.max) {
          const qx =
            Math.abs(wx - (rock.min[0] + rock.max[0]) / 2) -
            (rock.max[0] - rock.min[0]) / 2;
          const qz =
            Math.abs(wz - (rock.min[2] + rock.max[2]) / 2) -
            (rock.max[2] - rock.min[2]) / 2;
          distance =
            Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) +
            Math.min(Math.max(qx, qz), 0);
        } else continue;
        contact = Math.max(contact, Math.exp(-Math.max(0, distance) * 1.6));
      }
      terrain[i + 2] = Math.round(contact * 255);
      terrain[i + 3] = 255;
    }
  }
  function texture(data, w, h) {
    const tex = own(new T.DataTexture(data, w, h));
    tex.minFilter = tex.magFilter = T.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }
  // Two periodic Fourier slope spectra, made here, with mipmaps for the horizon.
  function normalTexture(seed) {
    const size = 128,
      data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let sx = 0,
          sy = 0;
        for (let i = 1; i < 17; i++) {
          const kx = ((i * 7 + seed) % 13) - 6,
            ky = ((i * 11 + seed * 3) % 17) - 8;
          const c =
            Math.cos(((x * kx + y * ky) / size) * Math.PI * 2 + i * seed) /
            (1 + kx * kx + ky * ky);
          sx += kx * c;
          sy += ky * c;
        }
        const j = (y * size + x) * 4;
        data[j] = T.MathUtils.clamp(128 + sx * 100, 0, 255);
        data[j + 1] = T.MathUtils.clamp(128 + sy * 100, 0, 255);
        data[j + 2] = data[j + 3] = 255;
      }
    const tex = texture(data, size, size);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = T.LinearMipmapLinearFilter;
    return tex;
  }
  const uniforms = {
    hwTime: { value: 0 },
    hwSea: { value: seaY ?? -1 },
    hwContacts: { value: waterRocks.length ? 1 : 0 },
    hwBounds: { value: bounds },
    hwBed: { value: texture(terrain, mapSize, mapSize) },
    hwShore: { value: texture(coastline, mapSize, 1) },
    hwNormalA: { value: normalTexture(1) },
    hwNormalB: { value: normalTexture(7) },
    hwNoise: { value: kit.noiseMap },
    hwSun: { value: new T.Vector3(0.5, 0.64, -0.57) },
    hwSunColour: { value: new T.Color(1, 1, 1) },
    hwFog: { value: new T.Color(0.5, 0.65, 0.78) },
    hwFall: { value: new T.Vector4() },
    hwStation: { value: new Float32Array(3) },
  };
  const material = waterMaterial({ T, kit, uniforms });
  // One program for sea, river, wet sand and basin (modes 0/1/2/3).
  function geometry(vertices, indices, data, flow) {
    const geo = own(new T.BufferGeometry());
    geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("hwData", new T.Float32BufferAttribute(data, 4));
    geo.setAttribute("hwFlow", new T.Float32BufferAttribute(flow, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
  function grid(xs, zs, mode) {
    const p = [],
      d = [],
      f = [],
      ix = [];
    for (const z of zs)
      for (const x of xs) {
        const h = mode === 0 ? seaBed(x, z) : ground(x, z),
          y = mode === 2 ? skinY(x, z) + 0.018 : seaY;
        p.push(x, y, z);
        d.push(Math.max(0, (seaY ?? 0) - h), mode, 0, 0);
        f.push(0, 1);
      }
    for (let j = 0; j < zs.length - 1; j++)
      for (let i = 0; i < xs.length - 1; i++) {
        const a = j * xs.length + i,
          b = a + xs.length;
        const heights = [a, b, a + 1, b + 1].map((n) => p[n * 3 + 1]);
        if (
          mode === 2 &&
          (Math.min(...heights) > seaY + 0.95 ||
            Math.max(...heights) < seaY - 0.15)
        )
          continue;
        ix.push(a, b, a + 1, b, b + 1, a + 1);
      }
    return geometry(p, ix, d, f);
  }
  function axis(a, b, step) {
    const values = [];
    for (let x = a; x < b - 0.001; x += step) values.push(x);
    values.push(b);
    return values;
  }
  if (seaY !== null) {
    // Dense near shore, increasingly broad cells offshore; one seamless sea sheet.
    const nearStep = low ? 2 : ultra ? 0.6 : 1;
    const xs = [
      -64000,
      -12000,
      -3200,
      -1800,
      -900,
      -450,
      -220,
      ...axis(-140, 140, nearStep),
      220,
      450,
      900,
      1800,
      3200,
      12000,
      64000,
    ].map((x) => x + origin[0]);
    const zs = [
      ...axis(-40, -5, nearStep).slice(0, -1),
      ...axis(-5, 30, nearStep * 0.5).slice(0, -1),
      ...axis(30, 100, nearStep),
      130,
      170,
      230,
      320,
      480,
      720,
      1100,
      1800,
      3200,
      12000,
      64000,
    ].map((z) => z + origin[1]);
    const sea = add(new T.Mesh(grid(xs, zs, 0), material));
    sea.name = "Continuous ocean to horizon";
    sea.receiveShadow = true;
    sea.geometry.boundingSphere.radius += 1;
    // Copy the actual ground triangles in the tidal band. Sampling a separate
    // grid matches heights at vertices but can cut through a diagonal between
    // them. Matching topology keeps the whole film exactly 18 mm above sand.
    const skin = scene.getObjectByName(
      "LAND continuous groundY terrain",
    )?.geometry;
    let film;
    if (skin?.index && skin.attributes.soil) {
      const positions = skin.attributes.position,
        soil = skin.attributes.soil;
      const p = [],
        d = [],
        f = [],
        ix = [],
        remap = new Map();
      for (let k = 0; k < skin.index.count; k += 3) {
        const ids = [
          skin.index.getX(k),
          skin.index.getX(k + 1),
          skin.index.getX(k + 2),
        ];
        if (ids.some((i) => soil.getY(i) > 0)) continue; // LAND's embedded pebbles.
        const ys = ids.map((i) => positions.getY(i));
        if (Math.min(...ys) > seaY + 1 || Math.max(...ys) < seaY - 0.2)
          continue;
        if (
          ids.every((i) => Math.abs(positions.getX(i) - origin[0]) > 80) ||
          ids.every((i) => positions.getZ(i) < origin[1] - 12) ||
          ids.every((i) => positions.getZ(i) > origin[1] + 110)
        )
          continue;
        for (const i of ids) {
          if (!remap.has(i)) {
            const x = positions.getX(i),
              z = positions.getZ(i);
            remap.set(i, p.length / 3);
            p.push(x, positions.getY(i) + 0.018, z);
            d.push(Math.max(0, seaY - ground(x, z)), 2, 0, 0);
            f.push(0, 1);
          }
          ix.push(remap.get(i));
        }
      }
      film = geometry(p, ix, d, f);
    } else {
      film = grid(
        axis(origin[0] - 75, origin[0] + 75, low ? 1.8 : 0.65),
        axis(origin[1] - 12, origin[1] + 100, low ? 1.5 : 0.55),
        2,
      );
    }
    const sand = add(new T.Mesh(film, material));
    sand.name = "Ground-conforming wet sand and swash";
    sand.receiveShadow = true;
    sand.renderOrder = 1;
  }
  let riverLength = 0;
  const river = Array.isArray(sim.river)
    ? sim.river.filter((p) => [p.x, p.y, p.z, p.width].every(Number.isFinite))
    : [];
  if (river.length > 1) {
    const p = [],
      d = [],
      f = [],
      ix = [],
      across = low ? 8 : ultra ? 24 : 16;
    let length = 0,
      rows = 0;
    for (let k = 1; k < river.length; k++) {
      const a = river[k - 1],
        b = river[k],
        dx = b.x - a.x,
        dz = b.z - a.z,
        span = Math.hypot(dx, dz);
      const steps = Math.ceil(span / (low ? 1.2 : 0.5)),
        tx = dx / span,
        tz = dz / span;
      for (let j = k === 1 ? 0 : 1; j <= steps; j++) {
        const t = j / steps,
          cx = a.x + dx * t,
          cz = a.z + dz * t,
          y = a.y + (b.y - a.y) * t;
        const half = (a.width + (b.width - a.width) * t) / 2;
        const bankWidth = (sign) => {
          let lo = half,
            hi = half + 4;
          for (let n = 0; n < 10; n++) {
            const mid = (lo + hi) / 2;
            if (ground(cx - tz * mid * sign, cz + tx * mid * sign) < y)
              lo = mid;
            else hi = mid;
          }
          return (lo + hi) / 2;
        };
        const left = bankWidth(-1),
          right = bankWidth(1);
        // Follow the supplied channel to its actual bed/surface intersection.
        // Never lift the water to hide a bank or paint it above the terrain.
        for (let i = 0; i <= across; i++) {
          const side = (i / across) * 2 - 1,
            reach = side < 0 ? left : right,
            x = cx - tz * reach * side,
            z = cz + tx * reach * side;
          p.push(x, y, z);
          d.push(Math.max(0, y - ground(x, z)), 1, side, length + span * t);
          f.push(tx, tz);
        }
        rows++;
      }
      length += span;
    }
    riverLength = length;
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < across; i++) {
        const a = j * (across + 1) + i,
          b = a + across + 1;
        ix.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const mesh = add(new T.Mesh(geometry(p, ix, d, f), material), zoneGroup(1));
    mesh.name = "Glacier river, sim channel and surface";
    mesh.receiveShadow = true;
  }
  const fall = sim.waterfall;
  const sources = [];
  // Channel0–2 follows a relit station; -1 is mist/spray and -2 is vent steam.
  function source(position, count, size, height, life, drift, station = -1) {
    for (let i = 0; i < count; i++) {
      const seed = (i * 0.61803398875 + sources.length * 0.137) % 1;
      sources.push({
        at: position,
        seed,
        size: size * (0.7 + seed * 0.55),
        height,
        // Independent phase and lifetime keep the spray distributed at every time.
        life,
        dx: drift[0] * (0.7 + seed * 0.6),
        dz: drift[1] * (0.7 + seed * 0.6),
        station,
      });
    }
  }
  if (
    fall?.top &&
    fall?.foot &&
    fall.width > 0 &&
    fall.top.y > fall.foot.y &&
    [
      fall.width,
      fall.top.x,
      fall.top.y,
      fall.top.z,
      fall.foot.x,
      fall.foot.y,
      fall.foot.z,
    ].every(Number.isFinite)
  ) {
    const { top, foot, width } = fall.cataract ?? fall,
      drop = top.y - foot.y,
      dx = foot.x - top.x,
      dz = foot.z - top.z;
    const reach = Math.hypot(dx, dz) || 1,
      tx = dx / reach,
      tz = dz / reach;
    const sheets = low ? 4 : ultra ? 8 : 7,
      fallMat = fallMaterial({ T, kit, uniforms });
    // All curtains share one indexed mesh and one material. Their separate
    // trajectories give the fall a cross-section without a draw per sheet.
    const vertices = [],
      uvs = [],
      layers = [],
      indices = [];
    const cols = low ? 20 : 36,
      rows = low ? 28 : 56;
    for (let layer = 0; layer < sheets; layer++) {
      const first = vertices.length / 3;
      for (let j = 0; j <= rows; j++)
        for (let i = 0; i <= cols; i++) {
          const v = j / rows,
            u = i / cols;
          const curtain =
            layer === 0 ? 1.04 : 0.27 + 0.06 * Math.sin(layer * 3.1);
          const offset =
            layer === 0 ? 0 : (layer / (sheets - 1) - 0.5) * width * 0.92;
          // The high cataract keeps its broad face throughout the descent.
          const side =
            ((u - 0.5) * curtain * width * 1.15 + offset) *
            (1 + v * 0.12 + Math.sin(v * 17 + layer) * 0.025);
          const fold =
            Math.sin(u * 19 + layer * 2.7) * 0.62 * Math.sin(v * Math.PI);
          const thickness =
            (layer * 0.68 + fold) * Math.sin(v * Math.PI * 0.84);
          vertices.push(
            top.x + dx * v - tz * side + tx * (thickness - 0.16 * (1 - v)),
            top.y -
              drop * v * v +
              Math.sin(u * 23 + layer) * 0.09 * v +
              0.025 * (1 - v),
            top.z + dz * v + tx * side + tz * (thickness - 0.16 * (1 - v)),
          );
          uvs.push(u, 1 - v);
          layers.push(layer);
        }
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const a = first + j * (cols + 1) + i,
            b = a + cols + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    // The river still enters the same basin through its lower slot.
    if (fall.cataract) {
      const start = vertices.length / 3;
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        for (let i = 0; i <= cols; i++) {
          const u = i / cols;
          vertices.push(
            fall.top.x + (u - 0.5) * fall.width * (1 + v * 0.4),
            fall.top.y + (fall.foot.y - fall.top.y) * v * v,
            fall.top.z + (fall.foot.z - fall.top.z) * v,
          );
          uvs.push(u, 1 - v);
          layers.push(0);
        }
      }
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const a = start + j * (cols + 1) + i,
            b = a + cols + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    const curtains = own(new T.BufferGeometry());
    curtains.setAttribute(
      "position",
      new T.Float32BufferAttribute(vertices, 3),
    );
    curtains.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
    curtains.setAttribute("hwSheet", new T.Float32BufferAttribute(layers, 1));
    curtains.setIndex(indices);
    curtains.computeVertexNormals();
    const sheet = add(new T.Mesh(curtains, fallMat), zoneGroup(2));
    sheet.name = "Layered accelerating waterfall curtains";
    sheet.renderOrder = 2;
    // Fine ballistic spray shares the vapour pool; negative height means fall.
    for (const side of [-0.48, -0.22, 0.22, 0.48]) {
      source(
        {
          x: top.x - tz * width * side,
          y: top.y,
          z: top.z + tx * width * side,
        },
        low ? 5 : ultra ? 14 : 9,
        0.34,
        -drop,
        Math.sqrt((2 * drop) / 9.81),
        [dx, dz],
      );
    }
    // w: river length, so the last reach above the lip can break white.
    uniforms.hwFall.value.set(
      foot.x,
      foot.z,
      width * 1.5,
      Math.max(1, riverLength),
    );
    const p = [],
      d = [],
      f = [],
      ix = [];
    if (typeof sim.waterY === "function" && sim.ZONES?.[2]) {
      // The sim floods the gorge, not just a circular patch under the fall.
      const zone = sim.ZONES[2];
      const xs = axis(bounds.x, bounds.x + bounds.z, low ? 4 : 2);
      const zs = axis(-zone.s1, -zone.s0, low ? 1 : 0.5);
      const valid = [];
      for (const z of zs)
        for (const x of xs) {
          const y = sim.waterY(x, z);
          valid.push(Number.isFinite(y) && Math.abs(y - foot.y) < 0.01);
          p.push(x, foot.y, z);
          d.push(
            Math.max(0, foot.y - ground(x, z)),
            3,
            0,
            Math.hypot(x - foot.x, z - foot.z),
          );
          f.push(tx, tz);
        }
      for (let j = 0; j < zs.length - 1; j++)
        for (let i = 0; i < xs.length - 1; i++) {
          const a = j * xs.length + i,
            b = a + xs.length;
          if (![a, b, a + 1, b + 1].every((n) => valid[n])) continue;
          ix.push(a, b, a + 1, b, b + 1, a + 1);
        }
    } else {
      // Older/missing sim data: a conservative plunge pool from the supplied foot.
      const rings = low ? 12 : 24,
        segments = low ? 48 : 96;
      for (let j = 0; j <= rings; j++)
        for (let i = 0; i <= segments; i++) {
          const r = j / rings,
            theta = (i / segments) * Math.PI * 2;
          const x = foot.x + Math.cos(theta) * width * 1.9 * r,
            z = foot.z + Math.sin(theta) * width * 2.6 * r;
          p.push(x, foot.y, z);
          d.push(
            Math.max(0, foot.y - ground(x, z)),
            3,
            r,
            Math.hypot(x - foot.x, z - foot.z),
          );
          f.push(Math.cos(theta), Math.sin(theta));
        }
      for (let j = 0; j < rings; j++)
        for (let i = 0; i < segments; i++) {
          const a = j * (segments + 1) + i,
            b = a + segments + 1;
          ix.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    const pool = add(new T.Mesh(geometry(p, ix, d, f), material), zoneGroup(2));
    pool.name = "Gorge water, authoritative sim.waterY";
    pool.receiveShadow = true;
    for (let i = 0; i < 5; i++) {
      const at = {
        x: foot.x - tz * (i / 4 - 0.5) * width,
        y: foot.y + 0.2,
        z: foot.z + tx * (i / 4 - 0.5) * width,
      };
      source(
        at,
        low ? 6 : ultra ? 22 : 15,
        width * 1.1,
        i < 2 ? drop * 0.6 : drop * 2.9,
        i < 2 ? 5 : 9,
        [-width * 1.6, width * 0.25],
        -3,
      );
    }
    // Wind carries the upper spray across the deck, 36 m above the pool.
    source(
      { x: top.x, y: top.y + 0.2, z: top.z },
      low ? 10 : ultra ? 28 : 20,
      5,
      34,
      9,
      [-20, -12],
      -3,
    );
    const bow = add(
      new T.Mesh(
        own(new T.PlaneGeometry(width * 5, drop * 1.2)),
        own(rainbowMaterial({ T, uniforms })),
      ),
      zoneGroup(2),
    );
    bow.position.set(foot.x + width * 0.35, foot.y + drop * 0.4, foot.z);
    bow.name = "Antisolar spray rainbow";
    bow.renderOrder = 4;
  }
  for (const vent of sim.steamVents ?? [])
    if ([vent?.x, vent?.y, vent?.z].every(Number.isFinite))
      source(vent, low ? 8 : ultra ? 24 : 16, 5.2, 18, 7, [7, 2], -2);
  const crater = scene.getObjectByName("LAND distant volcanic highland")
    ?.userData.volcanoOutlet;
  if (crater)
    source(crater, low ? 18 : ultra ? 40 : 32, 74, 75, 32, [100, 16], -3);
  for (const station of sim.entities?.stations ?? []) {
    const spire = station?.spire;
    if (
      !spire ||
      ![spire.x, spire.z].every(Number.isFinite) ||
      !Number.isInteger(station.index) ||
      station.index < 0 ||
      station.index > 2
    )
      continue;
    const solid = sim.layout?.find(
      (s) => s.kind === "spire" && s.zone === station.zone,
    );
    // The delivered spire can be vertically scaled; transform its authored
    // outlet with the same stationPart placement used by STATIONS.
    const part = sim.layout?.find(
      (s) =>
        s.stationPart?.node === "spire" &&
        s.stationPart.station === station.index,
    )?.stationPart;
    const model =
      part &&
      assets?.instantiate(`/assets/hash-wars/structures/${part.file}`, {
        node: part.node,
      });
    const outlet = model?.getObjectByName("spire_steam");
    const at = new T.Vector3(
      spire.x,
      solid?.max?.[1] ?? (spire.y ?? ground(spire.x, spire.z)) + 30,
      spire.z,
    );
    if (outlet && part) {
      model.updateMatrixWorld(true);
      outlet.getWorldPosition(at);
      at.multiply(new T.Vector3(...(part.scale ?? [1, 1, 1])));
      at.applyAxisAngle(new T.Vector3(0, 1, 0), part.yaw ?? 0);
      at.add(new T.Vector3(part.x, part.y, part.z));
    }
    source(at, low ? 18 : ultra ? 44 : 32, 14, 36, 12, [18, 5], station.index);
  }
  if (sources.length) {
    const base = own(new T.PlaneGeometry(1, 1));
    const geo = own(new T.InstancedBufferGeometry());
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    const particles = [],
      positions = [],
      lives = [];
    for (const s of sources) {
      particles.push(s.seed, s.size, s.dx, s.dz);
      positions.push(s.at.x, s.at.y, s.at.z, s.station);
      lives.push(s.life, s.height);
    }
    geo.setAttribute(
      "hwParticle",
      new T.InstancedBufferAttribute(new Float32Array(particles), 4),
    );
    geo.setAttribute(
      "hwSource",
      new T.InstancedBufferAttribute(new Float32Array(positions), 4),
    );
    geo.setAttribute(
      "hwLife",
      new T.InstancedBufferAttribute(new Float32Array(lives), 2),
    );
    geo.instanceCount = sources.length;
    const vapour = add(new T.Mesh(geo, own(vapourMaterial({ T, uniforms }))));
    vapour.frustumCulled = false;
    vapour.renderOrder = 3;
    vapour.name = "Pooled sunlit mist and station steam";
  }
  // Useful to inspect without counting shared sky/land/post draws as WATER cost.
  const stats = {
    quality,
    drawCalls: objects.length,
    triangles: 0,
    particles: sources.length,
    programs: 4,
    planarPasses: 0,
  };
  for (const mesh of objects) {
    const g = mesh.geometry;
    stats.triangles +=
      ((g.index ? g.index.count : g.attributes.position.count) / 3) *
      (g.isInstancedBufferGeometry ? g.instanceCount : 1);
  }
  material.userData.waterBudget = stats;
  return {
    update({ snapshot, time, env, camera }) {
      uniforms.hwTime.value = time;
      if (env?.sunDir) uniforms.hwSun.value.copy(env.sunDir);
      if (env?.sunColour) uniforms.hwSunColour.value.copy(env.sunColour);
      if (env?.fog) uniforms.hwFog.value.copy(env.fog);
      for (let i = 0; i < 3; i++) {
        const station = snapshot.stations?.[i];
        uniforms.hwStation.value[i] =
          station?.state === "keeper"
            ? Math.max(0.02, station.relight ?? 1)
            : 0;
      }
      for (const mesh of objects) {
        if (mesh.name === "Antisolar spray rainbow")
          mesh.quaternion.copy(camera.quaternion);
        if (mesh.name === "Continuous ocean to horizon") {
          // Its kilometre-wide sphere cannot reject inland views. Only skip
          // when every corner ray heads away from the ocean's north edge;
          // keep wave/jitter margins. Quaternion reads allocate nothing.
          const q = camera.quaternion;
          const tan = Math.tan((camera.fov * Math.PI) / 360);
          const furthestZ =
            2 * (q.x * q.x + q.y * q.y) -
            1 +
            2 * Math.abs(q.x * q.z - q.w * q.y) * tan * camera.aspect +
            2 * Math.abs(q.y * q.z + q.w * q.x) * tan;
          mesh.visible =
            camera.position.z > origin[1] - 41 || furthestZ >= -0.05;
        }
      }
    },
    dispose() {
      objects.forEach((o) => o.removeFromParent());
      resources.forEach((r) => r.dispose());
    },
  };
}
