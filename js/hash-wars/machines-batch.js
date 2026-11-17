/** Draw repeated rigid parts together; original nodes still drive IK, damage
 * and wreck transforms. Instance attributes retain per-rig light animation. */
export function batchMachines(T, root, actors) {
  const groups = new Map();
  for (const actor of actors)
    for (const rig of [actor.near, actor.far])
      for (const mesh of rig.meshes) {
        const material = mesh.material;
        if (
          Array.isArray(material) ||
          (material.transparent && material.name.startsWith("emit:"))
        )
          continue;
        const key = `${material.name.startsWith("emit:") ? mesh.geometry.uuid + ":" + material.name : material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
        if (!groups.has(key))
          groups.set(key, {
            sources: [],
            material,
            geometry: mesh.geometry,
            casts: mesh.castShadow,
            receives: mesh.receiveShadow,
          });
        groups.get(key).sources.push(mesh);
      }
  const batches = [];
  for (const group of groups.values()) {
    if (group.sources.length < 2) continue;
    const emissive = group.material.name.startsWith("emit:");
    if (!emissive) {
      const geometries = new Map(
        group.sources.map((source) => [source.geometry, -1]),
      );
      let vertices = 0,
        indices = 0;
      for (const geometry of geometries.keys()) {
        vertices += geometry.attributes.position.count;
        indices += geometry.index?.count ?? 0;
      }
      const mesh = new T.BatchedMesh(
        group.sources.length,
        vertices,
        indices,
        group.material,
      );
      mesh.name = "Cartel material batches";
      mesh.castShadow = group.casts;
      mesh.receiveShadow = group.receives;
      mesh.userData.noSkyVis = true;
      // The built-in batch tests each part against each render/shadow camera.
      mesh.frustumCulled = false;
      for (const geometry of geometries.keys())
        geometries.set(geometry, mesh.addGeometry(geometry));
      for (const source of group.sources) {
        mesh.addInstance(geometries.get(source.geometry));
        source.layers.set(1);
      }
      root.add(mesh);
      batches.push({ mesh, sources: group.sources });
      continue;
    }
    const geometry = emissive ? group.geometry.clone() : group.geometry;
    const material = emissive ? group.material.clone() : group.material;
    let emission;
    if (emissive) {
      emission = new T.InstancedBufferAttribute(
        new Float32Array(group.sources.length * 3),
        3,
      ).setUsage(T.DynamicDrawUsage);
      geometry.setAttribute("hwEmission", emission);
      material.color.set(0xffffff);
      material.emissive.set(0xffffff);
      material.emissiveIntensity = 1;
      material.onBeforeCompile = (shader) => {
        shader.vertexShader =
          "attribute vec3 hwEmission; varying vec3 hwEmit;\n" +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nhwEmit=hwEmission;",
        );
        shader.fragmentShader =
          "varying vec3 hwEmit;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance*=hwEmit;",
        );
      };
      material.customProgramCacheKey = () => "hw-batched-emission";
    }
    const mesh = new T.InstancedMesh(geometry, material, group.sources.length);
    if (emissive)
      for (let i = 0; i < group.sources.length; i++)
        mesh.setColorAt(i, group.sources[i].material.color);
    mesh.name = "Cartel repeated rigid parts";
    mesh.castShadow = group.casts;
    mesh.receiveShadow = group.receives;
    mesh.userData.noSkyVis = true;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    root.add(mesh);
    // Layer 1 is never rendered by the world or its shadow camera.
    for (const source of group.sources) source.layers.set(1);
    batches.push({ mesh, sources: group.sources, emission });
  }
  return {
    update() {
      root.updateMatrixWorld(true);
      for (const { mesh, sources, emission } of batches) {
        let count = 0;
        for (const source of sources) {
          let visible = true;
          for (let node = source; node && node !== root; node = node.parent)
            if (!node.visible) {
              visible = false;
              break;
            }
          if (mesh.isBatchedMesh) {
            mesh.setVisibleAt(count, visible);
            if (visible) mesh.setMatrixAt(count, source.matrixWorld);
            count++;
          } else if (visible) {
            mesh.setMatrixAt(count, source.matrixWorld);
            if (emission) {
              const m = source.material,
                e = m.emissive,
                intensity = m.emissiveIntensity;
              emission.setXYZ(
                count,
                e.r * intensity,
                e.g * intensity,
                e.b * intensity,
              );
              mesh.setColorAt(count, m.color);
            }
            count++;
          }
        }
        if (mesh.isBatchedMesh) continue;
        mesh.count = count;
        mesh.visible = count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (emission) {
          emission.needsUpdate = true;
          mesh.instanceColor.needsUpdate = true;
        }
        if (count) mesh.computeBoundingSphere();
      }
    },
    dispose() {
      for (const { mesh, emission } of batches) {
        mesh.removeFromParent();
        mesh.dispose();
        if (emission) {
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
      }
    },
  };
}
