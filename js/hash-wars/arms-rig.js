/** Rigid view rigs. Artist node pivots and sight positions stay intact. */
export async function createRigs({ T, kit, assets, viewGroup }) {
  let manifest = {};
  try {
    const response = await fetch("/assets/hash-wars/arms/manifest.json");
    if (response.ok) manifest = await response.json();
  } catch {
    /* An absent artist package is allowed during construction. */
  }
  const owned = [],
    shade = { value: new T.Vector2(1, 1) },
    eye = { value: new T.Vector3() },
    materialCopies = new Map(),
    geometryCopies = new Map();
  function localMaterial(source) {
    if (materialCopies.has(source)) return materialCopies.get(source);
    const m = source.clone(),
      compile = source.onBeforeCompile,
      key = source.customProgramCacheKey();
    m.forceSinglePass = true;
    m.onBeforeCompile = (shader) => {
      compile.call(source, shader);
      shader.uniforms.hwArmsShade = shade;
      shader.uniforms.hwArmsEye = eye;
      shader.uniforms.hwArmsCloud = kit.uniforms.cloudShadowMap;
      shader.uniforms.hwArmsBounds = kit.uniforms.cloudShadowBounds;
      // A cloned glTF primitive can retain the local compile hook. Chain it once.
      if (shader.fragmentShader.includes("uniform vec2 hwArmsShade;")) return;
      shader.fragmentShader =
        "uniform vec2 hwArmsShade;uniform vec3 hwArmsEye;uniform sampler2D hwArmsCloud;uniform vec4 hwArmsBounds;\n" +
        shader.fragmentShader;
      // Local shade blocks the sun, never the fixed muzzle point light.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_fragment_begin>",
        T.ShaderChunk.lights_fragment_begin
          .replace(
            "getDirectionalLightInfo( directionalLight, directLight );",
            `getDirectionalLightInfo( directionalLight, directLight );
 directLight.color*=hwArmsShade.x*texture2D(hwArmsCloud,(hwArmsEye.xz-hwArmsBounds.xy)/hwArmsBounds.zw).r;`,
          )
          // The muzzle point light sits centimetres from the receiver; at that range
          // its inverse-square peak burns white ceramic copper. Warm-white, a third
          // of the strength, and a soft ceiling keep white plates white.
          .replace(
            "getPointLightInfo( pointLight, geometryPosition, directLight );",
            `getPointLightInfo( pointLight, geometryPosition, directLight );
 directLight.color=mix(vec3(dot(directLight.color,vec3(.3333))),directLight.color,.3)*.33;
 directLight.color/=1.+directLight.color*.7;`,
          ),
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `outgoingLight=reflectedLight.directDiffuse+reflectedLight.directSpecular
 +(reflectedLight.indirectDiffuse+reflectedLight.indirectSpecular)*hwArmsShade.y+totalEmissiveRadiance;
#include <opaque_fragment>`,
      );
    };
    m.customProgramCacheKey = () => key + "-arms-local-shade-v3";
    owned.push(m);
    materialCopies.set(source, m);
    materialCopies.set(m, m);
    return m;
  }
  const rigs = {};
  for (const kind of ["carbine", "scatter", "rail", "arc"]) {
    const def =
      manifest.files?.[kind] ??
      manifest.weapons?.[kind] ??
      manifest.assets?.[kind];
    const path = "/assets/hash-wars/arms/" + (def?.file ?? kind + ".glb");
    await assets.load(path);
    const loadedModel = assets.instantiate(path, { node: def?.root ?? kind });
    if (!loadedModel)
      throw new Error(`ARMS missing rigid root ${kind} in ${path}`);
    const model = loadedModel;
    const anchor = new T.Group();
    anchor.name = "ARMS " + kind;
    anchor.add(model);
    viewGroup.add(anchor);
    const nodes = {},
      moving = [],
      glow = [];
    model.traverse((o) => {
      nodes[o.name] = o;
      if (o.isMesh) {
        if (!geometryCopies.has(o.geometry))
          geometryCopies.set(o.geometry, repairTangents(T, o.geometry));
        o.geometry = geometryCopies.get(o.geometry);
        o.receiveShadow = true;
        o.frustumCulled = false;
        o.material = Array.isArray(o.material)
          ? o.material.map(localMaterial)
          : localMaterial(o.material);
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        o.castShadow = materials.some(
          (m) => !m.transparent && !m.name.startsWith("emit:"),
        );
        for (const material of materials)
          if (material.name.startsWith("emit:") || /coil|core/.test(o.name))
            glow.push({
              material,
              channel:
                material.userData.channel ??
                (/coil/.test(o.name) ? "charge" : "heat"),
            });
      }
      if (/^(arm_l|arm_r|mag|cell|bolt|drum|vent.*|action)$/.test(o.name))
        moving.push({
          node: o,
          position: o.position.clone(),
          rotation: o.quaternion.clone(),
        });
    });
    const hip = new T.Vector3()
      .fromArray(def?.view?.position ?? [-0.105, 0.19, 0.43])
      .negate();
    // Offset the artist's eye laterally: a shouldered gun crosses the lower-right
    // quadrant, with both bracers continuing below the frame rather than floating.
    hip.x += 0.045;
    // Keep the support wrist visible while its downward forearm leaves the image.
    hip.y -= 0.03;
    hip.z *= 0.9;
    const aim = new T.Vector3()
      .fromArray(
        (loadedModel ? def?.aim?.position : null) ??
          nodes.sight?.position.toArray() ?? [0, 0.123, 0.373],
      )
      .negate();
    const shellMaterial =
      kind === "scatter" ? nodes.reticle.material.clone() : null;
    if (shellMaterial) {
      shellMaterial.onBeforeCompile = nodes.reticle.material.onBeforeCompile;
      shellMaterial.customProgramCacheKey =
        nodes.reticle.material.customProgramCacheKey;
      // A small new part has no atlas UVs. Reuse the untextured glow family
      // with emission off, rather than sampling the entire baked weapon atlas.
      shellMaterial.color.setHex(0xb65d45);
      shellMaterial.emissive.setHex(0);
      shellMaterial.emissiveIntensity = 0;
      shellMaterial.metalness = 0.1;
      shellMaterial.roughness = 0.58;
      owned.push(shellMaterial);
    }
    const shellGeometry =
      kind === "scatter" ? kit.roundedBox(0.022, 0.022, 0.058, 0.009) : null;
    const shell = shellGeometry
      ? new T.Mesh(shellGeometry, shellMaterial)
      : null;
    if (shell) {
      shell.name = "fresh shell";
      shell.receiveShadow = true;
      const headMaterial = shellMaterial.clone();
      headMaterial.onBeforeCompile = shellMaterial.onBeforeCompile;
      headMaterial.customProgramCacheKey = shellMaterial.customProgramCacheKey;
      headMaterial.color.setHex(0xb39454);
      headMaterial.metalness = 0.78;
      headMaterial.roughness = 0.36;
      owned.push(headMaterial);
      const head = kit.box(0.023, 0.023, 0.008, headMaterial, 0.003);
      head.position.z = 0.026;
      head.receiveShadow = true;
      shell.add(head);
      model.add(shell);
      shell.visible = false;
    }
    rigs[kind] = {
      kind,
      model,
      anchor,
      nodes,
      moving,
      glow,
      hip,
      aim,
      shell,
      ventOpen: 0,
    };
  }
  return {
    rigs,
    shade,
    eye,
    dispose() {
      for (const rig of Object.values(rigs)) rig.anchor.removeFromParent();
      owned.forEach((m) => m.dispose());
      for (const [source, copy] of geometryCopies)
        if (copy !== source) copy.dispose();
    },
  };
}

/** A zero exported tangent makes the vertex shader normalize(0), poisoning bloom.
 * Repair only invalid entries in an owned geometry; cached artist data stays intact.
 */
export function repairTangents(T, geometry) {
  const source = geometry.getAttribute("tangent"),
    normals = geometry.getAttribute("normal");
  if (!source || !normals) return geometry;
  let repaired = null;
  const normal = new T.Vector3(),
    tangent = new T.Vector3();
  for (let i = 0; i < source.count; i++) {
    const x = source.getX(i),
      y = source.getY(i),
      z = source.getZ(i),
      w = source.getW(i),
      length = x * x + y * y + z * z;
    if (
      Number.isFinite(length) &&
      length > 1e-12 &&
      Number.isFinite(w) &&
      w !== 0
    )
      continue;
    if (!repaired) {
      repaired = new T.Float32BufferAttribute(
        new Float32Array(source.count * 4),
        4,
      );
      for (let j = 0; j < source.count; j++)
        repaired.setXYZW(
          j,
          source.getX(j),
          source.getY(j),
          source.getZ(j),
          source.getW(j),
        );
    }
    normal.fromBufferAttribute(normals, i).normalize();
    if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() < 0.5)
      throw new Error("ARMS invalid normal beside an invalid exported tangent");
    const ax = Math.abs(normal.x),
      ay = Math.abs(normal.y),
      az = Math.abs(normal.z);
    if (ax <= ay && ax <= az) tangent.set(1, 0, 0);
    else if (ay <= az) tangent.set(0, 1, 0);
    else tangent.set(0, 0, 1);
    tangent.cross(normal).normalize();
    repaired.setXYZW(
      i,
      tangent.x,
      tangent.y,
      tangent.z,
      Number.isFinite(w) && w !== 0 ? w : 1,
    );
  }
  if (!repaired) return geometry;
  const copy = geometry.clone();
  copy.setAttribute("tangent", repaired);
  return copy;
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Rigid palms follow the removable part, then the operating handle, then their grip.
 * The lower forearm stays below the view edge while a hand leaves its support grip.
 */
export function reloadRig(rig, t, heat, charging, venting, time, reduced, dt) {
  const { nodes: n, moving } = rig;
  for (const rest of moving) {
    rest.node.position.copy(rest.position);
    rest.node.quaternion.copy(rest.rotation);
    rest.node.visible = true;
  }
  if (rig.shell) rig.shell.visible = false;
  const hand = n.arm_l;

  const reach = smooth(0.05, 0.19, t) * (1 - smooth(0.69, 0.82, t));
  if (rig.kind === "arc") {
    const target = venting ? smooth(0.1, 0.32, heat) : 0;
    rig.ventOpen += (target - rig.ventOpen) * (1 - Math.exp(-dt * 12));
    if (n.vent) n.vent.rotation.x -= rig.ventOpen * 0.64;
  } else if (t > 0) {
    if (rig.kind === "scatter") {
      const open = smooth(0.04, 0.2, t) * (1 - smooth(0.8, 0.94, t));
      if (n.bolt) n.bolt.position.z += 0.085 * open;
      if (n.drum) {
        n.drum.position.x -= 0.072 * open;
        // Each shell seats before indexing the next chamber: six clear stops.
        const shells = smooth(0.24, 0.76, t) * 6;
        n.drum.rotation.z +=
          ((Math.floor(shells) + smooth(0.68, 0.94, shells % 1)) * Math.PI) / 3;
      }
      if (hand && n.drum) {
        const cycle = (((t - 0.24) / 0.52) * 6) % 1;
        // Thumb shells in beside the drum, the glove kept in view.
        hand.position.lerp(n.drum.position, reach);
        hand.position.x -= 0.06 * reach;
        hand.position.y += 0.015 * reach;
        hand.position.z += (0.05 + 0.04 * Math.sin(cycle * Math.PI)) * reach;
        hand.rotation.z -= 0.35 * reach;
        if (rig.shell && t > 0.24 && t < 0.76) {
          rig.shell.visible = cycle < 0.82;
          rig.shell.position.copy(hand.position);
          rig.shell.position.x += 0.027;
          rig.shell.position.y += 0.018;
          rig.shell.position.z -= 0.035;
        }
      }
    } else {
      const mag = n.mag;
      const remove = smooth(0.2, 0.38, t);
      const insert = smooth(0.46, 0.66, t);
      // The magazine comes out down-and-left a hand's length, not out of frame;
      // the hand carries it, swaps it for the fresh one just below, and seats it.
      const out = remove * (1 - insert);
      const swapDip = smooth(0.34, 0.4, t) * (1 - smooth(0.42, 0.48, t));
      if (mag) {
        mag.position.y -= 0.085 * out + 0.015 * swapDip;
        mag.position.x -= 0.045 * out;
        mag.position.z += 0.03 * out;
        mag.rotation.x += 0.12 * out;
        mag.rotation.z += 0.3 * out;
        mag.visible = t < (rig.kind === "rail" ? 0.3 : 0.36) || t > 0.42;
      }
      if (hand && mag) {
        hand.position.lerp(mag.position, reach);
        hand.position.x -= 0.03 * reach;
        hand.position.y -= 0.04 * reach;
        hand.position.z += 0.02 * reach;
        hand.rotation.z -= 0.2 * reach;
        hand.rotation.x += 0.15 * reach;
      }
      const rack = smooth(0.78, 0.84, t) * (1 - smooth(0.87, 0.94, t));
      if (n.bolt) n.bolt.position.z += 0.07 * rack;
      if (hand && n.bolt) {
        hand.position.lerp(n.bolt.position, rack);
        hand.position.x -= 0.035 * rack;
        hand.rotation.x -= 0.2 * rack;
      }
    }
  }
  for (const e of rig.glow) {
    const chargeBack = smooth(0.68, 0.8, t) * (1 - smooth(0.86, 0.99, t));
    // Slow coil rise and heat breathing only; never a rhythmic flash.
    const breath = reduced ? 1 : 0.98 + 0.02 * Math.sin(time * 3);
    e.material.emissiveIntensity =
      e.channel === "charge"
        ? 0.2 + charging * 3 + chargeBack * 1.3
        : e.channel === "heat"
          ? (0.35 + heat * 2.2) * breath
          : 0.7;
  }
}
