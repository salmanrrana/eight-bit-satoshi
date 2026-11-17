import { MEADOW_COLOURS } from "./flora-field.js";

// Camera-centred instance IDs wrap over a fixed world grid. No buffers move or
// allocate while playing, and the identity of every surviving blade is stable.
export const GRASS_TIERS = {
  low: {
    cell: 0.28,
    span: 56,
    blades: 3,
    segments: 2,
    farCell: 1.0,
    farSpan: 84,
  },
  high: {
    cell: 0.18,
    span: 104,
    blades: 4,
    segments: 2,
    farCell: 0.44,
    farSpan: 164,
  },
  ultra: {
    cell: 0.14,
    span: 160,
    blades: 5,
    segments: 3,
    farCell: 0.44,
    farSpan: 192,
  },
};
export function buildGrass({ T, kit, scene, quality }, field, motion) {
  const tier = GRASS_TIERS[quality] ?? GRASS_TIERS.low;
  const group = new T.Group();
  group.name = "HASH WARS meadow";
  scene.add(group);
  const meshes = [];
  const nearOuter = Math.min(15, (tier.cell * tier.span) / 2 - 0.6);
  const nearInner = nearOuter - 3;
  // On high, the far grid covers the full horizontal field of view to 41 m,
  // with fewer unused cells behind the eye. Cell hashes remain world anchored.
  const farOuter =
    quality === "high"
      ? 41
      : Math.min(41, (tier.farCell * tier.farSpan) / 2 - 0.6);
  const forward = new T.Vector3();
  const frustum = new T.Frustum(),
    projection = new T.Matrix4(),
    box = new T.Box3();
  // Conservative height ranges for field tiles. Each query includes every
  // possible jittered root and bilinear texel; blades/wind expand its box.
  const image = field.texture.image,
    bounds = field.bounds,
    tileSize = 8;
  const columns = Math.ceil(bounds.z / tileSize),
    rows = Math.ceil(bounds.w / tileSize);
  const minima = new Float32Array(columns * rows).fill(Infinity);
  const maxima = new Float32Array(columns * rows).fill(-Infinity);
  for (let j = 0; j < image.height; j++)
    for (let i = 0; i < image.width; i++) {
      const x = Math.min(
        columns - 1,
        Math.floor((((i + 0.5) / image.width) * bounds.z) / tileSize),
      );
      const z = Math.min(
        rows - 1,
        Math.floor((((j + 0.5) / image.height) * bounds.w) / tileSize),
      );
      const k = z * columns + x,
        y = image.data[(j * image.width + i) * 4];
      minima[k] = Math.min(minima[k], y);
      maxima[k] = Math.max(maxima[k], y);
    }
  const uniforms = {
    floraForward: { value: new T.Vector2(0, -1) },
    floraField: { value: field.texture },
    floraNoise: { value: kit.noiseMap },
    floraBounds: { value: field.bounds },
    ...motion,
    floraPixel: { value: 0.0016 },
    floraLush: { value: new T.Color(...MEADOW_COLOURS.lush) },
    floraPale: { value: new T.Color(...MEADOW_COLOURS.pale) },
    floraDry: { value: new T.Color(...MEADOW_COLOURS.dry) },
  };
  for (const far of [false, true]) {
    const cell = far ? tier.farCell : tier.cell;
    const span = far ? tier.farSpan : tier.span;
    const count = span * span;
    const geometry = new T.InstancedBufferGeometry();
    const p = [],
      index = [];
    if (far) {
      // Six independently seeded short leaves: no shared comb/fan silhouette.
      for (let b = 0; b < 6; b++) {
        const k = p.length / 3;
        p.push(-0.055, 0, 0, 0.055, 0, 0, 0, 0.62 + b * 0.063, 0.12);
        index.push(k, k + 1, k + 2);
      }
    } else {
      // Two-sided curved ribbon, tapered to a point; 2/3/5 triangles by tier.
      const levels =
        tier.segments === 5
          ? [0, 0.38, 0.73]
          : tier.segments === 3
            ? [0, 0.58]
            : [0];
      if (tier.segments === 2) {
        p.push(0, 0, 0, -0.5, 0.5, 0.08, 0.5, 0.5, 0.08, 0, 1, 0.28);
        index.push(0, 1, 2, 1, 3, 2); // Low uses the same thin silhouette with two faces.
      } else {
        for (const y of levels)
          p.push(
            -0.5 * (1 - y),
            y,
            y * y * 0.28,
            0.5 * (1 - y),
            y,
            y * y * 0.28,
          );
        for (let i = 0; i < levels.length - 1; i++)
          index.push(
            i * 2,
            i * 2 + 1,
            i * 2 + 2,
            i * 2 + 1,
            i * 2 + 3,
            i * 2 + 2,
          );
        const k = p.length / 3;
        p.push(0, 1, 0.28);
        index.push(k - 2, k - 1, k);
      }
    }
    // One instance is a whole tuft. Its blades retain stable individual hashes,
    // but share one instance cell instead of repeating instance storage per leaf.
    const bladeIds = Array.from({ length: p.length / 3 }, (_, i) =>
      far ? Math.floor(i / 3) : 0,
    );
    if (!far) {
      const bladePositions = [...p],
        bladeIndices = [...index],
        vertices = p.length / 3;
      for (let b = 1; b < tier.blades; b++) {
        p.push(...bladePositions);
        index.push(...bladeIndices.map((i) => i + b * vertices));
        bladeIds.push(...new Array(vertices).fill(b));
      }
    }
    geometry.setAttribute(
      "floraBlade",
      new T.Float32BufferAttribute(bladeIds, 1),
    );
    geometry.userData.bladesPerClump = far ? 6 : tier.blades;
    geometry.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    geometry.setAttribute(
      "normal",
      new T.Float32BufferAttribute(
        p.map((_, i) => (i % 3 === 1 ? 1 : 0)),
        3,
      ),
    );
    geometry.setIndex(index);
    const cells = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const c = i;
      cells.set([c % span, Math.floor(c / span), 0], i * 3);
    }
    geometry.setAttribute(
      "floraCell",
      new T.InstancedBufferAttribute(cells, 3),
    );
    geometry.instanceCount = count;
    const material = kit.material({
      color: 0xffffff,
      roughness: 0.72,
      side: T.DoubleSide,
    });
    const base = material.onBeforeCompile;
    material.onBeforeCompile = (s, r) => {
      base.call(material, s, r);
      Object.assign(s.uniforms, uniforms);
      s.vertexShader =
        `attribute vec3 floraCell; attribute float floraBlade;
uniform sampler2D floraField; uniform highp sampler3D floraNoise; uniform vec4 floraBounds;
uniform vec3 floraEye; uniform vec2 floraForward; uniform float floraTime,floraWind,floraPixel;
varying vec3 floraWorld; varying vec4 floraInfo;
float fh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float fn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture(floraNoise,vec3((i+f+.5)/64.,.5/64.)).r;}
` + s.vertexShader;
      s.vertexShader = s.vertexShader.replace(
        "#include <beginnormal_vertex>",
        `
vec2 gridEye=floraEye.xz+floraForward*${far && quality === "high" ? "5.4" : "0."};
vec2 grid=mod(floraCell.xy-floor(gridEye/${cell.toFixed(5)}),${span.toFixed(1)})+floor(gridEye/${cell.toFixed(5)})-${Math.floor(span / 2).toFixed(1)};
float seed=fh(grid+floraBlade*31.7);
vec2 xz=(grid+vec2(fh(grid+floraBlade*13.7),fh(grid+41.+floraBlade*8.1)))*${cell.toFixed(5)};
vec2 clump=floor(xz/.47); float tuft=fh(clump+17.3);
vec2 centre=(clump+.5+(vec2(fh(clump+3.1),fh(clump+9.7))-.5)*.8)*.47;
xz=mix(xz,centre,.46*fh(grid+floraBlade*5.));
vec4 land=texture2D(floraField,(xz-floraBounds.xy)/floraBounds.zw);
vec3 root=vec3(xz.x,land.x-.018,xz.y);
float reach=length(root.xz-floraEye.xz);
float growthPatch=fn(xz*.28+fn(xz*.08)*2.);
float bare=mix(.87,1.,smoothstep(.18,.48,growthPatch));
float ring=${far ? `smoothstep(${nearInner.toFixed(2)},${nearOuter.toFixed(2)},reach)*(1.-smoothstep(35.,${farOuter.toFixed(2)},reach))` : `1.-smoothstep(${nearInner.toFixed(2)},${nearOuter.toFixed(2)},reach)`};
float inside=step(floraBounds.x,xz.x)*step(floraBounds.y,xz.y)*step(xz.x,floraBounds.x+floraBounds.z)*step(xz.y,floraBounds.y+floraBounds.w);
float growth=step(.06,land.y)*step(fh(grid+63.7+floraBlade*9.1),bare)*inside;
float bladeHeight=(.19+seed*.26)*(.7+tuft*.65)*mix(.4,1.,land.y)*ring*growth;
float angle=(fh(clump+29.)+(seed-.5)*.8)*6.2831853;
vec2 direction=vec2(cos(angle),sin(angle));
vec2 facing=vec2(cos(seed*25.),sin(seed*25.));
vec2 toEye=normalize(floraEye.xz-root.xz+vec2(.001));vec2 cameraRight=vec2(toEye.y,-toEye.x);
// Continuous view assist: no orientation flip as the eye passes a blade.
facing=normalize(facing+cameraRight*dot(facing,cameraRight)*.45);
float width=${far ? "(.38+seed*.15)" : "(.016+seed*.018)"};
width=max(width,reach*floraPixel*${far ? "7." : ".42"});
vec3 ground=normalize(vec3(-land.z,1.,-land.w));
vec3 across=vec3(facing.x,0.,facing.y),faceN=vec3(-facing.y,0.,facing.x);
vec3 objectNormal=${far ? "ground" : "normalize(mix(normalize(ground+faceN*.62+across*position.x*.8),ground,smoothstep(7.,35.,reach)*.85))"};
vec3 objectTangent=vec3(1.,0.,0.);
`,
      );
      s.vertexShader = s.vertexShader.replace(
        "#include <begin_vertex>",
        `
float gust=fn(xz*.07-vec2(floraTime*.11,floraTime*.045));
float wave=sin(dot(xz,vec2(.39,.23))-floraTime*1.8+tuft*.6);
float windAngle=.5+(tuft-.5)*.8;
vec2 lean=direction*(.1+tuft*.22)+vec2(cos(windAngle),sin(windAngle))*(gust*.6+wave*.15)*floraWind;
// Pixel protection widens each distant blade, not the whole clump spread.
float fan=0.;
float bladeAcross=${far ? "fan*.35+(position.x-fan)*width*(1.-step(.7,position.y))+fan*position.y*.5" : "position.x*width"};
vec3 transformed=root+vec3(facing.x*bladeAcross,position.y*bladeHeight,facing.y*bladeAcross);
transformed.xz+=(lean*position.y*position.y+direction*position.z)*bladeHeight;
floraWorld=transformed;floraInfo=vec4(position.y,growthPatch,seed,tuft);
`,
      );
      s.vertexShader = s.vertexShader.replace(
        "#include <shadowmap_vertex>",
        T.ShaderChunk.shadowmap_vertex.replaceAll(
          "worldPosition",
          // Roots are buried to avoid floating blades. Sample just above the
          // soil so the shadow proxy cannot turn an entire clump black.
          "vec4(root+ground*.09,1.)",
        ),
      );
      s.fragmentShader =
        `varying vec3 floraWorld; varying vec4 floraInfo;
uniform vec3 floraEye,floraSun,floraLush,floraPale,floraDry;
uniform float floraTime,floraCloud; uniform sampler2D floraCloudMap; uniform vec4 floraCloudBounds;
` + s.fragmentShader;
      s.fragmentShader = s.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float tip=floraInfo.x;
vec3 colour=mix(floraLush,floraPale,floraInfo.y*.68+floraInfo.w*.25);
colour=mix(colour,floraDry,smoothstep(.68,.97,floraInfo.w)*.48);
colour*=mix(.68,1.05,smoothstep(0.,.75,tip));
colour=mix(colour,colour*vec3(1.12,1.09,.83),tip*tip*.35);
// Sample the same world-space cloud transmittance as LAND and structures.
float cloud=texture2D(floraCloudMap,(floraWorld.xz-floraCloudBounds.xy)/floraCloudBounds.zw).r;
float distanceBlend=${far ? "1." : "smoothstep(14.,38.,distance(floraWorld.xz,floraEye.xz))"};
vec3 farSward=vec3(.12,.18,.035)*(.78+.4*floraInfo.y);
colour=mix(colour,farSward,distanceBlend);
diffuseColor.rgb*=colour;`,
      );
      s.fragmentShader = s.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor=mix(.58+floraInfo.z*.24,.94,distanceBlend);`,
      );
      s.fragmentShader = s.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        T.ShaderChunk.normal_fragment_begin.replace(
          "normal *= faceDirection;",
          "",
        ),
      );
      s.fragmentShader = s.fragmentShader.replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
float through=.08+.48*pow(max(0.,dot(normalize(floraWorld-floraEye),floraSun)),2.);
float visibility=1.;
#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
visibility=getShadow(directionalShadowMap[0],directionalLightShadows[0].shadowMapSize,directionalLightShadows[0].shadowIntensity,directionalLightShadows[0].shadowBias,directionalLightShadows[0].shadowRadius,vDirectionalShadowCoord[0]);
#endif
reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.08,1.,.62)*directionalLights[0].color*through*(.18+.82*tip)*visibility*(1.-distanceBlend)*${far ? ".12" : "1."};
#endif
reflectedLight.directDiffuse*=mix(1.,cloud,floraCloud);
reflectedLight.directSpecular*=mix(1.,cloud,floraCloud)*${far ? "0." : "1."};
reflectedLight.indirectSpecular*=${far ? ".15" : "1."};
// Thin leaves transmit diffuse sky light even on the bank's shadowed side.
reflectedLight.indirectDiffuse+=diffuseColor.rgb*(.06+.08*tip);`,
      );
    };
    material.customProgramCacheKey = () =>
      `hw-flora-grass-${quality}-${far}-v3`;
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `Meadow ${far ? "far tufts" : "blades"} ${count}`;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.userData.noReflect = mesh.userData.noSkyVis = true;
    group.add(mesh);
    meshes.push(mesh);
    mesh.userData.grid = { cell, span, count, far, cells: cells.slice() };
    geometry.attributes.floraCell.setUsage(T.DynamicDrawUsage);
  }
  return {
    update({ camera }) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(
        projection.multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        ),
      );
      forward
        .set(0, 0, -1)
        .applyQuaternion(camera.quaternion)
        .setY(0)
        .normalize();
      uniforms.floraForward.value.set(forward.x, forward.z);
      uniforms.floraPixel.value =
        (2 * Math.tan((camera.fov * Math.PI) / 360)) /
        Math.max(240, window.innerHeight);
      // Compact only zero-area/out-of-view clumps. Cell IDs and the shader's
      // world wrapping are unchanged, so surviving foliage never jumps.
      for (const mesh of meshes) {
        const { cell, span, count, far, cells } = mesh.userData.grid;
        const attribute = mesh.geometry.attributes.floraCell;
        const offset = far && quality === "high" ? 5.4 : 0;
        const eyeX = Math.floor(
          (camera.position.x + forward.x * offset) / cell,
        );
        const eyeZ = Math.floor(
          (camera.position.z + forward.z * offset) / cell,
        );
        const radius = (far ? farOuter : nearOuter) + 2;
        const rearMargin = 3 + Math.abs(Math.sin(camera.rotation.x)) * 90;
        let used = 0;
        for (let i = 0; i < count; i++) {
          const cx = cells[i * 3],
            cz = cells[i * 3 + 1];
          const x =
            (((((cx - eyeX) % span) + span) % span) +
              eyeX -
              Math.floor(span / 2)) *
              cell -
            camera.position.x;
          const z =
            (((((cz - eyeZ) % span) + span) % span) +
              eyeZ -
              Math.floor(span / 2)) *
              cell -
            camera.position.z;
          if (
            x * x + z * z > radius * radius ||
            x * forward.x + z * forward.z < -rearMargin
          )
            continue;
          const worldX = x + camera.position.x,
            worldZ = z + camera.position.z;
          const tx0 = Math.max(
            0,
            Math.min(
              columns - 1,
              Math.floor((worldX - 1.5 - bounds.x) / tileSize),
            ),
          );
          const tx1 = Math.max(
            0,
            Math.min(
              columns - 1,
              Math.floor((worldX + cell + 1.5 - bounds.x) / tileSize),
            ),
          );
          const tz0 = Math.max(
            0,
            Math.min(
              rows - 1,
              Math.floor((worldZ - 1.5 - bounds.y) / tileSize),
            ),
          );
          const tz1 = Math.max(
            0,
            Math.min(
              rows - 1,
              Math.floor((worldZ + cell + 1.5 - bounds.y) / tileSize),
            ),
          );
          let minY = Infinity,
            maxY = -Infinity;
          for (let j = tz0; j <= tz1; j++)
            for (let k = tx0; k <= tx1; k++) {
              minY = Math.min(minY, minima[j * columns + k]);
              maxY = Math.max(maxY, maxima[j * columns + k]);
            }
          box.min.set(worldX - 1.5, minY - 0.1, worldZ - 1.5);
          box.max.set(worldX + cell + 1.5, maxY + 0.75, worldZ + cell + 1.5);
          if (!frustum.intersectsBox(box)) continue;
          if (quality === "low") {
            // Include jitter, clump attraction and both bilinear neighbours.
            const x0 = Math.max(
              0,
              Math.floor(
                ((worldX - 1 - bounds.x) / bounds.z) * image.width - 0.5,
              ),
            );
            const x1 = Math.min(
              image.width - 1,
              Math.ceil(
                ((worldX + cell + 1 - bounds.x) / bounds.z) * image.width + 0.5,
              ),
            );
            const z0 = Math.max(
              0,
              Math.floor(
                ((worldZ - 1 - bounds.y) / bounds.w) * image.height - 0.5,
              ),
            );
            const z1 = Math.min(
              image.height - 1,
              Math.ceil(
                ((worldZ + cell + 1 - bounds.y) / bounds.w) * image.height +
                  0.5,
              ),
            );
            let grows = false;
            for (let j = z0; j <= z1 && !grows; j++)
              for (let k = x0; k <= x1; k++)
                if (image.data[(j * image.width + k) * 4 + 1] >= 0.06) {
                  grows = true;
                  break;
                }
            if (!grows) continue;
          }
          attribute.setXYZ(used++, cx, cz, 0);
        }
        mesh.geometry.instanceCount = used;
        attribute.needsUpdate = true;
      }
      group.visible = camera.position.z < -20 && camera.position.z > -500;
    },
    dispose() {
      group.removeFromParent();
      meshes.forEach((m) => {
        m.geometry.dispose();
      });
    },
  };
}
