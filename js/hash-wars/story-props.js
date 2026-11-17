import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { drawDisplay } from "./story-materials.js";

/** Field equipment is built once. Pools never clone a weapon during play. */
export async function props(ctx, mat, own, motion) {
  const { T, kit, sim, assets, scene, zoneGroup } = ctx;
  const geometry = [],
    batches = [],
    privateMaterials = [];
  const lensCache = new Map();
  const identity = new T.Matrix4();
  // Use the same instanced asset shader families as STATIONS, including
  // single props. Wrapper groups preserve every artist-authored rigid pivot.
  function asInstances(object) {
    if (!object.isMesh) {
      for (const child of [...object.children]) {
        object.remove(child);
        object.add(asInstances(child));
      }
      return object;
    }
    const group = new T.Group();
    group.name = object.name;
    group.position.copy(object.position);
    group.quaternion.copy(object.quaternion);
    group.scale.copy(object.scale);
    const batch = new T.InstancedMesh(object.geometry, object.material, 1);
    batch.setMatrixAt(0, identity);
    batch.castShadow = object.castShadow;
    batch.receiveShadow = object.receiveShadow;
    batch.userData.noSkyVis = object.userData.noSkyVis;
    group.add(batch);
    batches.push(batch);
    for (const child of [...object.children]) {
      object.remove(child);
      group.add(asInstances(child));
    }
    return group;
  }
  const box = (w, h, d, m) =>
    kit.box(w, h, d, m, Math.min(0.025, w / 5, h / 5, d / 5));
  const lod = ctx.quality === "low";
  const piece = (file, node) =>
    assets.instantiate(`/assets/hash-wars/structures/${file}.glb`, {
      node,
      lod,
    });
  await Promise.all(
    ["station", "props"].map((file) =>
      assets.load(`/assets/hash-wars/structures/${file}.glb`),
    ),
  );
  let keeper;
  assets.get("/assets/hash-wars/structures/props.glb")?.traverse((o) => {
    if (!o.isMesh || keeper) return;
    keeper = (Array.isArray(o.material) ? o.material : [o.material]).find(
      (m) => m.name === "tex:keeper",
    );
  });
  if (keeper) {
    const orm = mat.canvas(4, 4),
      normal = mat.canvas(4, 4);
    orm.context.fillStyle = "rgb(255,100,255)";
    orm.context.fillRect(0, 0, 4, 4);
    normal.context.fillStyle = "rgb(128,128,255)";
    normal.context.fillRect(0, 0, 4, 4);
    for (const image of [orm, normal]) {
      image.texture.colorSpace = T.NoColorSpace;
      image.texture.needsUpdate = true;
    }
    const coin = keeper.clone();
    coin.map = mat.coin.map;
    coin.normalMap = normal.texture;
    coin.aoMap = coin.roughnessMap = coin.metalnessMap = orm.texture;
    coin.color.set(0xffffff);
    coin.roughness = 0.7;
    coin.metalness = 1;
    coin.emissive.set(0x402305);
    coin.emissiveIntensity = 0.05;
    mat.coin = coin;
    privateMaterials.push(coin);
  }
  const kinds = Object.keys(sim.WEAPONS);
  // Renderer preload reads the current manifest. Missing world exports use
  // the stand-in until the next level load; no runtime fetch/compile hitch.
  function fallback(kind) {
    const root = new T.Group(),
      arc = kind === "arc",
      rail = kind === "rail";
    const body = box(arc ? 0.18 : 0.105, 0.17, rail ? 0.52 : 0.4, mat.ceramic);
    body.position.z = -0.13;
    root.add(body);
    const frame = box(0.08, 0.06, rail ? 1.1 : 0.66, mat.metal);
    frame.position.set(0, 0.07, -0.18);
    root.add(frame);
    const grip = box(0.08, 0.19, 0.11, mat.metal);
    grip.position.set(0, -0.12, 0.04);
    grip.rotation.x = -0.2;
    root.add(grip);
    if (!arc) {
      const stock = box(0.095, 0.13, 0.24, mat.metal);
      stock.position.z = 0.26;
      root.add(stock);
      const mag = box(0.075, 0.18, 0.13, mat.metal);
      mag.position.set(0, -0.13, -0.15);
      root.add(mag);
    }
    const band = box(0.009, 0.035, 0.28, arc ? mat.cyan : mat.amber);
    band.position.set(0.058, 0.015, -0.15);
    root.add(band);
    if (kind === "scatter") {
      for (const x of [-0.06, 0.06]) {
        const barrel = box(0.06, 0.06, 0.32, mat.metal);
        barrel.position.set(x, 0, -0.42);
        root.add(barrel);
      }
    }
    const groups = new Map();
    root.updateMatrixWorld(true);
    for (const mesh of root.children) {
      const copy = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if (!groups.has(mesh.material)) groups.set(mesh.material, []);
      groups.get(mesh.material).push(copy);
    }
    root.clear();
    for (const [material, parts] of groups) {
      const merged = mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());
      geometry.push(merged);
      root.add(new T.Mesh(merged, material));
    }
    return root;
  }
  const prototypes = new Map(
    kinds.map((kind) => [
      kind,
      assets.instantiate(`/assets/hash-wars/arms/${kind}.glb`, {
        node: `${kind}_world`,
        lod,
      }) ?? fallback(kind),
    ]),
  );
  function weapon(kind) {
    const root = prototypes.get(kind).clone(true);
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        o.userData.noSkyVis = true;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const mapped = list.map((m) => {
          if (m.userData.channel) return kind === "arc" ? mat.cyan : mat.amber;
          if (!m.transparent || m.side !== T.DoubleSide) return m;
          if (!lensCache.has(m)) {
            const lens = m.clone();
            lens.forceSinglePass = true;
            privateMaterials.push(lens);
            lensCache.set(m, lens);
          }
          return lensCache.get(m);
        });
        o.material = Array.isArray(o.material) ? mapped : mapped[0];
      }
    });
    return root;
  }
  const markerGeometry = new T.PlaneGeometry(0.13, 1);
  geometry.push(markerGeometry);
  const stripGeometry = box(0.007, 0.035, 0.3, mat.amber).geometry;
  function marker(parent, height = 0.7) {
    const mesh = new T.Mesh(markerGeometry, mat.glint);
    mesh.scale.y = height;
    mesh.position.y = height / 2;
    mesh.userData.noSkyVis = true;
    parent.add(mesh);
    return mesh;
  }
  const pools = kinds.map((kind) => ({
    kind,
    count: 0,
    slots: Array.from({ length: kind === "arc" ? 32 : 16 }, () => {
      const group = own(new T.Group(), scene),
        mesh = weapon(kind);
      group.add(mesh);
      mesh.rotation.z = Math.PI / 2;
      const light = new T.Mesh(
        stripGeometry,
        kind === "arc" ? mat.cyan : mat.amber,
      );
      light.position.set(0, 0.035, -0.12);
      mesh.add(light);
      const glint = marker(group);
      const opaque = [];
      mesh.traverseVisible((part) => {
        if (!part.isMesh) return;
        const materials = Array.isArray(part.material)
          ? part.material
          : [part.material];
        if (materials.every((material) => !material.transparent))
          opaque.push(part);
      });
      group.visible = false;
      group.name = `story-weapon-${kind}`;
      const support = -new T.Box3().setFromObject(mesh).min.y;
      return {
        group,
        mesh,
        glint,
        opaque,
        kind,
        id: -1,
        age: 0,
        ground: 0,
        support,
      };
    }),
  }));
  const pickupGlints = own(
    new T.InstancedMesh(
      markerGeometry,
      mat.glint,
      pools.reduce((count, pool) => count + pool.slots.length, 0),
    ),
    scene,
  );
  pickupGlints.name = "STORY pickup markers";
  pickupGlints.frustumCulled = false;
  pickupGlints.userData.noSkyVis = true;
  pickupGlints.instanceMatrix.setUsage(T.DynamicDrawUsage);
  batches.push(pickupGlints);
  for (const pool of pools)
    for (const slot of pool.slots) slot.glint.layers.set(1);
  const scatter = sim.entities.pickups.find((e) => e.kind === "scatter"),
    rail = sim.entities.pickups.find((e) => e.kind === "rail");
  function housing(e, node, hingeName, angle) {
    const root = own(new T.Group(), zoneGroup(e.zone));
    root.position.set(e.x, e.y, e.z);
    const source = piece("props", node),
      model = source ? asInstances(source) : null;
    if (model) root.add(model);
    else {
      const proxy = box(
        node === "weapon_rack" ? 2.5 : 1.8,
        node === "weapon_rack" ? 2.52 : 0.52,
        0.8,
        mat.metal,
      );
      proxy.position.y = node === "weapon_rack" ? 1.26 : 0.26;
      root.add(proxy);
    }
    const hinge = model?.getObjectByName(hingeName);
    return { root, hinge, angle, open: 0, e };
  }
  const rack = housing(
    scatter,
    "weapon_rack",
    "rack_door",
    (-110 * Math.PI) / 180,
  );
  const gunRack = weapon("scatter");
  gunRack.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  gunRack.position.set(0, 1.18, 0.48);
  rack.root.add(gunRack);
  const backer = box(0.25, 1.15, 0.018, mat.ceramic);
  backer.position.set(0, 1.22, 0.38);
  rack.root.add(backer);
  const rackGlint = marker(rack.root, 0.9);
  rackGlint.position.set(0, 1.3, 0.66);
  const caseBox = housing(
    rail,
    "weapon_case",
    "case_lid",
    (-105 * Math.PI) / 180,
  );
  const gunCase = weapon("rail");
  gunCase.rotation.set(0, Math.PI / 2, Math.PI / 2);
  gunCase.position.set(0, 0.41, 0);
  caseBox.root.add(gunCase);
  const caseGlint = marker(caseBox.root, 0.65);
  caseGlint.position.set(0, 0.6, 0);

  // Delivered crates are a single merged mesh without a lid pivot. Keep their
  // authored body, and partition the top triangles into a temporary rigid lid.
  // This does not alter the shared asset geometry or materials.
  function openableCrate(model) {
    const hinge = new T.Group();
    hinge.position.set(0, 0.66, -0.36);
    model.add(hinge);
    const meshes = [];
    model.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });
    for (const mesh of meshes) {
      const g = mesh.geometry,
        pos = g.attributes.position;
      const bottom = [],
        top = [];
      const groups = g.groups.length
        ? g.groups
        : [{ start: 0, count: g.index?.count ?? pos.count, materialIndex: 0 }];
      const groupsBottom = [],
        groupsTop = [];
      for (const group of groups) {
        const b0 = bottom.length,
          t0 = top.length;
        for (let j = group.start; j < group.start + group.count; j += 3) {
          const a = g.index ? g.index.getX(j) : j,
            b = g.index ? g.index.getX(j + 1) : j + 1,
            c = g.index ? g.index.getX(j + 2) : j + 2;
          (Math.min(pos.getY(a), pos.getY(b), pos.getY(c)) > 0.655
            ? top
            : bottom
          ).push(a, b, c);
        }
        groupsBottom.push({
          start: b0,
          count: bottom.length - b0,
          materialIndex: group.materialIndex,
        });
        groupsTop.push({
          start: t0,
          count: top.length - t0,
          materialIndex: group.materialIndex,
        });
      }
      function part(indices, groups) {
        const copy = g.clone();
        copy.setIndex(indices);
        copy.clearGroups();
        groups.forEach((v) => copy.addGroup(v.start, v.count, v.materialIndex));
        geometry.push(copy);
        return copy;
      }
      mesh.geometry = part(bottom, groupsBottom);
      const lid = new T.Mesh(part(top, groupsTop), mesh.material);
      lid.position.set(0, -0.66, 0.36);
      hinge.add(lid);
    }
    return hinge;
  }
  const crates = sim.entities.pickups
    .filter((e) => e.kind === "ammo" || e.kind === "charges")
    .map((e) => {
      const root = own(new T.Group(), zoneGroup(e.zone));
      root.position.set(e.x, e.y, e.z);
      const model = piece(
        "props",
        e.kind === "charges" ? "ammo_crate_b" : "ammo_crate",
      );
      let hinge;
      if (model) {
        model.traverse((o) => {
          if (o.isMesh) o.castShadow = false;
        });
        hinge = openableCrate(model);
        root.add(asInstances(model));
      } else {
        const body = box(1.05, 0.65, 0.72, mat.metal);
        body.position.y = 0.325;
        root.add(body);
        hinge = new T.Group();
        hinge.position.set(0, 0.66, -0.36);
        root.add(hinge);
        const lid = box(1.07, 0.09, 0.74, mat.ceramic);
        lid.position.z = 0.36;
        hinge.add(lid);
      }
      const tray = box(0.82, 0.035, 0.56, mat.metal);
      tray.position.y = 0.52;
      root.add(tray);
      for (let i = 0; i < 4; i++) {
        const content = box(
          e.kind === "charges" ? 0.14 : 0.11,
          0.13,
          0.32,
          e.kind === "charges" ? mat.amber : mat.ceramic,
        );
        content.position.set((i - 1.5) * 0.18, 0.59, 0);
        root.add(content);
        const cap = box(0.09, 0.012, 0.055, mat.amber);
        cap.position.set((i - 1.5) * 0.18, 0.66, 0.1);
        root.add(cap);
      }
      const glint = marker(root, 0.65);
      glint.position.y = 1;
      return { root, hinge, glint, e, open: 0 };
    });
  const pylons = sim.entities.stations.map((e, i) => {
    const root = own(new T.Group(), zoneGroup(e.zone)),
      solid = sim.layout.find((s) => s.kind === "pylon" && s.zone === e.zone);
    root.position.set(e.x, e.y, e.z);
    // Full-size pedestal matches the STATIONS collision envelope.
    root.scale.set(1, 1, 1);
    const model = piece("station", "pylon");
    if (model) root.add(model);
    else {
      const body = box(1, 2, 1, mat.ceramic);
      body.position.y = 1;
      root.add(body);
    }
    if (solid) ctx.claimSolid?.(solid);
    const screen = mat.display(),
      face = new T.Mesh(new T.PlaneGeometry(0.53, 0.315), screen.material);
    geometry.push(face.geometry);
    face.position.set(0, 1.43, 0.562);
    face.rotation.x = (28 * Math.PI) / 180;
    root.add(face);
    const team = [];
    model?.traverse((o) => {
      if (o.isMesh) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        o.material = materials.map((m) => {
          if (m.userData.channel && m.userData.channel !== "team")
            return mat.amber;
          if (m.userData.channel !== "team") return m;
          const copy = kit.material({
            color: 0xd95749,
            emissive: 0xd95749,
            emissiveIntensity: 0.7,
          });
          team.push(copy);
          return copy;
        });
        if (!Array.isArray(o.material) || o.material.length === 1)
          o.material = o.material[0];
      }
    });
    if (model) {
      model.removeFromParent();
      root.add(asInstances(model));
    }
    return { root, screen, team, i };
  });
  // STATIONS owns the beacon body; STORY only mounts its interactive display.
  const beacon = sim.entities.beacon,
    beaconRoot = own(new T.Group(), zoneGroup(beacon.zone));
  const beaconPart = sim.layout.find(
    (s) => s.stationPart?.node === "summit_beacon",
  )?.stationPart;
  beaconRoot.position.set(
    beaconPart?.x ?? beacon.x,
    beaconPart?.y ?? beacon.y,
    beaconPart?.z ?? beacon.z,
  );
  const screen = mat.display(),
    face = new T.Mesh(new T.PlaneGeometry(0.65, 0.4), screen.material);
  geometry.push(face.geometry);
  face.position.set(0, beaconPart ? 1.2 : 0.8, beaconPart ? 1.105 : 0.516);
  beaconRoot.add(face);
  pylons.push({ root: beaconRoot, screen, team: [], i: 3 });
  const cold = new T.Color(0xd95749),
    warm = new T.Color(0xf7931a);
  let lastTime = -1;
  const pickupCopies = new Map();
  return {
    update({ snapshot: s, dt, time, camera }) {
      const reduced = motion.matches;
      const reset = s.time < lastTime;
      lastTime = s.time;
      pickupCopies.clear();
      for (const pool of pools) pool.count = 0;
      for (const e of s.pickups) {
        if (e.id === scatter.id || e.id === rail.id || !sim.WEAPONS[e.kind])
          continue;
        const pool = pools.find((p) => p.kind === e.kind),
          slot = pool.slots[pool.count++];
        if (!slot) continue;
        if (slot.id !== e.id || reset) {
          slot.id = e.id;
          slot.age = 0;
          const yaw = (e.id * 2.39996) % 6.283;
          slot.group.rotation.y = yaw;
          const dx = Math.sin(yaw) * 0.3,
            dz = Math.cos(yaw) * 0.3;
          const onBuiltFloor = e.y > sim.groundY(e.x, e.z) + 0.2;
          const slope = onBuiltFloor
            ? 0
            : (sim.groundY(e.x + dx, e.z + dz) -
                sim.groundY(e.x - dx, e.z - dz)) /
              0.6;
          slot.mesh.rotation.x = Math.max(
            -0.8,
            Math.min(0.8, -Math.atan(slope)),
          );
          slot.ground = Math.max(e.y, sim.groundY(e.x, e.z));
        }
        slot.age += dt;
        slot.group.visible = Math.abs(-e.z + s.player.z) < 110;
        // Brief deterministic landing, then a grounded, motionless weapon.
        const bounce = reduced
          ? 0
          : Math.max(0, 1 - slot.age / 0.85) *
            Math.abs(Math.sin(slot.age * 8)) *
            0.2;
        slot.group.position.set(
          e.x,
          slot.ground + slot.support + 0.008 + bounce,
          e.z,
        );
        // Repeated zone resets can leave identical IDs at the same settled
        // transform. Keep transparent lenses/markers, skip only coincident opaque faces.
        const previous = pickupCopies.get(e.id);
        const duplicate =
          slot.age >= 0.85 &&
          previous?.age >= 0.85 &&
          previous.kind === slot.kind &&
          previous.group.position.equals(slot.group.position);
        for (const part of slot.opaque) part.visible = !duplicate;
        if (!duplicate) pickupCopies.set(e.id, slot);
        slot.glint.rotation.y = camera.rotation.y - slot.group.rotation.y;
        slot.glint.scale.x = reduced ? 1 : 1 + 0.18 * Math.sin(time * 1.5);
      }
      for (const pool of pools)
        for (let i = pool.count; i < pool.slots.length; i++) {
          pool.slots[i].group.visible = false;
          pool.slots[i].id = -1;
        }
      let markerCount = 0;
      for (const pool of pools)
        for (const slot of pool.slots) {
          if (!slot.group.visible) continue;
          slot.glint.updateWorldMatrix(true, false);
          pickupGlints.setMatrixAt(markerCount++, slot.glint.matrixWorld);
        }
      pickupGlints.count = markerCount;
      pickupGlints.instanceMatrix.needsUpdate = true;
      const rackPresent = s.pickups.some((e) => e.id === scatter.id),
        casePresent = s.pickups.some((e) => e.id === rail.id);
      const rackTarget = s.stations[0].state === "keeper" ? 1 : 0;
      const nearCase = Math.hypot(s.player.x - rail.x, s.player.z - rail.z) < 7;
      rack.open = reset
        ? rackTarget
        : Math.min(rackTarget, rack.open + dt * 0.8);
      if (reset) caseBox.open = 0;
      if (nearCase || !casePresent)
        caseBox.open = Math.min(1, caseBox.open + dt * 0.8);
      if (rack.hinge) rack.hinge.rotation.x = rack.angle * rack.open;
      if (caseBox.hinge)
        caseBox.hinge.rotation.x = caseBox.angle * caseBox.open;
      gunRack.visible = rackPresent && rack.open > 0.45;
      rackGlint.visible = gunRack.visible;
      gunCase.visible = casePresent;
      caseGlint.visible = casePresent && caseBox.open > 0.45;
      rackGlint.rotation.y = caseGlint.rotation.y = camera.rotation.y;
      for (const crate of crates) {
        const present = s.pickups.some((e) => e.id === crate.e.id);
        if (reset) crate.open = 0;
        if (!present) crate.open = Math.min(1, crate.open + dt * 1.1);
        crate.hinge.rotation.x = -1.82 * crate.open;
        crate.glint.visible = present;
        crate.glint.rotation.y = camera.rotation.y;
      }
      for (const p of pylons) {
        const state =
          p.i === 3
            ? s.ending
              ? "keeper"
              : s.stations.every((v) => v.state === "keeper")
                ? "clear"
                : "cartel"
            : s.stations[p.i].state;
        const relight =
          p.i === 3 ? Math.min(1, s.ending) : s.stations[p.i].relight;
        const height = 7350000 + Math.floor(s.time / 6);
        drawDisplay(
          p.screen,
          state,
          Math.floor(relight * 100),
          s.hashrate.toFixed(1),
          state === "keeper" ? height : 0,
          p.i,
        );
        for (const m of p.team) {
          m.color.copy(state === "keeper" ? warm : cold);
          m.emissive.copy(m.color);
          m.emissiveIntensity = 0.7;
        }
      }
      mat.amber.emissiveIntensity = reduced
        ? 0.5
        : 0.5 + 0.14 * Math.sin(time * 1.5);
      mat.cyan.emissiveIntensity = reduced
        ? 0.45
        : 0.45 + 0.12 * Math.sin(time * 1.5);
    },
    dispose() {
      batches.forEach((b) => b.dispose());
      privateMaterials.forEach((m) => m.dispose());
      geometry.forEach((g) => g.dispose());
      pylons.forEach((p) => p.team.forEach((m) => m.dispose()));
    },
    counts: {
      weaponSlots: pools.reduce((n, p) => n + p.slots.length, 0),
      crates: crates.length,
      pylons: pylons.length,
      worldAssets: Object.fromEntries(
        kinds.map((k) => [
          k,
          !!assets
            .get(`/assets/hash-wars/arms/${k}.glb`)
            ?.getObjectByName(`${k}_world`),
        ]),
      ),
    },
  };
}
