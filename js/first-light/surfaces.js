/** FIRST LIGHT shared surface library. Owner: MATERIALS worker.
 * surface(kit, name, {scale, tint, space, weather}) returns a cached kit material.
 * scale is metres per repeat (default 1); world projection needs no mesh UVs.
 * space:"object" locks the grain to moving objects, including instances.
 * Two shared GPU maps hold colour/AO and tangent normal XY/roughness/metalness.
 * Masonry uses normal alpha for joint height instead of metalness.
 * READY contains completed surfaces. All resources belong to the kit.
 */
import * as T from "three";

// Related finishes share baked microstructure, never material instances.
// [bake family, colour multiplier, roughness multiplier, weather]
const BASE = {
  asphalt: [0, 0xffffff, 1, true],
  paving: [1, 0xffffff, 1, true],
  kerbstone: [1, 0xd9d6ca, 0.94, true],
  concrete: [2, 0xffffff, 1, true],
  brick: [3, 0xffffff, 1, true],
  cutStone: [4, 0xffffff, 1, true],
  paintedMetal: [5, 0xffffff, 1, true],
  rustedSteel: [6, 0xffffff, 1, true],
  galvanized: [7, 0xffffff, 1, true],
  corrugated: [7, 0xe0e5e6, 1.1, true],
  glass: [8, 0xffffff, 1, false],
  blockStone: [9, 0x666b78, 0.86, true],
  rock: [9, 0xffffff, 1, false],
  bark: [10, 0xffffff, 1, false],
  soil: [11, 0xffffff, 1, true],
  mud: [11, 0xa59c89, 0.65, true],
  wood: [12, 0xffffff, 1, true],
  plywood: [13, 0xffffff, 1, true],
  plaster: [14, 0xffffff, 1, true],
  plastic: [15, 0xffffff, 0.64, false],
  rubber: [15, 0x8a9096, 1.18, false],
  paper: [16, 0xffffff, 1, false],
  gold: [17, 0xffce74, 0.83, false],
  brass: [17, 0xc4a45c, 1.14, false],
};
export const SURFACES = Object.keys(BASE);
export const READY = [...SURFACES];
const caches = new WeakMap();

// All dimensions below are metres within a one-metre tile. Noise is periodic,
// so mipmaps never expose a border. The world shader adds nonperiodic ageing.
const fields = /* glsl */ `
uniform float family, channel, resolution;
float h2(vec2 p){return hash(vec3(p,19.7));}
float pn(vec2 p,vec2 cells){
  p*=cells;vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h2(mod(i,cells)),h2(mod(i+vec2(1,0),cells)),f.x),
    mix(h2(mod(i+vec2(0,1),cells)),h2(mod(i+1.,cells)),f.x),f.y);
}
float pn(vec2 p,float cells){return pn(p,vec2(cells));}
vec3 cell(vec2 p,float count){
  vec2 i=floor(p*count),f=fract(p*count);float d=8.,d2=8.,seed=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(float(x),float(y)),id=mod(i+o,count);
    vec2 jitter=vec2(h2(id),h2(id+31.));
    float v=dot(o+jitter-f,o+jitter-f);
    if(v<d){d2=d;d=v;seed=h2(id+71.);}else{d2=min(d2,v);}
  }
  return vec3(sqrt(d),seed,sqrt(d2)-sqrt(d));
}
float joint(vec2 p,vec2 count,float stagger,float width){
  vec2 q=p*count;q.x+=mod(floor(q.y),2.)*stagger;
  vec2 d=min(fract(q),1.-fract(q))/count;
  return 1.-smoothstep(width,width+.003,min(d.x,d.y));
}
float scratches(vec2 p){
  return smoothstep(.68,.85,pn(p,vec2(512.,16.)))*
    smoothstep(.28,.66,pn(p,32.));
}
void main(){
  vec2 p=vUv;
  float n=pn(p,128.),fine=pn(p,512.),macro=pn(p,4.);
  float h=.0,r=.8,m=0.,ao=1.;vec3 c=vec3(.4);
  if(family<.5){
    vec3 a=cell(p,150.);float grit=1.-smoothstep(.17,.44,a.x);
    vec3 fracture=cell(p+vec2(pn(p,8.)*.025),4.);
    float fissure=(1.-smoothstep(.002,.009,fracture.z))*smoothstep(.48,.62,fracture.y);
    float glint=step(.86,a.y)*grit;
    h=grit*.0018+n*.0006-fissure*.0025;
    c=mix(vec3(.019,.021,.023),vec3(.13,.128,.118),grit*(.25+a.y*.65));
    c*=.9+macro*.2;c*=1.-fissure*.75;
    r=.83+grit*.12-glint*.38;m=glint*.16;ao=1.-fissure*.5-(1.-grit)*.12;
  }else if(family<1.5){
    float j=joint(p,vec2(2.,2.),0.,.003);
    vec3 a=cell(p,95.);float pore=1.-smoothstep(.045,.13,a.x);
    h=-j*.006+n*.0012-pore*.0015;
    c=vec3(.30,.29,.26)*(.8+macro*.32)+(a.y-.5)*.045;
    c=mix(c,vec3(.25,.24,.22),j);r=.76+n*.15;ao=1.-j*.38-pore*.18;
  }else if(family<2.5){
    float seam=joint(p,vec2(1.,2.),0.,.0015);
    vec2 tie=mod(p+vec2(.25,.25),.5)-.25;
    float hole=1.-smoothstep(.009,.014,length(tie));
    float ring=1.-smoothstep(.014,.021,length(tie));
    float pore=smoothstep(.72,.9,n);
    float board=pn(p,vec2(128.,4.));
    h=n*.0015+pn(p,vec2(256.,32.))*.0005-seam*.0025-hole*.004;
    c=vec3(.30,.315,.32)*(.83+macro*.25)-pore*.03;
    c*=1.-seam*.16-hole*.48-ring*.07;
    c+=(board-.5)*.009;r=.77+n*.14;ao=1.-hole*.5-seam*.25-pore*.15;
  }else if(family<3.5){
    float j=joint(p,vec2(4.,12.),.5,.0035+(n-.5)*.002);
    vec2 q=p*vec2(4.,12.);q.x+=mod(floor(q.y),2.)*.5;
    float id=h2(mod(floor(q),vec2(4.,12.)));
    float pits=smoothstep(.7,.88,n);
    h=(1.-j)*(.006+n*.0018-pits*.001)+fine*.0002;
    c=mix(vec3(.17,.048,.024),vec3(.38,.13,.065),id)*(.82+n*.35);
    c=mix(c,vec3(.24,.225,.19)*(.85+n*.3),j);
    r=.82+n*.13;ao=1.-j*.36-pits*.12;
  }else if(family<4.5){
    float j=joint(p,vec2(2.,4.),.5,.0025+(n-.5)*.0015);
    float strata=pn(p,vec2(8.,64.));
    h=(1.-j)*.005+strata*.001+n*.0006;
    c=vec3(.43,.405,.345)*(.85+macro*.25)+(strata-.5)*.055;
    c=mix(c,vec3(.25,.24,.215),j);r=.69+n*.18;ao=1.-j*.42;
  }else if(family<6.5){
    // Damage starts at panel seams, fasteners and a few long abrasions.
    float seam=joint(p,vec2(1.,2.),0.,.0018);
    vec2 bolt=mod(p-vec2(.075,.125),vec2(.85,.5));
    bolt=min(bolt,vec2(.85,.5)-bolt);
    float boltD=length(bolt);
    float fixing=1.-smoothstep(.007,.011,boltD);
    float edge=max(seam,1.-smoothstep(.011,.035+n*.015,boltD));
    float scratch=scratches(p+vec2(p.y*.19,0.));
    float scrape=smoothstep(.76,.86,pn(p,vec2(4.,256.)))*smoothstep(.58,.72,pn(p,4.));
    float corrosion=macro*.46+pn(p,16.)*.32+n*.22;
    float damage=edge*(.25+pn(p,vec2(48.,8.))*.7)+scrape*.56+scratch*.04;
    float chip=smoothstep(.68,.76,damage+corrosion*.28);
    float primer=smoothstep(.55,.68,damage+corrosion*.28);
    float oxide=pn(p,32.);
    float bleed=pow(pn(p,vec2(64.,2.)),5.)*(.2+edge*.8);
    if(family>5.5){
      chip=smoothstep(.47,.61,corrosion+edge*.25);
      primer=chip;
      bleed=pow(pn(p,vec2(64.,2.)),4.)*.4;
    }
    float flake=cell(p,36.).z;
    float scaleLayer=smoothstep(.01,.04,flake)*floor(oxide*4.)*.0005;
    h=chip*(n*.0007+scaleLayer)-primer*.00035-seam*.0008+fixing*.0015;
    float pit=smoothstep(.7,.87,n)*chip;
    h+=fine*(family>5.5?.000025:.000055)-pit*.0015;
    vec3 rust=mix(vec3(.031,.012,.005),vec3(.24,.065,.012),oxide*oxide);
    rust=mix(rust,vec3(.085,.032,.009),1.-smoothstep(.006,.025,flake));
    vec3 substrate=vec3(.025,.026,.027)*(.7+macro*.6);
    if(family<5.5){
      c=vec3(.032,.073,.054)*(.96+macro*.08);
      c=mix(c,vec3(.12,.067,.033),primer);
    }else{
      c=mix(substrate,vec3(.14,.145,.15),scratch*.13+smoothstep(.64,.8,macro)*.18);
    }
    c=mix(c,rust,chip)*(1.-pit*.27);c=mix(c,vec3(.095,.033,.009),bleed*.55*(1.-chip));
    c*=1.-seam*.4;c=mix(c,vec3(.11),fixing*.6);
    r=mix(family>5.5?.51:.42,.94,chip)+primer*(1.-chip)*.25;
    m=(family>5.5?1.-chip:fixing*(1.-chip))*.86;
    ao=1.-seam*.35-chip*(1.-smoothstep(.006,.028,flake))*.2;
  }else if(family<7.5){
    vec3 zinc=cell(p,65.);float brush=pn(p,vec2(512.,8.));
    float bloom=smoothstep(.63,.79,macro*.65+pn(p,16.)*.35);
    float water=pn(p,vec2(32.,2.));
    float tide=1.-smoothstep(.008,.035,abs(water-.55));
    h=(zinc.y-.5)*.000004+brush*.000002;
    c=vec3(.46,.48,.49)*(.99+zinc.y*.025);
    c*=1.-tide*.018;
    r=.4+zinc.y*.035+bloom*.04+tide*.035;m=.96;ao=1.;
  }else if(family<8.5){
    float streak=pn(p,vec2(128.,4.));
    float dirt=smoothstep(.58,.85,streak)*(.3+macro*.7);
    h=dirt*.00003+n*.000003;
    c=mix(vec3(.12,.16,.18),vec3(.22,.205,.17),dirt*.22);
    r=.065+dirt*.25;m=0.;ao=1.-dirt*.035;
  }else if(family<9.5){
    vec2 broken=p+vec2(pn(p,8.),pn(p+13.,8.))*.025;
    vec3 a=cell(broken,5.);float crack=1.-smoothstep(.002,.012,a.z);
    float strata=pn(p,vec2(4.,48.));
    float facet=pn(broken,16.);
    float pores=smoothstep(.67,.85,n);
    h=facet*.005+macro*.004+n*.0018+strata*.0004-crack*.003-pores*.001;
    c=mix(vec3(.175,.18,.165),vec3(.195,.20,.18),a.y)*(.85+facet*.3);
    c+=(strata-.5)*.013;c*=1.-crack*.25-pores*.15;
    r=.86+n*.12;ao=1.-crack*.3-pores*.12;
  }else if(family<10.5){
    float ridge=pn(p+vec2((pn(p,4.)-.5)*.035,0.),vec2(48.,4.));
    float split=1.-smoothstep(.18,.31,ridge);
    h=ridge*.009+n*.0007-split*.004;
    c=mix(vec3(.028,.024,.019),vec3(.125,.105,.078),ridge)*(.8+macro*.4)*1.8;
    r=.87+n*.12;ao=1.-split*.42;
  }else if(family<11.5){
    vec3 a=cell(p,38.);float pebble=(1.-smoothstep(.12,.32,a.x))*smoothstep(.55,.7,a.y);
    vec3 crumb=cell(p,90.);
    float clod=pn(p,32.);
    float crack=(1.-smoothstep(.003,.012,cell(p,7.).z))*smoothstep(.4,.7,macro);
    float root=(1.-smoothstep(.001,.003,abs(fract(p.x*7.+sin(p.y*18.84956)*.18)-.5)/7.))*smoothstep(.55,.7,pn(p,4.));
    h=clod*.002+n*.0008+crumb.x*.0025+pebble*.003-crack*.002+root*.0009;
    c=mix(vec3(.055,.032,.016),vec3(.145,.095,.047),clod);
    c=mix(c,vec3(.16,.145,.115)*(.6+a.y*.45),pebble);
    c+=(crumb.y-.5)*.012;c=mix(c,vec3(.16,.105,.042),root*.7);c*=1.-crack*.55;
    r=.91+n*.08;ao=.87+pebble*.12-crack*.3-root*.08;
  }else if(family<13.5){
    vec2 knot=vec2(sin(p.x*6.2831853),sin((p.y-.23)*6.2831853));
    float burl=exp(-dot(knot,knot)*12.);
    float warp=pn(p,4.)*.025+sin(p.y*12.5663706)*.006+burl*.06;
    vec2 g=p+vec2(warp,0.);
    float grain=pn(g,vec2(256.,8.));
    float rings=.5+.5*sin((p.x+warp)*175.9291886+pn(p,8.)*8.);
    float seam=joint(p,vec2(5.,1.),0.,.0015);
    if(family>12.5){
      rings=.5+.5*sin((p.x+warp*1.3)*50.26548246+pn(p,4.)*6.);
      rings=mix(rings,grain,.55);
      seam=0.;
    }
    float split=smoothstep(.75,.88,grain)*smoothstep(.45,.75,macro);
    h=grain*.00012+rings*.00003-seam*.002-split*.0005;
    c=mix(vec3(.12,.061,.024),vec3(.32,.21,.105),.28+grain*.42+rings*.1);
    if(family>12.5)c=mix(vec3(.24,.155,.077),vec3(.49,.335,.174),grain*.55+rings*.45);
    c*=1.-seam*.6-split*.25-burl*.24;r=.68+grain*.22;ao=1.-seam*.38-split*.18;
  }else if(family<14.5){
    vec3 fracture=cell(p+vec2(pn(p,4.),pn(p+17.,4.))*.035,4.);
    float crack=(1.-smoothstep(.0008,.0028,fracture.z))*smoothstep(.45,.7,fracture.y);
    float sand=pn(p,256.);
    h=n*.0003+sand*.00008-crack*.0007;
    c=vec3(.52,.49,.43)*(.995+macro*.01);
    c*=1.-crack*.43;r=.87+n*.08;ao=1.-crack*.2;
  }else if(family<15.5){
    h=n*.00004+fine*.00002;c=vec3(.035,.042,.05)*(.95+macro*.1);
    r=.62+n*.13+scratches(p)*.07;ao=1.;
  }else if(family<16.5){
    float fibre=pn(p,vec2(512.,64.));
    h=fibre*.000025+n*.00001;
    c=vec3(.82,.79,.69)*(.96+fibre*.06);r=.87+fibre*.09;ao=1.;
  }else{
    float scratch=max(scratches(p),scratches(vec2(p.y,1.-p.x))*.35);float brush=pn(p,vec2(512.,8.));
    h=-scratch*.000004+brush*.000001;
    c=vec3(.92,.91,.88)*(.98+macro*.025);
    r=.24+scratch*.1+brush*.02;m=1.;ao=1.;
  }
  if(channel<.5){gl_FragColor=vec4(max(c,vec3(.001)),clamp(ao,0.,1.));}
  else{
    // Derivatives are metres per texel; multiplying by resolution restores
    // physical slopes. XY stores slope, B roughness, A metalness or masonry height.
    vec3 normal=normalize(vec3(-dFdx(h)*resolution,-dFdy(h)*resolution,1.));
    gl_FragColor=vec4(normal.xy*.5+.5,clamp(r,.04,1.), (family==1.||family==3.||family==4.) ? clamp((h+.006)/.013,0.,1.) : m);
  }
}`;

const projection = /* glsl */ `
varying vec3 flSurfacePosition,flSurfaceNormal,flSurfaceWorld;
uniform sampler2D flColourAO,flNormalRM;
uniform float flScale,flWeather,flCorrugated,flFamily,flMud,flBlock;
uniform float flParallaxEnabled,flAgeStyle;
vec2 flParallax(vec2 uv, vec3 viewT, float depth){
  vec2 delta=-viewT.xy/max(viewT.z,.3)*depth/8.;
  float level=1.,here=texture2D(flNormalRM,uv).a,before=here;
  for(int i=0;i<8;i++){if(here>=level)break;uv+=delta;level-=.125;before=here;here=texture2D(flNormalRM,uv).a;}
  float over=here-level,under=level+.125-before;
  return uv-delta*over/max(over+under,1e-4);
}
float flHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
// Smooth value noise from kit.noiseMap: one filtered fetch, no mipmaps, so it
// is safe inside the flFamily branches.
uniform highp sampler3D flNoiseMap;
float flNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return texture(flNoiseMap,(i+f+.5)/64.).r;
}
// Reoriented projections have consistent handedness on all six box faces.
void flSample(out vec4 colourAO,out vec4 normalRM,out vec3 relief){
  vec3 p=flSurfacePosition/flScale,n=normalize(flSurfaceNormal);
  // Smooth domain variation removes matching grit/rust patches on a long wall.
  // Architectural courses and directional grain deliberately keep straight axes.
  if(flFamily==0.||flFamily==9.||flFamily==11.)
    p+=vec3(flNoise(p*.73),flNoise(p*.73+17.),flNoise(p*.73+39.))*.17;
  vec3 w=pow(abs(n),vec3(8.));w/=max(dot(w,vec3(1.)),.0001);
  vec3 s=sign(n);vec2 x=p.zy*vec2(-s.x,1.),y=p.xz*vec2(1.,-s.y),z=p.xy*vec2(s.z,1.);
  if(flParallaxEnabled>.5 && (flFamily==1.||flFamily==3.||flFamily==4.)){
    vec3 eye=normalize(cameraPosition-flSurfaceWorld);
    float depth=(flFamily==4.?.025:.01)/flScale*(1.-smoothstep(8.,12.,distance(cameraPosition,flSurfaceWorld)));
    if(w.x>.002)x=flParallax(x,vec3(-eye.z*s.x,eye.y,abs(eye.x)),depth*smoothstep(.1,.35,abs(eye.x)));
    if(w.y>.002)y=flParallax(y,vec3(eye.x,-eye.z*s.y,abs(eye.y)),depth*smoothstep(.1,.35,abs(eye.y)));
    if(w.z>.002)z=flParallax(z,vec3(eye.x*s.z,eye.y,abs(eye.z)),depth*smoothstep(.1,.35,abs(eye.z)));
  }
  // The coherent dominant projection costs two fetches on planar faces.
  // Explicit gradients preserve mips across fract(); kit has already initialized
  // its render-target sampler before the caller can request repeat wrapping.
  colourAO=vec4(0.);normalRM=vec4(0.);relief=vec3(0.);
  if(w.x>.002){vec4 a=textureGrad(flColourAO,fract(x),dFdx(x),dFdy(x)),b=textureGrad(flNormalRM,fract(x),dFdx(x),dFdy(x));vec2 d=b.xy*2.-1.;d/=sqrt(max(.08,1.-dot(d,d)));
    colourAO+=a*w.x;normalRM+=b*w.x;relief+=vec3(0.,d.y,-d.x*s.x)*w.x;}
  if(w.y>.002){vec4 a=textureGrad(flColourAO,fract(y),dFdx(y),dFdy(y)),b=textureGrad(flNormalRM,fract(y),dFdx(y),dFdy(y));vec2 d=b.xy*2.-1.;d/=sqrt(max(.08,1.-dot(d,d)));
    colourAO+=a*w.y;normalRM+=b*w.y;relief+=vec3(d.x,0.,-d.y*s.y)*w.y;}
  if(w.z>.002){vec4 a=textureGrad(flColourAO,fract(z),dFdx(z),dFdy(z)),b=textureGrad(flNormalRM,fract(z),dFdx(z),dFdy(z));vec2 d=b.xy*2.-1.;d/=sqrt(max(.08,1.-dot(d,d)));
    colourAO+=a*w.z;normalRM+=b*w.z;relief+=vec3(d.x*s.z,d.y,0.)*w.z;}
  if(flFamily==1.||flFamily==3.||flFamily==4.)normalRM.a=0.;
  if(flCorrugated>.5){
    // Integrate the sinusoidal 77 mm profile over the pixel footprint.
    // Once subpixel, its unresolved slope becomes a broad sheen, not crawling lines.
    float axis=max(w.z,w.y)>=w.x?p.x:p.z;
    float phase=axis*6.2831853*13.;
    float footprint=max(length(vec2(dFdx(axis),dFdy(axis)))*13.,.0001);
    float profileWeight=exp(-footprint*footprint*12.);
    float profile=cos(phase)*.43*profileWeight*pow(max(w.x,max(w.y,w.z)),4.);
    relief+=vec3(profile*(w.z+w.y),0.,profile*w.x);
    colourAO.rgb*=.98+.02*sin(phase)*profileWeight;
    normalRM.b=max(normalRM.b,.36+.16*(1.-profileWeight));
    float sheet=fract(axis/1.0),height=fract(p.y/1.5);
    float sheetAA=max(.001,length(vec2(dFdx(axis),dFdy(axis))));
    float seam=1.-smoothstep(.002,.004+sheetAA,min(sheet,1.-sheet));
    float cut=1.-smoothstep(.002,.018,min(height,1.-height));
    vec2 fixing=vec2(fract(axis*13./4.+.5)-.5,fract(p.y/1.5+.1)-.5);
    float fixingAA=max(.0005,length(vec2(dFdx(axis),dFdy(axis)))+length(vec2(dFdx(p.y),dFdy(p.y))));
    float screw=1.-smoothstep(.0,fixingAA,length(fixing*vec2(4./13.,1.5))-.006);
    float drip=pow(flNoise(vec3(floor(axis*13.)*3.,p.y*.8,11.)),5.);
    float rust=cut*smoothstep(.35,.7,flNoise(vec3(axis*8.,p.y*2.,9.)));
    colourAO.rgb=mix(colourAO.rgb,vec3(.11,.039,.012),rust*.8);
    colourAO.rgb*=1.-seam*.24-drip*.15;
    colourAO.rgb=mix(colourAO.rgb,vec3(.22),screw*.65);
    colourAO.a*=1.-seam*.15;normalRM.b=mix(normalRM.b,.86,rust);
    normalRM.a*=1.-rust*.85;

  }
}
`;

function mapsFor(kit, state, family) {
  if (state.maps.has(family)) return state.maps.get(family);
  // The chosen tier is shared before any content bakes, including auto.
  const hint = kit.quality ?? new URLSearchParams(location.search).get("q");
  const size =
    hint === "ultra" && [0, 3, 9].includes(family)
      ? 2048
      : hint === "high" || hint === "ultra"
        ? 1024
        : 512;
  const start = performance.now();
  const maps = [0, 1].map((channel) => {
    const rt = kit.bake({
      fragment: fields,
      size,
      wrapS: T.RepeatWrapping,
      wrapT: T.RepeatWrapping,
      uniforms: {
        family: { value: family },
        channel: { value: channel },
        resolution: { value: size },
      },
    });
    rt.texture.wrapS = rt.texture.wrapT = T.RepeatWrapping;
    rt.texture.colorSpace = T.NoColorSpace; // albedo is authored in linear light
    return rt.texture;
  });
  state.maps.set(family, maps);
  state.bakeMs += performance.now() - start;
  return maps;
}

export function surface(kit, name, options = {}) {
  if (!Object.hasOwn(BASE, name)) throw new Error(`Unknown surface "${name}"`);
  let state = caches.get(kit);
  if (!state)
    caches.set(
      kit,
      (state = { materials: new Map(), maps: new Map(), bakeMs: 0 }),
    );
  const [family, colour, roughness, weather] = BASE[name];
  const scale = options.scale ?? 1,
    space = options.space ?? "world",
    wet = options.weather ?? weather;
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error("Surface scale must be positive metres");
  if (space !== "world" && space !== "object")
    throw new Error(`Unknown surface space "${space}"`);
  const tint = new T.Color(colour);
  if (options.tint !== undefined) tint.multiply(new T.Color(options.tint));
  const key = `${name}|${scale}|${tint.r},${tint.g},${tint.b}|${space}|${wet}`;
  if (state.materials.has(key)) return state.materials.get(key);
  const maps = mapsFor(kit, state, family);
  const material = kit.material({
    color: tint,
    roughness,
    metalness: 1,
    weather: false,
    // Glass remains a standard dielectric: the level's sky probe supplies its
    // real reflection, with a grazing Fresnel coat added below.
    transparent: name === "glass",
    opacity: name === "glass" ? 0.82 : 1,
    depthWrite: name !== "glass",
    envMapIntensity: name === "glass" ? 1.25 : 1,
  });
  const compile = material.onBeforeCompile;
  const kitProgramKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    Object.assign(shader.uniforms, {
      flColourAO: { value: maps[0] },
      flNormalRM: { value: maps[1] },
      flScale: { value: scale },
      flAgeStyle: { value: 0 },
      flParallaxEnabled: { value: space === "world" ? 1 : 0 },
      flWeather: { value: wet ? 1 : 0 },
      flCorrugated: { value: name === "corrugated" ? 1 : 0 },
      flFamily: { value: family },
      flNoiseMap: { value: kit.noiseMap },
      flMud: { value: name === "mud" ? 1 : 0 },
      flBlock: { value: name === "blockStone" ? 1 : 0 },
    });
    shader.vertexShader = `varying vec3 flSurfacePosition,flSurfaceNormal,flSurfaceWorld;
${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec4 flP=vec4(position,1.);vec3 flN=normal;
      #ifdef USE_INSTANCING
        flP=instanceMatrix*flP;
        mat3 flIM=mat3(instanceMatrix);
        flN/=vec3(dot(flIM[0],flIM[0]),dot(flIM[1],flIM[1]),dot(flIM[2],flIM[2]));
        flN=flIM*flN;
      #endif
      flSurfaceWorld=(modelMatrix*flP).xyz;
      ${
        space === "world"
          ? `flSurfacePosition=flSurfaceWorld;
        mat3 flMM=mat3(modelMatrix);
        flN/=vec3(dot(flMM[0],flMM[0]),dot(flMM[1],flMM[1]),dot(flMM[2],flMM[2]));
        flSurfaceNormal=normalize(flMM*flN);`
          : "flSurfacePosition=position;flSurfaceNormal=normal;"
      }
    `,
    );
    shader.fragmentShader = projection + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      vec4 flC,flD;vec3 flRelief;flSample(flC,flD,flRelief);
      if(flAgeStyle>1.5 && flAgeStyle<2.5){float slabUp=pow(max(0.,normalize(flSurfaceNormal).y),8.);
      float slabAge=flNoise(flSurfaceWorld*.8)*.7+flNoise(flSurfaceWorld*3.1)*.3;
      vec3 slabColour=vec3(.24,.245,.228)*(.66+slabAge*.6);
      float gravel=smoothstep(.58,.74,slabAge)*smoothstep(4.2,7.7,abs(flSurfaceWorld.x-20.));
      slabColour=mix(slabColour,vec3(.095,.086,.063)*( .7+flNoise(flSurfaceWorld*72.)*.7),gravel);
      vec2 tyreP=flSurfaceWorld.xz-vec2(20.,-85.);
      float tyre=exp(-pow((length(tyreP)-5.2)*18.,2.))+exp(-pow((length(tyreP)-6.6)*18.,2.));
      tyre*=smoothstep(-7.,-1.,tyreP.y)*smoothstep(.25,.7,flNoise(flSurfaceWorld*4.));
      float oil=smoothstep(.58,.74,flNoise(flSurfaceWorld*1.3))*exp(-length(flSurfaceWorld.xz-vec2(16.,-82.))*.4);
      slabColour*=1.-clamp(tyre*.38+oil*.65,0.,.75);
      flC.rgb=mix(flC.rgb,slabColour,slabUp);flC.a=mix(flC.a,.94,slabUp);
      flRelief*=mix(1.,.15,slabUp);flD.b=mix(flD.b,.9,slabUp);
}
      float flAge=flNoise(flSurfacePosition*.31)+.35*flNoise(flSurfacePosition*1.7+7.);
      float flLow=1.-flC.a;
      // Per-unit tones break identical brick/stone tiles without moving joints.
      vec3 flAxis=abs(normalize(flSurfaceNormal));
      vec2 flPlane=flAxis.y>max(flAxis.x,flAxis.z)?flSurfacePosition.xz:
        flAxis.x>flAxis.z?flSurfacePosition.zy:flSurfacePosition.xy;
      float flUnitTone=1.;
      if(flFamily==3.){
        vec2 flBrick=flPlane/flScale*vec2(4.,12.);
        flBrick.x+=mod(floor(flBrick.y),2.)*.5;
        flUnitTone=.82+.36*flHash(vec3(floor(flBrick),13.));
      }
      if(flFamily==12.)flUnitTone=.87+.26*flHash(vec3(floor(flPlane.x/flScale*5.),0.,19.));
      if(flFamily==1.||flFamily==4.)flUnitTone=.88+.24*flHash(vec3(floor(flPlane/flScale*vec2(2.,flFamily==4.?4.:2.)),41.));

      float flUp=pow(max(0.,inverseTransformDirection(normalize(vNormal),viewMatrix).y),4.);
      float flRepair=0.,flTar=0.,flWear=0.,flOil=0.,flRut=0.,flSilt=0.,flShapeHeight=0.;
      float flArris=smoothstep(.04,.2,1.-max(flAxis.x,max(flAxis.y,flAxis.z)));
      vec3 flP=flSurfacePosition/flScale;
      if(flFamily==0.){
        // Repairs span metres; the aggregate bake stays at its physical size.
        vec2 flRoad=flP.xz;
        vec2 flPatch=mod(flRoad+vec2(1.85,2.55),vec2(4.7,6.3))-vec2(2.35,3.15);
        float flPatchEdge=max(abs(flPatch.x)-.65,abs(flPatch.y)-1.15)+
          (flNoise(flP*17.)-.5)*.035;
        flRepair=1.-smoothstep(-.008,.008,flPatchEdge);
        flTar=1.-smoothstep(.018,.038,abs(flPatchEdge));
        float flWheel=abs(abs(mod(flRoad.x+4.,8.)-4.)-1.15);
        flWear=(1.-smoothstep(.25,.65,flWheel))*(.75+.25*flNoise(flP*.7));
        flOil=smoothstep(.74,.83,flNoise(flP*1.8+21.))*smoothstep(.4,.65,flNoise(flP*.53));
        float flGutter=smoothstep(2.8,3.7,abs(mod(flRoad.x+4.,8.)-4.));
        flC.rgb=mix(flC.rgb,flC.rgb*.68,flRepair);
        flC.rgb=mix(flC.rgb,vec3(.012,.013,.014),flTar*.88);
        flC.rgb=mix(flC.rgb,vec3(.036,.035,.031),flWear*.25);
        flC.rgb*=1.-flOil*.72;
        flC.rgb=mix(flC.rgb,flC.rgb*vec3(1.65,1.4,1.05),flGutter*.45);
        flD.b=mix(flD.b,.8,flRepair);
        flD.b=mix(flD.b,.52,flWear);flD.b=mix(flD.b,.31,max(flTar,flOil));
        flRelief*=1.-flWear*.45;
      }
      if(flFamily==9.){
        if(flBlock<.5){
          float flLichen=smoothstep(.62,.73,flNoise(flP*5.)*.7+flNoise(flP*31.)*.3)*(.2+.8*flUp);
          flC.rgb*=mix(.8,1.12,flUp);
          vec3 flCrust=mix(vec3(.24,.25,.16),vec3(.32,.33,.29),flNoise(flP*37.));
          flC.rgb=mix(flC.rgb,flCrust,flLichen*.78);
          flRelief*=1.+(1.-flUp)*.12;
          flD.b=mix(flD.b,.98,flLichen);
        }else{
          float flSawFootprint=length(vec2(dFdx(flP.y),dFdy(flP.y)))*95.;
          float flSaw=sin(flP.y*6.2831853*95.+flNoise(flP*.8)*.5)*exp(-flSawFootprint*flSawFootprint*10.);
          float flChisel=pow(flNoise(flP*vec3(36.,5.,36.)),3.);
          flC.rgb*=.94+flSaw*.02-flChisel*.25+flArris*.15;
          flShapeHeight=-flArris*flChisel*.002;
          flRelief+=vec3(0.,flSaw*.035,0.)*(1.-flUp);
          flD.b*=.86;
        }
      }
      if(flMud>.5){
        // Compacted silt and long ruts replace the soil's crumb/pebble relief.
        float flLane=abs(mod(flP.x+1.5,3.)-1.5);
        float flTracks=(1.-smoothstep(.13,.23,abs(flLane-.55+sin(flP.z*.9)*.025)));
        float flTreadFootprint=length(vec2(dFdx(flP.z),dFdy(flP.z)))*7.;
        float flTread=.5+.5*sin(flP.z*6.2831853*7.+flP.x*8.)*exp(-flTreadFootprint*flTreadFootprint*8.);
        flRut=flTracks*(.85+.15*flTread);
        flSilt=flNoise(flP*4.);
        flC.rgb=mix(vec3(.058,.037,.021),vec3(.11,.075,.04),flSilt)*(1.-flRut*.16);
        flD.b=.81+flSilt*.12;flC.a=1.-flRut*.25;
        flRelief*=.12;
        flShapeHeight=(flSilt*.002-flRut*.012)*flUp;
        flRelief+=vec3(sin(flP.x*17.)*.06,0.,sin(flP.z*44.)*.08)*flTracks;
      }
      if(flFamily==5.||flFamily==6.){
        // Bevel wear and gravity streaks supplement the metre-scale seam bake.
        float flColumn=flNoise(vec3(flP.x*36.,flP.y*.3,flP.z*36.));
        float flDrop=fract(-flP.y*2.+.25);
        float flBleed=smoothstep(.63,.82,flColumn)*exp(-flDrop*5.)*(1.-flUp);
        flC.rgb=mix(flC.rgb,vec3(.095,.032,.008),flBleed*.5);
        if(flFamily==5.)flC.rgb=mix(flC.rgb,vec3(.095,.072,.043),flArris*.4);
        flD.b=mix(flD.b,.9,flBleed*.4);
      }
      if(flFamily==7.){
        float flBloom=smoothstep(.65,.84,flNoise(flP*9.3)*.7+flNoise(flP*31.7)*.3);
        flC.rgb=mix(flC.rgb,vec3(.46,.47,.45),flBloom*.18);
        flD.b+=flBloom*.12;flD.a*=1.-flBloom*.25;
      }
      if(flFamily==13.){
        float drip=pow(flNoise(vec3(flPlane.x*28.,flPlane.y*.3,9.)),3.);
        flC.rgb*=1.-drip*.6*(1.-smoothstep(0.,.6,mod(-flPlane.y,2.44)));
      }
      if(flFamily==14.){
        float flMissingField=flNoise(flP*2.1)*.72+flNoise(flP*9.3)*.19+flNoise(flP*63.)*.09;
        float flMissing=smoothstep(.72,.75,flMissingField);
        flC.rgb=mix(flC.rgb,vec3(.24,.215,.17),flMissing);
        flShapeHeight=-flMissing*.003;
        flC.a*=1.-flMissing*.15;
        // Generic sill spacing: narrow stains extend down from ledge ends.
        float flSillX=abs(mod(flPlane.x/flScale+1.4,2.8)-1.4);
        float flSillDrop=mod(-flP.y+.25,3.2);
        float flStain=exp(-pow((flSillX-.62)*18.,2.))*exp(-flSillDrop*2.5)*(1.-flUp);
        flC.rgb*=1.-flStain*.22;
      }
      // Water fills low areas at a sharp, antialiased shoreline.
      float flBasin=(flNoise(flP*.72)+.3*flNoise(flP*2.7))/1.3+flLow*.35+
        flMud*flRut*.3+flWear*.09+flRepair*.025;
      float flWaterline=mix(.9,.51,wetness);
      float flShore=max(.035,fwidth(flBasin)*1.5);
      float flPool=smoothstep(flWaterline-flShore,flWaterline+flShore,flBasin)*flUp;
      flC.rgb*=1.-.16*exp(-pow((flBasin-flWaterline)/.06,2.))*flUp;
      float flWet=clamp(wetness*flWeather*(.58+max(flPool,flBlock*.8)*.42),0.,1.);
      diffuseColor.rgb*=flC.rgb*mix(.86,1.08,flAge*.75)*flUnitTone;
      // Vertical runoff is world-aligned, including on a stack of separate boxes.
      float flRunoff=flNoise(vec3(flSurfacePosition.x*7.,flSurfacePosition.y*.16,flSurfacePosition.z*7.));
      if(flFamily==2.||flFamily==3.||flFamily==4.||flFamily==14.)
        diffuseColor.rgb*=1.-smoothstep(.55,.82,flRunoff)*.13*(1.-flUp);
      diffuseColor.rgb*=1.-flWet*(.28+flPool*.12)*(1.-flD.a*.7);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      if(flAgeStyle>.5 && flAgeStyle<1.5){vec3 ap=flSurfaceWorld;
      float aw=1.-pow(abs(normalize(flSurfaceNormal).y),4.);
      float damp=exp(-max(ap.y,0.)*1.3)*(.45+.55*flNoise(ap*vec3(2.,.25,2.)));
      float sill=abs(mod(ap.z+49.,3.7)-1.85);
      float drop=mod(6.4-ap.y,3.);
      float streak=exp(-pow((sill-.63)*8.,2.))*exp(-drop*1.8);
      float soot=smoothstep(6.,12.,ap.y)*flNoise(ap*vec3(.7,.12,.7));
      diffuseColor.rgb*=1.-aw*(damp*.5+streak*.35+soot*.35);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.67,.8,.58),damp*aw*.25);
      }
      if(flAgeStyle>2.5){// Gravity stains follow the authored 2.32 m windows and 2.9 m floors.
vec3 ageP=flSurfaceWorld;
float ageBay=mod(-ageP.z,10.);
float ageColumn=mod(ageBay-1.4+1.16,2.32)-1.16;
float ageDrop=mod(3.98-ageP.y,2.9);
float ageEnds=exp(-pow((abs(ageColumn)-.65)*13.,2.));
float ageStreak=ageEnds*exp(-ageDrop*1.8)*smoothstep(3.7,4.1,ageP.y);
float ageThreads=flNoise(ageP*vec3(13.,.35,23.));
float agePipe=exp(-pow((ageBay-9.36)*4.,2.));
float ageDamp=smoothstep(.43,.77,flNoise(ageP*vec3(.3,.18,.7))+ageThreads*.17);
float ageBase=exp(-max(0.,ageP.y-.2)*1.8)*(.3+.7*ageDamp);
float ageSoot=smoothstep(7.,16.,ageP.y)*(.24+ageThreads*.23);
float ageBelt=exp(-mod(6.72-ageP.y,3.15)*9.)*.2;
float ageDirt=clamp(ageStreak*(.38+ageThreads*.5)+agePipe*.22+ageBase*.7+exp(-abs(ageP.y-3.48)*8.)*.25+ageSoot+ageDamp*.18+ageBelt,0.,.8);
diffuseColor.rgb*=1.-ageDirt;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.56,.73,.46),agePipe*ageDamp*exp(-ageP.y*.35));
if(flAgeStyle>3.5){float salt=smoothstep(.65,.8,flNoise(ageP*2.7))*(1.-smoothstep(.8,3.8,ageP.y));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.23,.225,.205),salt*.3);}


}
      roughnessFactor*=clamp(flD.b+(flAge-.6)*.055,.045,1.);
      roughnessFactor=mix(roughnessFactor,max(.075,roughnessFactor*.43),flWet);
      roughnessFactor=mix(roughnessFactor,.035,flPool*flWet);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <metalnessmap_fragment>",
      `#include <metalnessmap_fragment>
      metalnessFactor*=flD.a;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      // Reconstruct the baked slope, then transform its projection basis to view
      // space. Derivatives of position carry object scale and instance rotation.
      vec3 flN=normalize(flSurfaceNormal);
      vec3 flPerturb=flRelief-flN*dot(flRelief,flN);
      ${
        space === "world"
          ? "vec3 flViewRelief=mat3(viewMatrix)*flPerturb;"
          : `
        vec3 flQ0=dFdx(flSurfacePosition),flQ1=dFdy(flSurfacePosition);
        vec3 flV0=dFdx(-vViewPosition),flV1=dFdy(-vViewPosition);
        // The reciprocal tangent basis applies inverse scale to a normal,
        // rather than stretching it like a position on a nonuniform instance.
        vec3 flR0=cross(flV1,normal),flR1=cross(normal,flV0);
        float flDet=dot(flV0,flR0);
        vec3 flViewRelief=(flR0*dot(flPerturb,flQ0)+flR1*dot(flPerturb,flQ1))/
          (sign(flDet)*max(abs(flDet),1e-8));
      `
      }
      normal=normalize(normal+flViewRelief*mix(1.,.025,flPool*flWet));
      vec3 flHX=dFdx(-vViewPosition),flHY=dFdy(-vViewPosition);
      vec3 flHRX=cross(flHY,normal),flHRY=cross(normal,flHX);
      float flHDet=dot(flHX,flHRX);
      vec3 flHeightGradient=(flHRX*dFdx(flShapeHeight)+flHRY*dFdy(flShapeHeight))/
        (sign(flHDet)*max(abs(flHDet),1e-8));
      normal=normalize(normal-flHeightGradient*mix(1.,.02,flPool*flWet));
      // Jittered impact rings die before the next one starts: no dot grid.
      if(flWeather>.5 && rain*wetness>.001){
      vec2 flRainP=flSurfaceWorld.xz*3.,flCell=floor(flRainP);
      float flSeed=flHash(vec3(flCell,8.));
      vec2 flOffset=vec2(flSeed,flHash(vec3(flCell,29.)))*.6+.2;
      vec2 flDelta=fract(flRainP)-flOffset;
      float flRadius=length(flDelta),flLife=fract(time*.7+flSeed);
      float flRing=exp(-pow((flRadius-flLife*.65)*35.,2.))*(1.-flLife);
      vec3 flRipple=vec3(flDelta.x,0.,flDelta.y)*flRing*.1*rain*flWet*flPool;
      normal=normalize(normal+mat3(viewMatrix)*flRipple);
      }
      // Bound the specular lobe by filtered relief and screen-space normal variance.
      float flVariance=max(0.,1.-dot(flD.xy*2.-1.,flD.xy*2.-1.));
      vec3 flDx=dFdx(normal),flDy=dFdy(normal);
      roughnessFactor=max(roughnessFactor,min(.65,sqrt(max(dot(flDx,flDx),dot(flDy,flDy))*.45)));
      roughnessFactor=max(roughnessFactor,mix(.07+(1.-flVariance)*.06,.035,flPool*flWet));
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <aomap_fragment>",
      `#include <aomap_fragment>
      reflectedLight.indirectDiffuse*=flC.a;
      reflectedLight.indirectSpecular*=mix(1.,flC.a,.4);
    `,
    );
    if (name === "glass")
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `
      float flFresnel=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),5.);
      diffuseColor.a=mix(.52,.96,flFresnel)+flLow*.2;
      #include <opaque_fragment>
    `,
      );
  };
  material.customProgramCacheKey = () =>
    `${kitProgramKey}|first-light-surface-v6|${space}|${name === "glass" ? "glass" : "opaque"}`;
  // Not enumerable: Material.copy JSON-clones userData and must skip the maps.
  Object.defineProperty(material.userData, "surface", {
    value: { name, scale, space, weather: wet, maps, bakeMs: state.bakeMs },
  });
  state.materials.set(key, material);
  return material;
}

/** Geometry-independent ageing shares the surface program; only this uniform differs. */
export function surfaceAge(
  material,
  style,
  compile = material.onBeforeCompile,
) {
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.flAgeStyle.value = style;
  };
  return material;
}
