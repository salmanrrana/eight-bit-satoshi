/** FIRST LIGHT shared content contract (metres, Y up; player.y = feet).
 * createKit(renderer, lighting, iblUniforms?) returns:
 * noiseGLSL: hash(vec3), noise3(vec3), fbm(vec3) GLSL functions.
 * uniforms: shared {time,rain,wetness,wind,skyAmbient}, each a three Uniform.
 *   Also flSkyVis/flSkyVisFloor: the baked sky-occlusion map (skyvis.js). Every
 *   kit material dims its sky light by it; custom shaders can include
 *   kit.skyVisibilityGLSL and call flSkyVisibility(worldPosition, worldNormal).
 * bake({fragment,size=512,uniforms={},type=HalfFloatType,wrapS,wrapT,anisotropy=8})
 *   -> owned RGBA render target. Defaults: HDR, clamp wrapping. Normalized PBR
 *   maps may use UnsignedByteType and RepeatWrapping; sampling is set before draw.
 * finishBakes(): backbone calls once after content build; releases bake shaders,
 *   retaining their textures. No bakes belong in the play loop.
 * material({color,roughness,...MeshStandardMaterial options}) -> owned PBR material.
 *   Shares weather uniforms via userData.environment; optional `weather:true`
 *   adds wetness roughness and procedural rain ripple normal variation.
 *   In the game, cached sky probes blend per material sample (no runtime bake).
 * text(text,{width=512,height=256,colour='#eee',background='#17202b',font=28})
 *   -> owned CanvasTexture. Multiline, centered. No external font/image load.
 * decal(texture,width,height) -> Mesh; put .001m above receiver, rotate as needed.
 * box(w,h,d,material,bevel=.04) -> Mesh; roundedBox geometry, centered origin.
 * roundedBox(w,h,d,r=.04) -> BufferGeometry; sphere(r,material) -> Mesh.
 * instances(geometry,material,matrices) -> InstancedMesh, matrices are Matrix4[].
 * particles(count,{colour,size,opacity}) -> Points; write geometry.position
 *   and mark needsUpdate; soft radial alpha, no depth write. No simulation.
 * addLightFixture({position:[x,y,z]|Vector3,colour,intensity,kind,downward?}) -> unregister().
 *   Register fixtures at build time. Never create lights in content modules.
 *   A shared mutable Color for colour can animate radiance without new lights.
 *   Lamps default to downward spill; signs and other kinds remain radial.
 *   Override downward with a boolean. Pool types/count and variants stay fixed.
 * object.userData.noReflect = true omits fine decoration from the STREET/RIVER
 *   planar passes. Their wrappers restore visibility; keep bank/wall silhouettes.
 * update(env,time): backbone only. dispose(): backbone only, releases owned
 *   textures, render targets, materials, geometries (modules dispose own extras).
 * Module build(ctx) -> {update({snapshot,dt,time,camera,env}),dispose()}.
 * Add content to ctx.zoneGroup(zone); do not reparent the camera or alter passes.
 * Every reachable solid must match FirstLight.layout. Non-solid decoration must
 * not look like a blocking surface. Layout min/max and groundY are authoritative.
 */
import * as T from "three";
import { noiseGLSL } from "./sky.js";
import { skyVisibilityGLSL } from "./skyvis.js";
export function createKit(renderer, lighting, iblUniforms = null) {
  const resources = new Set();
  const own = (r) => {
    resources.add(r);
    return r;
  };
  const uniforms = {
    time: { value: 0 },
    rain: { value: 1 },
    wetness: { value: 1 },
    wind: { value: 0.4 },
    skyAmbient: { value: new T.Color() },
    // Open sky everywhere until renderer.js bakes the real map after the build.
    flSkyVis: {
      value: own(new T.DataTexture(new Uint8Array([255, 255, 0, 255]), 1, 1)),
    },
    flSkyVisFloor: { value: 0.38 },
  };
  uniforms.flSkyVis.value.needsUpdate = true;
  const bakeMaterials = new Map();
  function bake({
    fragment,
    size = 512,
    uniforms: input = {},
    type = T.HalfFloatType,
    wrapS = T.ClampToEdgeWrapping,
    wrapT = T.ClampToEdgeWrapping,
    anisotropy = 8,
  }) {
    const rt = own(
      new T.WebGLRenderTarget(size, size, {
        type,
        wrapS,
        wrapT,
        depthBuffer: false,
        generateMipmaps: true,
        minFilter: T.LinearMipmapLinearFilter,
      }),
    );
    rt.texture.anisotropy = Math.min(
      anisotropy,
      renderer.capabilities.getMaxAnisotropy(),
    );
    let mat = bakeMaterials.get(fragment);
    if (!mat) {
      mat = own(
        new T.ShaderMaterial({
          uniforms: input,
          vertexShader:
            "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
          fragmentShader: `precision highp float;varying vec2 vUv;${noiseGLSL}\n${fragment}`,
        }),
      );
      bakeMaterials.set(fragment, mat);
    }
    for (const [name, uniform] of Object.entries(input)) {
      if (mat.uniforms[name]) mat.uniforms[name].value = uniform.value;
      else mat.uniforms[name] = uniform;
    }
    mat.uniformsNeedUpdate = true;
    const scene = new T.Scene(),
      geo = new T.PlaneGeometry(2, 2);
    scene.add(new T.Mesh(geo, mat));
    const old = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, new T.Camera());
    renderer.setRenderTarget(old);
    geo.dispose();
    return rt;
  }
  function material(options = {}) {
    const { weather = false, ...rest } = options;
    const m = own(new T.MeshStandardMaterial({ roughness: 0.8, ...rest }));
    m.userData.environment = uniforms;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      if (lighting.materialUniforms) {
        Object.assign(shader.uniforms, lighting.materialUniforms);
        shader.fragmentShader =
          "#if NUM_POINT_LIGHTS > 0\nuniform float flDownlight[NUM_POINT_LIGHTS];\n#endif\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <lights_fragment_begin>",
          T.ShaderChunk.lights_fragment_begin.replace(
            "getPointLightInfo( pointLight, geometryPosition, directLight );",
            `getPointLightInfo( pointLight, geometryPosition, directLight );
directLight.color *= mix(1., mix(.025, 1., smoothstep(-.12, .35,
  dot(directLight.direction, viewMatrix[1].xyz))), flDownlight[i]);`,
          ),
        );
      }
      if (iblUniforms) {
        Object.assign(shader.uniforms, iblUniforms);
        // Local to First Light materials; never mutate Three's shared chunks.
        const physicalIBL =
          T.ShaderChunk.envmap_physical_pars_fragment.replaceAll(
            "textureLod( envMap,",
            "flEnvironmentSample(",
          );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <envmap_physical_pars_fragment>",
          `#ifdef USE_ENVMAP
uniform samplerCube flProbeA, flProbeB;
uniform float flProbeBlend;
vec4 flEnvironmentSample(vec3 direction, float lod) {
  return mix(textureLod(flProbeA, direction, lod), textureLod(flProbeB, direction, lod), flProbeBlend);
}
#endif
${physicalIBL}`,
        );
      }
      shader.fragmentShader =
        "uniform float wetness,rain,time,wind;uniform vec3 skyAmbient;\n" +
        skyVisibilityGLSL +
        "\n" +
        shader.fragmentShader;
      // Sky light (diffuse and reflected) reaches only where sky is visible.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
{
float flSky=flSkyVisibility(cameraPosition-vViewPosition*mat3(viewMatrix),normalize(normal*mat3(viewMatrix)));
reflectedLight.indirectDiffuse*=flSky;
reflectedLight.indirectSpecular*=flSky;
}`,
      );
      // Derivative-based content normals can degenerate at grazing edges.
      // Fall back before BRDF evaluation, including its derived roughness.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_physical_fragment>",
        `if(any(isnan(normal)) || any(isinf(normal)) ||
isnan(roughnessFactor) || isinf(roughnessFactor)) {
  normal=nonPerturbedNormal;
  roughnessFactor=clamp(roughness,.05,1.);
}
#include <lights_physical_fragment>`,
      );
      if (weather) {
        shader.vertexShader = "varying vec3 flWorld;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vec4 flPosition=vec4(position,1.);
#ifdef USE_INSTANCING
flPosition=instanceMatrix*flPosition;
#endif
flWorld=(modelMatrix*flPosition).xyz;`,
        );
        shader.fragmentShader =
          "varying vec3 flWorld;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,max(.14,roughnessFactor*.45),wetness);",
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
float ripple=sin(length(fract(flWorld.xz*2.)-.5)*38.-time*3.);
normal=normalize(normal+vec3(dFdx(ripple),dFdy(ripple),0.)*.04*rain*wetness);`,
        );
      }
    };
    m.customProgramCacheKey = () =>
      `${weather ? "first-light-weather-v2" : "first-light-dry-v1"}-${iblUniforms ? "blended-sky" : "single-sky"}-finite-normals-skyvis-${lighting.materialUniforms ? "downlights" : "radial"}`;
    return m;
  }
  function roundedBox(w, h, d, r = 0.04) {
    r = Math.min(r, w / 2, h / 2, d / 2);
    const g = own(new T.BoxGeometry(w, h, d, 4, 4, 4)),
      p = g.attributes.position,
      n = g.attributes.normal;
    const v = new T.Vector3(),
      c = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(
        T.MathUtils.clamp(v.x, -w / 2 + r, w / 2 - r),
        T.MathUtils.clamp(v.y, -h / 2 + r, h / 2 - r),
        T.MathUtils.clamp(v.z, -d / 2 + r, d / 2 - r),
      );
      v.sub(c).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
      v.multiplyScalar(r).add(c);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeBoundingSphere();
    return g;
  }
  function text(
    text,
    {
      width = 512,
      height = 256,
      colour = "#eee",
      background = "#17202b",
      font = 28,
    } = {},
  ) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = colour;
    ctx.font = `${font}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = text.split("\n");
    lines.forEach((line, i) =>
      ctx.fillText(
        line,
        width / 2,
        height / 2 + (i - (lines.length - 1) / 2) * font * 1.3,
        width * 0.92,
      ),
    );
    const t = own(new T.CanvasTexture(c));
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  function particles(
    count,
    { colour = 0xffffff, size = 0.15, opacity = 0.3 } = {},
  ) {
    const g = own(new T.BufferGeometry());
    g.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(count * 3), 3),
    );
    const m = own(
      new T.PointsMaterial({
        color: colour,
        size,
        opacity,
        transparent: true,
        depthWrite: false,
      }),
    );
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace(
        "#include <opaque_fragment>",
        "diffuseColor.a *= (1.-smoothstep(.05,.5,length(gl_PointCoord-.5)));\n#include <opaque_fragment>",
      );
    };
    return new T.Points(g, m);
  }
  return {
    noiseGLSL,
    skyVisibilityGLSL,
    uniforms,
    bake,
    // Baked targets remain owned; their one-shot shader programs can be released
    // after every content module has finished building.
    finishBakes() {
      for (const material of bakeMaterials.values()) {
        material.dispose();
        resources.delete(material);
      }
      bakeMaterials.clear();
    },
    material,
    text,
    roundedBox,
    box: (w, h, d, m, r) => new T.Mesh(roundedBox(w, h, d, r), m),
    sphere: (r, m) => new T.Mesh(own(new T.SphereGeometry(r, 24, 16)), m),
    decal: (texture, w, h) =>
      new T.Mesh(
        own(new T.PlaneGeometry(w, h)),
        material({
          map: texture,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      ),
    instances(g, m, matrices) {
      const mesh = new T.InstancedMesh(g, m, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      return mesh;
    },
    particles,
    addLightFixture: lighting.addLightFixture,
    update(env, time) {
      uniforms.time.value = time;
      uniforms.rain.value = env.rain;
      uniforms.wetness.value = env.wetness;
      uniforms.wind.value = env.wind;
      uniforms.skyAmbient.value.copy(env.ambient);
    },
    dispose() {
      resources.forEach((r) => r.dispose());
      resources.clear();
    },
  };
}
