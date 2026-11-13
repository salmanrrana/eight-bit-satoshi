import { surface } from "./surfaces.js";
import { buildWater } from "./river-water.js";
import { buildBlocks } from "./river-blocks.js";

export async function build(ctx) {
  const { T, sim, kit, quality, zoneGroup, scene } = ctx;
  const group = zoneGroup(3);
  const haze = { value: new T.Color() };
  const bankMaterials = [];
  // The shared volume caps its ray length for cost. Local aerial perspective
  // lets the kilometre-long banks disappear before the camera's far clip.
  function bankMaterial(original) {
    const m = original.clone(),
      compile = original.onBeforeCompile;
    const key = original.customProgramCacheKey();
    m.onBeforeCompile = (shader) => {
      compile(shader);
      shader.uniforms.bankHaze = haze;
      shader.vertexShader =
        `varying vec3 bankWorld;\n${shader.vertexShader}`.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vec4 bankP=vec4(position,1.);
#ifdef USE_INSTANCING
bankP=instanceMatrix*bankP;
#endif
bankWorld=(modelMatrix*bankP).xyz;`,
        );
      shader.fragmentShader =
        `varying vec3 bankWorld;uniform vec3 bankHaze;\n${shader.fragmentShader}`.replace(
          "#include <opaque_fragment>",
          "outgoingLight=mix(outgoingLight,bankHaze,smoothstep(85.,330.,length(cameraPosition-bankWorld)));\n#include <opaque_fragment>",
        );
    };
    m.customProgramCacheKey = () => key + "-river-distance-v1";
    bankMaterials.push(m);
    return m;
  }
  const stone = bankMaterial(
    surface(kit, "cutStone", { scale: 1.6, tint: 0x8e9ba1 }),
  );
  stone.polygonOffset = true;
  stone.polygonOffsetFactor = -3;
  stone.polygonOffsetUnits = -3;
  const copingStone = bankMaterial(
    surface(kit, "rock", {
      scale: 0.85,
      weather: true,
      tint: new T.Color(1.5, 1.5, 1.4),
    }),
  );
  copingStone.polygonOffset = true;
  copingStone.polygonOffsetFactor = -3;
  copingStone.polygonOffsetUnits = -3;
  const mud = bankMaterial(surface(kit, "mud", { scale: 2.3 }));
  const steel = surface(kit, "rustedSteel", { scale: 0.16, tint: 0xc9c7c2 });
  const rock = surface(kit, "rock", { scale: 0.6 });
  const silt = bankMaterial(
    surface(kit, "mud", { scale: 3.7, tint: 0x7e8780 }),
  );
  const temp = new T.Object3D();
  const rand = (n) => {
    const a = Math.sin(n * 127.1 + 83.19) * 43758.5453;
    return a - Math.floor(a);
  };
  function instance(geometry, material, placements) {
    const mesh = kit.instances(
      geometry,
      material,
      placements.map((p) => {
        temp.position.set(...p.slice(0, 3));
        temp.rotation.set(p[6] || 0, p[7] || 0, p[8] || 0);
        temp.scale.set(p[3] ?? 1, p[4] ?? 1, p[5] ?? 1);
        temp.updateMatrix();
        return temp.matrix.clone();
      }),
    );
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  // The top of the quay is exactly groundY=0. All relief goes into the
  // embankment, never up into the jump path; no new collision shapes needed.
  const masonry = [],
    coping = [];
  for (let row = 0; row < 2; row++) {
    for (let x = -530; x < 570;) {
      const span = x > -90 && x < 130 ? 2.5 : 10;
      masonry.push([
        x + span / 2 + ((row % 2) * span) / 2,
        -0.55 - row * 0.62,
        -110.68,
        span - 0.03,
        0.6,
        0.64,
      ]);
      x += span;
    }
  }
  // Earth backs the masonry joints below the existing bank's ground height.
  // Courses stop below the cap rather than sharing a coplanar front face.
  const quayBack = new T.Mesh(new T.PlaneGeometry(1100, 1.5), mud);
  quayBack.position.set(20, -0.75, -110.99);
  quayBack.rotation.y = Math.PI;
  group.add(quayBack);
  const unitBox = kit.roundedBox(1, 1, 1, 0.018);
  const farBox = new T.BoxGeometry(1, 1, 1);
  const near = (p) => Math.abs(p[0] - 20) < 42;
  instance(unitBox, stone, masonry.filter(near));
  instance(
    farBox,
    stone,
    masonry.filter((p) => !near(p)),
  );
  for (let x = -530; x < 570;) {
    const span = x > -90 && x < 130 ? 2.5 : 10;
    coping.push([x + span / 2, -0.12, -110.7, span - 0.04, 0.24, 0.6]);
    x += span;
  }
  const copingGeometry = kit.roundedBox(2.5, 0.24, 0.6, 0.035);
  const copingPlacement = (p) => [
    p[0],
    p[1],
    p[2],
    p[3] / 2.5,
    p[4] / 0.24,
    p[5] / 0.6,
  ];
  instance(
    copingGeometry,
    copingStone,
    coping.filter(near).map(copingPlacement),
  );
  instance(
    farBox,
    copingStone,
    coping.filter((p) => !near(p)),
  );
  const cityGround = new T.Mesh(
    new T.PlaneGeometry(1100, 8.4),
    bankMaterial(
      surface(kit, "rock", { scale: 1.1, weather: true, tint: 0xadb5b4 }),
    ),
  );
  cityGround.rotation.x = -Math.PI / 2;
  // Stop at the coping rear edge, avoiding coplanar tops. Same ground height
  // as the yard; depth bias makes the wet quay finish
  // replace the yard soil cleanly without moving the collision surface.
  cityGround.position.set(20, 0, -106.2);
  cityGround.material.polygonOffset = true;
  cityGround.material.polygonOffsetFactor = -2;
  cityGround.material.polygonOffsetUnits = -2;
  const quayCompile = cityGround.material.onBeforeCompile;
  cityGround.material.onBeforeCompile = (shader) => {
    quayCompile(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `vec2 flag=flSurfaceWorld.xz*vec2(.72,1.45);
flag.x+=mod(floor(flag.y),2.)*.47;
vec2 joint=min(fract(flag),1.-fract(flag))/vec2(.72,1.45);
float gap=1.-smoothstep(.006,.015+fwidth(joint.x),min(joint.x,joint.y));
float slabTone=.78+.38*flHash(vec3(floor(flag),12.));
diffuseColor.rgb*=slabTone*(1.-gap*.72);
#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.92,gap);`,
    );
  };
  cityGround.material.customProgramCacheKey = () => "river-quay-flags-v2";
  group.add(cityGround);
  // Actual bevelled flags on the walking quay; joints expose the darker bed.
  const flags = [];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 16; col++)
      flags.push([
        8 + col * 1.45 + (row % 2) * 0.725,
        -0.035,
        -110 + row * 0.7,
        1,
        1,
        1,
      ]);
  instance(kit.roundedBox(1.432, 0.07, 0.682, 0.012), copingStone, flags);

  // Algae/waterline stains vary over masonry, rather than a clean concrete edge.
  const algae = kit.material({
    color: 0x31453c,
    roughness: 0.46,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
  });
  const algaeCompile = algae.onBeforeCompile;
  algae.onBeforeCompile = (shader) => {
    algaeCompile(shader);
    shader.vertexShader =
      `varying vec3 stainWorld;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nstainWorld=(modelMatrix*vec4(position,1.)).xyz;",
      );
    shader.fragmentShader =
      `varying vec3 stainWorld;${kit.noiseGLSL}\n${shader.fragmentShader}`.replace(
        "#include <alphamap_fragment>",
        `#include <alphamap_fragment>
float top=-.43+noise3(vec3(stainWorld.x*.9,0.,0.))*.18;
diffuseColor.a*=smoothstep(top+.05,top-.19,stainWorld.y)*(.3+.7*noise3(stainWorld*6.));`,
      );
  };
  algae.customProgramCacheKey = () => "river-tide-stain-v1";
  const tide = new T.Mesh(new T.PlaneGeometry(1100, 1.3), algae);
  tide.position.set(20, -0.85, -111.012);
  tide.rotation.y = Math.PI;
  group.add(tide);
  // Worn steps in an old mooring recess, off the enclosed playable yard.
  const steps = [];
  for (let i = 0; i < 7; i++)
    steps.push([34, -0.12 - i * 0.16, -110.8 - i * 0.24, 3.8, 0.24, 0.48]);
  instance(copingGeometry, copingStone, steps.map(copingPlacement));
  const rings = [];
  for (let x = -76; x < 124; x += 12) {
    if (x > 17 && x < 23) continue;
    rings.push([x, -0.14, -111.045, 1, 1, 1, 0, Math.PI, 0]);
  }
  instance(
    new T.TorusGeometry(0.17, 0.033, 6, 20),
    steel,
    rings,
  ).userData.noReflect = true;
  // Mooring bollards sit beyond the fenced playable yard, never in the route.
  const bollards = [
    [10.8, 0.26, -110.05, 1, 1, 1],
    [29.4, 0.26, -110.05, 1, 1, 1],
  ];
  instance(
    new T.CylinderGeometry(0.13, 0.18, 0.52, 12),
    steel,
    bollards,
  ).userData.noReflect = true;
  instance(
    new T.CylinderGeometry(0.24, 0.22, 0.1, 12),
    steel,
    bollards.map((p) => [p[0], 0.52, p[2], 1, 1, 1]),
  ).userData.noReflect = true;
  // Far shore: mud at the shared terrain height, shingle below the waterline,
  // and an irregular grass fringe. HILLS takes over at -160.
  const shoreGeometry = new T.PlaneGeometry(1100, 2, 200, 2);
  shoreGeometry.rotateX(-Math.PI / 2);
  const sp = shoreGeometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i) + 20,
      z = sp.getZ(i) - 159;
    sp.setXYZ(i, x, sim.groundY(x, z) - 0.008, z);
  }
  shoreGeometry.computeVertexNormals();
  const shore = new T.Mesh(shoreGeometry, mud);
  shore.receiveShadow = true;
  group.add(shore);
  const bankFace = new T.Mesh(new T.PlaneGeometry(1100, 5), silt);
  bankFace.position.set(20, -2.5, -158);
  group.add(bankFace);
  const pebbles = [];
  for (let k = 0; k < (quality === "low" ? 400 : 1100); k++) {
    const x = k % 3 ? -30 + rand(k) * 100 : -300 + rand(k) * 640,
      z = -158.12 - rand(k + 900) * 2;
    const r = 0.06 + rand(k + 100) * 0.29;
    pebbles.push([
      x,
      sim.groundY(x, z) + r * 0.13,
      z,
      r * 1.6,
      r * 0.5,
      r,
      0,
      rand(k + 200) * 6.28,
      rand(k + 210) * 0.4,
    ]);
  }
  instance(new T.IcosahedronGeometry(1, 1), rock, pebbles).userData.noReflect =
    true;
  // Render the two route boundary wall ends from their exact layout bounds.
  for (const b of sim.layout.filter(
    (b) => b.zone === 3 && b.kind !== "block",
  )) {
    const wall = kit.box(...b.max.map((v, i) => v - b.min[i]), stone, 0.035);
    wall.position.set(...b.max.map((v, i) => (v + b.min[i]) / 2));
    wall.castShadow = wall.receiveShadow = true;
    group.add(wall);
  }
  const reedMat = kit.material({
    color: 0x59664a,
    side: T.DoubleSide,
    roughness: 0.92,
  });
  const reedCompile = reedMat.onBeforeCompile;
  reedMat.onBeforeCompile = (shader) => {
    reedCompile(shader);
    shader.vertexShader =
      `uniform float time,wind;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float phase=0.;
#ifdef USE_INSTANCING
phase=instanceMatrix[3].x*.37+instanceMatrix[3].z*.19;
#endif
transformed.x+=sin(time*.65+phase)*position.y*position.y*.035*wind;`,
      );
  };
  const windCompile = reedMat.onBeforeCompile;
  reedMat.onBeforeCompile = (shader) => {
    windCompile(shader);
    shader.vertexShader =
      `varying vec2 reedUV;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nreedUV=uv;",
      );
    shader.fragmentShader =
      `varying vec2 reedUV;\n${shader.fragmentShader}`.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
float vein=pow(abs(sin(reedUV.x*9.4248)),8.);
diffuseColor.rgb*=mix(.35,1.25,reedUV.y)*(.85+vein*.15);
float dryTip=smoothstep(.64,1.,reedUV.y);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.17,.13,.065),dryTip*.45);`,
      );
  };
  reedMat.customProgramCacheKey = () => "river-reed-wind-v2";
  const reedGeometry = new T.PlaneGeometry(0.055, 1, 1, 4);
  const rp = reedGeometry.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const y = rp.getY(i) + 0.5;
    rp.setXYZ(i, rp.getX(i) * (1 - y * 0.8) + y * y * 0.18, y, 0);
  }
  reedGeometry.computeVertexNormals();
  const reeds = [];
  const tufts = quality === "low" ? 1500 : quality === "high" ? 5000 : 8000;
  for (let i = 0; i < tufts; i++) {
    const clump = Math.floor(i / 28);
    const x = clump % 3 ? -24 + rand(clump) * 90 : -120 + rand(clump) * 280,
      far = i % 3 !== 0;
    if ((!far && x > 12 && x < 28) || (far && Math.abs(x - 20) < 2)) continue;
    const z = far
      ? -158.12 - rand(clump + 135) * 0.6 - rand(i + 135) * 0.4
      : -111.2 - rand(clump + 135) * 0.5;
    const y = far ? sim.groundY(x, z) : -0.8;
    reeds.push([
      x + rand(i + 123) * 0.7,
      y,
      z,
      1,
      0.55 + rand(i + 234) * 1.1,
      1,
      0,
      rand(i + 456) * 6.28,
      0.1,
    ]);
  }
  // Short plants root in the quay joints. They never form a solid obstacle.
  for (let i = 0; i < 160; i++) {
    const clump = Math.floor(i / 8),
      x = 12.5 + rand(clump + 810) * 15;
    if (Math.abs(x - 20) < 2) continue;
    reeds.push([
      x + rand(i + 721) * 0.08,
      0.002,
      -110.76 + rand(clump + 41) * 1.4,
      0.4,
      0.07 + rand(i + 67) * 0.12,
      0.4,
      0,
      rand(i + 19) * 6.28,
      0,
    ]);
  }
  instance(reedGeometry, reedMat, reeds).userData.noReflect = true;
  const stems = [],
    heads = [];
  for (let i = 0; i < reeds.length; i += 17) {
    const r = reeds[i];
    if (r[1] > -0.1 && r[2] > -112) continue;
    const h = r[4] * 1.18;
    stems.push([r[0], r[1] + h * 0.5, r[2], 1, h, 1]);
    heads.push([r[0], r[1] + h * 0.9, r[2], 1, 0.65 + rand(i + 38) * 0.6, 1]);
  }
  instance(
    new T.CylinderGeometry(0.007, 0.011, 1, 5),
    reedMat,
    stems,
  ).userData.noReflect = true;
  instance(
    new T.CylinderGeometry(0.026, 0.021, 0.22, 6),
    surface(kit, "bark", { scale: 0.08, tint: 0xb7a98b }),
    heads,
  ).userData.noReflect = true;
  const water = buildWater({ ...ctx, group });
  const blocks = buildBlocks({ ...ctx, group });
  // The ridge can look back over the valley after zone-3 content is culled.
  // Keep just a sky-reflecting water ribbon there, never a second planar pass.
  const distant = new T.Group();
  scene.add(distant);
  const distantWater = buildWater({ ...ctx, quality: "low", group: distant });
  return {
    update(frame) {
      haze.value.copy(frame.env.fog);
      distant.visible = frame.snapshot.zone >= 5;
      distantWater.update(frame);
      water.update(frame);
      blocks.update(frame);
    },
    dispose() {
      water.dispose();
      distantWater.dispose();
      distant.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      scene.remove(distant);
      blocks.dispose();
      bankMaterials.forEach((m) => m.dispose());
    },
  };
}
