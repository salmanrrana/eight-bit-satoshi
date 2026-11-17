// Shared sea / channel / wet-sand shader. Bed and flow are baked from the sim.
export const waves = `
uniform float hwTime;
uniform sampler2D hwNormalA,hwNormalB,hwBed,hwShore;
uniform sampler3D hwNoise;
uniform vec4 hwBounds;
uniform float hwSea;
uniform float hwContacts;
uniform vec4 hwFall;
uniform vec3 hwFog,hwSun,hwSunColour;
float wn(vec2 p){return texture(hwNoise,vec3(p/64.,.31)).r;}
float shore(float x){return dot(texture2D(hwShore,vec2(clamp((x-hwBounds.x)/hwBounds.z,0.,1.),.5)).rg,vec2(65280.,255.))/65535.*hwBounds.w+hwBounds.y;}
float bed(vec2 p){return dot(texture2D(hwBed,clamp((p-hwBounds.xy)/hwBounds.zw,0.,1.)).rg,vec2(65280.,255.))/65535.*80.-40.;}
vec2 swell(vec2 p,float depth){
 float d=p.y-shore(p.x),t=hwTime;
 float phase=d*.51+t*1.03+sin(p.x*.072)*.62+wn(vec2(p.x*.19,t*.035))*.9+sin(p.x*.37)*.16;
 float shoal=(1.-smoothstep(1.,19.,d))*(1.-smoothstep(3.,8.,depth));
 float open=sin(dot(p,vec2(.13,.27))+t*.81)*.23+
 sin(dot(p,vec2(-.21,.18))+t*.69+1.8)*.15+sin(dot(p,vec2(.047,.14))+t*.55)*.30;
 float breaker=(sin(phase)*.20+pow(max(0.,sin(phase)),5.)*.22)*shoal;
 return vec2(-.65*pow(max(0.,sin(phase)),4.)*shoal,open*(1.-shoal*.8)+breaker)*smoothstep(0.,.55,depth);
}
`;

export function waterMaterial({ T, kit, uniforms }) {
  const m = kit.material({
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.06,
    envMapIntensity: 1.15,
    transparent: true,
    depthWrite: true,
    side: T.DoubleSide,
    forceSinglePass: true,
  });
  const compile = m.onBeforeCompile;
  m.onBeforeCompile = (s) => {
    compile(s);
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = `attribute vec4 hwData;attribute vec2 hwFlow;
varying vec4 wd;varying vec2 wf;varying vec3 wp;varying vec3 wb;
${waves}\n${s.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
wd=hwData;wf=hwFlow;wb=normalize(mat3(modelMatrix)*normal);
vec3 world=(modelMatrix*vec4(position,1.)).xyz;
if(hwData.y<.5){vec2 displacement=swell(world.xz,hwData.x);transformed.y+=displacement.y;transformed.z+=displacement.x;}
if(hwData.y>2.5)transformed.y+=sin(hwData.w*3.-hwTime*5.)*.045*exp(-hwData.w*.09);
if(hwData.y>.5&&hwData.y<1.5)transformed.y+=sin(hwData.w*3.-hwTime*4.1+hwData.z*4.)*.045*smoothstep(0.,.35,hwData.x);
wp=(modelMatrix*vec4(transformed,1.)).xyz;`,
    );
    // Ocean vertices beyond the far plane keep a continuous horizon depth.
    s.vertexShader = s.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nif(hwData.y<.5)gl_Position.z=min(gl_Position.z,gl_Position.w*.99999);",
    );
    s.fragmentShader = `varying vec4 wd;varying vec2 wf;varying vec3 wp;varying vec3 wb;
${waves}\n${s.fragmentShader}`;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
vec2 p=wp.xz;
float mode=wd.y;
float pool=step(2.5,mode);
float river=step(.5,mode)*(1.-step(1.5,mode))+pool;
float wet=step(1.5,mode)*(1.-pool);
float localBed=1.-smoothstep(95.,130.,abs(p.x-hwBounds.x-hwBounds.z*.5));
localBed*=1.-smoothstep(hwBounds.y+hwBounds.w-30.,hwBounds.y+hwBounds.w,p.y);
float depth=mix(wd.x,max(0.,hwSea-bed(p)),localBed*(1.-river));
// Bed map and coarse offshore vertices sample LAND's actual submerged skin;
// outside the near shore survey we use the interpolated known bed depth.
vec2 current=mix(vec2(.024,.013),-wf*.18,river);
vec2 warp=vec2(wn(p*.15+hwTime*.04),wn(p*.12+17.-hwTime*.03))-.5;
vec2 a=p*.075+warp*.14+hwTime*current;
mat2 rotateFlow=mat2(.8,.6,-.6,.8);
vec2 b=rotateFlow*p*.23+hwTime*mix(-current*.71,rotateFlow*current*3.1,river);
vec2 slope=(texture2D(hwNormalA,a).xy*2.-1.)*.32+(texture2D(hwNormalB,b).xy*2.-1.)*.18;
float nearDetail=1.-smoothstep(10.,23.,distance(cameraPosition,wp));
slope+=(texture2D(hwNormalB,p*1.9+hwTime*mix(current*1.7,current*26.,river)).xy*2.-1.)*.08*nearDetail;
float shoreD=p.y-shore(p.x);
float wavePhase=shoreD*.51+hwTime*1.03+sin(p.x*.072)*.62+wn(vec2(p.x*.19,hwTime*.035))*.9+sin(p.x*.37)*.16;
float surfZone=(1.-smoothstep(9.,21.,shoreD))*smoothstep(-1.,2.,shoreD)*(1.-smoothstep(3.,8.,depth));
float peak=max(0.,sin(wavePhase));
slope.y+=cos(wavePhase)*(.12+.35*pow(peak,4.))*surfZone;
// Smooth ocean slopes avoid rectangular sun flashes from displaced mesh faces.
float shoal=(1.-smoothstep(1.,19.,shoreD))*(1.-smoothstep(3.,8.,depth));
vec2 openSlope=vec2(.13,.27)*cos(dot(p,vec2(.13,.27))+hwTime*.81)*.23+
 vec2(-.21,.18)*cos(dot(p,vec2(-.21,.18))+hwTime*.69+1.8)*.15+
 vec2(.047,.14)*cos(dot(p,vec2(.047,.14))+hwTime*.55)*.30;
slope+=openSlope*(1.-shoal*.8)*smoothstep(0.,.55,depth)*(1.-river)*(1.-wet);

float churn=wn(p*1.4+hwTime*mix(-current*5.,current*20.,river));
// Warp and cross two scales instead of outlining the square noise lattice.
vec2 foamWarp=vec2(wn(p*3.7+hwTime*.08),wn(p*3.1+19.-hwTime*.11))-.5;
vec2 foamUV=p*13.+foamWarp*3.5+warp*4.-hwTime*current*6.;
float lace=wn(foamUV)*.66+wn(mat2(.8,.6,-.6,.8)*foamUV*1.83+7.)*.34;
float aa=max(fwidth(lace)*.65,.025);
float cells=smoothstep(.29-aa,.69+aa,lace);
float crest=smoothstep(.84,.99,peak+churn*.08)*surfZone*smoothstep(.23,.57,wn(vec2(p.x*.32,hwTime*.11)));
float wash=(1.-smoothstep(1.1,5.2,shoreD))*(.14+.12*sin(hwTime*.62+p.x*.12));
float foam=(crest*.65+wash)*mix(.32,1.,cells)*smoothstep(-.14,.25,depth);
// Sheared streaks, bank eddies and intermittent boils move down the actual channel.
float edge=abs(wd.z);
float along=wd.w-hwTime*2.6;
float streak=wn(vec2(wd.z*16.+sin(along*.24),along*.65));
float riffle=pow(max(0.,sin(wd.w*.73+wd.z*1.9)),8.);
float channelFoam=(smoothstep(.68,.99,edge)*.63+riffle*.62)*smoothstep(.36,.68,streak);
channelFoam+=pow(max(0.,sin(along*3.7+wd.z*34.+churn*3.)),16.)*riffle*.3;
// Whitewater over the last reach before the falls lip (hwFall.w = river length).
channelFoam=max(channelFoam,step(2.,hwFall.w)*smoothstep(hwFall.w-22.,hwFall.w-2.,wd.w)*(.5+.45*streak));
foam=mix(foam,channelFoam,river);
float fallDistance=length((p-hwFall.xy)/max(hwFall.z,.1));
vec2 impact=p-hwFall.xy;
float apron=length(vec2(dot(impact,vec2(-wf.y,wf.x))*.68,dot(impact,wf)*.48))/max(hwFall.z,.1);
float poolCells=smoothstep(.17,.80,wn(p*1.6+vec2(hwTime*1.2,-hwTime*1.8)+foamWarp*3.));
float boil=(1.-smoothstep(.6,3.1,apron+warp.x*.8))*(.32+.66*poolCells);
boil=max(boil,(1.-smoothstep(.45,1.15,fallDistance))*.94);
float ripples=pow(.5+.5*sin(fallDistance*23.-hwTime*4.+churn*7.+wn(p*.65)*4.),9.)*exp(-fallDistance*.8)*.17;
foam=mix(foam,clamp(boil+ripples,0.,.98),pool);
slope*=1.-pool*.68;
if(hwContacts>.5){
 float contact=texture2D(hwBed,clamp((p-hwBounds.xy)/hwBounds.zw,0.,1.)).b;
 foam=max(foam,contact*(.35+.5*cells)*smoothstep(0.,.3,depth));
}
// Interpolated bed-aligned normals keep channel and pool highlights smooth too.
vec3 geometric=normalize(wb);
if(geometric.y<0.)geometric=-geometric;
vec3 n=normalize(geometric+vec3(-slope.x,0.,-slope.y));
normal=normalize(mat3(viewMatrix)*n);
vec3 deep=mix(vec3(.008,.043,.085),vec3(.035,.24,.30),river);
vec3 shallow=mix(vec3(.025,.21,.19),vec3(.12,.39,.43),river);
deep=mix(deep,vec3(.008,.045,.056),pool);
shallow=mix(shallow,vec3(.025,.12,.13),pool);
vec3 waterColour=mix(shallow,deep,1.-exp(-depth*mix(.65,.35,river)));
// Dark volcanic bed remains visible through ankle-deep clear water.
waterColour=mix(vec3(.023,.032,.034),waterColour,smoothstep(0.,.7,depth));
waterColour*=.9+.2*churn;
diffuseColor.rgb=mix(waterColour,vec3(.65,.74,.73),clamp(foam,0.,.92));
roughnessFactor=mix(mix(mix(.19,.28,river),.40,pool),mix(.53,.70,pool),foam);
float runup=.2+sin(hwTime*1.03+sin(p.x*.072)*.62)*.2;
float sandHeight=wp.y-hwSea;
float wetAlpha=(1.-smoothstep(.22+runup,.46+runup,sandHeight))*smoothstep(-.13,.04,sandHeight);
if(wet>.5){
 float swash=(1.-smoothstep(runup-.12,runup+.04,sandHeight))*cells;
 diffuseColor.rgb=mix(vec3(.012,.018,.021)*( .8+.3*wn(p*7.)),vec3(.55,.67,.68),swash*.72);
 roughnessFactor=.085+wn(p*3.)*.05;
 diffuseColor.a=wetAlpha*.8;
 normal=normalize(mat3(viewMatrix)*vec3(-slope.x*.04,1.,-slope.y*.04));
}else{
 diffuseColor.a=smoothstep(-.04,.12,depth);
}
if(diffuseColor.a<.005)discard;
`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
// The environment supplies the sky reflection; no second scene/refraction pass.
vec3 eye=normalize(cameraPosition-wp);
float fresnel=.025+.975*pow(1.-max(0.,dot(eye,n)),5.);
outgoingLight+=vec3(.025,.075,.11)*fresnel*(1.-foam)*(1.-wet);
outgoingLight+=reflectedLight.indirectSpecular*wet*.4;
vec3 halfSun=normalize(eye+hwSun);
float glitter=pow(max(0.,dot(n,halfSun)),650.)*smoothstep(.40,.72,lace);
outgoingLight-=reflectedLight.directSpecular*mix(.45,.95,max(pool,river*.35));
outgoingLight-=reflectedLight.indirectSpecular*pool*.75;
outgoingLight+=min(hwSunColour,vec3(2.))*glitter*mix(1.3,.38,river)*(1.-foam)*(1.-wet)*(1.-pool);
// Shared post owns aerial haze; water adds none.
#include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => "hw-water-depth-flow-v3";
  return m;
}

export function fallMaterial({ T, kit, uniforms }) {
  const m = kit.material({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.02,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
  });
  const compile = m.onBeforeCompile;
  m.onBeforeCompile = (s) => {
    compile(s);
    Object.assign(s.uniforms, uniforms);
    s.vertexShader =
      `attribute float hwSheet;varying vec2 fuv;varying vec3 fp;varying float fs;uniform float hwTime;\n${s.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
fuv=uv;fs=hwSheet;
transformed.x+=sin(uv.y*28.-hwTime*7.+uv.x*17.+fs*2.)*.13*sin(uv.y*3.14159);
fp=(modelMatrix*vec4(transformed,1.)).xyz;`,
      );
    s.fragmentShader =
      `varying vec2 fuv;varying vec3 fp;varying float fs;uniform float hwTime;uniform sampler3D hwNoise;
float fn(vec2 p){return texture(hwNoise,vec3(p/64.,.31)).r;}\n${s.fragmentShader}`.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
// UV height is flight time: constant advection accelerates down the parabola.
float travel=fuv.y+hwTime*.57;
float ribbons=fn(vec2(fuv.x*42.+fs*113.,travel*12.+fs*71.));
float tears=fn(vec2(fuv.x*160.+fs*41.+sin(travel*19.)*2.,travel*65.));
float fine=pow(.5+.5*sin(fuv.x*320.+ribbons*9.+sin(travel*24.+fs)),4.);
float lip=smoothstep(.86,.99,fuv.y);
float aeration=pow(1.-fuv.y,.65);
float water=clamp(.13+ribbons*.68+tears*.23+fine*.21+aeration*.12+lip*.30,0.,1.);
normal=normalize(normal+vec3((ribbons-.5)*.12,(tears-.5)*.06,0.));
diffuseColor.rgb=mix(vec3(.08,.25,.27),vec3(.72,.82,.81),water*water);
roughnessFactor=mix(.24,.64,water);
float edgeNoise=fn(vec2(fuv.x*35.+fs*117.,travel*17.));
float edge=smoothstep(.0,.06+edgeNoise*.07,fuv.x)*(1.-smoothstep(.88-edgeNoise*.05,1.,fuv.x));
float strands=smoothstep(.25,.72,ribbons+fine*.26);
float core=1.-smoothstep(.20,.49,abs(fuv.x-.5));
float curtainAlpha=mix(.62,.45,step(.5,fs))*(.24+.76*strands)+core*.24;
diffuseColor.a*=mix(curtainAlpha,.97,lip)*edge;
diffuseColor.a*=smoothstep(0.,.018,fuv.y);

`,
      );
  };
  m.customProgramCacheKey = () => "hw-falling-sheets-v2";
  return m;
}

// All vapour uses a single instanced camera-facing pool, animated in the shader.
export function vapourMaterial({ T, uniforms }) {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    uniforms,
    vertexShader: `attribute vec4 hwParticle;attribute vec4 hwSource;attribute vec2 hwLife;
uniform float hwTime;uniform float hwStation[3];
varying vec2 puv;varying vec3 pw;varying float pa,ps,po;
void main(){
 float age=fract(hwParticle.x+hwTime/hwLife.x);
 float station=hwSource.w;
 float on=1.;if(station>=0.){int i=int(station);on=hwStation[i];}
 float size=hwParticle.y*(.25+age*1.2);
 vec3 origin=hwSource.xyz;
 vec3 center=origin+vec3(age*hwParticle.z+sin(age*8.+hwParticle.x*32.)*(.3+age*1.2),mix(age,age*age,step(hwLife.y,0.))*hwLife.y,age*hwParticle.w+cos(hwParticle.x*43.+age*5.)*age*1.4);
 vec4 view=modelViewMatrix*vec4(center,1.);
 view.xy+=position.xy*size;gl_Position=projectionMatrix*view;
 puv=uv;pw=(modelMatrix*vec4(center,1.)).xyz;
 pa=sin(age*3.14159)*on;ps=hwParticle.x;po=hwSource.w>=0. ? .58 : (hwSource.w< -2.5 ? .22 : (hwSource.w< -1.5 ? .28 : (hwLife.y<0. ? .38 : .13)));
}`,
    fragmentShader: `uniform sampler3D hwNoise;uniform vec3 hwSun,hwSunColour,hwFog;uniform float hwTime;
varying vec2 puv;varying vec3 pw;varying float pa,ps,po;
void main(){
 vec2 q=puv-.5;float radius=length(q);
 float n=texture(hwNoise,vec3((q*6.+ps*94.)/64.,hwTime*.035+ps)).r;
 n=n*.7+texture(hwNoise,vec3((q*17.+ps*140.)/64.,hwTime*.053+ps)).r*.3;
 if(po>.4)n=texture(hwNoise,vec3((q*8.+ps*40.)/64.,.23)).r;
 float cloud=mix(smoothstep(.25,.66,n),smoothstep(.06,.55,n),step(.4,po));
 float fringe=radius+(.5-n)*.18;
 float density=exp(-dot(q,q)*9.)*(1.-smoothstep(.25,.52,fringe))*cloud;
 if(po>.4)density=exp(-dot(q,q)*13.)*(1.-smoothstep(.30,.5,radius))*cloud;
 float forward=pow(max(0.,dot(normalize(pw-cameraPosition),hwSun)),5.);
 vec3 colour=mix(vec3(.49,.63,.69),vec3(.92,.94,.91),smoothstep(-.3,.8,puv.y+n*.25));
 colour+=min(hwSunColour,vec3(1.4))*forward*.13;
 float alpha=density*pa*po;
 // Shared post owns distance haze for vapour too.
 gl_FragColor=vec4(colour,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`,
  });
}

// Angular rainbow: appears only near the antisolar 42-degree cone, inside spray.
export function rainbowMaterial({ T, uniforms }) {
  return new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true,
    vertexShader: `varying vec2 ruv;varying vec3 rw;void main(){ruv=uv;rw=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(rw,1.);}`,
    fragmentShader: `uniform vec3 hwSun;varying vec2 ruv;varying vec3 rw;
void main(){
 float angle=acos(clamp(dot(normalize(rw-cameraPosition),-hwSun),-1.,1.));
 float band=(angle-.707)/.043;
 vec3 c=clamp(vec3(1.5-abs(band*4.-3.),1.5-abs(band*4.-2.),1.5-abs(band*4.-1.)),0.,1.);
 float edge=1.-smoothstep(.18,.5,length(ruv-.5));
 float alpha=max(0.,sin(clamp(band,0.,1.)*3.14159))*edge*.14;
 gl_FragColor=vec4(c,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`,
  });
}
