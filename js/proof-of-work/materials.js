import * as T from "three";
import { surfaceFragment } from "./surface-shaders.js";

// Bake tileable, correlated PBR channels on the GPU. Only colour is sRGB;
// normals, roughness, metalness and occlusion remain linear data.
export async function materials(renderer, quality, progress) {
  const targets = [];
  const scene = new T.Scene(),
    camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  const shader = new T.ShaderMaterial({
    uniforms: { channel: { value: 0 }, kind: { value: 0 } },
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: surfaceFragment,
  });
  camera.position.z = 1;
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), shader);
  quad.frustumCulled = false;
  scene.add(quad);
  await renderer.compileAsync(scene, camera);
  async function make(kind, repeat = 1) {
    const maps = [];
    shader.uniforms.kind.value = kind;
    for (let c = 0; c < 5; c++) {
      const rt = new T.WebGLRenderTarget(
        quality === "ultra" ? 2048 : 1024,
        quality === "ultra" ? 2048 : 1024,
        { generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter },
      );
      rt.texture.colorSpace = c === 0 ? T.SRGBColorSpace : T.NoColorSpace;
      rt.texture.wrapS = rt.texture.wrapT = T.RepeatWrapping;
      rt.texture.anisotropy = Math.min(
        8,
        renderer.capabilities.getMaxAnisotropy(),
      );
      shader.uniforms.channel.value = c;
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      rt.texture.repeat.setScalar(repeat);
      targets.push(rt);
      maps.push(rt.texture);
      await progress(`Baking surfaces ${kind * 5 + c + 1}/31`);
    }
    return new T.MeshStandardMaterial({
      map: maps[0],
      normalMap: maps[1],
      roughnessMap: maps[2],
      metalnessMap: maps[3],
      aoMap: maps[4],
      metalness: 1,
      roughness: 1,
      normalScale: new T.Vector2(
        kind === 0 ? 0.85 : 0.35,
        kind === 0 ? 0.85 : 0.35,
      ),
    });
  }
  const result = {
    concrete: await make(0, 2),
    steel: await make(1),
    paint: await make(2),
    rubber: await make(3),
    gold: await make(4),
    brushed: await make(5),
  };
  result.gold.envMapIntensity = 0.25;
  result.gold.color.setScalar(0.45);
  // Beads bend the transmitted street, rather than painting bright dots onto
  // it. The small and large droplets use unrelated cells to avoid a dot grid.
  const rainShader = new T.ShaderMaterial({
    vertexShader: shader.vertexShader,
    fragmentShader: `varying vec2 v;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float beads(vec2 p){vec2 id=floor(p),q=fract(p)-.5;
        q-=vec2(hash(id),hash(id+17.))*.55-.275;
        float radius=.08+hash(id+41.)*.12;
        return sqrt(max(0.,1.-dot(q*vec2(1.,.75),q*vec2(1.,.75))/(radius*radius)))*step(.35,hash(id+8.));}
      float heightAt(vec2 uv){return beads(uv*vec2(27.,44.))*.003+beads(uv*vec2(61.,89.)+4.7)*.0008;}
      void main(){float h=heightAt(v),e=1./1024.;
        vec3 n=normalize(vec3((h-heightAt(v+vec2(e,0.)))*280.,(h-heightAt(v+vec2(0.,e)))*280.,1.));
        gl_FragColor=vec4(n*.5+.5,1.);}`,
  });
  const rainTarget = new T.WebGLRenderTarget(1024, 1024, {
    generateMipmaps: true,
    minFilter: T.LinearMipmapLinearFilter,
  });
  quad.material = rainShader;
  renderer.setRenderTarget(rainTarget);
  renderer.render(scene, camera);
  targets.push(rainTarget);
  await progress("Baking surfaces 31/31");
  result.rainNormal = rainTarget.texture;
  renderer.setRenderTarget(null);
  quad.geometry.dispose();
  shader.dispose();
  rainShader.dispose();
  result.dispose = () => {
    for (const k of ["concrete", "steel", "paint", "rubber", "gold", "brushed"])
      result[k].dispose();
    targets.forEach((t) => t.dispose());
  };
  return result;
}

export function label(
  text,
  width = 512,
  height = 128,
  fg = "#ddd5b9",
  bg = "#172221",
) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const x = c.getContext("2d");
  x.fillStyle = bg;
  x.fillRect(0, 0, width, height);
  x.fillStyle = fg;
  const lines = text.split("\n");
  const lineHeight = Math.min(height * 0.43, height / (lines.length + 0.3));
  x.font = `600 ${Math.floor(lineHeight * 0.85)}px monospace`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  lines.forEach((line, i, a) =>
    x.fillText(
      line,
      width / 2,
      height / 2 + (i - (a.length - 1) / 2) * lineHeight,
      width * 0.94,
    ),
  );
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return new T.MeshStandardMaterial({
    map: t,
    roughness: 0.68,
    metalness: 0.15,
  });
}
