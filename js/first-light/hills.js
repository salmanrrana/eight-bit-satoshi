import { SUN_AZIMUTH } from "./sky.js";
import { dressLandscape } from "./hills-landscape.js";
import { surface } from "./surfaces.js";
import { buildMeadow } from "./hills-meadow.js";
import { buildOak } from "./hills-oak.js";

// A fixed seed keeps the authored placements repeatable on reload.
export function random(seed = 9217) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// The walkable corridor is literally the simulation's height field. The extra
// relief begins outside the boundary stones with zero value and zero slope.
export function height(sim, x, z) {
  if (z > 30)
    return (
      sim.groundY(x, z) +
      smooth(30, 60, z) *
        (Math.sin(x * 0.017) * 1.3 + Math.sin(z * 0.027) * 0.8)
    );
  if (z > -158) return sim.groundY(x, z);
  const lateral = smooth(0, 65, Math.max(0, 13 - x, x - 27.4));
  const beyond = smooth(0, 70, -z - 301);
  const weight = Math.max(lateral, beyond) * smooth(0, 50, -z - 158);
  const ridge =
    Math.pow(
      1 -
        Math.sqrt(
          Math.sin(x * 0.017 + z * 0.009 + Math.sin(z * 0.006)) ** 2 + 0.035,
        ),
      2,
    ) * 23;
  const folds = Math.sin(x * 0.031 - z * 0.021) * 4 + Math.cos(z * 0.027) * 3;
  const gully = Math.pow(Math.abs(Math.sin(x * 0.043 + z * 0.014)), 12) * 3;
  const valley =
    Math.exp(-Math.pow((x - 88 - Math.sin(z * 0.013) * 22) / 24, 2)) * 13;
  const land =
    sim.groundY(x, z) +
    weight * (ridge + folds - gully - valley + beyond * 5) -
    beyond * Math.exp(-Math.pow((x - 20) / 130, 2)) * 14;
  const stream = 88 + Math.sin(z * 0.013) * 22;
  // A broad alluvial floor keeps the narrow stream above the coarse distant
  // terrain triangles. The fade is wholly outside the collision corridor.
  const channel =
    Math.exp(-Math.pow(Math.max(0, Math.abs(x - stream) - 14) / 18, 2)) *
    smooth(0, 15, Math.max(0, 13 - x, x - 27.4)) *
    smooth(0, 50, -z - 158);
  return land * (1 - channel) + (-1 + (-z - 160) * 0.008) * channel;
}

const fieldNoise = `
float hhash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float hnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hhash(i),hhash(i+vec2(1,0)),f.x),mix(hhash(i+vec2(0,1)),hhash(i+vec2(1)),f.x),f.y);}
`;

function groundMaterial(kit, sun) {
  const m = surface(kit, "soil", { scale: 2.3, weather: false });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (s, renderer) => {
    base.call(m, s, renderer);
    s.uniforms.hillsSun = sun;
    s.uniforms.hillsHaze = kit.uniforms.skyAmbient;
    s.vertexShader =
      "attribute float horizon; varying float hillsHorizon; varying vec3 hillsGround;\n" +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nhillsGround=(modelMatrix*vec4(position,1.)).xyz;hillsHorizon=horizon;",
    );
    s.fragmentShader =
      "uniform vec3 hillsSun, hillsHaze; varying float hillsHorizon; varying vec3 hillsGround;\n" +
      fieldNoise +
      s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `
#include <roughnessmap_fragment>
vec2 hp=hillsGround.xz;
float pixel=max(length(dFdx(hp)),length(dFdy(hp)));
float microFade=1.-smoothstep(.012,.07,pixel);
float broad=hnoise(hp*.12), tufts=mix(.5,hnoise(hp*2.8),1.-smoothstep(.15,.8,pixel));
float grain=mix(.5,hnoise(hp*51.),microFade);
float centre=20.+sin(hp.y*.079)*.26+sin(hp.y*.19)*.12;
float path=1.-smoothstep(.65,1.25+tufts*.35,abs(hp.x-centre));
path*=1.-(1.-smoothstep(.13,.34,abs(hp.x-centre)))*.85;
// A dirt farm lane connects the western fields and the nearest farmhouse.
float farmLane=1.-smoothstep(.9,1.6+pixel,abs(hp.x+83.-sin((hp.y+318.)*.018)*7.));
farmLane*=smoothstep(-650.,-620.,hp.y)*(1.-smoothstep(-180.,-160.,hp.y));
path=max(path,farmLane);
float verge=1.-smoothstep(1.15,2.4,abs(hp.x-centre));
float mud=1.-smoothstep(158.,174.,-hp.y);
vec3 meadow=mix(vec3(.15,.24,.045),vec3(.30,.33,.10),broad);
float field=hhash(floor((hp+vec2(sin(hp.y*.006)*15.,sin(hp.x*.01)*12.))/vec2(52.,68.)));
float outside=smoothstep(9.,35.,abs(hp.x-20.));
meadow=mix(meadow,mix(vec3(.14,.20,.05),vec3(.26,.24,.11),field),outside*.65);
float furrow=.5+.5*sin(hp.x*2.7+sin(hp.y*.025)*.3)*exp(-pixel*pixel*12.);
meadow=mix(meadow,vec3(.14,.095,.052)*(.85+furrow*.22),smoothstep(.74,.84,field)*outside*.8);
meadow*=.73+.38*tufts+.13*grain;
vec3 earth=mix(vec3(.105,.071,.037),vec3(.28,.21,.12),broad*.65+grain*.35);
earth*=.78+.4*tufts;
// Keep the library's soil microstructure underneath the worn trail.
earth=mix(earth,diffuseColor.rgb,.23);
vec3 turf=mix(meadow,meadow*vec3(.92,.88,.72),verge*.3);
diffuseColor.rgb=mix(turf,earth,path);
float slope=1.-abs(normalize(cross(dFdx(hillsGround),dFdy(hillsGround))).y);
float outcrop=smoothstep(.08,.24,slope)*(1.-path);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.19,.18,.145)*(.65+tufts*.5),outcrop);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.075,.060,.034)*(.8+.3*grain),mud*.78);
float rut=(1.-smoothstep(.05,.12,abs(abs(hp.x-centre)-.49)))*path;
float puddle=rut*smoothstep(.62,.78,hnoise(hp*vec2(3.,.7)));
roughnessFactor=mix(.91,.55,puddle);
diffuseColor.rgb*=1.-puddle*.25;
`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <clearcoat_normal_fragment_begin>",
      `
float hdetail=-rut*.035+hnoise(hillsGround.xz*4.)*.16*(1.-smoothstep(.1,.6,pixel))+hnoise(hillsGround.xz*63.)*.012*microFade;
float bladeDetail=sin(hillsGround.x*170.+sin(hillsGround.z*27.)*2.)*.002*microFade;
hdetail+=bladeDetail*(1.-path);
normal=normalize(mix(nonPerturbedNormal,normal,(.12+path*.4)*(1.-puddle))+vec3(-dFdx(hdetail),dFdy(hdetail),0.)*.09);
#include <clearcoat_normal_fragment_begin>
`,
    );
  };
  const terrainCompile = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    terrainCompile(s, r);
    s.fragmentShader = s.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
float distantAir=1.-exp(-max(0.,distance(cameraPosition,hillsGround)-600.)*.0018);
outgoingLight=mix(outgoingLight,hillsHaze*.7,distantAir);
#include <opaque_fragment>`,
    );
  };
  const compile = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    compile(s, r);
    s.fragmentShader = s.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
float horizonLight=smoothstep(hillsHorizon-.018,hillsHorizon+.018,atan(hillsSun.y,length(hillsSun.xz)));
float horizonWeight=smoothstep(28.,65.,distance(cameraPosition,hillsGround));
reflectedLight.directDiffuse*=mix(1.,horizonLight,horizonWeight);
reflectedLight.directSpecular*=mix(1.,horizonLight,horizonWeight);
// Soft grazing retroreflection of the turf, driven only by incident sunlight.
#if NUM_DIR_LIGHTS > 0
float velvet=pow(1.-abs(dot(normal,normalize(vViewPosition))),3.);
reflectedLight.directDiffuse*=1.+velvet*.45*(1.-path);
#endif`,
    );
  };
  const key = m.customProgramCacheKey();
  m.customProgramCacheKey = () => key + "-hills-ground-v4";
  return m;
}

function terrain(T, sim, material, x0, x1, z0, z1, nx, nz) {
  const g = new T.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position;
  const horizons = new Float32Array(p.count);
  const n = g.attributes.normal,
    normal = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const z = p.getZ(i);
    if (x0 === -100 && x1 === 140) {
      const column = i % (nx + 1),
        side = nx * 0.3,
        middle = nx * 0.4;
      x =
        column <= side
          ? -100 + (column / side) * 112
          : column <= side + middle
            ? 12 + ((column - side) / middle) * 16
            : 28 + ((column - side - middle) / side) * 112;
    }
    const y = height(sim, x, z);
    const dx =
      x0 === -100 && x1 === 140 && x >= 12 && x <= 28
        ? 16 / (nx * 0.4)
        : (x1 - x0) / nx;
    const dz = (z1 - z0) / nz;
    p.setXYZ(i, x, y, z);
    let horizon = -0.1;
    for (let step = 3; step < 450; step *= 1.5)
      horizon = Math.max(
        horizon,
        Math.atan2(
          height(sim, x + step * SUN_AZIMUTH[0], z + step * SUN_AZIMUTH[1]) - y,
          step,
        ),
      );
    horizons[i] = horizon;
    normal
      .set(
        -(height(sim, x + dx / 2, z) - height(sim, x - dx / 2, z)) / dx,
        1,
        -(height(sim, x, z + dz / 2) - height(sim, x, z - dz / 2)) / dz,
      )
      .normalize();
    n.setXYZ(i, normal.x, normal.y, normal.z);
  }
  g.setAttribute("horizon", new T.BufferAttribute(horizons, 1));
  // Duplicate the perimeter below the sheet; preserve the shared surface row.
  const edge = [];
  for (let i = 0; i <= nx; i++) edge.push(i);
  for (let j = 1; j <= nz; j++) edge.push(j * (nx + 1) + nx);
  for (let i = nx - 1; i >= 0; i--) edge.push(nz * (nx + 1) + i);
  for (let j = nz - 1; j > 0; j--) edge.push(j * (nx + 1));
  const positions = [...p.array],
    normals = [...n.array],
    hs = [...horizons];
  const uv = [...g.attributes.uv.array],
    indices = [...g.index.array];
  edge.forEach((v, k) => {
    positions.push(p.getX(v), p.getY(v) - 30, p.getZ(v));
    normals.push(n.getX(v), n.getY(v), n.getZ(v));
    hs.push(horizons[v]);
    uv.push(0, 0);
    const next = (k + 1) % edge.length;
    indices.push(
      v,
      p.count + k,
      edge[next],
      edge[next],
      p.count + k,
      p.count + next,
    );
  });
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setAttribute("horizon", new T.Float32BufferAttribute(hs, 1));
  g.setIndex(indices);
  const mesh = new T.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}

// Seven seeded split-stone shapes: chamfered planes and nonrectangular
// outlines. Normalize bounds after deformation so every course fits its solid.
export function stoneGeometry(T, low = false, variant = 0) {
  const g = new T.BoxGeometry(2, 2, 2, low ? 1 : 2, 1, 1),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const r =
      1 +
      0.035 * Math.sin(x * 7 + y * 9 + z * 5 + variant * 2.7) +
      0.015 * Math.sin(x * 13 - z * 11 + variant);
    // A superellipsoid fills a course like a split fieldstone rather than a
    // round cobble, while retaining seven different broken silhouettes.
    const fullness = Math.pow(
      Math.abs(x) ** 8 + Math.abs(y) ** 8 + Math.abs(z) ** 8,
      1 / 8,
    );
    p.setXYZ(i, (x * r) / fullness, (y * r) / fullness, (z * r) / fullness);
  }
  g.computeBoundingBox();
  const b = g.boundingBox,
    size = b.getSize(new T.Vector3());
  g.translate(...b.getCenter(new T.Vector3()).negate().toArray());
  g.scale(1 / size.x, 1 / size.y, 1 / size.z);
  // Keep split faces broad enough to cover the earth heart after laying tilt.
  // This is another superellipsoid power transform, with exponent 8 / .65.
  for (let i = 0; i < p.count; i++) {
    const face = [p.getX(i), p.getY(i), p.getZ(i)].map(
      (v) => Math.sign(v) * Math.pow(Math.abs(v) * 2, 0.65) * 0.5,
    );
    p.setXYZ(i, ...face);
  }
  // Analytic superellipsoid normals are continuous at duplicated UV vertices.
  const n = g.attributes.normal,
    normal = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    normal
      .set(
        ...[p.getX(i), p.getY(i), p.getZ(i)].map(
          (v) =>
            (Math.sign(v) * Math.pow(Math.abs(v / 0.5), 8 / 0.65 - 1)) / 0.5,
        ),
      )
      .normalize();
    n.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return g;
}

function walls(ctx) {
  const { T, sim, kit, zoneGroup, quality } = ctx,
    rng = random(36);
  const material = surface(kit, "rock", { scale: 0.72, tint: 0xffffff });
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (s, r) => {
    base.call(material, s, r);
    s.fragmentShader = fieldNoise + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
vec3 wallNormal=normalize(flSurfaceNormal);
float crust=smoothstep(.56,.74,hnoise(flSurfaceWorld.xz*7.+flSurfaceWorld.y));
float north=clamp(-wallNormal.z*.5+.5,0.,1.);
float moss=crust*(max(0.,wallNormal.y)*.65+north*.35);
// Pale limestone retains the shared rock's fissures and relief.
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.37,.38,.34)*(.85+hnoise(flSurfaceWorld.xy*23.)*.3),.68);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.075,.105,.032),moss);`,
    );
  };
  material.customProgramCacheKey = () => "hills-limestone-2";
  const variants = Array.from({ length: 7 }, (_, i) =>
    stoneGeometry(T, quality === "low", i),
  );
  const coreMaterial = kit.material({ color: 0x302b20, roughness: 1 });
  const coreGeo = new T.BoxGeometry(1, 1, 1),
    dummy = new T.Object3D(),
    rotation = new T.Matrix4(),
    colour = new T.Color(),
    built = [];
  for (const zone of [4, 5, 6]) {
    const boxes = sim.layout.filter(
      (b) => b.kind === "wall" && b.zone === zone && b.owner !== "story",
    );
    const batches = Array.from({ length: 7 }, () => []),
      cores = [],
      caps = [];
    for (const b of boxes) {
      const along = b.max[2] - b.min[2] > b.max[0] - b.min[0] ? 2 : 0,
        across = along === 2 ? 0 : 2;
      const len = b.max[along] - b.min[along],
        top = b.max[1],
        bottom = b.min[1];
      const centre = b.min.map((v, i) => (v + b.max[i]) / 2),
        thickness = b.max[across] - b.min[across];
      const coreSize = b.min.map((v, i) => b.max[i] - v);
      coreSize[across] *= 0.8;
      coreSize[1] -= 0.32;
      const coreCentre = [...centre];
      coreCentre[1] -= 0.08; // The heart stops below the leaning cope stones.
      cores.push({ p: coreCentre, size: coreSize, rot: 0, shade: 1 });
      let y = bottom;
      while (y < top - 0.24) {
        const row = Math.min(0.11 + rng() * 0.08, top - 0.24 - y);
        let at = 0;
        while (at < len - 0.01) {
          const length = Math.min(len - at, 0.3 + rng() * 0.4),
            p = [...centre],
            size = [0, row * 0.98, 0];
          p[along] = b.min[along] + at + length / 2;
          p[1] = y + row / 2 + (rng() - 0.5) * 0.035;
          p[across] += (rng() - 0.5) * thickness * 0.09;
          // Occasional deep bond stones span the course joint.
          if (rng() < 0.28 && y + row * 2 < top - 0.24) size[1] *= 1.7;
          size[along] = length * 0.98;
          size[across] = thickness * (0.96 + rng() * 0.04);
          if (p[1] + row / 2 > sim.groundY(p[0], p[2]) - 0.08)
            batches[Math.floor(rng() * 7)].push({
              p,
              size,
              rot: (rng() - 0.5) * 0.12,
              tilt: (rng() - 0.5) * 0.21,
              shade: 0.85 + rng() * 0.3,
            });
          at += length;
        }
        y += row;
      }
      // Closely spaced, upright cope stones close the full authoritative top.
      const n = Math.ceil(len / 0.27);
      for (let i = 0; i < n; i++) {
        const p = [...centre],
          size = [0, 0.23 + rng() * 0.07, 0];
        p[along] = b.min[along] + ((i + 0.5) * len) / n;
        p[1] = top - size[1] / 2;
        size[along] = (len / n) * 1.12;
        size[across] = thickness * (0.8 + rng() * 0.18);
        caps.push({
          p,
          size,
          rot: (rng() - 0.5) * 0.16,
          tilt: (0.17 + rng() * 0.26) * (rng() > 0.5 ? 1 : -1),
          shade: 0.8 + rng() * 0.3,
        });
      }
      // Pinning stones fill face gaps without protruding beyond the collision box.
      for (let i = 0; i < 2; i++) {
        const p = [...centre],
          size = [0.11, 0.075, 0.11];
        p[along] = b.min[along] + len * (0.2 + i * 0.53);
        p[1] = top - 0.46 - i * 0.37;
        p[across] += thickness * 0.32 * (i % 2 ? 1 : -1);
        size[along] = 0.16;
        batches[(i + 3) % 7].push({ p, size, rot: 0, shade: 0.75 });
      }
    }
    function batch(items, geo, mat, casts = geo === coreGeo) {
      const mesh = new T.InstancedMesh(geo, mat, items.length);
      items.forEach((s, i) => {
        dummy.position.set(...s.p);
        dummy.rotation.set(s.tilt || 0, s.rot, (s.tilt || 0) * 0.35);
        // Fit the tilted stone inside its assigned footprint, not just its yaw.
        const e = rotation.makeRotationFromEuler(dummy.rotation).elements;
        const extentX =
          Math.abs(e[0]) * s.size[0] +
          Math.abs(e[4]) * s.size[1] +
          Math.abs(e[8]) * s.size[2];
        const extentZ =
          Math.abs(e[2]) * s.size[0] +
          Math.abs(e[6]) * s.size[1] +
          Math.abs(e[10]) * s.size[2];
        const fit = Math.min(s.size[0] / extentX, s.size[2] / extentZ);
        dummy.scale.set(s.size[0] * fit, s.size[1] * fit, s.size[2] * fit);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        colour.setRGB(s.shade, s.shade, s.shade);
        mesh.setColorAt(i, colour);
      });
      mesh.userData.noReflect = !casts;
      mesh.castShadow = casts;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      zoneGroup(zone).add(mesh);
      built.push({ zone, mesh });
    }
    batch(cores, coreGeo, coreMaterial);
    batch(caps, variants[0], material, true);
    batches.forEach((items, i) => batch(items, variants[i], material));
  }
  return built;
}

// A weathered stile on the far side of the west boundary, entirely outside
// the reachable corridor; the authoritative wall remains intact beneath it.
function stile({ T, sim, kit, zoneGroup }) {
  const wood = surface(kit, "wood", { scale: 0.6, tint: 0xa9ac8c });
  const y = height(sim, 12.1, -238),
    group = new T.Group();
  for (const z of [-238.65, -237.35]) {
    const post = kit.box(0.13, 1.85, 0.14, wood, 0.018);
    post.position.set(12.45, y + 0.88, z);
    post.rotation.z = 0.04;
    group.add(post);
  }
  for (const [x, dy] of [
    [11.7, 0.25],
    [12.15, 0.53],
    [12.55, 0.82],
  ]) {
    const step = kit.box(0.48, 0.1, 1.38, wood, 0.018);
    step.position.set(x, y + dy, -238);
    group.add(step);
  }
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  zoneGroup(5).add(group);
}

function backdrop(ctx, material) {
  const { T, scene, sim, kit, quality } = ctx,
    group = new T.Group();
  group.name = "HILLS distant land and retreating city";
  for (const [x0, x1, z0, z1, nx, nz] of [
    [-900, -100, -1100, -158, 90, 100],
    [140, 940, -1100, -158, 90, 100],
    [-100, 140, -1100, -320, 35, 100],
    [-1800, 1800, -1700, -1090, 120, 25],
    [-2600, 2600, -2400, -1690, 120, 22],
  ])
    group.add(
      terrain(
        T,
        sim,
        material,
        x0,
        x1,
        z0,
        z1,
        quality === "low" ? Math.ceil(nx * 0.6) : nx,
        quality === "low" ? Math.ceil(nz * 0.6) : nz,
      ),
    );
  group.add(terrain(T, sim, material, -280, 280, -111, 270, 60, 36));
  const rng = random(183),
    matrix = new T.Object3D(),
    colour = new T.Color();
  const blocks = [],
    windows = [];
  for (let i = 0; i < 420; i++) {
    const depth = i % 3;
    const x = -330 - depth * 100 + rng() * (660 + depth * 200),
      z =
        i < 180
          ? -1050 - depth * 250 - rng() * 100
          : 75 + depth * 150 + rng() * 95;
    const w = 3 + rng() * 11,
      d = 4 + rng() * 10,
      h = 5 + Math.pow(rng(), 3) * 29 + (i % 53 === 0 ? 12 : 0);
    blocks.push({ x, z, w, d, h, base: 0 });
    if (rng() > 0.4)
      blocks.push({
        x: x + (rng() - 0.5) * w * 0.2,
        z,
        w: w * 0.64,
        d: d * 0.68,
        h: 1.1 + rng() * 2.4,
        base: h,
      });
    if (rng() > 0.75)
      blocks.push({
        x: x - w * 0.25,
        z: z + d * 0.2,
        w: 0.65,
        d: 0.7,
        h: 2 + rng() * 2,
        base: h,
      });
    for (let k = 0; k < 5; k++)
      if (rng() > 0.38)
        windows.push([
          x + (rng() - 0.5) * w * 0.8,
          2 + rng() * (h - 3),
          z - d / 2 - 0.02,
        ]);
  }
  const cityMaterial = surface(kit, "concrete", { scale: 4, tint: 0x88929c });
  const cityHaze = { value: new T.Color(0.1, 0.13, 0.2) };
  group.userData.cityHaze = cityHaze;
  const cityCompile = cityMaterial.onBeforeCompile;
  cityMaterial.onBeforeCompile = (s, r) => {
    cityCompile.call(cityMaterial, s, r);
    s.uniforms.cityHaze = cityHaze;
    s.fragmentShader = "uniform vec3 cityHaze;\n" + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
// Continue atmospheric extinction beyond the shared fog pass's 180m march.
float cityDistance=max(0.,distance(cameraPosition,flSurfaceWorld)-180.);
float cityAir=1.-exp(-cityDistance*.0035*exp(-max(0.,flSurfaceWorld.y)*.018));
outgoingLight=mix(outgoingLight,cityHaze,cityAir);
#include <opaque_fragment>`,
    );
  };
  cityMaterial.customProgramCacheKey = () => "hills-city-distance-haze";
  const city = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1),
    cityMaterial,
    blocks.length,
  );
  blocks.forEach((b, i) => {
    matrix.position.set(b.x, b.base + b.h / 2 + height(sim, b.x, b.z), b.z);
    matrix.scale.set(b.w, b.h, b.d);
    matrix.updateMatrix();
    city.setMatrixAt(i, matrix.matrix);
    const shade = 0.62 + rng() * 0.3;
    colour.setRGB(shade * 0.75, shade * 0.86, shade);
    city.setColorAt(i, colour);
  });
  const lights = new T.InstancedMesh(
    new T.PlaneGeometry(0.5, 0.8),
    kit.material({
      color: 0x665d39,
      emissive: 0xeeb970,
      emissiveIntensity: 1.1,
    }),
    windows.length,
  );
  windows.forEach((p, i) => {
    matrix.position.set(p[0], p[1] + height(sim, p[0], p[2]), p[2]);
    matrix.scale.set(1, 1, 1);
    matrix.rotation.y = Math.PI;
    matrix.updateMatrix();
    lights.setMatrixAt(i, matrix.matrix);
  });
  lights.userData.noReflect = true;
  const beaconMaterial = kit.material({
    color: 0x7b2015,
    emissive: 0xaa1809,
    emissiveIntensity: 0.6,
  });
  const beacons = new T.InstancedMesh(
    new T.SphereGeometry(0.32, 5, 3),
    beaconMaterial,
    2,
  );
  [blocks[0], blocks[Math.floor(blocks.length * 0.6)]].forEach((b, i) => {
    matrix.position.set(b.x, b.base + b.h + 0.4 + height(sim, b.x, b.z), b.z);
    matrix.scale.setScalar(1);
    matrix.updateMatrix();
    beacons.setMatrixAt(i, matrix.matrix);
  });
  beacons.userData.noReflect = true;
  group.userData.beaconMaterial = beaconMaterial;
  group.add(city, lights, beacons);
  dressLandscape(ctx, group);
  scene.add(group);
  return group;
}

export async function build(ctx) {
  const { T, sim, kit, zoneGroup, scene, quality } = ctx;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sun = { value: new T.Vector3(SUN_AZIMUTH[0], 0, SUN_AZIMUTH[1]) };
  const ground = groundMaterial(kit, sun);
  const distantCopies = new T.Group(),
    continuations = [];
  distantCopies.name = "HILLS culled-zone land and wall continuation";
  scene.add(distantCopies);
  for (const [zone, z0, z1] of [
    [4, -210, -160],
    [5, -250, -210],
    [6, -320, -250],
  ]) {
    const mesh = terrain(
      T,
      sim,
      ground,
      -100,
      140,
      z0,
      z1,
      quality === "low" ? 100 : 160,
      Math.max(2, Math.ceil((z1 - z0) * (quality === "low" ? 1 : 1.5))),
    );
    zoneGroup(zone).add(mesh);
    const copy = mesh.clone();
    distantCopies.add(copy);
    continuations.push({ zone, copy });
  }
  const stone = stoneGeometry(T, quality === "low");
  const wallMeshes = walls(ctx);
  for (const { zone, mesh } of wallMeshes) {
    const copy = mesh.clone();
    copy.castShadow = false;
    distantCopies.add(copy);
    continuations.push({ zone, copy });
  }
  stile(ctx);
  const far = backdrop(ctx, ground);
  const meadow = buildMeadow(ctx, stone);
  await ctx.progress("Growing the summit oak…");
  const oak = buildOak(ctx);
  const distantOak = oak.tree.clone(true);
  distantOak.name = "HILLS oak silhouette beyond culled summit";
  distantOak.traverse((o) => {
    o.castShadow = false;
  });
  scene.add(distantOak);
  return {
    update(frame) {
      sun.value.copy(frame.env.sunDir);
      far.userData.cityHaze.value.copy(frame.env.fog);
      far.visible = frame.snapshot.zone >= 2;
      far.userData.beaconMaterial.emissiveIntensity =
        0.45 + (reduced ? 0 : 0.2 * Math.sin(frame.time * 0.65));
      distantOak.visible = frame.snapshot.zone >= 3 && frame.snapshot.zone <= 4;
      distantCopies.visible = frame.snapshot.zone >= 2;
      continuations.forEach(({ zone, copy }) => {
        copy.visible = Math.abs(zone - frame.snapshot.zone) > 1;
      });
      meadow.update(frame);
      oak.update(frame);
    },
    dispose() {
      meadow.dispose();
      oak.dispose();
      wallMeshes.forEach(({ mesh }) => mesh.dispose());
      new Set(wallMeshes.map(({ mesh }) => mesh.geometry)).forEach((g) =>
        g.dispose(),
      );
      for (const group of [far, distantCopies, distantOak])
        group.traverse((o) => {
          if (o.isInstancedMesh) o.dispose();
        });
      far.traverse((o) => o.geometry?.dispose());
      far.userData.foliageTextures.forEach((texture) => texture.dispose());
      scene.remove(far, distantCopies, distantOak);
      stone.dispose();
    },
  };
}
