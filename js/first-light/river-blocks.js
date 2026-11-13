import { surface } from "./surfaces.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Canvas height, relief normals and emissive mask share the same letterforms.
function inscription(T, i, size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.scale(size / 512, size / 512);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 220px monospace";
  ctx.fillText(String(i), 256, 282);
  const hash = Array.from({ length: 32 }, (_, k) =>
    k < 8
      ? "0"
      : Math.floor(
          (Math.sin(i * 91.7 + k * 67.4) * 0.5 + 0.5) * 15.99,
        ).toString(16),
  ).join("");
  ctx.font = "19px monospace";
  ctx.fillText(hash.slice(0, 16), 256, 320);
  ctx.fillText(hash.slice(16), 256, 350);
  // A one-centimetre recessed bowl with a rounded cutter edge. The blurred
  // height supplies bevel normals; the sharp mask keeps the wet groove dark.
  const blurred = document.createElement("canvas");
  blurred.width = blurred.height = size;
  const bc = blurred.getContext("2d");
  bc.filter = `blur(${size / 256}px)`;
  bc.drawImage(c, 0, 0);
  const sharp = ctx.getImageData(0, 0, size, size);
  const soft = bc.getImageData(0, 0, size, size);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      const sample = (dx, dy) =>
        soft.data[
          (Math.max(0, Math.min(size - 1, y + dy)) * size +
            Math.max(0, Math.min(size - 1, x + dx))) *
            4
        ] / 255;
      const nx = ((sample(1, 0) - sample(-1, 0)) * size * 0.01) / 5.6;
      const ny = ((sample(0, -1) - sample(0, 1)) * size * 0.01) / 5.6;
      // R: groove AO, G/B: physical cut slopes, A: soft glow spill.
      data.set(
        [sharp.data[p], (nx + 0.5) * 255, (ny + 0.5) * 255, soft.data[p]],
        p,
      );
    }
  const texture = new T.DataTexture(data, size, size);
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// Roughness is cut inward from the authoritative box, including its bevel.
// Identical positions get identical cuts, so duplicated face vertices stay closed.
function hewnGeometry(T, block, quality, seed) {
  const half = block.max.map((v, i) => (v - block.min[i]) / 2);
  const segments = quality === "low" ? 6 : quality === "high" ? 12 : 18;
  const geometry = new T.BoxGeometry(
    ...half.map((v) => v * 2),
    segments,
    segments,
    segments,
  );
  const p = geometry.attributes.position;
  const corner = new T.Vector3(),
    point = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i);
    const x = point.x,
      y = point.y,
      z = point.z;
    corner.set(
      ...[x, y, z].map((v, axis) =>
        T.MathUtils.clamp(v, -half[axis] + 0.065, half[axis] - 0.065),
      ),
    );
    point.sub(corner).normalize().multiplyScalar(0.065).add(corner);
    const grain =
      0.5 + 0.5 * Math.sin(x * 17.1 + y * 13.3 + z * 19.7 + seed * 4.1);
    const split = Math.pow(grain, 3) * 0.026;
    const edge = Math.max(Math.abs(x), Math.abs(z)) > 1.48;
    if (Math.abs(x) > 1.48) point.x -= Math.sign(x) * split;
    if (Math.abs(z) > 1.48) point.z -= Math.sign(z) * split;
    if (y > half[1] - 0.08 && edge) point.y -= split * 0.65;
    p.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function buildBlocks({ T, sim, kit, quality, group }) {
  const baseStone = surface(kit, "blockStone", {
    scale: 1.4,
    space: "object",
    tint: new T.Color(1.65, 1.75, 1.9),
  });
  const iron = surface(kit, "rustedSteel", {
    scale: 0.35,
    tint: new T.Color(2.2, 2.3, 2.4),
    space: "object",
  });
  const wet = kit.material({
    color: 0x5f7780,
    roughness: 0.15,
    metalness: 0.25,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const originalWet = wet.onBeforeCompile;
  const wetUniforms = { riverTime: kit.uniforms.time };
  wet.onBeforeCompile = (shader) => {
    originalWet(shader);
    Object.assign(shader.uniforms, wetUniforms);
    shader.vertexShader =
      `varying vec2 streamUV;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nstreamUV=uv;",
      );
    shader.fragmentShader =
      `varying vec2 streamUV;uniform float riverTime;${kit.noiseGLSL}\n${shader.fragmentShader}`.replace(
        "#include <alphamap_fragment>",
        `#include <alphamap_fragment>
float streak=noise3(vec3(streamUV.x*63.,streamUV.y*6.+riverTime*1.7,1.));
diffuseColor.a*=smoothstep(.57,.83,streak)*smoothstep(0.,.12,streamUV.y)*(.5+.5*sin(streamUV.y*34.+riverTime*7.));`,
      );
  };
  wet.customProgramCacheKey = () => "river-draining-v1";
  const textures = [],
    unregister = [],
    blocks = [],
    ownedMaterials = [];
  const linkGeometry = new T.TorusGeometry(
    0.145,
    0.045,
    quality === "low" ? 5 : 7,
    quality === "low" ? 10 : 14,
  );
  linkGeometry.scale(0.83, 1.45, 1);
  const anchorGeometry = new T.TorusGeometry(0.19, 0.048, 6, 16);
  const anchorMatrices = [];
  const weedMat = kit.material({
    color: 0x35472b,
    roughness: 0.54,
    side: T.DoubleSide,
  });
  const weedCompile = weedMat.onBeforeCompile;
  weedMat.onBeforeCompile = (shader) => {
    weedCompile(shader);
    shader.vertexShader =
      `varying vec2 weedUV;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nweedUV=uv;",
      );
    shader.fragmentShader =
      `varying vec2 weedUV;\n${shader.fragmentShader}`.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      diffuseColor.rgb*=mix(.45,1.15,weedUV.y)*(.85+.15*sin(weedUV.x*24.));`,
      );
  };
  weedMat.customProgramCacheKey = () => "river-waterweed-v1";
  const weedGeometry = new T.PlaneGeometry(0.035, 1, 1, 3);
  const weedPositions = weedGeometry.attributes.position;
  for (let i = 0; i < weedPositions.count; i++) {
    const h = weedPositions.getY(i) + 0.5;
    weedPositions.setXYZ(
      i,
      weedPositions.getX(i) * (1 - h * 0.8) + h * h * 0.025,
      -h,
      0,
    );
  }
  weedGeometry.computeVertexNormals();
  const weeds = new T.InstancedMesh(weedGeometry, weedMat, 320);
  weeds.userData.noReflect = true;
  group.add(weeds);
  const weedPlacements = [],
    weedMatrix = new T.Matrix4();
  const temp = new T.Object3D();
  for (const [i, b] of sim.entities.blocks.entries()) {
    const body = new T.Group();
    body.position.set(b.x, 0, b.z);
    group.add(body);
    for (let k = 0; k < 32; k++) {
      const face = Math.floor(k / 8),
        angle = (face * Math.PI) / 2;
      const seed = 0.5 + 0.5 * Math.sin(i * 53.7 + k * 87.1);
      const along =
        Math.sin(i * 17.3 + Math.floor(k / 4) * 47.7) * 1.35 +
        (seed - 0.5) * 0.16;
      temp.position.set(
        b.x + Math.sin(angle) * 1.61 + Math.cos(angle) * along,
        sim.WATER_Y + 0.14,
        b.z + Math.cos(angle) * 1.61 - Math.sin(angle) * along,
      );
      temp.rotation.set(0, angle + (seed - 0.5) * 0.4, 0);
      temp.scale.set(0.6 + seed * 0.8, 0.14 + seed * 0.25, 1);
      temp.updateMatrix();
      weedPlacements.push({ block: i, matrix: temp.matrix.clone() });
    }
    const ink = inscription(T, i, quality === "low" ? 256 : 1024);
    textures.push(ink);
    const cut = { value: -2.2 };
    const grain = { value: new T.Vector3(i * 2.73, i * 0.91, i * 1.39) };
    const stone = baseStone.clone();
    const stoneCompile = baseStone.onBeforeCompile;
    stone.onBeforeCompile = (shader) => {
      stoneCompile(shader);
      Object.assign(shader.uniforms, {
        riverCut: { value: ink },
        riverSweep: cut,
        riverGrainOffset: grain,
      });
      shader.fragmentShader = `uniform sampler2D riverCut;uniform float riverSweep;uniform vec3 riverGrainOffset;\n${shader.fragmentShader}`;
      // Keep grain and puddles attached to each moving stone, without repeating
      // the same patch on all ten tops. The inscription retains local coordinates.
      shader.vertexShader =
        `uniform vec3 riverGrainOffset;\n${shader.vertexShader}`.replace(
          "flSurfacePosition=position;",
          "flSurfacePosition=position+riverGrainOffset;",
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `vec3 cutPosition=flSurfacePosition-riverGrainOffset;
vec2 cutUV=vec2(cutPosition.x,-cutPosition.z)/2.8+.5;
float cutTop=step(.95,flSurfaceNormal.y);
// Trace the one-centimetre cavity at grazing angles: the near lip occludes
// its floor instead of leaving a flat, painted numeral on the walking face.
vec2 cavityUV=cutUV;
float cavityDepth=0.;
if(cutTop>.5){
  vec3 cutView=normalize(cameraPosition-flSurfaceWorld);
  vec2 cutStep=-vec2(cutView.x,-cutView.z)/max(cutView.y,.12)*(.01/2.8/8.);
  for(int j=0;j<8;j++){
    if(cavityDepth>=texture2D(riverCut,clamp(cavityUV,0.,1.)).a)break;
    cavityUV+=cutStep;cavityDepth+=.125;
  }
}
vec4 incision=texture2D(riverCut,clamp(cavityUV,0.,1.));
incision*=cutTop;
float cutOn=1.-smoothstep(riverSweep-.25,riverSweep+.25,cutPosition.x);
float tide=1.-smoothstep(-.66,-.29+flNoise(flSurfaceWorld*7.)*.12,flSurfaceWorld.y);
float strata=pow(flNoise(flSurfacePosition*vec3(2.,28.,2.)),3.)*(1.-cutTop);
vec2 drillP=vec2(fract((flSurfacePosition.x+flSurfacePosition.z)*2.6)-.5,flSurfacePosition.y);
float drill=(1.-smoothstep(.025,.06,abs(drillP.x)))*(1.-cutTop);
diffuseColor.rgb*=1.-tide*.55-strata*.30-drill*.28;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.018,.029,.016),tide*.28);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.009,.014,.016),incision.r*.88);
float cutRim=smoothstep(.012,.13,length(incision.gb-vec2(.5*cutTop)));
totalEmissiveRadiance+=vec3(1.,.19,.009)*cutOn*(incision.r*(.075+cutRim*.12)*(.72+.28*flNoise(flSurfacePosition*23.))+incision.a*.012);
#include <roughnessmap_fragment>
roughnessFactor=max(.19,roughnessFactor*(1.-tide*.3));`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clearcoat_normal_fragment_begin>",
        `
normal=normalize(normal+mat3(viewMatrix)*vec3((incision.g-.5*cutTop)*2.,0.,-(incision.b-.5*cutTop)*2.));
roughnessFactor=max(roughnessFactor,mix(.23,.08,flPool*flWet));
float toolHeight=-drill*.004-strata*.008;
normal=normalize(normal-(flHRX*dFdx(toolHeight)+flHRY*dFdy(toolHeight))/(sign(flHDet)*max(abs(flHDet),1e-8)));
#include <clearcoat_normal_fragment_begin>`,
      );
    };
    stone.customProgramCacheKey = () =>
      baseStone.customProgramCacheKey() + "-river-carved-v2";
    ownedMaterials.push(stone);
    const mesh = new T.Mesh(hewnGeometry(T, b, quality, i), stone);
    mesh.position.y = (b.min[1] + b.max[1]) / 2;
    mesh.castShadow = mesh.receiveShadow = true;
    body.add(mesh);
    // Iron staples sit below the walking face, at both ends of each side chain.
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        temp.position.set(b.x + side * 1.62, b.y - 0.22, b.z + end * 1.42);
        temp.rotation.set(0, (side * Math.PI) / 2, 0);
        temp.scale.set(1, 1, 1);
        temp.updateMatrix();
        anchorMatrices.push(temp.matrix.clone());
      }
    // Four thin, broken water curtains; their upper edge follows the block.
    const pourMat = wet.clone();
    pourMat.onBeforeCompile = wet.onBeforeCompile;
    pourMat.customProgramCacheKey = wet.customProgramCacheKey;
    ownedMaterials.push(pourMat);
    const sheets = [];
    for (let side = 0; side < 4; side++) {
      const angle = (side * Math.PI) / 2;
      const sheet = new T.PlaneGeometry(3.1, 2.2, 1, 1);
      sheet.rotateY(angle);
      sheet.translate(
        Math.sin(angle) * 1.608,
        b.y - 1.1,
        Math.cos(angle) * 1.608,
      );
      sheets.push(sheet);
    }
    const curtain = new T.Mesh(mergeGeometries(sheets), pourMat);
    curtain.userData.noReflect = true;
    body.add(curtain);
    sheets.forEach((g) => g.dispose());
    const fixture = {
      position: [b.x, b.y + 0.65, b.z],
      colour: 0xf7931a,
      intensity: 0,
      kind: "block",
    };
    // addLightFixture copies its record; retain a mutable vector for position,
    // but use a shared Color as the state-driven radiance (no new lights).
    const colour = new T.Color(0, 0, 0);
    fixture.colour = colour;
    fixture.intensity = 0.045;
    unregister.push(kit.addLightFixture(fixture));
    blocks.push({
      body,
      cut,
      pourMat,
      colour,
      risen: 0,
      drain: 0,
      seen: false,
    });
  }
  const anchors = kit.instances(anchorGeometry, iron, anchorMatrices);
  group.add(anchors);
  const perSpan = 24;
  const lengths = new Float32Array(33);
  const chains = new T.InstancedMesh(linkGeometry, iron, 9 * 2 * perSpan);
  chains.userData.noReflect = anchors.userData.noReflect = true;
  chains.receiveShadow = anchors.receiveShadow = true;
  group.add(chains);
  const up = new T.Vector3(0, 1, 0),
    tangent = new T.Vector3(),
    a = new T.Vector3(),
    b = new T.Vector3();
  let chainKey = "";
  function placeChains(snapshot) {
    const key = snapshot.blocks.map((b) => b.risen.toFixed(3)).join();
    if (key === chainKey) return;
    chainKey = key;
    // One pool follows all ten independently rising stones.
    weedPlacements.forEach((p, k) => {
      weedMatrix.copy(p.matrix);
      weedMatrix.elements[13] -= (1 - snapshot.blocks[p.block].risen) * 5;
      weeds.setMatrixAt(k, weedMatrix);
    });
    weeds.instanceMatrix.needsUpdate = true;
    weeds.computeBoundingSphere();
    let index = 0,
      anchorIndex = 0;
    for (let i = 0; i < 10; i++) {
      const e = sim.entities.blocks[i],
        rise = snapshot.blocks[i].risen;
      for (const side of [-1, 1])
        for (const end of [-1, 1]) {
          temp.position.set(
            e.x + side * 1.62,
            e.y - 0.22 - (1 - rise) * 5,
            e.z + end * 1.42,
          );
          temp.rotation.set(0, (side * Math.PI) / 2, 0);
          temp.scale.set(1, 1, 1);
          temp.updateMatrix();
          anchors.setMatrixAt(anchorIndex++, temp.matrix);
        }
      if (i === 9) continue;
      const next = sim.entities.blocks[i + 1],
        nextRise = snapshot.blocks[i + 1].risen;
      for (const side of [-1, 1]) {
        a.set(e.x + side * 1.68, e.y - 0.22 - (1 - rise) * 5, e.z - 1.42);
        b.set(
          next.x + side * 1.68,
          next.y - 0.22 - (1 - nextRise) * 5,
          next.z + 1.42,
        );
        // Fixed-pitch links pay out from the submerged end during emergence.
        // Arc-length spacing prevents stretched links near the steep anchors.
        lengths[0] = 0;
        let lastY = a.y;
        for (let j = 1; j <= 32; j++) {
          const t = j / 32,
            y = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.92;
          lengths[j] =
            lengths[j - 1] +
            Math.hypot((b.x - a.x) / 32, y - lastY, (b.z - a.z) / 32);
          lastY = y;
        }
        const count = Math.min(
          perSpan,
          Math.max(2, Math.ceil(lengths[32] / 0.3)),
        );
        for (let k = 0; k < count; k++) {
          const along = ((k + 0.5) / count) * lengths[32];
          let j = 1;
          while (j < 32 && lengths[j] < along) j++;
          const t =
            (j - 1 + (along - lengths[j - 1]) / (lengths[j] - lengths[j - 1])) /
            32;
          temp.position.lerpVectors(a, b, t);
          temp.position.y -= Math.sin(t * Math.PI) * 0.92;
          tangent.subVectors(b, a);
          tangent.y -= Math.cos(t * Math.PI) * Math.PI * 0.92;
          temp.quaternion.setFromUnitVectors(up, tangent.normalize());
          temp.rotateY(k % 2 ? 0 : Math.PI / 2);
          temp.scale.set(1, 1, 1);
          temp.updateMatrix();
          chains.setMatrixAt(index++, temp.matrix);
        }
      }
    }
    chains.count = index;
    chains.instanceMatrix.needsUpdate = true;
    anchors.instanceMatrix.needsUpdate = true;
    chains.computeBoundingSphere();
    anchors.computeBoundingSphere();
  }
  // Soft spray is separate from the curtains and never generates new geometry.
  const sprayCount = quality === "low" ? 100 : 300;
  const spray = kit.particles(sprayCount, {
    colour: 0xabc5ce,
    size: 0.045,
    opacity: 0.24,
  });
  const sprayPower = new T.BufferAttribute(new Float32Array(sprayCount), 1);
  spray.geometry.setAttribute("sprayPower", sprayPower);
  const sprayCompile = spray.material.onBeforeCompile;
  spray.material.onBeforeCompile = (shader) => {
    sprayCompile(shader);
    shader.vertexShader =
      `attribute float sprayPower;varying float sprayAlpha;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nsprayAlpha=sprayPower;",
      );
    shader.fragmentShader =
      `varying float sprayAlpha;\n${shader.fragmentShader}`.replace(
        "#include <opaque_fragment>",
        "diffuseColor.a*=sprayAlpha;\n#include <opaque_fragment>",
      );
  };
  spray.material.customProgramCacheKey = () => "river-spray-v2";
  spray.userData.noReflect = true;
  group.add(spray);
  return {
    update({ snapshot, dt, time }) {
      blocks.forEach((block, i) => {
        const state = snapshot.blocks[i];
        if (
          state.risen > block.risen + 0.0001 &&
          block.risen < 0.999 &&
          (state.risen < 0.999 || block.risen > 0.001)
        )
          block.drain = 1;
        else block.drain = Math.max(0, block.drain - dt * 0.085);
        if (!block.seen) {
          // Rebuilding a lit bridge restores its settled appearance. A newly
          // landed-on block still sweeps from left to right below.
          block.cut.value = state.lit ? 2.2 : -2.2;
          block.seen = true;
        }
        block.risen = state.risen;
        block.body.position.y = -(1 - state.risen) * 5;
        block.cut.value = state.lit
          ? Math.min(2.2, block.cut.value + dt * 3.4)
          : -2.2;
        block.colour.set(state.lit ? 0xf7931a : 0x000000);
        block.pourMat.opacity = block.drain * 0.54;
        block.pourMat.visible = state.risen > 0.13 && block.drain > 0.01;
      });
      placeChains(snapshot);
      const p = spray.geometry.attributes.position;
      for (let k = 0; k < sprayCount; k++) {
        const i = k % 10,
          e = sim.entities.blocks[i],
          phase = (time * 0.8 + k * 0.618) % 1;
        const side = k % 4,
          along = Math.sin(k * 91.7) * 1.52;
        const alive = blocks[i].drain > 0.02 && snapshot.blocks[i].risen > 0.1;
        sprayPower.setX(k, blocks[i].drain * (1 - phase * 0.6));
        p.setXYZ(
          k,
          e.x + (side < 2 ? along : side === 2 ? -1.64 : 1.64),
          alive
            ? Math.max(
                sim.WATER_Y + 0.015,
                e.y - (1 - snapshot.blocks[i].risen) * 5 - phase * phase * 2.7,
              )
            : -10,
          e.z + (side >= 2 ? along : side === 0 ? -1.64 : 1.64),
        );
      }
      p.needsUpdate = true;
      sprayPower.needsUpdate = true;
    },
    dispose() {
      unregister.forEach((f) => f());
      textures.forEach((t) => t.dispose());
      ownedMaterials.forEach((m) => m.dispose());
    },
  };
}
