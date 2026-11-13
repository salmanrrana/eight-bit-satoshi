import { surfaceAge } from "./surfaces.js";
/** Clone the finish, retaining the shared surface program and changing only ageing. */
export function weatherMasonry(source, resources, brick = false) {
  const material = source.clone();
  resources.push(material);
  material.customProgramCacheKey = source.customProgramCacheKey;
  return surfaceAge(material, brick ? 4 : 3, source.onBeforeCompile);
}

/** Ray-box rooms behind dirty glazing. The opposing facade uses an analytic
 * reflected ray, not another scene pass. It remains attached to world space. */
export function roomMaterial(kit, side) {
  const mat = kit.material({
    color: 0x111820,
    roughness: 0.18,
    metalness: 0,
    envMapIntensity: 0.35,
  });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    base(shader);
    shader.vertexShader =
      "varying vec2 roomUV;varying vec3 roomWorld;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
roomUV=uv;vec4 rw=vec4(position,1.);
#ifdef USE_INSTANCING
rw=instanceMatrix*rw;
#endif
roomWorld=(modelMatrix*rw).xyz;`,
    );
    shader.fragmentShader =
      `varying vec2 roomUV;varying vec3 roomWorld;
float roomHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
vec2 address=vec2(floor(-roomWorld.z/10.)*4.+floor((mod(-roomWorld.z,10.)-.7)/2.32),floor((roomWorld.y-4.)/2.9));
float seed=roomHash(address+${side.toFixed(1)});
float occupied=max(step(.85,seed),${side < 0 ? "step(abs(address.x-2.),.1)*step(abs(address.y),.1)" : "0."});
vec3 eye=cameraPosition-roomWorld;
vec3 rd=normalize(vec3(eye.z*${side.toFixed(1)},-eye.y,-abs(eye.x)));
vec3 rp=vec3((roomUV-.5)*vec2(1.32,1.88),0.);
vec3 inv=1./(rd+mix(vec3(-.0001),vec3(.0001),step(vec3(0.),rd)));
vec3 end=vec3(((rd.x<0.?-.72:.72)-rp.x)*inv.x,((rd.y<0.?-1.03:1.03)-rp.y)*inv.y,-(2.4+seed)*inv.z);
float hit=min(end.x,min(end.y,end.z));vec3 room=rp+rd*hit;
float back=step(end.z,min(end.x,end.y));
vec3 colour=mix(vec3(.20,.16,.11),vec3(.3,.29,.25),step(.95,room.y));
colour=mix(colour,vec3(.075,.055,.035),step(room.y,-.96));
vec2 wallCoord=mix(vec2(room.z+1.25,room.y),room.xy,back);
float wall=step(abs(room.y),.98);
float pictureFrame=wall*step(abs(wallCoord.x-.08),.34)*step(abs(wallCoord.y-.08),.4);
float picture=wall*step(abs(wallCoord.x-.08),.28)*step(abs(wallCoord.y-.08),.34);
colour=mix(colour,vec3(.035,.025,.016),pictureFrame);
colour=mix(colour,mix(vec3(.10,.15,.14),vec3(.035,.055,.048),step(wallCoord.y,.07+sin(wallCoord.x*12.)*.06)),picture);
float desk=wall*step(room.y,-.52)*step(abs(wallCoord.x+.19),.53);
colour=mix(colour,vec3(.045,.035,.026),desk);
colour*=mix(1.,.7+.3*step(.018,abs(fract(wallCoord.x*4.)-.5)),desk);
// A cabinet is a second ray-box intersection, so its top and side occlude
// the rear wall instead of reading as furniture painted onto that wall.
vec3 furnitureMin=vec3(-.54,-1.02,-2.45),furnitureMax=vec3(.56,-.48,-1.65);
vec3 fa=(furnitureMin-rp)*inv,fb=(furnitureMax-rp)*inv;
vec3 fn=min(fa,fb),ff=max(fa,fb);
float furnitureNear=max(fn.x,max(fn.y,fn.z)),furnitureFar=min(ff.x,min(ff.y,ff.z));
if(furnitureNear>0. && furnitureNear<furnitureFar && furnitureNear<hit){
  vec3 fp=rp+rd*furnitureNear;
  float top=step(fn.x,fn.y)*step(fn.z,fn.y);
  float sideFace=step(fn.y,fn.x)*step(fn.z,fn.x);
  colour=vec3(.085,.055,.028)*(.6+top*.8+sideFace*.2);
  colour*=.78+.22*smoothstep(.008,.02,abs(mod(fp.x+.28,.55)-.275));
}
// Local lamp falloff illuminates the room volume and its furniture.
float lampGlow=exp(-length(room-vec3(.4,.35,-1.8))*1.3);
colour*=.28+lampGlow*2.4;
colour+=vec3(1.,.65,.28)*exp(-length(room.xy-vec2(.4,.35))*18.)*back*.8;
float blindHeight=.64+seed*.29;
float blind=step(blindHeight,roomUV.y);
colour=mix(colour,vec3(.13,.115,.09)*(.6+.4*smoothstep(.07,.2,fract(roomUV.y*31.))),blind);
float curtain=1.-smoothstep(.12,.17+seed*.14,min(roomUV.x,1.-roomUV.x));
colour=mix(colour,vec3(.13,.105,.08)*(.5+.5*sin(roomUV.x*116.)),curtain*.85);
vec3 tint=seed>.95?vec3(.6,.76,1.):seed>.91?vec3(.8,.96,.89):vec3(1.,.72,.4);
float television=seed>.95?(.85+.15*sin(time*${reduced ? "0." : ".65"}+seed*7.)):1.;
// Reflected eye ray intersects the opposite street frontage at x=+/-7m.
vec3 refl=reflect(-normalize(eye),vec3(${-side.toFixed(1)},0.,0.));
float distanceAcross=14./max(abs(refl.x),.05);
vec3 opposite=roomWorld+refl*distanceAcross;
vec2 facadeUV=vec2(mod(-opposite.z-1.4+1.16,2.32)-1.16,mod(opposite.y-5.+1.45,2.9)-1.45);
float opening=(1.-smoothstep(.6,.72,abs(facadeUV.x)))*(1.-smoothstep(.88,1.02,abs(facadeUV.y)));
float frontPool=exp(-pow((opposite.y-4.)*.23,2.))*(.25+.75*pow(.5+.5*cos((opposite.z+10.)*.2856),4.));
vec3 facadeTone=mix(vec3(.009,.014,.022),vec3(.055,.035,.017),frontPool);
float course=1.-smoothstep(.008,.022,abs(mod(opposite.y+.15,.3)-.15));
facadeTone*=1.-course*.23;
vec3 reflection=mix(facadeTone,vec3(.003,.006,.011),opening);
float reflectedRoom=step(.9,roomHash(floor(vec2(-opposite.z/2.32,opposite.y/2.9))));
reflection+=vec3(.18,.12,.054)*opening*reflectedRoom;
float streetLamp=exp(-pow((opposite.y-5.1)*2.,2.))*exp(-pow((mod(-opposite.z+10.,22.)-11.)*2.,2.));
reflection+=vec3(.8,.43,.12)*streetLamp;
float fresnel=.08+.83*pow(1.-abs(normalize(eye).x),4.);
float dirt=(1.-smoothstep(.0,.15,min(min(roomUV.x,1.-roomUV.x),min(roomUV.y,1.-roomUV.y))));
float rivulet=pow(.5+.5*sin(roomWorld.z*367.+sin(roomWorld.z*87.)*2.+sin(roomWorld.y*7.+roomWorld.z*23.+time*1.7)*.35),26.);
totalEmissiveRadiance=mix(colour*tint*(.002+occupied*.8)*television,reflection,fresnel)*(1.-dirt*.65);
diffuseColor.rgb=vec3(.004,.007,.009)+dirt*vec3(.025,.023,.019);
roughnessFactor=.16+dirt*.48+rivulet*.035;
normal=normalize(normal+vec3(dFdx(rivulet),dFdy(rivulet),0.)*.008);
`,
    );
  };
  mat.customProgramCacheKey = () => `street-glass-room-4-${side}`;
  return mat;
}
