/** World-space minerals, turf and shore. All detail is filtered by pixel footprint. */
const fields = /* glsl */ `
uniform highp sampler3D landNoise;
uniform vec3 landAir;
varying vec3 landWorld, landNormal;
varying vec2 landPlace;
float ln(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return textureLod(landNoise,(i+f+.5)/64.,0.).r;}
// Gradients live in noise-cell space. Pixel filters are applied afterwards;
// differentiating a derivative-filtered height produced the ordered hatch.
vec3 lg(vec3 p,float value){const float e=.18;return (vec3(
ln(p+vec3(e,0.,0.)),ln(p+vec3(0.,e,0.)),ln(p+vec3(0.,0.,e)))-vec3(value))/e;}
float lf(vec3 p){return ln(p)*.62+ln(p*2.03+17.)*.26+ln(p*4.07+31.)*.12;}


`;

export function terrainMaterial(kit, seaY, air, litter) {
  const m = kit.material({ color: 0xffffff, roughness: 0.94 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    base.call(m, s, r);
    Object.assign(s.uniforms, {
      landNoise: { value: kit.noiseMap },
      landAir: air,
      landSea: { value: seaY },
      landLitter: { value: litter },
    });
    s.vertexShader =
      "attribute vec2 place; attribute vec3 soil; varying vec3 landWorld,landNormal,landSoil; varying vec2 landPlace,landPod;\n" +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
landWorld=(modelMatrix*vec4(position,1.)).xyz;landNormal=normal;landPlace=place;landSoil=soil;landPod=uv;`,
    );
    s.fragmentShader =
      fields +
      "uniform sampler2D landLitter; uniform float landSea; varying vec3 landSoil; varying vec2 landPod;\n" +
      s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      /* glsl */ `#include <roughnessmap_fragment>
vec3 lp=landWorld;
float footprint=max(length(dFdx(lp)),length(dFdy(lp)));
// A 15 mm grain must disappear before a pixel spans it; broad fractures
// retain their own metre-scale filter rather than borrowing the grain cutoff.
float fineFade=1.-smoothstep(.0025,.018,footprint);
float smallFade=1.-smoothstep(.03,.16,footprint);
float fractureFade=1.-smoothstep(.18,.7,footprint);
float clodFade=1.-smoothstep(.055,.28,footprint);
float broad=lf(lp*vec3(.038,.012,.038));
float patchNoise=ln(lp*.68);
float grainRaw=.5,gritRaw=.5,clodRaw=.5;
if(smallFade>.001)grainRaw=ln(lp*7.3);
if(fineFade>.001)gritRaw=ln(lp*67.);
if(clodFade>.001)clodRaw=ln(lp*3.1+13.);
float grain=mix(.5,grainRaw,smallFade),grit=mix(.5,gritRaw,fineFade);
float clods=mix(.5,clodRaw,clodFade);
float up=normalize(landNormal).y;
float steep=1.-smoothstep(.52,.89,landSoil.x);
float beach=(1.-smoothstep(landSea+2.1,landSea+5.2,lp.y+patchNoise*.7))*(1.-steep);
float wet=(1.-smoothstep(landSea+.05,landSea+1.15,lp.y+sin(lp.x*.7)*.025))*beach;
float lane=landPlace.x+sin(lp.z*.14)*.25;
float edgeNoise=(ln(lp*2.4)-.5)*.6+(patchNoise-.5)*.8;
float track=(1.-smoothstep(1.25,2.55,abs(lane)+edgeNoise))*smoothstep(24.,62.,landPlace.y);
track*=1.-smoothstep(.25,.65,steep);
float rut=(1.-smoothstep(.16,.38,abs(abs(lane)-.85)))*track;
float crown=(1.-smoothstep(.18,.47,abs(lane)+edgeNoise*.35))*track;
track*=1.-crown*(.66+.2*patchNoise);
// Damp hollows, pale dry hummocks, metre-scale clumps, and filtered blade litter.
float damp=smoothstep(.42,.7,broad*.55+landSoil.z*.45)*(1.-smoothstep(.12,.5,steep));
float dry=clamp(smoothstep(.42,.7,ln(lp*.11+11.))*(1.-damp)*(1.25-landSoil.z*.5),0.,1.);
vec3 turf=mix(vec3(.056,.108,.037),vec3(.234,.215,.101),dry);
turf=mix(turf,vec3(.032,.074,.033),damp*.7);
turf*=.72+.5*patchNoise+.20*grain+.08*grit;
// Tuft-scale thatch remains once individual blades fall below a pixel.
float tuftNoise=ln(lp*vec3(3.7,1.,3.7));
// Mipmapped fallen stems and grit, with metre-scale variation in the turf underneath.
vec3 litter=texture2D(landLitter,lp.xz*.25+vec2(patchNoise,broad)*.08).rgb;
float thatch=smoothstep(.30,.71,tuftNoise);
// The summit's exposed sheets alternate with pockets of low, dry turf.
float alpine=smoothstep(388.,413.,landPlace.y+8.*patchNoise);
float gate=smoothstep(304.,324.,landPlace.y)*(1.-smoothstep(370.,395.,landPlace.y));
float gateThatch=smoothstep(.35,.76,patchNoise*.55+broad*.45);
turf=mix(turf,mix(vec3(.076,.132,.032),vec3(.215,.201,.080),gateThatch),gate*.65);
turf*=.63+.43*thatch+.69*litter.r;
turf=mix(turf,vec3(.27,.203,.092),smoothstep(.56,.8,litter.r)*(.26+.32*dry));
float bare=smoothstep(.54,.74,patchNoise*.4+ln(lp*.37+2.)*.6)*(.45+.55*dry);
vec3 earth=mix(vec3(.085,.056,.029),vec3(.22,.168,.094),broad)*(.55+.32*grain+.25*patchNoise+.32*clods);
// Continuous crumb avoids the regular dots of one stone per grid cell.
float crumb=smoothstep(.55,.75,grain*.7+grit*.3);
earth*=(1.-crumb*.13*smallFade)*(.77+.60*litter.r);
turf=mix(turf,earth,bare*.83);
// Keep the costly fracture field off coherent turf/sand regions.
float joint=0.,streak=0.;
vec3 basalt=vec3(.04,.05,.055);
if(steep>.01||landSoil.y>.5){
// Layered lava flows: broad wavy strata, blocky weathering, seep streaks.
// No cell pattern: every term is smooth noise, filtered by footprint.
float strataNoise=ln(lp*vec3(.05,.16,.05));
float strataY=lp.y*.55+strataNoise*3.2+ln(lp*vec3(.21,.05,.21))*1.4;
float layer=fract(strataY);
float flowTone=ln(vec3(floor(strataY)*3.1,lp.x*.06,lp.z*.06));
float blocks=ln(lp*vec3(.9,.45,.9));
float bed=smoothstep(.0,.08,layer)*(1.-smoothstep(.86,1.,layer));
joint=(1.-bed)*smoothstep(.36,.73,blocks*.72+patchNoise*.28)*fractureFade;
float weather=smoothstep(.3,.75,patchNoise*.5+blocks*.3+flowTone*.2);
basalt=mix(vec3(.026,.03,.035),vec3(.085,.088,.088),weather);
basalt*=.74+.3*grain+.1*grit;
basalt*=1.-joint*.35;
streak=smoothstep(.57,.77,ln(lp*vec3(2.8,.065,2.8)))*(1.-smoothstep(.75,.98,up));
basalt*=1.-streak*.38;
float lichen=smoothstep(.61,.75,ln(lp*2.9)*.65+grain*.35)*weather;
basalt=mix(basalt,vec3(.15,.155,.11),lichen*.22);
float moss=smoothstep(.28,.75,up)*smoothstep(.45,.7,patchNoise)*(1.-joint*.5);
basalt=mix(basalt,vec3(.048,.095,.012)*(.75+.5*grain),moss*.7);
}
// Wind/wave ripples live in sand, not the entire landscape.
// Ripple crests turn with a slow direction field and die out in the smooth
// swash band, so the beach never shows one even washboard.
float ripplePhase=0.,rippleFilter=0.;
vec3 sand=vec3(0.);
if(beach>.001){
ripplePhase=lp.z*19.+sin(lp.x*.18+ln(lp*.06)*2.)*5.+ln(lp*.7)*2.;
rippleFilter=exp(-pow(footprint*9.,2.))*smoothstep(landSea+.5,landSea+1.9,lp.y);
float ripple=sin(ripplePhase)*rippleFilter*(.18+.82*smoothstep(.22,.72,ln(lp*vec3(.45,1.,.9))));
sand=mix(vec3(.018,.023,.027),vec3(.06,.064,.06),broad);
sand*=.80+.25*grain+.2*grit+ripple*.23;
float tide=exp(-pow((lp.y-landSea-.9+patchNoise*.1)*12.,2.));
float weed=tide*smoothstep(.48,.69,ln(lp*vec3(5.,1.,1.5)));
sand=mix(sand,vec3(.045,.052,.018),weed*.8);
float shell=mix(.5,ln(lp*31.+7.),smallFade);
sand=mix(sand,vec3(.22,.21,.17),tide*smoothstep(.69,.83,shell)*.45);
float crater=exp(-pow((length(landPod)-4.6)/1.0,2.))*(.55+.45*patchNoise);
float podRadius=length(landPod),podAngle=atan(landPod.y,landPod.x);
float ejecta=exp(-pow((podRadius-5.0)/1.8,2.))*(.35+.65*ln(lp*2.7));
float blast=pow(.5+.5*sin(podAngle*9.+ln(lp*.8)*2.),4.)*exp(-pow((podRadius-5.0)/2.7,2.));
sand=mix(sand,vec3(.10,.096,.083),ejecta*.7);
sand*=1.-crater*.72-blast*.25;
sand*=1.-(1.-smoothstep(3.0,4.7,podRadius))*.5;
}
// Crushed ballast follows the west service verge under the trunk and piers.
float service=smoothstep(60.,66.,landPlace.y)*(1.-smoothstep(125.,133.,landPlace.y));
service*=1.-smoothstep(2.0,4.2,abs(landPlace.x+14.)+edgeNoise*1.8);
vec3 ballast=mix(vec3(.095,.083,.071),vec3(.24,.211,.155),clods)*(.59+.64*litter.r+.24*grain);
vec3 c=mix(mix(turf,ballast,service),earth,track*(1.-alpine));
c*=1.-rut*.20*(1.-alpine);
if(alpine>.001){
  // Elongated shallow beds follow the slope, with fine gravel and dry turf
  // caught in the breaks. Keep the central path visible through the outcrop.
  float ribs=ln(vec3((lp.x+lp.z*.29)*.72,lp.y*.093,lp.z*.17));
  float plates=ribs*.70+patchNoise*.21+broad*.09;
  float exposed=smoothstep(.42,.61,plates+track*.038);
  float seams=(1.-smoothstep(.015,.084,abs(plates-.53)))*fractureFade;
  float broken=ln(lp*vec3(2.4,1.,1.8)+vec3(21.));
  float chips=smoothstep(.46,.68,broken*.61+clods*.39)*clodFade;
  vec3 slab=mix(vec3(.069,.088,.090),vec3(.28,.268,.212),patchNoise*.47+broken*.53);
  slab*=.68+.33*grain+.17*grit+.12*(1.-seams);
  vec3 gravel=mix(vec3(.096,.087,.069),vec3(.28,.246,.168),clods);
  gravel*=.75+.39*litter.r+.20*grain;
  vec3 heath=mix(vec3(.058,.097,.034),vec3(.235,.181,.086),dry*.65+thatch*.35);
  heath*=.77+.40*litter.r+.13*grain;
  vec3 upland=mix(heath,slab,exposed);
  upland=mix(upland,gravel,clamp(seams*.38+track*(.92-exposed*.57)+chips*.43,0.,1.));
  c=mix(c,upland,alpine);
}
c=mix(c,basalt,steep);
c=mix(c,sand,beach);
// Embedded pebbles use the terrain program and catch a real sunlit upper edge.
vec3 pebble=mix(vec3(.055,.064,.067),vec3(.19,.181,.156),landSoil.z);
pebble=mix(pebble,vec3(.14,.157,.152)*(.75+.67*landSoil.z),alpine*.86);
pebble*=.78+.3*grain;
c=mix(c,pebble,step(.5,landSoil.y));
c=mix(c,vec3(.32,.30,.24)*(.7+.5*landSoil.z),step(1.5,landSoil.y));
c=mix(c,vec3(.038,.048,.018)*(.8+landSoil.z*.6),step(2.5,landSoil.y));
c=mix(c,vec3(.012,.011,.009)*(.7+grain*.6+landSoil.z*.8),step(3.5,landSoil.y));
diffuseColor.rgb=c*mix(1.,.38,wet);
roughnessFactor=mix(.94,.12,wet);
roughnessFactor=mix(roughnessFactor,.63,streak*steep*.5);
`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      /* glsl */ `#include <normal_fragment_maps>
// A world-space height gradient has no nested screen derivatives or quad
// dependence. Keep the geometric normal and project relief onto its tangent.
vec3 terrainGradient=vec3(0.);
float rockWeight=max(steep,step(.5,landSoil.y));
if(smallFade>.001)
terrainGradient+=lg(lp*7.3,grainRaw)*7.3*mix(.019*(1.-beach*.85),.048,rockWeight)*smallFade;
if(fineFade>.001)
terrainGradient+=lg(lp*67.,gritRaw)*67.*.002*fineFade*(1.-rockWeight);
if(clodFade>.001&&track>.01&&landSoil.y<.5)
terrainGradient+=lg(lp*3.1+13.,clodRaw)*3.1*.028*clodFade*track;
if(clodFade>.001&&alpine>.01&&landSoil.y<.5)
terrainGradient+=lg(lp*3.1+13.,clodRaw)*3.1*.16*clodFade*alpine*(1.-track*.6);
if(fractureFade>.001&&rockWeight>.01)
terrainGradient+=lg(lp*.68,patchNoise)*.68*.16*fractureFade*rockWeight;
if(smallFade>.001&&rockWeight>.01){float mid=ln(lp*vec3(2.3,1.4,2.3)+5.);
terrainGradient+=lg(lp*vec3(2.3,1.4,2.3)+5.,mid)*vec3(2.3,1.4,2.3)*.05*smallFade*rockWeight;}
if(beach>.01&&rippleFilter>.01&&landSoil.y<.5){
vec3 phaseGradient=vec3(cos(lp.x*.18+ln(lp*.06)*2.)*.9,0.,19.);
phaseGradient+=lg(lp*.7,ln(lp*.7))*.7*2.;
terrainGradient+=cos(ripplePhase)*phaseGradient*.009*rippleFilter*(.18+.82*smoothstep(.22,.72,ln(lp*vec3(.45,1.,.9))))*beach*(1.-wet*.9);
}
if(steep<.5&&beach<.5&&landSoil.y<.5){
terrainGradient.xz-=(litter.gb*2.-1.)*.36*(1.-track*.45)*(1.-alpine*.70);
}
vec3 worldGroundNormal=normalize(landNormal);
terrainGradient-=worldGroundNormal*dot(terrainGradient,worldGroundNormal);
normal=normalize(normal-mat3(viewMatrix)*terrainGradient);
`,
    );
  };
  m.customProgramCacheKey = () => "hash-wars-land-v7";
  return m;
}

/** Preserve the authored atlas; use the kit for cloud shadows and sky occlusion. */
export function rockMaterial(kit, source, air) {
  const m = kit.material({
    color: 0xffffff,
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale,
    aoMap: source.aoMap,
    aoMapIntensity: 0.8,
    roughness: 0.9,
  });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    base.call(m, s, r);
    Object.assign(s.uniforms, {
      landNoise: { value: kit.noiseMap },
      landAir: air,
    });
    s.vertexShader =
      "varying vec3 landWorld,landNormal; varying vec2 landPlace;\n" +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vec4 lwp=vec4(position,1.);vec3 lwn=normal;
#ifdef USE_INSTANCING
lwp=instanceMatrix*lwp;lwn=mat3(instanceMatrix)*lwn;
#endif
landWorld=(modelMatrix*lwp).xyz;landNormal=normalize(mat3(modelMatrix)*lwn);landPlace=vec2(0.);`,
    );
    s.fragmentShader = fields + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
float mineral=ln(landWorld*.8),moss=smoothstep(.5,.73,mineral)*smoothstep(.3,.85,landNormal.y);
float rockFootprint=max(length(dFdx(landWorld)),length(dFdy(landWorld)));
float rockFineFade=1.-smoothstep(.004,.028,rockFootprint);
float rockGrit=mix(.5,ln(landWorld*43.),rockFineFade);
diffuseColor.rgb*=.84+mineral*.25+rockGrit*.12;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.065,.10,.023),moss*.75);
roughnessFactor=.88;`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
float rockHeight=(rockGrit-.5)*.003*rockFineFade;
vec3 rq0=dFdx(-vViewPosition),rq1=dFdy(-vViewPosition);
vec3 rs=cross(rq1,normal),rt=cross(normal,rq0);
float rd=dot(rq0,rs);
if(abs(rd)>.00000001)normal=normalize(normal-sign(rd)*(dFdx(rockHeight)*rs+dFdy(rockHeight)*rt)/max(abs(rd),.00001));`,
    );
  };
  m.customProgramCacheKey = () => "hash-wars-basalt-v1";
  return m;
}

export function distantMaterial(kit, air) {
  const m = kit.material({ vertexColors: true, roughness: 0.98 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    base.call(m, s, r);
    s.uniforms.landAir = air;
    s.vertexShader = "varying vec3 landWorld;\n" + s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nlandWorld=(modelMatrix*vec4(position,1.)).xyz;",
    );
    s.fragmentShader =
      "varying vec3 landWorld;uniform vec3 landAir;\n" + s.fragmentShader;
  };
  m.customProgramCacheKey = () => "hash-wars-far-ridges-v2";
  return m;
}
