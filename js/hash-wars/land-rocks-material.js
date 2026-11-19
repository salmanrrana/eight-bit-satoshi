/** The atlas supplies cooling joints and grain. Weathering runs in world
 * space so an exposed bed or waterline can continue across several meshes. */
export function basaltMaterial(kit, source, seaY) {
  const material = kit.material({
    color: 0xffffff,
    vertexColors: true,
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale,
    aoMap: source.aoMap,
    aoMapIntensity: 0.58,
    roughnessMap: source.roughnessMap,
    roughness: 1,
  });
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    shader.uniforms.basaltNoise = { value: kit.noiseMap };
    shader.uniforms.basaltSea = { value: seaY };
    shader.vertexShader =
      "attribute float rockSurface; varying float basaltSurface; varying vec3 basaltWorld, basaltUp;\n" +
      shader.vertexShader;
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
basaltWorld=(modelMatrix*bp).xyz;basaltUp=normalize(mat3(modelMatrix)*bn);
basaltSurface=rockSurface;`,
    );
    shader.fragmentShader =
      `varying float basaltSurface;
varying vec3 basaltWorld,basaltUp;
uniform highp sampler3D basaltNoise;uniform float basaltSea;
// The shared 3D noise has no mip chain. Fade detail as it falls below a pixel.
float basaltN(vec3 p){
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  return mix(.5,texture(basaltNoise,(p+.5)/64.).r,1.-smoothstep(.16,.95,footprint));
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      /* glsl */ `#include <roughnessmap_fragment>
vec3 p=basaltWorld;
float s=-p.z;
float tread=1.-step(.4,abs(basaltSurface-1.));
float boulder=1.-step(.4,abs(basaltSurface-2.));
float flow=step(2.5,basaltSurface);
float upper=smoothstep(310.,395.,s);
float cove=1.-smoothstep(46.,64.,s);
float gorge=smoothstep(141.,156.,s)*(1.-smoothstep(222.,238.,s));
float fins=smoothstep(231.,249.,s)*(1.-smoothstep(301.,320.,s));
float tone=basaltN(p*vec3(.19,.13,.21));
float mottle=basaltN(p*vec3(.8,.58,.86)+3.);
float ledge=smoothstep(.18,.76,basaltUp.y);
float face=1.-ledge;
float rockFootprint=max(length(dFdx(p)),length(dFdy(p)));
float grainFade=1.-smoothstep(.01,.064,rockFootprint);
float scarFade=1.-smoothstep(.072,.28,rockFootprint);
// Raw fields give the normal gradient the same pits and scaling as the color.
float grainNoise=textureLod(basaltNoise,(p*19.+11.5)/64.,0.).r;
float scarNoise=textureLod(basaltNoise,(p*vec3(4.1,3.4,4.1)+17.5)/64.,0.).r;
float flecks=mix(.5,grainNoise,grainFade);
float spall=mix(.5,scarNoise,scarFade);

// Faults separate entire flows, with a darker bed below a pale weathered lip.
float dip=p.y+p.x*.069-p.z*.035+(tone-.5)*2.1+(mottle-.5)*.51;
float ash=basaltN(vec3(p.x*.065,dip*.46,s*.073));
// Weathered rind follows broad exposure: a few large patches, strongest on
// ledges and lips, with only a hint of bedding on vertical faces.
float band=smoothstep(.40,.75,tone*.65+ash*.35);
vec3 fresh=mix(vec3(.044,.055,.061),vec3(.084,.089,.087),upper);
fresh=mix(fresh,vec3(.038,.056,.060),fins*.75);
vec3 rind=mix(vec3(.164,.130,.092),vec3(.160,.168,.153),upper*.8);
rind=mix(rind,vec3(.185,.111,.071),gorge*.64);
vec3 flowColor=mix(fresh,rind,(.12+.38*band)*mix(.5,1.,ledge)*(1.-.36*fins));
flowColor*=.59+.48*tone+.26*mottle+.33*spall+.22*flecks;
flowColor=mix(flowColor,vec3(.033,.043,.038),face*(1.-smoothstep(.28,.49,ash))*.32);
float scaling=smoothstep(.52,.72,spall*.60+mottle*.40);
flowColor=mix(flowColor,vec3(.191,.188,.157),scaling*(.18+.23*ledge));

// Rounded cover keeps its authored collision shell. A worn, vesicular rind
// and broken oblique seams soften the individual drum faces.
float rindPatches=smoothstep(.32,.69,mottle*.61+tone*.39);
vec3 worn=mix(vec3(.080,.091,.088),vec3(.245,.201,.136),rindPatches*.86);
float chip=smoothstep(.62,.78,flecks)*smoothstep(.42,.63,mottle);
worn=mix(worn,vec3(.235,.236,.194),chip*.43);
float cleft=1.-smoothstep(.031,.139,abs(ash*.6+mottle*.4-.41));
float oxidation=smoothstep(.51,.73,mottle*.64+spall*.36);
worn*= (.67+.34*tone+.24*spall+.31*flecks)*(1.-cleft*.37*face);
worn=mix(worn,vec3(.242,.218,.163),oxidation*.37);
float mineralBed=ash*.48+mottle*.34+spall*.18;
float weatheredBed=(1.-smoothstep(.012,.089,abs(mineralBed-.54)))*scarFade;
worn=mix(worn,vec3(.222,.212,.171),weatheredBed*face*smoothstep(.35,.65,tone)*.38);
worn=mix(worn,vec3(.187,.191,.155),scaling*.34);

vec3 polished=mix(vec3(.093,.114,.110),vec3(.165,.169,.137),tone);
polished*=.77+.24*mottle+.18*spall+.16*flecks;
polished=mix(polished,vec3(.211,.181,.120),ledge*smoothstep(.48,.72,mottle)*.56);
vec3 stone=mix(diffuseColor.rgb*(.94+.28*tone),flowColor,flow*.98);
stone=mix(stone,worn,boulder*.88);
stone=mix(stone,polished,tread*.76);

// Damp rock is dark and cool. Mineral runoff clings to the damp face, with
// moss on the ledge above it and a faint salt rind around exposed shores.
float wetShore=cove*(1.-smoothstep(basaltSea+.03,basaltSea+2.,p.y));
float wetGorge=gorge*(1.-smoothstep(-7.,17.,p.y))*(.26+.6*mottle);
float wet=max(wetShore*.70,wetGorge);
float salt=cove*exp(-pow((p.y-basaltSea-2.1)*.62,2.))*(.3+.7*mottle);
stone=mix(stone,vec3(.106,.118,.105),salt*.30);
float moss=ledge*smoothstep(.46,.65,mottle*.62+tone*.23+spall*.15);
moss*=(1.-upper*.74)*(1.-gorge*.54)*(1.-tread*.25);
stone=mix(stone,mix(vec3(.036,.068,.022),vec3(.102,.123,.041),mottle),moss*.76);
diffuseColor.rgb=stone*(1.-wet*.39);
roughnessFactor=mix(roughnessFactor,.84+.09*spall,tread*.83+boulder*.59+flow*.95);
roughnessFactor=mix(roughnessFactor,.32,wet);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `vec3 rockNormal=normal;
#include <normal_fragment_maps>
normal=normalize(mix(rockNormal,normal,1.-tread*.60-flow*.96-boulder*.49));
vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
vec3 r1=cross(dy,normal),r2=cross(normal,dx);
float det=dot(dx,r1);
vec2 scarp=vec2(dFdx(scarNoise),dFdy(scarNoise))*(.035+boulder*.026)*scarFade;
scarp+=vec2(dFdx(grainNoise),dFdy(grainNoise))*.008*grainFade;
normal=normalize(normal*max(abs(det),1e-9)-
  sign(det)*(scarp.x*r1+scarp.y*r2)*(flow+boulder*.79+tread*.38));`,
    );
  };
  material.customProgramCacheKey = () => "hash-wars-rock-kit-v10";
  return material;
}
