import * as T from "three";

// The street is a small physical diorama behind the opening. Its separation
// from the glass gives fence, lamp and distant silhouettes different parallax.
export function street(scene, m, time) {
  const dark = m.paint.clone();
  dark.color.set(0x161d23);
  const pole = new T.Mesh(new T.CylinderGeometry(0.045, 0.065, 4.2, 12), dark);
  pole.position.set(4.5, 2.1, 6.6);
  scene.add(pole);
  const lampMat = new T.MeshBasicMaterial({ color: 0xffbf71 });
  const lamp = new T.Mesh(new T.SphereGeometry(0.12, 16, 8), lampMat);
  lamp.position.set(4.5, 4.1, 6.6);
  scene.add(lamp);
  const halo = new T.Mesh(
    new T.PlaneGeometry(3, 3),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
      vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 v;void main(){float r=length(v-.5);gl_FragColor=vec4(1.,.54,.19,exp(-r*18.)*.6);}`,
    }),
  );
  halo.rotation.y = -Math.PI / 2;
  halo.position.copy(lamp.position);
  scene.add(halo);
  const points = [];
  for (let z = -1; z < 12; z += 0.18) {
    points.push(2.7, 0, z, 2.7, 2, z + 2);
    points.push(2.7, 0, z + 2, 2.7, 2, z);
  }
  const fence = new T.LineSegments(
    new T.BufferGeometry().setAttribute(
      "position",
      new T.Float32BufferAttribute(points, 3),
    ),
    new T.LineBasicMaterial({ color: 0x283338 }),
  );
  scene.add(fence);
  for (const z of [1, 5, 9]) {
    const post = new T.Mesh(new T.CylinderGeometry(0.032, 0.032, 2.2, 8), dark);
    post.position.set(2.7, 1.1, z);
    scene.add(post);
  }
  const silhouette = document.createElement("canvas");
  silhouette.width = 128;
  silhouette.height = 256;
  const paint = silhouette.getContext("2d");
  paint.filter = "blur(5px)";
  paint.fillStyle = "#0a151b";
  paint.fillRect(12, 12, 104, 244);
  const texture = new T.CanvasTexture(silhouette);
  texture.colorSpace = T.SRGBColorSpace;
  const distant = new T.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  for (let i = 0; i < 14; i++) {
    const h = 2 + (Math.sin(i * 74.7) * 0.5 + 0.5) * 5;
    const building = new T.Mesh(new T.PlaneGeometry(1.8, h + 0.3), distant);
    building.rotation.y = -Math.PI / 2;
    building.position.set(10 + (i % 3) * 3, h / 2, -6 + i * 1.8);
    scene.add(building);
  }
  // A drop texture is computed in the glass plane, independently of scenery.
  // Runnels are long, uneven, and moving; small beads catch the sodium source.
  const rain = new T.Mesh(
    new T.PlaneGeometry(1.22, 2),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms: { time },
      vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 v;uniform float time;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){vec2 cell=v*vec2(29.,53.);vec2 id=floor(cell);vec2 p=fract(cell)-.5;float seed=hash(id);
    p.x+=(seed-.5)*.4;p.y+=sin(seed*25.)*.2;
    float r=length(p*vec2(1.,.65));float bead=exp(-pow((r-.09)*40.,2.))*step(.6,seed);
    float x=v.x+sin(v.y*7.+time*.2)*.0015;
    float stream=pow(max(0.,sin(x*510.+sin(x*713.))),50.)*(.5+.5*sin(v.y*18.+time*.5));
    gl_FragColor=vec4(.26,.31,.33,bead*.07+stream*.1);}`,
    }),
  );
  rain.position.set(1.36, 1.68, 5.7);
  rain.rotation.y = -Math.PI / 2;
  scene.add(rain);
}
