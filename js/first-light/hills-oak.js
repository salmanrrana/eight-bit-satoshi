import { surface } from "./surfaces.js";
import { random, height } from "./hills.js";

// Four twig clusters of lobed oak leaves. Explicit alpha-coverage mip levels
// keep the crown's silhouette from thinning as the camera backs away.
export function leafTexture(T) {
  const c = document.createElement("canvas"),
    normal = document.createElement("canvas");
  c.width = c.height = normal.width = normal.height = 512;
  const ctx = c.getContext("2d"),
    nx = normal.getContext("2d"),
    rng = random(909);
  nx.fillStyle = "#8080ff";
  nx.fillRect(0, 0, 512, 512);
  for (let tile = 0; tile < 4; tile++)
    for (let i = 0; i < 18; i++) {
      const angle = rng() * 6.28,
        radius = Math.sqrt(rng()) * 86;
      const x = (tile % 2) * 256 + 128 + Math.cos(angle) * radius,
        y = Math.floor(tile / 2) * 256 + 128 + Math.sin(angle) * radius;
      const rot = angle + rng(),
        w = 12 + rng() * 7,
        h = 27 + rng() * 10;
      for (const [p, n] of [
        [ctx, false],
        [nx, true],
      ]) {
        p.save();
        p.translate(x, y);
        p.rotate(rot);
        const grad = p.createLinearGradient(-w, 0, w, 0);
        grad.addColorStop(0, n ? "#6886e8" : "#687e39");
        grad.addColorStop(0.5, n ? "#809bfa" : "#99ad5e");
        grad.addColorStop(1, n ? "#9886e8" : "#7a9146");
        p.fillStyle = grad;
        const outline = [];
        for (const side of [1, -1])
          for (let k = 0; k < 12; k++) {
            const t = (side === 1 ? k : 11 - k) / 11;
            outline.push([
              side * Math.sin(Math.PI * t) * w * (k % 2 ? 0.58 : 1),
              -h + t * h * 2,
            ]);
          }
        p.beginPath();
        p.moveTo(0, -h);
        outline.forEach(([px, py], k) => {
          const next = outline[(k + 1) % outline.length];
          p.quadraticCurveTo(
            px,
            py,
            (px + next[0]) * 0.5,
            (py + next[1]) * 0.5,
          );
        });
        p.closePath();
        p.fill();
        if (!n) {
          p.strokeStyle = "rgba(177,184,108,.48)";
          p.lineWidth = 0.8;
          p.beginPath();
          p.moveTo(0, -h);
          p.lineTo(0, h + 5);
          p.stroke();
        }
        p.restore();
      }
    }
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  const pixels = ctx.getImageData(0, 0, 512, 512).data;
  let covered = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 107) covered++;
  const target = covered / (512 * 512);
  texture.mipmaps = [c];
  for (let size = 256; size >= 1; size /= 2) {
    const mip = document.createElement("canvas");
    mip.width = mip.height = size;
    const m = mip.getContext("2d");
    m.drawImage(c, 0, 0, size, size);
    const image = m.getImageData(0, 0, size, size),
      d = image.data;
    let lo = 0.2,
      hi = 5;
    for (let k = 0; k < 12; k++) {
      const scale = (lo + hi) / 2;
      let hit = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] * scale > 107) hit++;
      if (hit / (size * size) < target) lo = scale;
      else hi = scale;
    }
    for (let i = 3; i < d.length; i += 4)
      d[i] = Math.min(255, (d[i] * (lo + hi)) / 2);
    m.putImageData(image, 0, 0);
    texture.mipmaps.push(mip);
  }
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const normalMap = new T.CanvasTexture(normal);
  normalMap.anisotropy = 4;
  return { texture, normalMap };
}

// Append a tapered, curved branch to one shared buffer (no draw per twig).
function appendBranch(T, buffers, points, radii, segments, radial, seed) {
  const curve = new T.CatmullRomCurve3(points),
    frames = curve.computeFrenetFrames(segments, false);
  const offset = buffers.p.length / 3,
    v = new T.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      centre = curve.getPoint(t),
      radius = radii[0] * (1 - t) + radii[1] * t;
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const ridge =
        1 +
        Math.sin(a * 7 + seed) * 0.075 +
        Math.sin(a * 13 + t * 4 + seed) * 0.035;
      v.copy(frames.normals[i])
        .multiplyScalar(Math.cos(a))
        .addScaledVector(frames.binormals[i], Math.sin(a));
      const pos = centre.clone().addScaledVector(v, radius * ridge);
      buffers.p.push(pos.x, pos.y, pos.z);
      buffers.n.push(v.x, v.y, v.z);
      buffers.uv.push(k / radial, t);
      if (i < segments && k < radial) {
        const j = offset + i * (radial + 1) + k;
        buffers.index.push(
          j,
          j + 1,
          j + radial + 1,
          j + 1,
          j + radial + 2,
          j + radial + 1,
        );
      }
    }
  }
}

export function buildOak({ T, sim, kit, quality, zoneGroup }) {
  const rng = random(94071),
    origin = new T.Vector3(31, height(sim, 31, -287), -287);
  const tree = new T.Group();
  tree.position.copy(origin);
  tree.scale.set(1.3, 1.12, 1.3);
  tree.name = "HILLS old summit oak";
  zoneGroup(6).add(tree);
  const buffers = { p: [], n: [], uv: [], index: [] },
    tips = [];
  appendBranch(
    T,
    buffers,
    [
      new T.Vector3(0, -0.15, 0),
      new T.Vector3(-0.15, 1.2, 0.1),
      new T.Vector3(0.2, 2.8, 0),
      new T.Vector3(-0.18, 4, 0.25),
    ],
    [1.05, 0.48],
    16,
    quality === "low" ? 12 : 24,
    1,
  );
  // Buttress roots enter the soil, never hover on it.
  for (let i = 0; i < 7; i++) {
    const a = (i * 6.28) / 7;
    appendBranch(
      T,
      buffers,
      [
        new T.Vector3(Math.cos(a) * 1.25, -0.06, Math.sin(a) * 1.25),
        new T.Vector3(Math.cos(a) * 0.63, 0.3, Math.sin(a) * 0.63),
        new T.Vector3(0, 0.95, 0),
      ],
      [0.08, 0.3],
      6,
      8,
      i,
    );
  }
  function grow(start, dir, len, r, depth, seed) {
    const end = start.clone().addScaledVector(dir, len);
    const middle = start
      .clone()
      .lerp(end, 0.48)
      .add(
        new T.Vector3(
          (rng() - 0.5) * 0.65,
          depth > 1 ? -0.35 : 0.08,
          (rng() - 0.5) * 0.65,
        ),
      );
    appendBranch(
      T,
      buffers,
      [start, middle, end],
      [r, r * 0.54],
      depth > 1 ? 7 : 4,
      depth > 1 ? 10 : 6,
      seed,
    );
    if (depth === 1) tips.push(end.clone());
    if (depth === 0) {
      tips.push(end);
      return;
    }
    const count = depth === 3 ? 3 : 2;
    for (let j = 0; j < count; j++) {
      const a = seed * 2.4 + j * 2.6 + rng();
      const next = dir
        .clone()
        .multiplyScalar(0.45)
        .add(
          new T.Vector3(
            Math.cos(a) * 0.64,
            0.36 + rng() * 0.32,
            Math.sin(a) * 0.64,
          ),
        )
        .normalize();
      grow(
        end,
        next,
        len * (0.6 + rng() * 0.12),
        r * 0.55,
        depth - 1,
        seed * 2.7 + j + 1,
      );
    }
  }
  for (let i = 0; i < 5; i++) {
    const a = i * 2.399,
      y = 2.6 + (i % 3) * 0.48;
    grow(
      new T.Vector3(0.02, y, 0.1),
      new T.Vector3(
        Math.cos(a) * 0.91,
        0.25 + rng() * 0.28,
        Math.sin(a) * 0.91,
      ).normalize(),
      2.9 + rng() * 1.1,
      0.39 + (i % 3) * 0.065,
      3,
      i + 1,
    );
  }
  // One ancient broken limb adds a readable interruption in the branching.
  appendBranch(
    T,
    buffers,
    [
      new T.Vector3(0, 2.1, 0),
      new T.Vector3(-0.8, 2.5, 0.6),
      new T.Vector3(-1.4, 2.6, 0.7),
    ],
    [0.22, 0.14],
    6,
    12,
    52,
  );
  const bark = surface(kit, "bark", { scale: 0.65, tint: 0xe4ded0 });
  const barkCompile = bark.onBeforeCompile;
  bark.onBeforeCompile = (s, r) => {
    barkCompile.call(bark, s, r);
    s.fragmentShader = s.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
float oakLichen=smoothstep(.66,.86,flNoise(flSurfaceWorld*3.7)+flNoise(flSurfaceWorld*19.)*.23);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.20,.215,.17),oakLichen*.55);`,
    );
  };
  bark.customProgramCacheKey = () => "hills-old-oak-bark-lichen";
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(buffers.p, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(buffers.n, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(buffers.uv, 2));
  g.setIndex(buffers.index);
  const trunk = new T.Mesh(g, bark);
  trunk.castShadow = trunk.receiveShadow = true;
  tree.add(trunk);
  const cut = new T.Mesh(
    new T.CircleGeometry(0.137, 16),
    surface(kit, "wood", { scale: 0.28, tint: 0x9b8969 }),
  );
  cut.position.set(-1.405, 2.602, 0.702);
  cut.quaternion.setFromUnitVectors(
    new T.Vector3(0, 0, 1),
    new T.Vector3(-0.6, 0.1, 0.1).normalize(),
  );
  cut.receiveShadow = true;
  tree.add(cut);
  const { texture, normalMap } = leafTexture(T),
    leaf = kit.material({
      color: 0xffffff,
      map: texture,
      normalMap,
      normalScale: new T.Vector2(0.22, 0.22),
      alphaTest: 0.42,
      side: T.DoubleSide,
      roughness: 0.85,
      alphaToCoverage: quality === "ultra",
    });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const uniforms = {
    oakTime: { value: 0 },
    oakWind: kit.uniforms.wind,
    oakSun: { value: new T.Vector3() },
    oakEye: { value: new T.Vector3() },
  };
  const base = leaf.onBeforeCompile;
  leaf.onBeforeCompile = (s, r) => {
    base.call(leaf, s, r);
    Object.assign(s.uniforms, uniforms);
    s.vertexShader =
      "attribute vec3 crownNormal; attribute float leafTile,leafAO; uniform float oakTime,oakWind;varying vec3 oakWorld;varying float crownAO;\n" +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <defaultnormal_vertex>",
      `#include <defaultnormal_vertex>
transformedNormal=normalMatrix*crownNormal;
`,
    );
    s.vertexShader = s.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
#ifdef USE_MAP
vMapUv=(uv+vec2(mod(leafTile,2.),floor(leafTile/2.)))*.5;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv=(uv+vec2(mod(leafTile,2.),floor(leafTile/2.)))*.5;
#endif`,
    );
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vec3 anchor=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
transformed.x+=sin(oakTime*.75+anchor.x*.7+anchor.z*.5)*uv.y*.09*oakWind/max(.05,length(instanceMatrix[0].xyz));
oakWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;crownAO=leafAO;`,
    );
    s.fragmentShader =
      "uniform vec3 oakSun,oakEye;varying vec3 oakWorld;varying float crownAO;\n" +
      s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      T.ShaderChunk.normal_fragment_begin.replace(
        "normal *= faceDirection;",
        "",
      ),
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
reflectedLight.indirectDiffuse*=crownAO;
#if NUM_DIR_LIGHTS > 0
float transmission=pow(max(0.,dot(normalize(oakWorld-oakEye),oakSun)),4.);
float leafShadow=1.;
#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
leafShadow=getShadow(directionalShadowMap[0],directionalLightShadows[0].shadowMapSize,directionalLightShadows[0].shadowIntensity,directionalLightShadows[0].shadowBias,directionalLightShadows[0].shadowRadius,vDirectionalShadowCoord[0]);
#endif
reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[0].color*transmission*.8*leafShadow*smoothstep(-.01,.06,oakSun.y);
#endif`,
    );
  };
  leaf.customProgramCacheKey = () => "hills-oak-clusters-v1";
  const count = { low: 3000, high: 8000, ultra: 15000 }[quality],
    geo = new T.PlaneGeometry(1, 1);
  const leaves = new T.InstancedMesh(geo, leaf, count),
    dummy = new T.Object3D(),
    colour = new T.Color();
  const normals = new Float32Array(count * 3),
    tiles = new Float32Array(count),
    aos = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const tip = tips[Math.floor(rng() * tips.length)],
      a = rng() * Math.PI * 2,
      v = rng() * 2 - 1,
      rr = Math.cbrt(rng());
    const radial = Math.sqrt(1 - v * v) * rr;
    dummy.position
      .copy(tip)
      .add(
        new T.Vector3(
          Math.cos(a) * radial * 1.25,
          v * rr * 0.95,
          Math.sin(a) * radial * 1.25,
        ),
      );
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI);
    const volumeNormal = dummy.position.clone().sub(tip).normalize();
    volumeNormal.y += 0.45;
    volumeNormal.normalize();
    normals.set(volumeNormal.toArray(), i * 3);
    tiles[i] = i % 4;
    aos[i] = 0.5 + rr * 0.5;
    const size = 0.48 + rng() * 0.35;
    dummy.scale.set(size, size, size);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    const shade = 0.67 + rng() * 0.48;
    colour.setRGB(shade, shade, 0.78 + shade * 0.13);
    leaves.setColorAt(i, colour);
  }
  geo.setAttribute("crownNormal", new T.InstancedBufferAttribute(normals, 3));
  geo.setAttribute("leafTile", new T.InstancedBufferAttribute(tiles, 1));
  geo.setAttribute("leafAO", new T.InstancedBufferAttribute(aos, 1));
  leaves.userData.noReflect = true;
  leaves.userData.noSkyVis = true;
  // Even the low-tier crown needs self-shadowing: without it the inner leaf
  // cards all transmit sunlight and the whole tree becomes a yellow cutout.
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  tree.add(leaves);
  // Alpha-tested shadow material is compiled at load along with the leaf surface.
  const depth = new T.MeshDepthMaterial({
    depthPacking: T.RGBADepthPacking,
    map: texture,
    alphaTest: 0.42,
    side: T.DoubleSide,
  });
  // Match atlas tiles in the shadow pass (created before compile-ahead).
  depth.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader =
      "attribute float leafTile;uniform float oakTime,oakWind;\n" +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vec3 anchor=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
transformed.x+=sin(oakTime*.75+anchor.x*.7+anchor.z*.5)*uv.y*.09*oakWind/max(.05,length(instanceMatrix[0].xyz));`,
    );
    s.vertexShader = s.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
vMapUv=(uv+vec2(mod(leafTile,2.),floor(leafTile/2.)))*.5;`,
    );
  };
  depth.customProgramCacheKey = () => "hills-oak-cluster-depth";
  leaves.customDepthMaterial = depth;
  return {
    tree,
    update({ time, camera, env }) {
      uniforms.oakTime.value = reduced ? 0 : time;
      uniforms.oakSun.value.copy(env.sunDir);
      uniforms.oakEye.value.copy(camera.position);
    },
    dispose() {
      leaves.dispose();
      texture.dispose();
      normalMap.dispose();
      depth.dispose();
      g.dispose();
      geo.dispose();
    },
  };
}
