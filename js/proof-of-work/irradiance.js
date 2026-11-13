import * as T from "three";

// A small room-space irradiance volume per power state. Secondary emitters
// represent light reflected by the floor/walls; visibility is baked against
// the shared collision geometry. Runtime cost is two filtered texture reads.
export async function bakeIrradiance(scene, progress) {
  const nx = 16,
    ny = 8,
    nz = 32;
  const volumes = [];
  const uniform = { value: null };
  const solids = window.ProofOfWork.layout.filter((o) =>
    ["rack", "column", "desk", "shell"].includes(o.kind),
  );
  function blocked(a, b) {
    return solids.some(({ bounds: [l, r, n, s], bottom = 0, height }) => {
      let near = 0.03,
        far = 0.97;
      for (const [axis, min, max] of [
        [0, l, r],
        [1, bottom, bottom + height],
        [2, n, s],
      ]) {
        const d = b[axis] - a[axis];
        if (Math.abs(d) < 0.0001) {
          if (a[axis] < min || a[axis] > max) return false;
        } else {
          const t1 = (min - a[axis]) / d,
            t2 = (max - a[axis]) / d;
          near = Math.max(near, Math.min(t1, t2));
          far = Math.min(far, Math.max(t1, t2));
        }
      }
      return near < far;
    });
  }
  for (let stage = 0; stage < 5; stage++) {
    const sources = [
      { p: [-1.15, 1, 4.4], c: [0.23, 0.12, 0.045], room: 0 },
      { p: [0.5, 0.3, -8], c: [0.13, 0.21, 0.3], room: 1 },
      { p: [-5.3, 1, -4], c: [0.12, 0.012, 0.004], room: 1 },
      { p: [5.3, 1, -11], c: [0.12, 0.012, 0.004], room: 1 },
    ];
    for (let i = 0; i < Math.min(3, stage); i++) {
      const x = [-2, 2, 0][i],
        z = [-4, -4, -11][i];
      sources.push({
        p: [x, 0.25, z],
        c: stage === 4 ? [1.1, 0.7, 0.38] : [0.55, 0.51, 0.4],
        room: 1,
      });
      sources.push({
        p: [x < 0 ? -5.3 : 5.3, 2.3, z],
        c: stage === 4 ? [0.5, 0.31, 0.16] : [0.25, 0.27, 0.24],
        room: 1,
      });
    }
    if (stage >= 3)
      sources.push({ p: [0, 0.3, -18.5], c: [0.6, 0.43, 0.25], room: 2 });
    const data = new Float32Array(nx * ny * nz * 4);
    for (let y = 0; y < ny; y++)
      for (let z = 0; z < nz; z++)
        for (let x = 0; x < nx; x++) {
          const p = [
            -6 + (12 * x) / (nx - 1),
            (6 * y) / (ny - 1),
            -21 + (29 * z) / (nz - 1),
          ];
          const room = p[2] > 0 ? 0 : p[2] < -16 ? 2 : 1;
          const width = room === 0 ? 1.5 : room === 2 ? 2 : 6;
          const edge = Math.max(
            0,
            Math.min(width - Math.abs(p[0]), p[1] + 0.1),
          );
          const rgb = [0.018, 0.025, 0.035].map(
            (c) => c * (0.3 + 0.7 * Math.min(1, edge)),
          );
          for (const src of sources) {
            if (src.room !== room) continue;
            const distance = p.reduce(
              (sum, v, i) => sum + (v - src.p[i]) ** 2,
              0,
            );
            const falloff =
              (blocked(p, src.p) ? 0.1 : 1) / (1 + distance * 0.17);
            src.c.forEach((v, i) => (rgb[i] += v * falloff));
          }
          data.set([...rgb, 1], ((z * ny + y) * nx + x) * 4);
        }
    const texture = new T.DataTexture(
      data,
      nx * ny,
      nz,
      T.RGBAFormat,
      T.FloatType,
    );
    texture.minFilter = texture.magFilter = T.LinearFilter;
    texture.needsUpdate = true;
    volumes.push(texture);
    await progress(`Baking bounce light ${stage + 1}/5`);
  }
  uniform.value = volumes[0];
  const materials = new Set();
  scene.traverse((o) => {
    if (o.material?.isMeshStandardMaterial) materials.add(o.material);
  });
  for (const material of materials) {
    const original = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader) => {
      original.call(material, shader);
      shader.uniforms.roomIrradiance = uniform;
      shader.vertexShader =
        "varying vec3 bouncePosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 bp=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          bp=instanceMatrix*bp;
        #endif
        bouncePosition=(modelMatrix*bp).xyz;`,
      );
      shader.fragmentShader =
        "uniform sampler2D roomIrradiance;varying vec3 bouncePosition;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_fragment_maps>",
        `#include <lights_fragment_maps>
        vec3 grid=clamp((bouncePosition-vec3(-6.,0.,-21.))/vec3(12.,6.,29.),0.,1.);
        float gy=grid.y*7.;float layer=floor(gy);
        vec2 uv=vec2((layer*16.+grid.x*15.+.5)/128.,(grid.z*31.+.5)/32.);
        vec3 bounce=mix(texture2D(roomIrradiance,uv).rgb,texture2D(roomIrradiance,uv+vec2(min(1.,7.-layer)*.125,0.)).rgb,fract(gy));
        irradiance+=bounce;`,
      );
      // Filter specular highlights using the actual perturbed normal footprint.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_physical_fragment>",
        `roughnessFactor=clamp(roughnessFactor+min(.18,max(length(dFdx(normal)),length(dFdy(normal)))*.22),.08,1.);
        #include <lights_physical_fragment>`,
      );
    };
    material.customProgramCacheKey = () => key + "-irradiance-v1";
  }
  return {
    setStage(stage) {
      uniform.value = volumes[stage];
    },
    dispose() {
      volumes.forEach((t) => t.dispose());
    },
  };
}
