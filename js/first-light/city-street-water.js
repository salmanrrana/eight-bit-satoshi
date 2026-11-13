/** Local atmospheric scattering and flowing gutter water; no light/renderer ownership. */
export function streetWater({
  T,
  kit,
  group,
  batch,
  plane,
  extras,
  lampPositions,
}) {
  const scattering = kit.material({
    color: 0x000000,
    emissive: 0xffc98a,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: T.BackSide,
  });
  scattering.userData.noReflect = true;
  const compile = scattering.onBeforeCompile;
  scattering.onBeforeCompile = (shader) => {
    compile(shader);
    shader.vertexShader =
      "varying vec3 mistWorld,mistCenter;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vec4 mistP=vec4(position,1.),mistC=vec4(0.,0.,0.,1.);
#ifdef USE_INSTANCING
mistP=instanceMatrix*mistP;mistC=instanceMatrix*mistC;
#endif
mistWorld=(modelMatrix*mistP).xyz;mistCenter=(modelMatrix*mistC).xyz;`,
    );
    shader.fragmentShader =
      "varying vec3 mistWorld,mistCenter;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      `
vec3 ray=normalize(mistWorld-cameraPosition),origin=cameraPosition-mistCenter;
vec3 safeRay=ray+mix(vec3(-.00001),vec3(.00001),step(vec3(0.),ray));
vec3 a=(-vec3(2.35,2.45,2.35)-origin)/safeRay,b=(vec3(2.35,2.45,2.35)-origin)/safeRay;
vec3 nearP=min(a,b),farP=max(a,b);
float entry=max(0.,max(nearP.x,max(nearP.y,nearP.z))),leave=min(farP.x,min(farP.y,farP.z));
float stride=max(0.,leave-entry)/8.,integral=0.;
for(int i=0;i<8;i++){
  vec3 p=origin+ray*(entry+(float(i)+.5)*stride);
  float drop=2.45-p.y,radius=.1+drop*.44;
  float density=pow(max(0.,1.-length(p.xz)/radius),3.);
  density*=smoothstep(0.,.5,drop)*(1.-smoothstep(3.6,4.9,drop));
  integral+=density*stride/(1.+drop*drop*.4);
}
diffuseColor.a*=integral*.18*rain;
#include <alphatest_fragment>`,
    );
  };
  scattering.customProgramCacheKey = () => "street-rain-volume-2";
  const volume = new T.BoxGeometry(4.7, 4.9, 4.7);
  extras.push(volume);
  for (const [x, z] of lampPositions)
    batch(volume, scattering, x, 2.65, z, 1, 1, 1);
  const halos = kit.particles(lampPositions.length, {
    colour: 0xffc58b,
    size: 1.05,
    opacity: 0.12,
  });
  lampPositions.forEach(([x, z], i) =>
    halos.geometry.attributes.position.setXYZ(i, x, 5.1, z),
  );
  halos.geometry.attributes.position.needsUpdate = true;
  halos.userData.noReflect = true;
  group.add(halos);
  const flow = kit.material({
    color: 0x29383a,
    roughness: 0.08,
    metalness: 0.08,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  flow.userData.noReflect = true;
  const flowCompile = flow.onBeforeCompile;
  flow.onBeforeCompile = (shader) => {
    flowCompile(shader);
    shader.vertexShader =
      "varying vec3 flowWorld;varying vec2 flowUV;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vec4 flowP=vec4(position,1.);
#ifdef USE_INSTANCING
flowP=instanceMatrix*flowP;
#endif
flowWorld=(modelMatrix*flowP).xyz;flowUV=uv;`,
    );
    shader.fragmentShader =
      "varying vec3 flowWorld;varying vec2 flowUV;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
float current=sin(flowWorld.z*42.-time*3.+sin(flowWorld.x*91.)*2.);
normal=normalize(normal+vec3(current*.065,0.,current*.04));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      `
diffuseColor.a*=smoothstep(0.,.15,flowUV.x)*(1.-smoothstep(.75,1.,flowUV.x));
#include <alphatest_fragment>`,
    );
  };
  flow.customProgramCacheKey = () => "street-gutter-flow";
  for (const side of [-1, 1])
    batch(plane, flow, side * 3.88, 0.028, -19.5, 0.23, 39, 1, -Math.PI / 2);
  const spill = kit.material({
    color: 0x9baeb1,
    transparent: true,
    opacity: 0.09,
    roughness: 0.16,
    depthWrite: false,
    side: T.DoubleSide,
  });
  spill.userData.noReflect = true;
  const spillCompile = spill.onBeforeCompile;
  spill.onBeforeCompile = (shader) => {
    spillCompile(shader);
    shader.vertexShader = "varying vec2 spillUV;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nspillUV=uv;",
    );
    shader.fragmentShader = "varying vec2 spillUV;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      `
float stream=pow(.5+.5*sin(spillUV.x*143.+sin(spillUV.y*12.-time*5.)),9.);
diffuseColor.a*=stream*sin(spillUV.x*3.14159)*sin(spillUV.y*3.14159)*rain;
#include <alphatest_fragment>`,
    );
  };
  spill.customProgramCacheKey = () => "street-ledge-overflow";
  for (const [x, y, z, w] of [
    [-5.24, 2.8, -18.8, 0.6],
    [-5.24, 2.8, -11.0, 0.4],
    [-4.85, 1.5, -24.1, 0.5],
    [6.52, 2.1, -8.5, 0.3],
    [6.52, 2.1, -32, 0.45],
  ])
    batch(
      plane,
      spill,
      x,
      y,
      z,
      w,
      2.2,
      1,
      0,
      x < 0 ? Math.PI / 2 : -Math.PI / 2,
    );
}

/** Patchy paint follows the road beneath, with chipped edges rather than pristine strips. */
export function wearRoadPaint(material, kit) {
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    base(shader);
    shader.vertexShader = "varying vec3 paintWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vec4 paintP=vec4(position,1.);
#ifdef USE_INSTANCING
paintP=instanceMatrix*paintP;
#endif
paintWorld=(modelMatrix*paintP).xyz;`,
    );
    shader.fragmentShader =
      "varying vec3 paintWorld;\n" +
      kit.noiseGLSL +
      "\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
float fineWeight=exp(-max(length(dFdx(paintWorld)),length(dFdy(paintWorld)))*85.);
float wear=mix(.5,noise3(paintWorld*85.),fineWeight)*.4+noise3(paintWorld*7.)*.6;
if(wear>.69)discard;
diffuseColor.rgb*=.7+.3*smoothstep(.25,.53,wear);`,
    );
  };
  material.customProgramCacheKey = () => "street-worn-paint";
}
