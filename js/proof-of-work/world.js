import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { street as buildStreet } from "./street.js";
import { impellerBlade, hardwareMaterials, serialPlates } from "./hardware.js";
import { dressWorld } from "./dressing.js";
import { label } from "./materials.js";
import { buildChair } from "./chair.js";
import { entryWater } from "./wet-floor.js";

export function buildWorld(scene, m, quality) {
  const layout = window.ProofOfWork.layout;
  const hardware = hardwareMaterials(m);
  const bladeGeometry = impellerBlade();
  const servicePlates = serialPlates();
  const unitLabels = [
    label("QC / 08\n480V", 128, 96, "#282b25", "#b0a785"),
    label("SHA-256\nSERVICE", 128, 96, "#282b25", "#9eaa9e"),
  ];
  const batches = new Map(),
    geometries = new Map(),
    fans = [],
    handles = [],
    lamps = [],
    lights = [];
  const beacons = [],
    bankFills = [];
  const dummy = new T.Object3D();
  function geom(key, make) {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key);
  }
  function add(g, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = null) {
    if (parent) {
      const mesh = new T.Mesh(g, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    const room = z > 0 ? 0 : z < -16 ? 2 : 1;
    const key = g.uuid + mat.uuid + room;
    if (!batches.has(key)) batches.set(key, { g, mat, room, transforms: [] });
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    batches.get(key).transforms.push(dummy.matrix.clone());
  }
  function box(x, y, z, w, h, d, mat = m.steel, parent = null, ry = 0) {
    const key = `b${w},${h},${d}`;
    return add(
      geom(key, () =>
        Math.min(w, h, d) < 0.045
          ? new T.BoxGeometry(w, h, d)
          : new RoundedBoxGeometry(
              w,
              h,
              d,
              1,
              Math.min(0.025, w * 0.15, h * 0.15, d * 0.15),
            ),
      ),
      mat,
      x,
      y,
      z,
      0,
      ry,
      0,
      parent,
    );
  }
  function cylinder(
    x,
    y,
    z,
    r,
    len,
    mat = m.steel,
    rx = 0,
    rz = 0,
    parent = null,
  ) {
    return add(
      geom(
        `c${r},${len}`,
        () => new T.CylinderGeometry(r, r, len, r < 0.04 ? 8 : 16),
      ),
      mat,
      x,
      y,
      z,
      rx,
      0,
      rz,
      parent,
    );
  }
  function ring(x, y, z, r, t, mat = m.steel, ry = 0, parent = null) {
    return add(
      geom(`t${r},${t}`, () => new T.TorusGeometry(r, t, 4, r < 0.3 ? 64 : 32)),
      mat,
      x,
      y,
      z,
      0,
      ry,
      0,
      parent,
    );
  }
  function pipe(points, r = 0.035, mat = m.rubber, parent = scene) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
    );
    const geometry = geom(
      `pipe${r}:${JSON.stringify(points)}`,
      () =>
        new T.TubeGeometry(
          curve,
          Math.max(8, Math.min(32, Math.ceil(curve.getLength() * 5))),
          r,
          6,
          false,
        ),
    );
    const mesh = new T.Mesh(geometry, mat);
    parent.add(mesh);
    return mesh;
  }
  function sign(text, x, y, z, w, h, ry = 0, fg, bg) {
    const mat = label(text, 768, Math.round((768 * h) / w), fg, bg);
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
    return mesh;
  }
  const amber = new T.MeshStandardMaterial({
    color: 0x59362a,
    emissive: 0xffa344,
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  const teal = new T.MeshStandardMaterial({
    color: 0xa3eee1,
    emissive: 0x67dfd4,
    emissiveIntensity: 2,
    roughness: 0.4,
  });
  const red = new T.MeshPhysicalMaterial({
    color: 0x000000,
    specularIntensity: 0,
    emissive: 0xff3514,
    emissiveIntensity: 1.3,
  });
  const yellow = m.paint.clone();
  yellow.color.set(0xe8a956);
  const dark = m.steel.clone();
  dark.color.set(0x263033);
  function point(x, y, z, color, power, range) {
    const l = new T.PointLight(color, power, range, 2);
    l.position.set(x, y, z);
    // The default tier uses the baked irradiance volume for these fills.
    if (quality !== "low") scene.add(l);
    lights.push(l);
    return l;
  }
  function practical(x, y, z, color, power, range) {
    const light = new T.SpotLight(color, power, range, 1.12, 0.65, 2);
    light.position.set(x, y, z);
    light.target.position.set(x, 0, z);
    light.castShadow = quality !== "low";
    light.shadow.mapSize.setScalar(512);
    light.shadow.radius = 3.5;
    light.shadow.bias = -0.0002;
    light.shadow.normalBias = 0.025;
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    scene.add(light, light.target);
    lights.push(light);
    return light;
  }
  const floorConcrete = m.concrete.clone();
  floorConcrete.color.set(0x929b94);
  floorConcrete.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
    vMapUv*=vec2(3.,.5);vNormalMapUv*=vec2(3.,.5);vRoughnessMapUv*=vec2(3.,.5);vMetalnessMapUv*=vec2(3.,.5);vAoMapUv*=vec2(3.,.5);`,
    );
  };
  // Form-tie recesses are cut through the slab with bevelled lips, rather
  // than painting black circles on an otherwise flat concrete face.
  for (const {
    bounds: [l, r, n, s],
    bottom,
    height,
    material,
  } of layout.filter((o) => o.kind === "shell")) {
    const w = r - l,
      d = s - n;
    if (Math.abs(w - 0.26) < 0.001 && Math.abs(d - 1.98) < 0.001) {
      const slab = geom(`slab${height}`, () => {
        const shape = new T.Shape();
        shape.moveTo(-d / 2, -height / 2);
        shape.lineTo(d / 2, -height / 2);
        shape.lineTo(d / 2, height / 2);
        shape.lineTo(-d / 2, height / 2);
        shape.closePath();
        for (const y of [0.8, 2.1])
          for (const x of [-0.65, 0.65]) {
            const hole = new T.Path();
            hole.absellipse(
              x,
              y - height / 2,
              0.018,
              0.018,
              0,
              Math.PI * 2,
              true,
            );
            shape.holes.push(hole);
          }
        const g = new T.ExtrudeGeometry(shape, {
          depth: w,
          steps: 1,
          bevelEnabled: true,
          bevelSize: 0.004,
          bevelThickness: 0.004,
          bevelSegments: 1,
          curveSegments: 8,
        });
        g.translate(0, 0, -w / 2);
        return g;
      });
      add(
        slab,
        m.concrete,
        (l + r) / 2,
        bottom + height / 2,
        (n + s) / 2,
        0,
        Math.PI / 2,
      );
    } else
      box(
        (l + r) / 2,
        bottom + height / 2,
        (n + s) / 2,
        w,
        height,
        d,
        material === "floor" ? floorConcrete : m.concrete,
      );
  }
  // Structural ribs, bolted baseplates, duct runs and suspended cable trays.
  for (const column of layout.filter((o) => o.kind === "column")) {
    const [l, r, n, s] = column.bounds,
      x = (l + r) / 2,
      z = (n + s) / 2;
    {
      box(x, 2.9, z, 0.2, 5.8, 0.24, dark);
      box(x, 0.08, z, 0.5, 0.15, 0.5, dark);
      for (const dx of [-0.17, 0.17])
        for (const dz of [-0.17, 0.17])
          cylinder(x + dx, 0.17, z + dz, 0.035, 0.055, m.steel);
      box(x, 3.5, z, 0.42, 0.15, 0.4, m.steel);
    }
    if (x < 0) continue;
    box(0, 5.75, z, 11.8, 0.28, 0.2, dark);
    for (const x of [-2, 2]) {
      cylinder(x, 5, z, 0.018, 1.5, m.steel);
      box(x, 4.4, z, 1, 0.08, 3.5, dark);
      for (let dz = -1.5; dz < 1.6; dz += 0.3)
        box(x, 4.45, z + dz, 1, 0.04, 0.04, m.steel);
    }
  }
  for (const x of [-5.4, -5.12, 5.45]) {
    cylinder(x, 3.7, -8, 0.095, 15, m.steel, Math.PI / 2);
    for (let z = -1; z > -16; z -= 1.5) {
      ring(x, 3.7, z, 0.115, 0.025, m.steel);
    }
  }
  const serviceRun = layout.find((o) => o.kind === "pipe-run");
  const [pl, pr, pn, ps] = serviceRun.bounds;
  for (const y of serviceRun.levels) {
    cylinder(
      (pl + pr) / 2,
      y,
      (pn + ps) / 2,
      0.045,
      ps - pn,
      m.steel,
      Math.PI / 2,
    );
    for (let z = pn + 0.3; z < ps; z += 0.8)
      box(pl + 0.045, y, z, pr - pl, 0.14, 0.07, dark);
  }
  cylinder(4.8, 5.1, -8, 0.42, 15, m.steel, Math.PI / 2);
  for (let z = -1; z > -16; z -= 1) ring(4.8, 5.1, z, 0.43, 0.025, dark);
  // Actual cable trench beneath open steel grating.
  box(0, -0.42, -8, 1.9, 0.1, 15.8, m.rubber);
  for (let x = -0.55; x < 0.6; x += 0.16)
    pipe(
      [
        [x, -0.05, -0.2],
        [x + 0.1, -0.08, -5],
        [x - 0.08, -0.04, -10],
        [x, -0.08, -15.8],
      ],
      0.045,
      x < 0 ? m.rubber : m.paint,
    );
  for (let z = -0.15; z > -16; z -= 0.18)
    box(0, 0.025, z, 1.65, 0.05, 0.033, m.steel);
  for (const x of [-0.82, -0.4, 0, 0.4, 0.82])
    box(x, 0.02, -8, 0.035, 0.07, 16, m.steel);
  for (const x of [-1.02, 1.02]) {
    box(x, 0.012, -8, 0.09, 0.012, 15.7, yellow);
    for (let z = -0.3; z > -16; z -= 0.7)
      box(x, 0.021, z, 0.095, 0.01, 0.18, dark);
  }
  // Wet floor captures this room in a half-resolution planar mirror; irregular
  // roughness breaks the reflection instead of making a perfect glass slab.
  const floor = new Reflector(new T.PlaneGeometry(12, 16), {
    textureWidth: quality === "ultra" ? 960 : 384,
    textureHeight: quality === "ultra" ? 540 : 216,
    color: 0x6b7773,
    multisample: 0,
  });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.008, -8);
  floor.material.vertexShader =
    "varying vec2 groundUv;\n" +
    floor.material.vertexShader.replace(
      "void main() {",
      "void main() { groundUv=uv;",
    );
  floor.material.fragmentShader =
    "varying vec2 groundUv;\n" + floor.material.fragmentShader;
  floor.material.fragmentShader = floor.material.fragmentShader
    .replace(
      "void main() {",
      `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);} void main() { if(abs(groundUv.x-.5)<.07)discard;`,
    )
    .replace(
      "vec4 base = texture2DProj( tDiffuse, vUv );",
      `vec4 coord=vUv;coord.xy+=vec2(noise(groundUv*310.),noise(groundUv.yx*370.))*.0015*coord.w;vec4 base = texture2DProj(tDiffuse,coord);`,
    )
    .replace(
      "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
      `float field=noise(groundUv*18.)*.7+noise(groundUv*47.)*.3;float wet=smoothstep(.48,.57,field);float halo=smoothstep(.36,.48,field);gl_FragColor=vec4(mix(vec3(.015,.022,.018),blendOverlay(base.rgb,color)*.75,wet),halo*.16+wet*.4);`,
    );
  floor.material.transparent = true;
  scene.add(floor);
  const grime = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 v;void main(){vec2 p=(v-.5)*2.;float a=exp(-dot(p,p)*3.)*(.6+.18*sin(p.x*31.)*sin(p.y*23.));gl_FragColor=vec4(.015,.021,.018,a*.75);}`,
  });
  for (const x of [-3, 3])
    for (const z of [-3, -6, -9, -12]) {
      const stain = new T.Mesh(new T.PlaneGeometry(2.8, 3), grime);
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(x, 0.019, z);
      scene.add(stain);
    }
  // Each rack is a real open frame with four miners, twin fans and heat sinks.
  const ledMaterials = [0, 1, 2].map(() => {
    const mat = teal.clone();
    mat.userData.clock = { value: 0 };
    mat.userData.age = { value: 0 };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.bankClock = mat.userData.clock;
      shader.uniforms.bankAge = mat.userData.age;
      shader.vertexShader =
        "varying float ledPhase;varying float ledZ;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        ledPhase=0.;ledZ=0.;
        #ifdef USE_INSTANCING
        ledPhase=dot(instanceMatrix[3].xyz,vec3(13.7,3.1,7.9));ledZ=instanceMatrix[3].z;
        #endif`,
      );
      shader.fragmentShader =
        "uniform float bankClock;uniform float bankAge;varying float ledPhase;varying float ledZ;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance *= (.85+.15*sin(bankClock*.9+ledPhase))*smoothstep(-1.,1.,bankAge*12.+ledZ);`,
      );
    };
    return mat;
  });
  for (const rack of layout.filter((o) => o.kind === "rack")) {
    const [l, r, n, s] = rack.bounds;
    const x = (l + r) / 2,
      z = (n + s) / 2,
      j = (-z - 3) / 3,
      bank = j < 2 ? (x < 0 ? 0 : 1) : 2;
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(group);
    for (const a of [-0.95, 0.95])
      for (const b of [-0.53, 0.53])
        box(a, 1.55, b, 0.075, 3.1, 0.075, m.paint, group);
    for (const y of [0.12, 0.8, 1.5, 2.2, 2.95])
      box(0, y, 0, 2, 0.055, 1.15, m.steel, group);
    for (const y of [0.43, 1.12, 1.82, 2.52]) {
      box(0, y, 0, 1.82, 0.48, 0.95, dark, group);
      box(0, y, 0.49, 1.79, 0.44, 0.035, dark, group);
      // The PSU has its own case, punched vents and AC lead, rather than
      // being represented by a coloured face on the mining enclosure.
      box(0.35, y + 0.3, -0.08, 0.65, 0.1, 0.42, hardware.aluminum, group);
      for (let slot = 0; slot < 7; slot++)
        box(
          0.1 + slot * 0.075,
          y + 0.3,
          0.136,
          0.035,
          0.055,
          0.004,
          m.rubber,
          group,
        );
      box(0.57, y + 0.3, -0.31, 0.12, 0.065, 0.06, m.rubber, group);
      pipe(
        [
          [0.57, y + 0.3, -0.34],
          [0.72, y + 0.23, -0.54],
          [0.82, y - 0.1, -0.63],
        ],
        0.014,
        m.rubber,
        group,
      );
      // Extruded heat sinks and a service board on each unit.
      for (const side of [-1, 1]) {
        for (let dz = -0.42; dz < 0.43; dz += 0.055)
          box(
            side * 0.916,
            y,
            dz,
            0.018,
            0.39,
            0.018,
            hardware.aluminum,
            group,
          );
      }
      box(0.08, y + 0.18, 0.535, 0.42, 0.075, 0.035, m.paint, group);
      for (let port = 0; port < 3; port++) {
        box(
          -0.06 + port * 0.11,
          y + 0.18,
          0.56,
          0.07,
          0.045,
          0.012,
          m.rubber,
          group,
        );
        box(
          -0.06 + port * 0.11,
          y + 0.17,
          0.57,
          0.045,
          0.009,
          0.005,
          m.steel,
          group,
        );
      }
      box(0, y - 0.15, 0.55, 0.24, 0.09, 0.015, m.paint, group);
      add(
        geom("serial-plate", () => new T.PlaneGeometry(0.22, 0.073)),
        servicePlates,
        0,
        y - 0.15,
        0.559,
        0,
        0,
        0,
        group,
      );
      box(-0.71, y + 0.13, 0.553, 0.13, 0.1, 0.008, yellow, group);
      add(
        geom("unit-label", () => new T.PlaneGeometry(0.12, 0.09)),
        unitLabels[j % 2],
        -0.71,
        y + 0.13,
        0.559,
        0,
        0,
        0,
        group,
      );
      // Shroud corners and four guard spokes have depth in front of blades.
      for (const fx of [-0.46, 0.46]) {
        for (const side of [-1, 1])
          box(fx + side * 0.205, y, 0.545, 0.025, 0.44, 0.05, dark, group);
        for (const dy of [-0.21, 0.21])
          box(fx, y + dy, 0.545, 0.42, 0.025, 0.05, dark, group);
        for (const a of [0, Math.PI / 2]) {
          const spoke = box(fx, y, 0.568, 0.012, 0.38, 0.012, m.steel, group);
          spoke.rotation.z = a;
        }
      }
      for (const fx of [-0.46, 0.46]) {
        cylinder(fx, y, 0.525, 0.19, 0.028, m.rubber, Math.PI / 2, 0, group);
        for (const r of [0.07, 0.12, 0.17, 0.205])
          ring(fx, y, 0.555, r, 0.008, m.steel, 0, group);
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          box(
            fx + Math.sin(a) * 0.215,
            y + Math.cos(a) * 0.215,
            0.55,
            0.035,
            0.035,
            0.025,
            m.steel,
            group,
          );
        }
        const fan = new T.Group();
        fan.position.set(fx, y, 0.54);
        group.add(fan);
        for (let k = 0; k < 7; k++)
          add(
            bladeGeometry,
            hardware.casting,
            0,
            0,
            0,
            0,
            0,
            (k * Math.PI * 2) / 7,
            fan,
          );
        cylinder(0, 0, 0, 0.045, 0.035, m.steel, Math.PI / 2, 0, fan);
        fans.push({ fan, bank, dead: fans.length % 23 === 17 });
      }
      for (let fx = -0.8; fx < 0.9; fx += 0.075)
        box(fx, y, -0.5, 0.022, 0.43, 0.11, dark, group);
      box(0.81, y + 0.1, 0.53, 0.025, 0.025, 0.025, ledMaterials[bank], group);
      for (const fx of [-0.85, 0.85])
        for (const fy of [-0.18, 0.18])
          cylinder(
            fx,
            y + fy,
            0.54,
            0.016,
            0.018,
            m.steel,
            Math.PI / 2,
            0,
            group,
          );
    }
    for (const a of [-0.95, 0.95])
      for (let y = 0.22; y < 2.95; y += 0.11)
        box(a, y, 0.574, 0.032, 0.045, 0.002, m.rubber, group);
    for (const y of [0.12, 0.8, 1.5, 2.2, 2.95])
      box(0, y + 0.025, 0.59, 1.9, 0.07, 0.025, dark, group);
    const id = sign(
      `ANTMINER / ${x < 0 ? "A" : "B"}${j + 1}   •   21 TH/s`,
      x + (x < 0 ? 0.59 : -0.59),
      3.03,
      z,
      1.8,
      0.17,
      x < 0 ? Math.PI / 2 : -Math.PI / 2,
    );
    id.material.color.set(0xbebca7);
    for (let k = 0; k < 5; k++)
      pipe(
        [
          [x + (x < 0 ? -0.6 : 0.6), 0.4, z - 0.75 + k * 0.3],
          [x + (x < 0 ? -0.83 : 0.83), 1.6, z - 1 + k * 0.3],
          [x, 3.6, z - 0.6 + k * 0.3],
          [x, 4.5, z],
        ],
        0.018,
        k % 2 ? m.rubber : m.paint,
      );
  }
  // Lighting fixtures and asymmetric practical lights establish the composition.
  for (let j = 0; j < 3; j++) {
    const z = [-4, -4, -11][j],
      lampX = [-2, 2, 0][j];
    box(lampX, 4.25, z, 3.1, 0.14, 0.32, dark);
    box(lampX, 4.16, z, 2.85, 0.04, 0.2, ledMaterials[j]);
    lamps.push(practical(lampX * 0.5, 3.9, z, 0xd2dedb, 45, 10));
    bankFills.push(point(lampX, 2.5, z - 0.5, 0xc2d3ce, 0, 7));
    if (j === 1) continue;
    for (const x of [-5.7, 5.7]) {
      box(x, 2.8, z, 0.14, 0.55, 0.3, dark);
      box(x + (x < 0 ? 0.09 : -0.09), 2.8, z, 0.05, 0.4, 0.21, red);
    }
  }
  beacons.push(point(-5.6, 2.8, -4, 0xff3020, 2, 5));
  beacons.push(point(5.6, 2.8, -11, 0xff3020, 2, 5));
  box(1.04, 2.45, 0.19, 0.26, 0.34, 0.1, dark);
  box(1.04, 2.45, 0.249, 0.19, 0.24, 0.04, red);
  for (const x of [0.975, 1.105]) box(x, 2.45, 0.28, 0.012, 0.29, 0.016, dark);
  beacons.push(point(1.04, 2.45, 0.42, 0xff4430, 2, 3));
  const sodium = new T.SpotLight(0xffd1a2, 34, 8, 0.7, 0.45, 2);
  sodium.position.set(1.3, 2.1, 5.7);
  sodium.target.position.set(-1.5, 0.5, 4.2);
  sodium.castShadow = quality !== "low";
  sodium.shadow.mapSize.setScalar(1024);
  sodium.shadow.bias = -0.0003;
  sodium.shadow.normalBias = 0.035;
  sodium.shadow.autoUpdate = false;
  sodium.shadow.needsUpdate = true;
  scene.add(sodium, sodium.target);
  box(0, 2.86, 3, 1.4, 0.1, 0.18, dark);
  box(0, 2.8, 3, 1.2, 0.02, 0.09, m.steel);
  sign("PROOF OF WORK", 0, 4.8, -15.82, 5.6, 0.7, 0, "#d7cbbb", "#27302e");
  sign("SECTOR 08  /  INDEPENDENT MINING", 0, 3.24, -15.8, 4.2, 0.21);
  sign(
    "AUTHORIZED PERSONNEL ONLY",
    0,
    2.65,
    0.15,
    2.4,
    0.21,
    0,
    "#e3ba65",
    "#222b28",
  );
  sign("01  /  POWER", -1.35, 1.8, 2.6, 1.4, 0.25, Math.PI / 2);
  sign(
    "LIVE CIRCUITS\nISOLATE BEFORE SERVICE",
    -5.84,
    2.1,
    -7.2,
    1.8,
    0.55,
    Math.PI / 2,
    "#24251e",
    "#cca448",
  );
  // Breaker boxes with visible screws, hinges, throws and painted warnings.
  for (const [i, t] of window.ProofOfWork.targets.slice(0, 3).entries()) {
    const housing = layout.find(
      (o) => o.kind === "breaker" && o.targetId === t.id,
    );
    const [hl, hr, hn, hs] = housing.bounds;
    const g = new T.Group();
    g.position.set(
      (hl + hr) / 2,
      housing.bottom + housing.height / 2,
      (hn + hs) / 2,
    );
    g.rotation.y = t.x > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(g);
    box(0, 0, 0, hs - hn, housing.height, 0.18, m.paint, g);
    for (const y of [-0.25, 0.25]) {
      cylinder(-0.3, y, 0.08, 0.025, 0.16, m.steel, 0, 0, g);
      for (const dy of [-0.045, 0.045])
        ring(-0.3, y + dy, 0.08, 0.026, 0.003, dark, 0, g).rotation.x =
          Math.PI / 2;
    }
    box(0.29, -0.08, 0.14, 0.04, 0.18, 0.055, m.steel, g);
    box(0, -0.32, 0.135, 0.32, 0.07, 0.004, yellow, g);
    box(0, 0, 0.105, 0.53, 0.73, 0.04, dark, g);
    for (const x of [-0.23, 0.23])
      for (const y of [-0.32, 0.32])
        cylinder(x, y, 0.14, 0.022, 0.016, m.steel, Math.PI / 2, 0, g);
    box(0, -0.05, 0.15, 0.19, 0.35, 0.06, m.rubber, g);
    const h = new T.Group();
    h.position.set(0, -0.12, 0.19);
    g.add(h);
    box(0, 0.1, 0.08, 0.13, 0.24, 0.08, yellow.clone(), h);
    handles.push(h);
    const text = new T.Mesh(
      new T.PlaneGeometry(0.45, 0.13),
      label(`BANK ${t.id} / 480V`, 512, 128, "#24251e", "#c7ab70"),
    );
    text.position.set(0, 0.25, 0.135);
    g.add(text);
    box(0.19, 0.14, 0.15, 0.035, 0.035, 0.02, ledMaterials[i], g);
    pipe(
      [
        [t.x, 1, t.z],
        [t.x, 0.5, t.z],
        [t.x, 0.2, t.z + 0.6],
      ],
      0.04,
      m.rubber,
    );
  }
  // Tall rain-glass window: exterior is procedural silhouettes and lamps.
  const windowShape = layout.find((o) => o.kind === "window");
  const [wl, , wn, ws] = windowShape.bounds;
  const windowY = windowShape.bottom + windowShape.height / 2,
    windowZ = (wn + ws) / 2;
  for (const y of [
    windowShape.bottom + 0.045,
    windowShape.bottom + windowShape.height - 0.045,
  ])
    box(wl + 0.08, y, windowZ, 0.1, 0.09, ws - wn + 0.04, dark);
  const glass = new T.MeshPhysicalMaterial({
    color: 0x93b5b4,
    metalness: 0.35,
    roughness: 0.15,
    transparent: true,
    opacity: 0.32,
    normalMap: m.steel.normalMap,
    normalScale: new T.Vector2(0.2, 2),
    envMapIntensity: 1.5,
  });
  const rainGlass = new T.MeshPhysicalMaterial({
    color: 0xc2d3d0,
    roughness: 0.28,
    roughnessMap: m.concrete.roughnessMap,
    metalness: 0,
    transmission: 0.92,
    thickness: 0.06,
    ior: 1.46,
    specularIntensity: 0.012,
    normalMap: m.rainNormal,
    normalScale: new T.Vector2(0.8, 0.8),
    envMapIntensity: 0.25,
  });
  rainGlass.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
       reflectedLight.directDiffuse*=.08;reflectedLight.directSpecular*=.25;`,
    );
  };
  box(
    wl + 0.11,
    windowY,
    windowZ,
    0.018,
    windowShape.height - 0.27,
    ws - wn - 0.14,
    rainGlass,
  );
  box(wl + 0.08, windowY - 0.03, windowZ, 0.06, 0.035, ws - wn - 0.14, m.paint);
  for (const z of [wn + 0.03, ws - 0.03])
    box(wl + 0.06, windowY, z, 0.12, windowShape.height - 0.07, 0.06, m.paint);
  // Luminous wet street seen through the glass, not an image asset.
  const windowTime = { value: 0 };
  const exterior = new T.ShaderMaterial({
    uniforms: { time: windowTime },
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
    varying vec2 v;uniform float time;
    float hash(float x){return fract(sin(x*127.1)*43758.5453);}
    void main(){vec2 uv=v;float stream=sin(uv.x*510.+sin(uv.y*15.+time*.4))*sin(uv.x*713.);uv.x+=stream*.0018;
      vec3 c=mix(vec3(.023,.034,.046),vec3(.09,.14,.17),uv.y);
      float col=floor(uv.x*13.);float height=.25+hash(col)*.33;
      if(uv.y<height){c*=.25;vec2 cell=fract(uv*vec2(65.,47.));float win=step(.22,cell.x)*step(cell.x,.6)*step(.24,cell.y)*step(cell.y,.5)*step(.6,hash(floor(uv.y*47.)+col*51.));c+=vec3(.14,.12,.09)*win;}
      for(int i=0;i<12;i++){vec2 p=vec2(hash(float(i)*3.),.15+hash(float(i)*7.)*.3);float d=length((uv-p)*vec2(1.,1.7));c+=vec3(.9,.48,.16)*exp(-d*d*1800.)*.7;}
      float pole=1.-smoothstep(.005,.012,abs(uv.x-.82));if(uv.y<.78)c*=1.-pole*.9;
      float lamp=length((uv-vec2(.82,.78))*vec2(1.,1.7));c+=vec3(1.,.56,.19)*exp(-lamp*9.)*1.8;
      float fence=step(.965,fract((uv.x+uv.y)*22.))+step(.965,fract((uv.x-uv.y)*22.));c*=1.-min(1.,fence)*0.;
      float drop=pow(max(0.,sin(uv.x*410.+sin(uv.x*270.))),25.)*pow(max(0.,sin(uv.y*15.+time*.65+uv.x*35.)),8.);c+=vec3(.11,.13,.14)*drop*0.;
      vec2 cell=uv*vec2(26.,38.);vec2 f=fract(cell)-.5;
      float bead=exp(-dot(f*vec2(1.,.65),f*vec2(1.,.65))*120.)*step(.64,hash(floor(cell.x)+floor(cell.y)*81.));
      c+=vec3(.14,.17,.17)*bead*0.;
      gl_FragColor=vec4(c,1.);
    }`,
  });
  const street = new T.Mesh(new T.PlaneGeometry(32, 18), exterior);
  street.position.set(22, 5, 5.7);
  street.rotation.y = -Math.PI / 2;
  scene.add(street);
  buildStreet(scene, m, windowTime);
  entryWater(scene, m);
  // Skylight rim and cracked panes overhead.
  for (const x of [-1.15, 2.15]) box(x, 5.88, -8, 0.14, 0.16, 2.6, dark);
  for (const z of [-6.7, -9.3]) box(0.5, 5.88, z, 3.3, 0.16, 0.14, dark);
  box(0.5, 5.78, -8, 3, 0.018, 2.3, glass);
  for (const x of [-1, 0, 1, 2]) box(x, 5.7, -8, 0.045, 0.09, 2.4, m.steel);
  pipe(
    [
      [-0.9, 5.68, -7],
      [0.1, 5.68, -7.5],
      [0.3, 5.68, -8],
      [1.5, 5.68, -8.9],
    ],
    0.012,
    m.steel,
  );
  // Control room and its glass partition looking over the hall.
  for (const {
    bounds: [l, r, n, s],
    height,
  } of layout.filter((o) => o.kind === "glass"))
    box((l + r) / 2, height / 2, (n + s) / 2, r - l, height, s - n, glass);
  const door = new T.Group();
  scene.add(door);
  const doorShape = layout.find((o) => o.kind === "door");
  const [left, right, north, south] = doorShape.bounds;
  box(
    (left + right) / 2,
    doorShape.height / 2,
    (north + south) / 2,
    right - left,
    doorShape.height,
    south - north,
    m.paint,
    door,
  );
  box(0, 1.8, -15.94, 1.1, 0.85, 0.02, glass, door);
  const doorStatus = red.clone();
  box(0.9, 2.75, -15.84, 0.1, 0.2, 0.08, doorStatus);
  sign("CONTROL / 08", 0, 2.68, -15.92, 1.2, 0.18);
  const desk = layout.find((o) => o.kind === "desk");
  const [dl, dr, dn, ds] = desk.bounds;
  box(
    (dl + dr) / 2,
    desk.height - 0.065,
    (dn + ds) / 2,
    dr - dl,
    0.13,
    ds - dn,
    m.paint,
  );
  for (const x of [-1.5, 1.5]) box(x, 0.4, -19.8, 0.09, 0.8, 0.7, m.steel);
  box(-0.9, 1.27, -20, 0.8, 0.68, 0.6, m.paint);
  box(-0.9, 1.3, -19.68, 0.67, 0.47, 0.03, m.rubber);
  const crt = sign(
    "NODE 0008\nAWAITING POWER",
    -0.9,
    1.3,
    -19.66,
    0.59,
    0.39,
    0,
    "#83dfb9",
    "#071e17",
  );
  crt.material.emissive.set(0x62dcae);
  crt.material.emissiveMap = crt.material.map;
  crt.material.emissiveIntensity = 0.3;
  // The face bows outward a few millimetres; scanlines modulate the phosphor.
  crt.geometry.dispose();
  crt.geometry = new T.PlaneGeometry(0.59, 0.39, 24, 16);
  const cp = crt.geometry.attributes.position;
  for (let i = 0; i < cp.count; i++)
    cp.setZ(
      i,
      0.018 *
        (1 - Math.pow(cp.getX(i) / 0.3, 2) - Math.pow(cp.getY(i) / 0.2, 2)),
    );
  crt.geometry.computeVertexNormals();
  crt.material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\ndiffuseColor.rgb *= .85 + .15 * sin(vMapUv.y * 1250.);",
    );
  };
  const board = sign(
    "0.00 EH/s   /   OFFLINE",
    0,
    2.4,
    -20.96,
    3.2,
    0.5,
    0,
    "#8fe3c5",
    "#09201c",
  );
  board.material.emissive.set(0x62dcae);
  board.material.emissiveMap = board.material.map;
  board.material.emissiveIntensity = 0.35;
  const hallBoard = new T.Mesh(new T.PlaneGeometry(5.6, 0.65), board.material);
  hallBoard.position.set(0, 3.95, -15.81);
  scene.add(hallBoard);
  box(1.25, 1, -19.55, 0.5, 0.2, 0.55, dark);
  const lever = new T.Group();
  lever.position.set(1.25, 1.1, -19.4);
  scene.add(lever);
  cylinder(0, 0.18, 0, 0.025, 0.4, m.steel, 0, 0, lever);
  box(0, 0.4, 0, 0.28, 0.08, 0.08, m.rubber, lever);
  const tray = new T.Group();
  tray.position.set(-0.4, 0.97, -19.8);
  scene.add(tray);
  box(0, 0, 0, 0.55, 0.04, 0.5, dark, tray);
  const lining = m.rubber.clone();
  lining.color.set(0x242a2b);
  lining.roughness = 1;
  lining.metalness = 0;
  lining.envMapIntensity = 0.1;
  box(0, 0.024, 0, 0.49, 0.009, 0.43, lining, tray);
  box(0, 0.03, 0.23, 0.56, 0.08, 0.025, dark, tray);
  const coin = new T.Group();
  coin.position.set(0, 0.044, 0);
  tray.add(coin);
  add(
    new T.CylinderGeometry(0.17, 0.17, 0.03, 96),
    m.gold,
    0,
    0,
    0,
    0,
    0,
    0,
    coin,
  );
  add(
    new T.TorusGeometry(0.15, 0.005, 8, 96),
    m.gold,
    0,
    0.02,
    0,
    0,
    0,
    0,
    coin,
  ).rotation.x = -Math.PI / 2;
  const symbol = new T.Shape();
  symbol.moveTo(-0.065, -0.09);
  symbol.lineTo(0.005, -0.09);
  symbol.bezierCurveTo(0.105, -0.09, 0.105, 0.005, 0.04, 0.006);
  symbol.bezierCurveTo(0.095, 0.015, 0.085, 0.09, 0.005, 0.09);
  symbol.lineTo(-0.065, 0.09);
  symbol.closePath();
  for (const y of [-0.048, 0.047]) {
    const hole = new T.Path();
    hole.absellipse(-0.002, y, 0.029, 0.022, 0, Math.PI * 2, true);
    symbol.holes.push(hole);
  }
  const reliefGold = m.gold.clone();
  reliefGold.roughnessMap = null;
  reliefGold.roughness = 0.42;
  reliefGold.color.set(0x997943);
  const relief = new T.Mesh(
    new T.ExtrudeGeometry(symbol, {
      depth: 0.009,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.002,
      bevelThickness: 0.002,
      curveSegments: 20,
    }),
    reliefGold,
  );
  relief.rotation.x = -Math.PI / 2;
  relief.position.y = 0.018;
  coin.add(relief);
  for (const x of [-0.035, -0.01])
    for (const z of [-0.096, 0.096])
      box(x, 0.029, z, 0.009, 0.009, 0.035, reliefGold, coin);
  for (let i = 0; i < 128; i++) {
    const a = (i * Math.PI) / 64;
    box(
      Math.cos(a) * 0.1695,
      0,
      Math.sin(a) * 0.1695,
      0.003,
      0.027,
      0.003,
      m.gold,
      coin,
    );
  }
  // Chair, clipboard, mug and console keys make human scale legible.
  buildChair(
    scene,
    m,
    layout.find((o) => o.kind === "chair"),
  );
  add(
    new T.CylinderGeometry(0.085, 0.077, 0.2, 32, 1, true),
    hardware.ceramic,
    0.55,
    1.05,
    -20,
  );
  add(new T.CircleGeometry(0.075, 32), dark, 0.55, 1.13, -20, -Math.PI / 2);
  add(
    new T.TorusGeometry(0.08, 0.006, 6, 32),
    hardware.ceramic,
    0.55,
    1.15,
    -20,
    -Math.PI / 2,
  );
  ring(0.65, 1.07, -20, 0.06, 0.014, hardware.ceramic);
  box(0.1, 0.95, -19.93, 0.32, 0.025, 0.43, yellow);
  sign(
    "BLOCK LOG\n000008 / VERIFIED",
    0.1,
    0.97,
    -19.93,
    0.27,
    0.33,
  ).rotation.x = -Math.PI / 2;
  for (let x = -1.2; x < -0.5; x += 0.06)
    for (let z = -19.6; z < -19.4; z += 0.06)
      add(
        geom(
          "keycap",
          () => new RoundedBoxGeometry(0.045, 0.025, 0.045, 1, 0.004),
        ),
        m.rubber,
        x,
        0.96,
        z,
      );
  const controlLamp = practical(0, 2.8, -19, 0xffdfaf, 0, 6);
  const controlFill = point(0, 1.7, -18.4, 0xe2d2b6, 0, 5);
  box(0, 3, -19, 1.5, 0.1, 0.2, amber);
  dressWorld(scene, m, { box, cylinder, ring, pipe, sign }, dark, yellow);
  // Batch world-space repetitions. Local rack detail is merged by transform below.
  scene.updateMatrixWorld(true);
  const local = [];
  scene.traverse((o) => {
    if (
      o.isMesh &&
      o.parent !== scene &&
      !fans.some((f) => o.parent === f.fan) &&
      ![...handles, lever, tray, coin, door].some((g) => {
        let p = o;
        while (p) {
          if (p === g) return true;
          p = p.parent;
        }
        return false;
      })
    )
      local.push(o);
  });
  for (const o of local) {
    const room =
      o.matrixWorld.elements[14] > 0
        ? 0
        : o.matrixWorld.elements[14] < -16
          ? 2
          : 1;
    const key = o.geometry.uuid + o.material.uuid + room;
    if (!batches.has(key))
      batches.set(key, {
        g: o.geometry,
        mat: o.material,
        room,
        transforms: [],
      });
    batches.get(key).transforms.push(o.matrixWorld.clone());
    o.removeFromParent();
  }
  for (const { g, mat, room, transforms } of batches.values()) {
    const animated = [...ledMaterials, amber, teal, red, doorStatus].includes(
      mat,
    );
    const roomMat = animated ? mat : mat.clone();
    roomMat.onBeforeCompile = mat.onBeforeCompile;
    const mesh = new T.InstancedMesh(g, roomMat, transforms.length);
    mesh.userData.room = room;
    transforms.forEach((t, i) => mesh.setMatrixAt(i, t));
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const blades = fans[0].fan.children.map((o) => {
    o.updateMatrix();
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrix);
    return g;
  });
  const fanGeometry = mergeGeometries(
    blades.map((g) => (g.index ? g.toNonIndexed() : g)),
  );
  const fanInstances = new T.InstancedMesh(
    fanGeometry,
    hardware.casting,
    fans.length,
  );
  fanInstances.instanceMatrix.setUsage(T.DynamicDrawUsage);
  fanInstances.castShadow = true;
  scene.add(fanInstances);
  fans.forEach(({ fan }, i) => {
    fan.clear();
    fanInstances.setMatrixAt(i, fan.matrixWorld);
  });
  blades.forEach((g) => g.dispose());
  return {
    dispose() {
      geometries.forEach((g) => g.dispose());
      bladeGeometry.dispose();
      Object.values(hardware).forEach((mat) => mat.dispose());
    },
    bankFills,
    beacons,
    red,
    controlFill,
    controlLamp,
    windowTime,
    fanInstances,
    fans,
    handles,
    lamps,
    lights,
    ledMaterials,
    door,
    doorStatus,
    lever,
    tray,
    coin,
    crt,
    board,
    floor,
    glass,
    amber,
    teal,
    sign,
    point,
  };
}
