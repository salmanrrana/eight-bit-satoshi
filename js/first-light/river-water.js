import { Reflector } from "three/addons/objects/Reflector.js";

// The one reflection pass is also the water mesh: standard PBR keeps the shared
// sky, fog and lights; only the wave normal and planar radiance are replaced.
export function buildWater({ T, sim, kit, quality, group }) {
  // Periodic Fourier slopes bake once; two independent spectra break wave rows.
  const normalMaps = [1, 7].map(
    (seed) =>
      kit.bake({
        size: 256,
        wrapS: T.RepeatWrapping,
        wrapT: T.RepeatWrapping,
        uniforms: { spectrum: { value: seed } },
        fragment: `uniform float spectrum;
    void main(){vec2 slope=vec2(0.);for(int i=1;i<18;i++){
      float f=float(i);vec2 k=vec2(mod(f*7.+spectrum,13.)-6.,mod(f*11.+spectrum*3.,17.)-8.);
      slope+=k*cos(dot(vUv,k)*6.2831853+f*spectrum)*(.035/(1.+dot(k,k)));
    }gl_FragColor=vec4(slope*.5+.5,1.,1.);}`,
      }).texture,
  );
  const uniforms = {
    riverNormalA: { value: normalMaps[0] },
    riverNormalB: { value: normalMaps[1] },
    riverTime: kit.uniforms.time,
    riverBlocks: {
      value: sim.entities.blocks.map((b) => new T.Vector4(b.x, b.z, 0, 0)),
    },
    riverSun: { value: new T.Vector3(0.5, -0.05, -0.866) },
    riverSunColour: { value: new T.Color() },
    riverHaze: { value: new T.Color() },
  };
  const material = kit.material({
    color: 0x16343d,
    roughness: 0.29,
    metalness: 0.12,
    envMapIntensity: 0.8,
  });
  const geometry = new T.PlaneGeometry(1100, 47, 1, 1);
  let water, reflection;
  if (quality !== "low") {
    // Half-size mirror imagery follows the viewport; high/ultra cap at their
    // fixed budgets. A small screen should not render a larger mirror than itself.
    const mirrorWidth = Math.min(
      quality === "ultra" ? 960 : 640,
      Math.max(128, Math.ceil(window.innerWidth / 64) * 32),
    );
    const mirrorHeight = Math.round((mirrorWidth * 9) / 16);
    water = new Reflector(geometry, {
      textureWidth: mirrorWidth,
      textureHeight: mirrorHeight,
      clipBias: 0.003,
      multisample: 0,
    });
    uniforms.riverPixel = {
      value: new T.Vector2(1 / mirrorWidth, 1 / mirrorHeight),
    };
    const mirrorTexture = water.getRenderTarget().texture;
    mirrorTexture.generateMipmaps = false;
    mirrorTexture.minFilter = T.LinearFilter;
    reflection = water.material;
    uniforms.riverReflection = reflection.uniforms.tDiffuse;
    uniforms.riverMatrix = reflection.uniforms.textureMatrix;
    water.material = material;
    // Keep fine content out of the mirror only, restoring even on a failed pass.
    const reflect = water.onBeforeRender;
    const hidden = [];
    let excluded;
    water.onBeforeRender = function (...args) {
      const scene = args[1];
      hidden.length = 0;
      excluded ??= (() => {
        const list = [];
        scene.traverse((o) => {
          if (o !== water && (o.userData.noReflect || o.isReflector))
            list.push(o);
        });
        return list;
      })();
      excluded.forEach((object) => {
        if (
          object !== water &&
          object.visible &&
          (object.userData.noReflect || object.isReflector)
        ) {
          hidden.push(object);
          object.visible = false;
        }
      });
      try {
        reflect.apply(this, args);
      } finally {
        for (const object of hidden) object.visible = true;
      }
    };
  } else water = new T.Mesh(geometry, material);
  water.rotation.x = -Math.PI / 2;
  water.position.set(20, sim.WATER_Y, -134.5);
  water.receiveShadow = true;
  group.add(water);
  const originalCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    originalCompile(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 riverWorld;
${reflection ? "uniform mat4 riverMatrix;varying vec4 riverUV;" : ""}
${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
riverWorld=(modelMatrix*vec4(position,1.)).xyz;
${reflection ? "riverUV=riverMatrix*vec4(position,1.);" : ""}`,
    );
    shader.fragmentShader = `
uniform float riverTime;uniform sampler2D riverNormalA,riverNormalB;
uniform vec4 riverBlocks[10];
uniform vec3 riverSun,riverSunColour,riverHaze;
varying vec3 riverWorld;
${reflection ? "uniform sampler2D riverReflection;uniform vec2 riverPixel;varying vec4 riverUV;" : ""}
${kit.noiseGLSL}
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
vec2 p=riverWorld.xz;
vec2 warp=vec2(noise3(vec3(p*.055,riverTime*.015)),noise3(vec3(p*.07+9.,riverTime*.01)));
vec2 uvA=p*.065+warp*.06+vec2(riverTime*.008,riverTime*.003);
vec2 uvB=mat2(.8,.6,-.6,.8)*p*.19+vec2(-riverTime*.012,riverTime*.007);
vec2 slope=(texture2D(riverNormalA,uvA).xy*2.-1.)*7.+
  (texture2D(riverNormalB,uvB).xy*2.-1.)*4.;
float nearDetail=1.-smoothstep(12.,20.,distance(cameraPosition,riverWorld));
slope+=(texture2D(riverNormalB,p*1.7+riverTime*vec2(.024,-.017)).xy*2.-1.)*3.2*nearDetail;
float edge=min(abs(p.y+111.),abs(p.y+158.));
float blockFoam=0.,blockGlow=0.,underwater=0.;
for(int i=0;i<10;i++){
  vec2 d=abs(p-riverBlocks[i].xy)-vec2(1.6);
  float dist=length(max(d,0.))+min(max(d.x,d.y),0.);
  float risen=riverBlocks[i].z,lit=riverBlocks[i].w;
  vec2 downstream=p-riverBlocks[i].xy;
  // Current flows east; two narrow trails peel away from each stone corner.
  float flow=max(downstream.x-1.6,0.);
  float trail=exp(-pow((abs(downstream.y)-1.5-sin(flow*1.1-riverTime*.25)*.15)/(.13+flow*.06),2.))*exp(-flow*.38)*step(1.6,downstream.x);
  float fleck=smoothstep(.25,.62,noise3(vec3(p*vec2(3.5,8.)-vec2(riverTime*.3,0.),1.7)));
  float ring=exp(-max(dist,0.)*9.)*step(0.,dist);
  blockFoam+=(ring*.85+trail*.42)*risen*fleck;
  slope+=normalize(p-riverBlocks[i].xy+vec2(.001)) * ring*.06;
  blockGlow+=exp(-length((p-riverBlocks[i].xy)*vec2(.8,.38))*1.25)*lit;
  // View-dependent refraction shows the submerged 4 m column beside its top.
  vec2 refractedP=p+(p-cameraPosition.xz)/max(cameraPosition.y-riverWorld.y,1.)*.65;
  vec2 bulk=abs(refractedP-riverBlocks[i].xy)-vec2(1.55);
  float bulkDist=length(max(bulk,0.))+min(max(bulk.x,bulk.y),0.);
  underwater=max(underwater,(1.-smoothstep(-.22,.32,bulkDist))*(.25+.75*risen));
  vec2 deepP=p+(p-cameraPosition.xz)/max(cameraPosition.y-riverWorld.y,1.)*2.4;
  vec2 deepBulk=abs(deepP-riverBlocks[i].xy)-vec2(1.5);
  float deepDist=length(max(deepBulk,0.))+min(max(deepBulk.x,deepBulk.y),0.);
  underwater=max(underwater,(1.-smoothstep(-.3,.6,deepDist))*.30*risen);
}
vec3 waterNormal=normalize(vec3(-slope.x,1.,-slope.y));
normal=normalize(mat3(viewMatrix)*waterNormal);
float broken=mix(.5,noise3(vec3(p*3.2+vec2(riverTime*.08,0.),riverTime*.2)),exp(-dot(fwidth(p),fwidth(p))*30.));
float bankFoam=exp(-edge*2.5)*smoothstep(.32,.72,broken)*(.6+.4*sin(p.x*2.+riverTime*.4));
float foam=clamp((bankFoam+blockFoam)*.90,0.,.9);
// Channel depth comes from the authoritative bed, with a narrow shoreline shelf.
float depth=${(sim.WATER_Y - sim.groundY(20, -130)).toFixed(3)}*smoothstep(0.,2.8,edge);
vec3 bed=mix(vec3(.095,.11,.075),vec3(.018,.067,.078),1.-exp(-depth*.8));
diffuseColor.rgb=mix(bed*(1.-underwater*.78),vec3(.65,.69,.68),foam);
roughnessFactor=mix(.26,.68,foam);
`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
// The directional PBR glint is too broad for this moving water normal.
outgoingLight-=reflectedLight.directSpecular*.8;
vec3 eyeDir=normalize(cameraPosition-riverWorld);
float fresnel=.025+.975*pow(1.-max(dot(eyeDir,waterNormal),0.),5.);
${
  reflection
    ? `
vec2 reflectedUV=riverUV.xy/riverUV.w;
// Derivative-sized distortion avoids a sheared or perfectly flat mirror.
vec2 distort=slope*(.004+2.5/max(length(cameraPosition-riverWorld),3.))*.9;
vec2 rUV=clamp(reflectedUV+distort,vec2(.002),vec2(.998));
// A small distance-dependent three-tap footprint softens far reflections
// without rebuilding a mip chain every frame. Close reflections stay sharp.
float blur=smoothstep(12.,80.,length(cameraPosition-riverWorld));
vec3 reflected=texture2D(riverReflection,rUV).rgb*.6
  +texture2D(riverReflection,rUV+riverPixel*blur).rgb*.2
  +texture2D(riverReflection,rUV-riverPixel*blur).rgb*.2;
reflected=min(reflected,vec3(1.35));
outgoingLight=mix(outgoingLight,reflected*(.78+.22*broken),clamp(fresnel*.88+.12,0.,.9)*(1.-foam));
`
    : ""
}
vec3 halfSun=normalize(eyeDir+normalize(vec3(riverSun.x,max(.025,riverSun.y),riverSun.z)));
float sparkle=pow(max(dot(waterNormal,halfSun),0.),650.);
float day=smoothstep(-.075,.055,riverSun.y);
// Sparse, moving highlights form a path, never a white billboard.
outgoingLight+=riverSunColour*sparkle*day*1.1*smoothstep(.55,.76,broken);
outgoingLight*=1.-underwater*(1.-fresnel)*.65;
// Aerated foam scatters the shared sky fill; bound that term so it cannot
// turn the bank contact into a luminous white stripe at blue hour.
outgoingLight+=min(skyAmbient,vec3(.12,.15,.19))*foam*.15;
outgoingLight+=vec3(1.,.22,.018)*blockGlow*(.035+.085*broken)*(1.-foam);
outgoingLight=mix(outgoingLight,riverHaze,smoothstep(100.,360.,length(cameraPosition-riverWorld)));
#include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `river-water-${quality}-v6`;
  // Three shallow soft layers build distance density without billboard puffs.
  const mistMaterial = kit.material({
    color: 0x8aa3b2,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: T.DoubleSide,
    roughness: 1,
  });
  const mistCompile = mistMaterial.onBeforeCompile;
  mistMaterial.onBeforeCompile = (shader) => {
    mistCompile(shader);
    shader.uniforms.riverTime = uniforms.riverTime;
    shader.vertexShader =
      `varying vec3 mistWorld;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nmistWorld=(modelMatrix*vec4(position,1.)).xyz;",
      );
    shader.fragmentShader =
      `varying vec3 mistWorld;uniform float riverTime;${kit.noiseGLSL}\n${shader.fragmentShader}`
        .replace(
          "#include <alphamap_fragment>",
          `#include <alphamap_fragment>
float n=fbm(vec3(mistWorld.xz*vec2(.045,.13)-vec2(riverTime*.015,0.),.7));
float bankFade=smoothstep(-110.,-117.,mistWorld.z)*smoothstep(-165.,-160.,mistWorld.z);
float reach=length(cameraPosition.xz-mistWorld.xz);
diffuseColor.a*=smoothstep(.29,.67,n)*bankFade*smoothstep(2.,32.,reach)*(1.-smoothstep(170.,380.,reach));`,
        )
        .replace(
          "#include <opaque_fragment>",
          "outgoingLight=mix(outgoingLight,riverMistColour,.72);\n#include <opaque_fragment>",
        );
    shader.uniforms.riverMistColour = uniforms.riverHaze;
    shader.fragmentShader =
      "uniform vec3 riverMistColour;\n" + shader.fragmentShader;
  };
  mistMaterial.customProgramCacheKey = () => "river-mist-v2";
  for (let layer = 0; layer < 3; layer++) {
    const mist = new T.Mesh(new T.PlaneGeometry(1000, 56), mistMaterial);
    mist.rotation.x = -Math.PI / 2;
    mist.position.set(20, sim.WATER_Y + 0.15 + layer * 0.3, -137);
    mist.userData.noReflect = true;
    group.add(mist);
  }
  return {
    update({ snapshot, env }) {
      uniforms.riverHaze.value.copy(env.fog);
      uniforms.riverSun.value.copy(env.sunDir);
      uniforms.riverSunColour.value.copy(env.sunColour);
      snapshot.blocks.forEach((b, i) => {
        uniforms.riverBlocks.value[i].z = b.risen;
        uniforms.riverBlocks.value[i].w = b.lit ? 1 : 0;
      });
    },
    dispose() {
      // Reflector.dispose would dispose its current (kit-owned) material; only
      // the private pass resources are ours here.
      if (reflection) {
        water.getRenderTarget().dispose();
        reflection.dispose();
      }
    },
  };
}
