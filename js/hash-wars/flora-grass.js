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
  // Summed occupancy makes an exact rectangular planting query four reads,
  // including empty tiles. Both rings share the immutable planting field.
  const stride = image.width + 1;
  const planted = new Uint32Array(stride * (image.height + 1));
  for (let z = 0; z < image.height; z++) {
    let row = 0;
    for (let x = 0; x < image.width; x++) {
      row += Number(image.data[(z * image.width + x) * 4 + 1] >= 0.06);
      planted[(z + 1) * stride + x + 1] = planted[z * stride + x + 1] + row;
    }
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
vec2 fieldUV=(xz-floraBounds.xy)/floraBounds.zw;
float reach=length(xz-floraEye.xz);
if(any(lessThan(fieldUV,vec2(0.)))||any(greaterThan(fieldUV,vec2(1.)))||reach>=${(far ? farOuter : nearOuter).toFixed(2)}${far ? `||reach<=${nearInner.toFixed(2)}` : ""}){
  gl_Position=vec4(2.,2.,2.,1.);return;
}
vec4 land=texture2D(floraField,fieldUV);
if(land.y<.06){gl_Position=vec4(2.,2.,2.,1.);return;}
vec3 root=vec3(xz.x,land.x-.018,xz.y);
float growthPatch=fn(xz*.28+fn(xz*.08)*2.);
float alpine=smoothstep(318.,352.,-xz.y);
float bare=mix(.32,1.,smoothstep(.20,.65,growthPatch))*(1.-alpine*.68);
float ring=${far ? `smoothstep(${nearInner.toFixed(2)},${nearOuter.toFixed(2)},reach)*(1.-smoothstep(35.,${farOuter.toFixed(2)},reach))` : `1.-smoothstep(${nearInner.toFixed(2)},${nearOuter.toFixed(2)},reach)`};
if(fh(grid+63.7+floraBlade*9.1)>bare){gl_Position=vec4(2.,2.,2.,1.);return;}
float bladeHeight=(.19+seed*.26)*(.7+tuft*.65)*mix(.4,1.,land.y)*ring;
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
vec3 farSward=mix(floraLush,floraDry*.77,smoothstep(.30,.70,floraInfo.y));
colour=mix(colour,farSward,distanceBlend);
colour=mix(colour,floraDry*.73,smoothstep(318.,352.,-floraWorld.z)*.85);
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
      `hw-flora-grass-${quality}-${far}-v4`;
    const mesh = new T.Mesh(geometry, material);
    mesh.name = `Meadow ${far ? "far tufts" : "blades"} ${count}`;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.userData.noReflect = mesh.userData.noSkyVis = true;
    group.add(mesh);
    meshes.push(mesh);
    // Each axis keeps the field coordinates for this camera-centred window.
    // Grass still uses the original wrapping IDs, in the original draw order.
    const axis = () =>
      Array.from({ length: span }, () => ({
        world: 0,
        tileMin: 0,
        tileMax: 0,
        sampleMin: 0,
        sampleMax: 0,
        wrapEdge: false,
      }));
    mesh.userData.grid = { cell, span, far, xAxis: axis(), zAxis: axis() };
    geometry.attributes.floraCell.setUsage(T.DynamicDrawUsage);
  }
  function updateAxis(axis, eye, offset, cell, origin, length, tiles, samples) {
    const span = axis.length,
      gridEye = (eye + offset) / cell,
      base = Math.floor(gridEye),
      first = base - Math.floor(span / 2);
    let id = ((base % span) + span) % span;
    // The shader wraps with float32 values. Let its fade decide for cells
    // that could wrap to the opposite edge when the eye crosses a cell line.
    const nearWrap = Math.abs(gridEye - Math.round(gridEye)) < 0.001;
    for (let i = 0; i < span; i++) {
      const world = (first + i) * cell - eye + eye,
        entry = axis[id];
      entry.world = world;
      entry.wrapEdge = nearWrap && (i === 0 || i === span - 1);
      entry.tileMin = Math.max(
        0,
        Math.min(tiles - 1, Math.floor((world - 1.5 - origin) / tileSize)),
      );
      entry.tileMax = Math.max(
        0,
        Math.min(
          tiles - 1,
          Math.floor((world + cell + 1.5 - origin) / tileSize),
        ),
      );
      // Include jitter, clump attraction and both bilinear neighbours.
      entry.sampleMin = Math.max(
        0,
        Math.floor(((world - 1 - origin) / length) * samples - 0.5),
      );
      entry.sampleMax = Math.min(
        samples - 1,
        Math.ceil(((world + cell + 1 - origin) / length) * samples + 0.5),
      );
      if (++id === span) id = 0;
    }
  }
  return {
    update({ camera }) {
      const eye = camera.position;
      group.visible = eye.z < -20 && eye.z > -500;
      if (!group.visible) return;
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
      const rearMargin = 3 + Math.abs(Math.sin(camera.rotation.x)) * 90;
      for (const mesh of meshes) {
        const { cell, span, far, xAxis, zAxis } = mesh.userData.grid;
        const attribute = mesh.geometry.attributes.floraCell;
        const offset = far && quality === "high" ? 5.4 : 0;
        updateAxis(
          xAxis,
          eye.x,
          forward.x * offset,
          cell,
          bounds.x,
          bounds.z,
          columns,
          image.width,
        );
        updateAxis(
          zAxis,
          eye.z,
          forward.z * offset,
          cell,
          bounds.y,
          bounds.w,
          rows,
          image.height,
        );
        // Jitter stays in the cell. Clump attraction moves a root by at most
        // .46 * .47 * .9 metres on either axis. Allow extra for shader rounding.
        const drift = 0.21;
        const outer = far ? farOuter : nearOuter;
        const wrapRadiusSquared = (outer + 2) ** 2;
        const outerSquared = (outer + 0.01) ** 2;
        const innerSquared = (nearInner - 0.01) ** 2;
        let used = 0;
        for (let cz = 0; cz < span; cz++) {
          const row = zAxis[cz],
            z = row.world - eye.z;
          const zNear = Math.max(0, z - drift, -z - cell - drift);
          const zNearSquared = zNear * zNear;
          if (
            (!row.wrapEdge && zNearSquared > outerSquared) ||
            row.sampleMin > row.sampleMax
          )
            continue;
          const zFar = Math.max(
            Math.abs(z - drift),
            Math.abs(z + cell + drift),
          );
          const minXSquare = innerSquared - zFar * zFar;
          const maxXSquare = outerSquared - zNearSquared;
          const rear = -rearMargin - z * forward.z;
          const lower = row.sampleMin * stride;
          const upper = (row.sampleMax + 1) * stride;
          for (let cx = 0; cx < span; cx++) {
            const column = xAxis[cx],
              x = column.world - eye.x;
            if (x * forward.x < rear || column.sampleMin > column.sampleMax)
              continue;
            if (row.wrapEdge || column.wrapEdge) {
              if (x * x + z * z > wrapRadiusSquared) continue;
            } else {
              const xNear = Math.max(0, x - drift, -x - cell - drift);
              if (xNear * xNear > maxXSquare) continue;
              if (far && minXSquare > 0) {
                const xFar = Math.max(
                  Math.abs(x - drift),
                  Math.abs(x + cell + drift),
                );
                if (xFar * xFar <= minXSquare) continue;
              }
            }
            const left = column.sampleMin,
              right = column.sampleMax + 1;
            const occupied =
              planted[upper + right] -
              planted[lower + right] -
              planted[upper + left] +
              planted[lower + left];
            if (!occupied) continue;

            let minY = Infinity,
              maxY = -Infinity;
            for (let j = row.tileMin; j <= row.tileMax; j++)
              for (let k = column.tileMin; k <= column.tileMax; k++) {
                minY = Math.min(minY, minima[j * columns + k]);
                maxY = Math.max(maxY, maxima[j * columns + k]);
              }
            box.min.set(column.world - 1.5, minY - 0.1, row.world - 1.5);
            box.max.set(
              column.world + cell + 1.5,
              maxY + 0.75,
              row.world + cell + 1.5,
            );
            if (frustum.intersectsBox(box)) attribute.setXYZ(used++, cx, cz, 0);
          }
        }
        mesh.geometry.instanceCount = used;
        mesh.visible = used > 0;
        if (used) {
          attribute.clearUpdateRanges();
          attribute.addUpdateRange(0, used * attribute.itemSize);
          attribute.needsUpdate = true;
        }
      }
    },
    dispose() {
      group.removeFromParent();
      meshes.forEach((m) => {
        m.geometry.dispose();
      });
    },
  };
}
