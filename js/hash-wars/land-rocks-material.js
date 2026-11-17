/** One material for the whole basalt kit. The GLB's tiling atlas carries the
 * stone (joints, spalls, near-black colour, AO + roughness). World-space noise
 * here only varies tone at metre scale, wets the spray zones, and grows moss
 * and lichen on crowns and ledges (upward faces), thickest in the crevices. */
export function basaltMaterial(kit, source, seaY) {
  const material = kit.material({
    color: 0xffffff,
    vertexColors: true,
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale,
    aoMap: source.aoMap,
    aoMapIntensity: 1,
    roughnessMap: source.roughnessMap,
    roughness: 1,
  });
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    shader.uniforms.basaltNoise = { value: kit.noiseMap };
    shader.uniforms.basaltSea = { value: seaY };
    shader.vertexShader =
      "varying vec3 basaltWorld, basaltUp;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vec4 bp=vec4(position,1.);vec3 bn=normal;
#ifdef USE_INSTANCING
bp=instanceMatrix*bp;
mat3 basaltBasis=mat3(instanceMatrix);
bn/=vec3(dot(basaltBasis[0],basaltBasis[0]),dot(basaltBasis[1],basaltBasis[1]),dot(basaltBasis[2],basaltBasis[2]));
bn=basaltBasis*bn;
#endif
basaltWorld=(modelMatrix*bp).xyz;basaltUp=normalize(mat3(modelMatrix)*bn);`,
    );
    shader.fragmentShader =
      `varying vec3 basaltWorld,basaltUp;
uniform highp sampler3D basaltNoise;uniform float basaltSea;
// The shared 3D value noise has no mip chain: fade each octave by footprint.
float basaltN(vec3 p){
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  return mix(.5,texture(basaltNoise,(p+.5)/64.).r,1.-smoothstep(.15,.9,footprint));
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
float basaltAO=1.;
#ifdef USE_AOMAP
basaltAO=texture2D(aoMap,vAoMapUv).r;
#endif
float tone=basaltN(basaltWorld*vec3(.23,.11,.23));
float patchy=basaltN(basaltWorld*vec3(.9,.6,.9));
float upward=smoothstep(.5,.9,basaltUp.y);
float ledge=smoothstep(.25,.7,basaltUp.y);
// Moss gathers in crevices and on sheltered crowns; lichen spots the dry tops.
float crevice=1.-smoothstep(.45,.9,basaltAO);
float moss=ledge*smoothstep(.42,.66,patchy*.75+crevice*.55+tone*.15);
moss*=1.-smoothstep(18.,40.,basaltWorld.y-basaltSea)*.35;
float lichenField=basaltN(basaltWorld*6.3);
float lichen=upward*smoothstep(.6,.72,lichenField)*(1.-moss);
float gorgeSpray=(1.-smoothstep(9.,26.,abs(basaltWorld.z+160.)))*(1.-smoothstep(-8.,20.,basaltWorld.y));
float wet=max(gorgeSpray*.9,(1.-smoothstep(basaltSea-.15,basaltSea+1.4,basaltWorld.y))*.9);
wet=max(wet,smoothstep(.62,.8,basaltN(basaltWorld*vec3(1.7,.03,1.7)))*(1.-ledge)*.55);
diffuseColor.rgb*=(.68+.4*tone)*(1.-wet*.32);
vec3 mossCol=mix(vec3(.030,.052,.012),vec3(.075,.105,.022),patchy);
diffuseColor.rgb=mix(diffuseColor.rgb,mossCol*(.7+.3*basaltAO),moss*.92);
vec3 lichenCol=mix(vec3(.16,.165,.13),vec3(.20,.15,.07),step(.69,lichenField));
diffuseColor.rgb=mix(diffuseColor.rgb,lichenCol,lichen*.55);
roughnessFactor=mix(roughnessFactor,.25,wet);
roughnessFactor=mix(roughnessFactor,.92,max(moss,lichen*.6));`,
    );
  };
  material.customProgramCacheKey = () => "hash-wars-rock-kit-v6";
  return material;
}
