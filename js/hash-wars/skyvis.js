// Large-scale sky occlusion for FIRST LIGHT. At load, the built level is drawn
// once from straight above to get a height map; one more pass then works out,
// for every third of a metre of ground, how much sky can be seen from there.
// kit materials read the result to dim sky light in alleys, beside walls and
// under roofs, which is what lets lamp pools and sunlight stand out. Baked once;
// costs one texture read per pixel while playing.
import * as T from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// World rectangle covered (metres), map size (about 3 texels per metre), and
// the height range the top-down camera sees (TOP down to TOP - RANGE).
const MIN_X = -90,
  MAX_X = 90,
  MIN_Z = -460,
  MAX_Z = 30,
  WIDTH = 540,
  HEIGHT = 1470,
  TOP = 150,
  RANGE = 200;

/** GLSL for materials. flSkyVisibility(worldPosition, worldNormal) returns the
 * factor to multiply sky (indirect) light by: flSkyVisFloor where no sky is
 * seen, 1 in the open and anywhere outside the map. Texel: r = open sky seen
 * just above the surface there, g = 4 m higher, b = surface height, a = value
 * to use underneath that surface (under a roof, awning or deck). */
export const skyVisibilityGLSL = `
uniform sampler2D flSkyVis;uniform float flSkyVisFloor;
float flSkyVisibility(vec3 p,vec3 n){
vec2 uv=vec2((p.x+n.x*.6-(${MIN_X}.))/${MAX_X - MIN_X}.,(${MAX_Z}.-(p.z+n.z*.6))/${MAX_Z - MIN_Z}.);
vec4 s=texture2D(flSkyVis,uv);
float above=p.y-s.b;
float open=mix(s.r,s.g,clamp(above/4.,0.,1.));
open=mix(open,1.,clamp((above-4.)/10.,0.,1.));
float seen=mix(open,s.a,smoothstep(.6,2.5,-above));
vec2 inside=step(vec2(0.),uv)*step(uv,vec2(1.));
return mix(1.,mix(flSkyVisFloor,1.,seen),inside.x*inside.y);
}`;

const COMPUTE = `
uniform sampler2D heights;varying vec2 v;
const vec2 METRE=vec2(1./${MAX_X - MIN_X}.,1./${MAX_Z - MIN_Z}.);
float heightAt(vec2 uv){return ${TOP}.-texture2D(heights,uv).x*${RANGE}.;}
// Share of the sky dome seen from height y: in 12 compass directions, find the
// steepest thing on the horizon within 19 m; cos^2 of that angle is what is left.
float open(vec2 uv,float y){
float sum=0.;
for(int a=0;a<12;a++){
float angle=(float(a)+.5)*.5235988;vec2 dir=vec2(cos(angle),sin(angle))*METRE;
float rise=0.,d=.5;
for(int s=0;s<8;s++){rise=max(rise,(heightAt(uv+dir*d)-y)/d);d*=1.68;}
sum+=1./(1.+rise*rise);
}
return sum/12.;
}
void main(){
float h=heightAt(v);
// How much of the surroundings is as high as this spot: a wide roof is darker
// underneath than a narrow awning.
float roofed=0.;
for(int a=0;a<12;a++){
float angle=float(a)*.5235988;
roofed+=step(h-1.,heightAt(v+vec2(cos(angle),sin(angle))*METRE*(a%2==0?1.5:3.5)));
}
gl_FragColor=vec4(open(v,h+.2),open(v,h+4.),h,mix(.6,.18,roofed/12.));
}`;

/** Bake the map. Call once after the whole level is built and every zone is
 * visible. `sim.groundY` supplies a floor under mirrors and other surfaces the
 * height pass skips. Returns { texture, dispose }. Set `userData.noSkyVis` on a
 * mesh to keep it out (foliage, anything too thin to block the sky). */
export function bakeSkyVisibility(renderer, scene, sim) {
  const camera = new T.OrthographicCamera(
    -(MAX_X - MIN_X) / 2,
    (MAX_X - MIN_X) / 2,
    (MAX_Z - MIN_Z) / 2,
    -(MAX_Z - MIN_Z) / 2,
    0,
    RANGE,
  );
  // Straight down: image right is world +x, image up is world -z.
  camera.position.set((MIN_X + MAX_X) / 2, TOP, (MIN_Z + MAX_Z) / 2);
  camera.rotation.x = -Math.PI / 2;
  camera.updateMatrixWorld();
  // Only solid, opaque surfaces block the sky. Hide everything else for one draw.
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible || !(o.isMesh || o.isPoints || o.isLine || o.isSprite))
      return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const solid =
      o.isMesh &&
      m?.isMeshStandardMaterial &&
      !m.transparent &&
      !m.alphaTest &&
      m.depthWrite &&
      !o.isReflector &&
      !o.geometry.isInstancedBufferGeometry &&
      !(o.isInstancedMesh && o.count > 2000) &&
      !o.userData.noSkyVis;
    if (!solid) {
      hidden.push(o);
      o.visible = false;
    }
  });
  const columns = MAX_X - MIN_X,
    rows = MAX_Z - MIN_Z,
    floor = new T.PlaneGeometry(columns, rows, columns, rows),
    spot = floor.attributes.position;
  for (let i = 0; i < spot.count; i++) {
    const x = spot.getX(i) + (MIN_X + MAX_X) / 2,
      z = -spot.getY(i) + (MIN_Z + MAX_Z) / 2;
    spot.setXYZ(i, x, sim.groundY(x, z), z);
  }
  const depthMaterial = new T.MeshDepthMaterial({ side: T.DoubleSide }),
    proxy = new T.Mesh(floor, depthMaterial);
  proxy.frustumCulled = false;
  scene.add(proxy);
  const heights = new T.WebGLRenderTarget(WIDTH, HEIGHT);
  heights.depthTexture = new T.DepthTexture(WIDTH, HEIGHT, T.UnsignedIntType);
  const result = new T.WebGLRenderTarget(WIDTH, HEIGHT, {
    type: T.HalfFloatType,
    depthBuffer: false,
  });
  const previous = renderer.getRenderTarget(),
    shadows = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  scene.overrideMaterial = depthMaterial;
  renderer.setRenderTarget(heights);
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  renderer.shadowMap.autoUpdate = shadows;
  scene.remove(proxy);
  hidden.forEach((o) => (o.visible = true));
  const quad = new FullScreenQuad(
    new T.ShaderMaterial({
      uniforms: { heights: { value: heights.depthTexture } },
      vertexShader:
        "varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: COMPUTE,
      depthTest: false,
      depthWrite: false,
    }),
  );
  renderer.setRenderTarget(result);
  quad.render(renderer);
  renderer.setRenderTarget(previous);
  quad.material.dispose();
  quad.dispose();
  floor.dispose();
  depthMaterial.dispose();
  heights.depthTexture.dispose();
  heights.dispose();
  return { texture: result.texture, dispose: () => result.dispose() };
}
