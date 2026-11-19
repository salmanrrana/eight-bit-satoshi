import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { surface } from "../first-light/surfaces.js";
import { createStationKit, pipeJacketMaterial } from "./stations-kit.js";
import { buildStationPaving } from "./stations-paving.js";
import { buildStationFans } from "./stations-fans.js";
import { buildStationShadows } from "./stations-shadows.js";
import { buildStationVistas } from "./stations-vistas.js";

/** Keeper infrastructure is assembled from collision-authored kit roots. The
 * sim owns foundations and bulk; thin seams, rails and conduit are dressing.
 * STORY owns control pylons, supply containers and every usable object.
 * WATER reads the same station state and the existing spire-top solid. */
export async function build(ctx) {
  const { T, sim, kit, scene, quality, zoneGroup, claimSolid } = ctx;
  const resources = [],
    ownedMaterials = [],
    roots = [],
    unregister = [];
  const materials = {
    concrete: surface(kit, "concrete", { weather: false }),
    paving: surface(kit, "concrete", { weather: false }).clone(),
    stone: surface(kit, "cutStone", { weather: false }),
    metal: surface(kit, "galvanized", { weather: false }),
    dark: kit.material({ color: 0x303d42, roughness: 0.66, metalness: 0.4 }),
    ivory: kit.material({ color: 0xc6c4b7, roughness: 0.64, metalness: 0.15 }),
    paint: pipeJacketMaterial(kit),
    warm: kit.material({
      color: 0xf7931a,
      emissive: 0xf7931a,
      emissiveIntensity: 1.7,
    }),
    farCold: kit.material({
      color: 0xc6bcc0,
      emissive: 0xa38f94,
      emissiveIntensity: 0.7,
    }),
    distant: kit.material({ color: 0x657c86, roughness: 1 }),
    tether: kit.material({
      color: 0x85969b,
      emissive: 0x657c8b,
      emissiveIntensity: 0.15,
    }),
  };
  materials.paving.onBeforeCompile = materials.concrete.onBeforeCompile;
  materials.paving.customProgramCacheKey =
    materials.concrete.customProgramCacheKey;
  materials.paving.vertexColors = true;
  ownedMaterials.push(materials.paving);
  const powerParts = Array.from(
    { length: 4 },
    (_, i) =>
      sim.layout.find(
        (b) =>
          b.stationPart?.node === (i === 3 ? "summit_beacon" : "spire") &&
          b.stationPart.station === i,
      )?.stationPart,
  );
  const cold = new T.Color(0xcfadb1),
    warm = new T.Color(0xf7931a);
  const states = Array.from({ length: 4 }, () => ({
    team: null,
    lamps: null,
    uniform: { value: -1 },
    colour: cold.clone(),
    power: 0,
    fallRelight: 0,
  }));
  const materialCache = new Map();
  function materialFor(original, station) {
    const channel = original.userData.channel;
    if (station < 0 || !["team", "lamp", "amber"].includes(channel))
      return original;
    const key = `${original.uuid}:${station}`;
    if (materialCache.has(key)) return materialCache.get(key);
    const m = original.clone();
    ownedMaterials.push(m);
    if (channel === "team") {
      const uniform = states[station].uniform;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.hwRelight = uniform;
        shader.vertexShader = "varying float hwHeight;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          `#include <project_vertex>
vec4 hwP=vec4(transformed,1.);
#ifdef USE_BATCHING
hwP=batchingMatrix*hwP;
#endif
#ifdef USE_INSTANCING
hwP=instanceMatrix*hwP;
#endif
hwHeight=(modelMatrix*hwP).y;`,
        );
        shader.fragmentShader =
          "varying float hwHeight;uniform float hwRelight;\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
float hwOn=1.-smoothstep(hwRelight-.4,hwRelight+.4,hwHeight);
vec3 hwTeam=mix(vec3(.32,.19,.20),vec3(1.,.30,.015),hwOn);
diffuseColor.rgb=hwTeam;totalEmissiveRadiance=hwTeam*1.9;`,
        );
      };
      m.customProgramCacheKey = () => "hash-wars-station-relight-v1";
      states[station].team = m;
    } else {
      m.color.set(0xd5b18b);
      m.emissive.set(0xffc183);
      m.emissiveIntensity = 0.02;
      if (!states[station].lamps) states[station].lamps = [];
      states[station].lamps.push(m);
    }
    materialCache.set(key, m);
    return m;
  }
  const library = createStationKit(ctx, resources, materialFor);
  const lods = [],
    groups = sim.ZONES.map((_, zone) => {
      const root = new T.Group();
      root.name = `STATIONS zone ${zone}`;
      zoneGroup(zone).add(root);
      roots.push(root);
      const near = new T.Group(),
        far = new T.Group();
      root.add(near, far);
      const z = -(sim.ZONES[zone].s0 + sim.ZONES[zone].s1) / 2;
      lods.push({ near, far, z });
      return { root, near, far };
    });
  const staticBatches = new Map();
  const unit = kit.roundedBox(1, 1, 1, 0.018);
  function addGeometry(geometry, material, zone, transform, casts = true) {
    const key = `${material.uuid}:${zone}:${casts}`;
    if (!staticBatches.has(key))
      staticBatches.set(key, { material, zone, casts, geometries: [] });
    const g = geometry.clone();
    g.applyMatrix4(transform);
    staticBatches.get(key).geometries.push(g);
  }
  const dummy = new T.Object3D();
  function box(
    zone,
    x,
    y,
    z,
    w,
    h,
    d,
    material = materials.concrete,
    casts = true,
    yaw = 0,
  ) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    addGeometry(unit, material, zone, dummy.matrix, casts);
  }
  function cylinder(
    zone,
    a,
    b,
    radius,
    material = materials.metal,
    endRadius = radius,
  ) {
    const from = new T.Vector3(...a),
      to = new T.Vector3(...b),
      delta = to.clone().sub(from);
    const g = new T.CylinderGeometry(
      endRadius,
      radius,
      delta.length(),
      quality === "low" ? 8 : 12,
    );
    dummy.position.copy(from).add(to).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      delta.normalize(),
    );
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    addGeometry(g, material, zone, dummy.matrix, radius > 0.35);
    g.dispose();
  }
  function label(
    text,
    zone,
    x,
    y,
    z,
    w,
    h,
    font = 36,
    colour = "#d9d7c6",
    background = "#2b3436",
  ) {
    const m = kit.decal(
      kit.text(text, { width: 1024, height: 256, font, colour, background }),
      w,
      h,
    );
    m.position.set(x, y, z);
    groups[zone].root.add(m);
    return m;
  }
  // Paint bands follow the trunk's pitched axis. The gate carries the same
  // split-diamond seal on each wing, large enough to read across the arena.
  const jacket = new T.CylinderGeometry(0.929, 0.929, 0.72, 40, 1, true);
  jacket.rotateX(Math.PI / 2);
  jacket.translate(0, 3, -2.8);
  resources.push(jacket);
  const sealCanvas = document.createElement("canvas");
  sealCanvas.width = 128;
  sealCanvas.height = 512;
  const ink = sealCanvas.getContext("2d");
  ink.fillStyle = "#a94e31";
  ink.fillRect(0, 0, 128, 512);
  ink.fillStyle = "#dcc38e";
  for (const x of [6, 119]) ink.fillRect(x, 0, 3, 512);
  ink.lineWidth = 6;
  ink.strokeStyle = "#dcc38e";
  for (const top of [74, 112]) {
    ink.beginPath();
    ink.moveTo(64, top);
    ink.lineTo(99, top + 41);
    ink.lineTo(64, top + 82);
    ink.lineTo(29, top + 41);
    ink.closePath();
    ink.stroke();
  }
  ink.fillRect(62, 220, 4, 259);
  const sealTexture = new T.CanvasTexture(sealCanvas);
  sealTexture.colorSpace = T.SRGBColorSpace;
  resources.push(sealTexture);
  const seal = kit.material({ map: sealTexture, roughness: 0.9 });
  const panel = new T.PlaneGeometry(4.4, 6.7);
  resources.push(panel);
  function kitPart(part, zone) {
    const placed = library.place(
      part,
      zone,
      groups[zone].near,
      quality === "low",
    );
    if (quality !== "low") library.place(part, zone, groups[zone].far, true);
    if (placed && part.node.startsWith("pipeline_segment")) {
      dummy.position.set(part.x, part.y, part.z);
      dummy.rotation.set(0, part.yaw, 0);
      dummy.rotateX(part.pitch);
      dummy.scale.set(1, 1, part.length);
      dummy.updateMatrix();
      addGeometry(jacket, materials.paint, zone, dummy.matrix, false);
    }
    if (placed && part.node === "citadel_gate") {
      for (const side of [-1, 1]) {
        const matrix = new T.Matrix4().makeTranslation(
          part.x + side * 16,
          part.y + 19.5,
          part.z + 3.84,
        );
        addGeometry(panel, seal, zone, matrix, false);
        // Long standards hang between pilasters on the outer curtain, clear
        // of the wing galleries and their walkable decks.
        matrix.makeScale(0.73, 2.48, 1);
        matrix.setPosition(part.x + side * 26.4, part.y + 12.6, part.z + 1.22);
        addGeometry(panel, seal, zone, matrix, false);
      }
    }
    return placed;
  }
  // New artist files are optional until their manifest entry arrives. Named
  // roots are selected, never whole GLBs with overlaid alternatives/LODs.
  let manifest;
  try {
    const r = await fetch("/assets/hash-wars/structures/manifest.json");
    if (r.ok) manifest = await r.json();
  } catch {
    /* Stand-ins remain complete. */
  }
  const delivered = new Map();
  for (const file of manifest?.files ?? [])
    for (const piece of file.pieces ?? [])
      delivered.set(piece.name, { file: file.file, piece });
  const optionalNames = {
    "citadel-tower": ["citadel_tower", "gate_tower"],
    "citadel-lintel": ["citadel_lintel", "gate_lintel"],
    "causeway-tower": ["causeway_tower", "dam_tower"],
    "dam-machinery": ["dam_machinery"],
    "beacon-wing": ["beacon_wing"],
    monument: ["monument"],
  };
  const dressedAssemblies = new Set();
  for (const b of sim.layout) {
    if (b.kind === "station-apron") {
      claimSolid?.(b);
      continue;
    }
    if (b.stationPipe) {
      const { a, b: to, r, endRadius } = b.stationPipe;
      if (r < 0.03) {
        // Pipe crosses the fighting lane in a flush, covered service trench.
        const dx = to[0] - a[0],
          dz = to[2] - a[2],
          length = Math.hypot(dx, dz),
          nx = (-dz / length) * 0.22,
          nz = (dx / length) * 0.22;
        const g = new T.BufferGeometry();
        g.setAttribute(
          "position",
          new T.Float32BufferAttribute(
            [
              a[0] + nx,
              a[1] + r,
              a[2] + nz,
              to[0] + nx,
              to[1] + r,
              to[2] + nz,
              to[0] - nx,
              to[1] + r,
              to[2] - nz,
              a[0] - nx,
              a[1] + r,
              a[2] - nz,
            ],
            3,
          ),
        );
        g.setAttribute(
          "uv",
          new T.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2),
        );
        g.setIndex([0, 1, 2, 0, 2, 3]);
        g.computeVertexNormals();
        addGeometry(g, materials.metal, b.zone, new T.Matrix4(), false);
        g.dispose();
      } else cylinder(b.zone, a, to, r, materials.metal, endRadius);
      claimSolid?.(b);
      continue;
    }
    if (b.stationPart && kitPart(b.stationPart, b.zone)) {
      dressedAssemblies.add(b.stationPart);
      claimSolid?.(b);
      continue;
    }
    if (b.stationAssembly && dressedAssemblies.has(b.stationAssembly)) {
      claimSolid?.(b);
      continue;
    }
    if (
      b.kind === "pylon" ||
      b.kind === "siege-hull" ||
      b.kind === "cover" ||
      b.owner === "land" ||
      b.owner === "story"
    )
      continue;
    if (b.kind === "spire") {
      claimSolid?.(b);
      continue;
    } // The authored shaft above dresses the full site.
    if (b.shape === "cyl") {
      cylinder(b.zone, [b.x, b.y0, b.z], [b.x, b.y1, b.z], b.r);
      claimSolid?.(b);
      continue;
    }
    if (b.shape !== "box") continue;
    const [x, y, z] = b.min.map((v, i) => (v + b.max[i]) / 2),
      [w, h, d] = b.max.map((v, i) => v - b.min[i]);
    if (b.kind === "pod") {
      const source = delivered.get("drop_pod")?.piece;
      const scale = source
        ? [
            w / (source.max[0] - source.min[0]),
            h / (source.max[1] - source.min[1]),
            d / (source.max[2] - source.min[2]),
          ]
        : [1, 1, 1];
      const part = {
        node: "drop_pod",
        file: "props.glb",
        x,
        y: b.min[1] - (source?.min[1] ?? 0) * scale[1],
        z: source ? z - ((source.min[2] + source.max[2]) / 2) * scale[2] : z,
        scale,
      };
      if (kitPart(part, b.zone)) {
        claimSolid?.(b);
        continue;
      }
    }
    if (b.kind === "beacon" && delivered.has("summit_beacon")) {
      claimSolid?.(b);
      continue;
    }
    if (b.kind === "bridge" && delivered.has("causeway_segment")) {
      for (let i = 0; i < 5; i++)
        kitPart(
          {
            node: [
              "causeway_segment",
              "causeway_segment_b",
              "causeway_segment_c",
            ][i % 3],
            file: "route.glb",
            x: 0,
            y: 21,
            z: -157.5 - i * 15,
          },
          2,
        );
      claimSolid?.(b);
      continue;
    }
    if (b.kind === "parapet" && delivered.has("causeway_parapet")) {
      kitPart(
        { node: "causeway_parapet", file: "route.glb", x, y: b.min[1], z },
        b.zone,
      );
      claimSolid?.(b);
      continue;
    }
    const candidate = optionalNames[b.kind]
      ?.map((n) => delivered.get(n))
      .find(Boolean);
    if (candidate) {
      const { piece, file } = candidate;
      const scale = [
        w / (piece.max[0] - piece.min[0]),
        h / (piece.max[1] - piece.min[1]),
        d / (piece.max[2] - piece.min[2]),
      ];
      if (
        kitPart(
          {
            node: piece.name,
            file,
            x: x - ((piece.min[0] + piece.max[0]) / 2) * scale[0],
            y: b.min[1] - piece.min[1] * scale[1],
            z: z - ((piece.min[2] + piece.max[2]) / 2) * scale[2],
            scale,
          },
          b.zone,
        )
      ) {
        claimSolid?.(b);
        continue;
      }
    }
    claimSolid?.(b);
    const mat =
      b.kind === "station-footing" || b.kind === "monument"
        ? materials.stone
        : materials.concrete;
    box(b.zone, x, y, z, w, h, d, mat, h > 0.6);
    // Deep joints and restrained cladding sit inside each collision envelope.
    if (
      [
        "citadel-tower",
        "causeway-tower",
        "citadel-lintel",
        "dam-machinery",
        "beacon-wing",
      ].includes(b.kind)
    ) {
      box(
        b.zone,
        x,
        y,
        z + d / 2 + 0.015,
        w * 0.8,
        h * 0.93,
        0.04,
        materials.dark,
        false,
      );
      const courses = Math.max(1, Math.floor(h / 3));
      for (let i = 0; i < courses; i++) {
        const cy = b.min[1] + ((i + 0.5) * h) / courses;
        box(
          b.zone,
          x,
          cy,
          z + d / 2 + 0.06,
          w * 0.69,
          h / courses - 0.12,
          0.14,
          materials.ivory,
          h > 10,
        );
        for (const dx of [-w * 0.39, w * 0.39])
          box(
            b.zone,
            x + dx,
            cy,
            z + d / 2 + 0.04,
            0.1,
            h / courses - 0.18,
            0.09,
            materials.metal,
            false,
          );
      }
      box(
        b.zone,
        x - w * 0.36,
        y,
        z + d / 2 + 0.15,
        0.09,
        h * 0.85,
        0.06,
        materials.warm,
        false,
      );
    }
    if (b.kind === "parapet") {
      box(
        b.zone,
        x,
        b.max[1] - 0.08,
        z,
        w + 0.1,
        0.14,
        d - 0.12,
        materials.ivory,
        false,
      );
      for (let dz = -d / 2 + 1; dz < d / 2; dz += 2.5)
        box(
          b.zone,
          x,
          b.min[1] + 0.4,
          z + dz,
          w + 0.04,
          0.04,
          0.24,
          materials.dark,
          false,
        );
    }
    if (b.kind === "bridge") {
      // Expansion joints, recessed drains, central service strip; no new bulk.
      for (let dz = b.min[2] + 5; dz < b.max[2]; dz += 5)
        box(2, x, b.max[1] + 0.007, dz, w, 0.012, 0.025, materials.dark, false);
      for (const dx of [-3.8, 3.8])
        box(
          2,
          dx,
          b.max[1] + 0.012,
          z,
          0.1,
          0.015,
          d - 0.2,
          materials.ivory,
          false,
        );
      for (let dz = b.min[2] + 2; dz < b.max[2]; dz += 4)
        for (const dx of [-4.1, 4.1])
          box(
            2,
            dx,
            b.max[1] + 0.015,
            dz,
            0.4,
            0.02,
            0.8,
            materials.dark,
            false,
          );
    }
    if (b.kind === "monument") {
      box(5, x, b.min[1] + 0.17, z, w + 0.02, 0.34, d + 0.02, materials.dark);
      label(
        "Bitcoin: A Peer-to-Peer\nElectronic Cash System",
        5,
        x,
        y + 0.25,
        b.max[2] + 0.018,
        w - 0.35,
        1.2,
        40,
        "#292e30",
        "#bab9a9",
      );
      label(
        "31 OCTOBER 2008    /    THE CHAIN HOLDS",
        5,
        x,
        y - 0.8,
        b.max[2] + 0.02,
        w - 0.6,
        0.3,
        24,
        "#333a3c",
        "#bab9a9",
      );
    }
    if (b.kind === "beacon") {
      box(5, x, b.max[1] + 0.01, z, 0.74, 0.03, 0.74, materials.warm, false);
      label("KEEPER / 2140", 5, x, y + 0.1, b.max[2] + 0.022, 0.86, 0.22, 32);
    }
  }
  for (const e of sim.entities.stations) {
    const parts = sim.layout
      .filter((b) => b.stationPart?.station === e.index)
      .map((b) => b.stationPart);
    const lamps = parts.filter((p) => p.node === "lamp_mast");
    for (const p of lamps)
      unregister.push(
        kit.addLightFixture({
          position: [p.x, p.y + 5.65, p.z],
          colour: states[e.index].colour,
          intensity: 0.8,
          kind: "lamp",
        }),
      );
  }
  buildStationPaving(ctx, groups, materials, resources);
  for (const batch of staticBatches.values()) {
    const g = mergeGeometries(batch.geometries, false);
    batch.geometries.forEach((g) => g.dispose());
    resources.push(g);
    const mesh = new T.Mesh(g, batch.material);
    mesh.castShadow = batch.casts;
    mesh.receiveShadow = true;
    groups[batch.zone].root.add(mesh);
  }
  library.finish();
  buildStationShadows(
    ctx,
    groups,
    dressedAssemblies,
    resources,
    ownedMaterials,
  );
  const fans = buildStationFans(ctx, library, groups, states);
  const vistas = buildStationVistas(ctx, materials, resources);
  const beaconPart = sim.layout.find(
    (b) => b.stationPart?.node === "summit_beacon",
  )?.stationPart;
  const beamBase = beaconPart ? beaconPart.y + 7.48 : sim.entities.beacon.y + 1;
  const beamGeometry = new T.CylinderGeometry(0.09, 0.35, 180, 8, 1, true);
  resources.push(beamGeometry);
  const beam = new T.Mesh(beamGeometry, materials.warm);
  beam.name = "STATIONS beacon core";
  beam.position.set(
    sim.entities.beacon.x,
    beamBase + 90,
    sim.entities.beacon.z,
  );
  scene.add(beam);
  roots.push(beam);
  function count(root) {
    const result = { triangles: 0, drawCalls: 0 };
    root.traverseVisible((o) => {
      if (!o.isMesh) return;
      result.triangles +=
        ((o.geometry.index?.count ?? o.geometry.attributes.position.count) /
          3) *
        (o.isInstancedMesh ? o.count : 1);
      result.drawCalls += Array.isArray(o.material)
        ? o.geometry.groups.length || 1
        : 1;
    });
    return result;
  }
  for (const { near, far } of groups) {
    near.visible = true;
    far.visible = false;
  }
  const inventory = {
    quality,
    zones: groups.map((g) => count(g.root)),
    vistas: count(vistas.root),
  };
  inventory.maxAdjacent = sim.ZONES.map((_, i) =>
    inventory.zones.reduce(
      (sum, z, j) =>
        Math.abs(i - j) <= 1
          ? {
              triangles: sum.triangles + z.triangles,
              drawCalls: sum.drawCalls + z.drawCalls,
            }
          : sum,
      { ...inventory.vistas },
    ),
  );
  console.info("STATIONS inventory " + JSON.stringify(inventory));
  let lastTime = -1;
  return {
    update(frame) {
      const { snapshot, camera, dt } = frame;
      const reset = snapshot.time < lastTime;
      lastTime = snapshot.time;
      lods.forEach(({ near, far, z }) => {
        const close =
          quality !== "low" && Math.abs(camera.position.z - z) < 100;
        near.visible = quality === "low" || close;
        far.visible = quality !== "low" && !close;
      });
      for (const [i, state] of states.entries()) {
        const station = snapshot.stations[i];
        // The hold previews power climbing the shaft; confirmation completes
        // the climb without jumping back to its foot. A cancelled hold drains.
        const target = sim.entities.stations[i];
        const holding =
          i < 3 &&
          snapshot.prompt?.type === "station" &&
          station.state !== "keeper" &&
          Math.hypot(
            snapshot.player.x - target.x,
            snapshot.player.z - target.z,
          ) < 3;
        if (i === 2) {
          if (reset || station.state !== "keeper") state.fallRelight = 0;
          if (snapshot.boss.dying >= 0.85)
            state.fallRelight = Math.min(1, state.fallRelight + dt * 0.5);
          if (station.relight === 1 && snapshot.boss.dying === 1 && reset)
            state.fallRelight = 1;
        }
        const relight =
          i === 2
            ? Math.min(station.relight, state.fallRelight)
            : station?.relight;
        const on =
          i === 3
            ? Math.min(1, snapshot.ending / 1.4)
            : station.state === "keeper"
              ? i === 2
                ? relight
                : 0.7 + relight * 0.3
              : holding
                ? Math.min(1, snapshot.useProgress || 0) * 0.7
                : 0;
        const part = powerParts[i];
        const base = part?.y ?? (i === 3 ? sim.entities.beacon.y : target.y);
        state.uniform.value =
          on > 0
            ? base + on * (i === 3 ? 8 : 32.74 * (part?.scale?.[1] ?? 1))
            : -100;
        state.power = i === 3 ? on : station.state === "keeper" ? relight : 0;
        state.colour.copy(warm).multiplyScalar(state.power);
        for (const [j, lamp] of (state.lamps ?? []).entries())
          lamp.emissiveIntensity =
            0.02 + Math.max(0, Math.min(1, state.power * 2 - j * 0.16)) * 2.8;
      }
      fans.update(frame);
      beam.visible = snapshot.ending > 0;
      beam.scale.y = Math.max(0.001, Math.min(1, snapshot.ending * 0.8));
      beam.position.y = beamBase + 90 * beam.scale.y;
      vistas.update(frame);
    },
    dispose() {
      unregister.forEach((f) => f());
      fans.dispose();
      library.dispose();
      vistas.dispose();
      roots.forEach((r) => r.removeFromParent());
      resources.forEach((r) => r.dispose());
      ownedMaterials.forEach((m) => m.dispose());
    },
  };
}
