import { buildFire } from "./story-items-fire.js";
import { surface } from "./surfaces.js";
import { detailBuilder } from "./story-items-bots.js";

// Soft smoke and exhaust volumes for stomp bursts and the open mining rigs.
function volumeMaterial(T, kit, own, type, reduced) {
  const smoke = type === "smoke",
    heat = type === "heat";
  return own(
    new T.ShaderMaterial({
      uniforms: {
        time: kit.uniforms.time,
        wind: kit.uniforms.wind,
        motion: { value: reduced ? 0 : 1 },
        ambient: kit.uniforms.skyAmbient,
      },
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.NormalBlending,
      vertexShader: `uniform float time,motion; varying vec3 p,n,v;varying float density,seed;
    void main(){p=position;mat3 basis=mat3(instanceMatrix);
    vec3 correction=max(vec3(.00001),vec3(dot(basis[0],basis[0]),dot(basis[1],basis[1]),dot(basis[2],basis[2])));
    n=normalize(normalMatrix*basis*(normal/correction));vec3 q=position;
    density=${smoke ? "1.-smoothstep(1.2,1.95,length(basis[0]))" : "1."};
    seed=instanceMatrix[3].x*8.+instanceMatrix[3].z*3.;
    q.x+=sin(q.y*8.+time*1.2*motion+q.z*6.)*.09*(q.y+.5);
    q.z+=sin(q.y*6.-time*.9*motion+q.x*8.)*.07;
    ${!smoke && !heat ? "q.xz*=1.-smoothstep(-.1,.5,q.y)*.85;q.x+=pow(q.y+.5,2.)*sin(time*.7*motion+p.z*9.)*.16;" : ""}
    vec4 world=instanceMatrix*vec4(q,1.);vec4 view=modelViewMatrix*world;v=normalize(-view.xyz);
    gl_Position=projectionMatrix*view;}`,
      fragmentShader: `uniform float time,motion;uniform vec3 ambient; varying vec3 p,n,v;varying float density,seed;
    ${kit.noiseGLSL}
    void main(){float edge=pow(abs(dot(normalize(n),normalize(v))),1.4);
    float grain=fbm(p*6.+vec3(seed,-time*.65*motion,time*.1*motion));
    float mask=smoothstep(.22,.62,grain)*edge*density;
    ${!smoke && !heat ? "mask*=1.-smoothstep(.12,.5,p.y)*.72;" : ""}
    ${smoke ? "vec3 colour=mix(vec3(.11,.105,.10),ambient*.7,.45);float alpha=mask*.24;" : heat ? "vec3 colour=ambient;float alpha=mask*.025;" : "float core=clamp(.35-p.y*.95+grain*.2,0.,1.); vec3 colour=mix(vec3(1.5,.06,.003),vec3(2.,.7,.06),core);float alpha=mask*.65;"}
    gl_FragColor=vec4(colour,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
    }),
  );
}

function softPool(T, kit, own, colour, size, intensity) {
  const material = kit.material({
    color: colour,
    emissive: colour,
    emissiveIntensity: intensity,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    base(shader);
    shader.vertexShader =
      "varying vec2 poolUv;\n" +
      shader.vertexShader.replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\npoolUv=uv;",
      );
    shader.fragmentShader =
      "varying vec2 poolUv;\n" +
      shader.fragmentShader.replace(
        "#include <alphatest_fragment>",
        "diffuseColor.a*=pow(max(0.,1.-length((poolUv-.5)*2.)),2.);\n#include <alphatest_fragment>",
      );
  };
  material.customProgramCacheKey = () => "items-light-pool-v1";
  const mesh = new T.Mesh(
    own(new T.PlaneGeometry(size[0], size[1], 12, 12)),
    material,
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function buildHazards(ctx, own, billMaterial, reduced) {
  const { T, kit, sim, zoneGroup, quality } = ctx;
  const materials = {
    rubber: surface(kit, "rubber", { space: "object", scale: 0.14 }),
    copper: surface(kit, "brass", {
      space: "object",
      tint: 0x9d5739,
      scale: 0.15,
    }),
    char: surface(kit, "paper", {
      space: "object",
      tint: 0x27211d,
      scale: 0.15,
    }),
  };
  const unregister = [];
  // The road already renders this horizontal mirror. Reuse its image for street
  // puddles instead of paying for another scene pass for each downed cable.
  let streetMirror;
  ctx.scene?.traverse((object) => {
    if (
      object.isReflector &&
      object.parent === zoneGroup(0) &&
      Math.abs(object.position.y - 0.016) < 0.01
    )
      streetMirror = object;
  });
  const reflectionFallback = own(
    new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1),
  );
  reflectionFallback.needsUpdate = true;
  const mirrorInverse = new T.Matrix4();
  if (streetMirror) {
    streetMirror.updateWorldMatrix(true, false);
    mirrorInverse.copy(streetMirror.matrixWorld).invert();
  }
  materials.char.side = T.DoubleSide;
  const hazards = sim.entities.hazards.map((e, index) => {
    const root = new T.Group();
    root.userData.storyHazard = e.kind;
    root.position.set(e.x, e.y, e.z);
    zoneGroup(e.zone).add(root);
    const [w, , d] = e.size;
    const b = detailBuilder(T, kit, own, quality);
    if (e.kind === "electric") {
      const water = kit.material({
        color: 0x343d43,
        roughness: 0.035,
        metalness: 0.85,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        envMapIntensity: 1.65,
      });
      const mirrorSample = {
        value:
          streetMirror?.material.uniforms.tDiffuse.value ?? reflectionFallback,
      };
      const waterBaseCompile = water.onBeforeCompile;
      water.onBeforeCompile = (shader) => {
        waterBaseCompile(shader);
        if (streetMirror && e.zone === 0) {
          shader.uniforms.itemMirror = mirrorSample;
          shader.uniforms.itemMirrorMatrix =
            streetMirror.material.uniforms.textureMatrix;
          shader.uniforms.itemMirrorInverse = { value: mirrorInverse };
          shader.vertexShader =
            "uniform mat4 itemMirrorMatrix,itemMirrorInverse;varying vec4 itemMirrorUv;\n" +
            shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            "#include <project_vertex>\nitemMirrorUv=itemMirrorMatrix*itemMirrorInverse*modelMatrix*vec4(transformed,1.);",
          );
          shader.fragmentShader =
            "uniform sampler2D itemMirror;varying vec4 itemMirrorUv;\n" +
            shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <opaque_fragment>",
            `vec4 reflectedUv=itemMirrorUv;
            reflectedUv.xy+=vec2(sin(time*.7+wetUv.y*41.),cos(wetUv.x*37.-time*.6))*.00015*reflectedUv.w*rain;
            vec3 standingReflection=texture2DProj(itemMirror,reflectedUv).rgb;
            float waterFresnel=pow(1.-abs(dot(normal,normalize(vViewPosition))),5.);
            outgoingLight=mix(outgoingLight,standingReflection,.45+waterFresnel*.45);
            #include <opaque_fragment>`,
          );
        }
        shader.fragmentShader = "varying vec2 wetUv;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          float ripple=sin(length(fract(wetUv*vec2(13.,11.))-.5)*46.-time*1.5)*rain*.0007;
          normal=normalize(normal+vec3(dFdx(ripple),dFdy(ripple),0.));`,
        );
        shader.vertexShader =
          "varying vec2 wetUv;\n" +
          shader.vertexShader.replace(
            "#include <uv_vertex>",
            "#include <uv_vertex>\nwetUv=uv;",
          );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          `float contour=length((wetUv-.5)*2.);
          float shore=.91+.045*sin(wetUv.x*19.+wetUv.y*17.)+.025*sin(wetUv.y*41.);
          diffuseColor.a*=1.-smoothstep(shore-.06,shore+.03,contour);
          #include <opaque_fragment>`,
        );
      };
      water.customProgramCacheKey = () =>
        `first-light-items-water-edge-v5-${Boolean(streetMirror && e.zone === 0)}`;
      // The broken water edge stays inside the collision footprint.
      const sheet = new T.Mesh(
        own(
          new T.PlaneGeometry(
            w,
            d,
            quality === "low" ? 8 : 28,
            quality === "low" ? 6 : 18,
          ),
        ),
        water,
      );
      const boundary = sheet.geometry.attributes.position;
      for (let n = 0; n < boundary.count; n++) {
        const x = boundary.getX(n),
          y = boundary.getY(n);
        const edge = Math.max(Math.abs(x) / (w / 2), Math.abs(y) / (d / 2));
        const inset =
          1 -
          Math.max(0, edge - 0.78) * (0.18 + 0.11 * Math.sin(x * 17 + y * 9));
        boundary.setXY(n, x * inset, y * inset);
      }
      if (streetMirror && e.zone === 0)
        sheet.onBeforeRender = (renderer) => {
          // Never sample a texture while it is the current mirror render target.
          mirrorSample.value =
            renderer.getRenderTarget() === streetMirror.getRenderTarget()
              ? reflectionFallback
              : streetMirror.material.uniforms.tDiffuse.value;
        };
      sheet.renderOrder = 1; // Sample the road mirror only after its main-view draw.
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.y = 0.017;
      sheet.receiveShadow = true;
      root.add(sheet);
      const pool = softPool(T, kit, own, 0x699dd5, [w, d], 0.7);
      pool.renderOrder = 2;
      pool.position.y = 0.02;
      root.add(pool);
      const cablePoints = [];
      for (let n = 0; n < 14; n++)
        cablePoints.push([
          -w * 0.45 + (w * 0.73 * n) / 13,
          0.043,
          Math.sin(n * 0.54) * d * 0.28,
        ]);
      b.tube(materials.rubber, cablePoints, 0.034, quality === "low" ? 32 : 72);
      const end = cablePoints[cablePoints.length - 1];
      for (let n = 0; n < 9; n++)
        b.tube(
          materials.copper,
          [
            end,
            [end[0] + 0.05, 0.03, end[2] + (n - 4) * 0.009],
            [end[0] + 0.1, 0.023, end[2] + (n - 4) * 0.016],
          ],
          0.003,
        );
      b.finish(root, false);
      const arcs = new T.Group();
      arcs.userData.motionEffect = "electric-arc";
      root.add(arcs);
      const arcMaterial = kit.material({
        color: 0xb5ddff,
        emissive: 0x9bd3ff,
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const arcCompile = arcMaterial.onBeforeCompile;
      arcMaterial.onBeforeCompile = (shader) => {
        arcCompile(shader);
        shader.uniforms.arcClock = kit.uniforms.time;
        shader.uniforms.arcRoot = { value: new T.Vector2(end[0], end[2]) };
        shader.vertexShader =
          "uniform float arcClock;uniform vec2 arcRoot;\n" +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          float away=smoothstep(.04,.25,length(position.xz-arcRoot));
          transformed.x+=sin(position.x*21.+position.z*15.+arcClock*.55)*.014*away;
          transformed.z+=cos(position.z*31.-position.x*17.-arcClock*.43)*.014*away;`,
        );
      };
      arcMaterial.customProgramCacheKey = () => "items-crawling-arc-v1";
      const arcBuilder = detailBuilder(T, kit, own, quality);
      for (let a = 0; a < 4; a++) {
        const points = [];
        for (let n = 0; n < 16; n++) {
          const f = n / 15;
          const angle = a * 1.9 + 0.7;
          points.push([
            end[0] * (1 - f) + Math.cos(angle) * w * 0.37 * f,
            0.026 + Math.sin(f * Math.PI) * 0.012,
            end[2] * (1 - f) +
              Math.sin(angle) * d * 0.4 * f +
              Math.sin(f * 49 + a * 2) * 0.018,
          ]);
        }
        arcBuilder.tube(arcMaterial, points, 0.0028);
      }
      arcBuilder.finish(arcs, false);
      arcs.children.forEach((mesh) => {
        mesh.renderOrder = 3;
      });
      arcs.visible = !reduced;
      if (index === 0 || index === 2)
        unregister.push(
          kit.addLightFixture({
            position: [e.x + end[0], e.y + 0.09, e.z + end[2]],
            colour: 0x76b4ef,
            intensity: 1,
            kind: "electric-water",
          }),
        );
      return { root, arcs, arcMaterial, pool, kind: e.kind, index };
    }
    const pool = softPool(T, kit, own, 0xd05e1f, [w, d], 0.65);
    pool.position.y = 0.012;
    root.add(pool);
    const scorch = softPool(T, kit, own, 0x0a0806, [w, d], 0);
    scorch.material.opacity = 0.94;
    scorch.position.y = 0.007;
    root.add(scorch);
    // Follow the sloping meadow so the scorch and spill sit on the actual ground.
    for (const patch of [scorch, pool]) {
      const positions = patch.geometry.attributes.position;
      for (let n = 0; n < positions.count; n++)
        positions.setZ(
          n,
          sim.groundY(e.x + positions.getX(n), e.z - positions.getY(n)) - e.y,
        );
      patch.geometry.computeVertexNormals();
    }
    // Scorched, folded sheets and loose damp notes retain the hazard's full footprint.
    for (let n = 0; n < (quality === "low" ? 24 : 44); n++) {
      const a = n * 2.39996,
        r = Math.sqrt(n / (quality === "low" ? 24 : 44));
      const x = Math.cos(a) * r * w * 0.32,
        z = Math.sin(a) * r * d * 0.32;
      const y = sim.groundY(e.x + x, e.z + z) - e.y + 0.018 + (1 - r) * 0.15;
      const paper = new T.PlaneGeometry(0.22, 0.1, 8, 3);
      const positions = paper.attributes.position;
      for (let i = 0; i < positions.count; i++)
        positions.setZ(
          i,
          Math.pow(positions.getX(i) / 0.11, 2) * 0.038 +
            Math.sin(positions.getY(i) * 30 + n) * 0.007,
        );
      paper.computeVertexNormals();
      b.put(
        paper,
        n % 5 ? materials.char : billMaterial,
        [x, y, z],
        [-Math.PI / 2 + Math.sin(n) * 0.2, a, Math.cos(n * 3) * 0.25],
      );
      paper.dispose();
    }
    b.finish(root, false);
    const fire = buildFire(ctx, own, root, w, d, reduced);
    unregister.push(
      kit.addLightFixture({
        position: [e.x, e.y + 0.35, e.z],
        colour: 0xff8e42,
        intensity: 8,
        kind: "burning-paper",
      }),
    );
    return { root, fire, kind: e.kind, index, w, d };
  });
  return {
    update(time, env) {
      const t = reduced ? 0 : time;
      for (const h of hazards) {
        if (h.kind === "electric") {
          h.arcMaterial.opacity = 0.32 + Math.sin(t * 0.65 + h.index) * 0.1;
          continue;
        }
        h.fire.update(time, env);
      }
    },
    dispose() {
      unregister.forEach((remove) => remove());
    },
  };
}

// Preallocated effects for pickup and stomp edges, shared with the coin mint.
export function buildBursts(ctx, own, coinGeometry, gold, machines, reduced) {
  const { T, kit, sim, zoneGroup, quality } = ctx;
  const sparkMaterial = kit.material({
    color: 0xe6bc68,
    emissive: 0xffd18c,
    emissiveIntensity: 1.3,
  });
  const sparkGeometry = own(new T.SphereGeometry(0.011, 5, 4));
  const smokeMaterial = volumeMaterial(T, kit, own, "smoke", reduced);
  const heatMaterial = volumeMaterial(T, kit, own, "heat", reduced);
  const exhausts = machines
    .filter((bot) => bot.entity.kind === "miner")
    .map((bot) => {
      const mesh = new T.InstancedMesh(
        own(new T.SphereGeometry(0.5, 10, 8)),
        heatMaterial,
        2,
      );
      mesh.frustumCulled = false;
      bot.root.add(mesh);
      return { mesh, bot };
    });
  const events = [
    ...sim.entities.coins.map((e, i) => ({
      entity: e,
      coin: i,
      age: 100,
      wasTaken: false,
    })),
    ...machines.map((bot) => ({ entity: bot.entity, bot, age: 100 })),
  ];
  const spillGeometry =
    quality === "low"
      ? own(
          new T.CylinderGeometry(0.157, 0.157, 0.026, 12).rotateX(Math.PI / 2),
        )
      : coinGeometry;
  const batches = Array.from({ length: 7 }, (_, zone) => {
    const local = events.filter((e) => e.entity.zone === zone);
    if (!local.length) return null;
    const sparks = new T.InstancedMesh(
      sparkGeometry,
      sparkMaterial,
      local.length * 6,
    );
    let botCount = 0;
    for (const event of local) if (event.bot) event.effectIndex = botCount++;
    const coins = new T.InstancedMesh(spillGeometry, gold, botCount * 3);
    const smoke = new T.InstancedMesh(
      own(new T.SphereGeometry(0.5, 10, 8)),
      smokeMaterial,
      botCount * 3,
    );
    for (const mesh of [sparks, coins, smoke]) {
      zoneGroup(zone).add(mesh);
      mesh.frustumCulled = false;
    }
    return { local, sparks, coins, smoke };
  });
  const d = new T.Object3D();
  function instance(mesh, i, x, y, z, scale, angle = 0) {
    d.position.set(x, y, z);
    d.scale.setScalar(scale);
    d.rotation.set(angle * 0.4, angle, angle * 0.1);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  }
  return {
    update(snapshot, dt, time) {
      for (const { mesh, bot } of exhausts) {
        mesh.visible = !reduced && snapshot.enemies[bot.index].alive;
        for (let n = 0; n < 2; n++) {
          d.position.set(n ? 0.15 : -0.15, 0.72, -0.15);
          d.scale.set(0.23, 0.29, 0.23);
          d.rotation.set(0, time * 0.1, 0);
          d.updateMatrix();
          mesh.setMatrixAt(n, d.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
      for (const batch of batches)
        if (batch) {
          let active = false;
          batch.local.forEach((event, i) => {
            const taken = event.bot
              ? !snapshot.enemies[event.bot.index].alive
              : snapshot.coinsTaken[event.coin];
            if (taken && !event.wasTaken) event.age = 0;
            event.wasTaken = taken;
            event.age += dt;
            const t = event.age;
            const life = reduced
              ? 0
              : Math.max(0, 1 - t / (event.bot ? 1.8 : 0.65));
            active ||= life > 0;
            const e = event.bot
              ? snapshot.enemies[event.bot.index]
              : event.entity;
            for (let n = 0; n < 6; n++) {
              const a = (n * Math.PI) / 3 + i;
              instance(
                batch.sparks,
                i * 6 + n,
                e.x + Math.cos(a) * t * 0.65,
                e.y + 0.22 + t * (event.bot ? 1.4 : 0.65) - t * t * 0.8,
                e.z + Math.sin(a) * t * 0.65,
                life * (event.bot ? 1 : 0.6),
              );
            }
            if (event.bot)
              for (let n = 0; n < 3; n++) {
                const a = n * 2.1;
                instance(
                  batch.coins,
                  event.effectIndex * 3 + n,
                  e.x + Math.cos(a) * t * 0.4,
                  e.y + Math.max(0.04, 0.3 + t * (1.3 + n * 0.2) - t * t * 1.4),
                  e.z + Math.sin(a) * t * 0.4,
                  event.bot ? life * 0.4 : 0,
                  time * 5 + n,
                );
                instance(
                  batch.smoke,
                  event.effectIndex * 3 + n,
                  e.x + t * 0.15,
                  e.y + 0.25 + t * 0.45 + n * 0.12,
                  e.z,
                  event.bot ? life * (0.15 + t * 0.3) : 0,
                );
              }
          });
          for (const mesh of [batch.sparks, batch.coins, batch.smoke]) {
            mesh.visible = active;
            mesh.instanceMatrix.needsUpdate = true;
          }
        }
    },
  };
}
