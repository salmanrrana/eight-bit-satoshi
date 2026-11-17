import { renderGroundY } from "./land-terrain.js";
import { rockMoss } from "./flora-moss.js";
import { hash, occupied, riverMargin } from "./flora-field.js";

// Small fully modelled flowers and folded leaf sprays, merged into 16 m tiles.
// No alpha cards, texture downloads, individual Object3Ds, or runtime buffers.
export function buildPlants(ctx, field, motion) {
  const { T, sim, kit, scene, quality } = ctx;
  const surfaceMoss = rockMoss(ctx);
  const material = kit.material({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.88,
    side: T.DoubleSide,
  });
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (s, r) => {
    base.call(material, s, r);
    Object.assign(s.uniforms, motion);
    s.vertexShader =
      `attribute float flex; uniform float floraTime,floraWind;
uniform vec3 floraEye; varying vec3 plantWorld; varying float plantFlex;\n` +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float distanceTo=distance(position.xz,floraEye.xz);
float collapse=1.-smoothstep(26.,42.,distanceTo);
float breeze=sin(dot(position.xz,vec2(.39,.23))-floraTime*1.8)*.18;
transformed.xz+=vec2(.87,.49)*(breeze+.12)*floraWind*flex*flex;
// Sink plants only past their legible range, well inside the tile cull radius.
transformed.y-=flex*(1.-collapse)*1.3;
plantWorld=transformed;plantFlex=flex;`,
    );
    s.fragmentShader =
      `uniform float floraTime,floraCloud; uniform sampler2D floraCloudMap; uniform vec4 floraCloudBounds; varying vec3 plantWorld;varying float plantFlex;\n` +
      s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
float cloud=texture2D(floraCloudMap,(plantWorld.xz-floraCloudBounds.xy)/floraCloudBounds.zw).r;

// Fine damp moss stipple, footprint-filtered so it cannot sparkle in motion.
float footprint=max(length(dFdx(plantWorld)),length(dFdy(plantWorld)));
float mossNoise=sin(plantWorld.x*180.+sin(plantWorld.z*105.))*sin(plantWorld.z*146.);
diffuseColor.rgb*=1.+mossNoise*.13*(1.-smoothstep(.01,.045,footprint))*(1.-step(.001,plantFlex));`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
reflectedLight.directDiffuse*=mix(1.,cloud,floraCloud);
reflectedLight.directSpecular*=mix(1.,cloud,floraCloud);`,
    );
  };
  material.customProgramCacheKey = () => "hw-flora-plants-v1";
  const group = new T.Group();
  group.name = "HASH WARS flowers heather moss";
  scene.add(group);
  const tiles = [];
  const density = quality === "ultra" ? 0.85 : quality === "high" ? 0.42 : 0.12;
  const stats = { flowers: 0, shrubs: 0, seeds: 0, moss: 0, triangles: 0 };
  for (let tz = -448; tz < -24; tz += 16)
    for (let tx = -64; tx < 64; tx += 16) {
      const positions = [],
        colours = [],
        flexes = [];
      function tri(a, b, c, colour, flex = [0, 0, 0]) {
        positions.push(...a, ...b, ...c);
        for (let i = 0; i < 3; i++) {
          colours.push(...colour);
          flexes.push(flex[i]);
        }
      }
      function leaf(x, y, z, angle, length, width, colour, flex) {
        const dx = Math.cos(angle),
          dz = Math.sin(angle);
        const root = [x, y, z],
          tip = [x + dx * length, y + length * 0.22, z + dz * length];
        const mid = [
          x + dx * length * 0.5,
          y + length * 0.24,
          z + dz * length * 0.5,
        ];
        tri(
          root,
          [mid[0] - dz * width, mid[1], mid[2] + dx * width],
          tip,
          colour,
          [flex, flex, flex],
        );
        tri(
          root,
          tip,
          [mid[0] + dz * width, mid[1] - 0.008, mid[2] - dx * width],
          colour.map((c) => c * 0.78),
          [flex, flex, flex],
        );
      }
      function stem(x, y, z, dx, dz, h, width, colour) {
        tri(
          [x - width, y, z],
          [x + width, y, z],
          [x + dx, y + h, z + dz],
          colour,
          [0, 0, h],
        );
        tri(
          [x, y, z - width],
          [x + dx, y + h, z + dz],
          [x, y, z + width],
          colour,
          [0, h, 0],
        );
      }
      // A wandering habitat field selects whole drifts, not scattered confetti.
      const drift = (x, z) =>
        0.5 +
        Math.sin(x * 0.27 + Math.sin(z * 0.13) * 2) * 0.28 +
        Math.sin(z * 0.31 - x * 0.16) * 0.22;
      for (let i = 0; i < Math.round(105 * density); i++) {
        const x = tx + hash(tx, tz, i + 7) * 16,
          z = tz + hash(tx, tz, i + 277) * 16;
        const cover = field.sample(x, z);
        if (cover < 0.42 || hash(x, z, 41) > cover || drift(x, z) < 0.58)
          continue;
        const y = renderGroundY(sim, x, z) - 0.012,
          seed = hash(x, z, 8),
          a = seed * Math.PI * 2;
        const h =
          (0.22 + hash(x, z, 4) * 0.25) *
          (0.5 + cover * 0.5) *
          (seed < 0.33 ? 1.45 : 1);
        stem(
          x,
          y,
          z,
          0.025 * Math.cos(a),
          0.025 * Math.sin(a),
          h,
          0.003,
          [0.075, 0.13, 0.025],
        );
        for (let k = 0; k < 2; k++)
          leaf(
            x,
            y + h * (0.2 + k * 0.19),
            z,
            a + k * 2.4,
            0.07,
            0.017,
            [0.1, 0.19, 0.035],
            h * 0.4,
          );
        const xx = x + 0.025 * Math.cos(a),
          zz = z + 0.025 * Math.sin(a);
        if (seed < 0.33) {
          stats.seeds++;
          // Open oat-like heads with individual hanging grains, not a solid cone.
          for (let k = 0; k < 6; k++) {
            const angle = a + k * 2.4,
              yy = y + h + k * 0.013;
            leaf(
              xx,
              yy,
              zz,
              angle,
              0.022 + k * 0.002,
              0.006,
              [0.37, 0.3, 0.13],
              h,
            );
          }
        } else {
          stats.flowers++;
          const palette = [
            [0.82, 0.76, 0.57],
            [0.48, 0.35, 0.61],
            [0.73, 0.55, 0.12],
          ];
          const colour =
            palette[
              Math.floor(hash(Math.floor(x / 4), Math.floor(z / 4), 6) * 3)
            ];
          const radius = 0.017 + hash(x, z, 92) * 0.016;
          for (let k = 0; k < 5; k++) {
            const angle = a + k * Math.PI * 0.4,
              dx = Math.cos(angle),
              dz = Math.sin(angle);
            const root = [xx, y + h, zz],
              tip = [xx + dx * radius, y + h + 0.003, zz + dz * radius];
            tri(
              root,
              [
                xx + dx * radius * 0.6 - dz * radius * 0.32,
                y + h + 0.009,
                zz + dz * radius * 0.6 + dx * radius * 0.32,
              ],
              tip,
              colour,
              [h, h, h],
            );
            tri(
              root,
              tip,
              [
                xx + dx * radius * 0.6 + dz * radius * 0.32,
                y + h + 0.009,
                zz + dz * radius * 0.6 - dx * radius * 0.32,
              ],
              colour,
              [h, h, h],
            );
          }
          tri(
            [xx - 0.006, y + h + 0.004, zz - 0.004],
            [xx + 0.006, y + h + 0.004, zz - 0.004],
            [xx, y + h + 0.008, zz + 0.006],
            [0.49, 0.31, 0.035],
            [h, h, h],
          );
        }
      }
      for (let i = 0; i < Math.round(13 * density); i++) {
        const x = tx + hash(tx, tz, i + 411) * 16,
          z = tz + hash(tx, tz, i + 718) * 16;
        const cover = field.sample(x, z),
          away = Math.abs(x - sim.at(-z).x);
        if (cover < 0.72 || away < 10 || drift(x, z) < 0.48) continue;
        stats.shrubs++;
        const y = renderGroundY(sim, x, z) - 0.012,
          seed = hash(x, z, 29),
          size = 0.25 + seed * 0.2;
        for (let b = 0; b < 8; b++) {
          const a = b * 2.399 + seed * 8,
            dx = Math.cos(a),
            dz = Math.sin(a);
          const h = size * (0.6 + hash(x, z, b + 1) * 0.7);
          stem(
            x,
            y,
            z,
            dx * size * 0.65,
            dz * size * 0.65,
            h,
            0.006,
            [0.11, 0.075, 0.031],
          );
          for (let k = 1; k < 5; k++) {
            const f = k / 5,
              px = x + dx * size * 0.65 * f,
              pz = z + dz * size * 0.65 * f;
            for (const side of [-1, 1])
              leaf(
                px,
                y + h * f,
                pz,
                a + side * 1.2,
                0.065 + seed * 0.035,
                0.014,
                [0.09 + seed * 0.035, 0.16 + seed * 0.045, 0.038],
                h * f,
              );
            if (seed > 0.48 && k >= 3) {
              // Sparse tiny heather bells on the upper branch, grouped by habitat.
              leaf(
                px,
                y + h * f + 0.017,
                pz,
                a,
                0.022,
                0.012,
                [0.33, 0.17, 0.29],
                h * f,
              );
            }
          }
        }
      }
      // Ground moss follows damp slopes. Separate surface cushions were projected
      // onto LAND triangles before these tiles were merged.
      for (let i = 0; i < Math.round(18 * density); i++) {
        const x = tx + hash(tx, tz, i + 817) * 16,
          z = tz + hash(tx, tz, i + 905) * 16;
        const y = sim.groundY(x, z),
          dz = sim.groundY(x, z + 0.25) - sim.groundY(x, z - 0.25);
        const dx = sim.groundY(x + 0.25, z) - sim.groundY(x - 0.25, z);
        if (
          occupied(sim, x, z, 1) ||
          riverMargin(sim, x, z) < 0.6 ||
          y < sim.SEA_Y + 5 ||
          z > -38 ||
          Math.abs(dx) + Math.abs(dz) < 0.2 ||
          dz < -0.1 ||
          Math.abs(x - sim.at(-z).x) < 4 ||
          (z < -148 && z > -233)
        )
          continue;
        stats.moss++;
        const radius = 0.16 + hash(x, z, 7) * 0.38;
        const colour = [0.065, 0.115 + hash(x, z, 16) * 0.04, 0.018];
        for (let k = 0; k < 9; k++) {
          const a = (k * Math.PI * 2) / 9,
            b = ((k + 1) * Math.PI * 2) / 9;
          const r0 = radius * (0.7 + hash(x, z, k + 44) * 0.3),
            r1 = radius * (0.7 + hash(x, z, k + 45) * 0.3);
          const xx = x + Math.cos(a) * r0,
            zz = z + Math.sin(a) * r0;
          const xxx = x + Math.cos(b) * r1,
            zzz = z + Math.sin(b) * r1;
          tri(
            [x, y + 0.021, z],
            [xxx, sim.groundY(xxx, zzz) + 0.021, zzz],
            [xx, sim.groundY(xx, zz) + 0.021, zz],
            colour,
          );
        }
      }
      for (const patch of surfaceMoss.get(`${tx},${tz}`) ?? []) {
        stats.moss++;
        for (const [a, b, c] of patch.triangles) tri(a, b, c, patch.colour);
      }
      if (!positions.length) continue;
      const x = Math.floor(tx / 32) * 32,
        z = Math.floor(tz / 32) * 32;
      let tile = tiles.find((t) => t.x === x + 16 && t.z === z + 16);
      if (!tile) {
        tile = { x: x + 16, z: z + 16, positions: [], colours: [], flexes: [] };
        tiles.push(tile);
      }
      tile.positions.push(...positions);
      tile.colours.push(...colours);
      tile.flexes.push(...flexes);
      stats.triangles += positions.length / 9;
    }
  for (const tile of tiles) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(tile.positions, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(tile.colours, 3));
    g.setAttribute("flex", new T.Float32BufferAttribute(tile.flexes, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    tile.mesh = new T.Mesh(g, material);
    tile.mesh.receiveShadow = true;
    tile.mesh.userData.noReflect = tile.mesh.userData.noSkyVis = true;
    tile.mesh.name = "Wildflowers, seed heads, heather and moss";
    group.add(tile.mesh);
    delete tile.positions;
    delete tile.colours;
    delete tile.flexes;
  }
  group.userData.flora = stats;
  return {
    update({ camera }) {
      for (const tile of tiles)
        tile.mesh.visible =
          (tile.x - camera.position.x) ** 2 +
            (tile.z - camera.position.z) ** 2 <
          65 ** 2;
    },
    dispose() {
      group.removeFromParent();
      tiles.forEach((t) => t.mesh.geometry.dispose());
    },
  };
}
