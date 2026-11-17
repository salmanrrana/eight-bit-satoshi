/** Rigid Cartel rigs. Geometry and atlas materials are shared; emit uniforms are local. */
export function createRigs(ctx, manifest) {
  const { T, kit, assets, sim } = ctx;
  const owned = [],
    geometry = kit.roundedBox(1, 1, 1, 0.08);
  const shell = kit.material({
    color: 0xd3d9dc,
    metalness: 0.45,
    roughness: 0.43,
  });
  const carbon = kit.material({
    color: 0x171e24,
    metalness: 0.65,
    roughness: 0.55,
  });
  const sensor = kit.material({
    color: 0x57dfff,
    emissive: 0x57dfff,
    emissiveIntensity: 2,
  });
  function part(parent, name, x, y, z, w, h, d, mat = shell) {
    const pivot = new T.Group();
    pivot.name = name;
    pivot.position.set(x, y, z);
    const mesh = new T.Mesh(geometry, mat);
    mesh.scale.set(w, h, d);
    pivot.add(mesh);
    parent.add(pivot);
    return pivot;
  }
  // Proxies retain the delivered joint naming contract, so replacing an asset is build-only.
  function standIn(kind) {
    const root = new T.Group();
    root.name = kind;
    if (kind === "hauler") {
      const body = part(root, "body", 0, 0, 0, 5, 2, 14);
      for (const side of [-1, 1]) {
        part(body, "wing_" + side, side * 3.8, 0, -1, 4, 0.3, 5);
        part(
          body,
          "bay_" + (side < 0 ? "l" : "r"),
          side * 1.2,
          -1.05,
          0,
          2.2,
          0.18,
          7,
          carbon,
        );
        for (let i = 0; i < 2; i++)
          part(
            body,
            "thruster_" + (side < 0 ? i : i + 2),
            side * 3,
            -0.8,
            i * 7 - 3,
            1.3,
            0.6,
            1.8,
            sensor,
          );
      }
    } else if (kind === "siege") {
      const body = part(root, "body", 0, 2.5, 0, 8, 5, 22);
      for (let i = 0; i < 6; i++)
        part(
          body,
          "carapace_" + i,
          0,
          0.1,
          i * 3.4 - 8.5,
          8.3,
          2.5,
          2.8,
          i % 2 ? carbon : shell,
        );
    } else if (kind === "clamp") {
      const body = part(root, "body", 0, 0, 0, 1.6, 1.4, 1.6, carbon);
      for (const side of [-1, 1])
        part(body, "jaw_" + side, side * 0.75, 0, 0.5, 0.35, 1.8, 1.4);
      part(body, "coupling", 0, 0, 0.85, 1.1, 0.25, 0.1, sensor);
    } else {
      const watcher = kind === "watcher";
      const body = part(
        root,
        "body",
        0,
        watcher ? 2.55 : 1.2,
        0,
        watcher ? 0.6 : 1.4,
        watcher ? 0.65 : 1,
        watcher ? 1.2 : 1.5,
      );
      part(body, "gun", 0, -0.12, 0.7, 0.16, 0.16, 1, carbon);
      part(body, "sensor", 0, 0.02, 0.65, 0.48, 0.065, 0.06, sensor);
      if (watcher)
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3,
            x = Math.sin(a),
            z = Math.cos(a);
          const hip = part(
            body,
            "hip_" + i,
            x * 0.2,
            -0.25,
            z * 0.2,
            0.22,
            0.22,
            0.22,
            carbon,
          );
          const thigh = part(hip, "thigh_" + i, 0, 0, 0, 0.14, 1, 0.14, carbon);
          const shin = part(
            thigh,
            "shin_" + i,
            x * 0.5,
            -0.9,
            z * 0.5,
            0.12,
            1.3,
            0.12,
          );
          part(
            shin,
            "foot_" + i,
            x * 0.35,
            -1.26,
            z * 0.35,
            0.4,
            0.15,
            0.45,
            carbon,
          );
          // Centre the simple leg bars between their actual pivots.
          thigh.children[0].position.set(x * 0.25, -0.45, z * 0.25);
          shin.children[0].position.set(x * 0.175, -0.63, z * 0.175);
        }
    }
    return root;
  }
  function make(kind, lod = false, index = 0) {
    const partKind = kind === "clamp" || kind === "turret";
    const def = manifest.machines?.[partKind ? "siege" : kind],
      file = def?.file;
    const node = partKind ? kind + "_" + index : (def?.root ?? kind);
    const root =
      (file &&
        assets.instantiate("/assets/hash-wars/machines/" + file, {
          node,
          lod,
        })) ||
      standIn(kind);
    if (partKind) root.position.set(0, 0, 0);
    const nodes = {},
      emit = [],
      emitMaterials = new Map();
    root.traverse((o) => {
      nodes[o.name.replace(/_lod1(?=_|$)/g, "")] = o;
      if (!o.isMesh) return;
      const name = o.name.replace(/_lod1(?=_|$)/g, ""),
        parentName = o.parent?.name.replace(/_lod1(?=_|$)/g, "") ?? "";
      // Low casts hulls only; high keeps large limb/contact silhouettes, not tiny fixtures.
      const shadowPart =
        /^(body|thigh_|shin_|foot_|track_|thruster_|clamp_[0-2]($|_jaw|_coupling)|turret_[0-1]($|_head))/;
      o.castShadow =
        kind !== "gnat" &&
        (ctx.quality === "low"
          ? /^body($|_)/.test(name)
          : shadowPart.test(name) ||
            (o.parent?.isGroup && shadowPart.test(parentName)));
      o.receiveShadow = true;
      o.userData.noSkyVis = true;
      const local = (m) => {
        if (!(m.name.startsWith("emit:") || m === sensor)) return m;
        if (emitMaterials.has(m)) return emitMaterials.get(m);
        const copy = m.clone();
        if (kind === "clamp") {
          copy.color.set(0x65dce9);
          copy.emissive.set(0x42d8f0);
        }
        emitMaterials.set(m, copy);
        owned.push(copy);
        emit.push({
          material: copy,
          channel: m.userData.channel ?? m.name.slice(5),
        });
        return copy;
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(local)
        : local(o.material);
    });
    if (partKind && index) {
      for (const key of Object.keys(nodes))
        nodes[key.replace(kind + "_" + index, kind + "_0")] = nodes[key];
    }
    if (kind === "turret") {
      nodes.body = root;
      nodes.gun = nodes.turret_0_head ?? nodes.gun;
      nodes.muzzle = nodes.turret_0_muzzle ?? nodes.muzzle;
    }
    const legs = [];
    let specs = def?.legs;
    if (kind === "watcher" && !specs) {
      specs = {};
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3,
          x = Math.sin(a),
          z = Math.cos(a);
        specs[i] = {
          hip: [x * 0.2, 2.3, z * 0.2],
          knee: [x * 0.7, 1.4, z * 0.7],
          ankle: [x * 1.05, 0.14, z * 1.05],
          sole_y: 0.065,
        };
      }
    }
    for (const key of Object.keys(specs ?? {})) {
      const spec = specs[key],
        thigh = nodes["thigh_" + key],
        shin = nodes["shin_" + key],
        foot = nodes["foot_" + key];
      if (!thigh || !shin || !foot) continue;
      const hip = new T.Vector3(...spec.hip),
        knee = new T.Vector3(...spec.knee),
        ankle = new T.Vector3(...spec.ankle);
      const upper = knee.clone().sub(hip),
        lower = ankle.clone().sub(knee);
      legs.push({
        thigh,
        shin,
        foot,
        hip,
        ankle,
        upper: upper.normalize(),
        lower: lower.normalize(),
        l1: knee.distanceTo(hip),
        l2: ankle.distanceTo(knee),
        pole: knee.clone().sub(hip).normalize(),
        sole: ankle.y - (spec.sole_y ?? 0),
        planted: new T.Vector3(),
        start: new T.Vector3(),
        end: new T.Vector3(),
        target: new T.Vector3(),
        normal: new T.Vector3(0, 1, 0),
        progress: 1,
      });
    }
    return {
      root,
      nodes,
      emit,
      legs,
      meshes: collect(root),
      restBody: nodes.body?.position.clone(),
      restGun: nodes.gun?.rotation.clone(),
    };
  }
  function collect(root) {
    const list = [];
    root.traverse((o) => {
      if (o.isMesh) list.push(o);
    });
    return list;
  }
  // Ray support is limited by the ankle's current height: a foot cannot jump onto a roof.
  function ground(x, z, ceiling = Infinity) {
    let y = sim.groundY(x, z);
    for (const s of sim.layout) {
      if (s.dynamic === "boss") continue;
      if (s.shape === "box") {
        if (
          s.max[1] <= ceiling &&
          x >= s.min[0] &&
          x <= s.max[0] &&
          z >= s.min[2] &&
          z <= s.max[2]
        )
          y = Math.max(y, s.max[1]);
      } else if (
        s.y1 <= ceiling &&
        (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r
      )
        y = Math.max(y, s.y1);
    }
    return y;
  }
  const target = new T.Vector3(),
    axis = new T.Vector3(),
    bend = new T.Vector3(),
    knee = new T.Vector3(),
    dir = new T.Vector3(),
    q = new T.Quaternion(),
    inverse = new T.Quaternion(),
    tilt = new T.Quaternion(),
    worldUp = new T.Vector3(0, 1, 0);
  function solve(rig, bodyYaw) {
    const root = rig.root;
    if (!rig.legs.length) return;
    root.position.y = 0;
    root.updateMatrixWorld(true);
    // The hull yields to the longest loaded leg, so reaching cannot lift a planted sole.
    let drop = 0;
    for (const leg of rig.legs) {
      leg.thigh.getWorldPosition(target);
      const dx = target.x - leg.target.x,
        dz = target.z - leg.target.z,
        reach = leg.l1 + leg.l2 - 0.012;
      const available = Math.sqrt(
        Math.max(0.01, reach * reach - dx * dx - dz * dz),
      );
      drop = Math.max(drop, target.y - leg.target.y - available);
    }
    root.position.y = -drop;
    root.updateMatrixWorld(true);
    for (const leg of rig.legs) {
      // Work in the thigh parent's frame; the pole chooses the authored knee side.
      target.copy(leg.target);
      leg.thigh.parent.worldToLocal(target);
      target.sub(leg.thigh.position);
      const d = Math.max(
        0.03,
        Math.min(target.length(), leg.l1 + leg.l2 - 0.008),
      );
      dir.copy(target).normalize();
      axis.copy(leg.pole).addScaledVector(dir, -leg.pole.dot(dir)).normalize();
      const along = (leg.l1 * leg.l1 - leg.l2 * leg.l2 + d * d) / (2 * d);
      knee
        .copy(dir)
        .multiplyScalar(along)
        .addScaledVector(
          axis,
          Math.sqrt(Math.max(0, leg.l1 * leg.l1 - along * along)),
        );
      leg.thigh.quaternion.setFromUnitVectors(
        leg.upper,
        bend.copy(knee).normalize(),
      );
      inverse.copy(leg.thigh.quaternion).invert();
      bend.copy(target).sub(knee).applyQuaternion(inverse).normalize();
      leg.shin.quaternion.setFromUnitVectors(leg.lower, bend);
      leg.shin.updateWorldMatrix(true, false);
      leg.shin.getWorldQuaternion(inverse).invert();
      q.setFromAxisAngle(axis.set(0, 1, 0), bodyYaw);
      // Terrain-aligned soles; rotate their rest ankle-to-sole offset with the slope.
      tilt.setFromUnitVectors(worldUp, leg.normal);
      q.premultiply(tilt);
      inverse.multiply(q);
      leg.foot.quaternion.copy(inverse);
    }
  }
  return {
    make,
    ground,
    solve,
    owned,
    dispose() {
      owned.forEach((m) => m.dispose());
    },
  };
}
