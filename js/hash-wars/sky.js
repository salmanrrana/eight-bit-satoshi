import * as T from "three";
// Small HDR sky-view LUT. Optical depths are integrated through spherical
// Rayleigh/Mie/ozone layers; the planet occludes sunlight below the horizon.
const vertex = `varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}`;
// Fixed high-summer noon; the same direction drives the viewer and game.
const TIMES = [0, 1];
export const SUN_AZIMUTH = [0.788, -0.616];
export function sunDirectionAt(_p, target = new T.Vector3()) {
  const elevation = (40 * Math.PI) / 180;
  return target.set(
    SUN_AZIMUTH[0] * Math.cos(elevation),
    Math.sin(elevation),
    SUN_AZIMUTH[1] * Math.cos(elevation),
  );
}
export const noiseGLSL = `
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,n=0.;for(int i=0;i<5;i++){n+=a*noise3(p);p=p*2.03+vec3(17.1,3.7,9.2);a*=.5;}return n;}`;
const fragment = `
precision highp float;varying vec2 v;uniform vec3 sun;uniform float progress;uniform vec2 latitude;
${noiseGLSL}
const float R=6371000.;const float A=6471000.;
const vec3 bR=vec3(5.8,13.5,33.1)*1e-6,bM=vec3(1e-6),bO=vec3(.65,1.88,.085)*1e-6;
vec2 sphere(vec3 o,vec3 d,float r){float b=dot(o,d),c=dot(o,o)-r*r,h=b*b-c;if(h<0.)return vec2(-1.);h=sqrt(h);return vec2(-b-h,-b+h);}
vec3 density(float h){return vec3(exp(-max(h,0.)/8000.),exp(-max(h,0.)/1200.),max(0.,1.-abs(h-25000.)/15000.));}
vec3 extinction(vec3 od){return bR*od.x+bM*od.y*1.1+bO*od.z;}
void main(){
float lon=(v.x-.5)*6.2831853,lat=mix(latitude.x,latitude.y,v.y);
vec3 d=vec3(cos(lat)*cos(lon),sin(lat),cos(lat)*sin(lon));
vec3 o=vec3(0,R+100.,0);float end=sphere(o,d,A).y;vec2 ground=sphere(o,d,R);
if(ground.x>0.)end=min(end,ground.x);
float stepSize=end/20.;vec3 od=vec3(0),sumR=vec3(0),sumM=vec3(0);
for(int i=0;i<20;i++){
vec3 q=o+d*(float(i)+.5)*stepSize;vec3 den=density(length(q)-R);
float lightEnd=sphere(q,sun,A).y;vec2 hit=sphere(q,sun,R);vec3 solar=vec3(0);
for(int j=0;j<6;j++){vec3 sq=q+sun*(float(j)+.5)*lightEnd/6.;solar+=density(length(sq)-R)*lightEnd/6.;}
// Integrate each segment's extinction exactly. Attenuating the whole sample
// at its far edge disproportionately erased blue on long horizon segments.
vec3 optical=extinction(den)*stepSize;
vec3 integral=(vec3(1.)-exp(-optical))/max(optical,vec3(1e-6));
vec3 tr=exp(-extinction(od+solar))*integral;if(hit.x>0.)tr*=0.;
sumR+=tr*den.x*stepSize;sumM+=tr*den.y*stepSize;od+=den*stepSize;
}
float mu=dot(d,sun);float ray=3./(16.*3.14159)*(1.+mu*mu);float g=.76;float mie=(1.-g*g)/(4.*3.14159*pow(1.+g*g-2.*g*mu,1.5));
vec3 sky=10.*(sumR*bR*ray+sumM*bM*mie);
// Airglow, moonlight and a dim multiple-scattered twilight floor.
float dawn=smoothstep(-.24,.06,sun.y);
sky+=mix(vec3(.018,.030,.055),vec3(.018,.045,.10),dawn)*(.65+.35*max(d.y,0.));
// Multiple scattering fills the broad twilight band rather than a horizon stripe.
float twilight=smoothstep(-.17,-.08,sun.y)*(1.-smoothstep(-.035,.07,sun.y));
sky+=vec3(.018,.055,.18)*twilight*(.35+.65*max(d.y,0.));
float horizon=exp(-pow((d.y-.025)/.16,2.));
// This inherited twilight glow must be off at noon, not latched on after dawn.
sky+=vec3(.19,.055,.012)*horizon*twilight*(.3+.7*pow(max(mu,0.),3.));
// Low-angle multiple scattering is amber, not the magenta single-scatter spike.
float warmBand=exp(-pow((d.y-.012)/.12,2.))*twilight*(.45+.55*pow(max(mu,0.),2.));
sky=mix(sky,vec3(.28,.105,.018)+sky*.12,warmBand*.82);
float star=pow(hash(floor(d*1100.)),170.)*smoothstep(.02,.2,d.y)*(1.-smoothstep(-.16,-.035,sun.y));
sky+=star*.10;

// The sharp sun is drawn analytically after interpolating the sky views.
// A finite cloud slab: multi-octave density, self shadowing and silver edges.
float cloudTrans=1.;
if(d.y>0.){
float start=1200./max(d.y,.025),finish=min(2250./max(d.y,.025),start+16000.);float ds=(finish-start)/float(CLOUD_STEPS);float trans=1.;vec3 clouds=vec3(0.);
float cover=.60;
float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
for(int i=0;i<CLOUD_STEPS;i++){
vec3 q=d*(start+(float(i)+.25+.5*jitter)*ds);float h=(q.y-1200.)/1050.;
float n=fbm(q*.00065+vec3(12,0,19));n+=noise3(q*.0031)*.075;n-=abs(noise3(q*.007)-.5)*.06;float den=smoothstep(cover-.025,cover+.09,n)*smoothstep(0.,.18,h)*(1.-smoothstep(.65,1.,h));
// An irregular clearing opens with the retreating storm, revealing the low sun.
float clearing=smoothstep(.97,.999,mu+.015*(noise3(q*.001)-.5))*smoothstep(.55,.7,progress);
den*=1.-clearing*.985;
den=max(0.,den-(1.-noise3(q*.013))*.30*(1.-den));
float shadowDen=fbm((q+sun*700.)*.00065+vec3(12,0,19));
float shade=exp(-max(0.,shadowDen-cover+.08)*9.);float a=1.-exp(-den*ds*.003);
vec3 ambient=mix(vec3(.014,.024,.047),vec3(.24,.34,.52),smoothstep(-.06,.12,sun.y));
vec3 direct=mix(vec3(.05,.07,.12),vec3(1.,.37,.17),smoothstep(-.12,-.025,sun.y));direct=mix(direct,vec3(2.5,2.45,2.3),smoothstep(0.,.16,sun.y));
float silver=pow(max(mu,0.),28.)*1.1;
clouds+=trans*a*(ambient*(.45+.55*h)+direct*(shade*.44+silver*shade+pow(1.-den,3.)*shade*.28)*smoothstep(-.025,.045,sun.y));trans*=1.-a;
}cloudTrans=trans;sky=mix(sky,sky*trans+clouds,smoothstep(0.,.055,d.y));
}
sky=mix(vec3(.028,.045,.075)*(.5+dawn),sky,smoothstep(-.16,.035,d.y));
// The lowest atmosphere stays softly amber through the blue-hour beat.
float lowGlow=exp(-pow((d.y-.012)/.085,2.))*twilight;
sky=mix(sky,vec3(.24,.105,.022),lowGlow*.8);
gl_FragColor=vec4(max(sky,vec3(0.)),cloudTrans);
}`;
export function createSky(renderer, scene, quality) {
  // What the eye sees: only the band from just under the horizon to straight up,
  // so every texel is spent on sky. Reflections get a small full sphere instead.
  const LOW_EDGE = -0.2,
    width = quality === "low" ? 1024 : 2048;
  const views = [],
    probes = [];
  const times = TIMES;
  const steps = times.length - 1;
  const makeTarget = (w, h) =>
    new T.WebGLRenderTarget(w, h, {
      type: T.HalfFloatType,
      depthBuffer: false,
      wrapS: T.RepeatWrapping,
    });
  const uniforms = {
    sun: { value: new T.Vector3() },
    progress: { value: 0 },
    latitude: { value: new T.Vector2() },
  };
  const mat = new T.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment.replaceAll(
      "CLOUD_STEPS",
      quality === "low" ? "12" : "32",
    ),
    depthTest: false,
    depthWrite: false,
  });
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat),
    bakeScene = new T.Scene(),
    camera = new T.Camera();
  bakeScene.add(quad);
  // Display the unfiltered sky-view texture; PMREM is only for rough reflections.
  const display = new T.ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    uniforms: {
      skyView: { value: null },
      nextView: { value: null },
      blend: { value: 0 },
      sun: uniforms.sun,
      inverseProjection: { value: new T.Matrix4() },
      cameraWorld: { value: new T.Matrix4() },
    },
    vertexShader:
      "varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,1.,1.);}",
    fragmentShader: `varying vec2 v;uniform sampler2D skyView,nextView;uniform float blend;uniform vec3 sun;uniform mat4 inverseProjection,cameraWorld;
${noiseGLSL}
vec4 view(vec2 uv){return mix(texture2D(skyView,uv),texture2D(nextView,uv),blend);}
void main(){
vec4 q=inverseProjection*vec4(v*2.-1.,1.,1.);vec3 d=normalize(mat3(cameraWorld)*q.xyz);
vec2 uv=vec2(atan(d.z,d.x)/6.2831853+.5,(asin(clamp(d.y,-1.,1.))-(${LOW_EDGE}))/(1.5707963-(${LOW_EDGE})));
// Fray cloud edges with fine noise so they read as vapour, not as a soft texture.
float cover=view(uv).a,edge=4.*cover*(1.-cover);
vec2 fray=vec2(noise3(d*70.)+.5*noise3(d*190.+7.),noise3(d*70.+31.)+.5*noise3(d*190.+53.))-.75;
vec4 sky=view(uv+fray*vec2(.0035,.012)*edge);
vec3 c=sky.rgb;float mu=dot(d,sun);float visible=smoothstep(-.008,.008,sun.y);
float disc=smoothstep(cos(.0058),cos(.0046),mu),limb=sqrt(max(0.,1.-pow(acos(min(mu,1.))/.0058,2.)));
vec3 warm=mix(vec3(1.,.42,.12),vec3(1.,.82,.6),smoothstep(0.,.3,sun.y));
c+=warm*(disc*(.4+.6*limb)*70.+pow(max(mu,0.),900.)*1.6+pow(max(mu,0.),90.)*.12)*visible*sky.a;
gl_FragColor=vec4(c,1.);}`,
  });
  const backdrop = new T.Mesh(new T.PlaneGeometry(2, 2), display);
  backdrop.frustumCulled = false;
  // Draw at the far plane after opaque surfaces, before transparent water and FX.
  backdrop.renderOrder = 10000;
  backdrop.onBeforeRender = (r, s, c) => {
    display.uniforms.inverseProjection.value.copy(c.projectionMatrixInverse);
    display.uniforms.cameraWorld.value.copy(c.matrixWorld);
  };
  scene.add(backdrop);
  const pmrem = new T.PMREMGenerator(renderer);
  let last = -1;
  const iblUniforms = {
    flProbeA: { value: null },
    flProbeB: { value: null },
    flProbeBlend: { value: 0 },
  };
  const direction = (p) => sunDirectionAt(p, uniforms.sun.value);
  // Bake once during loading. Playback only blends two cached HDR views/probes;
  // no atmosphere integration, PMREM convolution or allocation during the run.
  async function prepare(progress) {
    for (let i = 0; i <= steps; i++) {
      await progress(`Caching noon ${i + 1}/${steps + 1}…`);
      direction(times[i]);
      uniforms.progress.value = times[i];
      const old = renderer.getRenderTarget();
      const target = makeTarget(width, width / 4);
      uniforms.latitude.value.set(LOW_EDGE, Math.PI / 2);
      renderer.setRenderTarget(target);
      renderer.render(bakeScene, camera);
      views.push(target);
      const sphere = makeTarget(512, 256);
      sphere.texture.mapping = T.EquirectangularReflectionMapping;
      uniforms.latitude.value.set(-Math.PI / 2, Math.PI / 2);
      renderer.setRenderTarget(sphere);
      renderer.render(bakeScene, camera);
      renderer.setRenderTarget(old);
      probes.push(pmrem.fromEquirectangular(sphere.texture));
      sphere.dispose();
    }
    scene.environment = probes[0].texture;
    scene.background = null;
    update(0, true);
  }
  // Periodic world-space cloud transmittance shared by terrain and vegetation.
  const cloudPixels = new Uint8Array(128 * 128 * 4);
  for (let z = 0; z < 128; z++)
    for (let x = 0; x < 128; x++) {
      const u = (x / 128) * Math.PI * 2,
        v = (z / 128) * Math.PI * 2;
      const field =
        0.5 + 0.25 * Math.sin(2 * u + v) + 0.25 * Math.sin(3 * v - u);
      const light = 0.66 + 0.34 * T.MathUtils.smoothstep(field, 0.28, 0.64);
      const i = (z * 128 + x) * 4;
      cloudPixels[i] =
        cloudPixels[i + 1] =
        cloudPixels[i + 2] =
          Math.round(light * 255);
      cloudPixels[i + 3] = 255;
    }
  const cloudTexture = new T.DataTexture(cloudPixels, 128, 128);
  cloudTexture.wrapS = cloudTexture.wrapT = T.RepeatWrapping;
  cloudTexture.minFilter = cloudTexture.magFilter = T.LinearFilter;
  cloudTexture.needsUpdate = true;
  const env = {
    sunDir: new T.Vector3(),
    sunColour: new T.Color(),
    sunIntensity: 4.8,
    fillIntensity: 0.82,
    environmentIntensity: 0.45,
    hazeDensity: 0.00032,
    hazeStart: 180,
    far: 6000,
    ambient: new T.Color(),
    rain: 1,
    wetness: 1,
    wind: 0.4,
    cloudShadow: {
      texture: cloudTexture,
      bounds: new T.Vector4(-120, -460, 512, 512),
      strength: 1,
    },
    fog: new T.Color(),
    progress: 0,
  };
  function update(p, force = false) {
    p = T.MathUtils.clamp(p, 0, 1);
    env.progress = p;
    env.sunDir.copy(direction(p));
    env.sunColour.setRGB(1, 0.96, 0.87);
    env.ambient.setRGB(0.45, 0.62, 0.9);
    env.rain = 0;
    env.wetness = 0;
    env.wind = 0.4;
    env.fog.setRGB(0.45, 0.61, 0.78);
    if (probes.length && (force || Math.abs(p - last) > 0.00001)) {
      last = p;
      const index = Math.min(
        steps - 1,
        times.findIndex((time, i) => i < steps && p <= times[i + 1]),
      );
      const blend = (p - times[index]) / (times[index + 1] - times[index]);
      display.uniforms.skyView.value = views[index].texture;
      display.uniforms.nextView.value = views[index + 1].texture;
      display.uniforms.blend.value = blend;
      iblUniforms.flProbeA.value = probes[index].texture;
      iblUniforms.flProbeB.value = probes[index + 1].texture;
      iblUniforms.flProbeBlend.value = blend;
    }
    scene.environmentIntensity = env.environmentIntensity;
    return env;
  }
  return {
    samples: times.length,
    prepare,
    iblUniforms,
    update,
    env,
    dispose() {
      scene.remove(backdrop);
      cloudTexture.dispose();
      display.dispose();
      backdrop.geometry.dispose();
      views.forEach((t) => t.dispose());
      probes.forEach((t) => t.dispose());
      pmrem.dispose();
      mat.dispose();
      quad.geometry.dispose();
    },
  };
}
