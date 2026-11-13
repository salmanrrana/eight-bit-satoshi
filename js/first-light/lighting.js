import * as T from "three";
// One sun (the moon at night), one sky fill and a fixed pool of lamp lights.
// Also owns the fog shader: post.js draws it at half size every frame.
const FOG_VERTEX = `varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export function createLighting(scene, quality) {
  const sun = new T.DirectionalLight(0xffd4ad, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(
    quality === "ultra" ? 4096 : quality === "high" ? 2048 : 1024,
  );
  Object.assign(sun.shadow.camera, {
    left: -62,
    right: 62,
    top: 62,
    bottom: -62,
    near: 1,
    far: 240,
  });
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 1.5;
  const ambient = new T.HemisphereLight(0x4b668e, 0x262633, 0.4);
  scene.add(sun, sun.target, ambient);
  const lightCount = quality === "ultra" ? 8 : quality === "high" ? 6 : 4;
  const pool = Array.from({ length: lightCount }, () => {
    const l = new T.PointLight(0xffad60, 0, 17, 2);
    scene.add(l);
    return l;
  });
  const fixtures = [];
  // Keep the light types/count fixed; only their angular distribution changes.
  const materialUniforms = {
    flDownlight: { value: new Float32Array(lightCount) },
  };
  // Ray-marched fog. Each step asks the sun's shadow map whether that bit of
  // air is lit, which is what draws shafts past walls, masts and branches.
  // The march start is jittered per pixel and per frame; the temporal pass in
  // post.js averages that into smooth light instead of bands.
  const fogMaterial = new T.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    defines: { STEPS: quality === "ultra" ? 24 : quality === "high" ? 16 : 12 },
    uniforms: {
      lampPosition: { value: pool.map(() => new T.Vector3()) },
      lampColour: { value: pool.map(() => new T.Color()) },
      flDownlight: materialUniforms.flDownlight,
      depth: { value: null },
      shadowMap: { value: null },
      inverseProjection: { value: new T.Matrix4() },
      cameraWorld: { value: new T.Matrix4() },
      shadowMatrix: { value: new T.Matrix4() },
      sunDir: { value: new T.Vector3() },
      sunColour: { value: new T.Color() },
      fogColour: { value: new T.Color() },
      eye: { value: new T.Vector3() },
      density: { value: 0.008 },
      mist: { value: 0 },
      frame: { value: 0 },
      pixel: { value: new T.Vector2() },
    },
    vertexShader: FOG_VERTEX,
    fragmentShader: `
uniform vec3 lampPosition[${lightCount}],lampColour[${lightCount}];uniform float flDownlight[${lightCount}];
uniform sampler2D depth;uniform sampler2DShadow shadowMap;uniform mat4 inverseProjection,cameraWorld,shadowMatrix;
uniform vec3 sunDir,sunColour,fogColour,eye;uniform float density,mist,frame;uniform vec2 pixel;varying vec2 v;
void main(){
// Half-size pixel centres sit on full-size texel borders; read one texel's centre.
vec2 c=v-pixel*.5;
float z=texture2D(depth,c).x;vec4 view=inverseProjection*vec4(c*2.-1.,z*2.-1.,1.);view/=view.w;
vec3 ray=(cameraWorld*view).xyz-eye;float reach=min(length(ray),180.);ray=normalize(ray);
float stepSize=reach/float(STEPS);
float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy+frame*5.588238,vec2(.06711056,.00583715))));
// Haze scatters forward: a broad glow toward the sun and a tight bright core.
float mu=max(0.,dot(ray,sunDir));float phase=.07+.45*pow(mu,4.)+1.5*pow(mu,28.);
float trans=1.;vec3 scatter=vec3(0.);
for(int i=0;i<STEPS;i++){
vec3 p=eye+ray*(float(i)+jitter)*stepSize;
vec4 s=shadowMatrix*vec4(p,1.);s.xyz/=s.w;
float lit=1.;
if(all(greaterThan(s.xyz,vec3(0.)))&&all(lessThan(s.xyz,vec3(1.))))lit=texture(shadowMap,vec3(s.xy,s.z-.0012));
// Thin haze everywhere, a rain layer near head height, and low morning mist.
float den=density*(.55*exp(-max(p.y,0.)*.095)+.8*exp(-pow((p.y-1.2)/2.8,2.)))*(.85+.15*sin(p.x*.025+p.z*.04));
den+=mist*.006*exp(-max(p.y+2.,0.)*.16)*(.7+.3*sin(p.x*.05-p.z*.035));
float a=1.-exp(-den*stepSize);
vec3 local=vec3(0.);
for(int j=0;j<${lightCount};j++){
float dist=length(p-lampPosition[j]);
float down=mix(1.,mix(.025,1.,smoothstep(-.12,.35,(lampPosition[j].y-p.y)/max(dist,.001))),flDownlight[j]);
local+=lampColour[j]/(2.+dist*dist)*.006*(1.-smoothstep(2.,12.,dist))*down;
}
scatter+=trans*a*(fogColour+local+sunColour*lit*phase);trans*=1.-a;
}
gl_FragColor=vec4(scatter,trans);
}`,
  });
  const dir = new T.Vector3(),
    right = new T.Vector3(),
    up = new T.Vector3(),
    center = new T.Vector3(),
    upAxis = new T.Vector3(0, 1, 0),
    bounce = new T.Color();
  let selectionAge = 1,
    nearest = [];
  const selectionPosition = new T.Vector3(Infinity, Infinity, Infinity);
  function update(env, camera, dt) {
    const daylight = T.MathUtils.smoothstep(env.sunDir.y, -0.015, 0.1);
    sun.color.setRGB(0.3, 0.46, 1).lerp(env.sunColour, daylight);
    // A strong key against a weak fill is what makes low sun read as sunlight.
    sun.intensity = 0.05 + daylight * 5.2;
    dir.copy(env.sunDir);
    dir.y = Math.max(0.08, Math.abs(dir.y));
    dir.normalize();
    // Quantize the shadow camera in its light-plane basis to stop texel swimming.
    right.crossVectors(dir, upAxis).normalize();
    up.crossVectors(right, dir);
    center.copy(camera.position);
    center.z -= 24;
    const texel = 124 / sun.shadow.mapSize.x;
    center.addScaledVector(
      right,
      Math.round(center.dot(right) / texel) * texel - center.dot(right),
    );
    center.addScaledVector(
      up,
      Math.round(center.dot(up) / texel) * texel - center.dot(up),
    );
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(dir, 120);
    const blueHour =
      T.MathUtils.smoothstep(env.progress, 0.25, 0.42) *
      (1 - T.MathUtils.smoothstep(env.progress, 0.55, 0.72));
    // Sky fill from above; from below, sunlight bounced off the ground.
    ambient.color.copy(env.ambient);
    ambient.groundColor
      .setRGB(0.11, 0.11, 0.15)
      .lerp(bounce.copy(env.sunColour).multiplyScalar(0.55), daylight);
    ambient.intensity = 0.92 + blueHour * 0.4 - daylight * 0.55;
    selectionAge += dt;
    if (
      selectionAge > 0.12 ||
      selectionPosition.distanceToSquared(camera.position) > 16
    ) {
      selectionAge = 0;
      selectionPosition.copy(camera.position);
      nearest = fixtures
        .map((f) => ({ f, d: camera.position.distanceToSquared(f.position) }))
        .filter(({ d }) => d < 28 * 28)
        .sort((a, b) => a.d - b.d)
        .slice(0, pool.length);
    }
    // Keep fixture identity in each slot; fade out before moving a light.
    // Sorting directly into slots made pools jump whenever two distances crossed.
    const wanted = nearest.map(({ f }) => f);
    pool.forEach((l) => {
      if (l.userData.fixture && !wanted.includes(l.userData.fixture)) {
        l.intensity *= Math.exp(-dt * 8);
        if (l.intensity < 0.03) l.userData.fixture = null;
      }
    });
    pool.forEach((l) => {
      if (!l.userData.fixture) {
        l.userData.fixture = wanted.find(
          (f) => !pool.some((slot) => slot.userData.fixture === f),
        );
        if (l.userData.fixture) {
          l.position.copy(l.userData.fixture.position);
          l.color.set(l.userData.fixture.colour);
        }
      }
      const f = l.userData.fixture;
      if (f && wanted.includes(f)) {
        // Content can animate a shared Color (e.g. a mined river block).
        l.color.set(f.colour);
        l.intensity +=
          (f.intensity * (1 - daylight * 0.8) - l.intensity) *
          (1 - Math.exp(-dt * 3));
      }
    });
    const u = fogMaterial.uniforms;
    pool.forEach((lamp, i) => {
      u.lampPosition.value[i].copy(lamp.position);
      u.lampColour.value[i].copy(lamp.color).multiplyScalar(lamp.intensity);
      materialUniforms.flDownlight.value[i] = lamp.userData.fixture?.downward
        ? 1
        : 0;
    });
    u.inverseProjection.value.copy(camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(camera.matrixWorld);
    // Last frame's map and matrix: both are one frame old together, so they agree.
    u.shadowMap.value = sun.shadow.map?.depthTexture ?? null;
    u.shadowMatrix.value.copy(sun.shadow.matrix);
    u.sunDir.value.copy(env.sunDir);
    u.sunColour.value.copy(sun.color).multiplyScalar(sun.intensity * 0.3);
    u.fogColour.value.copy(env.fog);
    u.eye.value.copy(camera.position);
    u.density.value = 0.0025 + env.rain * 0.004;
    // Ground mist gathers at first light and burns off by the summit.
    u.mist.value =
      T.MathUtils.smoothstep(env.progress, 0.42, 0.62) *
      (1 - 0.6 * T.MathUtils.smoothstep(env.progress, 0.8, 1));
  }
  return {
    lightCount,
    materialUniforms,
    fogMaterial,
    update,
    addLightFixture(f) {
      const fixture = {
        ...f,
        downward: f.downward ?? f.kind === "lamp",
        position: f.position.isVector3
          ? f.position.clone()
          : new T.Vector3(...f.position),
      };
      fixtures.push(fixture);
      return () => {
        const i = fixtures.indexOf(fixture);
        if (i >= 0) fixtures.splice(i, 1);
      };
    },
    dispose() {
      sun.shadow.map?.dispose();
      fogMaterial.dispose();
      scene.remove(sun, sun.target, ambient, ...pool);
    },
  };
}
