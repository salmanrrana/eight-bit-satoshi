import { renderGroundY } from "./land-terrain.js";

/** A thin, grouted wearing course follows LAND's actual triangles. The buried
 * apron bounds in the sim reserve the planting footprint without regrading the
 * route. Dense samples keep paving above the render skin at terrain grid joins. */
export function buildStationPaving(
  { T, sim, quality },
  groups,
  materials,
  resources,
) {
  for (const apron of sim.layout.filter((b) => b.kind === "station-apron")) {
    const [x0, , z0] = apron.min,
      [x1, , z1] = apron.max;
    const summit = apron.zone === 5;
    const batches = [[], [], [], [], []]; // stone, joints, edge, drains, safety paint
    const ground = (x, z) =>
      Math.max(sim.groundY(x, z), renderGroundY(sim, x, z));
    function quad(batch, points) {
      for (const i of [0, 2, 1, 0, 3, 2]) batch.push(...points[i]);
    }
    const step = quality === "low" ? 1 : 0.5;
    const tiles = new Set();
    for (let x = x0; x < x1; x += 2)
      for (let z = z0; z < z1; z += 2) {
        // The exposed front corners terminate one course early, where the
        // mountain approach meets the old stone apron.
        if (summit && z + 2 >= z1 && (x === x0 || x + 2 >= x1)) continue;
        const ys = [];
        let cliff = false;
        for (let a = 0; a <= 4; a++)
          for (let b = 0; b <= 4; b++) {
            const px = x + a * 0.5,
              pz = z + b * 0.5,
              physical = sim.groundY(px, pz),
              skin = renderGroundY(sim, px, pz);
            ys.push(ground(px, pz));
            if (Math.abs(physical - skin) > 0.12) cliff = true;
          }
        if (cliff) continue;
        if (Math.max(...ys) - Math.min(...ys) > 1.8) continue;
        if (sim.waterY?.(x + 1, z + 1) > sim.groundY(x + 1, z + 1) - 0.2)
          continue;
        tiles.add(`${x}:${z}`);
      }
    for (let x = x0; x < x1; x += 2)
      for (let z = z0; z < z1; z += 2) {
        if (!tiles.has(`${x}:${z}`)) continue;
        // Keep the apron off riverbanks and cliffs. All four corners and centre
        // must remain walkable; a buried edge closes each deliberate termination.
        const corners = [
          [x, z],
          [x + 2, z],
          [x + 2, z + 2],
          [x, z + 2],
        ];
        for (let dx = 0; dx < 2; dx += step)
          for (let dz = 0; dz < 2; dz += step) {
            const a = x + dx,
              b = z + dz;
            const points = [
              [a, b],
              [a + step, b],
              [a + step, b + step],
              [a, b + step],
            ];
            quad(
              batches[1],
              points.map(([px, pz]) => [px, ground(px, pz) + 0.055, pz]),
            );
            // A 22 mm joint belongs to the stonework, never a hole down to grass.
            const ax = a + (dx === 0 ? 0.011 : 0),
              bx = a + step - (dx + step === 2 ? 0.011 : 0);
            const az = b + (dz === 0 ? 0.011 : 0),
              bz = b + step - (dz + step === 2 ? 0.011 : 0);
            function panel(ax, az, bx, bz, depth = 0) {
              const points = [
                [ax, az],
                [bx, az],
                [bx, bz],
                [ax, bz],
              ];
              const heights = points.map(([px, pz]) => ground(px, pz));
              const mx = (ax + bx) / 2,
                mz = (az + bz) / 2;
              // Match kinks in LAND's independently spaced triangular grid. Flat
              // panels stay coarse; grid joins split until interpolation is safe.
              const error = Math.max(
                Math.abs(ground(mx, mz) - (heights[0] + heights[2]) / 2),
                ...points.map((p, i) => {
                  const q = points[(i + 1) % 4];
                  return Math.abs(
                    ground((p[0] + q[0]) / 2, (p[1] + q[1]) / 2) -
                      (heights[i] + heights[(i + 1) % 4]) / 2,
                  );
                }),
              );
              if (error > 0.025 && depth < 3) {
                panel(ax, az, mx, mz, depth + 1);
                panel(mx, az, bx, mz, depth + 1);
                panel(ax, mz, mx, bz, depth + 1);
                panel(mx, mz, bx, bz, depth + 1);
              } else
                quad(
                  batches[0],
                  points.map(([px, pz], i) => [px, heights[i] + 0.105, pz]),
                );
            }
            panel(ax, az, bx, bz);
          }
        // Only exposed edges need a buried retaining course and a narrow kerb.
        for (let i = 0; i < 4; i++) {
          const neighbour = [
            [x, z - 2],
            [x + 2, z],
            [x, z + 2],
            [x - 2, z],
          ][i];
          if (tiles.has(neighbour.join(":"))) continue;
          const a = corners[i],
            b = corners[(i + 1) % 4];
          for (let j = 0; j < 4; j++) {
            const p = [
              a[0] + ((b[0] - a[0]) * j) / 4,
              a[1] + ((b[1] - a[1]) * j) / 4,
            ];
            const q = [
              a[0] + ((b[0] - a[0]) * (j + 1)) / 4,
              a[1] + ((b[1] - a[1]) * (j + 1)) / 4,
            ];
            const nx = -(q[1] - p[1]) * 0.24,
              nz = (q[0] - p[0]) * 0.24;
            quad(batches[0], [
              [p[0], ground(...p) + 0.15, p[1]],
              [q[0], ground(...q) + 0.15, q[1]],
              [q[0] + nx, ground(q[0] + nx, q[1] + nz) + 0.15, q[1] + nz],
              [p[0] + nx, ground(p[0] + nx, p[1] + nz) + 0.15, p[1] + nz],
            ]);
            quad(batches[2], [
              [p[0], ground(...p) + 0.15, p[1]],
              [q[0], ground(...q) + 0.15, q[1]],
              [q[0], ground(...q) - 0.45, q[1]],
              [p[0], ground(...p) - 0.45, p[1]],
            ]);
          }
        }
      }
    // Flush service drains and worn safety marks break up the broad apron.
    // All details stay within the cosmetic skin; no new walking obstruction.
    function patch(batch, x, z, w, d, height = 0.135) {
      if (
        !tiles.has(
          `${x0 + Math.floor((x - x0) / 2) * 2}:${z0 + Math.floor((z - z0) / 2) * 2}`,
        )
      )
        return;
      const nx = Math.ceil(w / 0.25),
        nz = Math.ceil(d / 0.25);
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          const ax = x - w / 2 + (w * i) / nx,
            bx = x - w / 2 + (w * (i + 1)) / nx;
          const az = z - d / 2 + (d * j) / nz,
            bz = z - d / 2 + (d * (j + 1)) / nz;
          quad(
            batch,
            [
              [ax, az],
              [bx, az],
              [bx, bz],
              [ax, bz],
            ].map(([px, pz]) => [px, ground(px, pz) + height, pz]),
          );
        }
    }
    if (apron.zone !== 5) {
      for (const x of [-9, 9])
        for (let z = z0 + 4; z < z1 - 2; z += 12) {
          patch(batches[1], x, z, 0.68, 1.24, 0.125);
          for (let i = 0; i < 12; i++)
            patch(batches[3], x, z - 0.53 + i * 0.096, 0.58, 0.032, 0.145);
          for (const dx of [-0.33, 0.33])
            patch(batches[3], x + dx, z, 0.035, 1.24, 0.145);
        }
      // Dashed painted lanes stay next to the service rows, leaving the fight
      // lane quiet. Small offsets and broken lengths avoid pristine new paint.
      for (const x of [Math.max(x0 + 3, -11), Math.min(x1 - 3, 10)])
        for (let z = z0 + 3; z < z1 - 1; z += 4) {
          patch(batches[4], x, z, 0.1, 1.6, 0.14);
          patch(batches[4], x + 0.2, z - 0.76, 0.3, 0.08, 0.14);
        }
    }
    batches[0] = batches[0].concat(batches[2]);
    for (const [i, vertices] of [
      batches[0],
      batches[1],
      batches[3],
      batches[4],
    ].entries()) {
      if (!vertices.length) continue;
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        "position",
        new T.Float32BufferAttribute(vertices, 3),
      );
      geometry.setAttribute(
        "uv",
        new T.Float32BufferAttribute(
          vertices.flatMap((_, j) =>
            j % 3 === 0 ? [vertices[j] / 2, vertices[j + 2] / 2] : [],
          ),
          2,
        ),
      );
      // Ground-in service wear, drain damp and paired tyre tracks. Vertex tint
      // keeps the same PBR surface family, without another decal pass or light.
      if (i === 0) {
        const colours = [];
        for (let v = 0; v < vertices.length; v += 3) {
          const x = vertices[v],
            z = vertices[v + 2];
          const slab = Math.sin(
            Math.floor((x - x0) / 2) * 127.1 + Math.floor((z - z0) / 2) * 311.7,
          );
          const grain =
            Math.sin(x * 2.1 + Math.sin(z * 1.7)) * Math.sin(z * 3.4 + x);
          const track =
            Math.exp(-(((Math.abs(x - 1.2) - 1.1) / 0.24) ** 2)) * 0.12;
          const stains =
            Math.max(
              0,
              Math.sin(x * 0.63 + z * 0.19) * Math.sin(z * 0.51 - x * 0.17) -
                0.35,
            ) * 0.26;
          const shade = 0.86 + slab * 0.035 + grain * 0.025 - track - stains;
          if (apron.zone === 4) {
            // Dark basalt processional bands point to the citadel doors.
            // A brass border frames the siege position in the same paving mesh.
            const triangle = v - (v % 9);
            const cx =
              (vertices[triangle] +
                vertices[triangle + 3] +
                vertices[triangle + 6]) /
              3;
            const cz =
              (vertices[triangle + 2] +
                vertices[triangle + 5] +
                vertices[triangle + 8]) /
              3;
            const tileX = x0 + 2 * Math.floor((cx - x0) / 2) + 1;
            const tileZ = z0 + 2 * Math.floor((cz - z0) / 2) + 1;
            const diamond = Math.abs(tileX) + Math.abs(tileZ - (z0 + z1) / 2);
            if (diamond >= 11 && diamond < 13)
              colours.push(shade * 0.75, shade * 0.46, shade * 0.19);
            else if (Math.abs(tileX) < 7 || diamond < 11)
              colours.push(shade * 0.27, shade * 0.31, shade * 0.34);
            else colours.push(shade * 0.69, shade * 0.68, shade * 0.62);
          } else if (summit) {
            const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
            const verge = Math.max(0, 1 - edge * 0.44);
            const dust = verge * (0.45 + 0.55 * grain);
            const worn =
              0.93 +
              slab * 0.08 -
              0.14 * Math.exp(-((x - 0.8) ** 2) / 7) -
              0.09 * verge;
            colours.push(
              worn * (0.92 + dust * 0.15),
              worn * (0.98 + dust * 0.04),
              worn * (1.01 - dust * 0.22),
            );
          } else colours.push(shade, shade * 0.985, shade * 0.955);
        }
        geometry.setAttribute(
          "color",
          new T.Float32BufferAttribute(colours, 3),
        );
      }
      geometry.computeVertexNormals();
      resources.push(geometry);
      const mesh = new T.Mesh(
        geometry,
        i === 3
          ? materials.paint
          : i === 2
            ? materials.metal
            : i === 1
              ? materials.dark
              : materials.paving,
      );
      if (summit && i === 0) {
        const stone = materials.stone.clone();
        stone.onBeforeCompile = materials.stone.onBeforeCompile;
        stone.customProgramCacheKey = materials.stone.customProgramCacheKey;
        stone.vertexColors = true;
        resources.push(stone);
        mesh.material = stone;
      }
      mesh.name = `STATIONS apron ${apron.zone} ${i}`;
      mesh.receiveShadow = true;
      groups[apron.zone].root.add(mesh);
    }
  }
}
