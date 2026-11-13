import * as T from "three";

// Thin standing water in the entry uses the corridor probe. The hall keeps its
// planar reflection; this small patch doesn't need another scene render.
export function entryWater(scene, materials) {
  const water = new T.MeshPhysicalMaterial({
    color: 0x909b96,
    map: materials.concrete.map,
    normalMap: materials.steel.normalMap,
    normalScale: new T.Vector2(0.035, 0.035),
    roughness: 0.5,
    metalness: 0.02,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
    ior: 1.33,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    envMapIntensity: 0.9,
  });
  water.onBeforeCompile = (shader) => {
    shader.fragmentShader =
      `
      float wetHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float wetNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wetHash(i),wetHash(i+vec2(1,0)),f.x),mix(wetHash(i+vec2(0,1)),wetHash(i+1.),f.x),f.y);}
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphamap_fragment>",
      `
      #include <alphamap_fragment>
      vec2 p=vMapUv*.5;
      float wetAmount=exp(-dot((p-vec2(.74,.63))*vec2(3.,3.7),(p-vec2(.74,.63))*vec2(3.,3.7)));
      wetAmount+=exp(-dot((p-vec2(.3,.16))*vec2(3.7,6.),(p-vec2(.3,.16))*vec2(3.7,6.)))*.7;
      wetAmount+=(wetNoise(p*27.)-.5)*.22;
      float halo=smoothstep(.16,.24,wetAmount);
      if(halo<.001)discard;
      diffuseColor.a*=halo;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `
      #include <roughnessmap_fragment>
      roughnessFactor=mix(.78,.32,smoothstep(.23,.37,wetAmount));
    `,
    );
  };
  const mesh = new T.Mesh(new T.PlaneGeometry(2.9, 7.8), water);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -0.027, 4);
  mesh.userData.room = 0;
  scene.add(mesh);
}
