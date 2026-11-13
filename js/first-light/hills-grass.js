import { height, smooth } from "./hills.js";

// Fixed world cells wrap around the eye. Hashes use the unwrapped world cell,
// so crossing a grid boundary never moves or recolours an existing tuft.
export function buildGrass({ T, sim, kit, quality, scene }, clearings = []) {
  const size = 512,
    data = new Float32Array(size * size * 4);
  // Include the 45 m far ring beyond the last playable summit position.
  const bounds = new T.Vector4(-110, -380, 260, 230);
  const solids = sim.layout.filter((b) => b.zone >= 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const x = bounds.x + ((i + 0.5) / size) * bounds.z;
      const z = bounds.y + ((j + 0.5) / size) * bounds.w;
      const centre =
        20 + Math.sin(z * 0.079) * 0.26 + Math.sin(z * 0.19) * 0.12;
      const trail = Math.abs(x - centre);
      let mask = smooth(0.56 + Math.sin(z * 2.1) * 0.12, 1.35, trail);
      // A broken grassy centre between the two worn walking ruts.
      mask = Math.max(
        mask,
        (1 - smooth(0.13, 0.34, trail)) *
          (0.35 + 0.2 * Math.sin(z * 0.73) ** 2),
      );
      if (z > -160) mask = 0;
      const h = height(sim, x, z),
        k = (j * size + i) * 4;
      data[k] = h;
      data[k + 1] = mask;
    }
  // Neighbouring heights share the exact field grid: one height evaluation per
  // texel, rather than five. One-sided differences seal the outer border.
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const left = Math.max(0, i - 1),
        right = Math.min(size - 1, i + 1);
      const down = Math.max(0, j - 1),
        up = Math.min(size - 1, j + 1),
        k = (j * size + i) * 4;
      data[k + 2] =
        (data[(j * size + right) * 4] - data[(j * size + left) * 4]) /
        (((right - left) * bounds.z) / size);
      data[k + 3] =
        (data[(up * size + i) * 4] - data[(down * size + i) * 4]) /
        (((up - down) * bounds.w) / size);
    }
  // Rasterize only the footprints, instead of testing every texel against
  // every prop. This also excludes decorative rocks beyond the solid walls.
  function clear(x0, z0, x1, z1, circle) {
    const i0 = Math.max(0, Math.floor(((x0 - bounds.x) / bounds.z) * size));
    const i1 = Math.min(
      size - 1,
      Math.ceil(((x1 - bounds.x) / bounds.z) * size),
    );
    const j0 = Math.max(0, Math.floor(((z0 - bounds.y) / bounds.w) * size));
    const j1 = Math.min(
      size - 1,
      Math.ceil(((z1 - bounds.y) / bounds.w) * size),
    );
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = bounds.x + ((i + 0.5) / size) * bounds.z,
          z = bounds.y + ((j + 0.5) / size) * bounds.w;
        if (!circle || Math.hypot(x - circle[0], z - circle[1]) < circle[2])
          data[(j * size + i) * 4 + 1] = 0;
      }
  }
  for (const b of solids)
    clear(b.min[0] - 0.08, b.min[2] - 0.08, b.max[0] + 0.08, b.max[2] + 0.08);
  for (const [x, z, r] of [...clearings, [31, -287, 1.5]])
    clear(x - r, z - r, x + r, z + r, [x, z, r]);
  const field = new T.DataTexture(data, size, size, T.RGBAFormat, T.FloatType);
  field.minFilter = field.magFilter = T.LinearFilter;
  field.needsUpdate = true;
  const gust = kit.bake({
    size: 128,
    wrapS: T.RepeatWrapping,
    wrapT: T.RepeatWrapping,
    fragment:
      "void main(){float n=fbm(vec3(vUv*8.,3.));gl_FragColor=vec4(vec3(n),1.);}",
  });
  const uniforms = {
    grassField: { value: field },
    grassBounds: { value: bounds },
    grassGust: { value: gust.texture },
    grassEye: { value: new T.Vector3() },
    grassTime: { value: 0 },
    grassWind: kit.uniforms.wind,
    grassSun: { value: new T.Vector3() },
    grassPixel: { value: 0.0014 },
  };
  const group = new T.Group();
  group.name = "HILLS camera meadow";
  scene.add(group);
  const spacing = { low: 0.2, high: 0.15, ultra: 0.09 }[quality];
  const meshes = [];
  for (const far of [false, true]) {
    const cell = far
      ? { low: 0.2, high: 0.13, ultra: 0.09 }[quality] * 3.8 * Math.sqrt(3)
      : spacing;
    const span = far
      ? Math.floor(90 / cell)
      : Math.ceil((quality === "high" ? 40 : 28) / cell);
    const tufts = far ? 2 : quality === "ultra" ? 3 : 2;
    const g = new T.InstancedBufferGeometry();
    const positions = far
      ? [
          -0.18, 0, 0, 0.18, 0, 0, -0.5, 0.78, 0.1, -0.18, 0, 0, 0.18, 0, 0, 0,
          1, 0.25, -0.18, 0, 0, 0.18, 0, 0, 0.5, 0.86, -0.1,
        ]
      : quality === "ultra"
        ? [
            -0.5, 0, 0, 0.5, 0, 0, -0.34, 0.38, 0.04, 0.34, 0.38, 0.04, -0.15,
            0.75, 0.16, 0.15, 0.75, 0.16, 0, 1, 0.3,
          ]
        : [0, 0, 0, -0.5, 0.5, 0.05, 0.5, 0.5, 0.05, 0, 1, 0.2];
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setAttribute(
      "normal",
      new T.Float32BufferAttribute(
        positions.map((_, i) => (i % 3 === 1 ? 1 : 0)),
        3,
      ),
    );
    g.setIndex(
      far
        ? [0, 1, 2, 3, 4, 5, 6, 7, 8]
        : quality === "ultra"
          ? [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]
          : [0, 1, 2, 1, 3, 2],
    );
    const ids = new Float32Array(span * span * tufts * 3);
    for (let i = 0; i < span * span * tufts; i++) {
      const c = Math.floor(i / tufts);
      ids[i * 3] = c % span;
      ids[i * 3 + 1] = Math.floor(c / span);
      ids[i * 3 + 2] = i % tufts;
    }
    g.setAttribute("grassCell", new T.InstancedBufferAttribute(ids, 3));
    g.instanceCount = ids.length / 3;
    const m = kit.material({
      color: 0xffffff,
      roughness: 0.88,
      side: T.DoubleSide,
    });
    const base = m.onBeforeCompile;
    m.onBeforeCompile = (s, r) => {
      base.call(m, s, r);
      Object.assign(s.uniforms, uniforms);
      s.vertexShader =
        `attribute vec3 grassCell;
uniform sampler2D grassField,grassGust; uniform vec4 grassBounds;
uniform vec3 grassEye; uniform float grassTime,grassWind,grassPixel;
varying vec3 grassWorld; varying float grassTip,grassPatch,grassSeed,grassDry;
float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
` + s.vertexShader;
      s.vertexShader = s.vertexShader.replace(
        "#include <beginnormal_vertex>",
        `
vec2 grid=mod(grassCell.xy-floor(grassEye.xz/${cell.toFixed(5)}),${span.toFixed(1)})+floor(grassEye.xz/${cell.toFixed(5)})-${(span / 2).toFixed(1)};
float seed=gh(grid+grassCell.z*31.7);
vec2 xz=(grid+vec2(gh(grid),gh(grid+41.)))*${cell.toFixed(5)};
xz+=(vec2(seed,gh(grid+grassCell.z+81.))-.5)*${(cell * 0.8).toFixed(5)};
vec2 clumpCell=floor(xz/.42);
vec2 clumpCentre=(clumpCell+.5+(vec2(gh(clumpCell+3.1),gh(clumpCell+9.7))-.5)*.8)*.42;
float clumpSeed=gh(clumpCell+17.3);
xz=mix(xz,clumpCentre,.38*gh(clumpCell+grassCell.z*5.));
float clumpHeight=.6+.75*clumpSeed;
vec4 land=texture2D(grassField,(xz-grassBounds.xy)/grassBounds.zw);
vec3 root=vec3(xz.x,land.x-.025,xz.y);
float distanceTo=length(root.xz-grassEye.xz);
float ring=${far ? "smoothstep(9.,18.,distanceTo)*(1.-smoothstep(34.,45.,distanceTo))" : "step(smoothstep(9.,20.,distanceTo),gh(grid+seed*17.))"};
float growthPatch=.5+.25*sin(xz.x*.22+sin(xz.y*.16))+.25*sin(xz.y*.37+xz.x*.13);
float bladeHeight=${far ? "(.42+seed*.4)" : "(.28+seed*.42)"}*(.7+growthPatch*.5)*step(gh(grid+63.7),land.y)*mix(.18,1.,smoothstep(.25,.85,land.y))*ring*clumpHeight;
float angle=mix(seed,gh(clumpCell+29.)+(seed-.5)*.25,.7)*6.2831853;
vec2 growthDirection=vec2(cos(angle),sin(angle));
vec2 facing=growthDirection;
vec2 toEye=normalize(grassEye.xz-root.xz+vec2(.001));
vec2 cameraRight=vec2(toEye.y,-toEye.x);
if(dot(facing,cameraRight)<0.)cameraRight=-cameraRight;
facing=normalize(mix(facing,cameraRight,.4));
float width=${far ? "(.25+seed*.15)" : "(.012+seed*.013)"};
width=max(width,distanceTo*grassPixel*.7);
vec3 across=vec3(facing.x,0.,facing.y),faceN=vec3(-facing.y,0.,facing.x);
vec3 ground=normalize(vec3(-land.z,1.,-land.w));
vec3 blade=normalize(faceN*.55+ground+across*position.x*1.4);
vec3 objectNormal=normalize(mix(blade,ground,smoothstep(8.,34.,distanceTo)*.7));
vec3 objectTangent=vec3(1.,0.,0.);
`,
      );
      s.vertexShader = s.vertexShader.replace(
        "#include <begin_vertex>",
        `
float wave=texture2D(grassGust,xz*.013-vec2(grassTime*.017,grassTime*.007)).r*2.-.7;
float windAngle=.5+(clumpSeed-.5)*.87;
vec2 lean=growthDirection*(.12+clumpSeed*.22)+vec2(cos(windAngle),sin(windAngle))*wave*grassWind;
vec3 transformed=root+vec3(facing.x*position.x*width,position.y*bladeHeight,facing.y*position.x*width);
transformed.xz+=lean*position.y*position.y*bladeHeight;
grassTip=position.y;grassPatch=mix(growthPatch,clumpSeed,.32);grassSeed=seed;grassDry=growthPatch*.65+clumpSeed*.35;grassWorld=transformed;
`,
      );
      s.vertexShader = s.vertexShader.replace(
        "#include <shadowmap_vertex>",
        T.ShaderChunk.shadowmap_vertex.replaceAll(
          "worldPosition",
          "vec4(root,1.)",
        ),
      );
      s.fragmentShader =
        "varying vec3 grassWorld; varying float grassTip,grassPatch,grassSeed,grassDry; uniform vec3 grassEye,grassSun;\n" +
        s.fragmentShader;
      s.fragmentShader = s.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 lush=vec3(.115,.21,.035),pale=vec3(.30,.36,.10),dry=vec3(.42,.36,.16);
vec3 grassColour=mix(lush,pale,grassPatch);
grassColour=mix(grassColour,dry,smoothstep(.55,.95,grassDry)*.7);
grassColour*=mix(.25,1.,smoothstep(0.,.55,grassTip));
grassColour=mix(grassColour,grassColour*vec3(1.25,1.2,.8),grassTip*grassTip*.5);
diffuseColor.rgb*=grassColour;`,
      );
      s.fragmentShader = s.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor=mix(.4,.68,grassSeed);",
      );
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
#if NUM_DIR_LIGHTS > 0
float through=pow(max(0.,dot(normalize(grassWorld-grassEye),grassSun)),2.)*.9+.12;
float visibility=1.;
#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
visibility=getShadow(directionalShadowMap[0],directionalLightShadows[0].shadowMapSize,directionalLightShadows[0].shadowIntensity,directionalLightShadows[0].shadowBias,directionalLightShadows[0].shadowRadius,vDirectionalShadowCoord[0]);
#endif
reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.15,1.,.55)*directionalLights[0].color*through*(.25+.75*grassTip)*visibility*smoothstep(-.01,.06,grassSun.y);
#endif`,
      );
    };
    m.customProgramCacheKey = () => `hills-grid-grass-${quality}-${far}-1`;
    const mesh = new T.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.userData.noReflect = true;
    mesh.userData.noSkyVis = true;
    mesh.name = `HILLS ${far ? "far" : "near"} grass (${g.instanceCount} blades)`;
    group.add(mesh);
    meshes.push(mesh);
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    update({ camera, time, env, snapshot }) {
      uniforms.grassEye.value.copy(camera.position);
      uniforms.grassSun.value.copy(env.sunDir);
      uniforms.grassTime.value = reduced ? 0 : time;
      // Use viewport height without reaching into the renderer or post chain.
      uniforms.grassPixel.value =
        (2 * Math.tan((camera.fov * Math.PI) / 360)) /
        Math.max(240, window.innerHeight);
      // Before this point even the far ring is wholly below the meadow bank.
      group.visible = snapshot.zone >= 3 && camera.position.z <= -115;
    },
    dispose() {
      scene.remove(group);
      meshes.forEach((m) => m.geometry.dispose());
      field.dispose();
    },
  };
}
