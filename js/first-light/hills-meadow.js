import { buildGrass } from "./hills-grass.js";
import { surface } from "./surfaces.js";
import { random, height } from "./hills.js";

// Authored five-petal meadow flowers: actual petal geometry, no alpha cards.
function flowerGeometry(T) {
  const p = [],
    indices = [];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 0.4,
      b = a + 0.49,
      c = a - 0.49,
      n = p.length / 3;
    p.push(
      0,
      0,
      0,
      Math.cos(c) * 0.72,
      0.14,
      Math.sin(c) * 0.72,
      Math.cos(a),
      0.06,
      Math.sin(a),
      Math.cos(b) * 0.72,
      0.14,
      Math.sin(b) * 0.72,
    );
    indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// Thorn sprays with narrow folded leaves, rather than spherical shrub blobs.
function brambleGeometry(T) {
  const p = [],
    index = [];
  function triangle(a, b, c) {
    const n = p.length / 3;
    p.push(...a, ...b, ...c);
    index.push(n, n + 1, n + 2);
  }
  for (let i = 0; i < 7; i++) {
    const a = i * 2.399,
      r = 0.48 + (i % 3) * 0.16,
      h = 0.5 + (i % 4) * 0.17;
    const tip = [Math.cos(a) * r, h, Math.sin(a) * r];
    triangle([-0.025, 0, 0], [0.025, 0, 0], tip);
    triangle([0, 0, -0.025], tip, [0, 0, 0.025]);
    for (let j = 1; j <= 4; j++) {
      const t = j / 5,
        x = tip[0] * t,
        y = h * t,
        z = tip[2] * t;
      for (const side of [-1, 1]) {
        const angle = a + side * 1.1,
          dx = Math.cos(angle) * 0.25,
          dz = Math.sin(angle) * 0.25;
        triangle(
          [x, y, z],
          [x + dx * 0.48 - dz * 0.14, y + 0.07, z + dz * 0.48 + dx * 0.14],
          [x + dx, y + 0.16, z + dz],
        );
        triangle(
          [x, y, z],
          [x + dx, y + 0.16, z + dz],
          [x + dx * 0.48 + dz * 0.14, y + 0.045, z + dz * 0.48 - dx * 0.14],
        );
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function buildMeadow(ctx, stone) {
  const { T, sim, kit, quality, zoneGroup, scene } = ctx;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = {
    meadowTime: { value: 0 },
    meadowWind: kit.uniforms.wind,
    meadowSun: { value: new T.Vector3(0.5, 0.12, -0.866) },
    meadowEye: { value: new T.Vector3() },
  };
  const ownedInstances = [];
  const clearings = [];
  const rng = random(518),
    dummy = new T.Object3D(),
    colour = new T.Color();
  const brambleGeo = brambleGeometry(T);
  const flower = flowerGeometry(T),
    stem = new T.CylinderGeometry(0.003, 0.006, 1, 3);
  const clover = new T.SphereGeometry(1, 5, 3);
  const plants = kit.material({
    color: 0x485a19,
    roughness: 0.93,
    side: T.DoubleSide,
  });
  const petals = kit.material({
    color: 0xffffff,
    roughness: 0.8,
    side: T.DoubleSide,
  });
  const seed = kit.material({ color: 0x8d7e44, roughness: 0.95 });
  const rock = surface(kit, "rock", { scale: 0.65, tint: 0x9ba477 });
  for (const [zone, z0, z1] of [
    [4, -210, -160],
    [5, -250, -210],
    [6, -281, -250],
  ]) {
    const n = { low: 65, high: 220, ultra: 440 }[quality];
    const heads = new T.InstancedMesh(flower, petals, n),
      stems = new T.InstancedMesh(stem, plants, n);
    const leaves = new T.InstancedMesh(clover, plants, n * 3),
      seeds = new T.InstancedMesh(clover, seed, n);
    for (let i = 0; i < n; i++) {
      const drift = Math.floor(i / 22),
        x =
          (drift % 2 ? 21.55 : 18.45) +
          Math.sin(drift * 3.1) * 0.7 +
          (rng() - 0.5) * 1.4,
        z = z0 + ((drift * 0.618) % 1) * (z1 - z0) + (rng() - 0.5) * 3,
        y = height(sim, x, z);
      const h = 0.28 + rng() * 0.48;
      dummy.position.set(x, y + h * 0.5, z);
      dummy.rotation.set(0, rng() * 6.28, (rng() - 0.5) * 0.25);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      dummy.position.y = y + h;
      dummy.rotation.set(
        (rng() - 0.5) * 0.4,
        rng() * 6.28,
        (rng() - 0.5) * 0.4,
      );
      dummy.scale.setScalar(0.022 + rng() * 0.025);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      colour.set(i % 6 === 0 ? 0x71658c : i % 3 === 0 ? 0xf5e5ab : 0xe8e4c7);
      heads.setColorAt(i, colour);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.094;
        dummy.position.set(
          x + Math.cos(a) * 0.04,
          y + 0.04,
          z + Math.sin(a) * 0.04,
        );
        dummy.rotation.set(0, -a, 0);
        dummy.scale.set(0.052, 0.012, 0.035);
        dummy.updateMatrix();
        leaves.setMatrixAt(i * 3 + k, dummy.matrix);
      }
      dummy.position.set(x, y + h, z);
      dummy.scale.set(0.012, 0.065, 0.012);
      dummy.updateMatrix();
      seeds.setMatrixAt(i, dummy.matrix);
    }
    heads.receiveShadow =
      stems.receiveShadow =
      leaves.receiveShadow =
      seeds.receiveShadow =
        true;
    for (const mesh of [heads, stems, leaves, seeds]) {
      mesh.userData.noReflect = true;
      mesh.userData.noSkyVis = true;
    }
    zoneGroup(zone).add(heads, stems, leaves, seeds);
    ownedInstances.push(heads, stems, leaves, seeds);
    // Rocks remain outside the boundary stones; they cannot become surprise solids.
    const rocks = new T.InstancedMesh(stone, rock, 38),
      bramble = new T.InstancedMesh(
        brambleGeo,
        plants,
        quality === "low" ? 45 : 100,
      );
    for (let i = 0; i < 38; i++) {
      const trailStone = i % 3 === 0;
      const x = trailStone
          ? 20 + (rng() - 0.5) * 2.5
          : i % 2
            ? 27.55 + rng() * 2
            : 12.85 - rng() * 2,
        z = z0 + rng() * (z1 - z0),
        r = trailStone ? 0.025 + rng() * 0.07 : 0.14 + rng() * 0.45;
      clearings.push([x, z, r * 0.8]);
      dummy.position.set(x, height(sim, x, z) + r * 0.13, z);
      dummy.scale.set(r * 1.7, r * (trailStone ? 0.3 : 0.55), r * 1.4);
      dummy.rotation.set(rng(), rng() * 3, rng() * 0.3);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < bramble.count; i++) {
      const x = i % 2 ? 27.8 + rng() * 1.8 : 12.4 - rng() * 1.7,
        z = z0 + rng() * (z1 - z0);
      dummy.position.set(x, height(sim, x, z) - 0.025, z);
      dummy.scale.set(
        0.2 + rng() * 0.4,
        0.24 + rng() * 0.35,
        0.3 + rng() * 0.4,
      );
      dummy.rotation.set(rng(), rng() * 6, rng());
      dummy.updateMatrix();
      bramble.setMatrixAt(i, dummy.matrix);
      colour.setRGB(0.25 + rng() * 0.15, 0.32 + rng() * 0.15, 0.08);
      bramble.setColorAt(i, colour);
    }
    rocks.userData.noReflect = bramble.userData.noReflect = true;
    rocks.castShadow = rocks.receiveShadow = true;
    bramble.receiveShadow = true;
    bramble.userData.noSkyVis = true;
    zoneGroup(zone).add(rocks, bramble);
    ownedInstances.push(rocks, bramble);
  }
  const grass = buildGrass(ctx, clearings);
  // Valley mist is a bounded stack of soft horizontal volumes, never a hard quad.
  const mistGroup = new T.Group();
  mistGroup.name = "HILLS valley mist";
  const mistMaterial = kit.material({
    color: 0xaab9b3,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    side: T.DoubleSide,
    roughness: 1,
  });
  const mistBase = mistMaterial.onBeforeCompile;
  mistMaterial.onBeforeCompile = (s, r) => {
    mistBase.call(mistMaterial, s, r);
    s.uniforms.meadowTime = motion.meadowTime;
    s.vertexShader = "varying vec2 mistUV;\n" + s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nmistUV=uv;",
    );
    s.fragmentShader =
      "varying vec2 mistUV;uniform float meadowTime;\n" + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
vec2 mistP=mistUV-.5;float feather=1.-smoothstep(.12,.5,length(mistP));
float billow=.65+.35*sin(mistUV.x*23.+sin(mistUV.y*17.+meadowTime*.05)*2.);
diffuseColor.a*=feather*billow;`,
    );
  };
  mistMaterial.customProgramCacheKey = () => "hills-valley-mist-v1";
  const mistGeo = new T.PlaneGeometry(1, 1);
  const mist = new T.InstancedMesh(mistGeo, mistMaterial, 18);
  for (let i = 0; i < 18; i++) {
    const x = i % 2 ? 75 : -53,
      z = -174 - rng() * 140;
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.position.set(x, height(sim, x, z) + 1.5 + rng() * 2, z);
    dummy.scale.set(85, 45, 1);
    dummy.updateMatrix();
    mist.setMatrixAt(i, dummy.matrix);
  }
  mistGroup.add(mist);
  ownedInstances.push(mist);
  mistGroup.traverse((o) => {
    o.userData.noReflect = true;
  });
  scene.add(mistGroup);
  const pollen = kit.particles(quality === "low" ? 35 : 90, {
    colour: 0xffe1a4,
    size: 0.009,
    opacity: 0.22,
  });
  pollen.userData.noReflect = true;
  pollen.frustumCulled = false;
  const motes = Array.from(
    { length: pollen.geometry.attributes.position.count },
    () => [rng() * 2 - 1, rng(), rng() * 2 - 1],
  );
  zoneGroup(5).add(pollen);
  const dew = kit.particles(quality === "low" ? 80 : 190, {
    colour: 0xf5eac4,
    size: 0.007,
    opacity: 0.22,
  });
  dew.userData.noReflect = true;
  const dp = dew.geometry.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const x = 14 + rng() * 12,
      z = -160 - rng() * 119;
    dp.setXYZ(i, x, height(sim, x, z) + 0.18 + rng() * 0.22, z);
  }
  zoneGroup(5).add(dew);
  return {
    update({ snapshot, time, camera, env }) {
      grass.update({ snapshot, time, camera, env });
      motion.meadowTime.value = reduced ? 0 : time;
      motion.meadowSun.value.copy(env.sunDir);
      motion.meadowEye.value.copy(camera.position);
      mistGroup.visible = snapshot.zone >= 3;
      const p = pollen.geometry.attributes.position;
      motes.forEach(([x, y, z], i) => {
        const t = reduced ? 0 : time;
        const wx = camera.position.x + x * 11 + Math.sin(t * 0.15 + i) * 0.35,
          wz = camera.position.z + z * 14;
        p.setXYZ(
          i,
          wx,
          height(sim, wx, wz) + 0.4 + y * 3 + Math.sin(t * 0.22 + i) * 0.15,
          wz,
        );
      });
      p.needsUpdate = true;
      pollen.material.opacity = Math.min(0.22, Math.max(0, env.sunDir.y) * 1.5);
    },
    dispose() {
      ownedInstances.forEach((mesh) => mesh.dispose());
      scene.remove(mistGroup);
      mistGeo.dispose();
      grass.dispose();
      flower.dispose();
      stem.dispose();
      clover.dispose();
      brambleGeo.dispose();
    },
  };
}
