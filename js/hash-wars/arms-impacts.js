import { renderGroundY } from "./land-terrain.js";

const surfaces = {
  concrete: 1,
  stone: 2,
  metal: 3,
  rock: 4,
  sand: 5,
  grass: 6,
};
const header = "varying vec2 scarUV; varying vec4 faceUV, scar;";
function scarMaterial(kit) {
  const m = kit.material({
    color: 0xffffff,
    roughness: 0.92,
    depthWrite: false,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const compile = m.onBeforeCompile;
  m.customProgramCacheKey = () => "hw-impact-crater-v3";
  m.onBeforeCompile = (s) => {
    compile(s);
    s.vertexShader =
      header +
      "attribute vec4 damage; attribute vec4 faceU, faceV;\n" +
      s.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float c=cos(damage.z), s=sin(damage.z);
scarUV = mat2(c,s,-s,c) * (uv * 2. - 1.);
scar = damage;
vec3 q = vec3(position.xy * damage.w, 1.);
faceUV.xy = vec2(dot(faceU.xyz, q), dot(faceV.xyz, q));
float edge = faceUV.x + faceUV.y - 1.;
faceUV.zw = faceU.w > 0.
  ? faceUV.xy - edge * vec2(faceU.w, faceV.w)
  : vec2(-edge, 1.);`,
      );
    s.fragmentShader =
      header +
      s.fragmentShader
        .replace(
          "#include <color_fragment>",
          `
#include <color_fragment>
if(scar.x<.5 || any(lessThan(faceUV,vec4(0.)))) discard;
// Fracture planes give the exposed face angular, unequal sides.
vec2 q=scarUV;
float seed=scar.z;
float ridge=abs(fract(dot(q,vec2(1.36,-1.19))+seed)*2.-1.);
float fold=abs(fract(dot(q,vec2(-2.1,.83))-seed)*2.-1.);
float edge=max(max(abs(q.x+.22*q.y)*1.06,abs(q.y-.18*q.x)*1.34),
               abs(.84*q.x+.91*q.y))+.19*ridge+.11*fold;
// Soil breaks into clods. Dry sand fans out on one side of the depression.
if(scar.x==5.) edge-=.14*max(q.x,0.);
if(scar.x==6.) edge+=.12*(fold-.5);
float fill=1.-smoothstep(.79,.86,edge);
float dust=(1.-smoothstep(.76,1.,edge))*.32;
if(max(fill,dust)<.035) discard;
// Keep the break continuous while repeated hits add independent dark pits.
vec2 pit=q-vec2(.12,-.11);
if(scar.y>0.) {
 vec2 a=q-vec2(-.39,.18);
 if(dot(a,a)<dot(pit,pit)) pit=a;
 if(scar.y>2.) {
  a=q-vec2(.32,.31);
  if(dot(a,a)<dot(pit,pit)) pit=a;
  a=q-vec2(-.17,-.38);
  if(dot(a,a)<dot(pit,pit)) pit=a;
 }
}
// Coarse facets survive at range. Fine aggregate appears only up close.
vec2 cell=floor(q*47.);
float grain=fract(52.9829*fract(dot(cell,vec2(.06711,.00584))+seed));
grain=mix(grain,.5,smoothstep(.011,.035,max(fwidth(q.x),fwidth(q.y))));
float hole=max(abs(pit.x+.28*pit.y),abs(.91*pit.y-.25*pit.x))
           +.10*fold+.035*grain;
float bowl=1.-smoothstep(.16,.23,hole);
float facet=smoothstep(.14,.84,ridge+.32*q.x-.23*q.y);
vec3 fresh=vec3(.87,.85,.78);
if(scar.x==2.) fresh=vec3(.70,.72,.71);
if(scar.x==3.) fresh=vec3(.83,.87,.89);
if(scar.x==4.) fresh=vec3(.58,.62,.65);
if(scar.x==5.) fresh=vec3(.79,.64,.43);
if(scar.x==6.) fresh=vec3(.18,.072,.019);
vec3 core=scar.x==5.?vec3(.19,.119,.065):
          scar.x==6.?vec3(.047,.021,.009):vec3(.013,.016,.019);
vec3 exposed=fresh*(.30+.37*facet+.14*fold+.28*grain);
if(scar.x==5.) {
 bowl=max(bowl*.70,1.-smoothstep(.12,.69,length(q+vec2(.17,0.))));
 exposed=fresh*(.64+.36*fold);
}
diffuseColor.rgb=mix(mix(fresh*.58,exposed,fill),core,bowl);
diffuseColor.a=max(fill,dust);
float height=(-.026*bowl+.007*facet)*scar.w;
`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
vec3 rx=cross(dFdy(-vViewPosition),normal), ry=cross(normal,dFdx(-vViewPosition));
float det=dot(dFdx(-vViewPosition),rx);
normal=normalize(normal-sign(det)*(rx*dFdx(height)+ry*dFdy(height))/max(abs(det),1e-10));
if(scar.x==3.){metalnessFactor=mix(.38,.08,bowl);roughnessFactor=mix(.34,.85,bowl);}
`,
        );
  };
  return m;
}

// Rasterize the six faces of each rock profile into small CPU height maps.
// Overlapping slabs keep the frontmost visible facet in each texel. A shot
// samples one texel, even when an outcrop has thousands of triangles.
function rockSkin(T, g) {
  const cells = 48,
    maps = new Float32Array(6 * cells * cells * 4),
    facets = new Uint32Array(6 * cells * cells);
  const pos = g.attributes.position,
    index = g.index,
    tri = new T.Triangle();
  const normal = new T.Vector3(),
    size = new T.Vector3();
  g.computeBoundingBox();
  const origin = g.boundingBox.min;
  g.boundingBox.getSize(size);
  const vertices = [tri.a, tri.b, tri.c];
  const bound = (i) => Math.max(0, Math.min(cells - 1, i));
  for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
    for (let j = 0; j < 3; j++)
      vertices[j].fromBufferAttribute(pos, index ? index.getX(i + j) : i + j);
    tri.getNormal(normal);
    for (let axis = 0; axis < 3; axis++) {
      const nz = normal.getComponent(axis);
      if (Math.abs(nz) < 0.025) continue;
      const u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      const px = vertices.map(
        (p) =>
          ((p.getComponent(u) - origin.getComponent(u)) * cells) /
            size.getComponent(u) -
          0.5,
      );
      const py = vertices.map(
        (p) =>
          ((p.getComponent(v) - origin.getComponent(v)) * cells) /
            size.getComponent(v) -
          0.5,
      );
      const dx = px[1] - px[0],
        dy = py[1] - py[0],
        ex = px[2] - px[0],
        ey = py[2] - py[0],
        det = dx * ey - dy * ex;
      const face = axis * 2 + Number(nz > 0);
      const rowMin = bound(Math.ceil(Math.min(...py))),
        rowMax = bound(Math.floor(Math.max(...py)));
      const colMin = bound(Math.ceil(Math.min(...px))),
        colMax = bound(Math.floor(Math.max(...px)));
      for (let y = rowMin; y <= rowMax; y++) {
        for (let x = colMin; x <= colMax; x++) {
          const a = ((x - px[0]) * ey - (y - py[0]) * ex) / det,
            b = (dx * (y - py[0]) - dy * (x - px[0])) / det;
          if (a < 0 || b < 0 || a + b > 1) continue;
          const h =
            (1 - a - b) * tri.a.getComponent(axis) +
            a * tri.b.getComponent(axis) +
            b * tri.c.getComponent(axis);
          const k = 4 * ((face * cells + y) * cells + x);
          if (maps[k + 1 + axis] && (maps[k] - h) * nz >= 0) continue;
          maps[k] = h;
          facets[k / 4] = i;
          normal.toArray(maps, k + 1);
        }
      }
    }
  }
  return (p, n, struck) => {
    const x = Math.abs(n.x),
      y = Math.abs(n.y),
      z = Math.abs(n.z);
    const a = x >= y && x >= z ? 0 : y >= z ? 1 : 2,
      u = (a + 1) % 3,
      v = (a + 2) % 3;
    const col = bound(
      Math.floor(
        ((p.getComponent(u) - origin.getComponent(u)) * cells) /
          size.getComponent(u),
      ),
    );
    const row = bound(
      Math.floor(
        ((p.getComponent(v) - origin.getComponent(v)) * cells) /
          size.getComponent(v),
      ),
    );
    const k =
      4 *
      (((a * 2 + Number(n.getComponent(a) > 0)) * cells + row) * cells + col);
    if (!maps[k + a + 1]) return false;
    n.fromArray(maps, k + 1);
    const i = facets[k / 4];
    tri.setFromAttributeAndIndices(
      pos,
      index ? index.getX(i) : i,
      index ? index.getX(i + 1) : i + 1,
      index ? index.getX(i + 2) : i + 2,
    );
    struck.copy(tri);
    const du =
      p.getComponent(u) -
      origin.getComponent(u) -
      ((col + 0.5) * size.getComponent(u)) / cells;
    const dv =
      p.getComponent(v) -
      origin.getComponent(v) -
      ((row + 0.5) * size.getComponent(v)) / cells;
    p.setComponent(
      a,
      maps[k] -
        (n.getComponent(u) * du + n.getComponent(v) * dv) / n.getComponent(a),
    );
    return true;
  };
}

// An authored wall quad normally splits along its longest edge. Only join
// reversed, shared vertex indices in this material and geometry range. Nearby
// trim, duplicate vertices and separate parts keep their own boundaries.
function wallQuads(T, pos, index, range) {
  const pairs = new Map();
  if (!index) return pairs;
  const edges = new Map();
  const tri = new T.Triangle(),
    other = new T.Vector3(),
    weights = new T.Vector3();
  const normal = new T.Vector3(),
    across = new T.Vector3();
  for (let i = range.start; i < range.start + range.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    tri.setFromAttributeAndIndices(pos, ...ids);
    const lengths = [
      tri.a.distanceToSquared(tri.b),
      tri.b.distanceToSquared(tri.c),
      tri.c.distanceToSquared(tri.a),
    ];
    const side = lengths.indexOf(Math.max(...lengths));
    const a = ids[side],
      b = ids[(side + 1) % 3],
      c = ids[(side + 2) % 3];
    const key = Math.min(a, b) + ":" + Math.max(a, b);
    const previous = edges.get(key);
    edges.set(key, { i, a, b, c, side });
    if (!previous || previous.a !== b || previous.b !== a) continue;
    tri.setFromAttributeAndIndices(pos, a, b, c);
    other.fromBufferAttribute(pos, previous.c);
    tri.getNormal(normal);
    T.Triangle.getNormal(tri.b, tri.a, other, across);
    if (normal.dot(across) < 1 - 1e-12) continue;
    // In the struck triangle's coordinates the diagonal is u + v = 1.
    // The fourth vertex determines the two outer edges across that diagonal.
    tri.getBarycoord(other, weights);
    if (weights.x <= 0 || weights.y <= 0 || weights.z >= -1e-6) continue;
    pairs.set(i, {
      side,
      u: -weights.x / weights.z,
      v: -weights.y / weights.z,
    });
    // Seen from the other triangle, the shared endpoints reverse.
    pairs.set(previous.i, {
      side: previous.side,
      u: weights.y,
      v: weights.x,
    });
  }
  return pairs;
}

// Collision uses simple hulls. Find the nearest facing triangle on the matching
// authored part without casting another shot. Chunks and transforms are built
// once; terrain has its own exact height lookup.
let warnedMissing = false;
function surfaceLookup(T, scene, sim, quality) {
  const pieces = new Map(),
    geometryCache = new WeakMap(),
    skins = new WeakMap();
  const matrix = new T.Matrix4(),
    vertex = new T.Vector3();
  const key = (x, z) => Math.round(x * 1000) + ":" + Math.round(z * 1000);
  const solidKeys = sim.layout.map((b) => {
    const part = b.stationAssembly ?? b.stationPart;
    if (part) return key(part.x, part.z);
    if (b.owner !== "land" && b.kind !== "cover") return null;
    return b.min
      ? key((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2)
      : key(b.x, b.z);
  });
  const needed = new Set(solidKeys);
  let rockCount = 0,
    stationCount = 0;
  scene.traverse((mesh) => {
    const rock =
      mesh.isInstancedMesh &&
      mesh.name.startsWith("LAND-ROCK ") &&
      mesh.name.endsWith(" near");
    const station =
      mesh.isBatchedMesh &&
      mesh.name === "STATIONS culled site furniture" &&
      mesh.parent === mesh.parent.parent.children[0];
    if (!rock && !station) return;
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry,
      pos = g.attributes.position,
      index = g.index;
    let ranges = geometryCache.get(g);
    if (!ranges) {
      ranges = new Map();
      geometryCache.set(g, ranges);
    }
    for (let i = 0; i < (rock ? mesh.count : mesh.instanceCount); i++) {
      mesh.getMatrixAt(i, matrix);
      matrix.premultiply(mesh.matrixWorld);
      const k = key(matrix.elements[12], matrix.elements[14]);
      if (!needed.has(k)) continue;
      if (rock) {
        rockCount++;
        if (!skins.has(g)) skins.set(g, rockSkin(T, g));
        if (!pieces.has(k)) pieces.set(k, []);
        pieces.get(k).push({
          skin: skins.get(g),
          matrix: matrix.clone(),
          inverse: matrix.clone().invert(),
          normalMatrix: new T.Matrix3().getNormalMatrix(matrix),
        });
        continue;
      }
      stationCount++;
      const id = mesh.getGeometryIdAt(i);
      let cached = ranges.get(id);
      if (!cached) {
        const chunks = [];
        const range = mesh.getGeometryRangeAt(id);
        cached = { chunks, quads: wallQuads(T, pos, index, range) };
        ranges.set(id, cached);
        for (
          let start = range.start;
          start < range.start + range.count;
          start += 96
        ) {
          const end = Math.min(start + 96, range.start + range.count),
            box = new T.Box3();
          for (let j = start; j < end; j++)
            box.expandByPoint(
              vertex.fromBufferAttribute(pos, index ? index.getX(j) : j),
            );
          chunks.push({ start, end, box });
        }
      }
      if (!pieces.has(k)) pieces.set(k, []);
      pieces.get(k).push({
        pos,
        index,
        ...cached,
        matrix: matrix.clone(),
        inverse: matrix.clone().invert(),
        normalMatrix: new T.Matrix3().getNormalMatrix(matrix),
        minScale: Math.min(
          vertex.setFromMatrixColumn(matrix, 0).length(),
          vertex.setFromMatrixColumn(matrix, 1).length(),
          vertex.setFromMatrixColumn(matrix, 2).length(),
        ),
      });
    }
  });
  if (
    (!rockCount || !stationCount) &&
    !warnedMissing &&
    ["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname)
  ) {
    warnedMissing = true;
    console.warn(
      `Impact mesh lookup matched ${stationCount} station pieces and ${rockCount} rock pieces`,
    );
  }
  // Service pipes are merged into the scenery. Their collision boxes include
  // air around the sloped sides. Use the same end points and polygon count as
  // the rendered cylinders, sharing one unit profile per taper.
  const tubes = new Map();
  const axis = new T.Vector3(),
    up = new T.Vector3(0, 1, 0);
  const transform = new T.Object3D();
  for (let i = 0; i < sim.layout.length; i++) {
    const pipe = sim.layout[i].stationPipe;
    if (!pipe || pipe.r < 0.03) continue;
    axis.fromArray(pipe.b).sub(vertex.fromArray(pipe.a));
    const length = axis.length(),
      taper = pipe.endRadius / pipe.r;
    if (!tubes.has(taper)) {
      const g = new T.CylinderGeometry(taper, 1, 1, quality === "low" ? 8 : 12);
      g.computeBoundingBox();
      tubes.set(taper, g);
    }
    const g = tubes.get(taper);
    transform.position.copy(vertex).addScaledVector(axis, 0.5);
    transform.quaternion.setFromUnitVectors(up, axis.normalize());
    transform.scale.set(pipe.r, length, pipe.r);
    transform.updateMatrix();
    const matrix = transform.matrix.clone();
    solidKeys[i] = i;
    pieces.set(i, [
      {
        pos: g.attributes.position,
        index: g.index,
        chunks: [{ start: 0, end: g.index.count, box: g.boundingBox }],
        matrix,
        inverse: matrix.clone().invert(),
        normalMatrix: new T.Matrix3().getNormalMatrix(matrix),
        minScale: Math.min(length, pipe.r),
      },
    ]);
  }
  const local = new T.Vector3(),
    tri = new T.Triangle(),
    face = new T.Vector3(),
    point = new T.Vector3();
  const bestPoint = new T.Vector3(),
    bestNormal = new T.Vector3();
  const probe = new T.Vector3();
  return (index, p, n, from, struck, clip) => {
    const parts = pieces.get(solidKeys[index]);
    if (!parts) return;
    probe.copy(p).addScaledVector(n, 0.055);
    let best = Infinity;
    for (const part of parts) {
      if (part.skin) {
        local.copy(p).applyMatrix4(part.inverse);
        if (from) face.fromArray(from).sub(p);
        else face.copy(n);
        face.transformDirection(part.inverse);
        if (part.skin(local, face, struck)) {
          clip.set(0, 0);
          p.copy(local).applyMatrix4(part.matrix);
          n.copy(face).applyNormalMatrix(part.normalMatrix);
          struck.a.applyMatrix4(part.matrix);
          struck.b.applyMatrix4(part.matrix);
          struck.c.applyMatrix4(part.matrix);
          return true;
        }
        continue;
      }
      local.copy(probe).applyMatrix4(part.inverse);
      for (const chunk of part.chunks) {
        if (chunk.box.distanceToPoint(local) * part.minScale >= best) continue;
        for (let i = chunk.start; i < chunk.end; i += 3) {
          const ix = part.index;
          tri.a.fromBufferAttribute(part.pos, ix ? ix.getX(i) : i);
          tri.b.fromBufferAttribute(part.pos, ix ? ix.getX(i + 1) : i + 1);
          tri.c.fromBufferAttribute(part.pos, ix ? ix.getX(i + 2) : i + 2);
          tri.getNormal(face).applyNormalMatrix(part.normalMatrix);
          if (face.dot(n) < 0.22) continue;
          tri.closestPointToPoint(local, point).applyMatrix4(part.matrix);
          let d = probe.distanceTo(point);
          if (d >= best) continue;
          // A protruding trim vertex can be closer than the panel immediately
          // behind it. Prefer a face under the shot over the edge beside it.
          if (!tri.containsPoint(local)) d += 0.085;
          if (d < best) {
            best = d;
            const quad = part.quads?.get(i);
            if (quad) {
              const side = quad.side;
              struck.setFromAttributeAndIndices(
                part.pos,
                ix.getX(i + side),
                ix.getX(i + ((side + 1) % 3)),
                ix.getX(i + ((side + 2) % 3)),
              );
              clip.set(quad.u, quad.v);
            } else {
              struck.copy(tri);
              clip.set(0, 0);
            }
            struck.a.applyMatrix4(part.matrix);
            struck.b.applyMatrix4(part.matrix);
            struck.c.applyMatrix4(part.matrix);
            bestPoint.copy(point);
            bestNormal.copy(face);
          }
        }
      }
    }
    if (best < Infinity) {
      p.copy(bestPoint);
      n.copy(bestNormal);
      return true;
    }
  };
}

export function createImpacts({ T, kit, sim, scene, quality }) {
  const capacity = quality === "low" ? 96 : quality === "ultra" ? 384 : 256;
  const geometry = new T.PlaneGeometry(1, 1);
  const attr = new T.InstancedBufferAttribute(
    new Float32Array(capacity * 4),
    4,
  );
  geometry.setAttribute("damage", attr.setUsage(T.DynamicDrawUsage));
  // Each attribute stores a barycentric gradient, offset and outer edge slope.
  const faceU = new T.InstancedBufferAttribute(
    new Float32Array(capacity * 4),
    4,
  );
  const faceV = faceU.clone();
  geometry.setAttribute("faceU", faceU.setUsage(T.DynamicDrawUsage));
  geometry.setAttribute("faceV", faceV.setUsage(T.DynamicDrawUsage));
  const clip = new T.Vector2();
  const struck = new T.Triangle(),
    probe = new T.Vector3();
  const center = new T.Vector3(),
    alongX = new T.Vector3(),
    alongY = new T.Vector3();
  const mesh = new T.InstancedMesh(geometry, scarMaterial(kit), capacity);
  mesh.name = "ARMS persistent surface damage";
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  // Let the translucent swash film cover scars on wet sand.
  mesh.renderOrder = -1;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  scene.add(mesh);
  const fitSurface = surfaceLookup(T, scene, sim, quality);
  const heads = new Int16Array(1024).fill(-1);
  const slots = Array.from({ length: capacity }, () => ({
    p: new T.Vector3(),
    n: new T.Vector3(),
    bucket: -1,
    next: -1,
    solid: -1,
    type: 0,
    size: 0,
    depth: 0,
    limit: 0,
    phase: 0,
  }));
  const p = new T.Vector3(),
    n = new T.Vector3(),
    dummy = new T.Object3D();
  const forward = new T.Vector3(0, 0, 1);
  let cursor = 0,
    used = 0,
    sequence = 0;
  function hash(x, y, z) {
    return (
      (Math.imul(x, 73856093) ^
        Math.imul(y, 19349663) ^
        Math.imul(z, 83492791)) &
      1023
    );
  }
  let visibleZone = -1;
  function upload(i) {
    const s = slots[i];
    dummy.position.copy(s.p).addScaledVector(s.n, 0.003);
    dummy.quaternion.setFromUnitVectors(forward, s.n);
    dummy.scale.set(s.size, s.size, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const zone = sim.layout[s.solid]?.zone;
    const hidden = zone !== undefined && Math.abs(zone - visibleZone) > 1;
    attr.setXYZW(i, hidden ? 0 : s.type, s.depth, s.phase, s.size);
    attr.needsUpdate = mesh.instanceMatrix.needsUpdate = true;
  }
  const contact = { at: [0, 0, 0], normal: [0, 1, 0] };
  function mark(e, at) {
    const type = surfaces[e.hit];
    if (!type || sim.layout[e.index]?.dynamic !== undefined) return;
    p.fromArray(at);
    n.fromArray(e.normal).normalize();
    clip.set(0, 0);
    let triangle = false;
    if (e.index === -1) {
      const x = p.x,
        z = p.z;
      p.y += renderGroundY(sim, x, z) - sim.groundY(x, z);
      n.set(
        renderGroundY(sim, x - 0.025, z) - renderGroundY(sim, x + 0.025, z),
        0.05,
        renderGroundY(sim, x, z - 0.025) - renderGroundY(sim, x, z + 0.025),
      ).normalize();
    } else
      triangle = fitSurface(
        e.index,
        p,
        n,
        e.type === "shot" ? e.from : null,
        struck,
        clip,
      );
    const x = Math.floor(p.x * 2),
      y = Math.floor(p.y * 2),
      z = Math.floor(p.z * 2);
    let best = -1,
      score = -1;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          for (
            let i = heads[hash(x + dx, y + dy, z + dz)];
            i !== -1;
            i = slots[i].next
          ) {
            const s = slots[i],
              d = s.p.distanceToSquared(p);
            if (
              i !== cursor &&
              s.solid === e.index &&
              s.type === type &&
              s.n.dot(n) > 0.92 &&
              d < 0.09 &&
              s.depth - d > score
            ) {
              best = i;
              score = s.depth - d;
            }
          }
        }
    if (best !== -1) {
      const s = slots[best];
      s.depth = Math.min(7, s.depth + 1);
      s.size = Math.min(s.limit, s.size + 0.052);
      upload(best);
    }
    const s = slots[cursor];
    if (s.bucket !== -1) {
      if (heads[s.bucket] === cursor) heads[s.bucket] = s.next;
      else {
        let i = heads[s.bucket];
        while (slots[i].next !== cursor) i = slots[i].next;
        slots[i].next = s.next;
      }
    }
    s.p.copy(p);
    s.n.copy(n);
    s.solid = e.index;
    s.type = type;
    s.depth = 0;
    s.phase = (++sequence * 2.39996) % 6.283;
    const solid = sim.layout[e.index];
    const source = e.type === "shot" ? e.weapon : e.kind;
    const pellet = source === "scatter";
    s.limit = pellet ? 0.24 : type === surfaces.metal ? 0.44 : 0.6;
    if (!triangle && solid?.min) {
      // Only constrain axes along the face. Normal depth may differ from the hull.
      for (let a = 0; a < 3; a++) {
        const tangent = Math.sqrt(Math.max(0, 1 - n.getComponent(a) ** 2));
        if (tangent < 0.01) continue;
        const v = p.getComponent(a);
        const room = Math.min(v - solid.min[a], solid.max[a] - v);
        // Even the corner of a tilted square must fit within the hull.
        s.limit = Math.min(s.limit, Math.max(0, (Math.SQRT2 * room) / tangent));
      }
    }
    const ground = type === surfaces.sand || type === surfaces.grass;
    const width = pellet ? 0.16 : source === "rail" ? 0.35 : 0.22;
    // A fresh bore stays small on the larger patch exposed by earlier rounds.
    s.size = Math.min(
      s.limit,
      width *
        (ground ? 1.65 : 1) *
        (best === -1 ? 1 : 0.64) *
        (0.92 + 0.19 * Math.cos(s.phase)),
    );
    s.bucket = hash(x, y, z);
    s.next = heads[s.bucket];
    heads[s.bucket] = cursor;
    upload(cursor);
    if (triangle) {
      struck.getBarycoord(p, center);
      probe.set(1, 0, 0).applyQuaternion(dummy.quaternion).add(p);
      struck.getBarycoord(probe, alongX).sub(center);
      probe.set(0, 1, 0).applyQuaternion(dummy.quaternion).add(p);
      struck.getBarycoord(probe, alongY).sub(center);
      faceU.setXYZW(cursor, alongX.x, alongY.x, center.x, clip.x);
      faceV.setXYZW(cursor, alongX.y, alongY.y, center.y, clip.y);
    } else {
      faceU.setXYZW(cursor, 0, 0, 0, 0);
      faceV.setXYZW(cursor, 0, 0, 0, 0);
    }
    faceU.needsUpdate = faceV.needsUpdate = true;
    cursor = (cursor + 1) % capacity;
    used = Math.min(capacity, used + 1);
    p.toArray(contact.at);
    n.toArray(contact.normal);
    return contact;
  }
  return {
    mark,
    reset() {
      heads.fill(-1);
      for (const s of slots) s.bucket = -1;
      cursor = used = 0;
      attr.setXYZW(0, 0, 0, 0, 0);
      attr.needsUpdate = true;
    },
    update(time, zone) {
      if (zone !== visibleZone) {
        visibleZone = zone;
        for (let i = 0; i < used; i++) upload(i);
      }
      mesh.count = time === 0 ? Math.max(1, used) : used;
      mesh.visible = mesh.count > 0;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
    },
  };
}
