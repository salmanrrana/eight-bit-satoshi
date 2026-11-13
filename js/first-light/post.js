// FIRST LIGHT image pipeline. One HDR scene render goes in, the finished frame
// comes out:
//   scene (camera nudged by a sub-pixel each frame)
//   -> fog and ambient occlusion at half size -> composite
//   -> temporal anti-aliasing (blend with the re-projected previous frame)
//   -> bloom -> tone map and colour grade -> sharpen, grain, vignette, fade.
// renderer.js owns the single instance. Content modules never touch it.
// Per frame: begin(camera) once the camera is final and BEFORE anything copies
// its projection (lighting, sky), then render(scene, camera, look).
import * as T from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

const VERTEX =
  "varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}";
const LEVELS = 6; // bloom mip count, starting at half size
function halton(index, base) {
  let fraction = 1,
    result = 0;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    fraction /= base;
    result += fraction * (i % base);
  }
  return result;
}
// Sub-pixel camera offsets, in pixels around the pixel centre.
const JITTER = Array.from({ length: 8 }, (_, i) => [
  halton(i + 1, 2) - 0.5,
  halton(i + 1, 3) - 0.5,
]);

// Ambient occlusion from depth alone (scalable ambient obscurance). Half size,
// a few rotated taps per pixel; the temporal pass averages the rotation away.
const AO = `
uniform sampler2D depth;uniform mat4 inverseProjection;uniform vec2 pixel,lens;uniform float frame;varying vec2 v;
const float RADIUS=1.1;
vec3 viewAt(vec2 uv){vec4 p=inverseProjection*vec4(uv*2.-1.,texture2D(depth,uv).x*2.-1.,1.);return p.xyz/p.w;}
void main(){
// A half-size pixel centre sits exactly on a full-size texel border, where
// nearest sampling is a coin toss. Step to the texel centre first.
vec2 c=v-pixel*.5;
if(texture2D(depth,c).x>=.99999){gl_FragColor=vec4(1.);return;}
vec3 p=viewAt(c);
// Normal from the nearer neighbour on each axis, so depth edges do not bend it.
vec3 l=viewAt(c-vec2(pixel.x,0.)),r=viewAt(c+vec2(pixel.x,0.)),d=viewAt(c-vec2(0.,pixel.y)),u=viewAt(c+vec2(0.,pixel.y));
vec3 dx=abs(l.z-p.z)<abs(r.z-p.z)?p-l:r-p,dy=abs(d.z-p.z)<abs(u.z-p.z)?p-d:u-p;
vec3 n=cross(dx,dy);
if(dot(n,n)<1e-14){gl_FragColor=vec4(1.);return;}
n=normalize(n);
float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy+frame*5.588238,vec2(.06711056,.00583715))));
vec2 reach=min(RADIUS*lens*.5/max(-p.z,.2),vec2(.12));
float sum=0.;
for(int i=0;i<SAMPLES;i++){
float t=(float(i)+.5)/float(SAMPLES),a=(float(i)+noise)*2.39996323;
vec3 q=viewAt(c+vec2(cos(a),sin(a))*t*reach)-p;
float vv=dot(q,q),f=max(RADIUS*RADIUS-vv,0.);
sum+=f*f*f*max((dot(q,n)-.015+.003*p.z)/(vv+.01),0.);
}
float ao=max(0.,1.-sum*5./(pow(RADIUS,6.)*float(SAMPLES)));
gl_FragColor=vec4(mix(ao,1.,smoothstep(50.,110.,-p.z)));
}`;

// Full size. Upsamples the half-size fog and occlusion with depth-aware weights
// (no halos around near objects), then applies both to the scene colour.
const COMPOSITE = `
uniform sampler2D tDiffuse,fogTexture,aoTexture,depth;uniform vec2 halfSize,range,pixel;uniform float aoStrength;varying vec2 v;
float metres(float z){return range.x*range.y/(range.y-z*(range.y-range.x));}
void main(){
vec3 colour=texture2D(tDiffuse,v).rgb;
// One bad procedural sample must not poison the frame history.
if(any(isnan(colour))||any(isinf(colour)))colour=vec3(0.);
float z=metres(texture2D(depth,v).x);
vec2 p=v*halfSize-.5,base=floor(p),f=p-base;vec4 fog=vec4(0.);float ao=0.,total=0.;
for(int j=0;j<2;j++)for(int i=0;i<2;i++){
vec2 uv=(base+vec2(float(i),float(j))+.5)/halfSize;
float w=(i==0?1.-f.x:f.x)*(j==0?1.-f.y:f.y)+.001;
w/=1.+abs(metres(texture2D(depth,uv-pixel*.5).x)-z)/z*60.;
fog+=texture2D(fogTexture,uv)*w;ao+=texture2D(aoTexture,uv).r*w;total+=w;
}
fog/=total;ao/=total;
colour*=mix(1.,ao,aoStrength);
gl_FragColor=vec4(clamp(colour*fog.a+fog.rgb,0.,64.),1.);
}`;

// Temporal anti-aliasing. History is found by re-projecting through depth, so
// camera motion is exact; things that move on their own are kept honest by
// clamping history to what the neighbourhood looks like this frame.
const TEMPORAL = `
uniform sampler2D tDiffuse,history,depth;uniform mat4 reproject;uniform vec2 pixel;uniform float keep;varying vec2 v;
vec3 squash(vec3 c){return c/(1.+max(c.r,max(c.g,c.b)));}
vec3 expand(vec3 c){return c/max(1.-max(c.r,max(c.g,c.b)),.001);}
vec3 now(vec2 uv){return squash(texture2D(tDiffuse,uv).rgb);}
// Five-tap Catmull-Rom: keeps the history sharp while it is resampled.
vec3 past(vec2 uv){
vec2 p=uv/pixel,c=floor(p-.5)+.5,f=p-c;
vec2 w0=f*(-.5+f*(1.-.5*f)),w1=1.+f*f*(-2.5+1.5*f),w2=f*(.5+f*(2.-1.5*f)),w3=f*f*(-.5+.5*f);
vec2 w12=w1+w2,t0=(c-1.)*pixel,t3=(c+2.)*pixel,t12=(c+w2/w12)*pixel;
vec4 sum=vec4(texture2D(history,vec2(t12.x,t0.y)).rgb,1.)*(w12.x*w0.y)
+vec4(texture2D(history,vec2(t0.x,t12.y)).rgb,1.)*(w0.x*w12.y)
+vec4(texture2D(history,t12).rgb,1.)*(w12.x*w12.y)
+vec4(texture2D(history,vec2(t3.x,t12.y)).rgb,1.)*(w3.x*w12.y)
+vec4(texture2D(history,vec2(t12.x,t3.y)).rgb,1.)*(w12.x*w3.y);
return squash(max(sum.rgb/sum.a,0.));
}
void main(){
// Re-project with the nearest depth in a small cross so edges keep their history.
float z=texture2D(depth,v).x;vec2 at=v;
for(int i=0;i<4;i++){
vec2 o=v+(i==0?vec2(pixel.x,0.):i==1?vec2(-pixel.x,0.):i==2?vec2(0.,pixel.y):vec2(0.,-pixel.y));
float d=texture2D(depth,o).x;if(d<z){z=d;at=o;}
}
vec4 h=reproject*vec4(at*2.-1.,z*2.-1.,1.);
vec2 prev=v+(h.xy/h.w*.5+.5)-at;
vec3 c=now(v),lo=c,hi=c,m1=c,m2=c*c;
for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
if(x==0&&y==0)continue;
vec3 s=now(v+vec2(float(x),float(y))*pixel);lo=min(lo,s);hi=max(hi,s);m1+=s;m2+=s*s;
}
m1/=9.;vec3 spread=sqrt(max(m2/9.-m1*m1,0.));
lo=max(lo,m1-1.5*spread);hi=min(hi,m1+1.5*spread);
float w=h.w>0.&&prev.x>0.&&prev.x<1.&&prev.y>0.&&prev.y<1.?keep:0.;
gl_FragColor=vec4(expand(mix(c,clamp(past(prev),lo,hi),w)),1.);
}`;

// Bloom: a chain of wide downsamples, then tent upsamples added back together.
// No threshold; the grade mixes a little of it in, so glow follows real energy.
const DOWN = `
uniform sampler2D tDiffuse;uniform vec2 texel;uniform float first;varying vec2 v;
vec3 s(float x,float y){return texture2D(tDiffuse,v+vec2(x,y)*texel).rgb;}
float calm(vec3 c){return 1./(1.+dot(c,vec3(.2126,.7152,.0722)));}
void main(){
vec3 a=s(-2.,2.),b=s(0.,2.),c=s(2.,2.),d=s(-2.,0.),e=s(0.,0.),f=s(2.,0.),g=s(-2.,-2.),h=s(0.,-2.),i=s(2.,-2.);
vec3 c0=(s(-1.,1.)+s(1.,1.)+s(-1.,-1.)+s(1.,-1.))*.25,c1=(a+b+d+e)*.25,c2=(b+c+e+f)*.25,c3=(d+e+g+h)*.25,c4=(e+f+h+i)*.25;
// First step only: weight by brightness so one hot pixel cannot flicker the glow.
vec4 w=mix(vec4(1.),vec4(calm(c1),calm(c2),calm(c3),calm(c4)),first);float w0=mix(1.,calm(c0),first);
gl_FragColor=vec4((c0*w0*.5+(c1*w.x+c2*w.y+c3*w.z+c4*w.w)*.125)/(w0*.5+(w.x+w.y+w.z+w.w)*.125),1.);
}`;
const UP = `
uniform sampler2D tDiffuse;uniform vec2 texel;varying vec2 v;
vec3 s(float x,float y){return texture2D(tDiffuse,v+vec2(x,y)*texel).rgb;}
void main(){gl_FragColor=vec4((s(-1.,1.)+s(1.,1.)+s(-1.,-1.)+s(1.,-1.)+2.*(s(0.,1.)+s(-1.,0.)+s(1.,0.)+s(0.,-1.))+4.*s(0.,0.))/16.,1.);}`;

// Tone map (same ACES fit three.js uses) and grade, written display-ready.
const GRADE = `
uniform sampler2D tDiffuse,bloom,exposureMap;uniform float bloomMix,saturation,contrast;uniform vec3 shadowTint,highlightTint;varying vec2 v;
vec3 fit(vec3 x){return (x*(x+.0245786)-.000090537)/(x*(.983729*x+.4329510)+.238081);}
vec3 aces(vec3 c){
c=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777)*(c*texture2D(exposureMap,vec2(.5)).r/.6);
return clamp(mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602)*fit(c),0.,1.);
}
void main(){
vec3 c=aces(mix(texture2D(tDiffuse,v).rgb,texture2D(bloom,v).rgb/float(LEVELS),bloomMix));
float l=dot(c,vec3(.2126,.7152,.0722));
c*=mix(shadowTint,highlightTint,smoothstep(.02,.55,l));
c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,saturation);
c=mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));
c=mix(c,c*c*(3.-2.*c),contrast);
gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

// Auto exposure, kept entirely on the GPU (reading pixels back stalls the frame).
// METER averages the finished frame to one pixel; ADAPT eases the exposure
// toward the value that would bring that average to `key`.
const METER = `
uniform sampler2D tDiffuse;
void main(){float l=0.;for(int y=0;y<4;y++)for(int x=0;x<4;x++)l+=dot(texture2D(tDiffuse,(vec2(float(x),float(y))+.5)/4.).rgb,vec3(.2126,.7152,.0722));gl_FragColor=vec4(l/16.);}`;
const ADAPT = `
uniform sampler2D previous,meter;uniform float key,ceiling,rate,seed;
void main(){
float old=texture2D(previous,vec2(.5)).r,seen=max(.08,texture2D(meter,vec2(.5)).r);
float wanted=clamp(old*sqrt(key/seen),.85,ceiling);
gl_FragColor=vec4(seed>0.?seed:old+(wanted-old)*rate);
}`;

// Last pass, to the screen: contrast-adaptive sharpen (restores what temporal
// blending softens), film grain, vignette and the fade used by cuts.
const FINISH = `
uniform sampler2D tDiffuse;uniform vec2 pixel;uniform float time,fade,sharpen,grain,vignette;varying vec2 v;
void main(){
vec3 c=texture2D(tDiffuse,v).rgb,n=texture2D(tDiffuse,v+vec2(0.,pixel.y)).rgb,s=texture2D(tDiffuse,v-vec2(0.,pixel.y)).rgb,e=texture2D(tDiffuse,v+vec2(pixel.x,0.)).rgb,w=texture2D(tDiffuse,v-vec2(pixel.x,0.)).rgb;
vec3 lo=min(c,min(min(n,s),min(e,w))),hi=max(c,max(max(n,s),max(e,w)));
vec3 amount=sqrt(clamp(min(lo,1.-hi)/max(hi,vec3(.001)),0.,1.))*(-1./mix(8.,5.,sharpen));
c=(c+(n+s+e+w)*amount)/(1.+4.*amount);
float r=fract(sin(dot(v+fract(time),vec2(12.9898,78.233)))*43758.5453)-.5;
c+=r*grain*(1.-.6*dot(c,vec3(.333)));
vec2 q=v-.5;c*=1.-vignette*dot(q,q);
gl_FragColor=vec4(c*(1.-fade),1.);
}`;

/** createPost(renderer, { quality, fogMaterial }).
 * fogMaterial: lighting.js's half-size fog shader; this file sets its `depth`,
 * `pixel` and `frame` uniforms and draws it. Returns the scene target to render or
 * compile against, `display` (the tone-mapped frame, for exposure metering)
 * and the per-frame calls described at the top of the file. */
export function createPost(renderer, { quality, fogMaterial }) {
  const quad = new FullScreenQuad();
  const pass = (fragmentShader, uniforms, extra = {}) =>
    new T.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      ...extra,
    });
  const hdr = () =>
    new T.WebGLRenderTarget(4, 4, {
      type: T.HalfFloatType,
      depthBuffer: false,
    });
  const sceneTarget = new T.WebGLRenderTarget(4, 4, { type: T.HalfFloatType });
  sceneTarget.depthTexture = new T.DepthTexture(4, 4, T.UnsignedIntType);
  const fogTarget = hdr(),
    aoTarget = new T.WebGLRenderTarget(4, 4, { depthBuffer: false }),
    mixed = hdr(),
    history = [hdr(), hdr()],
    mips = Array.from({ length: LEVELS }, hdr),
    display = new T.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const texture = () => ({ value: null }),
    vec2 = () => ({ value: new T.Vector2() });
  const ao = pass(
    AO,
    {
      depth: texture(),
      inverseProjection: { value: new T.Matrix4() },
      pixel: vec2(),
      lens: vec2(),
      frame: { value: 0 },
    },
    {
      defines: {
        SAMPLES: quality === "ultra" ? 12 : quality === "high" ? 9 : 6,
      },
    },
  );
  const composite = pass(COMPOSITE, {
    tDiffuse: { value: sceneTarget.texture },
    fogTexture: { value: fogTarget.texture },
    aoTexture: { value: aoTarget.texture },
    depth: texture(),
    halfSize: vec2(),
    range: vec2(),
    pixel: vec2(),
    aoStrength: { value: 0.85 },
  });
  const temporal = pass(TEMPORAL, {
    tDiffuse: { value: mixed.texture },
    history: texture(),
    depth: texture(),
    reproject: { value: new T.Matrix4() },
    pixel: vec2(),
    keep: { value: 0 },
  });
  const down = pass(DOWN, {
    tDiffuse: texture(),
    texel: vec2(),
    first: { value: 0 },
  });
  const up = pass(
    UP,
    { tDiffuse: texture(), texel: vec2() },
    {
      blending: T.CustomBlending,
      blendSrc: T.OneFactor,
      blendDst: T.OneFactor,
    },
  );
  const grade = pass(
    GRADE,
    {
      tDiffuse: texture(),
      bloom: { value: mips[0].texture },
      exposureMap: texture(),
      bloomMix: { value: 0.05 },
      saturation: { value: 1 },
      contrast: { value: 0.2 },
      shadowTint: { value: new T.Color(1, 1, 1) },
      highlightTint: { value: new T.Color(1, 1, 1) },
    },
    { defines: { LEVELS } },
  );
  const one = () =>
    new T.WebGLRenderTarget(1, 1, {
      type: T.HalfFloatType,
      depthBuffer: false,
      minFilter: T.NearestFilter,
      magFilter: T.NearestFilter,
    });
  const metered = one(),
    exposures = [one(), one()];
  const meter = pass(METER, { tDiffuse: { value: display.texture } });
  const adapt = pass(ADAPT, {
    previous: texture(),
    meter: { value: metered.texture },
    key: { value: 0.28 },
    ceiling: { value: 2.2 },
    rate: { value: 0 },
    seed: { value: 1.15 },
  });
  const finish = pass(FINISH, {
    tDiffuse: { value: display.texture },
    pixel: vec2(),
    time: { value: 0 },
    fade: { value: 0 },
    sharpen: { value: 0.6 },
    grain: { value: 0.022 },
    vignette: { value: 0.22 },
  });
  const current = new T.Matrix4(),
    previous = new T.Matrix4(),
    inverse = new T.Matrix4(),
    lastPosition = new T.Vector3();
  // Last exposure seen on the CPU: for tools only, refreshed when they ask.
  let exposureSeen = 1.15,
    reading = false;
  let width = 4,
    height = 4,
    frame = 0,
    fresh = true;
  function draw(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    quad.render(renderer);
  }
  return {
    sceneTarget,
    display,
    /** Tunable look: grade.uniforms and finish.uniforms values, set per frame. */
    grade: grade.uniforms,
    finish: finish.uniforms,
    composite: composite.uniforms,
    /** Size of the drawing buffer in real pixels (already scaled). */
    setSize(w, h) {
      width = Math.max(2, Math.round(w));
      height = Math.max(2, Math.round(h));
      const halfW = Math.ceil(width / 2),
        halfH = Math.ceil(height / 2);
      for (const t of [sceneTarget, mixed, display, ...history])
        t.setSize(width, height);
      fogTarget.setSize(halfW, halfH);
      aoTarget.setSize(halfW, halfH);
      mips.forEach((m, i) =>
        m.setSize(Math.max(1, halfW >> i), Math.max(1, halfH >> i)),
      );
      composite.uniforms.halfSize.value.set(halfW, halfH);
      for (const m of [ao, composite, temporal, finish, fogMaterial])
        m.uniforms.pixel.value.set(1 / width, 1 / height);
      fresh = true;
    },
    /** Drop the frame history (after a cut or a teleport). */
    reset() {
      fresh = true;
    },
    /** Nudge the camera by this frame's sub-pixel offset and work out where
     * every pixel was last frame. Call before lighting/sky read the camera. */
    begin(camera) {
      camera.clearViewOffset();
      camera.updateMatrixWorld();
      current.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      if (camera.position.distanceToSquared(lastPosition) > 6.25) fresh = true;
      lastPosition.copy(camera.position);
      temporal.uniforms.reproject.value
        .copy(previous)
        .multiply(inverse.copy(current).invert());
      previous.copy(current);
      const [x, y] = JITTER[frame % JITTER.length];
      camera.setViewOffset(width, height, x, y, width, height);
    },
    /** Restart auto exposure from a known value (after loading, after a cut). */
    seedExposure(value) {
      adapt.uniforms.seed.value = value;
      exposureSeen = value;
    },
    /** For tools: the latest exposure read back. Pass true to schedule a fresh read,
     * so normal play (which never asks) never pays for one. */
    exposure(refresh = false) {
      if (refresh && !reading) {
        reading = true;
        renderer
          .readRenderTargetPixelsAsync(
            exposures[(frame + 1) % 2],
            0,
            0,
            1,
            1,
            new Uint16Array(4),
          )
          .then((pixel) => {
            exposureSeen = T.DataUtils.fromHalfFloat(pixel[0]);
          })
          .catch(() => {})
          .finally(() => {
            reading = false;
          });
      }
      return exposureSeen;
    },
    /** Every material here, so the loader can compile them with the scene's.
     * `screen` ones draw to the canvas, the rest to off-screen targets. */
    materials: {
      offscreen: [ao, composite, temporal, down, up, grade, meter, adapt],
      screen: [finish],
    },
    /** look: { time, fade, dt, key, ceiling }: clock, cut fade (0..1), frame
     * time in seconds, and the auto-exposure target brightness and upper limit. */
    render(scene, camera, look) {
      const depth = sceneTarget.depthTexture;
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);
      fogMaterial.uniforms.depth.value = depth;
      fogMaterial.uniforms.frame.value = frame % 64;
      draw(fogMaterial, fogTarget);
      ao.uniforms.depth.value = depth;
      ao.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      ao.uniforms.lens.value.set(
        camera.projectionMatrix.elements[0],
        camera.projectionMatrix.elements[5],
      );
      ao.uniforms.frame.value = frame % 64;
      draw(ao, aoTarget);
      composite.uniforms.depth.value = depth;
      composite.uniforms.range.value.set(camera.near, camera.far);
      draw(composite, mixed);
      const next = history[frame % 2];
      temporal.uniforms.history.value = history[(frame + 1) % 2].texture;
      temporal.uniforms.depth.value = depth;
      temporal.uniforms.keep.value = fresh ? 0 : 0.9;
      draw(temporal, next);
      mips.forEach((mip, i) => {
        const source = i ? mips[i - 1] : next;
        down.uniforms.tDiffuse.value = source.texture;
        down.uniforms.texel.value.set(1 / source.width, 1 / source.height);
        down.uniforms.first.value = i ? 0 : 1;
        draw(down, mip);
      });
      // Add each smaller level onto the one above it; do not clear in between.
      renderer.autoClear = false;
      for (let i = LEVELS - 2; i >= 0; i--) {
        up.uniforms.tDiffuse.value = mips[i + 1].texture;
        up.uniforms.texel.value.set(
          1 / mips[i + 1].width,
          1 / mips[i + 1].height,
        );
        draw(up, mips[i]);
      }
      renderer.autoClear = true;
      grade.uniforms.tDiffuse.value = next.texture;
      const exposure = exposures[frame % 2];
      adapt.uniforms.previous.value = exposures[(frame + 1) % 2].texture;
      adapt.uniforms.key.value = look.key;
      adapt.uniforms.ceiling.value = look.ceiling;
      adapt.uniforms.rate.value = 1 - Math.exp(-look.dt * 0.65);
      draw(adapt, exposure);
      adapt.uniforms.seed.value = 0;
      grade.uniforms.exposureMap.value = exposure.texture;
      draw(grade, display);
      draw(meter, metered);
      finish.uniforms.time.value = look.time;
      finish.uniforms.fade.value = look.fade;
      draw(finish, null);
      frame++;
      fresh = false;
    },
    dispose() {
      for (const t of [
        sceneTarget,
        fogTarget,
        aoTarget,
        mixed,
        display,
        metered,
        ...exposures,
        ...history,
        ...mips,
      ])
        t.dispose();
      sceneTarget.depthTexture.dispose();
      for (const m of [
        ao,
        composite,
        temporal,
        down,
        up,
        grade,
        meter,
        adapt,
        finish,
      ])
        m.dispose();
      quad.dispose();
    },
  };
}
