import { spatialChunks } from "./spatial-chunks.js";
import { terrainMaterial } from "./land-materials.js";
import { terrainGeometry, shadowGeometry } from "./land-terrain.js";
import { buildRockSoil } from "./land-rocks-soil.js";
import { buildRocks } from "./land-rocks.js";
import { buildBackdrop } from "./land-backdrop.js";

/** The sim owns all reachable relief. LAND owns one continuous terrain skin,
 * instanced Blender basalt on the authoritative solids, and the distant skyline. */
export async function build(ctx) {
  const { T, sim, kit, scene, quality } = ctx;
  const resources = [],
    meshes = [],
    air = { value: new T.Color(0.45, 0.61, 0.78) };
  const geometry = terrainGeometry(T, sim, quality);
  resources.push(geometry);
  const litter = await new T.TextureLoader().loadAsync(
    "/assets/hash-wars/ground/litter.png",
  );
  litter.wrapS = litter.wrapT = T.RepeatWrapping;
  litter.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  resources.push(litter);
  const ground = new T.Mesh(
    geometry,
    terrainMaterial(kit, sim.SEA_Y, air, litter),
  );
  ground.name = "LAND continuous groundY terrain";
  ground.receiveShadow = true;
  // WATER reads the complete skin topology for its tidal film.
  ground.visible = false;
  scene.add(ground);
  meshes.push(ground);
  const frustum = new T.Frustum(),
    projection = new T.Matrix4();
  for (const chunk of spatialChunks(T, geometry, 96, { strips: true })) {
    const mesh = new T.Mesh(chunk, ground.material);
    mesh.name = "LAND culled terrain strip";
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    resources.push(chunk);
  }
  const casterGeometry = shadowGeometry(T, sim),
    casterMaterial = ground.material.clone();
  casterMaterial.onBeforeCompile = ground.material.onBeforeCompile;
  casterMaterial.customProgramCacheKey = ground.material.customProgramCacheKey;
  casterMaterial.colorWrite = casterMaterial.depthWrite = false;
  // Shadow maps default to back faces; this height sheet has only a top face.
  casterMaterial.shadowSide = T.FrontSide;
  const caster = new T.Mesh(casterGeometry, casterMaterial);
  caster.name = "LAND coarse sun-shadow caster";
  caster.castShadow = true;
  caster.layers.set(2); // Sun-only layer: no invisible colour-pass triangles.
  caster.userData.noSkyVis = true;
  scene.add(caster);
  meshes.push(caster);
  resources.push(casterGeometry, casterMaterial);
  const backdrop = buildBackdrop(ctx, air);
  await ctx.progress("Loading fractured basalt…");
  const rocks = await buildRocks(ctx);
  const soil = buildRockSoil(ctx);
  // Count package geometry once; the renderer's metrics separately include
  // shadow/post passes. Retained on the named ground mesh for read-only review.
  ground.userData.landStats = {
    quality,
    rocks: rocks.stats,
    soil: soil.stats,
    draws:
      meshes.length +
      backdrop.group.children.length +
      rocks.stats.draws +
      soil.stats.draws,
    triangles:
      meshes.reduce(
        (sum, m) =>
          sum +
          ((m.geometry.index?.count ?? m.geometry.attributes.position.count) /
            3) *
            (m.isInstancedMesh ? m.count : 1),
        0,
      ) +
      backdrop.group.children.reduce(
        (sum, m) => sum + m.geometry.index.count / 3,
        0,
      ) +
      rocks.stats.triangles +
      soil.stats.triangles,
  };
  return {
    update(frame) {
      const { camera, env } = frame;
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(
        projection.multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        ),
      );
      for (const mesh of meshes)
        if (mesh.name === "LAND culled terrain strip")
          mesh.visible = frustum.intersectsBox(mesh.geometry.boundingBox);
      if (env?.fog) air.value.copy(env.fog);
      backdrop.update(camera);
      rocks.update(frame);
    },
    dispose() {
      backdrop.dispose();
      rocks.dispose();
      soil.dispose();
      meshes.forEach((m) => {
        m.removeFromParent();
        if (m.isInstancedMesh) m.dispose();
      });
      resources.forEach((g) => g.dispose());
    },
  };
}
